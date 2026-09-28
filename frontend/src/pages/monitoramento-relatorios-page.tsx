import { useCallback, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { FilterWorkspace } from "@/components/common/filter-workspace";
import { AnoIntervaloFilter } from "@/components/common/ano-intervalo-filter";
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
type IgnorarExtra = "municipio" | "cnes" | "estabelecimento";

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
    anoInicio,
    setAnoInicio,
    anoFim,
    setAnoFim,
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
    hasFiltros,
    limparFiltros,
  } = useRelatorioInstrumentosFiltros();

  const conveniosQuery = useConveniosLista();
  const convenios = useMemo(
    () => conveniosQuery.data?.itens ?? [],
    [conveniosQuery.data],
  );

  // Período de 2 datas (Bloco 8, 2026-09-27) -- substitui o antigo `ano`
  // único de `filtrarDadosOficiais` (que continua servindo só Dados
  // Oficiais, sem mudança). Aplicado igual município/CNES/Estabelecimento:
  // fora da cascata de Dados Oficiais, direto no filtro combinado abaixo.
  const dentroDoPeriodo = useCallback(
    (anoInstrumento: number | null) => {
      if (!anoInicio && !anoFim) return true;
      if (anoInstrumento === null) return false;
      if (anoInicio && anoInstrumento < Number(anoInicio)) return false;
      return !(anoFim && anoInstrumento > Number(anoFim));
    },
    [anoInicio, anoFim],
  );

  // Filtro único, cascateando TODOS os campos entre si -- achado ao vivo
  // 2026-09-26: `município`/`CNES`/`Estabelecimento` viviam fora da cascata
  // de `filtrarDadosOficiais` (não estreitavam nem eram estreitados pelos
  // demais seletores). `ignorarDO` cobre o vocabulário de Dados Oficiais
  // (uf/equipamento/situação/programa/tipo); `ignorarExtra` cobre os 3
  // campos exclusivos desta página -- cada seletor ignora só o próprio
  // critério, senão uma seleção elimina a opção necessária pra desfazê-la.
  const filtrarTudo = useCallback(
    (ignorarDO?: FiltroDadosOficiais, ignorarExtra?: IgnorarExtra) => {
      const base = filtrarDadosOficiais(
        convenios,
        {
          uf,
          municipio: null,
          cnes: null,
          equipamento,
          situacao,
          anoInicio: null,
          anoFim: null,
          programa,
          tipoContratacao,
          soMonitorados: false,
        },
        SEM_MONITORADOS,
        situacaoExibida,
        ignorarDO,
      );
      return base.filter(
        (item) =>
          dentroDoPeriodo(item.anoInstrumento) &&
          (ignorarExtra === "municipio" ||
            !municipio ||
            normalizarTexto(item.municipio) === municipio) &&
          (ignorarExtra === "cnes" || !cnes || item.cnes === cnes) &&
          (ignorarExtra === "estabelecimento" ||
            !nomeEstabelecimento ||
            normalizarTexto(item.cnesNomeEstabelecimento ?? "") ===
              nomeEstabelecimento),
      );
    },
    [
      convenios,
      uf,
      situacao,
      dentroDoPeriodo,
      programa,
      tipoContratacao,
      equipamento,
      municipio,
      cnes,
      nomeEstabelecimento,
    ],
  );

  const filtrarConvenios = useCallback(
    (ignorar?: FiltroDadosOficiais) => filtrarTudo(ignorar),
    [filtrarTudo],
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

  const municipioOptions = useMemo(
    () =>
      opcoesAgrupadas(
        filtrarTudo(undefined, "municipio"),
        (item) => item.municipio,
      ),
    [filtrarTudo],
  );
  const cnesOptions = useMemo(
    () => opcoesUnicas(filtrarTudo(undefined, "cnes"), (item) => item.cnes),
    [filtrarTudo],
  );

  const conveniosFiltrados = useMemo(() => filtrarTudo(), [filtrarTudo]);

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
        if (anoInicio || anoFim) {
          const anoProposta = Number(p.data_proposta?.slice(0, 4));
          if (!anoProposta) return false;
          if (anoInicio && anoProposta < Number(anoInicio)) return false;
          if (anoFim && anoProposta > Number(anoFim)) return false;
        }
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
    [propostas, uf, anoInicio, anoFim, municipio, cnes, nomeEstabelecimento],
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
  // estabelecimento (mais específico), depois Município (exige UF junto),
  // depois UF, senão Brasil.
  //
  // Dois achados ao vivo 2026-09-26, "relatório gerado não responde a
  // todos os filtros selecionados":
  // 1. Selecionar só Município (sem UF) fazia `escopoGeracao` cair pra
  //    "brasil" -- a validação de `FiltroRelatorio` exige os dois juntos --
  //    e o arquivo baixava o Brasil inteiro, silenciosamente ignorando o
  //    município escolhido. UF agora é derivada do próprio item quando o
  //    usuário não a selecionou explicitamente.
  // 2. `Estabelecimento` nunca tinha campo próprio no backend -- resolvido
  //    pro CNES correspondente (1:1 na prática, mesmo dado de origem do
  //    dropdown) quando CNES não foi selecionado à parte.
  const municipioItem = municipio
    ? convenios.find((item) => normalizarTexto(item.municipio) === municipio)
    : undefined;
  const ufEfetiva = uf ?? municipioItem?.uf;
  const estabelecimentoItem =
    !cnes && nomeEstabelecimento
      ? convenios.find(
          (item) =>
            normalizarTexto(item.cnesNomeEstabelecimento ?? "") ===
            nomeEstabelecimento,
        )
      : undefined;
  const cnesEfetivo = cnes ?? estabelecimentoItem?.cnes ?? undefined;

  const escopoGeracao = cnesEfetivo
    ? "cnes"
    : municipio && ufEfetiva
      ? "municipio"
      : ufEfetiva
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
          clearLabel="Tipo de contratação"
          minWidth={120}
        />
        <SingleSelectFilter
          placeholder="UF"
          options={ufs}
          value={uf}
          onChange={setUf}
          clearLabel="UF"
          minWidth={100}
        />
        <SingleSelectFilter
          placeholder="Município"
          options={municipioOptions}
          value={municipio}
          onChange={setMunicipio}
          clearLabel="Município"
          minWidth={140}
        />
        <SingleSelectFilter
          placeholder="CNES"
          options={cnesOptions}
          value={cnes}
          onChange={setCnes}
          clearLabel="CNES"
          minWidth={110}
        />
        <SingleSelectFilter
          placeholder="Equipamento"
          options={equipamentoOptions}
          value={equipamento}
          onChange={setEquipamento}
          clearLabel="Equipamento"
          minWidth={160}
        />
        <SingleSelectFilter
          placeholder="Situação"
          options={situacaoOptions}
          value={situacao}
          onChange={setSituacao}
          clearLabel="Situação"
          minWidth={150}
        />
        <SingleSelectFilter
          placeholder="Programas"
          options={programaOptions}
          value={programa}
          onChange={setPrograma}
          clearLabel="Programas"
          minWidth={160}
        />
        <AnoIntervaloFilter
          options={anoOptions}
          inicio={anoInicio}
          fim={anoFim}
          onInicioChange={setAnoInicio}
          onFimChange={setAnoFim}
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
            uf:
              escopoGeracao === "uf" || escopoGeracao === "municipio"
                ? ufEfetiva
                : undefined,
            municipio:
              escopoGeracao === "municipio"
                ? (municipio ?? undefined)
                : undefined,
            cnes: escopoGeracao === "cnes" ? cnesEfetivo : undefined,
            anoInicio: anoInicio ? Number(anoInicio) : undefined,
            anoFim: anoFim ? Number(anoFim) : undefined,
            situacao: situacao ?? undefined,
            programa: programa ?? undefined,
            tipoContratacao: tipoContratacao ?? undefined,
            equipamento: equipamento ?? undefined,
          })
        }
      />
    </div>
  );
}
