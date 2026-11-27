import { useMemo, useState } from "react";
import { usePropostasOpcoes } from "./use-propostas-opcoes";
import { estagioDeFato, situacaoDeFato } from "@/lib/proposta-status";
import {
  agruparPorSituacao,
  contarTipos,
  filtrarManuais,
} from "@/lib/propostas-agrupamento";
import { correspondeBuscaLivre } from "@/lib/busca-livre";
import type { usePropostasCandidatas } from "@/hooks/use-propostas-candidatas";
import type { instrumentosManuaisFinanciamento } from "@/lib/financiamento-manual";

type Proposta = ReturnType<typeof usePropostasCandidatas>["propostas"][number];
type Manual = ReturnType<typeof instrumentosManuaisFinanciamento>[number];

/** Estado, opções e recorte dos filtros de Linhas de financiamento (propostas e cadastros manuais). */
export function usePropostasFiltros(propostas: Proposta[], manuais: Manual[]) {
  const [uf, setUf] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [cnes, setCnes] = useState<string[]>([]);
  const [municipio, setMunicipio] = useState<string[]>([]);
  const [equipamento, setEquipamento] = useState<string[]>([]);
  const [situacao, setSituacao] = useState<string[]>([]);
  const [anoInicio, setAnoInicio] = useState<string | null>(null);
  const [anoFim, setAnoFim] = useState<string | null>(null);
  const [programa, setPrograma] = useState<string[]>([]);
  const [estagio, setEstagio] = useState<string[]>([]);
  const [tipo, setTipo] = useState<string | null>(null);

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
    setEstagio([]);
    setTipo(null);
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
    programa.length > 0 ||
    estagio.length > 0 ||
    tipo !== null,
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
      if (estagio.length > 0 && !estagio.includes(estagioDeFato(p)))
        return false;
      if (tipo && p.tipo_contratacao !== tipo) return false;
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
    estagio,
    tipo,
    equipamentosPorProposta,
  ]);

  // Manuais só têm os campos comuns: filtro de dado da proposta os exclui.
  const manuaisFiltrados = useMemo(
    () =>
      filtrarManuais(manuais, {
        busca,
        tipo,
        uf,
        cnes,
        municipio,
        exclui:
          equipamento.length > 0 ||
          situacao.length > 0 ||
          !!anoInicio ||
          !!anoFim ||
          programa.length > 0 ||
          (estagio.length > 0 && !estagio.includes("confirmada")),
      }),
    [
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
      estagio,
      tipo,
    ],
  );

  const gruposPorSituacao = useMemo(
    () => agruparPorSituacao(filtradas),
    [filtradas],
  );

  const tipos = useMemo(
    () => contarTipos([...propostas, ...manuais]),
    [propostas, manuais],
  );

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
    estagio,
    setEstagio,
    tipo,
    setTipo,
    tipos,
    total: propostas.length + manuais.length,
    hasFiltros,
    limparFiltros,
    filtradas,
    manuaisFiltrados,
    gruposPorSituacao,
    opcoes,
  };
}

export type PropostasFiltros = ReturnType<typeof usePropostasFiltros>;
