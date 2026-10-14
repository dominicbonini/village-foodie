// lib/copy/addressPlaceholders.ts — 🔴 THE EXAMPLE ADDRESSES MANAGE SHOWS IN EMPTY BOXES, BY ADDRESS STYLE (US readiness
// sweep; docs/us-readiness-sweep-report.md).
//
// PURE COPY. Keyed by country_settings.address_format, so a country picks up its examples from the style it already
// declares. 'postcode' is the UK text the Schedule tab carried before, character for character.
import type { CountrySettings } from '@/lib/country-settings-types'

export interface AddressPlaceholders {
  /** Schedule → event → "Full address (optional)". */
  address: string
  /** Schedule → event → "Area (village, town or city)". */
  area: string
  /** Schedule → paste a schedule: the venue, area and time part of the example (the date part is shared). */
  pasteVenue: string
}

const BY_STYLE: Record<CountrySettings['addressFormat'], AddressPlaceholders> = {
  postcode: { address: 'e.g. 123 High St, Wickhambrook', area: 'e.g. Wickhambrook', pasteVenue: 'The Crown, Wickhambrook, 5pm-9pm' },
  zip_state: { address: 'e.g. 123 Main St, Austin, TX 78701', area: 'e.g. Austin', pasteVenue: 'Zilker Park, Austin, 5pm-9pm' },
}

/** The examples for an address style. Anything unrecognised gets the UK ones — what every truck had before. */
export function addressPlaceholders(style: CountrySettings['addressFormat'] | null | undefined): AddressPlaceholders {
  return BY_STYLE[style as CountrySettings['addressFormat']] ?? BY_STYLE.postcode
}

/** The paste-a-schedule box's whole placeholder. */
export function pastePlaceholder(style: CountrySettings['addressFormat'] | null | undefined): string {
  return `Paste your schedule here e.g. Saturday 14th June, ${addressPlaceholders(style).pasteVenue}`
}
