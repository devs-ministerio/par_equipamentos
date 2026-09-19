import { useState } from 'react';
import { fmtData, fmtMoeda } from '@/lib/monitoramento-format';
import { cn } from '@/lib/utils';
import { equipamentoPrincipal } from '@/lib/proposta-metas-resumo';
import { situacaoDeFato } from '@/lib/proposta-status';
import { Button } from '@/components/ui/button';
import { Campo, estiloCard, StatusPill } from './monitoramento-ui';
import { DetalheBrutoProposta } from './proposta-detalhe-bruto';
import { LinhaDoTempoProposta } from './proposta-linha-do-tempo';
import type { usePropostasCandidatas } from '@/hooks/use-propostas-candidatas';

/** O CNES descoberto é somente leitura enquanto a proposta ainda não faz
 * parte do monitoramento. Correções são permitidas apenas no instrumento
 * aceito, dentro da aba Monitoramento interno. */
function CnesDestaque({ cnes, nomeEstabelecimento }: {
  cnes: string | null;
  nomeEstabelecimento: string | null;
}) {
  if (!cnes) return null;

  return (
    <div className="relative mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-foreground">
      {nomeEstabelecimento && <span>{nomeEstabelecimento}</span>}
      {cnes && (
        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 font-mono text-[10.5px] font-bold text-primary">
          CNES {cnes}
        </span>
      )}
    </div>
  );
}

export function CardProposta({
  p,
  podeEditar,
  onRevisar,
  revisando,
  mostrarAcoes,
}: {
  p: ReturnType<typeof usePropostasCandidatas>['propostas'][number];
  podeEditar: boolean;
  onRevisar: (decisao: 'aceita' | 'rejeitada') => void;
  revisando: boolean;
  /** Aceitar/Rejeitar só na aba "Novas propostas" -- uma proposta pendente
   * também aparece em "Propostas" (universo inteiro, sem filtro de
   * status), mas lá é só consulta -- a ação de revisar mora só onde o
   * card nasceu pra ser revisado. */
  mostrarAcoes: boolean;
}) {
  const [detalheAberto, setDetalheAberto] = useState(false);
  const principal = equipamentoPrincipal(p.metas_resumo);
  const ano = p.data_proposta?.slice(0, 4);

  return (
    <div className={cn(estiloCard, 'mb-3')}>
      {/* ---------- Camada 1: sempre visível ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-[5px] bg-secondary px-[9px] py-0.5 font-mono text-[11.5px] font-bold text-primary">
              Proposta #{p.id_proposta}
            </span>
            {ano && <span className="font-mono text-[11.5px] text-muted-foreground">{ano}</span>}
            {/* Item de maior valor (dado real de /item-proposta) --
                prioridade sobre equipamento_detectado (regex, só pega
                equipamento de imagem grande, fica null pra colposcópio/
                bisturi/etc.). Cai pro regex só quando não há item
                detalhado nenhum (proposta ainda sem meta capturada). */}
            {principal ? (
              <span className="rounded-full border border-border bg-background px-[11px] py-1 text-[13px] font-extrabold text-foreground">
                {principal.nome}
              </span>
            ) : (
              p.equipamento_detectado && (
                <span className="rounded-full border border-border bg-background px-[11px] py-1 text-[13px] font-extrabold text-foreground">
                  {p.equipamento_detectado}
                </span>
              )
            )}
          </div>
          <div className="text-[15px] font-bold text-foreground">{p.nm_proponente}</div>
          <CnesDestaque cnes={p.cnes} nomeEstabelecimento={p.cnes_nome_estabelecimento} />
          <div className="mt-0.5 text-xs text-muted-foreground">
            {p.cnpj_ente_recebedor || '—'} · {p.municipio || '—'}/{p.uf || '—'}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusPill texto={situacaoDeFato(p)} />
          <div className="text-right">
            <div className="text-[10px] uppercase text-muted-foreground">Valor planejado</div>
            <div className="text-base font-extrabold text-foreground">{fmtMoeda(p.vl_global_proposta)}</div>
          </div>
        </div>
      </div>

      <p className="mb-0 mt-3 rounded-md border border-border bg-background px-2.5 py-2 text-[12.5px] leading-normal">
        <strong className="mr-1 text-[10.5px] uppercase text-muted-foreground">Componente:</strong>
        {p.componente_batido}
      </p>

      {mostrarAcoes && p.status === 'pendente' && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          {podeEditar ? (
            <>
              <Button size="sm" onClick={() => onRevisar('aceita')} disabled={revisando}>
                Aceitar — criar instrumento monitorado
              </Button>
              <Button size="sm" variant="outline" onClick={() => onRevisar('rejeitada')} disabled={revisando}>
                Rejeitar
              </Button>
            </>
          ) : (
            <p className="text-[11px] italic text-muted-foreground">
              Faça login (dentro de um convênio, aba "Monitoramento interno") pra aceitar ou rejeitar.
            </p>
          )}
        </div>
      )}

      {p.status !== 'pendente' && p.revisado_em && (
        <p className="mb-0 mt-3 border-t border-border pt-2.5 text-[11px] text-muted-foreground">
          Revisado em {fmtData(p.revisado_em)}
          {p.status === 'aceita' && ` — instrumento criado com nr_convenio=${p.cd_parceria || p.id_proposta}`}
        </p>
      )}

      {/* ---------- Camada 2: dado técnico aninhado, atrás de 1 clique ---------- */}
      <details
        className="mt-3 border-t border-border pt-2.5"
        open={detalheAberto}
        onToggle={(e) => setDetalheAberto((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer text-xs font-bold text-primary">
          {detalheAberto ? 'Menos detalhes' : 'Mais detalhes'}
        </summary>
        <div className="mt-3 grid [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
          <Campo label="Programa">{p.nm_programa}</Campo>
          <Campo label="Data da proposta">{p.data_proposta ? fmtData(p.data_proposta) : '—'}</Campo>
          <Campo label="Parceria formalizada">{p.tem_parceria ? p.cd_parceria : 'Não'}</Campo>
        </div>
        {p.ds_objeto && <p className="mb-0 mt-2.5 text-xs text-muted-foreground">{p.ds_objeto}</p>}

        <LinhaDoTempoProposta metasResumo={p.metas_resumo} dataProposta={p.data_proposta} />

        <DetalheBrutoProposta metasResumo={p.metas_resumo} />
      </details>
    </div>
  );
}
