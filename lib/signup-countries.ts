// lib/signup-countries.ts — the countries a truck can be created in, as signup and admin need them. SERVER-ONLY.
//
// 🔴 SWITCHED-ON ONLY (country_settings.enabled). Each entry carries exactly what the "Where's your truck
// based?" step needs — names, zones, the phone copy and a flag — never the settings row.
import 'server-only'
import { listCountrySettingsCached } from '@/lib/country-settings'
import { phoneCopyOf } from '@/lib/phone-copy'
import { flagDataUri } from '@/lib/flags'
import { MARKETING_COUNTRY } from '@/lib/marketing-country'
import type { SignupCountry } from '@/lib/signup-country-types'

export async function signupCountries(): Promise<SignupCountry[]> {
  const all = await listCountrySettingsCached()
  return all.filter(c => c.enabled).map(c => ({
    code: c.countryCode,
    name: c.name,
    shortName: c.shortName,
    timezones: [...c.timezones],
    defaultTimezone: c.defaultTimezone,
    locale: c.locale,
    phone: phoneCopyOf(c),
    flag: flagDataUri(c.countryCode),
  }))
}

/** The pre-filled country: the visitor's (x-vercel-ip-country) when it is switched on, otherwise the marketing
 *  country (GB). `fromLocation` says which — the step only claims "we guessed this from where you are" when true. */
export function guessSignupCountry(list: SignupCountry[], ipCountry: string | null): { code: string; fromLocation: boolean } {
  const ip = (ipCountry ?? '').trim().toUpperCase()
  if (ip && list.some(c => c.code === ip)) return { code: ip, fromLocation: true }
  const fallback = list.find(c => c.code === MARKETING_COUNTRY) ?? list[0]
  return { code: fallback?.code ?? MARKETING_COUNTRY, fromLocation: false }
}
