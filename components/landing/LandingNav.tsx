// components/landing/LandingNav.tsx
// 🔴 THE LANDING'S NAV, EXTRACTED 23 August 2026 — MOVED, NOT REWRITTEN. Every element, class, href and
// comment below is byte-identical to what sat inline in app/landing/page.tsx; the only change is a
// uniform 4-space dedent, which JSX does not render. Do not "tidy" it here: this markup is tuned against
// landing.css at specific breakpoints and the comments inside record why.
//
// ── 🔴 IT MUST BE RENDERED INSIDE `.hg-landing` AND INSIDE A DemoModalProvider ─────────────────────
// Two dependencies that are invisible from this file and fatal if missed:
//   1. EVERY rule in app/landing/landing.css is scoped under `.hg-landing` (195 of 195). Outside that
//      wrapper this nav renders as unstyled markup — no height, no layout, no breakpoints. The wrapper
//      must also carry the three font CSS variables the stylesheet reads.
//   2. It contains <DemoCta>, whose useDemoModal() THROWS without <DemoModalProvider> above it. This is
//      a runtime error, not a silent fallback.
import { HEADER_BG } from '@/lib/brand'
import { HatchGrabWordmark } from '@/components/brand/HatchGrabWordmark'
import { DemoCta } from '@/components/landing/DemoUpload'

/**
 * An alternative nav CTA, for a page whose primary action is not the demo upload.
 *
 * ── 🔴 WHY A {label, href} PAIR AND NOT A ReactNode SLOT ────────────────────────────────────────────
 * A slot would be more flexible and would be the wrong trade here. The subtle part of this control is
 * not its CONTENT, it is its CHROME:
 *   • `btn btn-primary nav-cta` — three landing.css classes, one of which tightens the padding below
 *     640px (`.hg-landing .nav-cta { padding-inline: .9rem }`);
 *   • the TWO-SPAN structure. `.cta-short` is `display:none` by default and swaps places with
 *     `.cta-full` under the same media query, so the button can shed its arrow and shorten its wording
 *     on a phone. That is not decoration — the nav's own comment records that `.nav-r .btn` carries
 *     `white-space: nowrap` because "the CTA must never wrap the header", and the short label is what
 *     keeps it fitting at ~360px.
 * A ReactNode slot hands all of that to every caller, whose job becomes "remember four classes and a
 * span pair". ⚠️ THE FAILURE MODE IS SILENT AND VISUAL — a caller that forgets the short label gets a
 * nav that looks right on a laptop and wraps on a phone, which is exactly the class of bug nobody finds
 * until someone opens it on a phone.
 * ⚠️ WHAT THIS SHAPE CANNOT DO: express an arbitrary element. The DEFAULT is a <DemoCta> — a button that
 * opens a modal, not a link — which is why the default is a BRANCH below rather than a default VALUE of
 * this prop. If a THIRD caller ever needs a button rather than a link, make this a discriminated union
 * then; do not widen it now for a caller that does not exist.
 */
export interface NavCta {
  /** Desktop label. Include the arrow if you want one — the landing's own reads "Upload my menu →". */
  label: string
  /** Shown below 640px instead of `label`. Defaults to `label`. ⚠️ Supply a SHORTER one — see above. */
  shortLabel?: string
  href: string
}

// ⚠️ `cta` IS OPTIONAL AND ITS ABSENCE IS THE LANDING'S BEHAVIOUR, EXACTLY. Omitting it renders the
// <DemoCta> below with byte-identical markup and classes, so app/landing/page.tsx calls `<LandingNav />`
// unchanged and cannot regress. Do not "simplify" this by giving `cta` a default value: the default is a
// different ELEMENT, not a different value.
export function LandingNav({ cta }: { cta?: NavCta } = {}) {
  return (
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
        {cta ? (
          <a href={cta.href} className="btn btn-primary nav-cta">
            <span className="cta-full">{cta.label}</span>
            <span className="cta-short">{cta.shortLabel ?? cta.label}</span>
          </a>
        ) : (
          <DemoCta className="btn btn-primary nav-cta">
            <span className="cta-full">Upload my menu →</span>
            <span className="cta-short">Upload menu</span>
          </DemoCta>
        )}
      </div>
    </div>
  </nav>
  )
}
