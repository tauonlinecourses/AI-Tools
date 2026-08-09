import { Badge } from "@workspace/ui";
import type { ImplementationStatus } from "../lib/types";

const config: Record<ImplementationStatus, { label: string; variant: "success" | "warning" | "default" }> = {
  implemented: { label: "הוטמע", variant: "success" },
  needs_update: { label: "דורש עדכון", variant: "warning" },
  not_implemented: { label: "לא הוטמע", variant: "default" },
};

export function StatusBadge({ status }: { status: ImplementationStatus }) {
  const { label, variant } = config[status];
  return (
    <Badge variant={variant} size="sm">
      {label}
    </Badge>
  );
}
