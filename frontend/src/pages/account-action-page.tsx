import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ativarConta, redefinirSenha } from '@/services/auth';

export function AccountActionPage({ mode }: { mode: 'activate' | 'reset' }) {
  const token = new URLSearchParams(useLocation().search).get('token') ?? '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    if (!token || password.length < 10 || password !== confirm) { setError('Confira o link e informe duas senhas iguais com pelo menos 10 caracteres.'); return; }
    try { if (mode === 'activate') await ativarConta(token, password); else await redefinirSenha(token, password); setDone(true); setTimeout(() => navigate('/monitoramento-equipamentos'), 800); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir a operação.'); }
  }
  return <main className="grid min-h-screen place-items-center bg-background px-6"><Card className="w-full max-w-[420px]"><CardContent className="p-8">
    <Link to="/login" className="font-display text-[15px] font-bold">SIGEO</Link>
    <h1 className="mt-6 text-xl font-bold">{mode === 'activate' ? 'Ative seu acesso' : 'Redefina sua senha'}</h1>
    <p className="mt-2 text-sm text-muted-foreground">{done ? 'Operação concluída. Redirecionando…' : 'Escolha uma senha pessoal para continuar.'}</p>
    {!done && <form onSubmit={submit} className="mt-6 flex flex-col gap-3"><Input aria-label="Nova senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nova senha" /><Input aria-label="Confirmar senha" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirmar senha" />{error && <p className="text-sm text-destructive">{error}</p>}<Button type="submit">Continuar</Button></form>}
  </CardContent></Card></main>;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); await import('@/services/auth').then(({ solicitarRecuperacao }) => solicitarRecuperacao(email)); setSent(true); }
  return <main className="grid min-h-screen place-items-center bg-background px-6"><Card className="w-full max-w-[420px]"><CardContent className="p-8"><Link to="/login" className="font-display text-[15px] font-bold">SIGEO</Link><h1 className="mt-6 text-xl font-bold">Recuperar acesso</h1><p className="mt-2 text-sm text-muted-foreground">{sent ? 'Se o e-mail estiver cadastrado, você receberá as instruções.' : 'Informe seu e-mail para receber um link seguro.'}</p>{!sent && <form onSubmit={submit} className="mt-6 flex flex-col gap-3"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.gov.br" /><Button type="submit">Enviar link</Button></form>}</CardContent></Card></main>;
}
