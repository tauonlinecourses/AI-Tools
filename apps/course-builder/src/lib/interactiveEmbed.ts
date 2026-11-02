/**
 * Detect external interactive embeds (Genially, Canva, …) used by MBZ import
 * and by יחידה אינטראקטיבית preview.
 */

const INTERACTIVE_HOST_RE =
  /genially\.com|genial\.ly|canva\.com|thinglink\.com|padlet\.com|miro\.com|flourish\.studio|embedly\.com|figma\.com|bookcreator\.com|wakelet\.com|sutori\.com|prezi\.com/i;

/** True when `url` points at a known interactive-embed host. */
export function isInteractiveEmbedSrc(url: string): boolean {
  if (!url) return false;
  const hay = url.trim();
  if (!hay) return false;
  // Moodle token / relative — not an external interactive host
  if (hay.startsWith("$@") || hay.startsWith("@@") || hay.startsWith("/")) return false;
  try {
    const host = new URL(hay).hostname.toLowerCase();
    return INTERACTIVE_HOST_RE.test(host);
  } catch {
    return INTERACTIVE_HOST_RE.test(hay);
  }
}

/**
 * Return an iframe-ready src, or null when the URL is not an interactive embed.
 * Canva share links get `?embed` when missing so the design can frame.
 */
export function resolveInteractiveEmbedSrc(url: string | null | undefined): string | null {
  const raw = url?.trim() ?? "";
  if (!raw || !isInteractiveEmbedSrc(raw)) return null;

  try {
    const u = new URL(raw);
    if (u.hostname.toLowerCase().includes("canva.com") && !u.searchParams.has("embed")) {
      // Canva's embed flag is a bare `embed` query key (no value).
      const join = u.search ? "&" : "?";
      return `${u.origin}${u.pathname}${u.search}${join}embed${u.hash}`;
    }
    return raw;
  } catch {
    return raw;
  }
}
