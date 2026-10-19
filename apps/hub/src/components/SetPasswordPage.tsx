import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input, Spinner } from "@workspace/ui";
import {
  getPlatformClient,
  isPlatformConfigured,
  updatePlatformPassword,
} from "@workspace/auth/client";
import { usePlatformAuth } from "@workspace/auth/react";
import type { Locale } from "../i18n";
import { SoftPageBg } from "./SoftPageBg";

function urlAuthParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash.replace(/^#/, "");
  const search = window.location.search.replace(/^\?/, "");
  // Prefer hash (implicit / error redirects); fall back to query (PKCE).
  return new URLSearchParams(hash || search);
}

function detectRecoveryFromUrl(): boolean {
  return urlAuthParams().get("type") === "recovery";
}

function authErrorFromUrl(): string | null {
  const params = urlAuthParams();
  const code = params.get("error_code") || params.get("error");
  const description = params.get("error_description");
  if (!code && !description) return null;
  const desc = description?.replace(/\+/g, " ").trim();
  if (desc) return desc;
  return code;
}

export function SetPasswordPage({ locale }: { locale: Locale }) {
  const homeHref = locale === "en" ? "/en" : "/";
  const navigate = useNavigate();
  const { loading, session } = usePlatformAuth();
  const [isRecovery, setIsRecovery] = useState(() => detectRecoveryFromUrl());
  const [linkError] = useState(() => authErrorFromUrl());
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const inviteCopy =
    locale === "he"
      ? {
          title: "הגדרת סיסמה",
          subtitle: "בחר סיסמה להתחברות לפלטפורמה",
          waiting: "ממתין לקישור ההזמנה…",
          noSession:
            "פתח את הקישור מהמייל (או מהקישור שהמנהל שלח) כדי להגדיר סיסמה.",
          linkExpired:
            "הקישור פג תוקף או כבר נוצל. בקשו מהמנהל לשלוח הזמנה חדשה.",
        }
      : {
          title: "Set password",
          subtitle: "Choose a password to sign in to the platform",
          waiting: "Waiting for invite link…",
          noSession:
            "Open the link from your invite email (or the link your admin shared) to set a password.",
          linkExpired:
            "This link is expired or already used. Ask your admin to send a new invite.",
        };

  const recoveryCopy =
    locale === "he"
      ? {
          title: "איפוס סיסמה",
          subtitle: "בחר סיסמה חדשה להתחברות לפלטפורמה",
          waiting: "ממתין לקישור האיפוס…",
          noSession:
            "פתח את הקישור ממייל שחזור הסיסמה כדי לבחור סיסמה חדשה.",
          linkExpired:
            "הקישור פג תוקף או כבר נוצל. בקשו קישור איפוס חדש ממסך ההתחברות.",
        }
      : {
          title: "Reset password",
          subtitle: "Choose a new password to sign in to the platform",
          waiting: "Waiting for reset link…",
          noSession:
            "Open the link from your password reset email to choose a new password.",
          linkExpired:
            "This link is expired or already used. Request a new reset link from the sign-in page.",
        };

  const mode = isRecovery ? recoveryCopy : inviteCopy;

  const t =
    locale === "he"
      ? {
          ...mode,
          password: "סיסמה חדשה",
          confirm: "אימות סיסמה",
          submit: "שמירת סיסמה",
          mismatch: "הסיסמאות אינן תואמות",
          short: "הסיסמה חייבת להכיל לפחות 6 תווים",
          success: "הסיסמה נשמרה. אפשר להמשיך לפלטפורמה.",
          continue: "המשך",
          back: "חזרה להתחברות",
        }
      : {
          ...mode,
          password: "New password",
          confirm: "Confirm password",
          submit: "Save password",
          mismatch: "Passwords do not match",
          short: "Password must be at least 6 characters",
          success: "Password saved. You can continue to the platform.",
          continue: "Continue",
          back: "Back to sign in",
        };

  useEffect(() => {
    document.documentElement.lang = locale === "he" ? "he" : "en";
    document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
    document.title = t.title;
  }, [locale, t.title]);

  useEffect(() => {
    if (detectRecoveryFromUrl()) {
      setIsRecovery(true);
    }
    if (!isPlatformConfigured()) return;
    const client = getPlatformClient();
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (password.length < 6) {
      setError(t.short);
      return;
    }
    if (password !== confirm) {
      setError(t.mismatch);
      return;
    }
    setSubmitting(true);
    try {
      await updatePlatformPassword(password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set password");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Spinner />
      </div>
    );
  }

  if (done) {
    return (
      <div
        className="relative flex min-h-screen items-center justify-center bg-white px-6 pb-24"
        dir={locale === "he" ? "rtl" : "ltr"}
      >
        <SoftPageBg />
        <div className="relative z-10 w-full max-w-md rounded-lg border border-surface-200 bg-white/95 p-6 text-center shadow-[0_4px_6px_-4px_rgba(0,0,0,0.28)]">
          <img
            src="/logo-heb.png"
            alt="Feynman"
            className="mx-auto h-16 w-auto"
          />
          <p className="mt-4 text-sm text-surface-700">{t.success}</p>
          <div className="mt-5 flex justify-center">
            <Button type="button" onClick={() => navigate(homeHref)}>
              {t.continue}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div
        className="relative flex min-h-screen items-center justify-center bg-white px-6 pb-24"
        dir={locale === "he" ? "rtl" : "ltr"}
      >
        <SoftPageBg />
        <div className="relative z-10 w-full max-w-md rounded-lg border border-surface-200 bg-white/95 p-6 text-center shadow-[0_4px_6px_-4px_rgba(0,0,0,0.28)]">
          <img
            src="/logo-heb.png"
            alt="Feynman"
            className="mx-auto h-16 w-auto"
          />
          <h1 className="mt-4 text-xl font-semibold text-surface-900">
            {t.title}
          </h1>
          <p className="mt-3 text-sm text-surface-600">
            {linkError ? t.linkExpired : t.noSession}
          </p>
          {linkError ? (
            <p className="mt-2 text-xs text-red-600" dir="ltr">
              {linkError}
            </p>
          ) : (
            <p className="mt-2 text-xs text-surface-400">{t.waiting}</p>
          )}
          <div className="mt-5">
            <Link
              to={homeHref}
              className="text-sm font-semibold text-surface-700 underline"
            >
              {t.back}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center bg-white px-6 pb-24"
      dir={locale === "he" ? "rtl" : "ltr"}
    >
      <SoftPageBg />
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="relative z-10 w-full max-w-md rounded-lg border border-surface-200 bg-white/95 p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.28)]"
      >
        <div className="mb-5 flex flex-col items-center text-center">
          <img src="/logo-heb.png" alt="Feynman" className="h-16 w-auto" />
          <h1 className="mt-3 text-xl font-semibold text-surface-900">
            {t.title}
          </h1>
          <p className="mt-1 text-sm text-surface-600">{t.subtitle}</p>
        </div>
        <div className="flex flex-col gap-4">
          <Input
            label={t.password}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            autoFocus
          />
          <Input
            label={t.confirm}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={error ?? undefined}
            disabled={submitting}
          />
        </div>
        <div className="mt-5 flex justify-center">
          <Button
            type="submit"
            disabled={submitting || !password || !confirm}
          >
            {submitting ? <Spinner size="sm" /> : t.submit}
          </Button>
        </div>
      </form>
    </div>
  );
}
