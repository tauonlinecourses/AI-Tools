import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Force a single React copy across workspace packages (avoids React error #525).
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5175,
    strictPort: true,
  },
});
