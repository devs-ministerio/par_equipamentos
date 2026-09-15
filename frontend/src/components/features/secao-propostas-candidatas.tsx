/** Propostas do TransfereGov novo encontradas pelo job de descoberta
 * (backend/scripts/job_descoberta_transferegov.py, Radar de Convênios) --
 * sub-aba de "Linhas de financiamento" (ver monitoramento-equipamentos-page.tsx).
 * Diferente de SecaoComponentes (radar nacional estático, snapshot em
 * JSON): isto é ao vivo contra o banco (PropostaCandidata), com ação de
 * aceitar/rejeitar pra quem tem sessão de editor.
 *
 * Aceitar chama POST /propostas-candidatas/{id}/revisar, que por sua vez
 * cria o InstrumentoEquipamento (nr_convenio=str(id_proposta),
 * tipo_contratacao="Parceria TransfereGov") -- ver docstring de
 * PropostaCandidata em backend/app/db/models.py. */
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePropostasCandidatas } from '@/hooks/use-propostas-candidatas';
import { fmtData, fmtMoeda } from '@/lib/monitoramento-format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Campo, estiloCard, StatusPill } from './monitoramento-ui';
import type { PropostaCandidataStatus } from '@/services/monitoramento';

function CardProposta({
  p,
  podeEditar,
  onRevisar,
  revisando,
}: {
  p: ReturnType<typeof usePropostasCandidatas>['propostas'][number];
  podeEditar: boolean;
  onRevisar: (decisao: 'aceita' | 'rejeitada') => void;
  revisando: boolean;
}) {
  return (
    <div className={cn(estiloCard, 'mb-2.5')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[13.5px] font-bold">{p.nm_proponente}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {p.componente_batido}
            {p.equipamento_detectado ? ` · ${p.equipamento_detectado}` : ''} · proposta #{p.id_proposta}
          </div>
        </div>
        <StatusPill texto={p.situacao_proposta} />
      </div>

      <div className="mt-3 grid [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))] gap-2">
        <Campo label="CNPJ">{p.cnpj_ente_recebedor || '—'}</Campo>
        <Campo label="Município/UF">{p.municipio || '—'}/{p.uf || '—'}</Campo>
        <Campo label="Valor planejado">{fmtMoeda(p.vl_global_proposta)}</Campo>
        <Campo label="Programa">{p.nm_programa}</Campo>
        <Campo label="Data da proposta">{p.data_proposta ? fmtData(p.data_proposta) : '—'}</Campo>
        <Campo label="Já é parceria formalizada?">{p.tem_parceria ? 'Sim' : 'Não'}</Campo>
      </div>

      {p.ds_objeto && <p className="mt-2.5 text-xs text-muted-foreground">{p.ds_objeto}</p>}

      {p.status === 'pendente' && (
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
            <p className="text-[11px] text-muted-foreground italic">
              Faça login (dentro de um convênio, aba "Monitoramento interno") pra aceitar ou rejeitar.
            </p>
          )}
        </div>
      )}

      {p.status !== 'pendente' && p.revisado_em && (
        <p className="mt-3 border-t border-border pt-2.5 text-[11px] text-muted-foreground">
          Revisado em {fmtData(p.revisado_em)}
          {p.status === 'aceita' && ' — instrumento criado com nr_convenio=' + p.id_proposta}
        </p>
      )}
    </div>
  );
}

export function SecaoPropostasCandidatas({ status }: { status: PropostaCandidataStatus }) {
  const { propostas, carregando, revisar, revisando } = usePropostasCandidatas(status);
  const sessao = useAuthSession();

  if (carregando) return <p className="text-muted-foreground">Carregando...</p>;

  if (propostas.length === 0) {
    return (
      <p className="py-5 text-sm italic text-muted-foreground">
        {status === 'pendente'
          ? 'Nenhuma proposta pendente de revisão no momento — o job de descoberta roda diariamente.'
          : status === 'aceita'
            ? 'Nenhuma proposta aceita ainda.'
            : 'Nenhuma proposta rejeitada ainda.'}
      </p>
    );
  }

  return (
    <div className="mt-4">
      {propostas.map((p) => (
        <CardProposta
          key={p.id}
          p={p}
          podeEditar={sessao.podeEditar}
          revisando={revisando}
          onRevisar={(decisao) => revisar({ id: p.id, decisao })}
        />
      ))}
    </div>
  );
}
