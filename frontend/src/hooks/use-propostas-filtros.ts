import { useMemo, useState } from "react";
import { usePropostasOpcoes } from "./use-propostas-opcoes";
import {
  ORDEM_SITUACAO_POR_ESTAGIO,
  situacaoDeFato,
  type EstagioProposta,
} from "@/lib/proposta-status";
import { correspondeBuscaLivre } from "@/lib/busca-livre";
import type { usePropostasCandidatas } from "@/hooks/use-propostas-candidatas";
import type { instrumentosManuaisFinanciamento } from "@/lib/financiamento-manual";

type Proposta = ReturnType<typeof usePropostasCandidatas>["propostas"][number];
type Manual = ReturnType<typeof instrumentosManuaisFinanciamento>[number];

/** Estado, opções e recorte dos filtros de Linhas de financiamento (propostas e cadastros manuais). */
export function usePropostasFiltros(
  propostas: Proposta[],
  manuais: Manual[],
  modo: EstagioProposta,
) {
  const [uf, setUf] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [cnes, setCnes] = useState<string[]>([]);
  const [municipio, setMunicipio] = useState<string[]>([]);
  const [equipamento, setEquipamento] = useState<string[]>([]);
  const [situacao, setSituacao] = useState<string[]>([]);
  const [anoInicio, setAnoInicio] = useState<string | null>(null);
  const [anoFim, setAnoFim] = useState<string | null>(null);
  const [programa, setPrograma] = useState<string[]>([]);

  const limparFiltros = () => {
    setBusca("");
    setUf([]);
    setCnes([]);
    setMunicipio([]);
    setEquipamento([]);
    setSituacao([]);
    setAnoInicio(null);
    setAnoFim(null);
    setPrograma([]);
  };

  const hasFiltros = Boolean(
    busca.trim() ||
    uf.length > 0 ||
    cnes.length > 0 ||
    municipio.length > 0 ||
    equipamento.length > 0 ||
    situacao.length > 0 ||
    anoInicio ||
    anoFim ||
    programa.length > 0,
  );

  const { equipamentosPorProposta, opcoes } = usePropostasOpcoes(
    propostas,
    manuais,
  );

  const filtradas = useMemo(() => {
    return propostas.filter((p) => {
      if (
        !correspondeBuscaLivre(busca, [
          p.cd_parceria,
          p.id_proposta,
          p.nm_proponente,
          p.cnpj_ente_recebedor,
          p.cnes,
          p.cnes_nome_estabelecimento,
          p.municipio,
          p.uf,
          p.ds_objeto,
          p.nm_programa,
          situacaoDeFato(p),
          p.equipamentos.map((item) => item.nome).join(" "),
        ])
      )
        return false;
      if (uf.length > 0 && !uf.includes(p.uf ?? "")) return false;
      if (cnes.length > 0 && !cnes.includes(p.cnes ?? "")) return false;
      if (municipio.length > 0 && !municipio.includes(p.municipio ?? ""))
        return false;
      if (
        equipamento.length > 0 &&
        !equipamentosPorProposta
          .get(p.id)
          ?.some((nome) => equipamento.includes(nome))
      )
        return false;
      if (situacao.length > 0 && !situacao.includes(situacaoDeFato(p) ?? ""))
        return false;
      const anoDaProposta = Number(p.data_proposta?.slice(0, 4));
      if (anoInicio && (!anoDaProposta || anoDaProposta < Number(anoInicio)))
        return false;
      if (anoFim && (!anoDaProposta || anoDaProposta > Number(anoFim)))
        return false;
      if (programa.length > 0 && !programa.includes(String(p.id_programa)))
        return false;
      return true;
    });
  }, [
    propostas,
    busca,
    uf,
    cnes,
    municipio,
    equipamento,
    situacao,
    anoInicio,
    anoFim,
    programa,
    equipamentosPorProposta,
  ]);

  // Os cadastros manuais só têm os campos comuns; qualquer filtro que
  // dependa de dado da proposta os deixa de fora.
  const manuaisFiltrados = useMemo(() => {
    if (
      equipamento.length > 0 ||
      situacao.length > 0 ||
      anoInicio ||
      anoFim ||
      programa.length > 0
    )
      return [];
    return manuais.filter((i) => {
      if (
        !correspondeBuscaLivre(busca, [
          i.nr_convenio,
          i.nome_convenente,
          i.cnes,
          i.municipio,
          i.uf,
          i.tipo_contratacao,
        ])
      )
        return false;
      if (uf.length > 0 && !uf.includes(i.uf ?? "")) return false;
      if (cnes.length > 0 && !cnes.includes(i.cnes ?? "")) return false;
      if (municipio.length > 0 && !municipio.includes(i.municipio ?? ""))
        return false;
      return true;
    });
  }, [
    manuais,
    busca,
    uf,
    cnes,
    municipio,
    equipamento,
    situacao,
    anoInicio,
    anoFim,
    programa,
  ]);

  // Sub-agrupado por situação de fato numa ordem fixa de funil do estágio
  // atual (mais avançado primeiro, ver ORDEM_SITUACAO_POR_ESTAGIO em
  // lib/proposta-status.ts); situação fora da ordem conhecida (vocabulário
  // livre da API) aparece depois, na ordem em que a agregação encontrar.
  const gruposPorSituacao = useMemo(() => {
    const porSituacao = new Map<string, typeof filtradas>();
    for (const p of filtradas) {
      const sit = situacaoDeFato(p) ?? "Sem situação informada";
      const lista = porSituacao.get(sit) ?? [];
      lista.push(p);
      porSituacao.set(sit, lista);
    }
    const ordem = ORDEM_SITUACAO_POR_ESTAGIO[modo];
    const situacoes = [...porSituacao.keys()].sort((a, b) => {
      const ia = ordem.indexOf(a),
        ib = ordem.indexOf(b);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return situacoes.map((sit) => ({ sit, itens: porSituacao.get(sit)! }));
  }, [filtradas, modo]);

  return {
    busca,
    setBusca,
    uf,
    setUf,
    cnes,
    setCnes,
    municipio,
    setMunicipio,
    equipamento,
    setEquipamento,
    situacao,
    setSituacao,
    anoInicio,
    setAnoInicio,
    anoFim,
    setAnoFim,
    programa,
    setPrograma,
    hasFiltros,
    limparFiltros,
    filtradas,
    manuaisFiltrados,
    gruposPorSituacao,
    opcoes,
  };
}

export type PropostasFiltros = ReturnType<typeof usePropostasFiltros>;
