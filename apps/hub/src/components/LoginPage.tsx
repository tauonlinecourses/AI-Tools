import { useState, type FormEvent } from "react";
import { Button, Input, Spinner } from "@workspace/ui";
import { usePlatformAuth } from "@workspace/auth/react";
import type { Locale } from "../i18n";
import { ui } from "../i18n";

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
      <div className="min-h-screen flex items-center justify-center bg-white px-6" dir={t.dir}>
        <p className="text-sm text-surface-600 max-w-md text-center">
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
      className="min-h-screen flex items-center justify-center bg-white px-6"
      dir={t.dir}
      lang={t.htmlLang}
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-md rounded-lg border border-surface-200 bg-white p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.28)]"
      >
        <div className="flex items-center gap-3 mb-4">
          <img src="/logo-narrow.png" alt="Feynman" className="h-10 w-auto" />
          <h1 className="text-xl font-semibold text-surface-900">{t.title}</h1>
        </div>
        <p className="text-sm text-surface-600 mb-5">
          {locale === "he"
            ? "התחברו כדי לראות את הכלים הזמינים עבורכם."
            : "Sign in to see the tools available to you."}
        </p>

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

        <div className="mt-5 flex justify-start">
          <Button type="submit" disabled={submitting || !email || !password}>
            {submitting ? <Spinner size="sm" /> : locale === "he" ? "כניסה" : "Sign in"}
          </Button>
        </div>
      </form>
    </div>
  );
}
