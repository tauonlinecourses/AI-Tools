/**
 * Server-only Platform env (no import.meta — safe for CJS Vercel builds).
 */

export type PlatformPublicConfig = {
  url: string;
  anonKey: string;
};

function readEnv(name: string): string | undefined {
  return (
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.[name]?.trim() || undefined
  );
}

export function getPlatformPublicConfig(): PlatformPublicConfig | null {
  const url =
    readEnv("PLATFORM_SUPABASE_URL") ||
    readEnv("VITE_PLATFORM_SUPABASE_URL");
  const anonKey =
    readEnv("PLATFORM_SUPABASE_ANON_KEY") ||
    readEnv("VITE_PLATFORM_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function requirePlatformPublicConfig(): PlatformPublicConfig {
  const config = getPlatformPublicConfig();
  if (!config) {
    throw new Error(
      "Missing PLATFORM_SUPABASE_URL / PLATFORM_SUPABASE_ANON_KEY (or VITE_PLATFORM_*) on the server."
    );
  }
  return config;
}

export function getPlatformServiceRoleKey(): string | undefined {
  return (
    readEnv("PLATFORM_SUPABASE_SERVICE_ROLE_KEY") ||
    readEnv("SUPABASE_SERVICE_ROLE_KEY")
  );
}
