import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { AppLayout } from './components/layout/app-layout';
import { MonitoramentoLayout } from './components/layout/monitoramento-layout';
import { ProtectedRoute } from './components/layout/protected-route';

// Code-splitting por rota (2026-08-24) -- antes as 4 paginas eram import
// estatico aqui, entao MapaPage (que carrega MacroMap.tsx -> D3) ia pro
// chunk principal mesmo pra quem nunca visita /mapa. Cada pagina agora e
// seu proprio chunk, buscado so quando a rota e acessada.
const PainelGeralPage = lazy(() => import('./pages/painel-geral-page').then((m) => ({ default: m.PainelGeralPage })));
// Pagina de login dedicada (achado 2026-09-15) -- fora de qualquer layout,
// mesmo padrao de "/" (ver login-page.tsx pro motivo).
const LoginPage = lazy(() => import('./pages/login-page').then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('./pages/dashboard-page').then((m) => ({ default: m.DashboardPage })));
const MapaPage = lazy(() => import('./pages/mapa-page').then((m) => ({ default: m.MapaPage })));
const RelatoriosPage = lazy(() => import('./pages/relatorios-page').then((m) => ({ default: m.RelatoriosPage })));
// Monitoramento de equipamento (decisao 2026-09-03) -- esforco separado da
// analise de merito de hipo/hipersuficiencia. Ate 2026-09-09 vivia fora de
// qualquer layout (so acessivel indo direto na URL); achado 2026-09-10
// (pedido do usuario: "implante os menus de navegação") -- agora usa
// MonitoramentoLayout, com nav propria + link de volta pra analise de
// merito (ver AppHeader.tsx).
const MonitoramentoEquipamentosPage = lazy(() =>
  import('./pages/monitoramento-equipamentos-page').then((m) => ({ default: m.MonitoramentoEquipamentosPage }))
);
// Pagina propria do monitoramento interno POR instrumento (achado
// 2026-09-09) -- antes vivia embutida dentro do card do convenio na lista
// acima. Mesmo padrao de code-splitting, mesmo "fora do AppLayout".
const MonitoramentoInstrumentoPage = lazy(() =>
  import('./pages/monitoramento-instrumento-page').then((m) => ({ default: m.MonitoramentoInstrumentoPage }))
);
// Overview INDEPENDENTE do monitoramento interno (achado 2026-09-09,
// pedido do usuario: "não mostrar apenas quando abrir um convênio
// especifico") -- indice com KPIs agregados de todos os instrumentos.
const MonitoramentoOverviewPage = lazy(() =>
  import('./pages/monitoramento-overview-page').then((m) => ({ default: m.MonitoramentoOverviewPage }))
);
// Painel de Gestao (achado 2026-09-09, 2a rodada, pedido do usuario: "uma
// página de painel apenas com dashboards... para avaliação da gestão") --
// so leitura executiva, sem tabela/form, ver docstring do arquivo.
const MonitoramentoPainelPage = lazy(() =>
  import('./pages/monitoramento-painel-page').then((m) => ({ default: m.MonitoramentoPainelPage }))
);

/** Feedback visível durante o carregamento de uma rota. `null` aqui fazia a
 * troca de página parecer uma falha, principalmente em conexões mais lentas. */
function RouteLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-center text-sm text-muted-foreground" role="status">
      Carregando página…
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-center">
      <div>
        <p className="text-sm font-semibold text-muted-foreground">Página não encontrada</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Este endereço não existe no SIGEO.</h1>
        <Link className="mt-5 inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline" to="/">
          Voltar ao painel geral
        </Link>
      </div>
    </main>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            {/* Painel Geral (decisao 2026-08-22) -- pagina inicial, fora do
                AppLayout/TopNav de proposito (nao pertence a uma familia
                especifica, ver comentario em PainelGeralPage.tsx). */}
            <Route path="/" element={<PainelGeralPage />} />
            <Route path="/login" element={<LoginPage />} />
            {/* Leituras do monitoramento interno passaram a exigir sessão
                no backend (Plan Mode segurança 2026-09-16, Bloco 1) -- gate
                de rota pra não deixar a página montar sem token. */}
            <Route element={<ProtectedRoute />}>
              <Route element={<MonitoramentoLayout />}>
                <Route path="/monitoramento-equipamentos" element={<MonitoramentoEquipamentosPage />} />
                <Route path="/monitoramento-equipamentos/instrumentos" element={<MonitoramentoOverviewPage />} />
                <Route path="/monitoramento-equipamentos/painel" element={<MonitoramentoPainelPage />} />
                <Route path="/monitoramento-equipamentos/instrumentos/:nrConvenio" element={<MonitoramentoInstrumentoPage />} />
              </Route>
            </Route>
            <Route element={<AppLayout />}>
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="mapa" element={<MapaPage />} />
              <Route path="relatorios" element={<RelatoriosPage />} />
              {/* Metodologia virou secao de /relatorios (decisao 2026-08-22) --
                  redirect pra nao quebrar link/favorito antigo pra /metodologia. */}
              <Route path="metodologia" element={<Navigate to="/relatorios" replace />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
