import { ConvenioCard } from '@/components/features/convenio-card';
import { Pagination } from '@/components/common/pagination';
import type { ConvenioUnificado } from '@/types/monitoramento';

export function DadosOficiaisLista({ itens, monitorados, fases, pagina, total, onPagina }: { itens: ConvenioUnificado[]; monitorados: Set<string>; fases: Map<string, string>; pagina: number; total: number; onPagina: (pagina: number) => void }) {
  return <><>{itens.map((item) => <ConvenioCard key={item.numero} c={item} monitorado={monitorados.has(item.numero)} faseMonitoramento={fases.get(item.numero) ?? null} />)}</><div className="mt-1 rounded-[10px] border border-border bg-card"><Pagination page={pagina} totalItems={total} pageSize={20} onPageChange={onPagina} /></div></>;
}
