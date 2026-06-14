import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Event LOCAL wall-clock is UK; the Deno runtime is UTC. Derive "now" in Europe/London so the
// live-now window comparison is like-for-like (handles BST/GMT). Mirrors auto-event-scheduler.
function londonNow(now: Date): { today: string; currentTime: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return {
    today: `${get('year')}-${get('month')}-${get('day')}`,
    currentTime: `${get('hour')}:${get('minute')}`, // HH:MM 00-23
  }
}

Deno.serve(async () => {
  const STALE_THRESHOLD_SECONDS = 30
  const AUTO_PAUSE_DURATION_HOURS = 2
  const now = new Date()
  const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_SECONDS * 1000).toISOString()
  const autoPauseUntil = new Date(now.getTime() + AUTO_PAUSE_DURATION_HOURS * 60 * 60 * 1000).toISOString()
  const { today, currentTime } = londonNow(now)

  // Stale active vans (heartbeat older than the threshold, or never sent). NOT pre-filtered by
  // auto_pause_on_offline — effective offline-protection is decided PER live event below
  // (event.offline_protection_override ?? van.auto_pause_on_offline).
  const { data: stalledVans, error } = await supabase
    .from('truck_vans')
    .select('id, name, auto_pause_on_offline, last_heartbeat_at')
    .eq('active', true)
    .or(`last_heartbeat_at.lt.${staleThreshold},last_heartbeat_at.is.null`)

  if (error) {
    console.error('[heartbeat-monitor] stale-van query failed:', error.message)
    return new Response('error', { status: 500 })
  }

  // DIAGNOSTIC: what this run sees — London now (for context only; the gate is status-based, NOT
  // clock-based), the stale threshold, and every stale van it found with its last heartbeat.
  console.log(`[heartbeat-monitor] run @ ${now.toISOString()} | London ${today} ${currentTime} | staleThreshold=${staleThreshold} | staleVans=${stalledVans?.length ?? 0}`)
  for (const v of stalledVans ?? []) {
    console.log(`[heartbeat-monitor]   stale van ${v.id} (${v.name}) last_heartbeat_at=${v.last_heartbeat_at ?? 'never'}`)
  }

  if (!stalledVans || stalledVans.length === 0) {
    console.log('[heartbeat-monitor] no stale vans — nothing to pause')
    return new Response(JSON.stringify({ paused: 0 }), { headers: { 'Content-Type': 'application/json' } })
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
      .select('id, online_paused_until, offline_protection_override, status, event_date, start_time')
      .eq('van_id', van.id)
      .eq('status', 'open')

    console.log(`[heartbeat-monitor]   van ${van.id}: ${liveEvents?.length ?? 0} open (live) event(s) — ${(liveEvents ?? []).map(e => e.id).join(', ') || 'none'}`)

    for (const ev of liveEvents || []) {
      if (ev.online_paused_until) {
        console.log(`[heartbeat-monitor]     event ${ev.id}: SKIP — already offline-paused (until ${ev.online_paused_until})`)
        continue // already offline-paused — leave it
      }
      const effective = ev.offline_protection_override !== null && ev.offline_protection_override !== undefined
        ? ev.offline_protection_override
        : (van.auto_pause_on_offline ?? false)
      if (!effective) {
        console.log(`[heartbeat-monitor]     event ${ev.id}: SKIP — offline protection OFF (override=${ev.offline_protection_override}, vanDefault=${van.auto_pause_on_offline})`)
        continue // offline protection off for this event → don't pause
      }
      const { error: updErr } = await supabase
        .from('truck_events')
        // last_offline_pause_at = a DURABLE marker of this offline auto-pause. /api/heartbeat clears
        // online_paused_until on reconnect but NOT this column, so the dashboard can surface a
        // one-time "you were offline-paused while away" popup after the device is back online.
        .update({ online_paused_until: autoPauseUntil, last_offline_pause_at: now.toISOString() })
        .eq('id', ev.id)
      if (updErr) {
        console.error(`[heartbeat-monitor]     event ${ev.id}: PAUSE FAILED — ${updErr.message}`)
      } else {
        pausedCount++
        console.log(`[heartbeat-monitor]     event ${ev.id}: PAUSED until ${autoPauseUntil} (van ${van.name} stale; started=${ev.status}, published ${ev.event_date} ${ev.start_time})`)
      }
    }
  }

  console.log(`[heartbeat-monitor] done — paused ${pausedCount} event(s) this run`)

  return new Response(JSON.stringify({ paused: pausedCount }), { headers: { 'Content-Type': 'application/json' } })
})
