// lib/data-import/importer.ts — imports registered data files automatically, once per version (competitor-check-2,
// 29 October 2026; docs/competitor-check-2-report.md). Run by scripts/data-import/main.ts as the FIRST step of the
// competitor-check workflow (nightly and on Run workflow) — before any Claude API call; it needs only the Supabase secrets.
//
// A file is imported when public.data_imports has no row with result 'ok' for its path and the sha256 of its bytes: a
// rerun of the same file does nothing; a changed file is imported again (each importer is idempotent row by row). Every
// attempt is recorded with its counts, or with the reason it failed. Admin › Pricing check shows the last one per file.
import { importResearch, type ResearchFile, type ResearchStore } from './research'
import { importFeatures, type FeaturesFile, type FeaturesStore } from './features'

type Row = Record<string, unknown>
/** The registered files. A new data file is imported by adding it here. */
export const DATA_FILES = [
  { path: 'data/compare-de-1/competitors.json', label: 'German research', kind: 'research' },
  // global-players-1: the big POS players as candidates in every switched-on country (no plans, features or entries).
  { path: 'data/global-players/competitors.json', label: 'Global POS players', kind: 'players' },
  // comparison-features-1: the master list of compared features (only missing keys are added).
  { path: 'data/comparison-features/features.json', label: 'Comparison feature list', kind: 'features' },
  // competitor-wtt-1: What The Truck (GB) — one competitor, its plan and its quoted feature answers, and a check request.
  { path: 'data/competitor-wtt-1/competitors.json', label: 'What The Truck research', kind: 'research' },
  // compare-research-1 (24 Nov 2026): competitors read on their own websites for the countries closest to a live comparison
  // page — eligible ones only (online ordering ahead), quoted answers, plans in minor units, entries, and check requests.
  { path: 'data/compare-research-1/competitors.json', label: 'Comparison research (24 Nov)', kind: 'research' },
  // compare-research-2 (25 Nov 2026): the same research for the countries not yet live, by four region agents (built by
  // docs/compare-research-2/build.cjs; plans the review found without a stated currency or without online ordering are unclear).
  { path: 'data/compare-research-2/competitors.json', label: 'Comparison research 2 (25 Nov)', kind: 'research' },
  // compare-research-2 wave 2 (25 Nov 2026): the remaining switched-on countries (agents 5–7; docs/compare-research-2/build-wave-2.cjs).
  { path: 'data/compare-research-2b/competitors.json', label: 'Comparison research 2, wave 2 (25 Nov)', kind: 'research' },
] as const
export type DataFile = (typeof DATA_FILES)[number]

export interface ImportRecord { file_path: string; sha256: string; imported_at: string; result: 'ok' | 'error'; counts: Row; message: string | null }
export interface ImportStore extends ResearchStore, FeaturesStore {
  /** The rows of public.data_imports; null while 20261045 has not run. */
  imports(): Promise<ImportRecord[] | null>
  recordImport(row: ImportRecord): Promise<void>
}
export interface ImportDeps {
  store: ImportStore
  /** A registered file's bytes (the script reads it from the checkout). */
  read(path: string): Buffer
  sha256(bytes: Buffer): string
  now(): Date
  log(line: string): void
  /** compare-fix-2: runs ONE file's reads and writes all-or-nothing — BEGIN, `fn`, COMMIT; ROLLBACK on any error, and ALWAYS when
   *  `rollback` is true (the dry run). The Postgres store has it (scripts/data-import/main.ts); without it, writes land as they go. */
  transaction?<T>(fn: () => Promise<T>, opts: { rollback: boolean }): Promise<T>
  /** compare-fix-2: the real import of every file inside a transaction that always rolls back — it reports what WOULD be written and
   *  records nothing (no data_imports row either). Needs `transaction`. */
  dryRun?: boolean
}
export interface ImportOutcome { path: string; status: 'imported' | 'unchanged' | 'error' | 'dry_run'; counts?: Row; message?: string }

export async function runImports(deps: ImportDeps, files: readonly DataFile[] = DATA_FILES): Promise<ImportOutcome[]> {
  const done = await deps.store.imports()
  if (!done) throw new Error('public.data_imports is not in the database yet — run supabase/migrations/20261045_competitor_check_2.sql. Nothing was imported.')
  const out: ImportOutcome[] = []
  for (const f of files) {
    const bytes = deps.read(f.path)
    const sha = deps.sha256(bytes)
    if (done.some(r => r.file_path === f.path && r.sha256 === sha && r.result === 'ok')) {
      deps.log(`${f.path}: already imported (sha256 ${sha.slice(0, 12)}…) — nothing to do.`)
      out.push({ path: f.path, status: 'unchanged' }); continue
    }
    const now = deps.now()
    const dry = deps.dryRun === true
    if (dry && !deps.transaction) throw new Error('a dry run needs a store that holds a transaction (the Postgres one) — nothing was run.')
    // compare-fix-2: the whole file — its writes AND its 'ok' row — in ONE transaction; on any error nothing of it is kept.
    const importFile = async () => {
      const parsed = JSON.parse(bytes.toString('utf8'))
      const today = now.toISOString().slice(0, 10)
      // competitor-wtt-1: a research file's quoted answers are checked against the feature list in the database.
      const featureKeys = f.kind === 'features' || typeof deps.store.features !== 'function' ? undefined
        : (await deps.store.features())?.map(r => String(r.key))
      const counts = (f.kind === 'features' ? await importFeatures(deps.store, parsed as FeaturesFile, { today })
        : await importResearch(deps.store, parsed as ResearchFile, { today, path: f.path, featureKeys, nowIso: now.toISOString() })) as unknown as Row
      if (!dry) await deps.store.recordImport({ file_path: f.path, sha256: sha, imported_at: now.toISOString(), result: 'ok', counts, message: null })
      return counts
    }
    try {
      const counts = deps.transaction ? await deps.transaction(importFile, { rollback: dry }) : await importFile()
      if (dry) {
        deps.log(`${f.path}: DRY RUN (rolled back, nothing kept) — would write ${JSON.stringify(counts)}`)
        out.push({ path: f.path, status: 'dry_run', counts }); continue
      }
      deps.log(`${f.path}: imported — ${JSON.stringify(counts)}`)
      out.push({ path: f.path, status: 'imported', counts })
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).slice(0, 2000)
      // the file's transaction has been rolled back: only this error row is written (never during a dry run)
      if (!dry) await deps.store.recordImport({ file_path: f.path, sha256: sha, imported_at: now.toISOString(), result: 'error', counts: {}, message })
      deps.log(`${f.path}: FAILED${deps.transaction ? ' — rolled back, nothing of this file was kept' : ''} — ${message}`)
      out.push({ path: f.path, status: 'error', message })
    }
  }
  return out
}

const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
/** Admin's read-only line for each registered file, from its latest data_imports row (null rows: the SQL has not run). */
export function importLines(rows: ImportRecord[] | null, files: readonly DataFile[] = DATA_FILES): { path: string; ok: boolean | null; text: string }[] {
  return files.map(f => {
    if (!rows) return { path: f.path, ok: null, text: `${f.label}: imported automatically once supabase/migrations/20261045_competitor_check_2.sql has run.` }
    const last = rows.filter(r => r.file_path === f.path).sort((a, b) => b.imported_at.localeCompare(a.imported_at))[0]
    if (!last) return { path: f.path, ok: null, text: `${f.label}: not imported yet — the next competitor-check run imports it.` }
    if (last.result === 'error') return { path: f.path, ok: false, text: `${f.label}: the import on ${shortDay(last.imported_at)} failed — ${last.message ?? 'no reason recorded'} The next run tries again.` }
    const c = last.counts as Record<string, number>
    if (f.kind === 'features') {
      return { path: f.path, ok: true, text: `${f.label} imported ${shortDay(last.imported_at)}: ${c.features} features (${c.added} added${c.existing ? `, ${c.existing} already in the list` : ''}) — competitors marked due` }
    }
    if (f.kind === 'players') {
      const matched = c.competitors - c.added
      return { path: f.path, ok: true, text: `${f.label} imported ${shortDay(last.imported_at)}: ${c.competitors} competitors (${c.added} added${matched ? `, ${matched} matched an existing row` : ''}) — the checker finds where each sells, its plans and features` }
    }
    const extra = [c.added < c.competitors ? `${c.competitors - c.added} matched existing competitors${c.upgraded ? `, ${c.upgraded} of them candidates` : ''}` : null,
      c.plansExisting ? `${c.plansExisting} plan${c.plansExisting === 1 ? ' was' : 's were'} already there` : null,
      // competitor-wtt-1: quoted answers and check requests, when the file had any.
      c.answersAdded ? `${c.answersAdded} feature answer${c.answersAdded === 1 ? '' : 's'}, unverified` : null,
      c.checksRequested ? `${c.checksRequested} check${c.checksRequested === 1 ? '' : 's'} requested` : null].filter(Boolean)
    return { path: f.path, ok: true, text: `${f.label} imported ${shortDay(last.imported_at)}: ${c.competitors} competitors, ${c.plans} plans, ${c.entries} entries${extra.length ? ` (${extra.join('; ')})` : ''}` }
  })
}
