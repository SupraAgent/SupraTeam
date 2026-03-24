import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { hostname: "avatars.githubusercontent.com" },
      { hostname: "github.com" },
      { hostname: "t.me" },
    ],
  },
  turbopack: {
    resolveAlias: {
      "@supra/automation-builder": "./packages/automation-builder/dist/index.js",
    },
  },
};

export default nextConfig;
