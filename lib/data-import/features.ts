// lib/data-import/features.ts — imports the master list of compared features (data/comparison-features/features.json) into
// public.comparison_features (comparison-features-1, 29 October 2026; docs/comparison-features-1-report.md). Run by
// lib/data-import/importer.ts (kind "features"), once per version of the file.
//
// 🔴 ONLY MISSING KEYS ARE ADDED: a feature already in the table keeps Admin's choices (checked, where it shows). Every row is
// checked first (key, group, scope, countries, HatchGrab's source); a bad file writes nothing. Each ADDED checked feature
// marks every active competitor's answer 'unknown' (where it has none) and every active competitor due, so the next routine
// or deep pass fills it.
import { FEATURE_GROUPS, FEATURE_KEY, SHOW_SCOPES, sourceProblem } from '@/lib/comparison-features'

type Row = Record<string, unknown>
export interface FeaturesFile { checked_on: string; features: Row[] }
export interface FeaturesStore {
  /** key and checked of every row; null while 20261047 has not run. */
  features(): Promise<Row[] | null>
  insertFeatures(rows: Row[]): Promise<void>
  markFeatureDue(key: string, today: string): Promise<number>
}
export interface FeaturesCounts { features: number; added: number; existing: number; markedDue: number }

export function featuresProblems(file: FeaturesFile): string[] {
  if (!file || !Array.isArray(file.features) || !file.features.length) return ['The file is not in the expected shape (features).']
  const out: string[] = [], seen = new Set<string>()
  for (const f of file.features) {
    const who = `Feature "${f.key}"`
    if (typeof f.key !== 'string' || !FEATURE_KEY.test(f.key)) out.push(`${who}: the key must be 2–31 lower-case letters, digits or _.`)
    if (seen.has(String(f.key))) out.push(`${who}: appears twice.`)
    seen.add(String(f.key))
    if (!(FEATURE_GROUPS as readonly unknown[]).includes(f.group_key)) out.push(`${who}: group "${f.group_key}" is not one of ${FEATURE_GROUPS.join(', ')}.`)
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
  const keys = new Set(have.map(r => String(r.key)))
  const fresh = file.features.filter(f => !keys.has(String(f.key))).map(f => ({
    key: f.key, group_key: f.group_key, sort_order: Number(f.sort_order) || 0, checked: f.checked, show_scope: f.show_scope,
    show_countries: f.show_countries, hatchgrab_source: f.hatchgrab_source,
  }))
  if (fresh.length) await store.insertFeatures(fresh)
  let markedDue = 0
  for (const f of fresh) if (f.checked) markedDue += await store.markFeatureDue(String(f.key), stamp.today)
  return { features: file.features.length, added: fresh.length, existing: file.features.length - fresh.length, markedDue }
}
