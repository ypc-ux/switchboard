import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Webhook routes must never be statically optimized or cached.
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
};

export default nextConfig;
