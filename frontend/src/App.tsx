import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { AppLayout } from './components/layout/app-layout';
import { MonitoramentoLayout } from './components/layout/monitoramento-layout';
import { ProtectedRoute } from './components/layout/protected-route';
import { AdminRoute } from './components/layout/admin-route';
import { Toaster } from './components/ui/sonner';
import { AppErrorBoundary } from './components/common/app-error-boundary';

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
// Gestao de usuarios (Modulo Admin, 2026-09-17) -- so role=admin acessa
// (AdminRoute), fora de AppLayout/MonitoramentoLayout de proposito (nao
// pertence a uma familia de equipamento).
const UsuariosPage = lazy(() => import('./pages/usuarios-page').then((m) => ({ default: m.UsuariosPage })));
const AccountActionPage = lazy(() => import('./pages/account-action-page').then((m) => ({ default: m.AccountActionPage })));
const ForgotPasswordPage = lazy(() => import('./pages/account-action-page').then((m) => ({ default: m.ForgotPasswordPage })));

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
        <Link className="mt-5 inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline" to="/monitoramento-equipamentos">
          Voltar aos Dados Oficiais
        </Link>
      </div>
    </main>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <BrowserRouter>
        {/* 1 Toaster global (Seção 12/13 da constituição -- toda ação de
            sucesso usa toast) -- montado fora do <Suspense> pra sobreviver
            à troca de rota e não empilhar instâncias por página. */}
        <Toaster position="top-right" />
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/ativar" element={<AccountActionPage mode="activate" />} />
            <Route path="/redefinir-senha" element={<AccountActionPage mode="reset" />} />
            <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
            {/* Todo o app exige sessão desde 2026-09-17 (decisão do usuário:
                "todas as páginas do sistema precisarão de login", exceto o
                Painel de Gestão do monitoramento interno, candidato a
                reabrir publicamente no futuro -- por ora fica atrás do
                mesmo gate). Plan Mode segurança 2026-09-16, Bloco 5. */}
            <Route element={<ProtectedRoute />}>
              {/* Dados Oficiais é a entrada operacional após o login. A
                  visão nacional continua disponível em URL própria. */}
              <Route path="/" element={<Navigate to="/monitoramento-equipamentos" replace />} />
              <Route path="/painel-geral" element={<PainelGeralPage />} />
              <Route element={<MonitoramentoLayout />}>
                <Route path="/monitoramento-equipamentos" element={<MonitoramentoEquipamentosPage />} />
                <Route path="/monitoramento-equipamentos/instrumentos" element={<MonitoramentoOverviewPage />} />
                <Route path="/monitoramento-equipamentos/painel" element={<MonitoramentoPainelPage />} />
                <Route path="/monitoramento-equipamentos/instrumentos/:nrConvenio" element={<MonitoramentoInstrumentoPage />} />
                <Route element={<AdminRoute />}>
                  <Route path="/admin/usuarios" element={<UsuariosPage />} />
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
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
        </BrowserRouter>
      </AppErrorBoundary>
    </QueryClientProvider>
  );
}

export default App;
