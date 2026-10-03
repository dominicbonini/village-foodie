import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @sparticuz/chromium ships the Chromium binary as files that must NOT be bundled/tree-shaken by
  // the server build — keep it (and puppeteer-core, which spawns that binary) external so the binary
  // is present in the verify-schedule-url function at runtime. Without this, launch fails on Vercel.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  /* ══ 🔴 THE WEEKLY POST'S FONTS MUST BE IN THE SERVERLESS BUNDLE ════════════════════════
   * `lib/weekly-post/fonts.ts` reads the committed TTFs with `fs` at a path built from `process.cwd()`
   * and a filename chosen at runtime. The tracer cannot see through that, so without this the fonts
   * are present locally and ABSENT in production — the render would throw on a font file that exists
   * in the repository, which is the hardest shape of bug to diagnose from a deploy.
   * ⚠️ KEYED ON THE ROUTE THAT RENDERS. Only /api/weekly-post loads fonts; including them everywhere
   * would add 6.3MB to every function in the deployment. */
  outputFileTracingIncludes: {
    '/api/weekly-post': ['./assets/fonts/weekly-post/**'],
  },
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
