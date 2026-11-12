// lib/country-regions.ts — world-countries-5 (12 November 2026, docs/world-countries-5-report.md §4): THE REGION OF EVERY COUNTRY, for the
// country selector's region buttons (components/landing/CountryMenu.tsx). Pure data, client-safe. From docs/world-countries-4/go-live.csv's
// `region` column (all 210 countries of the agreed list), plus Mexico (Americas) for as long as its row is switched on. The selector shows
// only switched-on countries, and only the regions that have one.
export const REGIONS = ['europe', 'americas', 'asiaPacific', 'middleEast', 'africa'] as const
export type RegionKey = (typeof REGIONS)[number]

export const BY_REGION: Readonly<Record<RegionKey, readonly string[]>> = {
  europe: ['AD', 'AL', 'AM', 'AT', 'AX', 'AZ', 'BA', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FO', 'FR', 'GB', 'GE', 'GG', 'GI', 'GL', 'GR', 'HR', 'HU', 'IE', 'IM', 'IS', 'IT', 'JE', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'SE', 'SI', 'SJ', 'SK', 'SM', 'TR', 'UA', 'VA'],
  americas: ['AG', 'AI', 'AR', 'AW', 'BL', 'BM', 'BO', 'BQ', 'BR', 'BS', 'BZ', 'CA', 'CL', 'CO', 'CR', 'CW', 'DM', 'DO', 'EC', 'FK', 'GD', 'GF', 'GP', 'GT', 'GY', 'HN', 'JM', 'KN', 'KY', 'LC', 'MF', 'MQ', 'MS', 'MX', 'NI', 'PA', 'PE', 'PM', 'PR', 'PY', 'SR', 'SV', 'SX', 'TC', 'TT', 'US', 'UY', 'VC', 'VG', 'VI'],
  asiaPacific: ['AS', 'AU', 'BD', 'BN', 'BT', 'CC', 'CK', 'CX', 'FJ', 'FM', 'GU', 'HK', 'ID', 'IN', 'JP', 'KG', 'KH', 'KI', 'KR', 'KZ', 'LA', 'LK', 'MH', 'MN', 'MO', 'MP', 'MV', 'MY', 'NC', 'NF', 'NP', 'NR', 'NU', 'NZ', 'PF', 'PG', 'PK', 'PN', 'PW', 'SB', 'SG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TO', 'TV', 'TW', 'UZ', 'VU', 'WF', 'WS'],
  middleEast: ['AE', 'BH', 'IL', 'JO', 'KW', 'OM', 'QA', 'SA'],
  africa: ['AO', 'BF', 'BI', 'BJ', 'BW', 'CF', 'CV', 'DJ', 'DZ', 'EG', 'ER', 'ET', 'GA', 'GM', 'GN', 'GQ', 'GW', 'KM', 'LR', 'LS', 'MA', 'MG', 'MR', 'MU', 'MW', 'MZ', 'NA', 'NE', 'NG', 'RE', 'SC', 'SH', 'SL', 'SN', 'ST', 'SZ', 'TD', 'TG', 'TN', 'TZ', 'UG', 'YT', 'ZA', 'ZM', 'ZW'],
}
const OF = new Map<string, RegionKey>(REGIONS.flatMap(r => BY_REGION[r].map(c => [c, r] as const)))

/** A country's region; a code the list does not know falls in Europe (where every country began). */
export const regionOfCountry = (code: string | null | undefined): RegionKey => OF.get(String(code ?? '').toUpperCase()) ?? 'europe'
