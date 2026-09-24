import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Usuario } from "@/services/usuarios";

/** Confirma o envio de link de redefinição; senha nunca passa pela UI. */
export function UsuarioDialogEnviarRedefinicao({
  usuario,
  onOpenChange,
  onEnviar,
}: {
  usuario: Usuario | null;
  onOpenChange: (open: boolean) => void;
  onEnviar: (id: number) => Promise<unknown>;
}) {
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    if (!usuario) return;
    setEnviando(true);
    try {
      await onEnviar(usuario.id);
      toast.success("Link de redefinição enviado por e-mail.");
      onOpenChange(false);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Não foi possível enviar a redefinição.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={usuario !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Enviar redefinição de senha</DialogTitle>
          <DialogDescription>
            Um link de uso único será enviado para {usuario?.email}. Nenhuma
            senha será exibida aqui.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={confirmar} disabled={enviando}>
            {enviando ? "Enviando..." : "Enviar link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
