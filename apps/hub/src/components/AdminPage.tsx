import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Badge, Button, Input, PageLayout, Spinner } from "@workspace/ui";
import { PLATFORM_TOOL_IDS } from "@workspace/auth/client";
import { usePlatformAuth } from "@workspace/auth/react";
import type { Locale } from "../i18n";
import { SoftPageBg } from "./SoftPageBg";
import {
  createGroup,
  fetchAdminGroups,
  fetchAdminUsers,
  saveGroupMembers,
  saveUserGroups,
  updateGroup,
  type AdminGroupRow,
  type AdminUserRow,
} from "../lib/adminApi";

/** Tools shown in the group create/edit form (excludes internal/dev starter). */
const GROUP_FORM_TOOL_IDS = PLATFORM_TOOL_IDS.filter(
  (id) => id !== "tool-starter"
);

const TOOL_LABELS: Record<string, { he: string; en: string }> = {
  "video-curator": { he: "ניתוח וידאו", en: "Video Curator" },
  "course-builder": { he: "פיתוח קורסים", en: "Course Builder" },
  "mbz-explorer": { he: "ניתוח MBZ", en: "MBZ Explorer" },
  "tau-support": { he: "תמיכה טכנית", en: "TAU Support" },
};

type Tab = "users" | "groups";
type SortKey = "email" | "groups";

function toolLabel(locale: Locale, toolId: string): string {
  const labels = TOOL_LABELS[toolId];
  if (!labels) return toolId;
  return locale === "he" ? labels.he : labels.en;
}

function copy(locale: Locale) {
  if (locale === "he") {
    return {
      title: "ניהול משתמשים",
      subtitle: "משתמשים, קבוצות והרשאות כלים",
      back: "חזרה לכלים",
      usersTab: "משתמשים",
      groupsTab: "קבוצות",
      filterAll: "כל הקבוצות",
      filterLabel: "סינון לפי קבוצה",
      sortEmail: "מיון לפי אימייל",
      sortGroups: "מיון לפי קבוצות",
      email: "אימייל",
      name: "שם",
      groups: "קבוצות",
      actions: "פעולות",
      edit: "עריכה",
      noUsers: "אין משתמשים",
      noGroups: "אין קבוצות",
      createGroup: "קבוצה חדשה",
      editGroup: "עריכת קבוצה",
      save: "שמירה",
      cancel: "ביטול",
      groupName: "שם הקבוצה",
      groupSlug: "מזהה (slug)",
      groupDesc: "תיאור",
      tools: "כלים",
      members: "חברים",
      editUser: "עריכת קבוצות למשתמש",
      editMembers: "עריכת חברים",
      editGroupMembers: "עריכת חברי קבוצה",
      denied: "אין לך הרשאת מנהל",
      slugHint: "אותיות לטיניות בלבד (למשל learning-systems-team)",
    };
  }
  return {
    title: "User admin",
    subtitle: "Users, groups, and tool permissions",
    back: "Back to tools",
    usersTab: "Users",
    groupsTab: "Groups",
    filterAll: "All groups",
    filterLabel: "Filter by group",
    sortEmail: "Sort by email",
    sortGroups: "Sort by groups",
    email: "Email",
    name: "Name",
    groups: "Groups",
    actions: "Actions",
    edit: "Edit",
    noUsers: "No users",
    noGroups: "No groups",
    createGroup: "New group",
    editGroup: "Edit group",
    save: "Save",
    cancel: "Cancel",
    groupName: "Group name",
    groupSlug: "Slug",
    groupDesc: "Description",
    tools: "Tools",
    members: "Members",
    editUser: "Edit user groups",
    editMembers: "Edit members",
    editGroupMembers: "Edit group members",
    denied: "Admin access required",
    slugHint: "Latin letters only (e.g. learning-systems-team)",
  };
}

function GroupEditorModal({
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
  const [toolIds, setToolIds] = useState<string[]>(
    (initial?.toolIds ?? []).filter((id) => id !== "tool-starter")
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

function UserGroupsModal({
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
  onSaved: (groups: AdminUserRow["groups"]) => void;
}) {
  const t = copy(locale);
  const [selected, setSelected] = useState<string[]>(
    user.groups.map((g) => g.id)
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
      const groups = await saveUserGroups(user.id, selected);
      onSaved(groups);
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
        <h2 className="text-lg font-semibold text-surface-900">{t.editUser}</h2>
        <p className="mt-1 truncate text-sm text-surface-500">{user.email}</p>
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
          <Button type="submit" loading={saving}>
            {t.save}
          </Button>
        </div>
      </form>
    </div>
  );
}

function GroupMembersModal({
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

export function AdminPage({ locale }: { locale: Locale }) {
  const t = copy(locale);
  const homeHref = locale === "en" ? "/en" : "/";
  const { loading: authLoading, session, isAdmin } = usePlatformAuth();

  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [groups, setGroups] = useState<AdminGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterGroupId, setFilterGroupId] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("email");
  const [editingGroup, setEditingGroup] = useState<AdminGroupRow | null | "new">(
    null
  );
  const [editingUser, setEditingUser] = useState<AdminUserRow | null>(null);
  const [editingGroupMembers, setEditingGroupMembers] =
    useState<AdminGroupRow | null>(null);

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
  }, [users, filterGroupId, sortKey]);

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
        toolDescription="Users, groups, and tool permissions"
        toolNameHe="ניהול משתמשים"
        toolDescriptionHe="משתמשים, קבוצות והרשאות כלים"
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
            <div className="mb-4 flex flex-wrap items-end gap-3">
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

            {filteredUsers.length === 0 ? (
              <p className="text-sm text-surface-500">{t.noUsers}</p>
            ) : (
              <div className="overflow-x-auto border border-surface-200 bg-white">
                <table className="w-full min-w-[40rem] text-center text-sm">
                  <thead className="border-b border-surface-200 bg-surface-50 text-xs uppercase tracking-wide text-surface-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">{t.email}</th>
                      <th className="px-4 py-3 font-semibold">{t.name}</th>
                      <th className="px-4 py-3 font-semibold">{t.groups}</th>
                      <th className="px-4 py-3 font-semibold">{t.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
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
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setEditingUser(u)}
                          >
                            {t.edit}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6">
            <div className="mb-4 flex justify-end">
              <Button type="button" onClick={() => setEditingGroup("new")}>
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
                              onClick={() => setEditingGroup(g)}
                            >
                              {t.edit}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingGroupMembers(g)}
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
      </PageLayout>
    </div>
  );
}
