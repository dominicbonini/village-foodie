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
// Chrome EXTRACTED 23 August 2026 so /landing/cost renders the same nav and footer from one definition.
// 🔴 MOVED, NOT REWRITTEN — proven byte-identical; see docs/cost-comparison-chrome-report.md §1.
import { LandingNav } from '@/components/landing/LandingNav'
import { LandingFooter } from '@/components/landing/LandingFooter'
import {
  FEATURE_SECTIONS, PLAN_PRICES, PLAN_DESCRIPTIONS, PLAN_ALLOWANCES, FOOTNOTES,
  CARD_FEE_ONLINE_LABEL, TRANSACTION_ROWS,
  type FeatureValue,
} from '@/lib/plan-features'
import { PLAN_META } from '@/lib/features'
// 🔴 THE TABLE'S RENDER RULES NOW LIVE IN ONE PLACE — lib/landing-table.ts. They were private
// constants in this file until the printable/PDF view was added; a second copy there would have drifted
// the first time a row changed. Nothing about what this page renders changed in the move.
import {
  TABLE_PLANS, type TablePlan, PLAN_SUB, PLAN_PRICE_LABEL, trialFeatureValue,
  DETAIL_OVERRIDES, visibleRows, rowName, rowDetail, cellLabel,
} from '@/lib/landing-table'
import './landing.css'

// Self-hosted, non-render-blocking (no Google Fonts <link>). Exposed as CSS vars the stylesheet maps
// to --display / --body / --ticket.
const archivo = Archivo({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-archivo', display: 'swap' })
const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' })
const courierPrime = Courier_Prime({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-courier-prime', display: 'swap' })

export const metadata: Metadata = {
  title: 'HatchGrab — The ordering system built for food trucks',
  // 🔴 noindex RESTORED. This page is at hatchgrab.com's root but is NOT public: the admin gate in
  // layout.tsx is back on while the Pizzeria Gusto testimonial is unpermissioned and the screenshots
  // are placeholders. An indexable page behind a gate would let a search engine surface a URL that
  // every non-admin is redirected away from, and could cache a snippet of the testimonial itself.
  // ⚠️ FLIP THIS BACK THE SAME DAY THE GATE COMES OFF, in the same commit. The two belong together.
  robots: { index: false, follow: false },
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

// RENDER-ONLY footnote text overrides for the landing table. The shared FOOTNOTES (lib/plan-features.ts) are
// NOT modified — Billing/Admin keep the original wording; only the landing table shows this text.
const FOOTNOTE_TEXT_OVERRIDES: Record<string, string> = {
  '2': `Standard card processing fees apply to all online orders (currently ${CARD_FEE_ONLINE_LABEL} on standard UK cards), including those within your allowance.`,
}

// One shared cell renderer. 🔴 THE GLYPHS THEMSELVES ARE IN lib/landing-table.ts so the PDF prints
// exactly what the page prints — including the protected em-dash '—' for a not-included cell.
function Cell({ value }: { value: FeatureValue }) {
  const label = cellLabel(value)
  if (label === '✓') return <span className="yes">{label}</span>
  if (label === 'Coming soon') return <span className="soon">{label}</span>
  return <span className="no">{label}</span>
}

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

export default function LandingPage() {
  return (
    // DemoModalProvider is a CLIENT component taking server-rendered children — that's what lets every
    // CTA below open one shared modal without the page itself becoming a client component.
    <DemoModalProvider>
    <div className={`hg-landing ${archivo.variable} ${publicSans.variable} ${courierPrime.variable}`}>

      {/* ============ NAV ============ (slate bg = HEADER_BG from lib/brand.ts) */}
      <LandingNav />

      {/* ============ HERO ============ */}
      <header className="hero">
        <div className="wrap hero-grid">
          <div>
            <h1>The ordering system built for <span className="lean">food trucks.</span></h1>
            <p className="hero-tag">Less time booking.<br />More time <span className="lean">cooking.</span></p>
            {/* CTA row: button LEFT + text RIGHT on desktop (≥940px); stacked, full-width button + centred text on mobile. */}
            <div className="hero-cta-row">
              <DemoCta className="btn btn-primary btn-lg">Upload my menu →</DemoCta>
              <div className="hero-cta-text">
                <b>Upload a photo of your menu. See it working in under 60 seconds.</b>
                <span>No signup, no account — just a working demo with your truck’s food in it.</span>
              </div>
            </div>
          </div>

          {/* ── Screenshot fan. Three real screenshots, absolutely positioned and rotated by landing.css. ──
              🔴 width/height ARE THE CSS BOX SIZES, NOT THE EXPORT SIZES. The files are exported at 2x
              (640x480, 800x550, 280x529) for retina; these numbers are the 320x240 / 400x275 / 140x264
              boxes the CSS actually lays out. next/image uses them for the aspect ratio and to reserve
              space — giving it the 2x numbers would reserve a box twice the size and shift the layout.
              ⚠️ The CSS `aspect-ratio` on each .shot-* is what really sizes the frame; these attributes
              must AGREE with it or next/image and the CSS will disagree about the shape.
              🔴 `priority` ON ALL THREE: this fan is the hero, above the fold on every viewport. Without
              it next/image lazy-loads and the frames paint empty on first view — the exact failure the
              placeholder never had. `sizes` matches the CSS caps so the generated srcset is not oversized.
              ⚠️ alt TEXT IS DESCRIPTIVE, NOT DECORATIVE. These carry the product claim the hero makes, so
              they are not alt="" — unlike the Gusto logo below, which sits beside its own attribution. */}
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
            <div className="does-item"><h3>Kill the queue</h3><p>Customers order ahead and pick a collection time. No shouting over the fryer.</p></div>
            <div className="does-item"><h3>Never promise a time you can’t hit</h3><p>Set your kitchen’s capacity. That’s how much you can cook at once, and how long it takes. Once a collection time is full, customers can’t pick it.</p></div>
            <div className="does-item"><h3>Works on any device</h3><p>Runs on the phone in your apron, the tablet on the counter, the laptop in the van — and the card machine you already take payment on.</p></div>
            <div className="does-item"><h3>Never type your schedule twice</h3><p>We read your schedule straight from your website. Or send us the photo you already post to Facebook. You just review and confirm.</p></div>
            <div className="does-item"><h3>No signal? Keep serving.</h3><p>If you lose signal, online ordering pauses automatically so customers can’t place orders you won’t see. Carry on taking orders with the iPhone and iPad app. Android coming soon.</p></div>
            {/* ⚠️ "driving to the pitch or at the grill" — NOT just "at the grill". On its own that is a
                generic busy-kitchen claim any hospitality product could make. DRIVING is specific to a food
                truck and is the moment an operator genuinely CANNOT reply, which is the whole point of the
                feature. Keeping both covers the two states a truck operator is actually in.
                🔴 THE TENSES ARE NOW UNIFORM, AND THAT IS THE CHANGE. This block used to read WhatsApp in
                the PRESENT tense — "your WhatsApp gets answered" — because it was expected to ship at
                launch, with Messenger and Instagram carrying "coming soon". A standing note here told the
                next reader NOT to harmonise them, and that instruction was correct for that state.
                ⚠️ THAT STATE NO LONGER HOLDS, so the instruction is retired rather than deleted — the
                reasoning is worth keeping because it explains why the old wording looked inconsistent and
                was not. app/manage/[token]/page.tsx:8378 sets `WHATSAPP_LIVE = false`, so the operator's
                own Connect control has been showing "coming soon" the whole time. The copy now says the
                same thing the product does.
                🔴 THE NEW RULE, AND IT IS THE SAME RULE UNDERNEATH: the landing page describes the product
                AS IT IS. All three channels are future tense because none of the three is available. If
                WhatsApp ships, this block, the matrix row in lib/plan-features.ts and the Pro-card bullet
                below all move back together — they are three surfaces of one fact and must not drift. */}
            <div className="does-item"><h3>Social media auto-replies — coming soon</h3><p>“Where are you tonight?” “What desserts do you have?” Soon your WhatsApp will get answered while you’re driving to the pitch or at the grill. Messenger and Instagram to follow.</p></div>
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ (tinted band. Order is what-it-does(white) → this(wash) →
          testimonial(white) → orders(wash) … so the page alternates white/wash cleanly and the white
          testimonial sits between two wash bands without being tinted itself.) */}
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
            <Image className="quote-logo" src="/gusto-logo.png" alt="" width={320} height={233} />
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

      {/* ============ ORDERS / TICKET ============ */}
      <section className="band">
        <div className="wrap split">
          <div>
            <p className="eyebrow">Orders</p>
            <h2>Everything you need, nothing you don’t.</h2>
            <p className="lede">Name, time, what they want, and anything they’ve asked for. All on your kitchen screen before they arrive. No note gets missed. Print it as well if you’d rather have paper in your hand.</p>
          </div>
          <div className="ticket-stage">
            <div className="ticket" role="img" aria-label="Example order ticket: order 17 for Sarah, two Margheritas with no basil, one Pepperoni and two Cokes, collect at 6.20pm, total £37.00.">
              <div className="t-head"><div><div className="t-no">#17</div><div className="t-name">Sarah</div></div><div className="t-time">Collect <b>18:20</b></div></div>
              <div className="t-line"><span>2 × Margherita</span><span>£20.00</span></div>
              <div className="t-note">no basil please</div>
              <div className="t-line"><span>1 × Pepperoni</span><span>£12.00</span></div>
              <div className="t-line"><span>2 × Coke</span><span>£5.00</span></div>
              <hr className="t-rule" />
              <div className="t-total"><span>Total</span><span>£37.00</span></div>
              <div className="t-foot">Ordered ahead · Pay at the hatch</div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ PRICING CARDS ============ (who / price / fee from source; bullet teasers are editorial) */}
      <section id="pricing">
        <div className="wrap">
          <div className="price-head">
            <p className="eyebrow">Pricing</p>
            <h2>Start free. Stay free, if that’s all you need.</h2>
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
                <li>Sold-out toggle &amp; stock countdown</li>
                <li>QR code &amp; discovery map listing</li>
                {/* ⚠️ HAND-WRITTEN, NOT RENDERED FROM FEATURE_SECTIONS. This bullet is a literal twin of the
                    matrix row in lib/plan-features.ts and nothing checks the two against each other, so it
                    must be changed in the SAME commit or the same page shows two different claims. */}
                <li>iPhone and iPad kitchen app</li>
                <li>Android kitchen app <span className="soon-inline">Coming soon</span></li>
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
                <li>Smart slot management</li>
                <li>Auto-accept orders</li>
                <li>WhatsApp, Messenger &amp; Instagram auto-replies <span className="soon-inline">Coming soon</span></li>
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
                    (lib/plan-features.ts, 'Your schedule at your own website'), which moved above
                    'Kitchen ticket printing' in the same change.
                    ✅ THE CARD AND THE TABLE AGREE. Removing the badge here first left this card claiming
                    the feature while the comparison table lower down the SAME page still said "Coming
                    soon"; the matrix row was then flipped to `true` (with its ROW_FEATURE_MAP entry, in
                    the same change) and both now read as included. Un-badge here and flip there together,
                    or the page argues with itself — this bullet is hand-written and nothing checks it. */}
                <li>Your schedule at your own website</li>
                <li>Kitchen ticket printing</li>
                <li>Event &amp; festival pricing <span className="soon-inline">Coming soon</span></li>
                <li>Digital loyalty stamp cards <span className="soon-inline">Coming soon</span></li>
              </ul>
              <DemoCta className="btn btn-ghost">Try Free</DemoCta>
            </div>
          </div>

          <div className="price-foot">
            {/* ⚠️ THE WALK-UP PARAGRAPH THAT STOOD HERE WAS REMOVED, NOT SHORTENED. Footnote 1 covers it
                and renders on this same screen, so this restated it a third time. */}
            <p>*Standard card processing fees apply to all online orders (currently {CARD_FEE_ONLINE_LABEL} on standard UK cards), including those within your allowance.</p>
            <p>Cancel by doing nothing. Even if you’ve added a card for payments, we’ll never charge it for a plan unless you actively choose one.</p>
          </div>
        </div>
      </section>

      {/* ============ FULL COMPARISON ============ (FLEX, renders from source; sticky header mirrors Billing) */}
      <section className="band">
        <div className="wrap">
          <p className="eyebrow">Compare</p>
          <h2>Every feature, side by side.</h2>
          <p className="lede">Your free month includes everything — try the lot before you pick.</p>

          <div className="cmp2">
            {/* Sticky priced header — pins below the nav (top: --nav-h), opaque bg hides rows scrolling under.
                Same technique as Manage → Billing. */}
            <div className="cmp2-head">
              <div className="cmp2-feat" />
              {TABLE_PLANS.map(p => (
                <div key={p} className="cmp2-col">
                  <span className="th-plan">{PLAN_META[p].name}</span>
                  <span className="th-price">{PLAN_PRICE_LABEL[p]}</span>
                  {PLAN_SUB[p] && <span className="th-sub">{PLAN_SUB[p]}</span>}
                </div>
              ))}
            </div>

            {/* Fees group — TRANSACTION_ROWS from lib/plan-features.ts, one fact per cell. THE SAME
                CONSTANT Manage → Billing renders, so the two cannot state different fees again. */}
            <div className="cmp2-grp">Fees</div>
            {TRANSACTION_ROWS.map(row => (
              <div key={row.name} className="cmp2-row">
                <div className="cmp2-label">
                  <span className="f-name">{row.name}{row.footnote && <sup className="f-note">{row.footnote}</sup>}</span>
                </div>
                {TABLE_PLANS.map(p => (
                  <div key={p} className="cmp2-cell"><span className="val">{row.cells[p]}</span></div>
                ))}
              </div>
            ))}

            {/* Feature sections — from FEATURE_SECTIONS (name + detail + per-tier value; Trial = Max + pay-at-hatch) */}
            {FEATURE_SECTIONS.map(section => (
              <div key={section.title}>
                <div className="cmp2-grp">{section.title}</div>
                {visibleRows(section).map(row => (
                  <div key={row.name} className="cmp2-row">
                    <div className="cmp2-label">
                      {/* NAME_OVERRIDES and DETAIL_OVERRIDES are landing-only, exactly as the detail
                          override already was. `row.footnote` is deliberately NOT overridden: both
                          merged rows carried footnote 4, so it is already the right one. */}
                      <span className="f-name">{rowName(row)}{row.footnote && <sup className="f-note">{row.footnote}</sup>}</span>
                      {rowDetail(row) && <span className="f-desc">{rowDetail(row)}</span>}
                    </div>
                    {TABLE_PLANS.map(p => (
                      <div key={p} className="cmp2-cell">
                        <Cell value={p === 'trial' ? trialFeatureValue(row) : row[p as 'starter' | 'pro' | 'max']} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="fn">
            {FOOTNOTES.map(f => (
              <p key={f.number}><sup>{f.number}</sup> {FOOTNOTE_TEXT_OVERRIDES[f.number] ?? f.text}</p>
            ))}
          </div>
        </div>
      </section>

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
