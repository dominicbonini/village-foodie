// ── THE HATCHGRAB WORDMARK — THE REAL ASSET (V9.7) ──────────────────────────────────────────────────
// Was a TYPE + SVG APPROXIMATION: live "HATCH"/"Grab" text plus two inline SVG paths (a bolt and a
// swoosh), sized and coloured entirely by CSS scoped to `.hg-landing` in app/landing/landing.css.
// 🔴 THAT SCOPE WAS THE BUG. Of five call sites only the two on /landing were inside `.hg-landing`, so on
// /signup, /setup and every legal page the wordmark rendered with NO font, NO colour and NO size — and
// `variant` was inert, because the only rule it toggled lived in that stylesheet. Swapping to an image
// makes the component self-contained: it now carries its own size and its own colour, and works
// identically wherever it is mounted.
//
// ⚠️ PROP API IS UNCHANGED ON PURPOSE — same component name, same named-export shape, same `variant` /
// `className` props with the same defaults — so all five call sites compile untouched.
//
// ⚠️ PLAIN <img>, NOT next/image. The source is an SVG, and next/image would require
// `dangerouslyAllowSVG` in next.config, which is deliberately not enabled.
//
// ⚠️ SIZE IS EXPLICIT ON BOTH AXES so there is no layout shift. 127 × 32 preserves the optical size the
// landing page had: `.hg-landing .logo` was font-size 1.45rem = 23.2px; Archivo's cap height is 0.686em
// = 15.9px; in the pre-crop 1350 × 340 artwork "HATCH"'s cap measured 169px, so 15.9 × (340/169) = 32px
// tall and 32 × (1350/340) = 127px wide.
// ⚠️ THE ARTWORK WAS TIGHT-CROPPED on 30 July 2026 (viewBox "21 39 1287 283", ratio 4.548:1). WIDTH IS
// UNCHANGED at 127 — the glyphs are the same size, only the surrounding whitespace went — so the height
// attribute drops to 127 / 4.548 = 28. The wordmark renders the same optical size; the box is just
// no longer padded. Redo the derivation before changing either number.
//
// 🔴 `variant` IS NOW LOAD-BEARING — it used to be inert. "dark" means ON A DARK BACKGROUND and renders
// the WHITE wordmark; the default renders the navy one. Getting it wrong renders white-on-white, i.e.
// invisible. All five call sites were audited against their actual background before this change and all
// five were already correct — including /signup, where the logo sits inside a bg-white CARD even though
// the page behind it is dark. Check the immediate background, not the page.
import React from 'react'
import { HATCHGRAB_WORDMARK_SVG, HATCHGRAB_WORDMARK_WHITE_SVG } from '@/lib/brand'

export function HatchGrabWordmark({
  variant = 'light',
  className = '',
}: {
  variant?: 'light' | 'dark'
  className?: string
}) {
  return (
    <img
      src={variant === 'dark' ? HATCHGRAB_WORDMARK_WHITE_SVG : HATCHGRAB_WORDMARK_SVG}
      alt="HatchGrab"
      width={127}
      height={28}
      className={className}
    />
  )
}
