import {
  ensureFreshPlatformSession,
  getPlatformSession,
  startToolHandoff,
} from "@workspace/auth/client";
import { toolHref, type Tool } from "../tools.config";

/** Codes live 2 minutes on the server; only reuse one minted well inside that. */
const PREFETCH_MAX_AGE_MS = 60_000;
/** Skip prefetch near access-token expiry, so the tool never gets a stale one. */
const MIN_SESSION_LEFT_MS = 5 * 60_000;

type Prefetched = {
  mintedAt: number;
  /** Refresh token the code carries; reuse only while the hub still has it. */
  refreshToken: string;
  url: Promise<string>;
};

const prefetched = new Map<string, Prefetched>();

/** Mints a hub → tool handoff and resolves to the URL to navigate to (external tools only). */
function mintHandoff(tool: Tool): Promise<string> {
  const href = toolHref(tool);
  const origin = new URL(href).origin;
  const handoffUrl =
    import.meta.env.DEV
      ? "/api/auth-handoff"
      : `${window.location.origin}/api/auth-handoff`;
  return startToolHandoff({
    toolId: tool.id,
    toolOrigin: origin,
    hubHandoffUrl: handoffUrl,
  });
}

/** Open the connection to the tool's site before the click navigates there. */
function preconnectToTool(tool: Tool): void {
  try {
    const origin = new URL(toolHref(tool)).origin;
    if (document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
      return;
    }
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    document.head.appendChild(link);
  } catch {
    // Optimization only.
  }
}

/**
 * Start the handoff while the user is about to open a tool (hover / focus),
 * so the click only has to navigate. Best-effort: any failure is dropped and
 * the click mints normally.
 */
export async function prefetchToolHandoff(tool: Tool): Promise<void> {
  if (tool.hubPath) return;
  preconnectToTool(tool);
  const existing = prefetched.get(tool.id);
  if (existing && Date.now() - existing.mintedAt < PREFETCH_MAX_AGE_MS) return;

  try {
    const session = await ensureFreshPlatformSession();
    const expiresAtMs = (session?.expires_at ?? 0) * 1000;
    if (!session?.refresh_token || expiresAtMs < Date.now() + MIN_SESSION_LEFT_MS) {
      return;
    }
    const entry: Prefetched = {
      mintedAt: Date.now(),
      refreshToken: session.refresh_token,
      url: mintHandoff(tool),
    };
    prefetched.set(tool.id, entry);
    entry.url.catch(() => {
      if (prefetched.get(tool.id) === entry) prefetched.delete(tool.id);
    });
  } catch {
    // Prefetch is an optimization only.
  }
}

/** Resolves to the tool's /auth/callback URL, reusing a fresh prefetch when safe. */
export async function handoffToTool(tool: Tool): Promise<string> {
  const entry = prefetched.get(tool.id);
  prefetched.delete(tool.id);

  if (entry && Date.now() - entry.mintedAt < PREFETCH_MAX_AGE_MS) {
    try {
      const current = await getPlatformSession();
      // A refresh since the prefetch rotated the token the code carries.
      if (current?.refresh_token === entry.refreshToken) {
        return await entry.url;
      }
    } catch {
      // Fall through to a normal handoff.
    }
  }
  return mintHandoff(tool);
}
