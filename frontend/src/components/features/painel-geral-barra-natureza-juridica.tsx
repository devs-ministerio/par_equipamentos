import type { NaturezaJuridicaBreakdown } from '@/services/api';

/** Rotulo/classe de cor por natureza juridica -- "Privado" nao e cor de
 * alerta (nao e necessariamente ruim, so um risco a acompanhar: capacidade
 * SUS via contrato, nao infraestrutura propria), por isso laranja (warning)
 * e nao vermelho (destructive). */
const NATUREZA_LABEL: Record<string, string> = {
  PUBLICO: 'Público',
  'SEM FINS LUCRATIVOS': 'Sem fins lucrativos',
  PRIVADO: 'Privado',
  NAO_INFORMADO: 'Não informado',
};
const NATUREZA_BG: Record<string, string> = {
  PUBLICO: 'bg-primary',
  'SEM FINS LUCRATIVOS': 'bg-success',
  PRIVADO: 'bg-warning',
  NAO_INFORMADO: 'bg-muted-foreground/70',
};
const NATUREZA_ORDEM = ['PUBLICO', 'SEM FINS LUCRATIVOS', 'PRIVADO', 'NAO_INFORMADO'];

/** Barra empilhada Público/Sem fins lucrativos/Privado/Não informado, por
 * quantidade SUS (availableQty) -- "quanto da capacidade SUS depende de
 * contrato com privado" e um risco que hoje nao aparecia em lugar nenhum. */
export function PainelGeralBarraNaturezaJuridica({ dados }: { dados: NaturezaJuridicaBreakdown[] }) {
  const total = dados.reduce((s, d) => s + d.availableQty, 0);
  if (total === 0) return <div className="text-xs text-muted-foreground/70">Sem dado SUS nessa competência.</div>;

  const ordenados = [...dados]
    .filter((d) => d.availableQty > 0)
    .sort((a, b) => NATUREZA_ORDEM.indexOf(a.naturezaJuridica) - NATUREZA_ORDEM.indexOf(b.naturezaJuridica));

  return (
    <div>
      <div className="flex h-[10px] overflow-clip rounded-[5px]">
        {ordenados.map((d) => (
          <div
            key={d.naturezaJuridica}
            title={`${NATUREZA_LABEL[d.naturezaJuridica] ?? d.naturezaJuridica}: ${d.availableQty}`}
            className={NATUREZA_BG[d.naturezaJuridica] ?? 'bg-muted-foreground/70'}
            style={{ width: `${(d.availableQty / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {ordenados.map((d) => (
          <div key={d.naturezaJuridica} className="flex items-center gap-[5px] text-[11px]">
            <span className={`inline-block h-2 w-2 rounded-sm ${NATUREZA_BG[d.naturezaJuridica] ?? 'bg-muted-foreground/70'}`} />
            <span className="text-muted-foreground">
              {NATUREZA_LABEL[d.naturezaJuridica] ?? d.naturezaJuridica} · {Math.round((d.availableQty / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
