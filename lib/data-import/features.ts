// lib/data-import/features.ts — imports the master list of compared features (data/comparison-features/features.json) into
// public.comparison_features (comparison-features-1, 29 October 2026; docs/comparison-features-1-report.md). Run by
// lib/data-import/importer.ts (kind "features"), once per version of the file.
//
// ⛔ CORRECTED (import-and-cs-fix, 4 November 2026, docs/import-and-cs-fix-report.md): the paragraph below let a re-tiering
// overwrite Admin's choices, and the first tiered import (4 Nov 09:02 UTC) ticked asap, options, staff and walkup back on after
// Admin had unticked them on 2 Nov. NOW: a re-tiering sets the TIER always, but `checked` only where the file set it last
// (`checked_by` 'file') and where it shows only where the file set that last (`scope_by` 'file') — never a value Admin set
// (`'admin'`, or a row Admin touched before those columns existed: `updated_by`). The one exception is an OFF tier: the file's
// `checked: false` always applies (the checker never asks an off feature). New keys are added as before, marked 'file'.
// 🔴 MISSING KEYS ARE ADDED; a feature already in the table keeps Admin's choices (checked, where it shows) — UNLESS the file
// changes its TIER (competitor-features-2, 3 November 2026): the first import of the tiers, or a later re-tiering, also sets
// `checked` (true unless the tier is off) and where it shows, from the file. A rerun of the same file changes nothing (the tiers
// already match). Every row is checked first (key, group, tier, checked agreeing with the tier, scope, countries, HatchGrab's
// source); a bad file writes nothing. Each ADDED checked feature marks every active competitor's answer 'unknown' (where it has
// none) and every active competitor due, so the next check asks about it at once.
import { FEATURE_GROUPS, FEATURE_KEY, FEATURE_TIERS, SHOW_SCOPES, sourceProblem } from '@/lib/comparison-features'

type Row = Record<string, unknown>
export interface FeaturesFile { checked_on: string; features: Row[] }
export interface FeaturesStore {
  /** key, checked and tier of every row; null while 20261047 has not run. competitor-features-2: throws while 20261062 has not
   *  (there is no tier to compare with). */
  features(): Promise<Row[] | null>
  insertFeatures(rows: Row[]): Promise<void>
  /** competitor-features-2: a re-tiered feature's tier, checked and where it shows. */
  updateFeature(key: string, cols: Row): Promise<void>
  markFeatureDue(key: string, today: string): Promise<number>
}
export interface FeaturesCounts { features: number; added: number; existing: number; retiered: number; markedDue: number }

export function featuresProblems(file: FeaturesFile): string[] {
  if (!file || !Array.isArray(file.features) || !file.features.length) return ['The file is not in the expected shape (features).']
  const out: string[] = [], seen = new Set<string>()
  for (const f of file.features) {
    const who = `Feature "${f.key}"`
    if (typeof f.key !== 'string' || !FEATURE_KEY.test(f.key)) out.push(`${who}: the key must be 2–31 lower-case letters, digits or _.`)
    if (seen.has(String(f.key))) out.push(`${who}: appears twice.`)
    seen.add(String(f.key))
    if (!(FEATURE_GROUPS as readonly unknown[]).includes(f.group_key)) out.push(`${who}: group "${f.group_key}" is not one of ${FEATURE_GROUPS.join(', ')}.`)
    if (!(FEATURE_TIERS as readonly unknown[]).includes(f.tier)) out.push(`${who}: tier must be one of ${FEATURE_TIERS.join(', ')}.`)
    else if (typeof f.checked === 'boolean' && f.checked !== (f.tier !== 'off')) out.push(`${who}: checked must be ${f.tier !== 'off'} for tier ${f.tier} (off is the only tier not checked).`)
    if (!(SHOW_SCOPES as readonly unknown[]).includes(f.show_scope)) out.push(`${who}: show_scope must be all, some or hidden.`)
    const list = Array.isArray(f.show_countries) ? f.show_countries : null
    if (!list || !list.every(c => typeof c === 'string' && /^[A-Z]{2}$/.test(c))) out.push(`${who}: show_countries must be two-letter codes.`)
    else if (f.show_scope === 'some' && !list.length) out.push(`${who}: "some" needs at least one country.`)
    const p = sourceProblem(String(f.hatchgrab_source ?? '')); if (p) out.push(`${who}: ${p}`)
    if (typeof f.checked !== 'boolean') out.push(`${who}: checked must be true or false.`)
  }
  return out
}

export async function importFeatures(store: FeaturesStore, file: FeaturesFile, stamp: { today: string }): Promise<FeaturesCounts> {
  const problems = featuresProblems(file)
  if (problems.length) throw new Error(`Nothing was written — the file has ${problems.length} problem${problems.length === 1 ? '' : 's'}: ${problems.slice(0, 8).join(' ')}`)
  const have = await store.features()
  if (!have) throw new Error('public.comparison_features is not in the database yet — run supabase/migrations/20261047_comparison_features_1.sql. Nothing was written.')
  const stored = new Map(have.map(r => [String(r.key), r]))
  const fresh = file.features.filter(f => !stored.has(String(f.key))).map(f => ({
    key: f.key, group_key: f.group_key, sort_order: Number(f.sort_order) || 0, tier: f.tier, checked: f.checked, show_scope: f.show_scope,
    show_countries: f.show_countries, hatchgrab_source: f.hatchgrab_source, checked_by: 'file', scope_by: 'file',
  }))
  // competitor-features-2: a feature whose tier the file changes takes the file's tier, checked and where it shows.
  const retier = file.features.filter(f => stored.has(String(f.key)) && (stored.get(String(f.key))!.tier ?? null) !== f.tier)
  if (fresh.length) await store.insertFeatures(fresh)
  for (const f of retier) await store.updateFeature(String(f.key), retierCols(stored.get(String(f.key))!, f))
  let markedDue = 0
  for (const f of fresh) if (f.checked) markedDue += await store.markFeatureDue(String(f.key), stamp.today)
  return { features: file.features.length, added: fresh.length, existing: file.features.length - fresh.length, retiered: retier.length, markedDue }
}

/** Admin set this value (import-and-cs-fix): its `<x>_by` says 'admin', or — a row from before those columns — Admin touched the
 *  row at all (`updated_by`), the cautious reading. */
export const setByAdmin = (row: Row, by: 'checked_by' | 'scope_by') => row[by] === 'admin' || (row[by] == null && row.updated_by != null)
/** What a re-tiering writes: the tier always; `checked` unless Admin set it (an OFF tier is always unticked); where it shows unless
 *  Admin set it. PURE. */
export function retierCols(stored: Row, f: Row): Row {
  const cols: Row = { tier: f.tier }
  if (f.tier === 'off' || !setByAdmin(stored, 'checked_by')) { cols.checked = f.tier === 'off' ? false : f.checked; cols.checked_by = 'file' }
  if (!setByAdmin(stored, 'scope_by')) { cols.show_scope = f.show_scope; cols.show_countries = f.show_countries; cols.scope_by = 'file' }
  return cols
}
