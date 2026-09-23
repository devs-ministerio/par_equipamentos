import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pagination } from '@/components/common/pagination';
import { SearchInput } from '@/components/common/search-input';
import { SingleSelectFilter } from '@/components/common/single-select-filter';
import { FilterWorkspace } from '@/components/common/filter-workspace';
import { estiloCard } from '@/components/features/monitoramento-ui';
import type { InstrumentoEquipamento } from '@/services/monitoramento-instrumentos';
import { normalizarTexto } from '@/utils/texto';

export type InstrumentoResumo = Pick<InstrumentoEquipamento, 'nr_convenio' | 'nome_convenente' | 'municipio' | 'uf' | 'tecnico_titular' | 'tipo_contratacao' | 'fase_atual' | 'situacao_prestacao_contas'>;
const PAGE_SIZE = 20;
const PRESTACAO_CONTAS_CONCLUIDA = 'Prestação de Contas Concluída';

export function MonitoramentoOverviewLista({ instrumentos }: { instrumentos: InstrumentoResumo[] }) {
  const [busca, setBusca] = useState('');
  const [faseFiltro, setFaseFiltro] = useState<string | null>(null);
  const [tecnicoFiltro, setTecnicoFiltro] = useState<string | null>(null);
  const [ufFiltro, setUfFiltro] = useState<string | null>(null);
  const [tipoContratacaoFiltro, setTipoContratacaoFiltro] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const opcoesDe = (campo: 'fase_atual' | 'tecnico_titular' | 'uf' | 'tipo_contratacao') => [...new Set(instrumentos.map((item) => item[campo]).filter((valor): valor is string => Boolean(valor)))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((valor) => ({ value: valor, label: valor }));
  const filtrados = instrumentos.filter((item) => {
    if (faseFiltro && item.fase_atual !== faseFiltro) return false;
    if (tecnicoFiltro && item.tecnico_titular !== tecnicoFiltro) return false;
    if (ufFiltro && item.uf !== ufFiltro) return false;
    if (tipoContratacaoFiltro && (item.tipo_contratacao ?? 'Convênio') !== tipoContratacaoFiltro) return false;
    return !busca || normalizarTexto(`${item.nr_convenio} ${item.nome_convenente}`).includes(normalizarTexto(busca));
  });
  const paginaAtual = filtrados.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);
  const atualizar = (acao: (valor: string | null) => void) => (valor: string | null) => { acao(valor); setPagina(1); };
  const limparFiltros = () => { setBusca(''); setFaseFiltro(null); setTecnicoFiltro(null); setUfFiltro(null); setTipoContratacaoFiltro(null); setPagina(1); };
  return <div className={estiloCard}>
    <div className="mb-3 flex flex-wrap justify-between gap-2.5"><strong className="text-sm">Instrumentos monitorados ({filtrados.length}{filtrados.length !== instrumentos.length ? ` de ${instrumentos.length}` : ''})</strong></div>
    <FilterWorkspace className="mb-3.5" hasAnyFilter={Boolean(busca || faseFiltro || tecnicoFiltro || ufFiltro || tipoContratacaoFiltro)} onClear={limparFiltros} contagem={`${filtrados.length} de ${instrumentos.length} instrumentos`}><SearchInput value={busca} onChange={(valor) => { setBusca(valor); setPagina(1); }} placeholder="Buscar convênio/convenente..." width={220} />
      <SingleSelectFilter placeholder="Fase" options={opcoesDe('fase_atual')} value={faseFiltro} onChange={atualizar(setFaseFiltro)} clearLabel="Todas as fases" minWidth={150} />
      <SingleSelectFilter placeholder="Técnico titular" options={opcoesDe('tecnico_titular')} value={tecnicoFiltro} onChange={atualizar(setTecnicoFiltro)} clearLabel="Todos os técnicos" minWidth={170} />
      <SingleSelectFilter placeholder="UF" options={opcoesDe('uf')} value={ufFiltro} onChange={atualizar(setUfFiltro)} clearLabel="Todas as UF" minWidth={110} />
      <SingleSelectFilter placeholder="Tipo de contratação" options={opcoesDe('tipo_contratacao')} value={tipoContratacaoFiltro} onChange={atualizar(setTipoContratacaoFiltro)} clearLabel="Todos os tipos" minWidth={170} />
    </FilterWorkspace>
    <div className="overflow-x-auto"><table className="w-full border-collapse text-[12.5px]"><thead><tr className="text-left text-[11px] uppercase text-muted-foreground"><th className="px-2 py-1">Instrumentos/Programas</th><th className="px-2 py-1">Convenente</th><th className="px-2 py-1">UF/Município</th><th className="px-2 py-1">Prestação de contas</th><th className="px-2 py-1">Técnico titular</th><th className="px-2 py-1">Fase</th></tr></thead><tbody>
      {filtrados.length === 0 ? <tr><td colSpan={6} className="px-2 py-3.5 text-center italic text-muted-foreground">Nenhum instrumento bate com esse filtro.</td></tr> : paginaAtual.map((item) => <tr key={item.nr_convenio} className="border-t border-border"><td className="px-2 py-1.5"><Link to={`/monitoramento-equipamentos/instrumentos/${item.nr_convenio}`} className="font-semibold text-primary no-underline">{item.nr_convenio}</Link><span className="ml-1.5 rounded-full bg-warning-bg px-1.5 py-px text-[9.5px] font-bold text-warning">{item.tipo_contratacao ?? 'Convênio'}</span></td><td className="px-2 py-1.5">{item.nome_convenente}</td><td className="px-2 py-1.5">{item.uf}/{item.municipio}</td><td className="px-2 py-1.5">{item.situacao_prestacao_contas === PRESTACAO_CONTAS_CONCLUIDA ? <span className="rounded-full bg-success-bg px-1.5 py-px text-[10px] font-bold text-success">Concluída</span> : item.situacao_prestacao_contas ?? '—'}</td><td className="px-2 py-1.5">{item.tecnico_titular ?? <span className="rounded-full bg-warning-bg px-1.5 py-px text-[10px] font-bold text-warning">Pendente</span>}</td><td className="px-2 py-1.5">{item.fase_atual ?? '—'}</td></tr>)}
    </tbody></table></div>
    {filtrados.length > 0 && <Pagination page={pagina} totalItems={filtrados.length} pageSize={PAGE_SIZE} onPageChange={setPagina} />}
  </div>;
}
