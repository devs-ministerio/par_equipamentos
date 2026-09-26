/** Gestão de usuários (Módulo Admin, 2026-09-17) -- só composição de rota
 * (busca por trás de `AdminRoute` em App.tsx), sem lógica de negócio
 * própria, mesmo princípio das demais páginas. */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/common/pagination";
import { PageHeader } from "@/components/common/page-header";
import { UsuarioFormCriar } from "@/components/features/usuario-form-criar";
import { UsuarioFormEditar } from "@/components/features/usuario-form-editar";
import { UsuarioDialogEnviarRedefinicao } from "@/components/features/usuario-dialog-enviar-redefinicao";
import { UsuarioDialogInativar } from "@/components/features/usuario-dialog-inativar";
import { useUsuarios } from "@/hooks/useUsuarios";
import type { Usuario, UserRole } from "@/services/usuarios";

const PAGE_SIZE = 20;

function badgeStatus(status: Usuario["status"]) {
  if (status === "active") return <Badge variant="success">Ativo</Badge>;
  return <Badge variant="secondary">Inativo</Badge>;
}

export function UsuariosPage() {
  const [busca, setBusca] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [page, setPage] = useState(1);
  const [criarAberto, setCriarAberto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [usuarioRedefinindoSenha, setUsuarioRedefinindoSenha] =
    useState<Usuario | null>(null);
  const [usuarioInativando, setUsuarioInativando] = useState<Usuario | null>(
    null,
  );

  const {
    usuarios,
    total,
    carregando,
    criar,
    atualizar,
    enviarRedefinicao,
    inativar,
    inativando,
    reativar,
    reativando,
  } = useUsuarios({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    busca: busca || undefined,
    role: role || undefined,
  });

  return (
    <main className="mx-auto max-w-[1100px] py-2">
      <PageHeader
        eyebrow="Administração"
        title="Gestão de usuários"
        description="Perfis e acessos ao SIGEO."
        actions={
          <Button
            className="w-full sm:w-auto"
            onClick={() => setCriarAberto(true)}
          >
            Novo usuário
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2.5">
        <Input
          placeholder="Buscar por nome ou e-mail"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setPage(1);
          }}
          className="w-full sm:max-w-[280px]"
        />
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value as UserRole | "");
            setPage(1);
          }}
          className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-primary sm:w-auto"
        >
          <option value="">Todos os perfis</option>
          <option value="admin">Admin</option>
          <option value="gestor">Gestor</option>
          <option value="colaborador">Colaborador</option>
          <option value="leitor">Leitor</option>
        </select>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="p-4 text-center text-sm text-muted-foreground"
                >
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!carregando && usuarios.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="p-4 text-center text-sm text-muted-foreground"
                >
                  Nenhum usuário encontrado.
                </TableCell>
              </TableRow>
            )}
            {usuarios.map((usuario) => (
              <TableRow key={usuario.id}>
                <TableCell>{usuario.name}</TableCell>
                <TableCell>{usuario.email}</TableCell>
                <TableCell className="capitalize">{usuario.role}</TableCell>
                <TableCell>{badgeStatus(usuario.status)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setUsuarioEditando(usuario)}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setUsuarioRedefinindoSenha(usuario)}
                    >
                      Enviar redefinição
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setUsuarioInativando(usuario)}
                    >
                      {usuario.status === "active" ? "Inativar" : "Reativar"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination
          page={page}
          totalItems={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>

      <UsuarioFormCriar
        open={criarAberto}
        onOpenChange={setCriarAberto}
        onCriar={criar}
      />
      <UsuarioFormEditar
        usuario={usuarioEditando}
        onOpenChange={(open) => !open && setUsuarioEditando(null)}
        onEditar={(id, v) => atualizar({ id, corpo: v })}
      />
      <UsuarioDialogEnviarRedefinicao
        usuario={usuarioRedefinindoSenha}
        onOpenChange={(open) => !open && setUsuarioRedefinindoSenha(null)}
        onEnviar={enviarRedefinicao}
      />
      <UsuarioDialogInativar
        usuario={usuarioInativando}
        onOpenChange={(open) => !open && setUsuarioInativando(null)}
        onInativar={inativar}
        onReativar={reativar}
        processando={inativando || reativando}
      />
    </main>
  );
}
