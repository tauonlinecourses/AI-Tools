import { createPortal } from "react-dom";
import { CheckCircleIcon } from "./icons";

/**
 * Brief success banner — same layout as the session-ended / logout alert
 * (`ToolAuthGate` SessionEndedBanner): fixed under the header, white card,
 * dark border, title + detail. Green check replaces the amber warning icon.
 */
export function SuccessToast({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return createPortal(
    <div
      role="status"
      dir="rtl"
      className="fixed left-1/2 top-[60px] z-[9999] flex w-max max-w-[min(20rem,calc(100vw-24px))] -translate-x-1/2 items-center gap-2.5 rounded-control border border-surface-900 bg-white px-3 py-2.5"
    >
      <span className="shrink-0 text-success" aria-hidden>
        <CheckCircleIcon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold leading-snug text-surface-900">{title}</div>
        {detail ? <div className="text-sm leading-snug text-surface-600">{detail}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
