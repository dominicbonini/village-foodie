import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// ══ 🔴 EVERY TRUCK ON ITS OWN CLOCK (Phase 2B, 10 October 2026) ══════════════════════════════════════════
// Stored event_date / start_time / end_time are the TRUCK's local wall clock. The Deno runtime is UTC, so
// "today" and "now" are worked out PER TRUCK, inside the loop, in the truck's zone — by the same rule as
// lib/truck-time.ts (which this Deno function cannot import):
//     zone = trucks.timezone (when it is a zone this runtime knows), else its country's default_timezone
//            from country_settings, read here with the service role this function already uses.
// It used to compute one London "now" for every truck (the BST stale-live fix): right for every UK truck,
// and an hour-to-a-day wrong for anyone else. A GB truck's zone is Europe/London, so every GB decision is
// exactly what it was. A truck whose zone cannot be resolved is LOGGED AND SKIPPED — never opened or closed
// on a guessed clock (the operator's Start / Close buttons still work).
// ⚠️ The candidate rows are read for the dates any zone could call "today" (UTC yesterday … tomorrow), and
// each row is then decided on its own truck's today — the old `event_date = today` filter, per truck.
function nowIn(tz: string, now: Date): { today: string; currentTime: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return {
    today: `${get('year')}-${get('month')}-${get('day')}`,
    currentTime: `${get('hour')}:${get('minute')}`, // HH:MM, 00-23
  }
}

const utcYmd = (d: Date, addDays = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + addDays)).toISOString().slice(0, 10)

function validZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.trim()) return false
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false }
}

/** truck id → its zone, for the trucks these rows belong to. A truck that cannot be resolved is absent. */
async function zonesFor(truckIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!truckIds.length) return out
  const { data: trucks, error } = await supabase.from('trucks').select('id, timezone, country').in('id', [...new Set(truckIds)])
  if (error) { console.error('Truck zone query failed:', error.message); return out }
  const countries = [...new Set((trucks ?? []).map(t => t.country).filter(Boolean))] as string[]
  const { data: rows, error: cErr } = countries.length
    ? await supabase.from('country_settings').select('country_code, default_timezone').in('country_code', countries)
    : { data: [], error: null }
  if (cErr) console.error('Country settings query failed:', cErr.message)
  const byCountry = new Map((rows ?? []).map(r => [r.country_code as string, r.default_timezone as string]))
  for (const t of trucks ?? []) {
    const zone = validZone(t.timezone) ? t.timezone : byCountry.get(t.country as string)
    if (validZone(zone)) out.set(t.id as string, zone)
    else console.error(`🔴 No time zone for truck ${t.id} (timezone=${t.timezone ?? 'null'}, country=${t.country ?? 'null'}) — its events are left for the operator`)
  }
  return out
}

Deno.serve(async () => {
  const now = new Date()
  const timestamp = now.toISOString()

  // ── AUTO-OPEN ─────────────────────────────────────────────
  // Confirmed auto_open events dated on the truck's today whose start_time has passed on the truck's clock.
  const { data: openCandidates, error: openErr } = await supabase
    .from('truck_events')
    .select('id, truck_id, event_date, start_time')
    .eq('status', 'confirmed')
    .eq('auto_open', true)
    .gte('event_date', utcYmd(now, -1))
    .lte('event_date', utcYmd(now, 1))

  let toOpen: { id: string }[] = []
  if (openErr) {
    console.error('Auto-open query failed:', openErr.message)
  } else {
    const zones = await zonesFor((openCandidates ?? []).map(e => e.truck_id as string))
    toOpen = (openCandidates ?? []).filter(e => {
      const tz = zones.get(e.truck_id as string)
      if (!tz) return false
      const { today, currentTime } = nowIn(tz, now)
      return e.event_date === today && !!e.start_time && String(e.start_time).slice(0, 5) <= currentTime
    })
    if (toOpen.length > 0) {
      const ids = toOpen.map(e => e.id)
      const { error } = await supabase
        .from('truck_events')
        .update({ status: 'open', opened_at: timestamp })
        .in('id', ids)
      if (error) console.error('Auto-open update failed:', error.message)
      else console.log(`Auto-opened ${ids.length} event(s):`, ids)
    }
  }

  // ── AUTO-CLOSE (+ self-healing sweep) ─────────────────────
  // Every still-open event up to any zone's today, decided on its own truck's clock:
  //   • event_date < the truck's today → the event is unambiguously over → close it (self-heal / backfill),
  //                                      regardless of auto_close.
  //   • event_date = the truck's today → close only auto_close events whose end_time has passed.
  const { data: openEvents, error: closeErr } = await supabase
    .from('truck_events')
    .select('id, truck_id, event_date, end_time, auto_close')
    .eq('status', 'open')
    .lte('event_date', utcYmd(now, 1))

  if (closeErr) {
    console.error('Auto-close query failed:', closeErr.message)
  } else {
    const zones = await zonesFor((openEvents ?? []).map(e => e.truck_id as string))
    const toCloseIds = (openEvents || [])
      .filter(e => {
        const tz = zones.get(e.truck_id as string)
        if (!tz) return false
        const { today, currentTime } = nowIn(tz, now)
        if (e.event_date > today) return false // a later day on this truck's clock — not yet
        if (e.event_date < today) return true // prior-day open event → sweep closed
        if (!e.auto_close) return false // today, manual-close: leave for the operator
        return !!e.end_time && String(e.end_time).slice(0, 5) <= currentTime
      })
      .map(e => e.id)

    if (toCloseIds.length > 0) {
      const { error } = await supabase
        .from('truck_events')
        .update({ status: 'closed', closed_at: timestamp })
        .in('id', toCloseIds)
      if (error) console.error('Auto-close update failed:', error.message)
      else console.log(`Auto-closed ${toCloseIds.length} event(s):`, toCloseIds)
    }

    return new Response(
      JSON.stringify({
        opened: toOpen.length,
        closed: toCloseIds.length,
        checkedAt: timestamp,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ opened: toOpen.length, closed: 0, checkedAt: timestamp }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
