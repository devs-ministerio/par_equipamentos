/** Propostas do TransfereGov novo encontradas pelo job de descoberta
 * (backend/scripts/job_descoberta_transferegov.py, Radar de Convênios) --
 * sub-aba de "Linhas de financiamento" (ver monitoramento-equipamentos-page.tsx).
 * Ao vivo contra o banco (PropostaCandidata), com inclusão explícita no
 * monitoramento interno. Camada 1/camada 2 (resumo sempre visível +
 * "Mais detalhes" atrás de 1 clique) no mesmo método do card de convênio
 * (ver convenio-card.tsx).
 *
 * "Mais detalhes" (`CardProposta` -> `DetalheBrutoProposta`, ver
 * proposta-card.tsx/proposta-detalhe-bruto.tsx) mostra o que foi capturado
 * bruto da API no momento da descoberta (`metas_resumo` --
 * proposta/metas/cronograma_desembolso, ver job_descoberta_transferegov.py).
 *
 * Arquivo dividido em 4 (Etapa 5 do plan-mode frontend, 2026-09-17):
 * `lib/proposta-metas-resumo.ts` (parsing puro do `metas_resumo` cru),
 * `proposta-card.tsx` (camada 1 do card e inclusão no monitoramento),
 * `proposta-linha-do-tempo.tsx` e `proposta-detalhe-bruto.tsx` (camada 2).
 * Este arquivo ficou só com a orquestração de filtros/lista. */
import { useMemo, useState } from "react";
import { usePropostasCandidatas } from "@/hooks/use-propostas-candidatas";
import { useMonitoramentoInstrumentos } from "@/hooks/useInstrumentosMonitorados";
import {
  ORDEM_SITUACAO_POR_ESTAGIO,
  estagioDeFato,
  situacaoDeFato,
  type EstagioProposta,
} from "@/lib/proposta-status";
import { SingleSelectFilter } from "@/components/common/single-select-filter";
import { SearchInput } from "@/components/common/search-input";
import { FilterWorkspace } from "@/components/common/filter-workspace";
import { AnoIntervaloFilter } from "@/components/common/ano-intervalo-filter";
import { CardProposta } from "./proposta-card";
import { correspondeBuscaLivre } from "@/lib/busca-livre";

/** `modo`: as 2 abas de "Linhas de financiamento" -- "Confirmada
 * (parceria)" e "Em tramitação (proposta)", separadas por estágio no funil
 * Proposta -> Parceria (não por critério de pagamento, ver estagioDeFato()
 * em lib/proposta-status.ts). Busca sempre TUDO da API
 * de uma vez (sem `status` na query) -- as duas abas só recortam
 * client-side, então trocar de aba não refaz o fetch (mesma queryKey no
 * cache do TanStack Query).
 *
 * Opções de filtro computadas só a partir do `propostas` já filtrado por
 * `modo` (options refletem o que está na aba atual, não o universo
 * inteiro). "Tipo de contratação" fica de fora dos filtros porque não se
 * aplica aqui (toda PropostaCandidata é, por definição, TransfereGov
 * Novo; convênio legado nunca entra nesta lista). */
export function SecaoPropostasCandidatas({ modo }: { modo: EstagioProposta }) {
  const { propostas: todas, carregando } = usePropostasCandidatas();
  const { data: instrumentos = [] } = useMonitoramentoInstrumentos();
  const propostas = useMemo(
    () => todas.filter((p) => estagioDeFato(p) === modo),
    [todas, modo],
  );
  const instrumentosPorNumero = useMemo(
    () =>
      new Map(
        instrumentos.map((instrumento) => [
          instrumento.nr_convenio,
          instrumento,
        ]),
      ),
    [instrumentos],
  );
  const [uf, setUf] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [cnes, setCnes] = useState<string | null>(null);
  const [municipio, setMunicipio] = useState<string | null>(null);
  const [equipamento, setEquipamento] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<string | null>(null);
  const [anoInicio, setAnoInicio] = useState<string | null>(null);
  const [anoFim, setAnoFim] = useState<string | null>(null);
  const [programa, setPrograma] = useState<string | null>(null);

  const limparFiltros = () => {
    setBusca("");
    setUf(null);
    setCnes(null);
    setMunicipio(null);
    setEquipamento(null);
    setSituacao(null);
    setAnoInicio(null);
    setAnoFim(null);
    setPrograma(null);
  };

  const hasFiltros = Boolean(
    busca.trim() ||
    uf ||
    cnes ||
    municipio ||
    equipamento ||
    situacao ||
    anoInicio ||
    anoFim ||
    programa,
  );

  const ufOptions = useMemo(() => {
    const set = new Set(
      propostas.map((p) => p.uf).filter((u): u is string => Boolean(u)),
    );
    return [...set].sort().map((u) => ({ value: u, label: u }));
  }, [propostas]);
  const cnesOptions = useMemo(
    () =>
      [
        ...new Set(
          propostas.map((p) => p.cnes).filter((v): v is string => Boolean(v)),
        ),
      ]
        .sort()
        .map((value) => ({ value, label: value })),
    [propostas],
  );
  const municipioOptions = useMemo(
    () =>
      [
        ...new Set(
          propostas
            .map((p) => p.municipio)
            .filter((v): v is string => Boolean(v)),
        ),
      ]
        .sort()
        .map((value) => ({ value, label: value })),
    [propostas],
  );

  const equipamentosPorProposta = useMemo(() => {
    return new Map(
      propostas.map((p) => [
        p.id,
        [...new Set(p.equipamentos.map((item) => item.nome))],
      ]),
    );
  }, [propostas]);

  const equipamentoOptions = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const tags of equipamentosPorProposta.values()) {
      for (const t of tags) contagem.set(t, (contagem.get(t) ?? 0) + 1);
    }
    return [...contagem.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([e, n]) => ({ value: e, label: `${e} (${n})` }));
  }, [equipamentosPorProposta]);

  const situacaoOptions = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const p of propostas) {
      const s = situacaoDeFato(p);
      if (s) contagem.set(s, (contagem.get(s) ?? 0) + 1);
    }
    return [...contagem.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => ({ value: s, label: `${s} (${n})` }));
  }, [propostas]);

  // Ano da proposta -- mesmo critério do filtro em Instrumentos firmados,
  // aqui via data_proposta em vez do sufixo do numeroInstrumento.
  const anoOptions = useMemo(() => {
    const anos = new Set<string>();
    for (const p of propostas) {
      const a = p.data_proposta?.slice(0, 4);
      if (a) anos.add(a);
    }
    return [...anos]
      .sort()
      .reverse()
      .map((a) => ({ value: a, label: a }));
  }, [propostas]);

  // Por id_programa (chave limpa, não o rótulo) -- mesmo raciocínio do
  // filtro de Instrumentos firmados, mas aqui o id já vem certo na API
  // (sem corrupção de encoding pra contornar).
  const programaOptions = useMemo(() => {
    const porId = new Map<number, { nome: string; n: number }>();
    for (const p of propostas) {
      const atual = porId.get(p.id_programa);
      if (atual) atual.n += 1;
      else porId.set(p.id_programa, { nome: p.nm_programa, n: 1 });
    }
    return [...porId.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .map(([id, { nome, n }]) => ({
        value: String(id),
        label: `${nome} (${n})`,
      }));
  }, [propostas]);

  const filtradas = useMemo(() => {
    return propostas.filter((p) => {
      if (
        !correspondeBuscaLivre(busca, [
          p.cd_parceria,
          p.id_proposta,
          p.nm_proponente,
          p.cnpj_ente_recebedor,
          p.cnes,
          p.cnes_nome_estabelecimento,
          p.municipio,
          p.uf,
          p.ds_objeto,
          p.nm_programa,
          situacaoDeFato(p),
          p.equipamentos.map((item) => item.nome).join(" "),
        ])
      )
        return false;
      if (uf && p.uf !== uf) return false;
      if (cnes && p.cnes !== cnes) return false;
      if (municipio && p.municipio !== municipio) return false;
      if (
        equipamento &&
        !equipamentosPorProposta.get(p.id)?.includes(equipamento)
      )
        return false;
      if (situacao && situacaoDeFato(p) !== situacao) return false;
      const anoDaProposta = Number(p.data_proposta?.slice(0, 4));
      if (anoInicio && (!anoDaProposta || anoDaProposta < Number(anoInicio)))
        return false;
      if (anoFim && (!anoDaProposta || anoDaProposta > Number(anoFim)))
        return false;
      if (programa && String(p.id_programa) !== programa) return false;
      return true;
    });
  }, [
    propostas,
    busca,
    uf,
    cnes,
    municipio,
    equipamento,
    situacao,
    anoInicio,
    anoFim,
    programa,
    equipamentosPorProposta,
  ]);

  // Sub-agrupado por situação de fato numa ordem fixa de funil do estágio
  // atual (mais avançado primeiro, ver ORDEM_SITUACAO_POR_ESTAGIO em
  // lib/proposta-status.ts); situação fora da ordem conhecida (vocabulário
  // livre da API) aparece depois, na ordem em que a agregação encontrar.
  const gruposPorSituacao = useMemo(() => {
    const porSituacao = new Map<string, typeof filtradas>();
    for (const p of filtradas) {
      const sit = situacaoDeFato(p) ?? "Sem situação informada";
      const lista = porSituacao.get(sit) ?? [];
      lista.push(p);
      porSituacao.set(sit, lista);
    }
    const ordem = ORDEM_SITUACAO_POR_ESTAGIO[modo];
    const situacoes = [...porSituacao.keys()].sort((a, b) => {
      const ia = ordem.indexOf(a),
        ib = ordem.indexOf(b);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return situacoes.map((sit) => ({ sit, itens: porSituacao.get(sit)! }));
  }, [filtradas, modo]);

  if (carregando) return <p className="text-muted-foreground">Carregando...</p>;

  if (propostas.length === 0) {
    return (
      <p className="py-5 text-sm italic text-muted-foreground">
        {modo === "tramitacao"
          ? "Nenhuma proposta em tramitação no momento — o job de descoberta roda diariamente."
          : "Nenhuma parceria confirmada ainda."}
      </p>
    );
  }

  return (
    <div className="mt-4">
      <FilterWorkspace
        hasAnyFilter={hasFiltros}
        onClear={limparFiltros}
        contagem={`${filtradas.length} de ${propostas.length} propostas`}
      >
        <SearchInput
          value={busca}
          onChange={setBusca}
          placeholder="Buscar proposta, proponente, CNES ou município"
          width={162}
        />
        {modo !== "tramitacao" && (
          <SingleSelectFilter
            placeholder="CNES"
            options={cnesOptions}
            value={cnes}
            onChange={setCnes}
            clearLabel="CNES"
            minWidth={120}
          />
        )}
        <SingleSelectFilter
          placeholder="UF"
          options={ufOptions}
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
          minWidth={150}
        />
        <SingleSelectFilter
          placeholder="Equipamento"
          options={equipamentoOptions}
          value={equipamento}
          onChange={setEquipamento}
          clearLabel="Equipamento"
          minWidth={150}
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

      {filtradas.length === 0 ? (
        <p className="py-5 text-sm italic text-muted-foreground">
          Nenhuma proposta encontrada com esses filtros.
        </p>
      ) : (
        gruposPorSituacao.map(({ sit, itens }) => (
          <div key={sit}>
            {itens.map((p) => (
              <CardProposta
                key={p.id}
                p={p}
                instrumentoMonitorado={instrumentosPorNumero.get(
                  p.cd_parceria || String(p.id_proposta),
                )}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
