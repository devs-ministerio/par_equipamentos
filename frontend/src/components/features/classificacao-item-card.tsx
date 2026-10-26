/** Um item da fila: texto completo, motivo e as três ações (confirmar, corrigir, não é equipamento). */
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { ROTULO_TIPO } from "@/lib/classificacao-rotulos";
import { cn } from "@/lib/utils";
import {
  type DecisaoItemInput,
  type ItemParaRevisao,
  TIPOS_LANCAMENTO,
  type TipoLancamento,
} from "@/services/classificacao-itens";
import { ErroCampo, estiloInput } from "./monitoramento-ui";

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function ClassificacaoItemCard({
  item,
  onDecidir,
}: {
  item: ItemParaRevisao;
  onDecidir: (corpo: DecisaoItemInput) => Promise<void>;
}) {
  const id = useId();
  const [corrigindo, setCorrigindo] = useState(false);
  const [tipo, setTipo] = useState<TipoLancamento>("aquisicao");
  const [codigo, setCodigo] = useState(item.codigo_item ?? "");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  async function enviar(corpo: DecisaoItemInput) {
    setErro(undefined);
    setEnviando(true);
    try {
      await onDecidir({ ...corpo, observacao: observacao.trim() || undefined });
    } catch (e) {
      setErro(mensagemSeguraDoErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <p className="m-0 text-xs text-muted-foreground">
        Convênio {item.convenio_numero}
        {item.valor_total != null && ` · ${moeda.format(item.valor_total)}`}
      </p>
      <p className="m-0 mt-1 break-words text-[13px]">{item.descricao}</p>
      <p className="m-0 mt-2 text-xs">
        <strong>Sugestão:</strong> {ROTULO_TIPO[item.tipo_lancamento]}
        {item.familia && ` · ${item.familia}`}
        {item.codigo_item && ` · ${item.codigo_item}`}
      </p>
      {item.motivo && (
        <p className="m-0 mt-1 text-xs text-muted-foreground">{item.motivo}</p>
      )}
      <div className="mt-3 grid gap-2">
        <label className="text-[11px]" htmlFor={`${id}-obs`}>
          Observação
        </label>
        <input
          id={`${id}-obs`}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          className={cn(estiloInput, "w-full")}
        />
        {corrigindo && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[11px]">
              Tipo
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoLancamento)}
                className={cn(estiloInput, "w-full")}
              >
                {TIPOS_LANCAMENTO.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO[t]}
                  </option>
                ))}
              </select>
            </label>
            {tipo === "aquisicao" && (
              <label className="text-[11px]">
                Código RENEM
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  className={cn(estiloInput, "w-full")}
                />
              </label>
            )}
          </div>
        )}
        <ErroCampo id={`${id}-erro`} mensagem={erro} />
        <div className="flex flex-wrap gap-2">
          {corrigindo ? (
            <>
              <Button
                size="sm"
                disabled={enviando}
                onClick={() =>
                  enviar({
                    acao: "corrigir",
                    tipo_lancamento: tipo,
                    codigo_item:
                      tipo === "aquisicao" && codigo ? codigo : undefined,
                  })
                }
              >
                Salvar correção
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCorrigindo(false)}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                disabled={enviando || item.tipo_lancamento === "multiplo"}
                onClick={() => enviar({ acao: "confirmar" })}
              >
                Confirmar sugestão
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCorrigindo(true)}
              >
                Corrigir
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={enviando}
                onClick={() => enviar({ acao: "nao_equipamento" })}
              >
                Não é equipamento
              </Button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
