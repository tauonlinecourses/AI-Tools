import { Badge, Button } from "@workspace/ui";
import type { Locale } from "../../i18n";
import type { AdminGroupRow } from "../../lib/adminApi";
import { copy } from "./copy";
import { toolLabel } from "./tools";

export function GroupsTab({
  locale,
  groups,
  onCreate,
  onEdit,
  onEditMembers,
}: {
  locale: Locale;
  groups: AdminGroupRow[];
  onCreate: () => void;
  onEdit: (group: AdminGroupRow) => void;
  onEditMembers: (group: AdminGroupRow) => void;
}) {
  const t = copy(locale);
  return (
    <div className="mt-6">
      <div className="mb-4 flex justify-end">
        <Button type="button" onClick={onCreate}>
          {t.createGroup}
        </Button>
      </div>
      {groups.length === 0 ? (
        <p className="text-sm text-surface-500">{t.noGroups}</p>
      ) : (
        <div className="overflow-x-auto border border-surface-200 bg-white">
          <table className="w-full min-w-[40rem] text-center text-sm">
            <thead className="border-b border-surface-200 bg-surface-50 text-xs uppercase tracking-wide text-surface-500">
              <tr>
                <th className="px-4 py-3 font-semibold">{t.groupName}</th>
                <th className="px-4 py-3 font-semibold">{t.groupSlug}</th>
                <th className="px-4 py-3 font-semibold">{t.tools}</th>
                <th className="px-4 py-3 font-semibold">{t.members}</th>
                <th className="px-4 py-3 font-semibold">{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr
                  key={g.id}
                  className="border-b border-surface-100 last:border-0"
                >
                  <td className="px-4 py-3 font-medium text-surface-900">
                    {g.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-surface-500">
                    {g.slug}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-center gap-1">
                      {g.toolIds.length === 0 ? (
                        <span className="text-surface-400">—</span>
                      ) : (
                        g.toolIds.map((id) => (
                          <Badge key={id} size="sm">
                            {toolLabel(locale, id)}
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-surface-600">
                    {g.memberCount}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => onEdit(g)}
                      >
                        {t.edit}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onEditMembers(g)}
                      >
                        {t.editMembers}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
