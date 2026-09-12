/** Seção "Acesso operacional" -- login/logout do monitoramento interno.
 * Extraído de MonitoramentoInterno.tsx (Seção 6 da migração). */
import { useState } from 'react';
import { colors } from '@/styles/tokens';
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
            style={{ ...estiloInput, cursor: 'pointer', background: 'transparent', color: colors.primary, border: `1px solid ${colors.primary}`, fontWeight: 600, padding: '4px 10px' }}
          >
            Sair
          </button>
        ) : (
          <button
            onClick={() => setLoginAberto((v) => !v)}
            aria-expanded={loginAberto}
            style={{ ...estiloInput, cursor: 'pointer', background: colors.primary, color: '#fff', border: 'none', fontWeight: 600, padding: '4px 10px' }}
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
