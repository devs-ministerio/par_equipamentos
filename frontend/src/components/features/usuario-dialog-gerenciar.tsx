import { History, KeyRound, Pencil, Power, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Usuario } from "@/services/usuarios";

const PERFIL: Record<Usuario["role"], string> = {
  admin: "Administrador",
  gestor: "Gestor",
  colaborador: "Colaborador",
  leitor: "Leitor",
};

function StatusUsuario({ status }: { status: Usuario["status"] }) {
  if (status === "active") return <Badge variant="success">Ativo</Badge>;
  if (status === "suspended")
    return <Badge variant="destructive">Suspenso</Badge>;
  return <Badge variant="secondary">Inativo</Badge>;
}

function formatarData(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "Convite pendente";
}

/** Painel único de ações: evita quatro CTAs concorrendo em cada linha da lista. */
export function UsuarioDialogGerenciar({
  usuario,
  onOpenChange,
  onEditar,
  onRedefinirSenha,
  onAlterarStatus,
  onVerHistorico,
}: {
  usuario: Usuario | null;
  onOpenChange: (open: boolean) => void;
  onEditar: (usuario: Usuario) => void;
  onRedefinirSenha: (usuario: Usuario) => void;
  onAlterarStatus: (usuario: Usuario) => void;
  onVerHistorico: (usuario: Usuario) => void;
}) {
  return (
    <Dialog open={usuario !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[34rem] gap-0 overflow-hidden p-0">
        {usuario && (
          <>
            <DialogHeader className="border-b border-border bg-muted/35 px-6 py-5 text-left">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UserRound aria-hidden="true" className="size-5" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="truncate text-xl tracking-tight">
                    {usuario.name}
                  </DialogTitle>
                  <DialogDescription className="mt-1 truncate">
                    {usuario.email}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
              <div className="px-6 py-4">
                <p className="text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                  Perfil de acesso
                </p>
                <p className="mt-1.5 text-sm font-semibold text-foreground">
                  {PERFIL[usuario.role]}
                </p>
              </div>
              <div className="px-6 py-4">
                <p className="text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                  Situação
                </p>
                <div className="mt-1.5">
                  <StatusUsuario status={usuario.status} />
                </div>
              </div>
            </div>
            <div className="border-b border-border px-6 py-3.5">
              <p className="text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                Ativação
              </p>
              <p className="mt-1 text-sm text-foreground">
                {formatarData(usuario.activated_at)}
              </p>
            </div>

            <div className="p-3">
              <p className="px-3 pt-1 pb-2 text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                Administração
              </p>
              <div className="grid gap-1">
                <Acao
                  icon={Pencil}
                  titulo="Editar dados e perfil"
                  descricao="Altere o nome ou o nível de acesso."
                  onClick={() => onEditar(usuario)}
                />
                <Acao
                  icon={KeyRound}
                  titulo="Enviar redefinição de senha"
                  descricao="Envia um link único para o e-mail cadastrado."
                  onClick={() => onRedefinirSenha(usuario)}
                />
                <Acao
                  icon={History}
                  titulo="Ver histórico de auditoria"
                  descricao="Consulte alterações e ações deste usuário."
                  onClick={() => onVerHistorico(usuario)}
                />
                <Acao
                  icon={Power}
                  titulo={
                    usuario.status === "active"
                      ? "Inativar acesso"
                      : "Reativar acesso"
                  }
                  descricao={
                    usuario.status === "active"
                      ? "Encerra sessões e bloqueia novos acessos."
                      : "Permite que a pessoa volte a acessar o SIGEO."
                  }
                  onClick={() => onAlterarStatus(usuario)}
                  destructive={usuario.status === "active"}
                />
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Acao({
  icon: Icon,
  titulo,
  descricao,
  onClick,
  destructive = false,
}: {
  icon: typeof Pencil;
  titulo: string;
  descricao: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={`h-auto justify-start gap-3 px-3 py-3 text-left whitespace-normal ${
        destructive
          ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
          : ""
      }`}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{titulo}</span>
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
          {descricao}
        </span>
      </span>
    </Button>
  );
}
