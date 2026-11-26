import { useMemo } from "react";
import { opcoesSituacao } from "@/lib/situacao-relatorio";
import {
  equipamentosFinanciados,
  mesclarOpcoes,
} from "@/lib/recorte-relatorio";
import type { PropostaCandidata } from "@/services/propostas-candidatas";

type Opcao = { value: string; label: string };

/** Opções dos seletores que misturam instrumentos, monitoramento e propostas. */
export function useRelatorioOpcoes({
  propostas,
  situacaoInstrumentoOptions,
  faseMonitoramento,
  programaOptions,
  equipamentoOptions,
}: {
  propostas: PropostaCandidata[];
  situacaoInstrumentoOptions: Opcao[];
  faseMonitoramento: Map<string, string>;
  programaOptions: Opcao[];
  equipamentoOptions: Opcao[];
}) {
  const situacaoOptions = useMemo(
    () =>
      opcoesSituacao({
        instrumento: situacaoInstrumentoOptions.map((o) => o.value),
        monitoramento: [...new Set(faseMonitoramento.values())],
        proposta: propostas
          .map((p) => p.situacao_proposta)
          .filter((v): v is string => Boolean(v)),
      }),
    [situacaoInstrumentoOptions, faseMonitoramento, propostas],
  );

  // Programas e equipamentos que só existem nas propostas também entram nas opções (D04).
  const programaTodasOptions = useMemo(
    () =>
      mesclarOpcoes(
        programaOptions,
        propostas.map((p) => p.nm_programa),
      ),
    [programaOptions, propostas],
  );
  const equipamentoTodasOptions = useMemo(
    () =>
      mesclarOpcoes(
        equipamentoOptions,
        propostas.flatMap(equipamentosFinanciados),
      ),
    [equipamentoOptions, propostas],
  );

  return {
    situacaoOptions,
    programaTodasOptions,
    equipamentoTodasOptions,
  };
}
