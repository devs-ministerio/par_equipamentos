import { equipamentosFinanciados } from "@/lib/recorte-relatorio";
import { situacaoDeFato } from "@/lib/proposta-status";
import { capitalizarNome } from "@/utils/texto";
import type { PropostaCandidata } from "@/services/propostas-candidatas";
import type { ConvenioUnificado } from "@/types/monitoramento";

/** Uma linha do relatório, no formato dos Firmados (Número, CNES, Convenente,
 *  Município/UF, Equipamento, Situação, Monitoramento, Ano, Valor global),
 *  venha de um convênio/FAF/TED firmado ou de uma proposta do TransfereGov. */
export type GrupoLinha = "Instrumento" | "Confirmada" | "Proposta";

export interface LinhaRelatorio {
  chave: string;
  grupo: GrupoLinha;
  tipo: string | null;
  numero: string;
  cnes: string | null;
  /** Nome do estabelecimento (CNES); sem ele, o nome do convenente/proponente. */
  estabelecimento: string;
  municipio: string | null;
  uf: string | null;
  equipamentos: string[];
  situacao: string | null;
  /** Fase do monitoramento interno; ausente quando o instrumento não é monitorado. */
  monitoramento: string | null;
  ano: string | null;
  valor: number | null;
}

export type FasesMonitoramento = Map<string, string>;

export function linhaDeConvenio(
  c: ConvenioUnificado,
  fases: FasesMonitoramento,
  grupo: GrupoLinha = "Instrumento",
): LinhaRelatorio {
  return {
    grupo,
    chave: `convenio:${c.numero}`,
    tipo: c.tipoContratacao,
    numero: c.numero,
    cnes: c.cnes,
    estabelecimento: c.cnesNomeEstabelecimento || c.convenente.nome,
    municipio: c.municipio || null,
    uf: c.uf || null,
    equipamentos: c.equipamentos.map((e) => e.nome),
    situacao: c.situacao || null,
    monitoramento: fases.get(c.numero) ?? null,
    ano: c.numeroInstrumento?.split("/")[1] ?? null,
    valor: c.financeiro.global,
  };
}

export function linhaDeProposta(
  p: PropostaCandidata,
  fases: FasesMonitoramento,
  grupo: GrupoLinha = "Proposta",
): LinhaRelatorio {
  const numero = String(p.cd_parceria ?? p.id_proposta);
  return {
    grupo,
    chave: `proposta:${p.id}`,
    tipo: p.tipo_contratacao,
    numero,
    cnes: p.cnes,
    estabelecimento: p.cnes_nome_estabelecimento || p.nm_proponente,
    municipio: p.municipio,
    uf: p.uf,
    equipamentos: equipamentosFinanciados(p),
    situacao: situacaoDeFato(p),
    monitoramento: fases.get(numero) ?? null,
    ano: p.data_proposta?.slice(0, 4) ?? null,
    valor: p.vl_global_proposta,
  };
}

/** "Salvador/BA"; "—" quando não há município nem UF. */
export function localDaLinha(l: LinhaRelatorio): string {
  if (!l.municipio && !l.uf) return "—";
  return `${l.municipio ? capitalizarNome(l.municipio) : "—"}/${l.uf ?? "—"}`;
}
