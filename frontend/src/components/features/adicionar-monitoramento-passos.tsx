import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Campo, estiloInput } from "./monitoramento-ui";
import {
  AvisoCandidatos,
  type Candidato,
} from "./adicionar-monitoramento-aviso";
import type { DadosAdicionarMonitoramento } from "./adicionar-monitoramento-button";

export function PassoFormulario({
  dados,
  candidatos,
  tecnicoTitular,
  onTecnico,
  colaboradores,
  carregando,
  erro,
  onCancelar,
  onConfirmar,
}: {
  dados: DadosAdicionarMonitoramento;
  candidatos: Candidato[];
  tecnicoTitular: string;
  onTecnico: (valor: string) => void;
  colaboradores: { id: number; name: string }[];
  carregando: boolean;
  erro: string | null;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Adicionar {dados.referencia} ao monitoramento interno
        </DialogTitle>
        <DialogDescription>
          {dados.descricao}. Informe o técnico titular responsável.
        </DialogDescription>
      </DialogHeader>

      <AvisoCandidatos candidatos={candidatos} />

      <div>
        <label
          htmlFor="tecnico-titular-novo"
          className="text-[11px] text-muted-foreground block mb-1"
        >
          Técnico titular responsável
        </label>
        <select
          id="tecnico-titular-novo"
          className={`${estiloInput} w-full bg-background`}
          value={tecnicoTitular}
          onChange={(e) => onTecnico(e.target.value)}
          autoFocus
          disabled={carregando}
        >
          <option value="">— Selecione o colaborador —</option>
          {colaboradores.map((colaborador) => (
            <option key={colaborador.id} value={colaborador.id}>
              {colaborador.name}
            </option>
          ))}
        </select>
        {erro && <p className="text-xs text-destructive mt-1.5">{erro}</p>}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button onClick={onConfirmar}>Confirmar</Button>
      </DialogFooter>
    </>
  );
}

export function PassoConfirmacao({
  dados,
  tecnicoTitular,
  erro,
  enviando,
  onVoltar,
  onAdicionar,
}: {
  dados: DadosAdicionarMonitoramento;
  tecnicoTitular: string;
  erro: string | null;
  enviando: boolean;
  onVoltar: () => void;
  onAdicionar: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Confirma a inclusão?</DialogTitle>
        <DialogDescription>
          Revise antes de criar -- essa ação fica registrada no histórico do
          sistema.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-background p-3">
        <Campo label="Instrumento">{dados.referencia}</Campo>
        <Campo label="Convenente">{dados.nome_convenente}</Campo>
        <Campo label="Município/UF">
          {dados.municipio || "—"}/{dados.uf || "—"}
        </Campo>
        <Campo label="Técnico titular">{tecnicoTitular.trim()}</Campo>
      </div>
      {erro && <p className="text-xs text-destructive mt-1.5">{erro}</p>}

      <DialogFooter>
        <Button variant="outline" onClick={onVoltar} disabled={enviando}>
          Voltar
        </Button>
        <Button onClick={onAdicionar} disabled={enviando}>
          {enviando ? "Adicionando..." : "Sim, adicionar"}
        </Button>
      </DialogFooter>
    </>
  );
}
