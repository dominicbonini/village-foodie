// lib/built-ahead-countries.ts — vercel-cost-1 (23 November 2026, docs/vercel-cost-1-report.md): THE COUNTRIES WHOSE MARKETING PAGES ARE
// BUILT AHEAD AT EVERY DEPLOY (the landing, /features and /faq at /<country>). PURE (no import), so the three page modules and the
// harnesses share one list.
//
// Every other country address renders on its FIRST VISIT and is then kept exactly like a built-ahead page (no timer; refreshed only by
// /api/revalidate or an app write). The page modules keep `dynamicParams = true` — cwv-2: under `false`, a page that was not built ahead
// answers 404, and a built-ahead one 404s on the first request after a revalidation.
//
// The busiest countries: the English-speaking six, then France (trucks on file) and Germany (the largest European market, the first
// comparison page). Adding or removing a country here is the whole change — the pages read nothing else from this file.
// ISO codes (lib/marketing-country.ts COUNTRY_PATH_SEGMENTS gives each its address: GB → /uk).
export const BUILT_AHEAD_COUNTRIES: readonly string[] = ['GB', 'US', 'IE', 'AU', 'NZ', 'CA', 'FR', 'DE']
