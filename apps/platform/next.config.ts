import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shared workspace packages ship raw TS/TSX — Next must compile them.
  transpilePackages: ["@workspace/ui", "@workspace/ai-client"],
};

export default nextConfig;
