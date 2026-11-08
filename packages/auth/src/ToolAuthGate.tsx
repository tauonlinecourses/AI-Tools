import { useEffect, useState, type ReactNode } from "react";
import {
  exchangeHandoffCode,
  getPlatformClient,
  getPlatformSession,
  hubHomeUrl,
  hubLoginUrl,
  isPlatformConfigured,
  setPlatformSession,
  setPlatformSessionEndedListener,
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
 * Shown over the tool when its login has ended. It waits for a click so the
 * user can copy unsaved work first. Inline styles: this package is not part of
 * every tool's Tailwind content.
 */
function SessionEndedBanner() {
  return (
    <div
      role="alert"
      dir="rtl"
      style={{
        position: "fixed",
        top: 60, // just below the 48px PageLayout header
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        width: 560,
        maxWidth: "calc(100vw - 24px)",
        boxSizing: "border-box",
        padding: "12px 16px",
        borderRadius: 6,
        border: "1px solid #111827",
        background: "#ffffff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 280px" }}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#f59e0b"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          style={{ flexShrink: 0 }}
        >
          <path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
        <div>
          <div style={{ fontSize: 14, lineHeight: "20px", fontWeight: 600, color: "#111827" }}>
            החיבור שלך הסתיים
          </div>
          <div style={{ fontSize: 12, lineHeight: "16px", color: "#4b5563" }}>
            יש להתחבר מחדש כדי להמשיך. שינויים שלא נשמרו יאבדו.
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={redirectToLogin}
        style={{
          height: 36,
          padding: "0 16px",
          borderRadius: 6,
          border: "1px solid #000000",
          background: "#000000",
          color: "#ffffff",
          fontSize: 14,
          fontWeight: 600,
          fontFamily: "inherit",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        התחברות מחדש
      </button>
    </div>
  );
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
  const [sessionEnded, setSessionEnded] = useState(false);

  useEffect(() => {
    if (!isPlatformConfigured()) return;
    setPlatformSessionEndedListener(() => setSessionEnded(true), {
      holdRequests: true,
    });
    const { data: sub } = getPlatformClient().auth.onAuthStateChange(
      (event, next) => {
        if (event === "SIGNED_OUT") setSessionEnded(true);
        else if (next) setSessionEnded(false);
      }
    );
    return () => {
      setPlatformSessionEndedListener(null);
      sub.subscription.unsubscribe();
    };
  }, []);

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
          // Handoff mint already verified approved + tool access; skip a second
          // entitlement RPC so entry feels instant after exchange.
          setMessage("Signing in…");
          const tokens = await exchangeHandoffOnce(code, hubExchangeUrl());
          await setPlatformSession(tokens);
          if (cancelled) return;
          window.history.replaceState({}, "", "/");
          setReady(true);
          return;
        }

        setMessage("Checking user permissions to the tool…");
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
            // Callback path already trusted the handoff; only re-check on
            // direct visits where exchange did not run in this attempt.
            if (!isCallback) {
              await assertToolAccess(toolId);
            }
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

  return (
    <>
      {sessionEnded ? <SessionEndedBanner /> : null}
      {children}
    </>
  );
}
