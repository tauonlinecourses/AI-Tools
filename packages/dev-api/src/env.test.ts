import { describe, expect, it } from "vitest";
import { PLATFORM_ENV, bridgeEnv, same } from "./env";

describe("bridgeEnv", () => {
  it("copies listed keys without overriding values already set", () => {
    const target: Record<string, string | undefined> = { B: "keep" };
    bridgeEnv({ A: "a", B: "b", C: "c" }, same("A", "B"), target);
    expect(target).toEqual({ A: "a", B: "keep" });
  });

  it("lets earlier sources win over later fallbacks", () => {
    const target: Record<string, string | undefined> = {};
    bridgeEnv(
      { VITE_PLATFORM_SUPABASE_URL: "vite", PLATFORM_SUPABASE_URL: "server" },
      PLATFORM_ENV,
      target,
    );
    expect(target.PLATFORM_SUPABASE_URL).toBe("server");
  });

  it("falls back to VITE_PLATFORM_* and skips empty values", () => {
    const target: Record<string, string | undefined> = {};
    bridgeEnv(
      { PLATFORM_SUPABASE_URL: "", VITE_PLATFORM_SUPABASE_URL: "vite" },
      PLATFORM_ENV,
      target,
    );
    expect(target.PLATFORM_SUPABASE_URL).toBe("vite");
    expect("PLATFORM_SUPABASE_ANON_KEY" in target).toBe(false);
  });
});
