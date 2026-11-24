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
import { useMemo } from "react";
import { usePropostasCandidatas } from "@/hooks/use-propostas-candidatas";
import { useMonitoramentoInstrumentos } from "@/hooks/useInstrumentosMonitorados";
import { usePropostasFiltros } from "@/hooks/use-propostas-filtros";
import { estagioDeFato, type EstagioProposta } from "@/lib/proposta-status";
import { PropostasFiltros } from "./propostas-filtros";
import { CardProposta } from "./proposta-card";
import { CardInstrumentoManual } from "./card-instrumento-manual";
import {
  candidatosConciliacao,
  instrumentosManuaisFinanciamento,
} from "@/lib/financiamento-manual";

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
  const manuais = useMemo(
    () =>
      modo === "confirmada"
        ? instrumentosManuaisFinanciamento(instrumentos, todas)
        : [],
    [instrumentos, todas, modo],
  );
  const f = usePropostasFiltros(propostas, manuais, modo);
  const { filtradas, manuaisFiltrados, gruposPorSituacao } = f;

  if (carregando) return <p className="text-muted-foreground">Carregando...</p>;

  if (propostas.length === 0 && manuais.length === 0) {
    return (
      <p className="py-5 text-sm italic text-muted-foreground">
        {modo === "tramitacao"
          ? "Nenhuma proposta ou solicitação no momento — o job de descoberta roda diariamente."
          : "Nenhuma parceria confirmada ainda."}
      </p>
    );
  }

  return (
    <div className="mt-4">
      <PropostasFiltros filtros={f} modo={modo} />

      {filtradas.length === 0 && manuaisFiltrados.length === 0 ? (
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
                candidatos={candidatosConciliacao(
                  instrumentos,
                  p.cnes,
                  p.cd_parceria ?? "",
                )}
              />
            ))}
          </div>
        ))
      )}
      {manuaisFiltrados.map((i) => (
        <CardInstrumentoManual key={i.id} i={i} />
      ))}
    </div>
  );
}
