/** Design tokens do handoff (docs/design, README do protótipo .dc.html).
 * Paleta do protótipo anexado pelo usuário (2026-09-11, mensagem "Aplique
 * estas cores do protótipo ao tema do projeto"): fundo levemente aquecido,
 * accent verde-petróleo, alerta terracota. Espelhado em src/index.css --
 * mudar aqui exige mudar lá também. hiperGreen/hipoRed continuam status
 * (sem mudança) -- accent é marca, não semáforo. */
export const colors = {
  primary: "#2D6A5C",
  primaryLight: "#E1EAE7",
  primaryDark: "#1C1A16",
  hiperGreen: "#2F6A1D",
  hiperGreenBg: "#eaf3e0",
  // usado so no preenchimento da barrinha de cobertura -- mais claro que
  // hiperGreen/hipoRed (texto/badge) pra listra central de referencia (o
  // coeficiente 1) aparecer por cima sem se perder na cor solida.
  hiperGreenBarra: "#8FCB6E",
  hipoRedBarra: "#EF9A9A",
  hipoRed: "#B40D0D",
  hipoRedBg: "#fde8e8",
  border: "#E4DFD3",
  surface: "#F6F4EF",
  card: "#fff",
  mutedText: "#6B6459",
  subtleText: "#9A9284",
  // Cor de alerta ("Alerta → #a35a12 sobre #f6e6d2") -- usada em prazo/
  // pendência do monitoramento interno (⚠️ ConvenioCard/MonitoramentoInterno/
  // MonitoramentoOverviewPage). Nome do token (logoOrange) ficou do handoff
  // original em laranja; mantido por não valer o custo de renomear todo
  // call site agora, só o valor mudou.
  logoOrange: "#A35A12",
  logoOrangeBg: "#F6E6D2",
  // Paleta de dados do Painel de Gestão, espelhada em index.css.
  painelChartTeal: "#2D6A5C",
  painelChartBlue: "#426B92",
  painelChartOchre: "#A36B2C",
  painelChartPlum: "#795C78",
  painelChartOlive: "#637B43",
  painelChartSlate: "#667385",
  topbarBg: "#F6F4EF",
  topbarBorder: "#E4DFD3",
} as const;

export const layout = {
  pagePadding: "24px",
  maxWidth: "1400px",
  cardGap: "16px",
} as const;
