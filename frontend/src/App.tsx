import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { MapaPage } from './pages/MapaPage';
import { MetodologiaPage } from './pages/MetodologiaPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="mapa" element={<MapaPage />} />
          <Route path="metodologia" element={<MetodologiaPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
