import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { PainelGeralPage } from './pages/PainelGeralPage';
import { DashboardPage } from './pages/DashboardPage';
import { MapaPage } from './pages/MapaPage';
import { RelatoriosPage } from './pages/RelatoriosPage';

function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}

export default App;
