import { Button } from "@workspace/ui";
import { usePlatformAuth } from "@workspace/auth/react";
import type { Locale } from "../i18n";
import { SoftPageBg } from "./SoftPageBg";

export function AccountStatusPage({
  locale,
  status,
}: {
  locale: Locale;
  status: "pending" | "rejected";
}) {
  const { signOut, user } = usePlatformAuth();
  const dir = locale === "he" ? "rtl" : "ltr";

  const copy =
    status === "pending"
      ? locale === "he"
        ? {
            title: "ממתין לאישור",
            body: "החשבון נוצר בהצלחה. מנהל המערכת צריך לאשר אותך לפני שתוכל להשתמש בכלים.",
            signOut: "התנתקות",
          }
        : {
            title: "Pending approval",
            body: "Your account was created. An admin must approve you before you can use the tools.",
            signOut: "Sign out",
          }
      : locale === "he"
        ? {
            title: "החשבון לא אושר",
            body: "בקשת ההרשמה שלך נדחתה. פנה למנהל המערכת אם מדובר בטעות.",
            signOut: "התנתקות",
          }
        : {
            title: "Account rejected",
            body: "Your registration was rejected. Contact an admin if this is a mistake.",
            signOut: "Sign out",
          };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center bg-white px-6 pb-24"
      dir={dir}
    >
      <SoftPageBg />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-surface-200 bg-white/95 p-6 text-center shadow-[0_4px_6px_-4px_rgba(0,0,0,0.28)]">
        <img
          src="/logo-heb.png"
          alt="Feynman"
          className="mx-auto h-16 w-auto"
        />
        <h1 className="mt-4 text-xl font-semibold text-surface-900">
          {copy.title}
        </h1>
        {user?.email && (
          <p className="mt-1 text-sm text-surface-500" dir="ltr">
            {user.email}
          </p>
        )}
        <p className="mt-3 text-sm text-surface-600">{copy.body}</p>
        <div className="mt-6 flex justify-center">
          <Button type="button" variant="secondary" onClick={() => void signOut()}>
            {copy.signOut}
          </Button>
        </div>
      </div>
    </div>
  );
}
