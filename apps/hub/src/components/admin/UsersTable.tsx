import { Badge, Button } from "@workspace/ui";
import type { Locale } from "../../i18n";
import type { AdminUserRow } from "../../lib/adminApi";
import { copy, statusLabel } from "./copy";

export function UsersTable({
  locale,
  users,
  currentUserId,
  actionBusyId,
  onApprove,
  onReject,
  onEdit,
  onRemove,
}: {
  locale: Locale;
  users: AdminUserRow[];
  currentUserId: string | undefined;
  actionBusyId: string | null;
  onApprove: (row: AdminUserRow) => void;
  onReject: (row: AdminUserRow) => void;
  onEdit: (row: AdminUserRow) => void;
  onRemove: (row: AdminUserRow) => void;
}) {
  const t = copy(locale);

  if (users.length === 0) {
    return <p className="text-sm text-surface-500">{t.noUsers}</p>;
  }

  return (
    <div className="overflow-x-auto border border-surface-200 bg-white">
      <table className="w-full min-w-[48rem] text-center text-sm">
        <thead className="border-b border-surface-200 bg-surface-50 text-xs uppercase tracking-wide text-surface-500">
          <tr>
            <th className="px-4 py-3 font-semibold">{t.email}</th>
            <th className="px-4 py-3 font-semibold">{t.name}</th>
            <th className="px-4 py-3 font-semibold">{t.status}</th>
            <th className="px-4 py-3 font-semibold">{t.groups}</th>
            <th className="px-4 py-3 font-semibold">{t.actions}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr
              key={u.id}
              className="border-b border-surface-100 last:border-0"
            >
              <td className="px-4 py-3 font-medium text-surface-900">
                {u.email || "—"}
              </td>
              <td className="px-4 py-3 text-surface-600">
                {u.displayName || "—"}
              </td>
              <td className="px-4 py-3">
                <Badge
                  size="sm"
                  variant={
                    u.status === "pending"
                      ? "warning"
                      : u.status === "rejected"
                        ? "danger"
                        : "default"
                  }
                >
                  {statusLabel(locale, u.status)}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap justify-center gap-1">
                  {u.groups.length === 0 ? (
                    <span className="text-surface-400">—</span>
                  ) : (
                    u.groups.map((g) => (
                      <Badge key={g.id} size="sm">
                        {g.name}
                      </Badge>
                    ))
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {u.status === "pending" ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => onApprove(u)}
                        disabled={actionBusyId === u.id}
                      >
                        {t.approve}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onReject(u)}
                        loading={actionBusyId === u.id}
                      >
                        {t.reject}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => onEdit(u)}
                      disabled={actionBusyId === u.id}
                    >
                      {t.edit}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => onRemove(u)}
                    loading={actionBusyId === u.id}
                    disabled={Boolean(currentUserId && u.id === currentUserId)}
                    title={
                      currentUserId && u.id === currentUserId
                        ? t.cannotRemoveSelf
                        : undefined
                    }
                  >
                    {t.remove}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
