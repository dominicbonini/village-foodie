import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async () => {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const currentTime = now.toTimeString().slice(0, 5) // HH:MM
  const timestamp = now.toISOString()

  // ── AUTO-OPEN ─────────────────────────────────────────────
  // Find confirmed events with auto_open=true whose start_time has passed
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

  // ── AUTO-CLOSE ────────────────────────────────────────────
  // Find open events with auto_close=true whose end_time has passed
  const { data: toClose, error: closeErr } = await supabase
    .from('truck_events')
    .select('id, truck_id, end_time')
    .eq('status', 'open')
    .eq('auto_close', true)
    .eq('event_date', today)
    .lte('end_time', currentTime)

  if (closeErr) {
    console.error('Auto-close query failed:', closeErr.message)
  } else if (toClose && toClose.length > 0) {
    const ids = toClose.map(e => e.id)
    const { error } = await supabase
      .from('truck_events')
      .update({ status: 'closed', closed_at: timestamp })
      .in('id', ids)
    if (error) console.error('Auto-close update failed:', error.message)
    else console.log(`Auto-closed ${ids.length} event(s):`, ids)
  }

  return new Response(
    JSON.stringify({
      opened: toOpen?.length ?? 0,
      closed: toClose?.length ?? 0,
      checkedAt: timestamp
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
