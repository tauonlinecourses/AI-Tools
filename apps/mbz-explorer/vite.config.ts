import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { PLATFORM_ENV, vercelApiPlugin } from "../../packages/dev-api/src/index";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), vercelApiPlugin({ env, bridge: PLATFORM_ENV })],
    // Force a single React copy across workspace packages (avoids React error #525).
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    server: {
      port: 5177,
      strictPort: true,
    },
  };
});
