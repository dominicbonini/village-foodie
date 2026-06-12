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
import { findVenue, type VenueRow } from '../lib/venue-matcher'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

let allVenues: VenueRow[] = []

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
  let changedN = 0, unchangedN = 0, skippedN = 0
  for (const e of evs || []) {
    // Shared matcher now best-guesses on ambiguity; this script stays CONSERVATIVE — patch ONLY
    // high-confidence matches, never re-pin an event on a low-confidence guess (preserves the old
    // "only touch confident matches" behaviour). Does NOT stamp venue_id (out of scope here).
    const { venue: v, confidence } = findVenue(e.venue_name, e.town, allVenues)
    if (confidence !== 'high' || !v) {
      console.log(`  ${e.event_date} "${e.venue_name}" → ${confidence}-confidence, left untouched`)
      skippedN++
      continue
    }
    const patch: any = { latitude: v.latitude ?? null, longitude: v.longitude ?? null, postcode: v.postcode ?? null }
    if (!e.town && v.village) patch.town = v.village // fill blank town from matched venue
    const changed = String(patch.latitude) !== String(e.latitude) || patch.postcode !== e.postcode || (patch.town && patch.town !== e.town)
    console.log(`  ${e.event_date} "${e.venue_name}" → "${v.name}" (${v.village}) pc=${v.postcode || 'blank'} town=${patch.town ?? e.town}${changed ? '  *CHANGED' : ''}`)
    if (changed) changedN++; else unchangedN++
    if (apply && changed) {
      const { error } = await sb.from('truck_events').update(patch).eq('id', e.id)
      if (error) console.log(`     ERROR: ${error.message}`)
    }
  }
  console.log(`\nchanged=${changedN} unchanged=${unchangedN} skipped(low/none)=${skippedN}`)
  console.log(apply ? 'Applied.' : 'Dry-run only — re-run with --apply to write.')
}
main()
