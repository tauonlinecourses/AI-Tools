import { Button } from "@workspace/ui";
import type { ButtonAlign, ButtonBlockProps, CourseViewMode } from "../../lib/types";

interface Props {
  props: ButtonBlockProps;
  mode: CourseViewMode;
  onChange: (props: ButtonBlockProps) => void;
}

/** Physical L/C/R — independent of page RTL (wrapper is dir=ltr). */
function justifyClass(align: ButtonAlign): string {
  if (align === "left") return "justify-start";
  if (align === "right") return "justify-end";
  return "justify-center";
}

/**
 * Content button preview. Text, alignment, and URL are edited from the card
 * header popovers in PageContent (edit mode only). Clickable when `url` is set.
 */
export function ButtonBlock({ props }: Props) {
  const align: ButtonAlign = props.align ?? "center";
  const label = props.text?.trim() || "כפתור";
  const href = props.url?.trim() || undefined;

  return (
    <div className={`flex w-full ${justifyClass(align)}`} dir="ltr">
      <Button
        type="button"
        variant="primary"
        size="md"
        tabIndex={href ? 0 : -1}
        title={href ? "פתח קישור" : undefined}
        className={href ? undefined : "cursor-default"}
        onClick={
          href
            ? () => {
                window.open(href, "_blank", "noopener,noreferrer");
              }
            : undefined
        }
      >
        {label}
      </Button>
    </div>
  );
}
