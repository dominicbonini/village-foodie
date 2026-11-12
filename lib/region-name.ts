// lib/region-name.ts — world-countries-5 (12 November 2026, Dominic): A COUNTRY'S NAME IN A LANGUAGE, through Intl — with Serbian in LATIN
// script, as the app's Serbian is written (messages/sr-RS.json): Intl's default for "sr" is Cyrillic ("Србија", "Црна Гора"), so a bare
// "sr"/"sr-XX" locale is asked as "sr-Latn-XX" ("Srbija", "Crna Gora"). Every other locale is passed as it is. Pure and client-safe.
export function latinSerbian(locale: string): string {
  return /^sr(-[A-Z]{2})?$/.test(locale) ? locale.replace(/^sr/, 'sr-Latn') : locale
}

/** The region's name in `locale` (Serbian in Latin script), or null when Intl has none. Never throws. */
export function regionNameIn(locale: string, code: string): string | null {
  try { return new Intl.DisplayNames([latinSerbian(locale)], { type: 'region' }).of(code) ?? null } catch { return null }
}
