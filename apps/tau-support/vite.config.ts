import "../../packages/auth/src/devTls";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { same, vercelApiPlugin } from "../../packages/dev-api/src/index";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      vercelApiPlugin({
        env,
        bridge: [
          ...same(
            "LMS_BASE_URL",
            "LMS_USERNAME",
            "LMS_PASSWORD",
            "LMS_SESSION_ID",
            "LMS_CSRF_TOKEN",
            "LMS_JWT_HEADER_PAYLOAD",
            "LMS_JWT_SIGNATURE",
            "OPENAI_API_KEY",
            "PLATFORM_SUPABASE_URL",
            "PLATFORM_SUPABASE_ANON_KEY",
            "PLATFORM_SUPABASE_SERVICE_ROLE_KEY"
          ),
          ["PLATFORM_SUPABASE_URL", "VITE_PLATFORM_SUPABASE_URL"],
          ["PLATFORM_SUPABASE_ANON_KEY", "VITE_PLATFORM_SUPABASE_ANON_KEY"],
          ...same("TAU_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
          // In this app VITE_SUPABASE_* is the Tau project, not Platform.
          ["TAU_SUPABASE_URL", "VITE_SUPABASE_URL"],
        ],
      }),
    ],
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    server: {
      port: 5178,
      strictPort: true,
    },
  };
});
