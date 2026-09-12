import type { ConvenioPortal, ConvenioUnificado, SiconvEntrada, TransfereGovEnte } from '@/types/monitoramento';

function numOuNull(v: string | undefined | null): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Formata AAAAMMDD (varios campos DIA_*_CONV do SICONV) pro mesmo formato
 * ISO (AAAA-MM-DD) que `fmtData` (format.ts) espera -- SICONV as vezes usa
 * "00000000"/vazio pra "sem data", tratado como null. */
function dataSiconv(v: string | undefined): string | null {
  if (!v || v === '00000000' || v.length !== 8) return null;
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

/** Cruza as 3 fontes por numero de convenio (Portal <-> SICONV, exato) e por
 * CNPJ do convenente (Portal <-> TransfereGov, aproximacao -- ver
 * types.ts). Campo que aparece em mais de uma fonte fica com UM valor so:
 *
 *  - identificacao/objeto/situacao/datas: Portal (unico com texto legivel
 *    pros 71 -- SICONV so tem codigo de convenio, sem nome/municipio/objeto)
 *  - valores financeiros (global/empenhado/desembolsado/contrapartida):
 *    SICONV (`VL_*_CONV`) -- o campo `valor`/`valorLiberado` do Portal tem
 *    bug de truncamento confirmado (ver docs/monitoramento-equipamentos/
 *    convenios.html), SICONV bate com a fonte oficial (conferido contra
 *    convenio 971195, IRMANDADE SANTA CASA DE SANTOS: SICONV
 *    VL_GLOBAL_CONV=10.500.000 == valor real; Portal `valor`=1050, errado)
 *
 * A LISTA BASE e SO `portal` -- decisao 2026-09-09: entre 2026-09-08 e
 * 2026-09-09 chegou a ser a uniao Portal ∪ SICONV (pra incluir convenio
 * achado so no dump SICONV, sem entrada no Portal), mas 38 dos 41 casos
 * assim estavam em fase de PROPOSTA/plano de trabalho, nao convenio
 * assinado -- revertido a pedido do usuario ("Vamos manter apenas o que
 * esta no portal mesmo. Convenios assinados."). SICONV so entra como
 * enriquecimento de um convenio que o Portal ja confirmou. */
export function mesclarConvenios(
  portal: ConvenioPortal[],
  siconv: SiconvEntrada[],
  transferegov: TransfereGovEnte[],
): ConvenioUnificado[] {
  const siconvPorNumero = new Map(siconv.map((e) => [e.convenio.NR_CONVENIO, e]));

  const transferegovPorNumero = new Map<string, TransfereGovEnte>();
  for (const ente of transferegov) {
    for (const numero of ente.convenios_legados_relacionados) {
      transferegovPorNumero.set(numero, ente);
    }
  }

  return portal.map((p): ConvenioUnificado => {
    const s = siconvPorNumero.get(p.numero) ?? null;
    const sc = s?.convenio;

    const global = sc ? numOuNull(sc.VL_GLOBAL_CONV) : null;
    const desembolsado = sc ? numOuNull(sc.VL_DESEMBOLSADO_CONV) : null;
    const contrapartida = sc ? numOuNull(sc.VL_CONTRAPARTIDA_CONV) : null;

    return {
      numero: p.numero,
      numeroInstrumento: p.numero_instrumento,
      objeto: p.objeto,
      situacao: p.situacao,
      situacaoContratacao: sc?.SITUACAO_CONTRATACAO || null,
      convenente: { nome: p.convenente_nome, cnpj: p.convenente_cnpj, tipo: p.convenente_tipo },
      municipio: p.municipio,
      uf: p.uf,
      codigoIbge: p.codigo_ibge,
      regiao: p.regiao,
      orgao: p.orgao,
      unidadeGestora: p.unidade_gestora,
      subfuncao: p.subfuncao,
      funcao: p.funcao,
      tipoInstrumento: p.tipo_instrumento,
      numeroProcesso: p.numero_processo,
      datas: {
        publicacao: p.data_publicacao ?? dataSiconv(sc?.DIA_PUBL_CONV),
        inicioVigencia: p.data_inicio_vigencia ?? dataSiconv(sc?.DIA_INIC_VIGENC_CONV),
        fimVigencia: p.data_final_vigencia ?? dataSiconv(sc?.DIA_FIM_VIGENC_CONV),
        conclusao: p.data_conclusao,
        ultimaLiberacao: p.data_ultima_liberacao,
      },
      financeiro: {
        global: global ?? p.valor,
        repasse: sc ? numOuNull(sc.VL_REPASSE_CONV) : null,
        empenhado: sc ? numOuNull(sc.VL_EMPENHADO_CONV) : null,
        desembolsado: desembolsado ?? p.valor_liberado,
        contrapartida: contrapartida ?? p.valor_contrapartida,
        saldoConta: sc ? numOuNull(sc.VL_SALDO_CONTA) : null,
        ultimaLiberacaoValor: p.valor_ultima_liberacao,
        fonteConfiavel: sc !== null,
      },
      siconv: s,
      transferegov: transferegovPorNumero.get(p.numero) ?? null,
    };
  });
}
