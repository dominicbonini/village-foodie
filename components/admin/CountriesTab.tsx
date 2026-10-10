'use client'
// components/admin/CountriesTab.tsx — Admin › Countries: every country's prices, card fees, options and
// formats side by side, one column per country, each column saved on its own.
//
// ── WHAT THIS PAGE IS FOR ─────────────────────────────────────────────────────────────────────────────
// public.country_settings holds everything country-specific the app shows or charges (Parts A and B). This
// is the only way to change it without SQL. The data arrives from /api/admin/countries (admin-only,
// service role); the browser never reads the table.
//
// ── LAYOUT ────────────────────────────────────────────────────────────────────────────────────────────
// ONE GRID: a Setting column, then a column per country (the public pages' country first, then by name).
// The country header row is pinned while the box scrolls, and so is the Setting column; on a narrow screen
// the grid scrolls sideways INSIDE its box, and the page itself never does. Nothing is folded away — every
// row is visible without opening anything. Same layout on a laptop and on a large monitor.
//
// ── RULES ─────────────────────────────────────────────────────────────────────────────────────────────
// Every rule is lib/admin/country-form.ts, the same code the server runs again on Save, so a problem shows
// here before Save and can never be waved through by the server. Messages are plain sentences; no column
// name appears on screen.

import { useEffect, useMemo, useState } from 'react'
import { nativeAuthHeader } from '@/lib/native/session'
import type { CountrySettings } from '@/lib/country-settings-types'
import {
  rowToForm, formToValues, emptyPlanPrices, isTimeZone, ENABLE_NEEDS_PRICES,
  type CountryForm, type FieldError,
} from '@/lib/admin/country-form'
import { currencySymbol, minorUnitSuffix } from '@/lib/money-format'

type Field = keyof CountryForm
interface ColumnState { saving: boolean; error: string | null; errors: FieldError[]; saved: boolean; confirmRemove: boolean; removing: boolean }
const IDLE: ColumnState = { saving: false, error: null, errors: [], saved: false, confirmRemove: false, removing: false }

const BOX = 'w-full min-w-0 rounded-lg border bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:bg-slate-100 disabled:text-slate-500'
const OK_BORDER = 'border-slate-200'
const BAD_BORDER = 'border-red-400'
const EMPTY_BORDER = 'border-amber-300 bg-amber-50'

// ── the examples beside the Times and Dates choices, in the column's own language style ──
const SAMPLE = new Date(Date.UTC(2026, 11, 31, 18, 30))
function timeExample(locale: string, h12: boolean): string {
  try { return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: h12, timeZone: 'UTC' }).format(SAMPLE) }
  catch { return h12 ? '6:30 pm' : '18:30' }
}
const ALL_ZONES: string[] = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []

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

export default function CountriesTab() {
  const [rows, setRows] = useState<CountrySettings[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [forms, setForms] = useState<Record<string, CountryForm>>({})
  const [cols, setCols] = useState<Record<string, ColumnState>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState({ code: '', name: '', copyFrom: '' })
  const [addErrors, setAddErrors] = useState<FieldError[]>([])
  const [addBusy, setAddBusy] = useState(false)

  // The first read. State is set only AFTER the await, and not at all if the tab unmounted meanwhile.
  useEffect(() => {
    let cancelled = false
    call('GET').then(r => {
      if (cancelled) return
      if (!r.ok) { setLoadError(typeof r.data.error === 'string' ? r.data.error : 'The countries could not be loaded.'); setLoaded(true); return }
      const list = r.data.countries as CountrySettings[]
      setRows(list)
      setCounts(r.data.truckCounts as Record<string, number>)
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

  // Live checks, per column — the same function the server runs on Save.
  const problems = useMemo(() => Object.fromEntries(rows.map(r => {
    const f = forms[r.countryCode]
    if (!f) return [r.countryCode, [] as FieldError[]]
    const res = formToValues(f, { truckCount: counts[r.countryCode] ?? 0, storedCurrency: r.currency, countryCode: r.countryCode })
    return [r.countryCode, res.ok ? [] : res.errors]
  })), [rows, forms, counts])

  if (!loaded) return <p className="text-sm text-slate-500">Loading countries…</p>
  if (loadError) return <p className="text-sm font-semibold text-red-600">{loadError}</p>

  const n = rows.length
  const gridCols = `minmax(210px, 240px) repeat(${n}, minmax(280px, 1fr))`

  // ── one cell's widgets ─────────────────────────────────────────────────────────────────────────────
  const errorFor = (code: string, field: Field) =>
    (cols[code]?.errors ?? []).find(e => e.field === field)?.message
    ?? (problems[code] ?? []).find(e => e.field === field && field !== 'enabled')?.message
  const msg = (code: string, field: Field) => {
    const m = errorFor(code, field)
    return m ? <p className="mt-1 text-xs font-medium text-red-600">{m}</p> : null
  }
  const border = (code: string, field: Field, emptyAmber = false) =>
    errorFor(code, field) ? BAD_BORDER : emptyAmber && forms[code][field] === '' ? EMPTY_BORDER : OK_BORDER

  const moneyOf = (code: string) => {
    const f = forms[code]; const row = rows.find(r => r.countryCode === code)!
    const cur = /^[A-Z]{3}$/.test(f.currency.trim().toUpperCase()) ? f.currency.trim().toUpperCase() : row.currency
    let sym = cur
    try { sym = currencySymbol({ currency: cur, locale: f.locale || row.locale }) } catch { /* unknown locale → the code */ }
    return { sym, small: minorUnitSuffix(cur) ?? `${cur} minor units` }
  }

  const toggle = (code: string, field: Field, label: string, disabled?: boolean) => {
    const on = forms[code][field] as boolean
    return (
      <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
        onClick={() => setField(code, field, !on as CountryForm[typeof field])}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-orange-500' : 'bg-slate-300'}`}>
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    )
  }

  const money = (code: string, field: 'starterMonthly' | 'proMonthly' | 'maxMonthly' | 'proAllowance' | 'maxAllowance') => (
    <>
      <div className={`flex max-w-[14rem] items-center rounded-lg border ${border(code, field, true)} px-2`}>
        <span className="pr-1 text-sm font-semibold text-slate-500">{moneyOf(code).sym}</span>
        <input className="w-full min-w-0 bg-transparent py-1.5 text-sm text-slate-900 focus:outline-none" inputMode="decimal"
          aria-label={`${field} for ${code}`} value={forms[code][field]} placeholder="Not set"
          onChange={e => setField(code, field, e.target.value)} />
      </div>
      {msg(code, field)}
    </>
  )
  const pct = (code: string, field: 'platformFeePct' | 'cardFeeOnlinePct' | 'cardFeeInPersonPct' | 'cardSurchargeCapPct', amber?: boolean) => (
    <div className={`flex w-24 items-center rounded-lg border ${border(code, field, amber)} px-2`}>
      <input className="w-full min-w-0 bg-transparent py-1.5 text-sm text-slate-900 focus:outline-none" inputMode="decimal"
        aria-label={`${field} for ${code}`} value={forms[code][field]} placeholder={amber ? 'Not set' : ''}
        onChange={e => setField(code, field, e.target.value)} />
      <span className="pl-1 text-sm font-semibold text-slate-500">%</span>
    </div>
  )
  const fixed = (code: string, field: 'cardFeeOnlineFixed' | 'cardFeeInPersonFixed' | 'tapToPayFixed') => (
    <div className={`flex w-24 items-center rounded-lg border ${border(code, field)} px-2`}>
      <input className="w-full min-w-0 bg-transparent py-1.5 text-sm text-slate-900 focus:outline-none" inputMode="numeric"
        aria-label={`${field} for ${code}`} value={forms[code][field]} onChange={e => setField(code, field, e.target.value)} />
      <span className="pl-1 text-sm font-semibold text-slate-500">{moneyOf(code).small}</span>
    </div>
  )
  const text = (code: string, field: 'name' | 'taxLabel' | 'cardFeeRegionLabel' | 'supportHours' | 'locale' | 'currency' | 'shortName' | 'phoneExample', placeholder?: string, max?: string) => (
    <>
      <input className={`${BOX} ${border(code, field)} ${max ?? ''}`} aria-label={`${field} for ${code}`} value={forms[code][field]}
        placeholder={placeholder} onChange={e => setField(code, field, e.target.value)} />
      {msg(code, field)}
    </>
  )
  function choice<K extends 'timeFormat' | 'dateOrder' | 'weekStart' | 'addressFormat' | 'allergenSet' | 'defaultTimezone' | 'phoneCheck'>(
    code: string, field: K, options: [string, string][]) {
    return (
      <>
        <select className={`${BOX} ${border(code, field)} max-w-[18rem]`} aria-label={`${field} for ${code}`} value={forms[code][field] as string}
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
        <div className="flex flex-wrap items-center gap-1.5">
          {list.map(v => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2.5 pr-1 text-xs font-semibold text-slate-700">
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
              className={`${BOX} ${OK_BORDER} ${field === 'timezones' ? 'w-44' : 'w-20'} py-0.5 text-xs`} />
            {suggestions && <datalist id={listId}>{suggestions.map(z => <option key={z} value={z} />)}</datalist>}
            <button type="submit" className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Add</button>
          </form>
        </div>
        {msg(code, field)}
      </>
    )
  }
  const dash = () => <span className="text-slate-300">—</span>

  // ── the rows, in the approved order ─────────────────────────────────────────────────────────────────
  type RowDef = { group: string; hint?: string } | { label: string; hint?: string; cell: (code: string) => React.ReactNode }
  const ROWS: RowDef[] = [
    { group: 'Status' },
    { label: 'Switched on', hint: 'Trucks can sign up from this country', cell: code => {
      const f = forms[code]; const missing = emptyPlanPrices(f).length > 0
      return (
        <div className="flex items-start gap-2">
          {toggle(code, 'enabled', `Switched on, ${code}`, !f.enabled && missing)}
          {missing && <span className="text-xs font-medium text-amber-700">{ENABLE_NEEDS_PRICES}</span>}
        </div>
      )
    } },
    { label: 'Country name', cell: code => text(code, 'name', undefined, 'max-w-[18rem]') },

    { group: 'HatchGrab plan prices', hint: "What trucks pay us, in the country's currency" },
    { label: 'Starter, per month', cell: code => money(code, 'starterMonthly') },
    { label: 'Pro, per month', cell: code => money(code, 'proMonthly') },
    { label: 'Max, per month', cell: code => money(code, 'maxMonthly') },
    { label: 'Pro, online orders included', hint: 'Each month, before our fee starts', cell: code => money(code, 'proAllowance') },
    { label: 'Max, online orders included', hint: 'Each month, before our fee starts', cell: code => money(code, 'maxAllowance') },
    { label: 'Our fee above that', cell: code => <>{pct(code, 'platformFeePct', true)}{msg(code, 'platformFeePct')}</> },
    { label: 'Extra van', cell: () => <span className="text-sm text-slate-500">Same as the plan&apos;s monthly price</span> },

    { group: 'Stripe card fees', hint: 'As we quote them on pricing pages and in Payments' },
    { label: 'Online card payments', cell: code => (
      <><div className="flex items-center gap-1.5 text-sm text-slate-500">{pct(code, 'cardFeeOnlinePct')} + {fixed(code, 'cardFeeOnlineFixed')}</div>
        {msg(code, 'cardFeeOnlinePct')}{msg(code, 'cardFeeOnlineFixed')}</>
    ) },
    { label: 'In-person card payments', cell: code => (
      <><div className="flex items-center gap-1.5 text-sm text-slate-500">{pct(code, 'cardFeeInPersonPct')} + {fixed(code, 'cardFeeInPersonFixed')}</div>
        {msg(code, 'cardFeeInPersonPct')}{msg(code, 'cardFeeInPersonFixed')}</>
    ) },
    { label: 'Extra for Tap to Pay', hint: 'Per payment, on a phone or tablet with no card reader', cell: code => <>{fixed(code, 'tapToPayFixed')}{msg(code, 'tapToPayFixed')}</> },
    { label: 'Which cards these rates are for', hint: 'Shown as “on UK cards”', cell: code => text(code, 'cardFeeRegionLabel', undefined, 'max-w-[18rem]') },

    { group: 'What trucks can offer customers' },
    { label: 'Menu prices include tax', cell: code => (
      <><div className="flex items-center gap-2">{toggle(code, 'pricesIncludeTax', `Menu prices include tax, ${code}`)}
        <span className="text-xs text-slate-500">Tax name</span>
        <input className={`${BOX} ${border(code, 'taxLabel')} max-w-[9rem]`} aria-label={`taxLabel for ${code}`} value={forms[code].taxLabel}
          onChange={e => setField(code, 'taxLabel', e.target.value)} /></div>{msg(code, 'taxLabel')}</>
    ) },
    { label: "Card fee can go on the customer's bill", hint: "Shows 'Who pays the card fee' in Manage › Payments", cell: code => toggle(code, 'cardSurchargeAllowed', `Card fee can go on the customer's bill, ${code}`) },
    { label: 'Card fee limits', cell: code => forms[code].cardSurchargeAllowed ? (
      <><div className="flex flex-wrap items-center gap-2 text-sm text-slate-600"><span className="text-xs text-slate-500">Cap</span>{pct(code, 'cardSurchargeCapPct')}
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={forms[code].cardSurchargeCreditOnly}
          onChange={e => setField(code, 'cardSurchargeCreditOnly', e.target.checked)} />Credit cards only</label></div>
        {msg(code, 'cardSurchargeCapPct')}</>
    ) : dash() },
    { label: 'Card fee not allowed in', cell: code => forms[code].cardSurchargeAllowed
      ? chips(code, 'cardSurchargeExcludedRegions', 'e.g. CT') : dash() },
    { label: 'Online service fee allowed', cell: code => toggle(code, 'serviceFeeAllowed', `Online service fee allowed, ${code}`) },
    { label: 'Tipping on for new trucks', hint: 'And the tip choices offered', cell: code => (
      <div className="flex flex-wrap items-center gap-2">{toggle(code, 'tippingEnabledDefault', `Tipping on for new trucks, ${code}`)}
        {chips(code, 'tipPresetsPct', 'e.g. 15', '%')}</div>
    ) },

    { group: 'Formats' },
    { label: 'Currency', cell: code => {
      const trucks = counts[code] ?? 0
      return trucks > 0 ? (
        <div className="flex items-center gap-2"><span className="rounded-lg bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-700">{forms[code].currency}</span>
          <span className="text-xs text-slate-500">🔒 {trucks} {trucks === 1 ? 'truck uses' : 'trucks use'} it</span></div>
      ) : text(code, 'currency', undefined, 'max-w-[6rem] uppercase')
    } },
    { label: 'Language style', hint: 'How dates and numbers are written', cell: code => text(code, 'locale', 'en-GB', 'max-w-[8rem]') },
    { label: 'Times', cell: code => choice(code, 'timeFormat', [['24h', `24-hour (${timeExample(forms[code].locale, false)})`], ['12h', `12-hour (${timeExample(forms[code].locale, true)})`]]) },
    { label: 'Dates', cell: code => choice(code, 'dateOrder', [['dmy', 'Day first (31/12/2026)'], ['mdy', 'Month first (12/31/2026)']]) },
    { label: 'Week starts', cell: code => choice(code, 'weekStart', [['monday', 'Monday'], ['sunday', 'Sunday']]) },
    { label: 'Phone country code', cell: code => (
      <><div className={`flex w-24 items-center rounded-lg border ${border(code, 'phoneCountryCode')} px-2`}><span className="pr-0.5 text-sm font-semibold text-slate-500">+</span>
        <input className="w-full min-w-0 bg-transparent py-1.5 text-sm text-slate-900 focus:outline-none" inputMode="numeric" aria-label={`phoneCountryCode for ${code}`}
          value={forms[code].phoneCountryCode} onChange={e => setField(code, 'phoneCountryCode', e.target.value)} /></div>
        {msg(code, 'phoneCountryCode')}</>
    ) },
    { label: 'Short name', hint: 'As in "a valid UK mobile"', cell: code => text(code, 'shortName', 'UK', 'max-w-[8rem]') },
    { label: 'Example phone number', hint: 'Shown in phone boxes and errors', cell: code => text(code, 'phoneExample', '07700 900123', 'max-w-[12rem]') },
    { label: 'Phone number check', cell: code => choice(code, 'phoneCheck', [['length', 'Standard — right length for the country'], ['strict', 'Strict — real numbers only'], ['off', 'Off — accept anything']]) },
    { label: 'Addresses', cell: code => choice(code, 'addressFormat', [['postcode', 'Town and postcode'], ['zip_state', 'City, state and ZIP']]) },
    { label: 'Time zones offered at signup', cell: code => chips(code, 'timezones', 'Add a zone', undefined, ALL_ZONES.filter(z => !forms[code].timezones.includes(z))) },
    { label: 'Default time zone', hint: 'Only the zones offered', cell: code => {
      const zones = forms[code].timezones.filter(isTimeZone)
      const opts: [string, string][] = zones.map(z => [z, z.replace(/_/g, ' ')])
      if (!zones.includes(forms[code].defaultTimezone)) opts.unshift([forms[code].defaultTimezone, `${forms[code].defaultTimezone.replace(/_/g, ' ')} (not offered)`])
      return choice(code, 'defaultTimezone', opts)
    } },

    { group: 'Allergens and support' },
    { label: 'Allergen list', cell: code => choice(code, 'allergenSet', [['uk14', 'UK 14'], ['us9', 'US 9']]) },
    { label: 'Support hours', cell: code => text(code, 'supportHours', 'Not shown', 'max-w-[18rem]') },
  ]

  const fmtSaved = (iso: string) => {
    try { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return iso }
  }

  return (
    <div className="space-y-3" data-countries-page>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">Countries</h2>
          <p className="text-sm text-slate-500">Prices, card fees and formats for each country. Each column saves on its own.</p>
        </div>
        <button type="button" onClick={() => { setAdding(v => !v); setAddErrors([]) }}
          className="whitespace-nowrap rounded-xl bg-orange-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-orange-700">
          + Add country
        </button>
      </div>

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

      {/* 🔴 THE BOX SCROLLS, THE PAGE DOES NOT. overflow-auto in both directions with a height cap is what
          makes `sticky top-0` (the country headers) and `sticky left-0` (the Setting column) stick: a sticky
          element sticks to its nearest scrolling ancestor, and this box is it. */}
      <div className="max-h-[calc(100dvh-210px)] overflow-auto rounded-2xl border border-slate-200 bg-white" data-countries-grid>
        <div className="grid text-sm" style={{ gridTemplateColumns: gridCols, minWidth: 210 + n * 280 }}>
          {/* ── the pinned header row ── */}
          <div className="sticky left-0 top-0 z-30 border-b border-slate-200 bg-white px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Setting</div>
          {rows.map(r => {
            const code = r.countryCode; const c = cols[code] ?? IDLE; const f = forms[code]
            const trucks = counts[code] ?? 0
            const dirty = JSON.stringify(f) !== JSON.stringify(rowToForm(r))
            const blocking = (problems[code] ?? []).length > 0
            const missing = emptyPlanPrices(f).length > 0
            const canRemove = trucks === 0 && !r.enabled
            return (
              <div key={code} data-country-head={code} className="sticky top-0 z-20 border-b border-l border-slate-200 bg-white px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-slate-900">{r.name} <span className="text-sm font-semibold text-slate-400">{code}</span></p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.enabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {r.enabled ? 'Switched on' : 'Off'}</span>
                      <span className="text-xs text-slate-500">{trucks} {trucks === 1 ? 'truck' : 'trucks'}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">Last saved {fmtSaved(r.updatedAt)}{r.updatedBy ? ` by ${r.updatedBy}` : ''}</p>
                  </div>
                  <button type="button" onClick={() => void save(r)} disabled={!dirty || blocking || c.saving}
                    className="shrink-0 rounded-xl bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-500">
                    {c.saving ? 'Saving…' : 'Save'}</button>
                </div>
                {missing && <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">{ENABLE_NEEDS_PRICES}</p>}
                {c.error && <p className="mt-2 text-xs font-semibold text-red-600" role="alert">{c.error}</p>}
                {!c.error && blocking && dirty && <p className="mt-2 text-xs font-medium text-red-600">Fix the boxes marked in red to save.</p>}
                {c.saved && !dirty && <p className="mt-2 text-xs font-semibold text-green-700">Saved. Live on the pricing pages within a minute.</p>}
                {canRemove && (c.confirmRemove ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-700">Remove {r.name}? This can&apos;t be undone.</span>
                    <button type="button" disabled={c.removing} onClick={() => void remove(r)} className="rounded-lg bg-red-600 px-2 py-1 font-semibold text-white disabled:opacity-60">{c.removing ? 'Removing…' : 'Remove'}</button>
                    <button type="button" onClick={() => setCol(code, { confirmRemove: false })} className="rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-600">Cancel</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setCol(code, { confirmRemove: true })} className="mt-2 text-xs font-semibold text-slate-400 underline hover:text-red-600">Remove country</button>
                ))}
              </div>
            )
          })}

          {/* ── the rows ── */}
          {ROWS.map((def, i) => 'group' in def ? (
            <div key={`g${i}`} className="border-t border-slate-200 bg-slate-50 px-3 py-2" style={{ gridColumn: '1 / -1' }}>
              <span className="sticky left-3 text-xs font-bold uppercase tracking-wide text-slate-600">{def.group}</span>
              {def.hint && <span className="sticky left-3 ml-2 text-xs text-slate-400">{def.hint}</span>}
            </div>
          ) : [
            <div key={`l${i}`} className="sticky left-0 z-10 border-t border-slate-100 bg-white px-3 py-2">
              <p className="text-sm font-semibold text-slate-800">{def.label}</p>
              {def.hint && <p className="text-xs text-slate-400">{def.hint}</p>}
            </div>,
            ...rows.map(r => (
              <div key={`${i}-${r.countryCode}`} className="min-w-0 border-l border-t border-slate-100 px-3 py-2">{def.cell(r.countryCode)}</div>
            )),
          ])}
        </div>
      </div>
    </div>
  )
}
