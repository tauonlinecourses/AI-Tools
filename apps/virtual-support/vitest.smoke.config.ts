/**
 * Smoke run against the real dev Supabase + OpenAI (not part of `pnpm test`).
 *   pnpm --filter virtual-support smoke
 * Reads apps/virtual-support/.env. Requires migration 002_hybrid_search.sql.
 */
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const env = loadEnv("development", __dirname, "");

export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.smoke.ts"],
    testTimeout: 600_000,
    env: {
      OPENAI_API_KEY: env.OPENAI_API_KEY ?? "",
      VS_SUPABASE_URL: env.VS_SUPABASE_URL || env.VITE_SUPABASE_URL || "",
      VS_SUPABASE_SERVICE_ROLE_KEY: env.VS_SUPABASE_SERVICE_ROLE_KEY ?? "",
      // Match `pnpm dev` on Windows (corporate TLS interception).
      ...(process.platform === "win32" && process.env.PLATFORM_STRICT_TLS !== "1"
        ? { NODE_TLS_REJECT_UNAUTHORIZED: "0" }
        : {}),
      SMOKE_ANSWER: process.env.SMOKE_ANSWER ?? "",
    },
  },
});
