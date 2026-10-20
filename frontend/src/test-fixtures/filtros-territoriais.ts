import type { FacilityOption } from "@/services/api";
import type { CoberturaRow, Macrorregiao } from "@/types/domain";

function criarMacro(
  id: string,
  uf: string,
  regiao: Macrorregiao["regiao"],
): Macrorregiao {
  return {
    id,
    nome: `Macro sintética ${id}`,
    uf,
    regiao,
    nomeEstado: `Estado de teste ${uf}`,
    pop: 100,
    popResidente: 120,
    popAns: 20,
  };
}

function criarFacility(
  cnes: string,
  macro: Macrorregiao,
  regiaoSaudeId: string,
  cidade: string,
): FacilityOption {
  return {
    cnes,
    nome: `Unidade sintética ${cnes}`,
    uf: macro.uf,
    macroId: macro.id,
    macroNome: macro.nome,
    regiaoSaudeId,
    regiaoSaudeNome: `Região sintética ${regiaoSaudeId}`,
    municipioChave: `${cidade}|${macro.uf}`,
  };
}

export function criarBaseTerritorial() {
  const macros = [
    criarMacro("QBA1", "BA", "Nordeste"),
    criarMacro("QBA2", "BA", "Nordeste"),
    criarMacro("QPE", "PE", "Nordeste"),
    criarMacro("QSP", "SP", "Sudeste"),
  ];
  // Sentinelas persistidas: o teste seleciona linhas, não recalcula indicadores.
  const coberturaRows: CoberturaRow[] = [
    ...macros.map((m) => m.id),
    "ORFA",
  ].map((macroId) => ({
    macroId,
    oferta: 3,
    ofertaTotal: 999,
    demanda: 7,
    cobertura: 43,
    status: "Dados indisponíveis",
  }));
  const facilities: FacilityOption[] = [
    criarFacility("0000001", macros[0], "RS1", "Cidade Um"),
    criarFacility("0000002", macros[0], "RS1", "Cidade Um"),
    criarFacility("0000003", macros[1], "RS2", "Cidade Dois"),
    criarFacility("0000004", macros[2], "RS3", "Cidade Três"),
    criarFacility("0000005", macros[3], "RS4", "Cidade Quatro"),
    {
      cnes: "0000006",
      nome: "Unidade sem vínculo territorial",
      uf: "BA",
      macroId: null,
      macroNome: null,
      regiaoSaudeId: null,
      regiaoSaudeNome: null,
      municipioChave: null,
    },
  ];
  return { macros, coberturaRows, facilities };
}
