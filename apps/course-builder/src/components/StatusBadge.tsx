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

/**
 * Manual cycle for the implement-mode status control.
 * `needs_update` (עבר שינוי) is set automatically when content changes after
 * implementation — it is not a manual target. Clicking from that state marks
 * the block implemented again.
 */
export const STATUS_CYCLE: ImplementationStatus[] = [
  "not_implemented",
  "implemented",
];

export function nextStatus(current: ImplementationStatus): ImplementationStatus {
  if (current === "needs_update") return "implemented";
  const i = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(Math.max(0, i) + 1) % STATUS_CYCLE.length];
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

const WORKFLOW_OPTIONS: {
  value: PageWorkflowStatus;
  label: string;
  activeTextClass: string;
  pillClass: string;
}[] = [
  {
    value: "in_progress",
    label: "בעבודה",
    activeTextClass: "text-amber-950",
    pillClass: "bg-amber-200",
  },
  {
    value: "ready_for_implementation",
    label: "מוכן להטמעה",
    activeTextClass: "text-emerald-950",
    pillClass: "bg-emerald-200",
  },
];

function WorkflowStatusSegmentedToggle({
  status,
  onSelect,
  disabled = false,
  title,
  ariaLabel,
}: {
  status: PageWorkflowStatus;
  onSelect: (next: PageWorkflowStatus) => void;
  disabled?: boolean;
  title: string;
  ariaLabel: string;
}) {
  const selectedIndex = WORKFLOW_OPTIONS.findIndex((o) => o.value === status);
  const selected = WORKFLOW_OPTIONS[Math.max(0, selectedIndex)];

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      title={title}
      className={`relative inline-grid shrink-0 grid-cols-2 overflow-hidden rounded-control border border-surface-200 bg-white text-sm font-medium ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      }`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 w-1/2 transition-[inset-inline-start,background-color] duration-slow ease-smooth ${
          selected.pillClass
        } ${selectedIndex <= 0 ? "start-0" : "start-1/2"}`}
      />
      {WORKFLOW_OPTIONS.map((option) => {
        const selectedOption = option.value === status;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selectedOption}
            disabled={disabled}
            onClick={() => {
              if (!selectedOption) onSelect(option.value);
            }}
            className={`relative z-10 whitespace-nowrap px-3 py-1.5 transition-colors duration-slow ease-smooth ${
              disabled ? "cursor-not-allowed" : "cursor-pointer"
            } ${
              selectedOption
                ? option.activeTextClass
                : "text-surface-500 hover:text-surface-700"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Edit-mode control for the page's authoring readiness. */
export function PageWorkflowStatusToggle({
  status,
  onSelect,
}: {
  status: PageWorkflowStatus;
  onSelect: (next: PageWorkflowStatus) => void;
}) {
  const label =
    WORKFLOW_OPTIONS.find((o) => o.value === status)?.label ?? status;

  return (
    <WorkflowStatusSegmentedToggle
      status={status}
      onSelect={onSelect}
      title="בחרו סטטוס עמוד"
      ariaLabel={`סטטוס עמוד: ${label}`}
    />
  );
}

/** Edit-mode control that applies authoring readiness to every page in a lesson. */
export function LessonWorkflowStatusToggle({
  status,
  onSelect,
  disabled = false,
}: {
  status: PageWorkflowStatus;
  onSelect: (next: PageWorkflowStatus) => void;
  disabled?: boolean;
}) {
  const label =
    WORKFLOW_OPTIONS.find((o) => o.value === status)?.label ?? status;

  return (
    <WorkflowStatusSegmentedToggle
      status={status}
      onSelect={onSelect}
      disabled={disabled}
      title={
        disabled
          ? "אין עמודים בשיעור"
          : "בחרו סטטוס לכל עמודי השיעור"
      }
      ariaLabel={`סטטוס שיעור: ${label}`}
    />
  );
}
