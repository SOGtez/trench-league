import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 blocks cross-origin dev resources (HMR and the dev runtime) by
  // default. Reaching the dev server through anything but its own hostname —
  // 127.0.0.1, a LAN address or a hosted preview URL — silently leaves the page
  // unhydrated, so nothing client-side runs: no chart, no trade panel, dead
  // buttons. Production is unaffected; this is dev only.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "pv-f37a5fcd2739-8b5960f7-3916-491d-8f52-42cbf69306b7.style.dev",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
