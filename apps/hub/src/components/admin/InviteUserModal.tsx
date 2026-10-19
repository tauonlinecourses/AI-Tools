import { useState, type FormEvent } from "react";
import { Badge, Button, Input } from "@workspace/ui";
import type { Locale } from "../../i18n";
import {
  inviteAdminUser,
  sendAdminInviteEmail,
  type AdminGroupRow,
  type AdminUserRow,
} from "../../lib/adminApi";
import { copy, statusLabel } from "./copy";
import { CopyIcon, MailIcon } from "./icons";

export function InviteUserModal({
  locale,
  allGroups,
  onClose,
  onSaved,
}: {
  locale: Locale;
  allGroups: AdminGroupRow[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = copy(locale);
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdUser, setCreatedUser] = useState<AdminUserRow | null>(null);
  const [actionLink, setActionLink] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [copied, setCopied] = useState(false);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setError(null);
    setCopied(false);
    setEmailSent(false);
    try {
      const res = await inviteAdminUser({
        email,
        groupIds: selected,
      });
      setCreatedUser(res.user);
      setActionLink(res.actionLink);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setCreating(false);
    }
  }

  async function onSendEmail() {
    if (!createdUser || sendingEmail) return;
    setSendingEmail(true);
    setError(null);
    try {
      const res = await sendAdminInviteEmail(createdUser.email);
      setCreatedUser(res.user);
      // Email uses a new one-time token; any prior copyable link is dead.
      setActionLink(null);
      setEmailSent(true);
      setCopied(false);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Email failed");
    } finally {
      setSendingEmail(false);
    }
  }

  async function copyLink() {
    if (!actionLink) return;
    try {
      await navigator.clipboard.writeText(actionLink);
      setCopied(true);
    } catch {
      setError(actionLink);
    }
  }

  const canCreate =
    Boolean(email.trim()) && selected.length > 0 && !creating;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-lg border border-surface-200 bg-white p-5 shadow-lg"
        dir={locale === "he" ? "rtl" : "ltr"}
      >
        <h2 className="text-lg font-semibold text-surface-900">
          {t.inviteTitle}
        </h2>

        {createdUser ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm font-medium text-surface-700">
              {t.inviteSuccess}
            </p>
            <dl className="space-y-2 rounded-control border border-surface-200 bg-surface-50 p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-surface-500">{t.email}</dt>
                <dd className="font-medium text-surface-900" dir="ltr">
                  {createdUser.email}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-surface-500">{t.name}</dt>
                <dd className="font-medium text-surface-900">
                  {createdUser.displayName || "—"}
                </dd>
              </div>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <dt className="text-surface-500">{t.groups}</dt>
                <dd className="flex flex-wrap justify-end gap-1">
                  {createdUser.groups.length === 0 ? (
                    <span className="text-surface-400">—</span>
                  ) : (
                    createdUser.groups.map((g) => (
                      <Badge key={g.id} size="sm">
                        {g.name}
                      </Badge>
                    ))
                  )}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-surface-500">{t.status}</dt>
                <dd>
                  <Badge size="sm" variant="success">
                    {statusLabel(locale, createdUser.status)}
                  </Badge>
                </dd>
              </div>
            </dl>

            <p className="text-xs font-semibold text-surface-500">
              {emailSent ? t.emailSentHint : t.inviteShareHint}
            </p>

            {actionLink && (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-surface-900">
                  {t.inviteLinkLabel}
                </label>
                <div className="flex items-stretch gap-2" dir="ltr">
                  <input
                    type="text"
                    readOnly
                    value={actionLink}
                    className="h-9 min-w-0 flex-1 truncate rounded-control border border-surface-200 bg-white px-3 text-xs text-surface-700"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    leftIcon={<CopyIcon />}
                    onClick={() => void copyLink()}
                    aria-label={copied ? t.linkCopied : t.copyLink}
                  >
                    {copied ? t.linkCopied : t.copyLink}
                  </Button>
                </div>
              </div>
            )}

            {!emailSent && (
              <Button
                type="button"
                leftIcon={<MailIcon />}
                loading={sendingEmail}
                disabled={sendingEmail}
                onClick={() => void onSendEmail()}
              >
                {t.sendInviteEmail}
              </Button>
            )}
            {emailSent && (
              <p className="text-sm font-medium text-surface-700">{t.emailSent}</p>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex justify-end">
              <Button type="button" onClick={onClose}>
                {t.done}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void onCreate(e)} className="mt-4">
            <div className="space-y-3">
              <Input
                label={t.email}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={creating}
                autoFocus
              />
              <div className="max-h-64 space-y-2 overflow-y-auto">
                <p className="text-sm font-semibold text-surface-900">
                  {t.groups}
                </p>
                {allGroups.map((g) => (
                  <label
                    key={g.id}
                    className="flex items-center gap-2 text-sm text-surface-700"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(g.id)}
                      onChange={() => toggle(g.id)}
                      disabled={creating}
                    />
                    <span>{g.name}</span>
                  </label>
                ))}
              </div>
            </div>
            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={creating}
                onClick={onClose}
              >
                {t.cancel}
              </Button>
              <Button type="submit" loading={creating} disabled={!canCreate}>
                {t.createUser}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
