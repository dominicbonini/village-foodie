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
  const [{ data: staticTimes }, { data: todayEvents }] = await Promise.all([
    supabase
      .from('collection_times')
      .select('collection_time, production_slot')
      .eq('truck_id', truck.id)
      .order('collection_time', { ascending: true }),
    supabase
      .from('truck_events')
      .select('id, start_time, end_time, venue_name, event_date, van_id, paused_until, online_paused_until, last_offline_pause_at, extra_wait_mins, extra_wait_started_at, order_ready_override, show_paid_step_override')
      .eq('truck_id', truck.id)
      .eq('event_date', date)
      .neq('status', 'cancelled')
      .order('start_time', { ascending: true }),
  ])

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

    const [{ data: a }, { data: d }] = await Promise.all([activeOrdersQuery, doneOrdersQuery])
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
        .select('order_key, kind, channel, amount_minor, state, external_ref')
        .in('order_key', visibleKeys)
      if (payErr) {
        // Non-blocking: the dashboard must render. An empty map makes every order read 'unpaid', which
        // is visibly wrong rather than silently wrong, and it self-heals on the next poll.
        console.error('[dashboard] order_payments fetch failed — cards will read unpaid this poll:', payErr.message)
      } else {
        for (const r of payRows ?? []) {
          ;(payments[r.order_key] ||= []).push(r)
        }
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

  const [{ data: categories }, { data: menuItemsForMap }] = await Promise.all([
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
      const { data: van } = await supabase
        .from('truck_vans')
        .select('kitchen_capacity, capacity_window_mins, name, auto_pause_on_offline, show_cooking_step, order_ready_enabled')
        .eq('id', capacityEvent.van_id)
        .single()
      kitchenCapacity = van?.kitchen_capacity ?? null
      capacityWindowMins = van?.capacity_window_mins ?? 5
      activeVanName = van?.name ?? null
      vanAutoPause = van?.auto_pause_on_offline ?? false   // van offline-protection DEFAULT (toggle label)
      vanShowCookingStep = van?.show_cooking_step ?? false
      // event override ?? van global default ?? false (mirrors the offline ?? chain).
      vanOrderReadyDefault = van?.order_ready_enabled ?? false
      effectiveOrderReady = (capacityEvent as any)?.order_ready_override ?? vanOrderReadyDefault
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
      const { data: session } = await supabase
        .from('demo_sessions').select('*').eq('truck_id', truck.id).maybeSingle()
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
    vanPausedUntil: eventPausedUntil,            // event-scoped (key kept for the client)
    vanOnlinePausedUntil: eventOnlinePausedUntil, // event-scoped (key kept for the client)
    lastOfflinePauseAt: eventLastOfflinePauseAt, // durable offline-pause marker (popup trigger)
    offlinePauseEventId: selectedEventId,         // the event the marker belongs to (ack key)
    orders:  orders || [],
    payments,                                       // order_key → order_payments rows (V9.4) → getOrderBalance
    slots:   slotsWithCapacity,
    productionSlotUnits: dashProductionSlotUnits,   // raw occupancy → offline client re-runs the engine (Piece 1)
    capacityBreaches,                               // Piece 2 — slots genuinely over a ceiling (reconnect flag)
    date,
    categoryOrder,
    itemCategoryMap,
    catConfigs,   // per-category prep_secs/batch_size (+ countsToCapacity) → card amber + the offline capacity re-run
  })
}