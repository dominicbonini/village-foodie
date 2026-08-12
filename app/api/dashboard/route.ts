// app/api/dashboard/route.ts
// Returns live orders for a truck dashboard session
// Verified by dashboard_token + PIN

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { resolveActor } from '@/lib/audit/actor'
import { resolveTruckLogo } from '@/lib/truck-logo'
import { getProductionSlotUnits } from '@/lib/slot-bookings'
import { buildSlotAvailability } from '@/lib/slot-availability'
import { buildSlotIndicators } from '@/lib/slot-display'
import { detectCapacityBreaches, type CapacityBreach } from '@/lib/capacity-breach'
import { generateCollectionTimes } from '@/lib/slot-generation'
import type { CatConfig } from '@/lib/prep-utils'
import { isDemoIdentifier } from '@/lib/demo'
import { resolveBuzzerPrompt, BUZZER_IN_USE_STATUS_SET } from '@/lib/buzzer'
// Type-only would not work here: LEDGER_ROW_COLUMNS is a VALUE. This route is server-only, so pulling
// the module in carries no browser-bundle cost (the concern noted at the top of lib/payments/ledger.ts).
import { LEDGER_ROW_COLUMNS } from '@/lib/payments/ledger'

// ── THE TRUCK PROJECTION — SPREAD-AND-REDACT, NOT A HAND-PICKED INCLUDE LIST (V9.4) ─────────────────
// 🔴 THIS INVERTS A FAILURE MODE THAT HAS NOW BITTEN THREE TIMES.
// This response's `truck` object used to be a hand-maintained list of ~20 fields. A `trucks.*` column
// the dashboard reads but nobody remembered to add arrived `undefined` and SILENTLY fell back to its
// default — breaking a feature with no error anywhere. Members: `sound_config` (V8.9),
// `keep_screen_on` (V9.0), `show_paid_step` (V9.4). The class was documented three times, swept, and
// declared closed — and the very next field added reopened it, four lines below a comment warning about
// exactly this.
//
// An INCLUDE list fails by OMISSION, which is silent and breaks things.
// A REDACT list fails by LEAKAGE, which is visible, harmless to the operator's own dashboard, and
// catchable. So: spread the row and remove what must not travel.
//
// ⚠️ TWO LAYERS, deliberately. The explicit set below is the known list. `SECRETISH` is defence in depth
// for columns nobody in this repo references: `trucks` predates supabase/migrations/, so its full column
// list CANNOT be derived from this codebase (lib/delete-truck.ts:9-10 makes the same point). Two known
// examples — `messenger_page_token` and `kds_pin` — exist on the table and appear NOWHERE in the code.
// The pattern is segment-anchored so it catches `api_key` / `page_token` / `kds_pin` without catching an
// innocent field that merely contains those letters.
const TRUCK_REDACT = new Set([
  'dashboard_token',      // the bearer credential for this whole surface; the client already has it from
                          // the URL, so sending it again only widens where it can be logged or cached
  'dashboard_pin',        // auth secret
  'kds_pin',              // auth secret (exists on the table; unreferenced anywhere in this repo)
  'messenger_page_token', // Meta provider credential (ditto — exists, unreferenced here)
  'whatsapp_sender',      // provider-linked sender config. NOT proven sensitive — it reaches customers in
                          // confirmation emails — but no dashboard client reads it, so redacted by default
  'sheet_id',             // dead legacy Google Sheets id (NOT NULL, no default — see provision-truck)
])
/** Segment-anchored: matches dashboard_pin / page_token / api_key / *_secret, not "shipping"/"keyboard". */
const SECRETISH = /(^|_)(token|secret|password|credential|pin|key)(_|$)/i

function publicTruckFields(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(row ?? {})) {
    if (TRUCK_REDACT.has(k) || SECRETISH.test(k)) continue
    out[k] = v
  }
  return out
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const pin   = req.nextUrl.searchParams.get('pin')
  const vanId = req.nextUrl.searchParams.get('van_id')
  const date  = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0]
  const eventIdParam = req.nextUrl.searchParams.get('event_id')

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 })
  }

  // Find truck by token — select('*') avoids 401 errors from missing columns
  const { data: truck, error } = await supabase
    .from('trucks')
    .select('*')
    .eq('dashboard_token', token)
    .single()

  if (error || !truck) {
    console.error('[dashboard] truck lookup failed:', error?.message, error?.details)
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // ── DEMO: NO automatic event roll here. Deliberately. ───────────────────────────────────────────
  // This used to call rollDemoEventIfStale on every dashboard load, shifting an elapsed demo window
  // forward so the demo "self-healed". That is gone, along with lib/demo-event-refresh.ts, because the
  // healing was worse than the illness:
  //   • it wrote order slots directly, bypassing the seeder, and clamped overshoots onto the final slot
  //     — 15 orders landed on 23:59, breaching the per-slot mains ceiling the seeder guarantees;
  //   • it preserved the old distribution, so a compressed board rolled forward compressed forever;
  //   • it shifted the VISITOR'S OWN test order too — one placed at 23:40 reappeared at 09:45 the next
  //     morning, indistinguishable from a seeded one.
  // An elapsed demo now ENDS, visibly, and the dashboard offers "Start a new service"
  // (app/api/demo/restart → lib/demo-restart.ts), which wipes the old service and seeds a fresh board.
  // Orders from a previous service are not real and must not carry over; a real truck's yesterday
  // tickets don't either.

  // If there's a logged-in user, verify they own this truck.
  // The resolution itself now lives in lib/audit/actor.ts, shared with /api/dashboard/action (which used
  // to discard identity entirely). Behaviour here is unchanged: same cookie-then-Bearer order, same
  // operators → is_admin → truck_users cascade, same values, same 403 — the helper reports
  // `foreignOperator` and THIS route still makes the authorisation decision. The helper never refuses.
  const actor = await resolveActor(req, supabase, truck)
  if (actor.foreignOperator) {
    // User has an operator account for a different truck → deny
    return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  }
  // No operator record + no truck_users → token-only access (KDS/anonymous), userRole stays null
  const currentUserName = actor.currentUserName
  const userRole = actor.userRole

  // Check PIN if set
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) {
    return NextResponse.json({ error: 'Invalid PIN', requiresPin: true }, { status: 401 })
  }

  // Resolve the dashboard event context BEFORE reading orders, so the order lists
  // can be scoped to the selected event (V6.4: orders belong to an event, never a
  // pooled date). collection_times is fetched alongside (retained as-is).
  const [
    { data: staticTimes, error: timesErr },
    { data: todayEvents, error: eventsErr },
  ] = await Promise.all([
    supabase
      .from('collection_times')
      .select('collection_time, production_slot')
      .eq('truck_id', truck.id)
      .order('collection_time', { ascending: true }),
    supabase
      .from('truck_events')
      // ⚠️ NAMED SELECT — every column here must exist or PostgREST returns 42703 and the WHOLE
      // statement fails, which lands on the silent-empty-board path documented directly below.
      // `buzzer_prompt` is added by supabase/migrations/20260803_buzzer_settings.sql: apply it BEFORE
      // deploying this build.
      // 🔴 `completion_presses_override` added 10 August 2026 — apply
      // supabase/migrations/20260810_truck_events_completion_presses_override.sql BEFORE deploying this
      // build, exactly as the `buzzer_prompt` note above requires. The consequence of the wrong order is
      // the silent-empty-board path documented immediately below, not a visible error.
      .select('id, start_time, end_time, venue_name, event_date, van_id, paused_until, online_paused_until, last_offline_pause_at, extra_wait_mins, extra_wait_started_at, order_ready_override, show_paid_step_override, takes_cash_override, completion_presses_override, buzzer_prompt')
      .eq('truck_id', truck.id)
      .eq('event_date', date)
      .neq('status', 'cancelled')
      .order('start_time', { ascending: true }),
  ])

  // ── 🔴 THE EVENTS QUERY MUST NEVER FAIL SILENTLY (V9.5) ───────────────────────────────────────────
  // This destructure used to drop its error, and that single omission produced the worst failure this
  // route has had: a NAMED select here (unlike orders/trucks, which use select('*')) referenced two
  // columns whose migration had not been applied, PostgREST returned 42703, `todayEvents` came back
  // null, every selectedEventId branch below requires it non-null, the orders block never ran, and the
  // route returned **HTTP 200 with `orders: []`**. An empty board is a SUPPORTED state here (no event
  // selected ⇒ nothing to show), so the bug wore the disguise of normal behaviour — no error, no failed
  // request, nothing in any log. It took a full read of the route to find.
  //
  // ⚠️ WE LOG, WE DO NOT 500. An empty board with a loud log is recoverable: the operator can see
  // something is wrong and report it, and the next poll self-heals once the cause is fixed. A 500 takes
  // the dashboard down entirely, and an operator mid-service is worse off with a dead page than with a
  // visibly empty one. That is a deliberate choice, not an oversight — do not "harden" it into a throw.
  if (eventsErr) {
    console.error(
      `[dashboard] EVENTS QUERY FAILED for truck ${truck.id} on ${date} — the board will render EMPTY ` +
      `(no event resolves, so the orders query is skipped entirely and the response is a 200 with ` +
      `orders: []). If this names a column, its migration has not been applied:`, eventsErr.message,
    )
  }
  if (timesErr) {
    // Lower stakes: only the production_window_key map is built from this, so slots fall back to their
    // own collection_time as the key. Day-load dots may read against the wrong key, not disappear.
    console.error('[dashboard] collection_times fetch failed — slot window keys fall back to collection_time:', timesErr.message)
  }

  // Use first event for slot generation (if truck has multiple same-day events,
  // the client will select one and re-fetch; first is the best default)
  const todayEvent = (todayEvents && todayEvents.length > 0) ? todayEvents[0] : null

  // Event-scoped projection (re-key fix): project the CLIENT-SELECTED event's un-pooled
  // usage. The single-event-on-date case is a FALLBACK only; warn on an ambiguous date
  // so a two-same-date-event truck never silently projects the wrong event.
  let selectedEventId: string | null = null
  if (eventIdParam && todayEvents?.some(e => e.id === eventIdParam)) {
    selectedEventId = eventIdParam
  } else if (todayEvents && todayEvents.length === 1) {
    selectedEventId = todayEvents[0].id
  } else if ((todayEvents?.length ?? 0) > 1) {
    console.warn(`[dashboard] ${todayEvents!.length} events on ${date} for truck ${truck.id} and no valid event_id param — projecting first (${todayEvents![0].id})`)
    selectedEventId = todayEvents![0].id
  }

  // The selected event row (matches selectedEventId and the production-units read).
  // On a multi-event-same-date day this differs from todayEvents[0] — slot times,
  // boundaries, capacity and units must ALL describe this one event, or the dots
  // would be drawn against the wrong event's window.
  const selectedEvent = todayEvents?.find(e => e.id === selectedEventId) ?? todayEvent

  // In-flight orders: no date filter — covers pre-orders AND orders that moved to cooking/ready
  // before event_date ticks over (timezone edges, near-midnight walk-ups, etc.)
  const ACTIVE_STATUSES = ['pending', 'confirmed', 'modified', 'cooking', 'ready']
  // Terminal orders shown alongside the active list for the same event.
  const DONE_STATUSES = ['collected', 'rejected', 'cancelled']

  // Orders are strictly event-scoped (no event_date+van_id fallback): with no
  // selected event there is nothing to show (Section 5 — empty dashboard).
  let activeOrders: any[] = []
  let doneToday: any[] = []
  /** order_key → its order_payments rows. Fed straight into getOrderBalance client-side. */
  const payments: Record<string, any[]> = {}
  /** order_keys whose money write is on record as having FAILED. Paired client-side with the live
   *  balance by hasUnrecordedPayment() — see the query below for why both halves are required. */
  const paymentFailures = new Set<string>()

  // ── 🔴 THE OPERATOR'S STRIPE FACTS — ONE READ, TWO CONSUMERS, HOISTED TO HERE ────────────────────
  // Read BEFORE the orders block because the payments map below needs `stripe_account_livemode` to stamp
  // `account_is_test` onto test-online rows, and the card-payments control further down needs
  // `stripe_charges_enabled`. Both come off the same row, so this is ONE query, not two — it simply used
  // to sit lower in the file, when only the second consumer existed.
  //
  // 🔴 A SEPARATE QUERY, NEVER AN `operators(...)` EMBED ON THE TRUCK READ ABOVE, and for the reason this
  // route already learned the hard way: a named select that cannot resolve fails the WHOLE statement with
  // 42703, and the truck read is the one whose silent-empty-board incident is documented below. Isolated,
  // the worst case is that both values stay at their safe defaults.
  //
  // ⚠️ `trucks.operator_id` IS NULLABLE — a demo or token-only truck has none. A CHECKED PRECONDITION,
  // not a null-deref: no operator ⇒ not ready and not a test account, which is correct for both consumers.
  // ⚠️ 🔴 DEPLOY-COUPLED: this is a NAMED select and `stripe_account_livemode` must exist before this
  // build ships — see supabase/migrations/20260811_operators_stripe_account_livemode.sql.
  // ⚠️ `accountLivemode` stays `null` unless the column says otherwise. NULL means NO CONNECTED ACCOUNT
  // and must never be read as either mode; the consumer tests `=== false`, never `!== true`.
  const operatorStripe: { chargesEnabled: boolean; accountLivemode: boolean | null } =
    { chargesEnabled: false, accountLivemode: null }
  if (truck.operator_id) {
    const { data: op, error: opErr } = await supabase
      .from('operators')
      .select('stripe_charges_enabled, stripe_account_livemode')
      .eq('id', truck.operator_id)
      .maybeSingle()
    if (opErr) {
      console.error('[dashboard] operator stripe lookup failed — card control hidden, test rows stay excluded:', opErr.message)
    }
    operatorStripe.chargesEnabled = op?.stripe_charges_enabled === true
    operatorStripe.accountLivemode =
      typeof op?.stripe_account_livemode === 'boolean' ? op.stripe_account_livemode : null
  }
  const stripeAccountLivemode = operatorStripe.accountLivemode

  if (selectedEventId) {
    let activeOrdersQuery = supabase
      .from('orders')
      .select('*')
      .eq('truck_id', truck.id)
      .eq('event_id', selectedEventId)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: true })

    let doneOrdersQuery = supabase
      .from('orders')
      .select('*')
      .eq('truck_id', truck.id)
      .eq('event_id', selectedEventId)
      .in('status', DONE_STATUSES)
      .order('created_at', { ascending: true })

    // Van KDS: show orders for this van OR unassigned orders (van_id null appears on all vans)
    if (vanId) {
      activeOrdersQuery = activeOrdersQuery.or(`van_id.eq.${vanId},van_id.is.null`)
      doneOrdersQuery   = doneOrdersQuery.or(`van_id.eq.${vanId},van_id.is.null`)
    }

    const [{ data: a, error: activeErr }, { data: d, error: doneErr }] = await Promise.all([activeOrdersQuery, doneOrdersQuery])
    // Same class as the events query above: a failure here yields null → `|| []` → a silently empty
    // board. These use select('*') so they cannot 42703 on a missing column, but an RLS change, a bad
    // `.or()` van filter or a connection fault would all land here unannounced. Log, do not throw —
    // rendering the half that succeeded beats losing the page.
    if (activeErr) console.error(`[dashboard] ACTIVE ORDERS query failed for event ${selectedEventId} — the live board will render EMPTY:`, activeErr.message)
    if (doneErr)   console.error(`[dashboard] DONE ORDERS query failed for event ${selectedEventId} — the collected/cancelled list will render EMPTY:`, doneErr.message)
    activeOrders = a || []
    doneToday = d || []

    // ── PAYMENT LEDGER ROWS FOR THE VISIBLE ORDERS (V9.4) ──────────────────────────────────────────
    // The card derives its paid/part-paid/balance state from getOrderBalance(order, rows) — the SAME
    // pure function the server rollup uses — so the two can never disagree. That needs the ledger rows
    // client-side, and orders.select('*') carries only the DERIVED CACHES (payment_status, amount_paid).
    // Recomputing a balance from those caches in the component would be a second derivation of payment
    // state, which is exactly what lib/payments/ledger.ts exists to prevent. So the rows ride along here:
    // one extra query per dashboard load, keyed on the orders we just fetched, grouped by order_key.
    // Additive to the response — existing consumers are unaffected by a new field.
    const visibleKeys = [...activeOrders, ...doneToday].map(o => o.order_key).filter(Boolean)
    if (visibleKeys.length) {
      const { data: payRows, error: payErr } = await supabase
        .from('order_payments')
        // The shared LEDGER_ROW_COLUMNS list, so this select can never drift out of step with what
        // getOrderBalance expects to receive. `order_key` (which this route groups by) and `livemode`
        // both ride in that list — do NOT re-add `order_key` here, it would be selected twice.
        .select(LEDGER_ROW_COLUMNS)
        .in('order_key', visibleKeys)
        // 🔴 TEST ROWS DO NOT LEAVE THE DATABASE — EXCEPT THE ONES A TEST ACCOUNT PRODUCED. This response
        // is the ONLY route by which payment rows reach a browser — the operator's dashboard, the KDS, and
        // through mapOrderToTicket the printed kitchen ticket.
        // ⚠️ 11 August 2026: this filter is WIDENED, not removed. The first disjunct IS the old filter,
        // character for character, so every row that reached a browser yesterday still does. The second
        // additionally admits Stripe test rows — and only for an operator whose connected account is
        // ITSELF a test account, which is decided below, not here. Fetching is not counting: isLiveRow
        // still makes the final call, so a widened fetch cannot on its own put money on a screen.
        .or('livemode.eq.true,and(livemode.eq.false,channel.eq.online)')
      if (payErr) {
        // Non-blocking: the dashboard must render. An empty map makes every order read 'unpaid', which
        // is visibly wrong rather than silently wrong, and it self-heals on the next poll.
        console.error('[dashboard] order_payments fetch failed — cards will read unpaid this poll:', payErr.message)
      } else {
        // ── 🔴 STAMP `account_is_test` SO isLiveRow'S ARM (b) CAN DECIDE, CLIENT-SIDE ────────────────
        // The rows go straight to the browser and are fed to getOrderBalance there, so the account mode
        // has to travel WITH them — the client cannot look it up. One boolean, resolved once for this
        // truck's operator, applied to the rows it applies to.
        // ⚠️ `=== false` AND NOT `!== true`. NULL means the operator has NO connected Stripe account, and
        // must contribute nothing here — otherwise every truck that never connected Stripe would start
        // admitting test rows on the strength of a column that was never set.
        // ⚠️ `stripeAccountLivemode` is resolved further down this route, alongside stripe_charges_enabled,
        // from the SAME operators read — no extra query.
        const accountIsTest = stripeAccountLivemode === false
        for (const r of payRows ?? []) {
          // Only a TEST-ONLINE row is ever annotated. A livemode:true row is pushed untouched, so its
          // path through isLiveRow is byte-identical to before.
          const row = (accountIsTest && r.livemode === false && r.channel === 'online')
            ? { ...r, account_is_test: true }
            : r
          ;(payments[r.order_key] ||= []).push(row)
        }
      }

      // ── ORDERS WHOSE MONEY WRITE FAILED (paymentWarning, made visible) ─────────────────────────────
      // 🔴 THE PROVENANCE HALF OF THE MARKER, AND IT IS ALREADY IN THE DATABASE. 'collected',
      // 'mark_paid' and the walk-up paid-at-order path all fail OPEN on the ledger write and all record
      // `ledger_failed: <bool>` in their audit after_state. That flag was written from day one and read
      // by nothing; this query is what turns it into something an operator can see.
      //
      // WHY THE AUDIT LOG AND NOT A NEW COLUMN: it needs no migration, it is append-only (so the fact
      // cannot be lost by a later write), and it is the ONLY per-order record of a failure that the
      // client can never reconstruct — see the offline case below. Paired with the live balance in
      // hasUnrecordedPayment(), it also self-clears on repair.
      //
      // 🔴 THIS IS THE ONLY THING THAT COVERS THE OFFLINE PATH. An outbox op that syncs successfully has
      // its response body DISCARDED — drainOnce does `if (res.ok) { removeOp; synced++ }` and never
      // parses it (lib/native/orderGate.ts:~267). A queued 'collected' that replays and half-fails
      // therefore produces a paymentWarning that no toast can ever show, because no client is watching
      // at the moment it arrives. The server wrote the audit row regardless, so this query sees it.
      //
      // ⚠️ NON-BLOCKING, like the payments fetch above and for the same reason: the dashboard must
      // render. On failure the set is EMPTY, which under-reports rather than inventing markers — the
      // safe direction for an alert (a false "payment missing" on a busy board destroys the signal),
      // and it self-heals on the next poll. The toast at the moment of failure is unaffected.
      // ⚠️ Scoped to the SAME visibleKeys as the payments query, so it can only ever return rows for
      // orders already on this response. Small table (163 rows live), one extra query per poll.
      const { data: failRows, error: failErr } = await supabase
        .from('action_audit_log')
        .select('order_key')
        .eq('truck_id', truck.id)
        .in('order_key', visibleKeys)
        // ->> yields TEXT, so the comparison value is the STRING 'true', not the boolean. Verified
        // against the live table before this shipped; a boolean here matches nothing and fails silent.
        .eq('after_state->>ledger_failed', 'true')
      if (failErr) {
        console.error('[dashboard] ledger-failure lookup failed — the PAYMENT NOT RECORDED marker will not render this poll:', failErr.message)
      } else {
        for (const r of failRows ?? []) if (r.order_key) paymentFailures.add(r.order_key)
      }
    }
  }

  // Dedupe by order_key (UUID) — id is the per-event display number and is NOT
  // unique across events, so keying by id would silently drop orders.
  const orderMap = new Map<string, NonNullable<typeof activeOrders>[number]>()
  ;(activeOrders || []).forEach(o => orderMap.set(o.order_key, o))
  ;(doneToday || []).forEach(o => orderMap.set(o.order_key, o))
  const orders = Array.from(orderMap.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const intervalMins = truck.collection_interval_mins ?? 0
  const slotDurationMins = truck.slot_duration_mins ?? intervalMins
  const GRACE_MINS = 30

  // Compute event boundaries (HH:MM → minutes since midnight) from the SELECTED
  // event so times agree with the selected event's production units.
  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const eventStartMins = selectedEvent?.start_time ? toMins(selectedEvent.start_time) : null
  const eventEndMins   = selectedEvent?.end_time   ? toMins(selectedEvent.end_time)   : null

  // Generate slots only from event data — no static fallback
  // WINDOW-KEY MAP: collection_time → production_slot from the static collection_times table — the
  // EXACT source the WRITE keys production_slot_usage by. Pre-resolve the per-slot window key so the
  // day-load dots (buildSlotIndicators) read the SAME key the write stored under (= timeMap[ct] || ct).
  const timeMap: Record<string, string> = {}
  ;(staticTimes ?? []).forEach(r => { timeMap[r.collection_time] = r.production_slot })
  const slots =
    (selectedEvent?.start_time && selectedEvent?.end_time && intervalMins > 0
      ? generateCollectionTimes(selectedEvent.start_time, selectedEvent.end_time, intervalMins, slotDurationMins, GRACE_MINS)
      : []
    ).map(s => ({ ...s, production_window_key: timeMap[s.collection_time] || s.collection_time }))

  const [
    { data: categories, error: catsErr },
    { data: menuItemsForMap, error: itemsErr },
  ] = await Promise.all([
    supabase
      .from('menu_categories')
      .select('id, name, prep_secs, batch_size, sort_order, counts_toward_capacity')
      .eq('truck_id', truck.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('menu_items_db')
      .select('name, category_id')
      .eq('truck_id', truck.id),
  ])

  // ⚠️ BOTH ARE NAMED SELECTS — the same 42703 exposure the events query had. A failure here does not
  // empty the board, it DEGRADES prep timing: no catConfigs ⇒ every item scores 0 prep secs and nothing
  // counts toward capacity, and no item→category map ⇒ items group under the fallback. Wrong numbers on
  // a board that still looks right is precisely the failure mode worth logging.
  if (catsErr)  console.error('[dashboard] menu_categories fetch failed — prep secs read 0 and NOTHING counts toward capacity this poll:', catsErr.message)
  if (itemsErr) console.error('[dashboard] menu_items_db fetch failed — items cannot be mapped to categories this poll:', itemsErr.message)

  const catConfigs: Record<string, CatConfig> = {}
  ;(categories || []).forEach(c => {
    catConfigs[c.name.toLowerCase()] = {
      secs: c.prep_secs || 0,
      batch: c.batch_size || 1,
      countsToCapacity: !!c.counts_toward_capacity,
    }
  })

  const categoryOrder = (categories || []).map(c => c.name)
  const catById: Record<string, string> = Object.fromEntries(
    (categories || []).map(c => [c.id, c.name])
  )
  const itemCategoryMap: Record<string, string> = {}
  ;(menuItemsForMap || []).forEach(item => {
    if (item.category_id && catById[item.category_id]) {
      itemCategoryMap[item.name] = catById[item.category_id]
    }
  })

  let slotsWithCapacity: {
    collection_time: string
    production_slot: string
    production_window_key: string
    current_orders: number
    max_orders: number
    available: boolean
    is_past: boolean
    is_grace: boolean
    tone?: 'green' | 'amber' | 'red'
    label?: string
  }[] = []

  // PIECE 2 — reconnect capacity-exceeded flag (detection only). Populated inside the slot try
  // below by READING the same engine output (§31). Empty on error / no event.
  let capacityBreaches: CapacityBreach[] = []

  // Hoisted so they can be returned for the dashboard's capacity card (single source —
  // the client used to read truck_vans directly with the anon key, which RLS blocked).
  let kitchenCapacity: number | null = null
  let capacityWindowMins = 5
  // Raw oven occupancy (production_slot → qty-by-cat) — the EXACT input buildSlotIndicators/buildSlotAvailability
  // consume. Returned so the NATIVE client can re-run the SAME engine OFFLINE with its optimistic orders folded
  // in (offline-aware capacity, Piece 1). Response-only addition — the online slots computation is unchanged.
  let dashProductionSlotUnits: Record<string, Record<string, number>> = {}
  let activeVanName: string | null = null
  // The selected event's van offline-protection DEFAULT (Settings value). The dashboard
  // shows this when there's no per-event override — without it the client's vanAutoPause
  // stays hardcoded false and misreports the toggle/label.
  let vanAutoPause: boolean = false
  // The selected event's van "show cooking step" preference (Settings value). The KDS cook
  // view gates the "Start cooking" button on this — without it the KDS never loads the
  // setting and the cook step shows regardless of the toggle. Defaults off (matches the
  // Settings toggle's default) when the van has no value.
  let vanShowCookingStep: boolean = false
  // Buzzers: the VAN's rack size (null = this van has no buzzers → the whole feature is hidden) and
  // the RESOLVED after-order prompt for the selected event (event override ?? van-has-buzzers).
  // Resolved SERVER-SIDE by lib/buzzer.ts so the dashboard, the KDS and Add Order cannot disagree —
  // the same rule the paid step follows.
  let vanBuzzerCount: number | null = null
  let effectiveBuzzerPrompt: boolean = false
  // Order-ready (master-switch model): effectiveOrderReady = the SELECTED event's order_ready_override ??
  // the van's global default ?? false (resolved SERVER-SIDE — gates the orders-screen Ready button). Events
  // carry a concrete override (seeded at creation + bulk-set by the Settings master switch); the ?? chain
  // is the legacy-null safety net. vanOrderReadyDefault = the raw van default, still returned to the client.
  let effectiveOrderReady: boolean = false
  let vanOrderReadyDefault: boolean = false
  // Pause is now EVENT-scoped (truck_events). Sourced from the SELECTED event below and returned
  // under these (legacy-named) keys so the client computes paused state from the SAME fields the
  // customer menu checks. (Kept the key names to avoid churning the client read path.)
  const eventPausedUntil: string | null = (selectedEvent as any)?.paused_until ?? null
  const eventOnlinePausedUntil: string | null = (selectedEvent as any)?.online_paused_until ?? null
  // Durable offline-pause marker (survives the heartbeat reconnect clear). Surfaced with the
  // selected event's id so the dashboard can fire + ack the "paused while offline" popup per-event.
  const eventLastOfflinePauseAt: string | null = (selectedEvent as any)?.last_offline_pause_at ?? null

  try {
    // kitchen_capacity + name from the SELECTED event's van — the same event the
    // production-usage read and slot times are scoped to, so a multi-event-same-date
    // day shows the right event's capacity, not the date's first event.
    const capacityEvent = selectedEvent
    if (capacityEvent?.van_id) {
      const { data: van, error: vanErr } = await supabase
        .from('truck_vans')
        // ⚠️ NAMED SELECT — `buzzer_count` is added by 20260803_buzzer_settings.sql. Unlike the events
        // query above, a 42703 here is caught by `vanErr` and every consumer has a `?? <default>`, so
        // the failure degrades to "this van has no buzzers" rather than blanking the board.
        .select('kitchen_capacity, capacity_window_mins, name, auto_pause_on_offline, show_cooking_step, order_ready_enabled, buzzer_count')
        .eq('id', capacityEvent.van_id)
        .single()
      // Another NAMED select, and every consumer below has a `?? <default>` — so a failure here reads as
      // "this van has no capacity limit, no cooking step and no order-ready step", which is a plausible
      // configuration rather than a visible fault. Exactly the wrong-value-not-a-crash shape.
      if (vanErr) {
        console.error(
          `[dashboard] van ${capacityEvent.van_id} lookup failed — capacity, cooking step and order-ready ` +
          `all fall back to their defaults this poll:`, vanErr.message,
        )
      }
      kitchenCapacity = van?.kitchen_capacity ?? null
      capacityWindowMins = van?.capacity_window_mins ?? 5
      activeVanName = van?.name ?? null
      vanAutoPause = van?.auto_pause_on_offline ?? false   // van offline-protection DEFAULT (toggle label)
      vanShowCookingStep = van?.show_cooking_step ?? false
      // event override ?? van global default ?? false (mirrors the offline ?? chain).
      vanOrderReadyDefault = van?.order_ready_enabled ?? false
      effectiveOrderReady = (capacityEvent as any)?.order_ready_override ?? vanOrderReadyDefault
      // event override ?? (this van has buzzers). Never inline — resolveBuzzerPrompt is the only place
      // this chain lives, for the same reason resolvePaidStep is.
      const rb = resolveBuzzerPrompt(van as any, capacityEvent as any)
      vanBuzzerCount = rb.buzzerCount
      effectiveBuzzerPrompt = rb.buzzerPrompt
    }
    const productionSlotUnits = selectedEventId
      ? await getProductionSlotUnits(supabase, truck.id, selectedEventId)
      : {}
    dashProductionSlotUnits = productionSlotUnits   // surface the raw occupancy for the offline client re-run
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
    // For the truck: don't show slots before event start (use eventStartMins as minimum)
    const earliestMins = eventStartMins !== null ? eventStartMins : nowMins
    // Per-slot per-category composition wording ("2 Pizzas, 1 Other") — the SAME buildSlotIndicators
    // the Add Order / Edit dots use (identical backward projection), surfaced so the day-load strip
    // can show the dots' wording on desktop instead of the opaque current_orders/max_orders ratio.
    // No new capacity formula — reuses the dots' own function with the menu category order.
    const dayIndicators = buildSlotIndicators(
      slots || [],
      productionSlotUnits,
      catConfigs,
      kitchenCapacity,
      eventStartMins ?? 0,
      categoryOrder,
      capacityWindowMins,
    )
    slotsWithCapacity = buildSlotAvailability({
      times: slots || [],
      productionSlotUnits,
      catConfigs,
      kitchenCapacity,
      capacityWindowMins,
      date,
      nowMins,
      earliestCollectionMins: earliestMins,
      eventStartMins: eventStartMins ?? 0,
      eventEndMins: eventEndMins ?? undefined,
    }).map(s => ({
      collection_time: s.collection_time,
      production_slot: s.production_slot,
      production_window_key: s.production_window_key,
      current_orders: s.current_orders,
      max_orders: s.max_orders,
      available: s.available,
      is_past: s.is_past,
      is_grace: s.is_grace,
      // The day-load strip's tone + label reflect the FULL collection-slot total. buildSlotIndicators
      // reads production_slot_usage by the WINDOW key (production_window_key = timeMap[ct] || ct — the
      // EXACT key the write stores under), so on a windowed truck the strip matches the real load instead
      // of showing green. Falls back to buildSlotAvailability's tone only if the indicator is missing.
      // buildSlotAvailability's own tone/available (customer-facing) is unchanged.
      tone: dayIndicators.get(s.collection_time)?.tone ?? s.tone,
      label: dayIndicators.get(s.collection_time)?.label ?? '',
    }))

    // PIECE 2 — after the (post-rebuild) authoritative production_slot_usage is read above, detect
    // collection slots GENUINELY OVER a ceiling by re-reading the SAME engine output (no new math,
    // no engine change). Strictly-over only (raw remainingTotal/remainingByCat < 0), so legitimately
    // full slots don't cry wolf. The client surfaces a dismissible "N slot(s) over capacity" banner.
    capacityBreaches = detectCapacityBreaches({
      times: slots || [],
      productionSlotUnits,
      catConfigs,
      kitchenCapacity,
      eventStartMins: eventStartMins ?? 0,
      capacityWindowMins,
      orders: (orders || []) as any,
    })
  } catch (slotErr) {
    console.error('[dashboard] slot capacity error:', slotErr)
    slotsWithCapacity = (slots || []).map(s => ({
      collection_time: s.collection_time,
      production_slot: s.production_slot,
      production_window_key: s.production_window_key,
      current_orders: 0,
      max_orders: 999,
      available: true,
      is_past: false,
      is_grace: false,
      tone: 'green' as const,
      label: '',
    }))
  }

  // Header logo: operator upload → Village Foodie discovery fallback (shared resolver, Section 14/27).
  const truckLogo = await resolveTruckLogo(supabase, truck.id, truck.logo_storage_path)

  // ── DEMO SESSION BLOCK ───────────────────────────────────────────────────────────────────────────
  // Server-side facts the client otherwise has no durable way to know. Each of the three currently has
  // a client-side stand-in that loses the answer the moment the context changes:
  //   • extraction_source — the sample/upload signal. It replaced the ?welcome=sample URL param, which was
  //     gone after one reload, so a reloaded sample demo started claiming to be "your menu".
  //   • email / expires_at — localStorage-keyed, so they don't survive a different device.
  // One block closes all three; only the first is consumed in this diff.
  //
  // 🔴 DEMO ONLY. Gated on the resolved truck id, so for an operator truck this runs no query and the
  // `demo` key is ABSENT from the response — see the spread at the return.
  //
  // NULLS, NOT OMISSION, when there is no session row: an absent key means "not a demo", a present key
  // with nulls means "a demo whose session we couldn't read". Collapsing those would make the client
  // guess.
  //
  // ⚠️ select('*') and a try/catch, deliberately — NOT a named column list. `extraction_source` is
  // written by lib/provision-demo.ts:314 but has NO migration in supabase/migrations (see the report).
  // If the column is missing in an environment, a named select would 400 the whole dashboard; `*`
  // returns whatever exists and the field simply reads undefined → null. Same best-effort posture as
  // every other demo_sessions access (lib/demo-session.ts).
  let demo: { extraction_source: string | null; email: string | null; expires_at: string | null } | null = null
  if (isDemoIdentifier(truck.id)) {
    demo = { extraction_source: null, email: null, expires_at: null }
    try {
      const { data: session, error: sessionErr } = await supabase
        .from('demo_sessions').select('*').eq('truck_id', truck.id).maybeSingle()
      // The try/catch below only catches a THROWN error; PostgREST RETURNS its errors, so without this
      // check a failed read is indistinguishable from "no demo session row" and silently keeps the
      // all-nulls block. Demo-only, so the stakes are low — but it is the same omission.
      if (sessionErr) {
        console.warn('[dashboard] demo session read failed — demo fields stay null:', sessionErr.message)
      }
      if (session) {
        demo = {
          extraction_source: (session.extraction_source as string | null) ?? null,
          email:             (session.email as string | null) ?? null,
          expires_at:        (session.expires_at as string | null) ?? null,
        }
      }
    } catch (e) {
      // Keep the all-nulls block rather than dropping the key — the client's contract is "key present ⇒
      // demo", and a read failure must not read as "not a demo".
      console.warn('[dashboard] demo session read failed:', e instanceof Error ? e.message : e)
    }
  }

  // ── ⚠️ TEMPORARY — CARD-PAYMENT READINESS FOR THE ONLINE-PAYMENTS SWITCH ────────────────────────
  // Delete this block with the switch (supabase/migrations/20260811_trucks_online_payments_paused_at.sql
  // carries the removal list). It exists so Settings can HIDE a control for a capability the truck does
  // not have — Pizzeria Gusto has no Stripe account and was being shown the switch anyway.
  //
  // 🔴 THE SAME SHAPE AS app/api/menu/[truckId]/route.ts:663-674, AND FOR THE SAME REASON: a SEPARATE
  // query, never an `operators(...)` embed on the truck read above. A named select that cannot resolve
  // fails the WHOLE statement with 42703 — and the truck read is the one this route's silent-empty-board
  // incident came from. Isolated, the worst case is `false`, which hides a control. That is the safe
  // direction: it can never hide the way OUT of a pause, because the client's gate has a second arm on
  // `online_payments_paused_at` for exactly that case.
  //
  // ⚠️ `trucks.operator_id` IS NULLABLE — a demo or token-only truck has none. That is a CHECKED
  // PRECONDITION, not a null-deref: no operator ⇒ not ready ⇒ the control is hidden, which is correct.
  // ⚠️ THIS IS A RENDERING INPUT, NEVER A GATE. Both money gates re-read readiness server-side
  // (/api/menu and lib/payments/authorize). A stale `true` here can only show a switch, never take a payment.
  // ⚠️ THE READ ITSELF WAS HOISTED ABOVE THE ORDERS BLOCK on 11 August 2026, because the payments map
  // needs `stripe_account_livemode` from the SAME row and is built earlier in this route. It is still
  // ONE query; only its position moved. This block now just consumes what that read produced.
  const stripeChargesEnabled = operatorStripe.chargesEnabled

  return NextResponse.json({
    currentUserName,
    userRole,
    // Conditional SPREAD, not `demo: demo` — for an operator truck `demo` is null and the key is absent
    // entirely, so the response object is byte-for-byte what it was. See the report for how that is
    // verified rather than assumed.
    ...(demo ? { demo } : {}),
    truck: {
      // EVERY non-redacted column, so a new trucks.* setting is delivered WITHOUT anyone remembering to
      // add it here. See publicTruckFields above for why this is a redact list and not an include list.
      ...publicTruckFields(truck),

      // ── DELIBERATE OVERRIDES — these are NOT the raw column values, and must stay AFTER the spread ──
      // Pause + extra-wait are EVENT-scoped now — sourced from the selected event, not the truck.
      // (Legacy trucks.* columns left unread; the badge reads these via the response.)
      paused_until:        null,
      extra_wait_mins:     (selectedEvent as any)?.extra_wait_mins ?? 0,
      extra_wait_started_at: (selectedEvent as any)?.extra_wait_started_at ?? null,
      logo: truckLogo,                                            // resolved URL, not the stored path

      // ── SAFE-DEFAULT COERCIONS — preserved verbatim from the old map ──────────────────────────────
      // The spread alone would deliver a NULL column as null; these keep the exact semantics the client
      // has always seen. notes_require_review in particular is safe-by-default (undefined/null ⇒ ON).
      auto_accept:          truck.auto_accept ?? false,
      notes_require_review: truck.notes_require_review ?? true,
      kds_mode:             truck.kds_mode ?? false,
      crew_mode:            truck.crew_mode ?? 'solo',
      display_mode:        (truck.display_mode ?? 'list') as 'list' | 'grid',
      plan:                (truck.plan ?? 'starter') as 'starter' | 'pro' | 'max' | 'trial',
      trial_expires_at:     truck.trial_expires_at ?? null,
      feature_overrides:   (truck.feature_overrides ?? null) as Record<string, boolean> | null,
      qr_code_style:       (truck.qr_code_style ?? 'standard') as 'standard' | 'branded',
      truck_emoji:          truck.truck_emoji ?? null,
      slug:                 truck.slug ?? null,
      sound_config:         truck.sound_config ?? null,
      show_paid_step:       truck.show_paid_step ?? false,        // V9.4 — the third member of the class
      // ⚠️ TEMPORARY — NOT a trucks column. Resolved above from operators.stripe_charges_enabled, and
      // placed here (in the truck object, after the spread) because that is where the customer menu API
      // puts its equivalent `card_payments_ready`. Delete with the switch.
      stripe_charges_enabled: stripeChargesEnabled,
    },
    todayEvent: todayEvent
      ? { id: todayEvent.id, event_date: todayEvent.event_date, start_time: todayEvent.start_time, end_time: todayEvent.end_time, venue_name: todayEvent.venue_name ?? null }
      : null,
    // Authoritative van capacity + name (service-role read above) for the capacity card —
    // replaces the RLS-blocked anon truck_vans read the client used to do.
    kitchenCapacity,
    capacityWindowMins,
    activeVanName,
    vanAutoPause,
    vanShowCookingStep,
    effectiveOrderReady,                          // event override ?? van default ?? false (gates the Ready button)
    vanOrderReadyDefault,                          // raw van default (seed for new events; the Settings master switch)
    vanBuzzerCount,                                // truck_vans.buzzer_count — null ⇒ no buzzers, feature hidden
    effectiveBuzzerPrompt,                         // event override ?? van-has-buzzers (opens the grid after a new order)
    vanPausedUntil: eventPausedUntil,            // event-scoped (key kept for the client)
    vanOnlinePausedUntil: eventOnlinePausedUntil, // event-scoped (key kept for the client)
    lastOfflinePauseAt: eventLastOfflinePauseAt, // durable offline-pause marker (popup trigger)
    offlinePauseEventId: selectedEventId,         // the event the marker belongs to (ack key)
    orders:  orders || [],
    payments,                                       // order_key → order_payments rows (V9.4) → getOrderBalance
    paymentFailures: [...paymentFailures],          // order_keys whose ledger write failed → hasUnrecordedPayment
    slots:   slotsWithCapacity,
    productionSlotUnits: dashProductionSlotUnits,   // raw occupancy → offline client re-runs the engine (Piece 1)
    capacityBreaches,                               // Piece 2 — slots genuinely over a ceiling (reconnect flag)
    // ── BUZZER LOSSES (phase 2) — SERVER-COMPUTED, exactly like capacityBreaches. ────────────────
    // Orders left without a buzzer by AUTOMATIC conflict resolution on offline replay, and still open.
    // Derived from the `orders` we already fetched — no extra query. The in-use filter is the same
    // BUZZER_IN_USE_STATUS_SET the grid uses; a collected/cancelled/rejected order had already
    // released its buzzer, so there is nothing for the operator to act on and no banner.
    buzzerLosses: (orders || [])
      .filter((o: any) => o.buzzer_lost_at && o.buzzer_number == null && BUZZER_IN_USE_STATUS_SET.has(o.status ?? ''))
      .map((o: any) => ({ order_key: o.order_key, id: String(o.id), customer_name: o.customer_name ?? '', lost_at: o.buzzer_lost_at })),
    date,
    categoryOrder,
    itemCategoryMap,
    catConfigs,   // per-category prep_secs/batch_size (+ countsToCapacity) → card amber + the offline capacity re-run
  })
}