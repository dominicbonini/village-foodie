// HatchGrab landing page — 🔴 THIS IS hatchgrab.com's ROOT, AND IT IS ADMIN-ONLY.
// middleware.ts rewrites '/' to this route when the Host is hatchgrab, so an ADMIN sees this at
// `https://www.hatchgrab.com/`. Everyone else is redirected to /contact by the gate in layout.tsx.
// villagefoodie.co.uk's '/' is untouched and still renders app/page.tsx, the discovery map, for
// everyone.
// 🔴 THE GATE AND THE noindex ARE BOTH ON, and layout.tsx records the two things that must be true
// before either comes off: written permission for the Pizzeria Gusto testimonial, and real screenshots
// in place of the placeholders below.
// /landing itself still works: middleware redirects it to '/' (308) rather than breaking the links
// that exist to it.
// 🔴 LANGUAGE PHASE 1e (16 October 2026) — SUPERSEDES THE ROUTING NOTES ABOVE. This module now serves the COUNTRY
// addresses /uk and /us (app/[country]/page.tsx re-exports it; `params.country` picks the country). hatchgrab.com/,
// /landing and the unlisted preview are proxy.ts's country router: a 302 to /uk or /us, no longer a rewrite or a 308.
//
// SINGLE SOURCE: the pricing cards + the full comparison table render from lib/plan-features.ts
// (FEATURE_SECTIONS + detail + PLAN_ALLOWANCES + PLAN_PRICES + PLAN_DESCRIPTIONS + TRANSACTION_ROWS +
// FOOTNOTES) — the SAME source Admin and Manage → Billing render from. This route is a THIRD RENDERER, not a
// copy. Importing the source also runs findPlanParityViolations() (module-load guard) on this route.
//
// Self-contained: one route, a scoped stylesheet (./landing.css, all under `.hg-landing`), the wordmark
// component, self-hosted fonts via next/font, the Gusto logo via next/image. Touches nothing else.
import type { Metadata } from 'next'
import Image from 'next/image'
import { Archivo, Public_Sans, Courier_Prime } from 'next/font/google'
import { DemoModalProvider, DemoCta, DemoModal } from '@/components/landing/DemoUpload'   // client children — the public demo entry point
// Language Phase 1e: the page's client components (country menu, demo modal and CTAs) read the visitor's locale
// from this boundary.
import { PageLocale } from '@/lib/i18n/page-locale'
// languages-1: a non-English page hands its browser the words its client components read (none for English).
import { pageSeedProps } from '@/lib/i18n/page-words'
import { localeOfCountry } from '@/lib/i18n/locales'
// Chrome EXTRACTED 23 August 2026 so the cost comparison (now /compare) renders the same nav and footer
// from one definition.
// 🔴 MOVED, NOT REWRITTEN — proven byte-identical; see docs/cost-comparison-chrome-report.md §1.
import { LandingNav } from '@/components/landing/LandingNav'
import { HeroCtaWatcher } from '@/components/landing/HeroCtaWatcher'   // client: drives the header CTA's mobile reveal
import { LandingFooter } from '@/components/landing/LandingFooter'
// compare-de-1: the footer's "Vergleich" column for the country's own comparison page (live, or admins only).
import { comparisonFooter } from '@/lib/comparison-server'
// ══ 🔴 THIS IMPORT IS SMALLER THAN IT WAS, AND IT MUST NOT BECOME EMPTY (6 October 2026) ══════════
// FEATURE_SECTIONS, FOOTNOTES, TRANSACTION_ROWS and `type FeatureValue` went to
// components/landing/FeatureComparison.tsx with the comparison table, and the whole
// `@/lib/landing-table` import went with them — this page no longer renders a table row.
// 🔴 STAGE B (docs/pricing-pages-report.md): the pricing section is components/pricing/PricingSection.tsx, built from the
// plan data (lib/plans.ts through lib/plan-offer.ts). The frozen Starter / Pro / Max copy (lib/legacy-pricing-display.ts)
// is deleted; nothing on this page names a plan, a price or an allowance.
import { PricingSection } from '@/components/pricing/PricingSection'
import { getPlanCatalog } from '@/lib/plans-server'
// languages-1: plan names in the page's language (lib/plan-names.ts) — the same catalogue for every English locale.
import { localizePlans } from '@/lib/plan-names'
import { offerTrialMonths } from '@/lib/plan-offer'
import { priceText } from '@/lib/price-text'
import { PRICE_WORD } from '@/lib/price-words'   // "Pay at Hatch" is a brand: the trial banner names it through its PRICE_WORD, never inside a message
import '@/lib/i18n/catalog/pricing'
import '@/lib/i18n/catalog/planPrompt'
import { landingScreenshot } from '@/lib/landing-screens'   // the hero fan's screenshots, per country (Language Phase 1e)
// 🔴 THE VISITOR'S COUNTRY (Phase 2D-1) — ?country, the hg_country cookie, the request's country, else GB; server-side.
import { resolveVisitorCountry } from '@/lib/visitor-country'
import { marketingCountry, countryPageAlternates } from '@/lib/marketing-meta'
// seo-fixes M5 + S9: the JSON-LD graph (Organization, WebSite, SoftwareApplication + Offers), built from data.
import { landingGraph } from '@/lib/structured-data'
import { aboutPhotoUrl } from '@/lib/about-server'
import { HATCHGRAB_ORIGIN, countryPagePath } from '@/lib/marketing-country'
import { BRANDS } from '@/lib/brand'
// 🔴 THE SINGLE WHATSAPP SWITCH — one value governs every surface. See lib/whatsapp-live.ts.
import { WHATSAPP_LIVE } from '@/lib/whatsapp-live'
// Language Phase 1e: every word on this page is a `landing` message, read in the visitor's country's locale.
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/landing'
// ══ 🔴 THE ONLY ICON LIBRARY IN THIS REPOSITORY, ADDED 6 October 2026 ════════════════════════════
// There was none before — checked across package.json and every import in app/, components/ and lib/.
// ⛔ SIX NAMED IMPORTS, NOT `import * as icons`. lucide-react ships ~1,500 components; a namespace
// import or a dynamic `icons[name]` lookup defeats tree-shaking and pulls the lot into the landing
// bundle. Each one here is referenced exactly once, by `TileIcon` below.
// ⚠️ `Image` IS DELIBERATELY ALIASED. `next/image` is already imported into this file under that name,
// and the two would collide silently in a way TypeScript reports at the wrong place.
import {
  Clock, Gauge, MonitorSmartphone, Image as ImageIcon, MessageCircle, WifiOff,
} from 'lucide-react'
import './landing.css'

// Self-hosted, non-render-blocking (no Google Fonts <link>). Exposed as CSS vars the stylesheet maps
// to --display / --body / --ticket.
const archivo = Archivo({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-archivo', display: 'swap' })
const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' })
// seo-fixes S7 (20 October 2026): declared and loaded when used (--ticket), but NOT preloaded — nothing above the fold uses it.
const courierPrime = Courier_Prime({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-courier-prime', display: 'swap', preload: false })

// 🔴 US readiness (D37): the tags name the visitor's country — lib/marketing-meta.ts. For GB every value is the
// literal this page carried before ("UK", en_GB), byte-identical.
export async function generateMetadata({ params, searchParams }: { params?: Promise<{ country?: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  // Language Phase 1e: at a COUNTRY address (/uk, /us — app/[country]/page.tsx) the country is the address's.
  const visitor = await resolveVisitorCountry((await searchParams)?.country, { segment: (await params)?.country, page: 'landing' })
  const c = marketingCountry(visitor.settings)
  // 🔴 canonical and og:url = the page's own country address; hreflang = every switched-on country + x-default → '/'.
  // With no country address (the old module path) both stay the literal they were.
  const at = visitor.countryPage && countryPageAlternates('landing', visitor.settings.countryCode, visitor.countryPage.alternates)
  // Language Phase 1e: the title and description are `landing.meta.*` in the page's country language (GB byte-identical;
  // US "Food truck & catering…", "from your spot without the line"). One title and one description, used three times.
  const tm = translatorFor(visitor.settings.locale, 'landing')
  const metaTitle = tm('meta.title', { country: c.short })
  const metaDescription = tm('meta.description', { country: c.short })
  return {
    // ── TITLE. Terms first, brand last, because the job of this string is to be FOUND, not to be
    // recognised — nobody is searching the brand yet. "food truck" and "mobile catering" are the two
    // category terms UK operators actually use for themselves; "UK" is here because every competitor
    // ranking for this is American unless the page says otherwise. 59 chars, inside Google's ~60 cut.
    // 🔴 NO "POS" AND NO "EPOS" IN THE TITLE, DELIBERATELY. That category is owned by Toast, Epos Now,
    // POSApt and the directory sites, and — the part that actually decides it — THIS PRODUCT IS NOT A
    // TILL. It does not take card at the counter today. Titling it as one would win a click and lose
    // the operator in the first thirty seconds.
    // 🔴 NO "STREET FOOD". That is what a DINER types, and diners belong to Village Foodie.
    // 🔴 `absolute`, NOT a bare string. app/layout.tsx declares `title: { template: '%s | HatchGrab' }`,
    // so a plain string here renders "… — HatchGrab UK | HatchGrab" — the brand twice, at 75 chars, well
    // past Google's ~60. CAUGHT IN THE SERVED <head>, NOT IN THE SOURCE: the source read correctly.
    // ⚠️ THE PREVIOUS TITLE HAD THE SAME DEFECT ('HatchGrab — … | HatchGrab'). It is not new — it was
    // simply never looked at in rendered output, which is the whole reason this step demanded one.
    title: { absolute: metaTitle },

    // ── DESCRIPTION. There was none before; the page inherited the root layout's brand-generic one.
    // Problem-shaped, in an operator's own words, and it names the one thing this is NOT so the wrong
    // buyer self-selects out of the click rather than out of the trial. "POS" appears exactly once and
    // only to draw that boundary.
    // ⚠️ "MESSAGES GOING UNANSWERED" IS STILL LEFT OUT, AND THE REASON HAS CHANGED (16 September 2026).
    // It was excluded because WhatsApp auto-replies were coming soon behind WHATSAPP_LIVE; the flag is now
    // true and the feature ships. It stays out on EDITORIAL grounds instead: this description is two lines
    // of search metadata for "ordering and kitchen-screen software", and auto-replies are not what someone
    // typing that is looking for. 🔴 If it is ever added, it is now a factual claim rather than a forbidden
    // one — but check the flag before assuming that, because metadata is the place nobody re-reads.
    description: metaDescription,

    // ── 🟢 INDEXABLE, 8 September 2026. WHAT THIS REPLACED AND WHY IT WAS WRONG:
    // the previous comment read "noindex RESTORED … the admin gate in layout.tsx is back on while the
    // Pizzeria Gusto testimonial is unpermissioned and the screenshots are placeholders."
    // 🔴 EVERY CLAUSE OF THAT WAS FALSE BY 3 SEPTEMBER. app/landing/layout.tsx records the gate being
    // REMOVED that day, and records WHY: the testimonial has WRITTEN PERMISSION and the hero shots are
    // REAL captures. Verified here rather than taken on trust — the layout's component body is
    // `return <>{children}</>`, with no redirect, no verifyAdmin and no NODE_ENV check anywhere in it.
    // ⚠️ SO THE PAGE WAS PUBLIC AND UNINDEXED FOR FIVE DAYS, on a reason that had already expired. The
    // old comment's own instruction — "FLIP THIS BACK THE SAME DAY THE GATE COMES OFF" — was correct
    // and was simply not carried out. This is that flip.
    // 🔴 IF THE GATE EVER GOES BACK, THIS GOES BACK IN THE SAME COMMIT. The two belong together, and
    // the last time they were separated it cost five days of invisibility and a comment that lied.
    robots: { index: true, follow: true },

    alternates: at ? { canonical: at.canonical, languages: at.languages } : { canonical: 'https://www.hatchgrab.com/' },

    // ── OPEN GRAPH + TWITTER. There were none, so a link pasted into a WhatsApp group or a Facebook
    // traders' group rendered bare — which, given that outreach here happens in exactly those places,
    // is a more immediate cost than anything Google does.
    // ⚠️ THE IMAGE IS AN EXISTING ASSET, NOT A NEW ONE: public/logos/hatchgrab-share-card.png, and the
    // dimensions below are READ FROM THE PNG HEADER (1200×630), not copied from another file. The root
    // layout carries a note about exactly this trap — a previous pair declared 1200×630 over a
    // 2397×1270 file. Re-measure if the card is ever re-rendered.
    openGraph: {
      type: 'website',
      siteName: 'HatchGrab',
      url: at ? at.canonical : 'https://www.hatchgrab.com/',
      title: metaTitle,
      description: metaDescription,
      images: [{ url: 'https://www.hatchgrab.com/logos/hatchgrab-share-card.png', width: 1200, height: 630, alt: 'HatchGrab' }],
      locale: c.ogLocale,
    },
    twitter: {
      card: 'summary_large_image',
      title: metaTitle,
      description: metaDescription,
      images: ['https://www.hatchgrab.com/logos/hatchgrab-share-card.png'],
    },
  }
}

const Check = () => (
  <span className="tick"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5 L4.6 9 L10 3" /></svg></span>
)

/**
 * One tile icon: a lucide glyph, orange, on the heading's own line.
 *
 * ══ ⛔ THE PALE TINTED SQUARE IS GONE — 6 October 2026, SAME DAY IT WAS ADDED ══════════════════════
 * It was a 2.6rem rounded box in `--orange-wash` ABOVE the heading. Dominic asked for the box removed
 * entirely and the glyph moved onto the heading line, in the brand orange. Both the box and its CSS
 * are deleted rather than overridden.
 *
 * 🔴 ONE COMPONENT SO ALL SIX ARE ONE SET. Size, colour and alignment are decided once — here and in
 * `.does-ico` — because six separate inline wrappers is how a set drifts: one gets a different size,
 * another a different colour, and nothing fails.
 * ⛔ IT RENDERS INSIDE THE `<h3>`, AS THE FIRST OF TWO FLEX CHILDREN, and the heading's text is wrapped
 * in the second. That is what puts a wrapped second line under the TEXT rather than under the icon —
 * an inline icon with the text loose in the h3 would indent every line to the icon's left edge.
 * ⚠️ `aria-hidden` ON THE WRAPPER. They are decorative: every tile states its point in the heading the
 * icon sits next to, so announcing "clock" interrupts that heading to add nothing.
 * ⚠️ NO `size` OR `color` PROP ON THE GLYPH — both are CSS, so the six cannot drift apart. lucide's
 * default `stroke="currentColor"` is what lets `.does-ico` set the orange in one place.
 */
function TileIcon({ icon: Icon }: { icon: typeof Clock }) {
  return <span className="does-ico" aria-hidden="true"><Icon /></span>
}

export default async function LandingPage({ params, searchParams }: { params?: Promise<{ country?: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // 🔴 ONE READ, SERVER-SIDE, AND LOUD: a missing row or an undecided price throws here rather than
  // rendering a pricing section with a borrowed or blank figure.
  // Phase 2D-1: the VISITOR'S country (?country → hg_country cookie → x-vercel-ip-country → GB, switched-on
  // only — lib/visitor-country.ts), resolved here on the server so the first paint has the right prices.
  // Language Phase 1e: at a country address (/uk, /us) the country is the ADDRESS's, never the visitor's.
  const visitor = await resolveVisitorCountry((await searchParams)?.country, { segment: (await params)?.country, page: 'landing' })
  const seo = marketingCountry(visitor.settings)   // 🔴 D37: the JSON-LD's country (GB: UK, United Kingdom, en-GB)
  const s = visitor.settings
  // 🔴 STAGE B: the plan catalogue the pricing section is built from (60-second cache, lib/plans-server.ts).
  const catalog = localizePlans(await getPlanCatalog(), s.locale)
  // The trial's length (plans.trial_months) for the "First 3 months completely free" trust lines — data, never typed
  // (Dominic, 20 October 2026: it read "First month 100% free"). No trial plan → no line rather than a wrong one.
  const trialMonths = offerTrialMonths(catalog)
  // Language Phase 1e: the words, in the visitor's country's locale (GB → en-GB, byte-identical to before).
  const t = translatorFor(s.locale, 'landing')
  const tPricing = translatorFor(s.locale, 'pricing')
  const tPrompt = translatorFor(s.locale, 'planPrompt')
  const br = () => <br />
  const lean = (c: React.ReactNode) => <span className="lean">{c}</span>
  const soon = (c: React.ReactNode) => <span className="soon-inline">{c}</span>
  // 🔴 THE PIZZERIA GUSTO TESTIMONIAL AND AWARD ARE A UK TRUCK'S WORDS ABOUT UK VILLAGES — shown to GB visitors
  // only (Language Phase 1e). Decided by the page's country code, never by a word.
  const showTestimonial = s.countryCode === 'GB'
  return (
    // DemoModalProvider is a CLIENT component taking server-rendered children — that's what lets every
    // CTA below open one shared modal without the page itself becoming a client component.
    <PageLocale locale={localeOfCountry(s)} {...pageSeedProps(s.locale, 'marketing')}>
    <DemoModalProvider>
    {/* 🔴 `hg-hero-watch` IS THE LANDING-ONLY SCOPE FOR THE HEADER-CTA REVEAL, AND IT IS RENDERED ON THE
        SERVER SO THE BUTTON IS HIDDEN IN THE FIRST PAINT. Every rule behind the reveal is written
        `.hg-landing.hg-hero-watch …`, so /compare — which renders the SAME <LandingNav /> inside a
        `.hg-landing` wrapper of its own and has no hero button to observe — never matches them and its
        header CTA stays visible at every width, exactly as it is today. */}
    <div className={`hg-landing hg-hero-watch ${archivo.variable} ${publicSans.variable} ${courierPrime.variable}`}>

      {/* ============ NAV ============ (slate bg = HEADER_BG from lib/brand.ts) */}
      {/* 🔴 `ctaFirst` IS THE LANDING'S ORDER ONLY, AND IT IS A DOM CHANGE RATHER THAN A CSS ONE ON
          PURPOSE. Below 640px "Log in" must sit flush against the content's right edge with the header
          CTA to its LEFT. `order:` on the flex row would have done it without touching this file — and
          would have left the DOM reading "Log in, Upload menu" while the eye reads "Upload menu, Log in".
          Keeping those two in step is the requirement, so the ELEMENTS move, not their painted order.
          ⚠️ /compare renders the same <LandingNav /> WITHOUT this prop and is byte-identical. */}
      <LandingNav ctaFirst featuresHref={visitor.paths.features} locale={s.locale} />

      {/* ============ HERO ============ */}
      <header className="hero">
        <div className="wrap hero-grid">
          <div>
            {/* ── 🔴 JSON-LD. RENDERS NOTHING A VISITOR SEES — a <script type="application/ld+json">
                has no visual output. It is here rather than in `metadata` because Next's Metadata API
                has no structured-data field.
                🔴 WHAT IS DELIBERATELY ABSENT, AND WHY:
                  • aggregateRating / review — there are NO reviews. A rating in schema that no page
                    supports is the kind of claim §44 exists to stop, and Google penalises it.
                  • (offers WERE absent while prices were literal copies that drifted. Since Stage B they are
                    data — public.plan_prices — so seo-fixes S9 emits them from the SAME rows the cards render;
                    a fourteenth hand-typed copy is still impossible.)
                  • operatingSystem / device claims beyond what the page states.
                What IS here is only what the page already says in its own words. */}
            {/* 🔴 seo-fixes M5 + S9 (lib/structured-data.ts): Organization + WebSite + this SoftwareApplication, whose
                `url` is now THIS page's country address. Offers: one per public plan, in the country's currency, from
                plan_prices — the same rows the pricing cards below render, and only because they render real prices
                (a switched-off country's address never renders: it redirects). */}
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(landingGraph({
                countryCode: s.countryCode,
                currency: s.currency,
                pageUrl: HATCHGRAB_ORIGIN + (countryPagePath(s.countryCode, 'landing') ?? ''),
                catalog,
                // about-page: the Organization names its founder, with the About page's photo when there is one.
                founderImage: aboutPhotoUrl(),
                pricesShown: s.enabled,
                app: {
                  name: BRANDS.HATCHGRAB.name,
                  applicationCategory: 'BusinessApplication',
                  applicationSubCategory: t('jsonLd.subCategory'),
                  description: t('jsonLd.description', { country: seo.short }),
                  inLanguage: seo.lang,
                  // ai-search-1: `areaServed` is not a SoftwareApplication property (schema.org gives it to Organization,
                  // Service, Offer…), so validators dropped it. `countriesSupported` is the app's own property: every
                  // switched-on country with a page (the country menu's list), as ISO codes — schema.org's advice.
                  countriesSupported: visitor.menu.options.map(o => o.code),
                  audience: { '@type': 'BusinessAudience', audienceType: t('jsonLd.audience') },
                },
              })) }}
            />
            <h1>{t.rich('hero.title', { lean })}</h1>
            {/* 🔴 MOBILE-ONLY (<640px), AND IT IS `display:none` BY DEFAULT — see landing.css. A block
                that is display:none generates no box at all, so on tablet and desktop this element is
                not merely invisible, it takes part in no layout: the hero above 640px is untouched.
                It replaces BOTH the tagline and the CTA text on a phone, which are hidden there. */}
            {/* 🔴 THE <br /> IS THE COPY, NOT A LAYOUT ACCIDENT. Two deliberate lines: the ask, then
                what it gets you. BOTH are sized to hold on one line from 360px up — see the width note
                on `.hero-sub-sm` in landing.css. ⚠️ "no signup needed" moved UP into line 1 on
                12 September, which is what allowed the separate line under the button to be deleted. */}
            <p className="hero-sub-sm">{t.rich('hero.subSmall', { br })}</p>
            <p className="hero-tag">{t.rich('hero.tagline', { br, lean })}</p>
            {/* CTA row: button LEFT + text RIGHT on desktop (≥940px); stacked, full-width button + centred text on mobile. */}
            <div className="hero-cta-row">
              {/* 🔴 THE id IS THE OBSERVER'S TARGET, NOT A STYLING HOOK — nothing in landing.css selects
                  it. HeroCtaWatcher below watches this exact button to decide when the HEADER CTA
                  appears on mobile. */}
              <DemoCta id="hero-cta" className="btn btn-primary btn-lg">{t('hero.cta')}</DemoCta>
              {/* ══ 🔴 BESIDE THE BUTTON, IN TWO LINES — 7 October 2026 ════════════════════════════
                  It replaced `.hero-cta-text` (a bold 1.12rem line plus a grey one) and sat UNDER the
                  button for a day; it is to its RIGHT now, which is where the block it replaced was.
                  ⚠️ IT IS BACK INSIDE `.hero-cta-row`, AND THAT IS THE WHOLE MECHANISM. That row is
                  `flex-direction: row` from 940px and `column` below it — so one element gives "right
                  of the button" on a laptop and "under the button" on a phone with no second rule and
                  no duplicate markup.
                  🔴 THE BREAK IS THE COPY, NOT A WRAP. Two deliberate lines, as specified; `<br />`
                  rather than two blocks so the pair stays one paragraph to a screen reader. */}
              {/* landing-mobile-tidy (21 October 2026, Dominic's approved mockup): two lines — a semi-bold dark lead and a
                  smaller grey line under it — as two spans of one paragraph, so the pair stays one sentence group to a
                  screen reader. Their sizes and colours are landing.css `.hero-cta-lead` / `.hero-cta-small`. */}
              <p className="hero-cta-note">{t.rich('hero.ctaNote', {
                lead: (c: React.ReactNode) => <span className="hero-cta-lead">{c}</span>,
                small: (c: React.ReactNode) => <span className="hero-cta-small">{c}</span>,
              })}</p>
            </div>
            {/* Renders nothing. Mounts the IntersectionObserver that reveals the header CTA on mobile. */}
            <HeroCtaWatcher targetId="hero-cta" />
          </div>

          {/* ── Screenshot fan. Three real screenshots, absolutely positioned and rotated by landing.css. ──
              🔴 width/height ARE THE CSS BOX SIZES, NOT THE EXPORT SIZES. The files are exported at 2x
              (640x480, 800x550, 280x529) for retina; these numbers are the 320x240 / 400x275 / 140x264
              boxes the CSS actually lays out. next/image uses them for the aspect ratio and to reserve
              space — giving it the 2x numbers would reserve a box twice the size and shift the layout.
              ⚠️ The CSS `aspect-ratio` on each .shot-* is what really sizes the frame; these attributes
              must AGREE with it or next/image and the CSS will disagree about the shape.
              🔴 `priority` IS ON THE DASHBOARD ALONE — it is the largest, front-most image and the LCP
              candidate. The phone is `loading="eager"` without it (see below). `sizes` matches the CSS
              caps so the generated srcset is not oversized.
              ══ ⚠️ THE `sizes` CAPS HAVE MOVED FIVE TIMES IN ONE DAY, AND THEY ARE NOT SELF-CHECKING ══
              320/400/140 → 430/375/172 → 320/408/182 → 252/420/86 → 332/332/96 → **432/124 for two
              screens**. They mirror the `--fan-*` constants in landing.css. ⛔ NOTHING LINKS THEM, and
              the failure is silent in both directions: a `sizes` too small is a blurry hero, one too
              large is bytes nobody sees. **Change a constant there, change the attribute here.** */}
          {/* ══ ⛔ RESTORED TO THE LIVE FAN — 7 October 2026 ════════════════════════════════════════
              The two-screen hero is rejected, and so were the four arrangements before it. The markup
              below is **what is live on www.hatchgrab.com**, restored from git HEAD.
              🔴 CONFIRMED AGAINST THE SERVED PAGE, NOT ASSUMED: live carries `class="shot shot-kds"`,
              `shot-dash` and `shot-phone`, the three `sizes` values below byte-for-byte, and `priority`
              on all three (seo-fixes S7, 20 October 2026: now on the DASHBOARD ALONE — the LCP — and the kitchen
              and phone shots `loading="eager" fetchPriority="low"`: still fetched at once, but React no longer emits a preload
              for them — it preloads every non-lazy, non-low image — so they no longer compete with the LCP). ⛔ THE `.fan-group` WRAPPER IS GONE with the shared tilt it existed for —
              each screen carries its own `rotate()` again, in landing.css.
              ⚠️ `kitchen.png` IS BACK IN THE HERO and is no longer an unreferenced asset. */}
          <div className="fan">
            <div className="shot shot-kds">
              <Image src={landingScreenshot('kitchen', s.countryCode)} alt={t('shots.kitchenAlt')} width={320} height={240} sizes="(max-width: 939px) 58vw, 320px" loading="eager" fetchPriority="low" />
            </div>
            <div className="shot shot-dash">
              <Image src={landingScreenshot('dashboard', s.countryCode)} alt={t('shots.dashboardAlt')} width={800} height={551} sizes="(max-width: 939px) 72vw, 400px" priority />
            </div>
            {/* 🟢 FILLED. Was the last `shot-empty` placeholder; the shot landed 2 September 2026 —
                a real iPhone 12 Pro Max capture, 1284x2778, copied in LOSSLESSLY (verified pixel-identical
                to the source, no resample) as /screenshots/customer-order.png.
                🔴 `.shot-phone`'s `aspect-ratio` IN landing.css WAS CHANGED FROM 9/17 TO 1284/2778 TO MATCH,
                and the width/height below must keep agreeing with it — see the note above. 9/17 was a
                guess made before any file existed, and a modern phone is taller than that: left at 9/17
                the `object-fit: contain` on `.shot img` would have letterboxed the shot inside its own
                frame, with a band of frame showing above and below. */}
            <div className="shot shot-phone">
              <Image src={landingScreenshot('phone', s.countryCode)} alt={t('shots.phoneAlt')} width={1284} height={2778} sizes="(max-width: 939px) 26vw, 140px" loading="eager" fetchPriority="low" />
            </div>
          </div>
        </div>
      </header>

      {/* ============ TRUST STRIP ============ Full-width band under the hero grid; hairline top/bottom on the
          wash tint. Three bullets (orange ticks): row on desktop, left-aligned stack on mobile. */}
      <div className="trust-strip">
        <ul className="trust-in wrap">
          {trialMonths !== null && <li><Check />{' ' + t('trust.freeMonth', { months: trialMonths })}</li>}
          <li><Check />{' ' + t('trust.noCard')}</li>
          <li><Check />{' ' + t('trust.cancel')}</li>
        </ul>
      </div>

      {/* ============ WHAT IT DOES ============ (white — first content section, alternates against the wash
          trust strip above and the wash "how it works" band below) */}
      <section>
        <div className="wrap">
          <p className="eyebrow">{t('does.eyebrow')}</p>
          <h2>{t('does.title')}</h2>
          <p className="lede">{t('does.lede')}</p>
          <div className="does">
            {/* ⚠️ BOTH HEADINGS NAME THE **FEATURE**, NOT THE FEELING (10 October 2026, Dominic).
                "Kill the queue" and "Never promise a time you can't hit" were a slogan and a warning —
                a truck owner scanning the page could not tell from either which control they were being
                sold. The two sentences underneath are unchanged, because they were already the plain
                version of the same two facts. */}
            <div className="does-item"><h3><TileIcon icon={Clock} /><span>{t('does.slotsTitle')}</span></h3><p>{t('does.slotsBody')}</p></div>
            <div className="does-item"><h3><TileIcon icon={Gauge} /><span>{t('does.capacityTitle')}</span></h3><p>{t('does.capacityBody')}</p></div>
            <div className="does-item"><h3><TileIcon icon={MonitorSmartphone} /><span>{t('does.devicesTitle')}</span></h3><p>{t('does.devicesBody')}</p></div>
            {/* ══ 🔴 REPLACED "Never type your schedule twice" — 6 October 2026, ON REQUEST ═══════════
                Same position in the grid, same `does-item` markup and styling as the other five, which
                are untouched. The schedule-import claim it carried is still made on this page, in the
                "Getting going" steps ("Got it on your website? We'll read it from there").
                ══ ⚠️ THE COPY WAS SETTLED IN FIVE STEPS — THIS IS THE LAST (7 October 2026) ═════════
                The original brief offered two bodies and made the choice a question about the CODE:
                version A (which said "and write the caption") only if Social posts actually generates
                one. 🟢 IT DOES — `weekCaption()` (lib/weekly-post/caption.ts:134) builds the week's
                caption and `eventPostText()` (:89) the per-event text, the route serves both through
                its `captions` action, and WeeklyPost.tsx renders the result in an editable "Caption for
                your page" panel. A was the honest choice of the two and shipped first.
                ⛔ EVERY LINE SINCE HAS BEEN DOMINIC'S OWN, and none of them makes a caption claim — so
                the A/B question is moot and this tile now UNDER-claims rather than over-claims. **The
                caption generator is real and this copy does not sell it.** That is a choice, not a gap,
                and it is written here so nobody "corrects" the tile back to version A later.
                ⚠️ "postS" AND "done for you": the feature makes a post for a single event as well as
                for the week, so the singular and the narrower "weekly post" were both wrong — and the
                body now says so outright ("every week or every day"), which is why the heading no
                longer has to carry it. */}
            <div className="does-item"><h3><TileIcon icon={ImageIcon} /><span>{t('does.postsTitle')}</span></h3><p>{t('does.postsBody')}</p></div>
            {/* ── MOVED TO 5th IN THE GRID, 4 September 2026, ON THE OPERATOR'S INSTRUCTION — it sat 3rd
                for part of the same day, also on their instruction. Position here is an editorial call,
                not a structural one: nothing reads the tile order, so it is theirs to set. Below "Never
                type your schedule twice", above "No signal? Keep serving." ─────────────────────────
                ⚠️ "driving to the pitch or at the grill" — NOT just "at the grill". At-the-grill alone is
                a generic busy-kitchen claim any hospitality product could make; DRIVING is specific to a
                food truck and is the moment an operator genuinely CANNOT reply, which is the whole point
                of the feature. Keeping both covers the two states a truck operator is actually in.
                🔴 IT STAYS ONE TILE. DO NOT SPLIT MESSENGER AND INSTAGRAM OUT INTO A SECOND does-item.
                This grid holds SIX tiles and those two are a trailing clause of this one, exactly as the
                previous setup had it when WhatsApp was last the only live channel — present tense for
                WhatsApp with the other two tagged on the end. A seventh tile would give an unbuilt stub
                the same visual weight as five shipped capabilities.
                🔴 WHETHER WHATSAPP IS LIVE IS DECIDED BY `WHATSAPP_LIVE` (lib/whatsapp-live.ts), and both
                branches of that switch are rendered below;
                Messenger and Instagram are verify-handshake stubs with no classifier call and no send
                path, so they alone carry "coming soon". The page still describes the product AS IT IS —
                the channels simply no longer share one readiness.
                🔴 THE THREE SURFACES OF THIS ONE FACT, which must not drift: this tile, the Pro-card
                bullet below, and the matrix row in lib/plan-features.ts. All three moved together.
                ⚠️ AND A FOURTH THAT IS NOT A STRING: lib/landing-table.ts merged the two matrix rows into
                one line for the landing and the PDF. That merge was undone in the same change — see the
                guard in that file, which required exactly this once the rows' cell values diverged.
                ── 🔴 THE HEADING NAMES THE CHANNEL, NOT THE CATEGORY (4 September 2026). It read "Social
                media auto-replies" while the product ships exactly one channel, and WhatsApp is messaging
                rather than social media. Same rule the Settings card is already built on: it is named
                "Auto-replies", NOT "Socials", because a card named for a category the product does not
                have is a promise.
                🔴 FORWARD DECISION, WITH ITS CONDITION: rename this to "WhatsApp, Messenger and Instagram
                auto-replies" WHEN Messenger and Instagram are actually built — not when they are
                scheduled, submitted or approved. They are verify-handshake stubs today. Renaming earlier
                re-makes the category promise this change removed.
                ⚠️ PRESENTATIONAL ONLY — this heading is a JSX literal and a key in nothing. It is not in
                ROW_FEATURE_MAP, NAME_OVERRIDES, DETAIL_OVERRIDES or HIDDEN_ROWS, so changing it disarms
                no check. But it now MATCHES the matrix row label 'WhatsApp auto-replies', which IS a
                ROW_FEATURE_MAP key — so a future find-and-replace across both would silently drop that
                row from findPlanParityViolations(). Rename by hand, not by sweep. */}
            {/* 🔴 BEHIND THE SINGLE SWITCH (lib/whatsapp-live.ts). POSITION MOVES WITH THE FLAG:
                live, the tile sits HERE, fifth, among the shipped capabilities. Not live, it sits LAST,
                after "No signal? Keep serving." — which is where it sat in production at 08ac368, and
                where a not-yet-shipped capability belongs. See the OFF branch below this row. */}
            {WHATSAPP_LIVE && (
              <div className="does-item"><h3><TileIcon icon={MessageCircle} /><span>{t('does.whatsappTitle')}</span></h3><p>{t('does.whatsappBody')}</p></div>
            )}
            {/* 🟢 "Android coming soon." REMOVED 5 September 2026 — the Android app is live on Google Play, so
                the sentence is present tense like every other claim on this page. The three platforms are
                COMBINED into the existing sentence rather than given a line of their own: they are one app
                on three devices, and a separate line would read as a separate product. */}
            <div className="does-item"><h3><TileIcon icon={WifiOff} /><span>{t('does.offlineTitle')}</span></h3><p>{t('does.offlineBody')}</p></div>
            {/* 🔴 THE NOT-LIVE TILE, AND IT IS LAST ON PURPOSE. Production at 08ac368 carried it here,
                after "No signal? Keep serving." — a capability that has not shipped does not sit among
                five that have. Flipping WHATSAPP_LIVE moves it up to fifth (above) in the same edit.
                ⚠️ HEADING CHANGED 8 September 2026, BY OPERATOR INSTRUCTION: production read
                "Social media auto-replies — coming soon". It now names the one channel this is about,
                matching the matrix row label, and carries the readiness as a `soon-inline` BADGE rather
                than as words in the sentence — the same badge every other unshipped item on this page
                uses (the Pro-card bullets, "Take payment on your phone", "Digital loyalty stamp cards").
                🔴 §44's rule is met twice over: the badge says it, and the body still reads "Soon your
                WhatsApp WILL get answered". The badge is what disappears when WHATSAPP_LIVE flips. */}
            {!WHATSAPP_LIVE && (
              <div className="does-item"><h3><TileIcon icon={MessageCircle} /><span>{t.rich('does.whatsappSoonTitle', { soon })}</span></h3><p>{t('does.whatsappSoonBody')}</p></div>
            )}
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ (tinted band)
          ══ 🔴 THE WHITE/WASH ALTERNATION, WRITTEN OUT — IT BROKE ONCE AND WILL AGAIN ════════════════
          The page alternates, top to bottom, and every band below depends on the one above it:

            trust strip  wash  (.trust-strip)
            what it does white (bare <section>)
            how it works WASH  (this one, .band)
            testimonial  white (.quote-sec — deliberately untinted, between two wash bands)
            pricing      WASH  (#pricing .band)
            final CTA    white (#try)
            footer       slate (LandingFooter)

          ⛔ IT IS A SEQUENCE, NOT A PROPERTY OF ANY ONE SECTION. Deleting or moving a section
          re-colours every section after it, and nothing errors — this comment used to read
          "… testimonial(white) → orders(wash) …" and that order section was deleted on 6 October,
          which left testimonial, pricing and the final CTA as three white blocks in a row with no
          seam between them. Reported by Dominic the same day.
          🔴 SO: IF YOU ADD, REMOVE OR REORDER A SECTION, RE-READ THIS LIST AND FIX THE `band` CLASSES.
          The table above is the whole specification.
          ── WITHOUT THE TESTIMONIAL (every country but GB — US layout proposal, fix 13) ──────────────────
          Dropping the white testimonial would put this wash band straight onto the wash pricing band. So where
          `showTestimonial` is false the two after it swap, and the page still alternates:
            trust strip wash · what it does white · how it works WASH · pricing WHITE · final CTA WASH · footer slate
          (and `.switch-block`, paper on the wash band, becomes wash on the white one — still one step away from
          what it sits on). 🔴 GB is untouched: the same `band` classes, the same attributes, byte for byte. */}
      <section className="band">
        <div className="wrap">
          <p className="eyebrow">{t('steps.eyebrow')}</p>
          <h2>{t('steps.title')}</h2>
          <p className="lede">{t('steps.lede')}</p>
          <div className="steps">
            <div className="step"><h3>{t('steps.menuTitle')}</h3><p>{t('steps.menuBody')}</p></div>
            <div className="step"><h3>{t('steps.scheduleTitle')}</h3><p>{t('steps.scheduleBody')}</p></div>
            <div className="step"><h3>{t('steps.shareTitle')}</h3><p>{t('steps.shareBody')}</p></div>
          </div>
        </div>
      </section>

      {/* ============ TESTIMONIAL ============
          ✅ THE QUOTE IS REAL. These are Pizzeria Gusto's own words, supplied by Dominic on 28 August 2026,
          and the award credit below is confirmed correct by him on the same day. The INVENTED placeholder
          quote that stood here until then is gone. 🔴 DO NOT EDIT, TIGHTEN OR RE-PUNCTUATE THE QUOTE — it is a
          live trading business's speech, not our copy. It is held as a string expression rather than bare
          JSX text so no formatter can straighten its apostrophe to match the rest of this page.
          🔴 THE GATE IN layout.tsx AND THE noindex ABOVE STAY ON, AND THIS DOES NOT CHANGE THAT. Having their
          words is not the same as having their written permission to publish them, and no record of consent
          exists in this repository. layout.tsx's condition 1 is still unmet and still correctly worded.
          The logo is public/gusto-logo.png, which is real and always has been.
          🔴 GB ONLY (Language Phase 1e): a UK truck, a UK award and "busy villages" — on any other country's page the
          whole section is left out and nothing else on the page changes. The quote is a `landing.testimonial`
          message with NO en-US text (it is never shown there) and its straight apostrophe is kept, as above. */}
      {showTestimonial && (
      <section className="quote-sec">
        <div className="wrap quote-in">
          <span className="quote-mark">“</span>
          <blockquote>{t('testimonial.quote')}</blockquote>
          <div className="quote-by">
            {/* 🔴 alt="" IS DELIBERATE, NOT AN OVERSIGHT: "Pizzeria Gusto" is in the role line directly below, so an alt would announce the business name TWICE — and a MISSING alt would make some screen readers read the filename instead. */}
            {/* ══ 🔴 `sizes` ADDED 6 October 2026 — A LOAD FIX WITH NO VISUAL CHANGE ════════════════
                MEASURED: this logo RENDERS at 77px and was requesting `/_next/image?w=384` (11.2 KB) at
                DPR 1 and `w=640` at DPR 2. With no `sizes`, next/image builds the srcset from the
                `width` PROP — 320 — and picks the smallest device size at or above it, which is 384.
                The prop is the intrinsic file width, not the painted width, so it was never going to
                pick anything sensible on its own.
                ⚠️ 96px IS DERIVED FROM THE STYLESHEET, NOT PICKED. `.quote-logo` is
                `height: 56px; width: auto` (landing.css), and the file is 320×233, so the painted width
                is 56 × 320/233 ≈ 77px. 96 is the smallest step in next/image's own `imageSizes` ladder
                above 77, so it is the smallest honest value: below it the logo would be upscaled, above
                it we pay for pixels nothing draws.
                ⚠️ IT IS A FIXED PIXEL `sizes` BECAUSE THE BOX IS A FIXED HEIGHT at every width — there
                is no viewport-relative rule on this element, so a `vw` value would be a guess.
                🟢 NOTHING ABOUT THE LAYOUT CHANGES: width/height are untouched, so the reserved box and
                the aspect ratio are identical and there is no shift. ⚠️ It is ALREADY lazy — next/image
                defaults to `loading="lazy"` without `priority`, and this has never had `priority`;
                verified in the browser (`loading=lazy`) rather than assumed from the absence of a prop. */}
            <Image className="quote-logo" src="/gusto-logo.png" alt="" width={320} height={233} sizes="96px" />
            <span className="quote-who">
              {/* ── THE ATTRIBUTION READS: business -> award -> people (16 October 2026, Dominic). ─────────
                  Bold "Pizzeria Gusto", then the award, then "Nadia & Bogdan — owners" last, in the small line
                  (it was "Nadia & Bogdan" over "Owners, Pizzeria Gusto" from 29 August). The business name
                  appears once only; the logo's alt is empty, so a screen reader hears it once too. */}
              <span className="quote-name">{t('testimonial.business')}</span>
              {/* ✅ Award wording CONFIRMED by Dominic, 28 August 2026 ("Mobile pizzeria of the year — regional
                  winner is correct"). Layout is set with INLINE styles (not just .cred-* classes) so it renders
                  correctly even if a stale landing.css is cached: title row (★ — text — ★) then scope beneath. */}
              <span className="quote-cred" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem', marginTop: '0.35rem', width: '100%' }}>
                <span className="cred-title" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', whiteSpace: 'nowrap', color: 'var(--orange)', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.01em' }}>
                  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', fill: 'var(--orange)' }}><path d="M8 0l2.2 4.6 5 .7-3.6 3.5.9 5L8 11.4 3.5 13.8l.9-5L.8 5.3l5-.7z" /></svg>
                  {t('testimonial.award')}
                  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', fill: 'var(--orange)' }}><path d="M8 0l2.2 4.6 5 .7-3.6 3.5.9 5L8 11.4 3.5 13.8l.9-5L.8 5.3l5-.7z" /></svg>
                </span>
                <span className="cred-scope" style={{ display: 'block', textAlign: 'center', color: 'var(--ink-faint)', fontWeight: 600, fontSize: '0.68rem' }}>{t('testimonial.awardScope')}</span>
              </span>
              {/* Below the award. The inline margin matches the award's own gap above it, for the same stale-CSS reason. */}
              <span className="quote-role" style={{ marginTop: '0.35rem' }}>{t('testimonial.byline')}</span>
            </span>
          </div>
        </div>
      </section>
      )}

      {/* ══ ⛔ "Everything you need, nothing you don't" WAS DELETED — 6 October 2026 ════════════════
          The "Orders" eyebrow, its lede and the #17 Sarah ticket mock-up. Removed on request as part
          of shortening this page; the kitchen screen it illustrated is the first hero screenshot and
          is claimed twice over in "Built for food trucks" above.
          ⚠️ IT WAS NEVER A COMPONENT — the ticket was inline JSX in this file — so there was nothing
          to delete alongside it. Its `.ticket-stage` / `.ticket` / `.t-*` rules in landing.css are now
          UNUSED (the other two consumers of that stylesheet, /compare and /features, never rendered a
          ticket) and are LEFT IN PLACE deliberately: deleting CSS was not part of this task and a
          stylesheet sweep is its own job. Flagged here rather than done quietly. */}

      {/* ============ PRICING CARDS ============ (who / price / fee from source; bullet teasers are editorial)
          🔴 `band` ADDED 6 October 2026 — IT IS THE SEAM, NOT DECORATION. It took the wash slot the
          deleted "Orders" section used to hold, which is what puts a tinted block back between the
          white testimonial above and the white final CTA below. See the sequence table on the "how it
          works" section above before changing it.
          🟢 THE CARDS GAIN FROM IT: `.plan` is `background: var(--paper)`, so three white cards now sit
          ON the tint instead of white-on-white, and the grid reads as three objects rather than one
          field. ⚠️ `.switch-block` HAD TO MOVE WITH IT — it was `background: var(--wash)`, the band's
          own colour, so it would have dissolved into it. See landing.css. */}
      <section id="pricing" className={showTestimonial ? 'band' : undefined}>
        <div className="wrap">
          <div className="price-head">
            <p className="eyebrow">{t('pricing.eyebrow')}</p>
            <h2>{t('pricing.title')}</h2>
          </div>

          {/* ══ 🔴 THE PRICING SECTION IS BUILT FROM THE PLAN DATA — Stage B (docs/pricing-pages-report.md) ══════════════
              The approved mockup: the trial banner, one card per public plan (public.plans, sort_order), the "Which plan
              is cheapest for me?" bar (solved from public.plan_prices) and the card-fee footnote (country_settings).
              ⛔ THE OLD HAND-WRITTEN STARTER / PRO / MAX CARDS, THE FEE LEDE, THE NAVY "Compare all features" BUTTON AND
              THE SMALL PRINT ARE GONE: the first card's "See every feature →" is the route to /features now, and the
              footnote and banner carry what the small print said. The heading above and the switching block below stay. */}
          <PricingSection
            catalog={catalog}
            settings={s}
            t={tPricing}
            tPrompt={tPrompt}
            brand={priceText(PRICE_WORD.payAtHatch, s.locale)}
            featuresHref={visitor.paths.features}
            cta={(className, label) => <DemoCta className={className}>{label}</DemoCta>}
          />

          {/* ── 🔴 THE SWITCHING BLOCK — A SIDE DOOR TO /compare, AND IT SELF-SELECTS ON ITS FIRST WORD (3 September 2026;
              copy approved, not editorial). "Switching from another platform?" tells an operator paying nobody that this is
              not about them; the calculator answers "what would I pay instead". It is not an <h2> and has no button: every
              primary control here is an orange DemoCta. No competitor is named. */}
          <div className="switch-block" style={showTestimonial ? undefined : { background: 'var(--wash)' }}>
            <p className="switch-head">{t('pricing.switchHead')}</p>
            <p className="switch-body">{t('pricing.switchBody')}</p>
            <p className="switch-cta"><a href={visitor.paths.compare}>{t('pricing.switchCta')}</a></p>
          </div>
        </div>
      </section>

      {/* ⛔ THE FULL COMPARISON TABLE LEFT THIS PAGE on 6 October 2026 — it is /features (components/pricing/PlanTable.tsx since
          Stage B). The section had no `id`, so there was no anchor to keep. */}

      {/* ============ FINAL CTA ============ */}
      <section id="try" className={showTestimonial ? undefined : 'band'}>
        <div className="wrap final">
          {/* Truck illustration — inlined VERBATIM from public/illustrations/food-truck-themed.svg.
              🔴 THEMED, NOT LITERAL: fills are var(--head, #16314F) and var(--orange, #EF8B2C), so this
              tracks landing.css's tokens instead of drifting. The block this replaced carried two
              hardcoded fills in the app's ACTION orange (Tailwind orange-600) rather than the brand
              orange — exactly the drift being removed. Do not reintroduce a literal hex here.
              (The literal is deliberately NOT written out above, so a grep for it stays clean.)
              ⚠️ className="truck" is what sizes it (.hg-landing .truck { width: min(230px,60%); height: auto }),
              so it must stay on the <svg>; there are deliberately NO width/height attributes to fight it.
              The standalone public/illustrations/food-truck.svg (plain hex) is the spare for <img> use. */}
          <svg className="truck" viewBox="24.0 18.0 351.5 176.0" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={t('final.truckLabel')}>
            <g transform="translate(399.5,0) scale(-1,1)">
              <path d="M30.0 121.2 L30.0 159.3 L31.2 161.7 L35.5 165.3 L364.6 165.3 L368.2 162.4 L369.9 159.3 L369.9 30.0 L368.9 27.8 L367.2 25.9 L365.3 24.7 L362.7 24.0 L96.8 24.2 L93.4 25.9 L90.5 30.2 L74.4 85.0 L73.2 90.4 L71.3 95.4 L69.7 97.0 L36.7 111.9 L32.6 115.5 Z" fill="var(--head, #16314F)"/>
              <circle cx="95.1" cy="165.4" r="29.3" fill="#FFFFFF"/>
              <circle cx="316.2" cy="165.4" r="29.3" fill="#FFFFFF"/>
              <circle cx="95.1" cy="165.4" r="23.1" fill="var(--head, #16314F)"/>
              <circle cx="316.2" cy="165.4" r="23.1" fill="var(--head, #16314F)"/>
              <circle cx="95.1" cy="165.4" r="10.1" fill="#FFFFFF"/>
              <circle cx="316.2" cy="165.4" r="10.1" fill="#FFFFFF"/>
              <path d="M102.52 48.49 L139.33 48.49 Q143.33 48.49 143.33 52.49 L143.33 92.51 Q143.33 96.51 139.33 96.51 L88.16 96.51 Q84.16 96.51 85.31 92.68 L97.37 52.32 Q98.52 48.49 102.52 48.49 Z" fill="#FFFFFF"/>
              <rect x="162.5" y="48.5" width="153.7" height="61.2" rx="4.0" fill="#FFFFFF"/>
              <rect x="162.5" y="110.7" width="153.7" height="6.2" rx="4.0" fill="var(--orange, #EF8B2C)"/>
            </g>
          </svg>
          <h2>{t('final.title')}</h2>
          <p className="lede">{t('final.lede')}</p>
          {/* This section keeps its heading + copy; its button opens the SAME modal every other CTA on
              the page opens. `#try` remains a valid anchor target (the return-link bounce uses it), but
              nothing scrolls here to reach the upload any more. No ✨ on page CTAs — the sparkle is the
              MODAL's cue (mirroring Manage's "✨ Import menu"), not the landing page's. */}
          <DemoCta className="btn btn-primary btn-lg">{t('final.cta')}</DemoCta>
          <ul className="proof">
            {trialMonths !== null && <li><Check />{' ' + t('trust.freeMonth', { months: trialMonths })}</li>}
            <li><Check />{' ' + t('trust.noCard')}</li>
            <li><Check />{' ' + t('trust.cancel')}</li>
          </ul>
        </div>
      </section>

      {/* ============ FOOTER ============ (slate bg = HEADER_BG from lib/brand.ts) */}
      <LandingFooter featuresHref={visitor.paths.features} country={visitor.menu} locale={s.locale} comparison={await comparisonFooter(s.countryCode, s.locale)} />
      {/* Mounted ONCE — every DemoCta above drives this one instance. */}
      <DemoModal />
    </div>
    </DemoModalProvider>
    </PageLocale>
  )
}
