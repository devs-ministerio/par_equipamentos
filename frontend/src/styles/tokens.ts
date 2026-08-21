/** Design tokens do handoff (docs/design, README do protótipo .dc.html). */
export const colors = {
  primary: '#1a3a9c',
  primaryLight: '#dfe6f7',
  primaryDark: '#16213e',
  hiperGreen: '#2F6A1D',
  hiperGreenBg: '#eaf3e0',
  hipoRed: '#B40D0D',
  hipoRedBg: '#fde8e8',
  border: '#dde2ea',
  surface: '#f4f6fb',
  card: '#fff',
  mutedText: '#667085',
  subtleText: '#98a0b3',
  logoOrange: '#f5a623',
  topbarBg: '#eef1f5',
  topbarBorder: '#dde2ea',
} as const;

export const layout = {
  pagePadding: '24px',
  maxWidth: '1400px',
  cardRadius: '8px',
  chipRadius: '20px',
  cardGap: '16px',
} as const;
