// lib/admin/country-form.ts — the admin Countries page's form: what each box holds, how it becomes a
// stored value, and every rule a value must pass. PURE and CLIENT-SAFE: the page uses it to show a problem
// before Save, and the server runs the SAME functions again on what arrives (app/api/admin/countries), so
// the two can never disagree about what is allowed.
//
// ── UNITS ───────────────────────────────────────────────────────────────────────────────────────────────
// Plan prices and allowances are TYPED in major units ("29.00", "1,500") and STORED in minor units
// (2900, 150000) — converted by string arithmetic, never `* 100`, so "19.99" is 1999 and never 1998.99…
// The number of decimals comes from the currency (minorDigits), so a zero-decimal currency stores what is
// typed. Fixed card fees are typed and stored in minor units ("20" → 20p). Percentages are typed as
// written ("0.99" → 0.99%).
// ⚠️ Boxes use plain "1,500.00" style — comma thousands, dot decimal — whatever the country's language
// style, because a box an admin types into must parse the same way for every column.
//
// ── THE RULES ─────────────────────────────────────────────────────────────────────────────────────────
// Every CHECK on public.country_settings (20261010_02) is mirrored here, so an admin sees a plain sentence
// and never a database error, plus the page's own rule: its currency cannot change while trucks use it.
// "Switched on only when every public plan is priced here" is the DATABASE TRIGGER's rule since plans-data-model
// Stage A (20261024_plans.sql); lib/admin/country-actions.ts turns its refusal into ENABLE_NEEDS_PRICES.
// No message names a column.

import { PHONE_CHECKS, type CountrySettings, type PhoneCheck } from '@/lib/country-settings-types'
import { isPlausiblePhone } from '@/lib/phone'
import { minorDigits } from '@/lib/money-format'
import { CURRENCY_CODES, isSupportedCurrency } from '@/lib/currencies'
import { addressFormatKeyOf, isAddressFormatKey, type AddressFormatKey } from '@/lib/address-formats'

/** What every box on one country's column holds. Numbers are STRINGS — exactly what was typed. */
export interface CountryForm {
  enabled: boolean
  name: string
  cardFeeOnlinePct: string
  cardFeeOnlineFixed: string
  cardFeeInPersonPct: string
  cardFeeInPersonFixed: string
  tapToPayFixed: string
  cardFeeRegionLabel: string
  pricesIncludeTax: boolean
  taxLabel: string
  cardSurchargeAllowed: boolean
  cardSurchargeCapPct: string
  cardSurchargeCreditOnly: boolean
  cardSurchargeExcludedRegions: string[]
  serviceFeeAllowed: boolean
  tippingEnabledDefault: boolean
  tipPresetsPct: string[]
  // Phase 3 (20261010_17) — carried by the form so a save keeps them; the page shows no box for them yet.
  serviceFeeRecipient: 'truck' | 'hatchgrab'
  serviceFeeHatchgrabPct: string
  serviceFeeHatchgrabFixed: string
  serviceFeeTruckMaxPct: string
  serviceFeeTruckMaxFixed: string
  platformFeeEnabled: boolean
  feesTaxed: boolean
  currency: string
  locale: string
  timeFormat: '24h' | '12h'
  dateOrder: 'dmy' | 'mdy'
  weekStart: 'monday' | 'sunday'
  phoneCountryCode: string
  shortName: string
  phoneExample: string
  phoneCheck: PhoneCheck
  /** address-formats-1 (21 October 2026): a key of lib/address-formats.ts, picked from a dropdown. */
  addressFormat: AddressFormatKey
  timezones: string[]
  defaultTimezone: string
  allergenSet: 'uk14' | 'us9' | 'anz'
  /** allergen-card-country (21 October 2026): may trucks here show allergens as one card for the whole menu? */
  allergenCardOnlyAllowed: boolean
  supportHours: string
}

/** The stored values one save writes — everything on the row except its code and the save stamp. */
export type CountryValues = Omit<CountrySettings, 'countryCode' | 'updatedAt' | 'updatedBy'>

export interface FieldError { field: keyof CountryForm | 'countryCode' | 'copyFrom' | 'form'; message: string }

// ⛔ NO PLAN PRICE BOXES (plans-data-model, Stage A). The six old plan price columns are RETIRED: plans and their
// prices are public.plans / public.plan_prices. This form neither shows nor writes them, and a save leaves their
// stored values untouched (nothing reads them since Stage B, docs/pricing-pages-report.md).

/** The plain name of each box, as the page labels it — used in every message, so no column name shows. */
export const FIELD_LABELS: Record<keyof CountryForm, string> = {
  enabled: 'Switched on', name: 'Country name',
  cardFeeOnlinePct: 'Online card payments (%)', cardFeeOnlineFixed: 'Online card payments (fixed part)',
  cardFeeInPersonPct: 'In-person card payments (%)', cardFeeInPersonFixed: 'In-person card payments (fixed part)',
  tapToPayFixed: 'Extra for Tap to Pay', cardFeeRegionLabel: 'Which cards these rates are for',
  pricesIncludeTax: 'Menu prices include tax', taxLabel: 'Tax name',
  cardSurchargeAllowed: "Card fee can go on the customer's bill", cardSurchargeCapPct: 'Card fee cap',
  cardSurchargeCreditOnly: 'Credit cards only', cardSurchargeExcludedRegions: 'Card fee not allowed in',
  serviceFeeAllowed: 'Online service fee allowed', tippingEnabledDefault: 'Tipping on for new trucks',
  tipPresetsPct: 'Tip choices',
  serviceFeeRecipient: 'Who keeps the service fee',
  serviceFeeHatchgrabPct: 'Our service fee (%)', serviceFeeHatchgrabFixed: 'Our service fee (fixed part)',
  serviceFeeTruckMaxPct: "Most a truck's service fee can be (%)", serviceFeeTruckMaxFixed: "Most a truck's service fee can be (fixed part)",
  platformFeeEnabled: 'Our fee switched on', feesTaxed: 'Service fee and card fee are taxed',
  currency: 'Currency', locale: 'Language style', timeFormat: 'Times', dateOrder: 'Dates', weekStart: 'Week starts',
  phoneCountryCode: 'Phone country code', shortName: 'Short name', phoneExample: 'Example phone number', phoneCheck: 'Phone number check', addressFormat: 'Addresses', timezones: 'Time zones offered at signup',
  defaultTimezone: 'Default time zone', allergenSet: 'Allergen list', allergenCardOnlyAllowed: 'Allergen card on its own', supportHours: 'Support hours',
}

/** 🔴 THE ENABLED RULE IS THE DATABASE'S (the country_settings trigger, 20261024_plans.sql): a country can be switched
 *  on only when every active public plan has a plan_prices row for it. The page shows this sentence when it refuses. */
export const ENABLE_NEEDS_PRICES = "Can't switch on until every public plan has a price for this country (see Plans)"
export const STALE_SAVE = 'This country was changed elsewhere. Reload to see the latest.'

const INT_MAX = 2147483647

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// STORED → BOXES
// ════════════════════════════════════════════════════════════════════════════════════════════════════

/** Minor units → what a money box shows. Plan prices keep their decimals ("29.00"); allowances drop
 *  them when whole ("1,500"). Comma thousands, dot decimal, whatever the country. */
export function minorToBox(minor: number | null, currency: string, kind: 'price' | 'allowance'): string {
  if (minor === null) return ''
  const d = minorDigits(currency)
  const whole = minor % 10 ** d === 0
  const digits = kind === 'allowance' && whole ? 0 : d
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: true })
    .format(minor / 10 ** d)
}

const pctToBox = (n: number | null): string => (n === null ? '' : String(n))
/** Basis points → a percentage box: 350 → "3.5". Integer arithmetic on the string, never `/ 100` drift. */
const bpsToBox = (n: number | null): string => {
  if (n === null) return ''
  const s = String(n).padStart(3, '0')
  const whole = s.slice(0, -2).replace(/^0+(?=\d)/, '')
  const frac = s.slice(-2).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}
/** A typed percentage → basis points, by string arithmetic ("3.5" → 350). '' → null. */
export function boxToBps(text: string): number | null | 'bad' {
  const t = text.trim()
  if (t === '') return null
  const m = t.match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!m) return 'bad'
  const n = Number(m[1] + (m[2] ?? '').padEnd(2, '0'))
  return n >= 0 && n <= 10000 ? n : 'bad'
}

export function rowToForm(r: CountrySettings): CountryForm {
  return {
    enabled: r.enabled, name: r.name,
    cardFeeOnlinePct: pctToBox(r.cardFeeOnlinePct), cardFeeOnlineFixed: String(r.cardFeeOnlineFixedMinor),
    cardFeeInPersonPct: pctToBox(r.cardFeeInPersonPct), cardFeeInPersonFixed: String(r.cardFeeInPersonFixedMinor),
    tapToPayFixed: String(r.tapToPayFixedMinor), cardFeeRegionLabel: r.cardFeeRegionLabel,
    pricesIncludeTax: r.pricesIncludeTax, taxLabel: r.taxLabel,
    cardSurchargeAllowed: r.cardSurchargeAllowed, cardSurchargeCapPct: pctToBox(r.cardSurchargeCapPct),
    cardSurchargeCreditOnly: r.cardSurchargeCreditOnly, cardSurchargeExcludedRegions: [...r.cardSurchargeExcludedRegions],
    serviceFeeAllowed: r.serviceFeeAllowed, tippingEnabledDefault: r.tippingEnabledDefault,
    tipPresetsPct: r.tipPresetsPct.map(n => String(n)),
    serviceFeeRecipient: r.serviceFeeRecipient,
    serviceFeeHatchgrabPct: bpsToBox(r.serviceFeeHatchgrabBps),
    serviceFeeHatchgrabFixed: r.serviceFeeHatchgrabFixedMinor === null ? '' : String(r.serviceFeeHatchgrabFixedMinor),
    serviceFeeTruckMaxPct: bpsToBox(r.serviceFeeTruckMaxBps),
    serviceFeeTruckMaxFixed: r.serviceFeeTruckMaxFixedMinor === null ? '' : String(r.serviceFeeTruckMaxFixedMinor),
    platformFeeEnabled: r.platformFeeEnabled, feesTaxed: r.feesTaxed,
    currency: r.currency, locale: r.locale, timeFormat: r.timeFormat, dateOrder: r.dateOrder, weekStart: r.weekStart,
    phoneCountryCode: r.phoneCountryCode, shortName: r.shortName ?? '', phoneExample: r.phoneExample ?? '', phoneCheck: r.phoneCheck, addressFormat: addressFormatKeyOf(r.addressFormat) ?? r.addressFormat,   /* address-formats-1: a legacy value read as its format, as the loader does */
    timezones: [...r.timezones], defaultTimezone: r.defaultTimezone,
    allergenSet: r.allergenSet, allergenCardOnlyAllowed: r.allergenCardOnlyAllowed, supportHours: r.supportHours ?? '',
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// BOXES → STORED
// ════════════════════════════════════════════════════════════════════════════════════════════════════

/** A typed amount → minor units, by string arithmetic. '' → null (not decided). 'bad' → not an amount. */
export function boxToMinor(text: string, currency: string): number | null | 'bad' | 'too_many_decimals' {
  const t = text.replace(/[\s,]/g, '')
  if (t === '') return null
  const m = t.match(/^(\d+)(?:\.(\d+))?$/)
  if (!m) return 'bad'
  const d = minorDigits(currency)
  const frac = m[2] ?? ''
  if (frac.length > d) return 'too_many_decimals'
  const n = Number(m[1] + frac.padEnd(d, '0'))
  return Number.isSafeInteger(n) ? n : 'bad'
}

/** A typed percentage, as written. '' → null. Up to two decimals — the column is numeric(5,2). */
export function boxToPct(text: string): number | null | 'bad' {
  const t = text.trim()
  if (t === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return 'bad'
  const n = Number(t)
  return n >= 0 && n <= 100 ? n : 'bad'
}

/** A typed whole number of minor units ("20" → 20p). '' → 'empty'. */
function boxToWholeMinor(text: string): number | 'bad' | 'empty' {
  const t = text.trim()
  if (t === '') return 'empty'
  if (!/^\d+$/.test(t)) return 'bad'
  const n = Number(t)
  return n <= INT_MAX ? n : 'bad'
}

// currency-registry (21 October 2026): only a currency the registry lists (lib/currencies.ts) — the same list the
// database CHECK holds. It was "any ISO code Intl knows", which let a row hold a currency nothing had a sign for.
const isCurrencyCode = (c: string): boolean => isSupportedCurrency(c)
const isLocale = (l: string): boolean => {
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(l)) return false
  try { return Intl.getCanonicalLocales(l).length === 1 } catch { return false }
}
/** Is this an IANA time zone this runtime knows? */
export function isTimeZone(z: string): boolean {
  if (!z || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(z)) return false
  try { new Intl.DateTimeFormat('en', { timeZone: z }); return true } catch { return false }
}

/**
 * The whole column, converted and checked. Returns the stored values, or EVERY problem found (each with
 * the box it belongs to), never a partial save.
 * @param ctx.truckCount     trucks in this country — a currency cannot change while it is above 0
 * @param ctx.storedCurrency the currency the row holds now (absent for a brand-new country)
 */
export function formToValues(f: CountryForm, ctx: { truckCount: number; storedCurrency?: string; countryCode?: string }):
  { ok: true; values: CountryValues } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = []
  const err = (field: FieldError['field'], message: string) => errors.push({ field, message })

  // ── names and words ──
  const name = f.name.trim()
  if (!name) err('name', 'Give the country a name.')
  else if (name.length > 80) err('name', 'The country name is too long (80 characters at most).')
  const taxLabel = f.taxLabel.trim()
  if (!taxLabel) err('taxLabel', 'Give the tax a name, like VAT or Sales tax.')
  else if (taxLabel.length > 40) err('taxLabel', 'The tax name is too long (40 characters at most).')
  const cardFeeRegionLabel = f.cardFeeRegionLabel.trim()
  if (!cardFeeRegionLabel) err('cardFeeRegionLabel', 'Say which cards these rates are for, like UK cards.')
  else if (cardFeeRegionLabel.length > 60) err('cardFeeRegionLabel', 'Which cards these rates are for is too long (60 characters at most).')
  const supportHours = f.supportHours.trim()
  if (supportHours.length > 200) err('supportHours', 'Support hours are too long (200 characters at most).')

  // ── the currency first: every money box is read in it ──
  const currency = f.currency.trim().toUpperCase()
  const currencyOk = isCurrencyCode(currency)
  if (!currencyOk) err('currency', `Currency must be one we support: ${CURRENCY_CODES.join(', ')}.`)
  else if (ctx.storedCurrency && currency !== ctx.storedCurrency && ctx.truckCount > 0) {
    err('currency', `The currency can't change while ${ctx.truckCount} ${ctx.truckCount === 1 ? 'truck uses' : 'trucks use'} this country.`)
  }

  const pct = (field: 'cardFeeOnlinePct' | 'cardFeeInPersonPct' | 'cardSurchargeCapPct', required: boolean): number | null => {
    const v = boxToPct(f[field])
    if (v === 'bad') { err(field, `${FIELD_LABELS[field]} must be a percentage between 0 and 100, with at most 2 decimal places.`); return null }
    if (v === null && required) { err(field, `${FIELD_LABELS[field]} can't be empty.`); return null }
    return v
  }

  // 🔴 THE ENABLED RULE is the database trigger's (every active public plan priced here) — see ENABLE_NEEDS_PRICES.

  // ── Stripe's card fees ──
  const cardFeeOnlinePct = pct('cardFeeOnlinePct', true)
  const cardFeeInPersonPct = pct('cardFeeInPersonPct', true)
  const whole = (field: 'cardFeeOnlineFixed' | 'cardFeeInPersonFixed' | 'tapToPayFixed'): number | null => {
    const v = boxToWholeMinor(f[field])
    if (v === 'empty') { err(field, `${FIELD_LABELS[field]} can't be empty — type 0 for none.`); return null }
    if (v === 'bad') { err(field, `${FIELD_LABELS[field]} must be a whole number of the currency's smallest unit, like 20.`); return null }
    return v
  }
  const cardFeeOnlineFixedMinor = whole('cardFeeOnlineFixed')
  const cardFeeInPersonFixedMinor = whole('cardFeeInPersonFixed')
  const tapToPayFixedMinor = whole('tapToPayFixed')

  // ── what trucks can offer customers ──
  const cardSurchargeCapPct = pct('cardSurchargeCapPct', false)
  const regions = f.cardSurchargeExcludedRegions.map(r => r.trim().toUpperCase()).filter(Boolean)
  const badRegion = regions.find(r => !/^[A-Z0-9]{1,3}(-[A-Z0-9]{1,3})?$/.test(r))
  if (badRegion) err('cardSurchargeExcludedRegions', `“${badRegion}” isn't a region code — use a short code like CT or MA.`)
  if (new Set(regions).size !== regions.length) err('cardSurchargeExcludedRegions', 'Each region can only appear once.')
  const tips: number[] = []
  for (const t of f.tipPresetsPct) {
    const v = boxToPct(t)
    if (v === null || v === 'bad') { err('tipPresetsPct', 'Tip choices must be percentages between 0 and 100, with at most 2 decimal places.'); break }
    tips.push(v)
  }
  if (new Set(tips).size !== tips.length) err('tipPresetsPct', 'Each tip choice can only appear once.')

  // ── Phase 3: the service fee's owner and amounts, the platform-fee switch, fees taxed ──
  if (f.serviceFeeRecipient !== 'truck' && f.serviceFeeRecipient !== 'hatchgrab') err('serviceFeeRecipient', 'Choose who keeps the service fee.')
  const bps = (field: 'serviceFeeHatchgrabPct' | 'serviceFeeTruckMaxPct'): number | null => {
    const v = boxToBps(f[field])
    if (v === 'bad') { err(field, `${FIELD_LABELS[field]} must be a percentage between 0 and 100, with at most 2 decimal places.`); return null }
    return v
  }
  const optionalWhole = (field: 'serviceFeeHatchgrabFixed' | 'serviceFeeTruckMaxFixed'): number | null => {
    const v = boxToWholeMinor(f[field])
    if (v === 'empty') return null
    if (v === 'bad') { err(field, `${FIELD_LABELS[field]} must be a whole number of the currency's smallest unit, like 50.`); return null }
    return v
  }
  const serviceFeeHatchgrabBps = bps('serviceFeeHatchgrabPct')
  const serviceFeeHatchgrabFixedMinor = optionalWhole('serviceFeeHatchgrabFixed')
  const serviceFeeTruckMaxBps = bps('serviceFeeTruckMaxPct')
  const serviceFeeTruckMaxFixedMinor = optionalWhole('serviceFeeTruckMaxFixed')

  // ── formats ──
  const locale = f.locale.trim()
  if (!isLocale(locale)) err('locale', 'Language style must look like en-GB or en-US.')
  if (f.timeFormat !== '24h' && f.timeFormat !== '12h') err('timeFormat', 'Choose 24-hour or 12-hour times.')
  if (f.dateOrder !== 'dmy' && f.dateOrder !== 'mdy') err('dateOrder', 'Choose day first or month first.')
  if (f.weekStart !== 'monday' && f.weekStart !== 'sunday') err('weekStart', 'Choose Monday or Sunday.')
  const phoneCountryCode = f.phoneCountryCode.trim().replace(/^\+/, '')
  if (!/^[1-9][0-9]{0,2}$/.test(phoneCountryCode)) err('phoneCountryCode', 'Phone country code must be 1 to 3 digits, like 44 or 1.')
  // Phase 2C — both optional (nullable columns), each with a length cap like Support hours; the example must
  // also be a number this country would accept, since it is printed as an example of one — judged by the
  // check this country is SET to (20261010_12), so a country cannot be put on 'strict' with an example the
  // strict check refuses, nor have its example changed to one, while it is on 'strict'.
  const phoneCheck = f.phoneCheck
  if (!(PHONE_CHECKS as readonly string[]).includes(phoneCheck)) err('phoneCheck', 'Choose how phone numbers are checked.')
  const shortName = f.shortName.trim()
  if (shortName.length > 20) err('shortName', 'The short name is too long (20 characters at most).')
  const phoneExample = f.phoneExample.trim()
  if (phoneExample.length > 30) err('phoneExample', 'The example phone number is too long (30 characters at most).')
  else if (phoneExample && ctx.countryCode && (PHONE_CHECKS as readonly string[]).includes(phoneCheck)
    && !isPlausiblePhone(phoneExample, ctx.countryCode, phoneCheck)) {
    err('phoneExample', phoneCheck === 'strict'
      ? "The example number isn't accepted by the strict check — change the example first"
      : `“${phoneExample}” isn't a phone number this country would accept.`)
  }
  if (!isAddressFormatKey(f.addressFormat)) err('addressFormat', 'Choose how addresses are written.')   // address-formats-1: the config's keys only
  const timezones = f.timezones.map(z => z.trim()).filter(Boolean)
  if (timezones.length === 0) err('timezones', 'Offer at least one time zone.')
  const badZone = timezones.find(z => !isTimeZone(z))
  if (badZone) err('timezones', `“${badZone}” isn't a time zone we recognise.`)
  if (new Set(timezones).size !== timezones.length) err('timezones', 'Each time zone can only appear once.')
  if (!timezones.includes(f.defaultTimezone)) err('defaultTimezone', 'The default time zone has to be one of the zones offered.')
  if (f.allergenSet !== 'uk14' && f.allergenSet !== 'us9' && f.allergenSet !== 'anz') err('allergenSet', 'Choose an allergen list.')

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    values: {
      name, enabled: f.enabled,
      currency, locale, timeFormat: f.timeFormat, dateOrder: f.dateOrder, weekStart: f.weekStart,
      phoneCountryCode, shortName: shortName || null, phoneExample: phoneExample || null, phoneCheck,
      addressFormat: f.addressFormat, timezones, defaultTimezone: f.defaultTimezone,
      pricesIncludeTax: f.pricesIncludeTax, taxLabel,
      cardSurchargeAllowed: f.cardSurchargeAllowed, cardSurchargeCapPct,
      cardSurchargeCreditOnly: f.cardSurchargeCreditOnly, cardSurchargeExcludedRegions: regions,
      serviceFeeAllowed: f.serviceFeeAllowed, tippingEnabledDefault: f.tippingEnabledDefault, tipPresetsPct: tips,
      allergenSet: f.allergenSet, allergenCardOnlyAllowed: f.allergenCardOnlyAllowed,
      cardFeeOnlinePct: cardFeeOnlinePct as number, cardFeeOnlineFixedMinor: cardFeeOnlineFixedMinor as number,
      cardFeeInPersonPct: cardFeeInPersonPct as number, cardFeeInPersonFixedMinor: cardFeeInPersonFixedMinor as number,
      tapToPayFixedMinor: tapToPayFixedMinor as number, cardFeeRegionLabel,
      serviceFeeRecipient: f.serviceFeeRecipient,
      serviceFeeHatchgrabBps, serviceFeeHatchgrabFixedMinor, serviceFeeTruckMaxBps, serviceFeeTruckMaxFixedMinor,
      platformFeeEnabled: f.platformFeeEnabled, feesTaxed: f.feesTaxed,
      supportHours: supportHours || null,
    },
  }
}

/** The add-country form's three answers, checked. */
export function checkNewCountry(input: { code: string; name: string; copyFrom: string }, existing: string[]): FieldError[] {
  const errors: FieldError[] = []
  const code = input.code.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) errors.push({ field: 'countryCode', message: 'The country code must be two letters, like FR or IE.' })
  else if (existing.includes(code)) errors.push({ field: 'countryCode', message: `There is already a country with the code ${code}.` })
  if (!input.name.trim()) errors.push({ field: 'name', message: 'Give the country a name.' })
  else if (input.name.trim().length > 80) errors.push({ field: 'name', message: 'The country name is too long (80 characters at most).' })
  if (!existing.includes(input.copyFrom)) errors.push({ field: 'copyFrom', message: 'Choose a country to copy the settings from.' })
  return errors
}

/** Parse an untrusted request body into a CountryForm, or null if it is not one. The SERVER's first step. */
export function asCountryForm(x: unknown): CountryForm | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const strs = ['name',
    'cardFeeOnlinePct', 'cardFeeOnlineFixed', 'cardFeeInPersonPct', 'cardFeeInPersonFixed', 'tapToPayFixed',
    'cardFeeRegionLabel', 'taxLabel', 'cardSurchargeCapPct', 'currency', 'locale', 'timeFormat', 'dateOrder', 'weekStart',
    'phoneCountryCode', 'shortName', 'phoneExample', 'phoneCheck', 'addressFormat', 'defaultTimezone', 'allergenSet', 'supportHours',
    'serviceFeeRecipient', 'serviceFeeHatchgrabPct', 'serviceFeeHatchgrabFixed', 'serviceFeeTruckMaxPct', 'serviceFeeTruckMaxFixed']
  const bools = ['enabled', 'pricesIncludeTax', 'cardSurchargeAllowed', 'cardSurchargeCreditOnly', 'serviceFeeAllowed', 'tippingEnabledDefault',
    'platformFeeEnabled', 'feesTaxed', 'allergenCardOnlyAllowed']   // allergen-card-country: on or off, nothing else
  const lists = ['cardSurchargeExcludedRegions', 'tipPresetsPct', 'timezones']
  if (strs.some(k => typeof o[k] !== 'string')) return null
  if (bools.some(k => typeof o[k] !== 'boolean')) return null
  if (lists.some(k => !Array.isArray(o[k]) || (o[k] as unknown[]).some(v => typeof v !== 'string'))) return null
  return o as unknown as CountryForm
}
