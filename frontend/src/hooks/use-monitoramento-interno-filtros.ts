import { useEffect, useMemo, useState } from "react";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";
import { nomePrioritarioCanonico } from "@/lib/equipamento-catalogo";
import type { ClasseEquipamento } from "@/types/dados-oficiais";
import { capitalizarNome, normalizarTexto } from "@/utils/texto";

type OpcaoFiltro = { value: string; label: string };
export type ClasseEquipamentoFiltro = ClasseEquipamento | "todos";
export type InstrumentoMonitoramentoFiltravel = Pick<
  InstrumentoEquipamento,
  | "nr_convenio"
  | "cnes"
  | "nome_convenente"
  | "municipio"
  | "uf"
  | "tipo_contratacao"
  | "fase_atual"
  | "situacao_prestacao_contas"
  | "tecnico_titular"
> &
  Partial<
    Pick<
      InstrumentoEquipamento,
      "equipamento_descricao" | "programa" | "ano_instrumento"
    >
  >;

function opcoes(
  instrumentos: InstrumentoMonitoramentoFiltravel[],
  valor: (instrumento: InstrumentoMonitoramentoFiltravel) => string,
): OpcaoFiltro[] {
  return [...new Set(instrumentos.map(valor))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((value) => ({ value, label: value }));
}

function opcoesMunicipio(
  instrumentos: InstrumentoMonitoramentoFiltravel[],
): OpcaoFiltro[] {
  const municipios = new Map<string, string>();
  for (const instrumento of instrumentos) {
    if (!instrumento.municipio) continue;
    const chave = normalizarTexto(instrumento.municipio);
    // A chave é estável para filtro; o rótulo evita variantes de caixa na UI.
    municipios.set(chave, capitalizarNome(instrumento.municipio));
  }
  return [...municipios.entries()]
    .sort(([, nomeA], [, nomeB]) => nomeA.localeCompare(nomeB, "pt-BR"))
    .map(([value, label]) => ({ value, label }));
}

function chaveEquipamento(descricao: string | null | undefined): string {
  if (!descricao) return "nao informado";
  return nomePrioritarioCanonico(descricao) ?? normalizarTexto(descricao);
}

function opcoesEquipamento(
  instrumentos: InstrumentoMonitoramentoFiltravel[],
  classeEquipamento: ClasseEquipamentoFiltro,
): OpcaoFiltro[] {
  const equipamentos = new Map<string, string>();
  for (const instrumento of instrumentos) {
    const descricao = instrumento.equipamento_descricao;
    if (!descricao) continue;
    const prioritario = nomePrioritarioCanonico(descricao) !== null;
    if (
      classeEquipamento !== "todos" &&
      (classeEquipamento === "prioritario") !== prioritario
    )
      continue;
    const chave = chaveEquipamento(descricao);
    equipamentos.set(
      chave,
      nomePrioritarioCanonico(descricao) ?? capitalizarNome(descricao),
    );
  }
  return [...equipamentos.entries()]
    .sort(([, nomeA], [, nomeB]) => nomeA.localeCompare(nomeB, "pt-BR"))
    .map(([value, label]) => ({ value, label }));
}

/** Filtros locais das visões de monitoramento. A fonte é a mesma lista de
 * instrumentos usada pela mesa e pelo painel; não mistura dados internos
 * com os cálculos de cobertura. */
export function useMonitoramentoInternoFiltros<
  T extends InstrumentoMonitoramentoFiltravel,
>(instrumentos: T[]) {
  const [tipoContratacao, setTipoContratacao] = useState<string | null>(null);
  const [cnes, setCnes] = useState<string | null>(null);
  const [uf, setUf] = useState<string | null>(null);
  const [municipio, setMunicipio] = useState<string | null>(null);
  const [classeEquipamento, setClasseEquipamento] =
    useState<ClasseEquipamentoFiltro>("todos");
  const [equipamento, setEquipamento] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<string | null>(null);
  const [programa, setPrograma] = useState<string | null>(null);
  const [anoInicio, setAnoInicio] = useState<string | null>(null);
  const [anoFim, setAnoFim] = useState<string | null>(null);
  useEffect(() => setEquipamento(null), [classeEquipamento]);

  const filtrados = useMemo(
    () =>
      instrumentos.filter((instrumento) => {
        if (
          tipoContratacao &&
          (instrumento.tipo_contratacao ?? "Convênio") !== tipoContratacao
        )
          return false;
        if (cnes && instrumento.cnes !== cnes) return false;
        if (uf && instrumento.uf !== uf) return false;
        if (
          municipio &&
          normalizarTexto(instrumento.municipio ?? "") !== municipio
        )
          return false;
        if (
          equipamento &&
          chaveEquipamento(instrumento.equipamento_descricao) !== equipamento
        )
          return false;
        if (situacao && (instrumento.fase_atual ?? "Não iniciado") !== situacao)
          return false;
        if (programa && (instrumento.programa ?? "Não informado") !== programa)
          return false;
        if (
          anoInicio &&
          (instrumento.ano_instrumento == null ||
            instrumento.ano_instrumento < Number(anoInicio))
        )
          return false;
        if (
          anoFim &&
          (instrumento.ano_instrumento == null ||
            instrumento.ano_instrumento > Number(anoFim))
        )
          return false;
        return true;
      }),
    [
      instrumentos,
      tipoContratacao,
      cnes,
      uf,
      municipio,
      equipamento,
      situacao,
      programa,
      anoInicio,
      anoFim,
    ],
  );

  const limparFiltros = () => {
    setTipoContratacao(null);
    setCnes(null);
    setUf(null);
    setMunicipio(null);
    setClasseEquipamento("todos");
    setEquipamento(null);
    setSituacao(null);
    setPrograma(null);
    setAnoInicio(null);
    setAnoFim(null);
  };

  return {
    filtrados,
    total: instrumentos.length,
    tipoContratacao,
    setTipoContratacao,
    cnes,
    setCnes,
    uf,
    setUf,
    municipio,
    setMunicipio,
    classeEquipamento,
    setClasseEquipamento,
    equipamento,
    setEquipamento,
    situacao,
    setSituacao,
    programa,
    setPrograma,
    anoInicio,
    setAnoInicio,
    anoFim,
    setAnoFim,
    hasFiltros: Boolean(
      tipoContratacao ||
      cnes ||
      uf ||
      municipio ||
      equipamento ||
      situacao ||
      programa ||
      anoInicio ||
      anoFim,
    ),
    limparFiltros,
    tipoContratacaoOptions: opcoes(
      instrumentos,
      (item) => item.tipo_contratacao ?? "Convênio",
    ),
    cnesOptions: opcoes(
      instrumentos.filter((item) => item.cnes),
      (item) => item.cnes!,
    ),
    ufOptions: opcoes(
      instrumentos.filter((item) => item.uf),
      (item) => item.uf!,
    ),
    municipioOptions: opcoesMunicipio(instrumentos),
    equipamentoOptions: opcoesEquipamento(instrumentos, classeEquipamento),
    situacaoOptions: opcoes(
      instrumentos,
      (item) => item.fase_atual ?? "Não iniciado",
    ),
    programaOptions: opcoes(
      instrumentos,
      (item) => item.programa ?? "Não informado",
    ),
    anoOptions: [
      ...new Set(
        instrumentos
          .map((item) => item.ano_instrumento)
          .filter((ano): ano is number => ano != null),
      ),
    ]
      .sort((a, b) => b - a)
      .map((ano) => ({ value: String(ano), label: String(ano) })),
  };
}

export type FiltrosMonitoramentoInterno = ReturnType<
  typeof useMonitoramentoInternoFiltros
>;
