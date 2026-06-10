import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Stored event_date / start_time / end_time are venue LOCAL wall-clock (UK). The Deno runtime
// is UTC, so toISOString()/toTimeString() (the old logic) compared UTC against local values —
// in BST (UTC+1) an event ending 20:00 local was UTC 19:00, so `end_time <= 19:00` was false
// and it closed ~1h late or, across the UTC date boundary, never (the stale-live bug). We now
// derive "now" in Europe/London (handles BST/GMT automatically) so comparisons are like-for-like.
function londonNow(now: Date): { today: string; currentTime: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return {
    today: `${get('year')}-${get('month')}-${get('day')}`,
    currentTime: `${get('hour')}:${get('minute')}`, // HH:MM, 00-23
  }
}

Deno.serve(async () => {
  const now = new Date()
  const timestamp = now.toISOString()
  const { today, currentTime } = londonNow(now)

  // ── AUTO-OPEN ─────────────────────────────────────────────
  // Find confirmed events with auto_open=true whose start_time has passed (local time)
  const { data: toOpen, error: openErr } = await supabase
    .from('truck_events')
    .select('id, truck_id, start_time')
    .eq('status', 'confirmed')
    .eq('auto_open', true)
    .eq('event_date', today)
    .lte('start_time', currentTime)

  if (openErr) {
    console.error('Auto-open query failed:', openErr.message)
  } else if (toOpen && toOpen.length > 0) {
    const ids = toOpen.map(e => e.id)
    const { error } = await supabase
      .from('truck_events')
      .update({ status: 'open', opened_at: timestamp })
      .in('id', ids)
    if (error) console.error('Auto-open update failed:', error.message)
    else console.log(`Auto-opened ${ids.length} event(s):`, ids)
  }

  // ── AUTO-CLOSE (+ self-healing sweep) ─────────────────────
  // Scope to every still-open event up to today, then decide in JS so a single missed window
  // can't leave an event 'open' forever (the old `event_date = today` filter never revisited a
  // slipped event once the date advanced):
  //   • event_date < today  → the event is unambiguously over → close it (self-heal / backfill),
  //                            regardless of auto_close (it can't still be serving on a past day).
  //   • event_date = today  → close only auto_close events whose end_time has passed (local).
  const { data: openEvents, error: closeErr } = await supabase
    .from('truck_events')
    .select('id, event_date, end_time, auto_close')
    .eq('status', 'open')
    .lte('event_date', today)

  if (closeErr) {
    console.error('Auto-close query failed:', closeErr.message)
  } else {
    const toCloseIds = (openEvents || [])
      .filter(e => {
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
        opened: toOpen?.length ?? 0,
        closed: toCloseIds.length,
        checkedAt: timestamp,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ opened: toOpen?.length ?? 0, closed: 0, checkedAt: timestamp }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
