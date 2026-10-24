'use client'
// components/landing/CountryMenu.tsx — the marketing footer's country picker (Phase 2D-1; country-picker-1).
//
// 🔴 country-picker-1 (23 October 2026, Dominic's approved mockup): A SMALL, QUIET TRIGGER — the current country's flag and
// two-letter code and a chevron ("GB ▾") — INLINE at the end of the footer's link row, in the links' muted colour. It
// opens ONE simple box: a modal dialog, centred over a dimmed page, titled "Choose your country", listing every
// switched-on country as flag + its name IN ITS OWN LANGUAGE ("Deutschland", "Ελλάδα") + its code, the current one
// ticked, sorted by the ENGLISH name so the order is the same for everyone. Three columns on a laptop (all 36 fit at
// 1512×945), two on a phone; the box scrolls inside itself when it must, the page behind never scrolls.
// Closes with ×, Escape, or a click/tap outside; focus moves into the box and returns to the trigger.
// 🔴 THE PAGE ALREADY RENDERED IN THE RIGHT COUNTRY — on the server (lib/visitor-country.ts). Choosing one here
// keeps it in the hg_country cookie and asks the server for the page again; nothing is priced in the browser.
// Flags are small images (country-flag-icons SVGs as data URIs, from the server), never emoji.
// 🔴 seo-fixes M1 (20 October 2026, docs/seo-fixes-report.md): CRAWLABLE. Each country is a real <a href> to that
// country's equivalent page (switchCountryPath: /uk/features → /us/features; a page with no country address links to
// the country's landing page), and the dialog is ALWAYS in the server-rendered HTML — closed, it is hidden by CSS
// (`.cc-dlg-closed`), not absent. The click is unchanged: it keeps the cookie and navigates (the default navigation is
// prevented and the same router call as before runs). Only switched-on countries are listed, so a switched-off
// country is never linked.
import { useEffect, useId, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { VISITOR_COUNTRY_COOKIE, VISITOR_COUNTRY_MAX_AGE, type VisitorCountryMenu } from '@/lib/visitor-country-types'
import { switchCountryPath, countryPagePath } from '@/lib/marketing-country'   // pure, client-safe: the country-address table
// Language Phase 1e: the trigger's and the box's words are `landingNav.country` messages. The × reuses the landing's own
// modal's "Close" (`demoUpload.close`), so the box adds only its title and subline.
import { useT } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/landingNav'
import '@/lib/i18n/catalog/demoUpload'

function keepCountry(code: string) {
  try {
    document.cookie = `${VISITOR_COUNTRY_COOKIE}=${encodeURIComponent(code)}; path=/; max-age=${VISITOR_COUNTRY_MAX_AGE}; samesite=lax`
  } catch { /* cookies blocked — the choice simply does not stick */ }
}

const Chevron = () => (
  <svg className="cc-chev" width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
const Tick = () => (
  <svg className="cc-tick" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
const Flag = ({ src }: { src: string | null }) => (src
  // eslint-disable-next-line @next/next/no-img-element
  ? <img className="cc-flag" src={src} alt="" width={21} height={14} />
  : <span className="cc-flag cc-flag-none" aria-hidden="true" />)

export function CountryMenu({ menu }: { menu: VisitorCountryMenu }) {
  const router = useRouter()
  // The page's own path — known on the server too, so every country's href is in the server-rendered HTML.
  const pathname = usePathname() ?? '/'
  const hrefOf = (code: string) => switchCountryPath(pathname, code) ?? countryPagePath(code, 'landing') ?? undefined
  const t = useT('landingNav')
  const tClose = useT('demoUpload')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const dialogId = useId()
  const titleId = useId()
  const { current, remember } = menu
  // Sorted by the ENGLISH name, so the list reads in the same order on every page and in every language.
  const options = [...menu.options].sort((a, b) => a.name.localeCompare(b.name, 'en'))

  // ?country=XX chose this page's country — keep it, so the next page (and the next visit) agrees.
  useEffect(() => { if (remember) keepCountry(remember) }, [remember])

  const close = () => { setOpen(false); button.current?.focus() }

  useEffect(() => {
    if (!open) return
    // Focus moves INTO the box — onto the box itself, so its title stays in view on a phone (Tab then reaches × and the
    // countries) — and the page behind stops scrolling.
    box.current?.focus({ preventScroll: true })
    const html = document.documentElement
    const was = html.style.overflow
    html.style.overflow = 'hidden'
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); button.current?.focus(); return }
      if (e.key !== 'Tab') return
      // Tab stays inside the box (aria-modal): from the last control back to the first, and the other way.
      const items = [...(box.current?.querySelectorAll<HTMLElement>('button, a[href]') ?? [])]
      if (!items.length) return
      const i = items.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus() }
      else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus() }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); html.style.overflow = was }
  }, [open])

  const choose = (code: string) => {
    setOpen(false)
    if (code === current.code) { button.current?.focus(); return }
    keepCountry(code)
    // A ?country on the URL would outrank the cookie, so it goes; anything else on the URL stays.
    const url = new URL(window.location.href)
    // 🔴 Language Phase 1e: on a COUNTRY address (/uk, /us/features, …) the choice goes to THE SAME PAGE in the
    // chosen country (/uk/features → /us/features), and the cookie above makes the router agree next time — a
    // visitor's choice always beats their location. Anywhere else (no country address) it behaves as before.
    const there = switchCountryPath(url.pathname, code)
    if (there) { url.searchParams.delete('country'); router.push(there + url.search + url.hash, { scroll: false }); return }
    if (url.searchParams.has('country')) { url.searchParams.delete('country'); router.replace(url.pathname + url.search + url.hash, { scroll: false }) }
    else router.refresh()
  }

  return (
    <span className="cc cc-foot">
      <button ref={button} type="button" className="cc-btn" aria-haspopup="dialog" aria-expanded={open} aria-controls={dialogId}
        aria-label={t('country.button', { name: current.ownName })} onClick={() => setOpen(true)}>
        <Flag src={current.flag} />
        <span className="cc-code">{current.code}</span>
        <Chevron />
      </button>
      {/* Always rendered (crawlable); closed = `.cc-dlg-closed` (display:none — out of the layout, the tab order and the
          accessibility tree). A press on the dimmed page outside the box closes it (its default is prevented, so focus goes
          back to the trigger rather than to the page). */}
      <div className={`cc-dlg${open ? '' : ' cc-dlg-closed'}`} onMouseDown={e => { if (e.target === e.currentTarget) { e.preventDefault(); close() } }}>
        <div ref={box} id={dialogId} role="dialog" aria-modal="true" aria-labelledby={titleId} className="cc-box" tabIndex={-1}>
          <button type="button" className="cc-x" aria-label={tClose('close')} onClick={close}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2 12 12M12 2 2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
          <h2 id={titleId} className="cc-title">{t('country.title')}</h2>
          <p className="cc-sub">{t('country.subline')}</p>
          {/* A labelled list, not a <nav>: landing.css styles `.hg-landing nav` as the page's top bar. */}
          <ul className="cc-list" aria-label={t('country.menu')}>
            {options.map(o => (
              <li key={o.code}>
                <a href={hrefOf(o.code)} lang={o.lang} aria-current={o.code === current.code ? 'true' : undefined} className="cc-item"
                  onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); choose(o.code) }}>
                  <Flag src={o.flag} />
                  <span className="cc-item-name">{o.ownName}</span>
                  <span className="cc-item-code">{o.code}</span>
                  <span className="cc-item-tick">{o.code === current.code && <Tick />}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </span>
  )
}
