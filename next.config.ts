import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // GramJS uses Node.js modules that don't exist in browser.
  // Stub them out — GramJS auto-detects browser and uses WebSocket instead.
  turbopack: {
    root: ".",
    resolveAlias: {
      net: { browser: "./lib/client/empty-module.ts" },
      tls: { browser: "./lib/client/empty-module.ts" },
      fs: { browser: "./lib/client/empty-module.ts" },
      path: { browser: "./lib/client/empty-module.ts" },
      os: { browser: "./lib/client/empty-module.ts" },
      "node-localstorage": { browser: "./lib/client/empty-module.ts" },
    },
  },
  images: {
    remotePatterns: [
      { hostname: "avatars.githubusercontent.com" },
      { hostname: "github.com" },
      { hostname: "t.me" },
    ],
  },
  async redirects() {
    return [
      // Legacy route redirects — A2 builder is now the primary /automations
      { source: "/automations2", destination: "/automations", permanent: true },
      { source: "/automations2/:path*", destination: "/automations/:path*", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://avatars.githubusercontent.com https://github.com https://t.me",
              "font-src 'self' data:",
              "connect-src 'self' https://btpwumlhjphmoznsejxm.supabase.co wss://btpwumlhjphmoznsejxm.supabase.co https://api.anthropic.com wss://venus.web.telegram.org wss://flora.web.telegram.org wss://pluto.web.telegram.org wss://vesta.web.telegram.org wss://aurora.web.telegram.org",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
