import type { Regiao } from '../types/domain';

export const REGIOES: Regiao[] = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];

// Geometria das 121 macrorregioes de saude, vendorizada localmente em
// public/geo/macrorregioes.geojson (resolve o TODO antigo de depender de
// CDN de terceiro sem fallback -- ver comentario em MacroMap.tsx). Gerada a
// partir de docs/macroregiao.geojson (fonte fornecida pelo usuario,
// 2026-08-22) com:
//
//   mapshaper docs/macroregiao.geojson \
//     -simplify 15% visvalingam keep-shapes \
//     -o precision=0.0001 format=geojson reverse-winding \
//     frontend/public/geo/macrorregioes.geojson
//
// caindo de 1,37 MB pra ~220 KB (~84%). O `reverse-winding` NAO E OPCIONAL:
// sem ele o mapa renderiza como um retangulo solido cobrindo a tela inteira
// (bug real, 2026-08-22) -- o `-simplify` do mapshaper inverte o sentido de
// rotacao dos aneis (CCW -> CW), e d3-geo (BrazilMap/MacroMap.tsx) exige
// winding RFC 7946 (anel externo CCW) pra decidir o que e "dentro" do
// poligono na projecao esferica; com o sentido invertido ele desenha o
// COMPLEMENTO de cada macro (quase o mapa inteiro) em vez da macro em si.
// Fica em public/ (nao importada como modulo) pra so ser baixada quando uma
// pagina com mapa (`/` ou `/mapa`) realmente monta, em vez de inflar o
// bundle JS principal carregado em toda pagina.
export const GEOJSON_MACRORREGIOES_URL = '/geo/macrorregioes.geojson';

export interface EquipamentoOption {
  familia: string;
  /** Nome especifico da familia -- usado SO no SeletorEquipamento (TopNav),
   * onde o usuario precisa saber qual familia esta escolhendo. Em todo o
   * resto da UI/exports usa-se o termo generico "equipamento(s)" (decisao
   * 2026-08-22: normalizar assim em vez de flexionar nome por familia --
   * mais simples de manter e evita concordancia errada quando uma familia
   * nova entrar, ex.: "Aceleradores Lineares", "Ultrassons"). */
  rotulo: string;
  /** Habitantes SUS-dependentes por equipamento (RN da Metodologia) -- 100 mil
   * pra TOMOGRAFO, ~166.667 pra RESSONANCIA (5.000 exames/ano ÷ 30
   * exames/1.000 hab.). Alimenta o coeficiente/barra exibido nas tabelas de
   * cobertura e no Mapa (utils/coeficiente.ts) -- MESMO numero que o backend
   * usa pra calcular required_qty/deficit_status (scripts/run_pipeline_*.py,
   * PRODUTIVIDADE), pra o front nunca reclassificar Hipo/Hiper diferente do
   * que o servidor ja decidiu. Bug real corrigido 2026-08-21: o front tinha 4
   * copias inline desse calculo (CoberturaTable, NivelCoberturaTable,
   * SubNivelRows, MunicipioDetalheModal, MapaPage) todas com 100_000 fixo --
   * pra RESSONANCIA o coeficiente/barra/cor mostrados divergiam do status
   * (StatusBadge) que já vinha certo do backend. */
  produtividade: number;
  /** false enquanto essa familia nao tiver pipeline/dado real (ver
   * docs/design/decan-equipamentos-contexto.md -- escopo maior do projeto:
   * acelerador linear, tomografo, PET-CT, ultrassom, mamografo, ressonancia).
   * TOMOGRAFO (Fase 1) e RESSONANCIA (2026-08-21) tem pipeline hoje. */
  disponivel: boolean;
}

export const EQUIPAMENTOS: EquipamentoOption[] = [
  { familia: 'TOMOGRAFO', rotulo: 'Tomógrafo', produtividade: 100_000, disponivel: true },
  { familia: 'RESSONANCIA', rotulo: 'Ressonância Magnética', produtividade: 5_000 / (30 / 1_000), disponivel: true },
  // 1 PET-CT por 1,5 milhao de habitantes SUS-dependentes (Portaria de
  // Consolidacao GM/MS n. 1/2017, art. 102-106). Pipeline real 2026-08-28
  // (backend/scripts/run_pipeline_pet_ct.py) -- a mesma portaria tambem fixa
  // criterio de acesso ao radiofarmaco (FDG, meia-vida 110min) em ate 2h,
  // ver MunicipioDetalheModal/distance_km_nearest_radiopharma (informativo,
  // nao entra nesse coeficiente).
  { familia: 'PET_CT', rotulo: 'PET-CT', produtividade: 1_500_000, disponivel: true },
  { familia: 'ACELERADOR_LINEAR', rotulo: 'Acelerador Linear', produtividade: 100_000, disponivel: false },
  { familia: 'ULTRASSOM', rotulo: 'Ultrassom', produtividade: 100_000, disponivel: false },
  { familia: 'MAMOGRAFO', rotulo: 'Mamógrafo', produtividade: 100_000, disponivel: false },
];

/** Metadado da familia pedida, com fallback pra TOMOGRAFO se a familia nao
 * for reconhecida (mesmo fallback que FamiliaEquipamentoContext usa) --
 * nunca deixa a tela sem produtividade por um valor de familia inesperado. */
export function getEquipamento(familia: string): EquipamentoOption {
  return EQUIPAMENTOS.find((eq) => eq.familia === familia) ?? EQUIPAMENTOS[0];
}

/** "3 equipamentos SUS" / "1 equipamento SUS" -- termo generico (ver
 * EquipamentoOption.rotulo), so a concordancia singular/plural regular muda. */
export function formatarQuantidadeEquipamento(qtd: number): string {
  return `${qtd} equipamento${qtd === 1 ? '' : 's'}`;
}
