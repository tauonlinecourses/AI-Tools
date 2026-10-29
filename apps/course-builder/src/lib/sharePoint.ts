/** SharePoint / OneDrive "Copy link" parsing → embed / download URLs. */

export type SharePointLinkKind = "v" | "i" | "b" | "w" | "x" | "p" | string;

export interface ParsedSharePointLink {
  host: string;
  /** e.g. `/sites/Shakespeare`, `/teams/MyTeam`, or `/personal/user_tenant` */
  sitePath: string;
  kind: SharePointLinkKind;
  /**
   * File UniqueId when known (sharing-token, `d=w…`, or `UniqueId=` query).
   * Not set for Stream address-bar links that only have a path `id=` —
   * those embed via path, because `referrerScenario` GUIDs are view IDs, not file IDs.
   */
  guid?: string;
  /**
   * Server-relative file path when the link includes one
   * (`/r/` shares or `stream.aspx?id=`), e.g. `/personal/user/Documents/a.mp4`.
   */
  filePath?: string;
}

/** Site/team sharing-token links: `/:v:/s/Site/IQtoken` or `/:i:/t/Team/IQtoken`. */
const TOKEN_PATH_RE = /^\/:([a-z]):\/([st])\/([^/]+)\/([A-Za-z0-9_-]+)/i;

/**
 * Path-based shares (often OneDrive personal):
 * `/:i:/r/personal/user/Documents/.../file.png?d=w{guid}`
 * also `/sites/` and `/teams/` under `/r/`.
 */
const RESOURCE_PATH_RE =
  /^\/:([a-z]):\/r\/((?:personal|sites|teams)\/[^/]+)(\/.*)?$/i;

/**
 * Stream / embed player pages copied from the address bar:
 * `/personal/user/_layouts/15/stream.aspx?id=...`
 * (same for `/sites/…` and `/teams/…`; also `embed.aspx?UniqueId=`).
 */
const LAYOUTS_MEDIA_RE =
  /^\/((?:personal|sites|teams)\/[^/]+)\/_layouts\/15\/(stream|embed)\.aspx$/i;

const DASHED_GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMBED_QS =
  "embed=%7B%22ust%22%3Atrue%2C%22hv%22%3A%22CopyEmbedCode%22%7D" +
  "&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create";

/** Normalize pasted text into a URL string (adds https:// when missing). */
function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9.-]+\.sharepoint\.com\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return null;
}

/** Cheap host check — does not decode the token. */
export function isSharePointUrl(url: string | undefined): boolean {
  const normalized = url ? normalizeUrl(url) : null;
  if (!normalized) return false;
  try {
    const host = new URL(normalized).hostname.replace(/^www\./, "").toLowerCase();
    return host === "sharepoint.com" || host.endsWith(".sharepoint.com");
  } catch {
    return false;
  }
}

/**
 * Decode the undocumented SharePoint sharing-token GUID.
 * Token format for "IQ..." links: first byte 0x21, then 16 GUID bytes
 * (first three groups little-endian).
 */
function decodeSharingTokenGuid(token: string): string | null {
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    if (bytes.length < 18) return null;
    // Only the documented "IQ..." / 0x21 token format is trusted.
    if (bytes[0] !== 0x21) return null;

    const h = Array.from(bytes.slice(2, 18), (x) =>
      x.toString(16).padStart(2, "0")
    );
    return (
      [h[3], h[2], h[1], h[0]].join("") +
      "-" +
      h[5] +
      h[4] +
      "-" +
      h[7] +
      h[6] +
      "-" +
      h[8] +
      h[9] +
      "-" +
      h.slice(10).join("")
    );
  } catch {
    return null;
  }
}

/**
 * GUID from OneDrive/SharePoint `d=` / `UniqueId=` (`d=w{32hex}` or dashed GUID).
 */
function guidFromDParam(d: string | null): string | null {
  if (!d) return null;
  if (DASHED_GUID_RE.test(d)) return d.toLowerCase();

  // Common form: leading type letter(s) + 32 hex, e.g. w71545dc57b204d0a8b7911097fba375f
  const hex = d.replace(/^[a-z]+/i, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  const h = hex.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function buildEmbedByUniqueId(host: string, sitePath: string, guid: string): string {
  return (
    `https://${host}${sitePath}/_layouts/15/embed.aspx` +
    `?UniqueId=${guid}&${EMBED_QS}`
  );
}

function buildEmbedByPath(host: string, sitePath: string, filePath: string): string {
  return (
    `https://${host}${sitePath}/_layouts/15/embed.aspx` +
    `?id=${encodeURIComponent(filePath)}&${EMBED_QS}`
  );
}

/**
 * Parse a SharePoint / OneDrive media URL.
 * Supports:
 * - `/:k:/s/site/token` and `/:k:/t/team/token` (sharing-token / IQ…)
 * - `/:k:/r/personal|sites|teams/.../file?d=w{guid}` (path-based, often OneDrive)
 * - `/personal|sites|teams/.../_layouts/15/stream.aspx?id=` (address-bar Stream link)
 * - `/…/_layouts/15/embed.aspx?UniqueId=` (already-embeddable)
 */
export function parseSharePointLink(
  copyLink: string | undefined
): ParsedSharePointLink | null {
  const normalized = copyLink ? normalizeUrl(copyLink) : null;
  if (!normalized) return null;

  try {
    const u = new URL(normalized);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "sharepoint.com" && !host.endsWith(".sharepoint.com")) {
      return null;
    }

    const tokenMatch = u.pathname.match(TOKEN_PATH_RE);
    if (tokenMatch) {
      const [, kindRaw, siteOrTeam, site, token] = tokenMatch;
      const guid = decodeSharingTokenGuid(token);
      if (!guid) return null;

      const sitePath =
        siteOrTeam.toLowerCase() === "t" ? `/teams/${site}` : `/sites/${site}`;

      return {
        host: u.host,
        sitePath,
        kind: kindRaw.toLowerCase(),
        guid,
      };
    }

    const resourceMatch = u.pathname.match(RESOURCE_PATH_RE);
    if (resourceMatch) {
      const [, kindRaw, siteRoot, rest] = resourceMatch;
      const guid =
        guidFromDParam(u.searchParams.get("d")) ||
        guidFromDParam(u.searchParams.get("UniqueId"));
      if (!guid) return null;

      const filePath =
        rest && rest.length > 1 ? `/${siteRoot}${rest}` : undefined;

      return {
        host: u.host,
        sitePath: `/${siteRoot}`,
        kind: kindRaw.toLowerCase(),
        guid,
        filePath,
      };
    }

    const layoutsMatch = u.pathname.match(LAYOUTS_MEDIA_RE);
    if (layoutsMatch) {
      const [, siteRoot] = layoutsMatch;
      // Only trust UniqueId= — referrerScenario GUIDs are view/session IDs and
      // produce "File Not Found" if used as UniqueId.
      const guid = guidFromDParam(u.searchParams.get("UniqueId")) || undefined;
      const idPath = u.searchParams.get("id") || undefined;
      if (!guid && !idPath) return null;

      return {
        host: u.host,
        sitePath: `/${siteRoot}`,
        kind: "v",
        guid,
        filePath: idPath,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * iframe-friendly embed.aspx URL, or null if the link can't be converted.
 * Prefers real UniqueId; for Stream address-bar links falls back to path `id=`.
 */
export function sharePointEmbedUrl(copyLink: string | undefined): string | null {
  const parsed = parseSharePointLink(copyLink);
  if (!parsed) return null;

  if (parsed.guid) {
    return buildEmbedByUniqueId(parsed.host, parsed.sitePath, parsed.guid);
  }
  if (parsed.filePath) {
    return buildEmbedByPath(parsed.host, parsed.sitePath, parsed.filePath);
  }
  return null;
}

/**
 * Best-effort image bytes URL for `<img src>` (`download.aspx?UniqueId=`).
 * Only for `:i:` image share links with a known UniqueId; returns null otherwise.
 */
export function sharePointImageSrc(copyLink: string | undefined): string | null {
  const parsed = parseSharePointLink(copyLink);
  if (!parsed || parsed.kind !== "i" || !parsed.guid) return null;
  return (
    `https://${parsed.host}${parsed.sitePath}/_layouts/15/download.aspx` +
    `?UniqueId=${parsed.guid}`
  );
}
