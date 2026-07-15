// HatchGrab landing page — HIDDEN preview route at /landing (noindex/nofollow).
// Root `/` is the live site, so this sits at a hidden path until it's ready to promote.
// Self-contained: one route, a scoped stylesheet (./landing.css, all under `.hg-landing`),
// the wordmark component, and self-hosted fonts via next/font. Touches nothing else.
import type { Metadata } from 'next'
import { Archivo, Public_Sans, Courier_Prime } from 'next/font/google'
import { HEADER_BG } from '@/lib/brand'
import { HatchGrabWordmark } from '@/components/brand/HatchGrabWordmark'
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
            <a href="#pricing" className="btn btn-quiet">Pricing</a>
            <a href="#" className="btn btn-ghost">Log in</a>
            <a href="#try" className="btn btn-primary">Try free</a>
          </div>
        </div>
      </nav>

      {/* ============ HERO ============ */}
      <header className="hero">
        <div className="wrap hero-grid">
          <div>
            <h1>Spend less time booking.<br />More time <span className="lean">cooking</span>.</h1>
            <p className="hero-sub">The ordering system built for food trucks.</p>
            <div className="hero-cta">
              <a href="#try" className="btn btn-primary btn-lg">Try it free →</a>
              <span className="no-card"><strong>No payment details needed.</strong><br />Build your menu in seconds.</span>
            </div>
          </div>

          <div className="ticket-stage">
            {/* The signature: a real order ticket, rendered in CSS */}
            <div className="ticket" role="img" aria-label="An example order ticket: order 17, two Margheritas with no basil, one Pepperoni and dough balls, collection at 6.20pm, total £37.50.">
              <div className="t-head">
                <div className="t-no">#17</div>
                <div className="t-time">Collect <b>18:20</b></div>
              </div>
              <div className="t-line"><span>2 × Margherita</span><span>£20.00</span></div>
              <div className="t-note">no basil please</div>
              <div className="t-line"><span>1 × Pepperoni</span><span>£12.00</span></div>
              <div className="t-line"><span>1 × Dough Balls</span><span>£5.50</span></div>
              <hr className="t-rule" />
              <div className="t-total"><span>Total</span><span>£37.50</span></div>
              <div className="t-foot">Ordered ahead · Pay at the hatch</div>
            </div>
          </div>
        </div>
      </header>

      {/* ============ WHAT IT DOES ============ */}
      <section className="band">
        <div className="wrap">
          <p className="eyebrow">What it does</p>
          <h2>Built around a service, not a spreadsheet.</h2>
          <p className="lede">Everything here exists because a truck asked for it.</p>
          <div className="does">
            <div className="does-item">
              <h3>Customers order ahead</h3>
              <p>They pick a collection time and pay at the hatch, or online. No queue, no shouting over the fryer.</p>
            </div>
            <div className="does-item">
              <h3>The kitchen screen keeps up</h3>
              <p>Tickets appear in the order you need to cook them, not the order they came in.</p>
            </div>
            <div className="does-item">
              <h3>You never take more than you can cook</h3>
              <p>Tell it how many pizzas fit in the oven. It stops promising times you can&apos;t hit.</p>
            </div>
            <div className="does-item">
              <h3>Sold out in one tap</h3>
              <p>Down to your last few? It counts them down and takes the item off the menu on its own.</p>
            </div>
            <div className="does-item">
              <h3>Locals find you</h3>
              <p>Your pitches show on the Village Foodie map — the one villagers already check on a Friday.</p>
            </div>
            <div className="does-item">
              <h3>One person can run it</h3>
              <p>No terminal, no training day. It works on the phone in your apron.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section>
        <div className="wrap">
          <p className="eyebrow">Getting going</p>
          <h2>Set up before the kettle boils.</h2>
          <p className="lede">Three steps. You can do it all yourself, or send us your menu and we&apos;ll do it for you.</p>
          <div className="steps">
            <div className="step">
              <h3>Add where you&apos;ll be</h3>
              <p>Type in your pitches, or point us at the page where you post your schedule and we&apos;ll keep it up to date.</p>
            </div>
            <div className="step">
              <h3>Build your menu in seconds</h3>
              <p>Photograph your board or paste your menu in. It reads the lot — items, prices, extras — and you tidy anything it got wrong.</p>
            </div>
            <div className="step">
              <h3>Share your link</h3>
              <p>Stick the QR on the van. Orders land on your screen, in the order you need to cook them.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ============ SEE IT ============ */}
      <section className="band">
        <div className="wrap">
          <p className="eyebrow">See it</p>
          <h2>This is the whole thing.</h2>
          <p className="lede">No demo call, no salesperson. Have a look, then have a go.</p>
          {/* DOMINIC: drop real screenshots into these dashed boxes. Suggested: a tidied orders
              dashboard (plausible names/items, not test data) and the customer order page on a phone. */}
          <div className="shots">
            <div className="shot">
              <span className="lbl">Screenshot</span>
              <span className="hint">Orders dashboard — a few realistic orders, capacity strip visible</span>
            </div>
            <div className="shot">
              <span className="lbl">Screenshot</span>
              <span className="hint">Customer ordering on a phone</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ PRICING ============ */}
      <section id="pricing">
        <div className="wrap">
          <p className="eyebrow">Pricing</p>
          <h2>Free to start. Free while you&apos;re deciding.</h2>
          <p className="lede">Walk-up orders are always 0% — we don&apos;t take a cut of the food you sell at the hatch.</p>
          <div className="plans">
            <div className="plan">
              <div className="plan-name">Starter</div>
              <div className="plan-price">Free<span></span></div>
              <div className="plan-fee">0% on everything. Pay at the hatch.</div>
              <ul>
                <li>Walk-up orders &amp; kitchen screen</li>
                <li>Menu, deals &amp; extras</li>
                <li>Sold-out toggle &amp; stock countdown</li>
                <li>QR code ordering</li>
                <li>Village Foodie map listing</li>
              </ul>
              <a href="#try" className="btn btn-ghost">Start free</a>
            </div>

            <div className="plan hero-plan">
              <span className="plan-tag">Most trucks</span>
              <div className="plan-name">Pro</div>
              <div className="plan-price">£29<span> /month</span></div>
              <div className="plan-fee">0.99% + card fee on online orders only.</div>
              <ul>
                <li>Everything in Starter</li>
                <li>Take payment online</li>
                <li>Pre-orders &amp; collection times</li>
                <li>Smart pacing — never oversell the oven</li>
                <li>Auto-accept orders</li>
                <li>Reporting</li>
              </ul>
              <a href="#try" className="btn btn-primary">Try Pro free</a>
            </div>

            <div className="plan">
              <div className="plan-name">Max</div>
              <div className="plan-price">£49<span> /month</span></div>
              <div className="plan-fee">0.99% + card fee on online orders only.</div>
              <ul>
                <li>Everything in Pro</li>
                <li>WhatsApp auto-replies</li>
                <li>Kitchen ticket printing</li>
                <li>Multi-device kitchen sync</li>
                <li>Staff logins</li>
              </ul>
              <a href="#try" className="btn btn-ghost">Try Max free</a>
            </div>
          </div>
          <p className="plan-note">Every plan starts with a free trial. No card, cancel by doing nothing.</p>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section id="try" className="band">
        <div className="wrap final">
          <h2>Put your menu in and see for yourself.</h2>
          <p className="lede">Takes a couple of minutes. Nothing to install, no payment details, no call.</p>
          <a href="#" className="btn btn-primary btn-lg">Build my menu →</a>
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
