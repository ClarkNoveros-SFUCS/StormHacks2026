import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node-only driver (F03): keep it out of the bundler.
  serverExternalPackages: ["snowflake-sdk"],
  experimental: {
    // proxy.ts buffers request bodies and silently truncates past this (default 10 MB).
    // Uploads go up to 25 MB, plus multipart overhead.
    proxyClientMaxBodySize: "26mb",
  },
};

export default nextConfig;
