// app/compare/page.tsx
// 🔴 A SERVER COMPONENT, AND IT MUST STAY ONE. It gates the calculator and renders the shared landing
// chrome around it; the calculator itself lives in ./CostComparison.tsx as a client component because it
// is nine hooks of interactive state.
//
// ── 🔴 WHY THE GATE IS HERE AND NOT A CONDITIONAL INSIDE THE CALCULATOR ─────────────────────────────
// The obvious "simplification" is to delete this file and write, inside the client component:
//
//     {PRICING_PUBLISHED || isAdmin ? <Calculator/> : null}
//
// 🔴 THAT WOULD NOT PROTECT THE PRICES, AND IT WOULD LOOK LIKE IT DID. `./CostComparison.tsx` imports
// PLAN_MONTHLY_PENCE, PLAN_ONLINE_ALLOWANCE, PLATFORM_FEE_OVER_ALLOWANCE and CARD_FEES. A client-side
// conditional hides the MARKUP; the module is still in the JavaScript bundle sent to the browser, so
// every unpublished price is readable in devtools by anyone who loads the URL. Hiding is not gating.
// ⚠️ It would also need a SECOND admin check, because `verifyAdmin` cannot run in a client module: its
// import chain ends at `cookies()` from `next/headers`, which Next.js rejects there.
// 🔴 SO: IF THIS FILE IS COLLAPSED INTO THE CLIENT COMPONENT, THE GATE IS GONE AND NOTHING WILL SAY SO.
//
// ── ⚠️ WHAT THIS GATE IS AND IS NOT FOR ────────────────────────────────────────────────────────────
// It is NOT the page's only protection today: `app/landing/layout.tsx` wraps this route and already
// admits admins only. This gate exists so the page is safe WITHOUT that one — if the landing ever
// ungates before pricing publishes, unpublished prices would otherwise become public with no error and
// no warning. ⚠️ THE LAYOUT RUNS FIRST AND IS STRICTER, so while the landing stays gated a non-admin is
// stopped there even with the flag set.
import type { Metadata, ResolvingMetadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { isHatchGrabHost } from '@/lib/brand'
import { MarketingFrame } from '@/components/landing/MarketingFrame'   // site-chrome-1: the ONE shared header and footer
import CostComparison from './CostComparison'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/compare'
// native-prices: the currency line's words (`pricing.currencyLine`)
import '@/lib/i18n/catalog/pricing'
import { currencyLineOf } from '@/lib/country-settings-types'
import { getPlanCatalog } from '@/lib/plans-server'   // Stage B: the calculator's plans are the data's
// languages-1: plan names in the page's language (lib/plan-names.ts) — the same catalogue for every English locale.
import { localizePlans } from '@/lib/plan-names'
// 🔴 The visitor's country (Phase 2D-1) — ?country, the hg_country cookie, the request's country, else GB; server-side.
import { resolveVisitorCountry } from '@/lib/visitor-country'
// Language Phase 1e: the calculator's words are read in THIS country's locale, handed down — CostComparison never
// resolves a country or a language itself.
import { localeOfCountry } from '@/lib/i18n/locales'
import { marketingCountry, countryPageAlternates } from '@/lib/marketing-meta'
import '../landing/landing.css'

export const dynamic = 'force-dynamic'

// ── 🔴 noindex, nofollow — DELIBERATE, AND NOT THE SAME DECISION AS THE GATE ────────────────────
// The gate below decides WHO may load this page. This decides whether a crawler may keep it. They are
// different questions and this page needs both answered "no by default":
//   • it carries the REAL, UNMASKED price list (no maskPrice import anywhere in ./CostComparison),
//   • the link is handed out directly, so there is no search traffic to win,
//   • and the landing page it belongs beside is still embargoed and carries robots:{index:false} too —
//     an indexed /compare beside a noindexed landing would be the one page Google keeps.
// 🟢 `follow: false` as well as `index: false`: this page links out to /contact, /login and the landing,
// and there is no reason for it to pass any crawl signal on while it is not meant to be found.
// ⚠️ It no longer links to /signup — all three CTAs are demo-modal BUTTONS now, which a crawler cannot
// follow at all. `follow: false` is therefore doing less work than it was, and still correct.
// ⚠️ THIS DOES NOT MAKE IT PRIVATE. noindex is a request to well-behaved crawlers, nothing more. The
// gate is what stops people; this only stops the page turning up in a search result.
// ── Language Phase 1e: A FUNCTION NOW, BECAUSE THE COUNTRY ADDRESSES NEED THEIR OWN URLS ─────────────────────
// At the old address (no country segment) it returns exactly the object this page exported before — robots only.
// At a COUNTRY address (/uk/compare, /us/compare — app/[country]/compare) it adds what every country page carries:
// canonical = its own address, hreflang = every switched-on country + x-default → /compare, og:url = its own
// address and og:locale = its country's. 🔴 STILL noindex, nofollow — and so /compare stays OUT of the sitemap for
// every country (app/sitemap.ts).
// ⚠️ THE OPEN GRAPH OBJECT IS THE ROOT LAYOUT'S, with url and locale replaced. A page's `openGraph` REPLACES the
// layout's whole object rather than merging into it, so setting og:url alone would have dropped the share card,
// title and site name this page inherited; reading `parent` keeps every other field exactly as it was.
export async function generateMetadata({ params, searchParams }: { params?: Promise<{ country?: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }, parent: ResolvingMetadata): Promise<Metadata> {
  const segment = (await params)?.country
  if (segment === undefined) return { robots: { index: false, follow: false } }
  // 🔴 The brand gate first, as the page does — no country is read for a host this route does not serve.
  if (!(await onHatchGrab())) {
    notFound()
  }
  const visitor = await resolveVisitorCountry((await searchParams)?.country, { segment, page: 'compare' })
  const at = countryPageAlternates('compare', visitor.settings.countryCode, visitor.countryPage?.alternates ?? [])
  const inherited = (await parent).openGraph
  // seo-fixes N1 (20 October 2026): its own title and description, in the country's words (`compare.meta` —
  // "Cost calculator — HatchGrab UK" / "… US"; the country is the row's short name). 🔴 STILL noindex.
  const tm = translatorFor(visitor.settings.locale, 'compare')
  const title = tm('meta.title', { country: marketingCountry(visitor.settings).short })
  const description = tm('meta.description')
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: at.canonical, languages: at.languages },
    openGraph: { ...(inherited ?? {}), title, description, url: at.canonical, locale: marketingCountry(visitor.settings).ogLocale } as Metadata['openGraph'],
    twitter: { ...((await parent).twitter ?? {}), title, description } as Metadata['twitter'],
  }
}

/** The one place this route asks which brand it is serving. Same shape as app/contact/page.tsx:36. */
async function onHatchGrab(): Promise<boolean> {
  const headersList = await headers()
  return isHatchGrabHost(headersList.get('host') || '')
}

// site-chrome-1 (5 November 2026): the chrome's fonts are declared once, in components/landing/MarketingFrame.tsx.

// 🔴 THE `.hg-landing` WRAPPER GOES ROUND THE CHROME ONLY — NEVER ROUND THE CALCULATOR (MarketingFrame's "split" shape).
// All rules in landing.css are scoped under `.hg-landing`, and one of them is `.hg-landing * { margin: 0 }`. That single rule
// would strip every Tailwind margin in the calculator — `mt-3`, `mt-5`, and the `space-y-3` stacks. So the chrome is wrapped
// twice, above and below, and the calculator sits outside both.

export default async function CostPage({ params, searchParams }: { params?: Promise<{ country?: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // ── 🔴 GATE 1 OF 2: THE BRAND. THIS PAGE DOES NOT EXIST ON VILLAGE FOODIE. ────────────────────
  // Village Foodie is the CONSUMER discovery brand. Someone there is looking for a food truck, not for
  // operator plan pricing, and showing them £29/£49 tiers is the branding leak app/contact/page.tsx's
  // host split exists to prevent. Being a top-level route, this page is served on BOTH domains unless
  // something says otherwise — nothing in proxy.ts scopes it — so this is that something.
  // 🟢 notFound(), NOT a redirect: on that host the page genuinely does not exist, and a 404 says so
  // without leaking that it exists elsewhere. Next renders the 404 in Village Foodie's own chrome.
  // ⚠️ FIRST, BEFORE ANY AUTH WORK. It needs only a header, so an anonymous visitor on the wrong brand
  // never costs a Supabase round-trip.
  if (!(await onHatchGrab())) {
    notFound()
  }

  // ── 🔴 THE PRICING-FLAG GATE WAS REMOVED HERE — 3 SEPTEMBER 2026. THE PAGE IS PUBLIC. ───────
  // It read:
  //     if (!PRICING_PUBLISHED && !(await verifyAdmin())) redirect('/contact')
  // 🟢 WHY IT WENT: the landing page's own admin gate was removed this morning, and the landing now
  // LINKS here from its pricing section. A gated page behind a public link is a broken promise — the
  // switching block tells a visitor it takes about a minute and then bounces them to a contact form.
  // The two had to move together and the landing moved first.
  // 🔴 THE FLAG ITSELF IS UNTOUCHED AND STILL MATTERS ELSEWHERE. NEXT_PUBLIC_PRICING_PUBLISHED still
  // governs price masking in Manage -> Billing, FeatureGate and the van add-on through lib/pricing.ts,
  // which this change does not modify. Removing the check HERE decouples this page from that decision;
  // it does not make the decision. Do not read this as "the flag no longer does anything".
  // ⚠️ SO THIS PAGE NOW SHOWS THE REAL PRICE LIST TO ANYONE ON A HATCHGRAB HOST, unconditionally. That is
  // the intent. The only thing still standing between it and the public is the host gate above.

  // The marketing country's prices (lib/marketing-country.ts), read AFTER the host gate so the Village
  // Foodie 404 costs no read. Loud: a missing row or an undecided price throws rather than rendering a
  // calculator built on borrowed figures.
  // Phase 2D-1: the visitor's country (lib/visitor-country.ts), on the server, after the host gate.
  // Language Phase 1e: at a country address the country is the ADDRESS's (lib/visitor-country.ts resolveCountryPage).
  const visitor = await resolveVisitorCountry((await searchParams)?.country, { segment: (await params)?.country, page: 'compare' })
  // compare-tidy-2 (20 October 2026): the OUTREACH override of the free months — `?free=N`, a whole number 1–12, replaces the
  // trial's length (plans.trial_months) for this visit. Anything else (missing, 0, 13, "abc", "2.5", repeated) → null →
  // the data value. No visible input.
  const freeRaw = (await searchParams)?.free
  const freeMonthsOverride = typeof freeRaw === 'string' && /^\d{1,2}$/.test(freeRaw) && +freeRaw >= 1 && +freeRaw <= 12 ? +freeRaw : null
  const settings = visitor.settings
  const catalog = localizePlans(await getPlanCatalog(), settings.locale)

  // ── 🔴 THE PROVIDER AND THE MODAL CAME BACK — 3 SEPTEMBER 2026. THIS PAGE'S CTAs OPEN THE DEMO. ───
  // They were removed on 23 August, when all three of this page's CTAs pointed at /signup and nothing in
  // the tree called useDemoModal(). All three now open the demo modal instead — the nav below by DROPPING
  // its `cta` prop, and the calculator's two by rendering <DemoCta> — so the provider is required again,
  // and the previous note here ("IF YOU EVER DROP THE `cta` PROP, THE PROVIDER MUST COME BACK") is the
  // instruction that was followed. It is restored exactly as app/landing/page.tsx has it: ONE provider
  // wrapping the whole tree, ONE <DemoModal /> at the end.
  //
  // 🔴 WHY THE CTAs MOVED OFF /signup — AN OPERATOR DECISION, 3 SEPTEMBER 2026, NOT A REFACTOR.
  // /signup → /setup CANNOT COMPLETE and has not since 4 August 2026: app/api/setup/route.ts:70-72
  // requires `contact_phone` and app/setup/page.tsx has no field for it, so every attempt 400s AFTER the
  // account is created — permanently consuming the email address. See docs/signup-journey-review-report.md.
  // The demo path is the one that works, collects more (phone, WhatsApp preference, first/last name,
  // cuisine) and lands a materially more complete truck — docs/onboarding-completeness-report.md §6.
  // ⚠️ SO THIS IS A ROUTE AROUND A BREAK, NOT A FIX OF IT. /signup and /setup are untouched and still
  // exist; app/manage/page.tsx:56 still sends a truckless operator to /setup, and that is deliberate.
  // 🔴 IF /setup IS EVER REPAIRED, THIS PAGE DOES NOT AUTOMATICALLY GO BACK. Reverting is a product
  // decision about which door a cost-comparison visitor should walk through, not a cleanup.
  //
  // ⚠️ EXACTLY ONE PROVIDER AND EXACTLY ONE MODAL. A second provider lower down would give the CTAs
  // under it their own `open` state, and the modal mounted here would never see it — the CTA would look
  // dead. CostComparison.tsx deliberately renders neither.
  return (
    // site-chrome-1 (5 November 2026): the ONE shared frame (components/landing/MarketingFrame.tsx), its "split" shape: the nav in
    // `chrome-nav-only` (so it stays sticky), the calculator OUTSIDE `.hg-landing` (its reset would strip every margin and padding
    // in it), then the footer and the one demo modal — exactly the structure this page had inline.
    <MarketingFrame visitor={visitor} variant="split">

      {/* native-prices (22 October 2026): where the country's currency symbol is shared, the line naming it — written here, on
          the server, so the calculator loads no second message catalogue. Passed ONLY when there is one, so a GB, US or IE
          page's props are exactly what they were. */}
      <CostComparison settings={settings} catalog={catalog} locale={localeOfCountry(settings)} freeMonthsOverride={freeMonthsOverride}
        {...(currencyLineOf(settings) ? { currencyLine: translatorFor(settings.locale, 'pricing')('currencyLine', currencyLineOf(settings)!) } : {})} />

    </MarketingFrame>
  )
}
