import type { Config } from "tailwindcss";
import baseConfig from "@workspace/config/tailwind";

const config: Config = {
  ...baseConfig,
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",  // include shared components
  ],
};

export default config;
