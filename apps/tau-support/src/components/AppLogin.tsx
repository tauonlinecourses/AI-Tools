import { useState, type FormEvent } from "react";
import { Button, Input, PageLayout, Spinner } from "@workspace/ui";
import { verifyAppPassword } from "../lib/appAuth";

interface AppLoginProps {
  onSuccess: () => void;
}

export function AppLogin({ onSuccess }: AppLoginProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await verifyAppPassword(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageLayout
      toolName="TAU Support"
      toolDescription="Check campus IL forum threads for new student comments across your courses"
      toolNameHe="תמיכה טכנית - קמפוס IL"
      toolDescriptionHe="ריכוז כל השאלות הטכניות של התלמידים מכלל הקורסים של האוניברסיטה בקמפוס IL"
    >
      <div className="mx-auto flex w-full max-w-md flex-col items-stretch">
        <form
          dir="rtl"
          onSubmit={(e) => void handleSubmit(e)}
          className="rounded-lg border border-surface-200 bg-white p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.28)]"
        >
          <h1 className="text-xl font-semibold text-surface-900">התחברות</h1>
          <p className="mt-1 text-sm text-surface-600">
            הזינו את הסיסמה כדי להיכנס לכלי התמיכה.
          </p>

          <div className="mt-5">
            <Input
              label="סיסמה"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={error ?? undefined}
              disabled={submitting}
            />
          </div>

          <div className="mt-5 flex justify-start">
            <Button
              type="submit"
              variant="primary"
              disabled={submitting || !password}
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" />
                  בודק…
                </span>
              ) : (
                "כניסה"
              )}
            </Button>
          </div>
        </form>
      </div>
    </PageLayout>
  );
}
