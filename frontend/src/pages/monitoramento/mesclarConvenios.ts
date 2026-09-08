import type { ConvenioPortal, ConvenioUnificado, SiconvEntrada, TransfereGovEnte } from './types';

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

/** DD/MM/AAAA (campos DIA_*_PROPOSTA de siconv_proposta.csv, formato
 * diferente do DIA_*_CONV acima) pro mesmo ISO que `fmtData` espera. */
function dataSiconvProposta(v: string | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** VL_*_PROP de siconv_proposta.csv usa virgula decimal ("103000,32"),
 * diferente dos VL_*_CONV (ponto) -- numOuNull sozinho devolveria NaN. */
function numOuNullVirgula(v: string | undefined): number | null {
  if (!v) return null;
  return numOuNull(v.replace(',', '.'));
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
 * A LISTA BASE e a uniao Portal ∪ SICONV, nao so Portal -- achado
 * 2026-09-08: varios convenios achados via levantamento de componente/
 * equipamento (siconv_programa/siconv_plano_aplicacao nacional) nao existem
 * no endpoint `/convenios/numero` do Portal (numero de instrumento novo
 * demais pra API antiga), entao ficavam invisiveis no app mesmo confirmados
 * no proprio dump SICONV. Pra esses, identidade (nome/objeto/municipio/
 * situacao/valor) cai pra `siconv.proposta` (siconv_proposta.csv, coletado
 * SO pra esse caso -- ver docstring de coletar_siconv_legado.py) antes de
 * virar "—" -- ver `identidadeFonte` em types.ts. */
export function mesclarConvenios(
  portal: ConvenioPortal[],
  siconv: SiconvEntrada[],
  transferegov: TransfereGovEnte[],
): ConvenioUnificado[] {
  const portalPorNumero = new Map(portal.map((p) => [p.numero, p]));
  const siconvPorNumero = new Map(siconv.map((e) => [e.convenio.NR_CONVENIO, e]));
  const numeros = new Set([...portalPorNumero.keys(), ...siconvPorNumero.keys()]);

  const transferegovPorNumero = new Map<string, TransfereGovEnte>();
  for (const ente of transferegov) {
    for (const numero of ente.convenios_legados_relacionados) {
      transferegovPorNumero.set(numero, ente);
    }
  }

  return Array.from(numeros).map((numero): ConvenioUnificado => {
    const p = portalPorNumero.get(numero) ?? null;
    const s = siconvPorNumero.get(numero) ?? null;
    const sc = s?.convenio;
    const sp = s?.proposta ?? undefined; // so preenchido pra convenio sem Portal, ver types.ts

    const global = sc ? numOuNull(sc.VL_GLOBAL_CONV) : null;
    const desembolsado = sc ? numOuNull(sc.VL_DESEMBOLSADO_CONV) : null;
    const contrapartida = sc ? numOuNull(sc.VL_CONTRAPARTIDA_CONV) : null;

    return {
      numero,
      numeroInstrumento: p?.numero_instrumento ?? null,
      objeto: p?.objeto ?? sp?.OBJETO_PROPOSTA ?? '— (não indexado no Portal da Transparência)',
      situacao: p?.situacao ?? sc?.SIT_CONVENIO ?? sp?.SIT_PROPOSTA ?? '—',
      situacaoContratacao: sc?.SITUACAO_CONTRATACAO || null,
      convenente: {
        nome: p?.convenente_nome ?? sp?.NM_PROPONENTE ?? '— (não indexado no Portal da Transparência)',
        cnpj: p?.convenente_cnpj ?? sp?.IDENTIF_PROPONENTE ?? '—',
        tipo: p?.convenente_tipo ?? sp?.NATUREZA_JURIDICA ?? '—',
      },
      municipio: p?.municipio ?? sp?.MUNIC_PROPONENTE ?? '—',
      uf: p?.uf ?? sp?.UF_PROPONENTE ?? '—',
      codigoIbge: p?.codigo_ibge ?? sp?.COD_MUNIC_IBGE ?? '—',
      regiao: p?.regiao ?? '—',
      orgao: p?.orgao ?? sp?.DESC_ORGAO_SUP ?? '—',
      unidadeGestora: p?.unidade_gestora ?? sc?.UG_EMITENTE ?? sp?.DESC_ORGAO ?? '—',
      subfuncao: p?.subfuncao ?? '—',
      funcao: p?.funcao ?? '—',
      tipoInstrumento: p?.tipo_instrumento ?? sp?.MODALIDADE ?? '—',
      numeroProcesso: p?.numero_processo ?? sc?.NR_PROCESSO ?? '—',
      datas: {
        publicacao: p?.data_publicacao ?? dataSiconv(sc?.DIA_PUBL_CONV),
        inicioVigencia: p?.data_inicio_vigencia ?? dataSiconv(sc?.DIA_INIC_VIGENC_CONV) ?? dataSiconvProposta(sp?.DIA_INIC_VIGENCIA_PROPOSTA),
        fimVigencia: p?.data_final_vigencia ?? dataSiconv(sc?.DIA_FIM_VIGENC_CONV) ?? dataSiconvProposta(sp?.DIA_FIM_VIGENCIA_PROPOSTA),
        conclusao: p?.data_conclusao ?? null,
        ultimaLiberacao: p?.data_ultima_liberacao ?? null,
      },
      financeiro: {
        global: global ?? p?.valor ?? numOuNullVirgula(sp?.VL_GLOBAL_PROP),
        empenhado: sc ? numOuNull(sc.VL_EMPENHADO_CONV) : null,
        desembolsado: desembolsado ?? p?.valor_liberado ?? null,
        contrapartida: contrapartida ?? p?.valor_contrapartida ?? numOuNullVirgula(sp?.VL_CONTRAPARTIDA_PROP),
        saldoConta: sc ? numOuNull(sc.VL_SALDO_CONTA) : null,
        ultimaLiberacaoValor: p?.valor_ultima_liberacao ?? null,
        fonteConfiavel: sc !== null,
      },
      siconv: s,
      transferegov: transferegovPorNumero.get(numero) ?? null,
      identidadeFonte: p !== null ? 'portal' : 'siconv',
    };
  });
}
