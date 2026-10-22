'use client'
// components/setup/WhereBasedStep.tsx — "Where's your truck based?" (Phase 2D-1), and the town box it shares
// with Manage › Settings › Where you trade.
//
// 🔴 THE FIRST SIGNUP STEP, ON BOTH SIGNUP PATHS (the demo modal's wizard and /setup), BEFORE ANY PHONE FIELD —
// the country it settles decides the phone rule and wording, the currency, the prices and the zone.
// It asks three things: the country, the town or city, and the time zone (only when the country has more than
// one). How far the truck travels is NOT asked (removed 10 October 2026, docs/remove-travel-distance-report.md).
// The countries come from /api/setup/countries (switched-on only; names, zones, phone copy, flag)
// — never a settings row. Checking uses lib/trade-area.ts, the SAME function the server runs.
// Town suggestions come from /api/places/suggest and /details (server-side Google Places); when they cannot (no key, an error,
// a limit) the box simply takes what is typed. Nothing here can block a signup.
import { useEffect, useRef, useState } from 'react'
import type { SignupCountry } from '@/lib/signup-country-types'
import { checkTradeArea, TRADE_AREA_ERRORS, type TradeAreaRefusal } from '@/lib/trade-area'
import '@/lib/i18n/catalog/whereYouTrade'
import { useT } from '@/lib/i18n/use-t'
import { addressFormatKeyOf, addressFormatOrDefault, fieldOf, type LocalityLabel } from '@/lib/address-formats'
import '@/lib/i18n/catalog/address'
import '@/lib/i18n/catalog/whereBased'
import '@/lib/i18n/catalog/tradeArea'
import { errorText } from '@/lib/i18n/customer-errors'
import '@/lib/i18n/catalog/errorsOnboarding'

export interface BasePlace {
  placeId: string | null; name: string; region: string | null; lat: number | null; lng: number | null
  /** D22 (Phase 3): the state's code — present only when Places gave a 'zip_state' answer. */
  regionCode?: string | null
}
export interface BaseAnswer { country: string; timezone: string; place: BasePlace }
/** Language Phase 1d: each problem is lib/trade-area.ts's code and values; the step renders its words (`tradeArea`). */
export type BaseErrors = Partial<Record<'country' | 'timezone' | 'town', TradeAreaRefusal>>

const EMPTY_PLACE: BasePlace = { placeId: null, name: '', region: null, lat: null, lng: null }

/** The device's zone when the country offers it, else the country's default. */
export function zoneFor(c: SignupCountry): string {
  let device = ''
  try { device = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { /* no Intl zone */ }
  return c.timezones.includes(device) ? device : c.defaultTimezone
}

export function initialBaseAnswer(countries: SignupCountry[], guess: string): BaseAnswer {
  const c = countries.find(x => x.code === guess) ?? countries[0]
  return { country: c?.code ?? guess, timezone: c ? zoneFor(c) : '', place: EMPTY_PLACE }
}

/** The stored column names the server expects for the answer (create_truck / update_trade_area). */
export function baseAnswerBody(a: BaseAnswer) {
  return {
    country: a.country, timezone: a.timezone,
    base_place_id: a.place.placeId, base_place_name: a.place.name.trim(), base_region: a.place.region,
    base_lat: a.place.lat, base_lng: a.place.lng,
    // D22: only when the picked place carries one ('zip_state' countries) — a GB body is unchanged.
    ...(a.place.regionCode !== undefined ? { base_region_code: a.place.regionCode } : {}),
  }
}

/** Every problem at once, in the server's own words. */
export function baseAnswerErrors(a: BaseAnswer, countries: SignupCountry[]): BaseErrors {
  const c = countries.find(x => x.code === a.country)
  if (!c) return { country: TRADE_AREA_ERRORS.noCountry }
  // canada-1 (22 October 2026): the country's address format too, so a town in a region closed to signups (Quebec) is refused
  // here, in the step, in the same words as the server (lib/trade-area.ts `region_closed`).
  const facts = { countryCode: c.code, name: c.name, enabled: true, timezones: c.timezones, defaultTimezone: c.defaultTimezone, addressFormat: addressFormatKeyOf(c.addressFormat) ?? undefined }
  const errs: BaseErrors = {}
  if (!c.timezones.includes(a.timezone)) errs.timezone = TRADE_AREA_ERRORS.zone(c.name)
  if (!a.place.name.trim()) errs.town = TRADE_AREA_ERRORS.noTown
  else if (a.place.name.trim().length > 120) errs.town = TRADE_AREA_ERRORS.townTooLong
  if (Object.keys(errs).length === 0) {
    const r = checkTradeArea(baseAnswerBody(a), facts)
    if (r.ok === false) errs.town = { code: r.code, params: r.params }
  }
  return errs
}

/** The switched-on countries and the guess, for a signup surface. Fetched once `enabled` turns true (the
 *  demo modal waits until the wizard is entered, so a demo page view costs no request). */
export function useSignupCountries(enabled = true) {
  const t = useT('whereBased')
  const tErr = useT('errorsOnboarding')
  const [state, setState] = useState<{ countries: SignupCountry[]; guess: { code: string; fromLocation: boolean } } | null>(null)
  // Language Phase 1c: set inside the effect, so it holds the server's own words or null — the render supplies
  // ours (`whereBased.countriesFailed`), in the language of the moment.
  // US polish batch (19 October 2026): it now holds the server's BODY, so the render words it from its code
  // (errorsOnboarding) in the language of the moment, its English `error` the fallback.
  // (A plain string — the server's words as they came — still reads as it always did.)
  const [error, setError] = useState<{ server: string | { error?: unknown; code?: unknown; params?: unknown } | null } | null>(null)
  useEffect(() => {
    if (!enabled || state) return
    let cancelled = false
    fetch('/api/setup/countries').then(r => r.json()).then(d => {
      if (cancelled) return
      if (d?.ok && Array.isArray(d.countries) && d.countries.length) setState({ countries: d.countries, guess: d.guess })
      else setError({ server: d ?? null })
    }).catch(() => { if (!cancelled) setError({ server: null }) })
    return () => { cancelled = true }
  }, [enabled, state])
  return { data: state, error: error ? (typeof error.server === 'string' ? (error.server || t('countriesFailed')) : errorText(tErr, error.server, t('countriesFailed'))) : null }
}

const newSession = () => { try { return crypto.randomUUID() } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}` } }

const LABEL = 'text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1'
const BOX = 'w-full border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white'

/** The town or city box with suggestions — shared by the signup step and Manage › Where you trade. */
export function TownInput({ id, country, value, onChange, onCommit, invalid }: {
  id: string; country: string; value: BasePlace; onChange: (p: BasePlace) => void
  /** Settings saves here: on leaving the box, and once a picked suggestion's details are in. */
  onCommit?: (p: BasePlace) => void; invalid?: boolean
}) {
  const [suggestions, setSuggestions] = useState<{ placeId: string; name: string; detail: string }[]>([])
  const [open, setOpen] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const sessionRef = useRef<{ country: string; token: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef('')
  // One billing session per search, and a new one whenever the country changes (read in handlers only).
  const session = () => {
    if (!sessionRef.current || sessionRef.current.country !== country) sessionRef.current = { country, token: newSession() }
    return sessionRef.current.token
  }
  const endSession = () => { sessionRef.current = null }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  // A new country is a new search area: what was found for the old one does not apply. Reset while rendering
  // (React's pattern for state that follows a prop), not in an effect.
  const [searchedIn, setSearchedIn] = useState(country)
  if (searchedIn !== country) { setSearchedIn(country); setSuggestions([]); setOpen(false); setUnavailable(false) }

  const ask = (q: string) => {
    if (timer.current) clearTimeout(timer.current)
    if (unavailable || q.trim().length < 2) { setSuggestions([]); return }
    timer.current = setTimeout(async () => {
      latest.current = q
      try {
        const r = await fetch(`/api/places/suggest?q=${encodeURIComponent(q)}&country=${encodeURIComponent(country)}&session=${session()}`)
        const d = await r.json()
        if (latest.current !== q) return
        if (d?.state === 'ok') { setSuggestions(d.suggestions ?? []); setOpen(true) } else { setUnavailable(true); setSuggestions([]) }
      } catch { setUnavailable(true); setSuggestions([]) }
    }, 250)
  }

  const pick = async (s: { placeId: string; name: string }) => {
    setOpen(false); setSuggestions([])
    let picked: BasePlace = { placeId: null, name: s.name, region: null, lat: null, lng: null }
    onChange(picked)
    try {
      const r = await fetch(`/api/places/details?id=${encodeURIComponent(s.placeId)}&country=${encodeURIComponent(country)}&session=${session()}`)
      const d = await r.json()
      if (d?.state === 'ok' && d.place) {
        picked = { placeId: d.place.placeId, name: d.place.name, region: d.place.region, lat: d.place.lat, lng: d.place.lng,
          ...(d.place.regionCode !== undefined ? { regionCode: d.place.regionCode } : {}) }
        onChange(picked)
      }
    } catch { /* kept as typed — the name is what matters */ }
    endSession()   // the pick ends this search's billing session
    onCommit?.(picked)
  }

  return (
    <div className="relative">
      <input id={id} type="text" autoComplete="off" value={value.name} maxLength={120}
        role="combobox" aria-expanded={open && suggestions.length > 0} aria-controls={`${id}-list`} aria-autocomplete="list"
        onChange={e => { onChange({ ...EMPTY_PLACE, name: e.target.value }); ask(e.target.value) }}
        onBlur={() => { setTimeout(() => setOpen(false), 150); onCommit?.(value) }}
        onFocus={() => { if (suggestions.length) setOpen(true) }}
        className={`${BOX} ${invalid ? 'border-red-400' : 'border-slate-200'}`} />
      {open && suggestions.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map(s => (
            <li key={s.placeId} role="option" aria-selected={false}>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => pick(s)}
                className="w-full text-left px-3 min-h-[44px] py-2 hover:bg-orange-50 focus:bg-orange-50 focus:outline-none">
                <span className="text-sm font-semibold text-slate-900">{s.name}</span>
                {s.detail && <span className="block text-xs text-slate-500">{s.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The zone select — rendered by callers only when the country offers more than one zone. */
export function ZoneSelect({ id, zones, value, onChange }: { id: string; zones: string[]; value: string; onChange: (z: string) => void }) {
  return (
    <select id={id} value={value} onChange={e => onChange(e.target.value)} className={`${BOX} border-slate-200`}>
      {zones.map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
    </select>
  )
}

/** The whole step's body (the surface supplies the heading chrome and the Continue button). */
export function WhereBasedStep({ countries, guessedCode, value, onChange, errors = {} }: {
  countries: SignupCountry[]
  /** The country guessed FROM WHERE THE VISITOR IS, or null when the pre-fill is only the fallback. The hint
   *  "We guessed this from where you are" shows while that country is still the one chosen, and only then. */
  guessedCode: string | null
  value: BaseAnswer; onChange: (a: BaseAnswer) => void; errors?: BaseErrors
}) {
  const c = countries.find(x => x.code === value.country) ?? countries[0]
  const tTrade = useT('tradeArea')
  const tWhere = useT('whereYouTrade')   // languages-1: the step's words in the page's language (were the en-GB WHERE_YOU_TRADE_COPY)
  const tAddr = useT('address')
  const say = (r: TradeAreaRefusal) => tTrade(r.code, r.params)
  const setCountry = (code: string) => {
    const next = countries.find(x => x.code === code)
    if (!next) return
    onChange({ country: code, timezone: zoneFor(next), place: EMPTY_PLACE })
  }
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">{tWhere('stepIntro')}</p>
      <div>
        <label htmlFor="base-country" className={LABEL}>{tWhere('countryLabel')}</label>
        <div className="relative">
          {c?.flag && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.flag} alt="" width={21} height={14} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-[2px] pointer-events-none" />
          )}
          <select id="base-country" value={value.country} onChange={e => setCountry(e.target.value)}
            className={`${BOX} ${c?.flag ? 'pl-10' : ''} ${errors.country ? 'border-red-400' : 'border-slate-200'}`}>
            {countries.map(x => <option key={x.code} value={x.code}>{x.name}</option>)}
          </select>
        </div>
        {guessedCode !== null && value.country === guessedCode && <p className="text-xs text-slate-500 mt-1">{tWhere('countryGuessed')}</p>}
        {errors.country && <p className="text-xs text-red-600 mt-1">{say(errors.country)}</p>}
      </div>
      <div>
        {/* address-formats-2: the chosen country's word for where a truck is based (GB/US: "Town or city you’re based in"). */}
        <label htmlFor="base-town" className={LABEL}>{tAddr(`basedIn.${(fieldOf(addressFormatOrDefault(c?.addressFormat), 'locality')?.label ?? 'area') as LocalityLabel}`)}</label>
        <TownInput id="base-town" country={value.country} value={value.place} invalid={!!errors.town}
          onChange={place => onChange({ ...value, place })} />
        {errors.town && <p className="text-xs text-red-600 mt-1">{say(errors.town)}</p>}
      </div>
      {c && c.timezones.length > 1 && (
        <div>
          <label htmlFor="base-zone" className={LABEL}>{tWhere('timezoneLabel')}</label>
          <ZoneSelect id="base-zone" zones={c.timezones} value={value.timezone} onChange={tz => onChange({ ...value, timezone: tz })} />
          {errors.timezone && <p className="text-xs text-red-600 mt-1">{say(errors.timezone)}</p>}
        </div>
      )}
    </div>
  )
}
