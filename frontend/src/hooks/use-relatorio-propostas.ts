import { useMemo } from "react";
import { usePropostasCandidatas } from "@/hooks/use-propostas-candidatas";
import { estagioDeFato } from "@/lib/proposta-status";
import { propostaCombina } from "@/lib/recorte-relatorio";
import { normalizarTexto } from "@/utils/texto";
import type { useRelatorioInstrumentosFiltros } from "@/hooks/use-relatorio-instrumentos-filtros";
import type { SituacaoDecodificada } from "@/lib/situacao-relatorio";

type Filtros = ReturnType<typeof useRelatorioInstrumentosFiltros>;

/** Propostas do relatório: recorte pelos mesmos filtros, separado em parcerias confirmadas e em tramitação. */
export function useRelatorioPropostas(
  filtros: Filtros,
  situacaoEscolhida: SituacaoDecodificada | null,
) {
  const {
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
  const origemSituacao = situacaoEscolhida?.origem ?? null;

  const {
    propostas,
    total: totalPropostasFonte,
    carregando: carregandoPropostas,
    erro: erroPropostas,
  } = usePropostasCandidatas();

  const propostasFiltradas = useMemo(
    () =>
      propostas.filter((p) => {
        if (
          origemSituacao === "instrumento" ||
          origemSituacao === "monitoramento"
        )
          return false;
        if (tipoContratacao && tipoContratacao !== p.tipo_contratacao)
          return false;
        if (
          situacaoEscolhida &&
          normalizarTexto(p.situacao_proposta ?? "") !==
            normalizarTexto(situacaoEscolhida.valor)
        )
          return false;
        if (uf && p.uf !== uf) return false;
        if (anoInicio || anoFim) {
          const anoProposta = Number(p.data_proposta?.slice(0, 4));
          if (!anoProposta) return false;
          if (anoInicio && anoProposta < Number(anoInicio)) return false;
          if (anoFim && anoProposta > Number(anoFim)) return false;
        }
        if (municipio && normalizarTexto(p.municipio ?? "") !== municipio)
          return false;
        if (cnes && p.cnes !== cnes) return false;
        if (!propostaCombina(p, { programa, equipamento })) return false;
        if (
          nomeEstabelecimento &&
          normalizarTexto(p.cnes_nome_estabelecimento ?? "") !==
            nomeEstabelecimento
        )
          return false;
        return true;
      }),
    [
      propostas,
      uf,
      anoInicio,
      anoFim,
      municipio,
      cnes,
      nomeEstabelecimento,
      origemSituacao,
      situacaoEscolhida,
      tipoContratacao,
      programa,
      equipamento,
    ],
  );
  const propostasConfirmadas = useMemo(
    () => propostasFiltradas.filter((p) => estagioDeFato(p) === "confirmada"),
    [propostasFiltradas],
  );
  const propostasEmTramitacao = useMemo(
    () => propostasFiltradas.filter((p) => estagioDeFato(p) === "tramitacao"),
    [propostasFiltradas],
  );

  return {
    propostas,
    totalPropostasFonte,
    carregandoPropostas,
    erroPropostas,
    propostasFiltradas,
    propostasConfirmadas,
    propostasEmTramitacao,
  };
}
