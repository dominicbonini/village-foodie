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
