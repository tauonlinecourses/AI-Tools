import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // These package exports point Node at compiled dist/ builds, which do
      // not exist yet when CI runs tests (build comes after). Tests use source.
      "@workspace/ai-client/server": fileURLToPath(
        new URL("../../packages/ai-client/src/server.ts", import.meta.url)
      ),
      "@workspace/auth/server": fileURLToPath(
        new URL("../../packages/auth/src/server.ts", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "src/**/*.test.ts"],
  },
});
