// lib/weekly-post/words.ts — 🔴 THE ONE DOOR FROM lib/weekly-post TO THE MESSAGE FILES (Language Phase 1d Part 2;
// .cursor/rules/language.mdc rule 1).
//
// Every word a poster DRAWS (the default heading, the days-off default, CANCELLED, the busy-week sample), every word
// a caption is FILLED with (the seeds, the day list, "tonight"), every word the weekly-post route SENDS (render
// warnings, status lines, option labels) and every refusal this folder produces comes from messages/en-GB.json and
// messages/en-US.json through this file — `posterWords`, `captions`, `weeklyPostApi` and the `wp_…` codes of
// `errorsManage`.
//
// 🔴 WHICH LANGUAGE: THE POSTER'S COUNTRY. A poster already has exactly one notion of where it is — `countryForTruck`
// (./locale.ts), the key its dates are worded by — and the live editor and the server render both hold it. Reading
// the words through the SAME key is what keeps the editor's live preview and the PNG the server draws in one
// language: a second source (the request's locale, say) could disagree with the first and the operator would approve
// one poster and post another. `posterLocaleOf` maps it to the message locale (GB → en-GB, US → en-US — the same
// pair `country_settings.locale` holds for those two countries); anything else is en-GB, as every resolver here does.
// ⚠️ ITS OWN TWO-ROW TABLE, NOT `intlLocaleFor`: format.ts reads the default heading from here, and locale.ts imports
// format.ts — importing locale.ts back (at run time) would close the cycle format.ts's own header warns about. The
// `CountryCode` import below is a TYPE, erased at compile time, so there is no cycle.
//
// ⚠️ STORED VALUES ARE NEVER READ FROM HERE. A saved heading, a saved days-off text, a saved caption template and an
// event's name render exactly as stored; only what a truck gets when NOTHING is stored (and what is drawn at render
// time, never stored) comes from these messages. See `headingRuns` (format.ts), `validateLayout` (layout.ts) and the
// seeds in caption-template.ts.
// ⚠️ GB IS BYTE-IDENTICAL: every en-GB message here is the literal it replaced (the four named fixes aside, which
// are in captions and an editor line — never on a GB poster).
import type enGB from '@/messages/en-GB.json'
import { translatorFor } from '@/lib/i18n/translator'
import { resolveLocale, type AppLocale } from '@/lib/i18n/locales'
import '@/lib/i18n/catalog/posterWords'
import '@/lib/i18n/catalog/captions'
import '@/lib/i18n/catalog/weeklyPostApi'
import '@/lib/i18n/catalog/errorsManage'
import type { CountryCode } from './locale'

/** The message locale a poster's words are in — its country's. ⚠️ Unknown or missing → en-GB. */
const MESSAGE_LOCALE: Record<CountryCode, AppLocale> = { GB: 'en-GB', US: 'en-US' }
export const posterLocaleOf = (country?: CountryCode | string | null): AppLocale =>
  resolveLocale(MESSAGE_LOCALE[country as CountryCode])

/** Words drawn on a poster, in that poster's country's language. */
export const posterWordsFor = (country?: CountryCode | string | null) => translatorFor(posterLocaleOf(country), 'posterWords')
/** Words a caption is built from. */
export const captionWordsFor = (country?: CountryCode | string | null) => translatorFor(posterLocaleOf(country), 'captions')
/** Words the weekly-post route sends that are not refusals (warnings, status lines, labels). */
export const weeklyPostWordsFor = (locale?: string | null) => translatorFor(locale, 'weeklyPostApi')

/* ── THE THREE WORDS A POSTER DRAWS WHEN THE TRUCK HAS STORED NOTHING ─────────────────────────────────────────────
 * ⚠️ `{start}` AND `{end}` ARE THE HEADING'S OWN TOKENS (`headingRuns` fills them with the week's dates), so they are
 * passed back into the message as themselves — in ICU they would otherwise be arguments with no value. */
/** The heading a design gets when its stored heading is empty — GB "Week commencing {start} to {end}", US "Week of {start}". */
export const defaultHeadingFor = (country?: CountryCode | string | null): string =>
  posterWordsFor(country)('heading', { start: '{start}', end: '{end}' })
/** The days-off text a design gets when it has stored none — GB "No trading today", US "Closed today". */
export const defaultDaysOffFor = (country?: CountryCode | string | null): string => posterWordsFor(country)('daysOff')
/** The word in a cancelled event's Time box — GB "CANCELLED", US "CANCELED". Never stored. */
export const cancelledWordFor = (country?: CountryCode | string | null): string => posterWordsFor(country)('cancelled')

/** A refusal code this folder and app/api/weekly-post produce — an `errorsManage` key (their own are `wp_…`; a shared
 *  one such as `event_not_found` is reused rather than copied). */
export type WpErrorCode = Extract<keyof (typeof enGB)['errorsManage'], string>
export type WpErrorParams = Record<string, string>

/** A refusal as a code and its values — the route words it in the truck's language with `manageErrorBody`. */
export interface WpRefusal { code: WpErrorCode; params: WpErrorParams }

const gbErrors = translatorFor('en-GB', 'errorsManage') as unknown as (code: string, params?: WpErrorParams) => string
/** A refusal's en-GB sentence — what `error` has always said, byte for byte (rule 7: `{ error, …, code, params }`). */
export const gbRefusalText = (code: WpErrorCode, params: WpErrorParams = {}): string => gbErrors(code, params)

/** A refusal for a lib result: the en-GB `error` every existing reader shows, plus its `code` and `params`, which the
 *  route words in the truck's language (`manageErrorBody`) and a screen can word with `errorText`. */
export const wpRefusal = (code: WpErrorCode, params: WpErrorParams = {}): { error: string } & WpRefusal =>
  ({ error: gbRefusalText(code, params), code, params })
