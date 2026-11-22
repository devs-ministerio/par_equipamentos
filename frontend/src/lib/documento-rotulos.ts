import type { TipoDocumento } from "@/services/documentos-instrumento";

export const ROTULOS_DOCUMENTO: Record<TipoDocumento, string> = {
  nota_fiscal: "Nota fiscal",
  ordem_servico: "Ordem de serviço",
  trp: "TRP",
  trd: "TRD",
  cnen_scra: "SCRA (ANSN)",
  cnen_licenca: "Licença de operação (ANSN)",
};
