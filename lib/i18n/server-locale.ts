// lib/i18n/server-locale.ts — the locale a truck's customers read, on the server (Language Phase 1a).
// A truck's country's `country_settings.locale`, through the same cached loader as its money and times. A truck
// not known yet (a refusal before the truck was found) or a country the loader refuses reads en-GB, the agreed
// fallback — this decides words only, never money or time, so it does not throw the way those loaders do.
import 'server-only'
import { getCountrySettings } from '@/lib/country-settings'
import { DEFAULT_LOCALE, resolveLocale, type AppLocale } from './locales'

export async function localeForTruck(truck: { country?: string | null } | null | undefined): Promise<AppLocale> {
  const code = truck?.country
  if (typeof code !== 'string' || !code) return DEFAULT_LOCALE
  try { return resolveLocale((await getCountrySettings(code)).locale) } catch { return DEFAULT_LOCALE }
}

/** legal-languages-1 (1 November 2026): the locale an OPERATOR's account emails and pages are in — the country of a truck they
 *  own (localeForTruck), else the country they are visiting from when they have none yet (a new signup: `visitorCountry`, the
 *  marketing pages' own rule — lib/visitor-country.ts visitorCountryCodeOf), else en-GB. Never throws: it decides words only. */
export async function localeForOperator(
  db: unknown,   // a Supabase client (any schema) — narrowed below, so no caller has to name its generic type
  operatorId: string | null | undefined,
  visitorCountry?: string | null,
): Promise<AppLocale> {
  try {
    if (operatorId) {
      type Trucks = { from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => { limit: (n: number) => PromiseLike<{ data: { country?: string | null }[] | null }> } } } }
      const { data } = await (db as Trucks).from('trucks').select('country').eq('operator_id', operatorId).limit(1)
      if (data?.[0]?.country) return localeForTruck(data[0])
    }
  } catch { /* fall through to the visitor's country */ }
  return localeForTruck(visitorCountry ? { country: visitorCountry } : null)
}
