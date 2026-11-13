import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// ══ 🔴 WHEN PROTECTION STARTS (offline-start-1, 13 November 2026) ══════════════════════════════════════
// An event is protected only when it is OPEN (status='open') AND its scheduled START has passed, on the truck's own
// clock. So protection starts at the LATER of the two:
//   • opened early (auto-open the day before, or Start pressed at 14:00 for a 19:00 event) → it waits for 19:00;
//   • opened late (Start pressed at 19:05) → it starts at 19:05, because a not-open event is never protected.
// This replaces V7.0's status-only gate, which protected an event from the moment it was opened. The pause expiry is
// still an INSTANT (now + 2h). The ONE clock read is the event's start: event_date + start_time in the truck's zone —
// trucks.timezone, else its country's default_timezone (the rule of lib/truck-time.ts, which this Deno function cannot
// import, so it reads the same two columns). No zone is ever named for a truck here.

/** The UTC instant (ms) of a wall-clock date and time in `tz`. ⚠️ A COPY of lib/time-utils.ts instantOfLocal (this Deno
 *  function cannot import lib/); scripts/offline-start-1.cjs proves the two give the same instant. */
function instantOfLocal(ymd: string, time: string, tz: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  const [hh, mm, ss] = (time || '00:00').split(':').map(Number)
  const wall = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0)
  const offsetAt = (t: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(t)).map(x => [x.type, x.value]))
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t
  }
  let t = wall - offsetAt(wall)
  t = wall - offsetAt(t)
  return t
}
const validZone = (tz: unknown): tz is string => {
  if (typeof tz !== 'string' || !tz.trim()) return false
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false }
}
/** 🔴 THE GATE: is this open event at or past its scheduled start? An event with no readable start or zone keeps the
 *  old behaviour (protected while open) — better a protection that starts early than none at all. */
export function protectionStarted(ev: { event_date?: string | null; start_time?: string | null }, tz: string | null, nowMs: number): boolean {
  if (!ev.event_date || !ev.start_time || !tz) return true
  return nowMs >= instantOfLocal(ev.event_date, ev.start_time, tz)
}

Deno.serve(async () => {
  const STALE_THRESHOLD_SECONDS = 30
  const AUTO_PAUSE_DURATION_HOURS = 2
  const now = new Date()
  const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_SECONDS * 1000).toISOString()
  const autoPauseUntil = new Date(now.getTime() + AUTO_PAUSE_DURATION_HOURS * 60 * 60 * 1000).toISOString()

  // Stale active vans (heartbeat older than the threshold, or never sent). NOT pre-filtered by
  // auto_pause_on_offline — effective offline-protection is decided PER live event below
  // (event.offline_protection_override ?? van.auto_pause_on_offline).
  const { data: stalledVans, error } = await supabase
    .from('truck_vans')
    // NOTE: NAMED SELECT — `offline_protection_mode` is added by 20260818_offline_protection_mode.sql.
    // PostgREST answers 42703 for a column it cannot see and fails the WHOLE statement, which here means
    // the monitor pauses nothing at all. APPLY THAT MIGRATION BEFORE DEPLOYING THIS.
    .select('id, name, truck_id, auto_pause_on_offline, offline_protection_mode, last_heartbeat_at')
    .eq('active', true)
    .or(`last_heartbeat_at.lt.${staleThreshold},last_heartbeat_at.is.null`)

  if (error) {
    console.error('[heartbeat-monitor] stale-van query failed:', error.message)
    return new Response('error', { status: 500 })
  }

  // DIAGNOSTIC: what this run sees — the instant (UTC), the stale threshold, and every stale van it found
  // with its last heartbeat. (The gate is status-based, NOT clock-based.)
  console.log(`[heartbeat-monitor] run @ ${now.toISOString()} | staleThreshold=${staleThreshold} | staleVans=${stalledVans?.length ?? 0}`)
  for (const v of stalledVans ?? []) {
    console.log(`[heartbeat-monitor]   stale van ${v.id} (${v.name}) last_heartbeat_at=${v.last_heartbeat_at ?? 'never'}`)
  }

  if (!stalledVans || stalledVans.length === 0) {
    console.log('[heartbeat-monitor] no stale vans — nothing to pause')
    return new Response(JSON.stringify({ paused: 0 }), { headers: { 'Content-Type': 'application/json' } })
  }

  // The truck's zone, once per truck per run: trucks.timezone, else its country's default_timezone (lib/truck-time.ts's
  // rule). null when neither can be read → the gate falls back to "protected while open" (logged).
  const zoneCache = new Map<string, string | null>()
  const truckZone = async (truckId: string | null | undefined): Promise<string | null> => {
    if (!truckId) return null
    if (zoneCache.has(truckId)) return zoneCache.get(truckId)!
    let zone: string | null = null
    const { data: t } = await supabase.from('trucks').select('timezone, country').eq('id', truckId).maybeSingle()
    if (t && validZone(t.timezone)) zone = t.timezone
    else if (t?.country) {
      const { data: c } = await supabase.from('country_settings').select('default_timezone').eq('country_code', t.country).maybeSingle()
      if (c && validZone(c.default_timezone)) zone = c.default_timezone
    }
    if (!zone) console.error(`[heartbeat-monitor]   truck ${truckId}: no readable time zone — offline protection follows the open status alone`)
    zoneCache.set(truckId, zone)
    return zone
  }

  let pausedCount = 0
  for (const van of stalledVans) {
    // LIVE-REDEFINITION (V7.0): the LIVE event(s) on this van = status='open' — the operator STARTED
    // it (Start button OR auto-event-scheduler), NOT the published clock window. This (a) protects an
    // event from when it was STARTED (opened 14:00 though published 17:00) — fixing the "closed
    // laptop before the clock start, didn't pause" symptom — and (b) by CONSTRUCTION never pauses a
    // future not-yet-started event (those are status='confirmed', not 'open') — preserving the
    // over-pause guard. cancelled/closed are excluded because they aren't 'open'. No clock filter.
    const { data: liveEvents } = await supabase
      .from('truck_events')
      // NOTE: Same named-select caveat as the van query above — migration first, then deploy.
      // ── 🔴 THE EVENT'S TYPE IS EMBEDDED (October 2026) ────────────────────────────────────────
      // An event type can set offline protection, and THIS FUNCTION IS WHAT ACTS ON IT. A monitor that
      // ignored the type would pause a festival the truck had told it not to pause — the type would be
      // a setting that displays and does nothing, which is worse than not offering it.
      // ⚠️ THE EMBED IS PART OF THE SAME NAMED SELECT and carries the same caveat as the two columns
      // beside it: apply 20261009 and 20261010 BEFORE deploying this, or PostgREST answers 42703 and
      // the monitor pauses nothing at all. That is the existing instruction two lines up, unchanged.
      .select('id, online_paused_until, offline_no_autoaccept_until, offline_protection_override, offline_protection_mode_override, status, event_date, start_time, event_types!event_type_id (offline_protection, offline_protection_mode)')
      .eq('van_id', van.id)
      .eq('status', 'open')

    console.log(`[heartbeat-monitor]   van ${van.id}: ${liveEvents?.length ?? 0} open (live) event(s) — ${(liveEvents ?? []).map(e => e.id).join(', ') || 'none'}`)

    for (const ev of liveEvents || []) {
      /* The embedded type, normalised. PostgREST returns a one-row embed as an object OR an array
       * depending on how it reads the relationship, and both shapes have arrived in this codebase. */
      const embedded = (ev as { event_types?: unknown }).event_types
      const evType = (Array.isArray(embedded) ? embedded[0] : embedded) as
        { offline_protection?: boolean | null; offline_protection_mode?: string | null } | null | undefined
      // Only skip if the pause is STILL ACTIVE (expiry in the FUTURE). A non-null-but-PAST
      // online_paused_until (an expired pause that was never cleared — e.g. an offline van that
      // never reconnected, so /api/heartbeat never nulled it) is NOT a live pause: fall through and
      // re-pause. Was `if (ev.online_paused_until)` (bare non-null) → a stale past value made the
      // event permanently immune to re-pausing. The pause duration (now + 2h) ≫ the 30s cron cadence,
      // so a genuinely-active pause is always in the future here → still skipped → no re-pause spam.
      if (ev.online_paused_until && new Date(ev.online_paused_until).getTime() > now.getTime()) {
        console.log(`[heartbeat-monitor]     event ${ev.id}: SKIP — already offline-paused (until ${ev.online_paused_until}, still active)`)
        continue // still genuinely paused — leave it
      }
      // The same already-acted skip for the OTHER mode: a live no-auto-accept marker is this mode's
      // equivalent of an active pause, and re-writing it every 30s would only push its expiry forward.
      if (ev.offline_no_autoaccept_until && new Date(ev.offline_no_autoaccept_until).getTime() > now.getTime()) {
        console.log(`[heartbeat-monitor]     event ${ev.id}: SKIP — already in no-auto-accept (until ${ev.offline_no_autoaccept_until}, still active)`)
        continue
      }
      const effective = ev.offline_protection_override !== null && ev.offline_protection_override !== undefined
        ? ev.offline_protection_override
        /* 🔴 THE TYPE SITS BETWEEN THE EVENT AND THE VAN, which is the order every other reader uses:
         * event hand change ?? type ?? van default. `evType` normalises PostgREST's embed, which
         * arrives as an object or a one-element array depending on how it reads the relationship.
         * ⚠️ THIS CHAIN IS A SECOND COPY OF lib/event-types/resolve.ts's, AND IT HAS TO BE. This is a
         * Deno edge function on a different runtime; it cannot import from `lib/`, which is exactly why
         * the mode chain below was already duplicated here before event types existed. The resolver is
         * the OWNER of the order; scripts/event-types.cjs asserts this file's two expressions still
         * match it, so the copies cannot drift silently. */
        : (evType?.offline_protection ?? van.auto_pause_on_offline ?? false)
      if (!effective) {
        console.log(`[heartbeat-monitor]     event ${ev.id}: SKIP — offline protection OFF (override=${ev.offline_protection_override}, vanDefault=${van.auto_pause_on_offline})`)
        continue // offline protection off for this event → don't pause
      }
      // 🔴 OPEN BUT NOT YET AT ITS START TIME → NOT PROTECTED YET (see the header). An early-opened event waits for its
      // scheduled start; a late-opened one is already past it, so it is protected from the moment it opened.
      if (!protectionStarted(ev, await truckZone(van.truck_id), now.getTime())) {
        console.log(`[heartbeat-monitor]     event ${ev.id}: SKIP — open, but before its start (${ev.event_date} ${ev.start_time}); protection starts then`)
        continue
      }
      // -- ONE SWITCH, TWO MODES. THE SWITCH DECIDED ABOVE; THIS DECIDES WHICH WRITE. --
      // Event override ?? van default ?? 'pause' — the SAME null-means-inherit chain the switch itself
      // uses two lines up, so the two cannot resolve against different events.
      // 'pause' IS THE FALLBACK FOR EVERY UNKNOWN VALUE, including a column that does not exist yet:
      // it is what offline protection has always done, so a partial deploy behaves exactly like today.
      const modeRaw = ev.offline_protection_mode_override ?? evType?.offline_protection_mode ?? van.offline_protection_mode ?? 'pause'
      const mode = modeRaw === 'no_auto_accept' ? 'no_auto_accept' : 'pause'
      // THE TWO WRITES ARE DELIBERATELY DIFFERENT COLUMNS, AND MUST STAY SO.
      //   pause          → online_paused_until, which the CUSTOMER GATE reads. Writing it IS the pause.
      //   no_auto_accept → offline_no_autoaccept_until, which /api/orders/submit reads to force `pending`.
      //     It must NEVER touch online_paused_until: this mode exists so customers CAN still order.
      // NOTE: AND last_offline_pause_at IS WRITTEN ONLY IN PAUSE MODE. It drives the dashboard's "Orders
      // were paused while your device was offline" notice, which would be a false statement here.
      const patch = mode === 'no_auto_accept'
        ? { offline_no_autoaccept_until: autoPauseUntil }
        : { online_paused_until: autoPauseUntil, last_offline_pause_at: now.toISOString() }
      const { error: updErr } = await supabase
        .from('truck_events')
        .update(patch)
        .eq('id', ev.id)
      if (updErr) {
        console.error(`[heartbeat-monitor]     event ${ev.id}: PAUSE FAILED — ${updErr.message}`)
      } else {
        pausedCount++
        console.log(`[heartbeat-monitor]     event ${ev.id}: ${mode === 'no_auto_accept' ? 'NO-AUTO-ACCEPT' : 'PAUSED'} until ${autoPauseUntil} (van ${van.name} stale; started=${ev.status}, published ${ev.event_date} ${ev.start_time})`)
      }
    }
  }

  console.log(`[heartbeat-monitor] done — paused ${pausedCount} event(s) this run`)

  return new Response(JSON.stringify({ paused: pausedCount }), { headers: { 'Content-Type': 'application/json' } })
})
