import { Badge } from "@/components/ui/badge";
import type { StatusCobertura } from "@/types/domain";
import { statusMeta } from "../../utils/status";

export function StatusBadge({ status }: { status: StatusCobertura }) {
  const meta = statusMeta(status);
  return (
    <Badge variant={meta.variant} className="text-[11.5px] font-semibold">
      {meta.label}
    </Badge>
  );
}
