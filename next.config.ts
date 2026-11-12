import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // H2 (audit): TypeScript build errors are no longer ignored, and StrictMode
  // is on. The NexusClient constructor is already StrictMode-safe (synchronous
  // sanctuary creation + deferred bootstrap) — this was verified during the
  // audit; any remaining double-mount fallout gets fixed, not suppressed.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
};

export default nextConfig;
