/** Cabeçalho de MonitoramentoInterno -- card de identificação/valor global +
 * grid de indicadores rápidos. Extraído do arquivo original (Seção 6 da
 * migração). */
import { nupDoInstrumento } from "@/lib/nup";
import { cn } from "@/lib/utils";
import type { InstrumentoTimeline } from "@/services/monitoramento-instrumentos";
import { fmtData, fmtMoeda } from "@/lib/monitoramento-format";
import { estiloCard, StatusPill } from "./monitoramento-ui";

export function MonitoramentoInternoCabecalho({
  timeline,
  componenteViaSiconv,
  dataInauguracao,
  inaugurado,
  inauguracaoDispensada,
  diasInauguracao,
  acoesAbertasCount,
  acoesAtrasadasCount,
  equipamentos,
}: {
  timeline: InstrumentoTimeline;
  componenteViaSiconv: string | null;
  dataInauguracao: string | null;
  inaugurado: boolean;
  inauguracaoDispensada: boolean;
  diasInauguracao: number | null;
  acoesAbertasCount: number;
  acoesAtrasadasCount: number;
  /** Totais dos itens controlados; nulo quando não há item controlado. */
  equipamentos?: {
    entregues: number;
    planejadas: number;
    canceladas: number;
  } | null;
}) {
  const inst = timeline.instrumento;
  const aoVivo = timeline.ao_vivo;
  const nup = nupDoInstrumento(inst.tipo_contratacao, inst.nr_convenio);
  const origemAlternativa = Boolean(inst.origem_dado);
  const prestacaoConcluida =
    inst.situacao_prestacao_contas
      ?.toLocaleLowerCase("pt-BR")
      .includes("concluída") ?? false;
  const prestacaoVerificada = Boolean(inst.situacao_prestacao_contas?.trim());
  const divergenciaInauguracao =
    inaugurado &&
    inst.tipo_contratacao === "Convênio" &&
    prestacaoVerificada &&
    !prestacaoConcluida;

  const indicadores = [
    {
      rotulo: "Equipamentos",
      valor: equipamentos
        ? `${equipamentos.entregues} de ${equipamentos.planejadas} entregues`
        : "Sem item controlado",
      detalhe:
        equipamentos && equipamentos.canceladas > 0
          ? `${equipamentos.canceladas} cancelada(s)`
          : undefined,
    },
    {
      rotulo: "Inauguração",
      valor: inaugurado
        ? "Realizada"
        : dataInauguracao
          ? "Prevista"
          : inauguracaoDispensada
            ? "Dispensada"
            : origemAlternativa
              ? "Não informada na fonte"
              : "Sem previsão",
      detalhe: inaugurado ? fmtData(dataInauguracao) : undefined,
      alerta: diasInauguracao !== null && diasInauguracao < 0,
    },
    {
      rotulo: "Ações abertas",
      valor: acoesAbertasCount,
      detalhe:
        acoesAtrasadasCount > 0
          ? `${acoesAtrasadasCount} atrasada(s)`
          : undefined,
      alerta: acoesAtrasadasCount > 0,
    },
    // Situação da prestação de contas no SICONV legado -- sincronizada por
    // job_verificacao_siconv.py, só existe pra tipo_contratacao="Convênio"
    // (FAF/TED nunca estiveram no SICONV).
    ...(inst.tipo_contratacao === "Convênio"
      ? [
          {
            rotulo: "Prestação de contas (SICONV)",
            valor: inst.situacao_prestacao_contas ?? "Sem dado",
            detalhe: !prestacaoVerificada
              ? undefined
              : divergenciaInauguracao
                ? "Atenção: conclusão interna ainda não confirmada na fonte externa"
                : prestacaoConcluida
                  ? "Concluída"
                  : "Ainda não concluída",
            alerta: divergenciaInauguracao,
          },
        ]
      : []),
    // Só PERSUS I tem "Situação do programa" (regra do produto, 29/10/2026); nos demais tipos o dado fica
    // guardado, mas não é exibido como indicador.
    ...(inst.situacao_programa && inst.tipo_contratacao === "PERSUS I"
      ? [
          {
            rotulo: "Situação do programa",
            valor: inst.situacao_programa,
            alerta: false,
          },
        ]
      : []),
    // Situação no TransfereGov Novo -- sincronizada por
    // job_verificacao_transferegov.py, só existe pra
    // tipo_contratacao="Parceria TransfereGov". Sem estado "Concluída"
    // nesta API (testado ao vivo) -- por isso mostra a ordem de
    // pagamento (sinal real de dinheiro executado) como detalhe, não
    // como "concluído"/"pendente" binário.
    ...(inst.tipo_contratacao === "FAF"
      ? [
          {
            rotulo: "Situação (TransfereGov)",
            valor: inst.situacao_parceria_transferegov ?? "Sem dado",
            detalhe: inst.situacao_ordem_pagamento_transferegov
              ? `Ordem de pagamento: ${inst.situacao_ordem_pagamento_transferegov}`
              : "Sem ordem de pagamento emitida ainda",
            alerta: false,
          },
        ]
      : []),
  ];

  return (
    <>
      <div className={cn(estiloCard, "mb-4")}>
        <div className="flex flex-wrap justify-between gap-3">
          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
            <div className="flex min-w-0 flex-wrap items-center gap-2 break-words text-[15px] font-bold">
              <span className="break-all">{inst.nr_convenio}</span>
              <span aria-hidden="true">—</span>
              <span className="min-w-0 break-words">
                {inst.nome_convenente}
              </span>
              {/* Chip de tipo_contratacao -- os 28 registros FAF/TED (sem
                  numero TransfereGov, usam o NUP SEI como identificador
                  aqui) agora convivem com os Convênio de verdade. */}
              {inst.tipo_contratacao &&
                inst.tipo_contratacao !== "Convênio" && (
                  <span className="text-[10.5px] font-bold py-0.5 px-2 rounded-full bg-warning-bg text-warning">
                    {inst.tipo_contratacao}
                  </span>
                )}
              {nup && (
                <span
                  className="text-[11px] font-semibold tabular-nums text-muted-foreground"
                  title="Número Único de Protocolo (SEI)"
                >
                  NUP {nup}
                </span>
              )}
            </div>
            <div className="relative break-words text-xs text-muted-foreground">
              {inst.municipio}/{inst.uf} · CNES {inst.cnes ?? "—"}
            </div>
            {/* Componente/Programa mesclados num único rótulo (Plan Mode
                monitoramento-evolucao 2026-09-19, decisão do usuário: "serve
                pra todo o sistema") -- as duas colunas de proveniência
                continuam separadas no banco (planilha vs. TransfereGov), só
                a APRESENTAÇÃO unifica, com prioridade pra quem tem dado
                mais específico. */}
            <div className="text-xs text-muted-foreground mt-1">
              Componente/Programa:{" "}
              {inst.componente ? (
                <strong>{inst.componente}</strong>
              ) : componenteViaSiconv ? (
                <span title="Não preenchido na planilha da equipe — derivado do programa SICONV pra esse convênio">
                  <strong>{componenteViaSiconv}</strong>{" "}
                  <em className="not-italic text-muted-foreground/70">
                    (via SICONV)
                  </em>
                </span>
              ) : inst.programa ? (
                <strong>{inst.programa}</strong>
              ) : inst.tp_instrumento_programa ? (
                <strong>{inst.tp_instrumento_programa}</strong>
              ) : (
                <strong>—</strong>
              )}
            </div>
            {(inst.responsavel_execucao_nome ||
              inst.responsavel_execucao_contato) && (
              <div className="text-xs text-muted-foreground mt-1">
                Responsável técnico da execução (instituição):{" "}
                <strong>{inst.responsavel_execucao_nome ?? "—"}</strong>
                {inst.responsavel_execucao_contato && (
                  <> · {inst.responsavel_execucao_contato}</>
                )}
              </div>
            )}
          </div>
          <div className="min-w-0 text-left sm:text-right">
            <div className="text-[10.5px] text-muted-foreground uppercase">
              Valor global {aoVivo.disponivel && "(ao vivo)"}
            </div>
            {aoVivo.disponivel ? (
              <>
                <div className="break-words text-base font-semibold tabular-nums">
                  {fmtMoeda(aoVivo.valor)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Repassado: {fmtMoeda(aoVivo.valor_liberado)}
                </div>
                {aoVivo.situacao && (
                  <div className="mt-1">
                    <StatusPill texto={aoVivo.situacao} />
                  </div>
                )}
                {aoVivo.valor_suspeito && (
                  <div className="text-[10.5px] text-warning mt-1 max-w-[200px] text-right">
                    Atenção: valor global menor que o liberado — possível
                    truncamento no Portal da Transparência; confira manualmente.
                  </div>
                )}
              </>
            ) : inst.investimento_aquisicao != null ? (
              // Sem fonte oficial ao vivo (Portal da Transparência só
              // cobre Convênio/SICONV) -- mostra o valor persistido no
              // banco, seja qual for a origem (FAF/TED/PERSUS/PRONON),
              // em vez de só dizer "indisponível" quando o dado existe
              // localmente (Plan Mode monitoramento-evolucao 2026-09-19).
              <div className="break-words text-base font-semibold tabular-nums">
                {fmtMoeda(inst.investimento_aquisicao)}
              </div>
            ) : (
              <div className="text-xs font-semibold text-warning">
                Sem dado de valor global disponível
              </div>
            )}
          </div>
        </div>

        {/* Previsao de inauguracao em destaque -- so aparece quando ha
            data (evento lançado pro marco). */}
        {dataInauguracao && !inaugurado && (
          <div className="mt-3 pt-2.5 border-t border-border flex justify-between items-center flex-wrap gap-2">
            <span className="text-[12.5px] font-semibold">
              Previsão de inauguração: {fmtData(dataInauguracao)}
            </span>
            {diasInauguracao !== null && (
              <span
                className={cn(
                  "text-[11.5px] font-bold",
                  diasInauguracao < 0 ? "text-warning" : "text-primary",
                )}
              >
                {diasInauguracao < 0
                  ? `Atrasada há ${Math.abs(diasInauguracao)} dia(s)`
                  : `Faltam ${diasInauguracao} dia(s)`}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3">
        {indicadores.map((item) => (
          <div
            key={item.rotulo}
            className={cn(
              "rounded-xl border bg-card p-3.5 shadow-xs",
              item.alerta ? "border-warning" : "border-border",
            )}
          >
            <div className="mb-1.5 text-[10.5px] font-extrabold tracking-[0.05em] text-muted-foreground uppercase">
              {item.rotulo}
            </div>
            <strong className="block break-words text-[15px] leading-tight text-foreground">
              {item.valor}
            </strong>
            {item.detalhe && (
              <div
                className={cn(
                  "mt-1 text-[11.5px] leading-snug",
                  item.alerta ? "text-warning" : "text-muted-foreground",
                )}
              >
                {item.detalhe}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
