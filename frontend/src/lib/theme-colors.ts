/**
 * Le o valor resolvido de uma variavel CSS do tema (ex. '--destructive') em
 * runtime -- para uso em bibliotecas que desenham imperativamente (D3
 * `.attr()`, Leaflet `style`/`fillColor`) e por isso nao podem receber
 * `className`. Cor continua vindo so de index.css; isso so evita hex cru
 * espalhado pelo JS de MacroMap.tsx/MacroMapReal.tsx (ver CLAUDE.md, secao
 * "Migração de arquitetura do frontend").
 *
 * Chamar 1x por render (fora de loop `.data().enter()`) e reusar o valor --
 * chamar getComputedStyle em cada elemento de uma selecao D3 gera layout
 * thrashing sem necessidade, o valor da variavel e o mesmo pra todos.
 */
export function resolveThemeColor(cssVarName: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(cssVarName)
    .trim();
}

/** Conveniencia: resolve de uma vez as cores mais usadas por
 * MacroMap.tsx/MacroMapReal.tsx, pra nao espalhar strings '--nome-var'
 * cruas pelos componentes de mapa. */
export function getMapThemeColors() {
  return {
    primary: resolveThemeColor("--primary"),
    foreground: resolveThemeColor("--foreground"),
    background: resolveThemeColor("--background"),
    muted: resolveThemeColor("--muted"),
    mutedForeground: resolveThemeColor("--muted-foreground"),
    destructive: resolveThemeColor("--destructive"),
    destructiveBg: resolveThemeColor("--destructive-bg"),
    success: resolveThemeColor("--success"),
    successBg: resolveThemeColor("--success-bg"),
  };
}
