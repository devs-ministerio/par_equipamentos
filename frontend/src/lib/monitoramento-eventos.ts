import type { EventoMarco } from "@/services/monitoramento-instrumentos";

/** Mesma seleção do backend: criação e depois ID numérico. Datas previstas
 * ou de ocorrência não determinam qual registro substituiu outro.
 * Recebe os eventos ativos da timeline; não altera nem reordena a entrada. */
export function eventoMaisRecente(
  eventos: readonly EventoMarco[],
): EventoMarco | null {
  return eventos.reduce<EventoMarco | null>(
    (atual, evento) =>
      !atual ||
      evento.created_at > atual.created_at ||
      (evento.created_at === atual.created_at && evento.id > atual.id)
        ? evento
        : atual,
    null,
  );
}
