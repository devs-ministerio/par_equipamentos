/** Gestão de usuários: página de composição. Busca e mutações ficam no hook;
 * lista, filtros e diálogos preservam responsabilidades visuais separadas. */
import { useState } from "react";
import { UserPlus, UsersRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/common/page-header";
import { UsuarioDialogGerenciar } from "@/components/features/usuario-dialog-gerenciar";
import { UsuarioDialogEnviarRedefinicao } from "@/components/features/usuario-dialog-enviar-redefinicao";
import { UsuarioDialogInativar } from "@/components/features/usuario-dialog-inativar";
import { UsuarioFormCriar } from "@/components/features/usuario-form-criar";
import { UsuarioFormEditar } from "@/components/features/usuario-form-editar";
import { UsuariosFiltros } from "@/components/features/usuarios-filtros";
import { UsuariosLista } from "@/components/features/usuarios-lista";
import { Button } from "@/components/ui/button";
import { useUsuarios } from "@/hooks/useUsuarios";
import type { Usuario, UserRole, UserStatus } from "@/services/usuarios";

const PAGE_SIZE = 20;

export function UsuariosPage() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [status, setStatus] = useState<UserStatus | "">("");
  const [page, setPage] = useState(1);
  const [criarAberto, setCriarAberto] = useState(false);
  const [usuarioGerenciando, setUsuarioGerenciando] = useState<Usuario | null>(
    null,
  );
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
    erro,
    criar,
    atualizar,
    enviarRedefinicao,
    inativar,
    inativando,
    reativar,
    reativando,
    refetch,
  } = useUsuarios({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    busca: busca || undefined,
    role: role || undefined,
    status: status || undefined,
  });

  function redefinirPagina() {
    setPage(1);
  }

  function limparFiltros() {
    setBusca("");
    setRole("");
    setStatus("");
    redefinirPagina();
  }

  function abrirAcao(usuario: Usuario, destino: "editar" | "senha" | "status") {
    setUsuarioGerenciando(null);
    if (destino === "editar") setUsuarioEditando(usuario);
    if (destino === "senha") setUsuarioRedefinindoSenha(usuario);
    if (destino === "status") setUsuarioInativando(usuario);
  }

  return (
    <main className="mx-auto max-w-[1100px] py-2">
      <PageHeader
        eyebrow="Administração"
        title="Gestão de usuários"
        description="Organize acessos, perfis e a segurança operacional da equipe."
        actions={
          <Button
            className="w-full sm:w-auto"
            onClick={() => setCriarAberto(true)}
          >
            <UserPlus aria-hidden="true" /> Novo usuário
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <UsersRound aria-hidden="true" className="size-4 text-primary" />
          <span>
            <strong className="font-semibold text-foreground">{total}</strong>{" "}
            {total === 1 ? "acesso encontrado" : "acessos encontrados"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Gerencie uma pessoa por vez para reduzir riscos.
        </p>
      </div>

      <UsuariosFiltros
        busca={busca}
        perfil={role}
        status={status}
        onBuscaChange={(value) => {
          setBusca(value);
          redefinirPagina();
        }}
        onPerfilChange={(value) => {
          setRole(value);
          redefinirPagina();
        }}
        onStatusChange={(value) => {
          setStatus(value);
          redefinirPagina();
        }}
        onLimpar={limparFiltros}
      />

      <UsuariosLista
        usuarios={usuarios}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        carregando={carregando}
        erro={erro}
        onPageChange={setPage}
        onGerenciar={setUsuarioGerenciando}
        onNovoUsuario={() => setCriarAberto(true)}
        onRetry={() => void refetch()}
      />

      <UsuarioDialogGerenciar
        usuario={usuarioGerenciando}
        onOpenChange={(open) => !open && setUsuarioGerenciando(null)}
        onEditar={(usuario) => abrirAcao(usuario, "editar")}
        onRedefinirSenha={(usuario) => abrirAcao(usuario, "senha")}
        onAlterarStatus={(usuario) => abrirAcao(usuario, "status")}
        onVerHistorico={(usuario) => {
          setUsuarioGerenciando(null);
          navigate(`/admin/auditoria?usuario_id=${usuario.id}`);
        }}
      />
      <UsuarioFormCriar
        open={criarAberto}
        onOpenChange={setCriarAberto}
        onCriar={criar}
      />
      <UsuarioFormEditar
        usuario={usuarioEditando}
        onOpenChange={(open) => !open && setUsuarioEditando(null)}
        onEditar={(id, valores) => atualizar({ id, corpo: valores })}
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
