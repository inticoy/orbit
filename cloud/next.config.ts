import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // cloud/ sits inside the orbit repo, which has its own lockfile.
  turbopack: { root: import.meta.dirname },
};

// Gives `next dev` the D1 binding and vars from wrangler.jsonc / .dev.vars.
initOpenNextCloudflareForDev();

export default nextConfig;
