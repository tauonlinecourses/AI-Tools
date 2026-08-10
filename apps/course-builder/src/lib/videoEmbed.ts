import type { VideoProps } from "./types";

/** Resolve an iframe-friendly embed URL, or null if we should keep the placeholder. */
export function resolveVideoEmbedSrc(
  url: string | undefined,
  provider: VideoProps["provider"]
): string | null {
  const raw = url?.trim();
  if (!raw) return null;

  const kind = provider ?? "youtube";

  if (kind === "youtube") {
    const id = extractYouTubeId(raw);
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }

  if (kind === "panopto") {
    // Panopto Viewer.aspx / Embed.aspx links often work as iframe src as-is.
    return raw;
  }

  // other — try embedding the URL directly
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
