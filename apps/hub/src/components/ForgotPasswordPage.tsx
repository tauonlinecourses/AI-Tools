import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Input, Spinner } from "@workspace/ui";
import { resetPlatformPasswordForEmail } from "@workspace/auth/client";
import { usePlatformAuth } from "@workspace/auth/react";
import type { Locale } from "../i18n";
import { SoftPageBg } from "./SoftPageBg";

export function ForgotPasswordPage({ locale }: { locale: Locale }) {
  const homeHref = locale === "en" ? "/en" : "/";
  const { configured } = usePlatformAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const t =
    locale === "he"
      ? {
          title: "שחזור סיסמה",
          subtitle: "נשלח קישור לאיפוס הסיסמה לאימייל שלך",
          email: "אימייל",
          submit: "שליחת קישור",
          back: "חזרה להתחברות",
          success:
            "אם קיים חשבון עם כתובת זו, נשלח קישור לאיפוס סיסמה. בדקו את תיבת הדואר.",
        }
      : {
          title: "Forgot password",
          subtitle: "We'll send a reset link to your email",
          email: "Email",
          submit: "Send reset link",
          back: "Back to sign in",
          success:
            "If an account exists for that address, we sent a password reset link. Check your inbox.",
        };

  useEffect(() => {
    document.documentElement.lang = locale === "he" ? "he" : "en";
    document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
    document.title = t.title;
  }, [locale, t.title]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      // Same allowlisted path as invites (do not use /en/… — not in Redirect URLs).
      const redirectTo = `${window.location.origin}/auth/set-password`;
      await resetPlatformPasswordForEmail(email, redirectTo);
      setSent(true);
    } catch (err) {
      // Still show success for typical "user not found" style errors to avoid
      // email enumeration; surface unexpected failures.
      const message = err instanceof Error ? err.message : "Request failed";
      const lower = message.toLowerCase();
      if (
        lower.includes("rate") ||
        lower.includes("limit") ||
        lower.includes("network") ||
        lower.includes("fetch")
      ) {
        setError(message);
      } else {
        setSent(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!configured) {
    return (
      <div
        className="relative flex min-h-screen items-center justify-center bg-white px-6"
        dir={locale === "he" ? "rtl" : "ltr"}
      >
        <SoftPageBg />
        <p className="relative z-10 max-w-md text-center text-sm text-surface-600">
          Platform auth is not configured.
        </p>
      </div>
    );
  }

  if (sent) {
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
          <p className="mt-3 text-sm text-surface-700">{t.success}</p>
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
            label={t.email}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error ?? undefined}
            disabled={submitting}
            autoFocus
          />
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <div className="flex w-full justify-center">
            <Button type="submit" disabled={submitting || !email.trim()}>
              {submitting ? <Spinner size="sm" /> : t.submit}
            </Button>
          </div>
          <div className="flex w-full justify-center">
            <Link
              to={homeHref}
              className="text-sm font-semibold text-surface-700 underline"
            >
              {t.back}
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
