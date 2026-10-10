// scripts/_fake-pg.cjs — an in-memory stand-in for the Supabase client, with REAL unique keys (Phase 2D-2 A).
//
// The render kit's fakeDb answers reads and records writes but never stores a row, so it cannot show what
// an upsert does. This one keeps tables, enforces the unique keys it is given, and answers an upsert the way
// Postgres does:
//   • onConflict must name the columns of a unique key on the table, or the write fails with 42P10
//     ("there is no unique or exclusion constraint matching the ON CONFLICT specification") — which is what
//     the live database says after a unique index is dropped;
//   • a plain insert that breaks any unique key fails with 23505;
//   • NULLs are DISTINCT in a unique key (the Postgres default), so two rows with a NULL village never clash.
// A key is a list of column names, or { name, cols?, expr } where expr(row) computes the value (the
// normalised-name index). Ids and timestamps are deterministic. Every write is recorded in `writes`.
// It answers the query shapes the code under test uses — no more. Embedded selects are not resolved: a test
// that reads an embedded table puts the embedded object on the fixture row itself.

function makeFakePg(seed = {}, opts = {}) {
  const tables = {}
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map(r => ({ ...r }))
  const keys = opts.keys || {}            // { table: [ ['name'], { name: 'norm', expr: r => ... }, ... ] }
  const defaults = opts.defaults || {}    // { table: { country: 'GB' } } — column defaults, as the DDL has them
  const writes = []
  let seq = 0
  const nextId = t => `${t}-new-${++seq}`
  const stamp = () => new Date(Date.UTC(2026, 9, 10, 12, 0, seq)).toISOString()

  const keyOf = k => (Array.isArray(k) ? { name: k.join(','), cols: k } : k)
  const valueOf = (k, row) => {
    const kk = keyOf(k)
    if (kk.expr) {
      const v = kk.expr(row)
      return v == null ? null : JSON.stringify(v)
    }
    const vals = kk.cols.map(c => row[c])
    if (vals.some(v => v == null)) return null      // NULLS DISTINCT: a key with a NULL part never clashes
    return JSON.stringify(vals.map(v => (typeof v === 'string' ? v : String(v))))
  }
  const clash = (t, row, ignoreId) => {
    for (const k of keys[t] || []) {
      const v = valueOf(k, row); if (v == null) continue
      const other = (tables[t] || []).find(r => r !== ignoreId && valueOf(k, r) === v)
      if (other) return { key: keyOf(k).name, other }
    }
    return null
  }

  const from = t => {
    tables[t] = tables[t] || []
    const filters = []
    let op = 'select', payload = null, single = null, limitN = null, orderBy = [], range = null
    let conflict = null, ignoreDup = false, wantRows = false
    const str = v => (v == null ? v : String(v))
    const c = {
      select() { if (op !== 'select') wantRows = true; return c },
      eq(k, v) { filters.push(r => str(r[k]) === str(v)); return c },
      neq(k, v) { filters.push(r => str(r[k]) !== str(v)); return c },
      in(k, vs) { const s = vs.map(String); filters.push(r => s.includes(String(r[k]))); return c },
      is(k, v) { filters.push(r => (r[k] ?? null) === v); return c },
      not(k, o, v) { if (o === 'is' && v === null) filters.push(r => r[k] != null); else if (o === 'in') { const s = String(v).replace(/[()]/g, '').split(','); filters.push(r => !s.includes(String(r[k]))) } return c },
      ilike(k, v) { const re = new RegExp('^' + String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i'); filters.push(r => re.test(String(r[k] ?? ''))); return c },
      gte(k, v) { filters.push(r => r[k] != null && String(r[k]) >= String(v)); return c },
      lte(k, v) { filters.push(r => r[k] != null && String(r[k]) <= String(v)); return c },
      gt(k, v) { filters.push(r => r[k] != null && String(r[k]) > String(v)); return c },
      lt(k, v) { filters.push(r => r[k] != null && String(r[k]) < String(v)); return c },
      or() { return c },
      order(k, o) { orderBy.push({ k, asc: !o || o.ascending !== false }); return c },
      limit(n) { limitN = n; return c },
      range(a, b) { range = [a, b]; return c },
      insert(p) { op = 'insert'; payload = p; return c },
      upsert(p, o = {}) { op = 'upsert'; payload = p; conflict = o.onConflict || null; ignoreDup = !!o.ignoreDuplicates; return c },
      update(p) { op = 'update'; payload = p; return c },
      delete() { op = 'delete'; return c },
      maybeSingle() { single = 'maybe'; return c },
      single() { single = 'one'; return c },
      then(res, rej) { return Promise.resolve(run()).then(res, rej) },
    }
    const match = () => (tables[t] || []).filter(r => filters.every(f => f(r)))
    const shape = rows => {
      if (single) {
        if (!rows.length) return { data: null, error: single === 'one' ? { message: 'no rows', code: 'PGRST116' } : null }
        return { data: { ...rows[0] }, error: null }
      }
      return { data: rows.map(r => ({ ...r })), error: null, count: rows.length }
    }
    function run() {
      if (op === 'select') {
        let rows = match()
        for (const o of [...orderBy].reverse()) rows = rows.slice().sort((a, b) => (o.asc ? 1 : -1) * (String(a[o.k] ?? '') < String(b[o.k] ?? '') ? -1 : String(a[o.k] ?? '') > String(b[o.k] ?? '') ? 1 : 0))
        if (range) rows = rows.slice(range[0], range[1] + 1)
        if (limitN != null) rows = rows.slice(0, limitN)
        return shape(rows)
      }
      if (op === 'update') {
        const rows = match()
        for (const r of rows) Object.assign(r, payload)
        writes.push({ table: t, op, patch: payload, ids: rows.map(r => r.id) })
        return wantRows ? shape(rows) : { data: null, error: null }
      }
      if (op === 'delete') {
        const rows = match()
        tables[t] = tables[t].filter(r => !rows.includes(r))
        writes.push({ table: t, op, ids: rows.map(r => r.id) })
        return { data: null, error: null }
      }
      // insert / upsert
      const list = Array.isArray(payload) ? payload : [payload]
      const out = []
      if (op === 'upsert' && conflict) {
        const cols = conflict.split(',').map(s => s.trim())
        const target = (keys[t] || []).map(keyOf).find(k => k.cols && k.cols.join(',') === cols.join(','))
        if (!target) {
          writes.push({ table: t, op, payload, conflict, error: '42P10' })
          return { data: null, error: { code: '42P10', message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' } }
        }
      }
      for (const p of list) {
        const row = { ...(defaults[t] || {}), ...p }
        let existing = null
        if (op === 'upsert' && conflict) {
          const cols = conflict.split(',').map(s => s.trim())
          const v = valueOf(cols, row)
          existing = v == null ? null : tables[t].find(r => valueOf(cols, r) === v) || null
        }
        if (existing) {
          if (ignoreDup) { continue }
          Object.assign(existing, p)
          out.push(existing)
          writes.push({ table: t, op: 'upsert-update', row: { ...p }, id: existing.id })
          continue
        }
        const fresh = { id: row.id ?? nextId(t), created_at: row.created_at ?? stamp(), ...row }
        const hit = clash(t, fresh)
        if (hit) {
          writes.push({ table: t, op, row: { ...p }, error: '23505', key: hit.key })
          return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint "${hit.key}"` } }
        }
        tables[t].push(fresh)
        out.push(fresh)
        writes.push({ table: t, op: op === 'upsert' ? 'upsert-insert' : 'insert', row: { ...p }, id: fresh.id })
      }
      if (!wantRows && !single) return { data: null, error: null }
      return shape(out)
    }
    return c
  }
  return {
    from, tables, writes,
    rpc: async () => ({ data: null, error: null }),
    channel: () => ({ on() { return this }, subscribe() { return this } }),
    removeChannel() {},
    auth: { getUser: async () => ({ data: { user: null } }) },
  }
}

// The live unique keys, BEFORE and AFTER Phase 2D-2 A (docs/schedules-country-report.md §1).
const normName = r => (r.name == null ? null : String(r.name).toLowerCase().replace(/[^a-z0-9]/g, ''))
const KEYS_BEFORE = {
  discovery_trucks: [['name'], { name: 'discovery_trucks_norm_name_uniq', expr: normName }],
  venues: [['name', 'village']],
  discovery_events: [['event_date', 'truck_name', 'venue_name']],
}
const KEYS_AFTER = {
  discovery_trucks: [['country', 'name'], { name: 'discovery_trucks_country_norm_name_uniq', expr: r => (normName(r) == null ? null : [r.country, normName(r)]) }],
  venues: [['country', 'name', 'village']],
  discovery_events: [['event_date', 'truck_name', 'venue_name']],
}
// Between SQL 2 (run now) and SQL 3 (after deploy) BOTH sets are live.
const KEYS_BOTH = Object.fromEntries(Object.keys(KEYS_BEFORE).map(t => [t, [...KEYS_BEFORE[t], ...KEYS_AFTER[t]]]))
const COUNTRY_DEFAULTS = { discovery_trucks: { country: 'GB' }, venues: { country: 'GB' }, discovery_events: { country: 'GB' }, discovery_exclusion_terms: { country: 'GB' } }

module.exports = { makeFakePg, KEYS_BEFORE, KEYS_AFTER, KEYS_BOTH, COUNTRY_DEFAULTS }
