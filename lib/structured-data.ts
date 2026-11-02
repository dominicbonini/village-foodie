// lib/structured-data.ts — 🔴 THE MARKETING PAGES' JSON-LD, BUILT FROM DATA (seo-fixes M5 + S9, 20 October 2026;
// docs/seo-fixes-report.md).
//
// One `@graph` per country landing page:
//   • Organization — name, url, logo, sameAs = the App Store and Google Play listings the site already links to
//     (lib/app-badges.ts: the App Store link is the page country's storefront, exactly as the footer's badge);
//   • WebSite — name and url;
//   • SoftwareApplication — the block the landing always carried, its `url` now the PAGE'S OWN country address (/uk,
//     /us — M5; it was the router root), and — only while the page shows real prices — an Offer per public plan in the
//     country's currency, from public.plan_prices (lib/plan-offer.ts offerPlans: the SAME rows the pricing cards render).
// ── ai-search-1 (21 October 2026, docs/ai-search-1-report.md): facts an answer engine can quote ───────────────────────────
//   • Organization + legalName ("HatchGrab Ltd") and its country of registration (GB), from lib/company.ts — the
//     Companies House record, named once;
//   • SoftwareApplication + operatingSystem "Web, iOS, Android" — the web app plus the two store listings in sameAs.
//     ⛔ faq-2-seo-geo-2 B3 (2 November 2026): TRUE PER COUNTRY (35.ak-7) — "Web" everywhere, plus "iOS" / "Android" only where
//     that country's country_settings.ios_app_available / android_app_available is true (operatingSystemsOf). sameAs is unchanged.
// ── faq-3 (2 November 2026, docs/faq-3-report.md §3) ────────────────────────────────────────────────────────────────────────
//   • FAQPage (faqPageLd) — the ONE builder for the comparison pages' FAQ (lib/comparison.ts) and the English landing pages'
//     (`faq`, only when the page shows its FAQ section). Each answer's text is the visible answer, exactly.
// ⛔ NOTHING IS TYPED: the brand name and origin, the logo path, the store URLs, the plans, their prices and the
// currency all come from their one definition. ⛔ NO OFFER IS EMITTED FOR A PRICE THE PAGE DOES NOT SHOW (`pricesShown`
// is the caller's statement of what the page renders).
import { BRANDS, HATCHGRAB_LOGO_PNG } from '@/lib/brand'
import { HATCHGRAB_ORIGIN } from '@/lib/marketing-country'
import { appStoreUrlFor, GOOGLE_PLAY_URL } from '@/lib/app-badges'
import { COMPANY } from '@/lib/company'
import { minorDigits } from '@/lib/money-format'
import type { PlanCatalog } from '@/lib/plans'
import { offerPlans } from '@/lib/plan-offer'

const ORG_ID = `${HATCHGRAB_ORIGIN}/#organization`
const SITE_ID = `${HATCHGRAB_ORIGIN}/#website`

/** A minor-unit amount as schema.org wants a price: a plain decimal string in the currency's own digits ("29.00", "0.00"). */
export function schemaPrice(minor: number, currency: string): string {
  const d = minorDigits(currency)
  return (minor / 10 ** d).toFixed(d)
}

/** about-page (22 October 2026): `founderImage` is the About page's photo URL (lib/about-server.ts aboutPhotoUrl), or null while
 *  there is no photo — the founder is then named without an image. ⛔ No dates or roles: only the name. */
export function organizationLd(countryCode: string | null | undefined, founderImage: string | null = null) {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: BRANDS.HATCHGRAB.name,
    legalName: COMPANY.name,
    address: { '@type': 'PostalAddress', addressCountry: COMPANY.countryCode },
    url: `${HATCHGRAB_ORIGIN}/`,
    logo: `${HATCHGRAB_ORIGIN}${HATCHGRAB_LOGO_PNG}`,
    sameAs: [appStoreUrlFor(countryCode), GOOGLE_PLAY_URL],
    founder: { '@type': 'Person', name: COMPANY.founder.name, ...(founderImage ? { image: founderImage } : {}) },
  }
}

export function websiteLd() {
  return { '@type': 'WebSite', '@id': SITE_ID, name: BRANDS.HATCHGRAB.name, url: `${HATCHGRAB_ORIGIN}/`, publisher: { '@id': ORG_ID } }
}

/** An Offer per public plan priced in the country — monthly, in its currency. Empty unless `pricesShown`. */
export function planOffersLd(catalog: PlanCatalog, countryCode: string, currency: string, pageUrl: string, pricesShown: boolean) {
  if (!pricesShown) return []
  return offerPlans(catalog, countryCode).map(p => {
    const price = schemaPrice(p.monthlyMinor, currency)
    return {
      '@type': 'Offer',
      name: p.plan.name,
      url: `${pageUrl}#pricing`,
      price,
      priceCurrency: currency,
      priceSpecification: { '@type': 'UnitPriceSpecification', price, priceCurrency: currency, unitCode: 'MON' },
    }
  })
}

/** ai-search-1: where HatchGrab runs — the web app, and the iOS and Android apps whose store listings are the
 *  Organization's sameAs (lib/app-badges.ts). One string, as schema.org's examples write it.
 *  faq-2-seo-geo-2 B3: per country — the apps only where they are in that country's stores (the comparison pages' flags). */
export function operatingSystemsOf(apps: { ios: boolean; android: boolean }): string {
  return ['Web', ...(apps.ios ? ['iOS'] : []), ...(apps.android ? ['Android'] : [])].join(', ')
}

/** An FAQ question and its answer, as the page shows them (components/faq/FaqDetails.tsx renders the same pairs). */
export interface FaqPair { q: string; a: string }

/** schema.org FAQPage: one Question per pair, its acceptedAnswer the visible answer's text. `id` is "<page URL>#faq". */
export function faqPageLd(id: string, items: FaqPair[]) {
  return {
    '@type': 'FAQPage', '@id': id,
    mainEntity: items.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }
}

/** The landing page's whole graph. `app` is the SoftwareApplication's own fields (its words are the page's messages). */
export function landingGraph(opts: {
  countryCode: string
  currency: string
  pageUrl: string
  catalog: PlanCatalog
  pricesShown: boolean
  app: Record<string, unknown>
  /** about-page: the founder's photo URL, or null (organizationLd). */
  founderImage?: string | null
  /** faq-3: the FAQ the page shows, or nothing — then no FAQPage is emitted. */
  faq?: FaqPair[] | null
  /** faq-2-seo-geo-2 B3: the country's app flags (country_settings.ios_app_available / android_app_available). */
  apps: { ios: boolean; android: boolean }
}) {
  const offers = planOffersLd(opts.catalog, opts.countryCode, opts.currency, opts.pageUrl, opts.pricesShown)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationLd(opts.countryCode, opts.founderImage ?? null),
      websiteLd(),
      {
        '@type': 'SoftwareApplication',
        ...opts.app,
        operatingSystem: operatingSystemsOf(opts.apps),
        url: opts.pageUrl,
        publisher: { '@id': ORG_ID },
        ...(offers.length ? { offers } : {}),
      },
      ...(opts.faq?.length ? [faqPageLd(`${opts.pageUrl}#faq`, opts.faq)] : []),
    ],
  }
}

/** about-page (22 October 2026): the About page's graph — the Organization (with its founder) and an AboutPage about it.
 *  `pageUrl` is the page's canonical address; `name` and `description` are its own title and meta description. */
export function aboutGraph(opts: { countryCode: string; pageUrl: string; name: string; description: string; inLanguage: string; founderImage: string | null }) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationLd(opts.countryCode, opts.founderImage),
      {
        '@type': 'AboutPage',
        '@id': `${opts.pageUrl}#page`,
        url: opts.pageUrl,
        name: opts.name,
        description: opts.description,
        inLanguage: opts.inLanguage,
        about: { '@id': ORG_ID },
      },
    ],
  }
}
