/** Form de login do acesso operacional -- React Hook Form + zod (Seção C da
 * migração), extraído de MonitoramentoInterno.tsx.
 *
 * Layout vertical empilhado (2026-09-17) -- antes era uma barra horizontal
 * (`flex flex-wrap`, campos lado a lado + botão ao final), pensada pro uso
 * original: embutido dentro do card largo de um convênio. Esse uso sumiu em
 * 2026-09-15 (`login-page.tsx`, "Login deixou de abrir inline dentro do
 * card de convênio") -- o único consumidor hoje é a página de login
 * dedicada, um card estreito (420px) centralizado na tela. A barra
 * horizontal nesse container quebrava de forma imprevisível conforme a
 * largura (Email empilhando sozinho numa linha, ou o botão "Entrar" ficando
 * espremido do lado da Senha sem alinhamento com o rótulo) -- achado do
 * usuário via captura de tela, 2026-09-17. Também trocado `estiloInput`
 * (raw `<input>`) por `Input`/`Button` do shadcn -- mesmo padrão visual já
 * usado no resto do app (focus ring, estado de erro), em vez do estilo
 * bespoke que só esse form ainda usava. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  loginSchema,
  type LoginFormValues,
} from "@/lib/validations/monitoramento";
import { ErroCampo } from "./monitoramento-ui";
import { idsDescricaoCampo } from "@/lib/monitoramento-status";

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
    <form onSubmit={handleSubmit(aoSubmeter)} className="flex flex-col gap-4">
      <div>
        <label
          htmlFor="login-email"
          className="mb-1.5 block text-xs font-medium text-muted-foreground"
        >
          Email
        </label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={idsDescricaoCampo(
            "login-email",
            Boolean(errors.email),
            false,
          )}
          {...register("email")}
        />
        <ErroCampo id="login-email-error" mensagem={errors.email?.message} />
      </div>
      <div>
        <label
          htmlFor="login-senha"
          className="mb-1.5 block text-xs font-medium text-muted-foreground"
        >
          Senha
        </label>
        <Input
          id="login-senha"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.senha)}
          aria-describedby={idsDescricaoCampo(
            "login-senha",
            Boolean(errors.senha),
            false,
          )}
          {...register("senha")}
        />
        <ErroCampo id="login-senha-error" mensagem={errors.senha?.message} />
      </div>
      <div className="mt-1">
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Entrando..." : "Entrar"}
        </Button>
        <ErroCampo id="login-form-erro" mensagem={erroServidor ?? undefined} />
      </div>
    </form>
  );
}
