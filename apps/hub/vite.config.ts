import path from "node:path";
import { fileURLToPath } from "node:url";
import "../../packages/auth/src/devTls";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { same, vercelApiPlugin } from "../../packages/dev-api/src/index";

const hubDir = path.dirname(fileURLToPath(import.meta.url));
const mbzSrc = path.resolve(hubDir, "../mbz-explorer/src");
const dictionarySrc = path.resolve(hubDir, "../dictionary-tool/src");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      vercelApiPlugin({
        env,
        bridge: [
          ...same(
            "PLATFORM_SUPABASE_URL",
            "PLATFORM_SUPABASE_ANON_KEY",
            "PLATFORM_SUPABASE_SERVICE_ROLE_KEY",
            "VITE_PLATFORM_SUPABASE_URL",
            "VITE_PLATFORM_SUPABASE_ANON_KEY",
            "VITE_SUPABASE_URL",
            "VITE_SUPABASE_ANON_KEY",
            "SUPABASE_SERVICE_ROLE_KEY",
            "OPENAI_API_KEY"
          ),
          // Prefer explicit platform vars; fall back to course-builder-style VITE_*.
          ["PLATFORM_SUPABASE_URL", "VITE_PLATFORM_SUPABASE_URL"],
          ["PLATFORM_SUPABASE_URL", "VITE_SUPABASE_URL"],
          ["PLATFORM_SUPABASE_ANON_KEY", "VITE_PLATFORM_SUPABASE_ANON_KEY"],
          ["PLATFORM_SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"],
        ],
      }),
    ],
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        // Allow hub to compile hub-hosted sibling tools.
        "mbz-explorer": mbzSrc,
        "dictionary-tool": dictionarySrc,
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      fs: {
        allow: [path.resolve(hubDir, "../..")],
      },
    },
  };
});
