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

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          {/* Painel Geral (decisao 2026-08-22) -- pagina inicial, fora do
              AppLayout/TopNav de proposito (nao pertence a uma familia
              especifica, ver comentario em PainelGeralPage.tsx). */}
          <Route path="/" element={<PainelGeralPage />} />
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
