import type {
  DivergenciaConclusao,
  InauguracaoResumo,
  LicencaVencendoResumo,
} from "@/services/monitoramento-resumo";
import { AgendaExecutiva } from "./monitoramento-painel-agenda";
import { DivergenciasConclusao } from "./monitoramento-painel-divergencias";
import { MonitoramentoPainelVigencias } from "./monitoramento-painel-vigencias";
import { PainelCartao } from "./painel-gestao-cartao";

interface Props {
  vigencias: Array<{
    nr_convenio: string;
    nome_convenente: string;
    data_final: string;
    dias: number;
  }>;
  licencas: LicencaVencendoResumo[];
  inauguracoes: InauguracaoResumo[];
  divergencias: DivergenciaConclusao[];
}

/** Vigência contratual, agenda de prazos e divergências de conclusão. */
export function MonitoramentoPainelPrazos({
  vigencias,
  licencas,
  inauguracoes,
  divergencias,
}: Props) {
  const divergenciasPorFonte = [
    ...divergencias
      .reduce((contagem, item) => {
        contagem.set(
          item.fonte_externa,
          (contagem.get(item.fonte_externa) ?? 0) + 1,
        );
        return contagem;
      }, new Map<string, number>())
      .entries(),
  ]
    .map(([fonte, quantidade]) => `${fonte}: ${quantidade}`)
    .join(" · ");
  return (
    <>
      <MonitoramentoPainelVigencias vigencias={vigencias} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <PainelCartao
          titulo="Agenda de prazos"
          apoio="Licenças e inaugurações por proximidade"
        >
          <AgendaExecutiva inauguracoes={inauguracoes} licencas={licencas} />
        </PainelCartao>
        <PainelCartao
          titulo="Divergências de conclusão"
          apoio={
            divergenciasPorFonte || `${divergencias.length} casos no recorte`
          }
        >
          <DivergenciasConclusao itens={divergencias} />
        </PainelCartao>
      </div>
    </>
  );
}
