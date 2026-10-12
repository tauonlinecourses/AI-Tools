/** Resolve Platform (Course-Builder Auth) URL/anon from Vite or Node env. */

export type PlatformPublicConfig = {
  url: string;
  anonKey: string;
};

function readEnv(name: string): string | undefined {
  if (typeof import.meta !== "undefined") {
    const viteEnv = (import.meta as { env?: Record<string, string | undefined> })
      .env;
    const fromVite = viteEnv?.[name]?.trim();
    if (fromVite) return fromVite;
  }
  const fromProcess = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env?.[name]?.trim();
  return fromProcess || undefined;
}

export function getPlatformPublicConfig(): PlatformPublicConfig | null {
  // Do not fall back to VITE_SUPABASE_* — that is often a *data* project
  // (e.g. Tau-Support) and would accept/store JWTs against the wrong host.
  const url =
    readEnv("VITE_PLATFORM_SUPABASE_URL") ||
    readEnv("PLATFORM_SUPABASE_URL");
  const anonKey =
    readEnv("VITE_PLATFORM_SUPABASE_ANON_KEY") ||
    readEnv("PLATFORM_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function requirePlatformPublicConfig(): PlatformPublicConfig {
  const config = getPlatformPublicConfig();
  if (!config) {
    throw new Error(
      "Missing Platform Supabase URL/anon key. Set VITE_PLATFORM_SUPABASE_URL and VITE_PLATFORM_SUPABASE_ANON_KEY (Course-Builder project)."
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
