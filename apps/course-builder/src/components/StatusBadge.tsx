import { Badge } from "@workspace/ui";
import type { ImplementationStatus } from "../lib/types";
import { SwapIcon } from "./icons";

const config: Record<
  ImplementationStatus,
  {
    label: string;
    variant: "success" | "warning" | "default";
    headerClass: string;
    buttonClass: string;
  }
> = {
  implemented: {
    label: "הוטמע",
    variant: "success",
    headerClass: "bg-emerald-50 border-emerald-200 text-emerald-900",
    buttonClass: "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100",
  },
  needs_update: {
    label: "דורש עדכון",
    variant: "warning",
    headerClass: "bg-amber-50 border-amber-200 text-amber-900",
    buttonClass: "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100",
  },
  not_implemented: {
    label: "לא הוטמע",
    variant: "default",
    headerClass: "bg-surface-100 border-surface-200 text-surface-700",
    buttonClass: "bg-surface-100 text-surface-600 border-surface-200 hover:bg-surface-200",
  },
};

/** Header background/border/text tint for a component card in review mode. */
export function statusHeaderClass(status: ImplementationStatus): string {
  return config[status].headerClass;
}

/** Cycle used when clicking the review-mode status badge. */
export const STATUS_CYCLE: ImplementationStatus[] = [
  "not_implemented",
  "implemented",
  "needs_update",
];

export function nextStatus(current: ImplementationStatus): ImplementationStatus {
  const i = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
}

export function StatusBadge({
  status,
  onClick,
}: {
  status: ImplementationStatus;
  /** When set (review mode), badge cycles status on click. */
  onClick?: () => void;
}) {
  const { label, variant, buttonClass } = config[status];

  if (!onClick) {
    return (
      <Badge variant={variant} size="sm">
        {label}
      </Badge>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-control cursor-pointer transition-colors duration-fast ${buttonClass}`}
      title="לחצו לשינוי סטטוס"
      aria-label={`סטטוס ${label} — לחצו לשינוי`}
    >
      {label}
      <SwapIcon className="w-4 h-4" />
    </button>
  );
}
