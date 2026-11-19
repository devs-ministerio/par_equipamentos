/** Card "Licença de operação": fonte oficial da ANSN por estabelecimento (CNES). Só aparece quando o instrumento
 * tem item que exige licença. Sem vínculo confirmado não afirma licença nem vencimento. */
import { useLicencaOperacao } from "@/hooks/useLicencaOperacao";
import { fmtData } from "@/lib/monitoramento-format";
import { cn } from "@/lib/utils";
import type { LicencaVinculo } from "@/services/licenca-operacao";
import { SecaoOperacional } from "./monitoramento-ui";

function situacaoDoVinculo(v: LicencaVinculo): {
  texto: string;
  alerta: boolean;
} {
  if (v.situacao === "suspensa") return { texto: "Suspensa", alerta: true };
  if (v.situacao === "nao_consta")
    return { texto: "Não consta na última carga da ANSN", alerta: true };
  if (v.validade && v.dias !== null && v.dias < 0)
    return { texto: `Vencida em ${fmtData(v.validade)}`, alerta: true };
  if (v.validade)
    return {
      texto: `Válida até ${fmtData(v.validade)} (${v.dias} dias)`,
      alerta: v.dias !== null && v.dias < 90,
    };
  return { texto: "Válida", alerta: false };
}

export function LicencaOperacaoCard({
  numeroConvenio,
}: {
  numeroConvenio: string;
}) {
  const consulta = useLicencaOperacao(numeroConvenio);
  const licenca = consulta.data;
  if (!licenca?.exige) return null;

  return (
    <SecaoOperacional titulo="Licença de operação" cartao>
      {licenca.sem_cnes ? (
        <p className="m-0 text-[12.5px] text-muted-foreground">
          Sem CNES vinculado ao instrumento.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {licenca.vinculos.map((v) => {
            const s = situacaoDoVinculo(v);
            return (
              <li
                key={v.matricula}
                className="rounded-md bg-muted/40 px-3 py-2 text-[12.5px]"
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <strong>Matrícula {v.matricula}</strong>
                  {v.area && <span>{v.area}</span>}
                  <span
                    className={cn(
                      "font-semibold",
                      s.alerta ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {s.texto}
                  </span>
                </div>
                {v.designacao && (
                  <div className="text-muted-foreground">
                    {v.designacao}
                    {v.cidade ? ` · ${v.cidade}/${v.uf ?? ""}` : ""}
                  </div>
                )}
              </li>
            );
          })}
          {licenca.areas_sem_vinculo.map((area) => (
            <li
              key={area}
              className="rounded-md bg-muted/40 px-3 py-2 text-[12.5px] text-muted-foreground"
            >
              {area}: sem vínculo com a ANSN
            </li>
          ))}
        </ul>
      )}
    </SecaoOperacional>
  );
}
