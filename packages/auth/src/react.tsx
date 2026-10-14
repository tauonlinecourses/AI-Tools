import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  getPlatformClient,
  getPlatformSession,
  isPlatformConfigured,
  listAllowedToolIds,
  isAdminFromGroups,
  listUserGroups,
  signInWithPassword,
  signOut as platformSignOut,
  type PlatformGroup,
} from "./client.js";

type AuthState = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  allowedToolIds: string[];
  groups: PlatformGroup[];
  /** True when the user belongs to the Admin group (`Admin (all tools)`). */
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAllowedTools: () => Promise<void>;
  refreshGroups: () => Promise<void>;
  hasToolAccess: (toolId: string) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const configured = isPlatformConfigured();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [allowedToolIds, setAllowedToolIds] = useState<string[]>([]);
  const [groups, setGroups] = useState<PlatformGroup[]>([]);

  const refreshAllowedTools = useCallback(async () => {
    if (!configured) {
      setAllowedToolIds([]);
      return;
    }
    try {
      const ids = await listAllowedToolIds();
      setAllowedToolIds(ids);
    } catch {
      setAllowedToolIds([]);
    }
  }, [configured]);

  const refreshGroups = useCallback(async () => {
    if (!configured) {
      setGroups([]);
      return;
    }
    try {
      const next = await listUserGroups();
      setGroups(next);
    } catch {
      setGroups([]);
    }
  }, [configured]);

  const refreshMembership = useCallback(async () => {
    await Promise.all([refreshAllowedTools(), refreshGroups()]);
  }, [refreshAllowedTools, refreshGroups]);

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
        if (s) await refreshMembership();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const { data: sub } = getPlatformClient().auth.onAuthStateChange(
      (_event, next) => {
        setSession(next);
        if (next) {
          void refreshMembership();
        } else {
          setAllowedToolIds([]);
          setGroups([]);
        }
      }
    );

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [configured, refreshMembership]);

  const signIn = useCallback(async (email: string, password: string) => {
    const s = await signInWithPassword(email, password);
    setSession(s);
    await refreshMembership();
  }, [refreshMembership]);

  const signOut = useCallback(async () => {
    await platformSignOut();
    setSession(null);
    setAllowedToolIds([]);
    setGroups([]);
  }, []);

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
      signIn,
      signOut,
      refreshAllowedTools,
      refreshGroups,
      hasToolAccess: (toolId: string) => allowedToolIds.includes(toolId),
    }),
    [
      configured,
      loading,
      session,
      allowedToolIds,
      groups,
      isAdmin,
      signIn,
      signOut,
      refreshAllowedTools,
      refreshGroups,
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
