import { useMemo } from "react";
import { opcoesSituacao } from "@/lib/situacao-relatorio";
import {
  equipamentosFinanciados,
  mesclarOpcoes,
  opcoesSituacaoDaVisao,
} from "@/lib/recorte-relatorio";
import type { PropostaCandidata } from "@/services/propostas-candidatas";

type Opcao = { value: string; label: string };

/** Opções dos seletores que misturam instrumentos, monitoramento e propostas. */
export function useRelatorioOpcoes({
  propostas,
  situacaoInstrumentoOptions,
  faseMonitoramento,
  encerramento,
  programaOptions,
  equipamentoOptions,
  tipoContratacaoOptions,
}: {
  propostas: PropostaCandidata[];
  situacaoInstrumentoOptions: Opcao[];
  faseMonitoramento: Map<string, string>;
  encerramento: string | null;
  programaOptions: Opcao[];
  equipamentoOptions: Opcao[];
  tipoContratacaoOptions: Opcao[];
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

  const situacaoDaVisaoOptions = useMemo(
    () => opcoesSituacaoDaVisao(situacaoOptions, encerramento),
    [situacaoOptions, encerramento],
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

  // Os tipos das propostas (ex.: FAF, PRONON) também são opções, mesmo sem instrumento do tipo.
  const tipoOptions = useMemo(() => {
    const existentes = new Set(tipoContratacaoOptions.map((o) => o.value));
    const extras = [
      ...new Set(propostas.map((p) => p.tipo_contratacao)),
    ].filter((tipo) => !existentes.has(tipo));
    return [
      ...tipoContratacaoOptions,
      ...extras.map((value) => ({ value, label: value })),
    ];
  }, [tipoContratacaoOptions, propostas]);

  return {
    situacaoDaVisaoOptions,
    programaTodasOptions,
    equipamentoTodasOptions,
    tipoOptions,
  };
}
