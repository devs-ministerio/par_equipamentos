/** Base da API do backend (nao dos JSON estaticos de public/, ver
 * useJson.ts) -- so o monitoramento interno pos-repasse fala com isso, e a
 * lista leve de instrumentos monitorados usada na pagina principal pra
 * destacar o card certo sem abrir um por um. */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
