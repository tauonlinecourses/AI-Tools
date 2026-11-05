import { DOC_BODY_CLASS, sanitizeForDisplay } from "../lib/docHtml";

interface DocBodyProps {
  body: string;
}

export function DocBody({ body }: DocBodyProps) {
  const html = sanitizeForDisplay(body);
  if (!html) return null;

  if (/<[a-z]/i.test(html)) {
    return (
      <div
        dir="rtl"
        className={DOC_BODY_CLASS}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <p
      dir="rtl"
      className="whitespace-pre-wrap text-right text-sm font-normal text-surface-800"
    >
      {html}
    </p>
  );
}
