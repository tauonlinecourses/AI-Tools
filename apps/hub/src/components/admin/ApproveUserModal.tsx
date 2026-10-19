import { useState, type FormEvent } from "react";
import { Button } from "@workspace/ui";
import type { Locale } from "../../i18n";
import {
  approveAdminUser,
  type AdminGroupRow,
  type AdminUserRow,
} from "../../lib/adminApi";
import { copy } from "./copy";

export function ApproveUserModal({
  locale,
  user,
  allGroups,
  onClose,
  onSaved,
}: {
  locale: Locale;
  user: AdminUserRow;
  allGroups: AdminGroupRow[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = copy(locale);
  const [selected, setSelected] = useState<string[]>(() => {
    if (user.requestedGroupId) return [user.requestedGroupId];
    return user.groups.map((g) => g.id);
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await approveAdminUser({ userId: user.id, groupIds: selected });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setSaving(false);
    }
  }

  const requestedName = user.requestedGroupId
    ? allGroups.find((g) => g.id === user.requestedGroupId)?.name
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="w-full max-w-md rounded-lg border border-surface-200 bg-white p-5 shadow-lg"
        dir={locale === "he" ? "rtl" : "ltr"}
      >
        <h2 className="text-lg font-semibold text-surface-900">
          {t.approveTitle}
        </h2>
        <p className="mt-1 truncate text-sm text-surface-500">{user.email}</p>
        {requestedName && (
          <p className="mt-2 text-xs text-surface-500">
            {t.requestedGroup}: {requestedName}
          </p>
        )}
        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {allGroups.map((g) => (
            <label
              key={g.id}
              className="flex items-center gap-2 text-sm text-surface-700"
            >
              <input
                type="checkbox"
                checked={selected.includes(g.id)}
                onChange={() => toggle(g.id)}
              />
              <span>{g.name}</span>
            </label>
          ))}
        </div>
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            type="submit"
            loading={saving}
            disabled={selected.length === 0}
          >
            {t.approve}
          </Button>
        </div>
      </form>
    </div>
  );
}
