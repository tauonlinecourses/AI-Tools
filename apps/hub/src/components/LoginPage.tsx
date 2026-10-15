import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Input, Spinner } from "@workspace/ui";
import { usePlatformAuth } from "@workspace/auth/react";
import type { Locale } from "../i18n";
import { ui } from "../i18n";
import { SoftPageBg } from "./SoftPageBg";

const DEFAULT_EMAIL =
  (import.meta.env.VITE_STAFF_LOGIN_EMAIL as string | undefined)?.trim() || "";

export function LoginPage({ locale }: { locale: Locale }) {
  const t = ui[locale];
  const { signIn, configured } = usePlatformAuth();
  const [email, setEmail] = useState(DEFAULT_EMAIL);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!configured) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-white px-6" dir={t.dir}>
        <SoftPageBg />
        <p className="relative z-10 text-sm text-surface-600 max-w-md text-center">
          Platform auth is not configured. Set{" "}
          <code className="text-xs">VITE_PLATFORM_SUPABASE_URL</code> and{" "}
          <code className="text-xs">VITE_PLATFORM_SUPABASE_ANON_KEY</code>{" "}
          (Course-Builder project) on the hub.
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center bg-white px-6 pb-24"
      dir={t.dir}
      lang={t.htmlLang}
    >
      <SoftPageBg />
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="relative z-10 w-full max-w-md rounded-lg border border-surface-200 bg-white/95 p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.28)]"
      >
        <div className="mb-5 flex flex-col items-center text-center">
          <img src="/logo-heb.png" alt="Feynman" className="h-16 w-auto" />
          <h1 className="mt-3 text-xl font-semibold text-surface-900">{t.title}</h1>
          <p className="mt-1 text-sm text-surface-600">{t.subtitle}</p>
        </div>

        <div className="flex flex-col gap-4">
          <Input
            label={locale === "he" ? "אימייל" : "Email"}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            autoFocus={!DEFAULT_EMAIL}
          />
          <Input
            label={locale === "he" ? "סיסמה" : "Password"}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error ?? undefined}
            disabled={submitting}
            autoFocus={Boolean(DEFAULT_EMAIL)}
          />
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <div
            className="flex w-full items-center justify-between"
            // Physical sides: create left, forgot right (ignore page RTL).
            dir="ltr"
          >
            <Link
              to={locale === "en" ? "/en/register" : "/register"}
              className="text-sm font-semibold text-surface-700 underline"
            >
              {locale === "he" ? "יצירת חשבון" : "Create account"}
            </Link>
            <Link
              to={
                locale === "en"
                  ? "/en/auth/forgot-password"
                  : "/auth/forgot-password"
              }
              className="text-sm font-semibold text-surface-700 underline"
              dir={locale === "he" ? "rtl" : undefined}
            >
              {locale === "he" ? "שכחת סיסמה?" : "Forgot password?"}
            </Link>
          </div>
          <div className="flex w-full justify-center">
            <Button type="submit" disabled={submitting || !email || !password}>
              {submitting ? (
                <Spinner size="sm" />
              ) : locale === "he" ? (
                "כניסה"
              ) : (
                "Sign in"
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
