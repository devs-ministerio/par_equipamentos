/** Botões de navegação entre as 3 páginas de Análise de mérito (Dashboard/
 * Mapa/Relatórios), no formato "caixa" (label pequeno + valor em negrito)
 * -- mesmo visual dos cards "Instrumentos"/"Execução média" do cabeçalho
 * de Mesa de trabalho (achado 2026-09-15, pedido do usuário: "quero os
 * botões [...] neste formato da imagem [...] Instrumentos e Repasses tem
 * cards a direita [...] no canto direito os botões de navegação
 * monitoramento interno, mapa e relatorios"). Usado no cabeçalho de cada
 * uma das 3 páginas (mesmo padrão repetido -- "basta replicar o que foi
 * feito nas outras páginas"). */
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const ITENS = [
  { path: '/monitoramento-equipamentos/instrumentos', label: 'Monitoramento interno' },
  { path: '/mapa', label: 'Mapa' },
  { path: '/relatorios', label: 'Relatórios' },
];

export function NavBoxesAnaliseMerito() {
  const location = useLocation();
  return (
    <div className="grid min-w-[260px] grid-cols-3 gap-2">
      {ITENS.map((item) => {
        const ativo = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              'rounded-lg border p-2.5 no-underline transition-colors',
              ativo ? 'border-primary bg-secondary' : 'border-border bg-muted hover:bg-secondary/60',
            )}
          >
            <div className="text-[10.5px] font-extrabold uppercase text-muted-foreground">Ir para</div>
            <strong className={cn('text-[13.5px] leading-tight', ativo ? 'text-primary' : 'text-foreground')}>
              {item.label}
            </strong>
          </Link>
        );
      })}
    </div>
  );
}
