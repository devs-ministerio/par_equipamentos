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
import { Fragment, useState } from 'react';
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

function campoNum(obj: unknown, chave: string): number | null {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as Record<string, unknown>)[chave];
  return typeof v === 'number' ? v : null;
}

/** Alguns campos crus vêm como número na API mesmo sendo "código" (ex.
 * cd_parceria, numero_empenho) -- diferente de `campo` (só string). */
function campoTexto(obj: unknown, chave: string): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as Record<string, unknown>)[chave];
  if (typeof v === 'string' && v.trim()) return v;
  if (typeof v === 'number') return String(v);
  return null;
}

/** `fmtData` só entende "aaaa-mm-dd" -- vários campos da API vêm como
 * datetime ISO completo ("2025-12-26T00:00:00"), corta só a parte da
 * data antes de formatar (achado 2026-09-15, testado ao vivo: sem isso
 * virava "26T00:00:00/12/2025"). */
function campoData(obj: unknown, chave: string): string {
  const v = campo(obj, chave);
  return v ? fmtData(v.slice(0, 10)) : '—';
}

function lista<T = Record<string, unknown>>(obj: unknown, chave: string): T[] {
  if (!obj || typeof obj !== 'object') return [];
  const v = (obj as Record<string, unknown>)[chave];
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Equipamento em destaque na camada 1 -- mesmo espírito do
 * "equipamento em destaque" do card de convênio (ver equipamento-tags.ts/
 * convenio-card-header.tsx), pedido do usuário 2026-09-15: "aponte qual o
 * equipamento no principal da proposta como fizemos nos convênios".
 * Diferente de `equipamento_detectado` (regex contra PADROES_EQUIPAMENTO,
 * fica null pra qualquer item fora do roll de equipamento de imagem
 * grande, ex. colposcópio/bisturi) -- aqui pega o item de MAIOR VALOR
 * dentro de /item-proposta (dado real, já capturado em metas_resumo),
 * então sempre acha algo quando a proposta tem item detalhado. */
function equipamentoPrincipal(metasResumo: unknown): { nome: string; valor: number | null } | null {
  const metas = lista(metasResumo, 'metas');
  let melhor: { nome: string; valor: number | null } | null = null;
  for (const m of metas) {
    for (const e of lista(m, 'etapas_proposta')) {
      for (const it of lista(e, 'itens')) {
        const nome = campo(it, 'nm_item');
        if (!nome) continue;
        const valor = campoNum(it, 'vl_total_item');
        if (!melhor || (valor ?? -1) > (melhor.valor ?? -1)) melhor = { nome, valor };
      }
    }
  }
  return melhor;
}

/** Situação "de fato" -- achado 2026-09-15, pedido do usuário: "troque o
 * aprovada pela última situação de fato". `situacao_proposta` (Aprovada)
 * fica ESTÁTICA pra sempre, a proposta nunca "desaprova" -- quem realmente
 * evolui é a execução financeira, capturada em timeline_financeira. Ordem
 * de prioridade (mais recente/real primeiro): ordem de pagamento -> DH ->
 * empenho -> situação da parceria -> situação da proposta (só cai aqui
 * quando não há timeline nenhuma, proposta sem parceria ainda). */
function situacaoDeFato(p: { situacao_proposta: string | null; metas_resumo: Record<string, unknown> | null }): string | null {
  const tl = p.metas_resumo?.timeline_financeira;
  if (tl && typeof tl === 'object') {
    const ordens = lista(tl, 'ordens_pagamento');
    if (ordens.length) return campo(ordens[ordens.length - 1], 'in_situacao_op');
    const docs = lista(tl, 'documentos_habeis');
    if (docs.length) return campo(docs[docs.length - 1], 'in_situacao_dh');
    const empenhos = lista(tl, 'empenhos');
    if (empenhos.length) return campo(empenhos[empenhos.length - 1], 'in_situacao_siafi');
  }
  const parceriaSit = campo(p.metas_resumo?.parceria, 'in_situacao_parceria');
  return parceriaSit || p.situacao_proposta;
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
            {/* Ano da proposta -- achado 2026-09-15, pedido do usuário:
                "adicione o ano da proposta". */}
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
        <div className="mt-3 grid [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
          <Campo label="Programa">{p.nm_programa}</Campo>
          <Campo label="Data da proposta">{p.data_proposta ? fmtData(p.data_proposta) : '—'}</Campo>
          <Campo label="Já é parceria formalizada?">{p.tem_parceria ? `Sim — cd_parceria ${p.cd_parceria}` : 'Não'}</Campo>
        </div>
        {p.ds_objeto && <p className="mb-0 mt-2.5 text-xs text-muted-foreground">{p.ds_objeto}</p>}

        {/* Linha do tempo primeiro -- pedido do usuário 2026-09-15: "pode
            colocar a linha do tempo no início" (revertendo a ordem
            anterior, que seguia a seção 07 do artifact da proposta 43829 e
            colocava a linha do tempo por último). Funciona como resumo
            rápido da trajetória antes de entrar nos detalhes seção a
            seção abaixo. */}
        <LinhaDoTempoProposta metasResumo={p.metas_resumo} dataProposta={p.data_proposta} />

        <DetalheBrutoProposta metasResumo={p.metas_resumo} />
      </details>
    </div>
  );
}

type EventoTimeline = { data: string; titulo: string; detalhe?: string };

/** Linha do tempo da proposta -- todas as etapas que ela já passou, em
 * ordem cronológica, até a mais recente. Pedido do usuário 2026-09-15:
 * "preciso visualizar todas as etapas que a proposta passou até a
 * última". Antes esse dado ficava espalhado em seções separadas (análise
 * técnica, timeline financeira) sem uma visão só, em sequência -- mesmo
 * visual da "Linha do tempo de eventos" do instrumento monitorado (ver
 * monitoramento-interno-eventos.tsx), pra manter o padrão do resto do
 * sistema. Só mostra etapa que tem DATA real -- nunca inventa uma pra
 * completar a sequência. */
function LinhaDoTempoProposta({
  metasResumo,
  dataProposta,
}: {
  metasResumo: Record<string, unknown> | null;
  dataProposta: string | null;
}) {
  const eventos: EventoTimeline[] = [];

  if (dataProposta) {
    eventos.push({ data: dataProposta, titulo: 'Proposta enviada' });
  }

  for (const a of lista(metasResumo, 'analise')) {
    const data = campo(a, 'dh_analise_proposta');
    if (data) {
      const tipos = lista(a, 'tipos_analise').map((t) => campo(t, 'tp_analise')).filter(Boolean).join(', ');
      eventos.push({
        data: data.slice(0, 10),
        titulo: `Análise técnica${tipos ? ` (${tipos})` : ''}`,
        detalhe: campo(a, 'in_resultado_analise') ?? undefined,
      });
    }
  }

  const tl = metasResumo?.timeline_financeira;
  if (tl && typeof tl === 'object') {
    for (const e of lista(tl, 'empenhos')) {
      const data = campo(e, 'data_emissao');
      if (data) eventos.push({ data: data.slice(0, 10), titulo: 'Empenho emitido (SIAFI)', detalhe: campo(e, 'in_situacao_siafi') ?? undefined });
    }
    for (const d of lista(tl, 'documentos_habeis')) {
      const data = campo(d, 'dt_emissao');
      if (data) eventos.push({ data: data.slice(0, 10), titulo: 'Documento hábil emitido', detalhe: campo(d, 'in_situacao_dh') ?? undefined });
    }
    for (const o of lista(tl, 'ordens_pagamento')) {
      const dataOp = campo(o, 'dt_emissao_op');
      if (dataOp) eventos.push({ data: dataOp.slice(0, 10), titulo: 'Ordem de pagamento emitida', detalhe: campo(o, 'in_situacao_op') ?? undefined });
      const dataOb = campo(o, 'dt_emissao_ordem_bancaria');
      if (dataOb) eventos.push({ data: dataOb.slice(0, 10), titulo: 'Ordem bancária emitida' });
    }
  }

  if (eventos.length === 0) return null;
  eventos.sort((a, b) => a.data.localeCompare(b.data));

  // Horizontal -- achado 2026-09-15, pedido do usuário: "coloque a linha
  // do tempo na horizontal e ajuste pra melhor visualização, só dados no
  // comprimento da página". Colunas de largura fixa (cabe texto sem
  // quebrar feio) + conector esticando pra preencher o espaço quando
  // sobra; `overflow-x-auto` só entra em cena se a soma ultrapassar a
  // largura do card (muitas etapas ou tela estreita), mesmo padrão de
  // "conteúdo largo rola no próprio contêiner" já usado nas tabelas de
  // item (ver Metas/entregas acima).
  return (
    <Secao titulo="Linha do tempo da proposta" contagem={eventos.length}>
      <div className="overflow-x-auto pb-1">
        <div className="flex w-full items-start">
          {eventos.map((ev, i) => {
            const ultimo = i === eventos.length - 1;
            return (
              <Fragment key={i}>
                <div className="flex w-[136px] shrink-0 flex-col items-center text-center">
                  <div className="text-[10.5px] whitespace-nowrap text-muted-foreground">{fmtData(ev.data)}</div>
                  <div
                    className={cn(
                      'my-1.5 flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                      ultimo ? 'bg-success-bg text-success' : 'bg-background border border-border text-muted-foreground',
                    )}
                  >
                    {i + 1}
                  </div>
                  <div className="text-[11.5px] leading-tight font-semibold text-foreground">{ev.titulo}</div>
                  {ev.detalhe && <div className="mt-0.5 text-[10.5px] leading-tight text-muted-foreground">{ev.detalhe}</div>}
                  {ultimo && <span className="mt-1 text-[9px] font-bold uppercase tracking-wide text-success">Atual</span>}
                </div>
                {!ultimo && <div className="mt-[35px] h-px min-w-6 flex-1 bg-border" />}
              </Fragment>
            );
          })}
        </div>
      </div>
    </Secao>
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
        <div className="mt-3 grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
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
          <ul className="m-0 list-none space-y-3 p-0">
            {metas.map((m, i) => {
              const etapas = lista(m, 'etapas_proposta');
              return (
                <li key={i} className="text-xs text-foreground">
                  {campo(m, 'nm_meta') || `Meta #${campo(m, 'cd_meta') ?? i + 1}`}
                  {etapas.map((e, j) => {
                    const itens = lista(e, 'itens');
                    return (
                      <div key={j} className="ml-3 mt-1">
                        <div className="text-[11px] text-muted-foreground">
                          {campo(e, 'nm_etapa')}
                          {(campo(e, 'dt_inicio') || campo(e, 'dt_fim')) &&
                            ` (${fmtData(campo(e, 'dt_inicio'))} → ${fmtData(campo(e, 'dt_fim'))})`}
                        </div>
                        {/* Item por item do que sera comprado -- achado
                            2026-09-15, pedido do usuario: "não ficou claro
                            qual foi o equipamento financiado". */}
                        {itens.length > 0 && (
                          <div className="mt-1.5 overflow-x-auto">
                            <table className="w-full min-w-[420px] border-collapse text-[11.5px]">
                              <thead>
                                <tr className="text-left text-[10px] uppercase text-muted-foreground">
                                  <th className="py-0.5 pr-2">Item</th>
                                  <th className="py-0.5 pr-2 text-right">Qtd</th>
                                  <th className="py-0.5 pr-2 text-right">Vl. unitário</th>
                                  <th className="py-0.5 text-right">Vl. total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {itens.map((it, k) => (
                                  <tr key={k} className="border-t border-border">
                                    <td className="py-1 pr-2 text-foreground" title={campo(it, 'ds_item') ?? undefined}>
                                      {campo(it, 'nm_item') || '—'}
                                    </td>
                                    <td className="py-1 pr-2 text-right tabular-nums">{campoNum(it, 'qt_quantidade') ?? '—'}</td>
                                    <td className="py-1 pr-2 text-right tabular-nums">{fmtMoeda(campoNum(it, 'vl_unitario_item'))}</td>
                                    <td className="py-1 text-right font-semibold tabular-nums">{fmtMoeda(campoNum(it, 'vl_total_item'))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        </Secao>
      )}

      {cronograma.length > 0 && (
        <Secao titulo="Cronograma de desembolso previsto" contagem={cronograma.length}>
          <div className="grid [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
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

      <SecaoAnaliseTecnica analises={lista(metasResumo, 'analise')} />
      <SecaoOrigemRecurso distribuicoes={lista(metasResumo, 'distribuicao_recurso')} />
      <SecaoTimelineFinanceira
        parceria={typeof metasResumo.parceria === 'object' ? (metasResumo.parceria as Record<string, unknown>) : null}
        timeline={typeof metasResumo.timeline_financeira === 'object' ? (metasResumo.timeline_financeira as Record<string, unknown>) : null}
      />
    </>
  );
}

/** Parecer técnico completo (quem aprovou, quando, texto integral) --
 * achado 2026-09-15, pedido do usuário depois de revisar a proposta 43829
 * manualmente: "vamos trazer tudo parecer técnico, origem e timeline
 * financeira". Texto rolável (pode ser bem longo, ver relatório da
 * proposta 43829) em vez de estourar o card. */
function SecaoAnaliseTecnica({ analises }: { analises: Record<string, unknown>[] }) {
  if (analises.length === 0) return null;
  return (
    <Secao titulo="Análise técnica (parecer)">
      {analises.map((a, i) => {
        const tipos = lista(a, 'tipos_analise').map((t) => campo(t, 'tp_analise')).filter(Boolean);
        return (
          <div key={i} className="mb-2.5 last:mb-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <StatusPill texto={campo(a, 'in_resultado_analise')} />
              <span>{campo(a, 'in_fase_analise')}</span>
              {tipos.length > 0 && <span>· {tipos.join(', ')}</span>}
              {campo(a, 'dh_analise_proposta') && <span>· {campoData(a, 'dh_analise_proposta')}</span>}
            </div>
            {campo(a, 'ds_parecer') && (
              <div className="max-h-52 overflow-y-auto rounded-md border border-border bg-background p-2.5 text-[11.5px] leading-relaxed text-foreground">
                {campo(a, 'ds_parecer')}
              </div>
            )}
          </div>
        );
      })}
    </Secao>
  );
}

/** Origem do recurso (emenda parlamentar ou dotação direta) -- achado
 * 2026-09-15, mesmo pedido acima. */
function SecaoOrigemRecurso({ distribuicoes }: { distribuicoes: Record<string, unknown>[] }) {
  if (distribuicoes.length === 0) return null;
  return (
    <Secao titulo="Origem do recurso">
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
        {distribuicoes.map((d, i) => (
          <Fragment key={i}>
            <Campo label="Tipo">{campo(d, 'in_tipo_distribuicao') || '—'}</Campo>
            {campo(d, 'nr_emenda_proposta') && <Campo label="Nº da emenda">{campo(d, 'nr_emenda_proposta')}</Campo>}
            {campo(d, 'nm_parlamentar_proposta') && (
              <Campo label="Autor">
                {campo(d, 'nm_parlamentar_proposta')}
                {campo(d, 'in_tipo_emenda_parlamentar_proposta') && ` (${campo(d, 'in_tipo_emenda_parlamentar_proposta')})`}
              </Campo>
            )}
            <Campo label="Valor">{fmtMoeda(campoNum(d, 'valor_emenda'))}</Campo>
          </Fragment>
        ))}
      </div>
    </Secao>
  );
}

/** Timeline financeira ponta a ponta -- proposta virou parceria, abriu
 * conta, foi empenhada, gerou documento hábil e foi paga. Só aparece
 * quando a proposta já tem parceria (achado 2026-09-15, rastreado ao
 * vivo na proposta 43829: aprovação -> parceria+conta -> empenho ->
 * documento hábil -> ordem de pagamento paga). */
function SecaoTimelineFinanceira({
  parceria,
  timeline,
}: {
  parceria: Record<string, unknown> | null;
  timeline: Record<string, unknown> | null;
}) {
  if (!parceria) return null;
  const contas = timeline ? lista(timeline, 'contas') : [];
  const empenhos = timeline ? lista(timeline, 'empenhos') : [];
  const documentos = timeline ? lista(timeline, 'documentos_habeis') : [];
  const ordens = timeline ? lista(timeline, 'ordens_pagamento') : [];

  return (
    <Secao titulo="Timeline financeira (pós-parceria)">
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))] gap-2.5 mb-2.5">
        <Campo label="Parceria">
          {campoTexto(parceria, 'cd_parceria') || '—'}
          <span className="ml-1 text-[10px] text-muted-foreground">(id {campoNum(parceria, 'id_parceria')})</span>
        </Campo>
        <Campo label="Situação da parceria">{campo(parceria, 'in_situacao_parceria') || '—'}</Campo>
      </div>

      {contas.map((c, i) => (
        <Campo key={`conta-${i}`} label="Conta bancária" legenda={campo(c, 'tx_descricao') ?? undefined}>
          {campo(c, 'nm_banco')} — ag. {campo(c, 'nm_agencia')} ({campo(c, 'sg_uf_agencia')}), conta {campo(c, 'tx_conta')}
        </Campo>
      ))}

      {(empenhos.length > 0 || documentos.length > 0 || ordens.length > 0) && (
        <div className="mt-2.5 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-[11.5px]">
            <thead>
              <tr className="text-left text-[10px] uppercase text-muted-foreground">
                <th className="py-0.5 pr-2">Etapa</th>
                <th className="py-0.5 pr-2">Nº</th>
                <th className="py-0.5 pr-2">Situação</th>
                <th className="py-0.5 pr-2">Data</th>
                <th className="py-0.5 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {empenhos.map((e, i) => (
                <tr key={`emp-${i}`} className="border-t border-border">
                  <td className="py-1 pr-2 text-muted-foreground">Empenho (SIAFI)</td>
                  <td className="py-1 pr-2 font-mono">{campoTexto(e, 'numero_empenho') || campoNum(e, 'nr_empenho')}</td>
                  <td className="py-1 pr-2">{campo(e, 'in_situacao_siafi')}</td>
                  <td className="py-1 pr-2">{campoData(e, 'data_emissao')}</td>
                  <td className="py-1 text-right tabular-nums">{fmtMoeda(campoNum(e, 'valor_empenho'))}</td>
                </tr>
              ))}
              {documentos.map((d, i) => (
                <tr key={`doc-${i}`} className="border-t border-border">
                  <td className="py-1 pr-2 text-muted-foreground">Documento hábil</td>
                  <td className="py-1 pr-2 font-mono">{campo(d, 'nr_documento_habil')}</td>
                  <td className="py-1 pr-2">{campo(d, 'in_situacao_dh')}</td>
                  <td className="py-1 pr-2">{campoData(d, 'dt_emissao')}</td>
                  <td className="py-1 text-right tabular-nums">{fmtMoeda(campoNum(d, 'vl_documento_habil'))}</td>
                </tr>
              ))}
              {ordens.map((o, i) => (
                <tr key={`op-${i}`} className="border-t border-border">
                  <td className="py-1 pr-2 text-muted-foreground">Ordem de pagamento</td>
                  <td className="py-1 pr-2 font-mono">{campo(o, 'nr_ordem_pagamento')}</td>
                  <td className="py-1 pr-2">
                    <StatusPill texto={campo(o, 'in_situacao_op')} />
                  </td>
                  <td className="py-1 pr-2">{campoData(o, 'dt_emissao_op')}</td>
                  <td className="py-1 text-right tabular-nums">{fmtMoeda(campoNum(o, 'vl_ordem_pagamento'))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Secao>
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
          ? 'Nenhuma proposta nova no momento — o job de descoberta roda diariamente.'
          : status === 'aceita'
            ? 'Nenhuma proposta incorporada ainda.'
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
