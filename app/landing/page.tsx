// HatchGrab landing page — HIDDEN preview route at /landing (noindex/nofollow).
// Root `/` is the live site, so this sits at a hidden path until it's ready to promote.
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
import {
  FEATURE_SECTIONS, PLAN_PRICES, PLAN_DESCRIPTIONS, PLAN_ALLOWANCES, FOOTNOTES,
  type FeatureValue,
} from '@/lib/plan-features'
import { PLAN_META } from '@/lib/features'
import './landing.css'

// Self-hosted, non-render-blocking (no Google Fonts <link>). Exposed as CSS vars the stylesheet maps
// to --display / --body / --ticket.
const archivo = Archivo({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-archivo', display: 'swap' })
const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' })
const courierPrime = Courier_Prime({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-courier-prime', display: 'swap' })

export const metadata: Metadata = {
  title: 'HatchGrab — The ordering system built for food trucks',
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

// Landing-only Fees rows — RENDER-ONLY. The shared TRANSACTION_ROWS (lib/plan-features.ts) is NOT modified;
// Manage → Billing / Admin keep their own version. One short fact per cell so each fits one line on mobile.
// Footnotes reuse the shared FOOTNOTES: 1 = walk-up terminal fees, 2 = Stripe/online-payment fees (0.99%).
const LANDING_FEE_ROWS: { name: string; footnote?: string; cells: Record<TablePlan, string> }[] = [
  { name: 'Walk-up orders',        footnote: '1', cells: { trial: '0%',        starter: '0%',           pro: '0%',     max: '0%'     } },
  { name: 'Online orders included', footnote: '2', cells: { trial: 'Unlimited', starter: '—',            pro: '£1,500', max: '£2,000' } },
  { name: 'Fee after that',        footnote: '2', cells: { trial: 'Free',      starter: 'Pay at Hatch', pro: '0.99%',  max: '0.99%'  } },
]

// RENDER-ONLY footnote text overrides for the landing table. The shared FOOTNOTES (lib/plan-features.ts) are
// NOT modified — Billing/Admin keep the original wording; only the landing table shows this text.
const FOOTNOTE_TEXT_OVERRIDES: Record<string, string> = {
  '2': 'Standard card processing fees apply to all online orders (currently 1.5% + 20p), including those within your allowance.',
}

// RENDER-ONLY feature-row description overrides for the landing table, keyed by row name. The shared
// FEATURE_SECTIONS details (lib/plan-features.ts) are NOT modified — Billing/Admin keep the original text.
const DETAIL_OVERRIDES: Record<string, string> = {
  'Offline Order Protection': "If you lose signal, online ordering pauses so customers can't place orders you won't see. The iPad app keeps you taking orders offline; the web dashboard needs a connection.",
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
    <div className={`hg-landing ${archivo.variable} ${publicSans.variable} ${courierPrime.variable}`}>

      {/* ============ NAV ============ (slate bg = HEADER_BG from lib/brand.ts) */}
      <nav className={HEADER_BG}>
        <div className="nav-in">
          <a href="#" className="nav-logo" aria-label="HatchGrab home">
            <HatchGrabWordmark variant="dark" />
          </a>
          <div className="nav-r">
            {/* Pricing + full Log in are hidden < 640px (CSS). A compact mobile-only Log in (nav-only-sm) sits to
                the LEFT of the CTA so small screens still get a login; the CTA drops its arrow on mobile to fit. */}
            <a href="#pricing" className="btn btn-quiet nav-hide-sm">Pricing</a>
            <a href="#" className="btn btn-ghost nav-hide-sm">Log in</a>
            <a href="#" className="btn btn-quiet nav-only-sm">Log in</a>
            <a href="#try" className="btn btn-primary nav-cta">
              <span className="cta-full">Upload my menu →</span>
              <span className="cta-short">Upload menu</span>
            </a>
          </div>
        </div>
      </nav>

      {/* ============ HERO ============ */}
      <header className="hero">
        <div className="wrap hero-grid">
          <div>
            <h1>The ordering system built for <span className="lean">food trucks.</span></h1>
            <p className="hero-tag">Spend less time booking.<br />More time <span className="lean">cooking!</span></p>
            {/* CTA row: button LEFT + text RIGHT on desktop (≥940px); stacked, full-width button + centred text on mobile. */}
            <div className="hero-cta-row">
              <a href="#try" className="btn btn-primary btn-lg">Upload my menu →</a>
              <div className="hero-cta-text">
                <b>Upload a photo of your menu. See it working in under 30 seconds.</b>
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
            <div className="does-item"><h3>Never type your schedule twice</h3><p>You already post your pitches to Facebook — send us that same photo, email it, or let us read it from your website. We fill your schedule in; you just review and confirm. No double-entry, no extra admin.</p></div>
            <div className="does-item"><h3>Works on any device</h3><p>Runs on the phone in your apron, the tablet on the counter, the laptop in the van — and the card machine you already take payment on.</p></div>
            <div className="does-item"><h3>Social media auto-replies</h3><p>“Where are you tonight?” “Do you do gluten free?” Your WhatsApp gets answered while you’re at the grill. Messenger and Instagram coming soon.</p></div>
            <div className="does-item"><h3>No signal? Keep serving.</h3><p>If you lose signal, online ordering pauses automatically so customers can’t place orders you won’t see. On the iPad app you carry on taking orders through the dead zone — the web dashboard needs a connection.</p></div>
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
          <p className="lede">Three things to sort — and the two that would eat your evening come from a photo.</p>
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
            <p className="lede">Pro is £29 a month with £1,500 of online orders included. Max is £49 with £2,000. Anything above that is 0.99%. Standard card processing fees apply to all online orders (currently 1.5% + 20p), including those within your allowance. Walk-ups are free on every plan, always.</p>
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
                <li>iPad kitchen app</li>
              </ul>
              <a href="#try" className="btn btn-ghost">Try Free</a>
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
                <li>WhatsApp auto-replies</li>
                <li>Messenger &amp; Instagram auto-replies <span className="soon-inline">Coming soon</span></li>
                <li>Offline order protection</li>
              </ul>
              <a href="#try" className="btn btn-primary">Try Free</a>
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
              </ul>
              <a href="#try" className="btn btn-ghost">Try Free</a>
            </div>
          </div>

          <div className="price-foot">
            <p>*Standard card processing fees apply to all online orders (currently 1.5% + 20p), including those within your allowance.</p>
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

            {/* Fees group — RENDER-ONLY landing rows (LANDING_FEE_ROWS), one fact per cell. Source
                lib/plan-features.ts is not modified. */}
            <div className="cmp2-grp">Fees</div>
            {LANDING_FEE_ROWS.map(row => (
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
          <svg className="truck" viewBox="0 0 260 132" aria-hidden="true">
            <rect x="22" y="42" width="144" height="52" rx="4" fill="#16314F" />
            <rect x="18" y="34" width="152" height="9" rx="3" fill="#EA580C" />
            <path d="M166 42 h20 l11 7 l15 17 v28 h-46 z" fill="#16314F" />
            <path d="M172 49 h13 l8 5 l10 12 h-31 z" fill="#F5F8FB" />
            <rect x="44" y="52" width="76" height="28" rx="2" fill="#FFFFFF" />
            <rect x="40" y="81" width="84" height="4" rx="2" fill="#EA580C" />
            <circle cx="62" cy="100" r="13" fill="#16314F" /><circle cx="62" cy="100" r="4.5" fill="#F5F8FB" />
            <circle cx="186" cy="100" r="13" fill="#16314F" /><circle cx="186" cy="100" r="4.5" fill="#F5F8FB" />
            <path d="M10 114 H250" stroke="#DDE5EE" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <h2>Want to see how easy setup is?</h2>
          <p className="lede">Upload a photo or screenshot of your menu and we’ll turn it into a working ordering page for you to have a play around with in about 30 seconds — your items, your prices. No sign-up, no card, nothing to install. Have a look, then decide.</p>
          <a href="#" className="btn btn-primary btn-lg">Upload my menu now →</a>
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
              <HatchGrabWordmark variant="dark" />
              <p className="foot-tag">The ordering system built for food trucks.</p>
            </div>
            <div className="foot-links">
              <a href="#pricing">Pricing</a>
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
              <a href="#">Contact</a>
              <a href="#">Log in</a>
            </div>
          </div>
          <div className="foot-base">
            <span>© 2026 HatchGrab</span>
            <span className="vf">From the people behind <b>Village Foodie</b></span>
          </div>
        </div>
      </footer>
    </div>
  )
}
