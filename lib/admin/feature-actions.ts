// lib/admin/feature-actions.ts — Admin › Pricing check: the master feature list and the competitors' answers
// (comparison-features-1, 29 October 2026; docs/comparison-features-1-report.md). Reached through the same PricingStore as
// the rest of the tab (lib/admin/pricing-check-actions.ts `act` dispatches here), so scripts/pricing-check-1.cjs runs it
// against an in-memory store.
//
//   feature_update   { key, checked?, showScope?, showCountries? }  — the Check tick and "Show on website"
//   feature_add      { key, groupKey, labels: {en-GB, de-DE}, explanations: {en-GB, de-DE}, showScope?, showCountries? }
//   feature_value    { competitorId, featureKey, countryCode | null, value, note? } — an admin's own answer
//   verify_features / unverify_features { competitorId, countryCode } — stamps that competitor's current answers for the country
//
// 🔴 A FEATURE ADDED, OR SWITCHED TO CHECKED, marks every active competitor's answer 'unknown' (where it has none) and makes
// every active competitor due, so the next routine or deep pass fills it (store.markFeatureDue).
// 🔴 THE HISTORY RULE: an answer is never edited in place — the current row is superseded and a new one inserted (put back if
// the insert fails). Verification stamps and the checked date are the only in-place writes.
import {
  FEATURE_GROUPS, FEATURE_KEY, FEATURE_VALUES, SHOW_SCOPES, rowsForCountry, valueOut, featureOut,
  type FeatureValue, type ShowScope,
} from '@/lib/comparison-features'
import type { ActionResult, PricingStore, Stamp } from '@/lib/admin/pricing-check-actions'

type Row = Record<string, unknown>
const refuse = <T>(status: number, error: string): ActionResult<T> => ({ ok: false, status, error })
const MISSING = 'Run supabase/migrations/20261047_comparison_features_1.sql first, then reload.'
/** The locales an Admin-added feature's words must have (the comparison pages fall back to en-GB). */
export const ADD_LOCALES = ['en-GB', 'de-DE'] as const

const countries = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length <= 80 && v.every(c => typeof c === 'string' && /^[A-Z]{2}$/.test(c)) ? [...new Set(v as string[])].sort() : null

/** The Check tick and "Show on website". Switching to checked marks every active competitor due. */
export async function updateFeature(store: PricingStore, body: Row, stamp: Stamp): Promise<ActionResult<Row>> {
  if (!store.features || !store.updateFeature) return refuse(503, MISSING)
  const key = typeof body.key === 'string' ? body.key : ''
  const all = await store.features()
  if (!all) return refuse(503, MISSING)
  const old = all.find(f => f.key === key)
  if (!old) return refuse(404, 'That feature is not in the list. Reload the page.')
  const cols: Row = {}
  if ('checked' in body) { if (typeof body.checked !== 'boolean') return refuse(400, 'Check must be on or off.'); cols.checked = body.checked }
  if ('showScope' in body) {
    if (!(SHOW_SCOPES as readonly unknown[]).includes(body.showScope)) return refuse(400, 'Show on website is All countries, Some countries or Hidden.')
    cols.show_scope = body.showScope
  }
  if ('showCountries' in body) { const c = countries(body.showCountries); if (!c) return refuse(400, 'Countries are two-letter codes.'); cols.show_countries = c }
  const scope = (cols.show_scope ?? old.show_scope) as ShowScope
  const list = (cols.show_countries ?? old.show_countries ?? []) as string[]
  if (scope === 'some' && !list.length) return refuse(400, 'Pick at least one country, or choose All countries or Hidden.')
  if (!Object.keys(cols).length) return refuse(400, 'Nothing to save.')
  const saved = await store.updateFeature(key, { ...cols, updated_at: stamp.at, updated_by: stamp.by })
  if (!saved) return refuse(404, 'That feature is gone. Reload the page.')
  const due = cols.checked === true && old.checked !== true && store.markFeatureDue ? await store.markFeatureDue(key, stamp.today) : 0
  return { ok: true, data: { feature: featureOut(saved), markedDue: due } }
}

/** Add feature: key, group, and its words in English and German (kept on the row — a seeded feature's are in messages). */
export async function addFeature(store: PricingStore, body: Row, stamp: Stamp): Promise<ActionResult<Row>> {
  if (!store.features || !store.insertFeature) return refuse(503, MISSING)
  const key = typeof body.key === 'string' ? body.key.trim().toLowerCase() : ''
  if (!FEATURE_KEY.test(key)) return refuse(400, 'The key is 2–31 lower-case letters, digits or _, starting with a letter (e.g. "giftcards").')
  if (!(FEATURE_GROUPS as readonly unknown[]).includes(body.groupKey)) return refuse(400, 'Choose a group.')
  const all = await store.features()
  if (!all) return refuse(503, MISSING)
  if (all.some(f => f.key === key)) return refuse(409, `"${key}" is already in the list.`)
  const words = (v: unknown, max: number, what: string): Record<string, string> | string => {
    const o = v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {}
    const out: Record<string, string> = {}
    for (const l of ADD_LOCALES) {
      const s = typeof o[l] === 'string' ? (o[l] as string).trim() : ''
      if (!s) return `The ${what} in ${l === 'en-GB' ? 'English' : 'German'} is needed.`
      if (s.length > max) return `The ${what} in ${l === 'en-GB' ? 'English' : 'German'} can be at most ${max} characters.`
      out[l] = s
    }
    return out
  }
  const labels = words(body.labels, 90, 'label'), explanations = words(body.explanations, 240, 'explanation')
  if (typeof labels === 'string') return refuse(400, labels)
  if (typeof explanations === 'string') return refuse(400, explanations)
  const scope = (SHOW_SCOPES as readonly unknown[]).includes(body.showScope) ? body.showScope as ShowScope : 'hidden'
  const list = scope === 'some' ? countries(body.showCountries) : []
  if (scope === 'some' && !list?.length) return refuse(400, 'Pick at least one country, or choose All countries or Hidden.')
  const last = Math.max(0, ...all.filter(f => f.group_key === body.groupKey).map(f => Number(f.sort_order) || 0))
  const saved = await store.insertFeature({
    key, group_key: body.groupKey, sort_order: last + 10, checked: true, show_scope: scope, show_countries: list ?? [],
    hatchgrab_source: 'confirm', labels, explanations, updated_at: stamp.at, updated_by: stamp.by,
  })
  const due = store.markFeatureDue ? await store.markFeatureDue(key, stamp.today) : 0
  return { ok: true, data: { feature: featureOut(saved), markedDue: due } }
}

/** An admin's own answer for one competitor, feature and country (null = every country): a new row, the old superseded.
 *  The admin is the verifier. The old quote and source stay only while the value is unchanged. */
export async function setFeatureValue(store: PricingStore, body: Row, stamp: Stamp): Promise<ActionResult<Row>> {
  if (!store.featureValues || !store.insertFeatureValue || !store.supersedeFeatureValue || !store.unsupersedeFeatureValue) return refuse(503, MISSING)
  const cid = typeof body.competitorId === 'string' ? body.competitorId : ''
  const key = typeof body.featureKey === 'string' ? body.featureKey : ''
  const code = body.countryCode === null || body.countryCode === undefined ? null : typeof body.countryCode === 'string' && /^[A-Z]{2}$/.test(body.countryCode) ? body.countryCode : undefined
  if (!cid || !FEATURE_KEY.test(key) || code === undefined) return refuse(400, 'Which competitor, feature and country?')
  if (!(FEATURE_VALUES as readonly unknown[]).includes(body.value)) return refuse(400, 'An answer is yes, no, partly or not stated.')
  if ('note' in body && body.note !== null && (typeof body.note !== 'string' || body.note.length > 300)) return refuse(400, 'The note is text, at most 300 characters.')
  const old = (await store.featureValues()).map(valueOut).find(v => v.competitorId === cid && v.featureKey === key && v.countryCode === code) ?? null
  const value = body.value as FeatureValue
  const same = old?.value === value
  const row: Row = {
    competitor_id: cid, feature_key: key, country_code: code, value,
    note: 'note' in body ? (typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null) : old?.note ?? null,
    quote: same ? old?.quote ?? null : null, source_url: same ? old?.sourceUrl ?? null : null,
    checked_on: stamp.today, verified_at: stamp.at, verified_by: stamp.by,
  }
  if (old && !(await store.supersedeFeatureValue(old.id, stamp.at))) return refuse(409, 'That answer has been changed since this page loaded. Reload to see it.')
  try { return { ok: true, data: { value: valueOut(await store.insertFeatureValue(row)) } } }
  catch (e) { if (old) await store.unsupersedeFeatureValue(old.id); throw e }
}

/** comparison-features-1: an accepted checker finding's answer — the current row for (competitor, feature, country) is
 *  superseded and the new one inserted UNVERIFIED with the quote and the page it came from. */
export async function writeAnswer(store: PricingStore, a: { competitorId: string; key: string; countryCode: string | null; value: FeatureValue; note: string | null; quote: string | null; sourceUrl: string | null }, stamp: Stamp): Promise<ActionResult<Row>> {
  if (!store.featureValues || !store.insertFeatureValue || !store.supersedeFeatureValue || !store.unsupersedeFeatureValue) return refuse(503, MISSING)
  const old = (await store.featureValues()).map(valueOut).find(v => v.competitorId === a.competitorId && v.featureKey === a.key && v.countryCode === a.countryCode) ?? null
  if (old && !(await store.supersedeFeatureValue(old.id, stamp.at))) return refuse(409, 'That answer has been changed since this finding was made. Reject it, or check it by hand.')
  try {
    return { ok: true, data: { value: valueOut(await store.insertFeatureValue({ competitor_id: a.competitorId, feature_key: a.key, country_code: a.countryCode,
      value: a.value, note: a.note?.slice(0, 300) ?? null, quote: a.quote?.slice(0, 2000) ?? null, source_url: a.sourceUrl, checked_on: stamp.today, verified_at: null, verified_by: null })) } }
  } catch (e) { if (old) await store.unsupersedeFeatureValue(old.id); throw e }
}

/** "Mark features verified" for one country: stamps the competitor's current answers there (the country's own and the
 *  every-country ones) and the competitor's features stamp. Undo clears both. */
export async function verifyFeatures(store: PricingStore, body: Row, stamp: Stamp, on: boolean): Promise<ActionResult<Row>> {
  const cid = typeof body.competitorId === 'string' ? body.competitorId : ''
  const code = typeof body.countryCode === 'string' && /^[A-Z]{2}$/.test(body.countryCode) ? body.countryCode : null
  if (!cid) return refuse(400, 'Which competitor?')
  if (!code) return refuse(400, 'Which country? Features are verified country by country.')
  let stamped = 0
  if (store.featureValues && store.setFeatureValuesVerified) {
    const rows = rowsForCountry((await store.featureValues()).map(valueOut), cid, code)
    stamped = await store.setFeatureValuesVerified(rows.map(r => r.id), on ? stamp.at : null, on ? stamp.by : null)
  }
  const r = await store.updateCompetitor(cid, { features_verified_at: on ? stamp.at : null, ...(on ? { features_checked_on: stamp.today } : {}), updated_at: stamp.at })
  return r ? { ok: true, data: { competitorId: cid, stamped } } : refuse(404, 'That competitor is gone. Reload the page.')
}
