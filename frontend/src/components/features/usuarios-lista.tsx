import { Settings2, UserPlus } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorAlert } from "@/components/common/error-alert";
import { Pagination } from "@/components/common/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "Pendente";
}

export function UsuariosLista({
  usuarios,
  total,
  page,
  pageSize,
  carregando,
  erro,
  onPageChange,
  onGerenciar,
  onNovoUsuario,
  onRetry,
}: {
  usuarios: Usuario[];
  total: number;
  page: number;
  pageSize: number;
  carregando: boolean;
  erro: Error | null;
  onPageChange: (page: number) => void;
  onGerenciar: (usuario: Usuario) => void;
  onNovoUsuario: () => void;
  onRetry: () => void;
}) {
  if (erro) return <ErrorAlert mensagem={erro.message} onRetry={onRetry} />;

  if (carregando) return <UsuariosListaSkeleton />;

  if (usuarios.length === 0) {
    return (
      <EmptyState
        titulo="Nenhum usuário encontrado"
        descricao="Ajuste os filtros ou crie um novo acesso para a equipe."
        acao={
          <Button onClick={onNovoUsuario}>
            <UserPlus aria-hidden="true" /> Novo usuário
          </Button>
        }
      />
    );
  }

  return (
    <section
      className="border-y border-border bg-card"
      aria-label="Lista de usuários"
    >
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ativação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map((usuario) => (
              <TableRow key={usuario.id}>
                <TableCell>
                  <p className="font-semibold text-foreground">
                    {usuario.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {usuario.email}
                  </p>
                </TableCell>
                <TableCell className="text-sm">
                  {PERFIL[usuario.role]}
                </TableCell>
                <TableCell>
                  <StatusUsuario status={usuario.status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatarData(usuario.activated_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onGerenciar(usuario)}
                  >
                    <Settings2 aria-hidden="true" /> Gerenciar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="divide-y divide-border md:hidden">
        {usuarios.map((usuario) => (
          <article key={usuario.id} className="px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {usuario.name}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {usuario.email}
                </p>
              </div>
              <StatusUsuario status={usuario.status} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {PERFIL[usuario.role]}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onGerenciar(usuario)}
              >
                Gerenciar
              </Button>
            </div>
          </article>
        ))}
      </div>
      <Pagination
        page={page}
        totalItems={total}
        pageSize={pageSize}
        onPageChange={onPageChange}
      />
    </section>
  );
}

function UsuariosListaSkeleton() {
  return (
    <div
      className="border-y border-border bg-card px-4 py-2"
      aria-label="Carregando usuários"
    >
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="flex items-center justify-between gap-4 border-b border-border py-4 last:border-0"
        >
          <div className="space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}
