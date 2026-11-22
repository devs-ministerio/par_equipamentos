/** Form "Lançar evento" -- React Hook Form + zod, campos condicionais por
 * grupo/código do marco selecionado (regulatório pede status/documento/
 * validade; marco de entrega pede o equipamento físico). Extraído de
 * MonitoramentoInterno.tsx. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId } from "react";
import { useForm } from "react-hook-form";
import { avisoMarcoIndisponivel } from "@/lib/marcos-por-fase";
import { cn } from "@/lib/utils";
import type { MarcoCatalogo } from "@/services/monitoramento-marcos";
import {
  enviarEventoSchema,
  type EnviarEventoFormValues,
} from "@/lib/validations/monitoramento";
import { ErroCampo, estiloCard, estiloInput } from "./monitoramento-ui";
import { idsDescricaoCampo } from "@/lib/monitoramento-status";

const STATUS_REGULATORIO_OPCOES = [
  "NI",
  "NA",
  "Em análise",
  "Em diligência",
  "Deferido",
  "Indeferido",
];

/** Só o cronograma é lançado aqui; o regulatório (licença, SCRA, matrícula) tem registro próprio em Documentos. */
const GRUPOS: { chave: MarcoCatalogo["grupo"]; rotulo: string }[] = [
  { chave: "cronograma_fisico", rotulo: "Cronograma" },
];

/** A entrega passou a ser lançada em "Equipamentos do instrumento". */
const MARCO_ENTREGA_NO_ESTABELECIMENTO = "cronograma_entrega";
/** Documentos têm registro próprio (cartão Documentos); a fase é calculada e não se lança. */
const MARCOS_DE_DOCUMENTO = [
  "cronograma_ordem_servico",
  "cronograma_trp",
  "cronograma_trd",
  "regulatorio_licenca_operacao",
  "regulatorio_modificacao_casamata",
  "regulatorio_descomissionamento",
  // A inauguração é registrada na entrega do equipamento, não aqui.
  "cronograma_previsao_inauguracao",
  "cronograma_inauguracao_dispensada",
  // Sem uso no fluxo novo; ficam só no histórico.
  "cronograma_obra_ponto_critico",
  "cronograma_chegada_obra",
];

export function MonitoramentoInternoFormEvento({
  marcos,
  onRegistrar,
  valoresIniciais,
  marcoFixo,
  fase,
  rotuloSubmit = "Registrar evento",
  onCancelar,
}: {
  marcos: MarcoCatalogo[];
  onRegistrar: (valores: EnviarEventoFormValues) => Promise<void>;
  /** Pré-preenche o form pra correção (Plan Mode monitoramento-evolucao
   * 2026-09-19) -- "editar" é sempre uma correção append-only, nunca um
   * UPDATE do lançamento original. */
  valoresIniciais?: Partial<EnviarEventoFormValues>;
  /** Em modo correção o marco/instrumento do evento original nunca mudam
   * (ver docstring do backend) -- mostra o marco como texto fixo em vez de
   * select editável. */
  marcoFixo?: MarcoCatalogo;
  /** Fase calculada do instrumento: marcos fora da janela aparecem desabilitados com o motivo. */
  fase?: string | null;
  rotuloSubmit?: string;
  /** Descarta a edição aberta sem enviar nada. */
  onCancelar?: () => void;
}) {
  const formId = useId();
  const campoId = (nome: string) => `${formId}-${nome}`;
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EnviarEventoFormValues>({
    resolver: zodResolver(enviarEventoSchema),
    defaultValues:
      valoresIniciais ??
      (marcoFixo ? { marcoId: String(marcoFixo.id) } : undefined),
  });

  const marcoIdSelecionado = watch("marcoId");
  const marcoDoForm =
    marcoFixo ?? marcos.find((m) => String(m.id) === marcoIdSelecionado);
  const ehRegulatorio = marcoDoForm?.grupo === "regulatorio";
  const ehLicencaOperacao =
    marcoDoForm?.codigo === "regulatorio_licenca_operacao";
  // Achado 2026-09-09, 2a rodada (pedido do usuario: "o equipamento
  // entregue pode mover para eventos") -- so o marco de entrega pede os
  // campos fisicos, junto do mesmo lancamento.
  const ehEntrega = marcoDoForm?.codigo === "cronograma_entrega";

  useEffect(() => {
    if (marcoDoForm?.grupo === "fase_geral") setValue("dataPrevista", "");
  }, [marcoDoForm?.grupo, setValue]);

  async function aoSubmeter(valores: EnviarEventoFormValues) {
    try {
      await onRegistrar(valores);
    } catch {
      // Erro de escrita vira o banner global da página.
    }
  }

  return (
    <>
      <form
        onSubmit={handleSubmit(aoSubmeter)}
        className={cn(
          marcoFixo ? "border-t border-border pt-3" : estiloCard,
          "mb-4 grid min-w-0 gap-2.5",
        )}
      >
        <div className="flex gap-2.5 flex-wrap items-start">
          <div className="min-w-0 flex-1 basis-full sm:min-w-60 sm:basis-auto">
            <label
              htmlFor={campoId("evento-marco")}
              className="text-[11px] text-muted-foreground block mb-1"
            >
              Marco
            </label>
            {marcoFixo ? (
              // Corrigir não muda o marco/instrumento do lançamento original
              // (ver docstring do backend) -- mostra fixo em vez de editável.
              <div
                className={cn(
                  estiloInput,
                  "w-full bg-background text-muted-foreground",
                )}
              >
                {marcoFixo.rotulo}
              </div>
            ) : (
              <select
                id={campoId("evento-marco")}
                className={cn(estiloInput, "w-full")}
                aria-invalid={Boolean(errors.marcoId)}
                aria-describedby={idsDescricaoCampo(
                  campoId("evento-marco"),
                  Boolean(errors.marcoId),
                  false,
                )}
                defaultValue=""
                {...register("marcoId")}
              >
                <option value="" disabled>
                  Selecione o marco...
                </option>
                {GRUPOS.map(({ chave, rotulo }) => (
                  <optgroup key={chave} label={rotulo}>
                    {marcos
                      .filter(
                        (m) =>
                          m.grupo === chave &&
                          m.codigo !== MARCO_ENTREGA_NO_ESTABELECIMENTO &&
                          !MARCOS_DE_DOCUMENTO.includes(m.codigo),
                      )
                      .map((m) => (
                        <option
                          key={m.id}
                          value={m.id}
                          disabled={Boolean(
                            avisoMarcoIndisponivel(m.codigo, fase),
                          )}
                        >
                          {m.rotulo}
                          {avisoMarcoIndisponivel(m.codigo, fase)
                            ? ` — ${avisoMarcoIndisponivel(m.codigo, fase)}`
                            : ""}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            )}
            <ErroCampo
              id={campoId("evento-marco-error")}
              mensagem={errors.marcoId?.message}
            />
          </div>
          <div className="w-full sm:w-auto">
            {/* Rotulo dinamico -- pedido do usuario 2026-09-09: "a licenca
              cnen vamos precisar da data da licença e da data de validade
              da licença", nao so um icone de calendario com tooltip. */}
            <label
              htmlFor={campoId("evento-data-ocorrencia")}
              className="text-[11px] text-muted-foreground block mb-1"
            >
              {ehLicencaOperacao
                ? "Data da licença"
                : ehRegulatorio
                  ? "Data do documento"
                  : "Data de ocorrência"}
            </label>
            <input
              id={campoId("evento-data-ocorrencia")}
              type="date"
              className={cn(estiloInput, "w-full")}
              {...register("dataOcorrencia")}
            />
          </div>
          {marcoDoForm?.grupo !== "fase_geral" && (
            <div className="w-full sm:w-auto">
              <label
                htmlFor={campoId("evento-data-prevista")}
                className="text-[11px] text-muted-foreground block mb-1"
              >
                Data prevista
              </label>
              <input
                id={campoId("evento-data-prevista")}
                type="date"
                className={cn(estiloInput, "w-full")}
                {...register("dataPrevista")}
              />
            </div>
          )}
        </div>

        {ehRegulatorio && (
          <div className="flex gap-2.5 flex-wrap items-start">
            <div className="min-w-0 flex-1 basis-full sm:min-w-40 sm:basis-auto">
              <label
                htmlFor={campoId("evento-status-regulatorio")}
                className="text-[11px] text-muted-foreground block mb-1"
              >
                Status regulatório
              </label>
              <select
                id={campoId("evento-status-regulatorio")}
                className={cn(estiloInput, "w-full")}
                defaultValue=""
                {...register("statusRegulatorio")}
              >
                <option value="">Status regulatório...</option>
                {STATUS_REGULATORIO_OPCOES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0 flex-1 basis-full sm:min-w-40 sm:basis-auto">
              <label
                htmlFor={campoId("evento-numero-documento")}
                className="text-[11px] text-muted-foreground block mb-1"
              >
                Nº matrícula/licença/processo/SCRA
              </label>
              <input
                id={campoId("evento-numero-documento")}
                className={cn(estiloInput, "w-full")}
                {...register("numeroDocumento")}
              />
            </div>
            <div className="w-full sm:w-auto">
              <label
                htmlFor={campoId("evento-data-validade")}
                className="text-[11px] text-muted-foreground block mb-1"
              >
                Data de validade
              </label>
              <input
                id={campoId("evento-data-validade")}
                type="date"
                className={cn(estiloInput, "w-full")}
                {...register("dataValidade")}
              />
            </div>
          </div>
        )}

        {ehEntrega && (
          <div>
            <div className="text-[11.5px] font-bold text-primary mb-2">
              Equipamento entregue{" "}
              <span className="font-normal text-muted-foreground normal-case">
                (informado pelo estabelecimento, opcional)
              </span>
            </div>
            <div className="grid [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
              <div>
                <label
                  htmlFor={campoId("evento-equip-marca")}
                  className="text-[11px] text-muted-foreground block mb-1"
                >
                  Marca
                </label>
                <input
                  id={campoId("evento-equip-marca")}
                  className={cn(estiloInput, "w-full")}
                  {...register("equipamentoMarca")}
                />
              </div>
              <div>
                <label
                  htmlFor={campoId("evento-equip-modelo")}
                  className="text-[11px] text-muted-foreground block mb-1"
                >
                  Modelo
                </label>
                <input
                  id={campoId("evento-equip-modelo")}
                  className={cn(estiloInput, "w-full")}
                  {...register("equipamentoModelo")}
                />
              </div>
              <div>
                <label
                  htmlFor={campoId("evento-equip-serie")}
                  className="text-[11px] text-muted-foreground block mb-1"
                >
                  Nº de série
                </label>
                <input
                  id={campoId("evento-equip-serie")}
                  className={cn(estiloInput, "w-full")}
                  {...register("equipamentoNumeroSerie")}
                />
              </div>
              <div>
                <label
                  htmlFor={campoId("evento-equip-vida-util")}
                  className="text-[11px] text-muted-foreground block mb-1"
                >
                  Vida útil (anos)
                </label>
                <input
                  id={campoId("evento-equip-vida-util")}
                  type="number"
                  min={0}
                  className={cn(estiloInput, "w-full")}
                  {...register("equipamentoVidaUtilAnos")}
                />
              </div>
            </div>
          </div>
        )}

        <div>
          <label
            htmlFor={campoId("evento-observacao")}
            className="text-[11px] text-muted-foreground block mb-1"
          >
            Observação
          </label>
          <textarea
            id={campoId("evento-observacao")}
            className={cn(estiloInput, "w-full min-h-[60px]")}
            placeholder="O que aconteceu ou justificativa da reprogramação..."
            {...register("observacao")}
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            estiloInput,
            "cursor-pointer bg-success text-success-foreground border-none justify-self-start font-semibold",
          )}
        >
          {isSubmitting ? "Enviando..." : rotuloSubmit}
        </button>
        {onCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            disabled={isSubmitting}
            className={cn(
              estiloInput,
              "cursor-pointer border border-border bg-transparent font-semibold justify-self-start",
            )}
          >
            Cancelar
          </button>
        )}
      </form>
    </>
  );
}
