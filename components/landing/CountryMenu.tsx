'use client'
// components/landing/CountryMenu.tsx — the marketing pages' country button and its menu (Phase 2D-1).
//
// 🔴 TWO PLACES, ONE COMPONENT. In the header (laptop and up only — `.cc-head` is display:none below 1024px)
// it shows flag + short name + chevron; in the footer (every width) flag + full name + chevron. Each opens a
// small menu of the switched-on countries, the current one ticked.
// 🔴 THE PAGE ALREADY RENDERED IN THE RIGHT COUNTRY — on the server (lib/visitor-country.ts). Choosing one here
// keeps it in the hg_country cookie and asks the server for the page again; nothing is priced in the browser.
// Flags are small images (country-flag-icons SVGs as data URIs, from the server), never emoji.
import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { VISITOR_COUNTRY_COOKIE, VISITOR_COUNTRY_MAX_AGE, type VisitorCountryMenu } from '@/lib/visitor-country-types'

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
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const { current, options, remember } = menu

  // ?country=XX chose this page's country — keep it, so the next page (and the next visit) agrees.
  useEffect(() => { if (remember) keepCountry(remember) }, [remember])

  useEffect(() => {
    if (!open) return
    const first = wrap.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? wrap.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')
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
    if (url.searchParams.has('country')) { url.searchParams.delete('country'); router.replace(url.pathname + url.search + url.hash, { scroll: false }) }
    else router.refresh()
  }

  const moveFocus = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
  }

  return (
    <div ref={wrap} className={`cc ${variant === 'header' ? 'cc-head' : 'cc-foot'}`}>
      <button ref={button} type="button" className="cc-btn" aria-haspopup="menu" aria-expanded={open} aria-controls={listId}
        aria-label={`Country: ${current.name}. Change country`} onClick={() => setOpen(o => !o)}>
        <Flag src={current.flag} />
        <span className="cc-name">{variant === 'header' ? current.shortName : current.name}</span>
        <Chevron />
      </button>
      {open && (
        <ul id={listId} role="menu" aria-label="Country" className="cc-menu" onKeyDown={moveFocus}>
          {options.map(o => (
            <li key={o.code} role="none">
              <button type="button" role="menuitemradio" aria-checked={o.code === current.code} className="cc-item" onClick={() => choose(o.code)}>
                <Flag src={o.flag} />
                <span className="cc-item-name">{o.name}</span>
                {o.code === current.code && <Tick />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
