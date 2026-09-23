import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContagemRotulo, DivergenciaConclusao, InauguracaoResumo, LicencaVencendoResumo } from '@/services/monitoramento-resumo';
import { fmtData } from '@/lib/monitoramento-format';

export function PainelSecao({ titulo, apoio, children, className }: { titulo: string; apoio?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('border-t border-border pt-4', className)}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold tracking-tight">{titulo}</h2>
        {apoio && <span className="text-xs text-muted-foreground">{apoio}</span>}
      </div>
      {children}
    </section>
  );
}

export function MetricasExecutivas({ itens }: { itens: Array<{ rotulo: string; valor: string | number; detalhe?: string; tom?: 'padrao' | 'ok' | 'alerta' }> }) {
  return (
    <div className="grid overflow-hidden rounded-xl border border-border bg-card [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
      {itens.map((item, index) => (
        <div key={item.rotulo} className={cn('min-h-24 px-5 py-4', index > 0 && 'border-t border-border sm:border-l sm:border-t-0')}>
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{item.rotulo}</div>
          <div className={cn('mt-2 font-display text-2xl font-semibold tracking-tight', item.tom === 'ok' && 'text-success', item.tom === 'alerta' && 'text-destructive')}>
            {item.valor}
          </div>
          {item.detalhe && <div className="mt-1 text-xs text-muted-foreground">{item.detalhe}</div>}
        </div>
      ))}
    </div>
  );
}

export function DistribuicaoHorizontal({ itens, total, limite }: { itens: ContagemRotulo[]; total?: number; limite?: number }) {
  const visiveis = limite ? itens.slice(0, limite) : itens;
  const maior = Math.max(1, ...visiveis.map((item) => item.quantidade));
  return (
    <div className="divide-y divide-border">
      {visiveis.map((item) => (
        <div key={item.rotulo} className="grid grid-cols-[minmax(110px,1.5fr)_minmax(100px,3fr)_auto] items-center gap-3 py-2.5">
          <span className="truncate text-xs text-foreground" title={item.rotulo}>{item.rotulo}</span>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(item.quantidade / maior) * 100}%` }} />
          </div>
          <span className="min-w-10 text-right text-xs font-semibold">
            {item.quantidade}{total ? <span className="ml-1 text-[10px] font-normal text-muted-foreground">{Math.round(item.quantidade / total * 100)}%</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AgendaExecutiva({ inauguracoes, licencas }: { inauguracoes: InauguracaoResumo[]; licencas: LicencaVencendoResumo[] }) {
  const inauguracoesPendentes = inauguracoes.filter((item) => !item.realizada).sort((a, b) => a.dias - b.dias).slice(0, 5);
  const licencasOrdenadas = [...licencas].sort((a, b) => a.dias - b.dias).slice(0, 5);
  const itens = [
    ...licencasOrdenadas.map((item) => ({
      chave: `licenca-${item.nr_convenio}`,
      nr: item.nr_convenio,
      titulo: item.nome_convenente,
      meta: 'Licença CNEN',
      prazo: item.dias < 0 ? `Vencida há ${Math.abs(item.dias)} dias` : `Vence em ${item.dias} dias`,
      critico: item.dias < 90,
    })),
    ...inauguracoesPendentes.map((item) => ({
      chave: `inauguracao-${item.nr_convenio}`,
      nr: item.nr_convenio,
      titulo: item.nome_convenente,
      meta: `Inauguração · ${fmtData(item.data)}`,
      prazo: item.dias < 0 ? `Atrasada há ${Math.abs(item.dias)} dias` : `Em ${item.dias} dias`,
      critico: item.dias < 0,
    })),
  ].sort((a, b) => Number(b.critico) - Number(a.critico)).slice(0, 7);

  if (itens.length === 0) return <p className="py-4 text-sm text-muted-foreground">Nenhum prazo crítico registrado.</p>;
  return (
    <div className="divide-y divide-border">
      {itens.map((item) => (
        <Link key={item.chave} to={`/monitoramento-equipamentos/instrumentos/${item.nr}`} className="group grid grid-cols-[1fr_auto] gap-3 py-3 text-inherit">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{item.titulo}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{item.meta} · {item.nr}</div>
          </div>
          <div className={cn('flex items-center gap-1 text-xs font-semibold', item.critico ? 'text-destructive' : 'text-warning')}>
            {item.prazo}<ArrowUpRight size={13} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </div>
        </Link>
      ))}
    </div>
  );
}

export function DivergenciasConclusao({ itens }: { itens: DivergenciaConclusao[] }) {
  if (itens.length === 0) return <p className="py-4 text-sm text-muted-foreground">Nenhuma divergência de conclusão registrada.</p>;
  return (
    <div className="divide-y divide-border">
      {itens.slice(0, 8).map((item) => (
        <Link key={item.nr_convenio} to={`/monitoramento-equipamentos/instrumentos/${item.nr_convenio}`} className="group grid gap-1 py-3 text-inherit sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{item.nome_convenente}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{item.nr_convenio} · {item.tipo_contratacao ?? 'Fonte não informada'} · {item.fase_interna}</div>
          </div>
          <div className="text-left text-xs sm:text-right">
            <div className="font-semibold text-destructive">{item.risco}</div>
            <div className="text-muted-foreground">{item.status_externo_original}</div>
          </div>
        </Link>
      ))}
      {itens.length > 8 && <p className="pt-3 text-xs text-muted-foreground">Exibindo 8 de {itens.length} casos. Use os filtros da mesa de trabalho para tratar o restante.</p>}
    </div>
  );
}
