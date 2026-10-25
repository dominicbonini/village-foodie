import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// 🔴 LANGUAGE PHASE 0 (docs/language-phase-0-report.md): next-intl's request configuration, for server components
// (`getTranslations`). NO URL ROUTING and NO MIDDLEWARE — nothing in a URL names a language; the locale is
// resolved from the truck's country, or the visitor's for marketing (lib/i18n/locales.ts).
// LANGUAGE PHASE 1a (docs/language-phase-1a-report.md): messages are PRECOMPILED at build time — every ICU
// message in messages/*.json is compiled once by the build and the browser carries next-intl's format-only
// formatter instead of the ICU parser. Proven byte-identical to the uncompiled formatter for every message
// and every plural/select branch, in en-GB and en-US (the report's precompile proof).
const withNextIntl = createNextIntlPlugin({
  requestConfig: "./lib/i18n/request.ts",
  experimental: { messages: { path: "./messages", format: "json", locales: "infer", precompile: true } },
});

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
  /* compare-de-1 (24 October 2026): a comparison page's Markdown and JSON twins — /de/vergleich/foodtruck-bestellsystem.md
   * and .json — are served by app/api/compare/[country]/[section]/[slug]/[format]/route.ts. afterFiles is checked before
   * the dynamic routes, so the twin never reaches app/[country]/[section]/[slug] as a slug with a dot in it. The route
   * applies the page's own visibility (off → 404; admin → admins only), and proxy.ts adds noindex/no-store on both. */
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        { source: '/:country([a-z]{2})/:section([a-z0-9-]+)/:slug([a-z0-9-]+).:format(md|json)', destination: '/api/compare/:country/:section/:slug/:format' },
      ],
      fallback: [],
    }
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

export default withNextIntl(nextConfig);
