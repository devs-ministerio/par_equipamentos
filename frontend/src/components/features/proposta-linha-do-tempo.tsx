import { construirTimelineProposta } from "@/lib/proposta-metas-resumo";
import { LinhaDoTempoEventos } from "./linha-do-tempo-eventos";

/** Linha do tempo da proposta -- resumo rápido da trajetória (todas as
 * etapas que ela já passou, em ordem cronológica) antes de entrar nos
 * detalhes seção a seção (`DetalheBrutoProposta`). Horizontal, colunas de
 * largura fixa + conector esticando pra preencher o espaço quando sobra;
 * `overflow-x-auto` só entra em cena se a soma ultrapassar a largura do
 * card (muitas etapas ou tela estreita) -- mesmo padrão de "conteúdo largo
 * rola no próprio contêiner" usado nas tabelas de item. */
export function LinhaDoTempoProposta({
  metasResumo,
  dataProposta,
}: {
  metasResumo: unknown;
  dataProposta: string | null;
}) {
  const eventos = construirTimelineProposta(metasResumo, dataProposta);
  return (
    <LinhaDoTempoEventos
      titulo="Linha do tempo da proposta"
      eventos={eventos}
    />
  );
}
