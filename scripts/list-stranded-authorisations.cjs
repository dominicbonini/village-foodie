#!/usr/bin/env node
// scripts/list-stranded-authorisations.cjs
//
// ── 🔴 READ-ONLY. EVERY CONFIRMED ORDER STILL HOLDING UNCAPTURED MONEY. ───────────────────────────
// The truck accepted the order; the customer's card was authorised and never charged. Unless something
// captures it, the hold silently drops off their card in about seven days and the truck is never paid.
//
// USAGE
//   node scripts/list-stranded-authorisations.cjs
//   node scripts/list-stranded-authorisations.cjs --all        # include PENDING orders (see below)
//   node scripts/list-stranded-authorisations.cjs --no-stripe  # database only, no Stripe calls
//   node scripts/list-stranded-authorisations.cjs --json       # machine-readable
//
// ✅ IT WRITES NOTHING. Three SELECTs and, per row, one Stripe `paymentIntents.retrieve`. There is no
// insert, update, delete, capture or cancel anywhere in this file. Run it as often as you like.
//
// ── 🔴 --all, AND WHY IT IS NOT THE DEFAULT ──────────────────────────────────────────────────────
// A PENDING order's hold is CORRECT: the truck has not accepted it yet, so nothing is owed and nothing
// should be captured. Those rows are excluded by default because listing them alongside real problems
// is how a real problem gets ignored. `--all` shows them, marked PENDING-OK, for the times you want to
// see every live hold rather than only the broken ones.
//
// ── ⚠️ THIS DUPLICATES find_stranded_authorisations(), ON PURPOSE, AND IS DISPOSABLE ─────────────
// The durable mechanism is the SQL function in 20260815_find_stranded_authorisations.sql, called every
// fifteen minutes by app/api/cron/capture-stranded-authorizations. This script deliberately does NOT
// depend on it, so it can be run right now, before that migration is applied by hand. The cost is two
// implementations of one predicate: if they ever disagree, THE SQL FUNCTION IS RIGHT and this file is
// stale. It also pages in memory rather than anti-joining, which is fine at today's volume and is
// exactly why the real one is SQL.

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

// Load .env.local the same way the other scripts in here do — no dependency on dotenv.
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const { createClient } = require(path.join(ROOT, 'node_modules/@supabase/supabase-js'))

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set in .env.local')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const args = process.argv.slice(2)
const SHOW_ALL = args.includes('--all')
const NO_STRIPE = args.includes('--no-stripe')
const AS_JSON = args.includes('--json')

// The order statuses that mean THE TRUCK HAS ACCEPTED THIS ORDER. An allow-list, matching the SQL
// function exactly. 'pending' is absent on purpose. 'collected' is present on purpose — an order handed
// over without its money taken is the worst case, not an excluded one.
const ACCEPTED = ['confirmed', 'modified', 'cooking', 'ready', 'collected']

// ⚠️ MUST MATCH lib/payments/online.ts's onlinePaymentIdempotencyKey(). If that prefix ever changes,
// this script reports every captured order as stranded.
const idemKey = pi => `stripe_pi:${pi}`

async function main() {
  // ── 1. Every promoted draft that still has an uncancelled authorisation. ──────────────────────
  const { data: drafts, error: draftErr } = await supabase
    .from('order_drafts')
    .select('order_key, truck_id, payment_intent_id, total_minor, promoted_at, expires_at')
    .not('payment_intent_id', 'is', null)
    .not('promoted_at', 'is', null)
    .is('authorization_cancelled_at', null)
    .order('promoted_at', { ascending: true })
  if (draftErr) { console.error('order_drafts read failed:', draftErr.message); process.exit(1) }
  if (!drafts.length) { console.log('No promoted draft holds an uncancelled authorisation. Nothing to report.'); return }

  const keys = drafts.map(d => d.order_key)

  // ── 2. The orders those drafts became, for their status. ──────────────────────────────────────
  const { data: orders, error: orderErr } = await supabase
    .from('orders')
    .select('order_key, id, status, payment_status, truck_id, placed_at')
    .in('order_key', keys)
  if (orderErr) { console.error('orders read failed:', orderErr.message); process.exit(1) }
  const orderByKey = new Map(orders.map(o => [o.order_key, o]))

  // ── 3. The ledger, which is the authority on what has been captured. ──────────────────────────
  const { data: paid, error: payErr } = await supabase
    .from('order_payments')
    .select('idempotency_key')
    .in('idempotency_key', drafts.map(d => idemKey(d.payment_intent_id)))
  if (payErr) { console.error('order_payments read failed:', payErr.message); process.exit(1) }
  const captured = new Set(paid.map(p => p.idempotency_key))

  const rows = []
  for (const d of drafts) {
    if (captured.has(idemKey(d.payment_intent_id))) continue      // money already taken, nothing to see
    const o = orderByKey.get(d.order_key)
    // 🔴 A PROMOTED DRAFT WITH NO ORDER IS ITS OWN, DIFFERENT PROBLEM: promotion claimed the draft and
    // then failed to insert. Shown, because it is money held against nothing at all.
    const status = o ? o.status : 'NO ORDER ROW'
    const accepted = !!o && ACCEPTED.includes(o.status)
    const pendingOk = !!o && o.status === 'pending'
    if (!accepted && !SHOW_ALL) continue
    rows.push({
      order_id:      o ? o.id : '-',
      order_key:     d.order_key,
      truck_id:      d.truck_id,
      status,
      verdict:       accepted ? 'STRANDED' : pendingOk ? 'PENDING-OK' : 'CHECK BY HAND',
      amount:        `£${(d.total_minor / 100).toFixed(2)}`,
      total_minor:   d.total_minor,
      payment_intent_id: d.payment_intent_id,
      promoted_at:   d.promoted_at,
      payment_status: o ? o.payment_status : '-',
    })
  }

  // ── 4. What Stripe says the hold is doing now. Read-only; skipped with --no-stripe. ───────────
  // ⚠️ NO SANDBOX GUARD HERE, DELIBERATELY, UNLIKE THE SCRIPTS THAT MOVE MONEY. `retrieve` changes
  // nothing, and refusing a live key would make this useless in production — which is precisely where
  // an unnoticed stranded hold costs a real truck real money. The mode is printed so it is never a
  // guess which set of books you are looking at.
  if (!NO_STRIPE && rows.length && process.env.STRIPE_SECRET_KEY) {
    const Stripe = require(path.join(ROOT, 'node_modules/stripe'))
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const accountByTruck = new Map()
    for (const r of rows) {
      try {
        if (!accountByTruck.has(r.truck_id)) {
          // trucks.operator_id -> operators.stripe_account_id, exactly as lib/payments/authorize.ts's
          // stripeAccountForTruck() resolves it. Two hops, not one.
          const { data: truck } = await supabase
            .from('trucks').select('operator_id').eq('id', r.truck_id).maybeSingle()
          let acctId = null
          if (truck && truck.operator_id) {
            const { data: op } = await supabase
              .from('operators').select('stripe_account_id').eq('id', truck.operator_id).maybeSingle()
            acctId = op ? op.stripe_account_id : null
          }
          accountByTruck.set(r.truck_id, acctId)
        }
        const acct = accountByTruck.get(r.truck_id)
        if (!acct) { r.stripe = 'no connected account'; continue }
        const pi = await stripe.paymentIntents.retrieve(r.payment_intent_id, {}, { stripeAccount: acct })
        r.stripe = `${pi.status} capturable=${pi.amount_capturable} received=${pi.amount_received}`
      } catch (e) {
        r.stripe = `retrieve failed: ${e.message}`
      }
    }
  }

  if (AS_JSON) { console.log(JSON.stringify(rows, null, 2)); return }

  const stranded = rows.filter(r => r.verdict === 'STRANDED')
  const heldMinor = stranded.reduce((n, r) => n + r.total_minor, 0)

  console.log('')
  console.log(`Stripe mode : ${process.env.STRIPE_SECRET_KEY ? (process.env.STRIPE_SECRET_KEY.startsWith('sk_test_') ? 'SANDBOX (sk_test_)' : '🔴 LIVE') : 'not configured'}`)
  console.log(`Promoted drafts with an uncancelled authorisation : ${drafts.length}`)
  console.log(`Of those, not captured                            : ${rows.length}${SHOW_ALL ? '' : ' (accepted orders only; --all to include pending)'}`)
  console.log('')
  if (!rows.length) { console.log('✅ Nothing stranded. Every accepted card order has been captured.'); return }

  for (const r of rows) {
    const mark = r.verdict === 'STRANDED' ? '🔴' : r.verdict === 'PENDING-OK' ? '  ' : '⚠️ '
    console.log(`${mark} #${String(r.order_id).padEnd(5)} ${r.verdict.padEnd(13)} ${r.amount.padEnd(8)} ${r.status.padEnd(12)} ${r.payment_intent_id}`)
    console.log(`     truck=${r.truck_id}  order_key=${r.order_key}`)
    console.log(`     promoted=${r.promoted_at}  orders.payment_status=${r.payment_status}${r.stripe ? `  stripe=${r.stripe}` : ''}`)
  }
  console.log('')
  console.log(`🔴 STRANDED: ${stranded.length} order(s), £${(heldMinor / 100).toFixed(2)} held and never taken.`)
  if (stranded.length) {
    console.log('   To take it: GET /api/cron/capture-stranded-authorizations (add ?dry=1 to preview).')
    console.log('   That route captures and never cancels, and it requires 20260815_find_stranded_authorisations.sql.')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
