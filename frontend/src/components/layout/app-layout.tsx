import { Outlet, useLocation } from "react-router-dom";
import { FamiliaEquipamentoProvider } from "../../context/familia-equipamento-context";
import { CONTAINER_CLASS } from "@/lib/layout";
import { AppHeader } from "./app-header";
import { AppFooter } from "./app-footer";
import { SeletorEquipamento } from "./top-nav";
import { NAV_ITEMS_MONITORAMENTO } from "./monitoramento-nav-items";

/** Nav do topo igual à do Monitoramento (achado 2026-09-15, pedido do
 * usuário: "quero no topo os nav do monitoramento") -- mesmo array
 * (Dados oficiais/Monitoramento interno/Painel de gestão), sem
 * "Análise de mérito" (self-link não faz sentido já estando aqui). A
 * navegação ENTRE as 3 páginas de Análise de mérito (Dashboard/Mapa/
 * Relatórios) fica no cabeçalho de cada página (NavBoxesAnaliseMerito),
 * não mais aqui -- mesmo padrão de Dados oficiais/Mesa de trabalho, que
 * também têm seus cards de cabeçalho próprios por página. */
export function AppLayout() {
  const location = useLocation();
  return (
    <FamiliaEquipamentoProvider>
      <div className="flex min-h-screen flex-col text-sm text-foreground">
        <AppHeader
          navItems={NAV_ITEMS_MONITORAMENTO}
          leftExtra={<SeletorEquipamento />}
        />
        {/* `key` por rota: a animação de entrada roda a cada troca de página. */}
        <main
          key={location.pathname}
          className={`${CONTAINER_CLASS} animar-entrada w-full flex-1 py-8`}
        >
          <Outlet />
        </main>
        <AppFooter />
      </div>
    </FamiliaEquipamentoProvider>
  );
}
