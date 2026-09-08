/** Deriva o "Componente PNPCC" a partir do NOME_PROGRAMA exato do SICONV
 * (`c.siconv.programa`, ver types.ts::SiconvEntrada) -- espelho simplificado
 * de `_componente_alvo_de` em
 * backend/scripts/levantamento_convenios_oncologia.py (que usa
 * SequenceMatcher completo contra as 8 strings-alvo, tolerando erro de
 * digitacao real da fonte). Aqui, pra exibicao no card, usa so verificacao
 * de substring normalizada -- suficiente pra nome de programa bem formado,
 * menos tolerante a erro de formatacao que o fuzzy-match do backend, mas
 * evita duplicar SequenceMatcher no cliente. Pedido do usuario 2026-09-08:
 * validar os 8 componentes contra este campo, exato por ID_PROPOSTA (nao
 * aproximacao por CNPJ como `componentesPorCnpj`). */

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function componenteDoProgramaSiconv(nomePrograma: string | undefined | null): string | null {
  if (!nomePrograma) return null;
  const n = normalizar(nomePrograma);
  const ehRede = n.includes('REDE DE ATENCAO');
  const ehPolitica = n.includes('POLITICA NACIONAL DE PREVENCAO E CONTROLE DO CANCER');
  if (!ehRede && !ehPolitica) return null;
  const prefixo = ehRede
    ? 'Rede de Atenção à Pessoa com Doenças Crônicas'
    : 'Política Nacional de Prevenção e Controle do Câncer';
  if (n.includes('AMBULATORIO')) return `${prefixo} – Ambulatório para Diagnóstico em Oncologia`;
  if (n.includes('HOSPITAL HABILITADO')) return `${prefixo} – Hospital Habilitado na Alta Complexidade em Oncologia`;
  if (n.includes('ANATOMIA PATOLOGICA') || n.includes('CITOPATOLOGIA')) return `${prefixo} – Laboratório de Anatomia Patológica e/ou Citopatologia`;
  if (n.includes('CANCER DE MAMA') || n.includes('SDM')) return `${prefixo} – Serviço de Referência para o Diagnóstico do Câncer de Mama (SDM)`;
  if (n.includes('COLO DO UTERO') || n.includes('SRC')) return `${prefixo} – Serviço de Referência para o Diagnóstico do Câncer de Colo do Útero (SRC)`;
  return null;
}
