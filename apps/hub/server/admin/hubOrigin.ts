const HUB_PROD_DEFAULT = "https://ai-tools-tauonline.vercel.app";

export function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Live hub origin for invite emails (never localhost — invitees cannot open it). */
function hubOrigin(): string {
  const raw =
    process.env.VITE_HUB_URL?.trim() ||
    process.env.HUB_URL?.trim() ||
    HUB_PROD_DEFAULT;
  const origin = raw.replace(/\/$/, "");
  try {
    if (isLocalHost(new URL(origin).hostname)) return HUB_PROD_DEFAULT;
  } catch {
    return HUB_PROD_DEFAULT;
  }
  return origin;
}

function defaultInviteRedirectTo(): string {
  return `${hubOrigin()}/auth/set-password`;
}

/** Prefer client-provided hub origin; rewrite localhost to live hub. */
export function resolveInviteRedirectTo(redirectTo?: string | null): string {
  const raw = redirectTo?.trim() || "";
  if (!raw) return defaultInviteRedirectTo();
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return defaultInviteRedirectTo();
    }
    if (isLocalHost(url.hostname)) {
      return defaultInviteRedirectTo();
    }
    // Normalize to the set-password route on that origin.
    return `${url.origin}/auth/set-password`;
  } catch {
    return defaultInviteRedirectTo();
  }
}
