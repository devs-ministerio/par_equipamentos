/** Form de criação de usuário -- RHF + Zod, dentro de um `<Dialog>` do
 * shadcn (não `modal.tsx`, removido no Bloco 3 do Plan Mode frontend
 * 2026-09-17). Mesmo padrão de `monitoramento-interno-form-login.tsx`. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import { Input } from "@/components/ui/input";
import {
  criarUsuarioSchema,
  type CriarUsuarioFormValues,
} from "@/lib/validations/usuarios";
import type { CriarUsuarioInput } from "@/services/usuarios";

export function UsuarioFormCriar({
  open,
  onOpenChange,
  onCriar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCriar: (valores: CriarUsuarioInput) => Promise<unknown>;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CriarUsuarioFormValues>({
    resolver: zodResolver(criarUsuarioSchema),
    defaultValues: { role: "colaborador" },
  });

  async function aoSubmeter(valores: CriarUsuarioFormValues) {
    try {
      await onCriar(valores);
      toast.success(`Usuário ${valores.name} criado.`);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Não foi possível criar o usuário.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            Cria o acesso e define a senha inicial -- o usuário pode trocar
            depois.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(aoSubmeter)}
          className="flex flex-col gap-3"
        >
          <div>
            <label
              htmlFor="criar-usuario-name"
              className="mb-1 block text-xs text-muted-foreground"
            >
              Nome
            </label>
            <Input
              id="criar-usuario-name"
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
              htmlFor="criar-usuario-email"
              className="mb-1 block text-xs text-muted-foreground"
            >
              E-mail
            </label>
            <Input
              id="criar-usuario-email"
              type="email"
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="criar-usuario-role"
              className="mb-1 block text-xs text-muted-foreground"
            >
              Perfil
            </label>
            <select
              id="criar-usuario-role"
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
          <p className="text-xs text-muted-foreground">
            O usuário receberá um convite por e-mail para definir a senha.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Criando..." : "Criar usuário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
