import { useState, type FormEvent } from "react";
import { Button } from "@workspace/ui";
import type { Locale } from "../../i18n";
import {
  saveGroupMembers,
  type AdminGroupRow,
  type AdminUserRow,
} from "../../lib/adminApi";
import { copy } from "./copy";

export function GroupMembersModal({
  locale,
  group,
  allUsers,
  onClose,
  onSaved,
}: {
  locale: Locale;
  group: AdminGroupRow;
  allUsers: AdminUserRow[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = copy(locale);
  const [selected, setSelected] = useState<string[]>(() =>
    allUsers.filter((u) => u.groups.some((g) => g.id === group.id)).map((u) => u.id)
  );
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
      await saveGroupMembers(group.id, selected);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="w-full max-w-md rounded-lg border border-surface-200 bg-white p-5 shadow-lg"
        dir={locale === "he" ? "rtl" : "ltr"}
      >
        <h2 className="text-lg font-semibold text-surface-900">
          {t.editGroupMembers}
        </h2>
        <p className="mt-1 truncate text-sm text-surface-500">{group.name}</p>
        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {allUsers.length === 0 ? (
            <p className="text-xs text-surface-400">{t.noUsers}</p>
          ) : (
            allUsers.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-2 text-sm text-surface-700"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(u.id)}
                  onChange={() => toggle(u.id)}
                />
                <span className="truncate">
                  {u.email || u.displayName || u.id}
                </span>
              </label>
            ))
          )}
        </div>
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" loading={saving}>
            {t.save}
          </Button>
        </div>
      </form>
    </div>
  );
}
