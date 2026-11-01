import type { MbzFileRef } from "./types";
import { unescapeXmlEntities } from "./xml";

const UNRESOLVED_RE = /\$@[^@]+@\$/g;

export type ResolveBlobUrl = (ref: MbzFileRef) => string;

export function buildFileIndex(files: MbzFileRef[]): Map<string, MbzFileRef> {
  const map = new Map<string, MbzFileRef>();
  for (const f of files) {
    map.set(f.originalFilename, f);
    try {
      map.set(decodeURIComponent(f.originalFilename), f);
    } catch {
      /* ignore */
    }
  }
  return map;
}

export function resolvePluginfiles(
  html: string,
  fileIndex: Map<string, MbzFileRef>,
  resolveBlobUrl: ResolveBlobUrl
): { html: string; referencedFiles: MbzFileRef[]; unresolvedTokens: string[] } {
  const referenced: MbzFileRef[] = [];
  const seen = new Set<string>();

  const lookup = (encodedName: string): string => {
    let name = encodedName;
    try {
      name = decodeURIComponent(encodedName.replace(/\+/g, " "));
    } catch {
      name = encodedName;
    }
    const ref = fileIndex.get(name) || fileIndex.get(encodedName);
    if (!ref) return `@@PLUGINFILE@@/${encodedName}`;
    if (!seen.has(ref.hash)) {
      seen.add(ref.hash);
      referenced.push(ref);
    }
    // Stable placeholder persisted in IDB; UI hydrates to real blob: URLs
    void resolveBlobUrl(ref);
    return `mbz-blob:${ref.hash}`;
  };

  let out = html.replace(
    /(src|href)=["']@@PLUGINFILE@@\/([^"']+)["']/gi,
    (_m, attr: string, encoded: string) => `${attr}="${lookup(encoded)}"`
  );

  out = out.replace(/@@PLUGINFILE@@\/([^\s"'<>]+)/gi, (_m, encoded: string) =>
    lookup(encoded)
  );

  const unresolvedTokens: string[] = [];
  const found = out.match(UNRESOLVED_RE);
  if (found) {
    for (const t of found) {
      if (!unresolvedTokens.includes(t)) unresolvedTokens.push(t);
    }
  }

  // Fix tokens inside href/src attribute values — replace with "#" and flag the element
  const resolvedHrefs = new Set<string>();
  out = out.replace(
    /(href|src)=(["'])\$@([^@]+)@\$\2/gi,
    (_m, attr: string, quote: string, inner: string) => {
      const token = `$@${inner}@$`;
      resolvedHrefs.add(token);
      if (!unresolvedTokens.includes(token)) unresolvedTokens.push(token);
      return `${attr}=${quote}#${quote} title=${quote}Unresolved link${quote} data-mbz-unresolved=${quote}${encodeURIComponent(token)}${quote}`;
    }
  );

  // Tokens that appeared as body text and match an href we already replaced:
  // strip them so the button/link just shows its surrounding label text.
  // If there's no other label, replace with a short readable placeholder.
  out = out.replace(UNRESOLVED_RE, (token) => {
    if (resolvedHrefs.has(token)) {
      // This token is link text that duplicates the href — remove it
      return "";
    }
    return `<span data-mbz-unresolved="${encodeURIComponent(token)}" class="mbz-unresolved-token">${token}</span>`;
  });

  // Clean up links that now have empty text (Moodle sometimes uses the token as the only content)
  out = out.replace(
    /(<a\s[^>]*data-mbz-unresolved=[^>]*>)\s*(<\/a>)/gi,
    (_m, open: string, close: string) => `${open}[unresolved link]${close}`
  );

  return { html: out, referencedFiles: referenced, unresolvedTokens };
}

export function decodeHtmlField(
  escaped: string,
  fileIndex: Map<string, MbzFileRef>,
  resolveBlobUrl: ResolveBlobUrl
) {
  const unescaped = unescapeXmlEntities(escaped);
  return resolvePluginfiles(unescaped, fileIndex, resolveBlobUrl);
}
