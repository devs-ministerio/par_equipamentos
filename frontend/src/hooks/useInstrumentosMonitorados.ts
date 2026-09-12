import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/services/monitoramento';

/** So os numeros de convenio que tem instrumento monitorado internamente
 * -- 1 chamada leve na pagina inteira (GET /monitoramento/instrumentos),
 * nao 1 por card. Usado so pra DESTACAR o card certo na lista fechada;
 * o detalhe completo (eventos, fase) continua vindo por card, sob demanda,
 * quando o usuario abre (ver MonitoramentoInterno.tsx). Programa/componente
 * NAO vem daqui de proposito (decisao do usuario 2026-09-08: so API conta,
 * o monitoramento interno e dado de planilha da equipe, nao de API) -- ver
 * `programaTransfereGov`/`componenteTransfereGov` em ConvenioCard.tsx.
 * Falha aqui nunca quebra a pagina -- so significa que nenhum card fica
 * destacado. */
export function useInstrumentosMonitorados(): Set<string> {
  const [numeros, setNumeros] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch(`${API_BASE_URL}/monitoramento/instrumentos`)
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: { nr_convenio: string }[]) => setNumeros(new Set(lista.map((i) => i.nr_convenio))))
      .catch(() => {});
  }, []);
  return numeros;
}
