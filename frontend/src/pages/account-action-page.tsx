import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AccountActionForm, ForgotPasswordForm } from '@/components/features/account-action-forms';

export function AccountActionPage({ mode }: { mode: 'activate' | 'reset' }) {
  const location = useLocation();
  // O fragmento nunca é enviado ao servidor. Lê-lo uma vez e limpá-lo evita
  // que token de uso único fique no histórico ou seja copiado por engano.
  const token = new URLSearchParams(location.hash.replace(/^#/, '')).get('token') ?? '';
  const navigate = useNavigate();
  useEffect(() => {
    if (location.hash) window.history.replaceState(null, '', location.pathname);
  }, [location.hash, location.pathname]);
  return <AccountActionForm mode={mode} token={token} onConcluido={() => navigate('/monitoramento-equipamentos')} />;
}

export function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
