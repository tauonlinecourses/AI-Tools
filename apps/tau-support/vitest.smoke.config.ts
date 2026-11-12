/**
 * Runs against the real Tau Supabase + OpenAI (not part of `pnpm test`).
 *   pnpm --filter tau-support category-test
 * Reads apps/tau-support/.env.
 */
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const env = loadEnv("development", __dirname, "");

export default defineConfig({
  resolve: {
    alias: {
      "@workspace/ai-client/server": fileURLToPath(
        new URL("../../packages/ai-client/src/server.ts", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/**/*.smoke.ts"],
    testTimeout: 600_000,
    env: {
      OPENAI_API_KEY: env.OPENAI_API_KEY ?? "",
      VITE_SUPABASE_URL: env.VITE_SUPABASE_URL ?? "",
      TAU_SUPABASE_SERVICE_ROLE_KEY: env.TAU_SUPABASE_SERVICE_ROLE_KEY ?? "",
      CATEGORY_TEST_SIZE: process.env.CATEGORY_TEST_SIZE ?? "",
      CATEGORY_TEST_FILE: process.env.CATEGORY_TEST_FILE ?? "",
      CATEGORY_TEST_LABELS: process.env.CATEGORY_TEST_LABELS ?? "",
      // Match `pnpm dev` on Windows (corporate TLS interception).
      ...(process.platform === "win32" && process.env.PLATFORM_STRICT_TLS !== "1"
        ? { NODE_TLS_REJECT_UNAUTHORIZED: "0" }
        : {}),
    },
  },
});
