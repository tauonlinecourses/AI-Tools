/** Write plain text, optionally with rich HTML for paste into Word / Moodle / Docs. */
export async function writeClipboard(opts: { html?: string; plain: string }): Promise<void> {
  const plain = opts.plain;
  const html = opts.html?.trim();

  if (html && typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": Promise.resolve(new Blob([html], { type: "text/html" })),
          "text/plain": Promise.resolve(new Blob([plain], { type: "text/plain" })),
        }),
      ]);
      return;
    } catch {
      // Fall through to plain-text copy.
    }
  }

  await navigator.clipboard.writeText(plain);
}
