import type { LinhaCarteira } from "@/services/painel-tecnico";
import type { ResumoMonitoramento } from "@/services/monitoramento-resumo";
import { entrouNoRadarRecente, faseDaLinha } from "@/lib/painel-tecnico-filtro";

/** Contagens e recortes do Meu painel a partir da carteira e dos filtros dos gráficos. */
export function derivarMeuPainel(
  linhas: LinhaCarteira[],
  equipamentosResumo: ResumoMonitoramento["equipamentos_por_instrumento"],
  faseSel: string | undefined,
  familiaSel: string | undefined,
) {
  const faltam = linhas.filter((l) => !l.monitorado);
  const faltamAbertos = faltam.filter((l) => l.em_aberto).length;
  const concluidos = linhas.filter(
    (l) => l.monitorado && l.fase === "Concluído",
  ).length;
  const novosRadar = linhas.filter(entrouNoRadarRecente);
  const valorRadar = novosRadar.reduce((t, l) => t + (l.valor_global ?? 0), 0);
  const pendentes = linhas.reduce((t, l) => t + l.acoes_abertas, 0);
  const numerosMonitorados = new Set(
    linhas.filter((l) => l.monitorado).map((l) => l.numero),
  );
  const numerosDaFamilia = (familia: string) =>
    new Set(
      equipamentosResumo
        .filter((e) => e.familia === familia && e.planejado > 0)
        .map((e) => e.nr_convenio),
    );
  const numerosFamiliaSel = familiaSel ? numerosDaFamilia(familiaSel) : null;
  const linhasSituacao = numerosFamiliaSel
    ? linhas.filter((l) => l.monitorado && numerosFamiliaSel.has(l.numero))
    : linhas;
  const linhasDaFase = faseSel
    ? linhas.filter((l) => faseDaLinha(l) === faseSel)
    : linhas;
  const numerosEquipamentos = new Set(
    linhasDaFase.filter((l) => l.monitorado).map((l) => l.numero),
  );
  const linhasCarteira = linhasDaFase.filter(
    (l) => !numerosFamiliaSel || numerosFamiliaSel.has(l.numero),
  );
  const atrasadas = linhas.reduce((t, l) => t + l.acoes_atrasadas, 0);
  return {
    faltam,
    faltamAbertos,
    concluidos,
    novosRadar,
    valorRadar,
    pendentes,
    atrasadas,
    numerosMonitorados,
    numerosEquipamentos,
    linhasSituacao,
    linhasCarteira,
  };
}
