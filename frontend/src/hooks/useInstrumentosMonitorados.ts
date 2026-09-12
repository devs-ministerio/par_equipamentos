import { useQuery } from '@tanstack/react-query';
import { fetchInstrumentos, type InstrumentoEquipamento } from '@/services/monitoramento';
import { monitoramentoKeys } from './monitoramento-query-keys';

/** GET /monitoramento/instrumentos completo -- usado pelas páginas de
 * overview/painel (tabela, filtros, rankings). Compartilha cache
 * (`monitoramentoKeys.instrumentos`) com `useInstrumentosMonitorados`
 * abaixo, então abrir qualquer uma das duas telas já esquenta a outra. */
export function useMonitoramentoInstrumentos() {
  return useQuery({
    queryKey: monitoramentoKeys.instrumentos,
    queryFn: fetchInstrumentos,
  });
}

/** So os numeros de convenio que tem instrumento monitorado internamente
 * -- usado so pra DESTACAR o card certo na lista fechada de convênios; o
 * detalhe completo (eventos, fase) continua vindo por instrumento, sob
 * demanda (ver useInstrumentoTimeline). Programa/componente NAO vem daqui
 * de proposito (decisao do usuario 2026-09-08: so API conta, o
 * monitoramento interno e dado de planilha da equipe, nao de API) -- ver
 * `programaTransfereGov`/`componenteTransfereGov` em convenio-card.tsx.
 * Falha aqui nunca quebra a pagina -- so significa que nenhum card fica
 * destacado (`select` devolve Set vazio enquanto carrega/se falhar). */
export function useInstrumentosMonitorados(): Set<string> {
  const query = useQuery({
    queryKey: monitoramentoKeys.instrumentos,
    queryFn: fetchInstrumentos,
    select: (lista: InstrumentoEquipamento[]) => new Set(lista.map((i) => i.nr_convenio)),
    retry: false,
  });
  return query.data ?? new Set<string>();
}
