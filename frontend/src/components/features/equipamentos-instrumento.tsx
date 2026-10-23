/** Seção "Equipamentos do instrumento": itens controlados por unidade, registro
 * de entrega com multisseleção, correção/exclusão e vínculo de entregas antigas. */
import { useState } from "react";
import { ErrorAlert } from "@/components/common/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCorrigirUnidade,
  useEntregasLegadas,
  useEquipamentosInstrumento,
  useExcluirEntrega,
  useRegistrarEntrega,
  useVincularEntregaLegada,
} from "@/hooks/useEquipamentosInstrumento";
import { ApiError, mensagemSeguraDoErro } from "@/lib/api-error";
import type { UnidadeEquipamento } from "@/services/entregas-equipamento";
import { EquipamentosInstrumentoEditarUnidade } from "./equipamentos-instrumento-editar-unidade";
import { EquipamentosInstrumentoFormEntrega } from "./equipamentos-instrumento-form-entrega";
import { EquipamentosInstrumentoLista } from "./equipamentos-instrumento-lista";
import { estiloInput, SecaoOperacional } from "./monitoramento-ui";

type Painel =
  | { tipo: "entrega"; itemId?: number }
  | { tipo: "legado"; revisaoId: number; data: string | null }
  | null;

export function EquipamentosInstrumento({
  numeroConvenio,
  podeEditarInstrumento,
  aoSessaoInvalida,
}: {
  numeroConvenio: string;
  podeEditarInstrumento: boolean;
  aoSessaoInvalida: () => void;
}) {
  const consulta = useEquipamentosInstrumento(numeroConvenio);
  const legadas = useEntregasLegadas();
  const registrar = useRegistrarEntrega(numeroConvenio);
  const vincular = useVincularEntregaLegada(numeroConvenio);
  const corrigir = useCorrigirUnidade(numeroConvenio);
  const excluir = useExcluirEntrega(numeroConvenio);
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
  const revisao = legadas.data?.find((r) => r.nr_convenio === numeroConvenio);

  return (
    <SecaoOperacional
      titulo="Equipamentos do instrumento"
      cartao
      acao={
        podeEditar ? (
          <button
            type="button"
            className={`${estiloInput} cursor-pointer bg-transparent text-primary border border-primary font-semibold py-1 px-2.5`}
            onClick={() => setPainel({ tipo: "entrega" })}
            disabled={dados.itens.length === 0}
          >
            Registrar entrega
          </button>
        ) : undefined
      }
    >
      {erro && <ErrorAlert mensagem={erro} />}
      {revisao && (
        <div
          role="status"
          className="mb-3 rounded-md border border-destructive/30 bg-destructive-bg/40 p-2.5 text-[12.5px]"
        >
          Entrega registrada antes do controle por unidade
          {revisao.data_ocorrencia
            ? ` (em ${revisao.data_ocorrencia.split("-").reverse().join("/")})`
            : ""}
          : vincule aos itens.{" "}
          {podeEditar && (
            <button
              type="button"
              className="font-semibold underline"
              onClick={() =>
                setPainel({
                  tipo: "legado",
                  revisaoId: revisao.id,
                  data: revisao.data_ocorrencia,
                })
              }
            >
              Vincular agora
            </button>
          )}
        </div>
      )}
      {dados.itens.length === 0 ? (
        <p className="m-0 text-[12.5px] text-muted-foreground">
          Este instrumento não tem itens do plano controlados por unidade.
        </p>
      ) : (
        <EquipamentosInstrumentoLista
          itens={dados.itens}
          podeEditar={podeEditar}
          onRegistrar={(itemId) => setPainel({ tipo: "entrega", itemId })}
          onCorrigir={setUnidade}
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
              await escrever(() =>
                registrar.mutateAsync({
                  chave_idempotencia: envio.chave,
                  data_ocorrencia: envio.dataOcorrencia,
                  observacao: envio.observacao,
                  itens: envio.itens,
                }),
              );
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
