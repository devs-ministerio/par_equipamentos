/** Form de login do acesso operacional -- React Hook Form + zod (Seção C da
 * migração), extraído de MonitoramentoInterno.tsx. */
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { colors } from '@/styles/tokens';
import { loginSchema, type LoginFormValues } from '@/lib/validations/monitoramento';
import { ErroCampo, estiloInput, idsDescricaoCampo } from './monitoramento-ui';

export function MonitoramentoInternoFormLogin({
  onEntrar,
  erroServidor,
}: {
  onEntrar: (valores: LoginFormValues) => Promise<void>;
  erroServidor?: string | null;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  async function aoSubmeter(valores: LoginFormValues) {
    try {
      await onEntrar(valores);
      reset();
    } catch {
      // Erro já fica visível via `erroServidor` (estado do chamador) --
      // aqui só evita propagar rejeição não tratada pro handleSubmit.
    }
  }

  return (
    <form onSubmit={handleSubmit(aoSubmeter)} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <label htmlFor="login-email" style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>
          Email
        </label>
        <input
          id="login-email"
          type="email"
          style={{ ...estiloInput, width: '100%' }}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={idsDescricaoCampo('login-email', Boolean(errors.email), false)}
          {...register('email')}
        />
        <ErroCampo id="login-email-error" mensagem={errors.email?.message} />
      </div>
      <div style={{ flex: 1, minWidth: 180 }}>
        <label htmlFor="login-senha" style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>
          Senha
        </label>
        <input
          id="login-senha"
          type="password"
          style={{ ...estiloInput, width: '100%' }}
          aria-invalid={Boolean(errors.senha)}
          aria-describedby={idsDescricaoCampo('login-senha', Boolean(errors.senha), false)}
          {...register('senha')}
        />
        <ErroCampo id="login-senha-error" mensagem={errors.senha?.message} />
      </div>
      <div>
        <button
          type="submit"
          disabled={isSubmitting}
          style={{ ...estiloInput, cursor: 'pointer', background: colors.hiperGreen, color: '#fff', border: 'none', fontWeight: 600 }}
        >
          {isSubmitting ? 'Entrando...' : 'Entrar'}
        </button>
        <ErroCampo id="login-form-erro" mensagem={erroServidor ?? undefined} />
      </div>
    </form>
  );
}
