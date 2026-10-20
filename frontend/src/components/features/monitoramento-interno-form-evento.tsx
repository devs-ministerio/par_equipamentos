/** Form "Lançar evento" -- React Hook Form + zod, campos condicionais por
 * grupo/código do marco selecionado (regulatório pede status/documento/
 * validade; marco de entrega pede o equipamento físico). Extraído de
 * MonitoramentoInterno.tsx. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { cn } from "@/lib/utils";
import type { MarcoCatalogo } from "@/services/monitoramento-marcos";
import {
  enviarEventoSchema,
  type EnviarEventoFormValues,
} from "@/lib/validations/monitoramento";
import { ErroCampo, estiloCard, estiloInput } from "./monitoramento-ui";
import { idsDescricaoCampo } from "@/lib/monitoramento-status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS_REGULATORIO_OPCOES = [
  "NI",
  "NA",
  "Em análise",
  "Em diligência",
  "Deferido",
  "Indeferido",
];

const GRUPOS: { chave: MarcoCatalogo["grupo"]; rotulo: string }[] = [
  { chave: "fase_geral", rotulo: "Fase geral" },
  { chave: "cronograma_fisico", rotulo: "Cronograma físico" },
  { chave: "regulatorio", rotulo: "Regulatório (CNEN)" },
];

export function MonitoramentoInternoFormEvento({
  marcos,
  onRegistrar,
  valoresIniciais,
  marcoFixo,
  rotuloSubmit = "Registrar evento",
  previsaoInauguracao,
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
  rotuloSubmit?: string;
  previsaoInauguracao?: string | null;
}) {
  const formId = useId();
  const campoId = (nome: string) => `${formId}-${nome}`;
  const {
    register,
    handleSubmit,
    watch,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EnviarEventoFormValues>({
    resolver: zodResolver(enviarEventoSchema),
    defaultValues:
      valoresIniciais ??
      (marcoFixo ? { marcoId: String(marcoFixo.id) } : undefined),
  });
  const [conclusaoPendente, setConclusaoPendente] =
    useState<EnviarEventoFormValues | null>(null);
  const [confirmandoConclusao, setConfirmandoConclusao] = useState(false);

  const marcoIdSelecionado = watch("marcoId");
  const marcoDoForm =
    marcoFixo ?? marcos.find((m) => String(m.id) === marcoIdSelecionado);
  const ehRegulatorio = marcoDoForm?.grupo === "regulatorio";
  const ehLicencaOperacao =
    marcoDoForm?.codigo === "regulatorio_licenca_operacao";
  // Marco de cronograma físico/regulatório precisa indicar a fase geral
  // correspondente (Plan Mode monitoramento-evolucao 2026-09-19 -- fecha o
  // bug de evento registrado sem mover a fase geral). Obrigatório aqui e
  // validado de novo no backend.
  const precisaFaseGeral =
    Boolean(marcoDoForm) && marcoDoForm?.grupo !== "fase_geral";
  const fasesGerais = marcos.filter((m) => m.grupo === "fase_geral");
  // Achado 2026-09-09, 2a rodada (pedido do usuario: "o equipamento
  // entregue pode mover para eventos") -- so o marco de entrega pede os
  // campos fisicos, junto do mesmo lancamento.
  const ehEntrega = marcoDoForm?.codigo === "cronograma_entrega";
  const ehConclusao = marcoDoForm?.codigo === "fase_concluido";

  useEffect(() => {
    if (marcoDoForm?.grupo === "fase_geral") setValue("dataPrevista", "");
  }, [marcoDoForm?.grupo, setValue]);

  async function aoSubmeter(valores: EnviarEventoFormValues) {
    if (precisaFaseGeral && !valores.faseGeralId) {
      setError("faseGeralId", {
        message: "Selecione a fase geral correspondente.",
      });
      return;
    }
    if (ehConclusao && !marcoFixo) {
      if (!valores.dataOcorrencia) {
        setError("dataOcorrencia", { message: "Informe a data de conclusão." });
        return;
      }
      setConclusaoPendente(valores);
      return;
    }
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
                      .filter((m) => m.grupo === chave)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.rotulo}
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
          {precisaFaseGeral && (
            <div className="min-w-0 flex-1 basis-full sm:min-w-52 sm:basis-auto">
              <label
                htmlFor={campoId("evento-fase-geral")}
                className="text-[11px] text-muted-foreground block mb-1"
              >
                Fase geral correspondente
              </label>
              <select
                id={campoId("evento-fase-geral")}
                className={cn(estiloInput, "w-full")}
                aria-invalid={Boolean(errors.faseGeralId)}
                aria-describedby={idsDescricaoCampo(
                  campoId("evento-fase-geral"),
                  Boolean(errors.faseGeralId),
                  false,
                )}
                defaultValue=""
                {...register("faseGeralId")}
              >
                <option value="" disabled>
                  Selecione a fase...
                </option>
                {fasesGerais.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.rotulo}
                  </option>
                ))}
              </select>
              <ErroCampo
                id={campoId("evento-fase-geral-error")}
                mensagem={errors.faseGeralId?.message}
              />
            </div>
          )}
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
                Nº matrícula/licença/processo
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
      </form>
      <Dialog
        open={Boolean(conclusaoPendente)}
        onOpenChange={(aberto) => !aberto && setConclusaoPendente(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar inauguração</DialogTitle>
            <DialogDescription>
              {previsaoInauguracao === conclusaoPendente?.dataOcorrencia
                ? `A previsão registrada (${previsaoInauguracao}) é igual à data de conclusão. Confirme a inauguração nessa data.`
                : previsaoInauguracao
                  ? `A previsão registrada é ${previsaoInauguracao}. Confirme a inauguração na data real de conclusão informada.`
                  : "Não há previsão registrada. A inauguração será registrada na data de conclusão informada."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={confirmandoConclusao}
              onClick={() => setConclusaoPendente(null)}
            >
              Voltar
            </Button>
            <Button
              disabled={confirmandoConclusao}
              onClick={async () => {
                if (!conclusaoPendente || confirmandoConclusao) return;
                setConfirmandoConclusao(true);
                try {
                  await onRegistrar({
                    ...conclusaoPendente,
                    confirmarInauguracao: true,
                  });
                  setConclusaoPendente(null);
                } catch {
                  // O pai exibe o erro seguro; manter a confirmação para retry.
                } finally {
                  setConfirmandoConclusao(false);
                }
              }}
            >
              {confirmandoConclusao
                ? "Confirmando..."
                : "Confirmar inauguração"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
