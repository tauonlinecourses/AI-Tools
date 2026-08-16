import type { VideoProps } from "./types";

/** Infer platform from the URL (YouTube / Panopto / other). */
export function detectVideoProvider(url: string | undefined): NonNullable<VideoProps["provider"]> {
  const raw = url?.trim();
  if (!raw) return "other";

  if (extractYouTubeId(raw)) return "youtube";

  try {
    const host = new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "panopto.com" || host.endsWith(".panopto.com")) return "panopto";
  } catch {
    // fall through
  }

  return "other";
}

/** Resolve an iframe-friendly embed URL, or null if we should keep the placeholder. */
export function resolveVideoEmbedSrc(url: string | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;

  const kind = detectVideoProvider(raw);

  if (kind === "youtube") {
    const id = extractYouTubeId(raw);
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }

  // Panopto Viewer.aspx / Embed.aspx links and unknown hosts: use URL as iframe src.
  return raw;
}

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname.startsWith("/embed/")) {
        const id = u.pathname.split("/")[2];
        return id || null;
      }
      if (u.pathname.startsWith("/shorts/")) {
        const id = u.pathname.split("/")[2];
        return id || null;
      }
      const v = u.searchParams.get("v");
      if (v) return v;
    }
  } catch {
    // fall through
  }

  // Bare 11-char id
  if (/^[\w-]{11}$/.test(url.trim())) return url.trim();
  return null;
}
