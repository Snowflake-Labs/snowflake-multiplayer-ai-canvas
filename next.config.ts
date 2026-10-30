import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App Runtime deploys the standalone build
  output: "standalone",
  // Force the standalone tracer to bundle these — the SDK is dynamically
  // imported via our auth wrapper, and ws is used by our custom server.js
  // (which Next.js does not trace).
  serverExternalPackages: ["snowflake-sdk", "@snowflake/cortex-agent-sdk", "ws"],
  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/@snowflake/cortex-agent-sdk/**/*",
      "./node_modules/ws/**/*",
    ],
  },
  // Silence the Turbopack root warning
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
