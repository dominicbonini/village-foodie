// scripts/diag-demo-event.mjs
// ⚠️ THROWAWAY DIAGNOSTIC — delete once the demo event insert is fixed.
//
// Run:  node scripts/diag-demo-event.mjs
//   or: node scripts/diag-demo-event.mjs demo-someothertruckid
//
// WHY IT DOESN'T CALL provisionDemoEvent(): that function wraps the Postgres error into a DemoEventError
// carrying only `error.message` — `code`, `details`, `hint` and the constraint name are discarded before
// the caller ever sees them. So this replicates its EXACT insert payload and dumps the raw error object.
//
// It also BISECTS: minimal insert first, then the full payload, then one extra column at a time — so the
// output names the offending column rather than leaving you to infer it.
//
// CREATES NOTHING PERMANENT. Every row that does insert is deleted immediately; the script prints a final
// count so you can confirm it left nothing behind.

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const TRUCK_ID = process.argv[2] || 'demo-8hv08fdtkte2hb9ryfn699d2pm'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const supabase = createClient(url, key)

const line = (t) => console.log(`\n${'─'.repeat(78)}\n${t}\n${'─'.repeat(78)}`)

/** Dump EVERYTHING PostgREST gives us — this is the whole point of the script. */
function dumpError(err) {
  if (!err) return console.log('   no error')
  console.log('   message   :', err.message)
  console.log('   code      :', err.code)
  console.log('   details   :', err.details)
  console.log('   hint      :', err.hint)
  console.log('   RAW       :', JSON.stringify(err, Object.getOwnPropertyNames(err), 2))
}

/** Insert, report, then ALWAYS delete anything that landed. Returns true on success. */
async function tryInsert(label, payload) {
  const { data, error } = await supabase
    .from('truck_events').insert(payload).select('id').single()
  if (error) {
    console.log(`\n❌ ${label}`)
    dumpError(error)
    return false
  }
  console.log(`\n✅ ${label}  → inserted ${data.id} (deleting immediately)`)
  await supabase.from('truck_events').delete().eq('id', data.id)
  return true
}

// ── Same window maths as demoEventWindow() ─────────────────────────────────────────────────────────
function demoEventWindow(now, tz = 'Europe/London') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '00'
  const h = Number(get('hour'))
  const m = Number(get('minute'))
  const start = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const endHour = h + 3
  const end = endHour >= 24 ? '23:59' : `${String(endHour).padStart(2, '0')}:00`
  const dParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const dGet = (t) => dParts.find((p) => p.type === t)?.value ?? ''
  return { date: `${dGet('year')}-${dGet('month')}-${dGet('day')}`, start, end }
}

async function main() {
  line(`DIAGNOSING truck_events INSERT for ${TRUCK_ID}`)

  // ── Preconditions ────────────────────────────────────────────────────────────────────────────────
  const { data: truck, error: tErr } = await supabase
    .from('trucks').select('id, name, active, excluded, plan').eq('id', TRUCK_ID).maybeSingle()
  if (tErr) { console.log('truck query error:'); dumpError(tErr) }
  if (!truck) { console.error(`\n🔴 Truck ${TRUCK_ID} not found — pass a different id as argv[2].`); process.exit(1) }
  console.log('truck   :', JSON.stringify(truck))

  const { data: vans } = await supabase
    .from('truck_vans').select('id, name, active, kitchen_capacity, order_ready_enabled')
    .eq('truck_id', TRUCK_ID)
  console.log('vans    :', JSON.stringify(vans))

  const { count: itemCount } = await supabase
    .from('menu_items_db').select('*', { count: 'exact', head: true })
    .eq('truck_id', TRUCK_ID).eq('is_active', true)
  console.log('items   :', itemCount)

  const { count: evCount } = await supabase
    .from('truck_events').select('*', { count: 'exact', head: true }).eq('truck_id', TRUCK_ID)
  console.log('events  :', evCount, '(expected 0)')

  // Exactly what provisionDemoEvent resolves
  const activeVans = (vans ?? []).filter((v) => v.active)
  const vanId = activeVans.length === 1 ? activeVans[0].id : null
  const orderReady = vanId ? (activeVans[0].order_ready_enabled ?? null) : null
  const { date, start, end } = demoEventWindow(new Date())
  const nowIso = new Date().toISOString()
  console.log('\nresolved:', JSON.stringify({ vanId, orderReady, date, start, end }))
  if (!vanId) console.log('⚠️  vanId is NULL — getSoleActiveVanId would return null (needs exactly ONE active van)')

  // ── A. Minimal — the shape dashboard/action:519 uses in production ────────────────────────────────
  line('A. MINIMAL insert (the known-working production shape)')
  const minimal = {
    truck_id: TRUCK_ID, event_date: date, start_time: start, end_time: end,
    order_ready_override: orderReady, source: 'manual',
    venue_name: 'Demo event',   // NOT NULL, no default — must be supplied
  }
  console.log('payload:', JSON.stringify(minimal))
  const minimalOk = await tryInsert('minimal', minimal)

  // ── B. The full payload provisionDemoEvent sends today ────────────────────────────────────────────
  line('B. FULL payload (exactly what lib/provision-demo-event.ts sends)')
  const full = {
    ...minimal,
    van_id: vanId,
    status: 'open',
    confirmed_at: nowIso,
    opened_at: nowIso,
    auto_open: false,
    auto_close: false,
  }
  console.log('payload:', JSON.stringify(full))
  const fullOk = await tryInsert('full', full)

  // ── C. Bisect — add ONE extra column at a time to the minimal payload ─────────────────────────────
  if (minimalOk && !fullOk) {
    line('C. BISECT — minimal + one extra column at a time (the failing one is the culprit)')
    const extras = {
      van_id: vanId,
      status: 'open',
      confirmed_at: nowIso,
      opened_at: nowIso,
      auto_open: false,
      auto_close: false,
    }
    for (const [k, v] of Object.entries(extras)) {
      await tryInsert(`minimal + ${k} = ${JSON.stringify(v)}`, { ...minimal, [k]: v })
    }
  } else if (!minimalOk) {
    line('C. SKIPPED — even the MINIMAL insert failed, so the problem is in the base columns above,')
    console.log('   not in the extras. The error dumped under A names it.')
  } else {
    line('C. SKIPPED — the full payload SUCCEEDED.')
    console.log('   The insert is not the failure point. Re-run the real flow and check the slot_capacity')
    console.log('   write and rebuildProductionSlotUsage instead (both run AFTER the insert).')
  }

  // ── D. NULLABILITY PROBE — confirm each remaining location column rather than assuming ───────────
  // Empirical, because PostgREST doesn't expose information_schema. A row that inserts with the column
  // explicitly NULL proves it's nullable; a failure names the next one to supply.
  if (minimalOk) {
    line('D. NULLABILITY PROBE — base + one column explicitly NULL at a time')
    for (const col of ['town', 'postcode', 'address', 'latitude', 'longitude']) {
      await tryInsert(`base + ${col} = null  →  success means NULLABLE`, { ...minimal, [col]: null })
    }
    // Control: prove the venue_name finding rather than trusting it.
    const { venue_name: _drop, ...noVenue } = minimal
    await tryInsert('base WITHOUT venue_name  →  expected to FAIL (NOT NULL, no default)', noVenue)
    await tryInsert('base + venue_name = null →  expected to FAIL (NOT NULL)', { ...minimal, venue_name: null })
  }

  // ── Leave-nothing-behind check ───────────────────────────────────────────────────────────────────
  const { count: finalCount } = await supabase
    .from('truck_events').select('*', { count: 'exact', head: true }).eq('truck_id', TRUCK_ID)
  line(`DONE — truck_events for this truck now: ${finalCount} (was ${evCount}; should match)`)
}

main().catch((e) => { console.error('\n🔴 script crashed:', e); process.exit(1) })
