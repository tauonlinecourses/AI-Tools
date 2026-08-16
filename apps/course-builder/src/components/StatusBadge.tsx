import { Badge } from "@workspace/ui";
import type { ImplementationStatus, PageWorkflowStatus } from "../lib/types";
import { SwapIcon } from "./icons";

const config: Record<
  ImplementationStatus,
  {
    label: string;
    variant: "success" | "warning" | "default";
    headerClass: string;
    /** Outer card border tint (implement mode). */
    borderClass: string;
    buttonClass: string;
  }
> = {
  implemented: {
    label: "הוטמע",
    variant: "success",
    headerClass: "bg-emerald-50 border-emerald-300 text-emerald-900",
    borderClass: "border-emerald-300",
    buttonClass: "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100",
  },
  needs_update: {
    label: "עבר שינוי",
    variant: "warning",
    headerClass: "bg-amber-50 border-amber-300 text-amber-900",
    borderClass: "border-amber-300",
    buttonClass: "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100",
  },
  not_implemented: {
    label: "לא הוטמע",
    variant: "default",
    headerClass: "bg-surface-100 border-surface-200 text-surface-700",
    borderClass: "border-surface-300",
    buttonClass: "bg-surface-100 text-surface-600 border-surface-200 hover:bg-surface-200",
  },
};

/** Header background/text tint for a component card in implement mode. */
export function statusHeaderClass(status: ImplementationStatus): string {
  return config[status].headerClass;
}

/** Outer card border color for a component card in implement mode. */
export function statusBorderClass(status: ImplementationStatus): string {
  return config[status].borderClass;
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

const workflowConfig: Record<
  PageWorkflowStatus,
  { label: string; buttonClass: string }
> = {
  in_progress: {
    label: "בעבודה",
    buttonClass:
      "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100",
  },
  ready_for_implementation: {
    label: "מוכן להטמעה",
    buttonClass:
      "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100",
  },
};

/** Edit-mode control for the page's authoring readiness. */
export function PageWorkflowStatusToggle({
  status,
  onClick,
}: {
  status: PageWorkflowStatus;
  onClick: () => void;
}) {
  const { label, buttonClass } = workflowConfig[status];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-control cursor-pointer transition-colors duration-fast ${buttonClass}`}
      title="לחצו לשינוי סטטוס העמוד"
      aria-label={`סטטוס עמוד: ${label} — לחצו לשינוי`}
    >
      {label}
      <SwapIcon className="w-4 h-4" />
    </button>
  );
}

/** Edit-mode control that applies authoring readiness to every page in a lesson. */
export function LessonWorkflowStatusToggle({
  status,
  onClick,
  disabled = false,
}: {
  status: PageWorkflowStatus;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { label, buttonClass } = workflowConfig[status];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-control transition-colors duration-fast ${buttonClass} ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
      title={
        disabled
          ? "אין עמודים בשיעור"
          : "לחצו לשינוי סטטוס כל עמודי השיעור"
      }
      aria-label={`סטטוס שיעור: ${label} — לחצו לשינוי כל עמודי השיעור`}
    >
      {label}
      <SwapIcon className="w-4 h-4" />
    </button>
  );
}
