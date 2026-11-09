'use client'
// components/StickyTableHead.tsx — 🔴 THE ONE STICKY TABLE HEADER, for /features' plan table and the comparison pages (compare-ux-1,
// 8 November 2026; docs/compare-ux-1-report.md). Renders an empty, hidden <span> inside the table's box and:
//   • ALWAYS publishes the header's MEASURED height as a CSS variable on the box (`heightVar`), so anything that pins beneath the
//     header (the /features group headings) sits exactly under it — the measured-offset pattern PlanTableHeadHeight introduced;
//   • with `pin`, KEEPS THE HEADER UNDER THE SITE'S STICKY NAV while the page scrolls, even when the box scrolls SIDEWAYS. A box with
//     `overflow-x: auto` is a scroll container, so a CSS `position: sticky` header would stick to the box (which never scrolls up and
//     down) instead of the page — that is why the comparison table's header never stuck. Here the header row is moved down with a
//     transform by exactly the distance the page has scrolled past the box's top, clamped to the box, so ONE header (the real
//     <thead>, in the HTML for search and AI tools) scrolls sideways with its columns and stays visible. Where the box does not scroll
//     sideways (`overflow: visible`, e.g. the comparison page from 900px), CSS sticky does the job and nothing is moved;
//   • with `pin`, marks the box `data-overflows` while its content is wider than the box — the "Swipe sideways" hint keys off that.
// No layout shift: the transform moves the header only after the page has scrolled past the top of the table.
import { useEffect, useRef } from 'react'

export function StickyTableHead({ head, heightVar, pin = false }: {
  /** The header element inside the box: '.pt-head' (/features), 'thead' (comparison pages). */
  head: string
  /** The CSS variable that carries the header's height on the box. */
  heightVar: string
  /** Keep the header under the site's nav while the box scrolls sideways (comparison pages). */
  pin?: boolean
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const box = ref.current?.parentElement
    const el = box?.querySelector<HTMLElement>(head)
    if (!box || !el) return
    let offset = 0, raf = 0
    const publish = () => box.style.setProperty(heightVar, `${el.getBoundingClientRect().height}px`)
    const place = () => {
      raf = 0
      box.toggleAttribute('data-overflows', box.scrollWidth > box.clientWidth + 1)
      if (getComputedStyle(box).overflowX === 'visible') { if (offset) { offset = 0; el.style.transform = '' } return }
      // The site's sticky nav is the first <nav> of the landing chrome; its bottom edge is where the header must sit.
      const nav = document.querySelector('.hg-landing nav')?.getBoundingClientRect().bottom ?? 0
      const b = box.getBoundingClientRect(), h = el.getBoundingClientRect()
      const base = h.top - offset - b.top   // the header's own place in the box, without the transform
      const next = Math.round(Math.max(0, Math.min(nav - (b.top + base), b.height - base - h.height)))
      if (next !== offset) { offset = next; el.style.transform = next ? `translateY(${next}px)` : '' }
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(place) }
    publish()
    const ro = new ResizeObserver(() => { publish(); if (pin) schedule() })
    ro.observe(el)
    if (!pin) return () => ro.disconnect()
    ro.observe(box)
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => { ro.disconnect(); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); if (raf) cancelAnimationFrame(raf) }
  }, [head, heightVar, pin])
  return <span ref={ref} hidden />
}
