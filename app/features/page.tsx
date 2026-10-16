// app/features/page.tsx — the full plan comparison, on its own page.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS PAGE EXISTS (6 October 2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// The landing page was too long, and the longest thing on it was the comparison table: 31 rows across
// four columns plus five footnotes, sitting below the plan cards that most visitors came for. The
// section moved here INTACT — same component, same data source, same row order — and the landing now
// carries a text link to it under the plan cards.
//
// ── ⚠️ WHAT THIS PAGE IS NOT ──────────────────────────────────────────────────────────────────────
// It is NOT a second pricing page. It has no plan cards, no trial banner and no CTA of its own beyond
// the chrome's: the prices and the decision live on the landing, and the one link at the bottom sends
// a reader back to them. Adding cards here would give the product two pricing surfaces to keep in
// step, which is the duplication lib/plan-features.ts exists to prevent.
//
// ── 🔴 HOST HANDLING: THE SAME SHAPE AS /compare, AND FOR THE SAME REASON ─────────────────────────
// Village Foodie is the CONSUMER discovery brand. Someone there is looking for a food truck, not for
// operator plan tiers, and a £29/£49 table is the branding leak app/contact/page.tsx's host split
// exists to prevent. Being a top-level route, this page would otherwise be served on BOTH domains —
// nothing in proxy.ts scopes it — so `notFound()` is that something. 🟢 notFound(), NOT a redirect:
// on that host the page genuinely does not exist, and a 404 says so without leaking that it exists
// elsewhere. Next renders the 404 in Village Foodie's own chrome.
//
// ── 🟢 UNLIKE /compare, THIS PAGE IS INDEXABLE, AND THAT IS A DELIBERATE DIFFERENCE ───────────────
// /compare carries `robots: { index: false, follow: false }` because it shows the real unmasked price
// list to a hand-picked audience and has no search traffic to win. This page is the opposite case: the
// landing it came from is already `index: true`, the content was public on it this morning, and
// "what's included on each plan" is exactly what an operator types into a search box. Removing it from
// the landing and NOT indexing it here would have made a public page private by accident.
import { Archivo, Public_Sans, Courier_Prime } from 'next/font/google'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { isHatchGrabHost } from '@/lib/brand'
import { LandingNav } from '@/components/landing/LandingNav'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { DemoModalProvider, DemoModal } from '@/components/landing/DemoUpload'   // client children — the chrome's CTA
// Language Phase 1e Part C: the page's client components (country menu, demo modal and CTAs) read the visitor's locale
// from this boundary, seeded with that locale's overrides so a US page hydrates in US words (null for en-GB).
import { LocaleWords } from '@/lib/i18n/locale-words'
import { wordsFor } from '@/lib/i18n/server-words'
import { NAMESPACES } from '@/lib/i18n/namespaces'
import { localeOfCountry } from '@/lib/i18n/locales'
import { FeatureComparison } from '@/components/landing/FeatureComparison'
// 🔴 The visitor's country (Phase 2D-1) — ?country, the hg_country cookie, the request's country, else GB; server-side.
import { resolveVisitorCountry } from '@/lib/visitor-country'
import { marketingCountry, countryPageAlternates } from '@/lib/marketing-meta'
import '../landing/landing.css'

export const dynamic = 'force-dynamic'

// 🔴 US readiness (D37): the tags name the visitor's country — lib/marketing-meta.ts. For GB every value is the
// literal this page carried before ("UK", en_GB), byte-identical.
export async function generateMetadata({ params, searchParams }: { params?: Promise<{ country?: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  // 🔴 The brand gate first, as the page does — no country is read for a host this route does not serve.
  if (!(await onHatchGrab())) {
    notFound()
  }
  // Language Phase 1e: at a COUNTRY address (/uk/features, /us/features — app/[country]/features) the country is the
  // address's; canonical and og:url are that address, hreflang every switched-on country + x-default → /features.
  const visitor = await resolveVisitorCountry((await searchParams)?.country, { segment: (await params)?.country, page: 'features' })
  const c = marketingCountry(visitor.settings)
  const at = visitor.countryPage && countryPageAlternates('features', visitor.settings.countryCode, visitor.countryPage.alternates)
  return {
    // ── TITLE. Its own, in the landing's style: terms first, brand last, under Google's ~60 chars.
    // 🔴 `absolute`, NOT a bare string — app/layout.tsx declares `title: { template: '%s | HatchGrab' }`,
    // so a plain string renders the brand twice. The landing page carries the same note and the same fix,
    // and it was caught there in the SERVED <head> rather than in the source.
    title: { absolute: `Plans & features compared — HatchGrab ${c.short}` },

    // ⚠️ IT NAMES THE TIERS AND THE FREE MONTH, which is what the page actually answers. It deliberately
    // does NOT repeat the landing's "not a POS" boundary — that line is there to make the wrong buyer
    // self-select out of a click on a page ABOUT the product; someone searching a feature comparison has
    // already decided what they are looking at.
    description:
      'Every HatchGrab feature on every plan, side by side — Starter, Pro and Max, with fees and '
      + 'allowances. Your first month includes everything.',

    robots: { index: true, follow: true },

    alternates: at ? { canonical: at.canonical, languages: at.languages } : { canonical: 'https://www.hatchgrab.com/features' },

    // ── OPEN GRAPH + TWITTER, same shape as the landing's. The image is the EXISTING share card —
    // public/logos/hatchgrab-share-card.png — and the dimensions below are the ones read from that PNG's
    // header for the landing page (1200×630), not a fresh guess. ⚠️ Re-measure if the card is re-rendered.
    openGraph: {
      type: 'website',
      siteName: 'HatchGrab',
      url: at ? at.canonical : 'https://www.hatchgrab.com/features',
      title: `Plans & features compared — HatchGrab ${c.short}`,
      description:
        'Every HatchGrab feature on every plan, side by side — Starter, Pro and Max, with fees and '
        + 'allowances. Your first month includes everything.',
      images: [{ url: 'https://www.hatchgrab.com/logos/hatchgrab-share-card.png', width: 1200, height: 630, alt: 'HatchGrab' }],
      locale: c.ogLocale,
    },
    twitter: {
      card: 'summary_large_image',
      title: `Plans & features compared — HatchGrab ${c.short}`,
      description:
        'Every HatchGrab feature on every plan, side by side — Starter, Pro and Max, with fees and '
        + 'allowances. Your first month includes everything.',
      images: ['https://www.hatchgrab.com/logos/hatchgrab-share-card.png'],
    },
  }
}

/** The one place this route asks which brand it is serving. Same shape as app/compare/page.tsx. */
async function onHatchGrab(): Promise<boolean> {
  const headersList = await headers()
  return isHatchGrabHost(headersList.get('host') || '')
}

// ── 🔴 DECLARED HERE, NOT IMPORTED FROM THE LANDING PAGE. ───────────────────────────────────────────
// landing.css reads --font-archivo / --font-public-sans / --font-courier-prime, and those variables are
// set by the class each next/font instance generates. Two instances of the same config share the same
// CSS variable NAMES, so the chrome and the table style identically; next/font deduplicates the font
// files themselves. /compare carries the same three declarations for the same reason.
const archivo = Archivo({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-archivo', display: 'swap' })
const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' })
const courierPrime = Courier_Prime({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-courier-prime', display: 'swap' })

// 🔴 ONE `.hg-landing` ROUND THE WHOLE PAGE, WHICH /compare DELIBERATELY DOES NOT DO.
// All of landing.css is scoped under `.hg-landing`, and one of its rules is `.hg-landing * { margin: 0 }`.
// That is why /compare splits its wrapper in two — its calculator is Tailwind and the scoped reset would
// strip every `mt-3` and `space-y-3` in it. ⚠️ NOTHING ON THIS PAGE IS TAILWIND: the chrome and the table
// are landing.css markup throughout, so one wrapper is correct here AND is what makes the sticky table
// header work — `.hg-landing nav` is `position: sticky`, and a sticky element only travels inside its
// parent's box, so the nav's containing block must be the page.
const CHROME = `hg-landing ${archivo.variable} ${publicSans.variable} ${courierPrime.variable}`

export default async function FeaturesPage({ params, searchParams }: { params?: Promise<{ country?: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // ── 🔴 THE BRAND GATE. THIS PAGE DOES NOT EXIST ON VILLAGE FOODIE. See the header note.
  // ⚠️ FIRST, AND IT NEEDS ONLY A HEADER — a visitor on the wrong brand never costs a round trip.
  if (!(await onHatchGrab())) {
    notFound()
  }
  // After the host check, so the non-HatchGrab 404 costs no read. Loud: a missing row throws.
  // Phase 2D-1: the visitor's country (lib/visitor-country.ts), on the server.
  // Language Phase 1e: at a country address the country is the ADDRESS's (lib/visitor-country.ts resolveCountryPage).
  const visitor = await resolveVisitorCountry((await searchParams)?.country, { segment: (await params)?.country, page: 'features' })
  const settings = visitor.settings

  return (
    <LocaleWords locale={localeOfCountry(settings)} words={wordsFor(localeOfCountry(settings), NAMESPACES.marketing)}>
    <DemoModalProvider>
      <div className={CHROME}>
        {/* ⚠️ `landingHref` IS NOT OPTIONAL ON A CHILD ROUTE. The nav's logo and its Pricing link are
            BARE FRAGMENTS by default (`#pricing`), and a bare fragment resolves against whatever page
            you are on — so on this page they would silently do nothing. See the table in
            LandingNav.tsx. '/landing' is used rather than '/' because '/' is only the landing on a
            hatchgrab host, and /landing is a real route that 308s to the root on this one.
            🔴 THIS IS WHAT STEP 2c ASKS FOR: on the landing, Pricing stays `#pricing`; here it becomes
            `/landing#pricing`. One prop, both behaviours, no second nav. */}
        <LandingNav landingHref={visitor.paths.landing} featuresHref={visitor.paths.features} country={visitor.menu} locale={settings.locale} />

        {/* The moved section — heading, subline, table, footnotes 1–5. */}
        <FeatureComparison settings={settings} />

        {/* ══ ⛔ THE "See prices and plans →" LINK AND ITS SECTION ARE GONE — 6 October 2026 ══════════
            Removed on request. 🔴 THE WHOLE `<section>` WENT, NOT JUST THE `<p>`: every bare
            `<section>` in landing.css carries `padding: clamp(3.5rem,7vw,5.5rem) 0`, so an emptied one
            would have left ~5.5rem of white above the footer — a gap with nothing in it, which is a
            worse artefact than the link was. The footnotes under the table now run straight into the
            footer, and the measured gap is checked rather than assumed; see docs/landing-trim-2-report.md.
            ⚠️ `.features-back` WAS DELETED FROM landing.css IN THE SAME EDIT, so no rule is left
            pointing at markup that no longer exists.
            ⚠️ THE WAY BACK IS STILL THERE — the nav's own "Pricing" link resolves to /landing#pricing
            on this route, via the `landingHref` prop above, and the footer carries one too. */}

        <LandingFooter landingHref={visitor.paths.landing} featuresHref={visitor.paths.features} country={visitor.menu} locale={settings.locale} />
      </div>

      {/* Mounted ONCE — the nav's CTA drives this one instance. It portals to document.body, so it is
          deliberately OUTSIDE `.hg-landing` and brings its own tokens via `hg-demo-modal`. */}
      <DemoModal />
    </DemoModalProvider>
    </LocaleWords>
  )
}
