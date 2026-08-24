import { Fragment, useState } from 'react';
import type { NivelCoberturaRow } from '../../types/domain';
import { calcularCoeficiente } from '../../utils/coeficiente';
import { formatMultiplicador } from '../../utils/format';
import { getEquipamento } from '../../data/constants';
import { fetchMunicipalityCoverage } from '../../services/api';

type Filhos = NivelCoberturaRow[] | 'carregando' | 'erro';

interface Props {
  rows: NivelCoberturaRow[];
  /** Que nivel essas linhas representam -- so 'regiaoSaude' pode expandir
   * (pra Municipio, que ja e o nivel mais fino que a base tem). */
  nivelAtual: 'regiaoSaude' | 'municipio';
  equipmentFamily: string;
  /** chaves ja selecionadas no filtro (so destaque visual). */
  selecionados?: string[];
}

/**
 * Linhas de um nivel abaixo do da tabela pai -- versao enxuta (so Nome e o
 * coeficiente colorido, tipo "1,54x") do layout completo da linha
 * principal (que tem população, barra e StatusBadge por extenso). Reduzido
 * em etapas em 2026-08-24: essa sub-camada roda no painel estreito do Mapa
 * (mais estreito que o card do Dashboard onde a linha principal aparece) --
 * primeiro saiu o StatusBadge (maior consumidor de espaço), depois
 * população/barra/"X SUS de Y" também saíram, e por fim o botão de
 * detalhe/modal de comparação também saiu (o resumo por nível que ele dava
 * virou os cards "Total de equipamentos/Cobertura/Equipamento mais
 * próximo/População SUS" no topo do "Recorte", em MapaPage.tsx). Sobra só
 * o essencial pra não competir por espaço com o Nome. Recursiva: uma linha
 * de Regiao de Saude pode ela mesma expandir em Municipios (o proprio
 * componente busca e se re-renderiza com nivelAtual="municipio"), cobrindo
 * a cadeia completa Macrorregiao -> Regiao de Saude -> Municipio.
 */
// RN especifica de TOMOGRAFO (ver Metodologia): municipio abaixo do
// parametro normativo nunca foi esperado ter equipamento proprio -- na
// sub-camada de Municipio (drill-down), um municipio pequeno em
// Hipossuficiente e so ruido (situacao que o parametro nunca cobrou dele);
// ja um municipio pequeno em Hiperssuficiente e informativo (superavit
// "de bonus"), entao continua aparecendo do tamanho que for.
const POPULACAO_MINIMA_PARA_HIPO = 100_000;

export function SubNivelRows({ rows, nivelAtual, equipmentFamily, selecionados }: Props) {
  const produtividade = getEquipamento(equipmentFamily).produtividade;
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [filhosPorChave, setFilhosPorChave] = useState<Record<string, Filhos>>({});

  // Excecao ao corte: se NENHUM municipio do grupo tem >=100 mil habitantes
  // E nenhum tem tomografo nenhum, o corte normal deixaria a sub-camada
  // inteira vazia (parece "sem dado" em vez de "aqui so tem cidade pequena e
  // carente") -- nesse caso mostra todos, do jeito que sao.
  const semGrandeNemEquipamento = rows.every((r) => r.pop < POPULACAO_MINIMA_PARA_HIPO && r.oferta === 0);
  const rowsExibidas =
    nivelAtual === 'municipio' && !semGrandeNemEquipamento
      ? rows.filter((r) => r.status === 'Hiperssuficiente' || r.pop >= POPULACAO_MINIMA_PARA_HIPO)
      : rows;
  const ocultos = rows.length - rowsExibidas.length;

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
    // rows.length > 0 aqui so acontece se TODOS os municipios do grupo sao
    // pequenos (<100k) e Hipo -- nao e "sem dado", e o corte escondendo tudo.
    if (ocultos > 0) {
      return (
        <div style={{ fontSize: 12, color: '#98a0b3', padding: '4px 0' }}>
          +{ocultos} município{ocultos === 1 ? '' : 's'} oculto{ocultos === 1 ? '' : 's'} abaixo de 100 mil habitantes.
        </div>
      );
    }
    const rotulo = nivelAtual === 'regiaoSaude' ? 'região de saúde' : 'município';
    return <div style={{ fontSize: 12, color: '#98a0b3', padding: '4px 0' }}>Nenhuma {rotulo} encontrada.</div>;
  }

  return (
    <>
      {/* table-layout:fixed -- sem isso os widths dos <td> abaixo sao so
          "sugestao" (table-layout:auto default), e o navegador deixa a
          tabela crescer alem do container pra caber o conteudo (nome
          comprido quebrando linha de forma desalinhada, coluna da direita
          cortada na borda do card com scroll horizontal aparecendo) -- bug
          real visto 2026-08-24 no painel lateral do Mapa (mais estreito que
          o card do Dashboard onde esse mesmo componente tambem e usado).
          Com fixed, a coluna do indicador tem largura garantida e a de
          Nome fica com o espaco que sobrar (bastante, ja que agora so tem
          essas 2 colunas). */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
        <tbody>
          {rowsExibidas.map((linha) => {
            const coef = calcularCoeficiente(linha.oferta, linha.pop, produtividade);
            const expansivel = nivelAtual === 'regiaoSaude';
            const expandida = expandidas.has(linha.chave);
            const filhos = filhosPorChave[linha.chave];
            const selecionada = selecionados?.includes(linha.chave);
            return (
              <Fragment key={linha.chave}>
                <tr
                  onClick={expansivel ? (e) => { e.stopPropagation(); toggleExpandida(linha.chave); } : undefined}
                  style={{
                    borderTop: '1px solid #e2e6ee',
                    cursor: expansivel ? 'pointer' : 'default',
                    background: selecionada ? '#eef2ff' : 'transparent',
                  }}
                >
                  <td
                    style={{
                      padding: '6px 8px 6px 4px',
                      fontWeight: 500,
                      color: '#16213e',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={`${linha.nome} (${linha.uf})`}
                  >
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
                  {/* So o indicador (coeficiente colorido) -- populacao,
                      barrinha, "X SUS de Y" e o botao de detalhe/modal
                      foram removidos a pedido (2026-08-24): esse resumo
                      por nivel agora vive nos cards acima do filtro em
                      MapaPage.tsx, e o detalhe cru continua na tabela
                      principal do Dashboard. */}
                  <td style={{ padding: '6px 8px', width: 76, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: coef.corTexto }}>
                      {coef.valor != null ? formatMultiplicador(coef.valor) : '—'}
                    </span>
                  </td>
                </tr>
                {expandida && (
                  <tr>
                    <td colSpan={2} style={{ padding: '4px 8px 8px 26px', background: '#f4f6fb' }}>
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
      {ocultos > 0 && (
        <div style={{ fontSize: 11, color: '#98a0b3', padding: '6px 4px 0' }}>
          +{ocultos} município{ocultos === 1 ? '' : 's'} oculto{ocultos === 1 ? '' : 's'} abaixo de 100 mil habitantes.
        </div>
      )}
    </>
  );
}
