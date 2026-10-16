// app/[country]/page.tsx — THE LANDING PAGE AT ITS COUNTRY ADDRESS: /uk, /us (Language Phase 1e).
//
// 🔴 IT IS THE SAME MODULE, NOT A COPY — the same pattern as app/1ng7n4p5omux2gdk9kqvwz. app/landing/page.tsx reads
// `params.country` and renders THAT country (lib/visitor-country.ts resolveCountryPage): its prices, words, tags,
// canonical and hreflang. With no segment (the old addresses) the module behaves exactly as before.
// ⚠️ THE ONLY VALID SEGMENTS ARE lib/marketing-country.ts's COUNTRY_PATH_SEGMENTS ('uk', 'us'). Anything else is a
// 404: `dynamicParams = false` says so, and the resolver says so again at request time — this route is
// force-dynamic, so Next never prerenders it and the static-params list alone would not be enforced in production.
// Static top-level routes (/trucks, /order, /admin, /contact, …) always beat this dynamic segment.
// ⚠️ A switched-off country's address never reaches this module in normal running — proxy.ts 302s it to /uk.
// The unprefixed addresses (hatchgrab.com/, /landing, /features, /compare, the preview) are proxy.ts's router.
import { COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'

export { default, generateMetadata } from '../landing/page'

export const dynamic = 'force-dynamic'
export const dynamicParams = false
export function generateStaticParams() {
  return Object.values(COUNTRY_PATH_SEGMENTS).map(country => ({ country }))
}
