import { MetricStrip } from "@/components/common/metric-strip";
import { PainelGestaoEquipamentos } from "@/components/features/painel-gestao-equipamentos";
import { PainelCartao } from "@/components/features/painel-gestao-cartao";
import {
  GraficoColunas,
  LegendaSegmentos,
} from "@/components/features/painel-gestao-colunas";
import { GraficoRosca } from "@/components/features/painel-gestao-rosca";
import { PainelBloco } from "@/components/features/painel-tecnico-estrutura";
import type {
  PropsSecaoEvolucao,
  PropsSecaoPainel,
} from "@/components/features/painel-gestao-secoes-tipos";
import { fmtMoeda } from "@/lib/monitoramento-format";
import {
  COR_PREVISTA,
  COR_REALIZADA,
  corDaFase,
} from "@/lib/monitoramento-painel-palette";

const TURQUESA = "var(--painel-chart-turquesa)";
const LEGENDA_INAUGURACAO = [
  { nome: "Inauguração realizada", cor: COR_REALIZADA },
  { nome: "Inauguração dispensada", cor: TURQUESA },
];

export function PainelSecaoVisaoGeral({
  d,
  filtros,
  locais,
  alternarLocal,
}: PropsSecaoPainel) {
  const { dados, equipamentos, analise, fases } = d;
  return (
    <PainelBloco id="visao-geral" titulo="Visão geral">
      <MetricStrip
        items={[
          { key: "instrumentos", label: "Instrumentos", value: d.total },
          {
            key: "valor-global",
            label: "Valor global",
            value: dados.instrumentosComValor
              ? fmtMoeda(dados.valorGlobal)
              : "—",
          },
          {
            key: "operacao",
            label: "Equipamentos em operação",
            value: equipamentos.operacao,
            detail: `${equipamentos.entregue} entregues, a inaugurar · ${equipamentos.restante} planejados`,
          },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <PainelCartao titulo="Instrumentos por situação">
          <GraficoColunas
            selecionado={filtros.situacao}
            onSelecionar={(r) =>
              filtros.setSituacao(filtros.situacao === r ? null : r)
            }
            vazio="Nenhum instrumento neste recorte."
            colunas={analise.fases.map((f) => ({
              rotulo: f.rotulo,
              segmentos: [
                {
                  nome: f.rotulo,
                  valor: f.quantidade,
                  cor: corDaFase(f.rotulo, fases),
                },
              ],
            }))}
          />
        </PainelCartao>
        <PainelGestaoEquipamentos
          familias={d.familias}
          selecionada={locais.familia}
          onSelecionar={(f) => f && alternarLocal("familia", f)}
        />
      </div>
    </PainelBloco>
  );
}

export function PainelSecaoEvolucao({
  d,
  locais,
  alternarLocal,
  anoSelecionado,
  alternarAno,
}: PropsSecaoEvolucao) {
  const { situacaoInaug } = d;
  return (
    <PainelBloco id="evolucao" titulo="Evolução">
      <PainelCartao titulo="Ano do instrumento">
        <GraficoColunas
          selecionado={anoSelecionado("ano_instrumento")}
          onSelecionar={(r) => alternarAno("ano_instrumento", r)}
          vazio="Nenhum ano informado."
          colunas={d.analise.anos.map((a) => ({
            rotulo: a.rotulo,
            segmentos: [
              { nome: "Instrumentos", valor: a.quantidade, cor: COR_REALIZADA },
            ],
          }))}
        />
      </PainelCartao>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <PainelCartao
          titulo="Ano de Início de Operação dos Equipamentos"
          apoio={`${d.totalEntregaAno} equipamentos em operação`}
        >
          <GraficoColunas
            selecionado={anoSelecionado("inicio_operacao")}
            onSelecionar={(r) => alternarAno("inicio_operacao", r)}
            vazio="Nenhum equipamento em operação neste recorte."
            colunas={d.entregaAno.anos.map((a) => ({
              rotulo: a.ano,
              segmentos: [
                {
                  nome: "Inauguração realizada",
                  valor: a.inaugurados,
                  cor: COR_REALIZADA,
                },
                {
                  nome: "Inauguração dispensada",
                  valor: a.dispensados,
                  cor: TURQUESA,
                },
              ],
            }))}
          />
          <LegendaSegmentos itens={LEGENDA_INAUGURACAO} />
        </PainelCartao>
        <PainelCartao titulo="Situação da inauguração">
          <GraficoRosca
            rotuloTotal="instrumentos"
            selecionada={locais.inauguracao}
            onSelecionar={(r) => alternarLocal("inauguracao", r)}
            fatias={[
              {
                rotulo: "Realizada",
                valor: situacaoInaug.Realizada,
                cor: COR_REALIZADA,
              },
              {
                rotulo: "Prevista",
                valor: situacaoInaug.Prevista,
                cor: COR_PREVISTA,
              },
              {
                rotulo: "Dispensada",
                valor: situacaoInaug.Dispensada,
                cor: TURQUESA,
              },
              {
                rotulo: "Sem registro",
                valor: situacaoInaug["Sem registro"],
                cor: "var(--painel-chart-ardosia)",
              },
            ]}
          />
        </PainelCartao>
      </div>
    </PainelBloco>
  );
}
