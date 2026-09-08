/**
 * App-level password gate for the tau-support UI.
 * Password lives in server env only (never VITE_ / never shipped to the browser).
 */

function normalizeSecret(value: string | undefined): string {
  if (!value) return "";
  // Strip accidental trailing newline from .env without trimming intentional spaces.
  return value.replace(/\r?\n$/, "");
}

export function getAppPassword(): string {
  return normalizeSecret(process.env.APP_PASSWORD);
}

export function isAppPasswordConfigured(): boolean {
  return getAppPassword().length > 0;
}

/** Constant-time-ish compare for equal-length strings. */
export function verifyAppPassword(candidate: string): boolean {
  const expected = getAppPassword();
  if (!expected) return false;
  const a = candidate;
  const b = expected;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
