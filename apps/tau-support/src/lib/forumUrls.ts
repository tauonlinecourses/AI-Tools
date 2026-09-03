/**
 * Build links to threads on the campus IL discussions UI (Open edX MFE).
 * Verified paths return 200 on app.campus.gov.il.
 */
export function buildForumThreadUrl(
  forumUiOrigin: string,
  courseId: string,
  threadId: string,
  categoryName?: string
): string {
  const base = forumUiOrigin.replace(/\/$/, "");
  const trimmedCategory = categoryName?.trim();

  if (trimmedCategory) {
    return `${base}/discussions/${courseId}/category/${encodeURIComponent(trimmedCategory)}/posts/${threadId}`;
  }

  return `${base}/discussions/${courseId}/posts/${threadId}`;
}
