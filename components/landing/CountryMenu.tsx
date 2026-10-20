'use client'
// components/landing/CountryMenu.tsx — the marketing pages' country button and its menu (Phase 2D-1).
//
// 🔴 TWO PLACES, ONE COMPONENT. In the header (laptop and up only — `.cc-head` is display:none below 1024px)
// it shows flag + short name + chevron; in the footer (every width) flag + full name + chevron. Each opens a
// small menu of the switched-on countries, the current one ticked.
// 🔴 THE PAGE ALREADY RENDERED IN THE RIGHT COUNTRY — on the server (lib/visitor-country.ts). Choosing one here
// keeps it in the hg_country cookie and asks the server for the page again; nothing is priced in the browser.
// Flags are small images (country-flag-icons SVGs as data URIs, from the server), never emoji.
// 🔴 seo-fixes M1 (20 October 2026, docs/seo-fixes-report.md): CRAWLABLE. Each option is a real <a href> to that
// country's equivalent page (switchCountryPath: /uk/features → /us/features; a page with no country address links to
// the country's landing page), and the menu is ALWAYS in the server-rendered HTML — closed, it is hidden by CSS
// (`.cc-menu-closed`), not absent. The click is unchanged: it keeps the cookie and navigates (the default navigation is
// prevented and the same router call as before runs). Only switched-on countries are options, so a switched-off
// country is never linked.
import { useEffect, useId, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { VISITOR_COUNTRY_COOKIE, VISITOR_COUNTRY_MAX_AGE, type VisitorCountryMenu } from '@/lib/visitor-country-types'
import { switchCountryPath, countryPagePath } from '@/lib/marketing-country'   // pure, client-safe: the country-address table
// Language Phase 1e: the button's and the menu's labels are `landingNav.country` messages.
import { useT } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/landingNav'

function keepCountry(code: string) {
  try {
    document.cookie = `${VISITOR_COUNTRY_COOKIE}=${encodeURIComponent(code)}; path=/; max-age=${VISITOR_COUNTRY_MAX_AGE}; samesite=lax`
  } catch { /* cookies blocked — the choice simply does not stick */ }
}

const Chevron = () => (
  <svg className="cc-chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
const Tick = () => (
  <svg className="cc-tick" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
const Flag = ({ src }: { src: string | null }) => (src
  // eslint-disable-next-line @next/next/no-img-element
  ? <img className="cc-flag" src={src} alt="" width={21} height={14} />
  : <span className="cc-flag cc-flag-none" aria-hidden="true" />)

export function CountryMenu({ menu, variant }: { menu: VisitorCountryMenu; variant: 'header' | 'footer' }) {
  const router = useRouter()
  // The page's own path — known on the server too, so every option's href is in the server-rendered HTML.
  const pathname = usePathname() ?? '/'
  const hrefOf = (code: string) => switchCountryPath(pathname, code) ?? countryPagePath(code, 'landing') ?? undefined
  const t = useT('landingNav')
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const { current, options, remember } = menu

  // ?country=XX chose this page's country — keep it, so the next page (and the next visit) agrees.
  useEffect(() => { if (remember) keepCountry(remember) }, [remember])

  useEffect(() => {
    if (!open) return
    const first = wrap.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? wrap.current?.querySelector<HTMLElement>('[role="menuitemradio"]')
    first?.focus()
    const away = (e: MouseEvent | TouchEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus() } }
    document.addEventListener('mousedown', away); document.addEventListener('touchstart', away); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('touchstart', away); document.removeEventListener('keydown', key) }
  }, [open])

  const choose = (code: string) => {
    setOpen(false)
    if (code === current.code) return
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

  const moveFocus = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
  }

  return (
    <div ref={wrap} className={`cc ${variant === 'header' ? 'cc-head' : 'cc-foot'}`}>
      <button ref={button} type="button" className="cc-btn" aria-haspopup="menu" aria-expanded={open} aria-controls={listId}
        aria-label={t('country.button', { name: current.name })} onClick={() => setOpen(o => !o)}>
        <Flag src={current.flag} />
        <span className="cc-name">{variant === 'header' ? current.shortName : current.name}</span>
        <Chevron />
      </button>
      {/* Always rendered (crawlable); closed = `.cc-menu-closed` (display:none — out of the layout, the tab order and the
          accessibility tree, exactly as when it was absent). */}
      <ul id={listId} role="menu" aria-label={t('country.menu')} className={`cc-menu${open ? '' : ' cc-menu-closed'}`} onKeyDown={moveFocus}>
        {options.map(o => (
          <li key={o.code} role="none">
            <a href={hrefOf(o.code)} role="menuitemradio" aria-checked={o.code === current.code} className="cc-item"
              onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); choose(o.code) }}>
              <Flag src={o.flag} />
              <span className="cc-item-name">{o.name}</span>
              {o.code === current.code && <Tick />}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
