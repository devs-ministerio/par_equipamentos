import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AccountActionForm,
  ForgotPasswordForm,
} from "@/components/features/account-action-forms";
import { limparTokenConta, resolverTokenConta } from "@/lib/token-conta";

export function AccountActionPage({ mode }: { mode: "activate" | "reset" }) {
  const location = useLocation();
  const navigate = useNavigate();
  // O fragmento nunca é enviado ao servidor. Lido uma vez (e guardado nesta
  // aba, ver lib/token-conta.ts, para sobreviver a um F5) e removido da
  // barra de endereço para não ficar no histórico.
  const [token] = useState(() => resolverTokenConta(mode, location.hash));
  useEffect(() => {
    if (location.hash) window.history.replaceState(null, "", location.pathname);
  }, [location.hash, location.pathname]);
  return (
    <AccountActionForm
      mode={mode}
      token={token}
      onConcluido={() => {
        limparTokenConta(mode);
        navigate("/monitoramento-equipamentos");
      }}
    />
  );
}

export function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
