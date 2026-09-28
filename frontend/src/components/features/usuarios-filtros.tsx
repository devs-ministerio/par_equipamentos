import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UserRole, UserStatus } from "@/services/usuarios";

const PERFIS: Array<{ value: UserRole; label: string }> = [
  { value: "admin", label: "Administrador" },
  { value: "gestor", label: "Gestor" },
  { value: "colaborador", label: "Colaborador" },
  { value: "leitor", label: "Leitor" },
];

const STATUS: Array<{ value: UserStatus; label: string }> = [
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
  { value: "suspended", label: "Suspenso" },
];

export function UsuariosFiltros({
  busca,
  perfil,
  status,
  onBuscaChange,
  onPerfilChange,
  onStatusChange,
  onLimpar,
}: {
  busca: string;
  perfil: UserRole | "";
  status: UserStatus | "";
  onBuscaChange: (value: string) => void;
  onPerfilChange: (value: UserRole | "") => void;
  onStatusChange: (value: UserStatus | "") => void;
  onLimpar: () => void;
}) {
  const temFiltro = Boolean(busca || perfil || status);

  return (
    <section
      aria-label="Filtros de usuários"
      className="mb-5 border-y border-border bg-muted/35 py-3"
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1 sm:min-w-[17rem]">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Buscar usuários"
            placeholder="Buscar por nome ou e-mail"
            value={busca}
            onChange={(event) => onBuscaChange(event.target.value)}
            className="h-9 bg-background pl-9"
          />
        </div>
        <label className="sr-only" htmlFor="filtro-perfil-usuario">
          Filtrar por perfil
        </label>
        <select
          id="filtro-perfil-usuario"
          value={perfil}
          onChange={(event) =>
            onPerfilChange(event.target.value as UserRole | "")
          }
          className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary"
        >
          <option value="">Todos os perfis</option>
          {PERFIS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="filtro-status-usuario">
          Filtrar por status
        </label>
        <select
          id="filtro-status-usuario"
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as UserStatus | "")
          }
          className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary"
        >
          <option value="">Todos os status</option>
          {STATUS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        {temFiltro && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onLimpar}
            className="w-fit text-muted-foreground"
          >
            <X aria-hidden="true" /> Limpar
          </Button>
        )}
      </div>
    </section>
  );
}
