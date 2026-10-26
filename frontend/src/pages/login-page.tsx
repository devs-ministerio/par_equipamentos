/** Página de login dedicada (achado 2026-09-15, pedido do usuário:
 * "preciso que o botão de login aponte para uma página de login e não que
 * abra dentro do próprio convênio"). Fora de qualquer layout (como "/",
 * PainelGeralPage). Sessão via cookie HttpOnly (Plan Mode segurança
 * 2026-09-16, Bloco 2) -- `useAuthSession` reflete o estado perguntando ao
 * backend (`GET /auth/me`), não lendo token de `localStorage`.
 *
 * Reaproveita MonitoramentoInternoFormLogin (RHF+Zod, mesmo padrão do
 * resto do módulo) em vez de duplicar o form. Depois de logar, volta pra
 * onde o usuário veio (`location.state.from`, setado pelo botão "Login" do
 * header em UserMenu.tsx) ou pro Painel Geral por padrão. */
import { useNavigate, useLocation, Link, Navigate } from "react-router-dom";
import { useAuthSession } from "@/hooks/useAuthSession";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { MonitoramentoInternoFormLogin } from "@/components/features/monitoramento-interno-form-login";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/common/logo";

export function LoginPage() {
  const sessao = useAuthSession();
  const navigate = useNavigate();
  const location = useLocation();
  const destino =
    (location.state as { from?: string } | null)?.from ||
    "/monitoramento-equipamentos";

  if (sessao.autenticado) {
    return <Navigate to={destino} replace />;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <Card className="w-full max-w-[420px]">
        <CardContent className="p-8">
          <Link
            to="/monitoramento-equipamentos"
            className="mb-8 flex justify-center text-foreground"
          >
            <Logo variante="completo" className="h-14" />
          </Link>
          <h1 className="sr-only">Entrar no SISGEO</h1>
          <MonitoramentoInternoFormLogin
            onEntrar={async (valores) => {
              await sessao.login({
                email: valores.email,
                senha: valores.senha,
              });
              navigate(destino, { replace: true });
            }}
            erroServidor={
              sessao.erroLogin ? mensagemSeguraDoErro(sessao.erroLogin) : null
            }
          />
          <Link
            to="/esqueci-senha"
            className="mt-4 block text-center text-sm text-primary underline-offset-4 hover:underline"
          >
            Esqueci minha senha
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
