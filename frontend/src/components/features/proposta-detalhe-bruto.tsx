import { Fragment } from 'react';
import { campo, campoData, campoNum, campoObjeto, campoTexto, lista } from '@/lib/campo-cru';
import { enderecoProposta } from '@/lib/proposta-metas-resumo';
import { fmtMoeda } from '@/lib/monitoramento-format';
import { Campo, Secao, StatusPill } from './monitoramento-ui';

const MESES = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Camada 2 da proposta: campos crus adicionais capturados no momento da
 * descoberta -- natureza jurídica, endereço, problema/resultado
 * esperado/público alvo (texto livre que a equipe usa pra avaliar mérito),
 * metas (entregas previstas) e cronograma de desembolso (parcelas
 * financeiras previstas). Nem toda proposta tem tudo preenchido na API --
 * cada bloco só aparece quando tem dado real. */
export function DetalheBrutoProposta({ metasResumo }: { metasResumo: unknown }) {
  if (!metasResumo || typeof metasResumo !== 'object') return null;
  const proposta = campoObjeto(metasResumo, 'proposta');
  const metas = lista(metasResumo, 'metas');
  const cronograma = lista<{ nr_ref_mes_data_especif?: unknown; nr_ref_ano_data_especif?: unknown; vl_cronograma_desembolso?: unknown }>(
    metasResumo,
    'cronograma_desembolso',
  );

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

      {/* Texto rolável -- texto livre da API pode passar de 1 parágrafo,
          estourava o card em vez de ficar contido num box com scroll. */}
      {(problema || resultadoEsperado || publicoAlvo) && (
        <div className="mt-3 grid gap-2">
          {problema && (
            <Campo label="Problema a resolver">
              <div className="max-h-24 overflow-y-auto rounded-md border border-border bg-background p-2 text-[11.5px] leading-relaxed">{problema}</div>
            </Campo>
          )}
          {resultadoEsperado && (
            <Campo label="Resultado esperado">
              <div className="max-h-24 overflow-y-auto rounded-md border border-border bg-background p-2 text-[11.5px] leading-relaxed">{resultadoEsperado}</div>
            </Campo>
          )}
          {publicoAlvo && (
            <Campo label="Público alvo">
              <div className="max-h-24 overflow-y-auto rounded-md border border-border bg-background p-2 text-[11.5px] leading-relaxed">{publicoAlvo}</div>
            </Campo>
          )}
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
                            ` (${campoData(e, 'dt_inicio')} → ${campoData(e, 'dt_fim')})`}
                        </div>
                        {/* Item por item do que será comprado. */}
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
      <SecaoTimelineFinanceira parceria={campoObjeto(metasResumo, 'parceria')} timeline={campoObjeto(metasResumo, 'timeline_financeira')} />
    </>
  );
}

/** Parecer técnico completo (quem aprovou, quando, texto integral). Texto
 * rolável (pode ser bem longo) em vez de estourar o card. */
function SecaoAnaliseTecnica({ analises }: { analises: unknown[] }) {
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

/** Origem do recurso (emenda parlamentar ou dotação direta). */
function SecaoOrigemRecurso({ distribuicoes }: { distribuicoes: unknown[] }) {
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
 * quando a proposta já tem parceria. */
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
