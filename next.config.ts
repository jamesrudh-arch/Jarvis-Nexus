import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  // Stage 2 Phase 5 V1: ignoreBuildErrors REMOVED — the application must
  // typecheck strictly. The Next app uses its own tsconfig (tsconfig.next.json)
  // so the backend monorepo typecheck (root tsconfig.json) stays independent.
  typescript: {
    tsconfigPath: "tsconfig.next.json",
  },
  reactStrictMode: true,
};

export default nextConfig;
