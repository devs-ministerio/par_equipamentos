import { useEffect, useState } from "react";
import type { ClasseEquipamento } from "@/types/dados-oficiais";

export const TAMANHO_PAGINA_DADOS_OFICIAIS = 20;

export function useDadosOficiaisFiltros() {
  const [busca, setBusca] = useState("");
  const [uf, setUf] = useState<string | null>(null);
  const [municipio, setMunicipio] = useState<string | null>(null);
  const [cnes, setCnes] = useState<string | null>(null);
  const [equipamento, setEquipamento] = useState<string | null>(null);
  const [classeEquipamento, setClasseEquipamento] =
    useState<ClasseEquipamento>("prioritario");
  const [situacao, setSituacao] = useState<string | null>(null);
  const [anoInicio, setAnoInicio] = useState<string | null>(null);
  const [anoFim, setAnoFim] = useState<string | null>(null);
  const [programa, setPrograma] = useState<string | null>(null);
  const [tipoContratacao, setTipoContratacao] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);

  const limparFiltros = () => {
    setBusca("");
    setUf(null);
    setMunicipio(null);
    setCnes(null);
    setEquipamento(null);
    setClasseEquipamento("prioritario");
    setSituacao(null);
    setAnoInicio(null);
    setAnoFim(null);
    setPrograma(null);
    setTipoContratacao(null);
  };

  const hasFiltros = Boolean(
    busca.trim() ||
    uf ||
    municipio ||
    cnes ||
    equipamento ||
    classeEquipamento !== "prioritario" ||
    situacao ||
    anoInicio ||
    anoFim ||
    programa ||
    tipoContratacao,
  );

  useEffect(
    () => setPagina(1),
    [
      busca,
      uf,
      municipio,
      cnes,
      equipamento,
      classeEquipamento,
      situacao,
      anoInicio,
      anoFim,
      programa,
      tipoContratacao,
    ],
  );
  useEffect(() => setEquipamento(null), [classeEquipamento]);

  return {
    busca,
    setBusca,
    uf,
    setUf,
    municipio,
    setMunicipio,
    cnes,
    setCnes,
    equipamento,
    setEquipamento,
    classeEquipamento,
    setClasseEquipamento,
    situacao,
    setSituacao,
    anoInicio,
    setAnoInicio,
    anoFim,
    setAnoFim,
    programa,
    setPrograma,
    tipoContratacao,
    setTipoContratacao,
    pagina,
    setPagina,
    pageSize: TAMANHO_PAGINA_DADOS_OFICIAIS,
    hasFiltros,
    limparFiltros,
  };
}
