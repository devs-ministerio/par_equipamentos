/** Monitoramento interno pos-repasse -- POC de 1 instrumento so (convenio
 * 948686, decisao do usuario 2026-09-03), ver backend/app/routers/
 * monitoramento.py. Renderizado DENTRO do card de cada convenio (ver
 * ConvenioCard.tsx), so busca no backend quando o card e expandido -- pros
 * outros 70 convenios (ainda sem instrumento seedado) mostra um aviso em
 * vez de erro, sem tentar criar nada (a API ainda nao expoe criacao de
 * instrumento, so backend/scripts/seed_monitoramento.py). */
import { useEffect, useState } from 'react';
import { colors } from '../../styles/tokens';
import { fmtData, fmtMoeda } from './format';
import { estiloCard, estiloInput, StatusPill } from './ui';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

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

type TimelineApi = {
  instrumento: {
    id: number; nr_convenio: string; cnpj_convenente: string; nome_convenente: string;
    municipio: string | null; uf: string | null; cnes: string | null; equipamento_descricao: string | null;
    programa: string | null; tp_instrumento_programa: string | null; componente: string | null;
    ano_instrumento: number | null; tecnico_titular: string | null; tecnico_suplente: string | null;
    nivel_monitoramento: string | null; finalidade: string | null; modalidade_onco: string | null;
  };
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

export function MonitoramentoInterno({ numeroConvenio }: { numeroConvenio: string }) {
  const [marcos, setMarcos] = useState<MarcoCatalogoApi[] | null>(null);
  const [timeline, setTimeline] = useState<TimelineApi | null>(null);
  /** null = ainda checando; false = 404 (convenio sem instrumento seedado, caso normal pros 70 fora do POC). */
  const [monitorado, setMonitorado] = useState<boolean | null>(null);
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
    fetch(`${API_BASE_URL}/monitoramento/instrumentos/${numeroConvenio}`)
      .then((r) => {
        if (r.status === 404) { setMonitorado(false); return null; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data) { setMonitorado(true); setTimeline(data); }
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

  if (erro) return <p style={{ color: colors.logoOrange, fontSize: 13 }}>⚠️ {erro}</p>;
  if (monitorado === false) {
    return (
      <p style={{ fontSize: 12.5, color: colors.mutedText, fontStyle: 'italic' }}>
        Ainda não monitorado internamente — POC cobre só o convênio 948686 por enquanto (decisão deliberada: validar
        o desenho antes de escalar pros 71).
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

      {/* Barra de progresso -- fase_geral */}
      <div style={{ ...estiloCard, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
          <strong>Fase geral</strong>
          <span>{faseAtual?.rotulo ?? 'Não iniciado'} — {Math.round(pctAtual * 100)}%</span>
        </div>
        <div style={{ height: 8, background: colors.surface, borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pctAtual * 100}%`, background: colors.primary, transition: 'width .3s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: colors.mutedText, flexWrap: 'wrap', gap: 4 }}>
          {fasesGerais.map((f) => <span key={f.id}>{f.rotulo}</span>)}
        </div>
      </div>

      {/* Cronograma fisico + regulatorio -- mesmos grupos da planilha da
          equipe (INÍCIO DA FABRICAÇÃO/CHEGADA NO BRASIL/ENTREGA/
          INSTALAÇÃO/COMISSIONAMENTO e MATRÍCULA CNEN/SCRA/LICENÇA), so que
          lidos do evento_marco real -- sem coluna nova, sem dado inventado.
          Item sem evento lançado mostra "—" (sem registro), nao "pendente"
          nem qualquer outro rotulo que sugira prazo que ninguem informou. */}
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
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ color: ev ? colors.primary : colors.mutedText }}>{m.rotulo}</span>
                  {ev?.status_regulatorio ? <StatusPill texto={ev.status_regulatorio} /> : <span style={{ color: colors.mutedText, fontSize: 11 }}>—</span>}
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
            <select style={estiloInput} value={statusRegulatorio} onChange={(e) => setStatusRegulatorio(e.target.value)}>
              <option value="">Status regulatório...</option>
              {['NI', 'NA', 'Em análise', 'Em diligência', 'Deferido', 'Indeferido'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
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
          {timeline.eventos.map((ev) => {
            const marco = marcoPorId.get(ev.marco_id);
            return (
              <div key={ev.id} style={{ ...estiloCard, display: 'flex', gap: 12 }}>
                <div style={{ minWidth: 90, fontSize: 11, color: colors.mutedText }}>{fmtData(ev.data_ocorrencia) !== '—' ? fmtData(ev.data_ocorrencia) : fmtData(ev.created_at.slice(0, 10))}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {marco?.rotulo ?? `Marco ${ev.marco_id}`}
                    {ev.status_regulatorio && <> — <StatusPill texto={ev.status_regulatorio} /></>}
                  </div>
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
