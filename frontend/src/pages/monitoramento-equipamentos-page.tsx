/**
 * Dados oficiais consolidados de instrumentos e linhas de financiamento.
 *
 * Um registro por convenio, cruzando as 3 fontes oficiais -- achado
 * 2026-09-16 ("parar de usar json estático, coloque tudo no banco"): o
 * merge (antes client-side, ver histórico de `mesclarConvenios.ts`) agora
 * roda 1x na carga (`backend/scripts/importar_convenios_banco.py`),
 * gravado na tabela `Convenio`. O front busca `GET /convenios`
 * (`src/services/convenios.ts`) em vez de 3 JSON estático + merge:
 *   - Portal da Transparencia (/convenios/numero) -- 1:1 exato por numero,
 *     unica fonte com convenente/municipio/objeto legivel pros 71
 *   - SICONV legado (dump bulk) -- 1:1 exato por numero, valores
 *     financeiros corretos (Portal tem bug de truncamento confirmado) +
 *     granular (empenho/desembolso/licitacao/item de plano de aplicacao)
 *   - TransfereGov novo (modulo Gestao de Parcerias) -- cruzado por CNPJ do
 *     convenente, aproximacao (a API nova nao tem numero de convenio legado)
 *
 * O monitoramento interno pos-repasse fica DENTRO de cada card, numa secao
 * separada das 3 fontes (so busca quando o card e aberto) -- ver
 * convenio-card.tsx e monitoramento-interno.tsx.
 */
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/common/page-header";
import { SearchInput } from "@/components/common/search-input";
import { SingleSelectFilter } from "@/components/common/single-select-filter";
import { filtrarDadosOficiais } from "@/lib/filtrar-dados-oficiais";
import { SecaoPropostasCandidatas } from "@/components/features/secao-propostas-candidatas";
import {
  AbasDadosOficiais,
  SubAbasFinanciamento,
} from "@/components/features/dados-oficiais-abas";
import { DadosOficiaisMetricas } from "@/components/features/dados-oficiais-metricas";
import { DadosOficiaisFiltros } from "@/components/features/dados-oficiais-filtros";
import { DadosOficiaisLista } from "@/components/features/dados-oficiais-lista";
import { DadosOficiaisInstrumentos } from "@/components/features/dados-oficiais-instrumentos";
import type {
  AbaDadosOficiais,
  ClasseEquipamento,
} from "@/types/dados-oficiais";
import {
  TAMANHO_PAGINA_DADOS_OFICIAIS,
  useDadosOficiaisFiltros,
} from "@/hooks/use-dados-oficiais-filtros";
import { useDadosOficiaisOpcoes } from "@/hooks/use-dados-oficiais-opcoes";
import { useDadosOficiaisResumo } from "@/hooks/use-dados-oficiais-resumo";
import { usePropostasCandidatas } from "@/hooks/use-propostas-candidatas";
import { estagioDeFato, type EstagioProposta } from "@/lib/proposta-status";
import { useConveniosLista } from "@/hooks/useConveniosLista";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { useMonitoramentoInstrumentos } from "@/hooks/useInstrumentosMonitorados";

// "Radar nacional" (snapshot estático) e "Incorporadas" saíram (pedido do
// usuário 2026-09-15). "Novas propostas"/"Propostas" (critério de
// pagamento) saíram por sua vez em 2026-09-18, substituídas pelo estágio
// real no funil TransfereGov: "Confirmada (parceria)" (já formalizada, tem
// cd_parceria/NUP SEI) e "Em tramitação (proposta)" (pode virar parceria
// ou mudar de situação na fonte) -- ver estagioDeFato() em lib/proposta-status.ts.

// Correção 2026-09-18 (Plan Mode monitoramento-ingestao): FAF/TED/
// PERSUS I/PERSUS II/PRONON entraram no universo de "Instrumentos
// firmados" -- opções geradas a partir do dado real (mesmo padrão de
// `situacaoOptions`/`programaOptions` abaixo), não mais lista fixa.

// Card com 2 camadas (ConvenioCard.tsx) e mais pesado que linha de tabela --
// pagina de 20 em vez dos 50 que EstabelecimentoTable usa pra linha simples.

// "Concluídos" -- ampliado 2026-09-18 (pedido do usuário) pra somar as
// situações que representam "chegou ao fim" em cada universo de fonte:
// "Prestação de Contas Concluída" (SICONV legado, achado 2026-09-15) e
// "Em operação" (PERSUS I inaugurado/PERSUS II/PRONON -- "Inaugurada"
// unificada em "Em operação" pra usar o mesmo vocabulário entre fontes).

export function MonitoramentoEquipamentosPage() {
  const [searchParams] = useSearchParams();
  const [aba, setAba] = useState<AbaDadosOficiais>(() =>
    searchParams.get("aba") === "componentes" ? "componentes" : "convenios",
  );
  const [subAbaFinanciamento, setSubAbaFinanciamento] =
    useState<EstagioProposta>(() =>
      searchParams.get("subaba") === "confirmada" ? "confirmada" : "tramitacao",
    );
  const {
    busca,
    setBusca,
    uf,
    setUf,
    equipamento,
    setEquipamento,
    classeEquipamento,
    setClasseEquipamento,
    situacao,
    setSituacao,
    ano,
    setAno,
    programa,
    setPrograma,
    tipoContratacao,
    setTipoContratacao,
    soMonitorados,
    setSoMonitorados,
    pagina,
    setPagina,
    hasFiltros,
    limparFiltros,
  } = useDadosOficiaisFiltros();
  const instrumentosQuery = useMonitoramentoInstrumentos();
  const fasesMonitoramento = useMemo(
    () =>
      new Map(
        (instrumentosQuery.data ?? []).map((instrumento) => [
          instrumento.nr_convenio,
          instrumento.fase_atual ?? "Não iniciado",
        ]),
      ),
    [instrumentosQuery.data],
  );
  const monitorados = useMemo(
    () => new Set(fasesMonitoramento.keys()),
    [fasesMonitoramento],
  );

  // Busca os 403 inteiros de 1 vez (tamanho_pagina=500 > universo hoje) --
  // igual ao comportamento anterior (3 JSON carregados por inteiro,
  // paginação/filtro só no cliente), só troca a origem do dado. Página
  // é bem mais leve que antes (sem siconv_raw/transferegov_raw na
  // listagem, ver services/convenios.ts) mesmo carregando tudo de uma vez.
  const conveniosQuery = useConveniosLista();
  const convenios = conveniosQuery.data?.itens ?? null;
  const situacaoExibida = useCallback(
    (convenio: NonNullable<typeof convenios>[number]) =>
      fasesMonitoramento.get(convenio.numero) ?? convenio.situacao,
    [fasesMonitoramento],
  );

  // Uma única regra alimenta lista, cartões e opções em cascata. Ao montar
  // as opções de um seletor, ele é o único critério temporariamente omitido;
  // todos os demais permanecem ativos.
  const filtrarConvenios = useCallback(
    (
      ignorar?: "uf" | "equipamento" | "situacao" | "ano" | "programa" | "tipo",
    ) => {
      return filtrarDadosOficiais(
        convenios ?? [],
        {
          busca,
          uf,
          equipamento,
          situacao,
          ano,
          programa,
          tipoContratacao,
          soMonitorados,
        },
        monitorados,
        situacaoExibida,
        ignorar,
      );
    },
    [
      ano,
      busca,
      convenios,
      equipamento,
      monitorados,
      programa,
      situacao,
      situacaoExibida,
      soMonitorados,
      tipoContratacao,
      uf,
    ],
  );

  const {
    ufs,
    equipamentoOptions,
    anoOptions,
    situacaoOptions,
    tipoContratacaoOptions,
    programaOptions,
  } = useDadosOficiaisOpcoes({
    classeEquipamento,
    filtrar: filtrarConvenios,
    situacaoExibida,
  });

  const {
    filtrados,
    paginados,
    totalGlobal,
    totalDesembolsado,
    totalEquipamentos,
    totalConcluidos,
    totalMonitorados,
  } = useDadosOficiaisResumo({
    itens: filtrarConvenios(),
    monitorados,
    situacaoExibida,
    pagina,
    pageSize: TAMANHO_PAGINA_DADOS_OFICIAIS,
  });

  const erro = conveniosQuery.error
    ? mensagemSeguraDoErro(conveniosQuery.error)
    : null;

  // Contagem só pro rótulo das abas -- não afeta o resto da página, busca
  // leve e independente do resto do estado (mesma queryKey sem status do
  // SecaoPropostasCandidatas, já cacheada quando a aba abrir de verdade).
  const { propostas: todasPropostas } = usePropostasCandidatas();
  const totalConfirmadas = todasPropostas.filter(
    (p) => estagioDeFato(p) === "confirmada",
  ).length;
  const totalEmTramitacao = todasPropostas.length - totalConfirmadas;

  return (
    <div>
      <PageHeader
        eyebrow="Dados oficiais"
        title="Instrumentos e repasses"
        description="Convênios, propostas, valores e execução das fontes oficiais."
      />

      {erro && (
        <p className="text-destructive">Erro ao carregar dados: {erro}</p>
      )}

      {/* Abas -- Instrumentos/Programas (registros oficiais e cargas
            programáticas) e Linhas
            de financiamento (propostas do Radar de Convênios, ver
            SecaoPropostasCandidatas.tsx). */}
      <AbasDadosOficiais
        aba={aba}
        totalInstrumentos={convenios?.length ?? 0}
        totalPropostas={todasPropostas.length}
        onChange={setAba}
      />

      {aba === "convenios" && (
        <DadosOficiaisInstrumentos carregando={!convenios}>
          {convenios && (
            <>
              {/* "Instrumentos/Programas" e "Monitorados internamente"
                  saíram daqui -- duplicavam os cards do cabeçalho acima
                  (achado 2026-09-15, pedido do usuário: "revise e pode
                  remover"). Legenda de cor (Em execução/Prestação de
                  contas/Anulado/Demais) também saiu, mesmo pedido. */}
              <DadosOficiaisMetricas
                instrumentos={filtrados.length}
                monitorados={totalMonitorados}
                concluidos={totalConcluidos}
                valorGlobal={totalGlobal}
                desembolsado={totalDesembolsado}
                equipamentos={totalEquipamentos}
                soMonitorados={soMonitorados}
                onToggleMonitorados={() => setSoMonitorados((valor) => !valor)}
              />

              {/* Busca + 6 filtro precisam caber numa linha so (pedido do
                  usuario 2026-09-09) -- larguras reduzidas na proporcao
                  certa pra somar <1200px (cabe dentro do maxWidth de 1400
                  menos padding). wrap continua ligado so como rede de
                  seguranca pra janela bem estreita, nao pro uso normal. */}
              <DadosOficiaisFiltros
                ativos={hasFiltros}
                onLimpar={limparFiltros}
                contagem={`${filtrados.length} de ${convenios.length} instrumentos`}
              >
                <SearchInput
                  value={busca}
                  onChange={setBusca}
                  placeholder="Buscar por convenente, município, número, CNPJ..."
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
                  placeholder="Categoria do equipamento"
                  options={[
                    { value: "prioritario", label: "Prioritários" },
                    { value: "outro", label: "Outros identificados" },
                  ]}
                  value={classeEquipamento}
                  onChange={(valor) =>
                    setClasseEquipamento(
                      (valor ?? "prioritario") as ClasseEquipamento,
                    )
                  }
                  clearLabel="Prioritários"
                  minWidth={160}
                />
                <SingleSelectFilter
                  placeholder="Todos os equipamentos"
                  options={equipamentoOptions}
                  value={equipamento}
                  onChange={setEquipamento}
                  clearLabel="Todos os equipamentos"
                  minWidth={150}
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
              </DadosOficiaisFiltros>

              <DadosOficiaisLista
                itens={paginados}
                monitorados={monitorados}
                fases={fasesMonitoramento}
                pagina={pagina}
                total={filtrados.length}
                onPagina={setPagina}
              />
            </>
          )}
        </DadosOficiaisInstrumentos>
      )}

      {aba === "componentes" && (
        <>
          {/* Radar de Convênios -- organizado pelo estágio real no funil
                TransfereGov (pedido do usuário 2026-09-18, substituindo as
                antigas "Novas propostas"/"Propostas" que separavam por
                critério de pagamento): "Confirmada (parceria)" primeiro
                (fato consumado), "Em tramitação (proposta)" depois (pode
                virar parceria ou mudar de situação na fonte). */}
          <SubAbasFinanciamento
            atual={subAbaFinanciamento}
            confirmadas={totalConfirmadas}
            emTramitacao={totalEmTramitacao}
            onChange={setSubAbaFinanciamento}
          />

          <SecaoPropostasCandidatas modo={subAbaFinanciamento} />
        </>
      )}
    </div>
  );
}
