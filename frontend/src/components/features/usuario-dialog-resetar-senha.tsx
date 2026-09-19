/** Confirmação + exibição única da senha temporária gerada pelo backend
 * (não recuperável depois, ver `services/usuarios.ts::resetarSenhaUsuario`
 * -- sem serviço de e-mail configurado no projeto, decisão registrada em
 * CLAUDE.md). 2 estados: confirmar ação -> mostrar senha gerada. */
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Usuario } from '@/services/usuarios';

export function UsuarioDialogResetarSenha({
  usuario,
  onOpenChange,
  onResetar,
}: {
  usuario: Usuario | null;
  onOpenChange: (open: boolean) => void;
  onResetar: (id: number) => Promise<string>;
}) {
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null);
  const [resetando, setResetando] = useState(false);

  function fechar(open: boolean) {
    if (!open) setSenhaGerada(null);
    onOpenChange(open);
  }

  async function confirmar() {
    if (!usuario) return;
    setResetando(true);
    try {
      const senha = await onResetar(usuario.id);
      setSenhaGerada(senha);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível resetar a senha.');
    } finally {
      setResetando(false);
    }
  }

  async function copiar() {
    if (!senhaGerada) return;
    try {
      await navigator.clipboard.writeText(senhaGerada);
      toast.success('Senha copiada.');
    } catch {
      toast.error('Não foi possível copiar -- selecione o texto manualmente.');
    }
  }

  return (
    <Dialog open={usuario !== null} onOpenChange={fechar}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Resetar senha</DialogTitle>
          {!senhaGerada && (
            <DialogDescription>
              Gera uma senha temporária para {usuario?.name}. A sessão atual desse usuário é encerrada.
            </DialogDescription>
          )}
        </DialogHeader>

        {senhaGerada ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-destructive">Esta senha não será mostrada de novo -- copie e repasse agora.</p>
            <code className="rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono">{senhaGerada}</code>
            <Button type="button" variant="outline" onClick={copiar}>
              Copiar
            </Button>
          </div>
        ) : null}

        <DialogFooter>
          {senhaGerada ? (
            <Button type="button" onClick={() => fechar(false)}>
              Concluir
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => fechar(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={confirmar} disabled={resetando}>
                {resetando ? 'Gerando...' : 'Gerar senha temporária'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
