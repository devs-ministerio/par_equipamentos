import { useEffect, useState } from 'react';
import { fetchEstabelecimentosPage, fetchMunicipalityCoverage } from '@/services/api';
import type { EstabelecimentoRow, NivelCoberturaRow } from '@/types/domain';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/common/Pagination';
import { SearchInput } from '@/components/common/SearchInput';
import { BotaoDetalhe } from './BotaoDetalhe';
import { MunicipioDetalheModal } from './MunicipioDetalheModal';

interface Props {
  equipmentFamily: string;
  states?: string[];
  macroCodes?: string[];
  healthRegionCodes?: string[];
  municipalities?: string[];
  cnesCodes?: string[];
}

const PAGE_SIZE = 50;

type SortKey = 'cnes_code' | 'facility_name' | 'municipality_name' | 'state' | 'existing_qty' | 'in_use_qty' | 'sus_flag';

export function EstabelecimentoTable({
  equipmentFamily,
  states,
  macroCodes,
  healthRegionCodes,
  municipalities,
  cnesCodes,
}: Props) {
  const [page, setPage] = useState(1);
  const [buscaInput, setBuscaInput] = useState('');
  const [busca, setBusca] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('facility_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [items, setItems] = useState<EstabelecimentoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detalheAberto, setDetalheAberto] = useState<NivelCoberturaRow | null>(null);
  const [carregandoDetalheCnes, setCarregandoDetalheCnes] = useState<string | null>(null);
  const [erroDetalhe, setErroDetalhe] = useState<string | null>(null);

  // Botao de detalhe (mesmo modal de Cobertura Assistencial) -- o
  // estabelecimento em si nao tem populacao/cobertura (isso e agregado por
  // municipio, nao por CNES), entao busca o municipio dele sob demanda so
  // quando o usuario pede, reaproveitando o MunicipioDetalheModal inteiro
  // (que ja busca macro/regiao sozinho).
  function abrirDetalhe(r: EstabelecimentoRow) {
    setErroDetalhe(null);
    setCarregandoDetalheCnes(r.cnes);
    fetchMunicipalityCoverage({ equipmentFamily, municipalities: [`${r.municipio}|${r.uf}`] })
      .then((rows) => {
        if (rows[0]) setDetalheAberto(rows[0]);
        else setErroDetalhe(`Sem dado de cobertura pra ${r.municipio} (${r.uf}).`);
      })
      .catch(() => setErroDetalhe(`Não foi possível carregar a cobertura de ${r.municipio} (${r.uf}).`))
      .finally(() => setCarregandoDetalheCnes(null));
  }

  // debounce da busca -- nao dispara uma requisicao a cada tecla digitada
  useEffect(() => {
    const t = setTimeout(() => setBusca(buscaInput), 350);
    return () => clearTimeout(t);
  }, [buscaInput]);

  const statesKey = states?.join(',') ?? '';
  const macrosKey = macroCodes?.join(',') ?? '';
  const regioesSaudeKey = healthRegionCodes?.join(',') ?? '';
  const municipiosKey = municipalities?.join(',') ?? '';
  const cnesKey = cnesCodes?.join(',') ?? '';

  // volta pra pagina 1 sempre que filtro/busca/ordenacao mudar -- senao o
  // usuario pode ficar numa pagina que nao existe mais.
  useEffect(
    () => setPage(1),
    [statesKey, macrosKey, regioesSaudeKey, municipiosKey, cnesKey, busca, sortKey, sortDir],
  );

  // Guarda contra corrida (mesmo bug de NivelCoberturaTable, corrigido
  // 2026-08-22): selecionar um CNES cascateia pro Municipio num segundo
  // instante, entao um pedido SEM filtro de municipio dispara primeiro
  // (mais lento, lista nacional) e um pedido JA filtrado dispara logo
  // depois (mais rapido) -- sem essa guarda, a resposta lenta e desfiltrada
  // chegava por ultimo e sobrescrevia a tabela com a lista nacional errada.
  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    fetchEstabelecimentosPage({
      equipmentFamily,
      states,
      macroCodes,
      healthRegionCodes,
      municipalities,
      cnesCodes,
      search: busca || undefined,
      sortBy: sortKey,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        if (cancelado) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((e: Error) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setLoading(false));
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentFamily, statesKey, macrosKey, regioesSaudeKey, municipiosKey, cnesKey, busca, sortKey, sortDir, page]);

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

  return (
    <div className="mt-5 rounded-lg bg-card">
      <div className="flex items-center gap-3 border-b border-border px-4.5 py-3.5">
        <div className="flex-1 text-sm font-semibold">Estabelecimentos de Saúde</div>
        <SearchInput value={buscaInput} onChange={setBuscaInput} placeholder="Buscar por nome, CNES ou município..." />
      </div>
      {error && <div className="px-4.5 py-2.5 text-[12.5px] text-destructive">Não foi possível carregar ({error}).</div>}
      {erroDetalhe && <div className="px-4.5 py-2.5 text-[12.5px] text-destructive">{erroDetalhe}</div>}
      <div style={{ maxHeight: 340, overflow: 'auto', opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
        <Table className="text-[12.5px]">
          <TableHeader className="sticky top-0 z-[2] bg-card text-[11px] tracking-wide text-muted-foreground uppercase">
            <TableRow>
              <TableHead className="cursor-pointer py-[9px] px-4.5" onClick={() => toggleSort('cnes_code')}>
                CNES{arrow('cnes_code')}
              </TableHead>
              <TableHead className="cursor-pointer py-[9px] px-2.5" onClick={() => toggleSort('facility_name')}>
                Nome do estabelecimento{arrow('facility_name')}
              </TableHead>
              <TableHead className="cursor-pointer py-[9px] px-2.5" onClick={() => toggleSort('municipality_name')}>
                Município{arrow('municipality_name')}
              </TableHead>
              <TableHead className="cursor-pointer py-[9px] px-2.5" onClick={() => toggleSort('state')}>
                UF{arrow('state')}
              </TableHead>
              <TableHead className="cursor-pointer py-[9px] px-2.5 text-right" onClick={() => toggleSort('existing_qty')}>
                Qtd equipamento{arrow('existing_qty')}
              </TableHead>
              <TableHead className="cursor-pointer py-[9px] px-2.5 text-right" onClick={() => toggleSort('in_use_qty')}>
                Equipamentos em uso{arrow('in_use_qty')}
              </TableHead>
              <TableHead className="cursor-pointer py-[9px] px-4.5" onClick={() => toggleSort('sus_flag')}>
                SUS{arrow('sus_flag')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r) => (
              <TableRow key={r.cnes} className="border-t border-border">
                <TableCell className="py-2 px-4.5 font-mono text-[11.5px] text-muted-foreground">{r.cnes}</TableCell>
                <TableCell className="py-2 px-2.5 font-medium whitespace-normal">{r.nome}</TableCell>
                <TableCell className="py-2 px-2.5 text-muted-foreground whitespace-normal">{r.municipio}</TableCell>
                <TableCell className="py-2 px-2.5 text-muted-foreground">{r.uf}</TableCell>
                <TableCell className="py-2 px-2.5 text-right font-semibold">{r.qtd}</TableCell>
                <TableCell className="py-2 px-2.5 text-right text-muted-foreground">{r.qtdUso}</TableCell>
                <TableCell className="py-2 px-4.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        r.susFlag
                          ? 'rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success'
                          : 'rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground'
                      }
                    >
                      {r.susFlag ? 'Sim' : 'Não'}
                    </span>
                    {r.susFlag &&
                      (carregandoDetalheCnes === r.cnes ? (
                        <span className="text-[10px] text-muted-foreground">Carregando...</span>
                      ) : (
                        <BotaoDetalhe onClick={() => abrirDetalhe(r)} />
                      ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pagination page={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      {detalheAberto && (
        <MunicipioDetalheModal linha={detalheAberto} equipmentFamily={equipmentFamily} onClose={() => setDetalheAberto(null)} />
      )}
    </div>
  );
}
