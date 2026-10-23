'use client'
// components/admin/CountriesTab.tsx — Admin › Countries: every country's card fees, options and formats in one
// table, one ROW per country and one COLUMN per setting, each row saved on its own.
//
// ── WHAT THIS PAGE IS FOR ─────────────────────────────────────────────────────────────────────────────
// public.country_settings holds everything country-specific the app shows or charges (Parts A and B). This
// is the only way to change it without SQL. The data arrives from /api/admin/countries (admin-only,
// service role); the browser never reads the table.
//
// ── LAYOUT (admin-countries-1, 23 October 2026) ───────────────────────────────────────────────────────
// ONE TABLE: a row per country, a column per setting, under the setting groups the page always had. The
// Country column (flag, name, code — and the row's Save button) and both header rows are pinned while the
// box scrolls; the box scrolls both ways INSIDE itself and the page never scrolls sideways. Every column is
// only as wide as its content: help text sits behind a small ⓘ by the column name (tooltip on hover,
// popover on tap), and cells hold only the value or its control. Rows are grouped English-speaking /
// Europe / other from each row's own locale and default time zone — no list of codes.
//
// ── RULES ─────────────────────────────────────────────────────────────────────────────────────────────
// Every rule is lib/admin/country-form.ts, the same code the server runs again on Save, so a problem shows
// here before Save and can never be waved through by the server. Messages are plain sentences; no column
// name appears on screen. Saving a row sends that row's form only — exactly the body the per-country
// columns sent before this layout.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { nativeAuthHeader } from '@/lib/native/session'
import type { CountrySettings } from '@/lib/country-settings-types'
import {
  rowToForm, formToValues, isTimeZone,
  type CountryForm, type FieldError,
} from '@/lib/admin/country-form'
import { currencySymbol, minorUnitSign } from '@/lib/money-format'
import { CURRENCIES } from '@/lib/currencies'
import { ADDRESS_FORMATS, ADDRESS_FORMAT_KEYS } from '@/lib/address-formats'
import { LOCALES, isEnglish } from '@/lib/i18n/locales'

type Field = keyof CountryForm
interface ColumnState { saving: boolean; error: string | null; errors: FieldError[]; saved: boolean; confirmRemove: boolean; removing: boolean }
const IDLE: ColumnState = { saving: false, error: null, errors: [], saved: false, confirmRemove: false, removing: false }

const BOX = 'min-w-0 rounded-lg border bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:bg-slate-100 disabled:text-slate-500'
const OK_BORDER = 'border-slate-200'
const BAD_BORDER = 'border-red-400'
const EMPTY_BORDER = 'border-amber-300 bg-amber-50'
// The fixed part of a fee is typed in the currency's smallest unit; its sign sits beside each box.
const SMALL_UNIT = 'In the currency’s smallest unit — p, c, ¢, öre … — shown beside each box.'

// ── the examples beside the Times and Dates choices, in the row's own language style ──
const SAMPLE = new Date(Date.UTC(2026, 11, 31, 18, 30))
function timeExample(locale: string, h12: boolean): string {
  try { return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: h12, timeZone: 'UTC' }).format(SAMPLE) }
  catch { return h12 ? '6:30 pm' : '18:30' }
}
const ALL_ZONES: string[] = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []

const flagOf = (code: string) => /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : ''
function regionName(locale: string, code: string): string | null {
  try { return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? null } catch { return null }
}

/* ── STATUS, from the data alone ─────────────────────────────────────────────────────────────────────
 * "Language not built": the locale is not one of LOCALES, so its pages fall back to en-GB words.
 * "Name in English": a non-English locale whose short name (shown inside that language's sentences) is the
 * country's English name — the row's own name or Intl's English name, "the" aside. A country whose own name
 * IS its English name (Luxembourg in French, Portugal, Liechtenstein) is never flagged: the short name must
 * also differ from Intl's name for the country in the row's language.
 * Otherwise "Ready". */
export type Status = 'Language not built' | 'Name in English' | 'Ready'
export function statusOf(code: string, f: CountryForm): Status {
  const loc = f.locale.trim()
  if (!(LOCALES as readonly string[]).includes(loc)) return 'Language not built'
  if (!isEnglish(loc)) {
    const norm = (s: string | null) => (s ?? '').trim().toLowerCase().replace(/^the\s+/, '')
    const short = norm(f.shortName || f.name)
    const english = [norm(f.name), norm(regionName('en', code))].filter(Boolean)
    const own = norm(regionName(loc, code))
    if (english.includes(short) && own !== '' && own !== short) return 'Name in English'
  }
  return 'Ready'
}
const BADGE: Record<Status, string> = {
  'Language not built': 'bg-red-100 text-red-700',
  'Name in English': 'bg-amber-100 text-amber-800',
  Ready: 'bg-green-100 text-green-700',
}

async function call(method: 'GET' | 'PUT' | 'POST' | 'DELETE', body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch('/api/admin/countries', {
    method,
    headers: { 'Content-Type': 'application/json', ...(await nativeAuthHeader()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data: Record<string, unknown> = {}
  try { data = await res.json() } catch { /* an empty or broken body is reported by status */ }
  return { ok: res.ok, status: res.status, data }
}

/* ── ⓘ: a tooltip on hover, a popover on tap or click (Escape, a tap elsewhere or a scroll closes it) ──
 * The bubble is portalled to <body> with fixed coordinates, so the scroll box never clips it. */
function InfoTip({ label, children, tone = 'slate' }: { label: string; children: React.ReactNode; tone?: 'slate' | 'amber' }) {
  const [open, setOpen] = useState<null | 'hover' | 'pinned'>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const place = () => {
    const r = btn.current?.getBoundingClientRect()
    if (r) setPos({ left: Math.max(8, Math.min(r.left + r.width / 2 - 144, window.innerWidth - 296)), top: r.bottom + 6 })
  }
  useEffect(() => {
    if (open !== 'pinned') return
    const away = (e: PointerEvent) => { if (!btn.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node)) setOpen(null) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    const close = () => setOpen(null)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    window.addEventListener('scroll', close, true)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); window.removeEventListener('scroll', close, true) }
  }, [open])
  const ring = tone === 'amber' ? 'border-amber-400 text-amber-700 hover:bg-amber-50' : 'border-slate-300 text-slate-400 hover:border-slate-500 hover:text-slate-700'
  return (
    <>
      <button ref={btn} type="button" aria-label={`About ${label}`} aria-expanded={open !== null} data-info-tip
        onMouseEnter={() => { if (open === null) { place(); setOpen('hover') } }}
        onMouseLeave={() => { if (open === 'hover') setOpen(null) }}
        onClick={() => { if (open === 'pinned') setOpen(null); else { place(); setOpen('pinned') } }}
        className={`ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border align-middle font-serif text-[10px] font-bold normal-case italic leading-none ${ring}`}>i</button>
      {open && pos && createPortal(
        <div ref={pop} role="tooltip" data-info-pop style={{ position: 'fixed', left: pos.left, top: pos.top, width: 288 }}
          className="z-50 whitespace-normal rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-white shadow-lg">
          {children}
        </div>, document.body)}
    </>
  )
}

export default function CountriesTab() {
  const [rows, setRows] = useState<CountrySettings[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [forms, setForms] = useState<Record<string, CountryForm>>({})
  const [cols, setCols] = useState<Record<string, ColumnState>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  // currency-registry: rows the loader could not read (left out of the table and of every public list) — named here.
  const [unreadable, setUnreadable] = useState<{ code: string; reason: string }[]>([])
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState({ code: '', name: '', copyFrom: '' })
  const [addErrors, setAddErrors] = useState<FieldError[]>([])
  const [addBusy, setAddBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'on' | 'off' | 'attention'>('all')

  // The first read. State is set only AFTER the await, and not at all if the tab unmounted meanwhile.
  useEffect(() => {
    let cancelled = false
    call('GET').then(r => {
      if (cancelled) return
      if (!r.ok) { setLoadError(typeof r.data.error === 'string' ? r.data.error : 'The countries could not be loaded.'); setLoaded(true); return }
      const list = r.data.countries as CountrySettings[]
      setRows(list)
      setCounts(r.data.truckCounts as Record<string, number>)
      setUnreadable(Array.isArray(r.data.unreadable) ? r.data.unreadable as { code: string; reason: string }[] : [])
      setForms(Object.fromEntries(list.map(c => [c.countryCode, rowToForm(c)])))
      setCols(Object.fromEntries(list.map(c => [c.countryCode, IDLE])))
      setLoaded(true)
    }).catch(() => { if (!cancelled) { setLoadError('The countries could not be loaded.'); setLoaded(true) } })
    return () => { cancelled = true }
  }, [])

  const setField = <K extends Field>(code: string, field: K, value: CountryForm[K]) => {
    setForms(prev => ({ ...prev, [code]: { ...prev[code], [field]: value } }))
    setCols(prev => ({ ...prev, [code]: { ...(prev[code] ?? IDLE), saved: false } }))
  }
  const setCol = (code: string, patch: Partial<ColumnState>) => setCols(prev => ({ ...prev, [code]: { ...(prev[code] ?? IDLE), ...patch } }))

  const save = async (row: CountrySettings) => {
    const code = row.countryCode
    setCol(code, { saving: true, error: null, errors: [], saved: false })
    const r = await call('PUT', { code, expectedUpdatedAt: row.updatedAt, form: forms[code] })
    if (!r.ok) {
      // 🔴 WHAT WAS TYPED STAYS. A refused save changes nothing on the screen but the message.
      setCol(code, { saving: false, error: typeof r.data.error === 'string' ? r.data.error : 'That could not be saved.', errors: (r.data.errors as FieldError[]) ?? [] })
      return
    }
    const saved = r.data.country as CountrySettings
    setRows(prev => prev.map(x => (x.countryCode === code ? saved : x)))
    setForms(prev => ({ ...prev, [code]: rowToForm(saved) }))
    setCol(code, { saving: false, saved: true })
  }

  const remove = async (row: CountrySettings) => {
    const code = row.countryCode
    setCol(code, { removing: true, error: null })
    const r = await call('DELETE', { code })
    if (!r.ok) { setCol(code, { removing: false, confirmRemove: false, error: typeof r.data.error === 'string' ? r.data.error : 'That country could not be removed.' }); return }
    setRows(prev => prev.filter(x => x.countryCode !== code))
  }

  const add = async () => {
    setAddBusy(true); setAddErrors([])
    const r = await call('POST', { ...addForm, code: addForm.code.trim().toUpperCase() })
    setAddBusy(false)
    if (!r.ok) { setAddErrors((r.data.errors as FieldError[])?.length ? r.data.errors as FieldError[] : [{ field: 'form', message: String(r.data.error ?? 'That country could not be added.') }]); return }
    const c = r.data.country as CountrySettings
    setRows(prev => [...prev, c])
    setCounts(prev => ({ ...prev, [c.countryCode]: 0 }))
    setForms(prev => ({ ...prev, [c.countryCode]: rowToForm(c) }))
    setCols(prev => ({ ...prev, [c.countryCode]: IDLE }))
    setAdding(false); setAddForm({ code: '', name: '', copyFrom: '' })
  }

  // Live checks, per row — the same function the server runs on Save.
  const problems = useMemo(() => Object.fromEntries(rows.map(r => {
    const f = forms[r.countryCode]
    if (!f) return [r.countryCode, [] as FieldError[]]
    const res = formToValues(f, { truckCount: counts[r.countryCode] ?? 0, storedCurrency: r.currency, countryCode: r.countryCode })
    return [r.countryCode, res.ok ? [] : res.errors]
  })), [rows, forms, counts])

  if (!loaded) return <p className="text-sm text-slate-500">Loading countries…</p>
  if (loadError) return <p className="text-sm font-semibold text-red-600">{loadError}</p>

  // ── one cell's widgets ─────────────────────────────────────────────────────────────────────────────
  const errorFor = (code: string, field: Field) =>
    (cols[code]?.errors ?? []).find(e => e.field === field)?.message
    ?? (problems[code] ?? []).find(e => e.field === field && field !== 'enabled')?.message
  const msg = (code: string, field: Field) => {
    const m = errorFor(code, field)
    return m ? <p className="mt-1 max-w-[16rem] whitespace-normal text-xs font-medium text-red-600">{m}</p> : null
  }
  const border = (code: string, field: Field, emptyAmber = false) =>
    errorFor(code, field) ? BAD_BORDER : emptyAmber && forms[code][field] === '' ? EMPTY_BORDER : OK_BORDER

  const moneyOf = (code: string) => {
    const f = forms[code]; const row = rows.find(r => r.countryCode === code)!
    const cur = /^[A-Z]{3}$/.test(f.currency.trim().toUpperCase()) ? f.currency.trim().toUpperCase() : row.currency
    let sym = cur
    try { sym = currencySymbol({ currency: cur, locale: f.locale || row.locale }) } catch { /* unknown locale → the code */ }
    // currency-registry (21 October 2026): the minor unit's sign from lib/currencies.ts — "p", "¢", "c" (Ireland's euro
    // too). It was the short-fee suffix, which EUR deliberately lacks, so Ireland's boxes read "25 EUR minor units". The
    // dropdown below offers registry currencies only, so there is always a sign; '' is never reached in practice.
    return { sym, small: minorUnitSign(cur) ?? '' }
  }

  const toggle = (code: string, field: Field, label: string, disabled?: boolean) => {
    const on = forms[code][field] as boolean
    return (
      <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
        onClick={() => setField(code, field, !on as CountryForm[typeof field])}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full align-middle transition-colors disabled:opacity-50 ${on ? 'bg-orange-500' : 'bg-slate-300'}`}>
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    )
  }

  // Numbers are right-aligned in their boxes, and the unit is in the column header ("Online %").
  const NUM = 'w-full min-w-0 bg-transparent py-1 text-right text-sm tabular-nums text-slate-900 focus:outline-none disabled:cursor-not-allowed'
  const pct = (code: string, field: 'cardFeeOnlinePct' | 'cardFeeInPersonPct' | 'cardSurchargeCapPct', amber?: boolean) => (
    <><div className={`ml-auto flex w-20 items-center rounded-lg border ${border(code, field, amber)} px-2`}>
      <input className={NUM} inputMode="decimal"
        aria-label={`${field} for ${code}`} value={forms[code][field]} placeholder={amber ? 'Not set' : ''}
        onChange={e => setField(code, field, e.target.value)} />
    </div>{msg(code, field)}</>
  )
  const fixed = (code: string, field: 'cardFeeOnlineFixed' | 'cardFeeInPersonFixed' | 'tapToPayFixed') => (
    <><div className={`ml-auto flex w-24 items-center rounded-lg border ${border(code, field)} px-2`}>
      <input className={NUM} inputMode="numeric"
        aria-label={`${field} for ${code}`} value={forms[code][field]} onChange={e => setField(code, field, e.target.value)} /><span className="pl-1 text-xs font-semibold text-slate-400">{moneyOf(code).small}</span>
    </div>{msg(code, field)}</>
  )
  /* Phase 3 screens: the service-fee boxes. Percentages as written (3.5); fixed parts in the currency's
   * smallest unit (50 → 50¢), like the card fee boxes above. `off` greys a box that does not apply. */
  const feePct = (code: string, field: 'serviceFeeHatchgrabPct' | 'serviceFeeTruckMaxPct', off = false) => (
    <><div className={`ml-auto flex w-20 items-center rounded-lg border ${border(code, field)} px-2 ${off ? 'opacity-50' : ''}`}>
      <input className={NUM} inputMode="decimal" disabled={off}
        aria-label={`${field} for ${code}`} value={forms[code][field]} onChange={e => setField(code, field, e.target.value)} />
    </div>{msg(code, field)}</>
  )
  const feeFixed = (code: string, field: 'serviceFeeHatchgrabFixed' | 'serviceFeeTruckMaxFixed', off = false) => (
    <><div className={`ml-auto flex w-24 items-center rounded-lg border ${border(code, field)} px-2 ${off ? 'opacity-50' : ''}`}>
      <input className={NUM} inputMode="numeric" disabled={off}
        aria-label={`${field} for ${code}`} value={forms[code][field]} onChange={e => setField(code, field, e.target.value)} /><span className="pl-1 text-xs font-semibold text-slate-400">{moneyOf(code).small}</span>
    </div>{msg(code, field)}</>
  )
  // A text box is as wide as what it holds (or its placeholder), never wider.
  const text = (code: string, field: 'name' | 'taxLabel' | 'cardFeeRegionLabel' | 'supportHours' | 'locale' | 'shortName' | 'phoneExample', placeholder?: string) => (
    <>
      <input className={`${BOX} ${border(code, field)}`} aria-label={`${field} for ${code}`} value={forms[code][field]}
        size={Math.max(4, String(forms[code][field]).length, placeholder?.length ?? 0) + 1}
        placeholder={placeholder} onChange={e => setField(code, field, e.target.value)} />
      {msg(code, field)}
    </>
  )
  function choice<K extends 'timeFormat' | 'dateOrder' | 'weekStart' | 'addressFormat' | 'allergenSet' | 'defaultTimezone' | 'phoneCheck'>(
    code: string, field: K, options: [string, string][]) {
    return (
      <>
        <select className={`${BOX} ${border(code, field)}`} aria-label={`${field} for ${code}`} value={forms[code][field] as string}
          onChange={e => setField(code, field, e.target.value as CountryForm[K])}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {msg(code, field)}
      </>
    )
  }
  const chips = (code: string, field: 'cardSurchargeExcludedRegions' | 'tipPresetsPct' | 'timezones', placeholder: string, suffix?: string, suggestions?: string[]) => {
    const list = forms[code][field] as string[]
    const listId = `cs-${code}-${field}`
    return (
      <>
        <div className={`flex items-center gap-1 ${field === 'timezones' ? 'max-w-[26rem] flex-wrap' : ''}`}>
          {list.map(v => (
            <span key={v} className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 py-0.5 pl-2 pr-0.5 text-xs font-semibold text-slate-700">
              {v}{suffix}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => setField(code, field, list.filter(x => x !== v))}
                className="flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700">×</button>
            </span>
          ))}
          <form className="inline-flex items-center gap-1" onSubmit={e => {
            e.preventDefault()
            const input = (e.currentTarget.elements.namedItem('v') as HTMLInputElement)
            const v = input.value.trim()
            if (v) { setField(code, field, [...list, field === 'cardSurchargeExcludedRegions' ? v.toUpperCase() : v]); input.value = '' }
          }}>
            <input name="v" list={suggestions ? listId : undefined} placeholder={placeholder} aria-label={`Add to ${field} for ${code}`}
              className={`${BOX} ${OK_BORDER} ${field === 'timezones' ? 'w-32' : 'w-14'} py-0.5 text-xs`} />
            {suggestions && <datalist id={listId}>{suggestions.map(z => <option key={z} value={z} />)}</datalist>}
            <button type="submit" className="rounded-lg border border-slate-200 px-1.5 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Add</button>
          </form>
        </div>
        {msg(code, field)}
      </>
    )
  }
  const dash = () => <span className="text-slate-300">—</span>

  // ── the columns, in the approved order, under the page's setting groups ──────────────────────────────
  // A setting typed as a rate plus a fixed amount is two columns: `parts` gives each its unit, appended to the
  // label in the header ("Online %", "Online fixed (p/c)"). `note` joins the hint inside the column's ⓘ.
  type Cell = (code: string) => React.ReactNode
  type ColDef = { group: string; hint?: string }
    | { label: string; hint?: string; note?: React.ReactNode; num?: boolean; cell: Cell }
    | { label: string; hint?: string; note?: React.ReactNode; parts: [string, Cell][] }
  const ROWS: ColDef[] = [
    { group: 'Status' },
    /* 🔴 SWITCHING ON NEEDS EVERY PUBLIC PLAN PRICED FOR THIS COUNTRY (plan_prices) — the database trigger refuses
     * otherwise, and the save shows its sentence under this switch. */
    { label: 'Switched on', hint: 'Trucks can sign up from this country', cell: code => (
      <>{toggle(code, 'enabled', `Switched on, ${code}`)}{msg(code, 'enabled')}</>
    ) },
    { label: 'Trucks', hint: 'Trucks signed up in this country', num: true, cell: code => <span className="tabular-nums text-slate-700">{counts[code] ?? 0}</span> },
    { label: 'Country name', cell: code => text(code, 'name') },

    /* ⛔ THE SIX PLAN PRICE ROWS (Starter/Pro/Max per month, allowances, "Our fee above that") ARE GONE — plans-data-model,
     * Stage A. Plans and their per-country prices are public.plans / public.plan_prices, shown in the Plans table.
     * admin-countries-1: the display-only "Extra van — Same as the plan's monthly price" line is gone too; the extra
     * van price is still plan_prices.extra_van_monthly_minor, unchanged. */
    { group: 'HatchGrab platform fee' },
    /* Phase 3 screens: the platform fee's own switch (country_settings.platform_fee_enabled). Charging is not
     * built, so the note says plainly that switching it on does nothing yet. */
    { label: 'Take our fee', hint: "Off: each plan's fee is shown on plans but never charged",
      note: 'Not charged yet — switching on has no effect until fee charging is built.',
      cell: code => <>{toggle(code, 'platformFeeEnabled', `Take our fee, ${code}`)}{msg(code, 'platformFeeEnabled')}</> },

    { group: 'Stripe card fees', hint: 'As we quote them on pricing pages and in Payments' },
    { label: 'Online', hint: 'Online card payments', parts: [['%', code => pct(code, 'cardFeeOnlinePct')], ['fixed (p/c)', code => fixed(code, 'cardFeeOnlineFixed')]] },
    { label: 'In person', hint: 'In-person card payments', parts: [['%', code => pct(code, 'cardFeeInPersonPct')], ['fixed (p/c)', code => fixed(code, 'cardFeeInPersonFixed')]] },
    { label: 'Tap to Pay extra (p/c)', hint: 'Per payment, on a phone or tablet with no card reader', num: true, cell: code => fixed(code, 'tapToPayFixed') },
    { label: 'Which cards these rates are for', hint: 'Shown as “on UK cards”', cell: code => text(code, 'cardFeeRegionLabel') },

    { group: 'What trucks can offer customers' },
    { label: 'Menu prices include tax', cell: code => toggle(code, 'pricesIncludeTax', `Menu prices include tax, ${code}`) },
    { label: 'Tax name', hint: 'As in “prices include VAT”', cell: code => text(code, 'taxLabel') },
    { label: "Card fee can go on the customer's bill", hint: "Card fees on the bill aren't built yet", cell: code => toggle(code, 'cardSurchargeAllowed', `Card fee can go on the customer's bill, ${code}`) },
    { label: 'Card fee cap %', hint: 'Only when the card fee can go on the bill', num: true, cell: code => forms[code].cardSurchargeAllowed ? pct(code, 'cardSurchargeCapPct') : dash() },
    { label: 'Credit cards only', hint: 'Only when the card fee can go on the bill', cell: code => forms[code].cardSurchargeAllowed ? (
      <input type="checkbox" className="h-4 w-4 align-middle" aria-label={`cardSurchargeCreditOnly for ${code}`} checked={forms[code].cardSurchargeCreditOnly}
        onChange={e => setField(code, 'cardSurchargeCreditOnly', e.target.checked)} />
    ) : dash() },
    { label: 'Card fee not allowed in', hint: 'Regions (e.g. CT) where it is never added; only when the card fee can go on the bill', cell: code => forms[code].cardSurchargeAllowed
      ? chips(code, 'cardSurchargeExcludedRegions', 'e.g. CT') : dash() },
    { label: 'Tipping on for new trucks', cell: code => toggle(code, 'tippingEnabledDefault', `Tipping on for new trucks, ${code}`) },
    { label: 'Tip choices %', hint: 'The tip choices offered', cell: code => chips(code, 'tipPresetsPct', 'e.g. 15', '%') },

    /* ── Phase 3 screens: THE ONLINE SERVICE FEE, as its own group (20261010_17) ─────────────────────────
     * "Online service fee allowed" moved here from the group above as "Allowed in this country". Every column
     * after it reads "—" while the fee is not allowed, because none of them means anything then. */
    { group: 'Online service fee', hint: 'Online orders only — never pay at the truck or walk-up' },
    { label: 'Allowed in this country', cell: code => {
      const f = forms[code]
      return (
        <span className="inline-flex items-center">
          {toggle(code, 'serviceFeeAllowed', `Online service fee allowed, ${code}`)}
          {!f.serviceFeeAllowed && f.pricesIncludeTax && (
            <InfoTip label={`the service fee in ${f.name}`} tone="amber">If switched on, {(f.shortName || f.name).trim()} law needs it inside the prices customers first see</InfoTip>
          )}
        </span>
      )
    } },
    { label: 'Who keeps it', cell: code => forms[code].serviceFeeAllowed ? (
      <>
        <select className={`${BOX} ${border(code, 'serviceFeeRecipient')}`} aria-label={`serviceFeeRecipient for ${code}`}
          value={forms[code].serviceFeeRecipient} onChange={e => setField(code, 'serviceFeeRecipient', e.target.value as CountryForm['serviceFeeRecipient'])}>
          <option value="truck">The truck</option>
          <option value="hatchgrab">HatchGrab</option>
        </select>
        {msg(code, 'serviceFeeRecipient')}
      </>
    ) : dash() },
    { label: "HatchGrab's fee", hint: "Used when HatchGrab keeps it; trucks can't change it", note: <>Only when &ldquo;HatchGrab&rdquo; is chosen</>, parts: [
      ['%', code => forms[code].serviceFeeAllowed ? feePct(code, 'serviceFeeHatchgrabPct', forms[code].serviceFeeRecipient !== 'hatchgrab') : dash()],
      ['fixed (p/c)', code => forms[code].serviceFeeAllowed ? feeFixed(code, 'serviceFeeHatchgrabFixed', forms[code].serviceFeeRecipient !== 'hatchgrab') : dash()],
    ] },
    { label: 'Most a truck can charge', hint: 'Used when the truck keeps it; trucks set their own up to this', parts: [
      ['%', code => forms[code].serviceFeeAllowed ? feePct(code, 'serviceFeeTruckMaxPct') : dash()],
      ['fixed (p/c)', code => forms[code].serviceFeeAllowed ? feeFixed(code, 'serviceFeeTruckMaxFixed') : dash()],
    ] },

    { group: 'Tax on fees' },
    { label: 'Service fee and card fee are taxed', hint: 'Only matters where tax is added at checkout', cell: code => {
      const f = forms[code]
      return f.pricesIncludeTax
        ? <span className="text-sm text-slate-400">— ({(f.shortName || f.name).trim()} prices include {f.taxLabel.trim() || 'tax'})</span>
        : toggle(code, 'feesTaxed', `Service fee and card fee are taxed, ${code}`)
    } },

    { group: 'Formats' },
    { label: 'Currency', hint: 'Locked once a truck uses it', cell: code => {
      const trucks = counts[code] ?? 0
      return trucks > 0 ? (
        <div className="flex items-center gap-2"><span className="rounded-lg bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-700">{forms[code].currency}</span><span className="text-xs text-slate-500">🔒 {trucks} {trucks === 1 ? 'truck uses' : 'trucks use'} it</span></div>
      ) : (
        // currency-registry: a dropdown of the registry's currencies (lib/currencies.ts) — never free text. The database
        // CHECK holds the same list.
        <>
          <select className={`${BOX} ${border(code, 'currency')}`} aria-label={`currency for ${code}`} value={forms[code].currency}
            onChange={e => setField(code, 'currency', e.target.value)}>
            {!CURRENCIES.some(c => c.code === forms[code].currency) && <option value={forms[code].currency}>{forms[code].currency || '—'}</option>}
            {CURRENCIES.map(c => <option key={c.code} value={c.code} title={c.name}>{c.code}</option>)}
          </select>
          {msg(code, 'currency')}
        </>
      )
    } },
    { label: 'Language style', hint: 'How dates and numbers are written', cell: code => text(code, 'locale', 'en-GB') },
    { label: 'Times', cell: code => choice(code, 'timeFormat', [['24h', `24-hour (${timeExample(forms[code].locale, false)})`], ['12h', `12-hour (${timeExample(forms[code].locale, true)})`]]) },
    { label: 'Dates', cell: code => choice(code, 'dateOrder', [['dmy', 'Day first (31/12/2026)'], ['mdy', 'Month first (12/31/2026)']]) },
    { label: 'Week starts', cell: code => choice(code, 'weekStart', [['monday', 'Monday'], ['sunday', 'Sunday']]) },
    { label: 'Phone country code', num: true, cell: code => (
      <><div className={`ml-auto flex w-20 items-center rounded-lg border ${border(code, 'phoneCountryCode')} px-2`}><span className="pr-0.5 text-sm font-semibold text-slate-500">+</span>
        <input className={NUM} inputMode="numeric" aria-label={`phoneCountryCode for ${code}`}
          value={forms[code].phoneCountryCode} onChange={e => setField(code, 'phoneCountryCode', e.target.value)} /></div>
        {msg(code, 'phoneCountryCode')}</>
    ) },
    { label: 'Short name', hint: 'As in "a valid UK mobile"', cell: code => text(code, 'shortName', 'UK') },
    { label: 'Example phone number', hint: 'Shown in phone boxes and errors', cell: code => text(code, 'phoneExample', '07700 900123') },
    { label: 'Phone number check', cell: code => choice(code, 'phoneCheck', [['length', 'Standard — right length for the country'], ['strict', 'Strict — real numbers only'], ['off', 'Off — accept anything']]) },
    // address-formats-1 (21 October 2026): the formats of lib/address-formats.ts — a country only PICKS one here.
    { label: 'Addresses', cell: code => choice(code, 'addressFormat', ADDRESS_FORMAT_KEYS.map(k => [k, ADDRESS_FORMATS[k].adminLabel])) },
    { label: 'Time zones offered at signup', cell: code => chips(code, 'timezones', 'Add a zone', undefined, ALL_ZONES.filter(z => !forms[code].timezones.includes(z))) },
    { label: 'Default time zone', hint: 'Only the zones offered', cell: code => {
      const zones = forms[code].timezones.filter(isTimeZone)
      const opts: [string, string][] = zones.map(z => [z, z.replace(/_/g, ' ')])
      if (!zones.includes(forms[code].defaultTimezone)) opts.unshift([forms[code].defaultTimezone, `${forms[code].defaultTimezone.replace(/_/g, ' ')} (not offered)`])
      return choice(code, 'defaultTimezone', opts)
    } },

    { group: 'Allergens and support' },
    { label: 'Allergen list', cell: code => choice(code, 'allergenSet', [['uk14', 'UK 14'], ['us9', 'US 9'], ['anz', 'ANZ 23'], ['ca', 'Canada 13']]) },
    // allergen-card-country (21 October 2026): off where the law needs allergens per dish (Ireland, FSAI) — trucks there are
    // not offered "Show an allergen card", and the server refuses it (docs/allergen-card-country-report.md).
    { label: 'Allergen card on its own', hint: 'Off where the law needs allergens shown against each dish', cell: code => toggle(code, 'allergenCardOnlyAllowed', `Allergen card on its own, ${code}`) },
    { label: 'Support hours', cell: code => text(code, 'supportHours', 'Not shown') },
  ]

  // ROWS → the flat column list, each column knowing its group.
  type Col = { key: string; group: string; label: string; help: React.ReactNode[]; num: boolean; cell: Cell }
  const COLUMNS: Col[] = []
  const GROUPS: { group: string; hint?: string; span: number }[] = []
  for (const def of ROWS) {
    if ('group' in def) { GROUPS.push({ ...def, span: 0 }); continue }
    const g = GROUPS[GROUPS.length - 1]
    const help = (extra?: string) => [def.hint, def.note, extra].filter(Boolean) as React.ReactNode[]
    if ('parts' in def) {
      for (const [unit, cell] of def.parts) {
        COLUMNS.push({ key: `${def.label} ${unit}`, group: g.group, label: `${def.label} ${unit}`, help: help(unit.includes('(p/c)') ? SMALL_UNIT : undefined), num: true, cell }); g.span++
      }
    } else {
      COLUMNS.push({ key: def.label, group: g.group, label: def.label, help: help(def.label.includes('(p/c)') ? SMALL_UNIT : undefined), num: !!def.num, cell: def.cell }); g.span++
    }
  }

  const fmtSaved = (iso: string) => {
    try { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return iso }
  }

  // ── which rows show, and under which heading ───────────────────────────────────────────────────────
  // From each row's SAVED locale and default time zone, so a row never jumps while it is being edited.
  // Inside a section the rows keep the loader's order (the public pages' country first, then by name).
  const statusFor = (code: string) => (forms[code] ? statusOf(code, forms[code]) : 'Ready')
  const needsAttention = (code: string) => statusFor(code) !== 'Ready' || (problems[code] ?? []).length > 0
  const q = query.trim().toLowerCase()
  const shown = rows.filter(r => {
    if (filter === 'on' && !r.enabled) return false
    if (filter === 'off' && r.enabled) return false
    if (filter === 'attention' && !needsAttention(r.countryCode)) return false
    return !q || [r.name, r.countryCode, r.shortName ?? '', r.locale].some(s => s.toLowerCase().includes(q))
  })
  // Europe: a time zone in Europe/… or the euro — Cyprus's zone is Asia/Nicosia.
  const sectionOf = (r: CountrySettings) => isEnglish(r.locale) ? 'English-speaking'
    : r.timezones.some(z => z.startsWith('Europe/')) || r.defaultTimezone.startsWith('Europe/') || r.currency === 'EUR' ? 'Europe' : 'Other countries'
  const SECTIONS = ['English-speaking', 'Europe', 'Other countries']
    .map(title => ({ title, rows: shown.filter(r => sectionOf(r) === title) }))
    .filter(s => s.rows.length > 0)
  const CHIPS: { key: typeof filter; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: rows.length },
    { key: 'on', label: 'Switched on', n: rows.filter(r => r.enabled).length },
    { key: 'off', label: 'Switched off', n: rows.filter(r => !r.enabled).length },
    { key: 'attention', label: 'Needs attention', n: rows.filter(r => needsAttention(r.countryCode)).length },
  ]

  const statusCell = (code: string) => {
    const s = statusFor(code); const n = (problems[code] ?? []).length
    return (
      <span className="inline-flex items-center gap-1">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${BADGE[s]}`}>{s}</span>
        {n > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">{n === 1 ? '1 box to fix' : `${n} boxes to fix`}</span>}
      </span>
    )
  }
  const STATUS_HELP = 'Language not built: its locale has no words yet, so its pages are in English. Name in English: its short name, shown inside its own language’s sentences, is still the English name. Ready: neither.'

  const FROZEN = 'sticky left-0 w-[15rem] min-w-[15rem] max-w-[15rem] border-r border-slate-200'
  const TH = 'border-b border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-600'
  const span = 1 + 1 + COLUMNS.length

  return (
    <div className="space-y-3" data-countries-page>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">Countries</h2>
          <p className="text-sm text-slate-500">Card fees, options and formats for each country. Each row saves on its own.</p>
        </div>
        <button type="button" onClick={() => { setAdding(v => !v); setAddErrors([]) }}
          className="whitespace-nowrap rounded-xl bg-orange-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-orange-700">
          + Add country
        </button>
      </div>

      {unreadable.length > 0 && (
        <div data-unreadable-countries className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-bold">{unreadable.length === 1 ? 'One country row can’t be read' : `${unreadable.length} country rows can’t be read`}, so {unreadable.length === 1 ? 'it is' : 'they are'} hidden here and from every country list on the site:</p>
          <ul className="mt-1 list-disc pl-5">{unreadable.map(u => <li key={u.code}><b>{u.code}</b> — {u.reason}</li>)}</ul>
          <p className="mt-1 text-xs">Fix the row in the database (its pages and trucks stay unavailable until then).</p>
        </div>
      )}

      {adding && (
        <form data-add-country className="rounded-2xl border border-slate-200 bg-white p-4" onSubmit={e => { e.preventDefault(); void add() }}>
          <p className="text-sm font-bold text-slate-900">Add a country</p>
          <p className="mb-3 text-xs text-slate-500">It starts switched off, with its six plan prices empty. Everything else is copied from the country you choose.</p>
          {/* `text-sm` HERE IS LOAD-BEARING: app/globals.css makes a <select> INHERIT its font size from 640px up,
              so without it the Copy-from select alone renders at 16px beside 14px boxes. */}
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Two-letter code</span>
              <input className={`${BOX} ${OK_BORDER} w-20 uppercase`} maxLength={2} value={addForm.code} placeholder="FR" aria-label="Two-letter code"
                onChange={e => setAddForm(p => ({ ...p, code: e.target.value }))} /></label>
            <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Name</span>
              <input className={`${BOX} ${OK_BORDER} w-56`} value={addForm.name} placeholder="France" aria-label="Country name"
                onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} /></label>
            <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Copy settings from</span>
              <select className={`${BOX} ${OK_BORDER} w-56`} value={addForm.copyFrom} aria-label="Copy settings from"
                onChange={e => setAddForm(p => ({ ...p, copyFrom: e.target.value }))}>
                <option value="">Choose a country…</option>
                {rows.map(r => <option key={r.countryCode} value={r.countryCode}>{r.name} ({r.countryCode})</option>)}
              </select></label>
            <button type="submit" disabled={addBusy} className="rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {addBusy ? 'Adding…' : 'Add country'}</button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600">Cancel</button>
          </div>
          {addErrors.map(e => <p key={e.field + e.message} className="mt-2 text-xs font-medium text-red-600">{e.message}</p>)}
        </form>
      )}

      {/* ── search and filter chips ── */}
      <div className="flex flex-wrap items-center gap-2" data-countries-filters>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, code or language" aria-label="Search countries"
          className={`${BOX} ${OK_BORDER} w-72`} />
        {CHIPS.map(c => (
          <button key={c.key} type="button" aria-pressed={filter === c.key} onClick={() => setFilter(c.key)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === c.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
            {c.label} <span className={filter === c.key ? 'text-slate-300' : 'text-slate-400'}>{c.n}</span>
          </button>
        ))}
      </div>

      {/* 🔴 THE BOX SCROLLS, THE PAGE DOES NOT. overflow-auto in both directions with a height cap is what
          makes `sticky top-*` (both header rows) and `sticky left-0` (the Country column) stick: a sticky
          element sticks to its nearest scrolling ancestor, and this box is it. `border-separate` keeps each
          pinned cell's borders on the cell itself, so they move with it. */}
      <div className="max-h-[calc(100dvh-210px)] overflow-auto rounded-2xl border border-slate-200 bg-white" data-countries-grid>
        <table className="w-max border-separate border-spacing-0 text-sm">
          <thead>
            {/* ── the group row ── */}
            <tr>
              <th rowSpan={2} className={`${FROZEN} ${TH} top-0 z-30 px-3 text-left align-bottom`} data-countries-corner>
                <span className="block pb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Country</span>
              </th>
              {/* The Status group also spans the Status badge column, the first after Country. */}
              {GROUPS.map(g => (
                <th key={g.group} colSpan={g.span + (g.group === 'Status' ? 1 : 0)} className={`${TH} sticky top-0 z-20 h-8 whitespace-nowrap border-l text-left text-[11px] font-bold uppercase tracking-wide text-slate-500`}>
                  {/* The group's name slides along with its columns, so it is never hidden under the Country column. */}
                  <span className="sticky left-[15.5rem] inline-flex items-center">{g.group}{g.hint && <InfoTip label={g.group}>{g.hint}</InfoTip>}</span>
                </th>
              ))}
            </tr>
            {/* ── the column row ── */}
            <tr>
              <th className={`${TH} sticky top-8 z-20 border-l py-2 text-left align-bottom`}>
                <span className="inline-flex items-end">Status<InfoTip label="Status">{STATUS_HELP}</InfoTip></span>
              </th>
              {COLUMNS.map((c, i) => (
                <th key={c.key} data-col={c.key} className={`${TH} sticky top-8 z-20 py-2 align-bottom ${c.num ? 'text-right' : 'text-left'} ${i > 0 && COLUMNS[i - 1].group !== c.group ? 'border-l' : ''}`}>
                  <span className={`inline-flex max-w-[10rem] items-end gap-0 ${c.num ? 'justify-end' : ''}`}>
                    <span className="whitespace-normal">{c.label}</span>
                    {c.help.length > 0 && <InfoTip label={c.label}>{c.help.map((h, j) => <p key={j} className={j ? 'mt-1 text-slate-300' : ''}>{h}</p>)}</InfoTip>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          {SECTIONS.map(sec => (
            <tbody key={sec.title} data-countries-section={sec.title}>
              <tr>
                <td colSpan={span} className="border-b border-slate-200 bg-slate-100 px-3 py-1.5">
                  <span className="sticky left-3 text-xs font-bold uppercase tracking-wide text-slate-600">{sec.title} <span className="font-semibold text-slate-400">{sec.rows.length}</span></span>
                </td>
              </tr>
              {sec.rows.map(r => {
                const code = r.countryCode; const c = cols[code] ?? IDLE; const f = forms[code]
                const trucks = counts[code] ?? 0
                const dirty = JSON.stringify(f) !== JSON.stringify(rowToForm(r))
                const blocking = (problems[code] ?? []).length > 0
                const canRemove = trucks === 0 && !r.enabled
                const bg = dirty ? 'bg-orange-50' : 'bg-white'
                return (
                  <tr key={code} data-country-row={code} data-dirty={dirty ? '' : undefined} className={bg}>
                    <td data-country-head={code} className={`${FROZEN} ${bg} z-10 border-b border-slate-100 px-3 py-1.5 align-middle ${dirty ? 'shadow-[inset_3px_0_0_#ea580c]' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-bold text-slate-900">
                          <span className="mr-1.5" aria-hidden>{flagOf(code)}</span>{r.name} <span className="text-xs font-semibold text-slate-400">{code}</span>
                          <InfoTip label={`${r.name}, last saved`}>Last saved {fmtSaved(r.updatedAt)}{r.updatedBy ? ` by ${r.updatedBy}` : ''}</InfoTip>
                        </p>
                        {(dirty || c.saving) && (
                          <button type="button" onClick={() => void save(r)} disabled={!dirty || blocking || c.saving}
                            className="shrink-0 rounded-lg bg-orange-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-500">
                            {c.saving ? 'Saving…' : 'Save'}</button>
                        )}
                        {c.saved && !dirty && <span className="shrink-0 text-xs font-semibold text-green-700" title="Live on the pricing pages within a minute.">Saved ✓</span>}
                      </div>
                      {c.error && <p className="mt-1 whitespace-normal text-xs font-semibold text-red-600" role="alert">{c.error}</p>}
                      {!c.error && blocking && dirty && <p className="mt-1 whitespace-normal text-xs font-medium text-red-600">Fix the boxes marked in red to save.</p>}
                      {canRemove && (c.confirmRemove ? (
                        <div className="mt-1 flex flex-wrap items-center gap-2 whitespace-normal text-xs">
                          <span className="font-semibold text-slate-700">Remove {r.name}? This can&apos;t be undone.</span>
                          <button type="button" disabled={c.removing} onClick={() => void remove(r)} className="rounded-lg bg-red-600 px-2 py-1 font-semibold text-white disabled:opacity-60">{c.removing ? 'Removing…' : 'Remove'}</button>
                          <button type="button" onClick={() => setCol(code, { confirmRemove: false })} className="rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-600">Cancel</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setCol(code, { confirmRemove: true })} className="mt-0.5 text-[11px] font-semibold text-slate-400 underline hover:text-red-600">Remove country</button>
                      ))}
                    </td>
                    <td className="whitespace-nowrap border-b border-l border-slate-100 px-2 py-1.5 align-middle">{statusCell(code)}</td>
                    {COLUMNS.map((col, i) => (
                      <td key={col.key} className={`whitespace-nowrap border-b border-slate-100 px-2 py-1.5 align-middle ${col.num ? 'text-right' : ''} ${i > 0 && COLUMNS[i - 1].group !== col.group ? 'border-l' : ''}`}>
                        {col.cell(code)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          ))}
        </table>
        {SECTIONS.length === 0 && <p className="sticky left-0 px-3 py-6 text-sm text-slate-500">No country matches.</p>}
      </div>
    </div>
  )
}
