import { correspondeBuscaLivre } from "./busca-livre";
import { ORDEM_SITUACAO_POR_ESTAGIO, situacaoDeFato } from "./proposta-status";

type ComSituacao = Parameters<typeof situacaoDeFato>[0];

/**
 * Sub-agrupado por situação de fato numa ordem fixa de funil do estágio
 * atual (mais avançado primeiro, ver ORDEM_SITUACAO_POR_ESTAGIO em
 * lib/proposta-status.ts); situação fora da ordem conhecida (vocabulário
 * livre da API) aparece depois, na ordem em que a agregação encontrar.
 */
export function agruparPorSituacao<T extends ComSituacao>(filtradas: T[]) {
  const porSituacao = new Map<string, T[]>();
  for (const p of filtradas) {
    const sit = situacaoDeFato(p) ?? "Sem situação informada";
    const lista = porSituacao.get(sit) ?? [];
    lista.push(p);
    porSituacao.set(sit, lista);
  }
  const ordem = [
    ...new Set([
      ...ORDEM_SITUACAO_POR_ESTAGIO.confirmada,
      ...ORDEM_SITUACAO_POR_ESTAGIO.tramitacao,
    ]),
  ];
  const situacoes = [...porSituacao.keys()].sort((a, b) => {
    const ia = ordem.indexOf(a),
      ib = ordem.indexOf(b);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return situacoes.map((sit) => ({ sit, itens: porSituacao.get(sit)! }));
}

/** Tipos de contratação presentes, em ordem alfabética, com a contagem de cada um. */
export function contarTipos(itens: { tipo_contratacao?: string | null }[]) {
  const contagem = new Map<string, number>();
  for (const item of itens) {
    const t = item.tipo_contratacao;
    if (t) contagem.set(t, (contagem.get(t) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
    .map(([valor, total]) => ({ valor, total }));
}

interface FiltroManuais {
  busca: string;
  tipo: string | null;
  uf: string[];
  cnes: string[];
  municipio: string[];
  /** Algum filtro que só existe na proposta está ativo: nenhum manual passa. */
  exclui: boolean;
}

/** Cadastros manuais só têm os campos comuns (busca, tipo, UF, CNES, município). */
export function filtrarManuais<
  M extends {
    nr_convenio: string;
    nome_convenente?: string | null;
    cnes?: string | null;
    municipio?: string | null;
    uf?: string | null;
    tipo_contratacao?: string | null;
  },
>(manuais: M[], f: FiltroManuais): M[] {
  if (f.exclui) return [];
  return manuais.filter((i) => {
    if (
      !correspondeBuscaLivre(f.busca, [
        i.nr_convenio,
        i.nome_convenente,
        i.cnes,
        i.municipio,
        i.uf,
        i.tipo_contratacao,
      ])
    )
      return false;
    if (f.tipo && i.tipo_contratacao !== f.tipo) return false;
    if (f.uf.length > 0 && !f.uf.includes(i.uf ?? "")) return false;
    if (f.cnes.length > 0 && !f.cnes.includes(i.cnes ?? "")) return false;
    if (f.municipio.length > 0 && !f.municipio.includes(i.municipio ?? ""))
      return false;
    return true;
  });
}
