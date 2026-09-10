import { lazy, Suspense } from 'react';
import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';

// Code-splitting por rota (2026-08-24) -- antes as 4 paginas eram import
// estatico aqui, entao MapaPage (que carrega MacroMap.tsx -> D3) ia pro
// chunk principal mesmo pra quem nunca visita /mapa. Cada pagina agora e
// seu proprio chunk, buscado so quando a rota e acessada.
const PainelGeralPage = lazy(() => import('./pages/PainelGeralPage').then((m) => ({ default: m.PainelGeralPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const MapaPage = lazy(() => import('./pages/MapaPage').then((m) => ({ default: m.MapaPage })));
const RelatoriosPage = lazy(() => import('./pages/RelatoriosPage').then((m) => ({ default: m.RelatoriosPage })));
// Monitoramento de equipamento (decisao 2026-09-03) -- esforco separado da
// analise de merito de hipo/hipersuficiencia, sem link a partir do resto do
// app (so acessivel indo direto na URL). Ver comentario no topo do arquivo
// da pagina pro porque de ficar fora do AppLayout/TopNav.
const MonitoramentoEquipamentosPage = lazy(() =>
  import('./pages/MonitoramentoEquipamentosPage').then((m) => ({ default: m.MonitoramentoEquipamentosPage }))
);
// Pagina propria do monitoramento interno POR instrumento (achado
// 2026-09-09) -- antes vivia embutida dentro do card do convenio na lista
// acima. Mesmo padrao de code-splitting, mesmo "fora do AppLayout".
const MonitoramentoInstrumentoPage = lazy(() =>
  import('./pages/MonitoramentoInstrumentoPage').then((m) => ({ default: m.MonitoramentoInstrumentoPage }))
);
// Overview INDEPENDENTE do monitoramento interno (achado 2026-09-09,
// pedido do usuario: "não mostrar apenas quando abrir um convênio
// especifico") -- indice com KPIs agregados de todos os instrumentos.
const MonitoramentoOverviewPage = lazy(() =>
  import('./pages/MonitoramentoOverviewPage').then((m) => ({ default: m.MonitoramentoOverviewPage }))
);
// Painel de Gestao (achado 2026-09-09, 2a rodada, pedido do usuario: "uma
// página de painel apenas com dashboards... para avaliação da gestão") --
// so leitura executiva, sem tabela/form, ver docstring do arquivo.
const MonitoramentoPainelPage = lazy(() =>
  import('./pages/MonitoramentoPainelPage').then((m) => ({ default: m.MonitoramentoPainelPage }))
);

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          {/* Painel Geral (decisao 2026-08-22) -- pagina inicial, fora do
              AppLayout/TopNav de proposito (nao pertence a uma familia
              especifica, ver comentario em PainelGeralPage.tsx). */}
          <Route path="/" element={<PainelGeralPage />} />
          <Route path="/monitoramento-equipamentos" element={<MonitoramentoEquipamentosPage />} />
          <Route path="/monitoramento-equipamentos/instrumentos" element={<MonitoramentoOverviewPage />} />
          <Route path="/monitoramento-equipamentos/painel" element={<MonitoramentoPainelPage />} />
          <Route path="/monitoramento-equipamentos/instrumentos/:nrConvenio" element={<MonitoramentoInstrumentoPage />} />
          <Route element={<AppLayout />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="mapa" element={<MapaPage />} />
            <Route path="relatorios" element={<RelatoriosPage />} />
            {/* Metodologia virou secao de /relatorios (decisao 2026-08-22) --
                redirect pra nao quebrar link/favorito antigo pra /metodologia. */}
            <Route path="metodologia" element={<Navigate to="/relatorios" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
