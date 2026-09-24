import { useMemo } from "react";
import {
  nomePrioritarioCanonico,
  resumirEquipamentoNaoPrioritario,
} from "@/lib/equipamento-catalogo";
import type { ConvenioUnificado } from "@/types/monitoramento";
import type {
  ClasseEquipamento,
  FiltroDadosOficiais,
} from "@/types/dados-oficiais";

type OpcaoFiltro = { value: string; label: string };

type UseDadosOficiaisOpcoesParams = {
  classeEquipamento: ClasseEquipamento;
  filtrar: (ignorar: FiltroDadosOficiais) => ConvenioUnificado[];
  situacaoExibida: (item: ConvenioUnificado) => string | null;
};

function opcoesComContagem(
  itens: ConvenioUnificado[],
  valor: (item: ConvenioUnificado) => string | null,
  ordenarPorFrequencia = true,
): OpcaoFiltro[] {
  const contagem = new Map<string, number>();

  for (const item of itens) {
    const chave = valor(item);
    if (chave) contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }

  return [...contagem.entries()]
    .sort(
      ordenarPorFrequencia
        ? ([nomeA, totalA], [nomeB, totalB]) =>
            totalB - totalA || nomeA.localeCompare(nomeB, "pt-BR")
        : ([nomeA], [nomeB]) => nomeA.localeCompare(nomeB, "pt-BR"),
    )
    .map(([value, total]) => ({ value, label: `${value} (${total})` }));
}

/**
 * Deriva as opções em cascata dos filtros de Dados Oficiais. Cada seletor
 * ignora apenas seu próprio critério para que uma seleção nunca elimine a
 * opção necessária para desfazê-la.
 */
export function useDadosOficiaisOpcoes({
  classeEquipamento,
  filtrar,
  situacaoExibida,
}: UseDadosOficiaisOpcoesParams) {
  const ufs = useMemo(
    () =>
      [...new Set(filtrar("uf").map((item) => item.uf))]
        .filter(Boolean)
        .sort()
        .map((value) => ({ value, label: value })),
    [filtrar],
  );

  const equipamentoOptions = useMemo(() => {
    const contagem = new Map<string, number>();

    for (const convenio of filtrar("equipamento")) {
      const nomesDoConvenio = new Set<string>();

      for (const item of convenio.equipamentos) {
        const nomePrioritario = nomePrioritarioCanonico(item.nome);
        const prioritario = item.prioritario || nomePrioritario !== null;
        if ((classeEquipamento === "prioritario") !== prioritario) continue;
        nomesDoConvenio.add(nomePrioritario ?? item.nome);
      }

      for (const nome of nomesDoConvenio) {
        contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
      }
    }

    return [...contagem.entries()]
      .sort(([nomeA], [nomeB]) => nomeA.localeCompare(nomeB, "pt-BR"))
      .map(([value, total]) => ({
        value,
        label: `${classeEquipamento === "outro" ? resumirEquipamentoNaoPrioritario(value) : value} (${total})`,
      }));
  }, [classeEquipamento, filtrar]);

  const anoOptions = useMemo(() => {
    const anos = new Set<string>();
    for (const convenio of filtrar("ano")) {
      const ano = convenio.numeroInstrumento?.split("/")[1];
      if (ano) anos.add(ano);
    }
    return [...anos]
      .sort()
      .reverse()
      .map((value) => ({ value, label: value }));
  }, [filtrar]);

  const situacaoOptions = useMemo(
    () => opcoesComContagem(filtrar("situacao"), situacaoExibida),
    [filtrar, situacaoExibida],
  );

  const tipoContratacaoOptions = useMemo(
    () =>
      opcoesComContagem(
        filtrar("tipo"),
        (item) => item.tipoContratacao ?? "Convênio",
      ),
    [filtrar],
  );

  const programaOptions = useMemo(
    () => opcoesComContagem(filtrar("programa"), (item) => item.programa),
    [filtrar],
  );

  return {
    ufs,
    equipamentoOptions,
    anoOptions,
    situacaoOptions,
    tipoContratacaoOptions,
    programaOptions,
  };
}
