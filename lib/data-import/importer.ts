// lib/data-import/importer.ts — imports registered data files automatically, once per version (competitor-check-2,
// 29 October 2026; docs/competitor-check-2-report.md). Run by scripts/data-import/main.ts as the FIRST step of the
// competitor-check workflow (nightly and on Run workflow) — before any Claude API call; it needs only the Supabase secrets.
//
// A file is imported when public.data_imports has no row with result 'ok' for its path and the sha256 of its bytes: a
// rerun of the same file does nothing; a changed file is imported again (each importer is idempotent row by row). Every
// attempt is recorded with its counts, or with the reason it failed. Admin › Pricing check shows the last one per file.
import { importResearch, type ResearchFile, type ResearchStore } from './research'

type Row = Record<string, unknown>
/** The registered files. A new data file is imported by adding it here. */
export const DATA_FILES = [
  { path: 'data/compare-de-1/competitors.json', label: 'German research', kind: 'research' },
] as const
export type DataFile = (typeof DATA_FILES)[number]

export interface ImportRecord { file_path: string; sha256: string; imported_at: string; result: 'ok' | 'error'; counts: Row; message: string | null }
export interface ImportStore extends ResearchStore {
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
}
export interface ImportOutcome { path: string; status: 'imported' | 'unchanged' | 'error'; counts?: Row; message?: string }

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
    try {
      const counts = await importResearch(deps.store, JSON.parse(bytes.toString('utf8')) as ResearchFile, { today: now.toISOString().slice(0, 10), path: f.path }) as unknown as Row
      await deps.store.recordImport({ file_path: f.path, sha256: sha, imported_at: now.toISOString(), result: 'ok', counts, message: null })
      deps.log(`${f.path}: imported — ${JSON.stringify(counts)}`)
      out.push({ path: f.path, status: 'imported', counts })
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).slice(0, 2000)
      await deps.store.recordImport({ file_path: f.path, sha256: sha, imported_at: now.toISOString(), result: 'error', counts: {}, message })
      deps.log(`${f.path}: FAILED — ${message}`)
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
    const extra = [c.added < c.competitors ? `${c.competitors - c.added} matched existing competitors${c.upgraded ? `, ${c.upgraded} of them candidates` : ''}` : null,
      c.plansExisting ? `${c.plansExisting} plan${c.plansExisting === 1 ? ' was' : 's were'} already there` : null].filter(Boolean)
    return { path: f.path, ok: true, text: `${f.label} imported ${shortDay(last.imported_at)}: ${c.competitors} competitors, ${c.plans} plans, ${c.entries} entries${extra.length ? ` (${extra.join('; ')})` : ''}` }
  })
}
