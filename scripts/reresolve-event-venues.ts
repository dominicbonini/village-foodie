// scripts/reresolve-event-venues.ts
// Re-resolve existing scraper truck_events against the FIXED venue matcher (token-overlap + village-
// rank + bail — mirror of inbound-schedule findVenue). Updates latitude/longitude/postcode, and town
// (from the matched venue's village) when the event's town is blank. BAIL → leaves the row untouched
// (no destructive blanking of already-stored data). Idempotent.
//
// Usage:
//   npx tsx scripts/reresolve-event-venues.ts test-truck          # scope to one truck (dry-run)
//   npx tsx scripts/reresolve-event-venues.ts test-truck --apply  # actually write
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const normName = (s: string | null) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const STOP = new Set(['the', 'pub', 'inn', 'tavern', 'arms', 'bar', 'hotel', 'and', 'at', 'on', 'of'])
const toks = (s: string | null) => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t && !STOP.has(t))

let allVenues: any[] = []
const findVenue = (venueName: string | null, village: string | null) => {
  if (!allVenues.length || !venueName) return null
  const sTok = new Set(toks(venueName)); const normScraped = normName(venueName)
  const cands = allVenues.filter(v => {
    if (normName(v.name) === normScraped) return true
    const vTok = new Set(toks(v.name)); if (vTok.size === 0 || sTok.size === 0) return false
    return [...vTok].every(t => sTok.has(t)) || [...sTok].every(t => vTok.has(t))
  })
  if (cands.length === 0) return null
  if (cands.length === 1) return cands[0]
  const evVilToks = toks(village)
  let agree = evVilToks.length
    ? cands.filter(c => { const cvT = toks(c.village); return cvT.length > 0 && (cvT.every(t => evVilToks.includes(t)) || evVilToks.every(t => cvT.includes(t))) })
    : []
  if (agree.length === 0) agree = cands.filter(c => { const cv = toks(c.village); return cv.length > 0 && cv.every(t => sTok.has(t)) })
  if (agree.length === 1) return agree[0]
  if (agree.length > 1) return agree.find(c => normName(c.name) === normScraped) || null
  return null
}

async function main() {
  const truck = process.argv[2]
  const apply = process.argv.includes('--apply')
  if (!truck) { console.error('usage: reresolve-event-venues.ts <truck_id> [--apply]'); process.exit(1) }
  ;({ data: allVenues } = await sb.from('venues').select('id, name, village, latitude, longitude, postcode') as any)
  const { data: evs } = await sb.from('truck_events')
    .select('id, venue_name, town, postcode, latitude, longitude, event_date')
    .eq('truck_id', truck).eq('source', 'scraper').gte('event_date', new Date().toISOString().slice(0, 10))
    .order('event_date')

  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} — ${evs?.length || 0} events for ${truck}\n`)
  for (const e of evs || []) {
    const v = findVenue(e.venue_name, e.town)
    if (!v) { console.log(`  ${e.event_date} "${e.venue_name}" → BAIL (left untouched)`); continue }
    const patch: any = { latitude: v.latitude ?? null, longitude: v.longitude ?? null, postcode: v.postcode ?? null }
    if (!e.town && v.village) patch.town = v.village // fill blank town from matched venue
    const changed = String(patch.latitude) !== String(e.latitude) || patch.postcode !== e.postcode || (patch.town && patch.town !== e.town)
    console.log(`  ${e.event_date} "${e.venue_name}" → "${v.name}" (${v.village}) pc=${v.postcode || 'blank'} town=${patch.town ?? e.town}${changed ? '  *CHANGED' : ''}`)
    if (apply && changed) {
      const { error } = await sb.from('truck_events').update(patch).eq('id', e.id)
      if (error) console.log(`     ERROR: ${error.message}`)
    }
  }
  console.log(`\n${apply ? 'Applied.' : 'Dry-run only — re-run with --apply to write.'}`)
}
main()
