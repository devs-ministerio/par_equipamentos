import { Fragment } from 'react';
import { construirTimelineProposta } from '@/lib/proposta-metas-resumo';
import { fmtData } from '@/lib/monitoramento-format';
import { cn } from '@/lib/utils';
import { Secao } from './monitoramento-ui';

/** Linha do tempo da proposta -- resumo rápido da trajetória (todas as
 * etapas que ela já passou, em ordem cronológica) antes de entrar nos
 * detalhes seção a seção (`DetalheBrutoProposta`). Horizontal, colunas de
 * largura fixa + conector esticando pra preencher o espaço quando sobra;
 * `overflow-x-auto` só entra em cena se a soma ultrapassar a largura do
 * card (muitas etapas ou tela estreita) -- mesmo padrão de "conteúdo largo
 * rola no próprio contêiner" usado nas tabelas de item. */
export function LinhaDoTempoProposta({ metasResumo, dataProposta }: { metasResumo: unknown; dataProposta: string | null }) {
  const eventos = construirTimelineProposta(metasResumo, dataProposta);
  if (eventos.length === 0) return null;

  return (
    <Secao titulo="Linha do tempo da proposta" contagem={eventos.length}>
      <div className="overflow-x-auto pb-1">
        <div className="flex w-full items-start">
          {eventos.map((ev, i) => {
            const ultimo = i === eventos.length - 1;
            return (
              <Fragment key={i}>
                <div className="flex w-[136px] shrink-0 flex-col items-center text-center">
                  <div className="text-[10.5px] whitespace-nowrap text-muted-foreground">{fmtData(ev.data)}</div>
                  <div
                    className={cn(
                      'my-1.5 flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                      ultimo ? 'bg-success-bg text-success' : 'bg-background border border-border text-muted-foreground',
                    )}
                  >
                    {i + 1}
                  </div>
                  <div className="text-[11.5px] leading-tight font-semibold text-foreground">{ev.titulo}</div>
                  {ev.detalhe && <div className="mt-0.5 text-[10.5px] leading-tight text-muted-foreground">{ev.detalhe}</div>}
                  {ultimo && <span className="mt-1 text-[9px] font-bold uppercase tracking-wide text-success">Atual</span>}
                </div>
                {!ultimo && <div className="mt-[35px] h-px min-w-6 flex-1 bg-border" />}
              </Fragment>
            );
          })}
        </div>
      </div>
    </Secao>
  );
}
