import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CoberturaRow, Macrorregiao, NivelCoberturaRow, StatusCobertura } from '@/types/domain';
import { formatMultiplicador } from '@/utils/format';
import { calcularCoeficiente } from '@/utils/coeficiente';
import { getEquipamento, formatarQuantidadeEquipamento } from '@/data/constants';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/common/status-badge';
import { Pagination } from '@/components/common/pagination';
import { fetchHealthRegionCoverage } from '@/services/api';
import { InfoIcon } from './info-icon';
import { SubNivelRows } from './sub-nivel-rows';

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

type DadosMacro = NivelCoberturaRow[] | 'carregando' | 'erro';

export function CoberturaTable({
  equipmentFamily,
  rows,
  macros,
  subNivelSelecionados,
  statusFiltro,
}: Props) {
  const equipamento = getEquipamento(equipmentFamily);
  const macroById = useMemo(() => new Map(macros.map((m) => [m.id, m])), [macros]);
  const [sortKey, setSortKey] = useState<SortKey>('macro');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [dadosPorMacro, setDadosPorMacro] = useState<Record<string, DadosMacro>>({});
  const [page, setPage] = useState(1);

  // volta pra pagina 1 quando filtro/ordenacao mudar -- senao pode sobrar numa
  // pagina que nao existe mais depois de filtrar.
  useEffect(() => setPage(1), [statusFiltro, sortKey, sortDir]);

  // busca sob demanda -- so quando a macro e expandida pela primeira vez (nao
  // carrega nada de antemao); cada macro e uma busca pequena e independente,
  // igual o padrao ja usado no Mapa pra buscar por UF.
  function toggleExpandida(macroId: string) {
    const jaExpandida = expandidas.has(macroId);
    setExpandidas((prev) => {
      const next = new Set(prev);
      jaExpandida ? next.delete(macroId) : next.add(macroId);
      return next;
    });
    if (!jaExpandida && !dadosPorMacro[macroId]) {
      setDadosPorMacro((prev) => ({ ...prev, [macroId]: 'carregando' }));
      fetchHealthRegionCoverage({ equipmentFamily, macroCodes: [macroId] })
        .then((filhos) => setDadosPorMacro((prev) => ({ ...prev, [macroId]: filhos })))
        .catch(() => setDadosPorMacro((prev) => ({ ...prev, [macroId]: 'erro' })));
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function arrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="ml-[3px]">{sortDir === 'asc' ? '▲' : '▼'}</span>;
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
              <TableHead className="w-[150px] cursor-pointer py-2.5 pr-2 pl-4.5" onClick={() => toggleSort('codigo')}>
                Código macro de saúde{arrow('codigo')}
              </TableHead>
              <TableHead className="w-[260px] cursor-pointer py-2.5 pr-1.5 pl-2" onClick={() => toggleSort('macro')}>
                Macrorregião de saúde{arrow('macro')}
              </TableHead>
              <TableHead className="w-[46px] cursor-pointer py-2.5 pr-2 pl-1.5" onClick={() => toggleSort('uf')}>
                UF{arrow('uf')}
              </TableHead>
              <TableHead className="w-[210px] py-2.5 pr-2 pl-2.5 text-right">
                <span className="flex items-center justify-end gap-1">
                  <span className="cursor-pointer" onClick={() => toggleSort('populacao')}>
                    População SUS-dependente{arrow('populacao')}
                  </span>
                  <InfoIcon align="right">
                    <div className="mb-1.5 font-bold text-[#93c5fd]">População usada no cálculo</div>
                    <div className="font-mono text-[11px]">
                      SUS-dependente = IBGE (residente) − beneficiários de plano de saúde
                    </div>
                  </InfoIcon>
                </span>
              </TableHead>
              <TableHead className="w-[259px] py-2.5 pr-8 pl-2">
                <span className="flex items-center gap-1">
                  <span className="cursor-pointer" onClick={() => toggleSort('cobertura')}>
                    Cobertura{arrow('cobertura')}
                  </span>
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
                </span>
              </TableHead>
              <TableHead className="w-[220px] py-2.5 pr-4.5 pl-8">
                <span className="flex items-center gap-1">
                  <span className="cursor-pointer" onClick={() => toggleSort('status')}>
                    Status{arrow('status')}
                  </span>
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
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsPaginadas.map((r) => {
              const macro = macroById.get(r.macroId);
              if (!macro) return null;
              // Coeficiente = (equip. SUS x produtividade da familia) / populacao
              // SUS-dependente -- quantos equipamentos por `produtividade`
              // habitantes essa macro tem, sem arredondar a demanda (diferente
              // de required_qty, que é ceil). A listra no meio da barra é o
              // coeficiente 1 (a meta exata); acima enche mais (hiper/verde),
              // abaixo enche menos (hipo/vermelho). Extraído em
              // utils/coeficiente.ts pra não recalcular com produtividade
              // errada em cada tabela (bug real corrigido 2026-08-21).
              const { valor: coeficiente, corTexto, corBarra, fillPercent } = calcularCoeficiente(
                r.oferta,
                macro.pop,
                equipamento.produtividade,
              );
              const expandida = expandidas.has(r.macroId);
              const dados = dadosPorMacro[r.macroId];
              return (
                <Fragment key={r.macroId}>
                <TableRow onClick={() => toggleExpandida(r.macroId)} className="cursor-pointer border-t border-border [&>*]:whitespace-normal">
                  <TableCell className="py-[9px] pr-2 pl-4.5 font-mono text-[11.5px] text-muted-foreground">
                    {macro.id}
                  </TableCell>
                  <TableCell className="py-[9px] pr-1.5 pl-2 font-medium">
                    <span
                      className="mr-1.5 inline-block text-[10px] text-muted-foreground transition-transform duration-150"
                      style={{ transform: expandida ? 'rotate(90deg)' : 'none' }}
                    >
                      ▶
                    </span>
                    {macro.nome}
                  </TableCell>
                  <TableCell className="py-[9px] pr-2 pl-1.5 text-muted-foreground">{macro.uf}</TableCell>
                  <TableCell className="py-[9px] pr-2 pl-2.5 text-right text-muted-foreground">
                    {macro.pop.toLocaleString('pt-BR')}
                  </TableCell>
                  <TableCell className="min-w-[160px] py-[9px] pr-8 pl-2">
                    <div className="flex items-center gap-1.5">
                      <div className="relative h-2 flex-1 overflow-clip rounded bg-muted">
                        <div
                          className="absolute top-0 left-0 h-full"
                          style={{ width: `${fillPercent}%`, background: corBarra }}
                        />
                        <div className="absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 rounded-sm bg-muted-foreground" />
                      </div>
                      <div className="w-[118px]">
                        <div className="text-[11.5px] font-semibold" style={{ color: corTexto }}>
                          {coeficiente != null ? formatMultiplicador(coeficiente) : '—'}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatarQuantidadeEquipamento(r.oferta)} em uso SUS
                          {r.ofertaTotal !== r.oferta && ` de ${r.ofertaTotal} existentes`}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-[9px] pr-4.5 pl-8">
                    <StatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
                {expandida && (
                  <TableRow className="bg-muted">
                    <TableCell colSpan={6} className="py-2.5 pr-4.5 pl-10.5 whitespace-normal">
                      {dados === 'carregando' && (
                        <div className="text-xs text-muted-foreground">Carregando regiões de saúde...</div>
                      )}
                      {dados === 'erro' && (
                        <div className="text-xs text-destructive">Não foi possível carregar as regiões de saúde.</div>
                      )}
                      {Array.isArray(dados) && (
                        <SubNivelRows
                          rows={dados}
                          nivelAtual="regiaoSaude"
                          equipmentFamily={equipmentFamily}
                          selecionados={subNivelSelecionados}
                          completo
                        />
                      )}
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Pagination page={page} totalItems={rowsOrdenadas.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </>
  );
}
