/** Correção dos dados físicos de uma unidade (vai para o AuditLog com antes e depois). */
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import type {
  CorrigirUnidadeInput,
  UnidadeEquipamento,
} from "@/services/entregas-equipamento";
import { ErroCampo, estiloInput } from "./monitoramento-ui";

export function EquipamentosInstrumentoEditarUnidade({
  unidade,
  onSalvar,
  onFechar,
}: {
  unidade: UnidadeEquipamento;
  onSalvar: (corpo: CorrigirUnidadeInput) => Promise<void>;
  onFechar: () => void;
}) {
  const id = useId();
  const [marca, setMarca] = useState(unidade.marca ?? "");
  const [modelo, setModelo] = useState(unidade.modelo ?? "");
  const [serie, setSerie] = useState(unidade.numero_serie ?? "");
  const [vida, setVida] = useState(String(unidade.vida_util_anos ?? ""));
  const [erro, setErro] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    setErro(undefined);
    setEnviando(true);
    try {
      await onSalvar({
        marca: marca.trim() || null,
        modelo: modelo.trim() || null,
        numero_serie: serie.trim() || null,
        vida_util_anos: vida ? Number(vida) : null,
      });
      onFechar();
    } catch (e) {
      setErro(mensagemSeguraDoErro(e));
    } finally {
      setEnviando(false);
    }
  }

  const campo = (
    rotulo: string,
    valor: string,
    set: (v: string) => void,
    tipo = "text",
  ) => (
    <label className="text-[11px]">
      {rotulo}
      <input
        type={tipo}
        min={tipo === "number" ? 0 : undefined}
        value={valor}
        onChange={(e) => set(e.target.value)}
        className={cn(estiloInput, "w-full")}
      />
    </label>
  );

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Corrigir unidade {unidade.ordem}</DialogTitle>
          <DialogDescription>
            A correção fica registrada com os valores anteriores.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {campo("Marca", marca, setMarca)}
          {campo("Modelo", modelo, setModelo)}
          {campo("Número de série", serie, setSerie)}
          {campo("Vida útil (anos)", vida, setVida, "number")}
        </div>
        <ErroCampo id={`${id}-erro`} mensagem={erro} />
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={enviando}>
            {enviando ? "Salvando..." : "Salvar correção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
