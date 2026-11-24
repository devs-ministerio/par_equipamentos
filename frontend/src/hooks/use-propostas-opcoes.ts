import { useMemo } from "react";
import type { OpcaoFiltro } from "@/components/common/opcoes-multiplas";
import { situacaoDeFato } from "@/lib/proposta-status";
import type { usePropostasCandidatas } from "@/hooks/use-propostas-candidatas";
import type { instrumentosManuaisFinanciamento } from "@/lib/financiamento-manual";

type Proposta = ReturnType<typeof usePropostasCandidatas>["propostas"][number];
type Manual = ReturnType<typeof instrumentosManuaisFinanciamento>[number];

/** Opções dos filtros de Linhas de financiamento, calculadas do que está na aba atual. */
export function usePropostasOpcoes(propostas: Proposta[], manuais: Manual[]) {
  const ufOptions = useMemo(() => {
    const set = new Set(
      [...propostas, ...manuais]
        .map((p) => p.uf)
        .filter((u): u is string => Boolean(u)),
    );
    return [...set].sort().map((u) => ({ value: u, label: u }));
  }, [propostas, manuais]);
  const cnesOptions = useMemo(
    () =>
      [
        ...new Set(
          [...propostas, ...manuais]
            .map((p) => p.cnes)
            .filter((v): v is string => Boolean(v)),
        ),
      ]
        .sort()
        .map((value) => ({ value, label: value })),
    [propostas, manuais],
  );
  const municipioOptions = useMemo(
    () =>
      [
        ...new Set(
          [...propostas, ...manuais]
            .map((p) => p.municipio)
            .filter((v): v is string => Boolean(v)),
        ),
      ]
        .sort()
        .map((value) => ({ value, label: value })),
    [propostas, manuais],
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

  const opcoes: Record<
    | "uf"
    | "cnes"
    | "municipio"
    | "equipamento"
    | "situacao"
    | "programa"
    | "ano",
    OpcaoFiltro[]
  > = {
    uf: ufOptions,
    cnes: cnesOptions,
    municipio: municipioOptions,
    equipamento: equipamentoOptions,
    situacao: situacaoOptions,
    programa: programaOptions,
    ano: anoOptions,
  };
  return { equipamentosPorProposta, opcoes };
}
