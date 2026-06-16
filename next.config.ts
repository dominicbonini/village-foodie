import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @sparticuz/chromium ships the Chromium binary as files that must NOT be bundled/tree-shaken by
  // the server build — keep it (and puppeteer-core, which spawns that binary) external so the binary
  // is present in the verify-schedule-url function at runtime. Without this, launch fails on Vercel.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
