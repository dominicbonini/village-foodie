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
// ── 🔴 STAGE B OF THE NEW PRICING (docs/pricing-pages-report.md; the approved mockup "/features") ─────────
// h1, lede, THE ONE PLAN TABLE (components/pricing/PlanTable.tsx — the same component Manage ›
// Billing renders) and the landing's card-fee footnote. Every plan, price, fee, allowance, switch and the trial
// length come from public.plans / plan_prices / plan_features (lib/plans.ts); every word from the `planTable` /
// `pricing` messages. ⚠️ STILL NOT A SECOND PRICING PAGE: no plan cards and no CTA beyond the chrome's.
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
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { isHatchGrabHost } from '@/lib/brand'
import { MarketingFrame } from '@/components/landing/MarketingFrame'
// Language Phase 1e: the page's client components (country menu, demo modal and CTAs) read the visitor's locale
// from this boundary.
// languages-1: a non-English page hands its browser the words its client components read (none for English).
import { PlanTable, planTableNotes } from '@/components/pricing/PlanTable'
import { FEATURE_TABLE } from '@/lib/feature-table'
import { getPlanCatalog } from '@/lib/plans-server'
// languages-1: plan names in the page's language (lib/plan-names.ts) — the same catalogue for every English locale.
import { localizePlans } from '@/lib/plan-names'
import { offerPlans, offerTrialMonths, upgradeSummary } from '@/lib/plan-offer'
import { cardFeeOnlineLabel } from '@/lib/card-fees'
import { currencyLineOf, offersOnlineCardPayments } from '@/lib/country-settings-types'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/planTable'
import '@/lib/i18n/catalog/pricing'
import '@/lib/i18n/catalog/planPrompt'
import '@/lib/i18n/catalog/featuresPage'
// 🔴 The visitor's country (Phase 2D-1) — ?country, the hg_country cookie, the request's country, else GB; server-side.
import { resolveVisitorCountry, resolveBuiltAheadCountry } from '@/lib/visitor-country'
import { marketingCountry, countryPageAlternates } from '@/lib/marketing-meta'
import '../landing/landing.css'
import { markMarketingRender } from '@/lib/marketing-render'   // perf-1

export const dynamic = 'force-dynamic'

// 🔴 US readiness (D37): the tags name the visitor's country — lib/marketing-meta.ts. For GB every value is the
// literal this page carried before ("UK", en_GB), byte-identical.
export async function generateMetadata({ params, searchParams }: { params?: Promise<{ country?: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  markMarketingRender()   // perf-1: this render reads the marketing pages' tagged shared cache (lib/marketing-render.ts)
  // 🔴 The brand gate first, as the page does — no country is read for a host this route does not serve.
  // cwv-2: at a country address (built ahead) the host gate is proxy.ts's, so nothing from the request is read here.
  const segment = (await params)?.country
  if (segment === undefined && !(await onHatchGrab())) {
    notFound()
  }
  // Language Phase 1e: at a COUNTRY address (/uk/features, /us/features — app/[country]/features) the country is the
  // address's; canonical and og:url are that address, hreflang every switched-on country + x-default → /features.
  const visitor = segment !== undefined ? await resolveBuiltAheadCountry(segment, 'features') : await resolveVisitorCountry((await searchParams)?.country)
  const c = marketingCountry(visitor.settings)
  const at = visitor.countryPage && countryPageAlternates('features', visitor.settings.countryCode, visitor.countryPage.alternates)
  // 🔴 STAGE B: the description named the retired tiers ("Starter, Pro and Max") and "your first month". It now names
  // the public plans and the trial length from the data — the one SEO change on this page (the title is unchanged).
  const catalog = localizePlans(await getPlanCatalog(), visitor.settings.locale)
  // languages-1: the title's words in the page's language (`featuresPage.metaTitle`; en-GB exactly as before).
  const title = translatorFor(visitor.settings.locale, 'featuresPage')('metaTitle', { country: c.short })
  const description = translatorFor(visitor.settings.locale, 'planTable')('meta.description', {
    plans: new Intl.ListFormat(visitor.settings.locale, { type: 'conjunction' }).format(offerPlans(catalog, visitor.settings.countryCode).map(p => p.plan.name)),
    months: offerTrialMonths(catalog) ?? 0,
  })
  return {
    // ── TITLE. Its own, in the landing's style: terms first, brand last, under Google's ~60 chars.
    // 🔴 `absolute`, NOT a bare string — app/layout.tsx declares `title: { template: '%s | HatchGrab' }`,
    // so a plain string renders the brand twice. The landing page carries the same note and the same fix,
    // and it was caught there in the SERVED <head> rather than in the source.
    title: { absolute: title },

    // ⚠️ IT NAMES THE PLANS AND THE FREE TRIAL, which is what the page actually answers. It deliberately
    // does NOT repeat the landing's "not a POS" boundary — that line is there to make the wrong buyer
    // self-select out of a click on a page ABOUT the product; someone searching a feature comparison has
    // already decided what they are looking at.
    description,

    robots: { index: true, follow: true },

    alternates: at ? { canonical: at.canonical, languages: at.languages } : { canonical: 'https://www.hatchgrab.com/features' },

    // ── OPEN GRAPH + TWITTER, same shape as the landing's. The image is the EXISTING share card —
    // public/logos/hatchgrab-share-card.png — and the dimensions below are the ones read from that PNG's
    // header for the landing page (1200×630), not a fresh guess. ⚠️ Re-measure if the card is re-rendered.
    openGraph: {
      type: 'website',
      siteName: 'HatchGrab',
      url: at ? at.canonical : 'https://www.hatchgrab.com/features',
      title: title,
      description,
      images: [{ url: 'https://www.hatchgrab.com/logos/hatchgrab-share-card.png', width: 1200, height: 630, alt: 'HatchGrab' }],
      locale: c.ogLocale,
    },
    twitter: {
      card: 'summary_large_image',
      title: title,
      description,
      images: ['https://www.hatchgrab.com/logos/hatchgrab-share-card.png'],
    },
  }
}

/** The one place this route asks which brand it is serving. Same shape as app/compare/page.tsx. */
async function onHatchGrab(): Promise<boolean> {
  const headersList = await headers()
  return isHatchGrabHost(headersList.get('host') || '')
}

// ── The fonts: declared in components/landing/MarketingFrame.tsx (faq-4 moved them there with the frame), not imported from the
// landing page. landing.css reads --font-archivo / --font-public-sans / --font-courier-prime, set by the class each next/font instance
// generates; instances of the same config share the variable NAMES, and next/font deduplicates the files. /compare carries the same
// three declarations for the same reason.

export default async function FeaturesPage({ params, searchParams }: { params?: Promise<{ country?: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  markMarketingRender()   // perf-1: this render reads the marketing pages' tagged shared cache (lib/marketing-render.ts)
  // ── 🔴 THE BRAND GATE. THIS PAGE DOES NOT EXIST ON VILLAGE FOODIE. See the header note.
  // ⚠️ FIRST, AND IT NEEDS ONLY A HEADER — a visitor on the wrong brand never costs a round trip.
  // cwv-2: at a country address (built ahead) the host gate is proxy.ts's, so nothing from the request is read here.
  const segment = (await params)?.country
  if (segment === undefined && !(await onHatchGrab())) {
    notFound()
  }
  // After the host check, so the non-HatchGrab 404 costs no read. Loud: a missing row throws.
  // Phase 2D-1: the visitor's country (lib/visitor-country.ts), on the server.
  // Language Phase 1e: at a country address the country is the ADDRESS's (lib/visitor-country.ts resolveCountryPage).
  const visitor = segment !== undefined ? await resolveBuiltAheadCountry(segment, 'features') : await resolveVisitorCountry((await searchParams)?.country)
  const settings = visitor.settings
  // 🔴 STAGE B: everything below the nav is the plan data, in the country's words.
  const catalog = localizePlans(await getPlanCatalog(), settings.locale)
  const plans = offerPlans(catalog, settings.countryCode)
  const ups = upgradeSummary(catalog, plans)
  const t = translatorFor(settings.locale, 'planTable')
  const tPricing = translatorFor(settings.locale, 'pricing')
  const tPrompt = translatorFor(settings.locale, 'planPrompt')
  const list = (xs: string[]) => new Intl.ListFormat(settings.locale, { type: 'conjunction' }).format(xs)
  // A feature's short word in the lede ("WhatsApp", "social media"), else its generic name.
  const short = (f: string) => (t.has(`short.${f}` as never) ? t(`short.${f}` as never) : tPrompt(`features.${f}.name` as never))
  // features-page-restore: the eyebrow and each capability row's description — the pre-Stage-B page's words, restored
  // as `featuresPage` (en-GB base, en-US overrides). They name no plan and no number: the table says who has what.
  const tPage = translatorFor(settings.locale, 'featuresPage')
  // site-chrome-1 (5 November 2026): offline protection's description is again the one sentence it was before copy-truth-1 (Dominic).
  const details = Object.fromEntries(FEATURE_TABLE.map(r => [r.id, tPage(`detail.${r.id}` as never)]))

  // faq-4 (2 November 2026): the page frame (fonts, chrome, nav, footer, demo modal) is components/landing/MarketingFrame.tsx — moved
  // from here, not rewritten, and shared with /<country>/faq. This page renders byte-identically through it.
  return (
    <MarketingFrame visitor={visitor}>
        {/* The approved mockup's content in the pre-Stage-B page's look (features-page-restore, 20 October 2026): the
            centred eyebrow + heading + lede (the h1 keeps the old h2's look — still the page's one h1), the plan table in its "features" variant with a description per row, and the
            footnotes in the old `.fn` style. */}
        <section className="band features-page">
          <div className="wrap">
            <p className="eyebrow">{tPage('eyebrow')}</p>
            <h1>{t('h1')}</h1>
            <p className="lede">{t('lede', {
              hasUpgrades: ups.plans.length && ups.features.length ? 'yes' : 'no',
              plans: list(ups.plans.map(p => p.plan.name)),
              features: list(ups.features.map(short)),
            })}</p>
            {/* ⛔ THE TRIAL CALLOUT ("3 months free with every feature unlocked. Then Pay as you go automatically…") IS
                REMOVED — Dominic, 21 October 2026 (landing-mobile-tidy). The landing's pricing banner still says it. */}
            {/* seo-fixes S7 (measured, 20 October 2026): rendered as the component, NOT as a static-HTML string — the
                string, JSON-escaped into the RSC payload, made this page LARGER (89.5 → 102 KB); React's element tree
                de-duplicates the repeated cells. The payload is already only what the page renders. */}
            {/* native-prices (22 October 2026): where the country's currency symbol is shared, the line naming it, above the
                table (the pricing section's `.price-currency`). Billing, which reuses the table, carries it in its footnote. */}
            {currencyLineOf(settings) && <p className="price-currency">{tPricing('currencyLine', currencyLineOf(settings)!)}</p>}
            <PlanTable catalog={catalog} settings={settings} highlight={plans.find(p => p.highlighted)?.plan.key ?? null}
              variant="features" details={details} />
            {/* The card-fee footnote (*) and the rows' disclosures (¹ ², pricing-tidy), in the old table's footnote style.
                pricing-copy-4: the footnote only in a card country (offersOnlineCardPayments); the table's asterisk follows the same rule. */}
            <div className="fn">
              {offersOnlineCardPayments(settings) && <p>{tPricing('footnote', { cardFee: cardFeeOnlineLabel(settings), country: settings.shortName ?? settings.name })}</p>}
              {planTableNotes(settings.locale).map(n => <p key={n.marker}><sup>{n.marker}</sup> {n.text}</p>)}
            </div>
          </div>
        </section>
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
    </MarketingFrame>
  )
}
