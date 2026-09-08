import { useState } from 'react';
import { colors } from '../../styles/tokens';
import { fmtData, fmtMoeda, pct } from './format';
import { MonitoramentoInterno } from './MonitoramentoInterno';
import { SiconvSubAbas } from './SiconvSubAbas';
import type { ConvenioUnificado } from './types';
import { Campo, estiloCard, rotuloCampo, Secao, StatusPill } from './ui';

export function ConvenioCard({ c, monitorado = false }: { c: ConvenioUnificado; monitorado?: boolean }) {
  const siconv = c.siconv;
  const transferegov = c.transferegov;
  // Controlado (em vez de <details> nativo solto) so pra poder atrasar o
  // fetch do monitoramento interno ate o card ser aberto -- sem isso os 71
  // cards dispariam 71 requisicoes (70 delas 404, so 948686 tem instrumento
  // seedado) assim que a pagina carrega.
  const [aberto, setAberto] = useState(false);

  const pctDesembolsado = c.financeiro.global && c.financeiro.desembolsado != null
    ? Math.round((c.financeiro.desembolsado / c.financeiro.global) * 100)
    : null;

  return (
    <details
      style={{
        ...estiloCard,
        marginBottom: 10,
        // Convenio com monitoramento interno ativo ganha destaque visual --
        // e o unico dado editavel da pagina, precisa ser achavel sem abrir
        // card por card (ver useInstrumentosMonitorados.ts).
        borderLeft: monitorado ? `3px solid ${colors.hiperGreen}` : estiloCard.borderLeft,
      }}
      open={aberto}
      onToggle={(e) => setAberto((e.target as HTMLDetailsElement).open)}
    >
      <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            Convênio {c.numero} <span style={{ fontWeight: 400, color: colors.mutedText, fontSize: 11.5 }}>{c.numeroInstrumento || ''}</span>
            {monitorado && (
              <span style={{ fontSize: 10, fontWeight: 700, color: colors.hiperGreen, background: colors.hiperGreenBg, padding: '2px 7px', borderRadius: 20 }}>
                ● Monitorado internamente
              </span>
            )}
          </div>
          <div style={{ fontSize: 12.5, marginTop: 2 }}>{c.convenente.nome}</div>
          <div style={{ fontSize: 11.5, color: colors.mutedText }}>{c.municipio}/{c.uf}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={rotuloCampo}>Valor global</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtMoeda(c.financeiro.global)}</div>
            {pctDesembolsado !== null && (
              <div style={{ fontSize: 10.5, color: colors.mutedText }}>{pctDesembolsado}% desembolsado</div>
            )}
          </div>
          <StatusPill texto={c.situacao} />
        </div>
      </summary>

      <div style={{ marginTop: 14, borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
        <p style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 12px', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '8px 10px' }}>
          <strong style={{ color: colors.mutedText, fontSize: 11, textTransform: 'uppercase', marginRight: 4 }}>Objeto:</strong>
          {c.objeto}
        </p>

        <Secao titulo="Identificação">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
            <Campo label="CNPJ convenente">{c.convenente.cnpj}</Campo>
            <Campo label="Tipo convenente">{c.convenente.tipo}</Campo>
            <Campo label="Órgão">{c.orgao}</Campo>
            <Campo label="Unidade gestora">{c.unidadeGestora}</Campo>
            <Campo label="Função / subfunção">{c.funcao} / {c.subfuncao}</Campo>
            <Campo label="Tipo de instrumento">{c.tipoInstrumento}</Campo>
            <Campo label="Nº do processo">{c.numeroProcesso}</Campo>
            <Campo label="Região / código IBGE">{c.regiao} · {c.codigoIbge}</Campo>
            {c.situacaoContratacao && <Campo label="Situação da contratação (SICONV)">{c.situacaoContratacao}</Campo>}
          </div>
        </Secao>

        <Secao titulo="Vigência">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
            <Campo label="Publicação">{fmtData(c.datas.publicacao)}</Campo>
            <Campo label="Início vigência">{fmtData(c.datas.inicioVigencia)}</Campo>
            <Campo label="Fim vigência">{fmtData(c.datas.fimVigencia)}</Campo>
            <Campo label="Conclusão">{fmtData(c.datas.conclusao)}</Campo>
            <Campo label="Última liberação">{fmtData(c.datas.ultimaLiberacao)}</Campo>
          </div>
        </Secao>

        <Secao titulo="Financeiro">
          {!c.financeiro.fonteConfiavel && (
            <p style={{ fontSize: 11.5, color: colors.logoOrange, margin: '0 0 8px' }}>
              ⚠️ Convênio não encontrado no dump SICONV — valores abaixo vêm do Portal da Transparência, que tem bug de
              truncamento conhecido nesse campo (ver docs/monitoramento-equipamentos/convenios.html). Conferir manualmente.
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            <Campo label="Global" legenda={c.financeiro.fonteConfiavel ? 'Fonte SICONV' : 'Fonte Portal (conferir)'}>
              {fmtMoeda(c.financeiro.global)}
            </Campo>
            <Campo label="Empenhado" legenda={pct(c.financeiro.empenhado, c.financeiro.global, 'do global')}>
              {fmtMoeda(c.financeiro.empenhado)}
            </Campo>
            <Campo label="Desembolsado" legenda={pct(c.financeiro.desembolsado, c.financeiro.global, 'do global')}>
              {fmtMoeda(c.financeiro.desembolsado)}
            </Campo>
            <Campo label="Contrapartida">{fmtMoeda(c.financeiro.contrapartida)}</Campo>
            <Campo label="Saldo em conta">{fmtMoeda(c.financeiro.saldoConta)}</Campo>
            <Campo label="Valor da última liberação" legenda={fmtData(c.datas.ultimaLiberacao) !== '—' ? fmtData(c.datas.ultimaLiberacao) : undefined}>
              {fmtMoeda(c.financeiro.ultimaLiberacaoValor)}
            </Campo>
          </div>
        </Secao>

        {siconv ? (
          <Secao titulo="Dados aninhados (SICONV)">
            <SiconvSubAbas siconv={siconv} />
          </Secao>
        ) : (
          <p style={{ fontSize: 12, color: colors.mutedText, fontStyle: 'italic', marginTop: 14 }}>Não encontrado no dump SICONV.</p>
        )}

        <Secao titulo="TransfereGov (novo)">
          {transferegov ? (
            <>
              <p style={{ fontSize: 11.5, color: colors.mutedText, margin: '0 0 8px' }}>
                Cruzado por CNPJ do convenente — aproximação. Este CNPJ está ligado a {transferegov.convenios_legados_relacionados.length}{' '}
                convênio(s) legado(s): {transferegov.convenios_legados_relacionados.join(', ')}. As propostas abaixo são do CNPJ como um
                todo, não necessariamente exclusivas deste convênio.
              </p>
              {transferegov.propostas_expandidas.length === 0 ? (
                <p style={{ fontSize: 12, color: colors.mutedText, fontStyle: 'italic' }}>Nenhuma proposta de equipamento encontrada na API pra esse CNPJ.</p>
              ) : (
                transferegov.propostas_expandidas.map((p, i) => {
                  const d = p.proposta as Record<string, string | number>;
                  return (
                    <details key={i} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
                      <summary style={{ cursor: 'pointer' }}>
                        <strong style={{ fontSize: 12.5 }}>{String(d.ds_objeto).slice(0, 120)}…</strong>{' '}
                        <StatusPill texto={String(d.situacao_proposta)} />
                      </summary>
                      <div style={{ marginTop: 8, fontSize: 12.5 }}>
                        <p>{String(d.ds_objeto)}</p>
                        <div>Valor total: <strong>{fmtMoeda(d.nr_vlr_total as number)}</strong></div>
                        {p.metas.map((m) => (
                          <div key={m.cd_meta} style={{ marginTop: 6 }}>
                            <strong>{m.cd_meta}. {m.nm_meta}</strong>
                            {m.etapas_proposta.map((et) => (
                              <div key={et.cd_etapa} style={{ marginLeft: 12 }}>
                                {et.cd_etapa} — {et.nm_etapa}
                                {et.itens.map((it, j) => {
                                  const item = it as Record<string, unknown>;
                                  return (
                                    <div key={j} style={{ marginLeft: 12, color: colors.mutedText }}>
                                      {String(item.nm_item)} — {String(item.ds_item)} ({fmtMoeda(item.vl_total_item as number)})
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        ))}
                        {p.parcerias.map((pa, k) => {
                          const parceria = pa.parceria as Record<string, unknown>;
                          return (
                            <div key={k} style={{ marginTop: 8 }}>
                              <strong>Parceria {String(parceria.cd_parceria)}</strong> — <StatusPill texto={String(parceria.in_situacao_parceria)} />
                              <div style={{ color: colors.mutedText }}>Empenhos: {pa.empenhos.length} · Documentos hábeis: {pa.documentos_habeis.length}</div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })
              )}
            </>
          ) : (
            <p style={{ fontSize: 12, color: colors.mutedText, fontStyle: 'italic' }}>CNPJ não encontrado na API do TransfereGov.</p>
          )}
        </Secao>

        {/* Camada separada das 3 fontes acima -- fala com o backend (nao
            JSON estatico), so montada quando o card abre (ver `aberto` no
            <details>) pra nao disparar rede pros 71 convenios de uma vez. */}
        <Secao titulo="Monitoramento interno (POC)">
          {aberto && <MonitoramentoInterno numeroConvenio={c.numero} />}
        </Secao>
      </div>
    </details>
  );
}
