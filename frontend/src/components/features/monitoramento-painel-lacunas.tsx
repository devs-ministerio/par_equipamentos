import type { LacunaConclusao } from "@/services/monitoramento-resumo";
import { LinkDetalheInstrumento } from "./link-detalhe-instrumento";
import { PainelSecao } from "./monitoramento-painel-visuals";

const GRUPOS: Array<{
  tipo: LacunaConclusao["tipo"];
  titulo: string;
  explicacao: string;
}> = [
  {
    tipo: "concluido_sem_data_conclusao",
    titulo: "Concluído sem data de conclusão",
    explicacao: "Há conclusão registrada, mas sem a data em que ocorreu.",
  },
  {
    tipo: "concluido_sem_inauguracao_real",
    titulo: "Concluído sem inauguração confirmada",
    explicacao: "Não há data de inauguração realizada; pode haver só previsão.",
  },
  {
    tipo: "andamento_sem_previsao",
    titulo: "Em andamento sem previsão",
    explicacao: "Instrumento iniciado, sem previsão de inauguração registrada.",
  },
];

/** Lacunas de cadastro e evidência (D42): não são atraso nem divergência administrativa e nunca são preenchidas
 * por inferência; servem de fila de saneamento com acesso ao detalhe do instrumento. */
export function MonitoramentoPainelLacunas({
  lacunas,
}: {
  lacunas: LacunaConclusao[];
}) {
  return (
    <PainelSecao
      titulo="Lacunas de conclusão"
      apoio="Registros que precisam de data ou evidência. Não indicam atraso."
    >
      <div className="grid gap-6 md:grid-cols-3">
        {GRUPOS.map((grupo) => {
          const itens = lacunas.filter((item) => item.tipo === grupo.tipo);
          return (
            <section key={grupo.tipo} aria-label={grupo.titulo}>
              <h3 className="text-sm font-semibold">
                {grupo.titulo}{" "}
                <span className="tabular-nums text-muted-foreground">
                  ({itens.length})
                </span>
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {grupo.explicacao}
              </p>
              {itens.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Nenhum no recorte.
                </p>
              ) : (
                <ul className="mt-2 max-h-56 divide-y divide-border overflow-y-auto">
                  {itens.map((item) => (
                    <li
                      key={`${item.tipo}-${item.nr_convenio}`}
                      className="py-1.5"
                    >
                      <LinkDetalheInstrumento
                        nrConvenio={item.nr_convenio}
                        className="text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {item.nr_convenio}
                      </LinkDetalheInstrumento>
                      <span className="block text-xs text-muted-foreground">
                        {item.nome_convenente}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </PainelSecao>
  );
}
