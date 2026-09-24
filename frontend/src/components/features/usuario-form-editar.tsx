/** Form de edição (nome + perfil) -- criação de usuário fica em
 * `usuario-form-criar.tsx` (schemas diferentes: editar não mexe em
 * e-mail/senha). Mesmo padrão RHF + Zod dentro de `<Dialog>`. */
import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  editarUsuarioSchema,
  type EditarUsuarioFormValues,
} from "@/lib/validations/usuarios";
import type { AtualizarUsuarioInput, Usuario } from "@/services/usuarios";

export function UsuarioFormEditar({
  usuario,
  onOpenChange,
  onEditar,
}: {
  usuario: Usuario | null;
  onOpenChange: (open: boolean) => void;
  onEditar: (id: number, valores: AtualizarUsuarioInput) => Promise<unknown>;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditarUsuarioFormValues>({
    resolver: zodResolver(editarUsuarioSchema),
  });

  useEffect(() => {
    if (usuario) reset({ name: usuario.name, role: usuario.role });
  }, [usuario, reset]);

  async function aoSubmeter(valores: EditarUsuarioFormValues) {
    if (!usuario) return;
    try {
      await onEditar(usuario.id, valores);
      toast.success(`Usuário ${valores.name} atualizado.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Não foi possível atualizar o usuário.",
      );
    }
  }

  return (
    <Dialog open={usuario !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(aoSubmeter)}
          className="flex flex-col gap-3"
        >
          <div>
            <label
              htmlFor="editar-usuario-name"
              className="mb-1 block text-xs text-muted-foreground"
            >
              Nome
            </label>
            <Input
              id="editar-usuario-name"
              aria-invalid={Boolean(errors.name)}
              {...register("name")}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="editar-usuario-role"
              className="mb-1 block text-xs text-muted-foreground"
            >
              Perfil
            </label>
            <select
              id="editar-usuario-role"
              className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none"
              {...register("role")}
            >
              <option value="admin">Admin</option>
              <option value="colaborador">Colaborador</option>
              <option value="leitor">Leitor</option>
            </select>
            {errors.role && (
              <p className="mt-1 text-xs text-destructive">
                {errors.role.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
