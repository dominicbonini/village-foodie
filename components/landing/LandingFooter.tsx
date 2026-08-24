// components/landing/LandingFooter.tsx
// 🔴 THE LANDING'S FOOTER, EXTRACTED 23 August 2026 — MOVED, NOT REWRITTEN. Byte-identical to what sat
// inline in app/landing/page.tsx apart from a uniform 4-space dedent, which JSX does not render.
//
// ── 🔴 IT MUST BE RENDERED INSIDE `.hg-landing` ────────────────────────────────────────────────────
// Every rule in app/landing/landing.css is scoped under `.hg-landing` (195 of 195), and the wrapper must
// carry the three font CSS variables too. Outside it this is unstyled markup.
// ⚠️ Unlike the nav, this has NO client dependency — no DemoCta, no state. It is a plain server
// component and needs no provider.
import { HEADER_BG } from '@/lib/brand'
import { HatchGrabWordmark } from '@/components/brand/HatchGrabWordmark'
import { PRIVACY_PATH, TERMS_PATH } from '@/lib/legal'

// ⚠️ `landingHref` — see the long note in LandingNav.tsx for why this is a prop and not a hardcoded
// path. Default '' keeps the bare fragment, which is the landing's own behaviour and is byte-identical.
export function LandingFooter({ landingHref = '' }: { landingHref?: string } = {}) {
  return (
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
          <a href={`${landingHref}#pricing`}>Pricing</a>
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
  )
}
