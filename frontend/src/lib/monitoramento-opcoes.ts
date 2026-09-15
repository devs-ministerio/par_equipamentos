/** Opções fixas dos campos que viraram lista suspensa no cadastro interno
 * (achado 2026-09-15, pedido do usuário: "todos os campos deverão ser por
 * seleção... exceto os dados do responsável técnico da execução"). Nunca
 * inventadas -- extraídas dos valores REAIS já usados na planilha fonte
 * (`docs/monitoramento-equipamentos/Monitoramento Base de Dados - Convênio
 * FAF TED (atualizado API).xlsx`, colunas "TÉCNICO RESPONSÁVEL - TITULAR/
 * SUPLENTE"/"NÍVEL DE MONITORAMENTO"/"FINALIDADE"/"MODALIDADE - ONCO"),
 * deduplicadas por normalização de maiúsculas (mesmo critério de
 * `_nome_padronizado` em scripts/importar_planilha_monitoramento.py) e
 * excluindo placeholder ("NA"/"NI"). */

/** Técnicos da equipe já usados como titular OU suplente em pelo menos 1
 * instrumento real -- mesma lista serve pros 2 campos (qualquer um pode
 * ser titular de 1 instrumento e suplente de outro). */
export const TECNICOS_EQUIPE = ['BRUNA', 'BRUNA MACHADO', 'LAYANE', 'LEONARDO BARSANTE', 'LOUISE', 'PRISCILA', 'SAMUEL'];

/** Os 3 níveis literais do nome da coluna na planilha fonte -- "SIMPLIFICADO"
 * ainda não apareceu em nenhuma linha real, mas é 1 dos 3 valores válidos
 * definidos pela própria equipe (nome da coluna: "NÍVEL DE MONITORAMENTO
 * (ESTRATÉGICO, TÁTICO E SIMPLIFICADO)"). */
export const NIVEIS_MONITORAMENTO = ['Estratégico', 'Tático', 'Simplificado'];

export const FINALIDADES = ['Ampliação', 'Ampliação (cobalto)', 'Substituição', 'Substituição e Ampliação', 'Várias'];

export const MODALIDADES_ONCO = [
  'Apoio',
  'Diagnóstico',
  'Diagnóstico e apoio',
  'Multiplas',
  'Rastreamento',
  'Rastreamento e diagnóstico',
  'Tratamento',
  'Tratamento e apoio',
  'Várias',
  'Vários',
];

/** Responsável por uma AÇÃO de monitoramento (pendência/reunião) -- não
 * tinha vocabulário fechado (campo era 100% livre) -- pedido do usuário
 * 2026-09-15: "Convenente, CGPCAN... e veja se tem mais atores que podemos
 * colocar na lista". Além dos 2 citados, os 2 outros atores que já
 * aparecem em algum ponto do domínio (não inventados pra esta lista):
 * Fornecedor (rastreado em siconv_pagamento/"valor pago ao fornecedor" no
 * card do convênio) e CNEN (já é 1 dos 3 grupos de marco regulatório em
 * marco_catalogo). Ajustável -- é só uma lista de string, sem enum no
 * banco. */
export const RESPONSAVEIS_ACAO = ['Convenente', 'CGPCAN', 'Fornecedor', 'CNEN'];

/** `<select>` sempre precisa conter o valor atual como opção, mesmo que
 * ele não esteja na lista fixa (dado histórico com texto livre antigo,
 * ou grafia diferente da canonica) -- senão o form troca silenciosamente
 * pro 1º item da lista ao abrir, perdendo o dado real sem o usuário
 * perceber. */
export function comValorAtual(opcoes: string[], valorAtual: string | null | undefined): string[] {
  if (!valorAtual || opcoes.includes(valorAtual)) return opcoes;
  return [valorAtual, ...opcoes];
}
