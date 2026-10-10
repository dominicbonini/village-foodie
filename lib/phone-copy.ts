// lib/phone-copy.ts — what a screen needs to ask for a phone number, from country_settings. Server-only.
//
// 🔴 ONLY FOUR VALUES LEAVE THE SERVER: { phoneCountry, short_name, phone_example, phoneCheck } (lib/phone.ts
// PhoneCopy).
// They ride in payloads the screens already receive (/api/menu, /api/dashboard, /api/setup); no browser
// reads country_settings and no settings row is sent.
// ⚠️ LOUD, NOT GUESSING: short_name and phone_example are nullable columns (20261010_11). A country without
// them logs an error here, and the screens then drop the country's name and example from their wording
// rather than borrowing another country's. phoneCountry is never missing — it is the truck's own country.
import 'server-only'
import { getCountrySettings, countrySettingsForTruck } from '@/lib/country-settings'
import type { CountrySettings } from '@/lib/country-settings-types'
import type { PhoneCopy } from '@/lib/phone'

export function phoneCopyOf(c: CountrySettings): PhoneCopy {
  if (!c.shortName || !c.phoneExample) {
    console.error(`[phone-copy] country_settings ${c.countryCode} has no ${!c.shortName ? 'short_name' : 'phone_example'} — phone copy will name no country/example until it is set on the Countries page`)
  }
  return { phoneCountry: c.countryCode, short_name: c.shortName, phone_example: c.phoneExample, phoneCheck: c.phoneCheck }
}

/** The truck's own country's phone copy. Throws (as the loader does) if the truck object has no country. */
export async function phoneCopyForTruck(truck: { country?: string | null } | null | undefined): Promise<PhoneCopy> {
  return phoneCopyOf(await countrySettingsForTruck(truck))
}

/** A country's phone copy, for a page that knows only the country (signup). */
export async function phoneCopyForCountry(code: string): Promise<PhoneCopy> {
  return phoneCopyOf(await getCountrySettings(code))
}
