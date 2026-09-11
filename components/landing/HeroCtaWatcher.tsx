'use client'
// components/landing/HeroCtaWatcher.tsx
//
// 🔴 THE HEADER CTA'S MOBILE REVEAL — THE OBSERVER ONLY. IT RENDERS NOTHING AND STYLES NOTHING.
// It flips ONE attribute (`data-hero-cta`) on the `.hg-landing` root; every visual decision — which
// breakpoint, which opacity, which transition — lives in landing.css next to the nav rules it affects.
//
// 🔴 WHY THE INITIAL STATE IS NOT SET HERE. The button must be hidden in the FIRST PAINT, before any
// JavaScript runs, or it flashes on load. So "hidden" is the CSS DEFAULT (under `.hg-hero-watch`, a
// class the landing page renders on the server) and this component only ever turns it ON. If this file
// never loads, the header CTA simply stays hidden on mobile — see the no-IntersectionObserver branch,
// which deliberately fails OPEN rather than leaving the page with no header CTA at all.
//
// ⚠️ THE ROOT MARGIN IS THE NAV'S MEASURED HEIGHT, NOT A CONSTANT. The nav is `position: sticky; top: 0`
// and 72px tall, so an element that is "intersecting the viewport" by IntersectionObserver's default
// reckoning can be entirely BEHIND the nav and invisible. Shrinking the observation area by the nav's
// own height makes "out of view" mean "out of SIGHT", which is the moment the header CTA should take
// over. Measured from the element rather than read from `--nav-h` because rootMargin takes px or %, and
// `--nav-h` is in rem — one conversion is one place to desync.
import { useEffect } from 'react'

export function HeroCtaWatcher({ targetId }: { targetId: string }) {
  useEffect(() => {
    const target = document.getElementById(targetId)
    if (!target) return
    const root = target.closest('.hg-landing') as HTMLElement | null
    if (!root) return

    // Fail OPEN: no observer support ⇒ show the header CTA rather than hide it for the whole session.
    if (typeof IntersectionObserver === 'undefined') {
      root.setAttribute('data-hero-cta', 'gone')
      return
    }

    const nav = root.querySelector('nav')
    const navH = nav ? Math.round(nav.getBoundingClientRect().height) : 72

    const io = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          // `isIntersecting === false` at threshold 0 is exactly "no part of it is inside the observed
          // area" — the brief's "scrolled fully out of view", and it flips back the moment any of it
          // returns, which is the "hides again when the user scrolls back up" half.
          root.setAttribute('data-hero-cta', entry.isIntersecting ? 'here' : 'gone')
        }
      },
      { root: null, rootMargin: `-${navH}px 0px 0px 0px`, threshold: 0 },
    )
    io.observe(target)
    return () => {
      io.disconnect()
      root.removeAttribute('data-hero-cta')
    }
  }, [targetId])

  return null
}
