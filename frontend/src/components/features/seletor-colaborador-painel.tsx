import { ChevronDown, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Tecnico {
  id: number;
  nome: string;
  ufs: string[];
}

/** Botão de escolha do colaborador (gestor/admin), no mesmo padrão do atalho "Meu painel". */
export function SeletorColaboradorPainel({
  tecnicos,
  colaboradorId,
  onSelecionar,
}: {
  tecnicos: Tecnico[];
  colaboradorId: number | undefined;
  onSelecionar: (id: number | undefined) => void;
}) {
  const nomeSelecionado =
    tecnicos.find((t) => t.id === colaboradorId)?.nome ??
    "Todos os colaboradores";
  return (
    <Button asChild size="sm" className="relative mt-0.5 w-full cursor-pointer">
      <label>
        <Users aria-hidden="true" />
        <span className="truncate">{nomeSelecionado}</span>
        <ChevronDown aria-hidden="true" />
        <select
          aria-label="Colaborador"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={colaboradorId ?? ""}
          onChange={(e) =>
            onSelecionar(e.target.value ? Number(e.target.value) : undefined)
          }
        >
          <option value="">Todos os colaboradores</option>
          {tecnicos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
              {t.ufs.length > 0 ? ` (${t.ufs.join(", ")})` : ""}
            </option>
          ))}
        </select>
      </label>
    </Button>
  );
}
