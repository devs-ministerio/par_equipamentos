/** Seção "Acesso operacional" -- login/logout do monitoramento interno.
 * Extraído de MonitoramentoInterno.tsx (Seção 6 da migração). */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { LoginFormValues } from '@/lib/validations/monitoramento';
import { MonitoramentoInternoFormLogin } from './monitoramento-interno-form-login';
import { SecaoOperacional, estiloInput } from './monitoramento-ui';

export function MonitoramentoInternoAcesso({
  checandoSessao,
  nomeUsuario,
  role,
  podeEditar,
  autenticado,
  onEntrar,
  erroLogin,
  onSair,
}: {
  checandoSessao: boolean;
  nomeUsuario?: string;
  role?: string;
  podeEditar: boolean;
  autenticado: boolean;
  onEntrar: (valores: LoginFormValues) => Promise<void>;
  erroLogin?: string | null;
  onSair: () => void;
}) {
  const [loginAberto, setLoginAberto] = useState(false);

  return (
    <SecaoOperacional
      titulo="Acesso operacional"
      subtitulo={
        checandoSessao
          ? 'Conferindo sessão...'
          : autenticado
            ? `${nomeUsuario} (${role})${podeEditar ? '' : ' · somente leitura'}`
            : 'Entre para editar cadastro, lançar eventos e concluir ações.'
      }
      acao={
        autenticado ? (
          <button
            onClick={onSair}
            className={cn(estiloInput, 'cursor-pointer bg-transparent text-primary border border-primary font-semibold py-1 px-2.5')}
          >
            Sair
          </button>
        ) : (
          <button
            onClick={() => setLoginAberto((v) => !v)}
            aria-expanded={loginAberto}
            className={cn(estiloInput, 'cursor-pointer bg-primary text-primary-foreground border-none font-semibold py-1 px-2.5')}
          >
            {loginAberto ? 'Cancelar' : 'Entrar'}
          </button>
        )
      }
    >
      {!autenticado && loginAberto && (
        <MonitoramentoInternoFormLogin
          onEntrar={async (valores) => {
            await onEntrar(valores);
            setLoginAberto(false);
          }}
          erroServidor={erroLogin}
        />
      )}
    </SecaoOperacional>
  );
}
