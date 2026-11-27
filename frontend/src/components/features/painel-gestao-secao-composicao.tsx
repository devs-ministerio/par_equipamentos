import { PainelCartao } from "@/components/features/painel-gestao-cartao";
import { PainelGestaoCompletude } from "@/components/features/painel-gestao-completude";
import { GraficoRosca } from "@/components/features/painel-gestao-rosca";
import { RankingBarras } from "@/components/features/painel-gestao-ranking";
import type { PropsSecaoPainel } from "@/components/features/painel-gestao-secoes-tipos";
import { PainelBloco } from "@/components/features/painel-tecnico-estrutura";
import { fmtMoeda } from "@/lib/monitoramento-format";
import {
  corDaContratacao,
  corDaFase,
} from "@/lib/monitoramento-painel-palette";

export function PainelSecaoComposicao({
  d,
  filtros,
  mostrarCompletude,
}: Pick<PropsSecaoPainel, "d" | "filtros"> & { mostrarCompletude: boolean }) {
  const { dados, analise, fases } = d;
  const alternarContratacao = (r: string) =>
    filtros.setTipoContratacao(filtros.tipoContratacao === r ? null : r);
  const alternarSituacao = (r: string) =>
    filtros.setSituacao(filtros.situacao === r ? null : r);
  const alternarUf = (uf: string) =>
    filtros.setUfComMunicipio(filtros.uf === uf ? null : uf);
  return (
    <PainelBloco id="composicao" titulo="Composição">
      <div className="grid gap-6 lg:grid-cols-2">
        <PainelCartao titulo="Tipo de contratação">
          <GraficoRosca
            fatias={analise.contratacoes.map((c) => ({
              rotulo: c.rotulo,
              valor: c.quantidade,
              cor: corDaContratacao(c.rotulo),
            }))}
            rotuloTotal="instrumentos"
            selecionada={filtros.tipoContratacao}
            onSelecionar={alternarContratacao}
          />
        </PainelCartao>
        <PainelCartao titulo="Investimento por contratação">
          <RankingBarras
            selecionado={filtros.tipoContratacao}
            onSelecionar={alternarContratacao}
            itens={dados.porTipo.map((t) => ({
              rotulo: t.rotulo,
              detalhe: `${t.comValor} de ${t.quantidade} com valor`,
              valor: t.valor,
              cor: corDaContratacao(t.rotulo),
              texto: t.comValor ? fmtMoeda(t.valor) : "—",
            }))}
          />
        </PainelCartao>
        <PainelCartao titulo="Valor global por situação">
          <RankingBarras
            limite={8}
            selecionado={filtros.situacao}
            onSelecionar={alternarSituacao}
            itens={fases
              .map((f) => ({
                rotulo: f,
                valor: dados.valoresPorFase.get(f) ?? 0,
              }))
              .filter((f) => f.valor > 0)
              .map((f) => ({
                ...f,
                cor: corDaFase(f.rotulo, fases),
                texto: fmtMoeda(f.valor),
              }))}
          />
        </PainelCartao>
        <PainelCartao
          titulo="Instrumentos por UF"
          apoio={`Top 5 concentram ${analise.concentracaoTop5Uf}%`}
          className="lg:row-span-2"
        >
          <RankingBarras
            limite={14}
            selecionado={filtros.uf}
            onSelecionar={alternarUf}
            itens={analise.ufs.map((u) => ({
              rotulo: u.rotulo,
              valor: u.quantidade,
            }))}
          />
        </PainelCartao>
        <PainelCartao titulo="Instrumentos por técnico titular">
          <RankingBarras
            limite={8}
            selecionado={filtros.responsavel}
            onSelecionar={(r) =>
              filtros.setResponsavel(filtros.responsavel === r ? null : r)
            }
            itens={dados.porTecnico.map((t) => ({
              chave:
                t.rotulo === "Não informado" ? "Sem responsável" : t.rotulo,
              rotulo: t.rotulo,
              valor: t.quantidade,
            }))}
          />
        </PainelCartao>
      </div>
      {mostrarCompletude && (
        <PainelGestaoCompletude
          total={d.total}
          semCnes={dados.semCnes}
          semCoordenadas={dados.semCoordenadas}
          semTecnico={dados.semTecnico}
          semAno={dados.semAno}
          comPagamentoDeterminado={
            dados.instrumentosComPagamento + dados.pagamentosManuaisConcluidos
          }
          cargasManuais={dados.cargasManuais}
        />
      )}
    </PainelBloco>
  );
}
