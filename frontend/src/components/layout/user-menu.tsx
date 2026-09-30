/** Widget de sessão no header -- "Login" (leva pra /login) quando não há
 * sessão; com sessão, avatar com as iniciais do usuário ("IGOR PEREIRA
 * LINS" → "IL") + contagem regressiva da sessão, abrindo um painel com
 * nome, e-mail, perfil, "Renovar sessão", "Usuários" (admin) e "Sair".
 * Fica dentro do AppHeader, que é usado por TODA página do app, então
 * 1 lugar só cobre o sistema inteiro.
 *
 * `mobile` é a versão do painel lateral (Sheet do AppHeader): bloco "Conta"
 * já aberto, sem popover dentro do Sheet. `onNavigate` fecha o Sheet. */
import { useLocation, useNavigate } from "react-router-dom";
import { Clock, LogOut, RefreshCw, Users } from "lucide-react";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useTempoSessao } from "@/hooks/useTempoSessao";
import { formatarTempoRestante } from "@/lib/sessao-expiracao";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AvatarIniciais } from "@/components/common/avatar-iniciais";

const ROTULO_PERFIL: Record<string, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  colaborador: "Colaborador",
  leitor: "Leitor",
};

type TempoSessao = ReturnType<typeof useTempoSessao>;

/** Texto curto da contagem, usado no botão do header. */
function textoContagem(tempo: TempoSessao): string | null {
  if (tempo.restanteMs === null) return null;
  return tempo.expirada ? "renovar" : formatarTempoRestante(tempo.restanteMs);
}

function CaixaSessao({ tempo }: { tempo: TempoSessao }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        tempo.emAlerta || tempo.expirada
          ? "border-warning/40 bg-warning/10"
          : "border-border bg-muted/40",
      )}
    >
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="size-3.5" aria-hidden="true" />
        Sessão
      </p>
      <p className="mt-0.5 text-sm font-medium text-foreground">
        {tempo.restanteMs === null ? (
          "Calculando…"
        ) : tempo.expirada ? (
          "Expirada — será renovada na próxima ação"
        ) : (
          <>
            Expira em{" "}
            <span className="font-mono tabular-nums">
              {formatarTempoRestante(tempo.restanteMs)}
            </span>
          </>
        )}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Renovada automaticamente enquanto você usa o sistema.
      </p>
      {tempo.falhouRenovacao && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          Não foi possível renovar. Entre novamente se o problema continuar.
        </p>
      )}
    </div>
  );
}

function PainelConta({
  tempo,
  onSair,
  onUsuarios,
  mobile,
}: {
  tempo: TempoSessao;
  onSair: () => void;
  onUsuarios?: () => void;
  mobile: boolean;
}) {
  const sessao = useAuthSession();
  const usuario = sessao.usuarioAtual;
  const botao = mobile ? "min-h-11 w-full justify-start px-3" : "justify-start";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <AvatarIniciais nome={usuario?.name} tamanho="lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {usuario?.name}
          </p>
          {usuario?.email && (
            <p className="truncate text-xs text-muted-foreground">
              {usuario.email}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {ROTULO_PERFIL[usuario?.role ?? ""] ?? "Leitor"}
          </p>
        </div>
      </div>

      <CaixaSessao tempo={tempo} />

      <div className="flex flex-col gap-1">
        <Button
          size={mobile ? "default" : "sm"}
          variant="outline"
          className={botao}
          disabled={tempo.renovando}
          onClick={() => void tempo.renovar()}
        >
          <RefreshCw
            className={cn("size-4", tempo.renovando && "animate-spin")}
            aria-hidden="true"
          />
          {tempo.renovando ? "Renovando…" : "Renovar sessão"}
        </Button>
        {onUsuarios && (
          <Button
            size={mobile ? "default" : "sm"}
            variant="ghost"
            className={botao}
            onClick={onUsuarios}
          >
            <Users className="size-4" aria-hidden="true" />
            Usuários
          </Button>
        )}
        <Button
          size={mobile ? "default" : "sm"}
          variant="ghost"
          className={cn(botao, "text-destructive hover:text-destructive")}
          onClick={onSair}
        >
          <LogOut className="size-4" aria-hidden="true" />
          Sair
        </Button>
      </div>
    </div>
  );
}

export function UserMenu({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
} = {}) {
  const sessao = useAuthSession();
  const tempo = useTempoSessao(sessao.autenticado);
  const navigate = useNavigate();
  const location = useLocation();

  function sairDaSessao() {
    void sessao.sair();
    navigate("/login", { replace: true });
    onNavigate?.();
  }

  function abrirUsuarios() {
    navigate("/admin/usuarios");
    onNavigate?.();
  }

  function abrirLogin() {
    navigate("/login", { state: { from: location.pathname } });
    onNavigate?.();
  }

  if (sessao.checandoSessao) return null;

  if (!sessao.autenticado) {
    if (mobile) {
      return (
        <div className="px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Conta
          </p>
          <Button
            variant="outline"
            className="mt-3 min-h-11 w-full justify-start"
            onClick={abrirLogin}
          >
            Entrar
          </Button>
        </div>
      );
    }
    return (
      <Button size="sm" variant="outline" onClick={abrirLogin}>
        Login
      </Button>
    );
  }

  const irParaUsuarios =
    sessao.usuarioAtual?.role === "admin" ? abrirUsuarios : undefined;

  if (mobile) {
    return (
      <div className="px-5 py-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Conta
        </p>
        <PainelConta
          tempo={tempo}
          onSair={sairDaSessao}
          onUsuarios={irParaUsuarios}
          mobile
        />
      </div>
    );
  }

  const contagem = textoContagem(tempo);
  const nome = sessao.usuarioAtual?.name ?? "usuário";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Menu de ${nome}${contagem && !tempo.expirada ? `, sessão expira em ${contagem}` : ""}`}
          className="flex items-center gap-2 rounded-full py-0.5 pr-2.5 pl-0.5 transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <AvatarIniciais nome={sessao.usuarioAtual?.name} />
          {contagem && (
            <span
              className={cn(
                "font-mono text-xs tabular-nums",
                tempo.emAlerta || tempo.expirada
                  ? "font-semibold text-warning-foreground"
                  : "text-muted-foreground",
              )}
            >
              {contagem}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <PainelConta
          tempo={tempo}
          onSair={sairDaSessao}
          onUsuarios={irParaUsuarios}
          mobile={false}
        />
      </PopoverContent>
    </Popover>
  );
}
