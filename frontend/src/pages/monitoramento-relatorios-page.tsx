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
import { useDadosOficiaisOpcoes } from "@/hooks/use-dados-oficiais-opcoes";
import { useRelatorioInstrumentosFiltros } from "@/hooks/use-relatorio-instrumentos-filtros";
import { useGerarRelatorio } from "@/hooks/use-gerar-relatorio";
import { filtrarDadosOficiais } from "@/lib/filtrar-dados-oficiais";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { estagioDeFato } from "@/lib/proposta-status";
import type { ConvenioUnificado } from "@/types/monitoramento";
import type { FiltroDadosOficiais } from "@/types/dados-oficiais";
import type { NivelRelatorio } from "@/services/relatorios";

const situacaoExibida = (item: ConvenioUnificado) => item.situacao;
const SEM_MONITORADOS = new Set<string>();

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
 * ficam empilhadas uma abaixo da outra, sem abas (pedido do usuário
 * 2026-09-26: "não quero separado em abas, quero um abaixo do outro").
 * A tabela de prévia é 100% client-side (mesmo dado já carregado por
 * `useConveniosLista`/`usePropostasCandidatas`, zero chamada nova) --
 * mostra exatamente o recorte que os botões abaixo baixam. `situacao`/
 * `programa` só filtram a seção de Convênios: o vocabulário desses campos
 * diverge entre Convenio (SICONV) e PropostaCandidata (TransfereGov novo),
 * ver `app/services/relatorios.py` no backend -- aplicar o mesmo valor nas
 * Propostas quase sempre filtraria pra um conjunto vazio.
 *
 * `Município`/`CNES`/`Estabelecimento` (pedido do usuário 2026-09-26) são
 * lista suspensa, mesmo modelo dos demais filtros -- opções derivadas do
 * próprio dado carregado (`opcoesUnicas`), não de um catálogo à parte. Só
 * `município`/`CNES` viram parâmetro pro backend na geração -- o backend
 * trata os 3 como hierarquia de escopo mutuamente exclusiva (Brasil -> UF
 * -> Município -> CNES), então CNES tem prioridade (mais específico),
 * depois Município (exige UF junto), depois UF; `Estabelecimento` não tem
 * campo próprio ali, é só um jeito de achar o CNES certo na prévia.
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
          busca: "",
          uf,
          equipamento: null,
          situacao,
          ano,
          programa,
          tipoContratacao,
          soMonitorados: false,
        },
        SEM_MONITORADOS,
        situacaoExibida,
        ignorar,
      ),
    [convenios, uf, situacao, ano, programa, tipoContratacao],
  );

  const {
    ufs,
    anoOptions,
    situacaoOptions,
    tipoContratacaoOptions,
    programaOptions,
  } = useDadosOficiaisOpcoes({
    classeEquipamento: "prioritario",
    filtrar: filtrarConvenios,
    situacaoExibida,
  });

  // Município/CNES/Estabelecimento (pedido do usuário 2026-09-26) refinam
  // por cima do que os demais filtros já resolveram -- opções e prévia
  // baseadas no mesmo recorte (`conveniosBase`), sem entrar na cascata de
  // `useDadosOficiaisOpcoes` (não fazem parte do vocabulário de Dados
  // Oficiais, ficam só nesta página).
  const conveniosBase = filtrarConvenios();
  const municipioOptions = useMemo(
    () => opcoesUnicas(conveniosBase, (item) => item.municipio),
    [conveniosBase],
  );
  const cnesOptions = useMemo(
    () => opcoesUnicas(conveniosBase, (item) => item.cnes),
    [conveniosBase],
  );
  const estabelecimentoOptions = useMemo(
    () => opcoesUnicas(conveniosBase, (item) => item.cnesNomeEstabelecimento),
    [conveniosBase],
  );

  const conveniosFiltrados = useMemo(
    () =>
      conveniosBase.filter(
        (item) =>
          (!municipio || item.municipio === municipio) &&
          (!cnes || item.cnes === cnes) &&
          (!nomeEstabelecimento ||
            item.cnesNomeEstabelecimento === nomeEstabelecimento),
      ),
    [conveniosBase, municipio, cnes, nomeEstabelecimento],
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
        if (municipio && p.municipio !== municipio) return false;
        if (cnes && p.cnes !== cnes) return false;
        if (
          nomeEstabelecimento &&
          p.cnes_nome_estabelecimento !== nomeEstabelecimento
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
  // validado no backend), depois UF, senão Brasil. `nomeEstabelecimento`
  // não tem campo próprio no backend (é só um jeito de achar o CNES certo
  // na prévia), fica de fora da geração.
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

      <FilterWorkspace
        semRotulo
        hasAnyFilter={hasFiltros}
        onClear={limparFiltros}
      >
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
        <RelatorioInstrumentosTabela itens={conveniosFiltrados} />
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
