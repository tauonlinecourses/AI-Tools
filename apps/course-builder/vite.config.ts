import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { PLATFORM_ENV, vercelApiPlugin } from "../../packages/dev-api/src/index";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      vercelApiPlugin({
        env,
        bridge: [
          ...PLATFORM_ENV,
          // Course Builder's VITE_SUPABASE_* is the Platform project itself.
          ["PLATFORM_SUPABASE_URL", "VITE_SUPABASE_URL"],
          ["PLATFORM_SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"],
          ["PLATFORM_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
        ],
      }),
    ],
    // Force a single React copy across workspace packages (avoids React error #525).
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    server: {
      port: 5176,
      strictPort: true,
    },
  };
});
