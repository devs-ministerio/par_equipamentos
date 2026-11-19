import { useQuery } from "@tanstack/react-query";
import { fetchLicencaOperacao } from "@/services/licenca-operacao";

export const licencaOperacaoKeys = {
  instrumento: (nr: string) =>
    ["monitoramento", "licenca-operacao", nr] as const,
};

export function useLicencaOperacao(nr: string) {
  return useQuery({
    queryKey: licencaOperacaoKeys.instrumento(nr),
    queryFn: () => fetchLicencaOperacao(nr),
  });
}
