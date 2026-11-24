// scripts/france-privacy-1.cjs — france-privacy-1 (24 November 2026, docs/france-privacy-1-report.md): ACCOUNT DELETION ALSO CLEARS THE
// CUSTOMERS' NOTES, AND ONE PRIVACY POLICY FOR EVERY COUNTRY.
//
//   A · ACCOUNT DELETION, IN MEMORY (never the live database) — a truck with a new-style order (notes in line_notes), an old-style order
//       (notes inside items / deals), an order note, card drafts with notes, and enough orders to page; run by THIS tree and by the
//       prompt's starting commit (START, extracted from git) on the same seed. After it: no note text left anywhere on the account's rows;
//       name / email / phone cleared exactly as START clears them; totals, order_payments and every other column byte-identical to START;
//       items and deals byte-identical apart from the note fields of old-style rows; nothing deleted; another account untouched; a second
//       run writes nothing. The notes patch is retention's own (reused, not copied); retention's patches are byte-identical to START's.
//   B · THE ENGLISH — content/legal/privacy-policy.md is START with exactly the prompt's changes A–E; country-specific-terms.md is START
//       with every "### Privacy, for everyone in …" part deleted, the intro (G) and the date (H); every country's terms part byte-identical
//       to START's; no country left empty; lib/legal.ts's date mirrors follow; the named re-pin module gives START back byte for byte.
//   C · THE TRANSLATIONS — every language base an enabled country uses (54): stamped with today's English and structure-clean, the new
//       wording in place with a back-translation, every unchanged part (terms parts, every other paragraph) byte-identical to START, no
//       per-country privacy heading left; the 5 bases no enabled country uses, and every terms-and-conditions.md, untouched.
//   D · THE PAGES RENDER — /privacy and /country-terms in English, and translated (fr, de, jp, ae): the new wording, no privacy part.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
require('./_disk-guard.cjs').guard(__filename)
require('./_harness-tmp.cjs')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'france-privacy-1' })
const { REPO } = kit
const L = require('./_legal-translations.cjs')

/** 🔴 THIS PROMPT'S STARTING COMMIT (never HEAD): compare-fix-1's ec16f022, the branch tip when france-privacy-1 began. */
const START = 'ec16f022'

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const atStart = f => execFileSync('git', ['show', `${START}:${f}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 1e8 })
const J = v => JSON.stringify(v)
const clone = v => JSON.parse(J(v))
const NOTE_RE = /No basil|nut allergy|BIEN CUIT|no peanuts|Ring twice|gluten|coeliac|call 07700/i

function extract(ref) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp1-start-'))
  const tar = execFileSync('git', ['archive', '--format=tar', ref, 'lib'], { cwd: REPO, maxBuffer: 2e9 })
  execFileSync('tar', ['-x', '-C', dir], { input: tar, maxBuffer: 2e9 })
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'))
  return dir
}
let bundleN = 0
async function bundleTree(root, tag, entry) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const res = await esbuild.build({
    stdin: { contents: entry, resolveDir: root, loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node20', logLevel: 'silent',
    alias: { '@': root },
    plugins: [{ name: 'fp1', setup(b) { b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'so', namespace: 'fp1' })); b.onLoad({ filter: /.*/, namespace: 'fp1' }, () => ({ contents: '', loader: 'js' })) } }],
  })
  const dir = path.join(REPO, 'node_modules/.cache/france-privacy-1-trees'); fs.mkdirSync(dir, { recursive: true })
  const out = path.join(dir, `${tag}-${bundleN++}.cjs`)
  fs.writeFileSync(out, res.outputFiles[0].text)
  return require(out)
}

// ── the in-memory database: paperwork-1's fake (select / eq / gt / order / limit / update / delete, auth, storage), rows round-tripped
// through JSON on every write as a jsonb column would store them ──
const { fakeSupabase } = require('./_paperwork-1-fixtures.cjs')
function jsonDb(seed) {
  const db = fakeSupabase(seed), from = db.from.bind(db), writes = []
  db.from = table => {
    const q = from(table), upd = q.update
    q.update = v => { writes.push([table, clone(v)]); return upd(clone(v)) }
    return q
  }
  db.writes = writes
  return db
}

const LN = (items, deals) => ({ v: 1, ...(items ? { items } : {}), ...(deals ? { deals } : {}) })
function seed() {
  const base = { country: 'GB', currency: 'GBP', status: 'collected', payment_status: 'paid', created_at: '2026-11-20T12:00:00.000Z', table_ref: null, extras: null }
  const orders = [
    // NEW-STYLE (france-notes-1): the lines carry no notes, line_notes does
    { ...base, order_key: 'o-new', id: 'A-1', truck_id: 'tA', customer_name: 'Ada Lovelace', customer_email: 'ada@example.test', customer_phone: '+447700900001', notes: 'Ring twice — coeliac',
      items: [{ cartKey: 'c1', name: 'Margherita', price: 9.5, quantity: 1, modifiers: [{ name: 'Extra basil', price: 0.5 }] }, { cartKey: 'c2', name: 'Fries', price: 3, quantity: 2 }],
      deals: [{ name: 'Meal deal', price: 12, quantity: 1, slots: { main: 'Burger' }, tax_parts: [{ rate: 20, minor: 200 }] }],
      line_notes: LN({ 'k:c1': { at: 4, note: 'No basil — nut allergy' }, 'k:c2': { at: 4, note: '' } }, { '#0': { at: 3, slotNotes: { main: 'no peanuts' } } }),
      subtotal: 27.5, total: 27.5, total_minor: 2750, food_minor: 2750, tax_minor: 458, receipt_no: 'R-1' },
    // OLD-STYLE (every order before france-notes-1, and every order the deployed code writes): the notes inside items / deals
    { ...base, order_key: 'o-old', id: 'A-2', truck_id: 'tA', customer_name: 'Bob', customer_email: null, customer_phone: '+447700900002', notes: null,
      items: [{ name: 'Steak', price: 18, quantity: 1, specialInstructions: 'BIEN CUIT, gluten free bun' }, { name: 'Salad', price: 6, quantity: 1, specialInstructions: '' }, { name: 'Water', price: 1, quantity: 1 }],
      deals: [{ name: 'Kids', price: 7, quantity: 1, slots: { main: 'Nuggets' }, slotNotes: { main: 'no peanuts, call 07700 900003' } }],
      line_notes: null, subtotal: 32, total: 32, total_minor: 3200, food_minor: 3200, tax_minor: 533, receipt_no: 'R-2' },
    // an order note only
    { ...base, order_key: 'o-note', id: 'A-3', truck_id: 'tA', customer_name: 'Cy', customer_email: 'cy@example.test', customer_phone: null, notes: 'gluten intolerant',
      items: [{ name: 'Cola', price: 2, quantity: 1 }], deals: null, line_notes: null, subtotal: 2, total: 2, total_minor: 200, food_minor: 200, tax_minor: 33, receipt_no: 'R-3' },
    // nothing to clear but the name
    { ...base, order_key: 'o-plain', id: 'A-4', truck_id: 'tA', customer_name: 'Di', customer_email: null, customer_phone: null, notes: '',
      items: [{ name: 'Tea', price: 2, quantity: 1, specialInstructions: '' }], deals: [{ name: 'D', price: 1, quantity: 1, slotNotes: {} }], line_notes: null, subtotal: 3, total: 3, total_minor: 300, food_minor: 300, tax_minor: 50, receipt_no: 'R-4' },
    // the SECOND truck of the same account
    { ...base, order_key: 'o-b', id: 'B-1', truck_id: 'tB', customer_name: 'Ed', customer_email: 'ed@example.test', customer_phone: null, notes: 'Ring twice',
      items: [{ name: 'Wrap', price: 8, quantity: 1, specialInstructions: 'nut allergy' }], deals: null, line_notes: null, subtotal: 8, total: 8, total_minor: 800, food_minor: 800, tax_minor: 133, receipt_no: 'R-5' },
    // ANOTHER account's truck — never touched
    { ...base, order_key: 'o-other', id: 'X-1', truck_id: 'tX', customer_name: 'Fay', customer_email: 'fay@example.test', customer_phone: '+447700900009', notes: 'Ring twice',
      items: [{ name: 'Pie', price: 5, quantity: 1, specialInstructions: 'No basil' }], deals: null, line_notes: LN({ '#9': { at: 0, note: 'nut allergy' } }), subtotal: 5, total: 5, total_minor: 500, food_minor: 500, tax_minor: 83, receipt_no: 'X-1' },
  ]
  // enough orders on truck tA to need three pages (the step reads 500 at a time), half of them with a note
  for (let i = 0; i < 1100; i++) orders.push({ ...base, order_key: `p-${String(i).padStart(5, '0')}`, id: `P-${i}`, truck_id: 'tA', customer_name: `C${i}`, customer_email: null, customer_phone: null,
    notes: i % 2 ? `gluten ${i}` : null, items: [{ name: 'Bun', price: 1, quantity: 1, ...(i % 3 === 0 ? { specialInstructions: `No basil ${i}` } : {}) }], deals: null, line_notes: null,
    subtotal: 1, total: 1, total_minor: 100, food_minor: 100, tax_minor: 17, receipt_no: `P-${i}` })
  const order_drafts = [
    { order_key: 'd-new', truck_id: 'tA', customer_name: null, customer_email: null, customer_phone: null, notes: 'Ring twice', promoted_at: '2026-11-20T12:01:00.000Z',
      items: [{ cartKey: 'c1', name: 'Margherita', price: 9.5, quantity: 1 }], deals: null, line_notes: LN({ 'k:c1': { at: 4, note: 'No basil — nut allergy' } }), subtotal: 9.5, total: 9.5, total_minor: 950 },
    { order_key: 'd-old', truck_id: 'tA', customer_name: 'Gus', customer_email: 'gus@example.test', customer_phone: null, notes: null, promoted_at: null,
      items: [{ name: 'Steak', price: 18, quantity: 1, specialInstructions: 'coeliac' }], deals: [{ name: 'Kids', price: 7, quantity: 1, slotNotes: { main: 'no peanuts' } }], line_notes: null, subtotal: 25, total: 25, total_minor: 2500 },
    { order_key: 'd-other', truck_id: 'tX', customer_name: null, customer_email: null, customer_phone: null, notes: 'Ring twice', promoted_at: null,
      items: [{ name: 'Pie', price: 5, quantity: 1, specialInstructions: 'nut allergy' }], deals: null, line_notes: null, subtotal: 5, total: 5, total_minor: 500 },
  ]
  const order_payments = [
    { id: 'pay-1', order_key: 'o-new', truck_id: 'tA', amount_minor: 2750, currency: 'GBP', method: 'card', state: 'succeeded', note: 'Online card payment', livemode: false },
    { id: 'pay-2', order_key: 'o-old', truck_id: 'tA', amount_minor: 3200, currency: 'GBP', method: 'cash', state: 'succeeded', note: 'Mark paid & done — taken at the hatch', livemode: false },
    { id: 'pay-3', order_key: 'o-b', truck_id: 'tB', amount_minor: 800, currency: 'GBP', method: 'card', state: 'refunded', note: 'Card refund', livemode: false },
    { id: 'pay-4', order_key: 'o-other', truck_id: 'tX', amount_minor: 500, currency: 'GBP', method: 'card', state: 'succeeded', note: null, livemode: false },
  ]
  return {
    operators: [{ id: 'op1', name: 'Test Owner', first_name: 'Test', last_name: 'Owner', email: 'owner@example.test', phone: null, auth_user_id: 'u1', deletion_requested_at: '2026-10-01T00:00:00Z' },
      { id: 'op2', name: 'Other', first_name: 'O', last_name: 'T', email: 'other@example.test', phone: null, auth_user_id: 'u2', deletion_requested_at: null }],
    trucks: [{ id: 'tA', name: 'Test Truck A', operator_id: 'op1', contact_email: 'a@example.test', contact_phone: null, phone: null, active: true },
      { id: 'tB', name: 'Test Truck B', operator_id: 'op1', contact_email: 'b@example.test', contact_phone: null, phone: null, active: true },
      { id: 'tX', name: 'Other Truck', operator_id: 'op2', contact_email: 'x@example.test', contact_phone: null, phone: null, active: true }],
    truck_users: [{ id: 'tu1', truck_id: 'tA', auth_user_id: 'u1' }],
    orders, order_drafts, order_payments,
  }
}
const OP_DB = s => jsonDb(clone(s))
const NOTE_FIELDS = ['notes', 'line_notes', 'items', 'deals']
const strip = r => { const o = { ...r }; for (const k of NOTE_FIELDS) delete o[k]; return o }
const linesNoNotes = v => (Array.isArray(v) ? v.map(l => { if (!l || typeof l !== 'object') return l; const { specialInstructions, slotNotes, ...rest } = l; void specialInstructions; void slotNotes; return rest }) : v)

;(async () => {
  // ══ A ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head(`A · ACCOUNT DELETION, IN MEMORY — this tree vs START ${START} on the same seed (never the live database)`)
  const startDir = extract(START)
  const S = await bundleTree(startDir, 'start', "export { executeAccountDeletion } from '@/lib/account-deletion'\nexport { retentionPatch } from '@/lib/order-retention'")
  const H = await bundleTree(REPO, 'head', "export { executeAccountDeletion } from '@/lib/account-deletion'\nexport { retentionPatch, notesPatch } from '@/lib/order-retention'")
  const SEED = seed()
  const dbS = OP_DB(SEED), dbH = OP_DB(SEED)
  const rS = await kit.quietAsync(() => S.executeAccountDeletion(dbS, 'op1'))
  const rH = await kit.quietAsync(() => H.executeAccountDeletion(dbH, 'op1'))
  const mine = (db, table) => db.T[table].filter(r => r.truck_id === 'tA' || r.truck_id === 'tB')
  const byKey = rows => Object.fromEntries(rows.map(r => [r.order_key, r]))
  {
    t('the seed: notes in line_notes (new-style), inside items and deals (old-style), as order notes and on both card drafts — 1,105 orders on the account, 2 drafts',
      NOTE_RE.test(J(SEED.orders.find(o => o.order_key === 'o-new').line_notes)) && NOTE_RE.test(J(SEED.orders.find(o => o.order_key === 'o-old').items)) && NOTE_RE.test(J(SEED.orders.find(o => o.order_key === 'o-old').deals))
      && SEED.orders.filter(o => o.truck_id !== 'tX').length === 1105 && SEED.order_drafts.filter(d => d.truck_id === 'tA').every(d => NOTE_RE.test(J(d))))
    const leftS = mine(dbS, 'orders').concat(mine(dbS, 'order_drafts')).filter(r => NOTE_RE.test(J([r.notes, r.items, r.deals, r.line_notes])))
    t(`START left the notes on ${leftS.length} of the account's rows (the gap this closes)`, leftS.length > 500, leftS.length)
    const leftH = mine(dbH, 'orders').concat(mine(dbH, 'order_drafts')).filter(r => NOTE_RE.test(J([r.notes, r.items, r.deals, r.line_notes])) || (r.notes != null && r.notes !== ''))
    t('THIS TREE: no note text left on any of the account\'s orders or drafts — order notes, line_notes, dish and slot notes (both trucks, every page)', leftH.length === 0, leftH.slice(0, 3).map(r => r.order_key))
    const blankLn = mine(dbH, 'orders').concat(mine(dbH, 'order_drafts')).filter(r => r.line_notes != null)
    t('…a new-style row keeps its line_notes shape with every note blanked (\'\' / {}), as retention does', blankLn.length === 2 && J(byKey(blankLn)['o-new'].line_notes) === J(LN({ 'k:c1': { at: 4, note: '' }, 'k:c2': { at: 4, note: '' } }, { '#0': { at: 3, slotNotes: {} } })), blankLn.map(r => r.line_notes))
    t('…an old-style row: each item\'s specialInstructions → \'\' and each deal\'s slotNotes → {} (the retention job\'s old-style patch)', J(byKey(dbH.T.orders)['o-old'].items.map(i => i.specialInstructions)) === J(['', '', undefined]) && J(byKey(dbH.T.orders)['o-old'].deals[0].slotNotes) === '{}')
    t('…and the order note → null', ['o-new', 'o-note', 'o-b'].every(k => byKey(dbH.T.orders)[k].notes === null) && byKey(dbH.T.order_drafts)['d-new'].notes === null)
    const sO = byKey(dbS.T.orders), hO = byKey(dbH.T.orders)
    const ident = r => J([r.customer_name, r.customer_email, r.customer_phone])
    t('name, email and phone cleared exactly as START clears them (\'[deleted]\', null, null) on every order of the account', mine(dbH, 'orders').every(r => ident(r) === ident(sO[r.order_key]) && ident(r) === J(['[deleted]', null, null])))
    t('every other column of every order byte-identical to START\'s result — totals, receipt numbers, status, payment status, timestamps', Object.keys(hO).length === Object.keys(sO).length && Object.keys(hO).every(k => J(strip(hO[k])) === J(strip(sO[k]))))
    t('order_payments byte-identical to the seed and to START\'s result (never read or written)', J(dbH.T.order_payments) === J(SEED.order_payments) && J(dbS.T.order_payments) === J(SEED.order_payments) && !dbH.writes.some(([tb]) => tb === 'order_payments'))
    const newStyle = mine(dbH, 'orders').concat(mine(dbH, 'order_drafts')).filter(r => r.line_notes != null)
    const seedBy = byKey(SEED.orders.concat(SEED.order_drafts))
    t('items and deals of every new-style row byte-identical to the seed (never written)', newStyle.every(r => J(r.items) === J(seedBy[r.order_key].items) && J(r.deals) === J(seedBy[r.order_key].deals))
      && !dbH.writes.some(([tb, v]) => (tb === 'orders' || tb === 'order_drafts') && ('items' in v || 'deals' in v) && v.line_notes !== undefined))
    t('items and deals of every row byte-identical apart from the note fields (specialInstructions, slotNotes) — names, prices, quantities, modifiers, slots, tax parts kept', mine(dbH, 'orders').concat(mine(dbH, 'order_drafts')).every(r => J(linesNoNotes(r.items)) === J(linesNoNotes(seedBy[r.order_key].items)) && J(linesNoNotes(r.deals)) === J(linesNoNotes(seedBy[r.order_key].deals))))
    t('…and an old-style line keeps its note FIELD (blanked), in its place — the same shape as a retention-cleaned row', J(Object.keys(hO['o-old'].items[0])) === J(Object.keys(SEED.orders[1].items[0])) && J(Object.keys(hO['o-old'].deals[0])) === J(Object.keys(SEED.orders[1].deals[0])))
    const counts = db => J(['orders', 'order_drafts', 'order_payments', 'trucks', 'operators'].map(tb => db.T[tb].length))
    t('nothing deleted: orders, card drafts, payments, trucks and operators all kept (the same counts as the seed and START)', counts(dbH) === counts(OP_DB(SEED)) && counts(dbS) === counts(dbH), counts(dbH))
    const other = db => J([db.T.orders.filter(r => r.truck_id === 'tX'), db.T.order_drafts.filter(r => r.truck_id === 'tX'), db.T.trucks.find(r => r.id === 'tX'), db.T.operators.find(r => r.id === 'op2')])
    t('another account\'s truck, orders and drafts untouched (its notes still there)', other(dbH) === other(OP_DB(SEED)) && NOTE_RE.test(other(dbH)))
    // ⚠️ RE-PINNED (france-privacy-2, 24 November 2026, docs/france-privacy-2-report.md): account deletion now also clears the card
    // drafts' name, email and phone (step 2d, '[deleted]', null, null — Dominic's decision on Open item 53), so this check sets those
    // three columns aside and asserts their new values on the account's drafts; every other column is compared with START as before.
    const noId = r => { const o = strip(r); delete o.customer_name; delete o.customer_email; delete o.customer_phone; return o }
    t('the drafts: every column but the notes and the name/email/phone byte-identical to START; the account\'s drafts\' name/email/phone \'[deleted]\', null, null (france-privacy-2), the other account\'s as START', J(dbH.T.order_drafts.map(noId)) === J(dbS.T.order_drafts.map(noId))
      && mine(dbH, 'order_drafts').every(d => J([d.customer_name, d.customer_email, d.customer_phone]) === J(['[deleted]', null, null]))
      && J(dbH.T.order_drafts.filter(d => d.truck_id === 'tX').map(d => [d.customer_name, d.customer_email, d.customer_phone])) === J(dbS.T.order_drafts.filter(d => d.truck_id === 'tX').map(d => [d.customer_name, d.customer_email, d.customer_phone])))
    // ⚠️ RE-PINNED (france-privacy-2, 24 November 2026): the result also carries france-privacy-2's whatsappDeleted and draftsAnonymised
    // (scripts/france-privacy-2.cjs proves them); they are left out of the comparison with START, like notesCleared.
    t(`the result reports the notes cleared (${J(rH.notesCleared)}) beside START's figures, which are unchanged`, J(rH.notesCleared) === J({ orders: 2 + 1 + 1 + [...Array(1100).keys()].filter(i => i % 2 || i % 3 === 0).length, drafts: 2 })
      && J({ ...rH, notesCleared: undefined, whatsappDeleted: undefined, draftsAnonymised: undefined }) === J({ ...rS, notesCleared: undefined }), { H: rH.notesCleared, S: Object.keys(rS) })
    t('every other table START\'s run wrote ends the same (operators, trucks, staff)', ['operators', 'trucks', 'truck_users'].every(tb => J(dbH.T[tb]) === J(dbS.T[tb])))
    // TWICE: as run again by hand (the request is still pending), and as a re-run after a failure that came after the notes step
    const before2 = J(dbH.T)
    const w0 = dbH.writes.length
    await kit.quietAsync(() => H.executeAccountDeletion(dbH, 'op1'))
    t('running it a second time is harmless: every table byte-identical, and no order or draft written', J(dbH.T) === before2 && !dbH.writes.slice(w0).some(([tb]) => tb === 'orders' || tb === 'order_drafts'))
    const dbR = OP_DB(JSON.parse(before2)); dbR.T.trucks.forEach(tr => { if (tr.id !== 'tX') tr.operator_id = 'op1' })   // the recovery re-run: the trucks still on the account
    const snap = J(dbR.T.orders) + J(dbR.T.order_drafts)
    await kit.quietAsync(() => H.executeAccountDeletion(dbR, 'op1'))
    const notesWrites = dbR.writes.filter(([tb, v]) => (tb === 'orders' || tb === 'order_drafts') && NOTE_FIELDS.some(k => k in v))
    t('…and a re-run that reaches the notes step again (trucks still on the account) writes no note field and changes no order or draft', notesWrites.length === 0 && J(dbR.T.orders) + J(dbR.T.order_drafts) === snap, notesWrites.slice(0, 2))
  }
  {
    // the patch is retention's own — reused, not copied — and retention is unchanged
    const src = read('lib/account-deletion.ts')
    t('account deletion imports notesPatch from lib/order-retention (one patch, shared) and has no copy of its rules', /import \{ notesPatch \} from '@\/lib\/order-retention'/.test(src) && !/scrubItems|scrubDeals|blankLineNotes|specialInstructions\s*[:=]/.test(src.replace(/\/\/.*$/gm, '')))
    t('…it still never calls deleteTruckCascade, and deletes no order, draft or payment', !/deleteTruckCascade\s*\(/.test(src.replace(/\/\/.*$/gm, '')) && !/from\('(orders|order_drafts|order_payments)'\)\s*\.delete\(/.test(src))
    const rows = [
      { order_key: 'r1', customer_name: 'A', customer_email: 'a@x', customer_phone: '1', notes: 'n', items: [{ name: 'x', specialInstructions: 'y' }], deals: [{ slotNotes: { a: 'b' } }], line_notes: null },
      { order_key: 'r2', customer_name: '', customer_email: null, customer_phone: null, notes: null, items: [{ name: 'x' }], deals: null, line_notes: LN({ '#0': { at: 1, note: 'q' } }, { '#0': { at: 0, slotNotes: { a: 'b' } } }) },
      { order_key: 'r3', customer_name: '', customer_email: null, customer_phone: null, notes: '', items: [{ name: 'x', specialInstructions: '' }], deals: [], line_notes: null },
      { order_key: 'r4', customer_name: 'B', items: 'not an array', deals: { odd: true }, line_notes: { v: 2 } },
    ]
    const same = rows.every(r => [' ', null].every(e => J(H.retentionPatch(r, e === ' ' ? '' : null)) === J(S.retentionPatch(r, e === ' ' ? '' : null))))
    t('the 12-month retention\'s patches are byte-identical to START\'s (keys in the same order), old-style, new-style, blank and odd rows', same, rows.map(r => [J(H.retentionPatch(r, '')), J(S.retentionPatch(r, ''))]))
    t('notesPatch is exactly retention\'s patch without the name, email and phone', rows.every(r => { const full = H.retentionPatch(r, '') || {}; delete full.customer_name; delete full.customer_email; delete full.customer_phone; return J(full) === J(H.notesPatch(r)) }))
  }

  // ══ B ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('B · THE ENGLISH — exactly the prompt\'s changes, nothing else')
  const PP0 = atStart('content/legal/privacy-policy.md'), CS0 = atStart('content/legal/country-specific-terms.md')
  const PP = read('content/legal/privacy-policy.md'), CS = read('content/legal/country-specific-terms.md')
  const once = (s, a, b) => { if (s.split(a).length !== 2) throw new Error('not once: ' + a.slice(0, 60)); return s.replace(a, () => b) }
  {
    let want = PP0
    want = once(want, "**Some countries have extra rules.** Where they apply to you, they're on our [Country-specific terms](/country-terms) page, which forms part of this policy.",
      '**This policy applies wherever you are.** We follow UK data protection law, and where the data protection law of the country you live in also applies, we follow that too.')
    want = once(want, '**Allergen information.**', '**Allergy and dietary notes.** We pass them to the truck with your order and use them for nothing else. We remove them, with your name and contact details, 12 months after the order (see section 7).\n\n**Allergen information.**')
    want = once(want, 'Where data leaves the UK, the transfer is covered by UK adequacy regulations or by the International Data Transfer Agreement or Addendum, which provide appropriate safeguards.',
      'Where data leaves the UK, the transfer is covered by UK adequacy regulations or by the International Data Transfer Agreement or Addendum, and, where the law of your country requires it, by a safeguard that law recognises.')
    const s8 = want.indexOf('## 8. Your rights'), e8 = want.indexOf('\n---\n', s8)
    want = want.slice(0, s8) + [
      '## 8. Your rights', '',
      'Under UK data protection law, and the law of the country you live in where it applies, you have the right to:', '',
      '- ask what personal data we hold about you, and get a copy;', '- have inaccurate data corrected;', '- have your data deleted, in certain circumstances;',
      '- restrict how we use your data, in certain circumstances;', '- receive your data in a portable format;', '- object to processing based on legitimate interests;',
      '- withdraw consent at any time, where we rely on consent.', '',
      'The law where you live may give you these rights under other names, or extra ones. You have those too.', '',
      '**Making a request.** Email privacy@hatchgrab.com. We will check that the request is genuine before we act on it. You can ask someone to make the request for you, and we will not treat you differently for making one. We will reply within one month, or sooner if the law of your country requires it. If you ordered from a truck, we may pass your request to that truck, because it decides how your order details are used. If we turn down a request, you can ask us to look at it again by replying to our answer.', '',
      "**Deleting your account.** Operators can request account deletion from within the app or by emailing privacy@hatchgrab.com. We will delete your account and personal data, except where we are required to retain records for accounting or legal reasons. When an operator's account is deleted, we also remove their customers' names, contact details and notes from the orders we keep.", '',
      '**Marketing emails.** We send marketing emails only where the law where you live allows it, which in some countries means only with your consent. Every one says who it is from, includes our postal address and tells you how to stop receiving them. If you ask us to stop, we will, free of charge and within 10 business days. Emails about an order or your account are not marketing. If we or a truck offer order updates by text message, you will get them only if you agree, and you can stop them at any time.', '',
      '**If something goes wrong.** If a breach involving your personal data is likely to cause you serious harm, we will tell you and the regulator as soon as we can where the law requires it, or help the truck you ordered from to do so.', '',
      "**Complaints.** Tell us first at privacy@hatchgrab.com; we would appreciate the chance to put things right. You can also complain to the data protection regulator where you live. In the UK, that is the Information Commissioner's Office, at ico.org.uk or on 0303 123 1113.",
    ].join('\n') + '\n' + want.slice(e8)
    want = once(want, '**Last updated:** 4 November 2026', '**Last updated:** 24 November 2026')
    t('privacy-policy.md is START with exactly the prompt\'s A (intro), B (allergy notes), C (transfer sentence), D (section 8) and E (date) — nothing else', PP === want)
  }
  const countryParts = md => md.split(/\n(?=## )/).slice(1).map(s => { const i = s.indexOf('\n### Privacy, for everyone in'); return { name: s.split('\n')[0], terms: (i < 0 ? s : s.slice(0, i)).replace(/\n+$/, ''), privacy: i < 0 ? null : s.slice(i + 1) } })
  {
    const before = countryParts(CS0), now = countryParts(CS)
    t(`START has ${before.length} countries, each with a privacy part; now none has one`, before.length === 16 && before.every(c => c.privacy) && now.length === 16 && now.every(c => !c.privacy) && !/Privacy, for everyone in/.test(CS))
    t('every country\'s terms part is byte-identical to START\'s (the "Your customers\' data" paragraphs included)', J(now.map(c => [c.name, c.terms])) === J(before.map(c => [c.name, c.terms])) && (CS.match(/\*\*Your customers' data\.\*\*/g) || []).length === (CS0.match(/\*\*Your customers' data\.\*\*/g) || []).length && (CS0.match(/\*\*Your customers' data\.\*\*/g) || []).length > 0)
    t('no country section is left with no content (each keeps its "### For food truck operators" part)', now.every(c => /\n### For food truck operators\n\n\S/.test(c.terms)))
    const intro = 'Our [Terms of Service](/terms) apply in every country where HatchGrab is used. Some countries have extra rules. This page sets them out, one country at a time.\n\nWhere a section below applies to you, it forms part of our Terms of Service. If it says something different from them, this page applies for that country.\n\nIf your country is not listed, there are no extra rules: the Terms of Service apply as written. Our [Privacy Policy](/privacy) is the same in every country.'
    const want = '# Country-specific terms\n\n**Last updated:** 24 November 2026\n\n' + intro + '\n\n---\n\n' + now.map(c => c.terms).join('\n\n') + '\n'
    const was = CS0.slice(0, CS0.indexOf('\n---\n'))
    t('country-specific-terms.md is START with the privacy parts deleted (F), the three intro paragraphs (G) and the date (H) — nothing else', CS === want && /Our \[Terms of Service\]\(\/terms\) and \[Privacy Policy\]\(\/privacy\) apply/.test(was) && /apply as written\.\s*$/.test(was))
  }
  {
    const legal = read('lib/legal.ts')
    t('lib/legal.ts mirrors the dates (PRIVACY_UPDATED, COUNTRY_TERMS_UPDATED 24 November 2026; TERMS_UPDATED unchanged) and TERMS_VERSION moves with the documents (2026-11-24)',
      /PRIVACY_UPDATED = '24 November 2026'/.test(legal) && /COUNTRY_TERMS_UPDATED = '24 November 2026'/.test(legal) && /TERMS_UPDATED = '19 November 2026'/.test(legal) && /TERMS_VERSION = '2026-11-24'/.test(legal))
    const N = require('./_named-france-privacy-1.cjs')
    t('the named re-pin module gives START back byte for byte (both documents and lib/legal.ts), and is chained first by terms-postpay-1\'s', ['content/legal/privacy-policy.md', 'content/legal/country-specific-terms.md', 'lib/legal.ts'].every(f => N.asBefore(f, read(f)) === atStart(f))
      && require('./_named-terms-postpay-1.cjs').undoCode('content/legal/privacy-policy.md', PP) === PP0 && N.LANDED)
    t('terms-and-conditions.md is unchanged', read('content/legal/terms-and-conditions.md') === atStart('content/legal/terms-and-conditions.md'))
  }

  // ══ C ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const UNUSED = require('./_lp-france-vat-1.cjs').UNUSED_BASES
  const BASES = fs.readdirSync(path.join(REPO, 'content/legal')).filter(d => /^[a-z]{2,3}-[A-Z]{2}$/.test(d)).sort()
  const USED = BASES.filter(l => !UNUSED.includes(l))
  head(`C · THE TRANSLATIONS — the ${USED.length} language bases enabled countries use; the ${UNUSED.length} unused ones untouched`)
  {
    t(`${BASES.length} language bases installed; ${USED.length} used by an enabled country (the list france-receipts-1 read live), ${UNUSED.join(', ')} by none`, BASES.length === 59 && USED.length === 54)
    const drift = [], stale = [], h3 = [], terms = [], rest = [], back = [], unused = [], tc = []
    const paras = s => s.split('\n\n').filter(p => p.trim())
    for (const l of USED) {
      const pp = read(`content/legal/${l}/privacy-policy.md`), cs = read(`content/legal/${l}/country-specific-terms.md`)
      for (const [f, s] of [['privacy-policy.md', pp], ['country-specific-terms.md', cs]]) { const p = L.compare(f, s); if (p.length) (p.some(x => /^STALE/.test(x)) ? stale : drift).push(`${l}/${f}: ${p[0]}`) }
      const pp0 = atStart(`content/legal/${l}/privacy-policy.md`), cs0 = atStart(`content/legal/${l}/country-specific-terms.md`)
      // every country section keeps exactly its first ### (operators) part, byte for byte
      const secs = s => L.body(s).split(/\n(?=## )/).slice(1)
      const a = secs(cs0), b = secs(cs)
      const termsOf = s => { const hs = [...s.matchAll(/^### /gm)].map(m => m.index); return (hs.length > 1 ? s.slice(0, hs[1]) : s).replace(/\n+$/, '') }
      if (b.some(s => (s.match(/^### /gm) || []).length !== 1) || a.length !== 16 || b.length !== 16) h3.push(l)
      if (J(a.map(termsOf)) !== J(b.map(termsOf))) terms.push(l)
      const B = fs.existsSync(path.join(REPO, `docs/france-privacy-1/back/${l}.json`)) ? JSON.parse(read(`docs/france-privacy-1/back/${l}.json`)) : null
      if (!B || !B.text || !['A', 'B', 'C', 'D', 'G'].every(k => typeof B.back?.[k] === 'string' && B.back[k].trim() && typeof B.text[k] === 'string' && B.text[k].trim())) { back.push(l); continue }
      // the privacy policy: START with exactly the five parts replaced; the country terms: START's intro paragraphs replaced, the privacy parts gone
      const body0 = L.body(pp0), i0 = body0.indexOf('\n---\n')
      const A0 = paras(body0.slice(0, i0)).find(p => p.includes('](/country-terms)'))
      const sec = (md, n) => { const m = new RegExp(`^## ${n}\\.[^\\n]*\\n`, 'm').exec(md); return [m.index, md.indexOf('\n---\n', m.index)] }
      const [s4, e4] = sec(body0, 4), [s6, e6] = sec(body0, 6), [s8, e8] = sec(body0, 8)
      const B0 = paras(body0.slice(s4, e4)).pop(), C0 = paras(body0.slice(s6, e6)).slice(-2)[0], D0 = body0.slice(s8, e8).replace(/\n+$/, '')
      let want = body0
      try {
        want = once(want, A0, B.text.A); want = once(want, B0, B.text.B + '\n\n' + B0); want = once(want, C0, B.text.C); want = once(want, D0, B.text.D)
      } catch (e) { rest.push(`${l}: ${e.message}`); continue }
      if (L.body(pp) !== want) rest.push(`${l}/privacy-policy.md: something outside the five parts differs`)
      const csb0 = L.body(cs0), G0 = paras(csb0.slice(0, csb0.indexOf('\n---\n'))).slice(-3).join('\n\n')
      const csWant = once(csb0, G0, B.text.G).split(/\n(?=## )/).map((s, i) => (i === 0 ? s : termsOf(s) + '\n')).join('\n').replace(/\n+$/, '') + '\n'
      if (L.body(cs) !== csWant) rest.push(`${l}/country-specific-terms.md: something outside the intro and the privacy parts differs`)
      if (/\]\(\/country-terms\)/.test(L.body(pp).slice(0, L.body(pp).indexOf('\n---\n')))) rest.push(`${l}: the privacy intro still links the country terms`)
    }
    for (const l of UNUSED) for (const f of ['privacy-policy.md', 'country-specific-terms.md', 'terms-and-conditions.md']) if (read(`content/legal/${l}/${f}`) !== atStart(`content/legal/${l}/${f}`)) unused.push(`${l}/${f}`)
    for (const l of BASES) if (read(`content/legal/${l}/terms-and-conditions.md`) !== atStart(`content/legal/${l}/terms-and-conditions.md`)) tc.push(l)
    t(`${USED.length} × 2 files stamped with today's English (none stale)`, stale.length === 0, stale.slice(0, 5))
    t(`…and structure-clean: headings, section numbers, bullets, tables, links, every number, email and web address, processors (scripts/_legal-translations.cjs)`, drift.length === 0, drift.slice(0, 5))
    t('no "Privacy, for everyone in …" part left in any used locale: each of the 16 country sections keeps exactly one ### part', h3.length === 0, h3)
    t('every country\'s terms part byte-identical to START in every used locale', terms.length === 0, terms)
    t('every used locale has the new wording (intro, allergy notes, transfer sentence, section 8, country-terms intro) with a back-translation of each (docs/france-privacy-1/back/)', back.length === 0, back)
    t('…and nothing else moved: each file is START with exactly those parts replaced (and the privacy parts deleted), byte for byte', rest.length === 0, rest.slice(0, 5))
    t(`the ${UNUSED.length} unused bases' three files untouched (byte-identical to START)`, unused.length === 0, unused)
    t('every terms-and-conditions.md untouched', tc.length === 0, tc)
    const addr = USED.filter(l => { const d = L.body(read(`content/legal/${l}/privacy-policy.md`)); const s8 = d.slice(d.search(/^## 8\./m)); return !['privacy@hatchgrab.com', 'ico.org.uk', '0303 123 1113', "Information Commissioner's Office"].every(x => s8.includes(x)) })
    t('the email address, the ICO\'s name, web address and phone number exactly as in the English, in every used locale\'s section 8', addr.length === 0, addr)
  }

  // ══ D ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('D · THE PAGES RENDER — /privacy and /country-terms, English and translated')
  {
    const { renderer } = require('./_site-chrome-1-render.cjs')
    const { PAGES } = renderer(kit, REPO)
    const text = s => String(s ?? '').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
    const pp = text(await PAGES.legal('privacy')), ct = text(await PAGES.legal('countryTerms'))
    t('/privacy renders the new policy: "This policy applies wherever you are.", the allergy notes, "Making a request.", "If something goes wrong.", the ICO', /This policy applies wherever you are\./.test(pp) && /Allergy and dietary notes\./.test(pp) && /Making a request\./.test(pp) && /If something goes wrong\./.test(pp) && /Information Commissioner's Office/.test(pp) && /24 November 2026/.test(pp) && !/Some countries have extra rules\./.test(pp))
    t('/country-terms renders: the new intro, every country\'s operator terms, no privacy part', /Our Privacy Policy is the same in every country\./.test(ct) && !/Privacy, for everyone in/.test(ct) && (ct.match(/For food truck operators/g) || []).length === 16 && /24 November 2026/.test(ct))
    for (const [seg, base] of [['fr', 'fr-FR'], ['de', 'de-DE'], ['jp', 'ja-JP'], ['ae', 'ar-AE']]) {
      const B = JSON.parse(read(`docs/france-privacy-1/back/${base}.json`))
      const first = s => text(s.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')).replace(/\s+/g, '').slice(0, 40)
      const sq = x => x.replace(/\s+/g, '')   // a link tag becomes a space in text(); CJK has none of its own
      const p = sq(text(await PAGES.legalIn(seg, 'privacy'))), c = sq(text(await PAGES.legalIn(seg, 'countryTerms')))
      const h3 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/france-privacy-1-privacy-headings.json'), 'utf8'))[base] || []
      t(`/${seg}/privacy and /${seg}/country-terms (${base}) render the translation: its new intro and section 8; no per-country privacy heading`, p.includes(first(B.text.A)) && p.includes(first(B.text.D.split('\n\n')[1])) && c.includes(first(B.text.G)) && h3.length === 16 && !h3.some(x => c.includes(text(x.replace(/^### /, '')).replace(/\s+/g, ''))), { A: first(B.text.A), inP: p.includes(first(B.text.A)), G: first(B.text.G), inC: c.includes(first(B.text.G)) })
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
