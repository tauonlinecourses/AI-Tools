import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Spinner } from "@workspace/ui";

export type SavePhase = "idle" | "saving" | "saved";

interface SaveStatusContextValue {
  phase: SavePhase;
  /** Track an in-flight mutation; shows saving until all tracked ops finish. */
  trackSave: <T>(promise: Promise<T>) => Promise<T>;
  /** Mark a debounced key as pending (shows saving until endSave(key)). */
  beginSave: (key: string) => void;
  endSave: (key: string) => void;
}

const SaveStatusContext = createContext<SaveStatusContextValue | null>(null);

export function SaveStatusProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<SavePhase>("idle");
  const pendingKeys = useRef(new Set<string>());
  const inflight = useRef(0);

  const refresh = useCallback(() => {
    if (pendingKeys.current.size > 0 || inflight.current > 0) {
      setPhase("saving");
    } else {
      setPhase((prev) => (prev === "idle" ? "idle" : "saved"));
    }
  }, []);

  const beginSave = useCallback(
    (key: string) => {
      pendingKeys.current.add(key);
      refresh();
    },
    [refresh]
  );

  const endSave = useCallback(
    (key: string) => {
      pendingKeys.current.delete(key);
      refresh();
    },
    [refresh]
  );

  const trackSave = useCallback(
    async <T,>(promise: Promise<T>): Promise<T> => {
      inflight.current += 1;
      refresh();
      try {
        return await promise;
      } finally {
        inflight.current -= 1;
        refresh();
      }
    },
    [refresh]
  );

  const value = useMemo(
    () => ({ phase, trackSave, beginSave, endSave }),
    [phase, trackSave, beginSave, endSave]
  );

  return (
    <SaveStatusContext.Provider value={value}>{children}</SaveStatusContext.Provider>
  );
}

export function useSaveStatus(): SaveStatusContextValue {
  const ctx = useContext(SaveStatusContext);
  if (!ctx) {
    throw new Error("useSaveStatus must be used within SaveStatusProvider");
  }
  return ctx;
}

/** Optional hook — returns null outside the provider (e.g. unused pages). */
export function useSaveStatusOptional(): SaveStatusContextValue | null {
  return useContext(SaveStatusContext);
}

export function SaveStatusIndicator() {
  const { phase } = useSaveStatus();

  if (phase === "idle") return null;

  return (
    <div
      className="flex items-center gap-1.5 text-xs text-surface-500"
      dir="rtl"
      aria-live="polite"
    >
      {phase === "saving" ? (
        <>
          <Spinner size="sm" className="border-surface-200 border-t-surface-600" />
          <span>שומר שינויים...</span>
        </>
      ) : (
        <span>כל השינויים נשמרו</span>
      )}
    </div>
  );
}
