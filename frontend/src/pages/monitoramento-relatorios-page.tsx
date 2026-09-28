import { useCallback, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { FilterWorkspace } from "@/components/common/filter-workspace";
import { SingleSelectFilter } from "@/components/common/single-select-filter";
import { ErrorAlert } from "@/components/common/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { RelatorioInstrumentosTabela } from "@/components/features/relatorio-instrumentos-tabela";
import { RelatorioPropostasTabela } from "@/components/features/relatorio-propostas-tabela";
import { RelatorioBotoesGerar } from "@/components/features/relatorio-botoes-gerar";
import { useConveniosLista } from "@/hooks/useConveniosLista";
import { usePropostasCandidatas } from "@/hooks/use-propostas-candidatas";
import { useMonitoramentoInstrumentos } from "@/hooks/useInstrumentosMonitorados";
import { useDadosOficiaisOpcoes } from "@/hooks/use-dados-oficiais-opcoes";
import { useRelatorioInstrumentosFiltros } from "@/hooks/use-relatorio-instrumentos-filtros";
import { useGerarRelatorio } from "@/hooks/use-gerar-relatorio";
import { filtrarDadosOficiais } from "@/lib/filtrar-dados-oficiais";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { estagioDeFato } from "@/lib/proposta-status";
import { capitalizarNome, normalizarTexto } from "@/utils/texto";
import type { ConvenioUnificado } from "@/types/monitoramento";
import type { FiltroDadosOficiais } from "@/types/dados-oficiais";
import type { NivelRelatorio } from "@/services/relatorios";

const situacaoExibida = (item: ConvenioUnificado) => item.situacao;
const SEM_MONITORADOS = new Set<string>();
const TEM_ACENTO = /[À-ÖØ-öø-ÿ]/;

/** Deduplica por grafia (mesmo município/estabelecimento grafado diferente
 * por origem -- achado 2026-09-26, "não da pra ter dois São Paulo um
 * minúsculo, um maiúsculo e um sem acento"): `value` é a chave normalizada
 * (comparável direto contra `normalizarTexto(campo)`), `label` prefere a
 * grafia acentuada quando alguma variante tem, senão capitaliza a que
 * tiver. */
function opcoesAgrupadas(
  itens: ConvenioUnificado[],
  valor: (item: ConvenioUnificado) => string | null | undefined,
): { value: string; label: string }[] {
  const grupos = new Map<string, string[]>();
  for (const item of itens) {
    const bruto = valor(item);
    if (!bruto) continue;
    const chave = normalizarTexto(bruto);
    const lista = grupos.get(chave);
    if (lista) lista.push(bruto);
    else grupos.set(chave, [bruto]);
  }
  return [...grupos.entries()]
    .map(([chave, brutos]) => ({
      value: chave,
      label: capitalizarNome(
        brutos.find((b) => TEM_ACENTO.test(b)) ?? brutos[0],
      ),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

function opcoesUnicas(
  itens: ConvenioUnificado[],
  valor: (item: ConvenioUnificado) => string | null | undefined,
) {
  return [...new Set(itens.map(valor).filter((v): v is string => Boolean(v)))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((v) => ({ value: v, label: v }));
}

/**
 * Relatório de Instrumentos e Repasse -- convênios firmados, propostas
 * candidatas (linhas de financiamento) e monitoramento interno numa
 * chamada só (`GET /relatorios`), em Excel ou Word (Plan Mode
 * docs/arquitetura/planmode-relatorios-2026-09-25.md, Blocos 6 e 7).
 *
 * Mesmos filtros de "Instrumentos e repasses" (Dados Oficiais,
 * `monitoramento-equipamentos-page.tsx`) -- pedido do usuário: "coloque os
 * mesmos filtros que temos no instrumentos/repasses" + "separar em
 * instrumentos/programas e linhas de financiamento (parceria e
 * propostas)". As 3 seções (Instrumentos/Programas, Parceria, Propostas)
 * ficam empilhadas uma abaixo da outra, sem abas. A tabela de prévia é
 * 100% client-side (mesmo dado já carregado por `useConveniosLista`/
 * `usePropostasCandidatas`/`useMonitoramentoInstrumentos`, zero chamada
 * nova) -- mostra exatamente o recorte que os botões abaixo baixam.
 * `situacao`/`programa`/`equipamento` só filtram a seção de Convênios: o
 * vocabulário de `situacao`/`programa` diverge entre Convenio (SICONV) e
 * PropostaCandidata (TransfereGov novo), ver `app/services/relatorios.py`
 * no backend -- aplicar o mesmo valor nas Propostas quase sempre
 * filtraria pra um conjunto vazio.
 *
 * `Município`/`CNES`/`Estabelecimento` são lista suspensa, mesmo modelo
 * dos demais filtros -- `município`/`estabelecimento` deduplicados por
 * grafia (`opcoesAgrupadas`, ver comentário acima); `CNES` é código exato,
 * sem ambiguidade de grafia (`opcoesUnicas`). Só `município`/`CNES` viram
 * parâmetro pro backend na geração -- o backend trata os 3 como hierarquia
 * de escopo mutuamente exclusiva (Brasil -> UF -> Município -> CNES),
 * então CNES tem prioridade (mais específico), depois Município (exige UF
 * junto), depois UF; `Estabelecimento`/`Equipamento` não têm campo próprio
 * ali, ficam só na prévia.
 */
export function MonitoramentoRelatoriosPage() {
  const [nivel, setNivel] = useState<NivelRelatorio>("simplificado");

  const {
    uf,
    setUf,
    situacao,
    setSituacao,
    ano,
    setAno,
    programa,
    setPrograma,
    tipoContratacao,
    setTipoContratacao,
    equipamento,
    setEquipamento,
    municipio,
    setMunicipio,
    cnes,
    setCnes,
    nomeEstabelecimento,
    setNomeEstabelecimento,
    hasFiltros,
    limparFiltros,
  } = useRelatorioInstrumentosFiltros();

  const conveniosQuery = useConveniosLista();
  const convenios = useMemo(
    () => conveniosQuery.data?.itens ?? [],
    [conveniosQuery.data],
  );

  const filtrarConvenios = useCallback(
    (ignorar?: FiltroDadosOficiais) =>
      filtrarDadosOficiais(
        convenios,
        {
          uf,
          municipio: null,
          cnes: null,
          equipamento,
          situacao,
          anoInicio: ano,
          anoFim: ano,
          programa,
          tipoContratacao,
          soMonitorados: false,
        },
        SEM_MONITORADOS,
        situacaoExibida,
        ignorar,
      ),
    [convenios, uf, situacao, ano, programa, tipoContratacao, equipamento],
  );

  const {
    ufs,
    equipamentoOptions,
    anoOptions,
    situacaoOptions,
    tipoContratacaoOptions,
    programaOptions,
  } = useDadosOficiaisOpcoes({
    classeEquipamento: "prioritario",
    filtrar: filtrarConvenios,
    situacaoExibida,
  });

  // Município/CNES/Estabelecimento refinam por cima do que os demais
  // filtros já resolveram -- opções e prévia baseadas no mesmo recorte
  // (`conveniosBase`), sem entrar na cascata de `useDadosOficiaisOpcoes`
  // (não fazem parte do vocabulário de Dados Oficiais, ficam só nesta
  // página).
  const conveniosBase = filtrarConvenios();
  const municipioOptions = useMemo(
    () => opcoesAgrupadas(conveniosBase, (item) => item.municipio),
    [conveniosBase],
  );
  const cnesOptions = useMemo(
    () => opcoesUnicas(conveniosBase, (item) => item.cnes),
    [conveniosBase],
  );
  const estabelecimentoOptions = useMemo(
    () =>
      opcoesAgrupadas(conveniosBase, (item) => item.cnesNomeEstabelecimento),
    [conveniosBase],
  );

  const conveniosFiltrados = useMemo(
    () =>
      conveniosBase.filter(
        (item) =>
          (!municipio || normalizarTexto(item.municipio) === municipio) &&
          (!cnes || item.cnes === cnes) &&
          (!nomeEstabelecimento ||
            normalizarTexto(item.cnesNomeEstabelecimento ?? "") ===
              nomeEstabelecimento),
      ),
    [conveniosBase, municipio, cnes, nomeEstabelecimento],
  );

  const instrumentosQuery = useMonitoramentoInstrumentos();
  const faseMonitoramento = useMemo(
    () =>
      new Map(
        (instrumentosQuery.data ?? []).map((i) => [
          i.nr_convenio,
          i.fase_atual ?? "Não iniciado",
        ]),
      ),
    [instrumentosQuery.data],
  );

  const {
    propostas,
    carregando: carregandoPropostas,
    erro: erroPropostas,
  } = usePropostasCandidatas();

  const propostasFiltradas = useMemo(
    () =>
      propostas.filter((p) => {
        if (uf && p.uf !== uf) return false;
        if (ano && p.data_proposta?.slice(0, 4) !== ano) return false;
        if (municipio && normalizarTexto(p.municipio ?? "") !== municipio)
          return false;
        if (cnes && p.cnes !== cnes) return false;
        if (
          nomeEstabelecimento &&
          normalizarTexto(p.cnes_nome_estabelecimento ?? "") !==
            nomeEstabelecimento
        )
          return false;
        return true;
      }),
    [propostas, uf, ano, municipio, cnes, nomeEstabelecimento],
  );
  const propostasConfirmadas = useMemo(
    () => propostasFiltradas.filter((p) => estagioDeFato(p) === "confirmada"),
    [propostasFiltradas],
  );
  const propostasEmTramitacao = useMemo(
    () => propostasFiltradas.filter((p) => estagioDeFato(p) === "tramitacao"),
    [propostasFiltradas],
  );

  const { gerando, erro, gerar } = useGerarRelatorio("instrumentos_repasse");

  // O backend trata uf/município/CNES como uma hierarquia de escopo
  // mutuamente exclusiva (Brasil -> UF -> Município -> CNES), diferente
  // dos filtros combináveis desta página -- CNES já identifica um único
  // estabelecimento (mais específico), depois Município (exige UF junto,
  // validado no backend), depois UF, senão Brasil. `nomeEstabelecimento`/
  // `equipamento` não têm campo próprio no backend, ficam de fora da
  // geração.
  const escopoGeracao = cnes
    ? "cnes"
    : municipio && uf
      ? "municipio"
      : uf
        ? "uf"
        : "brasil";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Monitoramento interno"
        title="Relatórios"
        description="Convênios, propostas candidatas e monitoramento interno em Excel ou Word."
      />

      <FilterWorkspace hasAnyFilter={hasFiltros} onClear={limparFiltros}>
        <SingleSelectFilter
          placeholder="Tipo de contratação"
          options={tipoContratacaoOptions}
          value={tipoContratacao}
          onChange={setTipoContratacao}
          clearLabel="Todos os tipos"
          minWidth={120}
        />
        <SingleSelectFilter
          placeholder="Todas as UFs"
          options={ufs}
          value={uf}
          onChange={setUf}
          clearLabel="Todas as UFs"
          minWidth={100}
        />
        <SingleSelectFilter
          placeholder="Município"
          options={municipioOptions}
          value={municipio}
          onChange={setMunicipio}
          clearLabel="Todos os municípios"
          minWidth={140}
        />
        <SingleSelectFilter
          placeholder="CNES"
          options={cnesOptions}
          value={cnes}
          onChange={setCnes}
          clearLabel="Todos os CNES"
          minWidth={110}
        />
        <SingleSelectFilter
          placeholder="Estabelecimento"
          options={estabelecimentoOptions}
          value={nomeEstabelecimento}
          onChange={setNomeEstabelecimento}
          clearLabel="Todos os estabelecimentos"
          minWidth={170}
        />
        <SingleSelectFilter
          placeholder="Equipamento"
          options={equipamentoOptions}
          value={equipamento}
          onChange={setEquipamento}
          clearLabel="Todos os equipamentos"
          minWidth={160}
        />
        <SingleSelectFilter
          placeholder="Todas as situações"
          options={situacaoOptions}
          value={situacao}
          onChange={setSituacao}
          clearLabel="Todas as situações"
          minWidth={150}
        />
        <SingleSelectFilter
          placeholder="Ano da proposta"
          options={anoOptions}
          value={ano}
          onChange={setAno}
          clearLabel="Todos os anos"
          minWidth={110}
        />
        <SingleSelectFilter
          placeholder="Todos os programas"
          options={programaOptions}
          value={programa}
          onChange={setPrograma}
          clearLabel="Todos os programas"
          minWidth={160}
        />
      </FilterWorkspace>

      {conveniosQuery.isLoading ? (
        <Skeleton
          className="h-64 w-full"
          role="status"
          aria-label="Carregando"
        />
      ) : conveniosQuery.isError ? (
        <ErrorAlert
          mensagem={mensagemSeguraDoErro(conveniosQuery.error)}
          onRetry={() => conveniosQuery.refetch()}
        />
      ) : (
        <RelatorioInstrumentosTabela
          itens={conveniosFiltrados}
          faseMonitoramento={faseMonitoramento}
        />
      )}

      {carregandoPropostas ? (
        <Skeleton
          className="h-64 w-full"
          role="status"
          aria-label="Carregando"
        />
      ) : erroPropostas ? (
        <ErrorAlert mensagem={mensagemSeguraDoErro(erroPropostas)} />
      ) : (
        <>
          <RelatorioPropostasTabela
            titulo="Linhas de financiamento — Confirmada (parceria)"
            itens={propostasConfirmadas}
          />
          <RelatorioPropostasTabela
            titulo="Linhas de financiamento — Em tramitação (proposta)"
            itens={propostasEmTramitacao}
          />
        </>
      )}

      <RelatorioBotoesGerar
        nivel={nivel}
        onNivelChange={setNivel}
        podeGerar
        gerando={gerando}
        erro={erro}
        onGerar={(formato) =>
          void gerar(formato, nivel, {
            escopo: escopoGeracao,
            uf: uf ?? undefined,
            municipio:
              escopoGeracao === "municipio"
                ? (municipio ?? undefined)
                : undefined,
            cnes: escopoGeracao === "cnes" ? (cnes ?? undefined) : undefined,
            ano: ano ? Number(ano) : undefined,
            situacao: situacao ?? undefined,
            programa: programa ?? undefined,
            tipoContratacao: tipoContratacao ?? undefined,
          })
        }
      />
    </div>
  );
}
