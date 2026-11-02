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
//
// ── 🔴 THE FORM IS HATCHGRAB'S OWN (contact-1, 2 November 2026; docs/contact-1-report.md) ────────────
// The Tally embed (and its script) left this render: ./HatchGrabContactForm.tsx posts to /api/contact, every word in the visitor's
// language. Village Foodie's render keeps Tally (page.tsx, ./ContactForm.tsx) — unchanged.
import { Archivo, Public_Sans, Courier_Prime } from 'next/font/google'
import { HEADER_BG } from '@/lib/brand'
import { HatchGrabWordmark } from '@/components/brand/HatchGrabWordmark'
import { legalPath, copyrightYear } from '@/lib/legal'
import { ABOUT_PATH } from '@/lib/about'
import { HatchGrabContactForm, type ContactFormWords } from './HatchGrabContactForm'
import { contactRenderToken } from '@/lib/contact-server'
import { CONTACT_LIMITS, CONTACT_TOPICS, type ContactTopic } from '@/lib/contact'
import { translatorFor } from '@/lib/i18n/translator'
import type { AppLocale } from '@/lib/i18n/locales'
import '@/lib/i18n/catalog/contactPage'
import '../landing/landing.css'
import './contact-form.css'

// The same three faces the landing page loads, mapped to the same CSS vars the stylesheet expects.
const archivo = Archivo({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-archivo', display: 'swap' })
const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' })
// seo-fixes S7 (20 October 2026): declared and loaded when used (--ticket), but NOT preloaded — nothing above the fold uses it.
const courierPrime = Courier_Prime({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-courier-prime', display: 'swap', preload: false })

// The support mailbox. An address, not a word: the same in every language, so it is not in messages.
const SUPPORT_EMAIL = 'hello@hatchgrab.com'

/** contact-1: the form's words, resolved here in the page's language — the limits as numbers in its own format, and the two error
 *  sentences with the support address filled in. Exported for scripts/contact-1-screens.cjs, which mounts the same form with them. */
export function contactFormWords(locale: AppLocale): ContactFormWords {
  const t = translatorFor(locale, 'contactPage')
  const L = CONTACT_LIMITS
  return {
    topicLabel: t('form.topicLabel'),
    topics: Object.fromEntries(CONTACT_TOPICS.map(id => [id, t(`form.topics.${id}`)])) as Record<ContactTopic, string>,
    nameLabel: t('form.nameLabel'), namePlaceholder: t('form.namePlaceholder'), emailLabel: t('form.emailLabel'),
    businessLabel: t('form.businessLabel'), optional: t('form.optional'), businessPlaceholder: t('form.businessPlaceholder'),
    messageLabel: t('form.messageLabel'), send: t('form.send'), sending: t('form.sending'),
    privacyLine: t('form.privacyLine'), privacyLink: t('form.privacyLink'), thanksTitle: t('form.thanksTitle'), thanksBody: t('form.thanksBody'),
    errors: {
      nameRequired: t('form.errors.nameRequired'), nameTooLong: t('form.errors.nameTooLong', { max: L.name }),
      emailRequired: t('form.errors.emailRequired'), emailInvalid: t('form.errors.emailInvalid'), emailTooLong: t('form.errors.emailTooLong', { max: L.email }),
      businessRequired: t('form.errors.businessRequired'), businessTooLong: t('form.errors.businessTooLong', { max: L.business }),
      messageTooShort: t('form.errors.messageTooShort', { min: L.messageMin }), messageTooLong: t('form.errors.messageTooLong', { max: L.messageMax }),
      topicInvalid: t('form.errors.topicInvalid'),
      rateLimited: t('form.errors.rateLimited', { email: SUPPORT_EMAIL }), failed: t('form.errors.failed', { email: SUPPORT_EMAIL }),
    },
  }
}

/** Language Phase 1e: the words are `contactPage`, in the visitor's country's language (page.tsx resolves it).
 *  contact-1: `topic` is the form's first choice (page.tsx maps ?topic=, lib/contact.ts topicFromParam). */
export function HatchGrabContact({ locale, country = null, topic = CONTACT_TOPICS[0] }: { locale: AppLocale; country?: string | null; topic?: ContactTopic }) {
  const t = translatorFor(locale, 'contactPage')
  return (
    <div className={`hg-landing ${archivo.variable} ${publicSans.variable} ${courierPrime.variable}`}>
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
            <a href="/login" className="btn btn-ghost">{t('logIn')}</a>
          </div>
        </div>
      </nav>

      <section>
        <div className="wrap">
          <p className="eyebrow">{t('eyebrow')}</p>
          {/* 🔴 THE COPY, TWO SENTENCES, IN THE LANDING'S VOICE — plain, second person, no marketing. */}
          <h1>{t('title')}</h1>
          <p className="lede">
            {t('lede')}
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
              🔴 THE COPY MUST NOT CLAIM BOTH ROUTES REACH THE SAME INBOX. It was written when the form was
              the third-party Tally embed, whose destination was set in Tally's dashboard and not knowable
              here (docs/support-page-contact-report.md 4). Since contact-1 the form emails the same support
              inbox (lib/contact-server.ts supportInbox) — but the copy was not asked to change, so it still
              says only that we reply by email. */}
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
              <h3>{t('emailUs')}</h3>
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
                <a href={`mailto:${SUPPORT_EMAIL}`} style={{ textDecoration: 'underline' }}>{SUPPORT_EMAIL}</a>
              </p>
            </div>
            <div className="does-item">
              {/* 🔴 NO DESCRIPTION UNDER THIS ONE, AND IT IS A MEASURED DECISION, NOT AN OMISSION.
                  At 320x568 (iPhone SE) every line here pushes the form further down, and the form is
                  the thing directly beneath the heading — it explains itself. A sentence saying "the
                  form is below" costs ~38px of a 568px viewport to say what the reader can already
                  see. See docs/support-page-contact-report.md 6 for the before/after numbers. */}
              <h3>{t('formHeading')}</h3>
            </div>
          </div>

          {/* ── 🔴 THE FORM (contact-1) ── HatchGrab's own: ./HatchGrabContactForm.tsx → /api/contact. It replaced the Tally embed
              (form 7R2Ra2), which stays on Village Foodie only. ?topic= links pick the first topic unless they name one of the form's
              own (page.tsx); ?venue= and ?truck= are Village Foodie's and are ignored here. The privacy line links the visitor's own
              language's Privacy Policy (legalPath, as the footer does). The render timestamp is signed on the server
              (lib/contact-server.ts contactRenderToken) for the "under 3 seconds is a bot" check. */}
          <HatchGrabContactForm
            words={contactFormWords(locale)}
            initialTopic={topic}
            rendered={contactRenderToken(new Date())}
            country={country}
            locale={locale}
            privacyHref={legalPath('privacy', { country, locale })}
          />

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
            {/* legal-languages-1: the documents in the visitor's language (English pages: /privacy, /terms, as before). */}
            <a href={legalPath('privacy', { country, locale })}>{t('privacy')}</a>
            <a href={legalPath('terms', { country, locale })}>{t('terms')}</a>
            {/* about-page (22 October 2026): this footer is HatchGrab's only (Village Foodie's /contact has its own). */}
            <a href={ABOUT_PATH}>{t('about')}</a>
          </div>
          <div className="foot-base">
            <span>{t('copyright', { year: copyrightYear() })}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
