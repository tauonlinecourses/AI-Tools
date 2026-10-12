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
  signInWithPassword,
  signOut as platformSignOut,
} from "./client.js";

type AuthState = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  allowedToolIds: string[];
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAllowedTools: () => Promise<void>;
  hasToolAccess: (toolId: string) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const configured = isPlatformConfigured();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [allowedToolIds, setAllowedToolIds] = useState<string[]>([]);

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
        if (s) await refreshAllowedTools();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const { data: sub } = getPlatformClient().auth.onAuthStateChange(
      (_event, next) => {
        setSession(next);
        if (next) {
          void refreshAllowedTools();
        } else {
          setAllowedToolIds([]);
        }
      }
    );

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [configured, refreshAllowedTools]);

  const signIn = useCallback(async (email: string, password: string) => {
    const s = await signInWithPassword(email, password);
    setSession(s);
    await refreshAllowedTools();
  }, [refreshAllowedTools]);

  const signOut = useCallback(async () => {
    await platformSignOut();
    setSession(null);
    setAllowedToolIds([]);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      configured,
      loading,
      session,
      user: session?.user ?? null,
      allowedToolIds,
      signIn,
      signOut,
      refreshAllowedTools,
      hasToolAccess: (toolId: string) => allowedToolIds.includes(toolId),
    }),
    [
      configured,
      loading,
      session,
      allowedToolIds,
      signIn,
      signOut,
      refreshAllowedTools,
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
