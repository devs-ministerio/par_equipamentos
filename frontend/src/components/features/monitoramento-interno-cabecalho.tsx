/** Cabeçalho de MonitoramentoInterno -- card de identificação/valor global +
 * grid de indicadores rápidos. Extraído do arquivo original (Seção 6 da
 * migração). */
import { cn } from "@/lib/utils";
import type { InstrumentoTimeline } from "@/services/monitoramento-instrumentos";
import { fmtData, fmtMoeda } from "@/lib/monitoramento-format";
import { estiloCard, StatusPill } from "./monitoramento-ui";

export function MonitoramentoInternoCabecalho({
  timeline,
  componenteViaSiconv,
  dataInauguracao,
  inaugurado,
  diasInauguracao,
  equipamentoFisico,
  statusLicenca,
  alertaLicenca,
  acoesAbertasCount,
  acoesAtrasadasCount,
}: {
  timeline: InstrumentoTimeline;
  componenteViaSiconv: string | null;
  dataInauguracao: string | null;
  inaugurado: boolean;
  diasInauguracao: number | null;
  equipamentoFisico: string | null;
  statusLicenca: string;
  alertaLicenca: boolean;
  acoesAbertasCount: number;
  acoesAtrasadasCount: number;
}) {
  const inst = timeline.instrumento;
  const aoVivo = timeline.ao_vivo;
  const equipamentoReferencia = inst.equipamento_descricao ?? "Não informado";
  const origemAlternativa = Boolean(inst.origem_dado);
  const prestacaoConcluida =
    inst.situacao_prestacao_contas
      ?.toLocaleLowerCase("pt-BR")
      .includes("concluída") ?? false;
  const divergenciaInauguracao =
    inaugurado && inst.tipo_contratacao === "Convênio" && !prestacaoConcluida;

  const indicadores = [
    {
      rotulo: "Equipamento físico",
      valor: equipamentoFisico ?? equipamentoReferencia,
    },
    {
      rotulo: "Licença CNEN",
      valor:
        !statusLicenca || statusLicenca === "Sem registro"
          ? origemAlternativa
            ? "Não informada na fonte"
            : "Sem registro"
          : statusLicenca,
      alerta: alertaLicenca,
    },
    {
      rotulo: "Inauguração",
      valor: inaugurado
        ? "Realizada"
        : dataInauguracao
          ? "Prevista"
          : origemAlternativa
            ? "Não informada na fonte"
            : "Sem previsão",
      alerta: diasInauguracao !== null && diasInauguracao < 0,
    },
    {
      rotulo: "Ações abertas",
      valor: acoesAbertasCount,
      detalhe: `${acoesAtrasadasCount} atrasada(s)`,
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
            detalhe: divergenciaInauguracao
              ? "Atenção: Equipamento entregue, pendente de conclusão no TransfereGov"
              : prestacaoConcluida
                ? "Concluída"
                : "Ainda não concluída",
            alerta: divergenciaInauguracao,
          },
        ]
      : []),
    ...(inst.situacao_programa
      ? [
          {
            rotulo: "Situação do programa",
            valor: inst.situacao_programa,
            detalhe: inst.origem_dado ?? "Fonte de ingestão",
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
    ...(inst.tipo_contratacao === "Parceria TransfereGov"
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
        <div className="flex justify-between flex-wrap gap-3">
          <div>
            <div className="font-bold text-[15px] flex items-center gap-2">
              {inst.nr_convenio} — {inst.nome_convenente}
              {/* Chip de tipo_contratacao -- os 28 registros FAF/TED (sem
                  numero TransfereGov, usam o NUP SEI como identificador
                  aqui) agora convivem com os Convênio de verdade. */}
              {inst.tipo_contratacao &&
                inst.tipo_contratacao !== "Convênio" && (
                  <span className="text-[10.5px] font-bold py-0.5 px-2 rounded-full bg-warning-bg text-warning">
                    {inst.tipo_contratacao}
                  </span>
                )}
            </div>
            <div className="relative text-xs text-muted-foreground">
              {inst.municipio}/{inst.uf} · CNES {inst.cnes ?? "—"}
              {" · "}
              <span title="Equipamento planejado (SICONV/plano de aplicação) — não editável aqui">
                {inst.equipamento_descricao}
              </span>
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
          <div className="text-right">
            <div className="text-[10.5px] text-muted-foreground uppercase">
              Valor global {aoVivo.disponivel && "(ao vivo)"}
            </div>
            {aoVivo.disponivel ? (
              <>
                <div className="text-base font-semibold">
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
              <div className="text-base font-semibold">
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
        {dataInauguracao && (
          <div className="mt-3 pt-2.5 border-t border-border flex justify-between items-center flex-wrap gap-2">
            <span className="text-[12.5px] font-semibold">
              {inaugurado ? "Inaugurado em" : "Previsão de inauguração:"}{" "}
              {fmtData(dataInauguracao)}
            </span>
            {!inaugurado && diasInauguracao !== null && (
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
            <strong className="block text-[15px] leading-tight text-foreground">
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
