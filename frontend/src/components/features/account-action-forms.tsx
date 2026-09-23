import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { mensagemSeguraDoErro } from '@/lib/api-error';
import { recuperarContaSchema, senhaContaSchema, type RecuperarContaFormValues, type SenhaContaFormValues } from '@/lib/validations/account';
import { ativarConta, redefinirSenha, solicitarRecuperacao } from '@/services/auth';

function ErroFormulario({ mensagem }: { mensagem?: string }) {
  return mensagem ? <p className="text-sm text-destructive" role="alert">{mensagem}</p> : null;
}

export function AccountActionForm({ mode, token, onConcluido }: { mode: 'activate' | 'reset'; token: string; onConcluido: () => void }) {
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const [concluido, setConcluido] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SenhaContaFormValues>({ resolver: zodResolver(senhaContaSchema) });
  async function enviar({ senha }: SenhaContaFormValues) {
    setErroServidor(null);
    if (!token) { setErroServidor('O link não é válido ou já foi utilizado. Solicite um novo link.'); return; }
    try {
      if (mode === 'activate') await ativarConta(token, senha); else await redefinirSenha(token, senha);
      setConcluido(true); window.setTimeout(onConcluido, 800);
    } catch (erro) { setErroServidor(mensagemSeguraDoErro(erro)); }
  }
  return <AccountCard titulo={mode === 'activate' ? 'Ative seu acesso' : 'Redefina sua senha'}>
    <p className="mt-2 text-sm text-muted-foreground">{concluido ? 'Operação concluída. Redirecionando…' : 'Escolha uma senha pessoal para continuar.'}</p>
    {!concluido && <form onSubmit={handleSubmit(enviar)} className="mt-6 flex flex-col gap-3" noValidate>
      <div><label className="sr-only" htmlFor="nova-senha">Nova senha</label><Input id="nova-senha" type="password" autoComplete="new-password" placeholder="Nova senha" aria-invalid={Boolean(errors.senha)} {...register('senha')} /><ErroFormulario mensagem={errors.senha?.message} /></div>
      <div><label className="sr-only" htmlFor="confirmar-senha">Confirmar senha</label><Input id="confirmar-senha" type="password" autoComplete="new-password" placeholder="Confirmar senha" aria-invalid={Boolean(errors.confirmarSenha)} {...register('confirmarSenha')} /><ErroFormulario mensagem={errors.confirmarSenha?.message} /></div>
      <ErroFormulario mensagem={erroServidor ?? undefined} />
      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Salvando…' : 'Continuar'}</Button>
    </form>}
  </AccountCard>;
}

export function ForgotPasswordForm() {
  const [enviado, setEnviado] = useState(false);
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RecuperarContaFormValues>({ resolver: zodResolver(recuperarContaSchema) });
  async function enviar({ email }: RecuperarContaFormValues) {
    setErroServidor(null);
    try { await solicitarRecuperacao(email); setEnviado(true); } catch (erro) { setErroServidor(mensagemSeguraDoErro(erro)); }
  }
  return <AccountCard titulo="Recuperar acesso">
    <p className="mt-2 text-sm text-muted-foreground">{enviado ? 'Se o e-mail estiver cadastrado, você receberá as instruções.' : 'Informe seu e-mail para receber um link seguro.'}</p>
    {!enviado && <form onSubmit={handleSubmit(enviar)} className="mt-6 flex flex-col gap-3" noValidate>
      <div><label className="sr-only" htmlFor="recuperar-email">Email</label><Input id="recuperar-email" type="email" autoComplete="email" placeholder="seu@email.gov.br" aria-invalid={Boolean(errors.email)} {...register('email')} /><ErroFormulario mensagem={errors.email?.message} /></div>
      <ErroFormulario mensagem={erroServidor ?? undefined} />
      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Enviando…' : 'Enviar link'}</Button>
    </form>}
  </AccountCard>;
}

function AccountCard({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-background px-6"><Card className="w-full max-w-[420px]"><CardContent className="p-8">
    <Link to="/login" className="font-display text-[15px] font-bold">SIGEO</Link><h1 className="mt-6 text-xl font-bold">{titulo}</h1>{children}
  </CardContent></Card></main>;
}
