import { Fragment, useEffect, useMemo, useState } from 'react';
import type { NivelCoberturaRow, StatusCobertura } from '../../types/domain';
import { formatMultiplicador } from '../../utils/format';
import { calcularCoeficiente } from '../../utils/coeficiente';
import { getEquipamento, formatarQuantidadeEquipamento } from '../../data/constants';
import { InfoIcon } from '../common/InfoIcon';
import { StatusBadge } from '../common/StatusBadge';
import { BotaoDetalhe } from '../common/BotaoDetalhe';
import { Pagination } from '../common/Pagination';
import { fetchHealthRegionCoverage, fetchMunicipalityCoverage } from '../../services/api';
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
    return <span style={{ marginLeft: 3 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>;
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
      {error && (
        <div style={{ padding: '10px 18px', color: '#B40D0D', fontSize: 12.5 }}>
          Não foi possível carregar ({error}).
        </div>
      )}
      {/* overflowX visible de proposito -- ver comentario equivalente em
          CoberturaTable.tsx (overflow:auto nos dois eixos corta o tooltip
          do InfoIcon, absolutamente posicionado, mesmo com maxWidth certo). */}
      <div
        style={{
          maxHeight: 340,
          overflowY: 'auto',
          overflowX: 'visible',
          opacity: loading ? 0.6 : 1,
          transition: 'opacity .15s',
        }}
      >
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
                    <div style={{ fontWeight: 700, marginBottom: 6, color: '#93c5fd' }}>Coeficiente</div>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 11,
                        background: 'rgba(255,255,255,0.08)',
                        padding: '6px 8px',
                        borderRadius: 4,
                      }}
                    >
                      Equipamentos SUS ÷ população SUS-dependente, na proporção esperada
                    </div>
                    <div style={{ marginTop: 8, fontSize: 10, color: '#94a3b8' }}>
                      Abaixo de 1x é Hipossuficiente, 1x ou mais é Hiperssuficiente.
                    </div>
                    {nivel === 'municipio' && !semCorteDePopulacao && (
                      <div style={{ marginTop: 8, fontSize: 10, color: '#94a3b8' }}>
                        Só municípios com mais de 100 mil habitantes aparecem aqui.
                      </div>
                    )}
                  </InfoIcon>
                </span>
              </th>
              <th style={{ padding: '10px 18px 10px 34px', fontWeight: 600, width: 220 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Status
                  <InfoIcon align="right">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#B40D0D', flexShrink: 0 }} />
                      <div>
                        <strong style={{ color: '#fca5a5' }}>Hipossuficiente</strong>
                        <br />
                        coeficiente &lt; 1x
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#2F6A1D', flexShrink: 0 }} />
                      <div>
                        <strong style={{ color: '#86efac' }}>Hiperssuficiente</strong>
                        <br />
                        coeficiente ≥ 1x
                      </div>
                    </div>
                  </InfoIcon>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
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
                <tr
                  onClick={expansivel ? () => toggleExpandida(r.chave) : undefined}
                  style={{ borderTop: '1px solid #f0f1f5', cursor: expansivel ? 'pointer' : 'default' }}
                >
                  <td style={{ padding: '9px 6px 9px 18px', fontWeight: 500 }}>
                    {expansivel && (
                      <span
                        style={{
                          fontSize: 10,
                          color: '#98a0b3',
                          display: 'inline-block',
                          marginRight: 6,
                          transform: expandida ? 'rotate(90deg)' : 'none',
                          transition: 'transform 0.15s',
                        }}
                      >
                        ▶
                      </span>
                    )}
                    {r.nome}
                  </td>
                  <td style={{ padding: '9px 8px 9px 6px', color: '#667085' }}>{r.uf}</td>
                  <td style={{ padding: '9px 8px', color: '#667085' }}>{r.macroNome ?? '—'}</td>
                  {nivel === 'municipio' && (
                    <td style={{ padding: '9px 8px', color: '#667085' }}>{r.regiaoSaudeNome ?? '—'}</td>
                  )}
                  <td style={{ padding: '9px 8px 9px 10px', textAlign: 'right', color: '#475066' }}>
                    {r.pop.toLocaleString('pt-BR')}
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
                            background: corBarra,
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
                      <div style={{ width: 118 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: corTexto }}>
                          {coeficiente != null ? formatMultiplicador(coeficiente) : '—'}
                        </div>
                        <div style={{ fontSize: 10, color: '#98a0b3' }}>
                          {formatarQuantidadeEquipamento(r.oferta)} SUS
                          {r.ofertaTotal !== r.oferta && ` de ${r.ofertaTotal} no total`}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '9px 18px 9px 34px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StatusBadge cobertura={r.cobertura} />
                      {nivel === 'municipio' && <BotaoDetalhe onClick={() => setDetalheAberto(r)} />}
                    </div>
                  </td>
                </tr>
                {expandida && (
                  <tr style={{ background: '#eef1f6' }}>
                    <td colSpan={nivel === 'municipio' ? 7 : 6} style={{ padding: '10px 18px 12px 42px' }}>
                      {filhos === 'carregando' && (
                        <div style={{ fontSize: 12, color: '#98a0b3' }}>Carregando municípios...</div>
                      )}
                      {filhos === 'erro' && (
                        <div style={{ fontSize: 12, color: '#B40D0D' }}>Não foi possível carregar os municípios.</div>
                      )}
                      {Array.isArray(filhos) && (
                        <SubNivelRows
                          rows={filhos}
                          nivelAtual="municipio"
                          equipmentFamily={equipmentFamily}
                          selecionados={subNivelSelecionados}
                        />
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
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
      {detalheAberto && (
        <MunicipioDetalheModal linha={detalheAberto} equipmentFamily={equipmentFamily} onClose={() => setDetalheAberto(null)} />
      )}
    </>
  );
}
