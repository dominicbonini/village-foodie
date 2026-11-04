#!/usr/bin/env node
// scripts/paperwork-1.cjs — paperwork-1 (4 November 2026, docs/paperwork-1-report.md): Manage › Documents (internally `paperwork`).
//   node scripts/paperwork-1.cjs        (NO NETWORK, NO DATABASE, NO AI, NO EMAIL — an in-memory database and storage; the model
//                                       and Brevo answer from fixtures)
//
// The REAL route (app/api/manage/paperwork), store, organiser page and file routes, reminders, account deletion and hard delete
// run against an in-memory Supabase stand-in (tables + a private bucket), with the access check, plan gate, clock, language and
// rate limiter stubbed per test. What it proves, in order:
//    1 · the migration: RLS on, no policy, no anon/authenticated grant, the private bucket, the view counter for the service role;
//    2 · the type list per country (GB's own eleven; any other country the general ten);
//    3 · upload validation by BYTES (not the name), the 20 MB limit, HEIC → JPEG (a real HEIC file);
//    4 · the AI fixture → a pre-filled draft, and NOTHING saved before Save; the failed-read path (an empty form, the file kept);
//    5 · Save, and renewal (the old one superseded, kept as history, never two current);
//    6 · status thresholds and the warnings;
//    7 · reminder stages (28 / 7 / 0 days, then weekly), never the same stage twice, email only, the skipped trucks;
//    8 · the share: token (random, 192 bits), validation, the rate limit (fail closed), the email (From "<Truck> via HatchGrab",
//        Reply-To the truck), expiry and Turn off;
//    9 · the organiser page: noindex, no-store, the CURRENT version shown, the expired/turned-off message, the view count;
//   10 · one file and Download all (a valid ZIP);
//   11 · deletion removes files and takes the document off live links; account deletion and the hard delete remove everything;
//   12 · the plan gate (ON by default), the tab, the words in all 28 bases, the privacy paragraph and its drift check.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'paperwork-1' })
const { REPO } = kit

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const ymd = d => d.toISOString().slice(0, 10)
const day = n => ymd(new Date(Date.now() + n * 86_400_000))

const { fakeSupabase, MIGRATION, TYPE_ROWS, BYTES, STUBS } = require('./_paperwork-1-fixtures.cjs')

;(async () => {
  const L = await kit.bundle('pw1', [
    "export { POST } from '@/app/api/manage/paperwork/route'",
    "export { default as OrganiserPage, metadata as organiserMetadata, dynamic as organiserDynamic } from '@/app/docs/[token]/page'",
    "export { GET as fileGET } from '@/app/docs/[token]/file/[documentId]/route'",
    "export { GET as allGET } from '@/app/docs/[token]/all/route'",
    "export * as M from '@/lib/paperwork/model'",
    "export { sniffMime } from '@/lib/paperwork/sniff'",
    "export { normaliseAiAnswer, paperworkPrompt, PAPERWORK_MODEL } from '@/lib/paperwork/ai-read'",
    "export { newShareToken } from '@/lib/paperwork/share'",
    "export { crc32 } from '@/lib/paperwork/zip'",
    "export { runPaperworkDaily } from '@/lib/paperwork/reminders'",
    "export { executeAccountDeletion } from '@/lib/account-deletion'",
    "export { deleteTruckCascade } from '@/lib/delete-truck'",
    "export { featureAccess } from '@/lib/plans'",
    "export { FEATURES } from '@/lib/features'",
  ].join('\n'), { stubs: STUBS })
  const M = L.M
  const TODAY = ymd(new Date())
  process.env.GEMINI_API_KEY = 'harness-key'; process.env.BREVO_API_KEY = 'harness-key'
  process.env.NEXT_PUBLIC_HATCHGRAB_URL = 'https://www.hatchgrab.com'

  // fetch: the model and Brevo answer from fixtures; everything is recorded.
  const calls = { gemini: [], brevo: [] }
  globalThis.__gemini = () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
    type: { key: 'gas_safety', confidence: 0.94 }, suggested_name: null,
    issuer: { value: 'Anglia Gas Services', confidence: 0.9 }, issued_on: { value: day(-348), confidence: 0.9 }, expires_on: { value: day(17), confidence: 0.92 },
    name_on_document: { value: 'Pizza Kitchen Ltd', confidence: 0.8 }, cover: { amount: null, currency: null, confidence: 0 },
  }) }] } }] })
  globalThis.fetch = async (url, init) => {
    const u = String(url)
    // the model's and the email provider's endpoints: answered here, never reached
    if (u.includes('generativelanguage')) { const b = JSON.parse(init.body); calls.gemini.push(b); return { json: async () => globalThis.__gemini(b) } }
    if (u.includes('brevo')) { const b = JSON.parse(init.body); calls.brevo.push(b); return { ok: globalThis.__brevoOk !== false, status: globalThis.__brevoOk === false ? 500 : 201, json: async () => ({}) } }
    throw new Error('unexpected fetch ' + u)
  }
  const TRUCK = { id: 'test-truck', name: 'Pizza Kitchen', country: 'GB', currency: 'GBP', contact_email: 'owner@pizzakitchen.test', dashboard_token: 'tok-test', operator_id: 'op1', plan: 'trial', trial_expires_at: null, feature_overrides: {}, active: true, timezone: 'Europe/London', logo_storage_path: null }
  const newDb = (extra = {}) => fakeSupabase({
    trucks: [TRUCK, { ...TRUCK, id: 'other-truck', name: 'Other Van', dashboard_token: 'tok-other', operator_id: 'op2' }],
    operators: [{ id: 'op1', name: 'Dominic Test', first_name: 'Dominic', last_name: 'Test', auth_user_id: 'u1', deletion_requested_at: '2026-10-01T00:00:00Z' }],
    paperwork_document_types: TYPE_ROWS,
    truck_events: [{ id: 'ev-1', truck_id: 'test-truck', event_date: day(32), venue_name: 'Cambridge Christmas Market', status: 'confirmed', is_private: false }],
    ...extra,
  })
  const POST = async (db, body) => {
    globalThis.__harnessDb = db
    const res = await kit.quietAsync(() => L.POST({ headers: new Headers({}), json: async () => ({ token: 'tok-test', ...body }) }))
    return { status: res.status, body: await res.json() }
  }
  /** The browser's part of an upload: ask for the URL, PUT the bytes, ask for the read. */
  const upload = async (db, bytes, filename, contentType) => {
    const u = await POST(db, { action: 'upload_url', filename, contentType, size: bytes.length })
    if (u.status !== 200) return { u }
    db.put(u.body.uploadUrl, bytes)
    const r = await POST(db, { action: 'read', documentId: u.body.documentId })
    return { u, r, id: u.body.documentId }
  }

  // ── 1 · the migration ───────────────────────────────────────────────────────────────────────────────────────────────
  head('1 · the migration: RLS on, no policy, no grant to anon/authenticated, a private bucket')
  {
    const tables = ['paperwork_document_types', 'truck_documents', 'document_shares', 'document_share_items']
    t('RLS enabled on all four tables', tables.every(x => new RegExp(`alter table public\\.${x} enable row level security`).test(MIGRATION)))
    t('every table and sequence revoked from anon and authenticated; no policy created', tables.every(x => new RegExp(`revoke all on public\\.${x} from anon, authenticated`).test(MIGRATION)) && !/create policy/i.test(MIGRATION)
      && /revoke all on sequence public\.paperwork_document_types_id_seq from anon, authenticated/.test(MIGRATION) && /revoke all on sequence public\.document_share_items_id_seq from anon, authenticated/.test(MIGRATION))
    t('the bucket truck-documents: private, 20 MB, the accepted types only — and no storage policy', /values \('truck-documents', 'truck-documents', false, 20971520,/.test(MIGRATION) && /on conflict \(id\) do update set public = false/.test(MIGRATION) && !/storage\.objects.*policy/i.test(MIGRATION.replace(/--.*$/gm, '')))
    t('the view counter is executable by the service role only', /revoke all on function public\.paperwork_share_viewed\(text\) from public, anon, authenticated/.test(MIGRATION) && /grant execute on function public\.paperwork_share_viewed\(text\) to service_role/.test(MIGRATION))
    t('the token CHECK: 22–64 base64url characters (the 128-bit floor is enforced by the table too)', /check \(length\(token\) between 22 and 64 and token ~ '\^\[A-Za-z0-9_-\]\+\$'\)/.test(MIGRATION))
    t('one CURRENT document per truck and type (unique index); a link lives at most 91 days', /truck_documents_one_current_per_type_uq[\s\S]*where status = 'current' and type_key is not null/.test(MIGRATION) && /expires_at <= created_at \+ interval '91 days'/.test(MIGRATION))
    t('no plan_features row: a missing row means ON for every plan', !/plan_features/i.test(MIGRATION.replace(/--.*$/gm, '')))
    t('the migration runner would accept it unapproved (no protected table written, no named truck)', !/\b(update|delete\s+from|truncate)\s+(public\.)?(trucks|orders|plans|plan_prices|plan_features|country_settings)\b/i.test(MIGRATION) && !/pizzeria-gusto/i.test(MIGRATION))
  }

  // ── 2 · types per country ───────────────────────────────────────────────────────────────────────────────────────────
  head('2 · the type list per country — GB its own eleven, every other country the general ten')
  {
    const rows = TYPE_ROWS.map(r => ({ key: r.key, countryCode: r.country_code, position: r.position, hasExpiry: r.has_expiry, dateLabel: r.date_label, active: true }))
    const gb = M.typesForCountry(rows, 'GB').map(x => x.key), fr = M.typesForCountry(rows, 'FR').map(x => x.key), us = M.typesForCountry(rows, 'us').map(x => x.key)
    t('GB, in order: food_registration … street_trading_licence (11)', JSON.stringify(gb) === JSON.stringify(['food_registration', 'hygiene_rating', 'food_safety_plan', 'public_liability', 'employers_liability', 'gas_safety', 'pat_test', 'fire_safety', 'risk_assessment', 'allergen_info', 'street_trading_licence']), gb)
    t('FR and US (no list of their own) get the general list (10)', JSON.stringify(fr) === JSON.stringify(['food_registration', 'hygiene_rating', 'food_safety_plan', 'public_liability', 'gas_safety', 'electrical_safety', 'fire_safety', 'risk_assessment', 'allergen_info', 'trading_licence']) && JSON.stringify(us) === JSON.stringify(fr), fr)
    const g = M.typesForCountry(rows, 'GB')
    t('the hygiene rating has no expiry; the HACCP plan has a "review by" date', g.find(x => x.key === 'hygiene_rating').hasExpiry === false && g.find(x => x.key === 'food_safety_plan').dateLabel === 'review_by')
    t('an inactive row drops out', M.typesForCountry(rows.map(r => (r.key === 'pat_test' ? { ...r, active: false } : r)), 'GB').length === 10)
  }

  // ── 3 · upload validation ──────────────────────────────────────────────────────────────────────────────────────────
  head('3 · upload validation — by the BYTES, 20 MB, HEIC converted')
  {
    t('the bytes decide: PDF, JPEG, PNG, WebP and HEIC recognised; a Windows program is not', L.sniffMime(BYTES.pdf) === 'application/pdf' && L.sniffMime(BYTES.jpeg) === 'image/jpeg' && L.sniffMime(BYTES.png) === 'image/png'
      && L.sniffMime(BYTES.webp) === 'image/webp' && L.sniffMime(BYTES.heic) === 'image/heic' && L.sniffMime(BYTES.exe) === null && L.sniffMime(Buffer.from('hello')) === null)
    const db = newDb()
    const big = await POST(db, { action: 'upload_url', filename: 'huge.pdf', contentType: 'application/pdf', size: M.MAX_FILE_BYTES + 1 })
    const at = await POST(db, { action: 'upload_url', filename: 'ok.pdf', contentType: 'application/pdf', size: M.MAX_FILE_BYTES })
    t('over 20 MB refused before anything is stored (413, paperwork_file_too_big); exactly 20 MB accepted', big.status === 413 && big.body.code === 'paperwork_file_too_big' && at.status === 200 && !db.T.truck_documents.some(d => d.original_filename === 'huge.pdf'), big)
    const decl = await POST(db, { action: 'upload_url', filename: 'x.exe', contentType: 'application/x-msdownload', size: 100 })
    t('a declared type that is not accepted is refused (415)', decl.status === 415 && decl.body.code === 'paperwork_file_type')
    const disguised = await upload(db, BYTES.exe, 'certificate.pdf', 'application/pdf')
    t('"certificate.pdf" whose bytes are a program: refused at read (415), its file and pending row removed', disguised.r.status === 415 && disguised.r.body.code === 'paperwork_file_type'
      && !db.T.truck_documents.some(d => d.id === disguised.id) && ![...db.files.keys()].some(k => k.includes(disguised.id)))
    calls.gemini.length = 0
    const heic = await upload(db, BYTES.heic, 'IMG_0042.HEIC', 'image/heic')
    const row = db.T.truck_documents.find(d => d.id === heic.id)
    const stored = row && db.files.get(row.storage_path)
    t('a real HEIC photo is converted: stored as .jpg, image/jpeg, JPEG bytes; the HEIC file is gone', heic.r.status === 200 && row.mime === 'image/jpeg' && /\.jpg$/.test(row.storage_path) && stored && stored.bytes[0] === 0xff && stored.bytes[1] === 0xd8
      && ![...db.files.keys()].some(k => /\.heic$/i.test(k)), { r: heic.r, row })
    t('…and the AI is sent the JPEG, not the HEIC', calls.gemini.at(-1)?.contents[0].parts[1].inlineData.mimeType === 'image/jpeg')
    const misnamed = await upload(db, BYTES.png, 'scan.pdf', 'application/pdf')
    t('a PNG named .pdf is kept as what it is (image/png, .png)', db.T.truck_documents.find(d => d.id === misnamed.id).mime === 'image/png' && /\.png$/.test(db.T.truck_documents.find(d => d.id === misnamed.id).storage_path))
    t('the screen checks size and type before uploading (client) and the route checks again (server)', /file\.size > MAX_FILE_BYTES/.test(read('components/manage/PaperworkTab.tsx')) && /size > MAX_FILE_BYTES/.test(read('app/api/manage/paperwork/route.ts')))
  }

  // ── 4 · the AI read, and nothing saved before Save ──────────────────────────────────────────────────────────────────
  head('4 · the AI fixture → a pre-filled draft; NOTHING saved before Save; the failed read')
  let db = newDb()
  {
    calls.gemini.length = 0
    const up = await upload(db, BYTES.pdf, 'gas-cert.pdf', 'application/pdf')
    const d = up.r.body.draft
    t('the draft: Gas safety certificate, Anglia Gas Services, both dates, Pizza Kitchen Ltd', up.r.status === 200 && up.r.body.read === true && d.typeKey === 'gas_safety' && d.issuer === 'Anglia Gas Services'
      && d.issuedOn === day(-348) && d.expiresOn === day(17) && d.nameOnDocument === 'Pizza Kitchen Ltd' && d.coverAmountMinor === null, up.r.body)
    t('…with a confidence for each field', up.r.body.confidence && up.r.body.confidence.type === 0.94 && up.r.body.confidence.expiresOn === 0.92)
    const g = calls.gemini.at(-1)
    t('the same provider and model as the demo menu reader: Gemini gemini-2.5-flash, the file inline, temperature 0, JSON', /gemini-2\.5-flash/.test(read('lib/menu-extract.ts')) && L.PAPERWORK_MODEL === 'gemini-2.5-flash'
      && g.generationConfig.temperature === 0 && g.generationConfig.responseMimeType === 'application/json' && g.contents[0].parts[1].inlineData.mimeType === 'application/pdf')
    t('the prompt offers the country\'s list (GB: street_trading_licence, not trading_licence) and "other"', /street_trading_licence — Street trading licence/.test(g.contents[0].parts[0].text) && !/\btrading_licence —/.test(g.contents[0].parts[0].text) && /use "other"/.test(g.contents[0].parts[0].text))
    const row = db.T.truck_documents.find(x => x.id === up.id)
    t('🔴 NOTHING SAVED: the row is still pending, with no type, dates, issuer or name — only the file and what the AI read', row.status === 'pending' && row.type_key === null && row.expires_on === null && row.issuer === null && row.name_on_document === null && row.ai_extracted?.ok === true && row.ai_extracted.model === 'gemini-2.5-flash', row)
    const list = await POST(db, { action: 'load' })
    t('…and the list does not show it', list.status === 200 && list.body.documents.length === 0, list.body.documents)
    t('the screen\'s warnings for the draft: "expires in 17 days" (and no name warning: Pizza Kitchen Ltd is the truck)', JSON.stringify(M.draftWarnings({ expiresOn: d.expiresOn, nameOnDocument: d.nameOnDocument }, TODAY, list.body.truckNames, true)) === JSON.stringify([{ code: 'expiresSoon', params: { days: 17 } }]))
    globalThis.__gemini = () => ({ error: { code: 400, message: 'Unable to process input image' } })
    const bad = await upload(db, BYTES.jpeg, 'blurry.jpg', 'image/jpeg')
    const badRow = db.T.truck_documents.find(x => x.id === bad.id)
    t('the failed read: 200 with read:false and an EMPTY form; the file is KEPT; the row pending; what failed is recorded for support', bad.r.status === 200 && bad.r.body.read === false && Object.values(bad.r.body.draft).every(v => v === null)
      && db.files.has(badRow.storage_path) && badRow.status === 'pending' && badRow.ai_extracted.ok === false && /Unable to process/.test(badRow.ai_extracted.reason), bad.r.body)
    t('…and the screen says "We couldn\'t read this document" for it', M.draftWarnings({ expiresOn: null, nameOnDocument: null }, TODAY, [], false)[0].code === 'notRead')
    globalThis.__gemini = () => ({ candidates: [{ content: { parts: [{ text: 'not json at all' }] } }] })
    const garbled = await upload(db, BYTES.jpeg, 'x.jpg', 'image/jpeg')
    t('an answer that is not JSON is a failed read too', garbled.r.body.read === false)
    const n = L.normaliseAiAnswer({ type: { key: 'jet_licence', confidence: 0.4 }, suggested_name: 'Pitch permit', issuer: { value: '  Camden  Council ', confidence: 2 }, issued_on: { value: '2026-02-30' }, expires_on: { value: 'next year' },
      name_on_document: { value: 'null' }, cover: { amount: '5,000,000', currency: 'gbp', confidence: 0.7 } }, ['gas_safety'], 'EUR')
    t('the AI\'s answer is checked: an unknown type → Other with its suggested name; impossible dates dropped; cover → minor units', n.details.typeKey === null && n.details.customName === 'Pitch permit' && n.details.issuer === 'Camden Council'
      && n.details.issuedOn === null && n.details.expiresOn === null && n.details.nameOnDocument === null && n.details.coverAmountMinor === 500000000 && n.details.currency === 'GBP' && n.confidence.issuer === 1, n)
    t('the currency falls back to the truck\'s when the document names none', L.normaliseAiAnswer({ cover: { amount: 1000000 } }, [], 'GBP').details.currency === 'GBP')
    // Save the first upload.
    globalThis.__gemini = () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] })
    const saved = await POST(db, { action: 'save', documentId: up.id, details: { ...d } })
    t('Save makes it current', saved.status === 200 && db.T.truck_documents.find(x => x.id === up.id).status === 'current')
    const twice = await POST(db, { action: 'save', documentId: up.id, details: { ...d } })
    t('a second Save of the same upload is refused (only a pending upload is saved)', twice.status === 404)
    const badDetails = [
      { ...d, typeKey: 'not_a_type' }, { ...d, typeKey: null, customName: '' }, { ...d, expiresOn: '2026-13-01' },
      { ...d, issuedOn: day(10), expiresOn: day(5) }, { ...d, coverAmountMinor: 500, currency: null },
    ]
    const results = []
    for (const det of badDetails) { const x = await upload(db, BYTES.pdf, 'a.pdf', 'application/pdf'); results.push((await POST(db, { action: 'save', documentId: x.id, details: det })).status) }
    t('details that cannot be saved are refused (400): unknown type, no name, a bad date, expiry before issue, cover without currency', results.every(s => s === 400), results)
    const other = await POST(db, { action: 'load' })
    t('the type that has no expiry (hygiene rating) is saved without one, whatever was sent', await (async () => {
      const x = await upload(db, BYTES.jpeg, 'fhrs.jpg', 'image/jpeg')
      await POST(db, { action: 'save', documentId: x.id, details: { typeKey: 'hygiene_rating', expiresOn: day(100), issuer: 'Cambridge City Council' } })
      return db.T.truck_documents.find(r => r.id === x.id).expires_on === null
    })() && other.status === 200)
  }

  // ── 5 · renewal ───────────────────────────────────────────────────────────────────────────────────────────────────────
  head('5 · renewing: the old document superseded, kept as history — never two current')
  let gasOld, gasNew
  {
    gasOld = db.T.truck_documents.find(x => x.type_key === 'gas_safety' && x.status === 'current').id
    const up = await upload(db, BYTES.pdf, 'gas-2027.pdf', 'application/pdf')
    const r = await POST(db, { action: 'save', documentId: up.id, details: { typeKey: 'gas_safety', issuer: 'Anglia Gas Services', issuedOn: day(1), expiresOn: day(366) } })
    gasNew = up.id
    const old = db.T.truck_documents.find(x => x.id === gasOld), neu = db.T.truck_documents.find(x => x.id === gasNew)
    t('the new one is current; the old one superseded, pointing at it, its file kept', r.status === 200 && neu.status === 'current' && old.status === 'superseded' && old.superseded_by === gasNew && db.files.has(old.storage_path))
    t('exactly one current gas safety certificate', db.T.truck_documents.filter(x => x.type_key === 'gas_safety' && x.status === 'current').length === 1)
    const load = await POST(db, { action: 'load' })
    t('the list carries both (the view shows the earlier version), and never a storage path or what the AI read', load.body.documents.some(x => x.id === gasOld && x.status === 'superseded') && !JSON.stringify(load.body).includes('storage_path') && !JSON.stringify(load.body).includes('ai_extracted') && !JSON.stringify(load.body).includes('test-truck/'))
    const cu = await upload(db, BYTES.pdf, 'pitch.pdf', 'application/pdf')
    await POST(db, { action: 'save', documentId: cu.id, details: { typeKey: null, customName: 'Pitch permit', expiresOn: day(60) } })
    const cu2 = await upload(db, BYTES.pdf, 'pitch2.pdf', 'application/pdf')
    await POST(db, { action: 'save', documentId: cu2.id, details: { typeKey: null, customName: 'Pitch permit', expiresOn: day(420) }, replaces: cu.id })
    t('a custom document is renewed by "Upload a new version" (replaces): the old one superseded by the new', db.T.truck_documents.find(x => x.id === cu.id).status === 'superseded' && db.T.truck_documents.find(x => x.id === cu.id).superseded_by === cu2.id)
    const ed = await POST(db, { action: 'update', documentId: gasNew, details: { typeKey: 'gas_safety', issuer: 'Anglia Gas Services Ltd', issuedOn: day(1), expiresOn: day(366) } })
    t('editing a current document\'s details (Edit details) saves them in place', ed.status === 200 && db.T.truck_documents.find(x => x.id === gasNew).issuer === 'Anglia Gas Services Ltd')
  }

  // ── 6 · status and warnings ───────────────────────────────────────────────────────────────────────────────────────
  head('6 · status thresholds and the warnings')
  {
    const st = n => M.documentStatus({ expiresOn: day(n) }, TODAY)
    t('31 days: up to date; 30: due soon; today: due soon (0 days); yesterday: expired', st(31).status === 'up_to_date' && st(30).status === 'due_soon' && st(0).status === 'due_soon' && st(0).daysLeft === 0 && st(-1).status === 'expired' && st(-1).daysLeft === -1)
    t('no date: up to date; no document: missing', M.documentStatus({ expiresOn: null }, TODAY).status === 'up_to_date' && M.documentStatus(null, TODAY).status === 'missing')
    const w = (e, name) => M.draftWarnings({ expiresOn: e, nameOnDocument: name }, TODAY, ['Pizza Kitchen', 'Dominic Test'], true).map(x => x.code)
    t('warnings: expired; expires within 30 days; nothing beyond 30', w(day(-3))[0] === 'expired' && w(day(12))[0] === 'expiresSoon' && w(day(45)).length === 0)
    t('name: "Pizza Kitchen Ltd" and the owner "Dominic Test" are fine; "Smokey Joe’s BBQ Limited" warns', w(null, 'PIZZA KITCHEN LTD').length === 0 && w(null, 'Mr Dominic Test').length === 0 && w(null, 'Smokey Joe’s BBQ Limited')[0] === 'nameMismatch')
  }

  // ── 7 · reminders ─────────────────────────────────────────────────────────────────────────────────────────────────
  head('7 · reminders: 28 days, 7 days, on the day, then weekly — never the same stage twice')
  {
    const s = M.reminderStageFor
    t('a bad calendar date is not a date (30 February)', M.isYmd('2026-02-30') === false && M.isYmd('2028-02-29') === true)
    t('stages: 29 → none; 28 → d28; 8 → d28; 7 → d7; 1 → d7; 0 → d0; −6 → d0; −7 → w1; −13 → w1; −14 → w2', s(day(29), TODAY) === null && s(day(28), TODAY) === 'd28' && s(day(8), TODAY) === 'd28' && s(day(7), TODAY) === 'd7'
      && s(day(1), TODAY) === 'd7' && s(day(0), TODAY) === 'd0' && s(day(-6), TODAY) === 'd0' && s(day(-7), TODAY) === 'w1' && s(day(-13), TODAY) === 'w1' && s(day(-14), TODAY) === 'w2')
    const due = (e, last, lastFor) => M.reminderDue({ expiresOn: e, reminderStage: last, reminderExpiresOn: lastFor ?? e }, TODAY)
    t('due only when later than the last stage sent: d7 after d28 yes; d7 after d7 no; w2 after w1 yes; a new date starts again', due(day(5), 'd28') === 'd7' && due(day(5), 'd7') === null && due(day(-15), 'w1') === 'w2' && due(day(5), 'w3', day(-30)) === 'd7')
    t('saved with 5 days left: the 7-day reminder, never the 28-day one first', due(day(5), null) === 'd7')
    const CATALOG = (switches = []) => ({
      plans: ['trial', 'payg'].map((k, i) => ({ key: k, name: k, description: '', sortOrder: i, isPublic: k === 'payg', isInternal: false, isTrial: k === 'trial', isSignupDefault: k === 'trial', isExpiryFallback: k === 'payg', isDemo: false, payAtHatchAllowed: true, active: true, includedVans: 1, trialMonths: k === 'trial' ? 1 : null, isHighlighted: false, subtitle: null })),
      prices: [], features: switches,
    })
    const docs = [
      ['d-28', 28], ['d-7', 7], ['d-0', 0], ['d-w1', -7], ['d-w2', -14], ['d-40', 40],
    ].map(([id, n]) => ({ id, truck_id: 'test-truck', type_key: id === 'd-40' ? 'pat_test' : ['public_liability', 'gas_safety', 'fire_safety', 'risk_assessment', 'allergen_info'][['d-28', 'd-7', 'd-0', 'd-w1', 'd-w2'].indexOf(id)], expires_on: day(n), status: 'current', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }))
    const rdb = newDb({
      truck_documents: [...docs,
        { id: 'demo-doc', truck_id: 'demo-abc', type_key: 'gas_safety', expires_on: day(3), status: 'current' },
        { id: 'nomail-doc', truck_id: 'no-mail', type_key: 'gas_safety', expires_on: day(3), status: 'current' },
        { id: 'blocked-doc', truck_id: 'blocked', type_key: 'gas_safety', expires_on: day(3), status: 'current' },
        { id: 'pend-old', truck_id: 'test-truck', status: 'pending', storage_path: 'test-truck/pend-old/x.pdf', created_at: new Date(Date.now() - 30 * 3600_000).toISOString() },
        { id: 'pend-new', truck_id: 'test-truck', status: 'pending', storage_path: 'test-truck/pend-new/y.pdf', created_at: new Date(Date.now() - 2 * 3600_000).toISOString() },
      ],
    })
    rdb.T.trucks.push({ ...TRUCK, id: 'demo-abc', name: 'Demo' }, { ...TRUCK, id: 'no-mail', contact_email: null }, { ...TRUCK, id: 'blocked', plan: 'payg', feature_overrides: { paperwork: false } })
    rdb.files.set('test-truck/pend-old/x.pdf', { bytes: BYTES.pdf }); rdb.files.set('test-truck/pend-new/y.pdf', { bytes: BYTES.pdf })
    const sent = []
    const send = async p => { sent.push(p); return { sent: true } }
    const r1 = await kit.quietAsync(() => L.runPaperworkDaily(rdb, { now: new Date(), send, catalog: CATALOG(), base: 'https://www.hatchgrab.com' }))
    t('one email for the truck, listing the five due documents (not the one 40 days out)', r1.emails === 1 && sent.length === 1 && sent[0].docs.length === 5 && !sent[0].docs.some(d => d.name === 'PAT test'), { r1, docs: sent[0]?.docs })
    t('…to the truck\'s contact email, in its language, linking to Manage › Documents WITHOUT a token', sent[0].to === 'owner@pizzakitchen.test' && sent[0].locale === 'en-GB' && sent[0].url === 'https://www.hatchgrab.com/manage?tab=paperwork')
    t('…each document\'s stage recorded with the date it was for', ['d-28', 'd-7', 'd-0', 'd-w1', 'd-w2'].every((id, i) => { const d = rdb.T.truck_documents.find(x => x.id === id); return d.reminder_stage === ['d28', 'd7', 'd0', 'w1', 'w2'][i] && d.reminder_expires_on === d.expires_on }))
    t('skipped: a demo truck, a truck with no contact email, and one whose override switches Documents off', r1.skipped === 3 && !sent.some(p => p.to !== 'owner@pizzakitchen.test'))
    t('the abandoned upload (30 h) swept with its file; the recent one (2 h) kept', r1.pendingSwept === 1 && !rdb.T.truck_documents.some(d => d.id === 'pend-old') && !rdb.files.has('test-truck/pend-old/x.pdf') && rdb.files.has('test-truck/pend-new/y.pdf'))
    const r2 = await kit.quietAsync(() => L.runPaperworkDaily(rdb, { now: new Date(), send, catalog: CATALOG(), base: 'https://www.hatchgrab.com' }))
    t('🔴 run again the same day: NOTHING sent (no stage twice)', r2.emails === 0 && sent.length === 1)
    const r3 = await kit.quietAsync(() => L.runPaperworkDaily(rdb, { now: new Date(Date.now() + 7 * 86_400_000), send, catalog: CATALOG(), base: 'https://www.hatchgrab.com' }))
    const names = sent[1]?.docs.map(d => d.stage).sort()
    t('a week later: only the documents that reached a NEW stage — 7→d0, 0→w1, −7→w2, −14→w3 (28 days is still in d28: nothing; 40 is not yet due)', r3.emails === 1 && JSON.stringify(names) === JSON.stringify(['d0', 'w1', 'w2', 'w3']), sent[1]?.docs)
    const fdb = newDb({ truck_documents: [{ id: 'f1', truck_id: 'test-truck', type_key: 'gas_safety', expires_on: day(3), status: 'current' }] })
    const r4 = await kit.quietAsync(() => L.runPaperworkDaily(fdb, { now: new Date(), send: async () => ({ sent: false, reason: 'Brevo 500' }), catalog: CATALOG(), base: 'x' }))
    t('a failed send records NOTHING (tried again tomorrow) and is reported', r4.emails === 0 && fdb.T.truck_documents[0].reminder_stage == null && /Brevo 500/.test(r4.failures.join()))
    const pdb = newDb({ truck_documents: [{ id: 'p1', truck_id: 'test-truck', type_key: 'gas_safety', expires_on: day(3), status: 'current' }] })
    pdb.T.trucks[0].plan = 'payg'
    const r5 = await kit.quietAsync(() => L.runPaperworkDaily(pdb, { now: new Date(), send, catalog: CATALOG([{ planKey: 'payg', feature: 'paperwork', enabled: false }]), base: 'x' }))
    t('a plan that switches Documents off: no reminder', r5.emails === 0 && r5.skipped === 1)
    const rem = read('lib/paperwork/reminders.ts')
    t('EMAIL ONLY: the reminder run sends no push (the operator push carries only "an order needs confirming")', !/apns|fcm|sendOrderPendingPush/i.test(rem.replace(/\/\/.*$/gm, '')) && /sendOrderPendingPush/.test(read('lib/apns.ts')))
    t('it runs in the existing daily cron (/api/cron/order-retention), as its own step after the retention work', /runPaperworkDaily\(supabase\)/.test(read('app/api/cron/order-retention/route.ts')) && JSON.parse(read('vercel.json')).crons.some(c => c.path === '/api/cron/order-retention'))
  }

  // ── 8 · the share ─────────────────────────────────────────────────────────────────────────────────────────────────
  head('8 · send to an organiser: the token, the checks, the limit, the email')
  let share
  {
    const tok = L.newShareToken()
    t('the token: 32 base64url characters = 192 random bits; 1,000 of them all different', /^[A-Za-z0-9_-]{32}$/.test(tok) && Buffer.from(tok, 'base64url').length === 24 && new Set(Array.from({ length: 1000 }, () => L.newShareToken())).size === 1000)
    t('made with the CSPRNG (randomBytes), never Math.random', /randomBytes\(24\)\.toString\('base64url'\)/.test(read('lib/paperwork/share.ts')) && !/Math\.random/.test(read('lib/paperwork/share.ts')))
    const base = { action: 'share', emails: 'events@cambridgemarket.co.uk', eventId: 'ev-1', message: 'Hi, here are our documents for the market.', until: day(33), items: [{ typeKey: 'gas_safety' }, { typeKey: 'hygiene_rating' }] }
    const bads = [
      { emails: 'not-an-email' }, { emails: '' }, { emails: 'a@x.co, b@x.co, c@x.co, d@x.co, e@x.co, f@x.co' }, { until: day(91) }, { until: TODAY },
      { items: [{ typeKey: 'pat_test' }] }, { items: [] }, { eventId: 'someone-elses-event' },
    ]
    const st = []
    for (const b of bads) st.push((await POST(db, { ...base, ...b })).status)
    t('refused (400): a bad email, none, six, 91 days, today, a type with no current document, no documents, another truck\'s event', st.every(s => s === 400), st)
    t('the screen checks the same before sending (emails, up to 5, at least one document, the date range)', /parseOrganiserEmails\(emails\)/.test(read('components/manage/PaperworkTab.tsx')) && M.parseOrganiserEmails('A@x.co; a@x.co, bad').emails.length === 1 && M.parseOrganiserEmails('A@x.co; a@x.co, bad').invalid[0] === 'bad')
    globalThis.__pwLimit = () => ({ success: false })
    const lim = await POST(db, base)
    globalThis.__pwLimit = () => { throw new Error('upstash down') }
    const down = await POST(db, base)
    globalThis.__pwLimit = null
    t('the rate limit refuses (429, paperwork_send_limit) — and an Upstash outage refuses too (fail closed)', lim.status === 429 && lim.body.code === 'paperwork_send_limit' && down.status === 429 && !db.T.document_shares?.length)
    t('the limiter: 10 sends an hour per TRUCK, rolling', /paperworkSendRatelimit = new Ratelimit\(\{[^}]*slidingWindow\(10, '1 h'\)[^}]*prefix: 'hg_rl_paperwork_send'/.test(read('lib/ratelimit.ts')) && /paperworkSendRatelimit\.limit\(`send:\$\{truck\.id\}`\)/.test(read('app/api/manage/paperwork/route.ts')))
    calls.brevo.length = 0
    const two = await POST(db, { ...base, emails: 'events@cambridgemarket.co.uk, food@cambridgemarket.co.uk' })
    share = db.T.document_shares.find(s => s.id === two.body.shareId)
    t('sent: one share, two items (by TYPE), the event, the message', two.status === 200 && share && db.T.document_share_items.filter(i => i.share_id === share.id).map(i => i.type_key).join() === 'gas_safety,hygiene_rating' && share.event_id === 'ev-1' && share.message === base.message, two.body)
    const exp = new Date(share.expires_at)
    t('the link works until the END of the chosen day in the truck\'s time (midnight UK after it)', /T0[01]:00:00\.000Z$/.test(share.expires_at) && ymd(new Date(exp.getTime() - 1)) === day(33), share.expires_at)
    const m = calls.brevo
    const verified = /email: '([^']+)'/.exec(read('lib/email-config.ts').split('HATCHGRAB_SENDER = {')[1])[1]
    t('one email to each organiser, From "Pizza Kitchen via HatchGrab" at the verified sender, Reply-To the truck', m.length === 2 && m.every(x => x.sender.name === 'Pizza Kitchen via HatchGrab' && x.sender.email === verified && x.replyTo.email === 'owner@pizzakitchen.test')
      && m.map(x => x.to[0].email).sort().join() === 'events@cambridgemarket.co.uk,food@cambridgemarket.co.uk', m.map(x => [x.sender, x.replyTo, x.to]))
    t('…with the message, the documents (current versions, with dates), the event and the link', m[0].subject === 'Pizza Kitchen has sent you their documents' && m[0].textContent.includes(base.message) && m[0].textContent.includes('Gas safety certificate — expires')
      && m[0].textContent.includes('Food hygiene rating — no expiry') && m[0].textContent.includes('For: Cambridge Christmas Market') && m[0].textContent.includes(`https://www.hatchgrab.com/docs/${share.token}`), m[0].textContent)
    globalThis.__brevoOk = false
    const failed = await POST(db, base)
    globalThis.__brevoOk = true
    t('if no email could be sent the link is not kept (502)', failed.status === 502 && db.T.document_shares.length === 1)
    t('the Sent list: who, when, opened, views, until — from load', (await POST(db, { action: 'load' })).body.shares[0].emails.length === 2)
    const sender = read('lib/email-config.ts')
    t('the sender is the verified HATCHGRAB_SENDER address (lib/email-config.ts); only the From NAME carries the truck', /sender: \{ name: fromName\(p\.truckName\), email: HATCHGRAB_SENDER\.email \}/.test(read('lib/paperwork/email.ts')) && /HATCHGRAB_SENDER = \{/.test(sender))
  }

  // ── 9 · the organiser page ─────────────────────────────────────────────────────────────────────────────────────────
  head('9 · the organiser page: noindex, no-store, the CURRENT version, the expired message, the view count')
  const page = async (tok, dbx = db) => { globalThis.__harnessDb = dbx; const el = await kit.quietAsync(() => L.OrganiserPage({ params: Promise.resolve({ token: tok }) })); return kit.renderStatic(el) }
  {
    const html = await page(share.token)
    t('it shows the truck, both documents, View, Download and "Download all", and the date it works until', /Documents from Pizza Kitchen/.test(html) && /Gas safety certificate/.test(html) && /Food hygiene rating/.test(html) && /Download all/.test(html) && /This link works until/.test(html))
    t('🔴 THE CURRENT VERSION: the renewed certificate is shown, the old one is not', html.includes(`data-doc="${gasNew}"`) && !html.includes(`data-doc="${gasOld}"`))
    const s1 = db.T.document_shares.find(s => s.id === share.id)
    t('opening it counts a view and records the first opening', s1.view_count === 1 && !!s1.first_opened_at)
    await page(share.token)
    t('a second opening: 2 views; first_opened_at unchanged', db.T.document_shares.find(s => s.id === share.id).view_count === 2 && db.T.document_shares.find(s => s.id === share.id).first_opened_at === s1.first_opened_at)
    t('nothing else is stored about the organiser (no IP, agent or address columns)', !/ip|user_agent|organiser_ip|visitor/i.test(MIGRATION.match(/create table if not exists public\.document_shares \(([\s\S]*?)\);/)[1]))
    t('noindex: metadata robots, the vercel.json header (with no-store) and force-dynamic', L.organiserMetadata.robots.index === false && L.organiserDynamic === 'force-dynamic'
      && JSON.parse(read('vercel.json')).headers.some(h => h.source === '/docs/(.*)' && h.headers.some(x => x.key === 'X-Robots-Tag' && /noindex/.test(x.value)) && h.headers.some(x => x.key === 'Cache-Control' && /no-store/.test(x.value))))
    t('metered like /p/: `/docs/` in proxy.ts isGeneralPublic', /p\.startsWith\('\/docs\/'\)/.test(read('proxy.ts')))
    t('not in the sitemap, /llms.txt or hreflang', !/\/docs/.test(read('app/sitemap.ts')) && !/['"`]\/docs/.test(read('lib/llms-text.ts')) && !fs.readdirSync(path.join(REPO, 'lib')).filter(f => /hreflang/.test(f)).some(f => /\/docs/.test(read('lib/' + f))))
    const expired = newDb(); expired.T.document_shares = [{ ...share, id: 'old', token: 'X'.repeat(32), expires_at: new Date(Date.now() - 1000).toISOString() }]
    const ex = await page('X'.repeat(32), expired)
    t('an expired link: "This link has expired, ask Pizza Kitchen to send it again." — and no view counted', /This link has expired, ask Pizza Kitchen to send it again\./.test(ex) && expired.T.document_shares[0].view_count === share.view_count && !/Gas safety/.test(ex))
    const off = await POST(db, { action: 'revoke', shareId: share.id })
    const offHtml = await page(share.token)
    t('Turn off link: the page shows the same expired message', off.status === 200 && /This link has expired, ask Pizza Kitchen to send it again\./.test(offHtml))
    t('junk or a wrong token: the plain message, without a truck, before any database read', /ask the business that sent it/.test(await page('../../etc')) && /ask the business that sent it/.test(await page('A'.repeat(32))))
    t('a revoke of another truck\'s link does nothing (404)', (await POST(db, { action: 'revoke', shareId: 'nope' })).status === 404)
    // A fresh link for the next sections.
    const again = await POST(db, { action: 'share', emails: 'a@b.co', until: day(10), items: [{ typeKey: 'gas_safety' }, { typeKey: 'hygiene_rating' }] })
    share = db.T.document_shares.find(s => s.id === again.body.shareId)
  }

  // ── 10 · one file and Download all ─────────────────────────────────────────────────────────────────────────────────
  head('10 · one file (a short-lived signed link) and Download all (a ZIP made on the fly)')
  {
    globalThis.__harnessDb = db
    const req = (q = '') => ({ nextUrl: new URL(`https://www.hatchgrab.com/docs/${share.token}/file/x${q}`) })
    const one = await L.fileGET(req(), { params: Promise.resolve({ token: share.token, documentId: gasNew }) })
    t('a document on the link: 302 to a 300-second signed link, no-store, noindex', one.status === 302 && /https:\/\/storage\.test\/sign\/truck-documents\/test-truck\/.*\?ttl=300$/.test(one.headers.get('location')) && one.headers.get('cache-control') === 'private, no-store' && /noindex/.test(one.headers.get('x-robots-tag')))
    const dl = await L.fileGET(req('?download=1'), { params: Promise.resolve({ token: share.token, documentId: gasNew }) })
    t('?download=1 names the download', /download=Pizza-Kitchen-Gas-safety-certificate\.pdf/.test(decodeURIComponent(dl.headers.get('location'))), dl.headers.get('location'))
    const old = await L.fileGET(req(), { params: Promise.resolve({ token: share.token, documentId: gasOld }) })
    const stranger = await L.fileGET(req(), { params: Promise.resolve({ token: share.token, documentId: db.T.truck_documents.find(d => d.custom_name === 'Pitch permit' && d.status === 'current').id }) })
    t('the superseded version and a document NOT on the link are 404', old.status === 404 && stranger.status === 404)
    const all = await L.allGET({}, { params: Promise.resolve({ token: share.token }) })
    const zip = Buffer.from(await all.arrayBuffer())
    const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
    const names = [...zip.toString('latin1').matchAll(/PK\x01\x02[\s\S]{42}([^\x00]*?\.(pdf|jpg))/g)].map(m => m[1])
    t('Download all: a ZIP (application/zip, attachment, no-store) of the link\'s current documents', all.status === 200 && all.headers.get('content-type') === 'application/zip' && /attachment; filename="Pizza-Kitchen-documents\.zip"/.test(all.headers.get('content-disposition'))
      && zip.slice(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && eocd > 0 && zip.readUInt16LE(eocd + 10) === 2, { names, size: zip.length })
    const first = zip.slice(30 + zip.readUInt16LE(26), 30 + zip.readUInt16LE(26) + zip.readUInt32LE(18))
    t('…each entry\'s bytes and CRC-32 are right (CRC of "123456789" = CBF43926)', L.crc32(Buffer.from('123456789')) === 0xcbf43926 && zip.readUInt32LE(14) === L.crc32(first) && first.equals(Buffer.from(db.files.get(db.T.truck_documents.find(d => d.id === gasNew).storage_path).bytes)))
  }

  // ── 11 · deletion ─────────────────────────────────────────────────────────────────────────────────────────────────
  head('11 · Delete removes the files and takes it off live links; account deletion and the hard delete remove everything')
  {
    const paths = db.T.truck_documents.filter(d => d.type_key === 'gas_safety').map(d => d.storage_path)
    const r = await POST(db, { action: 'delete', documentId: gasNew })
    t('Delete: both versions\' files removed from storage', r.status === 200 && r.body.versions === 2 && paths.every(p => !db.files.has(p)), r.body)
    t('…their rows marked deleted with the details cleared (no issuer, name, path, AI read)', db.T.truck_documents.filter(d => d.type_key === 'gas_safety').every(d => d.status === 'deleted' && d.storage_path === null && d.issuer === null && d.name_on_document === null && d.ai_extracted === null))
    t('…and gone from the live link (its item removed); the link still shows the hygiene rating', !db.T.document_share_items.some(i => i.share_id === share.id && i.type_key === 'gas_safety') && /Food hygiene rating/.test(await page(share.token)) && !/Gas safety/.test(await page(share.token)))
    t('a deleted document cannot be opened, edited or deleted again (404)', (await POST(db, { action: 'file_url', documentId: gasNew })).status === 404 && (await POST(db, { action: 'delete', documentId: gasNew })).status === 404)
    const otherDoc = { id: 'theirs', truck_id: 'other-truck', type_key: 'gas_safety', status: 'current', storage_path: 'other-truck/theirs/a.pdf' }
    db.T.truck_documents.push(otherDoc); db.files.set(otherDoc.storage_path, { bytes: BYTES.pdf })
    t('another truck\'s document is unreachable by id (404 for open, edit and delete)', (await POST(db, { action: 'file_url', documentId: 'theirs' })).status === 404 && (await POST(db, { action: 'delete', documentId: 'theirs' })).status === 404 && db.files.has(otherDoc.storage_path))
    const before = { docs: db.T.truck_documents.filter(d => d.truck_id === 'test-truck').length, files: [...db.files.keys()].filter(k => k.startsWith('test-truck/')).length, shares: db.T.document_shares.filter(s => s.truck_id === 'test-truck').length }
    db.files.set('test-truck/orphan-id/left.pdf', { bytes: BYTES.pdf })
    db.T.orders = []; db.T.truck_users = []
    const acct = await kit.quietAsync(() => L.executeAccountDeletion(db, 'op1'))
    t('account deletion: every document row, file (orphans too) and link of the truck gone — the other truck\'s kept', before.docs > 0 && before.files > 0 && before.shares > 0 && !db.T.truck_documents.some(d => d.truck_id === 'test-truck')
      && ![...db.files.keys()].some(k => k.startsWith('test-truck/')) && !db.T.document_shares.some(s => s.truck_id === 'test-truck') && db.files.has(otherDoc.storage_path), { before, paperwork: acct.paperwork })
    t('…and it reports what it removed (paperwork: files, documents, shares)', acct.paperwork.documents === before.docs && acct.paperwork.shares === before.shares && acct.paperwork.files >= before.files)
    t('…before the truck\'s contact details are cleared (step 3b, then step 4) — a failure stops it, named', /3b\. PAPERWORK[\s\S]*delete_paperwork[\s\S]*4\. TRUCK CONTACT DETAILS/.test(read('lib/account-deletion.ts')))
    const hd = newDb({ truck_documents: [{ id: 'h1', truck_id: 'test-truck', type_key: 'gas_safety', status: 'current', storage_path: 'test-truck/h1/a.pdf' }] })
    hd.files.set('test-truck/h1/a.pdf', { bytes: BYTES.pdf })
    await kit.quietAsync(() => L.deleteTruckCascade(hd, 'test-truck'))
    t('the hard delete of a test or demo truck removes its files too', !hd.files.size && !hd.T.truck_documents.length && !hd.T.trucks.some(x => x.id === 'test-truck'))
  }

  // ── 12 · gate, access, tab, words, privacy ────────────────────────────────────────────────────────────────────────
  head('12 · the plan gate (ON by default), access, the tab, every word in 28 bases, the privacy paragraph')
  {
    const plan = { key: 'payg', name: 'p', description: '', sortOrder: 1, isPublic: true, isInternal: false, isTrial: false, isSignupDefault: false, isExpiryFallback: true, isDemo: false, payAtHatchAllowed: true, active: true, includedVans: 1, trialMonths: null, isHighlighted: false, subtitle: null }
    const cat = sw => ({ plans: [plan, { ...plan, key: 'pro', isExpiryFallback: false }, { ...plan, key: 'trial', isTrial: true, isExpiryFallback: false, trialMonths: 1 }], prices: [], features: sw })
    t('`paperwork` is a Feature', L.FEATURES.includes('paperwork'))
    t('ON BY DEFAULT: no plan_features row → allowed on every plan', ['payg', 'pro', 'trial'].every(k => L.featureAccess({ plan: k, trial_expires_at: null, feature_overrides: {} }, cat([]), 'paperwork').allowed))
    t('switchable later: a plan row off → blocked by the plan; a truck override off → blocked by the override', L.featureAccess({ plan: 'pro', trial_expires_at: null }, cat([{ planKey: 'pro', feature: 'paperwork', enabled: false }]), 'paperwork').block === 'plan'
      && L.featureAccess({ plan: 'pro', trial_expires_at: null, feature_overrides: { paperwork: false } }, cat([]), 'paperwork').block === 'override')
    globalThis.__pwGate = { code: 'feature_switched_off', params: {} }
    const gated = await POST(db, { action: 'load' })
    globalThis.__pwGate = null
    globalThis.__pwAccess = { ok: true, role: 'staff', userId: 'u9', operatorId: null, via: 'member' }
    const staff = await POST(db, { action: 'load' })
    globalThis.__pwAccess = { ok: false, status: 401, error: 'Sign in required', code: 'sign_in_required' }
    const anon = await POST(db, { action: 'load' })
    globalThis.__pwAccess = null
    t('the route refuses: the feature off (403), staff (403 insufficient_permissions), no session (401)', gated.status === 403 && staff.status === 403 && staff.body.code === 'insufficient_permissions' && anon.status === 401 && anon.body.code === 'sign_in_required')
    const route = read('app/api/manage/paperwork/route.ts')
    t('…using the SAME access function as /api/manage (lib/truck-access.ts, moved, not copied)', /resolveTruckAccessWith\(supabase, req, truck\)/.test(route) && /return resolveTruckAccessWith\(supabase, req, truck\)/.test(read('app/api/manage/route.ts')) && /const access = await resolveTruckAccess\(req, truck\)/.test(read('app/api/manage/route.ts')))
    const pg = read('app/manage/[token]/page.tsx')
    t('the tab: "Documents", just before Settings, owners and managers, shown only while the feature is on', /\{ id: 'paperwork', label: t\('tabs\.paperwork'\)[^}]*roles: \['owner', 'manager'\] \},\n\s*\{ id: 'settings'/.test(pg)
      && /if \(tab\.id === 'paperwork'\) \{\n\s*return tab\.roles\.includes\(userRole\) && featureAccessView\(truck, planCatalog, truck\?\.country \?\? null\)\.can\('paperwork'\)/.test(pg) && JSON.parse(read('messages/en-GB.json')).manageShell.tabs.paperwork === 'Documents')
    t('?tab=paperwork opens it, and /manage carries it on (the reminder email\'s tokenless link)', /'paperwork', 'social'/.test(pg.match(/const allTabIds: Tab\[\] = \[[^\]]*\]/)[0]) && /CARRIED_TABS = new Set\(\[[^\]]*'paperwork'/.test(read('app/manage/page.tsx')))
    const en = JSON.parse(read('messages/en-GB.json'))
    const KEYS = []
    const flat = (o, p) => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object') flat(v, `${p}.${k}`); else KEYS.push(`${p}.${k}`) } }
    flat(en.paperwork, 'paperwork'); KEYS.push('manageShell.tabs.paperwork', 'planPrompt.features.paperwork.name', 'planPrompt.features.paperwork.many', ...Object.keys(en.errorsManage).filter(k => k.startsWith('paperwork_')).map(k => `errorsManage.${k}`))
    const BASES = read('lib/i18n/locales.ts').match(/export const LANGUAGE_BASES[^=]*= \[([^\]]*)\]/)[1].match(/'([a-z]{2}-[A-Z]{2})'/g).map(s => s.slice(1, -1))
    const get = (o, k) => k.split('.').reduce((x, p) => (x == null ? undefined : x[p]), o)
    const missing = BASES.map(l => [l, KEYS.filter(k => get(JSON.parse(read(`messages/${l}.json`)), k) == null)]).filter(([, m]) => m.length)
    t(`every new string (${KEYS.length}) in en-GB and all ${BASES.length} bases`, BASES.length === 28 && KEYS.length >= 160 && !missing.length, missing.map(([l, m]) => `${l}: ${m.length} missing`))
    const structural = []
    for (const l of BASES) {
      let out = ''
      try { out = execFileSync('node', ['scripts/translation-check.cjs', '--locale', l], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } catch (e) { out = String(e.stdout || '') }
      const m = /Structural: (\d+)/.exec(out); if (!m || m[1] !== '0') structural.push(`${l}: ${m ? m[1] : '?'}`)
    }
    t('translation-check: structural 0 in all 28 (no missing key, valid ICU, the same placeholders and plural cases)', !structural.length, structural)
    t('every back-translation written (docs/i18n/back)', BASES.every(l => { const b = JSON.parse(read(`docs/i18n/back/${l}.json`)); return KEYS.every(k => b[k] != null) }))
    const pp = read('content/legal/privacy-policy.md')
    t('the English privacy paragraph is there, in section 3, naming Google’s Gemini and expiring links', /\*\*Compliance documents\.\*\* If you keep your certificates[^\n]*Google's Gemini service, the same one that reads menus[^\n]*through links that expire, and we keep them until you delete them or close your account\./.test(pp)
      && pp.indexOf('**Compliance documents.**') > pp.indexOf('## 3.') && pp.indexOf('**Compliance documents.**') < pp.indexOf('## 4.'))
    t('PRIVACY_UPDATED moved with it (4 November 2026, the document\'s own line) and TERMS_VERSION with it', /PRIVACY_UPDATED = '4 November 2026'/.test(read('lib/legal.ts')) && /\*\*Last updated:\*\* 4 November 2026/.test(pp) && /TERMS_VERSION = '2026-11-04'/.test(read('lib/legal.ts')))
    const LT = require('./_legal-translations.cjs')
    const drift = BASES.map(l => [l, LT.compare('privacy-policy.md', read(`content/legal/${l}/privacy-policy.md`))]).filter(([, p]) => p.length)
    t('the drift check: all 28 translations re-stamped against the new English and structurally equal', !drift.length, drift.map(([l, p]) => `${l}: ${p[0]}`))
    t('…and each one has a new paragraph in section 3 (one more paragraph than before the change)', BASES.every(l => /Gemini/.test(read(`content/legal/${l}/privacy-policy.md`).split(/\n## 4\./)[0])))
    t('no landing page touched: no Documents row in the public feature table or the card bullets', !/paperwork/.test(read('lib/feature-table.ts')) && !/paperwork/.test(read('lib/plan-offer.ts')))
  }

  console.log(`\npaperwork-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
