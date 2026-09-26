import { useCallback, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { FilterWorkspace } from "@/components/common/filter-workspace";
import { SearchInput } from "@/components/common/search-input";
import { SingleSelectFilter } from "@/components/common/single-select-filter";
import { ErrorAlert } from "@/components/common/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AbasDadosOficiais,
  SubAbasFinanciamento,
} from "@/components/features/dados-oficiais-abas";
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
import { estagioDeFato, type EstagioProposta } from "@/lib/proposta-status";
import type { ConvenioUnificado } from "@/types/monitoramento";
import type { FiltroDadosOficiais } from "@/types/dados-oficiais";
import type { NivelRelatorio } from "@/services/relatorios";

const situacaoExibida = (item: ConvenioUnificado) => item.situacao;
const SEM_MONITORADOS = new Set<string>();

/**
 * Relatório de Instrumentos e Repasse -- convênios firmados, propostas
 * candidatas (linhas de financiamento) e monitoramento interno numa
 * chamada só (`GET /relatorios`), em Excel ou Word (Plan Mode
 * docs/arquitetura/planmode-relatorios-2026-09-25.md, Blocos 6 e 7).
 *
 * Mesmos filtros e a mesma separação em abas de "Instrumentos e repasses"
 * (Dados Oficiais, `monitoramento-equipamentos-page.tsx`) -- pedido do
 * usuário: "coloque os mesmos filtros que temos no instrumentos/repasses"
 * + "separar em instrumentos/programas e linhas de financiamento (parceria
 * e propostas)". A tabela de prévia é 100% client-side (mesmo dado já
 * carregado por `useConveniosLista`/`usePropostasCandidatas`, zero chamada
 * nova) -- mostra exatamente o recorte que os botões abaixo baixam.
 * `situacao`/`programa` só filtram a seção de Convênios (aba "Instrumentos/
 * Programas"): o vocabulário desses campos diverge entre Convenio (SICONV)
 * e PropostaCandidata (TransfereGov novo), ver `app/services/relatorios.py`
 * no backend -- aplicar o mesmo valor nas Propostas quase sempre filtraria
 * pra um conjunto vazio.
 */
export function MonitoramentoRelatoriosPage() {
  const [aba, setAba] = useState<"convenios" | "componentes">("convenios");
  const [estagio, setEstagio] = useState<EstagioProposta>("confirmada");
  const [nivel, setNivel] = useState<NivelRelatorio>("simplificado");

  const {
    busca,
    setBusca,
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
          busca,
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
    [convenios, busca, uf, situacao, ano, programa, tipoContratacao],
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

  const conveniosFiltrados = filtrarConvenios();

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
        return true;
      }),
    [propostas, uf, ano],
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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Monitoramento interno"
        title="Relatórios"
        description="Convênios, propostas candidatas e monitoramento interno em Excel ou Word."
      />

      <FilterWorkspace hasAnyFilter={hasFiltros} onClear={limparFiltros}>
        <SearchInput
          value={busca}
          onChange={setBusca}
          placeholder="Buscar por convenente, município, número, CNPJ ou CNES..."
          width={190}
        />
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

      <AbasDadosOficiais
        aba={aba}
        totalInstrumentos={conveniosFiltrados.length}
        totalPropostas={propostasFiltradas.length}
        onChange={setAba}
      />

      {aba === "convenios" &&
        (conveniosQuery.isLoading ? (
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
            onLimparFiltros={limparFiltros}
          />
        ))}

      {aba === "componentes" && (
        <>
          <SubAbasFinanciamento
            atual={estagio}
            confirmadas={propostasConfirmadas.length}
            emTramitacao={propostasEmTramitacao.length}
            onChange={setEstagio}
          />
          {carregandoPropostas ? (
            <Skeleton
              className="h-64 w-full"
              role="status"
              aria-label="Carregando"
            />
          ) : erroPropostas ? (
            <ErrorAlert mensagem={mensagemSeguraDoErro(erroPropostas)} />
          ) : (
            <RelatorioPropostasTabela
              itens={
                estagio === "confirmada"
                  ? propostasConfirmadas
                  : propostasEmTramitacao
              }
              onLimparFiltros={limparFiltros}
            />
          )}
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
            escopo: uf ? "uf" : "brasil",
            uf: uf ?? undefined,
            ano: ano ? Number(ano) : undefined,
            situacao: situacao ?? undefined,
            programa: programa ?? undefined,
            tipoContratacao: tipoContratacao ?? undefined,
            busca: busca || undefined,
          })
        }
      />
    </div>
  );
}
