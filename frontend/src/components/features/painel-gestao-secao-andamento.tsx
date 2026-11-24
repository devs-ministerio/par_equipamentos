import { PainelCartao } from "@/components/features/painel-gestao-cartao";
import {
  GraficoColunas,
  LegendaSegmentos,
} from "@/components/features/painel-gestao-colunas";
import { RankingBarras } from "@/components/features/painel-gestao-ranking";
import type { PropsSecaoPainel } from "@/components/features/painel-gestao-secoes-tipos";
import { PainelBloco } from "@/components/features/painel-tecnico-estrutura";
import { ROTULO_SEM_LANCAMENTO } from "@/lib/painel-gestao-andamento";
import {
  COR_EM_OPERACAO,
  COR_ENTREGUE,
  LEGENDA_OPERACAO,
} from "@/lib/painel-gestao-operacao";

function formatarPrazo(dias: number): string {
  return dias >= 365
    ? `${(dias / 365).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} anos`
    : `${dias.toLocaleString("pt-BR")} dias`;
}

export function PainelSecaoAndamento({
  d,
  filtros,
  locais,
  alternarLocal,
}: PropsSecaoPainel) {
  const { parados, equipamentos } = d;
  return (
    <PainelBloco id="andamento" titulo="Andamento">
      <div className="grid gap-6 lg:grid-cols-2">
        <PainelCartao titulo="Instrumentos sem atualizações">
          <GraficoColunas
            vazio="Nenhum instrumento em andamento."
            selecionado={locais.atualizacao}
            onSelecionar={(r) => alternarLocal("atualizacao", r)}
            colunas={[
              ...parados.faixas.map((f) => ({
                rotulo: f.rotulo,
                segmentos: [
                  { nome: f.rotulo, valor: f.quantidade, cor: f.cor },
                ],
              })),
              {
                rotulo: ROTULO_SEM_LANCAMENTO,
                segmentos: [
                  {
                    nome: ROTULO_SEM_LANCAMENTO,
                    valor: parados.semAtividade,
                    cor: "var(--painel-chart-ardosia)",
                  },
                ],
              },
            ]}
          />
        </PainelCartao>
        <PainelCartao titulo="Prazo médio entre etapas">
          <RankingBarras
            compacto
            vazio="Sem instrumentos com as duas datas."
            selecionado={locais.prazo}
            onSelecionar={(r) => alternarLocal("prazo", r)}
            itens={d.prazos.map((p) => ({
              chave: p.rotulo,
              rotulo: `${p.rotulo} (${p.instrumentos})`,
              valor: p.dias,
              texto: formatarPrazo(p.dias),
            }))}
          />
        </PainelCartao>
      </div>
      <PainelCartao titulo="Entregue por UF">
        <RankingBarras
          limite={10}
          selecionado={filtros.uf}
          onSelecionar={(uf) =>
            filtros.setUfComMunicipio(filtros.uf === uf ? null : uf)
          }
          vazio="Nenhum equipamento planejado neste recorte."
          itens={d.porUf.map((u) => ({
            rotulo: u.uf,
            valor: u.planejado,
            segmentos: [
              { valor: u.operacao, cor: COR_EM_OPERACAO },
              { valor: u.entregue, cor: COR_ENTREGUE },
            ],
            texto: `${u.operacao} de ${u.planejado}`,
          }))}
        />
        <LegendaSegmentos
          itens={LEGENDA_OPERACAO.map((l, i) => ({
            ...l,
            valor: [
              equipamentos.operacao,
              equipamentos.entregue,
              equipamentos.restante,
            ][i],
          }))}
        />
      </PainelCartao>
    </PainelBloco>
  );
}
