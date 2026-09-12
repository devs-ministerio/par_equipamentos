/** Form de login do acesso operacional -- React Hook Form + zod (Seção C da
 * migração), extraído de MonitoramentoInterno.tsx. */
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { cn } from '@/lib/utils';
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
    <form onSubmit={handleSubmit(aoSubmeter)} className="flex gap-2.5 flex-wrap items-start">
      <div className="flex-1 min-w-[220px]">
        <label htmlFor="login-email" className="text-[11px] text-muted-foreground block mb-1">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          className={cn(estiloInput, 'w-full')}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={idsDescricaoCampo('login-email', Boolean(errors.email), false)}
          {...register('email')}
        />
        <ErroCampo id="login-email-error" mensagem={errors.email?.message} />
      </div>
      <div className="flex-1 min-w-[180px]">
        <label htmlFor="login-senha" className="text-[11px] text-muted-foreground block mb-1">
          Senha
        </label>
        <input
          id="login-senha"
          type="password"
          className={cn(estiloInput, 'w-full')}
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
          className={cn(estiloInput, 'cursor-pointer bg-success text-success-foreground border-none font-semibold')}
        >
          {isSubmitting ? 'Entrando...' : 'Entrar'}
        </button>
        <ErroCampo id="login-form-erro" mensagem={erroServidor ?? undefined} />
      </div>
    </form>
  );
}
