import { useEffect, useState, type ReactNode } from "react";
import {
  exchangeHandoffCode,
  getPlatformSession,
  hubHomeUrl,
  hubLoginUrl,
  isPlatformConfigured,
  setPlatformSession,
  assertToolAccess,
  isToolAccessDeniedError,
} from "./client.js";

function hubExchangeUrl(): string {
  const hub =
    (typeof import.meta !== "undefined" &&
      (import.meta as { env?: Record<string, string | undefined> }).env
        ?.VITE_HUB_URL) ||
    (typeof window !== "undefined" && window.location.hostname === "localhost"
      ? "http://localhost:5173"
      : "https://ai-tools-tauonline.vercel.app");
  return `${hub.replace(/\/$/, "")}/api/auth-exchange`;
}

type HandoffTokens = { access_token: string; refresh_token: string };

/** Dedupe StrictMode double-mount / parallel callback exchanges. */
const handoffInflight = new Map<string, Promise<HandoffTokens>>();

function exchangeHandoffOnce(
  code: string,
  exchangeUrl: string
): Promise<HandoffTokens> {
  const existing = handoffInflight.get(code);
  if (existing) return existing;
  const promise = exchangeHandoffCode({ code, exchangeUrl }).finally(() => {
    // Keep resolved promise in the map briefly so remounts reuse it.
  });
  handoffInflight.set(code, promise);
  return promise;
}

function redirectToLogin(): void {
  window.location.href = hubLoginUrl(window.location.href);
}

function redirectToHub(): void {
  window.location.href = hubHomeUrl();
}

/**
 * Ensures a Platform (Course-Builder Auth) session exists and the user may
 * use `toolId`. Handles `/auth/callback?code=` handoff.
 *
 * Direct-link rules:
 * - Not signed in → hub login (`?returnUrl=` back to this tool URL)
 * - Signed in without this tool’s group entitlement → hub home (catalog)
 */
export function ToolAuthGate({
  toolId,
  children,
}: {
  toolId: string;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("Checking session…");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!isPlatformConfigured()) {
        setMessage(
          "Platform auth is not configured (VITE_PLATFORM_SUPABASE_URL / ANON_KEY)."
        );
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const isCallback = window.location.pathname.startsWith("/auth/callback");

      try {
        if (isCallback && code) {
          setMessage("Checking user permissions to the tool…");
          const tokens = await exchangeHandoffOnce(code, hubExchangeUrl());
          await setPlatformSession(tokens);
          await assertToolAccess(toolId);
          if (cancelled) return;
          window.history.replaceState({}, "", "/");
          setReady(true);
          return;
        }

        const session = await getPlatformSession();
        if (!session) {
          redirectToLogin();
          return;
        }
        await assertToolAccess(toolId);
        if (cancelled) return;
        setReady(true);
      } catch (err) {
        if (cancelled) return;

        if (isToolAccessDeniedError(err)) {
          setMessage("You do not have access to this tool");
          redirectToHub();
          return;
        }

        // After a cancelled first StrictMode pass, session may already be set.
        try {
          const session = await getPlatformSession();
          if (session) {
            await assertToolAccess(toolId);
            if (cancelled) return;
            if (isCallback) window.history.replaceState({}, "", "/");
            setReady(true);
            return;
          }
          redirectToLogin();
          return;
        } catch (retryErr) {
          if (cancelled) return;
          if (isToolAccessDeniedError(retryErr)) {
            setMessage("You do not have access to this tool");
            redirectToHub();
            return;
          }
        }

        const msg = err instanceof Error ? err.message : "Access denied";
        setMessage(msg);
        window.setTimeout(() => {
          redirectToLogin();
        }, 1500);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [toolId]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <p className="text-sm text-surface-600">{message}</p>
      </div>
    );
  }

  return <>{children}</>;
}
