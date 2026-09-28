import { useState } from "react";

/** Filtros do relatório de Instrumentos e Repasse -- mesmo vocabulário de
 * "Instrumentos e repasses" (Dados Oficiais, `use-dados-oficiais-filtros.ts`),
 * só que sem `busca`/`classeEquipamento`/`soMonitorados`/`pagina` (busca
 * removida a pedido do usuário 2026-09-26; os demais não fazem sentido pra
 * prévia de relatório: filtro pensado pra recortar o que vai pro arquivo,
 * não pra paginar uma lista de UI). Estado único compartilhado entre a
 * tabela de prévia (client-side) e a geração do arquivo (`GET /relatorios`,
 * mesmos campos no backend).
 *
 * `municipio`/`cnes`/`nomeEstabelecimento` (pedido do usuário 2026-09-26)
 * são lista suspensa, mesmo modelo dos demais filtros (UF/situação/
 * programa/tipo) -- opções derivadas do dado real em
 * `monitoramento-relatorios-page.tsx`. Só `municipio`/`cnes` também vão
 * pro backend na geração (`nomeEstabelecimento`/`equipamento` não têm
 * campo próprio em `FiltroRelatorio`, ficam só na prévia). */
export function useRelatorioInstrumentosFiltros() {
  const [uf, setUf] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<string | null>(null);
  const [ano, setAno] = useState<string | null>(null);
  const [programa, setPrograma] = useState<string | null>(null);
  const [tipoContratacao, setTipoContratacao] = useState<string | null>(null);
  const [equipamento, setEquipamento] = useState<string | null>(null);
  const [municipio, setMunicipio] = useState<string | null>(null);
  const [cnes, setCnes] = useState<string | null>(null);
  const [nomeEstabelecimento, setNomeEstabelecimento] = useState<string | null>(
    null,
  );

  const limparFiltros = () => {
    setUf(null);
    setSituacao(null);
    setAno(null);
    setPrograma(null);
    setTipoContratacao(null);
    setEquipamento(null);
    setMunicipio(null);
    setCnes(null);
    setNomeEstabelecimento(null);
  };

  const hasFiltros = Boolean(
    uf ||
    situacao ||
    ano ||
    programa ||
    tipoContratacao ||
    equipamento ||
    municipio ||
    cnes ||
    nomeEstabelecimento,
  );

  return {
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
    equipamento,
    setEquipamento,
    municipio,
    setMunicipio,
    cnes,
    setCnes,
    nomeEstabelecimento,
    setNomeEstabelecimento,
    hasFiltros,
    limparFiltros,
  };
}
