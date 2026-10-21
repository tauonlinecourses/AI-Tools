export type AccountStatus = "pending" | "approved" | "rejected";

export type AdminGroupSummary = {
  id: string;
  name: string;
  slug: string;
};

export type AdminUserRow = {
  id: string;
  email: string;
  displayName: string | null;
  status: AccountStatus;
  requestedGroupId: string | null;
  groups: AdminGroupSummary[];
};

export type AdminGroupRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  toolIds: string[];
  memberCount: number;
};
