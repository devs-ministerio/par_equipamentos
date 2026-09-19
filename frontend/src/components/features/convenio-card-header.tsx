/** Camada 1 (sempre visível) do card de convênio -- identificação, status,
 * programa, grade financeira. Extraído de convenio-card.tsx (Seção 6 da
 * migração: componente >200 linhas). */
import { fmtData, fmtMoeda, pct } from '@/lib/monitoramento-format';
import { TIPOLOGIA_PERSUS } from '@/data/constants';
import type { ConvenioUnificado } from '@/types/monitoramento';
import { Campo, StatusPill } from './monitoramento-ui';

export function ConvenioCardHeader({
  c,
  monitorado,
  equipamentos,
  programaSiconv,
  valorPagoFornecedor,
  pagamentosCount,
}: {
  c: ConvenioUnificado;
  monitorado: boolean;
  equipamentos: string[];
  programaSiconv: string | null;
  valorPagoFornecedor: number | null;
  pagamentosCount: number;
}) {
  const pctDesembolsado = c.financeiro.global && c.financeiro.desembolsado != null
    ? Math.round((c.financeiro.desembolsado / c.financeiro.global) * 100)
    : null;

  return (
    <>
      <div className="flex justify-between gap-3 flex-wrap items-start">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[11.5px] font-bold text-primary bg-secondary py-0.5 px-[9px] rounded-[5px] font-mono">
              {c.numero}
            </span>
            {c.numeroInstrumento && <span className="text-[11px] text-muted-foreground/70 font-mono">{c.numeroInstrumento}</span>}
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
              <span key={e} className="text-[13px] font-extrabold text-foreground bg-background border border-border py-1 px-[11px] rounded-full">
                {e}
              </span>
            ))}
          </div>
          <div className="text-[15px] font-bold text-foreground">{c.convenente.nome}</div>
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
            {c.convenente.cnpj ?? 'CNPJ não informado'} · {c.municipio}/{c.uf}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusPill texto={c.situacao} />
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground uppercase">Valor global</div>
            <div className="text-base font-extrabold text-foreground">{fmtMoeda(c.financeiro.global)}</div>
            {pctDesembolsado !== null && <div className="text-[10.5px] text-muted-foreground">{pctDesembolsado}% desembolsado</div>}
          </div>
        </div>
      </div>

      {/* Programa em destaque na camada 1 -- e o dado que classifica o
          convenio dentro da politica de financiamento. */}
      <p className="text-[12.5px] leading-normal mt-3 mb-0 bg-background border border-border rounded-md py-2 px-2.5">
        <strong className="text-muted-foreground text-[10.5px] uppercase mr-1">Programa:</strong>
        {programaSiconv || '— (não encontrado em nenhuma fonte)'}
        {c.tipologia && c.tipoContratacao?.startsWith('PERSUS') && (
          <span className="ml-2 text-muted-foreground">· Tipologia: {TIPOLOGIA_PERSUS[c.tipologia] ?? c.tipologia}</span>
        )}
      </p>

      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(110px,1fr))] gap-2.5 mt-3 py-2.5 px-3 bg-background rounded-lg">
        <Campo label="Valor global">{fmtMoeda(c.financeiro.global)}</Campo>
        <Campo label="Valor repasse" legenda={pct(c.financeiro.repasse, c.financeiro.global, 'do global')}>{fmtMoeda(c.financeiro.repasse)}</Campo>
        <Campo label="Contrapartida">{fmtMoeda(c.financeiro.contrapartida)}</Campo>
        <Campo label="Saldo em conta">{fmtMoeda(c.financeiro.saldoConta)}</Campo>
        <Campo label="Última liberação" legenda={fmtData(c.datas.ultimaLiberacao) !== '—' ? fmtData(c.datas.ultimaLiberacao) : undefined}>
          {fmtMoeda(c.financeiro.ultimaLiberacaoValor)}
        </Campo>
        <Campo label="Valor pago ao fornecedor" legenda={pagamentosCount ? `${pagamentosCount} pagamento(s)` : undefined}>
          {fmtMoeda(valorPagoFornecedor)}
        </Campo>
      </div>
      {/* Correção 2026-09-18: FAF/TED/PERSUS/PRONON nunca tiveram dump
          SICONV pra começo (não é o caso que este aviso descreve -- é só
          "sem financeiro confiável" por padrão, nunca setado True pra
          essas fontes) -- aviso só faz sentido pro universo real de
          Convênio/SICONV/Portal. */}
      {!c.financeiro.fonteConfiavel && (c.tipoContratacao === null || c.tipoContratacao === 'Convênio') && (
        <p className="text-[11px] text-warning mt-2 mb-0">
          Atenção: não encontrado no dump SICONV — os valores acima vêm do Portal da Transparência e podem sofrer truncamento conhecido nesse campo. Conferir manualmente.
        </p>
      )}
    </>
  );
}
