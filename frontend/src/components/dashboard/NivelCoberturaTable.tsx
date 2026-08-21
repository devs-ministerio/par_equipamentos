import { useEffect, useMemo, useState } from 'react';
import type { NivelCoberturaRow } from '../../types/domain';
import { statusMeta } from '../../utils/status';
import { formatMilhar, formatMultiplicador } from '../../utils/format';
import { InfoIcon } from '../common/InfoIcon';
import { StatusBadge } from '../common/StatusBadge';
import { SearchInput } from '../common/SearchInput';
import { Pagination } from '../common/Pagination';
import { fetchHealthRegionCoverage, fetchMunicipalityCoverage } from '../../services/api';
import { normalizarTexto } from '../../utils/texto';

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
}

type SortKey = 'nome' | 'uf' | 'populacao' | 'cobertura' | 'status';

export function NivelCoberturaTable({
  equipmentFamily,
  nivel,
  states,
  macroCodes,
  healthRegionCodes,
  municipalities,
  semCorteDePopulacao,
}: Props) {
  const [busca, setBusca] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('nome');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<NivelCoberturaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const statesKey = states?.join(',') ?? '';
  const macrosKey = macroCodes?.join(',') ?? '';
  const regioesSaudeKey = healthRegionCodes?.join(',') ?? '';
  const municipiosKey = municipalities?.join(',') ?? '';

  useEffect(() => setPage(1), [busca, sortKey, sortDir, nivel, statesKey, macrosKey, regioesSaudeKey, municipiosKey]);

  useEffect(() => {
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
      .then(setRows)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
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
    return <span style={{ marginLeft: 3 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>;
  }

  const rowsFiltradas = useMemo(() => {
    const termo = normalizarTexto(busca.trim());
    if (!termo) return rows;
    return rows.filter((r) => normalizarTexto(`${r.nome} ${r.uf} ${r.macroNome ?? ''}`).includes(termo));
  }, [rows, busca]);

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
  const buscaPlaceholder = nivel === 'municipio' ? 'Buscar por município ou UF...' : 'Buscar por região de saúde ou UF...';

  return (
    <>
      {error && (
        <div style={{ padding: '10px 18px', color: '#B40D0D', fontSize: 12.5 }}>
          Não foi possível carregar ({error}).
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 18px 10px' }}>
        <SearchInput value={busca} onChange={setBusca} placeholder={buscaPlaceholder} />
      </div>
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
              <th
                style={{ padding: '10px 6px 10px 18px', fontWeight: 600, cursor: 'pointer' }}
                onClick={() => toggleSort('nome')}
              >
                {tituloColuna}
                {arrow('nome')}
              </th>
              <th
                style={{ padding: '10px 8px 10px 6px', fontWeight: 600, cursor: 'pointer', width: 46 }}
                onClick={() => toggleSort('uf')}
              >
                UF{arrow('uf')}
              </th>
              <th style={{ padding: '10px 8px', fontWeight: 600, width: 220 }}>Macrorregião</th>
              {nivel === 'municipio' && (
                <th style={{ padding: '10px 8px', fontWeight: 600, width: 180 }}>Região de saúde</th>
              )}
              <th
                style={{
                  padding: '10px 8px 10px 10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: 190,
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => toggleSort('populacao')}
              >
                População SUS-dep.{arrow('populacao')}
              </th>
              <th style={{ padding: '10px 32px 10px 8px', fontWeight: 600, width: 259 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ cursor: 'pointer' }} onClick={() => toggleSort('cobertura')}>
                    Cobertura{arrow('cobertura')}
                  </span>
                  <InfoIcon>
                    <div style={{ fontWeight: 700, marginBottom: 6, color: '#93c5fd' }}>Parâmetro normativo</div>
                    <div>
                      1 tomógrafo por <strong>100 mil habitantes</strong>
                    </div>
                    <div style={{ marginTop: 8, fontWeight: 700, color: '#93c5fd' }}>Fórmula</div>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 11,
                        marginTop: 4,
                        background: 'rgba(255,255,255,0.08)',
                        padding: '6px 8px',
                        borderRadius: 4,
                      }}
                    >
                      População SUS-dependente ÷ Tomógrafos SUS
                    </div>
                    {nivel === 'municipio' && !semCorteDePopulacao && (
                      <div style={{ marginTop: 8, fontSize: 10, color: '#94a3b8' }}>
                        Só municípios com pelo menos 100 mil habitantes SUS-dependentes aparecem aqui — abaixo
                        disso, o parâmetro não espera equipamento próprio no município.
                      </div>
                    )}
                  </InfoIcon>
                </span>
              </th>
              <th style={{ padding: '10px 18px 10px 34px', fontWeight: 600, width: 220 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rowsPaginadas.map((r) => {
              const meta = statusMeta(r.cobertura);
              const pessoasPorEquip = r.oferta > 0 ? r.pop / r.oferta : null;
              const fillPercent = pessoasPorEquip != null ? Math.min(100, (pessoasPorEquip / 100_000) * 50) : 0;
              return (
                <tr key={r.chave} style={{ borderTop: '1px solid #f0f1f5' }}>
                  <td style={{ padding: '9px 6px 9px 18px', fontWeight: 500 }}>{r.nome}</td>
                  <td style={{ padding: '9px 8px 9px 6px', color: '#667085' }}>{r.uf}</td>
                  <td style={{ padding: '9px 8px', color: '#667085' }}>{r.macroNome ?? '—'}</td>
                  {nivel === 'municipio' && (
                    <td style={{ padding: '9px 8px', color: '#667085' }}>{r.regiaoSaudeNome ?? '—'}</td>
                  )}
                  <td style={{ padding: '9px 8px 9px 10px', textAlign: 'right', color: '#475066' }}>
                    {r.pop.toLocaleString('pt-BR')}
                    <div style={{ fontSize: 10, color: '#98a0b3', fontWeight: 400 }}>
                      de {r.popResidente.toLocaleString('pt-BR')} IBGE (−{r.popAns.toLocaleString('pt-BR')} ANS)
                    </div>
                  </td>
                  <td style={{ padding: '9px 32px 9px 8px', minWidth: 160 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div
                        style={{ flex: 1, position: 'relative', height: 8, borderRadius: 4, background: '#eef0f4', overflow: 'clip' }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            height: '100%',
                            width: `${fillPercent}%`,
                            background: meta.color,
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: '50%',
                            width: 2,
                            background: '#475066',
                            borderRadius: 1,
                            transform: 'translateX(-50%)',
                          }}
                        />
                      </div>
                      {pessoasPorEquip != null ? (
                        <div style={{ width: 92 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: meta.color }}>
                            {r.oferta} tomógrafo{r.oferta === 1 ? '' : 's'}
                          </div>
                          <div style={{ fontSize: 10, color: '#98a0b3' }}>
                            {formatMilhar(pessoasPorEquip)}/1 · {formatMultiplicador(r.cobertura / 100)}
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, color: meta.color, width: 92 }}>—</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '9px 18px 9px 34px' }}>
                    <StatusBadge cobertura={r.cobertura} />
                  </td>
                </tr>
              );
            })}
            {!loading && rowsPaginadas.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '16px 18px', color: '#98a0b3', fontSize: 12.5 }}>
                  Nenhum resultado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalItems={rowsOrdenadas.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </>
  );
}
