// lib/copy/addressPlaceholders.ts — 🔴 HOW AN ADDRESS LOOKS IN MANAGE, BY ADDRESS STYLE (US readiness sweep;
// docs/us-readiness-sweep-report.md; Language Phase 1d).
//
// Keyed by country_settings.address_format, so a country picks up its address words from the style it already
// declares. ⚠️ THE WORDS THEMSELVES ARE IN MESSAGES NOW (Language Phase 1d): every example address, the
// postcode / ZIP code label and the paste example are ICU `select`s on `{style}` in `manageScheduleEvent`,
// `manageScheduleImport` and `schedulePlaces` — 'postcode' (the `other` branch) is the UK text the Schedule tab
// carried before, character for character; 'zip_state' is the US one. This file holds what is NOT a word:
// which style a country has, whether its postcodes are forced upper-case, and the paste example's date and times.
import type { CountrySettings } from '@/lib/country-settings-types'
import { clockOf, formatOrdinalDate, formatYmd, timeSettingsOr, type TimeSettings } from '@/lib/time-utils'

export type AddressStyle = CountrySettings['addressFormat']

/** The style to pass a message as `{style}`. Anything unrecognised is 'postcode' — what every truck had before. */
export function addressStyleOf(style: AddressStyle | null | undefined): AddressStyle {
  return style === 'zip_state' ? 'zip_state' : 'postcode'
}

/** UK postcodes are typed and shown upper-case ("CB8 8PD"); a US ZIP code is digits and is left as typed. */
export function upperCasesPostcode(style: AddressStyle | null | undefined): boolean {
  return addressStyleOf(style) === 'postcode'
}

/** The paste example's day — a Saturday (14 June 2025), as the UK example has always read "Saturday 14th June". */
const PASTE_EXAMPLE_DAY = '2025-06-14'

/**
 * The values for `manageScheduleImport.pastePlaceholder`: the style, and the example's date and times in the truck's
 * own way of writing them. GB: "Saturday 14th June" and "5pm"/"9pm" — the text the box always showed. US:
 * "Saturday, June 14" and "5:00 PM"/"9:00 PM".
 * ⚠️ THE TIMES ARE ALWAYS 12-HOUR: this is an example of what people paste, and the UK example was "5pm-9pm".
 */
export function pasteExampleValues(style: AddressStyle | null | undefined, ts: TimeSettings | null | undefined) {
  const s = timeSettingsOr(ts, 'pasteExampleValues')
  const date = s.dateOrder === 'mdy'
    ? formatYmd(PASTE_EXAMPLE_DAY, s, { weekday: 'long', month: 'long', day: 'numeric' })
    : formatOrdinalDate(PASTE_EXAMPLE_DAY, s)
  return { style: addressStyleOf(style), date, start: clockOf('17:00', '12h', s.locale), end: clockOf('21:00', '12h', s.locale) }
}
