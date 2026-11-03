import { z } from "zod";
import { requisitar } from "@/lib/http-client";
import type { FiltroRelatorio } from "@/services/relatorios";

const registroSchema = z.object({
  instrumento: z.string(),
  convenente: z.string(),
  tipo: z.string(),
  uf: z.string().nullable(),
  municipio: z.string().nullable(),
  fase_atual: z.string(),
  situacao: z.string(),
  categoria: z.string(),
  data_conclusao: z.string().nullable(),
  inauguracao_real: z.string().nullable(),
  previsao_inauguracao: z.string().nullable(),
  dias_ate_previsao: z.number().int().nullable(),
});
const contagemSchema = z.object({
  codigo: z.string(),
  rotulo: z.string(),
  quantidade: z.number().int().nonnegative(),
});
const previaSchema = z.object({
  total: z.number().int().nonnegative(),
  pagina: z.number().int().positive(),
  limite: z.number().int().positive(),
  itens: z.array(registroSchema),
  contagens: z.array(contagemSchema),
});
export type RegistroPrevisao = z.infer<typeof registroSchema>;
export type ContagemSituacao = z.infer<typeof contagemSchema>;

export function consultarPrevisoes(
  filtro: FiltroRelatorio,
  pagina: number,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    escopo: filtro.escopo,
    pagina: String(pagina),
    limite: "20",
  });
  const campos = {
    uf: filtro.uf,
    regiao: filtro.regiao,
    municipio: filtro.municipio,
    cnes: filtro.cnes,
    ano_inicio: filtro.anoInicio,
    ano_fim: filtro.anoFim,
    situacao: filtro.situacao,
    situacao_origem: filtro.situacaoOrigem,
    programa: filtro.programa,
    tipo_contratacao: filtro.tipoContratacao,
    equipamento: filtro.equipamento,
    busca: filtro.busca,
    situacao_conclusao: filtro.situacaoConclusao,
  };
  for (const [campo, valor] of Object.entries(campos))
    if (valor !== undefined) params.set(campo, String(valor));
  return requisitar(`/relatorios/previsoes?${params}`, previaSchema, {
    signal,
  });
}
