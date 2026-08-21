import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { MapaPage } from './pages/MapaPage';
import { RelatoriosPage } from './pages/RelatoriosPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
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
