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
            Something not working, or a question about your account? Two ways to reach us — either
            way we will come back to you by email.
          </p>

          {/* ── 🔴 THE TWO WAYS TO GET IN TOUCH, ABOVE THE FORM (2 September 2026) ─────────────────
              WHAT MOVED: the email address was the LAST thing on the page, under the form, reading
              "Or just email us at hello@hatchgrab.com" — an afterthought. It is now one of two options
              offered before the form, and the form sits beneath them.
              🟢 NO NEW CSS, AND THAT IS DELIBERATE. `.does` / `.does-item` are the landing sheet's
              existing two-up pattern (landing.css:247-251) — one column, and two at >=760px. Reusing
              them keeps this page matching the landing by SHARING its rules rather than by describing
              them again, which is the whole reason this file imports that sheet.
              ⚠️ THE INLINE marginBottom IS NOT LAZINESS. `.hg-landing * { margin: 0 }` (landing.css:77)
              beats a Tailwind `mb-*` utility on source order — the same trap the footer wordmark hit,
              where an `mx-auto` was silently doing nothing. An inline style is the one thing that wins
              without adding a rule to a stylesheet this task must not touch. 1.5rem rather than `.lede`'s 2.6rem: measured at
              320x568, every pixel here is one the form loses. See the report's 6.
              🔴 THE COPY MUST NOT CLAIM BOTH ROUTES REACH THE SAME INBOX. The form is a THIRD-PARTY
              Tally embed (ContactForm.tsx:44, form id 7R2Ra2); where Tally forwards a submission is set
              in Tally's dashboard and is NOT knowable from this repository. Saying "both reach the same
              place" would be asserting something unverified about where a customer's message goes.
              See docs/support-page-contact-report.md 4. */}
          {/* 🔴 ONE COLUMN AT EVERY WIDTH — `gridTemplateColumns: '1fr'` OVERRIDES `.does`.
              `.does` goes two-up at >=760px (landing.css:248), and on a laptop that put "Or fill in the
              form below" in the RIGHT column while the form itself starts full-width on the LEFT. The
              heading pointed at empty space and the form began under "Email us" instead. Reported by
              Dominic 2 September 2026: "when viewed on laptop the fill in the form below isnt aligned
              with the form below."
              🟢 STACKING FIXES IT BY CONSTRUCTION: the second option is the last thing before the form
              and shares its left edge, so the heading and the thing it names line up at every width.
              ⚠️ INLINE rather than a new rule, because landing.css is shared with the landing page and
              is outside this page's remit. An inline style beats a media-query rule on specificity,
              which a Tailwind utility here would not — see the `* { margin: 0 }` note below. */}
          <div className="does" style={{ gridTemplateColumns: '1fr', marginBottom: '1.5rem' }}>
            <div className="does-item">
              <h3>Email us</h3>
              <p>
                {/* ⚠️ ALREADY A mailto BEFORE THIS CHANGE — carried across unchanged, not newly added.
                    No `?subject=` is prefilled; see the report for the recommendation and why it is
                    not being decided here. */}
                {/* 🔴 UNDERLINED, AND IT IS A FIX FOR A MEASURED DEFECT — NOT DECORATION.
                    `.hg-landing a { color: inherit }` (landing.css:78) and no default underline mean
                    this link rendered in EXACTLY the same colour as the sentence around it, with no
                    decoration: computed rgb(95,122,153) for both, textDecorationLine "none". It did
                    not look clickable. That mattered less when it was a throwaway line under the
                    form; it matters a lot now it is one of the two things this page offers.
                    ⚠️ INLINE, because the fix must not add a rule to landing.css — that sheet is
                    shared with the landing page and is outside this task. */}
                <a href="mailto:hello@hatchgrab.com" style={{ textDecoration: 'underline' }}>hello@hatchgrab.com</a>
              </p>
            </div>
            <div className="does-item">
              {/* 🔴 NO DESCRIPTION UNDER THIS ONE, AND IT IS A MEASURED DECISION, NOT AN OMISSION.
                  At 320x568 (iPhone SE) every line here pushes the form further down, and the form is
                  the thing directly beneath the heading — it explains itself. A sentence saying "the
                  form is below" costs ~38px of a 568px viewport to say what the reader can already
                  see. See docs/support-page-contact-report.md 6 for the before/after numbers. */}
              <h3>Or fill in the form below</h3>
            </div>
          </div>

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

          {/* 🔴 THE TRAILING "Or just email us at ..." PARAGRAPH WAS HERE AND IS GONE — MOVED, NOT
              DELETED. It now sits above the form as the "Email us" option; the address itself is
              unchanged and was already a mailto. Its original note is preserved verbatim below,
              because the reasoning is still the reasoning.
              ⚠️ THE `mt-6` IT CARRIED WAS PROBABLY INERT ANYWAY — `.hg-landing * { margin: 0 }`
              (landing.css:77) beats a Tailwind margin utility on source order.
              ── THE ORIGINAL NOTE, LEFT INTACT AS THE RECORD ──────────────────────────────────────
              THE EMAIL ADDRESS IS BACK, BY OPERATOR DECISION (25 August 2026). READ THIS BEFORE
              CHANGING IT. This block previously said the address STAYS REMOVED, and gave the reason:
              on 10 August `lib/email-signup.ts` recorded "NOT LIVE YET. This mailbox must exist, and
              hatchgrab.com must be SPF/DKIM-verified in Brevo, before the first real send," and
              `lib/email-config.ts` still carries the matching TODO.
              🟢 THAT CONCERN IS NOW ANSWERED, AND NOT BY THIS FILE: docs/reference-manual.md:20761
              records `privacy@hatchgrab.com` and `hello@hatchgrab.com` as "LIVE AND TESTED as
              receiving". lib/email-signup.ts:23 still carries the stale "NOT LIVE YET" comment; it is
              OUT OF SCOPE for this change and is reported rather than edited.
              ⚠️ THE STAKE IS UNCHANGED: this is the Support URL given to App Store review. If the
              mailbox does not receive, a reviewer's message goes nowhere.
              ⚠️ HATCHGRAB RENDER ONLY. Deliberately NOT on the Village Foodie branch of
              app/contact/page.tsx — a hatchgrab.com address there is the branding leak this split
              exists to remove. */}
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
