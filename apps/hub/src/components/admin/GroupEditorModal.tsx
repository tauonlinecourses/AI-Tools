import { useState, type FormEvent } from "react";
import { Button, Input } from "@workspace/ui";
import type { Locale } from "../../i18n";
import { createGroup, updateGroup, type AdminGroupRow } from "../../lib/adminApi";
import { copy } from "./copy";
import { GROUP_FORM_TOOL_IDS, toolLabel } from "./tools";

export function GroupEditorModal({
  locale,
  initial,
  onClose,
  onSaved,
}: {
  locale: Locale;
  initial: AdminGroupRow | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = copy(locale);
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  // Only catalog tools from this branch — ignore WIP ids (e.g. virtual-support)
  // that live in the DB from other branches; the API preserves those on save.
  const [toolIds, setToolIds] = useState<string[]>(
    (initial?.toolIds ?? []).filter((id) =>
      (GROUP_FORM_TOOL_IDS as readonly string[]).includes(id)
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTool(id: string) {
    setToolIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        await updateGroup({
          id: initial.id,
          name,
          slug,
          description,
          toolIds,
        });
      } else {
        await createGroup({ name, slug, description, toolIds });
      }
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
        className="w-full max-w-lg rounded-lg border border-surface-200 bg-white p-5 shadow-lg"
        dir={locale === "he" ? "rtl" : "ltr"}
      >
        <h2 className="text-lg font-semibold text-surface-900">
          {initial ? t.editGroup : t.createGroup}
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          <Input
            label={t.groupName}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label={t.groupSlug}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            hint={t.slugHint}
            required={Boolean(initial)}
          />
          <Input
            label={t.groupDesc}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <fieldset>
            <legend className="text-sm font-semibold text-surface-900">
              {t.tools}
            </legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {GROUP_FORM_TOOL_IDS.map((id) => (
                <label
                  key={id}
                  className="flex items-center gap-2 text-sm text-surface-700"
                >
                  <input
                    type="checkbox"
                    checked={toolIds.includes(id)}
                    onChange={() => toggleTool(id)}
                  />
                  {toolLabel(locale, id)}
                </label>
              ))}
            </div>
          </fieldset>
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
