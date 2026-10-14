// lib/signup-country-types.ts — the shape of one switched-on country as the signup step, the admin create form
// and the landing page's country menu receive it (Phase 2D-1). Client-safe: types only.
import type { PhoneCopy } from '@/lib/phone'

export interface SignupCountry {
  code: string
  name: string
  shortName: string | null
  timezones: string[]
  defaultTimezone: string
  /** The country's `locale` (en-GB / en-US) — the setup wizard's language once this country is chosen. */
  locale: string
  phone: PhoneCopy
  /** data: URI of the flag (lib/flags.ts), or null when the flag package has none. */
  flag: string | null
}
