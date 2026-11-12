import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-billed invoice PDFs are rendered server-side; keep react-pdf (and its
  // font/layout engines) out of the bundler.
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    // proxy.ts buffers the whole request body in memory (to allow reading it
    // both there and in the route handler) and silently truncates past this
    // limit rather than erroring — needs real headroom above the 10MB
    // invoice-file cap (src/lib/payments.ts) for multipart overhead, or an
    // upload right at that cap would get corrupted with no visible error.
    proxyClientMaxBodySize: "15mb",
  },
};

export default nextConfig;
