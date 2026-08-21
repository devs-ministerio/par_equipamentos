import { useEffect, useState } from 'react';
import { fetchEstabelecimentosPage, fetchMunicipalityCoverage } from '../../services/api';
import type { EstabelecimentoRow, NivelCoberturaRow } from '../../types/domain';
import { colors } from '../../styles/tokens';
import { Pagination } from '../common/Pagination';
import { SearchInput } from '../common/SearchInput';
import { BotaoDetalhe } from '../common/BotaoDetalhe';
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
    return <span style={{ marginLeft: 3 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>;
  }

  return (
    <div style={{ background: '#fff', borderRadius: 8, marginTop: 20 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #eef0f4', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>Estabelecimentos de Saúde</div>
        <SearchInput value={buscaInput} onChange={setBuscaInput} placeholder="Buscar por nome, CNES ou município..." />
      </div>
      {error && (
        <div style={{ padding: '10px 18px', color: colors.hipoRed, fontSize: 12.5 }}>
          Não foi possível carregar ({error}).
        </div>
      )}
      {erroDetalhe && (
        <div style={{ padding: '10px 18px', color: colors.hipoRed, fontSize: 12.5 }}>{erroDetalhe}</div>
      )}
      <div style={{ maxHeight: 340, overflow: 'auto', opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 2,
                background: '#fafbfd',
                textAlign: 'left',
                color: '#667085',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
              }}
            >
              <th style={{ padding: '9px 18px', fontWeight: 600, cursor: 'pointer' }} onClick={() => toggleSort('cnes_code')}>
                CNES{arrow('cnes_code')}
              </th>
              <th
                style={{ padding: '9px 10px', fontWeight: 600, cursor: 'pointer' }}
                onClick={() => toggleSort('facility_name')}
              >
                Nome do estabelecimento{arrow('facility_name')}
              </th>
              <th
                style={{ padding: '9px 10px', fontWeight: 600, cursor: 'pointer' }}
                onClick={() => toggleSort('municipality_name')}
              >
                Município{arrow('municipality_name')}
              </th>
              <th style={{ padding: '9px 10px', fontWeight: 600, cursor: 'pointer' }} onClick={() => toggleSort('state')}>
                UF{arrow('state')}
              </th>
              <th
                style={{ padding: '9px 10px', fontWeight: 600, textAlign: 'right', cursor: 'pointer' }}
                onClick={() => toggleSort('existing_qty')}
              >
                Qtd equipamento{arrow('existing_qty')}
              </th>
              <th
                style={{ padding: '9px 10px', fontWeight: 600, textAlign: 'right', cursor: 'pointer' }}
                onClick={() => toggleSort('in_use_qty')}
              >
                Equipamentos em uso{arrow('in_use_qty')}
              </th>
              <th style={{ padding: '9px 18px', fontWeight: 600, cursor: 'pointer' }} onClick={() => toggleSort('sus_flag')}>
                SUS{arrow('sus_flag')}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.cnes} style={{ borderTop: '1px solid #f0f1f5' }}>
                <td style={{ padding: '8px 18px', fontFamily: 'monospace', fontSize: 11.5, color: '#98a0b3' }}>
                  {r.cnes}
                </td>
                <td style={{ padding: '8px 10px', fontWeight: 500 }}>{r.nome}</td>
                <td style={{ padding: '8px 10px', color: '#475066' }}>{r.municipio}</td>
                <td style={{ padding: '8px 10px', color: '#667085' }}>{r.uf}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{r.qtd}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#667085' }}>{r.qtdUso}</td>
                <td style={{ padding: '8px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        background: r.susFlag ? '#eaf3e0' : '#f0f1f5',
                        color: r.susFlag ? '#3b6d11' : '#667085',
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 20,
                      }}
                    >
                      {r.susFlag ? 'Sim' : 'Não'}
                    </span>
                    {r.susFlag &&
                      (carregandoDetalheCnes === r.cnes ? (
                        <span style={{ fontSize: 10, color: colors.subtleText }}>Carregando...</span>
                      ) : (
                        <BotaoDetalhe onClick={() => abrirDetalhe(r)} />
                      ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      {detalheAberto && (
        <MunicipioDetalheModal linha={detalheAberto} equipmentFamily={equipmentFamily} onClose={() => setDetalheAberto(null)} />
      )}
    </div>
  );
}
