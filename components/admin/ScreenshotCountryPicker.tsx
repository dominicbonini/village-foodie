'use client'
// components/admin/ScreenshotCountryPicker.tsx — "These screenshots are from" (Phase 2D-2 Part A,
// docs/schedules-country-report.md).
//
// 🔴 REQUIRED, AND IT FORGETS ITSELF. Until a country is chosen the drop zone is closed (the panel's one guard
// in add() refuses drop, pick and paste). The choice is kept in sessionStorage, so switching admin tab — which
// unmounts the panel — does not lose it, and it RESETS after 30 minutes without an upload, a decision or a
// change, so a session left open yesterday cannot quietly label today's screenshots. The reset time is shown in
// UK time ("Resets at 15:42 unless you upload again").
// The list is EVERY country we have settings for, switched on or not (the US is off for signups but its
// screenshots still feed outreach). Flags are small images from the server, never emoji.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type PickerCountry = { code: string; name: string; flag: string | null }

export const SCREENSHOT_COUNTRY_KEY = 'hg_screenshot_country'
export const SCREENSHOT_COUNTRY_IDLE_MS = 30 * 60 * 1000

type Stored = { code: string; at: number }

function readStored(): Stored | null {
  try {
    const raw = window.sessionStorage.getItem(SCREENSHOT_COUNTRY_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<Stored>
    if (typeof v?.code !== 'string' || !/^[A-Z]{2}$/.test(v.code) || typeof v.at !== 'number') return null
    return Date.now() - v.at < SCREENSHOT_COUNTRY_IDLE_MS ? { code: v.code, at: v.at } : null
  } catch { return null }
}
function writeStored(v: Stored | null) {
  try {
    if (v) window.sessionStorage.setItem(SCREENSHOT_COUNTRY_KEY, JSON.stringify(v))
    else window.sessionStorage.removeItem(SCREENSHOT_COUNTRY_KEY)
  } catch { /* storage blocked — the choice lasts for this view only */ }
}

/** "the United Kingdom", "the United States", "France". */
export function countryWithArticle(name: string): string {
  return /^(United |Netherlands|Philippines|Czech Republic|Dominican Republic|Bahamas|Gambia)/.test(name) ? `the ${name}` : name
}

/** HH:MM in UK time — the admin's clock, whatever the device's zone. */
export function ukClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
}

/** The chosen country and its idle reset. `touch()` is an upload, a decision or a change. */
export function useScreenshotCountry() {
  const [choice, setChoice] = useState<Stored | null>(null)
  const choiceRef = useRef<Stored | null>(null)
  useEffect(() => { choiceRef.current = choice }, [choice])

  // Read after mount: sessionStorage does not exist on the server.
  useEffect(() => {
    const t = setTimeout(() => setChoice(readStored()), 0)
    return () => clearTimeout(t)
  }, [])

  // The reset: checked every 15 seconds; an expired choice is cleared and the picker is required again.
  useEffect(() => {
    const t = setInterval(() => {
      const c = choiceRef.current
      if (c && Date.now() - c.at >= SCREENSHOT_COUNTRY_IDLE_MS) { writeStored(null); setChoice(null) }
    }, 15_000)
    return () => clearInterval(t)
  }, [])

  const choose = useCallback((code: string) => {
    const next = { code, at: Date.now() }
    writeStored(next); setChoice(next)
  }, [])
  const touch = useCallback(() => {
    const c = choiceRef.current
    if (!c) return
    const next = { code: c.code, at: Date.now() }
    writeStored(next); setChoice(next)
  }, [])

  return useMemo(() => ({ code: choice?.code ?? null, resetsAt: choice ? choice.at + SCREENSHOT_COUNTRY_IDLE_MS : null, choose, touch }), [choice, choose, touch])
}

const Chevron = () => (
  <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden="true" className="shrink-0"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
const Flag = ({ src }: { src: string | null }) => (src
  // eslint-disable-next-line @next/next/no-img-element
  ? <img src={src} alt="" width={21} height={14} className="block shrink-0 rounded-[2px] ring-1 ring-slate-200" />
  : <span aria-hidden="true" className="block h-[14px] w-[21px] shrink-0 rounded-[2px] bg-slate-200" />)

export default function ScreenshotCountryPicker({ countries, code, resetsAt, onChoose }: {
  countries: PickerCountry[]
  code: string | null
  resetsAt: number | null
  onChoose: (code: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const current = countries.find(c => c.code === code) ?? null

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key) }
  }, [open])

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2" data-country-picker>
      <span className="text-sm font-bold text-slate-900">These screenshots are from</span>
      <div ref={wrap} className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={current ? `Country: ${current.name}. Change country` : 'Choose a country'}
          className={`flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-bold ${
            current
              ? 'border border-slate-300 bg-white text-slate-900 hover:border-slate-400'
              : 'border-2 border-[#d97706] bg-[#fffbeb] text-amber-900'
          }`}
        >
          {current && <Flag src={current.flag} />}
          <span>{current ? current.name : 'Choose a country'}</span>
          <Chevron />
        </button>
        {open && (
          <ul role="listbox" aria-label="Country" className="absolute left-0 z-30 mt-1 max-h-72 min-w-[15rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            {countries.map(c => (
              <li key={c.code} role="option" aria-selected={c.code === code}>
                <button
                  type="button"
                  onClick={() => { onChoose(c.code); setOpen(false) }}
                  className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-slate-50 ${c.code === code ? 'font-bold text-slate-900' : 'text-slate-700'}`}
                >
                  <Flag src={c.flag} />
                  <span className="flex-1">{c.name}</span>
                  {c.code === code && (
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="text-orange-600"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </button>
              </li>
            ))}
            {countries.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Loading…</li>}
          </ul>
        )}
      </div>
      {current && resetsAt
        ? <span className="text-sm text-slate-500">Resets at {ukClock(resetsAt)} unless you upload again.</span>
        : <span className="text-sm font-semibold text-amber-700">Choose before uploading. It resets after 30 minutes without an upload.</span>}
    </div>
  )
}
