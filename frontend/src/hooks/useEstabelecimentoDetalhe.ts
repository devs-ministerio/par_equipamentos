import { useQuery } from "@tanstack/react-query";
import { fetchMunicipalityCoverage } from "@/services/api";
import type { NivelCoberturaRow } from "@/types/domain";

interface Alvo {
  cnes: string;
  municipio: string;
  uf: string;
}

type Status = "idle" | "carregando" | "sem-dado" | "erro" | "sucesso";

/**
 * Detalhe de cobertura do município de UM estabelecimento (botão de detalhe
 * da EstabelecimentoTable, mesmo modal de Cobertura Assistencial) -- o
 * estabelecimento em si não tem população/cobertura (isso é agregado por
 * município, não por CNES), então busca o município dele sob demanda só
 * quando o usuário pede (`alvo` não nulo), reaproveitando o
 * MunicipioDetalheModal inteiro (que já busca macro/região sozinho).
 * queryKey inclui o `cnes` clicado: pedir o detalhe de outro estabelecimento
 * enquanto o anterior ainda carrega é uma query nova e independente, então
 * a resposta do pedido anterior nunca sobrescreve a do mais recente.
 *
 * `status` distingue "sem dado de cobertura pra esse município" (resposta OK,
 * lista vazia) de "falha ao buscar" -- a UI mostra uma mensagem diferente
 * pra cada caso, igual o comportamento original.
 */
export function useEstabelecimentoDetalhe(
  equipmentFamily: string,
  alvo: Alvo | null,
) {
  const query = useQuery({
    queryKey: [
      "estabelecimento-detalhe-municipio",
      equipmentFamily,
      alvo?.cnes,
    ],
    queryFn: async (): Promise<NivelCoberturaRow | null> => {
      const rows = await fetchMunicipalityCoverage({
        equipmentFamily,
        municipalities: [`${alvo!.municipio}|${alvo!.uf}`],
      });
      return rows[0] ?? null;
    },
    enabled: alvo != null,
  });

  const status: Status = !alvo
    ? "idle"
    : query.isLoading
      ? "carregando"
      : query.isError
        ? "erro"
        : query.data == null
          ? "sem-dado"
          : "sucesso";

  return { detalhe: query.data ?? null, status };
}
