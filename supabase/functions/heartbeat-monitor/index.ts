import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async () => {
  const STALE_THRESHOLD_SECONDS = 30
  const AUTO_PAUSE_DURATION_HOURS = 2

  const staleThreshold = new Date(
    Date.now() - STALE_THRESHOLD_SECONDS * 1000
  ).toISOString()

  const autoPauseUntil = new Date(
    Date.now() + AUTO_PAUSE_DURATION_HOURS * 60 * 60 * 1000
  ).toISOString()

  // Find vans that should be auto-paused:
  // - auto_pause_on_offline is enabled
  // - last_heartbeat_at is stale (or null with a recent created_at)
  // - not already paused
  const { data: stalledVans, error } = await supabase
    .from('truck_vans')
    .select('id, name, truck_id, last_heartbeat_at')
    .eq('auto_pause_on_offline', true)
    .eq('active', true)
    .or(`last_heartbeat_at.lt.${staleThreshold},last_heartbeat_at.is.null`)
    .is('online_paused_until', null)

  if (error) {
    console.error('Heartbeat monitor query failed:', error.message)
    return new Response('error', { status: 500 })
  }

  if (!stalledVans || stalledVans.length === 0) {
    return new Response(JSON.stringify({ paused: 0 }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Auto-pause stalled vans
  const vanIds = stalledVans.map(v => v.id)
  await supabase
    .from('truck_vans')
    .update({ online_paused_until: autoPauseUntil })
    .in('id', vanIds)

  console.log(`Auto-paused ${stalledVans.length} van(s):`,
    stalledVans.map(v => v.name).join(', '))

  return new Response(
    JSON.stringify({ paused: stalledVans.length }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
