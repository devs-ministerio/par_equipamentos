import { Fragment } from 'react';
import { campo, campoData, campoNum, lista } from '@/lib/campo-cru';
import { fmtMoeda } from '@/lib/monitoramento-format';
import { Campo, Secao, StatusPill } from './monitoramento-ui';

export function SecaoAnaliseTecnica({ analises }: { analises: unknown[] }) {
  if (analises.length === 0) return null;
  return <Secao titulo="Análise técnica (parecer)">{analises.map((analise, indice) => {
    const tipos = lista(analise, 'tipos_analise').map((item) => campo(item, 'tp_analise')).filter(Boolean);
    return <div key={indice} className="mb-2.5 last:mb-0"><div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"><StatusPill texto={campo(analise, 'in_resultado_analise')} /><span>{campo(analise, 'in_fase_analise')}</span>{tipos.length > 0 && <span>· {tipos.join(', ')}</span>}{campo(analise, 'dh_analise_proposta') && <span>· {campoData(analise, 'dh_analise_proposta')}</span>}</div>{campo(analise, 'ds_parecer') && <div className="max-h-52 overflow-y-auto rounded-md border border-border bg-background p-2.5 text-[11.5px] leading-relaxed text-foreground">{campo(analise, 'ds_parecer')}</div>}</div>;
  })}</Secao>;
}

export function SecaoOrigemRecurso({ distribuicoes }: { distribuicoes: unknown[] }) {
  if (distribuicoes.length === 0) return null;
  return <Secao titulo="Origem do recurso"><div className="grid [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))] gap-2.5">{distribuicoes.map((distribuicao, indice) => <Fragment key={indice}><Campo label="Tipo">{campo(distribuicao, 'in_tipo_distribuicao') || '—'}</Campo>{campo(distribuicao, 'nr_emenda_proposta') && <Campo label="Nº da emenda">{campo(distribuicao, 'nr_emenda_proposta')}</Campo>}{campo(distribuicao, 'nm_parlamentar_proposta') && <Campo label="Autor">{campo(distribuicao, 'nm_parlamentar_proposta')}{campo(distribuicao, 'in_tipo_emenda_parlamentar_proposta') && ` (${campo(distribuicao, 'in_tipo_emenda_parlamentar_proposta')})`}</Campo>}<Campo label="Valor">{fmtMoeda(campoNum(distribuicao, 'valor_emenda'))}</Campo></Fragment>)}</div></Secao>;
}
