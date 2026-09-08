const UNLOCKED_STORAGE_KEY = "tau-support-app-unlocked";

export function isAppUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCKED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAppUnlocked(unlocked: boolean): void {
  try {
    if (unlocked) {
      sessionStorage.setItem(UNLOCKED_STORAGE_KEY, "1");
    } else {
      sessionStorage.removeItem(UNLOCKED_STORAGE_KEY);
    }
  } catch {
    // ignore quota / private mode
  }
}

export async function verifyAppPassword(password: string): Promise<void> {
  const res = await fetch("/api/app-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  const data: unknown = await res.json().catch(() => null);
  if (res.ok) {
    setAppUnlocked(true);
    return;
  }

  const message =
    data &&
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "string"
      ? (data as { error: string }).error
      : `Login failed (${res.status})`;
  throw new Error(message);
}
