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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { colors } from '@/styles/tokens';
import { cn } from '@/lib/utils';
import {
  API_BASE_URL,
  assertRespostaOk,
  authHeaders,
  fetchCurrentUser,
  getAuthToken,
  login,
  setAuthToken,
  type AuthUser,
} from '@/services/monitoramento';
import { componenteDoProgramaSiconv } from '@/lib/componente-siconv';
import { fmtData, fmtMoeda } from '@/lib/monitoramento-format';
import type { SiconvEntrada } from '@/types/monitoramento';
import { corValidade, estiloCard, estiloInput, StatusPill } from './monitoramento-ui';
import { useJson } from '@/hooks/useJson';

function SecaoOperacional({
  titulo,
  subtitulo,
  acao,
  destaque = false,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  acao?: React.ReactNode;
  destaque?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn('mb-4 gap-0 py-0', destaque && 'bg-muted/50')}>
      <CardHeader className="grid-cols-[1fr_auto] gap-3 border-b py-3.5">
        <div>
          <CardTitle className="text-sm font-semibold tracking-[-0.01em] text-foreground">{titulo}</CardTitle>
          {subtitulo && <CardDescription className="mt-1 text-xs leading-snug">{subtitulo}</CardDescription>}
        </div>
        {acao}
      </CardHeader>
      <CardContent className="py-3.5">{children}</CardContent>
    </Card>
  );
}

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
  municipio: string | null; uf: string | null; cnes: string | null;
  /** Equipamento PLANEJADO (SICONV/plano de aplicacao) -- NUNCA editavel
   * por aqui (decisao do usuario 2026-09-09: "não vamos alterar o
   * equipamento que veio do SISCONV"). */
  equipamento_descricao: string | null;
  /** Equipamento FISICO de verdade, informado pelo estabelecimento DEPOIS
   * da entrega -- achado 2026-09-09, esses sim editaveis (ver
   * InstrumentoEquipamentoUpdate no backend). */
  equipamento_marca: string | null;
  equipamento_modelo: string | null;
  equipamento_numero_serie: string | null;
  equipamento_vida_util_anos: number | null;
  programa: string | null; tp_instrumento_programa: string | null; componente: string | null;
  ano_instrumento: number | null;
  /** "Convênio" (universo Portal/TransfereGov) / "FAF" / "TED" -- achado
   * 2026-09-09, 2a rodada (pedido do usuario: incluir os 28 registros da
   * planilha sem numero de convenio TransfereGov). So aparece como chip
   * quando != "Convênio"/null. */
  tipo_contratacao: string | null;
  tecnico_titular: string | null; tecnico_suplente: string | null;
  nivel_monitoramento: string | null; finalidade: string | null; modalidade_onco: string | null;
  /** Responsavel tecnico da execucao NA INSTITUICAO/convenente -- achado
   * 2026-09-09, DIFERENTE de tecnico_titular/suplente (nossa equipe).
   * Opcional, so informativo. */
  responsavel_execucao_nome: string | null;
  responsavel_execucao_contato: string | null;
};

/** Tarefa/pendencia da equipe -- DIFERENTE de EventoMarco de proposito
 * (design pedido pelo usuario 2026-09-09: "acho que as ações ficaria bom
 * separado dos eventos"). Sem taxonomia fixa (descricao livre), estado
 * pendente/concluida via `data_conclusao` (null = pendente) em vez de
 * historico imutavel contra um catalogo. */
type AcaoApi = {
  id: number;
  instrumento_id: number;
  nr_convenio: string;
  descricao: string;
  data_prevista: string | null;
  data_conclusao: string | null;
  responsavel: string | null;
  created_at: string;
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

export function MonitoramentoInterno({ numeroConvenio }: { numeroConvenio: string }) {
  // Fallback de componente via SICONV -- achado 2026-09-10 (bug real do
  // convenio 991708: a planilha da equipe deixou a celula "COMPONENTES DE
  // FINANCIAMENTO" vazia pra essa linha, entao `inst.componente` vem nulo
  // do banco -- mas o SICONV TEM essa informacao via NOME_PROGRAMA, so
  // nao é usada por padrao aqui porque o campo `componente` do
  // monitoramento interno e propositalmente so da planilha da equipe, ver
  // models.py). So exibido quando `inst.componente` for nulo, nunca
  // escrito no banco -- so leitura, mesmo dado/funcao ja usados no card
  // principal (componenteSiconv.ts).
  const { dados: siconvTodos } = useJson<SiconvEntrada[]>('/monitoramento-equipamentos/siconv.json');
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
  const [enviando, setEnviando] = useState(false);
  const [authTokenState, setAuthTokenState] = useState(() => getAuthToken());
  const [usuarioAtual, setUsuarioAtual] = useState<AuthUser | null>(null);
  const [checandoSessao, setChecandoSessao] = useState(Boolean(authTokenState));
  const [loginEmail, setLoginEmail] = useState('');
  const [loginSenha, setLoginSenha] = useState('');
  const [loginAberto, setLoginAberto] = useState(false);
  const [loginEnviando, setLoginEnviando] = useState(false);
  // Equipamento FISICO -- so pro marco cronograma_entrega (achado
  // 2026-09-09, 2a rodada: "o equipamento entregue pode mover para
  // eventos"). Nao e pre-preenchido com o estado atual de proposito --
  // cada lancamento de evento de entrega e um retrato novo, nao edicao.
  const [eventoEquipamentoMarca, setEventoEquipamentoMarca] = useState('');
  const [eventoEquipamentoModelo, setEventoEquipamentoModelo] = useState('');
  const [eventoEquipamentoNumeroSerie, setEventoEquipamentoNumeroSerie] = useState('');
  const [eventoEquipamentoVidaUtilAnos, setEventoEquipamentoVidaUtilAnos] = useState('');

  // Cadastro (tecnico/nivel/finalidade/modalidade + contato do responsavel
  // tecnico da execucao) -- unico jeito de editar isso e o PATCH novo
  // (achado 2026-09-09, antes so dava pra mudar rodando
  // scripts/seed_monitoramento.py de novo). Equipamento FISICO NAO mora
  // mais aqui (achado 2026-09-09, 2a rodada) -- ver eventoEquipamento* e o
  // form de "Lançar evento" pro marco cronograma_entrega.
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [tecnicoTitular, setTecnicoTitular] = useState('');
  const [tecnicoSuplente, setTecnicoSuplente] = useState('');
  const [nivelMonitoramento, setNivelMonitoramento] = useState('');
  const [finalidade, setFinalidade] = useState('');
  const [modalidadeOnco, setModalidadeOnco] = useState('');
  // Responsavel tecnico da execucao NA INSTITUICAO/convenente -- achado
  // 2026-09-09, opcional, sem exigir preenchimento (DIFERENTE de
  // tecnico_titular/suplente acima, que sao da nossa equipe).
  const [responsavelExecucaoNome, setResponsavelExecucaoNome] = useState('');
  const [responsavelExecucaoContato, setResponsavelExecucaoContato] = useState('');
  const [salvandoCadastro, setSalvandoCadastro] = useState(false);

  // Acoes de monitoramento -- separadas da timeline de eventos (design
  // pedido pelo usuario 2026-09-09). GET /monitoramento/acoes devolve TODAS
  // as acoes (usado tambem no overview agregado); aqui filtra client-side
  // pelo convenio da pagina, mesmo padrao ja usado noutro lugar do front.
  const [acoes, setAcoes] = useState<AcaoApi[] | null>(null);
  const [acaoDescricao, setAcaoDescricao] = useState('');
  const [acaoDataPrevista, setAcaoDataPrevista] = useState('');
  const [acaoResponsavel, setAcaoResponsavel] = useState('');
  const [enviandoAcao, setEnviandoAcao] = useState(false);
  const [concluindoAcaoId, setConcluindoAcaoId] = useState<number | null>(null);

  const carregar = () => {
    fetch(`${API_BASE_URL}/monitoramento/marcos`).then((r) => r.json()).then(setMarcos).catch((e) => setErro(String(e)));
    fetch(`${API_BASE_URL}/monitoramento/acoes`)
      .then((r) => r.json())
      .then((todas: AcaoApi[]) => setAcoes(todas.filter((a) => a.nr_convenio === numeroConvenio)))
      .catch((e) => setErro(String(e)));
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
          setTecnicoTitular(inst.tecnico_titular ?? '');
          setTecnicoSuplente(inst.tecnico_suplente ?? '');
          setNivelMonitoramento(inst.nivel_monitoramento ?? '');
          setFinalidade(inst.finalidade ?? '');
          setModalidadeOnco(inst.modalidade_onco ?? '');
          setResponsavelExecucaoNome(inst.responsavel_execucao_nome ?? '');
          setResponsavelExecucaoContato(inst.responsavel_execucao_contato ?? '');
        }
      })
      .catch((e) => setErro(String(e)));
  };

  useEffect(carregar, [numeroConvenio]);

  useEffect(() => {
    if (!authTokenState) {
      setUsuarioAtual(null);
      setChecandoSessao(false);
      return;
    }
    let cancelado = false;
    setChecandoSessao(true);
    fetchCurrentUser()
      .then((user) => {
        if (!cancelado) setUsuarioAtual(user);
      })
      .catch(() => {
        setAuthToken(null);
        if (!cancelado) {
          setAuthTokenState(null);
          setUsuarioAtual(null);
        }
      })
      .finally(() => {
        if (!cancelado) setChecandoSessao(false);
      });
    return () => {
      cancelado = true;
    };
  }, [authTokenState]);

  async function enviarLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginEnviando(true);
    try {
      const token = await login(loginEmail, loginSenha);
      setAuthTokenState(token);
      setErro(null);
      setLoginSenha('');
      setLoginAberto(false);
    } catch (e) {
      setErro(String(e));
    } finally {
      setLoginEnviando(false);
    }
  }

  function sair() {
    setAuthToken(null);
    setAuthTokenState(null);
    setUsuarioAtual(null);
  }

  function tratarErroEscrita(e: unknown) {
    if (!getAuthToken()) {
      setAuthTokenState(null);
      setUsuarioAtual(null);
      setLoginAberto(true);
    }
    setErro(String(e));
  }

  async function enviarEvento(e: React.FormEvent) {
    e.preventDefault();
    if (!marcoSelecionado) return;
    setEnviando(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/monitoramento/instrumentos/${numeroConvenio}/eventos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          marco_id: marcoSelecionado,
          data_ocorrencia: dataOcorrencia || null,
          status_regulatorio: statusRegulatorio || null,
          numero_documento: numeroDocumento || null,
          data_validade: dataValidade || null,
          observacao: observacao || null,
          // So tem efeito no backend quando o marco e cronograma_entrega
          // (achado 2026-09-09, 2a rodada) -- ignorado pra qualquer outro.
          equipamento_marca: eventoEquipamentoMarca || null,
          equipamento_modelo: eventoEquipamentoModelo || null,
          equipamento_numero_serie: eventoEquipamentoNumeroSerie || null,
          equipamento_vida_util_anos: eventoEquipamentoVidaUtilAnos ? Number(eventoEquipamentoVidaUtilAnos) : null,
        }),
      });
      await assertRespostaOk(resp);
      setDataOcorrencia(''); setStatusRegulatorio(''); setNumeroDocumento(''); setDataValidade('');
      setObservacao(''); setFormAberto(false);
      setEventoEquipamentoMarca(''); setEventoEquipamentoModelo('');
      setEventoEquipamentoNumeroSerie(''); setEventoEquipamentoVidaUtilAnos('');
      carregar();
    } catch (e) {
      tratarErroEscrita(e);
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
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          tecnico_titular: tecnicoTitular || null,
          tecnico_suplente: tecnicoSuplente || null,
          nivel_monitoramento: nivelMonitoramento || null,
          finalidade: finalidade || null,
          modalidade_onco: modalidadeOnco || null,
          responsavel_execucao_nome: responsavelExecucaoNome || null,
          responsavel_execucao_contato: responsavelExecucaoContato || null,
        }),
      });
      await assertRespostaOk(resp);
      setCadastroAberto(false);
      carregar();
    } catch (e) {
      tratarErroEscrita(e);
    } finally {
      setSalvandoCadastro(false);
    }
  }

  async function criarAcao(e: React.FormEvent) {
    e.preventDefault();
    if (!acaoDescricao.trim()) return;
    setEnviandoAcao(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/monitoramento/instrumentos/${numeroConvenio}/acoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          descricao: acaoDescricao,
          data_prevista: acaoDataPrevista || null,
          responsavel: acaoResponsavel || null,
        }),
      });
      await assertRespostaOk(resp);
      setAcaoDescricao(''); setAcaoDataPrevista(''); setAcaoResponsavel('');
      carregar();
    } catch (e) {
      tratarErroEscrita(e);
    } finally {
      setEnviandoAcao(false);
    }
  }

  async function concluirAcao(acaoId: number) {
    setConcluindoAcaoId(acaoId);
    try {
      const resp = await fetch(`${API_BASE_URL}/monitoramento/acoes/${acaoId}/concluir`, { method: 'PATCH', headers: authHeaders() });
      await assertRespostaOk(resp);
      carregar();
    } catch (e) {
      tratarErroEscrita(e);
    } finally {
      setConcluindoAcaoId(null);
    }
  }

  if (erro) return <p style={{ color: colors.logoOrange, fontSize: 13 }}>⚠️ {erro}</p>;
  if (monitorado === false) {
    return (
      <p style={{ fontSize: 12.5, color: colors.mutedText, fontStyle: 'italic' }}>
        Ainda não monitorado internamente — escopo é bem menor que os 403 convênios (só os instrumentos que a
        equipe decide acompanhar manualmente, ver <code>backend/scripts/importar_planilha_monitoramento.py</code>).
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

  // Previsao de inauguracao -- destaque pedido pelo usuario 2026-09-09
  // ("também é um dado que se destaca pra nós"). Se ja tem data_ocorrencia
  // no marco, o equipamento ja foi inaugurado (fato consumado); senao usa
  // data_prevista (previsao ainda em aberto) pra contar dias.
  const marcoInauguracao = cronogramaFisico.find((m) => m.codigo === 'cronograma_previsao_inauguracao');
  const eventoInauguracao = (marcoInauguracao && eventosPorMarco.get(marcoInauguracao.id)?.[0]) || null;
  const inaugurado = !!eventoInauguracao?.data_ocorrencia;
  const dataInauguracao = eventoInauguracao?.data_ocorrencia || eventoInauguracao?.data_prevista || null;
  const diasInauguracao = !inaugurado ? diasAte(dataInauguracao) : null;

  const inst = timeline.instrumento;
  const aoVivo = timeline.ao_vivo;
  const autenticado = Boolean(usuarioAtual);
  const podeEditar = usuarioAtual?.role === 'admin' || usuarioAtual?.role === 'colaborador';

  // So calcula o fallback quando precisa (inst.componente nulo) -- cruza
  // siconv.json pelo nr_convenio, mesma logica ja usada no card principal.
  const componenteViaSiconv = !inst.componente
    ? componenteDoProgramaSiconv(siconvTodos?.find((e) => e.convenio.NR_CONVENIO === inst.nr_convenio)?.programa?.NOME_PROGRAMA)
    : null;
  const acoesAbertas = (acoes ?? []).filter((a) => !a.data_conclusao);
  const acoesAtrasadas = acoesAbertas.filter((a) => {
    const dias = diasAte(a.data_prevista);
    return dias !== null && dias < 0;
  });
  const equipamentoFisico = [inst.equipamento_marca, inst.equipamento_modelo].filter(Boolean).join(' ') || null;
  const validadeLicenca = eventoLicenca?.data_validade ? diasAte(eventoLicenca.data_validade) : null;
  const textoLicenca = validadeLicenca === null
    ? 'Sem validade registrada'
    : validadeLicenca < 0
      ? `Vencida há ${Math.abs(validadeLicenca)} dia(s)`
      : `Vence em ${validadeLicenca} dia(s)`;

  return (
    <div>
      <div style={{ ...estiloCard, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
              Convênio {inst.nr_convenio} — {inst.nome_convenente}
              {/* Chip de tipo_contratacao -- achado 2026-09-09, 2a rodada:
                  os 28 registros FAF/TED (sem numero TransfereGov, usam o
                  NUP SEI como identificador aqui) agora convivem com os
                  Convênio de verdade -- deixa claro qual é qual. */}
              {inst.tipo_contratacao && inst.tipo_contratacao !== 'Convênio' && (
                <span style={{
                  fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                  background: colors.logoOrangeBg, color: colors.logoOrange,
                }}>
                  {inst.tipo_contratacao}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: colors.mutedText }}>
              {inst.municipio}/{inst.uf} · CNES {inst.cnes} · <span title="Equipamento planejado (SICONV/plano de aplicação) — não editável aqui">{inst.equipamento_descricao}</span>
            </div>
            <div style={{ fontSize: 12, color: colors.mutedText, marginTop: 4 }}>
              Programa: {inst.programa} ({inst.tp_instrumento_programa}) · Componente:{' '}
              {inst.componente ? (
                <strong>{inst.componente}</strong>
              ) : componenteViaSiconv ? (
                <span title="Não preenchido na planilha da equipe — derivado do programa SICONV pra esse convênio">
                  <strong>{componenteViaSiconv}</strong> <em style={{ fontStyle: 'normal', color: colors.subtleText }}>(via SICONV)</em>
                </span>
              ) : (
                <strong>—</strong>
              )}
            </div>
            {(inst.responsavel_execucao_nome || inst.responsavel_execucao_contato) && (
              <div style={{ fontSize: 12, color: colors.mutedText, marginTop: 4 }}>
                Responsável técnico da execução (instituição): <strong>{inst.responsavel_execucao_nome ?? '—'}</strong>
                {inst.responsavel_execucao_contato && <> · {inst.responsavel_execucao_contato}</>}
              </div>
            )}
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

        {/* Previsao de inauguracao em destaque -- pedido do usuario
            2026-09-09 ("também é um dado que se destaca pra nós"). So
            aparece quando ha data (evento lançado pro marco) -- "—" nao e
            mostrado aqui de proposito, o cronograma físico abaixo ja cobre
            o caso sem registro. */}
        {dataInauguracao && (
          <div style={{
            marginTop: 12, paddingTop: 10, borderTop: `1px solid ${colors.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>
              {inaugurado ? '🎉 Inaugurado em' : '📅 Previsão de inauguração:'} {fmtData(dataInauguracao)}
            </span>
            {!inaugurado && diasInauguracao !== null && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: diasInauguracao < 0 ? colors.logoOrange : colors.primary }}>
                {diasInauguracao < 0 ? `⚠️ Atrasada há ${Math.abs(diasInauguracao)} dia(s)` : `Faltam ${diasInauguracao} dia(s)`}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        {[
          { rotulo: 'Equipe DECAN', valor: inst.tecnico_titular ?? '—', detalhe: inst.tecnico_suplente ? `Suplente: ${inst.tecnico_suplente}` : 'Sem suplente informado' },
          { rotulo: 'Monitoramento', valor: inst.nivel_monitoramento ?? '—', detalhe: [inst.finalidade, inst.modalidade_onco].filter(Boolean).join(' · ') || 'Sem classificação complementar' },
          { rotulo: 'Equipamento físico', valor: equipamentoFisico ?? 'Não informado', detalhe: inst.equipamento_numero_serie ? `Série ${inst.equipamento_numero_serie}` : 'Registro feito no evento de entrega' },
          { rotulo: 'Licença CNEN', valor: eventoLicenca?.status_regulatorio ?? 'Sem registro', detalhe: textoLicenca, alerta: validadeLicenca !== null && validadeLicenca < 90 },
          { rotulo: 'Inauguração', valor: inaugurado ? 'Realizada' : dataInauguracao ? 'Prevista' : 'Sem previsão', detalhe: dataInauguracao ? fmtData(dataInauguracao) : 'Sem marco registrado', alerta: diasInauguracao !== null && diasInauguracao < 0 },
          { rotulo: 'Ações abertas', valor: acoesAbertas.length, detalhe: `${acoesAtrasadas.length} atrasada(s)`, alerta: acoesAtrasadas.length > 0 },
        ].map((item) => (
          <div
            key={item.rotulo}
            className={cn(
              'rounded-xl border bg-card p-3.5 shadow-xs',
              item.alerta ? 'border-warning' : 'border-border'
            )}
          >
            <div className="mb-1.5 text-[10.5px] font-extrabold tracking-[0.05em] text-muted-foreground uppercase">
              {item.rotulo}
            </div>
            <strong className="block text-[15px] leading-tight text-foreground">{item.valor}</strong>
            <div className={cn('mt-1 text-[11.5px] leading-snug', item.alerta ? 'text-warning' : 'text-muted-foreground')}>{item.detalhe}</div>
          </div>
        ))}
      </div>

      <SecaoOperacional
        titulo="Acesso operacional"
        subtitulo={checandoSessao
          ? 'Conferindo sessão...'
          : usuarioAtual
            ? `${usuarioAtual.name} (${usuarioAtual.role})${podeEditar ? '' : ' · somente leitura'}`
            : 'Entre para editar cadastro, lançar eventos e concluir ações.'}
        acao={usuarioAtual ? (
            <button
              onClick={sair}
              style={{ ...estiloInput, cursor: 'pointer', background: 'transparent', color: colors.primary, border: `1px solid ${colors.primary}`, fontWeight: 600, padding: '4px 10px' }}
            >
              Sair
            </button>
          ) : (
            <button
              onClick={() => setLoginAberto((v) => !v)}
              style={{ ...estiloInput, cursor: 'pointer', background: colors.primary, color: '#fff', border: 'none', fontWeight: 600, padding: '4px 10px' }}
            >
              {loginAberto ? 'Cancelar' : 'Entrar'}
            </button>
          )}
      >
        {!autenticado && loginAberto && (
          <form onSubmit={enviarLogin} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Email</label>
              <input type="email" required style={{ ...estiloInput, width: '100%' }} value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Senha</label>
              <input type="password" required style={{ ...estiloInput, width: '100%' }} value={loginSenha} onChange={(e) => setLoginSenha(e.target.value)} />
            </div>
            <button type="submit" disabled={loginEnviando} style={{ ...estiloInput, cursor: 'pointer', background: colors.hiperGreen, color: '#fff', border: 'none', fontWeight: 600 }}>
              {loginEnviando ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        )}
      </SecaoOperacional>

      {/* Cadastro -- equipamento/tecnico/nivel/finalidade/modalidade.
          Achado 2026-09-09: antes disso nao existia NENHUM jeito de editar
          esses campos alem de rodar o script de seed de novo. */}
      <SecaoOperacional
        titulo="Cadastro interno"
        subtitulo="Campos mantidos pela equipe para qualificar o acompanhamento do instrumento."
        acao={(
          <button
            onClick={() => setCadastroAberto((v) => !v)}
            disabled={!podeEditar}
            style={{ ...estiloInput, cursor: 'pointer', background: 'transparent', color: colors.primary, border: `1px solid ${colors.primary}`, fontWeight: 600, padding: '4px 10px' }}
          >
            {cadastroAberto ? 'Cancelar' : 'Editar cadastro'}
          </button>
        )}
      >
        {cadastroAberto && (
          <form onSubmit={salvarCadastro} style={{ display: 'grid', gap: 16 }}>
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
            {/* Responsavel tecnico da execucao NA INSTITUICAO/convenente --
                achado 2026-09-09, DIFERENTE dos campos de tecnico
                titular/suplente acima (que sao da nossa equipe). Opcional,
                sem exigir preenchimento. */}
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.primary, marginBottom: 8 }}>
                Responsável técnico da execução <span style={{ fontWeight: 400, color: colors.mutedText, textTransform: 'none' }}>(na instituição/convenente, opcional)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Nome</label>
                  <input style={{ ...estiloInput, width: '100%' }} value={responsavelExecucaoNome} onChange={(e) => setResponsavelExecucaoNome(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Contato</label>
                  <input style={{ ...estiloInput, width: '100%' }} value={responsavelExecucaoContato} onChange={(e) => setResponsavelExecucaoContato(e.target.value)} />
                </div>
              </div>
            </div>
            <button type="submit" disabled={salvandoCadastro} style={{ ...estiloInput, cursor: 'pointer', background: colors.hiperGreen, color: '#fff', border: 'none', justifySelf: 'start', fontWeight: 600 }}>
              {salvandoCadastro ? 'Salvando...' : 'Salvar cadastro'}
            </button>
          </form>
        )}
        {!cadastroAberto && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            {[
              ['Técnico titular', inst.tecnico_titular],
              ['Técnico suplente', inst.tecnico_suplente],
              ['Nível', inst.nivel_monitoramento],
              ['Finalidade', inst.finalidade],
              ['Modalidade', inst.modalidade_onco],
              ['Responsável na instituição', inst.responsavel_execucao_nome],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
                <div style={{ fontSize: 10.5, color: colors.mutedText, fontWeight: 800, textTransform: 'uppercase' }}>{rotulo}</div>
                <div style={{ fontSize: 12.5, color: colors.primaryDark, marginTop: 3 }}>{valor || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </SecaoOperacional>

      {/* Stepper de fase_geral -- 1 segmento por fase (9 hoje) em vez de
          barra continua + lista de 9 rotulos embaixo, que espremia em tela
          estreita. Rotulo de cada fase vira title (hover), so a fase atual
          fica escrita por extenso acima -- menos ruido visual, mesma
          informacao. */}
      <SecaoOperacional
        titulo="Fase geral"
        subtitulo="Marco mais avançado registrado no acompanhamento interno."
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
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
      </SecaoOperacional>

      {/* Cronograma fisico + regulatorio -- mesmos grupos da planilha da
          equipe (INÍCIO DA FABRICAÇÃO/CHEGADA NO BRASIL/ENTREGA/
          INSTALAÇÃO/COMISSIONAMENTO e MATRÍCULA CNEN/SCRA/LICENÇA), so que
          lidos do evento_marco real -- sem coluna nova, sem dado inventado.
          Item sem evento lançado mostra "—" (sem registro), nao "pendente"
          nem qualquer outro rotulo que sugira prazo que ninguem informou.
          Regulatorio ganhou numero_documento + contador de validade
          (achado 2026-09-09) -- so a licenca de operacao "vence" de fato. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 16 }}>
        <SecaoOperacional
          titulo="Cronograma físico"
          subtitulo="Fabricação, chegada, entrega, instalação, comissionamento e inauguração."
        >
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
        </SecaoOperacional>

        <SecaoOperacional
          titulo="Regulatório (CNEN)"
          subtitulo="Matrícula, processo, licença e validade informados no monitoramento interno."
        >
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
                  {ehLicenca && eventoLicenca?.data_ocorrencia && (
                    <div style={{ fontSize: 10.5, color: colors.mutedText, textAlign: 'right' }}>
                      Emitida em {fmtData(eventoLicenca.data_ocorrencia)}
                    </div>
                  )}
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
        </SecaoOperacional>
      </div>

      {/* Acoes de monitoramento -- visualmente separada da timeline de
          eventos abaixo (design pedido pelo usuario 2026-09-09: "acho que
          as ações ficaria bom separado dos eventos"). Fundo proprio
          (surface) pra nao confundir com os cards brancos da timeline. */}
      <SecaoOperacional
        titulo="Ações de monitoramento"
        subtitulo="Pendências operacionais da equipe, separadas dos eventos históricos."
        destaque
      >
        <form onSubmit={criarAcao} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
          <div style={{ flex: 2, minWidth: 220 }}>
            <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Nova ação</label>
            <input
              required style={{ ...estiloInput, width: '100%' }} placeholder="O que precisa ser feito..."
              value={acaoDescricao} onChange={(e) => setAcaoDescricao(e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Prazo</label>
            <input type="date" style={estiloInput} value={acaoDataPrevista} onChange={(e) => setAcaoDataPrevista(e.target.value)} />
          </div>
          <div style={{ minWidth: 160 }}>
            <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Responsável</label>
            <input style={{ ...estiloInput, width: '100%' }} value={acaoResponsavel} onChange={(e) => setAcaoResponsavel(e.target.value)} />
          </div>
          <button type="submit" disabled={!podeEditar || enviandoAcao} style={{ ...estiloInput, cursor: 'pointer', background: colors.primary, color: '#fff', border: 'none', fontWeight: 600 }}>
            {enviandoAcao ? 'Adicionando...' : '+ Adicionar'}
          </button>
        </form>

        {!acoes || acoes.length === 0 ? (
          <p style={{ color: colors.mutedText, fontStyle: 'italic', fontSize: 12.5, margin: 0 }}>Nenhuma ação registrada ainda.</p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {[...acoes]
              .sort((a, b) => Number(!!a.data_conclusao) - Number(!!b.data_conclusao) || (a.data_prevista ?? '9999').localeCompare(b.data_prevista ?? '9999'))
              .map((acao) => {
                const diasPrazo = !acao.data_conclusao ? diasAte(acao.data_prevista) : null;
                const atrasada = diasPrazo !== null && diasPrazo < 0;
                return (
                  <div
                    key={acao.id}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                      background: '#fff', borderRadius: 8, padding: '8px 10px',
                      border: `1px solid ${atrasada ? colors.hipoRed : colors.border}`,
                      opacity: acao.data_conclusao ? 0.6 : 1,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 12.5, fontWeight: 600,
                        textDecoration: acao.data_conclusao ? 'line-through' : 'none',
                      }}>
                        {acao.descricao}
                      </div>
                      <div style={{ fontSize: 11, color: colors.mutedText, marginTop: 2 }}>
                        {acao.responsavel && <>Responsável: {acao.responsavel} · </>}
                        {acao.data_conclusao
                          ? `Concluída em ${fmtData(acao.data_conclusao)}`
                          : acao.data_prevista
                            ? `Prazo: ${fmtData(acao.data_prevista)}`
                            : 'Sem prazo definido'}
                        {atrasada && <span style={{ color: colors.hipoRed, fontWeight: 700 }}> · ⚠️ atrasada há {Math.abs(diasPrazo!)} dia(s)</span>}
                      </div>
                    </div>
                    {!acao.data_conclusao && (
                      <button
                        onClick={() => concluirAcao(acao.id)}
                        disabled={!podeEditar || concluindoAcaoId === acao.id}
                        style={{ ...estiloInput, cursor: 'pointer', background: 'transparent', color: colors.hiperGreen, border: `1px solid ${colors.hiperGreen}`, fontWeight: 600, padding: '4px 10px', whiteSpace: 'nowrap' }}
                      >
                        {concluindoAcaoId === acao.id ? '...' : '✓ Concluir'}
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </SecaoOperacional>

      <SecaoOperacional
        titulo="Linha do tempo de eventos"
        subtitulo="Histórico dos marcos lançados para este instrumento."
        acao={(
          <button disabled={!podeEditar} onClick={() => setFormAberto((v) => !v)} style={{ ...estiloInput, cursor: 'pointer', background: colors.primary, color: '#fff', border: 'none', fontWeight: 600 }}>
          {formAberto ? 'Cancelar' : '+ Lançar evento'}
        </button>
        )}
      >

      {formAberto && (() => {
        const marcoDoForm = marcoPorId.get(marcoSelecionado ?? -1);
        const ehRegulatorio = marcoDoForm?.grupo === 'regulatorio';
        const ehLicencaOperacao = marcoDoForm?.codigo === 'regulatorio_licenca_operacao';
        // Achado 2026-09-09, 2a rodada (pedido do usuario: "o equipamento
        // entregue pode mover para eventos") -- so o marco de entrega pede
        // os campos fisicos, junto do mesmo lancamento.
        const ehEntrega = marcoDoForm?.codigo === 'cronograma_entrega';
        return (
        <form onSubmit={enviarEvento} style={{ ...estiloCard, marginBottom: 16, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Marco</label>
              <select required style={{ ...estiloInput, width: '100%' }} value={marcoSelecionado ?? ''} onChange={(e) => setMarcoSelecionado(Number(e.target.value))}>
                <option value="" disabled>Selecione o marco...</option>
                {['fase_geral', 'cronograma_fisico', 'regulatorio'].map((grupo) => (
                  <optgroup key={grupo} label={grupo === 'fase_geral' ? 'Fase geral' : grupo === 'cronograma_fisico' ? 'Cronograma físico' : 'Regulatório (CNEN)'}>
                    {marcos.filter((m) => m.grupo === grupo).map((m) => <option key={m.id} value={m.id}>{m.rotulo}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              {/* Rotulo dinamico -- pedido do usuario 2026-09-09: "a licenca
                  cnen vamos precisar da data da licença e da data de
                  validade da licença", nao so um icone de calendario com
                  tooltip. */}
              <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>
                {ehLicencaOperacao ? 'Data da licença' : ehRegulatorio ? 'Data do documento' : 'Data de ocorrência'}
              </label>
              <input type="date" style={estiloInput} value={dataOcorrencia} onChange={(e) => setDataOcorrencia(e.target.value)} />
            </div>
          </div>
          {ehRegulatorio && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Status regulatório</label>
                <select style={{ ...estiloInput, width: '100%' }} value={statusRegulatorio} onChange={(e) => setStatusRegulatorio(e.target.value)}>
                  <option value="">Status regulatório...</option>
                  {['NI', 'NA', 'Em análise', 'Em diligência', 'Deferido', 'Indeferido'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Nº matrícula/licença/processo</label>
                <input style={{ ...estiloInput, width: '100%' }} value={numeroDocumento} onChange={(e) => setNumeroDocumento(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Data de validade</label>
                <input type="date" style={estiloInput} value={dataValidade} onChange={(e) => setDataValidade(e.target.value)} />
              </div>
            </div>
          )}
          {ehEntrega && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.primary, marginBottom: 8 }}>
                Equipamento entregue <span style={{ fontWeight: 400, color: colors.mutedText, textTransform: 'none' }}>(informado pelo estabelecimento, opcional)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Marca</label>
                  <input style={{ ...estiloInput, width: '100%' }} value={eventoEquipamentoMarca} onChange={(e) => setEventoEquipamentoMarca(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Modelo</label>
                  <input style={{ ...estiloInput, width: '100%' }} value={eventoEquipamentoModelo} onChange={(e) => setEventoEquipamentoModelo(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Nº de série</label>
                  <input style={{ ...estiloInput, width: '100%' }} value={eventoEquipamentoNumeroSerie} onChange={(e) => setEventoEquipamentoNumeroSerie(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Vida útil (anos)</label>
                  <input
                    type="number" min={0} style={{ ...estiloInput, width: '100%' }}
                    value={eventoEquipamentoVidaUtilAnos} onChange={(e) => setEventoEquipamentoVidaUtilAnos(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
          <textarea style={{ ...estiloInput, minHeight: 60 }} placeholder="Observação (o que aconteceu)..." value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          <button type="submit" disabled={enviando} style={{ ...estiloInput, cursor: 'pointer', background: colors.hiperGreen, color: '#fff', border: 'none', justifySelf: 'start', fontWeight: 600 }}>
            {enviando ? 'Enviando...' : 'Registrar evento'}
          </button>
        </form>
        );
      })()}

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
      </SecaoOperacional>
    </div>
  );
}
