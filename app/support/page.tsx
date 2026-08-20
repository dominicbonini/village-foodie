// app/support/page.tsx
// The PUBLIC support page for hatchgrab.com. This is the Support URL given to App Store review.
//
// ── 🔴 WHY THIS IS NOT UNDER app/landing/ ───────────────────────────────────────────────────────────
// `app/landing/layout.tsx` is an ADMIN-ONLY GATE in production: `if (process.env.NODE_ENV === 'production'
// && !(await verifyAdmin())) redirect('/')`. A support page under that layout would redirect Apple's
// reviewer — who is not an admin — to the discovery map, and the Support URL would be dead on arrival.
// So this route sits at the top level, where nothing gates it.
// ⚠️ IT STILL LOOKS LIKE THE LANDING PAGE. It imports the SAME scoped stylesheet, wraps in the SAME
// `.hg-landing` root, and uses the same fonts, the same `HEADER_BG` nav, the same `.wrap` container and
// the same type scale. Matching by reusing the sheet rather than by re-describing it means the two
// cannot drift.
//
// ── 🔴 INDEXABLE, DELIBERATELY ──────────────────────────────────────────────────────────────────────
// `robots: { index: true, follow: true }` is set EXPLICITLY below. The landing page carries
// `index: false` because it is an unfinished preview; that reasoning does not transfer to a support
// page a reviewer must be able to open. Nothing else stands in the way: `vercel.json` scopes its
// `X-Robots-Tag: noindex` to `/api/(.*)` and `/trucks/(.*)`, neither of which matches `/support`.
//
// ── ⚠️ NO NEW FORM ──────────────────────────────────────────────────────────────────────────────────
// The Tally form is the EXISTING one, id `7R2Ra2`, the same form app/contact/page.tsx embeds. No fields
// are rebuilt and no second form is created. That page is untouched.
import type { Metadata } from 'next'
import Script from 'next/script'
import { Archivo, Public_Sans, Courier_Prime } from 'next/font/google'
import { HEADER_BG } from '@/lib/brand'
import { HatchGrabWordmark } from '@/components/brand/HatchGrabWordmark'
import { PRIVACY_PATH, TERMS_PATH } from '@/lib/legal'
import '../landing/landing.css'

// The same three faces the landing page loads, mapped to the same CSS vars the stylesheet expects.
const archivo = Archivo({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-archivo', display: 'swap' })
const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' })
const courierPrime = Courier_Prime({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-courier-prime', display: 'swap' })

export const metadata: Metadata = {
  title: 'Support — HatchGrab',
  description: 'Get help with HatchGrab. Send us a message and we will come back to you by email.',
  // 🔴 THE OPPOSITE OF THE LANDING PAGE, AND ON PURPOSE. See the header note.
  robots: { index: true, follow: true },
}

// 🔴 THE SAME EMBED THE VILLAGE FOODIE CONTACT PAGE USES, with the same form id and the same flags.
// `topic` is pre-set to the value the existing contact link already sends
// (`/contact?topic=General%20Enquiry`), so the form opens on a topic it is known to accept rather than
// on one invented here.
// ⚠️ `dynamicHeight=1` NEEDS tally.so/widgets/embed.js TO RESIZE THE FRAME. The script is loaded below,
// but the `minHeight` on the iframe is what makes the form usable if that script never arrives — the
// frame simply scrolls internally instead. A support page must not depend on a third-party script to be
// operable.
const TALLY_SRC =
  'https://tally.so/embed/7R2Ra2?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1&topic=General%20Enquiry'

export default function SupportPage() {
  return (
    <div className={`hg-landing ${archivo.variable} ${publicSans.variable} ${courierPrime.variable}`}>
      <Script src="https://tally.so/widgets/embed.js" strategy="lazyOnload" />

      {/* ============ NAV ============ same slate bg, same fixed height, same container as /landing. */}
      <nav className={HEADER_BG}>
        <div className="nav-in">
          {/* ⚠️ THE WORDMARK DOES NOT LINK, DELIBERATELY. On this domain `/` is the discovery map — a
              different product — and a reviewer who taps the logo expecting a marketing page and lands
              on a map has been sent somewhere confusing with no way back. The landing page's own nav
              logo points at `#` for a related reason. Identity, not a control. */}
          <span className="nav-logo" aria-label="HatchGrab">
            <HatchGrabWordmark variant="dark" className="h-8 w-auto sm:w-[168px] sm:h-auto" />
          </span>
          <div className="nav-r">
            <a href="/login" className="btn btn-ghost">Log in</a>
          </div>
        </div>
      </nav>

      <section>
        <div className="wrap">
          <p className="eyebrow">Support</p>
          {/* 🔴 THE COPY, TWO SENTENCES, IN THE LANDING'S VOICE — plain, second person, no marketing. */}
          <h1>How can we help?</h1>
          <p className="lede">
            Something not working, or a question about your account? Send us a message below and we
            will come back to you by email.
          </p>

          {/* The embed. `width="100%"` plus the wrap's own gutter is what makes this work on a phone —
              there is no fixed pixel width anywhere on this page. */}
          <iframe
            src={TALLY_SRC}
            loading="lazy"
            width="100%"
            height="700"
            frameBorder="0"
            title="Contact HatchGrab support"
            className="support-frame"
            style={{ width: '100%', minHeight: '700px', border: 0 }}
          />

          {/* ── 🔴 A FALLBACK EMAIL ADDRESS WAS DRAFTED HERE AND REMOVED. ─────────────────────────
              `hello@hatchgrab.com` is the obvious candidate, and lib/email-signup.ts:23 says in as many
              words that it is NOT usable yet: "⚠️ NOT LIVE YET. This mailbox must exist, and
              hatchgrab.com must be SPF/DKIM-verified in Brevo, before the first real send."
              lib/email-config.ts carries the matching TODO. Printing an address nobody has confirmed
              receives mail — on the page an App Store reviewer is told to use — is a label asserting a
              state nobody checked, which is the one thing this codebase's own rules forbid.
              The only address proven to work today is the villagefoodie.co.uk one, and this page must
              carry no Village Foodie branding.
              ⚠️ SO THE FORM IS THE ONLY CHANNEL, WHICH IS WHAT WAS ASKED FOR. Add a mailto here the day
              the mailbox is confirmed. */}
        </div>
      </section>

      {/* ============ FOOTER ============ 🔴 NO VILLAGE FOODIE BRANDING ANYWHERE ON THIS PAGE. The
          landing footer's "From the people behind Village Foodie" line is deliberately NOT carried
          across: this is the HatchGrab support page and a reviewer should see one brand on it. */}
      <footer className={HEADER_BG}>
        <div className="wrap">
          <div className="foot-links">
            <a href={PRIVACY_PATH}>Privacy</a>
            <a href={TERMS_PATH}>Terms</a>
          </div>
          <div className="foot-base">
            <span>© 2026 HatchGrab</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
