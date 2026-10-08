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
// Chrome EXTRACTED 23 August 2026 so the cost comparison (now /compare) renders the same nav and footer
// from one definition.
// 🔴 MOVED, NOT REWRITTEN — proven byte-identical; see docs/cost-comparison-chrome-report.md §1.
import { LandingNav } from '@/components/landing/LandingNav'
import { HeroCtaWatcher } from '@/components/landing/HeroCtaWatcher'   // client: drives the header CTA's mobile reveal
import { LandingFooter } from '@/components/landing/LandingFooter'
// ══ 🔴 THIS IMPORT IS SMALLER THAN IT WAS, AND IT MUST NOT BECOME EMPTY (6 October 2026) ══════════
// FEATURE_SECTIONS, FOOTNOTES, TRANSACTION_ROWS and `type FeatureValue` went to
// components/landing/FeatureComparison.tsx with the comparison table, and the whole
// `@/lib/landing-table` import went with them — this page no longer renders a table row.
// ⛔ WHAT IS LEFT IS STILL LOAD-BEARING BEYOND THE FOUR NAMES. `lib/plan-features.ts` runs
// `findPlanParityViolations()` at module load, so importing it is what fires the presentation↔gate
// guard on this route. The four below are all genuinely used by the pricing cards — but if a later
// change removes the last of them, THE GUARD STOPS RUNNING HERE AND NOTHING WILL SAY SO.
import {
  PLAN_PRICES, PLAN_DESCRIPTIONS, PLAN_ALLOWANCES, CARD_FEE_ONLINE_LABEL,
} from '@/lib/plan-features'
import { PLAN_META } from '@/lib/features'
// 🔴 THE SINGLE WHATSAPP SWITCH — one value governs every surface. See lib/whatsapp-live.ts.
import { WHATSAPP_LIVE } from '@/lib/whatsapp-live'
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
const courierPrime = Courier_Prime({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-courier-prime', display: 'swap' })

export const metadata: Metadata = {
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
  title: { absolute: 'Food truck & mobile catering ordering system — HatchGrab UK' },

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
  description:
    'Take orders and pre-orders from your pitch without the queue. Ordering and kitchen-screen '
    + 'software for UK food trucks and mobile catering — not a POS.',

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

  alternates: { canonical: 'https://www.hatchgrab.com/' },

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
    url: 'https://www.hatchgrab.com/',
    title: 'Food truck & mobile catering ordering system — HatchGrab UK',
    description:
      'Take orders and pre-orders from your pitch without the queue. Ordering and kitchen-screen '
      + 'software for UK food trucks and mobile catering — not a POS.',
    images: [{ url: 'https://www.hatchgrab.com/logos/hatchgrab-share-card.png', width: 1200, height: 630, alt: 'HatchGrab' }],
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Food truck & mobile catering ordering system — HatchGrab UK',
    description:
      'Take orders and pre-orders from your pitch without the queue. Ordering and kitchen-screen '
      + 'software for UK food trucks and mobile catering — not a POS.',
    images: ['https://www.hatchgrab.com/logos/hatchgrab-share-card.png'],
  },
}

// Compare-table columns: Trial | Starter | Pro | Max — mirrors Manage → Billing (the point is that Trial
// visibly includes everything). Names come straight from the source (PLAN_META); the first tier is "Starter"
// (it's £0, but it's called Starter). The pricing CARDS below stay the three purchasable tiers.
// ── 🔴 THE FEE ROWS ARE NO LONGER DEFINED HERE. ────────────────────────────────────────────────────
// This was `LANDING_FEE_ROWS`, a landing-only literal, and its own comment admitted the duplication:
// "RENDER-ONLY. The shared TRANSACTION_ROWS is NOT modified; Manage → Billing / Admin keep their own
// version." Those two copies then disagreed about what a trial truck gets, which is the one thing a
// second copy of a price table is guaranteed to do eventually.
// The values below moved VERBATIM into TRANSACTION_ROWS (lib/plan-features.ts) — same three rows, same
// four columns, same strings — so this page renders exactly what it rendered before, and Billing now
// reads the same constant instead of a two-row one with no trial column.
// Footnotes still reuse the shared FOOTNOTES: 1 = walk-up terminal fees, 2 = Stripe/online-payment fees.

// ⛔ `FOOTNOTE_TEXT_OVERRIDES` AND `Cell` MOVED WITH THE TABLE — both are in
// components/landing/FeatureComparison.tsx now. Each had exactly one reader, which was the comparison
// table; leaving either behind would have left this page holding a renderer for markup it no longer
// has, and lint would have called them unused rather than wrong.

const Check = () => (
  <span className="tick"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5 L4.6 9 L10 3" /></svg></span>
)

// Pricing-card price: split "£29/mo" into the big amount + a "per truck / month" sub-line (matches the compare
// header wording). Free/other plans show no sub. Render-only — PLAN_PRICES/PLAN_META are untouched.
function PlanPrice({ plan }: { plan: 'starter' | 'pro' | 'max' }) {
  const raw = PLAN_PRICES[plan]
  const perTruck = raw.endsWith('/mo')
  const amount = perTruck ? raw.slice(0, -3) : raw
  return <div className="plan-price">{amount}{perTruck && <span>per truck / month</span>}</div>
}

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

export default function LandingPage() {
  return (
    // DemoModalProvider is a CLIENT component taking server-rendered children — that's what lets every
    // CTA below open one shared modal without the page itself becoming a client component.
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
      <LandingNav ctaFirst />

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
                  • offers / price — the page DOES show £29 and £49, so a price would be "true", but
                    §4 of the reference manual records £29/£49 already having THIRTEEN literal copies
                    and drifting. A fourteenth, in a file nobody reads, that search engines cache and
                    show in results, is the worst possible place for that copy to go stale.
                  • operatingSystem / device claims beyond what the page states.
                What IS here is only what the page already says in its own words. */}
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'SoftwareApplication',
                name: 'HatchGrab',
                applicationCategory: 'BusinessApplication',
                applicationSubCategory: 'Food truck and mobile catering ordering system',
                url: 'https://www.hatchgrab.com/',
                description: 'Ordering, pre-orders and a kitchen screen for UK food trucks and mobile catering.',
                inLanguage: 'en-GB',
                areaServed: { '@type': 'Country', name: 'United Kingdom' },
                audience: { '@type': 'BusinessAudience', audienceType: 'Food truck and mobile catering operators' },
                publisher: { '@type': 'Organization', name: 'HatchGrab', url: 'https://www.hatchgrab.com/' },
              }) }}
            />
            <h1>The ordering system built for <span className="lean">food trucks.</span></h1>
            {/* 🔴 MOBILE-ONLY (<640px), AND IT IS `display:none` BY DEFAULT — see landing.css. A block
                that is display:none generates no box at all, so on tablet and desktop this element is
                not merely invisible, it takes part in no layout: the hero above 640px is untouched.
                It replaces BOTH the tagline and the CTA text on a phone, which are hidden there. */}
            {/* 🔴 THE <br /> IS THE COPY, NOT A LAYOUT ACCIDENT. Two deliberate lines: the ask, then
                what it gets you. BOTH are sized to hold on one line from 360px up — see the width note
                on `.hero-sub-sm` in landing.css. ⚠️ "no signup needed" moved UP into line 1 on
                12 September, which is what allowed the separate line under the button to be deleted. */}
            <p className="hero-sub-sm">Upload your menu, no signup needed.<br />See a working demo in under 60 seconds.</p>
            <p className="hero-tag">Less time booking.<br />More time <span className="lean">cooking.</span></p>
            {/* CTA row: button LEFT + text RIGHT on desktop (≥940px); stacked, full-width button + centred text on mobile. */}
            <div className="hero-cta-row">
              {/* 🔴 THE id IS THE OBSERVER'S TARGET, NOT A STYLING HOOK — nothing in landing.css selects
                  it. HeroCtaWatcher below watches this exact button to decide when the HEADER CTA
                  appears on mobile. */}
              <DemoCta id="hero-cta" className="btn btn-primary btn-lg">Upload my menu →</DemoCta>
              {/* ══ 🔴 BESIDE THE BUTTON, IN TWO LINES — 7 October 2026 ════════════════════════════
                  It replaced `.hero-cta-text` (a bold 1.12rem line plus a grey one) and sat UNDER the
                  button for a day; it is to its RIGHT now, which is where the block it replaced was.
                  ⚠️ IT IS BACK INSIDE `.hero-cta-row`, AND THAT IS THE WHOLE MECHANISM. That row is
                  `flex-direction: row` from 940px and `column` below it — so one element gives "right
                  of the button" on a laptop and "under the button" on a phone with no second rule and
                  no duplicate markup.
                  🔴 THE BREAK IS THE COPY, NOT A WRAP. Two deliberate lines, as specified; `<br />`
                  rather than two blocks so the pair stays one paragraph to a screen reader. */}
              <p className="hero-cta-note">No signup, no card.<br />See it working in under 60 seconds.</p>
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
              on all three. ⛔ THE `.fan-group` WRAPPER IS GONE with the shared tilt it existed for —
              each screen carries its own `rotate()` again, in landing.css.
              ⚠️ `kitchen.png` IS BACK IN THE HERO and is no longer an unreferenced asset. */}
          <div className="fan">
            <div className="shot shot-kds">
              <Image src="/screenshots/kitchen.png" alt="The HatchGrab kitchen screen, showing order tickets in cook order" width={320} height={240} sizes="(max-width: 939px) 58vw, 320px" priority />
            </div>
            <div className="shot shot-dash">
              <Image src="/screenshots/dashboard-v4.png" alt="Taking an order on HatchGrab: the menu on the left, the running basket and total on the right" width={800} height={551} sizes="(max-width: 939px) 72vw, 400px" priority />
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
              <Image src="/screenshots/customer-order.png" alt="Ordering from a food truck on HatchGrab: the menu with photos and prices, and a running basket total" width={1284} height={2778} sizes="(max-width: 939px) 26vw, 140px" priority />
            </div>
          </div>
        </div>
      </header>

      {/* ============ TRUST STRIP ============ Full-width band under the hero grid; hairline top/bottom on the
          wash tint. Three bullets (orange ticks): row on desktop, left-aligned stack on mobile. */}
      <div className="trust-strip">
        <ul className="trust-in wrap">
          <li><Check /> First month 100% free, everything unlocked</li>
          <li><Check /> No card needed</li>
          <li><Check /> Cancel anytime, no contract</li>
        </ul>
      </div>

      {/* ============ WHAT IT DOES ============ (white — first content section, alternates against the wash
          trust strip above and the wash "how it works" band below) */}
      <section>
        <div className="wrap">
          <p className="eyebrow">What it does</p>
          <h2>Built for food trucks, not restaurants.</h2>
          <p className="lede">Most ordering systems assume a fixed address, reliable wifi and the same hours every week. You’re somewhere new every week, at different times, on patchy or no mobile coverage. HatchGrab was built for that.</p>
          <div className="does">
            {/* ⚠️ BOTH HEADINGS NAME THE **FEATURE**, NOT THE FEELING (10 October 2026, Dominic).
                "Kill the queue" and "Never promise a time you can't hit" were a slogan and a warning —
                a truck owner scanning the page could not tell from either which control they were being
                sold. The two sentences underneath are unchanged, because they were already the plain
                version of the same two facts. */}
            <div className="does-item"><h3><TileIcon icon={Clock} /><span>Customers choose collection times</span></h3><p>Customers order ahead and pick a collection time. No shouting over the fryer.</p></div>
            <div className="does-item"><h3><TileIcon icon={Gauge} /><span>Set your kitchen capacity</span></h3><p>Set your kitchen’s capacity. That’s how much you can cook at once, and how long it takes. Once a collection time is full, customers can’t pick it.</p></div>
            <div className="does-item"><h3><TileIcon icon={MonitorSmartphone} /><span>Works on any device</span></h3><p>Runs on the phone in your apron, the tablet on the counter, the laptop in the van — and the card machine you already take payment on.</p></div>
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
            <div className="does-item"><h3><TileIcon icon={ImageIcon} /><span>Automate your Facebook &amp; Instagram posts</span></h3><p>Upload the design you already post on Facebook or Instagram. We’ll fill in your dates, places and times, ready to share — every week or every day.</p></div>
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
              <div className="does-item"><h3><TileIcon icon={MessageCircle} /><span>WhatsApp auto-replies</span></h3><p>“Where are you tonight?” “What desserts do you have?” Your WhatsApp gets answered while you’re driving to the pitch or at the grill, using your own menu and schedule. Messenger and Instagram coming soon.</p></div>
            )}
            {/* 🟢 "Android coming soon." REMOVED 5 September 2026 — the Android app is live on Google Play, so
                the sentence is present tense like every other claim on this page. The three platforms are
                COMBINED into the existing sentence rather than given a line of their own: they are one app
                on three devices, and a separate line would read as a separate product. */}
            <div className="does-item"><h3><TileIcon icon={WifiOff} /><span>No signal? Keep serving.</span></h3><p>If you lose signal, online ordering pauses automatically so customers can’t place orders you won’t see. Carry on taking orders with the iPhone, iPad and Android app.</p></div>
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
              <div className="does-item"><h3><TileIcon icon={MessageCircle} /><span>WhatsApp auto-replies <span className="soon-inline">Coming soon</span></span></h3><p>“Where are you tonight?” “What desserts do you have?” Soon your WhatsApp will get answered while you’re driving to the pitch or at the grill. Messenger and Instagram to follow.</p></div>
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
          The table above is the whole specification. */}
      <section className="band">
        <div className="wrap">
          <p className="eyebrow">Getting going</p>
          <h2>Get set up and start taking orders in about 15 minutes.</h2>
          <p className="lede">Three things to sort — and two of them just need a photo.</p>
          <div className="steps">
            <div className="step"><h3>Build your menu</h3><p>Photograph your board or paste it in. Items, prices and extras all come across on their own. You just check they’re right.</p></div>
            <div className="step"><h3>Add your schedule</h3><p>Got it on your website? We’ll read it from there and keep it up to date. If not, photograph that too. You just approve what it finds.</p></div>
            <div className="step"><h3>Share your link</h3><p>Post it on Facebook, stick the QR on the van. Orders land on your screen, in the order you need to cook them.</p></div>
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
          The logo is public/gusto-logo.png, which is real and always has been. */}
      <section className="quote-sec">
        <div className="wrap quote-in">
          <span className="quote-mark">“</span>
          <blockquote>{"HatchGrab has made ordering so much easier. Everything's organised, we can track stock and know exactly how many pizzas we have left to sell — and the time slots are fantastic for busy villages."}</blockquote>
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
              {/* ── THE ATTRIBUTION READS: names -> role -> award (29 August 2026). ───────────────
                  🔴 THE TRUCK NAME IS NOT REPEATED. This line held "Pizzeria Gusto" on its own; it now
                  holds the owners' names, and the business name appears once, inside the role line
                  beneath it. Adding the names ABOVE the existing line would have read
                  "Pizzeria Gusto / Nadia & Bogdan / Owners, Pizzeria Gusto" — the name twice in three
                  lines. The line was repurposed, not added to.
                  ⚠️ THE LOGO'S alt IS STILL "Pizzeria Gusto", so a screen reader hears the business
                  name from the image and again from the role line. Sighted readers see it once,
                  because the logo is a picture. Fixing that means editing the logo element, which this
                  workstream was told not to touch — flagged, not changed.
                  ⚠️ "&" IS THE LITERAL AMPERSAND THEY USE BETWEEN TWO FIRST NAMES, written as {'&'}
                  rather than bare so no formatter turns it into an entity or a word. */}
              <span className="quote-name">Nadia {'&'} Bogdan</span>
              <span className="quote-role">Owners, Pizzeria Gusto</span>
              {/* ✅ Award wording CONFIRMED by Dominic, 28 August 2026 ("Mobile pizzeria of the year — regional
                  winner is correct"). Layout is set with INLINE styles (not just .cred-* classes) so it renders
                  correctly even if a stale landing.css is cached: title row (★ — text — ★) then scope beneath. */}
              <span className="quote-cred" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem', marginTop: '0.35rem', width: '100%' }}>
                <span className="cred-title" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', whiteSpace: 'nowrap', color: 'var(--orange)', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.01em' }}>
                  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', fill: 'var(--orange)' }}><path d="M8 0l2.2 4.6 5 .7-3.6 3.5.9 5L8 11.4 3.5 13.8l.9-5L.8 5.3l5-.7z" /></svg>
                  Mobile Pizzeria of the Year
                  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', fill: 'var(--orange)' }}><path d="M8 0l2.2 4.6 5 .7-3.6 3.5.9 5L8 11.4 3.5 13.8l.9-5L.8 5.3l5-.7z" /></svg>
                </span>
                <span className="cred-scope" style={{ display: 'block', textAlign: 'center', color: 'var(--ink-faint)', fontWeight: 600, fontSize: '0.68rem' }}>Regional winner</span>
              </span>
            </span>
          </div>
        </div>
      </section>

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
      <section id="pricing" className="band">
        <div className="wrap">
          <div className="price-head">
            <p className="eyebrow">Pricing</p>
            {/* ⚠️ "Start free. Stay free, if that's all you need." UNTIL 6 October 2026. The old line
                sold staying on the free tier; this one names the move the page is actually asking for.
                ⛔ NOTHING ELSE IN THIS SECTION CHANGED — the fee paragraph, the orange trial banner, the
                three cards, the button, the switching block and the small print are all untouched. */}
            <h2>Start free. Upgrade when you need to.</h2>
            {/* 🔴 THE LEDE STATES THE HEADLINE AND STOPS. The walk-up detail — the in-person rate, the
                UK/EEA limit, the tap surcharge, "coming soon" — lives ONCE, in footnote 1, which renders
                further down this same page. Restating any of it here is what made this section read three
                times over. Figures come from CARD_FEES; never write one as a literal.
                🔴 THE TRAILING CLAUSE IS LOAD-BEARING AND IS NOT PADDING. Without it, "no platform fee"
                reads as "free", which is untrue for anyone taking cards. And it is worded as "your card
                terminal's own fees" DELIBERATELY: "card processing still applies" would read as a second,
                NEW charge, when in fact most trucks already pay their own terminal provider and nothing
                about that changes. It says whose fee it is and that nothing changes. Do not shorten it to
                "fees still apply", and do not add a figure — there is deliberately no number here. */}
            <p className="lede">Pro is £29 a month with £1,500 of online orders included. Max is £49 with £2,000. Anything above that is 0.99%. Standard card processing fees apply to all online orders (currently {CARD_FEE_ONLINE_LABEL} on standard UK cards), including those within your allowance. Walk-ups carry no HatchGrab platform fee on any plan. Your card terminal&apos;s own fees still apply.</p>
          </div>

          <div className="trial-banner">
            <strong>Your first month is completely free — every feature unlocked.</strong>
            <span>With Pay at Hatch, customers order ahead and pay when they collect, so you can take online orders without connecting a card processor at all. Prefer to take payment up front? Add online card payments any time. <b><u>Adding online payments doesn’t start your subscription</u></b>. You’re only charged when you actively select a paid plan. We’ll never charge you without your clear permission. No card to start, cancel anytime.</span>
          </div>

          <div className="plans">
            {/* Starter */}
            <div className="plan">
              <div className="plan-name">{PLAN_META.starter.name}</div>
              <div className="plan-who">{PLAN_DESCRIPTIONS.starter}</div>
              <PlanPrice plan="starter" />
              <div className="plan-fee">{PLAN_ALLOWANCES.starter}</div>
              <ul>
                <li className="lead">Everything to run a service</li>
                <li>Walk-up orders &amp; kitchen screen</li>
                <li>Online ordering, pay at the hatch</li>
                <li>Menu, meal deals &amp; upsells</li>
                {/* 🔴 THE "Sold-out toggle & stock countdown" BULLET WAS REMOVED HERE — 2 September 2026,
                    on request, in two steps: "& stock countdown" went with the matrix change that moved
                    'Automated stock countdown' off Starter, then the whole bullet went.
                    🟢 THE FEATURE TABLE IS UNCHANGED AND THAT IS DELIBERATE. 'Instant sold out toggle'
                    is still a row at starter:true, so a Starter truck still HAS the toggle and the
                    comparison table still says so — this card simply no longer spends a line on it.
                    🔴 DO NOT "RESTORE FOR CONSISTENCY" BY READING THE MATRIX. These bullets are
                    HAND-WRITTEN (see the note below) and are a shorter, chosen selection — not a
                    rendering of every starter:true row. A bullet missing here is not drift. */}
                {/* ══ 🔴 SPLIT INTO TWO BULLETS — 6 October 2026, on request ═══════════════════════
                    It was one welded line, "QR code & discovery map listing", for two features that
                    are separate rows in the matrix (`qr_menu` and `discovery_map`) and are separate
                    things an operator gets. 🟢 EACH HALF IS NOW BYTE-IDENTICAL TO ITS ROW's `name` in
                    lib/plan-features.ts — 'QR code' and 'Discovery map listing' — which is the rule
                    the Max card's bullets already follow, so the card and the /features table say the
                    same words for the same thing.
                    ⚠️ THESE BULLETS ARE HAND-WRITTEN AND NOTHING CHECKS THEM AGAINST THE MATRIX. The
                    match above is deliberate, not automatic; if a row is ever renamed, this is one of
                    the places that will not follow on its own. */}
                <li>QR code</li>
                <li>Discovery map listing</li>
                {/* ⚠️ HAND-WRITTEN, NOT RENDERED FROM FEATURE_SECTIONS. This bullet is a literal twin of the
                    matrix row in lib/plan-features.ts and nothing checks the two against each other, so it
                    must be changed in the SAME commit or the same page shows two different claims. */}
                {/* 🟢 ONE BULLET, NOT TWO (5 September 2026). The Android app is live on Google Play, so
                    its own coming-soon line was DELETED rather than un-marked — the two were split only
                    while the platforms shipped at different times. This bullet is a literal twin of the
                    matrix row and nothing checks the two against each other, so both moved in one edit. */}
                <li>iPhone, iPad and Android kitchen app</li>
              </ul>
              <DemoCta className="btn btn-ghost">Try Free</DemoCta>
            </div>

            {/* Pro */}
            <div className="plan hero-plan">
              <span className="plan-tag">Most trucks</span>
              <div className="plan-name">{PLAN_META.pro.name}</div>
              <div className="plan-who">{PLAN_DESCRIPTIONS.pro}</div>
              <PlanPrice plan="pro" />
              <div className="plan-fee">{PLAN_ALLOWANCES.pro}<sup className="fee-star">*</sup></div>
              <ul>
                <li className="lead">Everything in Free, plus</li>
                <li>Offline order protection</li>
                <li>Take payment online</li>
                <li>Pre-orders &amp; collection times</li>
                {/* ⚠️ "Kitchen capacity management", NOT "Smart slot management" (10 October 2026).
                    "Smart" is a claim and "slot" is our word; the thing a truck sets is their kitchen's
                    capacity. ⛔ IT MATCHES THE MATRIX ROW'S OWN `name` in lib/plan-features.ts, which
                    was renamed in the same edit — the card and the matrix naming one feature two ways
                    is the gap this product has closed twice before.
                    ⛔ "Auto-accept orders" IS OFF THE CARD, on instruction. It is STILL A PRO FEATURE
                    and still in the matrix ('Auto-accept online orders', pro: true) — this card is the
                    short list, not the full one. */}
                <li>Kitchen capacity management</li>
                {/* 🔴 PRIVATE EVENTS IS A **PRO** FEATURE (5 October 2026), the other half of the row
                    that was "Event & festival pricing · Coming soon" on the Max card. Built, so no
                    badge — and it twins the `pro: true` cell in lib/plan-features.ts.
                    ⚠️ SHORTENED TO "Private events" ON 6 OCTOBER 2026. It read "Private events with
                    their own ordering link" — the longest bullet in the list, for a detail the matrix
                    row's own `detail` already carries. 🟢 IT IS NOW BYTE-IDENTICAL TO THE ROW'S `name`
                    in lib/plan-features.ts, which already said "Private events": the card was the one
                    out of step, so this closes a gap rather than opening one. */}
                <li>Private events</li>
                {/* ⚠️ SPLIT 4 September 2026 — was one welded bullet: "WhatsApp, Messenger & Instagram
                    auto-replies — Coming soon". WhatsApp now ships and carries NO badge; the other two
                    keep theirs. Third surface of the same fact as the does-item block above and the
                    matrix row in lib/plan-features.ts.
                    ══ ⛔ THE ⁴ FOOTNOTE MARKER WAS REMOVED — 6 October 2026 ════════════════════════
                    🔴 BECAUSE THE NOTE IT POINTED AT IS NO LONGER ON THIS PAGE. `.f-note` resolved to
                    the numbered list under the comparison table, and that table is /features now — so
                    the superscript became a reference to nothing, on the one surface where a reader
                    cannot tell a dangling marker from a missing footnote. The footnotes themselves are
                    untouched and footnote 4 still renders beneath the table on /features, where the
                    matrix row still carries its marker.
                    ⚠️ THE OLD WARNING HERE IS KEPT BELOW BECAUSE IT IS STILL THE RULE for the row:
                    "if footnote 4 is ever renumbered or retired, the marker must move with it; it will
                    not error, it will just point at the wrong note." That is exactly what happened to
                    this one — the note did not move, the PAGE did. */}
                {/* 🔴 SOCIAL MEDIA POSTS — a normal live bullet, no badge (6 October 2026, on request).
                    ⚠️ IT TWINS THE MATRIX ROW (`pro: true, max: true`).
                    🟢 **AND THE GATE NOW BACKS IT — 10 October 2026.** This bullet and that row used to
                    be claims nothing enforced: the gate was a Feature in NO plan, held only through
                    `trucks.feature_overrides` and granted to one truck, so a public, indexed page
                    promised something no plan sold. The plan key is in PRO_FEATURES now — Pro, Max and
                    trial — and the row is mapped in ROW_FEATURE_MAP, which makes
                    findPlanParityViolations() compare this promise against the gate on every module
                    load. ⛔ THE RECORDED EXCEPTION IS CLOSED; there is nothing left to read before
                    changing this bullet except lib/features.ts itself.
                    ⚠️ THE KEY IS DELIBERATELY NOT NAMED IN THIS COMMENT. `scripts/schedule-graphics-places.cjs`
                    pins an EXACT list of the files that name it, over code lines only — and this file's
                    JSX comments have no leading `*`, so its line-based stripper cannot tell this prose
                    from a gate. Naming it here would have added a seventh "consumer" that gates
                    nothing. See lib/features.ts for the key and its tiers. */}
                <li>Social media posts</li>
                {/* ══ 🔴 ONE BULLET FOR ALL THREE CHANNELS AGAIN — 6 October 2026 ════════════════════
                    ⛔ THE SEPARATE "Messenger & Instagram auto-replies" BULLET IS GONE. It carried the
                    COMING SOON badge, which put a badge on the card for a channel nobody buys the plan
                    for, directly under the one that is live — so the card read as half-finished.
                    🔴 AND THE PARENTHETICAL IS **NOT** A BADGE, WHICH IS THE POINT: WhatsApp itself
                    ships, so `soon-inline` here would have said "coming soon" about the live half of
                    the sentence.
                    ⚠️ NOR IS IT SMALLER OR MUTED — Dominic, 6 October 2026: *"'(Messenger & Instagram
                    coming soon)' needs to be same size and format as 'WhatsApp auto-replies'."* It was
                    briefly a `.li-note` span at .68rem in `--ink-faint`; it is now PLAIN BULLET TEXT in
                    the same run as the rest of the line, so there is no span and no second style to
                    keep in step. ⛔ THE `.li-note` RULE WAS DELETED FROM landing.css IN THE SAME EDIT
                    rather than left behind styling nothing.
                    ⚠️ THE FLAG STILL DECIDES. With WHATSAPP_LIVE off there is nothing live to separate,
                    so the OFF branch keeps the welded badge line it has always had, verbatim. */}
                {WHATSAPP_LIVE ? (
                <li>WhatsApp auto-replies (Messenger &amp; Instagram coming soon)</li>
                ) : (
                <li>WhatsApp, Messenger &amp; Instagram auto-replies <span className="soon-inline">Coming soon</span></li>
                )}
                {/* ══ 🔴 "Coming soon" SITS AT THE BOTTOM, GROUPED — 6 October 2026 ═══════════════════
                    ⛔ THIS BULLET DID NOT MOVE; THE TWO ABOVE IT DID NOT EITHER. What moved is
                    "Private events", which was BETWEEN the badged Messenger/Instagram line and this
                    one — so the card read built, coming-soon, built, coming-soon. A reader scanning for
                    what they get today had to read every line to know which half it was in.
                    ⚠️ THE RULE IS APPLIED TO ALL THREE CARDS, and Max already satisfied it. */}
                <li>Take payment on your phone <span className="soon-inline">Coming soon</span></li>
              </ul>
              <DemoCta className="btn btn-primary">Try Free</DemoCta>
            </div>

            {/* Max */}
            <div className="plan">
              <div className="plan-name">{PLAN_META.max.name}</div>
              <div className="plan-who">{PLAN_DESCRIPTIONS.max}</div>
              <PlanPrice plan="max" />
              <div className="plan-fee">{PLAN_ALLOWANCES.max}<sup className="fee-star">*</sup></div>
              <ul>
                <li className="lead">Everything in Pro, plus</li>
                <li>Multi-device kitchen sync</li>
                <li>Multi-staff logins</li>
                {/* ⚠️ RENAMED, MOVED AND UN-BADGED 29 August 2026, to match the matrix row it twins
                    (lib/plan-features.ts, now 'Schedule page on your own website'), which moved above
                    'Kitchen ticket printing' in the same change.
                    ✅ THE CARD AND THE TABLE AGREE. Removing the badge here first left this card claiming
                    the feature while the comparison table lower down the SAME page still said "Coming
                    soon"; the matrix row was then flipped to `true` (with its ROW_FEATURE_MAP entry, in
                    the same change) and both now read as included. Un-badge here and flip there together,
                    or the page argues with itself — this bullet is hand-written and nothing checks it.
                    🔴 RE-WORDED AGAIN 3 September 2026, IN THE SAME EDIT AS THE ROW, for that reason.
                    Was 'Your schedule at your own website'. This card and the comparison table sit on
                    ONE page, so two names for one feature is the page arguing with itself in the exact
                    way this comment already warned about. THE BULLET IS NOT A KEY — nothing joins on it;
                    it is display copy that must simply agree with the row. Change both or neither. */}
                <li>Schedule page on your own website</li>
                {/* 🔴 NO "(Bluetooth or wired printer)" HERE — 19 September 2026. The card lists WHAT
                    you get; which printers it works with is a detail, and the comparison table lower down
                    this page already carries it in the row's own `detail` and footnote 5. Saying it twice
                    made the card the longest bullet in the list for the least useful reason. The bullet is
                    now byte-identical to the row's `name`, which is what the rule above asks for. */}
                <li>Kitchen ticket printing</li>
                {/* ══ 🔴 "Event & festival pricing · Coming soon" BECAME TWO BUILT ROWS (5 October 2026)
                    ⛔ ONE BULLET COULD NOT CARRY BOTH, because they are on different tiers: private
                    events are Pro (`private_events`) and custom types with their prices are Max
                    (`event_types`). This card is Max, so it carries the Max one; the Pro bullet is in
                    the Pro card above.
                    ⚠️ AND THE BADGE IS GONE — both are built. These bullets are hand-written twins of
                    the matrix rows in lib/plan-features.ts and nothing checks them against each other,
                    so a "Coming soon" left here would contradict a `true` cell in the table on the same
                    page. Change both or neither; this is the "both". */}
                <li>Custom event types &amp; pricing</li>
                <li>Digital loyalty stamp cards <span className="soon-inline">Coming soon</span></li>
              </ul>
              <DemoCta className="btn btn-ghost">Try Free</DemoCta>
            </div>
          </div>

          {/* ══ 🔴 THE LINK THAT REPLACED THE TABLE — 6 October 2026 ════════════════════════════════
              The full comparison used to be the next section down this page. It is /features now, and
              this is how a reader gets to it: directly under the cards, while they are still choosing.
              ⚠️ BEFORE THE SWITCHING BLOCK, DELIBERATELY. "Switching from another platform?" filters
              itself out for most readers (see its own note below), so a link placed after it would sit
              behind a heading that tells half the audience the paragraph is not for them.
              🔴 A PLAIN <a>, LIKE EVERY OTHER LINK ON THIS PAGE. next/link is not imported here, and
              /features is a different route under a different `.hg-landing` wrapper with its own font
              instances, so a client-side transition would buy nothing.

              ══ 🔴 A LEAD-IN AND A **NAVY** BUTTON — 7 October 2026 ═══════════════════════════════════
              It has been a text link, then an outlined `btn-ghost`, and it was still being missed.
              ⛔ THE REASON IT WAS OUTLINED NO LONGER APPLIES THE WAY IT DID. The old note said a filled
              button "must not compete with the three sitting in the cards immediately above it" — and
              that is still true of an ORANGE one, because every orange control on this page opens the
              demo modal. It is NOT true of a navy one: navy is the heading colour, it is not a CTA
              colour anywhere on this page, and a reader cannot mistake it for the same action.
              🔴 THE LEAD-IN IS WHAT MAKES THE BUTTON WORTH PRESSING. "Compare all features →" on its
              own is a label; "Not sure which plan?" is the question a reader standing in front of three
              cards is actually holding, and the line answers it before the button asks for a click.
              ⚠️ TWO ELEMENTS, TWO RULES. `.feat-cta` carries the lead-in and the centring; `.feat-btn`
              carries the button. One wrapper with both inside would have made the 10–12px gap between
              them a margin on a `<p>` inside a `<p>`, which is not legal markup. */}
          <p className="feat-cta feat-lead">Not sure which plan? See exactly what each one includes.</p>
          <p className="feat-btn"><a href="/features" className="btn btn-navy">Compare all features →</a></p>

          {/* ── 🔴 THE SWITCHING BLOCK — A SIDE DOOR, AND IT SELF-SELECTS ON ITS FIRST WORD ──────────
              Added 3 September 2026. Copy supplied and approved; it is not editorial and must not be
              "tightened".
              🔴 IT REPLACED THE BARE "Work out what you would pay →" LINK THAT STOOD IN .price-foot.
              Two links to /compare in one section was one too many, and this one does the same job with
              the framing that makes it safe. The old link is gone, not hidden.
              🟢 THE HEADING IS THE FILTER, AND THAT IS THE WHOLE DESIGN. "Switching from another
              platform?" tells an operator paying nobody that this is not about them, so they read the
              plan cards above and move on. That matters because the calculator answers "what would I pay
              instead" — and for someone paying nothing today the honest answer is "more than nothing".
              Putting that in front of them would argue against us with our own tool.
              🟢 AFTER the plan cards on purpose: the cards are the main argument and everyone gets
              them; this is the extra step only the paying subset needs.
              ⚠️ SECONDARY BY CONSTRUCTION, NOT BY RESTRAINT. It is not an <h2> — the section already has
              one and a second would read as a new section. The heading is 1rem against the section h2's
              clamp(1.6rem, 3.2vw, 2.15rem), and smaller than a plan name at 1.15rem. No button: every
              primary control here is an orange DemoCta and a filled button would compete with it.
              ⚠️ NO COMPETITOR IS NAMED and no comparative claim is made about any named business —
              "another platform" is deliberately unnamed. Keep it that way.
              🔴 /compare HAS ITS OWN GATE AND IT IS NOT THIS ONE. It refuses unless
              NEXT_PUBLIC_PRICING_PUBLISHED is 'true'; while that is unset this link lands on a redirect
              to /contact. See docs/landing-switching-block-report.md 7. */}
          <div className="switch-block">
            <p className="switch-head">Switching from another platform?</p>
            <p className="switch-body">See what you’d be paying on HatchGrab for the same orders. Takes about a minute.</p>
            <p className="switch-cta"><a href="/compare">Compare what you’re paying</a></p>
          </div>

          <div className="price-foot">
            {/* ⚠️ THE WALK-UP PARAGRAPH THAT STOOD HERE WAS REMOVED, NOT SHORTENED. Footnote 1 covers it
                and renders on this same screen, so this restated it a third time. */}
            <p>*Standard card processing fees apply to all online orders (currently {CARD_FEE_ONLINE_LABEL} on standard UK cards), including those within your allowance.</p>
            <p>Cancel by doing nothing. Even if you’ve added a card for payments, we’ll never charge it for a plan unless you actively choose one.</p>
          </div>
        </div>
      </section>

      {/* ══ ⛔ THE FULL COMPARISON TABLE LEFT THIS PAGE — 6 October 2026 ═══════════════════════════
          It was 31 rows across four columns plus five footnotes, below the plan cards most visitors
          came for, and it was the single longest thing on a page that was too long.
          🔴 MOVED, NOT DELETED, AND NOT REWRITTEN: components/landing/FeatureComparison.tsx holds the
          same markup verbatim and app/features/page.tsx renders it inside this same chrome. Same rows,
          same order, same wording, same source (lib/plan-features.ts). The link to it is under the
          plan cards above, before the switching block.
          ⚠️ THE SECTION HAD NO `id`, SO THERE IS NO ANCHOR TO PRESERVE. Checked in git HEAD and
          checked the other way round, by sweeping every `#fragment` in the repository: the only
          landing anchors that have ever existed are `#pricing` and `#try`, and nothing in the codebase
          — no email, no template, no document — ever linked to where this table was.
          🔴 `lib/plan-features.ts` IS STILL IMPORTED BY THIS FILE (PLAN_PRICES, PLAN_DESCRIPTIONS,
          PLAN_ALLOWANCES, CARD_FEE_ONLINE_LABEL), WHICH IS LOAD-BEARING: that module runs
          `findPlanParityViolations()` at module load, so the guard still fires when this route renders.
          If those imports ever go too, the guard goes with them silently. */}

      {/* ============ FINAL CTA ============ */}
      <section id="try">
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
          <svg className="truck" viewBox="24.0 18.0 351.5 176.0" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Food truck">
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
          <h2>Want to see how easy setup is?</h2>
          <p className="lede">Upload a photo or screenshot of your menu and we’ll turn it into a working ordering page for you to have a play around with in under 60 seconds. Your items, your prices. No sign-up, no card, nothing to install. Have a look, then decide.</p>
          {/* This section keeps its heading + copy; its button opens the SAME modal every other CTA on
              the page opens. `#try` remains a valid anchor target (the return-link bounce uses it), but
              nothing scrolls here to reach the upload any more. No ✨ on page CTAs — the sparkle is the
              MODAL's cue (mirroring Manage's "✨ Import menu"), not the landing page's. */}
          <DemoCta className="btn btn-primary btn-lg">Upload my menu now →</DemoCta>
          <ul className="proof">
            <li><Check /> First month 100% free, everything unlocked</li>
            <li><Check /> No card needed</li>
            <li><Check /> Cancel anytime, no contract</li>
          </ul>
        </div>
      </section>

      {/* ============ FOOTER ============ (slate bg = HEADER_BG from lib/brand.ts) */}
      <LandingFooter />
      {/* Mounted ONCE — every DemoCta above drives this one instance. */}
      <DemoModal />
    </div>
    </DemoModalProvider>
  )
}
