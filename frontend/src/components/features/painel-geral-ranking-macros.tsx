import { useState } from 'react';
import { colors } from '@/styles/tokens';
import type { MacroRankItem } from '@/hooks/usePainelGeralResumos';

/**
 * Ranking (leaderboard) das 5 macros mais Hipo ou mais Hiper, com toggle
 * entre as duas visoes (2026-08-22). A barra NAO usa uma escala fixa
 * compartilhada entre os dois modos -- hipo vai de 0 a 100% (por definicao,
 * abaixo da meta), hiper passa de 500% em alguns casos (ex.: Centro-Norte/GO
 * a 570%). Numa escala unica os dois extremos ficariam ilegiveis (hipo
 * viraria barrinhas minusculas). Em vez disso cada visao escala em relacao
 * ao PROPRIO maior valor exibido (o #1 sempre enche a linha inteira) --
 * padrao comum de leaderboard, mostra ranking relativo, nao magnitude
 * absoluta entre os dois modos.
 *
 * Bug real corrigido 2026-08-22: no modo Hipo a barra usava a cobertura em
 * si (`item.cobertura / maior`) -- como o pior caso (#1) e o de MENOR
 * cobertura, ele tinha a barra mais CURTA da lista (ex.: OESTE-AM #1 a 17%
 * com barra minuscula, NORDESTE #5 a 89% quase cheia), o oposto do que
 * "barra mais longa" deveria comunicar num ranking de piores casos. Agora o
 * modo Hipo escala pela GRAVIDADE (100 - cobertura, "quao longe da meta"),
 * entao o #1 sempre fica com a barra mais cheia, do jeito que o olho espera.
 * O modo Hiper nao tinha esse problema (maior cobertura = mais barra = mais
 * folga, direcao ja intuitiva) e continua igual.
 */
export function PainelGeralRankingMacros({ hipo, hiper }: { hipo: MacroRankItem[]; hiper: MacroRankItem[] }) {
  const [modo, setModo] = useState<'hipo' | 'hiper'>('hipo');
  const itens = modo === 'hipo' ? hipo : hiper;
  const cor = modo === 'hipo' ? colors.hipoRed : colors.hiperGreen;
  const valorBarra = (item: MacroRankItem) => (modo === 'hipo' ? Math.max(0, 100 - item.cobertura) : item.cobertura);
  // Hipo usa escala ABSOLUTA (0-100, o proprio valor de severidade vira a
  // largura direto) -- diferente do Hiper, que so faz sentido relativo ao
  // maior dos 5 exibidos (bug real corrigido 2026-08-22: OESTE a 17% tinha
  // severidade 83%, mas a barra aparecia 100% cheia porque escalava em
  // relacao a si mesmo, sendo o #1; 83% de severidade agora rende
  // literalmente 83% de barra). Hiper continua relativo porque nao tem teto
  // natural (chega a 570%) -- uma escala absoluta ali faria a maioria das
  // barras saturar no maximo e perder a diferenca entre os 5.
  const maiorValor = modo === 'hipo' ? 100 : Math.max(...itens.map(valorBarra), 1);

  if (hipo.length === 0 && hiper.length === 0) return null;

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button
          onClick={() => setModo('hipo')}
          disabled={hipo.length === 0}
          style={{
            padding: '4px 11px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 700,
            cursor: hipo.length === 0 ? 'default' : 'pointer',
            border: `1.5px solid ${modo === 'hipo' ? colors.hipoRed : colors.border}`,
            background: modo === 'hipo' ? colors.hipoRedBg : '#fff',
            color: hipo.length === 0 ? colors.subtleText : modo === 'hipo' ? colors.hipoRed : '#475066',
            opacity: hipo.length === 0 ? 0.5 : 1,
          }}
        >
          ▾ 5 mais Hipo
        </button>
        <button
          onClick={() => setModo('hiper')}
          disabled={hiper.length === 0}
          style={{
            padding: '4px 11px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 700,
            cursor: hiper.length === 0 ? 'default' : 'pointer',
            border: `1.5px solid ${modo === 'hiper' ? colors.hiperGreen : colors.border}`,
            background: modo === 'hiper' ? colors.hiperGreenBg : '#fff',
            color: hiper.length === 0 ? colors.subtleText : modo === 'hiper' ? colors.hiperGreen : '#475066',
            opacity: hiper.length === 0 ? 0.5 : 1,
          }}
        >
          ▴ 5 mais Hiper
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {itens.map((item, i) => (
          <div key={item.macroId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#f4f6fb',
                color: colors.subtleText,
                fontSize: 9.5,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {i + 1}
            </span>
            <span
              style={{
                fontSize: 11.5,
                color: '#475066',
                width: 178,
                flexShrink: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={`${item.nome} (${item.uf})`}
            >
              {item.nome} ({item.uf})
            </span>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#eef0f4', overflow: 'clip' }}>
              <div style={{ height: '100%', width: `${(valorBarra(item) / maiorValor) * 100}%`, background: cor }} />
            </div>
            <span
              style={{ width: 36, textAlign: 'right', fontSize: 11.5, fontWeight: 700, color: cor, flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              {item.cobertura.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
