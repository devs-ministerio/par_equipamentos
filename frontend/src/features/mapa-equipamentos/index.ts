/** Ponto público de exportação da feature "mapa-equipamentos" (mapa
 * coroplético nacional por macrorregião + recorte real via Leaflet, ver
 * CLAUDE.md seção "Estrutura de pastas do frontend"). Consumidores fora da
 * feature (`src/pages/MapaPage.tsx`, `src/pages/PainelGeralPage.tsx`) devem
 * importar só a partir daqui, nunca direto de `components/` -- mantém a
 * feature livre pra reorganizar o interior sem quebrar quem consome. */
export { MacroMap } from './components/MacroMap';
export type { PontoEstabelecimento } from './components/MacroMap';
export { MacroMapReal } from './components/MacroMapReal';
