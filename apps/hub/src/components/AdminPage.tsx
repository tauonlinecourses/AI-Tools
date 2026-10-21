import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { PageLayout, Spinner } from "@workspace/ui";
import { usePlatformAuth } from "@workspace/auth/react";
import type { Locale } from "../i18n";
import { SoftPageBg } from "./SoftPageBg";
import {
  fetchAdminGroups,
  fetchAdminUsers,
  rejectAdminUser,
  removeAdminUser,
  type AdminGroupRow,
  type AdminUserRow,
} from "../lib/adminApi";
import { ApproveUserModal } from "./admin/ApproveUserModal";
import { copy } from "./admin/copy";
import { GroupEditorModal } from "./admin/GroupEditorModal";
import { GroupMembersModal } from "./admin/GroupMembersModal";
import { GroupsTab } from "./admin/GroupsTab";
import { InviteUserModal } from "./admin/InviteUserModal";
import { UserGroupsModal } from "./admin/UserGroupsModal";
import { UsersTable } from "./admin/UsersTable";
import {
  UsersToolbar,
  type SortKey,
  type StatusFilter,
} from "./admin/UsersToolbar";

type Tab = "users" | "groups";

export function AdminPage({ locale }: { locale: Locale }) {
  const t = copy(locale);
  const homeHref = locale === "en" ? "/en" : "/";
  const { loading: authLoading, session, isAdmin, accountStatus, user } =
    usePlatformAuth();

  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [groups, setGroups] = useState<AdminGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterGroupId, setFilterGroupId] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("");
  const [sortKey, setSortKey] = useState<SortKey>("email");
  const [editingGroup, setEditingGroup] = useState<AdminGroupRow | null | "new">(
    null
  );
  const [editingUser, setEditingUser] = useState<AdminUserRow | null>(null);
  const [editingGroupMembers, setEditingGroupMembers] =
    useState<AdminGroupRow | null>(null);
  const [inviting, setInviting] = useState(false);
  const [approvingUser, setApprovingUser] = useState<AdminUserRow | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.lang = locale === "he" ? "he" : "en";
    document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
    document.title = t.title;
  }, [locale, t.title]);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [nextUsers, nextGroups] = await Promise.all([
        fetchAdminUsers(),
        fetchAdminGroups(),
      ]);
      setUsers(nextUsers);
      setGroups(nextGroups);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading || !session || !isAdmin) return;
    void reload();
  }, [authLoading, session, isAdmin]);

  const filteredUsers = useMemo(() => {
    let list = users;
    if (filterGroupId) {
      list = list.filter((u) =>
        u.groups.some((g) => g.id === filterGroupId)
      );
    }
    if (filterStatus) {
      list = list.filter((u) => u.status === filterStatus);
    }
    const sorted = [...list];
    if (sortKey === "email") {
      sorted.sort((a, b) => a.email.localeCompare(b.email, "en"));
    } else {
      sorted.sort((a, b) => {
        const ag = a.groups.map((g) => g.name).join(", ");
        const bg = b.groups.map((g) => g.name).join(", ");
        return ag.localeCompare(bg, "he") || a.email.localeCompare(b.email, "en");
      });
    }
    return sorted;
  }, [users, filterGroupId, filterStatus, sortKey]);

  async function onReject(row: AdminUserRow) {
    setActionBusyId(row.id);
    setError(null);
    try {
      await rejectAdminUser(row.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setActionBusyId(null);
    }
  }

  async function onRemove(row: AdminUserRow) {
    if (user?.id && row.id === user.id) {
      setError(t.cannotRemoveSelf);
      return;
    }
    const ok = window.confirm(
      `${t.removeConfirm}\n${row.email || row.displayName || row.id}`
    );
    if (!ok) return;
    setActionBusyId(row.id);
    setError(null);
    try {
      await removeAdminUser(row.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setActionBusyId(null);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Spinner />
      </div>
    );
  }

  if (!session) {
    return <Navigate to={homeHref} replace />;
  }

  if (accountStatus === "pending" || accountStatus === "rejected") {
    return <Navigate to={homeHref} replace />;
  }

  if (!isAdmin) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white px-6"
        dir={locale === "he" ? "rtl" : "ltr"}
      >
        <p className="text-sm text-surface-600">{t.denied}</p>
        <Link
          to={homeHref}
          className="text-sm font-semibold text-surface-900 underline"
        >
          {t.back}
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <SoftPageBg />
      <PageLayout
        locale={locale}
        hubUrl={homeHref}
        toolName="User admin"
        toolDescription="Users, teams, and tool permissions"
        toolNameHe="ניהול משתמשים"
        toolDescriptionHe="משתמשים, צוותים והרשאות כלים"
        maxWidth="xl"
        className="relative z-10 !bg-transparent"
      >
      <div dir={locale === "he" ? "rtl" : "ltr"}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("users")}
            className={[
              "rounded-control px-3 py-1.5 text-xs font-semibold transition-colors",
              tab === "users"
                ? "bg-black text-white"
                : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
            ].join(" ")}
          >
            {t.usersTab}
          </button>
          <button
            type="button"
            onClick={() => setTab("groups")}
            className={[
              "rounded-control px-3 py-1.5 text-xs font-semibold transition-colors",
              tab === "groups"
                ? "bg-black text-white"
                : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
            ].join(" ")}
          >
            {t.groupsTab}
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <div className="mt-10 flex justify-center">
            <Spinner />
          </div>
        ) : tab === "users" ? (
          <div className="mt-6">
            <UsersToolbar
              locale={locale}
              groups={groups}
              filterGroupId={filterGroupId}
              setFilterGroupId={setFilterGroupId}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              sortKey={sortKey}
              setSortKey={setSortKey}
              onInvite={() => setInviting(true)}
            />
            <UsersTable
              locale={locale}
              users={filteredUsers}
              currentUserId={user?.id}
              actionBusyId={actionBusyId}
              onApprove={(u) => setApprovingUser(u)}
              onReject={(u) => void onReject(u)}
              onEdit={(u) => setEditingUser(u)}
              onRemove={(u) => void onRemove(u)}
            />
          </div>
        ) : (
          <GroupsTab
            locale={locale}
            groups={groups}
            onCreate={() => setEditingGroup("new")}
            onEdit={(g) => setEditingGroup(g)}
            onEditMembers={(g) => setEditingGroupMembers(g)}
          />
        )}
      </div>

      {editingGroup !== null && (
        <GroupEditorModal
          locale={locale}
          initial={editingGroup === "new" ? null : editingGroup}
          onClose={() => setEditingGroup(null)}
          onSaved={reload}
        />
      )}

      {editingUser && (
        <UserGroupsModal
          locale={locale}
          user={editingUser}
          allGroups={groups}
          onClose={() => setEditingUser(null)}
          onSaved={(nextGroups) => {
            setUsers((prev) =>
              prev.map((u) =>
                u.id === editingUser.id ? { ...u, groups: nextGroups } : u
              )
            );
            void reload();
          }}
        />
      )}

      {editingGroupMembers && (
        <GroupMembersModal
          locale={locale}
          group={editingGroupMembers}
          allUsers={users}
          onClose={() => setEditingGroupMembers(null)}
          onSaved={reload}
        />
      )}

      {inviting && (
        <InviteUserModal
          locale={locale}
          allGroups={groups}
          onClose={() => setInviting(false)}
          onSaved={reload}
        />
      )}

      {approvingUser && (
        <ApproveUserModal
          locale={locale}
          user={approvingUser}
          allGroups={groups}
          onClose={() => setApprovingUser(null)}
          onSaved={reload}
        />
      )}
      </PageLayout>
    </div>
  );
}
