/** Propostas do TransfereGov novo encontradas pelo job de descoberta
 * (backend/scripts/job_descoberta_transferegov.py, Radar de Convênios) --
 * sub-aba de "Linhas de financiamento" (ver monitoramento-equipamentos-page.tsx).
 * Ao vivo contra o banco (PropostaCandidata), com ação de aceitar/rejeitar
 * pra quem tem sessão de editor. Camada 1/camada 2 (resumo sempre visível +
 * "Mais detalhes" atrás de 1 clique) no mesmo método do card de convênio
 * (ver convenio-card.tsx) -- pedido do usuário 2026-09-15: "pode usar o
 * mesmo método que usamos no Instrumentos firmados".
 *
 * Aceitar chama POST /propostas-candidatas/{id}/revisar, que por sua vez
 * cria o InstrumentoEquipamento (nr_convenio=cd_parceria quando existir,
 * senão str(id_proposta)), tipo_contratacao="Parceria TransfereGov") -- ver
 * docstring de PropostaCandidata em backend/app/db/models.py.
 *
 * "Mais detalhes" mostra o que foi capturado bruto da API no momento da
 * descoberta (`metas_resumo` -- proposta/metas/cronograma_desembolso, ver
 * job_descoberta_transferegov.py) -- achado 2026-09-15, pedido do usuário:
 * "a equipe técnica precisará de mais informações pra aprovar ou não". */
import { useState } from 'react';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePropostasCandidatas } from '@/hooks/use-propostas-candidatas';
import { fmtData, fmtMoeda } from '@/lib/monitoramento-format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Campo, estiloCard, Secao, StatusPill } from './monitoramento-ui';
import type { PropostaCandidataStatus } from '@/services/monitoramento';

const MESES = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** `metas_resumo` é dado cru da API do TransfereGov (Record<string,
 * unknown>, sem schema fixo de propósito -- ver docstring do campo em
 * app/db/models.py) -- helpers abaixo leem campo a campo com fallback,
 * nunca assumem que existe. */
function campo(obj: unknown, chave: string): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as Record<string, unknown>)[chave];
  return typeof v === 'string' && v.trim() ? v : null;
}

function enderecoProposta(proposta: unknown): string | null {
  const partes = [
    campo(proposta, 'ed_logradouro'),
    campo(proposta, 'ed_numero'),
    campo(proposta, 'ed_complemento'),
    campo(proposta, 'ed_bairro'),
    campo(proposta, 'ed_cep'),
  ].filter(Boolean);
  return partes.length ? partes.join(', ') : null;
}

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
  const [detalheAberto, setDetalheAberto] = useState(false);

  return (
    <div className={cn(estiloCard, 'mb-3')}>
      {/* ---------- Camada 1: sempre visível ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-[5px] bg-secondary px-[9px] py-0.5 font-mono text-[11.5px] font-bold text-primary">
              Proposta #{p.id_proposta}
            </span>
            {p.equipamento_detectado && (
              <span className="rounded-full border border-border bg-background px-[11px] py-1 text-[13px] font-extrabold text-foreground">
                {p.equipamento_detectado}
              </span>
            )}
          </div>
          <div className="text-[15px] font-bold text-foreground">{p.nm_proponente}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {p.cnpj_ente_recebedor || '—'} · {p.municipio || '—'}/{p.uf || '—'}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusPill texto={p.situacao_proposta} />
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
        <div className="mt-3 grid [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))] gap-2.5">
          <Campo label="Programa">{p.nm_programa}</Campo>
          <Campo label="Data da proposta">{p.data_proposta ? fmtData(p.data_proposta) : '—'}</Campo>
          <Campo label="Já é parceria formalizada?">{p.tem_parceria ? `Sim — cd_parceria ${p.cd_parceria}` : 'Não'}</Campo>
        </div>
        {p.ds_objeto && <p className="mb-0 mt-2.5 text-xs text-muted-foreground">{p.ds_objeto}</p>}

        <DetalheBrutoProposta metasResumo={p.metas_resumo} />
      </details>
    </div>
  );
}

/** Campos crus adicionais capturados no momento da descoberta -- natureza
 * jurídica, endereço, problema/resultado esperado/público alvo (texto
 * livre que a equipe usa pra avaliar mérito), metas (entregas previstas) e
 * cronograma de desembolso (parcelas financeiras previstas). Nem toda
 * proposta tem tudo preenchido na API -- cada bloco só aparece quando tem
 * dado real. */
function DetalheBrutoProposta({ metasResumo }: { metasResumo: Record<string, unknown> | null }) {
  if (!metasResumo) return null;
  const proposta = metasResumo.proposta;
  const metas = Array.isArray(metasResumo.metas) ? (metasResumo.metas as Record<string, unknown>[]) : [];
  const cronograma = Array.isArray(metasResumo.cronograma_desembolso)
    ? (metasResumo.cronograma_desembolso as Record<string, unknown>[])
    : [];

  const endereco = enderecoProposta(proposta);
  const naturezaJuridica = campo(proposta, 'nm_natureza_juridica');
  const unidadeGestora = campo(proposta, 'nm_unidade_gestora');
  const problema = campo(proposta, 'ds_problema_proposta');
  const resultadoEsperado = campo(proposta, 'ds_resultado_esperado_proposta');
  const publicoAlvo = campo(proposta, 'ds_publico_alvo_proposta');

  const temAlgo = endereco || naturezaJuridica || unidadeGestora || problema || resultadoEsperado || publicoAlvo || metas.length || cronograma.length;
  if (!temAlgo) return null;

  return (
    <>
      {(endereco || naturezaJuridica || unidadeGestora) && (
        <div className="mt-3 grid [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
          {naturezaJuridica && <Campo label="Natureza jurídica">{naturezaJuridica}</Campo>}
          {unidadeGestora && <Campo label="Unidade gestora">{unidadeGestora}</Campo>}
          {endereco && <Campo label="Endereço">{endereco}</Campo>}
        </div>
      )}

      {(problema || resultadoEsperado || publicoAlvo) && (
        <div className="mt-3 grid gap-2">
          {problema && <Campo label="Problema a resolver">{problema}</Campo>}
          {resultadoEsperado && <Campo label="Resultado esperado">{resultadoEsperado}</Campo>}
          {publicoAlvo && <Campo label="Público alvo">{publicoAlvo}</Campo>}
        </div>
      )}

      {metas.length > 0 && (
        <Secao titulo="Metas / entregas previstas" contagem={metas.length}>
          <ul className="m-0 list-none space-y-1.5 p-0">
            {metas.map((m, i) => {
              const etapas = Array.isArray(m.etapas_proposta) ? (m.etapas_proposta as Record<string, unknown>[]) : [];
              return (
                <li key={i} className="text-xs text-foreground">
                  {campo(m, 'nm_meta') || `Meta #${campo(m, 'cd_meta') ?? i + 1}`}
                  {etapas.map((e, j) => (
                    <div key={j} className="ml-3 mt-0.5 text-[11px] text-muted-foreground">
                      {campo(e, 'nm_etapa')}
                      {(campo(e, 'dt_inicio') || campo(e, 'dt_fim')) &&
                        ` (${fmtData(campo(e, 'dt_inicio'))} → ${fmtData(campo(e, 'dt_fim'))})`}
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        </Secao>
      )}

      {cronograma.length > 0 && (
        <Secao titulo="Cronograma de desembolso previsto" contagem={cronograma.length}>
          <div className="grid [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
            {cronograma.map((c, i) => {
              const mes = Number(c.nr_ref_mes_data_especif) || 0;
              const ano = c.nr_ref_ano_data_especif;
              const valor = typeof c.vl_cronograma_desembolso === 'number' ? c.vl_cronograma_desembolso : null;
              return (
                <Campo key={i} label={`${MESES[mes] || '—'}/${ano ?? '—'}`} legenda={campo(c, 'origem_recurso') ?? undefined}>
                  {fmtMoeda(valor)}
                </Campo>
              );
            })}
          </div>
        </Secao>
      )}
    </>
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
