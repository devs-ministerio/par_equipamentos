import type { SingleSelectOption } from "@/components/common/single-select-filter";
import {
  decodificarSituacao,
  type OrigemSituacao,
} from "@/lib/situacao-relatorio";
import { nomePrioritarioCanonico } from "@/lib/equipamento-catalogo";
import { normalizarTexto } from "@/utils/texto";
import type { PropostaCandidata } from "@/services/propostas-candidatas";

/** Origens de Situação com efeito em cada visão; as demais não alteram o resultado nem o arquivo (D04). */
const ORIGENS_DA_VISAO: Record<string, OrigemSituacao[]> = {
  encerrados: ["instrumento", "proposta"],
  previsoes: ["monitoramento"],
  entregues: [],
};

const TODAS: OrigemSituacao[] = ["instrumento", "monitoramento", "proposta"];

export function origensDaVisao(encerramento: string | null): OrigemSituacao[] {
  return (encerramento && ORIGENS_DA_VISAO[encerramento]) || TODAS;
}

export function situacaoVale(
  situacao: string | null,
  encerramento: string | null,
): boolean {
  const escolhida = decodificarSituacao(situacao);
  return !escolhida || origensDaVisao(encerramento).includes(escolhida.origem);
}

export function opcoesSituacaoDaVisao(
  opcoes: SingleSelectOption[],
  encerramento: string | null,
): SingleSelectOption[] {
  const permitidas = origensDaVisao(encerramento);
  return opcoes.filter((o) => {
    const origem = decodificarSituacao(o.value)?.origem;
    return origem ? permitidas.includes(origem) : true;
  });
}

/** Acrescenta às opções os valores que só existem nas propostas, sem repetir os já listados. */
export function mesclarOpcoes(
  base: SingleSelectOption[],
  extras: Iterable<string>,
): SingleSelectOption[] {
  const existentes = new Set(base.map((o) => o.value));
  const novos = [...new Set(extras)]
    .filter((valor) => valor && !existentes.has(valor))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return [...base, ...novos.map((value) => ({ value, label: value }))];
}

/** Equipamento que a proposta financia (aquisição ou modernização), com o nome canônico do filtro. */
export function equipamentosFinanciados(p: PropostaCandidata): string[] {
  return p.equipamentos
    .filter((m) => m.relacao === "aquisicao" || m.relacao === "modernizacao")
    .map((m) => nomePrioritarioCanonico(m.nome) ?? m.nome);
}

export function propostaCombina(
  p: PropostaCandidata,
  {
    programa,
    equipamento,
  }: { programa: string | null; equipamento: string | null },
): boolean {
  if (programa && normalizarTexto(p.nm_programa) !== normalizarTexto(programa))
    return false;
  if (equipamento && !equipamentosFinanciados(p).includes(equipamento))
    return false;
  return true;
}
