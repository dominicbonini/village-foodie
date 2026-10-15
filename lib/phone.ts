// lib/phone.ts — THE ONE PHONE MODULE. Client-safe, built on libphonenumber-js with its "min" metadata.
//
// ══ 🔴 ONE RULE FOR EVERY COUNTRY (Phase 2C, decided by Dominic, 10 October 2026) ═════════════════════════
//   A number is accepted when it is a PLAUSIBLE LENGTH for its country — libphonenumber's "possible" check —
//   read in the truck's country when written nationally, or in its own country when it starts with + (a
//   visiting customer). No full validity check, no number-type rules, no per-country special cases, no
//   regexes of our own, no lists of ranges.
// It replaces isValidUKPhone (0 / 44 / +44 + 9–11 digits, any digits at all) and the three hand-written +44
// normalisers (lib/email.ts, lib/whatsapp-hint.ts, lib/admin/truck-details.ts).
//
// ── WHAT CHANGED FOR A UK NUMBER (scripts/phone-parity.cjs proves it, docs/phone-numbers-report.md lists it) ──
//   Every number a person can actually have still passes, in every way it is written: 0…, +44…, 44…, 0044…,
//   +44 (0)…, spaced, dashed, bracketed, dotted. Now refused, as the new behaviour: a national number with 11
//   digits after the 0 (one too many for anywhere in the UK), a number with words after it ("… (mob)"), and
//   two kinds that are not UK numbers at all — a string starting 00 that is not a real international number,
//   and a 9-digit number in the Isle of Man / Jersey / Guernsey ranges, which share +44 but need 10.
// STORAGE IS UNTOUCHED: every caller still stores exactly what was typed. This module only answers "is it
// plausible", "what is its wa.me form" and "how does it read nationally".
import { isPossiblePhoneNumber, isValidPhoneNumber, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min'
import type { PhoneCheck } from '@/lib/country-settings-types'

/** A country as `trucks.country` / `country_settings.country_code` holds it (ISO 3166 alpha-2). */
export type PhoneCountry = string

const asCountry = (c: PhoneCountry): CountryCode => c.trim().toUpperCase() as CountryCode

/**
 * Is this number acceptable, by the country's own choice of check (country_settings.phone_check)?
 *   'length' a plausible length for its country — libphonenumber "possible" (Phase 2C's rule, unchanged)
 *   'strict' a real number only — libphonenumber "valid"
 *   'off'    anything that is not empty
 * A national number is read in `country` (the truck's); a number starting with + — a visiting customer —
 * is checked with the SAME mode, in its own country. Empty is never acceptable (callers decide "optional").
 */
export function isPlausiblePhone(input: string | null | undefined, country: PhoneCountry, mode: PhoneCheck): boolean {
  const text = (input ?? '').trim()
  if (!text) return false
  if (mode === 'off') return true
  try {
    return mode === 'strict' ? isValidPhoneNumber(text, asCountry(country)) : isPossiblePhoneNumber(text, asCountry(country))
  } catch { return false }
}

function parsed(input: string | null | undefined, country: PhoneCountry) {
  const text = (input ?? '').trim()
  if (!text) return null
  try {
    const p = parsePhoneNumberFromString(text, asCountry(country))
    return p && p.isPossible() ? p : null
  } catch { return null }
}

/** The WhatsApp / wa.me form: the country code and number as digits, no '+'. "07380 736226" (GB) →
 *  "447380736226"; "(201) 555-0123" (US) → "12015550123". Null when the number is not plausible. */
export function phoneLinkDigits(input: string | null | undefined, country: PhoneCountry): string | null {
  const p = parsed(input, country)
  return p ? p.number.slice(1) : null
}

/** The number as it is written nationally, in the number's own country: "07380 736226", "(201) 555-0123". */
export function phoneDisplay(input: string | null | undefined, country: PhoneCountry): string | null {
  const p = parsed(input, country)
  return p ? p.formatNational() : null
}

/** The national form as digits only, with the country's trunk prefix where it has one: "07380736226",
 *  "2015550123". For matching a number stored the national way. */
export function phoneNationalDigits(input: string | null | undefined, country: PhoneCountry): string | null {
  const d = phoneDisplay(input, country)
  return d ? d.replace(/\D/g, '') : null
}

/** The national form, as digits, of a number given in INTERNATIONAL digits ("447380736226" →
 *  "07380736226") — the number's own country decides, so no default country applies. */
export function nationalDigitsOfInternational(digits: string | null | undefined): string | null {
  const d = (digits ?? '').replace(/\D/g, '')
  if (!d) return null
  try {
    const p = parsePhoneNumberFromString(`+${d}`)
    return p && p.isPossible() ? p.formatNational().replace(/\D/g, '') : null
  } catch { return null }
}

/** The country a number belongs to ("GB", "US", …): its own when it starts with +, else `country`. */
export function phoneCountryOf(input: string | null | undefined, country: PhoneCountry): string | null {
  return parsed(input, country)?.country ?? null
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE COPY — the country's short name and example number, from country_settings, never typed in a screen
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** What a screen needs to ask for a phone number — sent in payloads the screen already receives, never the
 *  settings row. `short_name` / `phone_example` are null when the country's row has none yet (they are
 *  nullable columns); the screens then fall back to wording with no country and no example. */
export interface PhoneCopy {
  phoneCountry: string
  short_name: string | null
  phone_example: string | null
  /** The country's phone check (country_settings.phone_check) — the one setting a screen needs to judge a number. */
  phoneCheck: PhoneCheck
}

/** The placeholder a phone box shows: GB "07700 900123". `prefix` keeps a screen's own lead-in ("e.g. "). */
export function phonePlaceholder(copy: PhoneCopy | null | undefined, prefix = ''): string {
  return copy?.phone_example ? `${prefix}${copy.phone_example}` : ''
}

// The refusal sentence (`phoneErrorMessage`) lives in lib/phone-message.ts. ⚠️ KEPT OUT OF THIS FILE ON PURPOSE
// (Language Phase 1b): pages import this module to CHECK a number — the home page, venues, outreach — and a message
// import here put the translator into every one of their bundles.
