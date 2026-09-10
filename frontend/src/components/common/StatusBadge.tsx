import { Badge } from '@/components/ui/badge';
import { statusMeta } from '../../utils/status';

export function StatusBadge({ cobertura }: { cobertura: number }) {
  const meta = statusMeta(cobertura);
  return (
    <Badge variant={meta.variant} className="text-[11.5px] font-semibold">
      {meta.label}
    </Badge>
  );
}
