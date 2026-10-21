import { Button } from "@workspace/ui";
import type { Locale } from "../../i18n";
import type { AccountStatus, AdminGroupRow } from "../../lib/adminApi";
import { copy } from "./copy";

export type SortKey = "email" | "groups";
export type StatusFilter = "" | AccountStatus;

export function UsersToolbar({
  locale,
  groups,
  filterGroupId,
  setFilterGroupId,
  filterStatus,
  setFilterStatus,
  sortKey,
  setSortKey,
  onInvite,
}: {
  locale: Locale;
  groups: AdminGroupRow[];
  filterGroupId: string;
  setFilterGroupId: (id: string) => void;
  filterStatus: StatusFilter;
  setFilterStatus: (status: StatusFilter) => void;
  sortKey: SortKey;
  setSortKey: (key: SortKey) => void;
  onInvite: () => void;
}) {
  const t = copy(locale);
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[12rem] flex-col gap-1.5">
          <label className="text-sm font-semibold text-surface-900">
            {t.filterLabel}
          </label>
          <select
            className="h-9 rounded-control border border-surface-200 bg-white px-3 text-sm"
            value={filterGroupId}
            onChange={(e) => setFilterGroupId(e.target.value)}
          >
            <option value="">{t.filterAll}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-[10rem] flex-col gap-1.5">
          <label className="text-sm font-semibold text-surface-900">
            {t.status}
          </label>
          <select
            className="h-9 rounded-control border border-surface-200 bg-white px-3 text-sm"
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(e.target.value as StatusFilter)
            }
          >
            <option value="">{t.statusAll}</option>
            <option value="pending">{t.statusPending}</option>
            <option value="approved">{t.statusApproved}</option>
            <option value="rejected">{t.statusRejected}</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSortKey("email")}
            className={[
              "rounded-control px-3 py-1.5 text-xs font-semibold",
              sortKey === "email"
                ? "bg-surface-900 text-white"
                : "border border-surface-200 bg-white text-surface-700",
            ].join(" ")}
          >
            {t.sortEmail}
          </button>
          <button
            type="button"
            onClick={() => setSortKey("groups")}
            className={[
              "rounded-control px-3 py-1.5 text-xs font-semibold",
              sortKey === "groups"
                ? "bg-surface-900 text-white"
                : "border border-surface-200 bg-white text-surface-700",
            ].join(" ")}
          >
            {t.sortGroups}
          </button>
        </div>
      </div>
      <Button type="button" onClick={onInvite}>
        {t.inviteUser}
      </Button>
    </div>
  );
}
