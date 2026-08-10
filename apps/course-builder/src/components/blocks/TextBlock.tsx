import { useEffect, useRef } from "react";
import type { CourseViewMode, TextProps } from "../../lib/types";

interface Props {
  props: TextProps;
  mode: CourseViewMode;
  onChange: (props: TextProps) => void;
}

/** Shared typography so edit textarea and read-only paragraph measure the same. */
const textClass =
  "w-full p-0 m-0 text-base text-surface-900 whitespace-pre-wrap leading-relaxed";

function AutoGrowTextarea({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${textClass} block bg-transparent border-0 outline-none resize-none overflow-hidden placeholder:text-surface-400`}
    />
  );
}

export function TextBlock({ props, mode, onChange }: Props) {
  if (mode !== "edit") {
    return props.markdown?.trim() ? (
      <p className={textClass}>{props.markdown}</p>
    ) : (
      <p className="text-base text-surface-400">אין תוכן</p>
    );
  }

  return (
    <AutoGrowTextarea
      value={props.markdown ?? ""}
      placeholder="כתבו כאן את תוכן הטקסט..."
      onChange={(markdown) => onChange({ ...props, markdown })}
    />
  );
}
