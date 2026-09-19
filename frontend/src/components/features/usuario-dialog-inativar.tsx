/** Confirmação de inativação/reativação de usuário -- soft delete, mesmo
 * diálogo cobre os 2 sentidos (texto muda conforme `usuario.status`). */
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Usuario } from '@/services/usuarios';

export function UsuarioDialogInativar({
  usuario,
  onOpenChange,
  onInativar,
  onReativar,
  processando,
}: {
  usuario: Usuario | null;
  onOpenChange: (open: boolean) => void;
  onInativar: (id: number) => Promise<unknown>;
  onReativar: (id: number) => Promise<unknown>;
  processando: boolean;
}) {
  if (!usuario) return <Dialog open={false} onOpenChange={onOpenChange} />;

  const inativando = usuario.status === 'active';

  async function confirmar() {
    if (!usuario) return;
    try {
      if (inativando) {
        await onInativar(usuario.id);
        toast.success(`${usuario.name} inativado.`);
      } else {
        await onReativar(usuario.id);
        toast.success(`${usuario.name} reativado.`);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível concluir a ação.');
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{inativando ? 'Inativar usuário' : 'Reativar usuário'}</DialogTitle>
          <DialogDescription>
            {inativando
              ? `${usuario.name} perde acesso imediatamente -- a sessão atual (se houver) é encerrada.`
              : `${usuario.name} volta a poder logar no sistema.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" variant={inativando ? 'destructive' : 'default'} onClick={confirmar} disabled={processando}>
            {processando ? 'Processando...' : inativando ? 'Inativar' : 'Reativar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
