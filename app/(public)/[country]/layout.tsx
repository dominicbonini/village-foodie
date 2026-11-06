// app/(public)/[country]/layout.tsx — cwv-2 (6 November 2026, docs/cwv-2-report.md §3): THE ROOT LAYOUT OF EVERY COUNTRY PAGE (/uk,
// /uk/features, /uk/faq, /uk/compare, /uk/<comparison page>). Public, lean (components/public/PublicDocument.tsx) and READS NOTHING FROM
// THE REQUEST, so the landing, /features and /faq under it are built ahead and served from the CDN (manual 35.ap-2).
// • lang: the address's country's locale (country_settings.locale) — the value proxy.ts puts in x-hg-page-lang for the same address,
//   read through the same tagged data cache the landing, /features and /faq read (marketing-countries), so a change to it shows on the next request.
// • data-brand="hatchgrab": these addresses exist on HatchGrab only. Any other host gets today's 404 from proxy.ts before this runs.
// • Metadata: the root layout's, for www.hatchgrab.com (lib/root-metadata.ts).
// It is the TOP of this route group, so it has no parent to inherit from; the country legal pages (/fr/privacy …) are NOT under it —
// they stay on the app's layout (app/(app)/[country]/(legal), Dominic's Q1 = B).
import { marketingCountryList } from '@/lib/marketing-cache'
import { countryOfSegment } from '@/lib/marketing-country'
import { htmlLangOf } from '@/lib/page-lang'
import { rootMetadataFor, ROOT_VIEWPORT } from '@/lib/root-metadata'
import { PublicDocument } from '@/components/public/PublicDocument'

const HOST = 'www.hatchgrab.com'

// An address whose segment is no country never reaches this layout: proxy.ts sends it to the app's own 404 (lib/top-level-routes.ts).
export function generateMetadata() {
  return rootMetadataFor(HOST)
}
export const viewport = ROOT_VIEWPORT

async function langOf(segment: string): Promise<string> {
  const code = countryOfSegment(segment)
  if (!code) return htmlLangOf(null)
  // The tagged shared cache directly (lib/marketing-cache.ts) — NOT markMarketingRender(), which would switch every read in the render
  // to it, the per-request /compare and comparison pages' included. A failed read THROWS (never "en" stored with a built-ahead page);
  // the page's own reads of the same list fail the same way, so the CDN keeps the last good page.
  const row = (await marketingCountryList()).find(c => c.countryCode === code)
  return htmlLangOf(row?.locale ?? null)
}

export default async function CountryRootLayout({ children, params }: { children: React.ReactNode; params: Promise<{ country: string }> }) {
  return <PublicDocument lang={await langOf((await params).country)} brand="hatchgrab">{children}</PublicDocument>
}
