/**
 * Local Vite on Windows + corporate TLS inspection:
 * Node's fetch (undici) does not use the Windows cert store, so Supabase
 * Auth calls fail with SELF_SIGNED_CERT_IN_CHAIN. Browser login still works.
 *
 * This file must be imported *before* any Supabase/server auth modules.
 * Set PLATFORM_STRICT_TLS=1 to keep certificate verification enabled.
 * Safe for Vite middleware only — not relied on in production browsers.
 */
if (typeof process !== "undefined" && process.platform === "win32") {
  if (process.env.PLATFORM_STRICT_TLS !== "1") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
}
