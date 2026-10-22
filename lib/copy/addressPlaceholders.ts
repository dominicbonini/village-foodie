// lib/copy/addressPlaceholders.ts — 🔴 HOW AN ADDRESS LOOKS IN MANAGE, BY ADDRESS FORMAT (US readiness sweep;
// docs/us-readiness-sweep-report.md; Language Phase 1d; address-formats-2).
//
// address-formats-2 (21 October 2026): keyed by the country's ADDRESS FORMAT (lib/address-formats.ts). The example
// values come from the format's `examples`, and the WORDS around them ("e.g. …", the labels) are the `address`
// namespace's messages, keyed by field type and variant — the `{style}` selects are gone. This file holds what is NOT
// a word: whether a format's postal codes are typed upper-case, and the paste example's place, date and times.
import type { AddressFormat } from '@/lib/address-formats'
import { clockOf, formatOrdinalDate, formatYmd, timeSettingsOr, type TimeSettings } from '@/lib/time-utils'

/** Postal codes with letters are typed and shown upper-case ("CB8 8PD", "D02 X963", "M5V 3L9"); digits-only codes (a
 *  US ZIP code, an Australian or NZ postcode) are left as typed — as the US box always was. */
export function upperCasesPostcode(format: AddressFormat): boolean {
  return format.postalCode.normaliser === 'gb' || format.postalCode.normaliser === 'eircode' || format.postalCode.normaliser === 'ca'
}

/** The paste example's day — a Saturday (14 June 2025), as the UK example has always read "Saturday 14th June". */
const PASTE_EXAMPLE_DAY = '2025-06-14'

/**
 * The values for `manageScheduleImport.pastePlaceholder`: the format's example place, and the example's date and times
 * in the truck's own way of writing them. GB: "The Crown, Wickhambrook", "Saturday 14th June" and "5pm"/"9pm" — the text
 * the box always showed. US: "Zilker Park, Austin", "Saturday, June 14" and "5:00 PM"/"9:00 PM".
 * ⚠️ THE TIMES ARE ALWAYS 12-HOUR: this is an example of what people paste, and the UK example was "5pm-9pm".
 */
export function pasteExampleValues(format: AddressFormat, ts: TimeSettings | null | undefined) {
  const s = timeSettingsOr(ts, 'pasteExampleValues')
  const date = s.dateOrder === 'mdy'
    ? formatYmd(PASTE_EXAMPLE_DAY, s, { weekday: 'long', month: 'long', day: 'numeric' })
    : formatOrdinalDate(PASTE_EXAMPLE_DAY, s)
  return { place: format.examples.paste, date, start: clockOf('17:00', '12h', s.locale), end: clockOf('21:00', '12h', s.locale) }
}
