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
import { useMemo, useState } from 'react';
import { usePropostasCandidatas } from '@/hooks/use-propostas-candidatas';
import { useMonitoramentoInstrumentos } from '@/hooks/useInstrumentosMonitorados';
import { normalizarTexto } from '@/utils/texto';
import {
  ORDEM_SITUACAO_POR_ESTAGIO,
  estagioDeFato,
  situacaoDeFato,
  type EstagioProposta,
} from '@/lib/proposta-status';
import { SearchInput } from '@/components/common/search-input';
import { SingleSelectFilter } from '@/components/common/single-select-filter';
import { FilterWorkspace } from '@/components/common/filter-workspace';
import { CardProposta } from './proposta-card';

/** `modo`: as 2 abas de "Linhas de financiamento" -- "Confirmada
 * (parceria)" e "Em tramitação (proposta)" (pedido do usuário 2026-09-18,
 * substituindo as antigas "Novas propostas"/"Propostas" que separavam por
 * critério de pagamento em vez de estágio no funil Proposta -> Parceria,
 * ver estagioDeFato() em lib/proposta-status.ts). Busca sempre TUDO da API
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
  const propostas = useMemo(() => todas.filter((p) => estagioDeFato(p) === modo), [todas, modo]);
  const instrumentosPorNumero = useMemo(
    () => new Map(instrumentos.map((instrumento) => [instrumento.nr_convenio, instrumento])),
    [instrumentos],
  );
  const [busca, setBusca] = useState('');
  const [uf, setUf] = useState<string | null>(null);
  const [equipamento, setEquipamento] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<string | null>(null);
  const [ano, setAno] = useState<string | null>(null);
  const [programa, setPrograma] = useState<string | null>(null);

  const limparFiltros = () => {
    setBusca('');
    setUf(null);
    setEquipamento(null);
    setSituacao(null);
    setAno(null);
    setPrograma(null);
  };

  const hasFiltros = Boolean(busca || uf || equipamento || situacao || ano || programa);

  const ufOptions = useMemo(() => {
    const set = new Set(propostas.map((p) => p.uf).filter((u): u is string => Boolean(u)));
    return [...set].sort().map((u) => ({ value: u, label: u }));
  }, [propostas]);

  const equipamentosPorProposta = useMemo(() => {
    return new Map(propostas.map((p) => [p.id, [...new Set(p.equipamentos.map((item) => item.nome))]]));
  }, [propostas]);

  const equipamentoOptions = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const tags of equipamentosPorProposta.values()) {
      for (const t of tags) contagem.set(t, (contagem.get(t) ?? 0) + 1);
    }
    return [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([e, n]) => ({ value: e, label: `${e} (${n})` }));
  }, [equipamentosPorProposta]);

  const situacaoOptions = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const p of propostas) {
      const s = situacaoDeFato(p);
      if (s) contagem.set(s, (contagem.get(s) ?? 0) + 1);
    }
    return [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ value: s, label: `${s} (${n})` }));
  }, [propostas]);

  // Ano da proposta -- mesmo critério do filtro em Instrumentos firmados,
  // aqui via data_proposta em vez do sufixo do numeroInstrumento.
  const anoOptions = useMemo(() => {
    const anos = new Set<string>();
    for (const p of propostas) {
      const a = p.data_proposta?.slice(0, 4);
      if (a) anos.add(a);
    }
    return [...anos].sort().reverse().map((a) => ({ value: a, label: a }));
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
      .map(([id, { nome, n }]) => ({ value: String(id), label: `${nome} (${n})` }));
  }, [propostas]);

  const filtradas = useMemo(() => {
    return propostas.filter((p) => {
      if (uf && p.uf !== uf) return false;
      if (equipamento && !equipamentosPorProposta.get(p.id)?.includes(equipamento)) return false;
      if (situacao && situacaoDeFato(p) !== situacao) return false;
      if (ano && p.data_proposta?.slice(0, 4) !== ano) return false;
      if (programa && String(p.id_programa) !== programa) return false;
      if (busca) {
        const alvo = normalizarTexto(`${p.id_proposta} ${p.nm_proponente} ${p.cnpj_ente_recebedor} ${p.municipio ?? ''} ${p.nm_programa}`);
        if (!alvo.includes(normalizarTexto(busca))) return false;
      }
      return true;
    });
  }, [propostas, uf, equipamento, situacao, ano, programa, busca, equipamentosPorProposta]);

  // Sub-agrupado por situação de fato numa ordem fixa de funil do estágio
  // atual (mais avançado primeiro, ver ORDEM_SITUACAO_POR_ESTAGIO em
  // lib/proposta-status.ts); situação fora da ordem conhecida (vocabulário
  // livre da API) aparece depois, na ordem em que a agregação encontrar.
  const gruposPorSituacao = useMemo(() => {
    const porSituacao = new Map<string, typeof filtradas>();
    for (const p of filtradas) {
      const sit = situacaoDeFato(p) ?? 'Sem situação informada';
      const lista = porSituacao.get(sit) ?? [];
      lista.push(p);
      porSituacao.set(sit, lista);
    }
    const ordem = ORDEM_SITUACAO_POR_ESTAGIO[modo];
    const situacoes = [...porSituacao.keys()].sort((a, b) => {
      const ia = ordem.indexOf(a), ib = ordem.indexOf(b);
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
        {modo === 'tramitacao'
          ? 'Nenhuma proposta em tramitação no momento — o job de descoberta roda diariamente.'
          : 'Nenhuma parceria confirmada ainda.'}
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
        <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por proponente, município, CNPJ..." width={190} />
        <SingleSelectFilter placeholder="Todas as UFs" options={ufOptions} value={uf} onChange={setUf} clearLabel="Todas as UFs" minWidth={100} />
        <SingleSelectFilter placeholder="Todos os equipamentos" options={equipamentoOptions} value={equipamento} onChange={setEquipamento} clearLabel="Todos os equipamentos" minWidth={150} />
        <SingleSelectFilter placeholder="Todas as situações" options={situacaoOptions} value={situacao} onChange={setSituacao} clearLabel="Todas as situações" minWidth={150} />
        <SingleSelectFilter placeholder="Ano da proposta" options={anoOptions} value={ano} onChange={setAno} clearLabel="Todos os anos" minWidth={110} />
        <SingleSelectFilter placeholder="Todos os programas" options={programaOptions} value={programa} onChange={setPrograma} clearLabel="Todos os programas" minWidth={160} />
      </FilterWorkspace>

      {filtradas.length === 0 ? (
        <p className="py-5 text-sm italic text-muted-foreground">Nenhuma proposta encontrada com esses filtros.</p>
      ) : (
        gruposPorSituacao.map(({ sit, itens }) => (
          <div key={sit}>
            {itens.map((p) => (
              <CardProposta
                key={p.id}
                p={p}
                instrumentoMonitorado={instrumentosPorNumero.get(p.cd_parceria || String(p.id_proposta))}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
