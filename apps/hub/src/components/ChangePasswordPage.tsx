import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Button, Input, Spinner } from "@workspace/ui";
import {
  updatePlatformPassword,
  verifyPlatformPassword,
} from "@workspace/auth/client";
import { usePlatformAuth } from "@workspace/auth/react";
import type { Locale } from "../i18n";
import { SoftPageBg } from "./SoftPageBg";

export function ChangePasswordPage({ locale }: { locale: Locale }) {
  const homeHref = locale === "en" ? "/en" : "/";
  const { loading, session, user } = usePlatformAuth();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const t =
    locale === "he"
      ? {
          title: "שינוי סיסמה",
          subtitle: "הזן את הסיסמה הנוכחית ובחר סיסמה חדשה",
          current: "סיסמה נוכחית",
          password: "סיסמה חדשה",
          confirm: "אימות סיסמה חדשה",
          submit: "שמירת סיסמה",
          mismatch: "הסיסמאות אינן תואמות",
          short: "הסיסמה חייבת להכיל לפחות 6 תווים",
          same: "הסיסמה החדשה חייבת להיות שונה מהנוכחית",
          noEmail: "לא נמצאה כתובת אימייל לחשבון",
          success: "הסיסמה עודכנה בהצלחה.",
          continue: "חזרה לפלטפורמה",
          back: "חזרה",
        }
      : {
          title: "Change password",
          subtitle: "Enter your current password and choose a new one",
          current: "Current password",
          password: "New password",
          confirm: "Confirm new password",
          submit: "Save password",
          mismatch: "Passwords do not match",
          short: "Password must be at least 6 characters",
          same: "New password must be different from the current one",
          noEmail: "No email address found for this account",
          success: "Password updated successfully.",
          continue: "Back to platform",
          back: "Back",
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
    if (!user?.email) {
      setError(t.noEmail);
      return;
    }
    if (password.length < 6) {
      setError(t.short);
      return;
    }
    if (password !== confirm) {
      setError(t.mismatch);
      return;
    }
    if (password === current) {
      setError(t.same);
      return;
    }
    setSubmitting(true);
    try {
      await verifyPlatformPassword(user.email, current);
      await updatePlatformPassword(password);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change password"
      );
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

  if (!session) {
    return <Navigate to={homeHref} replace />;
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
            <Link to={homeHref}>
              <Button type="button">{t.continue}</Button>
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
            label={t.current}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={submitting}
            autoFocus
          />
          <Input
            label={t.password}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
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
        <div className="mt-5 flex flex-col gap-3">
          <div className="flex w-full justify-center">
            <Button
              type="submit"
              disabled={submitting || !current || !password || !confirm}
            >
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
