/** Navegação contextual compacta. Aba ativa usa sublinhado de accent, como
 * definido pela constituição, sem criar três cards dentro do cabeçalho. */
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
    <nav className="flex w-full flex-wrap gap-5 border-b border-border sm:w-auto" aria-label="Seções da análise de mérito">
      {ITENS.map((item) => {
        const ativo = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              '-mb-px border-b-2 px-0.5 pb-2 text-sm no-underline transition-colors',
              ativo ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
