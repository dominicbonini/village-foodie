// scripts/till-pack-5-6.cjs — till-pack-5-6 (25 November 2026, docs/till-pack-5-6-report.md): THE ARCHIVE (pack-5), THE VERSION AND ITS PIN
// (pack-6), AND THE PRIVACY POLICY'S RECORDS LINE — the offline proofs. Never connects to a database or any outside service: it runs the REAL
// archive code (lib/till/archive.ts → archive-files.ts, signing.ts, the email), the REAL on-demand route, the REAL account deletion and the
// REAL close run, bundled, against an in-memory database whose till functions mirror the migration's, over a REAL chain export
// (docs/till-pack-1/chain-check.jsonl — a rolled-back demo truck's chain) extended with canonical close / verify / archive entries.
//
//   A · THE ARCHIVE VERIFIES OFFLINE END TO END (scripts/till-verify.cjs --archive), and ANY single-byte change in ANY file is caught.
//   B · NO PERSONAL DATA — every customer field of the fixture's order rows (name, email, phone, notes, line notes) is searched for in every file.
//   C · UNSIGNED, THEN SIGNED — no key: written unsigned; the next run with the key signs it; both verify.
//   D · WHEN IT RUNS — after a year close (the close run), on demand (the route: owner and admin only), before an account closes (account
//       deletion: one archive and one chain entry each; a failed archive stops the deletion cleanly, nothing anonymised).
//   E · THE EMAIL — exactly the approved English, and rendered in every language with the link and the fingerprint.
//   F · THE VERSION — "HatchGrab, till module" 1.0.0, stamped (the migration, the manifest, the chain); the pin fails an unbumped fiscal change.
//   G · THE PRIVACY LINE — exactly the approved English; present in every language an enabled country uses; the unused five untouched.
//   H · THE MIGRATION AND THE BUCKET — additive, private, its objects never changed or deleted; nothing else changed (no screen).
//
// Usage: node scripts/till-pack-5-6.cjs
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const M = require('./_till-sealed-mirror.cjs')
const V = require('./till-verify.cjs')
const PIN = require('./till-version-pin.cjs')
const LT = require('./_legal-translations.cjs')
const REPO = path.resolve(__dirname, '..')
const START = '5f138e41'

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const J = v => JSON.stringify(v)
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const sha = b => crypto.createHash('sha256').update(b).digest('hex')
const MIG_FILE = 'supabase/migrations/20261150_till_pack_5_6.sql'

// ── bundling: bare packages are INERT stubs except fflate / next-intl / react (real) and the virtual modules below ─────────────────────
const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
globalThis.__tp56inert = () => { const inert = new Proxy(function () {}, { get: (_t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : k === '__esModule' ? true : inert), apply: () => inert, construct: () => inert }); return inert }
const VIRTUAL = {
  'next/server': 'module.exports = { NextResponse: { json: (body, init) => ({ status: (init && init.status) || 200, body }) } }',
  // the database client package: EVERY name it exports (read from the installed package at run time) is the harness's factory
  '@supabase/supabase-js': `module.exports = Object.fromEntries(${JSON.stringify(Object.keys(require(path.join(REPO, 'node_modules/@supabase/supabase-js'))))}.map(k => [k, (...a) => globalThis.__tp56client(...a)]))`,
  '@/lib/auth/admin': 'module.exports = { verifyAdmin: async req => req.isAdmin === true }',
  '@/lib/truck-access': 'module.exports = { resolveTruckAccessWith: async (_db, req) => req.access }',
  '@/lib/till/archive-mailer': 'module.exports = { brevoArchiveMailer: () => globalThis.__tp56mailer }',
}
async function bundle(contents, ref = null) {
  const files = ref ? new Set(git('ls-tree', '-r', '--name-only', ref).split('\n')) : null
  const resolveAt = rel => { for (const x of ['', '.ts', '.tsx', '.js', '/index.ts', '.json']) if (files.has(rel + x)) return rel + x; return null }
  const PURE = new Set(['fflate', 'next-intl', 'react'])
  const plugins = [{ name: 'tp56', setup(b) {
    b.onResolve({ filter: /.*/ }, a => (VIRTUAL[a.path] ? { path: a.path, namespace: 'virtual' } : undefined))
    b.onLoad({ filter: /.*/, namespace: 'virtual' }, a => ({ contents: VIRTUAL[a.path], loader: 'js' }))
    b.onResolve({ filter: /^[^./]/ }, a => {
      if (a.path.startsWith('@/')) return undefined
      if (a.path.startsWith('node:')) return { path: a.path, external: true }
      const pkg = a.path.startsWith('@') ? a.path.split('/').slice(0, 2).join('/') : a.path.split('/')[0]
      return PURE.has(pkg) ? { path: a.path, external: true } : { path: a.path, namespace: 'inert' }
    })
    b.onLoad({ filter: /.*/, namespace: 'inert' }, () => ({ contents: 'module.exports = globalThis.__tp56inert()', loader: 'js' }))
    if (!ref) return
    b.onResolve({ filter: /^@\// }, a => { const p = resolveAt(a.path.slice(2)); if (!p) throw new Error(`${ref}: cannot resolve ${a.path}`); return { path: p, namespace: 'git' } })
    b.onResolve({ filter: /^\.\.?\//, namespace: 'git' }, a => { const p = resolveAt(path.posix.normalize(path.posix.join(path.posix.dirname(a.importer), a.path))); if (!p) throw new Error(`${ref}: cannot resolve ${a.path}`); return { path: p, namespace: 'git' } })
    b.onLoad({ filter: /.*/, namespace: 'git' }, a => ({ contents: git('show', `${ref}:${a.path}`), loader: a.path.endsWith('.json') ? 'json' : 'ts', resolveDir: REPO }))
  } }]
  const out = (await esbuild.build({ stdin: { contents, resolveDir: REPO, loader: 'ts', sourcefile: 'entry.ts' }, bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent', alias: ref ? {} : { '@': REPO }, plugins })).outputFiles[0].text
  const mod = { exports: {} }
  new Function('module', 'exports', 'require', out)(mod, mod.exports, require)
  return mod.exports
}

// ── the fixture: a REAL chain (43 entries, 21 orders), extended with canonical entries the way till_write writes them ──────────────────
const TRUCK = 'demo-mk65q66spjck0g9mxt50btfxtr'
const TZ = 'Europe/Paris'
const CHAIN0 = read('docs/till-pack-1/chain-check.jsonl').split('\n').filter(Boolean).map(l => JSON.parse(l))
const ROWS = JSON.parse(read('docs/till-pack-1/rows-check.json'))
const PERSONAL = (() => {
  const out = new Set()
  for (const r of ROWS.orders) {
    const o = JSON.parse(r.row)
    for (const k of ['customer_name', 'customer_email', 'customer_phone', 'notes']) if (typeof o[k] === 'string' && o[k].trim().length >= 3) out.add(o[k].trim())
    for (const n of Object.values(o.line_notes || {})) for (const x of [].concat(n || [])) if (typeof x === 'string' && x.trim().length >= 3) out.add(x.trim())
  }
  return [...out]
})()
const recordedAt = e => JSON.parse(e.payload).recorded_at

function freshDb(opts = {}) {
  const S = { now: opts.now || '2026-11-26T08:00:00.000Z', key: null, objects: new Map(), log: [] }
  const chain = CHAIN0.map(e => ({ ...e, created_at: recordedAt(e) }))
  const T = {
    till_chain: chain, till_closes: [], till_close_signatures: [], till_archives: [], till_archive_signatures: [], till_device_fingerprints: [], till_entry_actors: [],
    till_chain_heads: [{ truck_id: TRUCK, last_seq: chain.length, last_hash: chain[chain.length - 1].hash }],
    till_settings: [{ id: true, software_name: 'HatchGrab, till module', software_version: '1.0.0', signing_public_key: null, signing_key_id: null, guard_mode: 'observe' }],
    trucks: [{ id: TRUCK, operator_id: 'op-1', country: 'FR', dashboard_token: 'tok-owner' }],
    operators: [{ id: 'op-1', email: 'owner@example.invalid', deletion_requested_at: '2026-10-01T00:00:00Z', auth_user_id: null }],
    country_settings: [{ country_code: 'FR', locale: 'fr-FR' }],
  }
  const append = (kind, ref, reason, day, data) => {
    const prev = T.till_chain[T.till_chain.length - 1]
    const envelope = { v: 1, kind, truck_id: TRUCK, ref, version: null, reason, trading_day: day, software_version: T.till_settings[0].software_version, recorded_at: M.tillTs(S.now), identity: null, delta: null, data }
    const payload = M.jsonbText(envelope)
    const payload_hash = sha(payload), seq = prev.seq + 1
    const e = { truck_id: TRUCK, seq, kind, ref, version: null, payload, payload_hash, prev_hash: prev.hash, hash: sha(`${prev.hash}|${seq}|${kind}|${ref}|${payload_hash}`), software_version: envelope.software_version, created_at: S.now }
    T.till_chain.push(e)
    T.till_chain_heads[0] = { truck_id: TRUCK, last_seq: seq, last_hash: e.hash }
    return e
  }
  const cmp = (a, b) => (a == null ? -1 : b == null ? 1 : typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)
  function from(table) {
    const st = { f: [], order: [], range: null, single: null, head: false, write: null }
    const b = {
      select(_c, o) { st.head = !!(o && o.head); return b },
      eq(c, v) { st.f.push(r => r[c] === v); return b },
      gt(c, v) { st.f.push(r => r[c] != null && cmp(r[c], v) > 0); return b },
      lte(c, v) { st.f.push(r => r[c] != null && cmp(r[c], v) <= 0); return b },
      gte(c, v) { st.f.push(r => r[c] != null && cmp(r[c], v) >= 0); return b },
      lt(c, v) { st.f.push(r => r[c] != null && cmp(r[c], v) < 0); return b },
      in(c, arr) { const s = new Set(arr.map(String)); st.f.push(r => s.has(String(r[c]))); return b },
      is(c, v) { st.f.push(r => (r[c] ?? null) === v); return b },
      not() { return b },
      order(c) { st.order.push(c); return b },
      range(a, z) { st.range = [a, z]; return b },
      limit() { return b },
      single() { st.single = 'one'; return b },
      maybeSingle() { st.single = 'maybe'; return b },
      update(v) { st.write = ['update', v]; return b },
      delete() { st.write = ['delete']; return b },
      insert(v) { st.write = ['insert', v]; return b },
      upsert(v) { st.write = ['upsert', v]; return b },
      then(res, rej) {
        if (st.write) { S.log.push(`${st.write[0]} ${table}`); return Promise.resolve(opts.onWrite ? opts.onWrite(table, st.write[0]) : { data: [], error: null }).then(res, rej) }
        S.log.push(`read ${table}`)
        let rows = (T[table] || []).filter(r => st.f.every(f => f(r))).map(r => ({ ...r }))
        if (st.order.length) rows.sort((x, y) => { for (const c of st.order) { const d = cmp(x[c], y[c]); if (d) return d } return 0 })
        if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1)
        const out = st.head ? { data: null, count: rows.length, error: null } : st.single === 'one' ? (rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: 'not one row' } }) : st.single === 'maybe' ? { data: rows[0] ?? null, error: null } : { data: rows, error: null }
        return Promise.resolve(out).then(res, rej)
      },
    }
    return b
  }
  const err = (code, message) => ({ data: null, error: { code, message } })
  async function rpc(fn, a) {
    S.log.push(`rpc ${fn}`)
    const st = T.till_settings[0]
    if (fn === 'till_close_context') return { data: { now: S.now, applies: a.p_truck === TRUCK, till_started_at: T.till_chain[0].created_at, time_zone: TZ, currency: 'EUR', fiscal_year_end: null,
      country_tax_year_start: null, days_scanned_through: opts.scannedThrough ?? null, signing_key_id: st.signing_key_id,
      closes: T.till_closes.map(c => ({ type: c.period_type, period_start: c.period_start, period_end: c.period_end, seq: c.seq, hash: c.hash, totals: c.totals, signed: T.till_close_signatures.some(g => g.seq === c.seq) })) }, error: null }
    if (fn === 'till_register_signing_key') {
      if (!st.signing_key_id) { st.signing_key_id = a.p_key_id; st.signing_public_key = a.p_public_key; return { data: true, error: null } }
      return st.signing_key_id === a.p_key_id && st.signing_public_key === a.p_public_key ? { data: false, error: null } : err('HGT22', 'not the registered key')
    }
    if (fn === 'till_sign_close') { if (st.signing_key_id !== a.p_key_id) return err('HGT22', 'key'); if (T.till_close_signatures.some(g => g.seq === a.p_seq)) return { data: false, error: null }; T.till_close_signatures.push({ truck_id: TRUCK, seq: a.p_seq, key_id: a.p_key_id, signature: a.p_signature, signed_at: S.now }); return { data: true, error: null } }
    if (fn === 'till_archive_commit') {
      if (a.p_truck !== TRUCK) return err('HGT20', 'outside the till')
      if (!a.p_path.startsWith(`${a.p_truck}/`)) return err('HGT20', 'path')
      if (a.p_reason === 'year' && T.till_archives.some(x => x.reason === 'year' && x.period_start === a.p_start && x.period_end === a.p_end)) return err('HGT20', 'already archived')
      if (!T.till_chain.some(e => e.seq === a.p_head_seq && e.hash === a.p_head_hash)) return err('HGT21', 'head')
      if (a.p_signature && a.p_key_id !== st.signing_key_id) return err('HGT22', 'key')
      const id = crypto.randomUUID()
      const e = append('archive', `${a.p_reason}:${a.p_start}:${a.p_end}`, a.p_reason, S.now.slice(0, 10), { archive_id: id, manifest_sha256: a.p_manifest_sha, zip_sha256: a.p_zip_sha, zip_bytes: a.p_bytes, storage_path: a.p_path,
        period_start: a.p_start, period_end: a.p_end, accounting_year_start: a.p_year_start, accounting_year_end: a.p_year_end, chain_head: { seq: a.p_head_seq, hash: a.p_head_hash }, requested_by: a.p_requested_by,
        signing: a.p_signature ? { key_id: a.p_key_id } : 'unsigned' })
      T.till_archives.push({ id, truck_id: TRUCK, reason: a.p_reason, period_start: a.p_start, period_end: a.p_end, manifest_sha256: a.p_manifest_sha, zip_sha256: a.p_zip_sha, zip_bytes: a.p_bytes, storage_path: a.p_path,
        chain_head_seq: a.p_head_seq, chain_head_hash: a.p_head_hash, seq: e.seq, hash: e.hash, software_version: st.software_version, signing_at_commit: a.p_signature ? 'signed' : 'unsigned', requested_by: a.p_requested_by, created_at: S.now })
      if (a.p_signature) T.till_archive_signatures.push({ archive_id: id, truck_id: TRUCK, key_id: a.p_key_id, signature: a.p_signature, signed_at: S.now })
      return { data: { archive_id: id, seq: e.seq, hash: e.hash, signed: !!a.p_signature }, error: null }
    }
    if (fn === 'till_sign_archive') { if (st.signing_key_id !== a.p_key_id) return err('HGT22', 'key'); if (T.till_archive_signatures.some(g => g.archive_id === a.p_archive_id)) return { data: false, error: null }; T.till_archive_signatures.push({ archive_id: a.p_archive_id, truck_id: TRUCK, key_id: a.p_key_id, signature: a.p_signature, signed_at: S.now }); return { data: true, error: null } }
    if (fn === 'till_verify') return { data: { ok: V.verifyText(T.till_chain.map(e => J({ truck_id: e.truck_id, seq: e.seq, kind: e.kind, ref: e.ref, version: e.version, payload: e.payload, payload_hash: e.payload_hash, prev_hash: e.prev_hash, hash: e.hash, software_version: e.software_version })).join('\n')).ok }, error: null }
    return err('42883', `no function ${fn}`)
  }
  const storage = {
    from(bucket) {
      return {
        async upload(p, bytes, o) { S.log.push(`upload ${bucket}/${p}`); if (S.objects.has(p) && !(o && o.upsert)) return { data: null, error: { message: 'The resource already exists' } }; if (o && o.upsert) return { data: null, error: { message: 'refused: upsert' } }; S.objects.set(p, Buffer.from(bytes)); return { data: { path: p }, error: null } },
        async createSignedUrl(p, s) { return { data: { signedUrl: `https://example.invalid/storage/v1/object/sign/${bucket}/${p}?token=t&expires=${s}` }, error: null } },
      }
    },
  }
  // a day close of 25 Nov, chained and recorded exactly as till_close_commit does (its figures are not what this harness proves)
  if (opts.withClose !== false) {
    const headBefore = T.till_chain[T.till_chain.length - 1]
    const totals = { type: 'day', period_start: '2026-11-25', period_end: '2026-11-25', totals: { salesMinor: 4200, refundsMinor: -500, netMinor: 3300, vatMinor: 400 }, gt: { gtIncl: 3700, gtExcl: 3300, gtAbs: 4700, gtPeriod: 3700 } }
    const c = append('close', 'day:2026-11-25', 'close', '2026-11-25', { ...totals, chain_head: { seq: headBefore.seq, hash: headBefore.hash } })
    T.till_closes.push({ truck_id: TRUCK, period_type: 'day', period_start: '2026-11-25', period_end: '2026-11-25', seq: c.seq, hash: c.hash, totals, gt_incl_minor: 3700, gt_excl_minor: 3300, gt_abs_minor: 4700, gt_period_minor: 3700,
      chain_head_seq: headBefore.seq, chain_head_hash: headBefore.hash, software_version: '1.0.0', signing_at_commit: 'unsigned', time_zone: TZ, currency: 'EUR', created_at: S.now })
    append('event', 'verify', 'after_close', '2026-11-26', { type: 'verify', after: 'day:2026-11-25', ok: true })
  }
  if (opts.withYearClose) {
    const hb = T.till_chain[T.till_chain.length - 1]
    const totals = { type: 'year', period_start: '2025-01-01', period_end: '2025-12-31', totals: { salesMinor: 0, refundsMinor: 0, netMinor: 0, vatMinor: 0 }, gt: { gtIncl: 0, gtExcl: 0, gtAbs: 0, gtPeriod: 0 } }
    const c = append('close', 'year:2025-01-01', 'close', '2025-12-31', { ...totals, chain_head: { seq: hb.seq, hash: hb.hash } })
    T.till_closes.push({ truck_id: TRUCK, period_type: 'year', period_start: '2025-01-01', period_end: '2025-12-31', seq: c.seq, hash: c.hash, totals, gt_incl_minor: 0, gt_excl_minor: 0, gt_abs_minor: 0, gt_period_minor: 0,
      chain_head_seq: hb.seq, chain_head_hash: hb.hash, software_version: '1.0.0', signing_at_commit: 'unsigned', time_zone: TZ, currency: 'EUR', created_at: S.now })
  }
  return { db: { from, rpc, storage }, T, S }
}
const newKey = () => crypto.generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')

;(async () => {
  const L = await bundle(`export { buildTillArchive, signPendingArchives, finalArchivesFor, issueArchiveLink, supabaseArchiveStorage, TillArchiveError, ARCHIVE_LINK_SECONDS } from '@/lib/till/archive'
export { buildArchive, zipArchive } from '@/lib/till/archive-files'
export { composeArchiveEmail, archivePeriodLabel } from '@/lib/till/archive-email'
export { runTillCloses } from '@/lib/till/close-run'
export { loadSigningKey, signHash } from '@/lib/till/signing'
export { executeAccountDeletion, AccountDeletionError } from '@/lib/account-deletion'
export { TILL_VERSION, TILL_SOFTWARE_NAME, TILL_VERSION_ROOT, FISCAL_FILES } from '@/lib/till/version'
export { POST as archivePOST } from '@/app/api/till/archive/route'`)
  const fflate = require(path.join(REPO, 'node_modules/fflate'))
  const K = L.loadSigningKey(newKey())
  const mails = []
  const mailer = { async send(e) { mails.push(e); return { ok: true } } }
  const depsOf = (fx, key, extra = {}) => ({ db: fx.db, storage: L.supabaseArchiveStorage(fx.db), signingKey: key, mailer, log: () => {}, ...extra })

  head('A · THE ARCHIVE VERIFIES OFFLINE, END TO END')
  const fx = freshDb()
  t('A0 · the fixture is a REAL chain (docs/till-pack-1/chain-check.jsonl, 43 entries, 21 orders) extended with a close and its verify event — and it verifies', V.verifyText(fx.T.till_chain.map(e => J({ truck_id: e.truck_id, seq: e.seq, kind: e.kind, ref: e.ref, version: e.version, payload: e.payload, payload_hash: e.payload_hash, prev_hash: e.prev_hash, hash: e.hash, software_version: e.software_version })).join('\n')).ok && fx.T.till_chain.length === 45)
  // the close is signed first (the close run's rule) — so the archive carries a signed close
  await fx.db.rpc('till_register_signing_key', { p_public_key: K.publicKeyB64, p_key_id: K.keyId })
  await fx.db.rpc('till_sign_close', { p_truck: TRUCK, p_seq: fx.T.till_closes[0].seq, p_key_id: K.keyId, p_signature: L.signHash(K, fx.T.till_closes[0].hash) })
  const chainBefore = fx.T.till_chain.length
  const r1 = await L.buildTillArchive(depsOf(fx, K), { truckId: TRUCK, reason: 'on_demand', from: '2026-11-01', to: '2026-11-26', requestedBy: 'owner' })
  const zip1 = fx.S.objects.get(r1.path)
  t('A1 · one archive and ONE chain entry (kind "archive", the manifest sha256 in its payload); the zip stored once, under the truck', fx.T.till_archives.length === 1 && fx.T.till_chain.length === chainBefore + 1 && fx.T.till_chain[fx.T.till_chain.length - 1].kind === 'archive'
    && JSON.parse(fx.T.till_chain[fx.T.till_chain.length - 1].payload).data.manifest_sha256 === r1.manifestSha256 && fx.S.objects.size === 1 && r1.path.startsWith(`${TRUCK}/2026/on_demand-2026-11-01_2026-11-26-`))
  const v1 = V.verifyArchive(zip1, { publicKey: K.publicKeyB64 })
  t('A2 · scripts/till-verify.cjs verifyArchive: OK — every file\'s hash, the manifest signature (against the given key), the 45-entry chain, the close and its signature, each day\'s head', v1.ok && /given key/.test(v1.summary.signature) && v1.summary.chain_entries === 45 && v1.summary.closes === 1 && v1.summary.closes_signed === 1 && v1.summary.day_heads >= 2, v1)
  const files = V.readZip(zip1)
  const names = Object.keys(files).sort()
  const EXPECTED = ['README-EN.txt', 'README-FR.txt', 'SHA256SUMS.txt', 'archives.csv', 'chain.jsonl', 'close_signatures.csv', 'closes.csv', 'closes.jsonl', 'deletions.jsonl', 'device_fingerprints.csv', 'entry_actors.csv',
    'manifest.json', 'manifest.sig.json', 'order_lines.csv', 'order_vat.csv', 'order_versions.jsonl', 'orders.csv', 'payments.csv', 'payments.jsonl', 'public_key.txt', 'verify_events.jsonl']
  t(`A3 · the archive holds exactly the ${EXPECTED.length} files the report lists`, J(names) === J(EXPECTED), names)
  const man = JSON.parse(files['manifest.json'].toString('utf8'))
  t('A4 · the manifest: every file with its sha256 and size, the period, the accounting year (calendar, FR), "HatchGrab, till module" 1.0.0, the chain head, each day\'s chain head (Q14)', man.files.length === EXPECTED.length - 2 && man.period.start === '2026-11-01' && man.accounting_year.start === '2026-01-01' && man.accounting_year.end === '2026-12-31'
    && man.software.name === 'HatchGrab, till module' && man.software.version === '1.0.0' && man.chain.last_seq === 45 && man.day_heads.every(d => fx.T.till_chain.some(e => e.seq === d.seq && e.hash === d.hash)), { files: man.files.length, period: man.period, year: man.accounting_year, heads: man.day_heads })
  t('A5 · SHA256SUMS.txt is in the standard format (sha256sum -c), one line per file', files['SHA256SUMS.txt'].toString('utf8').trim().split('\n').every(l => { const [h, n] = l.split('  '); return files[n] && sha(files[n]) === h }))
  t('A6 · the order tables hold the period\'s sealed versions with their VAT lines, deltas, till_id and identity reference', /till_id/.test(files['orders.csv'].toString('utf8').split('\r\n')[0]) && files['order_lines.csv'].toString('utf8').split('\r\n').length > 3 && files['order_versions.jsonl'].toString('utf8').split('\n').filter(Boolean).every(l => { const o = JSON.parse(l); return o.identity && o.identity.hash && o.data.till_id && 'delta' in o }))
  // any single-byte change in any file is caught
  const flipped = []
  for (const n of names) {
    const changed = { ...files }
    const b = Buffer.from(changed[n]); b[Math.floor(b.length / 2)] ^= 0x01; changed[n] = b
    const r = V.verifyArchive(Buffer.from(fflate.zipSync(Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, new Uint8Array(v)])))), { publicKey: K.publicKeyB64 })
    if (r.ok) flipped.push(n)
  }
  t(`A7 · ANY single-byte change in ANY of the ${names.length} files is caught (a data file by its hash; manifest.json by its signature; manifest.sig.json by its signature)`, flipped.length === 0, flipped)
  const extra = V.verifyArchive(Buffer.from(fflate.zipSync({ ...Object.fromEntries(Object.entries(files).map(([k, v]) => [k, new Uint8Array(v)])), 'extra.csv': new Uint8Array(Buffer.from('x')) })), { publicKey: K.publicKeyB64 })
  t('A8 · a file added to the zip is caught; a different public key is caught', !extra.ok && !V.verifyArchive(zip1, { publicKey: L.loadSigningKey(newKey()).publicKeyB64 }).ok)
  const cli = execFileSync(process.execPath, [path.join(REPO, 'scripts/till-verify.cjs'), '--archive', (() => { const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tp56-')), 'a.zip'); fs.writeFileSync(p, zip1); return p })(), '--pub', K.publicKeyB64, '--json'], { encoding: 'utf8' })
  t('A9 · the command line an inspector runs (node scripts/till-verify.cjs --archive <zip> --pub <key>) says OK', JSON.parse(cli).ok === true)

  head('B · NO PERSONAL DATA IN ANY FILE')
  const leaks = []
  for (const n of names) { const s = files[n].toString('utf8'); for (const p of PERSONAL) if (s.includes(p)) leaks.push(`${n}: ${p}`) }
  t(`B1 · none of the fixture's ${PERSONAL.length} distinct customer values (every customer_name, customer_email, customer_phone, notes and line_notes of its ${ROWS.orders.length} order rows) is in any file`, PERSONAL.length >= 3 && leaks.length === 0, { leaks, sample: PERSONAL.slice(0, 3) })
  t('B1b · …by construction: making the archive never reads the orders table (nor order_payments, operators\' details, or any customer table) — only the till\'s sealed records', !fx.S.log.some(x => /^read (orders|order_payments|order_drafts|whatsapp_logs|customers?)$/.test(x)), fx.S.log.filter(x => /^read /.test(x)))
  t('B2 · no file carries a customer field name either (customer_name / customer_email / customer_phone / notes / line_notes)', names.every(n => !/customer_(name|email|phone)|"notes"|line_notes/.test(files[n].toString('utf8'))))

  head('C · UNSIGNED, THEN SIGNED LATER')
  const fx2 = freshDb()
  const u = await L.buildTillArchive(depsOf(fx2, null), { truckId: TRUCK, reason: 'on_demand', from: '2026-11-01', to: '2026-11-26', requestedBy: 'admin' })
  const uz = V.readZip(fx2.S.objects.get(u.path))
  t('C1 · no key: written UNSIGNED (no manifest.sig.json, no signature row) — and its files and chain still verify', !uz['manifest.sig.json'] && fx2.T.till_archives[0].signing_at_commit === 'unsigned' && fx2.T.till_archive_signatures.length === 0 && V.verifyArchive(fx2.S.objects.get(u.path), {}).ok && V.verifyArchive(fx2.S.objects.get(u.path), {}).summary.signature === 'unsigned')
  const K2 = L.loadSigningKey(newKey())
  await fx2.db.rpc('till_register_signing_key', { p_public_key: K2.publicKeyB64, p_key_id: K2.keyId })
  const n2 = await L.signPendingArchives(depsOf(fx2, K2), TRUCK)
  const g = fx2.T.till_archive_signatures[0]
  t('C2 · the next run with the key signs it: one signature, over the manifest sha256, that verifies (and the separately-given signature verifies the zip offline)', n2 === 1 && g && crypto.verify(null, Buffer.from(u.manifestSha256, 'utf8'), crypto.createPublicKey({ key: Buffer.from(K2.publicKeyB64, 'base64'), format: 'der', type: 'spki' }), Buffer.from(g.signature, 'base64'))
    && V.verifyArchive(fx2.S.objects.get(u.path), { publicKey: K2.publicKeyB64, signature: g.signature }).summary.signature === 'verified (signature given separately)')
  t('C3 · signing again signs nothing (once)', (await L.signPendingArchives(depsOf(fx2, K2), TRUCK)) === 0)

  head('D · WHEN IT RUNS — each makes ONE archive and ONE chain entry')
  // D1 · after a year close: the close run asks for the year's archive
  const fx3 = freshDb({ withYearClose: true, scannedThrough: '2026-11-25' })
  const archived = []
  const runOpts = { taxOf: async () => ({ inclusive: true, rateMilli: 20000 }), signingKey: K, trucks: [TRUCK], isDemo: () => false, log: () => {},
    archiveYear: async (truckId, start, end) => { const r = await L.buildTillArchive(depsOf(fx3, K), { truckId, reason: 'year', from: start, to: end, requestedBy: 'system' }); archived.push(r); return r },
    signArchives: truckId => L.signPendingArchives(depsOf(fx3, K), truckId) }
  const c0 = fx3.T.till_chain.length
  const run1 = await L.runTillCloses(fx3.db, runOpts)
  t('D1 · after a year close, the close run makes that year\'s archive: ONE archive (reason "year", 2025), ONE chain entry', run1.trucks[0].archives === 1 && archived.length === 1 && archived[0].reason === 'year' && archived[0].from === '2025-01-01' && fx3.T.till_archives.length === 1 && fx3.T.till_chain.filter((e, i) => i >= c0 && e.kind === 'archive').length === 1, run1)
  const run2 = await L.runTillCloses(fx3.db, runOpts)
  t('D2 · …once: the next run makes none (the year is archived)', run2.trucks[0].archives === 0 && fx3.T.till_archives.length === 1, run2.trucks[0])
  // D3 · on demand, through the real route
  const fx4 = freshDb()
  globalThis.__tp56client = () => fx4.db
  globalThis.__tp56mailer = mailer
  process.env.TILL_SIGNING_KEY = newKey()
  const reqOf = (body, extra = {}) => ({ json: async () => body, ...extra })
  const owner = await L.archivePOST(reqOf({ token: 'tok-owner', action: 'build', from: '2026-11-01', to: '2026-11-26' }, { access: { ok: true, role: 'owner', via: 'owner' } }))
  t('D3 · on demand, the OWNER (dashboard token + an owner session): 200, ONE archive (requested by the owner) and ONE chain entry, a 7-day link, emailed', owner.status === 200 && owner.body.ok && fx4.T.till_archives.length === 1 && fx4.T.till_archives[0].requested_by === 'owner' && /expires=604800/.test(owner.body.archive.url) && owner.body.archive.emailed === true, owner)
  const refused = []
  for (const [what, r] of [
    ['staff', await L.archivePOST(reqOf({ token: 'tok-owner', action: 'build' }, { access: { ok: true, role: 'staff', via: 'member' } }))],
    ['manager', await L.archivePOST(reqOf({ token: 'tok-owner', action: 'build' }, { access: { ok: true, role: 'manager', via: 'member' } }))],
    ['a demo visitor', await L.archivePOST(reqOf({ token: 'tok-owner', action: 'build' }, { access: { ok: true, role: 'owner', via: 'demo' } }))],
    ['no session', await L.archivePOST(reqOf({ token: 'tok-owner', action: 'build' }, { access: { ok: false, status: 401 } }))],
    ['a wrong token', await L.archivePOST(reqOf({ token: 'nope', action: 'build' }, { access: { ok: true, role: 'owner', via: 'owner' } }))],
    ['nobody', await L.archivePOST(reqOf({ truckId: TRUCK, action: 'build' }))],
  ]) if (r.status === 200) refused.push(what); else refused.push(`${what}:${r.status}`)
  t('D4 · …and NOBODY ELSE: staff 403, a manager 403, a demo visitor 403, no session 403, a wrong token 401, no credentials 401 — no archive made', J(refused) === J(['staff:403', 'manager:403', 'a demo visitor:403', 'no session:403', 'a wrong token:401', 'nobody:401']) && fx4.T.till_archives.length === 1, refused)
  const admin = await L.archivePOST(reqOf({ truckId: TRUCK, action: 'build', from: '2026-11-01', to: '2026-11-26' }, { isAdmin: true }))
  t('D5 · an ADMIN (truckId): 200, a second archive, requested by the admin, its own chain entry', admin.status === 200 && fx4.T.till_archives.length === 2 && fx4.T.till_archives[1].requested_by === 'admin' && fx4.T.till_chain.filter(e => e.kind === 'archive').length === 2, admin.body)
  const m0 = mails.length
  const link = await L.archivePOST(reqOf({ token: 'tok-owner', action: 'link', archiveId: fx4.T.till_archives[0].id }, { access: { ok: true, role: 'owner', via: 'owner' } }))
  t('D6 · a NEW 7-day link to an existing archive (action "link"): no new archive, no chain entry, the link emailed again', link.status === 200 && link.body.archive.manifest_sha256 === fx4.T.till_archives[0].manifest_sha256 && fx4.T.till_archives.length === 2 && fx4.T.till_chain.filter(e => e.kind === 'archive').length === 2 && mails.length === m0 + 1)
  t('D7 · the route signs with TILL_SIGNING_KEY when it is set (the owner\'s archive is signed)', fx4.T.till_archives[0].signing_at_commit === 'signed')
  delete process.env.TILL_SIGNING_KEY
  // D8 · account deletion: the final archive comes FIRST; a failure stops it cleanly
  const fx5 = freshDb({ onWrite: (table) => ({ data: null, error: { message: `harness: stop at the first write (${table})` } }) })
  let finalCalls = 0
  const del = await L.executeAccountDeletion(fx5.db, 'op-1', { finalArchive: async (db, truckIds) => { finalCalls++; const r = await L.finalArchivesFor(depsOf(fx5, K), truckIds); return r.map(x => ({ truckId: x.truckId, archiveId: x.archiveId, manifestSha256: x.manifestSha256 })) } }).then(() => null, e => e)
  const firstWrite = fx5.S.log.findIndex(x => /^(update|delete|insert|upsert) /.test(x)), archiveAt = fx5.S.log.findIndex(x => x === 'rpc till_archive_commit')
  t('D8 · account deletion makes the final archive (ONE archive, reason "final", ONE chain entry, emailed) BEFORE its first write — the anonymising steps come after', finalCalls === 1 && fx5.T.till_archives.length === 1 && fx5.T.till_archives[0].reason === 'final' && fx5.T.till_chain.filter(e => e.kind === 'archive').length === 1 && archiveAt >= 0 && firstWrite > archiveAt && del && del.step !== 'till_final_archive', { firstWrite: fx5.S.log[firstWrite], archiveAt, step: del && del.step })
  const fx6 = freshDb()
  const del2 = await L.executeAccountDeletion(fx6.db, 'op-1', { finalArchive: async (db, truckIds) => L.finalArchivesFor(depsOf(fx6, K, { mailer: { async send() { return { ok: false } } } }), truckIds) }).then(() => null, e => e)
  t('D9 · when the final archive cannot be completed (its email does not go), account deletion STOPS with the named step "till_final_archive" — and NOTHING was written (no update, delete or insert)', del2 instanceof L.AccountDeletionError && del2.step === 'till_final_archive' && /final_email/.test(del2.message) && !fx6.S.log.some(x => /^(update|delete|insert|upsert) /.test(x)), { step: del2 && del2.step, writes: fx6.S.log.filter(x => /^(update|delete|insert|upsert) /.test(x)) })
  const fx7 = freshDb()
  const del3 = await L.executeAccountDeletion(fx7.db, 'op-1', { finalArchive: async () => { throw new Error('storage down') } }).then(() => null, e => e)
  t('D10 · any failure of the archive (here the storage) stops it the same way, nothing written', del3 && del3.step === 'till_final_archive' && /storage down/.test(del3.message) && !fx7.S.log.some(x => /^(update|delete|insert|upsert) /.test(x)))
  const ad = read('lib/account-deletion.ts')
  t('D11 · without an injected archiver, account deletion uses the REAL one (lib/till/archive.ts finalArchivesFor: storage, TILL_SIGNING_KEY, the email) — step 1b, before step 2', /tillArchives = await \(options\.finalArchive \?\? realFinalArchive\)\(supabase, truckIds\)/.test(ad) && ad.indexOf('1b. 🔴 THE FINAL TILL ARCHIVE') < ad.indexOf('// ── 2. ANONYMISE ORDERS') && /finalArchivesFor\(\{ db: supabase, storage: supabaseArchiveStorage\(supabase\), signingKey, mailer: brevoArchiveMailer\(\)/.test(ad))
  const er = read('app/api/admin/execute-account-deletion/route.ts')
  t('D12 · the admin route says so clearly: code till_final_archive_failed, partial: false, "nothing was deleted or anonymised"', /code: 'till_final_archive_failed', failedStep: err\.step, partial: false/.test(er) && /nothing was deleted or anonymised/.test(er))

  head('E · THE EMAIL')
  const EN_SUBJECT = 'Your sales archive for {period} is ready'
  const EN_BODY = 'Your HatchGrab sales archive for {period} is ready. Download it here: {link} (the link works for 7 days). Keep a copy: in some countries, such as France, you must keep sales records for 10 years. Archive fingerprint: {hash}. You don\'t need to do anything else.'
  const en = JSON.parse(read('messages/en-GB.json')).emailTillArchive
  t('E1 · the English is EXACTLY the approved wording (subject and body)', en.subject === EN_SUBJECT && en.body === EN_BODY, en)
  const LINK = 'https://example.invalid/storage/v1/object/sign/till-archives/x.zip?token=abc&expires=604800', HASH = 'ab'.repeat(32)
  const e1 = L.composeArchiveEmail({ to: 'o@example.invalid', locale: 'en-GB', timeZone: TZ, from: '2026-01-01', to_: '2026-12-31', link: LINK, hash: HASH })
  t('E2 · rendered in English: "Your sales archive for 2026 is ready", the body word for word, the link clickable in the HTML', e1.subject === 'Your sales archive for 2026 is ready' && e1.text === EN_BODY.replace('{period}', '2026').replace('{link}', LINK).replace('{hash}', HASH) && e1.html.includes(`<a href="${LINK.replace(/&/g, '&amp;')}">`))
  const locales = fs.readdirSync(path.join(REPO, 'messages')).filter(f => /^[a-z]{2,3}-[A-Z]{2}\.json$/.test(f)).map(f => f.replace('.json', '')).filter(l => JSON.parse(read(`messages/${l}.json`)).emailTillArchive)
  const bad = []
  for (const loc of locales) {
    const e = L.composeArchiveEmail({ to: 'o@example.invalid', locale: loc, timeZone: TZ, from: '2026-04-06', to_: '2027-04-05', link: LINK, hash: HASH })
    if (!e.subject || /[{}]/.test(e.subject + e.text) || e.text.split(LINK).length !== 2 || !e.text.includes(HASH) || !/HatchGrab/.test(e.text) || (loc !== 'en-GB' && e.text === EN_BODY.replace('{period}', '').replace('{link}', LINK).replace('{hash}', HASH))) bad.push(loc)
  }
  t(`E3 · it renders in every language that has it (${locales.length}: en-GB and the ${locales.length - 1} language bases): a subject, the link once, the fingerprint, the brand, no placeholder left`, locales.length === 60 && bad.length === 0, bad)
  t('E4 · the period in the reader\'s language: a calendar year is "2026"; a fiscal year is its two dates', L.archivePeriodLabel('2026-01-01', '2026-12-31', 'fr-FR', TZ) === '2026' && /2026.*2027/.test(L.archivePeriodLabel('2026-04-06', '2027-04-05', 'fr-FR', TZ)))
  t('E5 · the email goes to the OWNER\'s address, in the owner\'s language (the truck\'s country), from the archive run', mails.some(m => m.to === 'owner@example.invalid' && m.locale === 'fr-FR'))

  head('F · THE VERSION, AND ITS PIN')
  const mig = read(MIG_FILE)
  t('F1 · "HatchGrab, till module" 1.0.0 (root "1"): lib/till/version.ts and the migration (till_settings.software_name, software_version) agree', L.TILL_SOFTWARE_NAME === 'HatchGrab, till module' && L.TILL_VERSION === '1.0.0' && L.TILL_VERSION_ROOT === '1' && /software_name text not null default 'HatchGrab, till module'/.test(mig) && /set software_version = '1\.0\.0'/.test(mig))
  t('F2 · stamped: the archive\'s manifest and README name it; the archive chain entry and row carry 1.0.0 (the database stamps every entry from till_settings)', man.software.version === '1.0.0' && /HatchGrab, till module, version 1\.0\.0/.test(files['README-EN.txt'].toString('utf8')) && /version 1\.0\.0/.test(files['README-FR.txt'].toString('utf8')) && fx.T.till_archives[0].software_version === '1.0.0' && fx.T.till_chain[fx.T.till_chain.length - 1].software_version === '1.0.0')
  t('F3 · the migration chains a "version" event for every truck already in the till when the version changes', /perform public\.till_append\(h\.truck_id, 'event', 'version', null, 'version_change'/.test(mig))
  const pinNow = PIN.check(REPO)
  t('F4 · the pin passes on this tree: the fiscal files\' source hash is the one recorded for 1.0.0', pinNow.ok, pinNow.problems)
  // a copy of the fiscal files, changed by one byte
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tp56-pin-'))
  for (const f of [...L.FISCAL_FILES, 'lib/till/version-pins.json']) { fs.mkdirSync(path.join(tmp, path.dirname(f)), { recursive: true }); fs.copyFileSync(path.join(REPO, f), path.join(tmp, f)) }
  t('F5 · …and on an unchanged copy of the fiscal files', PIN.check(tmp).ok)
  fs.appendFileSync(path.join(tmp, 'lib/till/close.ts'), '\n// one more byte\n')
  const unbumped = PIN.check(tmp)
  t('F6 · 🔴 a change to a fiscal file WITHOUT a version bump FAILS the pin', !unbumped.ok && unbumped.problems.some(p => /changed without a version bump/.test(p)), unbumped.problems)
  const vfile = path.join(tmp, 'lib/till/version.ts')
  fs.writeFileSync(vfile, fs.readFileSync(vfile, 'utf8').replace("export const TILL_VERSION = '1.0.0'", "export const TILL_VERSION = '1.1.0'"))
  const pins = JSON.parse(fs.readFileSync(path.join(tmp, 'lib/till/version-pins.json'), 'utf8'))
  const minorPin = { version: '1.1.0', source_sha256: PIN.sourceHash(tmp, L.FISCAL_FILES).hash, files: L.FISCAL_FILES.length }
  fs.writeFileSync(path.join(tmp, 'lib/till/version-pins.json'), J({ ...pins, versions: [...pins.versions, minorPin] }))
  for (const f of L.FISCAL_FILES.filter(x => x.startsWith('supabase/'))) fs.writeFileSync(path.join(tmp, f), fs.readFileSync(path.join(tmp, f), 'utf8').replace(/set software_version = '1\.0\.0'/g, "set software_version = '1.1.0'"))
  minorPin.source_sha256 = PIN.sourceHash(tmp, L.FISCAL_FILES).hash
  fs.writeFileSync(path.join(tmp, 'lib/till/version-pins.json'), J({ ...pins, versions: [...pins.versions, minorPin] }))
  const minor = PIN.check(tmp)
  t('F7 · 🔴 …and a fiscal change numbered as a MINOR version (1.1.0, pinned) also FAILS: any fiscal change must raise the major (Q13)', !minor.ok && minor.problems.some(p => /major number was not raised/.test(p)), minor.problems)
  fs.writeFileSync(vfile, fs.readFileSync(vfile, 'utf8').replace("export const TILL_VERSION = '1.1.0'", "export const TILL_VERSION = '2.0.0'"))
  for (const f of L.FISCAL_FILES.filter(x => x.startsWith('supabase/'))) fs.writeFileSync(path.join(tmp, f), fs.readFileSync(path.join(tmp, f), 'utf8').replace(/set software_version = '1\.1\.0'/g, "set software_version = '2.0.0'"))
  const majorPin = { version: '2.0.0', source_sha256: PIN.sourceHash(tmp, L.FISCAL_FILES).hash, files: L.FISCAL_FILES.length }
  fs.writeFileSync(path.join(tmp, 'lib/till/version-pins.json'), J({ ...pins, versions: [...pins.versions, majorPin] }))
  const major = PIN.check(tmp)
  t('F8 · …while the same change as a MAJOR version (2.0.0, pinned, the migration setting it) passes', major.ok, major.problems)
  fs.rmSync(tmp, { recursive: true, force: true })
  const pinsNow = JSON.parse(read('lib/till/version-pins.json'))
  t('F9 · every fiscal version\'s source hash is recorded (lib/till/version-pins.json), with its tag and the source archive\'s sha256 (L102 D / L96 J)', pinsNow.versions.length >= 1 && pinsNow.versions[0].version === '1.0.0' && /^[0-9a-f]{64}$/.test(pinsNow.versions[0].source_sha256) && pinsNow.versions[0].tag === 'till-module-1.0.0' && /^[0-9a-f]{64}$/.test(pinsNow.versions[0].source_archive_sha256 || ''), pinsNow.versions[0])
  const SA = require('./till-source-archive.cjs')
  const saNow = SA.sourceArchive(null)
  t('F9b · the recorded source archive sha256 is the one this tree gives (scripts/till-source-archive.cjs: a deterministic tar of the fiscal files and docs/till/) — and, once the tag exists, the tag\'s', pinsNow.versions[0].source_archive_sha256 === saNow.sha256 && (() => { try { git('rev-parse', '--verify', '-q', 'refs/tags/till-module-1.0.0'); return SA.sourceArchive('till-module-1.0.0').sha256 === saNow.sha256 } catch { return true } })(), { recorded: pinsNow.versions[0].source_archive_sha256, now: saNow.sha256 })
  t('F10 · the pin harness is a registered sweep harness', JSON.parse(read('scripts/harnesses.json')).harnesses.includes('till-version-pin.cjs'))

  head('G · THE PRIVACY POLICY\'S RECORDS LINE')
  const NEW_EN = '- **Accounting records:** at least six years from the end of the relevant financial year, and ten years where the law requires it.'
  const pp = read('content/legal/privacy-policy.md')
  const s7 = pp.slice(pp.indexOf('## 7.'), pp.indexOf('## 8.'))
  t('G1 · section 7 of the English policy has EXACTLY the approved line, once, where the old one was; the old line is gone', pp.split(NEW_EN).length === 2 && s7.includes(NEW_EN) && !pp.includes('as UK tax law requires'))
  // ⚠️ RE-PINNED (privacy-processors-1, 27 November 2026, docs/privacy-processors-1-report.md): a newer round changed section 6, the
  // transfers sentence, the date (27 November 2026) and TERMS_VERSION. G2, G3, G4 and G6 take EXACTLY that named edit back first
  // (scripts/_named-privacy-processors-1.cjs, which throws if it is not there exactly) and check this round's own change as before.
  const PP1 = require('./_named-privacy-processors-1.cjs')   // eslint-disable-line @typescript-eslint/no-require-imports -- CommonJS harness module
  const ppOwn = PP1.asBefore('content/legal/privacy-policy.md', pp), legalOwn = PP1.asBefore('lib/legal.ts', read('lib/legal.ts'))
  t('G2 · "Last updated" is 25 November 2026, and lib/legal.ts\'s mirror (PRIVACY_UPDATED) says the same', /\*\*Last updated:\*\* 25 November 2026\n/.test(ppOwn) && /export const PRIVACY_UPDATED = '25 November 2026'/.test(legalOwn))
  const before = git('show', `${START}:content/legal/privacy-policy.md`)
  t('G3 · nothing else in the English policy changed (two lines: the records line and the date)', (() => { const a = before.split('\n'), b = ppOwn.split('\n'); return a.length === b.length && a.filter((x, i) => x !== b[i]).length === 2 })())
  const back = JSON.parse(read('docs/till-pack-5-6/privacy-line-back-translations.json'))
  const USED = Object.keys(back).sort()
  const UNUSED = ['fil-PH', 'hi-IN', 'ur-PK', 'ta-LK', 'vi-VN']
  const transBad = []
  for (const loc of USED) {
    const f = `content/legal/${loc}/privacy-policy.md`, cur = read(f), now = PP1.asBefore(f, cur), was = git('show', `${START}:${f}`)
    const changed = now.split('\n').filter((x, i) => x !== was.split('\n')[i])
    const problems = LT.compare('privacy-policy.md', cur)   // the structure checker runs on the file as it is today (stamped to today's English)
    if (!now.includes(back[loc].new_line + '\n') || now.includes(back[loc].old_line + '\n') || changed.length !== 2 || problems.length) transBad.push(`${loc}: ${problems.slice(0, 2).join('; ')}`)
  }
  t(`G4 · the line is translated in EVERY language an enabled country uses (${USED.length}), each with its back-translation; each file changes by exactly its line and its source stamp, and passes the structure checker`, USED.length === 54 && transBad.length === 0, transBad)
  t('G5 · the five bases no enabled country uses are untouched (fil-PH, hi-IN, ur-PK, ta-LK, vi-VN)', UNUSED.every(l => read(`content/legal/${l}/privacy-policy.md`) === git('show', `${START}:content/legal/${l}/privacy-policy.md`)))
  t('G6 · TERMS_VERSION is NOT moved ("change nothing else" — the report flags it)', /export const TERMS_VERSION = '2026-11-24'/.test(legalOwn))

  head('H · THE MIGRATION, THE BUCKET, AND WHAT ELSE CHANGED')
  const C = mig.replace(/--[^\n]*/g, '')
  t('H1 · it writes no row of orders, order_payments, action_audit_log or trucks', !/\b(insert\s+into|update|delete\s+from|truncate(\s+table)?)\s+(only\s+)?(public\.)?(orders|order_payments|action_audit_log|trucks)\b/i.test(C))
  t('H2 · the bucket till-archives is created PRIVATE (public = false, also on conflict), zip only, with NO storage policy', /values \('till-archives', 'till-archives', false,/.test(C) && /on conflict \(id\) do update set public = false/.test(C) && !/create policy/i.test(C))
  t('H3 · its objects can never be changed or deleted: a BEFORE UPDATE OR DELETE trigger on storage.objects refuses (HGT01) any object of that bucket', /create trigger till_archive_objects_keep before update or delete on storage\.objects/.test(C) && /if old\.bucket_id = 'till-archives' then\s+raise exception/.test(C))
  t('H4 · and the code never overwrites (upload with upsert: false) nor deletes an archive (no remove call on the bucket anywhere)', /upsert: false/.test(read('lib/till/archive.ts')) && !/storage\.from\(ARCHIVE_BUCKET\)\.remove|till-archives['"]\)\.remove/.test(['lib/till/archive.ts', 'lib/account-deletion.ts', 'lib/delete-truck.ts'].map(read).join('\n')))
  t('H5 · nothing raises a new guard refusal (HGT02–HGT04 stay reserved); place_order_atomic_v2 not touched', !/errcode\s*=\s*'HGT0[234]'/.test(C) && !/place_order_atomic_v2/.test(C.replace(/md5\(pg_get_functiondef[^\n]*/g, '')))
  const mine = git('log', '--format=', '--name-only', '--grep=^till-pack-5-6', `${START}..HEAD`).split('\n').concat(git('diff', '--name-only', 'HEAD').split('\n'), git('ls-files', '--others', '--exclude-standard').split('\n')).filter(Boolean)
  const screens = mine.filter(f => /^components\//.test(f) || /^app\/(?!api\/)/.test(f) || /\.tsx$/.test(f))
  t('H6 · NO SCREEN: no component, page or .tsx file is changed by this work', screens.length === 0, screens)
  const msgFiles = mine.filter(f => /^messages\/[^/]+\.json$/.test(f))
  // ⚠️ RE-PINNED (privacy-processors-1, 27 November 2026): compare-suits-fix-2 (26 Nov, docs/compare-suits-fix-2-report.md) later changed
  // comparison.fit in the message files (the new guide's keys; the old tills / delivery keys removed) — set aside here, on both sides.
  const noFit = o => { if (o.comparison && o.comparison.fit) { o.comparison = { ...o.comparison }; delete o.comparison.fit } return o }
  const msgOther = msgFiles.filter(f => { const now = noFit(JSON.parse(read(f))); const was = noFit(JSON.parse(git('show', `${START}:${f}`))); delete now.emailTillArchive; return J(now) !== J(was) })
  t(`H7 · the ${msgFiles.length} message files gain exactly one namespace — emailTillArchive, the one new message — and nothing else`, msgFiles.length === 60 && msgOther.length === 0, msgOther)
  t('H8 · the email is the only new message: the archive mailer is the only new sender', mine.filter(f => /\.ts$/.test(f) && /api\.brevo\.com/.test(fs.existsSync(path.join(REPO, f)) ? read(f) : '')).every(f => f === 'lib/till/archive-mailer.ts'))
  t('H9 · the dependency: fflate, exact version, no native code', JSON.parse(read('package.json')).dependencies.fflate === '0.8.2')

  head('I · THE DRAFT DOCUMENTS')
  const model = read('docs/till/BOI-LETTRE-000242-model.md').split('\n\n').slice(1).map(x => x.trim()).filter(x => x && !x.startsWith('Source:') && !x.startsWith('scripts/'))
  const draftFr = read('docs/till/attestation-draft-fr.md')
  // every fixed part of every paragraph of the model is in the draft, in order: the model's own fill-in markers are the only gaps
  const FILL = /NOM Prénom|RAISON SOCIALE du distributeur|RAISON SOCIALE de l’éditeur|RAISON SOCIALE|nom et références caractérisant le logiciel ou système|nom et références caractérisant la version du logiciel OU système|ce logiciel\/système OU les fonctionnalités de caisse de ce logiciel\/système|satisfait OU satisfont|\(VILLE\)|\(DATE\)|XXX-aaa|XXX|DATE|\([123]\)/g   // the footnote markers too: a licence number is written just before (2)
  const missing = []
  for (const para of model) {
    const parts = para.split(FILL).map(x => x.trim()).filter(x => x.length >= 3)
    let at = 0
    for (const part of parts) { const i = draftFr.indexOf(part, at); if (i < 0) { missing.push(part.slice(0, 80)); break } at = i + part.length }
  }
  t(`I1 · the French attestation keeps EVERY fixed part of the model (BOI-LETTRE-000242, ${model.length} paragraphs, as published) word for word and in order — only the model's fill-in markers are filled`, model.length >= 15 && missing.length === 0, missing)
  t('I2 · …filled for HatchGrab Ltd, "HatchGrab, till module" version 1.0.0, root 1 / 1.y.z, signed by "[Full name], director, HatchGrab Ltd", with the name, company number and registered address left as placeholders', /représentant légal de la société HatchGrab Ltd, éditeur du logiciel \/ système de caisse « HatchGrab, till module »/.test(draftFr) && /dans sa version n° 1\.0\.0/.test(draftFr) && /racine suivante : 1 et/.test(draftFr) && /subdivisions suivantes de cette racine : 1\.y\.z/.test(draftFr) && /\[Full name\], director, HatchGrab Ltd/.test(draftFr) && /\[numéro d’immatriculation\]/.test(draftFr) && /\[adresse du siège social\]/.test(draftFr))
  t('I3 · volet 1 and volet 2 as the model has them; an English reading copy; the technical document in French and English; all marked DRAFT, and "sign only once the guard enforces"', /I\. Volet 1/.test(draftFr) && /II\. Volet 2/.test(draftFr) && /READING COPY/.test(read('docs/till/attestation-draft-en.md')) && ['docs/till/technical-document-fr.md', 'docs/till/technical-document-en.md'].every(f => /DRAFT|PROJET/.test(read(f)) && /enforce/.test(read(f))) && /enforce/.test(draftFr))
  t('I4 · the technical document covers inalterability, security, conservation and archiving, the perimeter, the version rules and how an inspector verifies an archive', ['Inaltérabilité', 'Sécurisation', 'Conservation', 'Archivage', 'Périmètre', 'Règles de version', 'Contrôle'].every(h => read('docs/till/technical-document-fr.md').includes(h)) && ['Inalterability', 'Security', 'Conservation', 'Archiving', 'Perimeter', 'Version rules', 'Inspection'].every(h => read('docs/till/technical-document-en.md').includes(h)))
  t('I5 · none of the drafts is published or shown in the app (nothing outside docs/ names them)', !mine.filter(f => !f.startsWith('docs/') && fs.existsSync(path.join(REPO, f))).some(f => /attestation-draft|technical-document-(fr|en)/.test(read(f)) && !/^scripts\/till-pack-5-6\.cjs$/.test(f)))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
