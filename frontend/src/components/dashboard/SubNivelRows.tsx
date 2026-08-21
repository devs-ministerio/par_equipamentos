import { Fragment, useState } from 'react';
import type { NivelCoberturaRow } from '../../types/domain';
import { calcularCoeficiente } from '../../utils/coeficiente';
import { formatMultiplicador } from '../../utils/format';
import { StatusBadge } from '../common/StatusBadge';
import { fetchMunicipalityCoverage } from '../../services/api';

type Filhos = NivelCoberturaRow[] | 'carregando' | 'erro';

export interface SelecaoSubNivel {
  linha: NivelCoberturaRow;
  nivel: 'regiaoSaude' | 'municipio';
}

interface Props {
  rows: NivelCoberturaRow[];
  /** Que nivel essas linhas representam -- so 'regiaoSaude' pode expandir
   * (pra Municipio, que ja e o nivel mais fino que a base tem). */
  nivelAtual: 'regiaoSaude' | 'municipio';
  equipmentFamily: string;
  /** Clique no "alvo" de cada linha -- aplica o filtro (mesma cascata que
   * clicar num municipio ja fazia antes). */
  onSelecionar?: (selecao: SelecaoSubNivel) => void;
  /** chaves ja selecionadas no filtro (destaca a linha). */
  selecionados?: string[];
}

/**
 * Linhas de um nivel abaixo do da tabela pai, com o MESMO layout da linha
 * principal (Nome, População SUS-dependente, Cobertura com a mesma
 * barra/coeficiente, Status) -- pedido explicito (2026-08-22). Recursiva:
 * uma linha de Regiao de Saude pode ela mesma expandir em Municipios (o
 * proprio componente busca e se re-renderiza com nivelAtual="municipio"),
 * cobrindo a cadeia completa Macrorregiao -> Regiao de Saude -> Municipio.
 */
// RN especifica de TOMOGRAFO (ver Metodologia): municipio abaixo do
// parametro normativo nunca foi esperado ter equipamento proprio -- na
// sub-camada de Municipio (drill-down), um municipio pequeno em
// Hipossuficiente e so ruido (deficit que o parametro nunca cobrou dele);
// ja um municipio pequeno em Hiperssuficiente e informativo (superavit
// "de bonus"), entao continua aparecendo do tamanho que for.
const POPULACAO_MINIMA_PARA_HIPO = 100_000;

export function SubNivelRows({ rows, nivelAtual, equipmentFamily, onSelecionar, selecionados }: Props) {
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [filhosPorChave, setFilhosPorChave] = useState<Record<string, Filhos>>({});

  const rowsExibidas =
    nivelAtual === 'municipio'
      ? rows.filter((r) => r.status === 'Hiperssuficiente' || r.pop >= POPULACAO_MINIMA_PARA_HIPO)
      : rows;

  function toggleExpandida(chave: string) {
    const jaExpandida = expandidas.has(chave);
    setExpandidas((prev) => {
      const next = new Set(prev);
      jaExpandida ? next.delete(chave) : next.add(chave);
      return next;
    });
    if (!jaExpandida && !filhosPorChave[chave]) {
      setFilhosPorChave((prev) => ({ ...prev, [chave]: 'carregando' }));
      // sem minPopulation aqui -- e um breakdown completo da regiao de
      // saude, nao a lista "top" filtrada por tamanho (essa so faz sentido
      // como recorte inicial, nao dentro de um drill-down que o usuario ja
      // pediu explicitamente).
      fetchMunicipalityCoverage({ equipmentFamily, healthRegionCodes: [chave] })
        .then((filhos) => setFilhosPorChave((prev) => ({ ...prev, [chave]: filhos })))
        .catch(() => setFilhosPorChave((prev) => ({ ...prev, [chave]: 'erro' })));
    }
  }

  if (rowsExibidas.length === 0) {
    const rotulo = nivelAtual === 'regiaoSaude' ? 'região de saúde' : 'município';
    return <div style={{ fontSize: 12, color: '#98a0b3', padding: '4px 0' }}>Nenhuma {rotulo} encontrada.</div>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <tbody>
        {rowsExibidas.map((linha) => {
          const coef = calcularCoeficiente(linha.oferta, linha.pop);
          const expansivel = nivelAtual === 'regiaoSaude';
          const expandida = expandidas.has(linha.chave);
          const filhos = filhosPorChave[linha.chave];
          const selecionada = selecionados?.includes(linha.chave);
          return (
            <Fragment key={linha.chave}>
              <tr
                onClick={(e) => {
                  e.stopPropagation();
                  if (expansivel) toggleExpandida(linha.chave);
                  else onSelecionar?.({ linha, nivel: nivelAtual });
                }}
                style={{
                  borderTop: '1px solid #e2e6ee',
                  cursor: 'pointer',
                  background: selecionada ? '#eef2ff' : 'transparent',
                }}
              >
                <td style={{ padding: '6px 8px 6px 4px', fontWeight: 500, color: '#16213e' }}>
                  {expansivel && (
                    <span
                      style={{
                        fontSize: 9,
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
                  {linha.nome} <span style={{ color: '#98a0b3', fontWeight: 400 }}>({linha.uf})</span>
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#475066', width: 130, whiteSpace: 'nowrap' }}>
                  {linha.pop.toLocaleString('pt-BR')}
                </td>
                <td style={{ padding: '6px 8px', width: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, position: 'relative', height: 6, borderRadius: 3, background: '#eef0f4', overflow: 'clip' }}>
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          height: '100%',
                          width: `${coef.fillPercent}%`,
                          background: coef.corBarra,
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
                          transform: 'translateX(-50%)',
                        }}
                      />
                    </div>
                    <div style={{ width: 108 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: coef.corTexto, whiteSpace: 'nowrap' }}>
                        {coef.valor != null ? formatMultiplicador(coef.valor) : '—'}
                      </div>
                      <div style={{ fontSize: 9.5, color: '#98a0b3', whiteSpace: 'nowrap' }}>
                        {linha.oferta} SUS{linha.ofertaTotal !== linha.oferta && ` de ${linha.ofertaTotal}`}
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '6px 4px 6px 12px', width: 130 }}>
                  <StatusBadge cobertura={linha.cobertura} />
                </td>
              </tr>
              {expandida && (
                <tr>
                  <td colSpan={4} style={{ padding: '4px 8px 8px 26px', background: '#f4f6fb' }}>
                    {filhos === 'carregando' && (
                      <div style={{ fontSize: 12, color: '#98a0b3', padding: '4px 0' }}>Carregando municípios...</div>
                    )}
                    {filhos === 'erro' && (
                      <div style={{ fontSize: 12, color: '#B40D0D', padding: '4px 0' }}>Não foi possível carregar os municípios.</div>
                    )}
                    {Array.isArray(filhos) && (
                      <SubNivelRows
                        rows={filhos}
                        nivelAtual="municipio"
                        equipmentFamily={equipmentFamily}
                        onSelecionar={onSelecionar}
                        selecionados={selecionados}
                      />
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
