import { useState } from 'react';
import type { NivelCoberturaRow } from '@/types/domain';
import { getEquipamento } from '@/data/constants';
import { SubNivelRow } from './sub-nivel-row';
import { MunicipioDetalheModal } from './municipio-detalhe-modal';

interface Props {
  rows: NivelCoberturaRow[];
  /** Que nivel essas linhas representam -- so 'regiaoSaude' pode expandir
   * (pra Municipio, que ja e o nivel mais fino que a base tem). */
  nivelAtual: 'regiaoSaude' | 'municipio';
  equipmentFamily: string;
  /** chaves ja selecionadas no filtro (so destaque visual). */
  selecionados?: string[];
  /** true no Dashboard (card "Cobertura Assistencial", tem espaco de sobra)
   * -- mostra Populacao SUS-dependente, barra de cobertura completa ("X SUS
   * de Y no total") e StatusBadge, igual a linha principal em
   * NivelCoberturaTable.tsx. false (default) no painel estreito do Mapa,
   * onde so cabe Nome + coeficiente. Historico do bug: a reducao pro Mapa
   * (2026-08-24) foi aplicada nesse componente inteiro, empobrecendo
   * tambem o Dashboard sem querer -- esse prop escopa a reducao de volta
   * so pro Mapa (2026-08-24, correcao). */
  completo?: boolean;
}

/**
 * Linhas de um nivel abaixo do da tabela pai. Dois layouts, escolhidos por
 * `completo`:
 * - completo=true (Dashboard, NivelCoberturaTable.tsx): Nome, População
 *   SUS-dependente, barra de cobertura com "X SUS de Y no total" e
 *   StatusBadge -- mesmas colunas da linha principal, card com espaço de
 *   sobra.
 * - completo=false, default (MapaPage.tsx, painel lateral estreito): só
 *   Nome + coeficiente colorido (tipo "1,54x"). Historico: reduzido em
 *   2026-08-24 pro painel do Mapa, mas a reducao foi aplicada no componente
 *   inteiro e empobreceu o Dashboard tambem sem querer -- corrigido no
 *   mesmo dia escopando com esse prop (o resumo por nivel que o botão de
 *   detalhe/modal dava no meio tempo virou os cards "Total de
 *   equipamentos/Cobertura/Equipamento mais próximo/População SUS" no topo
 *   do "Recorte" em MapaPage.tsx, e continua só lá).
 * Recursiva: uma linha de Regiao de Saude pode ela mesma expandir em
 * Municipios (SubNivelRow busca sob demanda e se re-renderiza chamando este
 * componente de novo com nivelAtual="municipio", propagando o mesmo
 * `completo`), cobrindo a cadeia completa Macrorregiao -> Regiao de Saude ->
 * Municipio.
 */
// RN especifica de TOMOGRAFO (ver Metodologia): municipio abaixo do
// parametro normativo nunca foi esperado ter equipamento proprio -- na
// sub-camada de Municipio (drill-down), um municipio pequeno em
// Hipossuficiente e so ruido (situacao que o parametro nunca cobrou dele);
// ja um municipio pequeno em Hiperssuficiente e informativo (superavit
// "de bonus"), entao continua aparecendo do tamanho que for.
const POPULACAO_MINIMA_PARA_HIPO = 100_000;

export function SubNivelRows({ rows, nivelAtual, equipmentFamily, selecionados, completo = false }: Props) {
  const produtividade = getEquipamento(equipmentFamily).produtividade;
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  // Self-contido (nao recebe callback do pai) -- SubNivelRows e chamado tanto
  // de CoberturaTable quanto de NivelCoberturaTable, e recursivamente por si
  // mesmo (Regiao -> Municipio); threading um callback por 2+ niveis de
  // recursao so pra abrir o mesmo modal que MunicipioDetalheModal ja busca
  // tudo sozinho seria complexidade sem ganho.
  const [detalheAberto, setDetalheAberto] = useState<NivelCoberturaRow | null>(null);

  function toggleExpandida(chave: string) {
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave); else next.add(chave);
      return next;
    });
  }

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

  if (rowsExibidas.length === 0) {
    // rows.length > 0 aqui so acontece se TODOS os municipios do grupo sao
    // pequenos (<100k) e Hipo -- nao e "sem dado", e o corte escondendo tudo.
    if (ocultos > 0) {
      return (
        <div className="p-1 text-xs text-muted-foreground">
          +{ocultos} município{ocultos === 1 ? '' : 's'} oculto{ocultos === 1 ? '' : 's'} abaixo de 100 mil habitantes.
        </div>
      );
    }
    const rotulo = nivelAtual === 'regiaoSaude' ? 'região de saúde' : 'município';
    return <div className="p-1 text-xs text-muted-foreground">Nenhuma {rotulo} encontrada.</div>;
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
      <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
        <tbody>
          {rowsExibidas.map((linha) => (
            <SubNivelRow
              key={linha.chave}
              linha={linha}
              nivelAtual={nivelAtual}
              equipmentFamily={equipmentFamily}
              produtividade={produtividade}
              selecionados={selecionados}
              completo={completo}
              expandida={expandidas.has(linha.chave)}
              onToggle={() => toggleExpandida(linha.chave)}
              onAbrirDetalhe={setDetalheAberto}
            />
          ))}
        </tbody>
      </table>
      {ocultos > 0 && (
        <div className="px-1 pt-1.5 text-[11px] text-muted-foreground">
          +{ocultos} município{ocultos === 1 ? '' : 's'} oculto{ocultos === 1 ? '' : 's'} abaixo de 100 mil habitantes.
        </div>
      )}
      {detalheAberto && (
        <MunicipioDetalheModal linha={detalheAberto} equipmentFamily={equipmentFamily} onClose={() => setDetalheAberto(null)} />
      )}
    </>
  );
}
