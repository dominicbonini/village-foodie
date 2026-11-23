// lib/business-details.ts — france-records-1 (24 November 2026, docs/france-records-1-report.md): Manage › Settings › Business details.
//
// PURE AND CLIENT-SAFE: the card checks a value before it sends it, and `update_business_details` runs the SAME function on what
// arrives, so the two can never disagree. Every field is optional; a blank box clears it (NULL).
//   legal name           free text, up to 200 characters;
//   registered address   in the truck's address format: { address, town, suburb, region, postcode }, each up to 200;
//   registration number  France (and its overseas departments): SIREN (9 digits) or SIRET (14), Luhn-checked (La Poste's SIRETs, SIREN
//                        356000000, sum to a multiple of 5 instead); GB: a company number, 8 letters or digits; elsewhere free text;
//   VAT number           EU countries: the country's prefix and pattern (format only — no VIES check here); elsewhere free text;
//   VAT regime           France only: franchise | reel_simplifie | reel_normal_monthly | reel_normal_quarterly.
// A refusal is an `errorsManage.business_*` code and its values (the card words it in the truck's language).

export type VatRegime = 'franchise' | 'reel_simplifie' | 'reel_normal_monthly' | 'reel_normal_quarterly'
export const VAT_REGIMES: readonly VatRegime[] = ['franchise', 'reel_simplifie', 'reel_normal_monthly', 'reel_normal_quarterly']

export interface RegisteredAddress { address?: string | null; town?: string | null; suburb?: string | null; region?: string | null; postcode?: string | null }
export interface BusinessDetailsInput {
  legalName?: unknown
  registeredAddress?: unknown
  registrationNumber?: unknown
  vatNumber?: unknown
  vatRegime?: unknown
}
export interface BusinessDetailsValues {
  legal_name?: string | null
  registered_address?: RegisteredAddress | null
  registration_number?: string | null
  vat_number?: string | null
  vat_regime?: VatRegime | null
}
export type BusinessErrorCode = 'business_too_long' | 'business_siren_invalid' | 'business_company_number_invalid' | 'business_vat_invalid'
  | 'business_regime_invalid' | 'business_regime_not_here' | 'business_nothing_to_save'
export type BusinessRefusal = { ok: false; code: BusinessErrorCode; params: Record<string, string> }

/** France and the overseas departments that use the French registers and VAT (the same SIREN / SIRET and FR VAT numbers). */
const FR_REGISTER = new Set(['FR', 'GP', 'MQ', 'GF', 'RE', 'YT'])
/** Which registration-number rule a country uses: France's SIREN/SIRET, GB's company number, or free text. */
export type RegistrationKind = 'siren' | 'gb_company' | 'free'
export const registrationKindOf = (country: string | null | undefined): RegistrationKind => {
  const c = String(country ?? '').toUpperCase()
  return FR_REGISTER.has(c) ? 'siren' : c === 'GB' ? 'gb_company' : 'free'
}
/** The VAT regime is a French question (France only, as the brief says). */
export const hasVatRegime = (country: string | null | undefined) => String(country ?? '').toUpperCase() === 'FR'

/** EU VAT numbers: the prefix (Greece writes EL) and the pattern after it, with an example the refusal quotes. */
const EU_VAT: Readonly<Record<string, { prefix: string; re: RegExp; example: string }>> = {
  AT: { prefix: 'ATU', re: /^\d{8}$/, example: 'ATU12345678' },
  BE: { prefix: 'BE', re: /^[01]\d{9}$/, example: 'BE0123456789' },
  BG: { prefix: 'BG', re: /^\d{9,10}$/, example: 'BG123456789' },
  CY: { prefix: 'CY', re: /^\d{8}[A-Z]$/, example: 'CY12345678L' },
  CZ: { prefix: 'CZ', re: /^\d{8,10}$/, example: 'CZ12345678' },
  DE: { prefix: 'DE', re: /^\d{9}$/, example: 'DE123456789' },
  DK: { prefix: 'DK', re: /^\d{8}$/, example: 'DK12345678' },
  EE: { prefix: 'EE', re: /^\d{9}$/, example: 'EE123456789' },
  GR: { prefix: 'EL', re: /^\d{9}$/, example: 'EL123456789' },
  ES: { prefix: 'ES', re: /^[A-Z0-9]\d{7}[A-Z0-9]$/, example: 'ESX1234567X' },
  FI: { prefix: 'FI', re: /^\d{8}$/, example: 'FI12345678' },
  FR: { prefix: 'FR', re: /^[A-HJ-NP-Z0-9]{2}\d{9}$/, example: 'FR12345678901' },
  HR: { prefix: 'HR', re: /^\d{11}$/, example: 'HR12345678901' },
  HU: { prefix: 'HU', re: /^\d{8}$/, example: 'HU12345678' },
  IE: { prefix: 'IE', re: /^(\d{7}[A-W][A-I]?|\d[A-Z+*]\d{5}[A-W])$/, example: 'IE1234567T' },
  IT: { prefix: 'IT', re: /^\d{11}$/, example: 'IT12345678901' },
  LT: { prefix: 'LT', re: /^(\d{9}|\d{12})$/, example: 'LT123456789' },
  LU: { prefix: 'LU', re: /^\d{8}$/, example: 'LU12345678' },
  LV: { prefix: 'LV', re: /^\d{11}$/, example: 'LV12345678901' },
  MT: { prefix: 'MT', re: /^\d{8}$/, example: 'MT12345678' },
  NL: { prefix: 'NL', re: /^\d{9}B\d{2}$/, example: 'NL123456789B01' },
  PL: { prefix: 'PL', re: /^\d{10}$/, example: 'PL1234567890' },
  PT: { prefix: 'PT', re: /^\d{9}$/, example: 'PT123456789' },
  RO: { prefix: 'RO', re: /^\d{2,10}$/, example: 'RO1234567' },
  SE: { prefix: 'SE', re: /^\d{10}01$/, example: 'SE123456789001' },
  SI: { prefix: 'SI', re: /^\d{8}$/, example: 'SI12345678' },
  SK: { prefix: 'SK', re: /^\d{10}$/, example: 'SK1234567890' },
}
/** The EU VAT rule a truck's country uses (France's overseas departments use France's), or null outside the EU. */
export const euVatRuleOf = (country: string | null | undefined) => {
  const c = String(country ?? '').toUpperCase()
  return EU_VAT[FR_REGISTER.has(c) ? 'FR' : c] ?? null
}

/** Luhn: every second digit from the right doubled; the sum a multiple of 10. */
export function luhnOk(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9 }
    sum += d
  }
  return sum % 10 === 0
}
/** A SIREN (9 digits) or SIRET (14 digits) — spaces, dots and dashes allowed in the box, stored without. */
export function sirenOrSiretOk(raw: string): boolean {
  const d = raw.replace(/[\s.\-]/g, '')
  if (d.length === 9) return luhnOk(d)
  if (d.length === 14) {
    // La Poste's establishments (SIREN 356000000) are numbered outside Luhn: the digits sum to a multiple of 5.
    if (d.startsWith('356000000')) return d.split('').reduce((s, x) => s + Number(x), 0) % 5 === 0
    return luhnOk(d)
  }
  return false
}

const text = (v: unknown, max: number): string | null | 'long' => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim()
  if (!s) return null
  return s.length > max ? 'long' : s
}
const refusal = (code: BusinessErrorCode, params: Record<string, string> = {}): BusinessRefusal => ({ ok: false, code, params })

/** Check one save against the truck's country. Returns the columns to write (only those the input named), or the first problem. */
export function checkBusinessDetails(input: BusinessDetailsInput, country: string | null | undefined): { ok: true; values: BusinessDetailsValues } | BusinessRefusal {
  const values: BusinessDetailsValues = {}
  if ('legalName' in input) {
    const v = text(input.legalName, 200); if (v === 'long') return refusal('business_too_long')
    values.legal_name = v
  }
  if ('registeredAddress' in input) {
    const a = input.registeredAddress
    if (a == null || a === '') values.registered_address = null
    else if (typeof a !== 'object' || Array.isArray(a)) return refusal('business_too_long')
    else {
      const out: RegisteredAddress = {}
      for (const k of ['address', 'town', 'suburb', 'region', 'postcode'] as const) {
        const v = text((a as Record<string, unknown>)[k], 200); if (v === 'long') return refusal('business_too_long')
        if (v) out[k] = v
      }
      values.registered_address = Object.keys(out).length ? out : null
    }
  }
  if ('registrationNumber' in input) {
    const v = text(input.registrationNumber, 40); if (v === 'long') return refusal('business_too_long')
    const kind = registrationKindOf(country)
    if (v === null) values.registration_number = null
    else if (kind === 'siren') {
      if (!sirenOrSiretOk(v)) return refusal('business_siren_invalid')
      values.registration_number = v.replace(/[\s.\-]/g, '')
    } else if (kind === 'gb_company') {
      const c = v.replace(/\s/g, '').toUpperCase()
      if (!/^[A-Z0-9]{8}$/.test(c)) return refusal('business_company_number_invalid')
      values.registration_number = c
    } else values.registration_number = v
  }
  if ('vatNumber' in input) {
    const v = text(input.vatNumber, 40); if (v === 'long') return refusal('business_too_long')
    if (v === null) values.vat_number = null
    else {
      const rule = euVatRuleOf(country)
      const c = v.replace(/[\s.\-]/g, '').toUpperCase()
      if (rule) {
        if (!c.startsWith(rule.prefix) || !rule.re.test(c.slice(rule.prefix.length))) return refusal('business_vat_invalid', { prefix: rule.prefix, example: rule.example })
        values.vat_number = c
      } else values.vat_number = v
    }
  }
  if ('vatRegime' in input) {
    const v = input.vatRegime == null || input.vatRegime === '' ? null : String(input.vatRegime)
    if (v !== null && !hasVatRegime(country)) return refusal('business_regime_not_here')
    if (v !== null && !(VAT_REGIMES as readonly string[]).includes(v)) return refusal('business_regime_invalid')
    values.vat_regime = v as VatRegime | null
  }
  if (Object.keys(values).length === 0) return refusal('business_nothing_to_save')
  return { ok: true, values }
}
