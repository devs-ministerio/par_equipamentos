/** Seção "Documentos": NF, OS, TRP, TRD, SCRA e licença da CNEN. Não altera a fase. */
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ErrorAlert } from "@/components/common/error-alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCorrigirDocumento,
  useDocumentosInstrumento,
  useExcluirDocumento,
  useRegistrarDocumento,
} from "@/hooks/useDocumentosInstrumento";
import { ApiError, mensagemSeguraDoErro } from "@/lib/api-error";
import { ROTULOS_DOCUMENTO } from "@/lib/documento-rotulos";
import { diasAte, fmtData } from "@/lib/monitoramento-format";
import { classeValidade } from "@/lib/monitoramento-status";
import { cn } from "@/lib/utils";
import type { DocumentoInstrumento } from "@/services/documentos-instrumento";
import { DocumentosInstrumentoForm } from "./documentos-instrumento-form";
import { botaoIcone } from "./equipamentos-instrumento-unidades";
import {
  ConfirmarExclusaoComMotivo,
  SecaoOperacional,
} from "./monitoramento-ui";

/** Licença deferida mostra o prazo; as demais só a validade informada. */
function Validade({ documento }: { documento: DocumentoInstrumento }) {
  const dias =
    documento.tipo === "cnen_licenca" && documento.status === "Deferido"
      ? diasAte(documento.data_validade)
      : null;
  if (dias === null)
    return (
      <span className="text-muted-foreground">
        Validade {fmtData(documento.data_validade)}
      </span>
    );
  return (
    <span className={cn("font-semibold", classeValidade(dias))}>
      {dias < 0
        ? `Vencida há ${Math.abs(dias)} dia(s) (${fmtData(documento.data_validade)})`
        : `Vence em ${dias} dia(s) (${fmtData(documento.data_validade)})`}
    </span>
  );
}

export function DocumentosInstrumento({
  numeroConvenio,
  podeEditarInstrumento,
  aoSessaoInvalida,
}: {
  numeroConvenio: string;
  podeEditarInstrumento: boolean;
  aoSessaoInvalida: () => void;
}) {
  const consulta = useDocumentosInstrumento(numeroConvenio);
  const registrar = useRegistrarDocumento(numeroConvenio);
  const corrigir = useCorrigirDocumento(numeroConvenio);
  const excluir = useExcluirDocumento(numeroConvenio);
  const [form, setForm] = useState<{ documento?: DocumentoInstrumento } | null>(
    null,
  );
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function escrever<T>(acao: () => Promise<T>): Promise<T> {
    setErro(null);
    try {
      return await acao();
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403))
        aoSessaoInvalida();
      setErro(mensagemSeguraDoErro(e));
      throw e;
    }
  }

  if (consulta.error) {
    return (
      <ErrorAlert
        mensagem={mensagemSeguraDoErro(consulta.error)}
        onRetry={() => consulta.refetch()}
      />
    );
  }
  if (!consulta.data) {
    return (
      <Skeleton
        className="mb-4 h-24 w-full"
        role="status"
        aria-label="Carregando documentos"
      />
    );
  }
  const podeEditar = podeEditarInstrumento && consulta.data.pode_editar;
  const documentos = consulta.data.documentos;

  return (
    <SecaoOperacional
      titulo="Documentos"
      cartao
      acao={
        podeEditar ? (
          <Button size="sm" variant="outline" onClick={() => setForm({})}>
            <Plus className="size-4" aria-hidden="true" />
            Registrar documento
          </Button>
        ) : undefined
      }
    >
      {erro && <ErrorAlert mensagem={erro} />}
      {documentos.length === 0 ? (
        <p className="m-0 text-[12.5px] text-muted-foreground">
          Nenhum documento registrado.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {documentos.map((d) => (
            <li
              key={d.id}
              className="rounded-md bg-muted/40 px-3 py-2 text-[12.5px]"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <strong>{ROTULOS_DOCUMENTO[d.tipo]}</strong>
                {d.numero && <span>Nº {d.numero}</span>}
                <span className="text-muted-foreground">
                  {fmtData(d.data_documento)}
                </span>
                {d.status && <span>{d.status}</span>}
                {d.data_validade && <Validade documento={d} />}
                {podeEditar && (
                  <span className="ml-auto flex gap-1.5">
                    <button
                      type="button"
                      className={botaoIcone}
                      aria-label={`Corrigir ${ROTULOS_DOCUMENTO[d.tipo]} ${d.numero ?? ""}`.trim()}
                      title="Corrigir"
                      onClick={() => setForm({ documento: d })}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={botaoIcone}
                      aria-label={`Excluir ${ROTULOS_DOCUMENTO[d.tipo]} ${d.numero ?? ""}`.trim()}
                      title="Excluir"
                      onClick={() => setExcluindo(d.id)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </span>
                )}
              </div>
              {d.observacao && (
                <p className="m-0 mt-1 text-muted-foreground">{d.observacao}</p>
              )}
              {excluindo === d.id && (
                <ConfirmarExclusaoComMotivo
                  onCancelar={() => setExcluindo(null)}
                  onExcluir={async (motivo) => {
                    await escrever(() =>
                      excluir.mutateAsync({ id: d.id, motivo }),
                    );
                    setExcluindo(null);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {form && (
        <DocumentosInstrumentoForm
          documento={form.documento}
          onFechar={() => setForm(null)}
          onSalvar={async (corpo) => {
            const documento = form.documento;
            await escrever(() =>
              documento
                ? corrigir.mutateAsync({ id: documento.id, corpo })
                : registrar.mutateAsync(corpo),
            );
          }}
        />
      )}
    </SecaoOperacional>
  );
}
