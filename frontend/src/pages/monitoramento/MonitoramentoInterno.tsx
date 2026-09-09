/** Monitoramento interno pos-repasse -- POC de 1 instrumento so (convenio
 * 948686, decisao do usuario 2026-09-03), ver backend/app/routers/
 * monitoramento.py. Vive em pagina propria (frontend/src/pages/
 * MonitoramentoInstrumentoPage.tsx, achado 2026-09-09 -- antes ficava
 * embutido dentro do card do convenio, ConvenioCard.tsx so mostra um link
 * agora). Pros outros 402 convenios (ainda sem instrumento seedado) mostra
 * um aviso em vez de erro, sem tentar criar nada (a API ainda nao expoe
 * criacao de instrumento, so backend/scripts/seed_monitoramento.py --
 * decisao do usuario 2026-09-09: continua POC, nao escala ainda). */
import { useEffect, useState } from 'react';
import { colors } from '../../styles/tokens';
import { API_BASE_URL } from './api';
import { fmtData, fmtMoeda } from './format';
import type { SiconvEntrada } from './types';
import { useJson } from './useJson';
import { estiloCard, estiloInput, StatusPill } from './ui';

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
  /** Numero de matricula/licenca/processo (ex. matricula CNEN "16981") --
   * achado 2026-09-09, coluna propria (antes ia dentro de
   * status_regulatorio por engano, ver migration a9cd77597629). */
  numero_documento: string | null;
  /** Validade da licenca/matricula, quando aplicavel -- alimenta o
   * contador de vencimento abaixo. */
  data_validade: string | null;
  observacao: string | null;
  created_at: string;
};

type ValorSituacaoAoVivoApi = {
  disponivel: boolean;
  valor: number | null;
  valor_liberado: number | null;
  situacao: string | null;
  /** true quando `valor` < `valor_liberado` -- logicamente impossivel,
   * assinatura do bug de truncamento confirmado no Portal da Transparencia
   * (ver docstring de ValorSituacaoAoVivoRead no backend). O backend so
   * sinaliza, nao corrige -- o numero cru continua vindo do jeito que a
   * API devolveu. */
  valor_suspeito: boolean;
};

type InstrumentoApi = {
  id: number; nr_convenio: string; cnpj_convenente: string; nome_convenente: string;
  municipio: string | null; uf: string | null; cnes: string | null; equipamento_descricao: string | null;
  programa: string | null; tp_instrumento_programa: string | null; componente: string | null;
  ano_instrumento: number | null; tecnico_titular: string | null; tecnico_suplente: string | null;
  nivel_monitoramento: string | null; finalidade: string | null; modalidade_onco: string | null;
};

type TimelineApi = {
  instrumento: InstrumentoApi;
  /** Nunca congelado no banco (decisao do usuario 2026-09-03) -- o backend
   * busca isso ao vivo no Portal da Transparencia a cada chamada. Repara
   * que `valor`/`valor_liberado` sao os MESMOS campos com bug de
   * truncamento confirmado que o ConvenioCard.tsx contorna usando SICONV
   * (ver mesclarConvenios.ts) -- aqui nao tem SICONV pra cruzar (a timeline
   * e por instrumento, nao por convenio da lista principal), entao o valor
   * pode vir errado quando a API do Portal tiver esse bug. `disponivel`
   * so cobre "a API respondeu", nao "o valor esta certo". */
  ao_vivo: ValorSituacaoAoVivoApi;
  eventos: EventoMarcoApi[];
};

/** Dias até `dataIso` (negativo = já venceu) -- usado no contador de
 * validade da licença de operação. null quando não há data pra calcular. */
function diasAte(dataIso: string | null | undefined): number | null {
  if (!dataIso) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataIso + 'T00:00:00');
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

function corValidade(dias: number): string {
  if (dias < 0) return colors.hipoRed;
  if (dias < 90) return colors.hipoRed;
  if (dias < 180) return colors.logoOrange;
  return colors.hiperGreen;
}

export function MonitoramentoInterno({ numeroConvenio }: { numeroConvenio: string }) {
  const [marcos, setMarcos] = useState<MarcoCatalogoApi[] | null>(null);
  const [timeline, setTimeline] = useState<TimelineApi | null>(null);
  /** null = ainda checando; false = 404 (convenio sem instrumento seedado, caso normal pros outros 402). */
  const [monitorado, setMonitorado] = useState<boolean | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [marcoSelecionado, setMarcoSelecionado] = useState<number | null>(null);
  const [dataOcorrencia, setDataOcorrencia] = useState('');
  const [statusRegulatorio, setStatusRegulatorio] = useState('');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [dataValidade, setDataValidade] = useState('');
  const [observacao, setObservacao] = useState('');
  const [autorNome, setAutorNome] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Cadastro (equipamento/tecnico/nivel/finalidade/modalidade) -- unico
  // jeito de editar isso e o PATCH novo (achado 2026-09-09, antes so dava
  // pra mudar rodando scripts/seed_monitoramento.py de novo).
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [equipamentoDescricao, setEquipamentoDescricao] = useState('');
  const [tecnicoTitular, setTecnicoTitular] = useState('');
  const [tecnicoSuplente, setTecnicoSuplente] = useState('');
  const [nivelMonitoramento, setNivelMonitoramento] = useState('');
  const [finalidade, setFinalidade] = useState('');
  const [modalidadeOnco, setModalidadeOnco] = useState('');
  const [salvandoCadastro, setSalvandoCadastro] = useState(false);

  // Sugestao de equipamento a partir do dado REAL do SICONV pra esse
  // convenio (siconv.json, mesmo arquivo estatico que a pagina principal
  // usa) -- em vez de digitar do zero, reaproveita a descricao do item que
  // o proprio plano de aplicacao ja tem. So itens distintos, so quando o
  // convenio esta no dump (nem todo convenio monitorado necessariamente
  // esta -- ver mesclarConvenios.ts).
  const { dados: siconvTodos } = useJson<SiconvEntrada[]>('/monitoramento-equipamentos/siconv.json');
  const sugestoesEquipamento = (() => {
    const entrada = siconvTodos?.find((e) => e.convenio.NR_CONVENIO === numeroConvenio);
    const descricoes = (entrada?.itens_plano_aplicacao ?? []).map((it) => it.DESCRICAO_ITEM).filter(Boolean);
    return [...new Set(descricoes)];
  })();

  const carregar = () => {
    fetch(`${API_BASE_URL}/monitoramento/marcos`).then((r) => r.json()).then(setMarcos).catch((e) => setErro(String(e)));
    fetch(`${API_BASE_URL}/monitoramento/instrumentos/${numeroConvenio}`)
      .then((r) => {
        if (r.status === 404) { setMonitorado(false); return null; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: TimelineApi | null) => {
        if (data) {
          setMonitorado(true);
          setTimeline(data);
          const inst = data.instrumento;
          setEquipamentoDescricao(inst.equipamento_descricao ?? '');
          setTecnicoTitular(inst.tecnico_titular ?? '');
          setTecnicoSuplente(inst.tecnico_suplente ?? '');
          setNivelMonitoramento(inst.nivel_monitoramento ?? '');
          setFinalidade(inst.finalidade ?? '');
          setModalidadeOnco(inst.modalidade_onco ?? '');
        }
      })
      .catch((e) => setErro(String(e)));
  };

  useEffect(carregar, [numeroConvenio]);

  async function enviarEvento(e: React.FormEvent) {
    e.preventDefault();
    if (!marcoSelecionado || !autorNome.trim()) return;
    setEnviando(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/monitoramento/instrumentos/${numeroConvenio}/eventos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marco_id: marcoSelecionado,
          data_ocorrencia: dataOcorrencia || null,
          status_regulatorio: statusRegulatorio || null,
          numero_documento: numeroDocumento || null,
          data_validade: dataValidade || null,
          observacao: observacao || null,
          autor_nome: autorNome,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setDataOcorrencia(''); setStatusRegulatorio(''); setNumeroDocumento(''); setDataValidade('');
      setObservacao(''); setFormAberto(false);
      carregar();
    } catch (e) {
      setErro(String(e));
    } finally {
      setEnviando(false);
    }
  }

  async function salvarCadastro(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoCadastro(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/monitoramento/instrumentos/${numeroConvenio}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipamento_descricao: equipamentoDescricao || null,
          tecnico_titular: tecnicoTitular || null,
          tecnico_suplente: tecnicoSuplente || null,
          nivel_monitoramento: nivelMonitoramento || null,
          finalidade: finalidade || null,
          modalidade_onco: modalidadeOnco || null,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setCadastroAberto(false);
      carregar();
    } catch (e) {
      setErro(String(e));
    } finally {
      setSalvandoCadastro(false);
    }
  }

  if (erro) return <p style={{ color: colors.logoOrange, fontSize: 13 }}>⚠️ {erro}</p>;
  if (monitorado === false) {
    return (
      <p style={{ fontSize: 12.5, color: colors.mutedText, fontStyle: 'italic' }}>
        Ainda não monitorado internamente — POC cobre só o convênio 948686 por enquanto (decisão deliberada: validar
        o desenho antes de escalar pros demais).
      </p>
    );
  }
  if (!marcos || !timeline || monitorado === null) return <p style={{ fontSize: 13, color: colors.mutedText }}>Carregando...</p>;

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

  const cronogramaFisico = marcos.filter((m) => m.grupo === 'cronograma_fisico');
  const regulatorio = marcos.filter((m) => m.grupo === 'regulatorio');

  // Contador de validade -- so faz sentido pra licenca de operacao (e a
  // unica que de fato "vence" nesse catalogo; matricula/SCRA nao tem
  // prazo de renovacao no mesmo sentido). Evento mais recente com
  // data_validade preenchida.
  const marcoLicenca = regulatorio.find((m) => m.codigo === 'regulatorio_licenca_operacao');
  const eventoLicenca = (marcoLicenca && eventosPorMarco.get(marcoLicenca.id)?.find((e) => e.data_validade)) || null;
  const diasValidade = diasAte(eventoLicenca?.data_validade);

  const inst = timeline.instrumento;
  const aoVivo = timeline.ao_vivo;

  return (
    <div>
      <div style={{ ...estiloCard, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Convênio {inst.nr_convenio} — {inst.nome_convenente}</div>
            <div style={{ fontSize: 12, color: colors.mutedText }}>
              {inst.municipio}/{inst.uf} · CNES {inst.cnes} · {inst.equipamento_descricao}
            </div>
            <div style={{ fontSize: 12, color: colors.mutedText, marginTop: 4 }}>
              Programa: {inst.programa} ({inst.tp_instrumento_programa}) · Componente: <strong>{inst.componente}</strong>
            </div>
            <div style={{ fontSize: 11.5, color: colors.mutedText, marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <span>Técnico titular: <strong style={{ color: colors.primary }}>{inst.tecnico_titular ?? '—'}</strong></span>
              <span>Suplente: <strong>{inst.tecnico_suplente ?? '—'}</strong></span>
              <span>Nível: <strong>{inst.nivel_monitoramento ?? '—'}</strong></span>
              <span>Finalidade: <strong>{inst.finalidade ?? '—'}</strong></span>
              <span>Modalidade: <strong>{inst.modalidade_onco ?? '—'}</strong></span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, color: colors.mutedText, textTransform: 'uppercase' }}>
              Valor global {aoVivo.disponivel && '(ao vivo)'}
            </div>
            {aoVivo.disponivel ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{fmtMoeda(aoVivo.valor)}</div>
                <div style={{ fontSize: 11, color: colors.mutedText }}>Liberado: {fmtMoeda(aoVivo.valor_liberado)}</div>
                {aoVivo.situacao && <div style={{ marginTop: 4 }}><StatusPill texto={aoVivo.situacao} /></div>}
                {aoVivo.valor_suspeito && (
                  <div style={{ fontSize: 10.5, color: colors.logoOrange, marginTop: 4, maxWidth: 200, textAlign: 'right' }}>
                    ⚠️ Valor global menor que o liberado — bug de truncamento conhecido do Portal da Transparência, conferir manualmente.
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: colors.logoOrange }}>⚠️ Indisponível (Portal da Transparência)</div>
            )}
          </div>
        </div>
      </div>

      {/* Cadastro -- equipamento/tecnico/nivel/finalidade/modalidade.
          Achado 2026-09-09: antes disso nao existia NENHUM jeito de editar
          esses campos alem de rodar o script de seed de novo. */}
      <div style={{ ...estiloCard, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 13 }}>Cadastro do instrumento</strong>
          <button
            onClick={() => setCadastroAberto((v) => !v)}
            style={{ ...estiloInput, cursor: 'pointer', background: 'transparent', color: colors.primary, border: `1px solid ${colors.primary}`, fontWeight: 600, padding: '4px 10px' }}
          >
            {cadastroAberto ? 'Cancelar' : 'Editar cadastro'}
          </button>
        </div>

        {cadastroAberto && (
          <form onSubmit={salvarCadastro} style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Equipamento</label>
              <input
                style={{ ...estiloInput, width: '100%' }}
                value={equipamentoDescricao}
                onChange={(e) => setEquipamentoDescricao(e.target.value)}
                placeholder="Descrição do equipamento..."
              />
              {sugestoesEquipamento.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 10.5, color: colors.mutedText, alignSelf: 'center' }}>Do SICONV deste convênio:</span>
                  {sugestoesEquipamento.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setEquipamentoDescricao(s)}
                      title={s}
                      style={{
                        fontSize: 11, padding: '3px 9px', borderRadius: 20, cursor: 'pointer',
                        border: `1px solid ${colors.border}`, background: colors.surface, color: colors.primaryDark,
                        maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Técnico titular</label>
                <input style={{ ...estiloInput, width: '100%' }} value={tecnicoTitular} onChange={(e) => setTecnicoTitular(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Técnico suplente</label>
                <input style={{ ...estiloInput, width: '100%' }} value={tecnicoSuplente} onChange={(e) => setTecnicoSuplente(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Nível de monitoramento</label>
                <input style={{ ...estiloInput, width: '100%' }} value={nivelMonitoramento} onChange={(e) => setNivelMonitoramento(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Finalidade</label>
                <input style={{ ...estiloInput, width: '100%' }} value={finalidade} onChange={(e) => setFinalidade(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Modalidade</label>
                <input style={{ ...estiloInput, width: '100%' }} value={modalidadeOnco} onChange={(e) => setModalidadeOnco(e.target.value)} />
              </div>
            </div>
            <button type="submit" disabled={salvandoCadastro} style={{ ...estiloInput, cursor: 'pointer', background: colors.hiperGreen, color: '#fff', border: 'none', justifySelf: 'start', fontWeight: 600 }}>
              {salvandoCadastro ? 'Salvando...' : 'Salvar cadastro'}
            </button>
          </form>
        )}
      </div>

      {/* Stepper de fase_geral -- 1 segmento por fase (9 hoje) em vez de
          barra continua + lista de 9 rotulos embaixo, que espremia em tela
          estreita. Rotulo de cada fase vira title (hover), so a fase atual
          fica escrita por extenso acima -- menos ruido visual, mesma
          informacao. */}
      <div style={{ ...estiloCard, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
          <strong>Fase geral</strong>
          <span>{faseAtual?.rotulo ?? 'Não iniciado'} — {Math.round(pctAtual * 100)}%</span>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {fasesGerais.map((f) => {
            const alcancada = (f.ordem ?? -1) <= (faseAtual?.ordem ?? -1);
            const ehAtual = f.id === faseAtual?.id;
            return (
              <div
                key={f.id}
                title={f.rotulo}
                style={{
                  flex: 1,
                  height: 10,
                  borderRadius: 999,
                  background: ehAtual ? colors.primary : alcancada ? colors.hiperGreen : colors.surface,
                  border: alcancada ? 'none' : `1px solid ${colors.border}`,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Cronograma fisico + regulatorio -- mesmos grupos da planilha da
          equipe (INÍCIO DA FABRICAÇÃO/CHEGADA NO BRASIL/ENTREGA/
          INSTALAÇÃO/COMISSIONAMENTO e MATRÍCULA CNEN/SCRA/LICENÇA), so que
          lidos do evento_marco real -- sem coluna nova, sem dado inventado.
          Item sem evento lançado mostra "—" (sem registro), nao "pendente"
          nem qualquer outro rotulo que sugira prazo que ninguem informou.
          Regulatorio ganhou numero_documento + contador de validade
          (achado 2026-09-09) -- so a licenca de operacao "vence" de fato. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 16 }}>
        <div style={estiloCard}>
          <strong style={{ fontSize: 13 }}>Cronograma físico</strong>
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            {cronogramaFisico.map((m) => {
              const evs = eventosPorMarco.get(m.id);
              const ev = evs?.[0];
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ color: ev ? colors.primary : colors.mutedText }}>{m.rotulo}</span>
                  <span style={{ color: colors.mutedText, fontSize: 11, textAlign: 'right' }}>
                    {ev ? (fmtData(ev.data_ocorrencia) !== '—' ? fmtData(ev.data_ocorrencia) : `prev. ${fmtData(ev.data_prevista)}`) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={estiloCard}>
          <strong style={{ fontSize: 13 }}>Regulatório (CNEN)</strong>
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            {regulatorio.map((m) => {
              const evs = eventosPorMarco.get(m.id);
              const ev = evs?.[0];
              const ehLicenca = m.codigo === 'regulatorio_licenca_operacao';
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ color: ev ? colors.primary : colors.mutedText }}>
                      {m.rotulo}{ev?.numero_documento ? ` (nº ${ev.numero_documento})` : ''}
                    </span>
                    {ev?.status_regulatorio ? <StatusPill texto={ev.status_regulatorio} /> : <span style={{ color: colors.mutedText, fontSize: 11 }}>—</span>}
                  </div>
                  {ehLicenca && diasValidade !== null && (
                    <div style={{ fontSize: 10.5, color: corValidade(diasValidade), fontWeight: 600, textAlign: 'right' }}>
                      {diasValidade < 0
                        ? `⚠️ Vencida há ${Math.abs(diasValidade)} dia(s) (${fmtData(eventoLicenca?.data_validade)})`
                        : `Vence em ${diasValidade} dia(s) (${fmtData(eventoLicenca?.data_validade)})`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h4 style={{ fontSize: 13, color: '#16213e', margin: 0 }}>Linha do tempo de eventos</h4>
        <button onClick={() => setFormAberto((v) => !v)} style={{ ...estiloInput, cursor: 'pointer', background: colors.primary, color: '#fff', border: 'none', fontWeight: 600 }}>
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
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <select style={{ ...estiloInput, flex: 1, minWidth: 160 }} value={statusRegulatorio} onChange={(e) => setStatusRegulatorio(e.target.value)}>
                <option value="">Status regulatório...</option>
                {['NI', 'NA', 'Em análise', 'Em diligência', 'Deferido', 'Indeferido'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input
                style={{ ...estiloInput, flex: 1, minWidth: 160 }}
                placeholder="Nº matrícula/licença/processo"
                value={numeroDocumento}
                onChange={(e) => setNumeroDocumento(e.target.value)}
              />
              <input type="date" style={estiloInput} value={dataValidade} onChange={(e) => setDataValidade(e.target.value)} title="Validade (se aplicável)" />
            </div>
          )}
          <textarea style={{ ...estiloInput, minHeight: 60 }} placeholder="Observação (o que aconteceu)..." value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          <input required style={estiloInput} placeholder="Seu nome (autoria — sem login ainda)" value={autorNome} onChange={(e) => setAutorNome(e.target.value)} />
          <button type="submit" disabled={enviando} style={{ ...estiloInput, cursor: 'pointer', background: colors.hiperGreen, color: '#fff', border: 'none', justifySelf: 'start', fontWeight: 600 }}>
            {enviando ? 'Enviando...' : 'Registrar evento'}
          </button>
        </form>
      )}

      {timeline.eventos.length === 0 ? (
        <p style={{ color: colors.mutedText, fontStyle: 'italic', fontSize: 13 }}>Nenhum evento lançado ainda.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {/* Backend ja devolve mais recente primeiro -- numera decrescente
              (evento mais antigo = 01) pra ficar claro que e sequencia de
              lancamento, nao ranking. */}
          {timeline.eventos.map((ev, i) => {
            const marco = marcoPorId.get(ev.marco_id);
            const numero = String(timeline.eventos.length - i).padStart(2, '0');
            return (
              <div key={ev.id} style={{ ...estiloCard, display: 'flex', gap: 12 }}>
                <div
                  style={{
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: i === 0 ? colors.hiperGreenBg : colors.surface,
                    color: i === 0 ? colors.hiperGreen : colors.mutedText,
                    fontSize: 10.5, fontWeight: 700,
                  }}
                >
                  {numero}
                </div>
                <div style={{ minWidth: 80, fontSize: 11, color: colors.mutedText }}>{fmtData(ev.data_ocorrencia) !== '—' ? fmtData(ev.data_ocorrencia) : fmtData(ev.created_at.slice(0, 10))}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {marco?.rotulo ?? `Marco ${ev.marco_id}`}
                    {ev.numero_documento && <> — nº {ev.numero_documento}</>}
                    {ev.status_regulatorio && <> — <StatusPill texto={ev.status_regulatorio} /></>}
                  </div>
                  {ev.data_validade && (
                    <div style={{ fontSize: 11, color: colors.mutedText, marginTop: 1 }}>Validade: {fmtData(ev.data_validade)}</div>
                  )}
                  {ev.observacao && <div style={{ fontSize: 12.5, color: colors.mutedText, marginTop: 2 }}>{ev.observacao}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
