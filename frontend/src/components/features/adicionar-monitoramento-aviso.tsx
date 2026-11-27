import { fmtMoeda } from "@/lib/monitoramento-format";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";

export type Candidato = Pick<
  InstrumentoEquipamento,
  | "nr_convenio"
  | "nome_convenente"
  | "tipo_contratacao"
  | "investimento_aquisicao"
>;

/** Aviso, sem bloqueio: o mesmo CNES já tem instrumento monitorado. Só
 * documento ou identificador oficial confirma que é o mesmo financiamento. */
export function AvisoCandidatos({ candidatos }: { candidatos: Candidato[] }) {
  if (candidatos.length === 0) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs"
    >
      <p className="m-0 font-semibold">
        Já existe monitoramento neste CNES. Pode ser o mesmo financiamento.
      </p>
      <ul className="mb-0 mt-1.5 list-none space-y-0.5 p-0">
        {candidatos.map((c) => (
          <li key={c.nr_convenio}>
            <span className="font-mono">{c.nr_convenio}</span>
            {c.tipo_contratacao ? ` · ${c.tipo_contratacao}` : ""} ·{" "}
            {c.nome_convenente} · {fmtMoeda(c.investimento_aquisicao)}
          </li>
        ))}
      </ul>
      <p className="mb-0 mt-1.5 text-muted-foreground">
        CNES e valor não bastam para concluir. Confirme por documento oficial
        antes de incluir.
      </p>
    </div>
  );
}
