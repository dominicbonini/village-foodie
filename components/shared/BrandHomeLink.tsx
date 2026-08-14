// BrandHomeLink — ONE owner of the "live on the web, inert in the native shell" branch.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────────
// Five links to `/` or `/landing` are reachable inside the native shell, and each was solved
// separately: AppHeader evaluated isNativeApp() directly, the legal layout used a `mounted` two-pass,
// the dashboard's access-denied view got a third copy. Manual section 35 already flags three
// mechanisms answering one question as a break of the "one predicate per policy question" discipline.
// A fourth patch makes it worse. This component owns the branch; call sites declare intent only.
//
// 🔴 THE PROBLEM IT SOLVES IS REAL AND HAS BITTEN: inside a WebView there is no back button. A link
// to the marketing or consumer site threw an operator out of their dashboard with no way home, and
// `/` is the Village Foodie DISCOVERY MAP (app/page.tsx) — a different product, not a HatchGrab page.
//
// ⚠️ isNativeApp, NOT purchaseCtaAllowed. That is the 3.1.1 COMMERCE predicate; this is a 2.1
// completeness and native-UX question. Manual section 40 keeps the two separate deliberately — do not
// merge them, and do not extend the commerce predicate to cover this.
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { isNativeApp } from '@/lib/native/device'

/**
 * ── TWO NATIVE BEHAVIOURS, NOT ONE ───────────────────────────────────────────────────────────────
 * Manual section 27's 2.1 decision rule distinguishes them, and the distinction decides which:
 *
 *   'branding'  A bare wordmark or logo. In the app it renders unchanged but does not navigate.
 *               A non-clickable logo is normal in a native app — it reads as identity, not as a
 *               control, so nothing is offered that cannot be operated.
 *
 *   'control'   Anything with a back arrow or a back affordance. In the app it renders NOTHING.
 *               🔴 An inert control that still looks tappable is a 2.1 DEAD CONTROL, which is
 *               exactly what the completeness sweep cleared. Hiding it is the only honest option,
 *               because there is nowhere in-app for it to go.
 *
 * 🔴 THE CALLER DECLARES THIS EXPLICITLY. It is deliberately NOT inferred from the children: an
 * arrow is a glyph inside arbitrary markup, and a guess that reads "← Back" correctly today would
 * silently mis-classify the first call site whose affordance is an icon or a translated string.
 */
export type BrandHomeLinkKind = 'branding' | 'control'

export interface BrandHomeLinkProps {
  /** Where the link goes ON THE WEB. Unchanged by this component — it is passed straight to <Link>. */
  href: string
  /** See BrandHomeLinkKind. Required: there is no safe default between "show it" and "hide it". */
  kind: BrandHomeLinkKind
  /** Applied to the <Link> on the web, and to the non-navigating wrapper in the app unless
   *  `nativeClassName` overrides it. */
  className?: string
  /** Native-only class override, for call sites whose in-app wrapper legitimately drops
   *  interaction-only utilities (hover:*, transition-*). Defaults to `className`. */
  nativeClassName?: string
  /** aria-label for the web <Link>. */
  ariaLabel?: string
  /** aria-label for the native wrapper. Defaults to omitted — a non-interactive wrapper usually
   *  wants no label at all, and "…home" would describe navigation that no longer happens. */
  nativeAriaLabel?: string
  children?: React.ReactNode
}

export function BrandHomeLink({
  href,
  kind,
  className,
  nativeClassName,
  ariaLabel,
  nativeAriaLabel,
  children,
}: BrandHomeLinkProps) {
  // ── 🔴 THE `mounted` TWO-PASS IS REQUIRED, AND IT IS THE PATTERN PROVEN IN app/(legal)/layout.tsx ─
  // This component must be safe as the FIRST PAINT of a server-rendered tree, because some call
  // sites are exactly that (the legal pages, the contact page) with no loading gate in front of
  // them. Evaluating isNativeApp() inline would render <Link> on the server and something else on
  // the client's first frame inside the app — a hydration mismatch on pages an App Review opens.
  //
  // ⚠️ THE TWO-PASS IS ONLY FREE WHERE THE TWO BRANCHES ARE VISUALLY IDENTICAL, which is the
  // 'branding' case: same children, same classes, same size, differing only in whether a tap
  // navigates. Manual section 40 rejects a `mounted` flag for the manage page's commerce gates for
  // the opposite reason — there it would flash MISSING buttons on the web.
  // 🔴 IT IS NOT FREE FOR 'control', WHERE THE APP RENDERS NOTHING: the pre-mount pass paints the
  // control and the post-mount pass removes it, so the app shows it for at least one frame. That is
  // a smaller defect than a permanently inert control, but it is NOT nothing, and it is recorded
  // here rather than discovered later. See docs/brand-home-link-report.md.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const inApp = mounted && isNativeApp()

  if (inApp) {
    // 🔴 CONTROL: nothing at all. Not a disabled link, not a greyed span — nothing.
    if (kind === 'control') return null

    // BRANDING: the children, unchanged, in a wrapper that carries the same classes so layout is
    // untouched, and that cannot navigate. The wrapper is what makes "unwrapped from the <Link>"
    // survive a flex parent — dropping it would drop `shrink-0` and friends with it.
    return (
      <span className={nativeClassName ?? className} aria-label={nativeAriaLabel}>
        {children}
      </span>
    )
  }

  // ── WEB, AND THE PRE-MOUNT PASS EVERYWHERE ──────────────────────────────────────────────────────
  // ⚠️ WEB IS BYTE-IDENTICAL BY CONSTRUCTION: `mounted && isNativeApp()` is false on the server AND
  // on the first client frame, and isNativeApp() is `Capacitor.isNativePlatform()`, false in every
  // browser thereafter. So a browser renders this <Link> — the same element, same href, same
  // classes — forever. No route, no redirect and no href value is changed by this component.
  return (
    <Link href={href} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  )
}
