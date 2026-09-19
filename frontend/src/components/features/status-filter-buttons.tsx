import type { StatusCobertura } from '@/types/domain';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  selecionados: Set<StatusCobertura>;
  onChange: (proximo: Set<StatusCobertura>) => void;
}

/**
 * Substitui a busca por texto nas tabelas de Cobertura Assistencial (pedido
 * explicito) -- dois botoes clicaveis (toggle) que filtram a lista por
 * status. Nenhum selecionado = mostra tudo; um ou os dois selecionados =
 * so as linhas daquele(s) status. Hipossuficiente primeiro (vermelho antes
 * do verde, mesma ordem ja adotada nas legendas); dado indisponivel entra
 * como terceiro estado, separado de suficiencia.
 */
export function StatusFilterButtons({ selecionados, onChange }: Props) {
  function toggle(status: StatusCobertura) {
    const proximo = new Set(selecionados);
    if (proximo.has(status)) proximo.delete(status); else proximo.add(status);
    onChange(proximo);
  }

  const hipoAtivo = selecionados.has('Hipossuficiente');
  const hiperAtivo = selecionados.has('Hiperssuficiente');
  const indisponivelAtivo = selecionados.has('Dados indisponíveis');

  return (
    <div className="flex flex-wrap gap-1.5">
      <Button
        variant="outline"
        onClick={() => toggle('Hipossuficiente')}
        className={cn(
          'h-auto rounded-full px-3 py-1.5 text-xs font-semibold',
          hipoAtivo && 'border-destructive bg-destructive/10 text-destructive hover:bg-destructive/20',
        )}
      >
        Hipossuficiente
      </Button>
      <Button
        variant="outline"
        onClick={() => toggle('Hiperssuficiente')}
        className={cn(
          'h-auto rounded-full px-3 py-1.5 text-xs font-semibold',
          hiperAtivo && 'border-success bg-success/10 text-success hover:bg-success/20',
        )}
      >
        Hiperssuficiente
      </Button>
      <Button
        variant="outline"
        onClick={() => toggle('Dados indisponíveis')}
        className={cn(
          'h-auto rounded-full px-3 py-1.5 text-xs font-semibold',
          indisponivelAtivo && 'border-muted-foreground bg-muted text-muted-foreground hover:bg-muted',
        )}
      >
        Dados indisponíveis
      </Button>
    </div>
  );
}
