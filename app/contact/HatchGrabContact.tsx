// app/contact/HatchGrabContact.tsx
// THE HATCHGRAB VARIANT OF /contact. This is app/support/page.tsx's body, moved — not rewritten and
// not restyled. /support is deleted in the same change; this file is where it went.
//
// ── 🔴 WHY THIS IS A SEPARATE MODULE AND NOT A BRANCH INSIDE page.tsx ───────────────────────────────
// `import '../landing/landing.css'` and the three next/font faces below are MODULE-SCOPE side effects.
// Put them in page.tsx and Next.js emits their <link> tags for the whole route — including the
// VILLAGE FOODIE render, which must not gain a stylesheet it never had. Isolating them here lets
// page.tsx reach this module through a dynamic `await import()` on the HatchGrab branch only.
// ⚠️ THAT ISOLATION IS A MEASURED CLAIM, NOT AN ASSUMED ONE: villagefoodie.co.uk/contact was captured
// byte-for-byte before and after this change and diffed. See docs/contact-host-branding.md.
//
// ── ⚠️ IT LOOKS LIKE THE LANDING PAGE BY REUSING THE LANDING PAGE'S SHEET ──────────────────────────
// Same scoped stylesheet, same `.hg-landing` root, same fonts mapped to the same CSS vars, the same
// `HEADER_BG` nav, the same `.wrap` container, the same type scale. Matching by reusing the sheet
// rather than by re-describing it is what stops the two drifting. NO STYLE IS COPIED HERE.
//
// ── 🔴 NO VILLAGE FOODIE BRANDING ANYWHERE ON THIS RENDER ──────────────────────────────────────────
// The landing footer's "From the people behind Village Foodie" line is deliberately NOT carried
// across, exactly as it was not carried into /support. One brand on the page a reviewer opens.
import Script from 'next/script'
import { Suspense } from 'react'
import { Archivo, Public_Sans, Courier_Prime } from 'next/font/google'
import { HEADER_BG } from '@/lib/brand'
import { HatchGrabWordmark } from '@/components/brand/HatchGrabWordmark'
import { PRIVACY_PATH, TERMS_PATH } from '@/lib/legal'
import { ContactForm } from './ContactForm'
import '../landing/landing.css'

// The same three faces the landing page loads, mapped to the same CSS vars the stylesheet expects.
const archivo = Archivo({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-archivo', display: 'swap' })
const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' })
const courierPrime = Courier_Prime({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-courier-prime', display: 'swap' })

export function HatchGrabContact() {
  return (
    <div className={`hg-landing ${archivo.variable} ${publicSans.variable} ${courierPrime.variable}`}>
      <Script src="https://tally.so/widgets/embed.js" strategy="lazyOnload" />

      {/* ============ NAV ============ same slate bg, same fixed height, same container as /landing. */}
      <nav className={HEADER_BG}>
        <div className="nav-in">
          {/* ⚠️ THE WORDMARK DOES NOT LINK, DELIBERATELY. On this domain `/` is the landing behind an
              admin gate, and a non-admin who taps it is bounced straight back here. The landing page's
              own nav logo points at `#` for a related reason. Identity, not a control. */}
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

          {/* ── THE EMBED ─────────────────────────────────────────────────────────────────────────
              🔴 THE SAME FORM THE VILLAGE FOODIE RENDER USES — one component, one id, one set of
              parameters. /support hardcoded `topic=General%20Enquiry` into a static URL; this render
              instead accepts the SAME `topic`/`venue`/`truck` query parameters the other brand does,
              so a HatchGrab surface can pre-set a topic through the link rather than through a second
              copy of the embed. The landing footer's Contact link sends `topic=General%20Enquiry`,
              which is what /support pre-set and what Village Foodie's own footer link sends.
              ⚠️ AN EMPTY `topic` IS AN ALREADY-SHIPPING STATE, not a new one: every bare /contact link
              on villagefoodie.co.uk (the legal footer, LegalPage.tsx) has always sent one.
              ⚠️ `dynamicHeight=1` NEEDS tally.so/widgets/embed.js TO RESIZE THE FRAME. The script is
              loaded above, but the `minHeight` is what keeps the form usable if that script never
              arrives — the frame simply scrolls internally instead. A support page must not depend on
              a third-party script to be operable.
              ⚠️ `support-frame` IS NOT A RULE IN landing.css — grep returns nothing. It is carried over
              from /support unchanged rather than "tidied": the sizing is in the inline style beside it,
              and dropping a class that some future sheet may claim is not this change's business.
              ⚠️ THE <Suspense> BOUNDARY IS REQUIRED, not decorative — ContactForm reads useSearchParams,
              and without a boundary the whole route opts out of prerendering. /support needed none
              because its iframe was static. */}
          <Suspense fallback={<div className="lede">Loading form...</div>}>
            <ContactForm
              title="Contact HatchGrab support"
              height="700"
              className="support-frame"
              style={{ width: '100%', minHeight: '700px', border: 0 }}
            />
          </Suspense>

          {/* ── 🔴 A FALLBACK EMAIL ADDRESS WAS DRAFTED ON /support AND REMOVED. IT STAYS REMOVED. ───
              `hello@hatchgrab.com` is the obvious candidate, and lib/email-signup.ts:23 says in as many
              words that it is NOT usable yet: "⚠️ NOT LIVE YET. This mailbox must exist, and
              hatchgrab.com must be SPF/DKIM-verified in Brevo, before the first real send."
              lib/email-config.ts carries the matching TODO. Printing an address nobody has confirmed
              receives mail — on the page an App Store reviewer is told to use — is a label asserting a
              state nobody checked, which is the one thing this codebase's own rules forbid.
              The only address proven to work today is the villagefoodie.co.uk one, and this render must
              carry no Village Foodie branding.
              ⚠️ SO THE FORM IS THE ONLY CHANNEL, WHICH IS WHAT WAS ASKED FOR. Add a mailto here the day
              the mailbox is confirmed. */}
        </div>
      </section>

      {/* ============ FOOTER ============ */}
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
