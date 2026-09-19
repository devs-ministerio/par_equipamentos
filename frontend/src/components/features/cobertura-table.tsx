import { useEffect, useMemo, useState } from 'react';
import type { CoberturaRow, Macrorregiao, StatusCobertura } from '@/types/domain';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/common/pagination';
import { SortableTableHead } from '@/components/common/sortable-table-head';
import { InfoIcon } from './info-icon';
import { CoberturaMacroRow } from './cobertura-macro-row';

const PAGE_SIZE = 20;

interface Props {
  equipmentFamily: string;
  rows: CoberturaRow[];
  macros: Macrorregiao[];
  /** chaves (codigo de regiao de saude ou "NOME|UF" de municipio) ja
   * selecionadas no filtro -- usado so pra destacar a linha (clicar numa
   * sub-linha nao filtra mais, so abre detalhe no nivel Municipio). */
  subNivelSelecionados: string[];
  /** Filtro Hiper/Hipo -- controlado pelo Dashboard, que mostra os botões
   * junto do título "Cobertura Assistencial" (não mais dentro da tabela). */
  statusFiltro: Set<StatusCobertura>;
}

type SortKey = 'codigo' | 'macro' | 'uf' | 'populacao' | 'cobertura' | 'status';

export function CoberturaTable({
  equipmentFamily,
  rows,
  macros,
  subNivelSelecionados,
  statusFiltro,
}: Props) {
  const macroById = useMemo(() => new Map(macros.map((m) => [m.id, m])), [macros]);
  const [sortKey, setSortKey] = useState<SortKey>('macro');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  // volta pra pagina 1 quando filtro/ordenacao mudar -- senao pode sobrar numa
  // pagina que nao existe mais depois de filtrar.
  useEffect(() => setPage(1), [statusFiltro, sortKey, sortDir]);

  // expandir/recolher e so estado de UI -- o fetch sob demanda de cada macro
  // mora em CoberturaMacroRow (useHealthRegionByMacro), disparado sozinho
  // pelo `enabled: expandida` do useQuery quando essa macro entra no Set.
  function toggleExpandida(macroId: string) {
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(macroId)) next.delete(macroId); else next.add(macroId);
      return next;
    });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const rowsFiltradas = useMemo(() => {
    if (statusFiltro.size === 0) return rows;
    return rows.filter((r) => statusFiltro.has(r.status));
  }, [rows, statusFiltro]);

  const rowsOrdenadas = useMemo(() => {
    const copia = [...rowsFiltradas];
    copia.sort((a, b) => {
      const macroA = macroById.get(a.macroId);
      const macroB = macroById.get(b.macroId);
      let cmp = 0;
      switch (sortKey) {
        case 'codigo':
          cmp = (macroA?.id ?? '').localeCompare(macroB?.id ?? '');
          break;
        case 'macro':
          cmp = (macroA?.nome ?? '').localeCompare(macroB?.nome ?? '');
          break;
        case 'uf':
          cmp = (macroA?.uf ?? '').localeCompare(macroB?.uf ?? '');
          break;
        case 'populacao':
          cmp = (macroA?.pop ?? 0) - (macroB?.pop ?? 0);
          break;
        case 'cobertura':
          cmp = a.cobertura - b.cobertura;
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copia;
  }, [rowsFiltradas, macroById, sortKey, sortDir]);

  // paginacao conta so linhas de macro -- expandir uma macro (regioes/cidades
  // dentro dela) e conteudo da MESMA linha, nao entra na conta nem muda
  // quantas paginas existem.
  const rowsPaginadas = useMemo(
    () => rowsOrdenadas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rowsOrdenadas, page],
  );

  return (
    <>
      {/* com alguma macro expandida, o card cresce junto com a pagina (a
          rolagem passa a ser da pagina inteira) em vez de espremer os chips
          de cidade numa caixinha interna -- so trava a altura no modo
          compacto (nada expandido), que e quando faz sentido ter rolagem
          interna pra pagina de ate 20 macros. */}
      <div style={{ maxHeight: expandidas.size > 0 ? 'none' : 340, overflowY: 'auto' }}>
        <Table className="text-[12.5px]">
          <TableHeader className="sticky top-0 z-[2] bg-card text-[11px] tracking-wide text-muted-foreground uppercase">
            <TableRow className="[&>*]:whitespace-normal">
              <SortableTableHead
                className="w-[150px] py-2.5 pr-2 pl-4.5"
                ativo={sortKey === 'codigo'}
                direcao={sortDir}
                onToggle={() => toggleSort('codigo')}
              >
                Código macro de saúde
              </SortableTableHead>
              <SortableTableHead
                className="w-[260px] py-2.5 pr-1.5 pl-2"
                ativo={sortKey === 'macro'}
                direcao={sortDir}
                onToggle={() => toggleSort('macro')}
              >
                Macrorregião de saúde
              </SortableTableHead>
              <SortableTableHead
                className="w-[46px] py-2.5 pr-2 pl-1.5"
                ativo={sortKey === 'uf'}
                direcao={sortDir}
                onToggle={() => toggleSort('uf')}
              >
                UF
              </SortableTableHead>
              <SortableTableHead
                className="w-[210px] py-2.5 pr-2 pl-2.5 text-right"
                align="right"
                ativo={sortKey === 'populacao'}
                direcao={sortDir}
                onToggle={() => toggleSort('populacao')}
                extra={
                  <InfoIcon align="right">
                    <div className="mb-1.5 font-bold text-[#93c5fd]">População usada no cálculo</div>
                    <div className="font-mono text-[11px]">
                      SUS-dependente = IBGE (residente) − beneficiários de plano de saúde
                    </div>
                  </InfoIcon>
                }
              >
                População SUS-dependente
              </SortableTableHead>
              <SortableTableHead
                className="w-[259px] py-2.5 pr-8 pl-2"
                ativo={sortKey === 'cobertura'}
                direcao={sortDir}
                onToggle={() => toggleSort('cobertura')}
                extra={
                  <InfoIcon>
                    <div className="mb-1.5 font-bold text-[#93c5fd]">Coeficiente</div>
                    <div className="rounded bg-white/10 px-2 py-1.5 font-mono text-[11px]">
                      Equipamentos em uso SUS ÷ população SUS-dependente, na proporção esperada
                    </div>
                    <div className="mt-2 text-[10px] text-[#94a3b8]">
                      Abaixo de 1x é Hipossuficiente, 1x ou mais é Hiperssuficiente. A listra no meio da barra marca
                      exatamente o coeficiente 1.
                    </div>
                  </InfoIcon>
                }
              >
                Cobertura
              </SortableTableHead>
              <SortableTableHead
                className="w-[220px] py-2.5 pr-4.5 pl-8"
                ativo={sortKey === 'status'}
                direcao={sortDir}
                onToggle={() => toggleSort('status')}
                extra={
                  <InfoIcon align="right">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full bg-destructive" />
                      <div>
                        <strong className="text-[#fca5a5]">Hipossuficiente</strong>
                        <br />
                        coeficiente &lt; 1x
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full bg-success" />
                      <div>
                        <strong className="text-[#86efac]">Hiperssuficiente</strong>
                        <br />
                        coeficiente ≥ 1x
                      </div>
                    </div>
                  </InfoIcon>
                }
              >
                Status
              </SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsPaginadas.map((r) => {
              const macro = macroById.get(r.macroId);
              if (!macro) return null;
              return (
                <CoberturaMacroRow
                  key={r.macroId}
                  row={r}
                  macro={macro}
                  equipmentFamily={equipmentFamily}
                  subNivelSelecionados={subNivelSelecionados}
                  expandida={expandidas.has(r.macroId)}
                  onToggle={() => toggleExpandida(r.macroId)}
                />
              );
            })}
            {rowsPaginadas.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-4 px-4.5 text-[12.5px] text-muted-foreground whitespace-normal">
                  Nenhum resultado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination page={page} totalItems={rowsOrdenadas.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </>
  );
}
