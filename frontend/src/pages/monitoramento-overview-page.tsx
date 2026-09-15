/**
 * Pagina de overview do monitoramento interno -- INDEPENDENTE (achado
 * 2026-09-09, pedido do usuario: "quero que seja independente, não mostrar
 * apenas quando abrir um convênio especifico"). Antes so existia a pagina
 * de DETALHE de 1 instrumento (MonitoramentoInstrumentoPage.tsx); esta e
 * o indice/dashboard que reune todos os instrumentos monitorados (105+ a
 * partir da planilha real da equipe, ver
 * backend/scripts/importar_planilha_monitoramento.py).
 *
 * KPIs/listas vem de 2 fontes, igual o resto do monitoramento interno:
 *   - `/monitoramento/resumo` (backend, NOSSO schema -- instrumento/
 *     evento/acao) pra tudo que e dado de gestao interna.
 *   - siconv.json (estatico, mesmo arquivo que a pagina principal usa) so
 *     pra "equipamentos com pagamento ao fornecedor" -- essa info vem do
 *     SICONV, nao faz sentido o router de monitoramento interno ler um
 *     JSON de outro pipeline.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { SearchInput } from '@/components/common/search-input';
import { SingleSelectFilter } from '@/components/common/single-select-filter';
import { cn } from '@/lib/utils';
import { normalizarTexto } from '@/utils/texto';
import { API_BASE_URL } from '@/services/monitoramento';
import { BarraDistribuicao, estiloCard, type ContagemRotulo } from '@/components/features/monitoramento-ui';
import { fmtData } from '@/lib/monitoramento-format';
import { useAuthSession } from '@/hooks/useAuthSession';

type InauguracaoApi = {
  nr_convenio: string;
  nome_convenente: string;
  municipio: string | null;
  uf: string | null;
  equipamento: string | null;
  data: string;
  realizada: boolean;
  dias: number;
};

type ResumoApi = {
  total_instrumentos: number;
  pct_execucao_fisica_medio: number | null;
  distribuicao_fase: ContagemRotulo[];
  licencas_cnen_deferidas: number;
  licencas_vencendo: LicencaVencendoApi[];
  acoes_pendentes: number;
  acoes_atrasadas: number;
  por_tecnico_titular: ContagemRotulo[];
  inauguracoes: InauguracaoApi[];
  nr_convenios: string[];
};

type LicencaVencendoApi = {
  nr_convenio: string;
  nome_convenente: string;
  data_validade: string;
  dias: number;
};

type InstrumentoApi = {
  nr_convenio: string;
  nome_convenente: string;
  municipio: string | null;
  uf: string | null;
  tecnico_titular: string | null;
  tipo_contratacao: string | null;
  fase_atual: string | null;
  situacao_prestacao_contas: string | null;
};

const PRESTACAO_CONTAS_CONCLUIDA = 'Prestação de Contas Concluída';

function IndicadorOperacional({
  titulo, valor, detalhe, tom, icone,
}: {
  titulo: string;
  valor: ReactNode;
  detalhe: string;
  tom: 'critico' | 'alerta' | 'ok' | 'neutro';
  icone: ReactNode;
}) {
  const corClasse = tom === 'critico' ? 'text-destructive' : tom === 'alerta' ? 'text-warning' : tom === 'ok' ? 'text-success' : 'text-primary';
  const bgClasse = tom === 'critico' ? 'bg-destructive-bg' : tom === 'alerta' ? 'bg-warning-bg' : tom === 'ok' ? 'bg-success-bg' : 'bg-secondary';
  return (
    <div className={cn(estiloCard, 'p-4 grid gap-2.5')}>
      <div className="flex justify-between items-center gap-2.5">
        <span className="text-[11px] font-extrabold tracking-[.05em] uppercase text-muted-foreground">{titulo}</span>
        <span className={cn('w-[30px] h-[30px] rounded-[10px] inline-flex items-center justify-center', bgClasse, corClasse)}>{icone}</span>
      </div>
      <strong className="text-[28px] leading-none text-foreground">{valor}</strong>
      <span className="text-xs text-muted-foreground leading-snug">{detalhe}</span>
    </div>
  );
}

export function MonitoramentoOverviewPage() {
  const [resumo, setResumo] = useState<ResumoApi | null>(null);
  const [instrumentos, setInstrumentos] = useState<InstrumentoApi[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const sessao = useAuthSession();

  // Filtros da tabela -- achado 2026-09-10, pedido do usuario: "adicione
  // filtros uteis... como data, fase, tecnico entre outros uteis". So
  // filtram a TABELA abaixo (client-side) -- os KPIs/graficos agregados
  // acima continuam sendo o total, pra nao precisar refazer o resumo
  // agregado inteiro no front por causa de um filtro (custo x beneficio).
  const [busca, setBusca] = useState('');
  const [faseFiltro, setFaseFiltro] = useState<string | null>(null);
  const [tecnicoFiltro, setTecnicoFiltro] = useState<string | null>(null);
  const [ufFiltro, setUfFiltro] = useState<string | null>(null);
  const [tipoContratacaoFiltro, setTipoContratacaoFiltro] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/monitoramento/resumo`).then((r) => r.json()),
      fetch(`${API_BASE_URL}/monitoramento/instrumentos`).then((r) => r.json()),
    ])
      .then(([r, i]) => { setResumo(r); setInstrumentos(i); })
      .catch((e) => setErro(String(e)));
  }, []);

  if (erro) return <p className="text-destructive">Erro ao carregar: {erro}</p>;
  if (!resumo || !instrumentos) {
    return <p className="text-muted-foreground">Carregando...</p>;
  }

  // "Próxima inauguração" -- substituiu Ações atrasadas/Inaugurações
  // críticas (achado 2026-09-15, pedido do usuário: "não temos meios pra
  // monitorar ações atrasadas e inaugurações críticas") -- a mais próxima
  // AINDA NÃO realizada, ordenada por data (resumo.inauguracoes já vem
  // ordenado por data asc, ver obter_resumo no backend).
  const proximaInauguracao = resumo.inauguracoes.find((i) => !i.realizada) ?? null;

  // "Concluídos" -- mesmo critério do card de mesmo nome em Instrumentos
  // firmados (SIT_CONVENIO do SICONV legado), agora sobre o subconjunto
  // MONITORADO internamente (achado 2026-09-15, pedido do usuário: "dá pra
  // gente monitorar os concluídos da mesma forma que monitoramos no
  // legado?"). Só existe pra tipo_contratacao="Convênio" (FAF/TED nunca
  // estiveram no SICONV, situacao_prestacao_contas fica sempre null neles).
  const concluidos = instrumentos.filter((i) => i.situacao_prestacao_contas === PRESTACAO_CONTAS_CONCLUIDA).length;

  // Opcoes dos filtros -- geradas a partir do proprio `instrumentos`
  // (valores realmente presentes, nunca uma lista fixa que pode ficar
  // desatualizada). Ordenadas alfabeticamente pra ficar facil de achar.
  const opcoesDe = (campo: 'fase_atual' | 'tecnico_titular' | 'uf' | 'tipo_contratacao') => {
    const valores = new Set(instrumentos.map((i) => i[campo]).filter((v): v is string => !!v));
    return [...valores].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((v) => ({ value: v, label: v }));
  };

  const instrumentosFiltrados = instrumentos.filter((i) => {
    if (faseFiltro && i.fase_atual !== faseFiltro) return false;
    if (tecnicoFiltro && i.tecnico_titular !== tecnicoFiltro) return false;
    if (ufFiltro && i.uf !== ufFiltro) return false;
    if (tipoContratacaoFiltro && (i.tipo_contratacao ?? 'Convênio') !== tipoContratacaoFiltro) return false;
    if (busca && !normalizarTexto(`${i.nr_convenio} ${i.nome_convenente}`).includes(normalizarTexto(busca))) return false;
    return true;
  });

  return (
    <div>
      <Card className="mb-4 bg-linear-to-br from-card to-accent py-0">
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5.5">
          <div>
            <div className="mb-2 text-[11px] font-extrabold tracking-[0.08em] text-primary uppercase">
              Monitoramento interno
            </div>
            <h1 className="m-0 text-3xl font-extrabold tracking-[-0.03em] text-foreground">
              Mesa de trabalho
            </h1>
            <p className="mt-2.5 max-w-[720px] text-[13.5px] leading-relaxed text-muted-foreground">
              Acompanhe entrega, licenciamento e inauguração dos instrumentos monitorados pela equipe.
            </p>
          </div>
          {/* "Ver dados oficiais"/"Painel de gestão" saíram daqui -- já
              existem no menu superior (MonitoramentoLayout), os botões só
              duplicavam a navegação. No lugar, os 2 números que mais
              importam pra essa mesa (achado 2026-09-15, pedido do
              usuário: "use os cards Instrumentos e Execução média"). */}
          <div className="grid min-w-[260px] grid-cols-2 gap-2">
            <div className="rounded-lg border border-border bg-muted p-2.5">
              <div className="text-[10.5px] font-extrabold text-muted-foreground uppercase">Instrumentos</div>
              <strong className="text-[22px] text-foreground">{resumo.total_instrumentos}</strong>
            </div>
            <div className="rounded-lg border border-border bg-muted p-2.5">
              <div className="text-[10.5px] font-extrabold text-muted-foreground uppercase">Execução média</div>
              <strong className="text-[22px] text-foreground">
                {resumo.pct_execucao_fisica_medio != null ? `${Math.round(resumo.pct_execucao_fisica_medio * 100)}%` : '—'}
              </strong>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ações atrasadas/Inaugurações críticas saíram (achado 2026-09-15,
          pedido do usuário: "não temos meios pra monitorar" isso ainda) --
          Próxima inauguração no lugar, com o detalhe que dá pra mostrar
          hoje (data/município/UF/equipamento). Instrumentos/Execução média
          saíram pra não duplicar os cards do cabeçalho acima. */}
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] gap-4 mb-[18px]">
        <IndicadorOperacional titulo="Licenças a vencer" valor={resumo.licencas_vencendo.length} detalhe="CNEN vencida ou próxima" tom={resumo.licencas_vencendo.length > 0 ? 'alerta' : 'ok'} icone={<ShieldCheck size={17} />} />
        <IndicadorOperacional
          titulo="Próxima inauguração"
          valor={proximaInauguracao ? fmtData(proximaInauguracao.data) : '—'}
          detalhe={
            proximaInauguracao
              ? `${proximaInauguracao.municipio ?? '—'}/${proximaInauguracao.uf ?? '—'} · ${proximaInauguracao.equipamento ?? 'equipamento não informado'}`
              : 'Nenhuma inauguração prevista registrada'
          }
          tom={proximaInauguracao && proximaInauguracao.dias < 0 ? 'alerta' : 'neutro'}
          icone={<CalendarClock size={17} />}
        />
        <IndicadorOperacional
          titulo="Concluídos"
          valor={concluidos}
          detalhe="Prestação de contas concluída (SICONV)"
          tom="ok"
          icone={<CheckCircle2 size={17} />}
        />
      </div>

        {/* Só pra admin (achado 2026-09-15, pedido do usuário) -- carga de
            trabalho por técnico é dado de gestão de equipe, não algo que
            todo perfil precisa ver na mesa de trabalho operacional. */}
        {sessao.usuarioAtual?.role === 'admin' && (
          <div className="grid [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))] gap-4 mb-5">
            <div className={estiloCard}>
              <strong className="text-sm">Distribuição por fase</strong>
              <div className="mt-2.5">
                <BarraDistribuicao itens={resumo.distribuicao_fase} corBarra="var(--primary)" />
              </div>
            </div>
            <div className={estiloCard}>
              <strong className="text-sm">Instrumentos por técnico titular</strong>
              <div className="mt-2.5">
                <BarraDistribuicao itens={resumo.por_tecnico_titular} corBarra="var(--success)" />
              </div>
            </div>
          </div>
        )}

        <div className={estiloCard}>
          <div className="flex justify-between items-center flex-wrap gap-2.5 mb-3">
            <strong className="text-sm">Instrumentos monitorados ({instrumentosFiltrados.length}{instrumentosFiltrados.length !== instrumentos.length ? ` de ${instrumentos.length}` : ''})</strong>
          </div>
          <div className="flex gap-2 flex-wrap mb-3.5">
            <SearchInput value={busca} onChange={setBusca} placeholder="Buscar convênio/convenente..." width={220} />
            <SingleSelectFilter placeholder="Fase" options={opcoesDe('fase_atual')} value={faseFiltro} onChange={setFaseFiltro} clearLabel="Todas as fases" minWidth={150} />
            <SingleSelectFilter placeholder="Técnico titular" options={opcoesDe('tecnico_titular')} value={tecnicoFiltro} onChange={setTecnicoFiltro} clearLabel="Todos os técnicos" minWidth={170} />
            <SingleSelectFilter placeholder="UF" options={opcoesDe('uf')} value={ufFiltro} onChange={setUfFiltro} clearLabel="Todas as UF" minWidth={110} />
            <SingleSelectFilter placeholder="Tipo de contratação" options={opcoesDe('tipo_contratacao')} value={tipoContratacaoFiltro} onChange={setTipoContratacaoFiltro} clearLabel="Todos os tipos" minWidth={170} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="text-left text-muted-foreground text-[11px] uppercase">
                  <th className="py-1 px-2">Convênio</th>
                  <th className="py-1 px-2">Convenente</th>
                  <th className="py-1 px-2">UF/Município</th>
                  <th className="py-1 px-2">Fase</th>
                  <th className="py-1 px-2">Técnico titular</th>
                  <th className="py-1 px-2">Prestação de contas</th>
                </tr>
              </thead>
              <tbody>
                {instrumentosFiltrados.length === 0 ? (
                  <tr><td colSpan={6} className="py-3.5 px-2 text-center text-muted-foreground italic">Nenhum instrumento bate com esse filtro.</td></tr>
                ) : instrumentosFiltrados.map((i) => (
                  <tr key={i.nr_convenio} className="border-t border-border">
                    <td className="py-1.5 px-2">
                      <Link to={`/monitoramento-equipamentos/instrumentos/${i.nr_convenio}`} className="text-primary no-underline font-semibold">
                        {i.nr_convenio}
                      </Link>
                      {i.tipo_contratacao && i.tipo_contratacao !== 'Convênio' && (
                        <span className="ml-1.5 text-[9.5px] font-bold py-px px-1.5 rounded-full bg-warning-bg text-warning">
                          {i.tipo_contratacao}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2">{i.nome_convenente}</td>
                    <td className="py-1.5 px-2">{i.uf}/{i.municipio}</td>
                    <td className="py-1.5 px-2">{i.fase_atual ?? '—'}</td>
                    <td className="py-1.5 px-2">{i.tecnico_titular ?? '—'}</td>
                    <td className="py-1.5 px-2">
                      {i.situacao_prestacao_contas === PRESTACAO_CONTAS_CONCLUIDA ? (
                        <span className="text-[10px] font-bold py-px px-1.5 rounded-full bg-success-bg text-success">Concluída</span>
                      ) : (
                        i.situacao_prestacao_contas ?? '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
    </div>
  );
}
