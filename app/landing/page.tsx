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
import { HEADER_BG } from '@/lib/brand'
import { HatchGrabWordmark } from '@/components/brand/HatchGrabWordmark'
import { DemoModalProvider, DemoCta, DemoModal } from '@/components/landing/DemoUpload'   // client children — the public demo entry point
import {
  FEATURE_SECTIONS, PLAN_PRICES, PLAN_DESCRIPTIONS, PLAN_ALLOWANCES, FOOTNOTES,
  CARD_FEE_ONLINE_LABEL, TRANSACTION_ROWS,
  type FeatureValue,
} from '@/lib/plan-features'
import { PLAN_META } from '@/lib/features'
import { PRIVACY_PATH, TERMS_PATH } from '@/lib/legal'
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
const TABLE_PLANS = ['trial', 'starter', 'pro', 'max'] as const
type TablePlan = (typeof TABLE_PLANS)[number]
const PLAN_SUB: Record<TablePlan, string> = { trial: '', starter: 'free forever', pro: 'per truck / month', max: 'per truck / month' }
// Trial column shows just "Free" (not "Free trial" + a sub) — keeps the sticky header compact.
const PLAN_PRICE_LABEL: Record<TablePlan, string> = { trial: 'Free', starter: PLAN_PRICES.starter, pro: PLAN_PRICES.pro, max: PLAN_PRICES.max }

// Trial mirrors Billing exactly: it includes everything Max has, and pay-at-hatch is always available. EXCEPT
// SMS order alerts — a paid add-on that isn't part of the free trial, so the Trial column shows "—" (not the
// Coming-soon marker Max/Pro carry).
function trialFeatureValue(row: { name: string; max: FeatureValue }): FeatureValue {
  if (row.name === 'Online ordering — Pay at Hatch') return true
  if (row.name === 'SMS order alerts') return false
  return row.max
}

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

// RENDER-ONLY feature-row description overrides for the landing table, keyed by row name. The shared
// FEATURE_SECTIONS details (lib/plan-features.ts) are NOT modified — Billing/Admin keep the original text.
const DETAIL_OVERRIDES: Record<string, string> = {
  'Offline Order Protection': "If you lose signal, online ordering pauses so customers can't place orders you won't see. The iPhone, iPad and Android app keeps you taking orders offline; the web dashboard needs a connection.",
}

// One shared cell renderer (mirrors Billing: ✓ / — / Coming soon) so the table cannot drift from the source's
// boolean|'coming_soon' values.
function Cell({ value }: { value: FeatureValue }) {
  if (value === true) return <span className="yes">✓</span>
  if (value === 'coming_soon') return <span className="soon">Coming soon</span>
  return <span className="no">—</span>
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
      <nav className={HEADER_BG}>
        <div className="nav-in">
          {/* ── LARGER WORDMARK IN THE NAV — DESKTOP ONLY (V9.7) ─────────────────────────────────────
              h-8 (32px) is the component's own default, so MOBILE IS BYTE-IDENTICAL to before.
              From 640px up, sm:w-[168px] + sm:h-auto gives 168px wide ≈ 42px tall.
              ⚠️ WIDTH is specified rather than height, deliberately: 168px matches the operator
              dashboard header's own wordmark width exactly, so the two surfaces agree on one number
              instead of two heights that happen to look similar.
              🔴 THE MOBILE FLOOR IS DELIBERATE, NOT TIMIDITY. Below 640px this nav is already tuned to
              its limit — see landing.css's @media(max-width:639px), whose own comment says the compact
              Log in + CTA are sized "so both fit ~360px with no wrap", and `.nav-r .btn` carries
              `white-space: nowrap` with the note "the CTA must never wrap the header". At 40px the logo
              would be ~168px wide and would eat the margin that keeps the CTA on one line.
              ⚠️ VERIFIED AT 640px, where nav-hide-sm brings Pricing + Log in back and the row is at its
              widest: gutters (2×25.6px) leave ~589px; logo 168 + nav-in gap 16 + nav-r (Pricing ~76 +
              Log in ~86 + CTA ~171 + 2×6.4 gap) ≈ 530px. ~59px spare, so the nowrap CTA is safe.
              640px is not an arbitrary breakpoint: it is the SAME one the nav already switches at, so the
              logo grows exactly when Pricing + Log in reappear and there is room for it.
              ⚠️ The nav cannot change height either way — `.hg-landing nav` is a fixed `height: var(--nav-h)`
              (4.5rem/72px) with align-items:center and NO vertical padding (.nav-in is `padding: 0 var(--gut)`),
              so 42px sits inside it with 15px clearance top and bottom.
              w-auto + the component's width/height attributes preserve the aspect ratio → no layout shift.
              Scoped to THIS call site only: the footer, /signup, /setup and legal pages stay at 127×32. */}
          <a href="#" className="nav-logo" aria-label="HatchGrab home">
            <HatchGrabWordmark variant="dark" className="h-8 w-auto sm:w-[168px] sm:h-auto" />
          </a>
          <div className="nav-r">
            {/* Pricing + full Log in are hidden < 640px (CSS). A compact mobile-only Log in (nav-only-sm) sits to
                the LEFT of the CTA so small screens still get a login; the CTA drops its arrow on mobile to fit.
                ⚠️ BOTH Log in links point at /login — the real page (app/login/page.tsx), not `#`. They are plain
                <a> like every other link on this page (no next/link is imported here), so it is a full navigation
                out of the landing route, which is what a login needs. */}
            <a href="#pricing" className="btn btn-quiet nav-hide-sm">Pricing</a>
            <a href="/login" className="btn btn-ghost nav-hide-sm">Log in</a>
            <a href="/login" className="btn btn-quiet nav-only-sm">Log in</a>
            <DemoCta className="btn btn-primary nav-cta">
              <span className="cta-full">Upload my menu →</span>
              <span className="cta-short">Upload menu</span>
            </DemoCta>
          </div>
        </div>
      </nav>

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

          {/* Screenshot fan — dashed PLACEHOLDER frames. DOMINIC: swap each .shot for a real <img> (tidy data,
              plausible names/items) when screenshots are ready. */}
          <div className="fan">
            <div className="shot shot-kds"><span className="lbl">Screenshot</span><span className="hint">Kitchen screen — tickets in cook order</span></div>
            <div className="shot shot-dash"><span className="lbl">Screenshot</span><span className="hint">Orders dashboard — realistic orders, capacity strip visible</span></div>
            <div className="shot shot-phone"><span className="lbl">Screenshot</span><span className="hint">Customer ordering</span></div>
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
            <div className="does-item"><h3>Never promise a time you can’t hit</h3><p>Set your kitchen’s capacity — how much you can cook at once, and how long it takes. Once a collection time is full, customers can’t pick it.</p></div>
            <div className="does-item"><h3>Works on any device</h3><p>Runs on the phone in your apron, the tablet on the counter, the laptop in the van — and the card machine you already take payment on.</p></div>
            <div className="does-item"><h3>Never type your schedule twice</h3><p>We read your schedule straight from your website — or send the photo you already post to Facebook. You just review and confirm.</p></div>
            {/* ⚠️ "driving to the pitch or at the grill" — NOT just "at the grill". On its own that is a
                generic busy-kitchen claim any hospitality product could make. DRIVING is specific to a food
                truck and is the moment an operator genuinely CANNOT reply, which is the whole point of the
                feature. Keeping both covers the two states a truck operator is actually in.
                🔴 THE MIXED TENSES ARE DELIBERATE. WhatsApp is PRESENT tense because it ships at launch;
                Messenger and Instagram carry "coming soon" because they may not. Same standing editorial
                rule as FOOTNOTES[3] in lib/plan-features.ts — the landing page describes the product AT
                LAUNCH — applied to two features with different readiness. It is NOT an inconsistency; do
                not "harmonise" the tenses. */}
            <div className="does-item"><h3>Social media auto-replies</h3><p>“Where are you tonight?” “Do you do gluten free?” Your WhatsApp gets answered while you’re driving to the pitch or at the grill. Messenger and Instagram coming soon.</p></div>
            <div className="does-item"><h3>No signal? Keep serving.</h3><p>If you lose signal, online ordering pauses automatically so customers can’t place orders you won’t see. Carry on taking orders with the iPhone, iPad and Android app.</p></div>
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
            <div className="step"><h3>Build your menu</h3><p>Photograph your board or paste it in. Items, prices and extras all come across on their own — you just check they’re right.</p></div>
            <div className="step"><h3>Add your schedule</h3><p>Got it on your website? We’ll read it from there and keep it up to date. If not, photograph that too. You just approve what it finds.</p></div>
            <div className="step"><h3>Share your link</h3><p>Post it on Facebook, stick the QR on the van. Orders land on your screen, in the order you need to cook them.</p></div>
          </div>
        </div>
      </section>

      {/* ============ TESTIMONIAL ============
          ⚠️⚠️ PLACEHOLDER — DO NOT PUBLISH. The quote below is INVENTED and Pizzeria Gusto have NOT given
          permission. This whole section must stay off any public/promoted build until Dominic has their
          actual words AND their consent. The logo is real (public/gusto-logo.png) but the attribution +
          award credit are unverified. */}
      <section className="quote-sec">
        <div className="wrap quote-in">
          <span className="quote-mark">“</span>
          <blockquote>Took orders all night and didn’t miss one. First Saturday in years I’ve not had a queue out the door.</blockquote>
          <div className="quote-by">
            <Image className="quote-logo" src="/gusto-logo.png" alt="Pizzeria Gusto" width={320} height={233} />
            <span className="quote-who">
              <span className="quote-name">Pizzeria Gusto</span>
              {/* ⚠️ Award wording UNVERIFIED (pending Gusto confirmation) — shown here only because /landing is
                  admin-gated. Layout is set with INLINE styles (not just .cred-* classes) so it renders
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
            <p className="lede">Name, time, what they want, and anything they’ve asked for — on your kitchen screen before they arrive. No note gets missed. Print it as well if you’d rather have paper in your hand.</p>
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
            <p className="lede">Pro is £29 a month with £1,500 of online orders included. Max is £49 with £2,000. Anything above that is 0.99%. Standard card processing fees apply to all online orders (currently {CARD_FEE_ONLINE_LABEL} on standard UK cards), including those within your allowance. Walk-ups carry no HatchGrab platform fee on any plan — your card terminal&apos;s own fees still apply.</p>
          </div>

          <div className="trial-banner">
            <strong>Your first month is completely free — every feature unlocked.</strong>
            <span>With Pay at Hatch, customers order ahead and pay when they collect, so you can take online orders without connecting a card processor at all. Prefer to take payment up front? Add online card payments any time — <b><u>adding online payments doesn’t start your subscription</u></b>. You’re only charged when you actively select a paid plan. We’ll never charge you without your clear permission. No card to start, cancel anytime.</span>
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
                <li>Take payment online</li>
                <li>Pre-orders &amp; collection times</li>
                <li>Smart slot management</li>
                <li>Auto-accept orders</li>
                <li>WhatsApp auto-replies (Messenger &amp; Instagram coming soon)</li>
                <li>Offline order protection</li>
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
                <li>Kitchen ticket printing</li>
                <li>Event &amp; festival pricing <span className="soon-inline">Coming soon</span></li>
                <li>Digital loyalty stamp cards <span className="soon-inline">Coming soon</span></li>
                <li>Order page on your own website <span className="soon-inline">Coming soon</span></li>
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
                {section.rows.map(row => (
                  <div key={row.name} className="cmp2-row">
                    <div className="cmp2-label">
                      <span className="f-name">{row.name}{row.footnote && <sup className="f-note">{row.footnote}</sup>}</span>
                      {(DETAIL_OVERRIDES[row.name] ?? row.detail) && <span className="f-desc">{DETAIL_OVERRIDES[row.name] ?? row.detail}</span>}
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
          <p className="lede">Upload a photo or screenshot of your menu and we’ll turn it into a working ordering page for you to have a play around with in under 60 seconds — your items, your prices. No sign-up, no card, nothing to install. Have a look, then decide.</p>
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
      <footer className={HEADER_BG}>
        <div className="wrap">
          <div className="foot-grid">
            <div>
              {/* `block` (live at every width — the reset does not touch `display`) puts the wordmark on
                  its own line instead of an inline baseline.
                  `foot-logo` is the CENTRING HOOK, and it is a CSS class rather than a Tailwind utility on
                  purpose: `.hg-landing * { margin: 0 }` in landing.css ties Tailwind's `mx-auto` on
                  specificity and wins on source order, so `mx-auto` here was silently doing NOTHING. The
                  rule lives in landing.css's existing @media(max-width:720px) block — mobile only, same
                  breakpoint that collapses .foot-grid, same margin-inline:auto mechanism as .foot-tag.
                  ⚠️ Desktop is untouched: above 720px no rule matches, so the wordmark keeps margin:0 and
                  stays left in its space-between column. */}
              <HatchGrabWordmark variant="dark" className="block foot-logo" />
              {/* Same slogan and same line break as the hero tagline (:148), so the two agree.
                  ⚠️ Deliberately WITHOUT the hero's `.lean` orange accent on "cooking." — the footer tag
                  is muted #8A93A6 by design and an orange word here was not asked for. */}
              <p className="foot-tag">Less time booking.<br />More time cooking.</p>
            </div>
            <div className="foot-links">
              <a href="#pricing">Pricing</a>
              <a href={PRIVACY_PATH}>Privacy</a>
              <a href={TERMS_PATH}>Terms</a>
              {/* 🔴 WAS `href="#"` — a control that went nowhere, then /support, which was deleted on
                  20 August 2026. Now /contact, which serves HatchGrab chrome on this host and is the
                  Support URL given to App Store review.
                  ⚠️ `?topic=General%20Enquiry` IS THE TOPIC /support HARDCODED into its embed URL, and
                  it is the same parameter Village Foodie's own footer Contact link sends
                  (components/Footer.tsx). Carried across so this link opens the form where it always
                  did rather than on an empty topic. */}
              <a href="/contact?topic=General%20Enquiry">Contact</a>
            </div>
          </div>
          {/* 🔴 THE APP LINE WAS REMOVED HERE — 18 August 2026, ON REQUEST. The footer no longer mentions
              the iPhone/iPad apps at all. The rule it used to satisfy still binds anything that brings it
              back: TEXT ONLY, NO APP STORE OR GOOGLE PLAY BADGE, NO LOGO, NO LINK — Apple's marketing
              guidelines require a badge to link to a LIVE listing and there is none yet — and "COMING
              SOON", NEVER "AVAILABLE".
              ⚠️ NOTHING ELSE IN THE FOOTER MOVED. `.foot-base` is a `space-between` flex row with no
              nth-child rule (landing.css:329), so the two remaining spans simply sit at the two ends. */}
          <div className="foot-base">
            <span>© 2026 HatchGrab</span>
            <span className="vf">From the people behind <b>Village Foodie</b></span>
          </div>
        </div>
      </footer>
      {/* Mounted ONCE — every DemoCta above drives this one instance. */}
      <DemoModal />
    </div>
    </DemoModalProvider>
  )
}
