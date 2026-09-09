/** Card de convenio -- 2 camadas de informacao, nao 1 accordion escondendo
 * tudo atras de 1 clique (feedback direto: o que mais importa pra
 * escanear -- status, objeto, grade financeira -- precisa aparecer sem
 * clicar em nada, so o dado tecnico profundo (SICONV/TransfereGov/
 * monitoramento) fica atras de "Ver mais detalhes"). Camada 1 sempre
 * visivel: identificacao, status, objeto, financeiro. Camada 2 (collapse
 * proprio, so essa parte): dados aninhados. */
import { useState } from 'react';
import { colors } from '../../styles/tokens';
import { componenteDoProgramaSiconv } from './componenteSiconv';
import { fmtData, fmtMoeda, pct } from './format';
import { MonitoramentoInterno } from './MonitoramentoInterno';
import { SiconvSubAbas } from './SiconvSubAbas';
import type { ConvenioUnificado, ProgramaTransfereGov } from './types';
import { Campo, estiloCard, Secao, StatusPill } from './ui';

export function ConvenioCard({
  c, monitorado = false, componentes = [], equipamentos = [], programas,
}: {
  c: ConvenioUnificado;
  monitorado?: boolean;
  /** Componente(s) de financiamento PNPCC cruzados pelo CNPJ do convenente
   * (ver componentesPorCnpj em MonitoramentoEquipamentosPage.tsx) -- so
   * API (TransfereGov programa/proposta), nunca a planilha interna
   * (decisao do usuario 2026-09-08). Aproximacao, mesma ressalva da
   * secao TransfereGov abaixo. */
  componentes?: { componente: string; ano: number }[];
  /** Tags de equipamento (ver equipamentoTags.ts) -- mostradas em destaque
   * na camada 1, pedido direto do usuario (2026-09-08). */
  equipamentos?: string[];
  /** id_programa -> nome, ver types.ts::ProgramaTransfereGov. So a
   * proposta do TransfereGov carrega o id cru, sem nome. */
  programas?: Map<number, ProgramaTransfereGov>;
}) {
  const siconv = c.siconv;
  const transferegov = c.transferegov;
  // So controla a camada 2 (dado tecnico aninhado) -- a camada 1 (status/
  // objeto/financeiro) e sempre renderizada, nao precisa de estado.
  const [detalheAberto, setDetalheAberto] = useState(false);

  // Programa -- so API. Preferencia: SICONV (`siconv.programa`, exato por
  // ID_PROPOSTA -- achado 2026-09-08) sobre TransfereGov (proposta ligada
  // por CNPJ, resolvida por id_programa -- aproximacao, mesma ressalva da
  // secao TransfereGov abaixo). Nunca vem do monitoramento interno
  // (decisao do usuario 2026-09-08 -- aquilo e planilha da equipe, nao API).
  const programaSiconv = siconv?.programa?.NOME_PROGRAMA || null;
  const programaTransfereGov = transferegov
    ? programas?.get(Number((transferegov.propostas_expandidas[0]?.proposta as Record<string, unknown> | undefined)?.id_programa))
    : undefined;
  // Componente PNPCC derivado do NOME_PROGRAMA exato do SICONV, quando da
  // pra casar com um dos 8 componentes-alvo (ver componenteSiconv.ts) --
  // mais confiavel que `componentes` (cruzamento por CNPJ via TransfereGov).
  const componenteSiconv = componenteDoProgramaSiconv(programaSiconv);

  const pctDesembolsado = c.financeiro.global && c.financeiro.desembolsado != null
    ? Math.round((c.financeiro.desembolsado / c.financeiro.global) * 100)
    : null;

  return (
    <div
      style={{
        ...estiloCard,
        marginBottom: 12,
        // Convenio com monitoramento interno ativo ganha destaque visual --
        // e o unico dado editavel da pagina, precisa ser achavel sem abrir
        // card por card (ver useInstrumentosMonitorados.ts).
        borderLeft: monitorado ? `3px solid ${colors.hiperGreen}` : estiloCard.borderLeft,
      }}
    >
      {/* ---------- Camada 1: sempre visivel ---------- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{
              fontSize: 11.5, fontWeight: 700, color: colors.primary, background: colors.primaryLight,
              padding: '2px 9px', borderRadius: 5, fontFamily: 'monospace',
            }}>
              Convênio {c.numero}
            </span>
            {c.numeroInstrumento && <span style={{ fontSize: 11, color: colors.subtleText, fontFamily: 'monospace' }}>{c.numeroInstrumento}</span>}
            {monitorado && (
              <span style={{ fontSize: 10, fontWeight: 700, color: colors.hiperGreen, background: colors.hiperGreenBg, padding: '2px 7px', borderRadius: 20 }}>
                ● Monitorado internamente
              </span>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.primaryDark }}>{c.convenente.nome}</div>
          <div style={{ fontSize: 12, color: colors.mutedText, marginTop: 2 }}>
            {c.convenente.cnpj} · {c.municipio}/{c.uf}
          </div>
          {/* Equipamento em destaque -- pedido direto do usuario (2026-09-08):
              e o dado que motiva a pagina inteira, precisa aparecer antes de
              qualquer clique, nao so dentro do plano de aplicacao do SICONV
              (camada 2). Ver equipamentoTags.ts pro casamento. */}
          {equipamentos.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {equipamentos.map((e) => (
                <span key={e} style={{
                  fontSize: 13, fontWeight: 800, color: colors.primaryDark, background: colors.surface,
                  border: `1px solid ${colors.border}`, padding: '4px 11px', borderRadius: 20,
                }}>
                  {e}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <StatusPill texto={c.situacao} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: colors.mutedText, textTransform: 'uppercase' }}>Valor global</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: colors.primaryDark }}>{fmtMoeda(c.financeiro.global)}</div>
            {pctDesembolsado !== null && <div style={{ fontSize: 10.5, color: colors.mutedText }}>{pctDesembolsado}% desembolsado</div>}
          </div>
        </div>
      </div>

      {/* Programa em destaque na camada 1 (trocado de lugar com Objeto,
          pedido do usuario 2026-09-09) -- e o dado que classifica o
          convenio dentro da politica de financiamento, mais util pra
          escanear rapido que o texto livre do objeto. */}
      <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: '12px 0 0', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '8px 10px' }}>
        <strong style={{ color: colors.mutedText, fontSize: 10.5, textTransform: 'uppercase', marginRight: 4 }}>Programa:</strong>
        {programaSiconv || (programaTransfereGov && `${programaTransfereGov.nm_programa}${programaTransfereGov.ano_programa ? ` (${programaTransfereGov.ano_programa})` : ''}`) || '— (não encontrado em nenhuma fonte)'}
      </p>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10,
        marginTop: 12, padding: '10px 12px', background: colors.surface, borderRadius: 8,
      }}>
        <Campo label="Empenhado" legenda={pct(c.financeiro.empenhado, c.financeiro.global, 'do global')}>{fmtMoeda(c.financeiro.empenhado)}</Campo>
        <Campo label="Desembolsado" legenda={pct(c.financeiro.desembolsado, c.financeiro.global, 'do global')}>{fmtMoeda(c.financeiro.desembolsado)}</Campo>
        <Campo label="Contrapartida">{fmtMoeda(c.financeiro.contrapartida)}</Campo>
        <Campo label="Saldo em conta">{fmtMoeda(c.financeiro.saldoConta)}</Campo>
        <Campo label="Última liberação" legenda={fmtData(c.datas.ultimaLiberacao) !== '—' ? fmtData(c.datas.ultimaLiberacao) : undefined}>
          {fmtMoeda(c.financeiro.ultimaLiberacaoValor)}
        </Campo>
      </div>
      {!c.financeiro.fonteConfiavel && (
        <p style={{ fontSize: 11, color: colors.logoOrange, margin: '8px 0 0' }}>
          ⚠️ Não encontrado no dump SICONV — valores acima vêm do Portal da Transparência, que tem bug de truncamento
          conhecido nesse campo. Conferir manualmente.
        </p>
      )}

      {/* ---------- Camada 2: dado tecnico aninhado, atras de 1 clique ---------- */}
      <details
        style={{ marginTop: 12, borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}
        open={detalheAberto}
        onToggle={(e) => setDetalheAberto((e.target as HTMLDetailsElement).open)}
      >
        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: colors.primary }}>
          {detalheAberto ? 'Ocultar detalhes técnicos' : 'Ver detalhes técnicos'} (identificação, vigência, SICONV, TransfereGov, monitoramento)
        </summary>

        <Secao titulo="Identificação">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
            <Campo label="Tipo convenente">{c.convenente.tipo}</Campo>
            <Campo label="Órgão">{c.orgao}</Campo>
            <Campo label="Unidade gestora">{c.unidadeGestora}</Campo>
            <Campo label="Função / subfunção">{c.funcao} / {c.subfuncao}</Campo>
            <Campo label="Tipo de instrumento">{c.tipoInstrumento}</Campo>
            <Campo label="Nº do processo">{c.numeroProcesso}</Campo>
            <Campo label="Região / código IBGE">{c.regiao} · {c.codigoIbge}</Campo>
            {c.situacaoContratacao && <Campo label="Situação da contratação (SICONV)">{c.situacaoContratacao}</Campo>}
            <Campo label="Objeto">{c.objeto}</Campo>
            {componenteSiconv ? (
              <Campo label="Componente PNPCC" legenda="SICONV, exato por ID_PROPOSTA">{componenteSiconv}</Campo>
            ) : componentes.length > 0 ? (
              <Campo label="Componente PNPCC" legenda="TransfereGov, aproximação por CNPJ">
                {componentes.map((cp) => `${cp.componente} (${cp.ano})`).join(' · ')}
              </Campo>
            ) : (
              <Campo label="Componente PNPCC">— (não encontrado em nenhuma fonte)</Campo>
            )}
          </div>
        </Secao>

        <Secao titulo="Vigência">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
            <Campo label="Publicação">{fmtData(c.datas.publicacao)}</Campo>
            <Campo label="Início vigência">{fmtData(c.datas.inicioVigencia)}</Campo>
            <Campo label="Fim vigência">{fmtData(c.datas.fimVigencia)}</Campo>
            <Campo label="Conclusão">{fmtData(c.datas.conclusao)}</Campo>
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
                  const programa = programas?.get(Number(d.id_programa));
                  return (
                    <details key={i} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
                      <summary style={{ cursor: 'pointer' }}>
                        <strong style={{ fontSize: 12.5 }}>{String(d.ds_objeto).slice(0, 120)}…</strong>{' '}
                        <StatusPill texto={String(d.situacao_proposta)} />
                      </summary>
                      <div style={{ marginTop: 8, fontSize: 12.5 }}>
                        {programa && (
                          <div style={{ fontSize: 11.5, color: colors.primary, fontWeight: 600, marginBottom: 4 }}>
                            Programa: {programa.nm_programa} {programa.ano_programa ? `(${programa.ano_programa})` : ''}
                          </div>
                        )}
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

        {/* Fala com o backend (nao JSON estatico) -- so montada quando o
            usuario abre a camada 2, nao dispara rede pros 299 convenios de
            uma vez. */}
        <Secao titulo="Monitoramento interno (POC)">
          {detalheAberto && <MonitoramentoInterno numeroConvenio={c.numero} />}
        </Secao>
      </details>
    </div>
  );
}
