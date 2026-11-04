// scripts/_paperwork-1-fixtures.cjs — paperwork-1 (4 November 2026): the in-memory Supabase (tables, the private bucket, the view
// counter), the seeded type list read from the migration, sample file bytes and the module stubs. A MODULE (shared_modules in
// scripts/harnesses.json), required by scripts/paperwork-1.cjs and scripts/paperwork-1-screens.cjs; it asserts nothing.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS module, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

// ── the in-memory Supabase: tables, a bucket, the one function ────────────────────────────────────────────────────────
function fakeSupabase(seed) {
  const T = {}; for (const [k, v] of Object.entries(seed)) T[k] = v.map(r => ({ ...r }))
  const files = new Map()
  const log = []
  let n = 0
  const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
  const iso = () => new Date().toISOString()
  const DEFAULTS = {
    truck_documents: r => ({ id: uuid(), type_key: null, custom_name: null, issuer: null, issued_on: null, expires_on: null, name_on_document: null, cover_amount_minor: null, currency: null, storage_path: null, mime: null, size_bytes: null, original_filename: null, ai_extracted: null, status: 'pending', superseded_by: null, reminder_stage: null, reminder_expires_on: null, reminder_sent_at: null, created_at: iso(), updated_at: iso(), ...r }),
    document_shares: r => ({ id: uuid(), message: null, event_id: null, revoked_at: null, created_at: iso(), first_opened_at: null, view_count: 0, ...r }),
    document_share_items: r => ({ id: ++n, position: 0, type_key: null, document_id: null, ...r }),
  }
  const violation = () => {
    const cur = (T.truck_documents ?? []).filter(d => d.status === 'current' && d.type_key)
    const keys = cur.map(d => `${d.truck_id}|${d.type_key}`)
    return keys.length !== new Set(keys).size
  }
  function from(table) {
    const filters = []; let op = 'select', payload = null, single = null, order = null, limitN = null
    const self = {
      select() { return self }, insert(rows) { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return self },
      update(v) { op = 'update'; payload = v; return self }, delete() { op = 'delete'; return self },
      eq(k, v) { filters.push(r => r[k] === v); return self }, neq(k, v) { filters.push(r => r[k] !== v); return self },
      in(k, vs) { filters.push(r => vs.includes(r[k])); return self }, is(k, v) { filters.push(r => (r[k] ?? null) === v); return self },
      gt(k, v) { filters.push(r => r[k] != null && String(r[k]) > String(v)); return self }, gte(k, v) { filters.push(r => r[k] != null && String(r[k]) >= String(v)); return self },
      lt(k, v) { filters.push(r => r[k] != null && String(r[k]) < String(v)); return self }, lte(k, v) { filters.push(r => r[k] != null && String(r[k]) <= String(v)); return self },
      not(k, o, v) { if (o === 'is') filters.push(r => (r[k] ?? null) !== v); else { const vs = String(v).replace(/[()]/g, '').split(','); filters.push(r => !vs.includes(r[k])) } return self },
      or() { return self },
      order(k, o = {}) { order = { k, asc: o.ascending !== false }; return self }, limit(x) { limitN = x; return self }, range(a, b) { limitN = b - a + 1; return self },
      maybeSingle() { single = 'maybe'; return self }, single() { single = 'one'; return self },
      then(res, rej) { return Promise.resolve(run()).then(res, rej) },
    }
    function out(list) {
      const copy = list.map(r => ({ ...r }))
      if (single === 'one') return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { message: 'not one row' } }
      if (single === 'maybe') return { data: copy[0] ?? null, error: null }
      return { data: copy, error: null }
    }
    function run() {
      const rows = (T[table] ??= [])
      if (op === 'insert') {
        const made = payload.map(r => (DEFAULTS[table] ? DEFAULTS[table](r) : { ...r }))
        if (table === 'document_shares' && made.some(m => rows.some(r => r.token === m.token))) return { data: null, error: { message: 'duplicate token' } }
        rows.push(...made); log.push(['insert', table, made.length]); return out(made)
      }
      let hit = rows.filter(r => filters.every(f => f(r)))
      if (op === 'update') {
        const before = hit.map(r => ({ ...r }))
        hit.forEach(r => Object.assign(r, payload))
        if (table === 'truck_documents' && violation()) { hit.forEach((r, i) => Object.assign(r, before[i])); return { data: null, error: { message: 'duplicate key value violates unique constraint "truck_documents_one_current_per_type_uq"' } } }
        log.push(['update', table, hit.length]); return out(hit)
      }
      if (op === 'delete') {
        T[table] = rows.filter(r => !hit.includes(r))
        if (table === 'document_shares') T.document_share_items = (T.document_share_items ?? []).filter(i => !hit.some(h => h.id === i.share_id))
        if (table === 'truck_documents') T.document_share_items = (T.document_share_items ?? []).filter(i => !hit.some(h => h.id === i.document_id))
        log.push(['delete', table, hit.length]); return out(hit)
      }
      if (order) hit = [...hit].sort((a, b) => (String(a[order.k]) < String(b[order.k]) ? -1 : String(a[order.k]) > String(b[order.k]) ? 1 : 0) * (order.asc ? 1 : -1))
      if (limitN != null) hit = hit.slice(0, limitN)
      return out(hit)
    }
    return self
  }
  const storage = {
    from(bucket) {
      return {
        createSignedUploadUrl: async p => ({ data: { signedUrl: `https://storage.test/upload/${bucket}/${p}` }, error: null }),
        upload: async (p, bytes, o) => { files.set(p, { bytes: new Uint8Array(bytes), type: o?.contentType }); log.push(['upload', p]); return { data: { path: p }, error: null } },
        download: async p => (files.has(p) ? { data: new Blob([files.get(p).bytes]), error: null } : { data: null, error: { message: 'not found' } }),
        remove: async ps => { ps.forEach(p => files.delete(p)); log.push(['remove', ps.length]); return { data: ps, error: null } },
        createSignedUrl: async (p, s, o) => (files.has(p) ? { data: { signedUrl: `https://storage.test/sign/${bucket}/${p}?ttl=${s}${o?.download ? `&download=${encodeURIComponent(o.download)}` : ''}` }, error: null } : { data: null, error: { message: 'not found' } }),
        list: async prefix => ({ data: [...new Set([...files.keys()].filter(k => k.startsWith(prefix + '/')).map(k => k.slice(prefix.length + 1).split('/')[0]))].map(name => ({ name })), error: null }),
      }
    },
  }
  async function rpc(fn, args) {
    if (fn !== 'paperwork_share_viewed') return { data: null, error: { message: 'no such function' } }
    const s = (T.document_shares ?? []).find(x => x.token === args.p_token && !x.revoked_at && Date.parse(x.expires_at) > Date.now())
    if (!s) return { data: [], error: null }
    s.view_count++; s.first_opened_at = s.first_opened_at ?? iso()
    return { data: [{ share_id: s.id, truck_id: s.truck_id, expires_at: s.expires_at }], error: null }
  }
  const auth = { admin: { deleteUser: async () => ({ error: null }) }, getUser: async () => ({ data: { user: null } }) }
  return { T, files, log, from, storage, rpc, auth, put: (url, bytes) => files.set(url.replace(/^https:\/\/storage\.test\/upload\/[^/]+\//, ''), { bytes: new Uint8Array(bytes) }) }
}

// The seeded type list, read from the migration itself (so the harness and the database cannot disagree).
const MIGRATION = read('supabase/migrations/20261066_paperwork_1.sql')
const TYPE_ROWS = [...MIGRATION.matchAll(/\('([a-z_]+)',\s+(null|'([A-Z]{2})'),\s+(\d+),\s+(true|false),\s+'(expires|review_by)'\)/g)]
  .map(m => ({ id: Number(m[4]) + (m[3] ? 100 : 0), key: m[1], country_code: m[3] ?? null, position: Number(m[4]), has_expiry: m[5] === 'true', date_label: m[6], active: true }))
const BYTES = {
  pdf: Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n'),
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]),
  webp: Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(8)]),
  exe: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(30, 0x90)]),
  heic: fs.readFileSync(path.join(REPO, 'scripts/fixtures/paperwork-1/sample.heic')),
}

/** The module stubs: the access check, the plan gate, the clock, the language and the limiter, each steered by a global. */
const STUBS = {
  '@/lib/truck-access': "export async function resolveTruckAccessWith() { return globalThis.__pwAccess ?? { ok: true, role: 'owner', userId: 'u1', operatorId: 'op1', via: 'owner' } }",
  '@/lib/plan-refusal': "export async function featureRefusal() { return globalThis.__pwGate ?? null }",
  '@/lib/truck-time': "import { LEGACY_UK_TIME_SETTINGS } from '@/lib/time-utils'\nexport async function truckTimeSettings() { return LEGACY_UK_TIME_SETTINGS }\nexport async function truckTimeZone() { return 'Europe/London' }",
  '@/lib/i18n/server-locale': "export async function localeForTruck() { return globalThis.__pwLocale ?? 'en-GB' }",
  '@/lib/ratelimit': "export const paperworkSendRatelimit = { limit: async k => { const f = globalThis.__pwLimit; return f ? f(k) : { success: true } } }",
  '@/lib/plans-server': "export async function getPlanCatalog() { return globalThis.__pwCatalog }",
}

module.exports = { fakeSupabase, MIGRATION, TYPE_ROWS, BYTES, STUBS }
