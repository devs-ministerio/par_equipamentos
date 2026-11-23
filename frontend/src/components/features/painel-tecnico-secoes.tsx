import { Link } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PainelSecao } from "@/components/features/monitoramento-painel-visuals";
import { fmtMoeda } from "@/lib/monitoramento-format";
import type { PainelTecnico } from "@/services/painel-tecnico";

function Barra({
  rotulo,
  valor,
  total,
}: {
  rotulo: string;
  valor: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((100 * valor) / total) : 0;
  return (
    <div className="grid grid-cols-[9rem_1fr_6rem] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{rotulo}</span>
      <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-right tabular-nums">
        {valor} <span className="text-muted-foreground">({pct}%)</span>
      </span>
    </div>
  );
}

export function SecaoCarteira({ dados }: { dados: PainelTecnico }) {
  const c = dados.carteira;
  return (
    <PainelSecao
      titulo="Carteira da região"
      apoio={`${c.monitorados} de ${c.elegiveis} elegíveis no monitoramento`}
    >
      <Barra rotulo="Cobertura" valor={c.monitorados} total={c.elegiveis} />
      <p className="mt-3 mb-4 text-sm text-muted-foreground">
        Faltam {c.faltam_em_aberto} em aberto (
        {fmtMoeda(c.valor_faltam_em_aberto)}) e {c.faltam_concluidos} com
        prestação concluída ({fmtMoeda(c.valor_faltam_concluidos)}).
      </p>
      {dados.faltantes.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Convênio</TableHead>
              <TableHead>UF</TableHead>
              <TableHead>Município</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Valor global</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dados.faltantes.slice(0, 15).map((f) => (
              <TableRow key={f.numero}>
                <TableCell className="font-medium">{f.numero}</TableCell>
                <TableCell>{f.uf}</TableCell>
                <TableCell>{f.municipio}</TableCell>
                <TableCell>{f.situacao}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtMoeda(f.valor_global)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </PainelSecao>
  );
}

export function SecaoRegistro({ dados }: { dados: PainelTecnico }) {
  const m = dados.meus;
  return (
    <PainelSecao
      titulo="Instrumentos sob responsabilidade"
      apoio={`${m.instrumentos} como titular ou suplente`}
    >
      <div className="space-y-2.5">
        <Barra
          rotulo="Com registro"
          valor={m.com_registro}
          total={m.instrumentos}
        />
        <Barra
          rotulo="Concluídos"
          valor={m.concluidos}
          total={m.instrumentos}
        />
        <Barra
          rotulo="Com entrega"
          valor={m.com_entrega}
          total={m.instrumentos}
        />
        <Barra
          rotulo="Com repasse"
          valor={m.com_repasse}
          total={m.instrumentos}
        />
      </div>
      {dados.regiao_sem_titular > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          {dados.regiao_sem_titular} instrumentos da região estão sem técnico
          titular.
        </p>
      )}
    </PainelSecao>
  );
}

export function SecaoAtividade({ dados }: { dados: PainelTecnico }) {
  const a = dados.atividade;
  const maximo = Math.max(1, ...a.por_semana.map((s) => s.lancamentos));
  return (
    <PainelSecao
      titulo="Lançamentos por semana"
      apoio={`${a.lancamentos_total} no total · ${a.instrumentos_tocados} instrumentos`}
    >
      {a.por_semana.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum lançamento nas últimas 8 semanas.
        </p>
      ) : (
        <div className="space-y-1.5">
          {a.por_semana.map((s) => (
            <div
              key={s.semana}
              className="grid grid-cols-[6rem_1fr_3rem] items-center gap-3 text-sm"
            >
              <span className="text-muted-foreground">
                {s.semana.split("-").reverse().slice(0, 2).join("/")}
              </span>
              <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(100 * s.lancamentos) / maximo}%` }}
                />
              </div>
              <span className="text-right tabular-nums">{s.lancamentos}</span>
            </div>
          ))}
        </div>
      )}
    </PainelSecao>
  );
}

export function SecaoSemRegistro({ dados }: { dados: PainelTecnico }) {
  if (dados.meus_sem_registro.length === 0) return null;
  return (
    <PainelSecao
      titulo="Sem nenhum registro"
      apoio={`${dados.meus.sem_registro} instrumentos`}
    >
      <ul className="m-0 grid list-none gap-1.5 p-0 text-sm sm:grid-cols-2">
        {dados.meus_sem_registro.map((i) => (
          <li key={i.nr_convenio}>
            <Link
              className="text-primary hover:underline"
              to={`/monitoramento-equipamentos/instrumentos/${encodeURIComponent(i.nr_convenio)}`}
            >
              {i.nr_convenio}
            </Link>{" "}
            <span className="text-muted-foreground">
              {[i.municipio, i.uf].filter(Boolean).join(" / ")}
            </span>
          </li>
        ))}
      </ul>
    </PainelSecao>
  );
}
