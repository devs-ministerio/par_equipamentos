/** Página de login dedicada (achado 2026-09-15, pedido do usuário:
 * "preciso que o botão de login aponte para uma página de login e não que
 * abra dentro do próprio convênio"). Fora de qualquer layout (como "/",
 * PainelGeralPage) -- assim o AppHeader de origem desmonta ao navegar pra
 * cá e remonta com o token fresco ao voltar (useAuthSession lê o token do
 * localStorage só na inicialização do hook, ver hooks/useAuthSession.ts).
 *
 * Reaproveita MonitoramentoInternoFormLogin (RHF+Zod, mesmo padrão do
 * resto do módulo) em vez de duplicar o form. Depois de logar, volta pra
 * onde o usuário veio (`location.state.from`, setado pelo botão "Login" do
 * header em UserMenu.tsx) ou pro Painel Geral por padrão. */
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuthSession } from '@/hooks/useAuthSession';
import { MonitoramentoInternoFormLogin } from '@/components/features/monitoramento-interno-form-login';
import { Card, CardContent } from '@/components/ui/card';

export function LoginPage() {
  const sessao = useAuthSession();
  const navigate = useNavigate();
  const location = useLocation();
  const destino = (location.state as { from?: string } | null)?.from || '/';

  if (sessao.autenticado) {
    navigate(destino, { replace: true });
    return null;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <Card className="w-full max-w-[420px]">
        <CardContent className="p-8">
          <Link to="/" className="mb-1 flex items-center gap-2.5 text-foreground">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary font-display text-sm font-bold text-primary-foreground">
              D
            </span>
            <span className="font-display text-[15px] font-bold tracking-tight">DECAN</span>
          </Link>
          <h1 className="mt-5 text-xl font-bold text-foreground">Entrar no SIGEO</h1>
          <p className="mt-1.5 mb-5 text-sm text-muted-foreground">
            Acesso operacional -- edição de monitoramento interno, revisão de propostas e notificações.
          </p>
          <MonitoramentoInternoFormLogin
            onEntrar={async (valores) => {
              await sessao.login({ email: valores.email, senha: valores.senha });
              navigate(destino, { replace: true });
            }}
            erroServidor={sessao.erroLogin instanceof Error ? sessao.erroLogin.message : null}
          />
        </CardContent>
      </Card>
    </main>
  );
}
