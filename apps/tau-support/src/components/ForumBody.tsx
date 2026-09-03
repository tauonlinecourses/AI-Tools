import { toForumHtml, FORUM_BODY_CLASS } from "../lib/forumBody";

interface ForumBodyProps {
  rendered_body?: string;
  raw_body?: string;
}

export function ForumBody({ rendered_body, raw_body }: ForumBodyProps) {
  const html = toForumHtml(rendered_body, raw_body);
  if (!html) return null;

  if (/<[a-z]/i.test(html)) {
    return (
      <div
        dir="rtl"
        className={FORUM_BODY_CLASS}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <p dir="rtl" className="text-sm text-surface-700 whitespace-pre-wrap text-right">
      {html}
    </p>
  );
}
