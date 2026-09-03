import { useEffect, useMemo, useState } from 'react';

/**
 * Pagina de MONITORAMENTO DE EQUIPAMENTO -- separada da analise de merito
 * de hipo/hipersuficiencia (decisao do usuario, 2026-09-03). Fora do
 * AppLayout/TopNav de proposito (ver App.tsx): sem link nenhum a partir do
 * resto do app, sem FamiliaEquipamentoContext, tema visual proprio (escuro)
 * pra deixar claro que e um espaco separado -- so acessivel indo direto na
 * URL /monitoramento-equipamentos.
 *
 * Cruza 3 fontes pros mesmos 71 numeros de convenio legado (SICONV) ja
 * validados em backend/scripts/validar_convenios.py:
 *   - convenios.json     -- Portal da Transparencia (/convenios/numero), 1:1 exato por numero
 *   - siconv.json         -- dump bulk do SICONV legado (NR_CONVENIO exato -- empenho,
 *                            desembolso, licitacao, termo aditivo, item de plano de aplicacao)
 *   - transferegov.json  -- API nova do TransfereGov (modulo Gestao de Parcerias),
 *                            cruzada por CNPJ do convenente (aproximacao, nao numero exato --
 *                            so existe pra propostas criadas DEPOIS da migracao pro TransfereGov)
 *
 * Os 3 JSON vem de backend/scripts/coletar_*.py e validar_convenios.py --
 * copiados pra public/monitoramento-equipamentos/ (ver README la) sempre
 * que os scripts rodarem de novo. Nao ha chamada de API a partir do
 * frontend -- tudo pre-processado, fetch so pega o JSON estatico.
 */

type Convenio = {
  numero: string;
  numero_instrumento: string | null;
  objeto: string;
  situacao: string;
  data_publicacao: string | null;
  data_inicio_vigencia: string | null;
  data_final_vigencia: string | null;
  data_conclusao: string | null;
  data_ultima_liberacao: string | null;
  convenente_nome: string;
  convenente_cnpj: string;
  convenente_tipo: string;
  municipio: string;
  codigo_ibge: string;
  uf: string;
  regiao: string;
  orgao: string;
  unidade_gestora: string;
  subfuncao: string;
  funcao: string;
  tipo_instrumento: string;
  valor: number;
  valor_liberado: number;
  valor_contrapartida: number;
  valor_ultima_liberacao: number;
  numero_processo: string;
};

type SiconvEntrada = {
  convenio: Record<string, string>;
  empenhos: Record<string, string>[];
  desembolsos: Record<string, string>[];
  licitacoes: Record<string, string>[];
  termos_aditivos: Record<string, string>[];
  itens_plano_aplicacao: Record<string, string>[];
};

type TransfereGovEnte = {
  cnpj: string;
  nome: string;
  convenios_legados_relacionados: string[];
  total_propostas_na_api: number;
  propostas_expandidas: PropostaExpandida[];
};

type PropostaExpandida = {
  proposta: Record<string, unknown>;
  metas: { cd_meta: number; nm_meta: string; ds_meta: string | null; etapas_proposta: EtapaExpandida[] }[];
  cronograma_desembolso: Record<string, unknown>[];
  distribuicao_recurso: Record<string, unknown>[];
  parcerias: { parceria: Record<string, unknown>; empenhos: Record<string, unknown>[]; documentos_habeis: Record<string, unknown>[] }[];
};

type EtapaExpandida = {
  cd_etapa: string;
  nm_etapa: string;
  ds_etapa: string | null;
  itens: Record<string, unknown>[];
};

const paleta = {
  bg: '#0f1420', panel: '#171d2e', panel2: '#1c2436', border: '#2a3348', text: '#e6e9f0',
  muted: '#8b93a7', accent: '#4f8cff', green: '#34c77b', yellow: '#e0b23a',
};

function fmtMoeda(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function fmtData(s: string | null | undefined): string {
  if (!s) return '—';
  if (s.includes('/')) return s; // ja vem dd/mm/aaaa no dump SICONV
  const [ano, mes, dia] = s.split('-');
  return `${dia}/${mes}/${ano}`;
}

function useJson<T>(url: string) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setDados)
      .catch((e) => setErro(String(e)));
  }, [url]);
  return { dados, erro };
}

const estiloPagina: React.CSSProperties = {
  minHeight: '100vh', background: paleta.bg, color: paleta.text,
  fontFamily: '-apple-system, Segoe UI, Roboto, Arial, sans-serif', padding: 24,
};
const estiloCard: React.CSSProperties = { background: paleta.panel, border: `1px solid ${paleta.border}`, borderRadius: 10, padding: '14px 18px' };
const estiloInput: React.CSSProperties = { background: paleta.panel, border: `1px solid ${paleta.border}`, color: paleta.text, padding: '8px 10px', borderRadius: 8, fontSize: 13 };

function Aba({ ativa, onClick, children }: { ativa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...estiloInput, cursor: 'pointer', fontWeight: 600,
        background: ativa ? paleta.accent : paleta.panel, color: ativa ? '#fff' : paleta.text,
        border: `1px solid ${ativa ? paleta.accent : paleta.border}`,
      }}
    >
      {children}
    </button>
  );
}

function Cards({ itens }: { itens: { label: string; valor: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
      {itens.map((c) => (
        <div key={c.label} style={estiloCard}>
          <div style={{ fontSize: 11, color: paleta.muted, textTransform: 'uppercase', letterSpacing: '.04em' }}>{c.label}</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{c.valor}</div>
        </div>
      ))}
    </div>
  );
}

function badgeCor(situacao: string | null | undefined): string {
  const s = (situacao || '').toUpperCase();
  if (s.includes('EXECU')) return paleta.green;
  if (s.includes('PRESTA') || s.includes('ANALISE') || s.includes('ANÁLISE') || s.includes('CAPTA')) return paleta.yellow;
  return paleta.muted;
}

function Badge({ texto }: { texto: string | null | undefined }) {
  const cor = badgeCor(texto);
  return (
    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 600, background: `${cor}26`, color: cor, whiteSpace: 'nowrap' }}>
      {texto || '—'}
    </span>
  );
}

// ---------- Aba Convênios (Portal da Transparência) ----------

function AbaConvenios({ dados }: { dados: Convenio[] }) {
  const [busca, setBusca] = useState('');
  const [uf, setUf] = useState('');
  const ufs = useMemo(() => [...new Set(dados.map((d) => d.uf))].sort(), [dados]);

  const filtrados = dados.filter((d) => {
    if (uf && d.uf !== uf) return false;
    if (busca) {
      const alvo = `${d.numero} ${d.convenente_nome} ${d.municipio} ${d.objeto}`.toUpperCase();
      if (!alvo.includes(busca.toUpperCase())) return false;
    }
    return true;
  });

  const total = filtrados.reduce((a, d) => a + (d.valor || 0), 0);
  const liberado = filtrados.reduce((a, d) => a + (d.valor_liberado || 0), 0);

  return (
    <div>
      <Cards
        itens={[
          { label: 'Convênios', valor: String(filtrados.length) },
          { label: 'Valor global total', valor: fmtMoeda(total) },
          { label: 'Valor liberado total', valor: fmtMoeda(liberado) },
        ]}
      />
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input style={{ ...estiloInput, flex: 1, minWidth: 240 }} placeholder="Buscar por convenente, município, número..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select style={estiloInput} value={uf} onChange={(e) => setUf(e.target.value)}>
          <option value="">Todas as UFs</option>
          {ufs.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      <div style={{ color: paleta.muted, fontSize: 12, marginBottom: 10 }}>{filtrados.length} de {dados.length} convênio(s)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
        {filtrados.map((d) => (
          <details key={d.numero} style={{ ...estiloCard, cursor: 'pointer' }}>
            <summary style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Convênio {d.numero}</div>
                <div style={{ fontSize: 11, color: paleta.muted }}>{d.numero_instrumento || '—'}</div>
              </div>
              <Badge texto={d.situacao} />
            </summary>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 600 }}>{d.convenente_nome}</div>
              <div style={{ fontSize: 12, color: paleta.muted }}>{d.convenente_cnpj} · {d.municipio}/{d.uf}</div>
              <p style={{ fontSize: 12.5 }}>{d.objeto}</p>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
                <div><div style={{ fontSize: 10.5, color: paleta.muted }}>VALOR GLOBAL</div><strong>{fmtMoeda(d.valor)}</strong></div>
                <div><div style={{ fontSize: 10.5, color: paleta.muted }}>LIBERADO</div><strong>{fmtMoeda(d.valor_liberado)}</strong></div>
                <div><div style={{ fontSize: 10.5, color: paleta.muted }}>CONTRAPARTIDA</div><strong>{fmtMoeda(d.valor_contrapartida)}</strong></div>
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// ---------- Aba SICONV detalhado ----------

function AbaSiconv({ dados }: { dados: SiconvEntrada[] }) {
  const [busca, setBusca] = useState('');
  const filtrados = dados.filter((e) => {
    if (!busca) return true;
    const alvo = `${e.convenio.NR_CONVENIO} ${e.convenio.SIT_CONVENIO}`.toUpperCase();
    return alvo.includes(busca.toUpperCase());
  });

  return (
    <div>
      <p style={{ fontSize: 12.5, color: paleta.muted, maxWidth: 900, lineHeight: 1.6 }}>
        Dump bulk do SICONV legado (repositorio.dados.gov.br/seges/detru/), cruzado por{' '}
        <code>NR_CONVENIO</code> exato — sem aproximação. Traz IDs granulares (ID_EMPENHO, ID_DESEMBOLSO,
        ID_LICITACAO, ID_ITEM_PAD) que a API nova não tem.
      </p>
      <input style={{ ...estiloInput, width: '100%', marginBottom: 12 }} placeholder="Buscar por número de convênio ou situação..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      {filtrados.map((e) => {
        const c = e.convenio;
        return (
          <details key={c.NR_CONVENIO} style={{ ...estiloCard, marginBottom: 10 }}>
            <summary style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <strong>Convênio {c.NR_CONVENIO}</strong>{' '}
                <span style={{ fontSize: 11, color: paleta.muted }}>proposta SICONV {c.ID_PROPOSTA}</span>
              </div>
              <Badge texto={c.SIT_CONVENIO} />
            </summary>
            <div style={{ marginTop: 10, fontSize: 12.5 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                <tbody>
                  <tr><td style={{ color: paleta.muted, padding: '3px 8px 3px 0' }}>Valor global</td><td>{fmtMoeda(c.VL_GLOBAL_CONV)}</td></tr>
                  <tr><td style={{ color: paleta.muted, padding: '3px 8px 3px 0' }}>Empenhado</td><td>{fmtMoeda(c.VL_EMPENHADO_CONV)}</td></tr>
                  <tr><td style={{ color: paleta.muted, padding: '3px 8px 3px 0' }}>Desembolsado</td><td>{fmtMoeda(c.VL_DESEMBOLSADO_CONV)}</td></tr>
                  <tr><td style={{ color: paleta.muted, padding: '3px 8px 3px 0' }}>Saldo em conta</td><td>{fmtMoeda(c.VL_SALDO_CONTA)}</td></tr>
                  <tr><td style={{ color: paleta.muted, padding: '3px 8px 3px 0' }}>Vigência</td><td>{fmtData(c.DIA_INIC_VIGENC_CONV)} até {fmtData(c.DIA_FIM_VIGENC_CONV)}</td></tr>
                  <tr><td style={{ color: paleta.muted, padding: '3px 8px 3px 0' }}>Situação contratação</td><td>{c.SITUACAO_CONTRATACAO || '—'}</td></tr>
                </tbody>
              </table>

              <h4 style={{ fontSize: 11, textTransform: 'uppercase', color: paleta.muted, margin: '10px 0 4px' }}>Empenhos (ID_EMPENHO) — {e.empenhos.length}</h4>
              {e.empenhos.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                  <thead><tr style={{ color: paleta.muted, fontSize: 11 }}><th style={{ textAlign: 'left' }}>ID</th><th style={{ textAlign: 'left' }}>Nº empenho</th><th style={{ textAlign: 'left' }}>Situação</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
                  <tbody>
                    {e.empenhos.map((emp) => (
                      <tr key={emp.ID_EMPENHO}><td>{emp.ID_EMPENHO}</td><td>{emp.NR_EMPENHO}</td><td>{emp.DESC_SITUACAO_EMPENHO}</td><td style={{ textAlign: 'right' }}>{fmtMoeda(emp.VALOR_EMPENHO)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h4 style={{ fontSize: 11, textTransform: 'uppercase', color: paleta.muted, margin: '10px 0 4px' }}>Desembolsos (ID_DESEMBOLSO) — {e.desembolsos.length}</h4>
              {e.desembolsos.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                  <thead><tr style={{ color: paleta.muted, fontSize: 11 }}><th style={{ textAlign: 'left' }}>ID</th><th style={{ textAlign: 'left' }}>Data</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
                  <tbody>
                    {e.desembolsos.map((d) => (
                      <tr key={d.ID_DESEMBOLSO}><td>{d.ID_DESEMBOLSO}</td><td>{fmtData(d.DATA_DESEMBOLSO)}</td><td style={{ textAlign: 'right' }}>{fmtMoeda(d.VL_DESEMBOLSADO)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h4 style={{ fontSize: 11, textTransform: 'uppercase', color: paleta.muted, margin: '10px 0 4px' }}>Licitações (ID_LICITACAO) — {e.licitacoes.length}</h4>
              {e.licitacoes.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                  <thead><tr style={{ color: paleta.muted, fontSize: 11 }}><th style={{ textAlign: 'left' }}>ID</th><th style={{ textAlign: 'left' }}>Modalidade</th><th style={{ textAlign: 'left' }}>Status</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
                  <tbody>
                    {e.licitacoes.map((l) => (
                      <tr key={l.ID_LICITACAO}><td>{l.ID_LICITACAO}</td><td>{l.TIPO_PROCESSO_COMPRA || l.MODALIDADE_LICITACAO}</td><td>{l.STATUS_LICITACAO}</td><td style={{ textAlign: 'right' }}>{fmtMoeda(l.VALOR_LICITACAO)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h4 style={{ fontSize: 11, textTransform: 'uppercase', color: paleta.muted, margin: '10px 0 4px' }}>Itens do plano de aplicação (ID_ITEM_PAD) — {e.itens_plano_aplicacao.length}</h4>
              {e.itens_plano_aplicacao.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                  <thead><tr style={{ color: paleta.muted, fontSize: 11 }}><th style={{ textAlign: 'left' }}>ID_ITEM_PAD</th><th style={{ textAlign: 'left' }}>Descrição</th><th style={{ textAlign: 'right' }}>Qtd</th><th style={{ textAlign: 'right' }}>Vl. unitário</th><th style={{ textAlign: 'right' }}>Vl. total</th></tr></thead>
                  <tbody>
                    {e.itens_plano_aplicacao.map((it) => (
                      <tr key={it.ID_ITEM_PAD}><td>{it.ID_ITEM_PAD}</td><td>{it.DESCRICAO_ITEM}</td><td style={{ textAlign: 'right' }}>{it.QTD_ITEM}</td><td style={{ textAlign: 'right' }}>{fmtMoeda(it.VALOR_UNITARIO_ITEM)}</td><td style={{ textAlign: 'right' }}>{fmtMoeda(it.VALOR_TOTAL_ITEM)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}

              {e.termos_aditivos.length > 0 && (
                <>
                  <h4 style={{ fontSize: 11, textTransform: 'uppercase', color: paleta.muted, margin: '10px 0 4px' }}>Termos aditivos (ID_SOLICITACAO) — {e.termos_aditivos.length}</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ color: paleta.muted, fontSize: 11 }}><th style={{ textAlign: 'left' }}>ID_SOLICITACAO</th><th style={{ textAlign: 'left' }}>Tipo</th><th style={{ textAlign: 'right' }}>Valor global</th><th style={{ textAlign: 'left' }}>Justificativa</th></tr></thead>
                    <tbody>
                      {e.termos_aditivos.map((t, i) => (
                        <tr key={i}><td>{t.ID_SOLICITACAO || '—'}</td><td>{t.TIPO_TA}</td><td style={{ textAlign: 'right' }}>{fmtMoeda(t.VL_GLOBAL_TA)}</td><td style={{ maxWidth: 400 }}>{(t.JUSTIFICATIVA_TA || '').slice(0, 200)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

// ---------- Aba TransfereGov ----------

function AbaTransfereGov({ dados }: { dados: TransfereGovEnte[] }) {
  const [busca, setBusca] = useState('');
  const filtrados = dados.filter((e) => {
    if (!busca) return e.propostas_expandidas.length > 0;
    const alvo = `${e.nome} ${e.cnpj}`.toUpperCase();
    return alvo.includes(busca.toUpperCase());
  });

  const totalPropostas = dados.reduce((a, e) => a + e.propostas_expandidas.length, 0);
  const totalParcerias = dados.reduce((a, e) => a + e.propostas_expandidas.reduce((b, p) => b + p.parcerias.length, 0), 0);

  return (
    <div>
      <p style={{ fontSize: 12.5, color: paleta.muted, maxWidth: 900, lineHeight: 1.6 }}>
        API de dados abertos do módulo Gestão de Parcerias do TransfereGov, cruzada por <strong>CNPJ</strong> do
        convenente (aproximação — a API nova não tem número de convênio legado). Só propostas com
        "EQUIPAMENTO" no objeto foram expandidas.
      </p>
      <Cards
        itens={[
          { label: 'Entes com proposta', valor: `${dados.filter((e) => e.total_propostas_na_api > 0).length}/${dados.length}` },
          { label: 'Propostas de equipamento', valor: String(totalPropostas) },
          { label: 'Viraram parceria', valor: String(totalParcerias) },
        ]}
      />
      <input style={{ ...estiloInput, width: '100%', marginBottom: 12 }} placeholder="Buscar por ente ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      {filtrados.map((e) => (
        <details key={e.cnpj} style={{ ...estiloCard, marginBottom: 10 }}>
          <summary style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <strong>{e.nome}</strong>
              <div style={{ fontSize: 11, color: paleta.muted }}>CNPJ {e.cnpj} · convênios legados: {e.convenios_legados_relacionados.join(', ')}</div>
            </div>
            <span style={{ fontSize: 11, color: paleta.muted }}>{e.total_propostas_na_api} proposta(s) na API</span>
          </summary>
          <div style={{ marginTop: 10 }}>
            {e.propostas_expandidas.map((p, i) => {
              const d = p.proposta as Record<string, string | number>;
              return (
                <details key={i} style={{ background: paleta.panel2, border: `1px solid ${paleta.border}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
                  <summary>
                    <strong>{String(d.ds_objeto).slice(0, 120)}…</strong>{' '}
                    <Badge texto={String(d.situacao_proposta)} />
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
                                <div key={j} style={{ marginLeft: 12, color: paleta.muted }}>
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
                          <strong>Parceria {String(parceria.cd_parceria)}</strong> — <Badge texto={String(parceria.in_situacao_parceria)} />
                          <div style={{ color: paleta.muted }}>Empenhos: {pa.empenhos.length} · Documentos hábeis: {pa.documentos_habeis.length}</div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}

// ---------- Aba Timeline (monitoramento interno pos-repasse) ----------
// POC de 1 instrumento so (convenio 948686, decisao do usuario 2026-09-03)
// -- ver backend/app/routers/monitoramento.py. Diferente das outras 3 abas,
// essa fala com o BACKEND (nao um JSON estatico), porque e o unico dado que
// muda por acao do usuario (lancamento de evento).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const CONVENIO_POC = '948686';

type MarcoCatalogoApi = {
  id: number;
  codigo: string;
  grupo: 'fase_geral' | 'cronograma_fisico' | 'regulatorio';
  ordem: number | null;
  execucao_fisica_pct_referencia: number | null;
  rotulo: string;
  descricao_referencia: string | null;
};

type EventoMarcoApi = {
  id: number;
  marco_id: number;
  data_ocorrencia: string | null;
  data_prevista: string | null;
  status_regulatorio: string | null;
  observacao: string | null;
  created_at: string;
};

type TimelineApi = {
  instrumento: {
    id: number; nr_convenio: string; cnpj_convenente: string; nome_convenente: string;
    municipio: string | null; uf: string | null; cnes: string | null; equipamento_descricao: string | null;
    programa: string | null; tp_instrumento_programa: string | null; componente: string | null;
    ano_instrumento: number | null; tecnico_titular: string | null; tecnico_suplente: string | null;
    nivel_monitoramento: string | null; finalidade: string | null; modalidade_onco: string | null;
  };
  // Sempre buscado ao vivo no Portal da Transparencia pelo backend -- nunca
  // congelado no banco (decisao do usuario 2026-09-03).
  ao_vivo: { disponivel: boolean; valor: number | null; valor_liberado: number | null; situacao: string | null };
  eventos: EventoMarcoApi[];
};

function AbaTimeline() {
  const [marcos, setMarcos] = useState<MarcoCatalogoApi[] | null>(null);
  const [timeline, setTimeline] = useState<TimelineApi | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [marcoSelecionado, setMarcoSelecionado] = useState<number | null>(null);
  const [dataOcorrencia, setDataOcorrencia] = useState('');
  const [statusRegulatorio, setStatusRegulatorio] = useState('');
  const [observacao, setObservacao] = useState('');
  const [autorNome, setAutorNome] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = () => {
    fetch(`${API_BASE_URL}/monitoramento/marcos`).then((r) => r.json()).then(setMarcos).catch((e) => setErro(String(e)));
    fetch(`${API_BASE_URL}/monitoramento/instrumentos/${CONVENIO_POC}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} — instrumento ainda não foi semeado no banco? Ver scripts/seed_monitoramento.py`); return r.json(); })
      .then(setTimeline)
      .catch((e) => setErro(String(e)));
  };

  useEffect(carregar, []);

  async function enviarEvento(e: React.FormEvent) {
    e.preventDefault();
    if (!marcoSelecionado || !autorNome.trim()) return;
    setEnviando(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/monitoramento/instrumentos/${CONVENIO_POC}/eventos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marco_id: marcoSelecionado,
          data_ocorrencia: dataOcorrencia || null,
          status_regulatorio: statusRegulatorio || null,
          observacao: observacao || null,
          autor_nome: autorNome,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setDataOcorrencia(''); setStatusRegulatorio(''); setObservacao(''); setFormAberto(false);
      carregar();
    } catch (e) {
      setErro(String(e));
    } finally {
      setEnviando(false);
    }
  }

  if (erro) return <p style={{ color: paleta.yellow }}>⚠️ {erro}</p>;
  if (!marcos || !timeline) return <p>Carregando...</p>;

  const marcoPorId = new Map(marcos.map((m) => [m.id, m]));
  const fasesGerais = marcos.filter((m) => m.grupo === 'fase_geral').sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  // Fase atual = marco de fase_geral de maior ordem com evento lancado.
  const eventosPorMarco = new Map<number, EventoMarcoApi[]>();
  for (const ev of timeline.eventos) {
    if (!eventosPorMarco.has(ev.marco_id)) eventosPorMarco.set(ev.marco_id, []);
    eventosPorMarco.get(ev.marco_id)!.push(ev);
  }
  const faseAtual = [...fasesGerais].reverse().find((m) => eventosPorMarco.has(m.id));
  const pctAtual = faseAtual?.execucao_fisica_pct_referencia ?? 0;

  const inst = timeline.instrumento;
  const aoVivo = timeline.ao_vivo;

  return (
    <div>
      <p style={{ fontSize: 12.5, color: paleta.muted, maxWidth: 900, lineHeight: 1.6 }}>
        Prova de conceito de monitoramento interno — só o convênio {CONVENIO_POC} por enquanto (decisão
        deliberada: validar o desenho antes de escalar pros 71). Log append-only: cada lançamento vira um
        evento novo, nunca sobrescreve o anterior. Sem login ainda — autoria é texto livre.
      </p>

      <div style={{ ...estiloCard, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Convênio {inst.nr_convenio} — {inst.nome_convenente}</div>
            <div style={{ fontSize: 12, color: paleta.muted }}>
              {inst.municipio}/{inst.uf} · CNES {inst.cnes} · {inst.equipamento_descricao}
            </div>
            <div style={{ fontSize: 12, color: paleta.muted, marginTop: 4 }}>
              Programa: {inst.programa} ({inst.tp_instrumento_programa}) · Componente: <strong>{inst.componente}</strong>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, color: paleta.muted }}>
              VALOR GLOBAL {aoVivo.disponivel ? '(ao vivo)' : ''}
            </div>
            {aoVivo.disponivel ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{fmtMoeda(aoVivo.valor)}</div>
                <div style={{ fontSize: 11, color: paleta.muted }}>Liberado: {fmtMoeda(aoVivo.valor_liberado)}</div>
                <div style={{ marginTop: 4 }}><Badge texto={aoVivo.situacao} /></div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: paleta.yellow }}>⚠️ Indisponível (Portal da Transparência)</div>
            )}
          </div>
        </div>
      </div>

      {/* Barra de progresso -- fase_geral */}
      <div style={{ ...estiloCard, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <strong>Fase geral</strong>
          <span>{faseAtual?.rotulo ?? 'Não iniciado'} — {Math.round(pctAtual * 100)}%</span>
        </div>
        <div style={{ height: 8, background: paleta.border, borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pctAtual * 100}%`, background: paleta.accent, transition: 'width .3s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: paleta.muted }}>
          {fasesGerais.map((f) => <span key={f.id}>{f.rotulo}</span>)}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h4 style={{ fontSize: 13, textTransform: 'none', color: paleta.text, margin: 0 }}>Linha do tempo de eventos</h4>
        <button onClick={() => setFormAberto((v) => !v)} style={{ ...estiloInput, cursor: 'pointer', background: paleta.accent, color: '#fff', border: 'none' }}>
          {formAberto ? 'Cancelar' : '+ Lançar evento'}
        </button>
      </div>

      {formAberto && (
        <form onSubmit={enviarEvento} style={{ ...estiloCard, marginBottom: 16, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select required style={{ ...estiloInput, flex: 1, minWidth: 240 }} value={marcoSelecionado ?? ''} onChange={(e) => setMarcoSelecionado(Number(e.target.value))}>
              <option value="" disabled>Selecione o marco...</option>
              {['fase_geral', 'cronograma_fisico', 'regulatorio'].map((grupo) => (
                <optgroup key={grupo} label={grupo === 'fase_geral' ? 'Fase geral' : grupo === 'cronograma_fisico' ? 'Cronograma físico' : 'Regulatório (CNEN)'}>
                  {marcos.filter((m) => m.grupo === grupo).map((m) => <option key={m.id} value={m.id}>{m.rotulo}</option>)}
                </optgroup>
              ))}
            </select>
            <input type="date" style={estiloInput} value={dataOcorrencia} onChange={(e) => setDataOcorrencia(e.target.value)} title="Data de ocorrência" />
          </div>
          {marcoPorId.get(marcoSelecionado ?? -1)?.grupo === 'regulatorio' && (
            <select style={estiloInput} value={statusRegulatorio} onChange={(e) => setStatusRegulatorio(e.target.value)}>
              <option value="">Status regulatório...</option>
              {['NI', 'NA', 'Em análise', 'Em diligência', 'Deferido', 'Indeferido'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <textarea style={{ ...estiloInput, minHeight: 60 }} placeholder="Observação (o que aconteceu)..." value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          <input required style={estiloInput} placeholder="Seu nome (autoria — sem login ainda)" value={autorNome} onChange={(e) => setAutorNome(e.target.value)} />
          <button type="submit" disabled={enviando} style={{ ...estiloInput, cursor: 'pointer', background: paleta.green, color: '#fff', border: 'none', justifySelf: 'start' }}>
            {enviando ? 'Enviando...' : 'Registrar evento'}
          </button>
        </form>
      )}

      {timeline.eventos.length === 0 ? (
        <p className="vazio" style={{ color: paleta.muted, fontStyle: 'italic' }}>Nenhum evento lançado ainda.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {timeline.eventos.map((ev) => {
            const marco = marcoPorId.get(ev.marco_id);
            return (
              <div key={ev.id} style={{ ...estiloCard, display: 'flex', gap: 12 }}>
                <div style={{ minWidth: 90, fontSize: 11, color: paleta.muted }}>{fmtData(ev.data_ocorrencia) !== '—' ? fmtData(ev.data_ocorrencia) : fmtData(ev.created_at.slice(0, 10))}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {marco?.rotulo ?? `Marco ${ev.marco_id}`}
                    {ev.status_regulatorio && <> — <Badge texto={ev.status_regulatorio} /></>}
                  </div>
                  {ev.observacao && <div style={{ fontSize: 12.5, color: paleta.muted, marginTop: 2 }}>{ev.observacao}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MonitoramentoEquipamentosPage() {
  const [aba, setAba] = useState<'convenios' | 'siconv' | 'transferegov' | 'timeline'>('convenios');
  const { dados: convenios, erro: erroConvenios } = useJson<Convenio[]>('/monitoramento-equipamentos/convenios.json');
  const { dados: siconv, erro: erroSiconv } = useJson<SiconvEntrada[]>('/monitoramento-equipamentos/siconv.json');
  const { dados: transferegov, erro: erroTransferegov } = useJson<TransfereGovEnte[]>('/monitoramento-equipamentos/transferegov.json');

  return (
    <div style={estiloPagina}>
      <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>Monitoramento de Equipamentos — Convênios (MS)</h1>
      <p style={{ color: paleta.muted, fontSize: 13, maxWidth: 900, lineHeight: 1.6, marginBottom: 16 }}>
        Página separada da análise de mérito de hipo/hipersuficiência do SIEO — esforço de monitoramento
        dos 71 convênios de aquisição de equipamento já validados, cruzando 3 fontes oficiais.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <Aba ativa={aba === 'convenios'} onClick={() => setAba('convenios')}>Portal da Transparência</Aba>
        <Aba ativa={aba === 'siconv'} onClick={() => setAba('siconv')}>SICONV detalhado</Aba>
        <Aba ativa={aba === 'transferegov'} onClick={() => setAba('transferegov')}>TransfereGov (novo)</Aba>
        <Aba ativa={aba === 'timeline'} onClick={() => setAba('timeline')}>Timeline interna (POC)</Aba>
      </div>

      {aba === 'convenios' && (erroConvenios ? <p>Erro: {erroConvenios}</p> : convenios ? <AbaConvenios dados={convenios} /> : <p>Carregando...</p>)}
      {aba === 'siconv' && (erroSiconv ? <p>Erro: {erroSiconv}</p> : siconv ? <AbaSiconv dados={siconv} /> : <p>Carregando...</p>)}
      {aba === 'transferegov' && (erroTransferegov ? <p>Erro: {erroTransferegov}</p> : transferegov ? <AbaTransfereGov dados={transferegov} /> : <p>Carregando...</p>)}
      {aba === 'timeline' && <AbaTimeline />}
    </div>
  );
}
