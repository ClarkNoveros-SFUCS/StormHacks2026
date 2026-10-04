import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node-only parsers (F03): keep them out of the bundler.
  serverExternalPackages: ["unpdf", "mammoth"],
  experimental: {
    // proxy.ts buffers request bodies and silently truncates past this (default 10 MB).
    // Uploads go up to 25 MB, plus multipart overhead.
    proxyClientMaxBodySize: "26mb",
  },
};

export default nextConfig;
