// scripts/france-privacy-2.cjs — france-privacy-2 (24 November 2026, docs/france-privacy-2-report.md): ACCOUNT DELETION ALSO DELETES THE
// TRUCKS' WHATSAPP HISTORY AT ONCE, AND CLEARS THE CARD DRAFTS' CUSTOMER NAME, EMAIL AND PHONE.
//
//   A · ACCOUNT DELETION, IN MEMORY (never the live database) — an account with two trucks and another account's truck; whatsapp_logs and
//       messages rows for all three; promoted and unpromoted card drafts with customer details; orders (old- and new-style notes) and
//       order_payments. Run by THIS tree and by the prompt's starting commit (START, extracted from git) on the same seed. After it: the
//       account's WhatsApp rows are gone and the other account's untouched; every draft of the account reads '[deleted]', null, null;
//       orders, order_payments and everything france-privacy-1 did byte-identical to START's result; nothing else deleted; the result
//       reports the counts; running it twice is harmless; a failing step throws its named step and a re-run recovers.
//   B · THE CODE — the new steps sit after 2b and before staff; they delete by truck_id from the two WhatsApp tables only; nothing deletes
//       an order, draft or payment; deleteTruckCascade still never called; retention, the admin route and the legal text untouched.
//
// Usage: node scripts/france-privacy-2.cjs
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'france-privacy-2' })
const { REPO } = kit

const START = '1bace5d4'   // this prompt's starting commit (manual-v16-36)
let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const atStart = f => execFileSync('git', ['show', `${START}:${f}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 1e8 })
const J = v => JSON.stringify(v)
const clone = v => JSON.parse(J(v))
const NOTE_RE = /No basil|nut allergy|BIEN CUIT|no peanuts|Ring twice|coeliac/i

function extract(ref) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp2-start-'))
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
    plugins: [{ name: 'fp2', setup(b) { b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'so', namespace: 'fp2' })); b.onLoad({ filter: /.*/, namespace: 'fp2' }, () => ({ contents: '', loader: 'js' })) } }],
  })
  const dir = path.join(REPO, 'node_modules/.cache/france-privacy-2-trees'); fs.mkdirSync(dir, { recursive: true })
  const out = path.join(dir, `${tag}-${bundleN++}.cjs`)
  fs.writeFileSync(out, res.outputFiles[0].text)
  return require(out)
}

// ── the in-memory database: paperwork-1's fake (select / eq / gt / order / limit / update / delete, auth, storage), rows round-tripped
// through JSON on every write as a jsonb column would store them; every write recorded. `failOn` makes one table's write fail once. ──
const { fakeSupabase } = require('./_paperwork-1-fixtures.cjs')
/** A query that fails however it is chained (eq / select / …) and awaited. */
function failQ() { const q = new Proxy({}, { get: (_, k) => (k === 'then' ? (res => res({ data: null, error: { message: 'injected failure' } })) : () => q) }); return q }
function jsonDb(seed, failOn) {
  const db = fakeSupabase(clone(seed)), from = db.from.bind(db), writes = []
  let failed = false
  db.from = table => {
    const q = from(table), upd = q.update, del = q.delete
    q.update = v => { writes.push(['update', table, clone(v)]); if (failOn && failOn.table === table && failOn.op === 'update' && !failed) { failed = true; return failQ() } return upd(clone(v)) }
    q.delete = () => { writes.push(['delete', table]); if (failOn && failOn.table === table && failOn.op === 'delete' && !failed) { failed = true; return failQ() } return del() }
    return q
  }
  db.writes = writes
  return db
}

const LN = (items, deals) => ({ v: 1, ...(items ? { items } : {}), ...(deals ? { deals } : {}) })
function seed() {
  const base = { country: 'GB', currency: 'GBP', status: 'collected', payment_status: 'paid', created_at: '2026-11-20T12:00:00.000Z', table_ref: null, extras: null }
  const orders = [
    { ...base, order_key: 'o-new', id: 'A-1', truck_id: 'tA', customer_name: 'Ada Lovelace', customer_email: 'ada@example.test', customer_phone: '+447700900001', notes: 'Ring twice — coeliac',
      items: [{ cartKey: 'c1', name: 'Margherita', price: 9.5, quantity: 1 }], deals: null, line_notes: LN({ 'k:c1': { at: 4, note: 'No basil — nut allergy' } }),
      subtotal: 9.5, total: 9.5, total_minor: 950, food_minor: 950, tax_minor: 158, receipt_no: 'R-1' },
    { ...base, order_key: 'o-old', id: 'A-2', truck_id: 'tA', customer_name: 'Bob', customer_email: null, customer_phone: '+447700900002', notes: null,
      items: [{ name: 'Steak', price: 18, quantity: 1, specialInstructions: 'BIEN CUIT' }], deals: [{ name: 'Kids', price: 7, quantity: 1, slotNotes: { main: 'no peanuts' } }],
      line_notes: null, subtotal: 25, total: 25, total_minor: 2500, food_minor: 2500, tax_minor: 417, receipt_no: 'R-2' },
    { ...base, order_key: 'o-b', id: 'B-1', truck_id: 'tB', customer_name: 'Ed', customer_email: 'ed@example.test', customer_phone: null, notes: 'Ring twice',
      items: [{ name: 'Wrap', price: 8, quantity: 1, specialInstructions: 'nut allergy' }], deals: null, line_notes: null, subtotal: 8, total: 8, total_minor: 800, food_minor: 800, tax_minor: 133, receipt_no: 'R-3' },
    { ...base, order_key: 'o-other', id: 'X-1', truck_id: 'tX', customer_name: 'Fay', customer_email: 'fay@example.test', customer_phone: '+447700900009', notes: 'Ring twice',
      items: [{ name: 'Pie', price: 5, quantity: 1, specialInstructions: 'No basil' }], deals: null, line_notes: null, subtotal: 5, total: 5, total_minor: 500, food_minor: 500, tax_minor: 83, receipt_no: 'X-1' },
  ]
  const draft = (k, truck, name, email, phone, promoted, extra = {}) => ({ order_key: k, truck_id: truck, customer_name: name, customer_email: email, customer_phone: phone, notes: null,
    promoted_at: promoted, expires_at: '2026-11-20T12:30:00.000Z', payment_intent_id: `pi_${k}`, items: [{ name: 'Bun', price: 4, quantity: 1 }], deals: null, line_notes: null,
    subtotal: 4, total: 4, total_minor: 400, currency: 'GBP', ...extra })
  const order_drafts = [
    draft('d-a-promoted', 'tA', 'Gus', 'gus@example.test', '+447700900010', '2026-11-20T12:01:00.000Z', { notes: 'coeliac' }),
    draft('d-a-open', 'tA', 'Hal', 'hal@example.test', null, null),
    draft('d-a-blank', 'tA', null, null, null, null),
    draft('d-b-open', 'tB', 'Ivy', null, '+447700900011', null, { items: [{ name: 'Wrap', price: 8, quantity: 1, specialInstructions: 'nut allergy' }] }),
    draft('d-b-promoted', 'tB', 'Jo', 'jo@example.test', '+447700900012', '2026-11-21T09:00:00.000Z'),
    draft('d-x-open', 'tX', 'Kim', 'kim@example.test', '+447700900013', null, { notes: 'Ring twice' }),
  ]
  const order_payments = [
    { id: 'pay-1', order_key: 'o-new', truck_id: 'tA', amount_minor: 950, currency: 'GBP', method: 'card', state: 'succeeded', note: 'Online card payment', livemode: false },
    { id: 'pay-2', order_key: 'o-b', truck_id: 'tB', amount_minor: 800, currency: 'GBP', method: 'cash', state: 'succeeded', note: 'Mark paid & done — taken at the hatch', livemode: false },
    { id: 'pay-3', order_key: 'o-other', truck_id: 'tX', amount_minor: 500, currency: 'GBP', method: 'card', state: 'succeeded', note: null, livemode: false },
  ]
  const wl = (id, truck, n, msg, reply) => ({ id, truck_id: truck, customer_number: n, message_in: msg, classification: reply ? 'SPECIFIC_QUERY' : 'IGNORE', events_found: 1, response_sent: reply, possible_miss: false, created_at: '2026-11-22T10:00:00.000Z' })
  const whatsapp_logs = [
    wl('w-a1', 'tA', '+447700900101', 'Where are you on Friday?', 'Friday: Market Square, 5–9pm'),
    wl('w-a2', 'tA', '+447700900102', 'thanks!', null),
    wl('w-b1', 'tB', '+447700900103', 'Are you gluten free?', 'Ask at the hatch'),
    wl('w-x1', 'tX', '+447700900104', 'Open today?', 'Yes, 12–2pm'),
    wl('w-x2', 'tX', '+447700900105', 'Menu?', 'hatchgrab.com/x'),
  ]
  const msg = (id, truck, dir, ch, from, to, body) => ({ id, order_id: null, truck_id: truck, direction: dir, channel: ch, from_number: from, to_number: to, body, inbound_message: null, created_at: '2026-11-22T10:00:01.000Z' })
  const messages = [
    msg(1, 'tA', 'inbound', 'whatsapp', '+447700900101', '+447700900900', 'Where are you on Friday?'),
    msg(2, 'tA', 'outbound', 'whatsapp', '+447700900900', '+447700900101', 'Friday: Market Square, 5–9pm'),
    msg(3, 'tB', 'outbound', 'sms', '+447700900901', '+447700900103', 'Your order is ready'),
    msg(4, 'tX', 'inbound', 'whatsapp', '+447700900104', '+447700900902', 'Open today?'),
  ]
  return {
    operators: [{ id: 'op1', name: 'Test Owner', first_name: 'Test', last_name: 'Owner', email: 'owner@example.test', phone: null, auth_user_id: 'u1', deletion_requested_at: '2026-10-01T00:00:00Z' },
      { id: 'op2', name: 'Other', first_name: 'O', last_name: 'T', email: 'other@example.test', phone: null, auth_user_id: 'u2', deletion_requested_at: null }],
    trucks: [{ id: 'tA', name: 'Test Truck A', operator_id: 'op1', contact_email: 'a@example.test', contact_phone: null, phone: null, active: true },
      { id: 'tB', name: 'Test Truck B', operator_id: 'op1', contact_email: 'b@example.test', contact_phone: null, phone: null, active: true },
      { id: 'tX', name: 'Other Truck', operator_id: 'op2', contact_email: 'x@example.test', contact_phone: null, phone: null, active: true }],
    truck_users: [{ id: 'tu1', truck_id: 'tA', auth_user_id: 'u1' }, { id: 'tu2', truck_id: 'tX', auth_user_id: 'u2' }],
    orders, order_drafts, order_payments, whatsapp_logs, messages,
  }
}
const MINE = r => r.truck_id === 'tA' || r.truck_id === 'tB'
const IDENT = ['customer_name', 'customer_email', 'customer_phone']
const noIdent = r => { const o = { ...r }; for (const k of IDENT) delete o[k]; return o }
const TABLES = ['operators', 'trucks', 'truck_users', 'orders', 'order_drafts', 'order_payments', 'whatsapp_logs', 'messages']

;(async () => {
  // ══ A ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head(`A · ACCOUNT DELETION, IN MEMORY — this tree vs START ${START} on the same seed (never the live database)`)
  const startDir = extract(START)
  const S = await bundleTree(startDir, 'start', "export { executeAccountDeletion } from '@/lib/account-deletion'")
  const H = await bundleTree(REPO, 'head', "export { executeAccountDeletion, AccountDeletionError } from '@/lib/account-deletion'")
  const SEED = seed()
  const dbS = jsonDb(SEED), dbH = jsonDb(SEED)
  const rS = await kit.quietAsync(() => S.executeAccountDeletion(dbS, 'op1'))
  const rH = await kit.quietAsync(() => H.executeAccountDeletion(dbH, 'op1'))
  {
    t('the seed: two trucks on the account and another account\'s truck, each with WhatsApp rows (whatsapp_logs and messages, an sms row too) and card drafts with customer details',
      ['tA', 'tB', 'tX'].every(tr => SEED.whatsapp_logs.some(r => r.truck_id === tr) && SEED.messages.some(r => r.truck_id === tr) && SEED.order_drafts.some(r => r.truck_id === tr && r.customer_name))
      && SEED.order_drafts.filter(MINE).some(d => d.promoted_at) && SEED.order_drafts.filter(MINE).some(d => !d.promoted_at))
    t('START left the account\'s WhatsApp rows and its drafts\' names, emails and phones (the gap this closes)',
      dbS.T.whatsapp_logs.filter(MINE).length === 3 && dbS.T.messages.filter(MINE).length === 3 && dbS.T.order_drafts.filter(MINE).some(d => d.customer_email))
    t('THIS TREE: every whatsapp_logs and messages row of the account\'s two trucks is gone', dbH.T.whatsapp_logs.filter(MINE).length === 0 && dbH.T.messages.filter(MINE).length === 0, [dbH.T.whatsapp_logs.filter(MINE), dbH.T.messages.filter(MINE)])
    const otherWa = db => J([db.T.whatsapp_logs.filter(r => r.truck_id === 'tX'), db.T.messages.filter(r => r.truck_id === 'tX')])
    t('…and the other account\'s WhatsApp rows are untouched (byte-identical to the seed)', otherWa(dbH) === otherWa(jsonDb(SEED)))
    t('every card draft of the account — promoted, unpromoted and already blank — reads \'[deleted]\', null, null (as step 2 anonymises orders)',
      dbH.T.order_drafts.filter(MINE).length === 5 && dbH.T.order_drafts.filter(MINE).every(d => J(IDENT.map(k => d[k])) === J(['[deleted]', null, null])), dbH.T.order_drafts.filter(MINE).map(d => IDENT.map(k => d[k])))
    t('…every other column of every draft byte-identical to START\'s result (notes cleared by 2b as before; totals, promoted_at, payment intent kept)',
      J(dbH.T.order_drafts.map(noIdent)) === J(dbS.T.order_drafts.map(noIdent)))
    t('…and the other account\'s draft untouched (name, email, phone and its note)', J(dbH.T.order_drafts.find(d => d.truck_id === 'tX')) === J(SEED.order_drafts.find(d => d.truck_id === 'tX')))
    t('orders byte-identical to START\'s result — the identity step and france-privacy-1\'s notes step exactly as before', J(dbH.T.orders) === J(dbS.T.orders) && !NOTE_RE.test(J(dbH.T.orders.filter(MINE))))
    t('order_payments byte-identical to the seed and never written', J(dbH.T.order_payments) === J(SEED.order_payments) && !dbH.writes.some(([, tb]) => tb === 'order_payments'))
    t('operators, trucks and staff end exactly as START\'s run left them', ['operators', 'trucks', 'truck_users'].every(tb => J(dbH.T[tb]) === J(dbS.T[tb])))
    const counts = db => Object.fromEntries(TABLES.map(tb => [tb, db.T[tb].length]))
    const cH = counts(dbH), cS = counts(dbS)
    t('nothing else deleted: every table keeps START\'s row count except the two WhatsApp tables, which lose exactly the account\'s rows (3 and 3)',
      TABLES.every(tb => (tb === 'whatsapp_logs' || tb === 'messages') ? cH[tb] === cS[tb] - 3 : cH[tb] === cS[tb]), { H: cH, S: cS })
    const dels = db => db.writes.filter(([op]) => op === 'delete').map(w => w[1])
    t('the only new deletes are the two WhatsApp tables: every other delete is exactly START\'s (staff, paperwork, loyalty, tokens), and none touches an order, draft, payment, truck or operator',
      J(dels(dbH).filter(tb => tb !== 'whatsapp_logs' && tb !== 'messages')) === J(dels(dbS)) && dels(dbH).filter(tb => tb === 'whatsapp_logs' || tb === 'messages').length === 4
      && !dels(dbH).some(tb => ['orders', 'order_drafts', 'order_payments', 'trucks', 'operators'].includes(tb)), { H: dels(dbH), S: dels(dbS) })
    t(`the result reports whatsappDeleted ${J(rH.whatsappDeleted)} and draftsAnonymised ${rH.draftsAnonymised}`, J(rH.whatsappDeleted) === J({ whatsapp_logs: 3, messages: 3 }) && rH.draftsAnonymised === 5)
    t('…and every other figure of the result equals START\'s', J({ ...rH, whatsappDeleted: undefined, draftsAnonymised: undefined }) === J(rS), { H: Object.keys(rH), S: Object.keys(rS) })

    // TWICE: run again as it is (the trucks are off the account now), and the recovery re-run with the trucks still on the account
    const before2 = J(dbH.T)
    const r2 = await kit.quietAsync(() => H.executeAccountDeletion(dbH, 'op1'))
    t('running it a second time is harmless: every table byte-identical', J(dbH.T) === before2 && J(r2.whatsappDeleted) === J({ whatsapp_logs: 0, messages: 0 }))
    const dbR = jsonDb(JSON.parse(before2)); dbR.T.trucks.forEach(tr => { if (tr.id !== 'tX') tr.operator_id = 'op1' })
    const snapR = J(['orders', 'order_drafts', 'order_payments', 'whatsapp_logs', 'messages'].map(tb => dbR.T[tb]))
    const rR = await kit.quietAsync(() => H.executeAccountDeletion(dbR, 'op1'))
    t('…and a re-run that reaches the new steps again (trucks still on the account) deletes nothing and leaves orders, drafts, payments and WhatsApp rows byte-identical',
      J(['orders', 'order_drafts', 'order_payments', 'whatsapp_logs', 'messages'].map(tb => dbR.T[tb])) === snapR && J(rR.whatsappDeleted) === J({ whatsapp_logs: 0, messages: 0 }) && rR.draftsAnonymised === 5)

    // A FAILING STEP: it throws its named step, and a re-run finishes the job — the same end state as a clean run
    for (const [failOn, step] of [[{ table: 'whatsapp_logs', op: 'delete' }, 'delete_whatsapp:whatsapp_logs:tA'], [{ table: 'messages', op: 'delete' }, 'delete_whatsapp:messages:tA'], [{ table: 'order_drafts', op: 'update' }, null]]) {
      const dbF = jsonDb(SEED, failOn)
      let err = null
      try { await kit.quietAsync(() => H.executeAccountDeletion(dbF, 'op1')) } catch (e) { err = e }
      // the first order_drafts update is 2b's notes write (an existing step): its own name stays; 2d's name is checked with a fresh fault below
      const want = step ?? 'clear_notes:order_drafts:d-a-promoted'
      t(`a failing ${failOn.table} ${failOn.op} throws AccountDeletionError at step "${want}"`, err instanceof H.AccountDeletionError && err.step === want, err && [err.name, err.step, err.message])
      await kit.quietAsync(() => H.executeAccountDeletion(dbF, 'op1'))
      t('…and re-running finishes it: every table ends exactly as after a clean run', TABLES.every(tb => J(dbF.T[tb]) === J(jsonDb(JSON.parse(before2)).T[tb])))
    }
    {
      // 2d's own name: fail the order_drafts update that sets the identity (the notes step writes notes only)
      const dbF = jsonDb(SEED), from = dbF.from
      let failed = false
      dbF.from = table => {
        const q = from(table), upd = q.update
        q.update = v => (table === 'order_drafts' && 'customer_name' in v && !failed ? (failed = true, failQ()) : upd(v))
        return q
      }
      let err = null
      try { await kit.quietAsync(() => H.executeAccountDeletion(dbF, 'op1')) } catch (e) { err = e }
      t('a failing draft-identity write throws AccountDeletionError at step "anonymise_drafts:tA"', err instanceof H.AccountDeletionError && err.step === 'anonymise_drafts:tA', err && [err.step, err.message])
      await kit.quietAsync(() => H.executeAccountDeletion(dbF, 'op1'))
      t('…and re-running finishes it', TABLES.every(tb => J(dbF.T[tb]) === J(jsonDb(JSON.parse(before2)).T[tb])))
    }
  }

  // ══ B ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('B · THE CODE — where the steps sit, what they may touch, and what did not change')
  {
    const src = read('lib/account-deletion.ts'), code = src.replace(/\/\/.*$/gm, '')
    const at = re => code.search(re)
    const i2b = at(/notesPatch\(r\)/), i2c = at(/from\(table\)\.delete\(\)\.eq\('truck_id', truckId\)/), i2d = at(/\.from\('order_drafts'\)\s*\.update\(\{ customer_name: ANON_LABEL/), i3 = at(/\.from\('truck_users'\)/)
    t('the new steps come after 2b (the notes) and before 3 (staff): 2b → 2c WhatsApp → 2d drafts → 3', i2b > 0 && i2c > i2b && i2d > i2c && i3 > i2d, [i2b, i2c, i2d, i3])
    t('2c deletes from exactly the two WhatsApp tables, by truck_id, one truck of the account at a time', /for \(const table of \['whatsapp_logs', 'messages'\] as const\)/.test(code) && (code.match(/\.delete\(\)/g) || []).length === 3 && /for \(const truckId of truckIds\)[\s\S]{0,80}from\(table\)\.delete\(\)\.eq\('truck_id', truckId\)/.test(code))
    t('2d writes the same three values as the orders step (\'[deleted]\', null, null), by truck_id', (code.match(/\.update\(\{ customer_name: ANON_LABEL, customer_email: null, customer_phone: null \}\)\s*\.eq\('truck_id', truckId\)/g) || []).length === 2)
    t('the named steps: delete_whatsapp:<table>:<truck>, anonymise_drafts:<truck>', /AccountDeletionError\(`delete_whatsapp:\$\{table\}:\$\{truckId\}`/.test(code) && /AccountDeletionError\(`anonymise_drafts:\$\{truckId\}`/.test(code))
    t('still never calls deleteTruckCascade, and deletes no order, draft, payment or truck', !/deleteTruckCascade\s*\(/.test(code) && !/from\('(orders|order_drafts|order_payments|trucks)'\)\s*\.delete\(/.test(code))
    const startSrc = atStart('lib/account-deletion.ts')
    const strip = s => s.replace(/\n  \/\/ ── 2c\.[\s\S]*?(?=\n  \/\/ ── 3\. STAFF)/, '').replace(/\n  \/\*\* france-privacy-2:[^\n]*\n  whatsappDeleted[^\n]*\n  \/\*\* france-privacy-2:[^\n]*\n  draftsAnonymised: number/, '')
      .replace(', whatsappDeleted, draftsAnonymised,', ',').replace(/\n\/\/   • the trucks' WhatsApp rows[^\n]*\n\/\/     cleared like[^\n]*/, '')
    t('…and the rest of lib/account-deletion.ts is byte-identical to START (only the two steps, two result fields and a header line added)', strip(src) === startSrc)
    for (const f of ['lib/order-retention.ts', 'app/api/admin/execute-account-deletion/route.ts', 'app/api/cron/order-retention/route.ts', 'content/legal/privacy-policy.md', 'content/legal/country-specific-terms.md'])
      t(`${f} byte-identical to START (retention, the admin route and the legal text not touched)`, read(f) === atStart(f))
    const pp = read('content/legal/privacy-policy.md')
    t('the privacy policy still says what the new steps make true: WhatsApp kept 12 months at most, and account deletion removes personal data',
      /\*\*WhatsApp messages your customers send a truck, and our automatic replies:\*\* 12 months\./.test(pp) && /We will delete your account and personal data, except where we are required to retain records for accounting or legal reasons\./.test(pp)
      && /When an operator's account is deleted, we also remove their customers' names, contact details and notes from the orders we keep\./.test(pp))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
