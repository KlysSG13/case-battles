import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["z-ai-web-dev-sdk"],
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
