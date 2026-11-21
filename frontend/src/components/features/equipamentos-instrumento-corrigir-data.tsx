/** Correção da data de uma entrega: a data das unidades e a do evento do cronograma andam juntas. */
import { useId, useState } from "react";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { ErroCampo, estiloInput } from "./monitoramento-ui";

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CorrigirDataEntrega({
  dataAtual,
  onCorrigir,
  onCancelar,
}: {
  dataAtual: string;
  onCorrigir: (data: string, motivo: string) => Promise<void>;
  onCancelar: () => void;
}) {
  const id = useId();
  const [data, setData] = useState(dataAtual);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar() {
    if (!data || data > hoje()) {
      setErro("Informe uma data que não esteja no futuro.");
      return;
    }
    if (data === dataAtual) {
      setErro("A entrega já está com esta data.");
      return;
    }
    if (motivo.trim().length < 3) {
      setErro("Explique o motivo (mínimo 3 caracteres).");
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      await onCorrigir(data, motivo.trim());
    } catch (e) {
      setErro(mensagemSeguraDoErro(e));
      setEnviando(false);
    }
  }

  return (
    <div className="mt-2 grid gap-2 rounded-md border border-border bg-background p-2.5">
      <label
        htmlFor={`${id}-data`}
        className="text-[11px] text-muted-foreground"
      >
        Data da entrega
      </label>
      <input
        id={`${id}-data`}
        type="date"
        max={hoje()}
        className={cn(estiloInput, "w-44 bg-background")}
        value={data}
        onChange={(e) => setData(e.target.value)}
      />
      <label
        htmlFor={`${id}-motivo`}
        className="text-[11px] text-muted-foreground"
      >
        Motivo
      </label>
      <textarea
        id={`${id}-motivo`}
        aria-invalid={Boolean(erro)}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className={cn(estiloInput, "min-h-[50px] w-full bg-background")}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
      />
      <ErroCampo id={`${id}-erro`} mensagem={erro ?? undefined} />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={enviando}
          onClick={() => void enviar()}
          className={cn(
            estiloInput,
            "cursor-pointer border border-primary bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground",
          )}
        >
          {enviando ? "Salvando…" : "Salvar data"}
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={onCancelar}
          className={cn(
            estiloInput,
            "cursor-pointer bg-transparent px-3 py-1 text-xs",
          )}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
