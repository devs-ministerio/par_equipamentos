import { Fragment, useState } from 'react';
import type { NivelCoberturaRow } from '@/types/domain';
import { calcularCoeficiente } from '@/utils/coeficiente';
import { formatMultiplicador } from '@/utils/format';
import { getEquipamento, formatarQuantidadeEquipamento } from '@/data/constants';
import { fetchMunicipalityCoverage } from '@/services/api';
import { StatusBadge } from '@/components/common/StatusBadge';
import { BotaoDetalhe } from './BotaoDetalhe';
import { MunicipioDetalheModal } from './MunicipioDetalheModal';

type Filhos = NivelCoberturaRow[] | 'carregando' | 'erro';

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
 * Municipios (o proprio componente busca e se re-renderiza com
 * nivelAtual="municipio", propagando o mesmo `completo`), cobrindo a
 * cadeia completa Macrorregiao -> Regiao de Saude -> Municipio.
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
  const [filhosPorChave, setFilhosPorChave] = useState<Record<string, Filhos>>({});
  // Self-contido (nao recebe callback do pai) -- SubNivelRows e chamado tanto
  // de CoberturaTable quanto de NivelCoberturaTable, e recursivamente por si
  // mesmo (Regiao -> Municipio); threading um callback por 2+ niveis de
  // recursao so pra abrir o mesmo modal que MunicipioDetalheModal ja busca
  // tudo sozinho seria complexidade sem ganho.
  const [detalheAberto, setDetalheAberto] = useState<NivelCoberturaRow | null>(null);

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
                  className={`border-t border-border ${expansivel ? 'cursor-pointer' : ''} ${selecionada ? 'bg-accent' : ''}`}
                >
                  <td
                    className="overflow-hidden py-1.5 pr-2 pl-1 font-medium text-foreground text-ellipsis whitespace-nowrap"
                    title={`${linha.nome} (${linha.uf})`}
                  >
                    {expansivel && (
                      <span
                        className="mr-1.5 inline-block text-[9px] text-muted-foreground transition-transform duration-150"
                        style={{ transform: expandida ? 'rotate(90deg)' : 'none' }}
                      >
                        ▶
                      </span>
                    )}
                    {linha.nome} <span className="font-normal text-muted-foreground">({linha.uf})</span>
                  </td>
                  {completo ? (
                    <>
                      <td className="w-[110px] py-1.5 px-2 text-right whitespace-nowrap text-muted-foreground">
                        {linha.pop.toLocaleString('pt-BR')}
                      </td>
                      <td className="w-[210px] py-1.5 pr-6 pl-2">
                        {/* bar com largura fixa (nao flex:1) -- em
                            table-layout:fixed sem width explicito no <td>,
                            o navegador dividia o espaco sobrando de forma
                            instavel entre Nome e essa coluna, esticando a
                            barra bem alem do necessario e empurrando o
                            rotulo/status pra longe, desalinhado com o
                            cabecalho (bug real, 2026-08-24). */}
                        <div className="flex items-center gap-2">
                          <div className="relative h-[7px] w-[90px] shrink-0 overflow-clip rounded bg-muted">
                            <div
                              className="absolute top-0 left-0 h-full"
                              style={{ width: `${coef.fillPercent}%`, background: coef.corBarra }}
                            />
                            <div className="absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 rounded-sm bg-muted-foreground" />
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold" style={{ color: coef.corTexto }}>
                              {coef.valor != null ? formatMultiplicador(coef.valor) : '—'}
                            </div>
                            <div className="text-[9.5px] text-muted-foreground">
                              {formatarQuantidadeEquipamento(linha.oferta)} em uso SUS
                              {linha.ofertaTotal !== linha.oferta && ` de ${linha.ofertaTotal} existentes`}
                            </div>
                          </div>
                        </div>
                      </td>
                      {/* width 168 (nao 130) -- "Hiperssuficiente" (rotulo
                          mais longo do StatusBadge) + gap + BotaoDetalhe
                          juntos passavam dos 130px, empurrando o botao pra
                          fora da celula/quebrando linha (bug real,
                          2026-08-24). whiteSpace:nowrap trava o layout numa
                          linha so. */}
                      <td className="w-[168px] py-1.5 pr-2 pl-4.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <StatusBadge cobertura={linha.cobertura} />
                          {nivelAtual === 'municipio' && <BotaoDetalhe onClick={() => setDetalheAberto(linha)} />}
                        </div>
                      </td>
                    </>
                  ) : (
                    <td className="w-[76px] py-1.5 px-2 text-right whitespace-nowrap">
                      <span className="text-[11px] font-semibold" style={{ color: coef.corTexto }}>
                        {coef.valor != null ? formatMultiplicador(coef.valor) : '—'}
                      </span>
                    </td>
                  )}
                </tr>
                {expandida && (
                  <tr>
                    <td colSpan={completo ? 4 : 2} className="bg-background py-2 pr-2 pl-6.5">
                      {filhos === 'carregando' && <div className="p-1 text-xs text-muted-foreground">Carregando municípios...</div>}
                      {filhos === 'erro' && <div className="p-1 text-xs text-destructive">Não foi possível carregar os municípios.</div>}
                      {Array.isArray(filhos) && (
                        <SubNivelRows
                          rows={filhos}
                          nivelAtual="municipio"
                          equipmentFamily={equipmentFamily}
                          selecionados={selecionados}
                          completo={completo}
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
