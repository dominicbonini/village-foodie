// app/[country]/page.tsx — THE LANDING PAGE AT ITS COUNTRY ADDRESS: /uk, /us (Language Phase 1e).
//
// 🔴 IT IS THE SAME MODULE, NOT A COPY — the same pattern as app/1ng7n4p5omux2gdk9kqvwz. app/landing/page.tsx reads
// `params.country` and renders THAT country (lib/visitor-country.ts resolveCountryPage): its prices, words, tags,
// canonical and hreflang. With no segment (the old addresses) the module behaves exactly as before.
// ⚠️ THE ONLY VALID SEGMENTS ARE lib/marketing-country.ts's COUNTRY_PATH_SEGMENTS ('uk', 'us'). Anything else is a 404:
// proxy.ts answers an address that is no country (/zz, /wp-admin) with the app's own 404 before it gets here
// (lib/top-level-routes.ts), and the resolver says so again (cwv-2: every listed country is BUILT AHEAD —
// generateStaticParams — and `dynamicParams` is true, below).
// Static top-level routes (/trucks, /order, /admin, /contact, …) always beat this dynamic segment.
// ⚠️ A switched-off country's address never reaches this module in normal running — proxy.ts 302s it to /uk.
// The unprefixed addresses (hatchgrab.com/, /landing, /features, /compare, the preview) are proxy.ts's router.
import { COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'
import { BUILT_AHEAD_COUNTRIES } from '@/lib/built-ahead-countries'   // vercel-cost-1: only the busiest countries are built ahead

export { default, generateMetadata } from '../(site)/landing/page'

// cwv-2 (6 November 2026, docs/cwv-2-report.md §4): BUILT AHEAD AND SERVED FROM THE CDN (manual 35.ap-2). The page reads nothing from the
// request (its host gate is proxy.ts's); its data is the tagged shared cache, so an app write or /api/revalidate shows on the very next
// request, and anything nobody announces shows within these 300 seconds (MARKETING_REVALIDATE_SECONDS — scripts/cwv-2.cjs checks).
// vercel-cost-1 (23 November 2026, docs/vercel-cost-1-report.md): NO TIMER. The 300-second rebuild wrote ~100k ISR units a day for pages
// that almost never change, so the page is kept until /api/revalidate or an app write expires its tags (lib/marketing-tags.ts
// MARKETING_REVALIDATE — the shared data carries no timer either, so it cannot shorten this). After a migration or a dashboard
// edit, run `node scripts/revalidate-pages.cjs` (REVALIDATE_SECRET in the environment) — db-migrate.cjs does it by itself.
export const revalidate = false
// ⚠️ TRUE, NOT FALSE (cwv-2): in Next 16.1.6 a built-ahead page under `dynamicParams = false` answers 404 (NoFallbackError) on the first
// request after its tag is revalidated — the regeneration is treated as an unknown parameter. Every listed country is still built ahead
// (generateStaticParams); an address whose segment is no country never reaches here (proxy.ts answers it with the app's 404), and
// resolveCountryAddress 404s one anyway.
export const dynamicParams = true
// vercel-cost-1: built ahead only for BUILT_AHEAD_COUNTRIES; every other country address renders on its first visit (dynamicParams
// true, above) and is then kept the same way.
export function generateStaticParams() {
  return BUILT_AHEAD_COUNTRIES.map(code => ({ country: COUNTRY_PATH_SEGMENTS[code] }))
}
