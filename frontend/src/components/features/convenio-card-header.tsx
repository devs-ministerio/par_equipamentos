/** Camada 1 (sempre visível) do card de convênio -- identificação, status,
 * programa, grade financeira. Extraído de convenio-card.tsx (Seção 6 da
 * migração: componente >200 linhas). */
import { fmtData, fmtMoeda, pct } from "@/lib/monitoramento-format";
import { TIPOLOGIA_PERSUS } from "@/data/constants";
import type { ConvenioUnificado } from "@/types/monitoramento";
import { formatarCnpj } from "@/utils/texto";
import { Campo, StatusPill } from "./monitoramento-ui";

export function ConvenioCardHeader({
  c,
  monitorado,
  faseMonitoramento,
  equipamentos,
  programaSiconv,
  valorPagoFornecedor,
  pagamentosCount,
}: {
  c: ConvenioUnificado;
  monitorado: boolean;
  faseMonitoramento: string | null;
  equipamentos: string[];
  programaSiconv: string | null;
  valorPagoFornecedor: number | null;
  pagamentosCount: number;
}) {
  const pctDesembolsado =
    c.financeiro.global && c.financeiro.desembolsado != null
      ? Math.round((c.financeiro.desembolsado / c.financeiro.global) * 100)
      : null;

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[11.5px] font-bold text-primary bg-secondary py-0.5 px-[9px] rounded-[5px] font-mono">
              {c.numero}
            </span>
            {c.numeroInstrumento && (
              <span className="text-[11px] text-muted-foreground/70 font-mono">
                {c.numeroInstrumento}
              </span>
            )}
            {monitorado && (
              <span className="text-[10px] font-bold text-success bg-success-bg py-0.5 px-[7px] rounded-full">
                ● Monitorado internamente
              </span>
            )}
            {/* Equipamento em destaque -- é o dado que motiva a página
                inteira, precisa aparecer antes de qualquer clique, mesma
                linha do identificador, mesmo lugar que o "principal" da
                proposta ocupa ao lado de "Proposta #X" (ver CardProposta
                em secao-propostas-candidatas.tsx). */}
            {equipamentos.map((e) => (
              <span
                key={e}
                className="text-[13px] font-extrabold text-foreground bg-background border border-border py-1 px-[11px] rounded-full"
              >
                {e}
              </span>
            ))}
          </div>
          <div className="text-[15px] font-bold text-foreground">
            {c.convenente.nome}
          </div>
          {/* Estabelecimento (CNES) em destaque -- só aparece quando
              resolvido (357/403 hoje), nunca "CNES —" vazio poluindo o
              card. */}
          {c.cnes && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-foreground">
              <span>{c.cnesNomeEstabelecimento}</span>
              <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 font-mono text-[10.5px] font-bold text-primary">
                CNES {c.cnes}
              </span>
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-0.5">
            {formatarCnpj(c.convenente.cnpj) ?? "CNPJ não informado"} ·{" "}
            {c.municipio}/{c.uf}
          </div>
        </div>
        <div className="flex min-w-0 w-full flex-wrap items-start justify-between gap-3 border-t border-border pt-3 sm:w-auto sm:shrink-0 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
          <StatusPill
            texto={
              monitorado ? (faseMonitoramento ?? "Não iniciado") : c.situacao
            }
          />
          <div className="min-w-0 sm:text-right">
            <div className="text-[10px] text-muted-foreground uppercase">
              Valor global
            </div>
            <div className="break-words text-base font-extrabold tabular-nums text-foreground">
              {fmtMoeda(c.financeiro.global)}
            </div>
            {pctDesembolsado !== null && (
              <div className="text-[10.5px] text-muted-foreground">
                {pctDesembolsado}% desembolsado
                {c.desembolsoIntegralDaCarga && " · conforme carga interna"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Programa em destaque na camada 1 -- e o dado que classifica o
          convenio dentro da politica de financiamento. */}
      {(programaSiconv || c.tipologia) && <p className="mt-3 mb-0 rounded-md border border-border bg-background px-2.5 py-2 text-[12.5px] leading-normal break-words max-sm:border-l-[3px] max-sm:border-l-primary">
        <strong className="text-muted-foreground text-[10.5px] uppercase mr-1">
          Programa:
        </strong>
        {programaSiconv}
        {/* Tipologia deixou de ser exclusiva do PERSUS (Plan Mode
            monitoramento-evolucao 2026-09-19, decisão do usuário: "é a
            mesma tipologia, use para todos") -- mostra pra qualquer tipo
            de contratação que tiver o campo preenchido. */}
        {c.tipologia && (
          <span className="ml-2 text-muted-foreground">
            · Tipologia: {TIPOLOGIA_PERSUS[c.tipologia] ?? c.tipologia}
          </span>
        )}
      </p>}

      {c.dadosOficiaisDisponiveis && (
        <div className="mt-3 grid min-w-0 grid-cols-2 gap-x-3 gap-y-3 rounded-lg bg-background px-3 py-3 sm:[grid-template-columns:repeat(auto-fit,minmax(110px,1fr))]">
          <div className="hidden sm:block"><Campo label="Valor global">{fmtMoeda(c.financeiro.global)}</Campo></div>
          <Campo
            label="Valor repasse"
            legenda={pct(
              c.financeiro.repasse,
              c.financeiro.global,
              "do global",
            )}
          >
            {fmtMoeda(c.financeiro.repasse)}
          </Campo>
          <Campo label="Contrapartida">
            {fmtMoeda(c.financeiro.contrapartida)}
          </Campo>
          <Campo label="Saldo em conta">
            {fmtMoeda(c.financeiro.saldoConta)}
          </Campo>
          <Campo
            label="Última liberação"
            legenda={
              fmtData(c.datas.ultimaLiberacao) !== "—"
                ? fmtData(c.datas.ultimaLiberacao)
                : undefined
            }
          >
            {fmtMoeda(c.financeiro.ultimaLiberacaoValor)}
          </Campo>
          <div className="col-span-2 border-t border-border pt-2.5 sm:col-span-1 sm:border-0 sm:pt-0">
            <Campo
              label="Valor pago ao fornecedor"
              legenda={
                pagamentosCount ? `${pagamentosCount} pagamento(s)` : undefined
              }
            >
              {fmtMoeda(valorPagoFornecedor)}
            </Campo>
          </div>
        </div>
      )}
      {/* Correção 2026-09-18: FAF/TED/PERSUS/PRONON nunca tiveram dump
          SICONV pra começo (não é o caso que este aviso descreve -- é só
          "sem financeiro confiável" por padrão, nunca setado True pra
          essas fontes) -- aviso só faz sentido pro universo real de
          Convênio/SICONV/Portal. */}
      {!c.financeiro.fonteConfiavel &&
        (c.tipoContratacao === null || c.tipoContratacao === "Convênio") && (
          <p className="text-[11px] text-warning mt-2 mb-0">
            Atenção: não encontrado no dump SICONV — os valores acima vêm do
            Portal da Transparência e podem sofrer truncamento conhecido nesse
            campo. Conferir manualmente.
          </p>
        )}
    </>
  );
}
