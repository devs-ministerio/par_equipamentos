import { colors } from '@/styles/tokens';
import type { NaturezaJuridicaBreakdown } from '@/services/api';

/** Rotulo/cor por natureza juridica -- "Privado" nao e cor de alerta (nao e
 * necessariamente ruim, so um risco a acompanhar: capacidade SUS via
 * contrato, nao infraestrutura propria), por isso laranja e nao vermelho. */
const NATUREZA_LABEL: Record<string, string> = {
  PUBLICO: 'Público',
  'SEM FINS LUCRATIVOS': 'Sem fins lucrativos',
  PRIVADO: 'Privado',
  NAO_INFORMADO: 'Não informado',
};
const NATUREZA_COR: Record<string, string> = {
  PUBLICO: colors.primary,
  'SEM FINS LUCRATIVOS': colors.hiperGreen,
  PRIVADO: colors.logoOrange,
  NAO_INFORMADO: colors.subtleText,
};
const NATUREZA_ORDEM = ['PUBLICO', 'SEM FINS LUCRATIVOS', 'PRIVADO', 'NAO_INFORMADO'];

/** Barra empilhada Público/Sem fins lucrativos/Privado/Não informado, por
 * quantidade SUS (availableQty) -- "quanto da capacidade SUS depende de
 * contrato com privado" e um risco que hoje nao aparecia em lugar nenhum. */
export function PainelGeralBarraNaturezaJuridica({ dados }: { dados: NaturezaJuridicaBreakdown[] }) {
  const total = dados.reduce((s, d) => s + d.availableQty, 0);
  if (total === 0) return <div style={{ fontSize: 12, color: colors.subtleText }}>Sem dado SUS nessa competência.</div>;

  const ordenados = [...dados]
    .filter((d) => d.availableQty > 0)
    .sort((a, b) => NATUREZA_ORDEM.indexOf(a.naturezaJuridica) - NATUREZA_ORDEM.indexOf(b.naturezaJuridica));

  return (
    <div>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'clip' }}>
        {ordenados.map((d) => (
          <div
            key={d.naturezaJuridica}
            title={`${NATUREZA_LABEL[d.naturezaJuridica] ?? d.naturezaJuridica}: ${d.availableQty}`}
            style={{
              width: `${(d.availableQty / total) * 100}%`,
              background: NATUREZA_COR[d.naturezaJuridica] ?? colors.subtleText,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 8 }}>
        {ordenados.map((d) => (
          <div key={d.naturezaJuridica} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: NATUREZA_COR[d.naturezaJuridica] ?? colors.subtleText,
                display: 'inline-block',
              }}
            />
            <span style={{ color: '#475066' }}>
              {NATUREZA_LABEL[d.naturezaJuridica] ?? d.naturezaJuridica} · {Math.round((d.availableQty / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
