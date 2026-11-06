// app/[country]/faq/page.tsx — /faq AT ITS COUNTRY ADDRESS: /uk/faq, /de/faq … (faq-4, 2 November 2026).
// 🔴 THE SAME MODULE, NOT A COPY: app/faq/page.tsx reads `params.country` — as app/[country]/features/page.tsx does. A switched-off
// country's address → proxy.ts 302s it to /uk/faq; a country whose FAQ shows nothing → 404 (app/faq/page.tsx).
import { COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'

export { default, generateMetadata } from '../../(site)/faq/page'

// cwv-2 (6 November 2026, docs/cwv-2-report.md §4): BUILT AHEAD AND SERVED FROM THE CDN (manual 35.ap-2). The page reads nothing from the
// request (its host gate is proxy.ts's); its data is the tagged shared cache, so an app write or /api/revalidate shows on the very next
// request, and anything nobody announces shows within these 300 seconds (MARKETING_REVALIDATE_SECONDS — scripts/cwv-2.cjs checks).
export const revalidate = 300
// ⚠️ TRUE, NOT FALSE (cwv-2): in Next 16.1.6 a built-ahead page under `dynamicParams = false` answers 404 (NoFallbackError) on the first
// request after its tag is revalidated — the regeneration is treated as an unknown parameter. Every listed country is still built ahead
// (generateStaticParams); an address whose segment is no country never reaches here (proxy.ts answers it with the app's 404), and
// resolveCountryAddress 404s one anyway.
export const dynamicParams = true
export function generateStaticParams() {
  return Object.values(COUNTRY_PATH_SEGMENTS).map(country => ({ country }))
}
