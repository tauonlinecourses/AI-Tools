import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Button, Input, Spinner } from "@workspace/ui";
import { usePlatformAuth } from "@workspace/auth/react";
import type { Locale } from "../i18n";
import { SoftPageBg } from "./SoftPageBg";
import {
  fetchPublicGroups,
  registerAccount,
  type PublicGroup,
} from "../lib/registerApi";

export function RegisterPage({ locale }: { locale: Locale }) {
  const homeHref = locale === "en" ? "/en" : "/";
  const { configured, loading, session, signIn, accountStatus } =
    usePlatformAuth();
  const [groups, setGroups] = useState<PublicGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [groupId, setGroupId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const t =
    locale === "he"
      ? {
          title: "יצירת חשבון",
          subtitle: "לאחר ההרשמה מנהל המערכת צריך לאשר אותך",
          email: "אימייל",
          password: "סיסמה",
          group: "צוות",
          groupPlaceholder: "בחר צוות",
          submit: "הרשמה",
          back: "חזרה להתחברות",
          loadError: "לא ניתן לטעון צוותים",
        }
      : {
          title: "Create account",
          subtitle: "An admin must approve you before you can use the tools",
          email: "Email",
          password: "Password",
          group: "Team",
          groupPlaceholder: "Select a team",
          submit: "Create account",
          back: "Back to sign in",
          loadError: "Could not load teams",
        };

  useEffect(() => {
    document.documentElement.lang = locale === "he" ? "he" : "en";
    document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
    document.title = t.title;
  }, [locale, t.title]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setGroupsLoading(true);
      try {
        const next = await fetchPublicGroups();
        if (!cancelled) {
          setGroups(next);
          if (next.length === 1) setGroupId(next[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t.loadError);
        }
      } finally {
        if (!cancelled) setGroupsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t.loadError]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Spinner />
      </div>
    );
  }

  if (session) {
    if (accountStatus === "pending" || accountStatus === "rejected") {
      return <Navigate to={homeHref} replace />;
    }
    if (accountStatus === "approved") {
      return <Navigate to={homeHref} replace />;
    }
  }

  if (!configured) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-white px-6">
        <SoftPageBg />
        <p className="relative z-10 max-w-md text-center text-sm text-surface-600">
          Platform auth is not configured.
        </p>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await registerAccount({
        email: email.trim(),
        password,
        requestedGroupId: groupId,
      });
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
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
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-surface-900">
              {t.group}
            </label>
            {groupsLoading ? (
              <Spinner size="sm" />
            ) : (
              <select
                className="h-9 rounded-control border border-surface-200 bg-white px-3 text-sm"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                disabled={submitting || groups.length === 0}
                required
              >
                <option value="">{t.groupPlaceholder}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="mt-5 flex flex-col items-center gap-3">
          <Button
            type="submit"
            disabled={
              submitting || !email || !password || !groupId || groupsLoading
            }
          >
            {submitting ? <Spinner size="sm" /> : t.submit}
          </Button>
          <Link
            to={homeHref}
            className="text-sm font-semibold text-surface-700 underline"
          >
            {t.back}
          </Link>
        </div>
      </form>
    </div>
  );
}
