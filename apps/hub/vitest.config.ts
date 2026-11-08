import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // The package export points at a compiled build; tests use the source.
      "@workspace/auth/server": fileURLToPath(
        new URL("../../packages/auth/src/server.ts", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts"],
  },
});
