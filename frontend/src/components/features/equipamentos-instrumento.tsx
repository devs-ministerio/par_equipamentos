/** Seção "Equipamentos do instrumento": itens controlados por unidade, registro
 * de entrega com multisseleção, correção/exclusão e vínculo de entregas antigas. */
import { useState } from "react";
import { ErrorAlert } from "@/components/common/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCorrigirUnidade,
  useEquipamentosInstrumento,
  useCancelarUnidade,
  useDefinirPrevisaoEntrega,
  useRemoverPrevisaoEntrega,
  useExcluirEntrega,
  useReativarUnidade,
  useRegistrarEntrega,
  useVincularEntregaLegada,
} from "@/hooks/useEquipamentosInstrumento";
import {
  useConfirmarRepasse,
  useSituacaoRepasse,
} from "@/hooks/useRepasseInstrumento";
import { ApiError, mensagemSeguraDoErro } from "@/lib/api-error";
import type { UnidadeEquipamento } from "@/services/entregas-equipamento";
import { RepasseConfirmarDialog } from "./repasse-confirmar-dialog";
import { EquipamentosInstrumentoEditarUnidade } from "./equipamentos-instrumento-editar-unidade";
import { EquipamentosInstrumentoFormEntrega } from "./equipamentos-instrumento-form-entrega";
import { EquipamentosInstrumentoLista } from "./equipamentos-instrumento-lista";
import { SecaoOperacional } from "./monitoramento-ui";

type Painel =
  | { tipo: "entrega"; itemId?: number }
  | { tipo: "legado"; revisaoId: number; data: string | null }
  | null;

export function EquipamentosInstrumento({
  numeroConvenio,
  podeEditarInstrumento,
  aoSessaoInvalida,
  previsaoInauguracao,
  inauguracaoRealizada = false,
}: {
  previsaoInauguracao?: string | null;
  inauguracaoRealizada?: boolean;
  numeroConvenio: string;
  podeEditarInstrumento: boolean;
  aoSessaoInvalida: () => void;
}) {
  const consulta = useEquipamentosInstrumento(numeroConvenio);
  const registrar = useRegistrarEntrega(numeroConvenio);
  const vincular = useVincularEntregaLegada(numeroConvenio);
  const corrigir = useCorrigirUnidade(numeroConvenio);
  const excluir = useExcluirEntrega(numeroConvenio);
  const cancelar = useCancelarUnidade(numeroConvenio);
  const reativar = useReativarUnidade(numeroConvenio);
  const definirPrevisao = useDefinirPrevisaoEntrega(numeroConvenio);
  const removerPrevisao = useRemoverPrevisaoEntrega(numeroConvenio);
  const repasse = useSituacaoRepasse(numeroConvenio);
  const confirmarRepasse = useConfirmarRepasse(numeroConvenio);
  const [pedidoRepasse, setPedidoRepasse] = useState<
    ((confirmado: boolean) => void) | null
  >(null);
  const [painel, setPainel] = useState<Painel>(null);
  const [unidade, setUnidade] = useState<UnidadeEquipamento | null>(null);
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

  /** Sem repasse confirmado, a entrega só segue depois da confirmação (integral ou parcial). */
  function pedirRepasse(): Promise<boolean> {
    return new Promise((resolver) => setPedidoRepasse(() => resolver));
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
        aria-label="Carregando equipamentos"
      />
    );
  }
  const dados = consulta.data;
  const podeEditar = podeEditarInstrumento && dados.pode_editar;

  return (
    <SecaoOperacional titulo="Equipamentos do instrumento" cartao>
      {erro && <ErrorAlert mensagem={erro} />}
      {dados.itens.length === 0 ? (
        <p className="m-0 text-[12.5px] text-muted-foreground">
          Sem itens controlados.
        </p>
      ) : (
        <EquipamentosInstrumentoLista
          itens={dados.itens}
          podeEditar={podeEditar}
          onRegistrar={(itemId) => setPainel({ tipo: "entrega", itemId })}
          onCorrigir={setUnidade}
          onDefinirPrevisao={(itemId, dataPrevista) =>
            escrever(() =>
              definirPrevisao.mutateAsync({ itemId, dataPrevista }),
            ).then(() => undefined)
          }
          onRemoverPrevisao={(itemId, motivo) =>
            escrever(() =>
              removerPrevisao.mutateAsync({ itemId, motivo }),
            ).then(() => undefined)
          }
          onCancelarUnidade={(itemId, motivo) =>
            escrever(() => cancelar.mutateAsync({ itemId, motivo })).then(
              () => undefined,
            )
          }
          onDesfazerCancelamento={(cancelamentoId, motivo) =>
            escrever(() =>
              reativar.mutateAsync({ cancelamentoId, motivo }),
            ).then(() => undefined)
          }
          onExcluirEntrega={(entregaId, motivo) =>
            escrever(() => excluir.mutateAsync({ entregaId, motivo })).then(
              () => undefined,
            )
          }
        />
      )}
      {dados.outros_itens > 0 && (
        <p className="m-0 mt-3 text-[11.5px] text-muted-foreground">
          + {dados.outros_itens} outro(s) item(ns) do plano sem controle por
          unidade
        </p>
      )}
      {painel && (
        <EquipamentosInstrumentoFormEntrega
          itens={dados.itens}
          apenasItemId={painel.tipo === "entrega" ? painel.itemId : undefined}
          dataLegada={
            painel.tipo === "legado" ? (painel.data ?? "") : undefined
          }
          previsaoInauguracao={previsaoInauguracao}
          perguntarInauguracao={!inauguracaoRealizada}
          onFechar={() => setPainel(null)}
          onEnviar={async (envio) => {
            if (painel.tipo === "legado") {
              await escrever(() =>
                vincular.mutateAsync({
                  revisaoId: painel.revisaoId,
                  itens: envio.itens,
                }),
              );
            } else {
              if (repasse.data && repasse.data.repasse === null) {
                const confirmado = await pedirRepasse();
                if (!confirmado) throw new Error("Repasse não confirmado.");
              }
              await escrever(() =>
                registrar.mutateAsync({
                  chave_idempotencia: envio.chave,
                  data_ocorrencia: envio.dataOcorrencia,
                  observacao: envio.observacao,
                  itens: envio.itens,
                  inauguracao: envio.inauguracao
                    ? {
                        necessaria: envio.inauguracao.necessaria,
                        data_prevista: envio.inauguracao.dataPrevista,
                      }
                    : null,
                }),
              );
            }
          }}
        />
      )}
      {pedidoRepasse && (
        <RepasseConfirmarDialog
          onFechar={() => {
            pedidoRepasse(false);
            setPedidoRepasse(null);
          }}
          onConfirmar={async (valores) => {
            try {
              await confirmarRepasse.mutateAsync({
                tipo: valores.tipo,
                justificativa: valores.justificativa || null,
              });
              pedidoRepasse(true);
              setPedidoRepasse(null);
            } catch (e) {
              if (
                e instanceof ApiError &&
                (e.status === 401 || e.status === 403)
              )
                aoSessaoInvalida();
              setErro(mensagemSeguraDoErro(e));
            }
          }}
        />
      )}
      {unidade && (
        <EquipamentosInstrumentoEditarUnidade
          unidade={unidade}
          onFechar={() => setUnidade(null)}
          onSalvar={(corpo) =>
            escrever(() =>
              corrigir.mutateAsync({ unidadeId: unidade.id, corpo }),
            ).then(() => undefined)
          }
        />
      )}
    </SecaoOperacional>
  );
}
