import { UF_INFO } from "@/data/geo-reference";
import { municipiosDoInstrumento } from "@/lib/municipio-filtro";
import { capitalizarNome, normalizarTexto } from "@/utils/texto";
import type { ConvenioUnificado } from "@/types/monitoramento";
import type { FiltroRelatorio } from "@/services/relatorios";
import type { useRelatorioInstrumentosFiltros } from "@/hooks/use-relatorio-instrumentos-filtros";
import type { SituacaoDecodificada } from "@/lib/situacao-relatorio";

type Filtros = ReturnType<typeof useRelatorioInstrumentosFiltros>;

/** Escopo geográfico efetivo e filtro enviado ao backend na geração do arquivo. */
export function useRelatorioEscopo(
  filtros: Filtros,
  convenios: ConvenioUnificado[],
  situacaoEscolhida: SituacaoDecodificada | null,
) {
  const {
    encerramento,
    periodoPor,
    dataInicio,
    dataFim,
    uf,
    anoInicio,
    anoFim,
    programa,
    tipoContratacao,
    equipamento,
    municipio,
    cnes,
    nomeEstabelecimento,
  } = filtros;

  // O backend trata uf/município/CNES como uma hierarquia de escopo
  // mutuamente exclusiva (Brasil -> UF -> Município -> CNES), diferente
  // dos filtros combináveis desta página -- CNES já identifica um único
  // estabelecimento (mais específico), depois Município (exige UF junto),
  // depois UF, senão Brasil.
  //
  // Dois achados ao vivo 2026-09-26, "relatório gerado não responde a
  // todos os filtros selecionados":
  // 1. Selecionar só Município (sem UF) fazia `escopoGeracao` cair pra
  //    "brasil" -- a validação de `FiltroRelatorio` exige os dois juntos --
  //    e o arquivo baixava o Brasil inteiro, silenciosamente ignorando o
  //    município escolhido. UF agora é derivada do próprio item quando o
  //    usuário não a selecionou explicitamente.
  // 2. `Estabelecimento` nunca tinha campo próprio no backend -- resolvido
  //    pro CNES correspondente (1:1 na prática, mesmo dado de origem do
  //    dropdown) quando CNES não foi selecionado à parte.
  const municipioItens = municipio
    ? convenios.filter((item) =>
        municipiosDoInstrumento(item).some(
          (nome) => normalizarTexto(nome) === municipio,
        ),
      )
    : [];
  const ufsDoMunicipio = new Set(municipioItens.map((item) => item.uf));
  const municipioAmbiguo = Boolean(municipio && !uf && ufsDoMunicipio.size > 1);
  const municipioItem = municipioItens[0];
  const ufEfetiva = uf ?? municipioItem?.uf;
  const estabelecimentoItens =
    !cnes && nomeEstabelecimento
      ? convenios.filter(
          (item) =>
            normalizarTexto(item.cnesNomeEstabelecimento ?? "") ===
            nomeEstabelecimento,
        )
      : [];
  const cnesDoEstabelecimento = new Set(
    estabelecimentoItens.map((item) => item.cnes).filter(Boolean),
  );
  const estabelecimentoAmbiguo = Boolean(
    nomeEstabelecimento && !cnes && cnesDoEstabelecimento.size > 1,
  );
  const estabelecimentoItem = estabelecimentoItens[0];
  const cnesEfetivo = cnes ?? estabelecimentoItem?.cnes ?? undefined;

  const escopoGeracao = cnesEfetivo
    ? "cnes"
    : municipio && ufEfetiva
      ? "municipio"
      : ufEfetiva
        ? "uf"
        : "brasil";
  const resumoEscopo =
    escopoGeracao === "cnes"
      ? `CNES ${cnesEfetivo}`
      : escopoGeracao === "municipio"
        ? `${capitalizarNome(municipio ?? "")} / ${ufEfetiva}`
        : escopoGeracao === "uf"
          ? (UF_INFO[ufEfetiva ?? ""]?.nome ?? ufEfetiva ?? "")
          : "Brasil";
  const somenteEncerrados = encerramento === "encerrados";
  const somenteEntregues = encerramento === "entregues";
  // Período por data do evento (D02): conclusão em Concluídos, entrega em Equipamento entregue. Nas demais visões
  // o período continua sendo o ano do instrumento.
  const visaoPorEvento = somenteEncerrados || somenteEntregues;
  const porDataDoEvento = visaoPorEvento && periodoPor === "data_do_evento";
  const filtroGeracao: FiltroRelatorio = {
    escopo: escopoGeracao,
    uf:
      escopoGeracao === "uf" || escopoGeracao === "municipio"
        ? ufEfetiva
        : undefined,
    municipio:
      escopoGeracao === "municipio" ? (municipio ?? undefined) : undefined,
    cnes: escopoGeracao === "cnes" ? cnesEfetivo : undefined,
    anoInicio: anoInicio && !porDataDoEvento ? Number(anoInicio) : undefined,
    anoFim: anoFim && !porDataDoEvento ? Number(anoFim) : undefined,
    ...(porDataDoEvento
      ? {
          periodoPor: "data_do_evento" as const,
          dataInicio: dataInicio ?? undefined,
          dataFim: dataFim ?? undefined,
        }
      : {}),
    situacao: situacaoEscolhida?.valor,
    situacaoOrigem: situacaoEscolhida?.origem,
    programa: programa ?? undefined,
    tipoContratacao: tipoContratacao ?? undefined,
    equipamento: equipamento ?? undefined,
    encerramento: somenteEncerrados
      ? "encerrados"
      : somenteEntregues
        ? "entregues"
        : "todos",
  };

  return {
    filtroGeracao,
    resumoEscopo,
    municipioAmbiguo,
    estabelecimentoAmbiguo,
    somenteEncerrados,
    somenteEntregues,
    visaoPorEvento,
    porDataDoEvento,
  };
}
