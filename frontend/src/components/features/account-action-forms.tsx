import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ComponentProps, type ReactNode } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import {
  TAMANHO_MINIMO_SENHA,
  recuperarContaSchema,
  senhaContaSchema,
  type RecuperarContaFormValues,
  type SenhaContaFormValues,
} from "@/lib/validations/account";
import {
  ativarConta,
  redefinirSenha,
  solicitarRecuperacao,
} from "@/services/auth";

function ErroFormulario({ mensagem }: { mensagem?: string }) {
  return mensagem ? (
    <p className="text-sm text-destructive" role="alert">
      {mensagem}
    </p>
  ) : null;
}

/** Campo de senha com botão próprio de mostrar/ocultar, sempre visível.
 * O "olho" nativo do Edge sumia ao sair do campo (comportamento do próprio
 * navegador, por segurança) -- esse ícone nativo fica escondido no
 * index.css (`::-ms-reveal`) para não aparecerem dois. */
function CampoSenha({
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, "type">) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="relative">
      <Input
        type={visivel ? "text" : "password"}
        className={cn("pr-11", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visivel}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        {visivel ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

export function AccountActionForm({
  mode,
  token,
  onConcluido,
}: {
  mode: "activate" | "reset";
  token: string;
  onConcluido: () => void;
}) {
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const [concluido, setConcluido] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SenhaContaFormValues>({
    resolver: zodResolver(senhaContaSchema),
  });
  const tamanhoSenha = watch("senha")?.length ?? 0;
  const tamanhoOk = tamanhoSenha >= TAMANHO_MINIMO_SENHA;
  async function enviar({ senha }: SenhaContaFormValues) {
    setErroServidor(null);
    if (!token) {
      setErroServidor(
        "O link não é válido ou já foi utilizado. Solicite um novo link.",
      );
      return;
    }
    try {
      if (mode === "activate") await ativarConta(token, senha);
      else await redefinirSenha(token, senha);
      setConcluido(true);
      window.setTimeout(onConcluido, 800);
    } catch (erro) {
      setErroServidor(mensagemSeguraDoErro(erro));
    }
  }
  return (
    <AccountCard
      titulo={mode === "activate" ? "Ative seu acesso" : "Redefina sua senha"}
    >
      <p className="mt-2 text-sm text-muted-foreground">
        {concluido
          ? "Operação concluída. Redirecionando…"
          : "Escolha uma senha pessoal para continuar."}
      </p>
      {!concluido && (
        <form
          onSubmit={handleSubmit(enviar)}
          className="mt-6 flex flex-col gap-3"
          noValidate
        >
          <div>
            <label className="sr-only" htmlFor="nova-senha">
              Nova senha
            </label>
            <CampoSenha
              id="nova-senha"
              autoComplete="new-password"
              placeholder="Nova senha"
              aria-invalid={Boolean(errors.senha)}
              aria-describedby="nova-senha-regra"
              {...register("senha")}
            />
            {/* Regra visível desde o início (não só depois do erro). */}
            <p
              id="nova-senha-regra"
              className={cn(
                "mt-1.5 flex items-center gap-1.5 text-xs transition-colors",
                tamanhoOk ? "text-success" : "text-muted-foreground",
              )}
            >
              <Check
                className={cn(
                  "size-3.5 transition-opacity",
                  tamanhoOk ? "opacity-100" : "opacity-30",
                )}
                aria-hidden="true"
              />
              Mínimo de {TAMANHO_MINIMO_SENHA} caracteres
              <span className="ml-auto font-mono tabular-nums">
                {tamanhoSenha}/{TAMANHO_MINIMO_SENHA}
              </span>
            </p>
            <ErroFormulario mensagem={errors.senha?.message} />
          </div>
          <div>
            <label className="sr-only" htmlFor="confirmar-senha">
              Confirmar senha
            </label>
            <CampoSenha
              id="confirmar-senha"
              autoComplete="new-password"
              placeholder="Confirmar senha"
              aria-invalid={Boolean(errors.confirmarSenha)}
              {...register("confirmarSenha")}
            />
            <ErroFormulario mensagem={errors.confirmarSenha?.message} />
          </div>
          <ErroFormulario mensagem={erroServidor ?? undefined} />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Salvando…" : "Continuar"}
          </Button>
        </form>
      )}
    </AccountCard>
  );
}

export function ForgotPasswordForm() {
  const [enviado, setEnviado] = useState(false);
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecuperarContaFormValues>({
    resolver: zodResolver(recuperarContaSchema),
  });
  async function enviar({ email }: RecuperarContaFormValues) {
    setErroServidor(null);
    try {
      await solicitarRecuperacao(email);
      setEnviado(true);
    } catch (erro) {
      setErroServidor(mensagemSeguraDoErro(erro));
    }
  }
  return (
    <AccountCard titulo="Recuperar acesso">
      <p className="mt-2 text-sm text-muted-foreground">
        {enviado
          ? "Se o e-mail estiver cadastrado, você receberá as instruções."
          : "Informe seu e-mail para receber um link seguro."}
      </p>
      {!enviado && (
        <form
          onSubmit={handleSubmit(enviar)}
          className="mt-6 flex flex-col gap-3"
          noValidate
        >
          <div>
            <label className="sr-only" htmlFor="recuperar-email">
              Email
            </label>
            <Input
              id="recuperar-email"
              type="email"
              autoComplete="email"
              placeholder="seu@email.gov.br"
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
            <ErroFormulario mensagem={errors.email?.message} />
          </div>
          <ErroFormulario mensagem={erroServidor ?? undefined} />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Enviando…" : "Enviar link"}
          </Button>
        </form>
      )}
    </AccountCard>
  );
}

function AccountCard({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <Card className="w-full max-w-[420px]">
        <CardContent className="p-8">
          <Link to="/login" className="font-display text-[15px] font-bold">
            SIGEO
          </Link>
          <h1 className="mt-6 text-xl font-bold">{titulo}</h1>
          {children}
        </CardContent>
      </Card>
    </main>
  );
}
