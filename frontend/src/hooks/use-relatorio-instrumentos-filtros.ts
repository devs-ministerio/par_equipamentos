import { useState } from "react";

/** Filtros do relatório de Instrumentos e Repasse -- mesmo vocabulário de
 * "Instrumentos e repasses" (Dados Oficiais, `use-dados-oficiais-filtros.ts`),
 * só que sem `equipamento`/`classeEquipamento`/`soMonitorados`/`pagina`
 * (não fazem sentido pra prévia de relatório: filtro pensado pra recortar o
 * que vai pro arquivo, não pra paginar uma lista de UI). Estado único
 * compartilhado entre a tabela de prévia (client-side) e a geração do
 * arquivo (`GET /relatorios`, mesmos campos no backend). */
export function useRelatorioInstrumentosFiltros() {
  const [busca, setBusca] = useState("");
  const [uf, setUf] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<string | null>(null);
  const [ano, setAno] = useState<string | null>(null);
  const [programa, setPrograma] = useState<string | null>(null);
  const [tipoContratacao, setTipoContratacao] = useState<string | null>(null);

  const limparFiltros = () => {
    setBusca("");
    setUf(null);
    setSituacao(null);
    setAno(null);
    setPrograma(null);
    setTipoContratacao(null);
  };

  const hasFiltros = Boolean(
    busca || uf || situacao || ano || programa || tipoContratacao,
  );

  return {
    busca,
    setBusca,
    uf,
    setUf,
    situacao,
    setSituacao,
    ano,
    setAno,
    programa,
    setPrograma,
    tipoContratacao,
    setTipoContratacao,
    hasFiltros,
    limparFiltros,
  };
}
