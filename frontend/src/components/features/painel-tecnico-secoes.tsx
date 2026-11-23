import { PainelSecao } from "@/components/features/monitoramento-painel-visuals";
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
