/** Itens de navegação compartilhados entre MonitoramentoLayout e AppLayout
 * (achado 2026-09-15, pedido do usuário: "quero no topo os nav do
 * monitoramento" -- o mesmo menu de topo aparece em toda página, dos 2
 * lados). Centralizado aqui pra não duplicar o array. */
import type { HeaderNavItem } from "./app-header";

// Rota-mae do Monitoramento Interno (exata OU detalhe de instrumento).
export const EH_MONITORAMENTO_INTERNO = (pathname: string) =>
  pathname === "/monitoramento-equipamentos/instrumentos" ||
  pathname.startsWith("/monitoramento-equipamentos/instrumentos/");

export const NAV_ITEMS_MONITORAMENTO: HeaderNavItem[] = [
  {
    path: "/monitoramento-equipamentos",
    label: "Dados oficiais",
    isActive: (p) => p === "/monitoramento-equipamentos",
  },
  {
    path: "/monitoramento-equipamentos/instrumentos",
    label: "Monitoramento interno",
    isActive: EH_MONITORAMENTO_INTERNO,
  },
  { path: "/monitoramento-equipamentos/painel", label: "Painel de gestão" },
  // Relatório de Instrumentos e Repasse (Plan Mode relatorios 2026-09-25,
  // Bloco 6) -- separado do relatório de Análise de Mérito (que fica em
  // /relatorios, fora do Monitoramento Interno).
  { path: "/monitoramento-equipamentos/relatorios", label: "Relatórios" },
];

// "Análise de mérito" só entra na lista dentro do Monitoramento Interno
// (achado 2026-09-15, pedido anterior do usuário) -- nunca aparece em
// Dados oficiais/Painel de gestão, nem nas próprias páginas de Análise de
// mérito (self-link não faz sentido lá).
export const ITEM_ANALISE_MERITO: HeaderNavItem = {
  path: "/dashboard",
  label: "Análise de mérito",
};
