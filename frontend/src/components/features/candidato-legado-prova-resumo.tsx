import type { ProvaLegado } from "@/services/aprovacao-legado";

export function CandidatoLegadoProvaResumo({ prova }: { prova: ProvaLegado }) {
  return (
    <dl className="grid min-w-0 grid-cols-1 gap-3 text-sm sm:grid-cols-2 [&_dt]:text-xs [&_dt]:text-muted-foreground [&_dd]:break-words">
      <div className="sm:col-span-2">
        <dt>Convenente</dt>
        <dd>{prova.convenente_nome}</dd>
      </div>
      <div>
        <dt>Município / UF</dt>
        <dd>
          {prova.municipio} / {prova.uf}
        </dd>
      </div>
      <div>
        <dt>Situação na fonte</dt>
        <dd>{prova.situacao}</dd>
      </div>
      <div>
        <dt>Valor global</dt>
        <dd>
          {Number(prova.valor_global).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}
        </dd>
      </div>
      <div>
        <dt>Consulta oficial</dt>
        <dd>{new Date(prova.capturado_em).toLocaleString("pt-BR")}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt>Válida até</dt>
        <dd>{new Date(prova.expira_em).toLocaleString("pt-BR")}</dd>
      </div>
    </dl>
  );
}
