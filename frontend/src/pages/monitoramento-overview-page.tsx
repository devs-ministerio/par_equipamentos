/**
 * Pagina de overview do monitoramento interno -- INDEPENDENTE da página de
 * DETALHE de 1 instrumento (MonitoramentoInstrumentoPage.tsx); esta é o
 * índice/dashboard que reúne todos os instrumentos monitorados (105+ a
 * partir da planilha real da equipe, ver
 * backend/scripts/importar_planilha_monitoramento.py).
 *
 * KPIs/listas vem de `/monitoramento/resumo` + `/monitoramento/instrumentos`
 * (backend, NOSSO schema -- instrumento/evento/acao), via
 * `services/monitoramento.ts` (cookie de sessão).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { MetricStrip } from '@/components/common/metric-strip';
import { ErrorAlert } from '@/components/common/error-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchInput } from '@/components/common/search-input';
import { SingleSelectFilter } from '@/components/common/single-select-filter';
import { normalizarTexto } from '@/utils/texto';
import type { InstrumentoEquipamento } from '@/services/monitoramento-instrumentos';
import { useMonitoramentoResumo } from '@/hooks/useMonitoramentoResumo';
import { useMonitoramentoInstrumentos } from '@/hooks/useInstrumentosMonitorados';
import { estiloCard } from '@/components/features/monitoramento-ui';
import { fmtData } from '@/lib/monitoramento-format';

type InstrumentoApi = Pick<
  InstrumentoEquipamento,
  'nr_convenio' | 'nome_convenente' | 'municipio' | 'uf' | 'tecnico_titular' | 'tipo_contratacao' | 'fase_atual' | 'situacao_prestacao_contas'
>;

const PRESTACAO_CONTAS_CONCLUIDA = 'Prestação de Contas Concluída';

export function MonitoramentoOverviewPage() {
  const resumoQuery = useMonitoramentoResumo();
  const instrumentosQuery = useMonitoramentoInstrumentos();

  // Filtros da tabela só filtram a TABELA abaixo (client-side) -- os
  // KPIs/gráficos agregados acima continuam sendo o total, pra não
  // precisar refazer o resumo agregado inteiro no front por um filtro.
  const [busca, setBusca] = useState('');
  const [faseFiltro, setFaseFiltro] = useState<string | null>(null);
  const [tecnicoFiltro, setTecnicoFiltro] = useState<string | null>(null);
  const [ufFiltro, setUfFiltro] = useState<string | null>(null);
  const [tipoContratacaoFiltro, setTipoContratacaoFiltro] = useState<string | null>(null);

  const header = (
    <PageHeader eyebrow="Monitoramento interno" title="Mesa de trabalho" description="Entrega, instalação, licenciamento CNEN e inauguração." />
  );

  if (resumoQuery.isError || instrumentosQuery.isError) {
    return (
      <div>
        {header}
        <ErrorAlert
          mensagem="Não foi possível carregar os dados do monitoramento interno."
          onRetry={() => {
            resumoQuery.refetch();
            instrumentosQuery.refetch();
          }}
        />
      </div>
    );
  }
  if (resumoQuery.isLoading || instrumentosQuery.isLoading || !resumoQuery.data || !instrumentosQuery.data) {
    return (
      <div>
        {header}
        <div className="grid gap-2" role="status" aria-label="Carregando">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const resumo = resumoQuery.data;
  const instrumentos = instrumentosQuery.data as InstrumentoApi[];

  // "Próxima inauguração" -- a mais próxima AINDA NÃO realizada E ainda no
  // futuro, ordenada por data (resumo.inauguracoes já vem ordenado por data
  // asc, ver obter_resumo no backend). Uma previsão vencida sem confirmação
  // é uma pendência atrasada, não uma "próxima" -- achado 2026-09-18: o
  // filtro antigo (só `!realizada`) apontava pra previsão mais antiga já no
  // passado em vez da mais próxima no futuro.
  const proximaInauguracao = resumo.inauguracoes.find((i) => !i.realizada && i.dias >= 0) ?? null;

  // "Concluídos" -- Plan Mode monitoramento-evolucao 2026-09-19: passou a
  // contar por `fase_atual === 'Concluído'` (marco de fase geral, mesmo
  // catálogo pro instrumento inteiro), não mais por
  // `situacao_prestacao_contas` (SICONV legado, só existia pra tipo_
  // contratacao="Convênio" -- FAF/TED/PERSUS nunca tinham esse dado).
  const concluidos = instrumentos.filter((i) => i.fase_atual === 'Concluído').length;

  // Configuração pendente -- aceitar uma proposta em "Linhas de
  // financiamento" cria o InstrumentoEquipamento (entra na contagem
  // "Instrumentos" acima), mas só com identidade (nome/CNPJ/município/
  // programa) -- ninguém da equipe fica de fato monitorando até alguém
  // abrir o instrumento e preencher técnico titular/nível/finalidade.
  // `tecnico_titular` null é o sinal mais direto de "ainda não
  // configurado" (primeiro campo que qualquer cadastro preenche).
  const configuracaoPendente = instrumentos.filter((i) => !i.tecnico_titular).length;

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
      <PageHeader eyebrow="Monitoramento interno" title="Mesa de trabalho" description="Entrega, instalação, licenciamento CNEN e inauguração." />

      {/* Próxima inauguração mostra o detalhe disponível hoje (data/
          município/UF/equipamento). Instrumentos/Execução média saíram
          pra não duplicar os cards do cabeçalho acima. */}
      <div className="mb-6">
        <MetricStrip items={[
          { key: 'instrumentos', label: 'Instrumentos', value: resumo.total_instrumentos },
          { key: 'execucao', label: 'Execução média', value: resumo.pct_execucao_fisica_medio != null ? `${Math.round(resumo.pct_execucao_fisica_medio * 100)}%` : '—' },
          { key: 'licencas', label: 'Licenças a vencer', value: resumo.licencas_vencendo.length, variant: resumo.licencas_vencendo.length ? 'warning' : 'success' },
          { key: 'inauguracao', label: 'Próxima inauguração', value: proximaInauguracao ? fmtData(proximaInauguracao.data) : '—', variant: 'primary' },
          { key: 'concluidos', label: 'Concluídos', value: concluidos, variant: 'success' },
          { key: 'pendentes', label: 'Sem técnico', value: configuracaoPendente, variant: configuracaoPendente ? 'warning' : 'success' },
        ]} />
      </div>

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
                  <th className="py-1 px-2">Instrumentos/Programas</th>
                  <th className="py-1 px-2">Convenente</th>
                  <th className="py-1 px-2">UF/Município</th>
                  <th className="py-1 px-2">Prestação de contas</th>
                  <th className="py-1 px-2">Técnico titular</th>
                  <th className="py-1 px-2">Fase</th>
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
                      <span className="ml-1.5 text-[9.5px] font-bold py-px px-1.5 rounded-full bg-warning-bg text-warning">
                        {i.tipo_contratacao ?? 'Convênio'}
                      </span>
                    </td>
                    <td className="py-1.5 px-2">{i.nome_convenente}</td>
                    <td className="py-1.5 px-2">{i.uf}/{i.municipio}</td>
                    <td className="py-1.5 px-2">
                      {i.situacao_prestacao_contas === PRESTACAO_CONTAS_CONCLUIDA ? (
                        <span className="text-[10px] font-bold py-px px-1.5 rounded-full bg-success-bg text-success">Concluída</span>
                      ) : (
                        i.situacao_prestacao_contas ?? '—'
                      )}
                    </td>
                    <td className="py-1.5 px-2">
                      {i.tecnico_titular ?? (
                        <span className="text-[10px] font-bold py-px px-1.5 rounded-full bg-warning-bg text-warning">Pendente</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2">{i.fase_atual ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
    </div>
  );
}
