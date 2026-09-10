import { Fragment, useEffect, useMemo, useState } from 'react';
import type { NivelCoberturaRow, StatusCobertura } from '@/types/domain';
import { formatMultiplicador } from '@/utils/format';
import { calcularCoeficiente } from '@/utils/coeficiente';
import { getEquipamento, formatarQuantidadeEquipamento } from '@/data/constants';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/common/StatusBadge';
import { fetchHealthRegionCoverage, fetchMunicipalityCoverage } from '@/services/api';
import { Pagination } from '@/components/common/Pagination';
import { InfoIcon } from './InfoIcon';
import { BotaoDetalhe } from './BotaoDetalhe';
import { SubNivelRows } from './SubNivelRows';
import { MunicipioDetalheModal } from './MunicipioDetalheModal';

const PAGE_SIZE = 20;

/** Municipio abaixo disso nunca era esperado ter tomografo proprio (RN
 * especifica de TOMOGRAFO -- ver Metodologia); so aplica no nivel municipio,
 * e so quando o usuario nao pediu um municipio/CNES especifico (nesse caso
 * ele quer ver aquele, do tamanho que for). */
const POPULACAO_MINIMA_TOMOGRAFO = 100_000;

interface Props {
  equipmentFamily: string;
  nivel: 'regiaoSaude' | 'municipio';
  states?: string[];
  macroCodes?: string[];
  healthRegionCodes?: string[];
  municipalities?: string[];
  /** true quando o usuario ja escolheu Municipio/CNES especifico -- desliga
   * o corte de populacao minima (ele quer ver aquele municipio do jeito que for). */
  semCorteDePopulacao?: boolean;
  /** Filtro Hiper/Hipo -- controlado pelo Dashboard, que mostra os botões
   * junto do título "Cobertura Assistencial" (não mais dentro da tabela). */
  statusFiltro: Set<StatusCobertura>;
  /** chaves ja selecionadas no filtro -- so destaque visual nas sub-linhas
   * de Municipio dentro de uma Regiao de Saude expandida (clicar nao filtra
   * mais, so abre detalhe). */
  subNivelSelecionados: string[];
}

type Filhos = NivelCoberturaRow[] | 'carregando' | 'erro';

type SortKey = 'nome' | 'uf' | 'populacao' | 'cobertura' | 'status';

export function NivelCoberturaTable({
  equipmentFamily,
  nivel,
  states,
  macroCodes,
  healthRegionCodes,
  municipalities,
  semCorteDePopulacao,
  statusFiltro,
  subNivelSelecionados,
}: Props) {
  const equipamento = getEquipamento(equipmentFamily);
  const [sortKey, setSortKey] = useState<SortKey>('nome');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<NivelCoberturaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [filhosPorChave, setFilhosPorChave] = useState<Record<string, Filhos>>({});
  const [detalheAberto, setDetalheAberto] = useState<NivelCoberturaRow | null>(null);

  // so nivel='regiaoSaude' expande (pra Municipio) -- Municipio ja e o nivel
  // mais fino que a base tem.
  function toggleExpandida(chave: string) {
    const jaExpandida = expandidas.has(chave);
    setExpandidas((prev) => {
      const next = new Set(prev);
      jaExpandida ? next.delete(chave) : next.add(chave);
      return next;
    });
    if (!jaExpandida && !filhosPorChave[chave]) {
      setFilhosPorChave((prev) => ({ ...prev, [chave]: 'carregando' }));
      fetchMunicipalityCoverage({ equipmentFamily, healthRegionCodes: [chave] })
        .then((filhos) => setFilhosPorChave((prev) => ({ ...prev, [chave]: filhos })))
        .catch(() => setFilhosPorChave((prev) => ({ ...prev, [chave]: 'erro' })));
    }
  }

  const statesKey = states?.join(',') ?? '';
  const macrosKey = macroCodes?.join(',') ?? '';
  const regioesSaudeKey = healthRegionCodes?.join(',') ?? '';
  const municipiosKey = municipalities?.join(',') ?? '';

  useEffect(
    () => setPage(1),
    [statusFiltro, sortKey, sortDir, nivel, statesKey, macrosKey, regioesSaudeKey, municipiosKey],
  );

  // Guarda contra corrida: selecionar um CNES cascateia pro Município num
  // segundo instante (efeito separado no useFiltrosMacro), entao um pedido
  // SEM filtro de municipio dispara primeiro (mais lento, ~5570 linhas) e um
  // segundo pedido JA filtrado (rapido, 1 linha) dispara logo em seguida --
  // sem essa guarda, a resposta lenta e desfiltrada chega depois e sobrescreve
  // o resultado certo (bug reportado: CNES de Recife mostrando o pais
  // inteiro). So aceita a resposta se ainda for o pedido mais recente.
  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    const promessa =
      nivel === 'municipio'
        ? fetchMunicipalityCoverage({
            equipmentFamily,
            states,
            macroCodes,
            healthRegionCodes,
            municipalities,
            minPopulation: semCorteDePopulacao ? undefined : POPULACAO_MINIMA_TOMOGRAFO,
          })
        : fetchHealthRegionCoverage({ equipmentFamily, states, macroCodes });

    promessa
      .then((res) => {
        if (!cancelado) setRows(res);
      })
      .catch((e: Error) => {
        if (!cancelado) setError(e.message);
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentFamily, nivel, statesKey, macrosKey, regioesSaudeKey, municipiosKey, semCorteDePopulacao]);

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
      let cmp = 0;
      switch (sortKey) {
        case 'nome':
          cmp = a.nome.localeCompare(b.nome);
          break;
        case 'uf':
          cmp = a.uf.localeCompare(b.uf);
          break;
        case 'populacao':
          cmp = a.pop - b.pop;
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
  }, [rowsFiltradas, sortKey, sortDir]);

  const rowsPaginadas = useMemo(
    () => rowsOrdenadas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rowsOrdenadas, page],
  );

  const tituloColuna = nivel === 'municipio' ? 'Município' : 'Região de saúde';

  return (
    <>
      {error && <div className="px-4.5 py-2.5 text-[12.5px] text-destructive">Não foi possível carregar ({error}).</div>}
      <div
        style={{ maxHeight: 340, overflowY: 'auto', opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}
      >
        <Table className="text-[12.5px]">
          <TableHeader className="sticky top-0 z-[2] bg-card text-[11px] tracking-wide text-muted-foreground uppercase">
            <TableRow className="[&>*]:whitespace-normal">
              <TableHead className="cursor-pointer py-2.5 pr-1.5 pl-4.5" onClick={() => toggleSort('nome')}>
                {tituloColuna}
                {arrow('nome')}
              </TableHead>
              <TableHead className="w-[46px] cursor-pointer py-2.5 pr-2 pl-1.5" onClick={() => toggleSort('uf')}>
                UF{arrow('uf')}
              </TableHead>
              <TableHead className="w-[220px] py-2.5 px-2">Macrorregião</TableHead>
              {nivel === 'municipio' && <TableHead className="w-[180px] py-2.5 px-2">Região de saúde</TableHead>}
              <TableHead className="w-[190px] cursor-pointer py-2.5 pr-2 pl-2.5 text-right" onClick={() => toggleSort('populacao')}>
                População SUS-dep.{arrow('populacao')}
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
                      Abaixo de 1x é Hipossuficiente, 1x ou mais é Hiperssuficiente.
                    </div>
                    {nivel === 'municipio' && !semCorteDePopulacao && (
                      <div className="mt-2 text-[10px] text-[#94a3b8]">
                        Só municípios com mais de 100 mil habitantes aparecem aqui.
                      </div>
                    )}
                  </InfoIcon>
                </span>
              </TableHead>
              <TableHead className="w-[220px] py-2.5 pr-4.5 pl-8">
                <span className="flex items-center gap-1">
                  Status
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
              // Coeficiente = (equip. SUS x produtividade da familia) / populacao
              // SUS-dependente -- ver CoberturaTable.tsx pro mesmo calculo no
              // nivel macro (extraido em utils/coeficiente.ts, bug real
              // corrigido 2026-08-21: aqui tambem tinha 100_000 fixo).
              const { valor: coeficiente, corTexto, corBarra, fillPercent } = calcularCoeficiente(
                r.oferta,
                r.pop,
                equipamento.produtividade,
              );
              const expansivel = nivel === 'regiaoSaude';
              const expandida = expandidas.has(r.chave);
              const filhos = filhosPorChave[r.chave];
              return (
                <Fragment key={r.chave}>
                <TableRow
                  onClick={expansivel ? () => toggleExpandida(r.chave) : undefined}
                  className={`border-t border-border [&>*]:whitespace-normal ${expansivel ? 'cursor-pointer' : ''}`}
                >
                  <TableCell className="py-[9px] pr-1.5 pl-4.5 font-medium">
                    {expansivel && (
                      <span
                        className="mr-1.5 inline-block text-[10px] text-muted-foreground transition-transform duration-150"
                        style={{ transform: expandida ? 'rotate(90deg)' : 'none' }}
                      >
                        ▶
                      </span>
                    )}
                    {r.nome}
                  </TableCell>
                  <TableCell className="py-[9px] pr-2 pl-1.5 text-muted-foreground">{r.uf}</TableCell>
                  <TableCell className="py-[9px] px-2 text-muted-foreground">{r.macroNome ?? '—'}</TableCell>
                  {nivel === 'municipio' && (
                    <TableCell className="py-[9px] px-2 text-muted-foreground">{r.regiaoSaudeNome ?? '—'}</TableCell>
                  )}
                  <TableCell className="py-[9px] pr-2 pl-2.5 text-right text-muted-foreground">
                    {r.pop.toLocaleString('pt-BR')}
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
                    <div className="flex items-center gap-2">
                      <StatusBadge cobertura={r.cobertura} />
                      {nivel === 'municipio' && <BotaoDetalhe onClick={() => setDetalheAberto(r)} />}
                    </div>
                  </TableCell>
                </TableRow>
                {expandida && (
                  <TableRow className="bg-muted">
                    <TableCell colSpan={nivel === 'municipio' ? 7 : 6} className="py-2.5 pr-4.5 pl-10.5 whitespace-normal">
                      {filhos === 'carregando' && <div className="text-xs text-muted-foreground">Carregando municípios...</div>}
                      {filhos === 'erro' && <div className="text-xs text-destructive">Não foi possível carregar os municípios.</div>}
                      {Array.isArray(filhos) && (
                        <SubNivelRows
                          rows={filhos}
                          nivelAtual="municipio"
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
            {!loading && rowsPaginadas.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-4 px-4.5 text-[12.5px] text-muted-foreground whitespace-normal">
                  Nenhum resultado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination page={page} totalItems={rowsOrdenadas.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      {detalheAberto && (
        <MunicipioDetalheModal linha={detalheAberto} equipmentFamily={equipmentFamily} onClose={() => setDetalheAberto(null)} />
      )}
    </>
  );
}
