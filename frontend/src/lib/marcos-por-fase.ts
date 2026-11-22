/** Em que fase do acompanhamento cada marco do cronograma pode ser lançado.
 * Espelha `backend/app/services/marcos_por_fase.py` (o backend também recusa com 422). */
import {
  FASES_ACOMPANHAMENTO,
  type FaseAcompanhamento,
} from "@/lib/fases-acompanhamento";

const AQUISICAO = [
  "cronograma_inicio_fabricacao",
  "cronograma_fabricacao_concluida",
  "cronograma_chegada_porto",
  "cronograma_desembaraco_aduaneiro",
];
const OBRA = [
  "cronograma_obra_inicio",
  "cronograma_infraestrutura_pronta",
  "cronograma_obra_fim",
];
const POS_ENTREGA = [
  "cronograma_instalacao_inicio",
  "cronograma_instalacao_fim",
  "cronograma_comissionamento",
  "cronograma_treinamento",
  "cronograma_inicio_operacao",
];

const JANELAS = new Map<string, [FaseAcompanhamento, FaseAcompanhamento]>([
  ...AQUISICAO.map(
    (c) =>
      [c, ["Valor repassado", "Em aquisição"]] as [
        string,
        [FaseAcompanhamento, FaseAcompanhamento],
      ],
  ),
  ...OBRA.map(
    (c) =>
      [c, ["Acompanhamento iniciado", "Equipamento entregue"]] as [
        string,
        [FaseAcompanhamento, FaseAcompanhamento],
      ],
  ),
  ...POS_ENTREGA.map(
    (c) =>
      [c, ["Equipamento entregue", "Pós-entrega"]] as [
        string,
        [FaseAcompanhamento, FaseAcompanhamento],
      ],
  ),
]);

const posicao = (f: string) => FASES_ACOMPANHAMENTO.findIndex((x) => x === f);

/** Texto curto do que falta, ou null se o marco está disponível (ou a fase é desconhecida). */
export function avisoMarcoIndisponivel(
  codigo: string,
  fase: string | null | undefined,
): string | null {
  const janela = JANELAS.get(codigo);
  if (!janela || !fase || posicao(fase) < 0) return null;
  const p = posicao(fase);
  if (p >= posicao(janela[0]) && p <= posicao(janela[1])) return null;
  if (fase === "Concluído") return "acompanhamento concluído";
  if (p < posicao(janela[0]))
    return janela[0] === "Equipamento entregue"
      ? "disponível após a entrega"
      : "disponível após o repasse";
  return "não se lança mais nesta fase";
}
