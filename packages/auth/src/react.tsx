import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  clearLocalPlatformSession,
  getMyAccountStatus,
  getPlatformClient,
  getPlatformSession,
  isPlatformConfigured,
  listAllowedToolIds,
  isAdminFromGroups,
  listUserGroups,
  setPlatformSessionEndedListener,
  signInWithPassword,
  signOut as platformSignOut,
  type AccountStatus,
  type PlatformGroup,
} from "./client.js";
import { createMembershipTracker } from "./membershipTracker.js";

async function fetchAllowedToolIds(): Promise<string[]> {
  try {
    return await listAllowedToolIds();
  } catch {
    return [];
  }
}

async function fetchGroups(): Promise<PlatformGroup[]> {
  try {
    return await listUserGroups();
  } catch {
    return [];
  }
}

async function fetchAccountStatus(): Promise<AccountStatus> {
  try {
    return await getMyAccountStatus();
  } catch {
    // Fail closed: do not treat unknown status as approved.
    return "pending";
  }
}

type AuthState = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  allowedToolIds: string[];
  groups: PlatformGroup[];
  /** True when the user belongs to the Admin group (`admin-all-tools`). */
  isAdmin: boolean;
  /** Profile approval status; null while unsigned or still loading membership. */
  accountStatus: AccountStatus | null;
  /** True when the login ended without this tab's own sign-out. */
  sessionEnded: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAllowedTools: () => Promise<void>;
  refreshGroups: () => Promise<void>;
  refreshAccountStatus: () => Promise<void>;
  hasToolAccess: (toolId: string) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const configured = isPlatformConfigured();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [allowedToolIds, setAllowedToolIds] = useState<string[]>([]);
  const [groups, setGroups] = useState<PlatformGroup[]>([]);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(
    null
  );

  const [tracker] = useState(createMembershipTracker);
  const [sessionEnded, setSessionEnded] = useState(false);
  const signingOutRef = useRef(false);

  const refreshAllowedTools = useCallback(async () => {
    setAllowedToolIds(configured ? await fetchAllowedToolIds() : []);
  }, [configured]);

  const refreshGroups = useCallback(async () => {
    setGroups(configured ? await fetchGroups() : []);
  }, [configured]);

  const refreshAccountStatus = useCallback(async () => {
    setAccountStatus(configured ? await fetchAccountStatus() : null);
  }, [configured]);

  /** Loads all membership at once; `loading` ends when the newest load lands. */
  const refreshMembership = useCallback(async () => {
    const request = tracker.beginRequest();
    const [nextTools, nextGroups, nextStatus] = await Promise.all([
      fetchAllowedToolIds(),
      fetchGroups(),
      fetchAccountStatus(),
    ]);
    if (!tracker.isLatest(request)) return;
    setAllowedToolIds(nextTools);
    setGroups(nextGroups);
    setAccountStatus(nextStatus);
    setLoading(false);
  }, [tracker]);

  /** A new user blocks the UI until loaded; the same user refreshes quietly. */
  const syncMembership = useCallback(
    (userId: string) => {
      if (tracker.setActiveUser(userId)) setLoading(true);
      return refreshMembership();
    },
    [tracker, refreshMembership]
  );

  const clearMembership = useCallback(() => {
    tracker.reset();
    setAllowedToolIds([]);
    setGroups([]);
    setAccountStatus(null);
    setLoading(false);
  }, [tracker]);

  useEffect(() => {
    if (!configured) return;
    setPlatformSessionEndedListener(() => {
      setSessionEnded(true);
      setSession(null);
      clearMembership();
      void clearLocalPlatformSession().catch(() => undefined);
    });
    return () => setPlatformSessionEndedListener(null);
  }, [configured, clearMembership]);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const s = await getPlatformSession();
        if (cancelled) return;
        setSession(s);
        if (s) await syncMembership(s.user.id);
        else clearMembership();
      } catch {
        if (!cancelled) clearMembership();
      }
    })();

    const { data: sub } = getPlatformClient().auth.onAuthStateChange(
      (event, next) => {
        setSession(next);
        if (next) {
          setSessionEnded(false);
          void syncMembership(next.user.id);
        } else {
          if (event === "SIGNED_OUT" && !signingOutRef.current) {
            setSessionEnded(true);
          }
          clearMembership();
        }
      }
    );

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [configured, syncMembership, clearMembership]);

  const signIn = useCallback(async (email: string, password: string) => {
    const s = await signInWithPassword(email, password);
    setSession(s);
    await syncMembership(s.user.id);
  }, [syncMembership]);

  const signOut = useCallback(async () => {
    signingOutRef.current = true;
    try {
      await platformSignOut();
    } finally {
      signingOutRef.current = false;
    }
    setSession(null);
    setSessionEnded(false);
    clearMembership();
  }, [clearMembership]);

  const isAdmin = isAdminFromGroups(groups);

  const value = useMemo<AuthState>(
    () => ({
      configured,
      loading,
      session,
      user: session?.user ?? null,
      allowedToolIds,
      groups,
      isAdmin,
      accountStatus,
      sessionEnded,
      signIn,
      signOut,
      refreshAllowedTools,
      refreshGroups,
      refreshAccountStatus,
      hasToolAccess: (toolId: string) => allowedToolIds.includes(toolId),
    }),
    [
      configured,
      loading,
      session,
      allowedToolIds,
      groups,
      isAdmin,
      accountStatus,
      sessionEnded,
      signIn,
      signOut,
      refreshAllowedTools,
      refreshGroups,
      refreshAccountStatus,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function usePlatformAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("usePlatformAuth must be used within PlatformAuthProvider");
  }
  return ctx;
}
