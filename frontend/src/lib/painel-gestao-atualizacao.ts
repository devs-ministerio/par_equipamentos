import type { ResumoMonitoramento } from "@/services/monitoramento-resumo";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";

export const FAIXAS_PARADOS = [
  { rotulo: "Até 30 dias", max: 30, cor: "var(--success)" },
  { rotulo: "31 a 60", max: 60, cor: "var(--primary)" },
  { rotulo: "61 a 90", max: 90, cor: "var(--warning)" },
  { rotulo: "Mais de 90", max: Infinity, cor: "var(--destructive)" },
] as const;

export const ROTULO_SEM_LANCAMENTO = "Sem lançamento";

/** Faixa de tempo sem atualização do instrumento; `null` para concluído, "Sem lançamento" se nunca houve. */
export function faixaDeAtualizacao(
  faseAtual: string | null | undefined,
  ultimaAtividadeEm: string | null | undefined,
  agora = Date.now(),
): string | null {
  if (faseAtual === "Concluído") return null;
  if (!ultimaAtividadeEm) return ROTULO_SEM_LANCAMENTO;
  const d = Math.floor(
    (agora - new Date(ultimaAtividadeEm).getTime()) / 86_400_000,
  );
  return (FAIXAS_PARADOS.find((f) => d <= f.max) ?? FAIXAS_PARADOS[3]).rotulo;
}

/** Instrumentos não concluídos por tempo desde o último lançamento (evento ou ação). */
export function instrumentosParados(
  instrumentos: InstrumentoEquipamento[],
  indicadores: ResumoMonitoramento["indicadores_por_instrumento"],
  agora = Date.now(),
) {
  const ultima = new Map(
    indicadores.map((i) => [i.nr_convenio, i.ultima_atividade_em]),
  );
  const faixas = FAIXAS_PARADOS.map((f) => ({ ...f, quantidade: 0 }));
  let semAtividade = 0;
  for (const i of instrumentos) {
    const rotulo = faixaDeAtualizacao(
      i.fase_atual,
      ultima.get(i.nr_convenio),
      agora,
    );
    if (rotulo === null) continue;
    if (rotulo === ROTULO_SEM_LANCAMENTO) semAtividade += 1;
    else faixas.find((f) => f.rotulo === rotulo)!.quantidade += 1;
  }
  return { faixas, semAtividade };
}
