// lib/pg-rows.ts — generic row writes over a Postgres client (compare-fix-2, 24 November 2026). PURE apart from the client it is given.
// Used by the data importer's and the publish step's Postgres stores (lib/data-import/store-pg.ts, lib/comparison-publish-store-pg.ts),
// which run inside ONE transaction so a file or a publish run is all-or-nothing (the Supabase REST client cannot hold a transaction).
//
// Rows travel as JSON and are typed by Postgres itself (json_populate_recordset against the table's own row type), so arrays, jsonb,
// booleans, numbers and timestamps keep their column types. A column a row does not name keeps its DEFAULT: rows are grouped by the set
// of keys they carry, and each group is inserted with exactly those columns.

type Row = Record<string, unknown>
/** The one client method the stores use (node-postgres's Client and PoolClient both have it). */
export interface PgLike { query(sql: string, params?: unknown[]): Promise<{ rows: Row[]; rowCount?: number | null }> }

const IDENT = /^[a-z_][a-z0-9_]*$/
/** A table or column name, checked (never interpolated from data unchecked). */
export function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`not a plain identifier: ${JSON.stringify(name)}`)
  return `"${name}"`
}
const table = (t: string) => `public.${ident(t)}`
/** The database's own words, its constraint and its detail — so a recorded failure says exactly what was refused. */
export function refused(what: string, e: unknown): Error {
  const x = (e ?? {}) as { message?: string; constraint?: string; detail?: string }
  return new Error(`${what} refused by the database: ${x.message ?? String(e)}${x.detail ? ` (${x.detail})` : ''}`)
}

/** A SELECT's rows exactly as the Supabase REST client returns them — as JSON (timestamps as ISO strings, numbers as numbers, jsonb as
 *  objects) — so a Postgres store hands the same values to the same code as the Supabase store it replaces. */
export async function selectJson(c: PgLike, sql: string, params: unknown[] = []): Promise<Row[]> {
  const r = await c.query(`select coalesce(json_agg(x), '[]'::json) as rows from (${sql}) x`, params)
  return (r.rows[0]?.rows ?? []) as Row[]
}

/** INSERT rows (each group of rows with the same keys in one statement). Returns the number inserted. */
export async function insertRows(c: PgLike, t: string, rows: readonly Row[], opts: { onConflict?: { target: string[]; update: string[] | 'all' } } = {}): Promise<number> {
  const groups = new Map<string, Row[]>()
  for (const r of rows) { const k = Object.keys(r).sort().join(','); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r) }
  let n = 0
  for (const [k, rs] of groups) {
    const cols = k.split(',').filter(Boolean)
    if (!cols.length) continue
    const list = cols.map(ident).join(', ')
    // on conflict: update the named columns this group carries ('all': every column it carries but the key, as supabase-js upsert does)
    const oc = opts.onConflict
    const upd = !oc ? [] : (oc.update === 'all' ? cols.filter(x => !oc.target.includes(x)) : oc.update.filter(u => cols.includes(u)))
    const conflict = !oc ? ''
      : ` on conflict (${oc.target.map(ident).join(', ')}) do ${upd.length ? `update set ${upd.map(u => `${ident(u)} = excluded.${ident(u)}`).join(', ')}` : 'nothing'}`
    for (let i = 0; i < rs.length; i += 500) {
      try {
        const r = await c.query(`insert into ${table(t)} (${list}) select ${list} from json_populate_recordset(null::${table(t)}, $1::json)${conflict}`, [JSON.stringify(rs.slice(i, i + 500))])
        n += r.rowCount ?? 0
      } catch (e) { throw refused(`add ${rs.length} row(s) to ${t}`, e) }
    }
  }
  return n
}

/** UPDATE the columns `cols` names on the rows matching `where` (column = value, all of them). Returns the number updated. */
export async function updateRows(c: PgLike, t: string, cols: Row, where: Record<string, unknown>): Promise<number> {
  const keys = Object.keys(cols)
  if (!keys.length) return 0
  const w = Object.keys(where)
  const set = keys.map(k => `${ident(k)} = r.${ident(k)}`).join(', ')
  const cond = w.map((k, i) => `t.${ident(k)} = $${i + 2}`).join(' and ')
  try {
    const r = await c.query(`update ${table(t)} t set ${set} from json_populate_record(null::${table(t)}, $1::json) r where ${cond}`, [JSON.stringify(cols), ...w.map(k => where[k])])
    return r.rowCount ?? 0
  } catch (e) { throw refused(`update ${t}`, e) }
}

/** One transaction: BEGIN, `fn`, then COMMIT — or ROLLBACK on any error, or always when `rollback` is true (a dry run). */
export async function inTransaction<T>(c: PgLike, fn: () => Promise<T>, opts: { rollback?: boolean } = {}): Promise<T> {
  await c.query('begin')
  try {
    const out = await fn()
    await c.query(opts.rollback ? 'rollback' : 'commit')
    return out
  } catch (e) {
    try { await c.query('rollback') } catch { /* the connection may be gone: nothing was committed */ }
    throw e
  }
}
