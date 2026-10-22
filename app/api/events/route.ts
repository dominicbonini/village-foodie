// app/api/events/route.ts
// Returns upcoming confirmed/open events for a truck slug.
// Reads from truck_events (the authoritative source) so all vans are included.

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { readVanIntervals, readEventIntervalsForTruck, applyEventIntervals, NO_VAN_INTERVALS, type VanIntervals } from '@/lib/slot-interval'
import { readEventTypesForTruck } from '@/lib/event-types/read'
/* 🔴 PRIVATE EVENTS: this feed SHOWS them, redacted. See the note above the mapper. */
import { readPrivateEventIds } from '@/lib/private-events/read'
import { truckTimeSettings } from '@/lib/truck-time'
import { getLocalDateInTz, getNowMinsInTz, addDaysYmd, formatOrdinalDate, type TimeSettings } from '@/lib/time-utils'
import { upcomingQueryFloor, isUpcomingOrRunning } from '@/lib/event-window'
// Language Phase 1d: the refusal of ours carries a code (lib/i18n/manage-errors.ts); "Today · …" / "Tomorrow · …" are
// messages (`manageApi.eventsFeed`) in the truck's language. A database's message is passed on as it comes.
import { manageErrorBody } from '@/lib/i18n/manage-errors'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { localeForTruck } from '@/lib/i18n/server-locale'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/manageApi'
import { readEventRegions } from '@/lib/event-region-read'
import { addressFormatForTruck } from '@/lib/country-settings'   // address-formats-1
import '@/lib/i18n/catalog/privateEvents'

export const revalidate = 0

function toddmmyyyy(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

/** "Today · Friday 9th October" / "Tomorrow · …" / "Wednesday 14th October" — on the TRUCK's clock and in
 *  its country's order (Phase 2B). It was the server's clock: UTC on Vercel, so from 00:00 to 01:00 BST
 *  today's event read "Tomorrow". GB wording is unchanged. */
function formatFriendly(isoDate: string, ts: TimeSettings, t: ReturnType<typeof translatorFor<'manageApi'>>): string {
  const today = getLocalDateInTz(ts.timeZone)
  const base = formatOrdinalDate(isoDate, ts)
  if (isoDate === today) return t('eventsFeed.today', { date: base })
  if (isoDate === addDaysYmd(today, 1)) return t('eventsFeed.tomorrow', { date: base })
  return base
}

export async function GET(req: NextRequest) {
  const truckSlug = req.nextUrl.searchParams.get('truck')
  if (!truckSlug) {
    return NextResponse.json(manageErrorBody(DEFAULT_LOCALE, 'truck_param_required'), { status: 400 })
  }


  // Try slug first, fall back to ID — same pattern as /api/menu/[truckId]
  let truckQuery = await supabase
    .from('trucks')
    .select('id, name, timezone, country')
    .eq('slug', truckSlug)
    .single()

  if (truckQuery.error || !truckQuery.data) {
    truckQuery = await supabase
      .from('trucks')
      .select('id, name, timezone, country')
      .eq('id', truckSlug)
      .single()
  }

  const truck = truckQuery.data

  if (!truck) {
    console.error(`[events API] truck not found for slug/id: ${truckSlug}`)
    return NextResponse.json({
      truck_slug: truckSlug,
      truck_name: truckSlug,
      events: [],
      next_event: null,
    })
  }

  // TODO: add customer_note to this select and surface it on the customer order page
  // below the event details card. Saves to truck_events.customer_note.
  // See session notes May 2026.
  // 🔴 THE TRUCK'S TODAY AND STYLE (Phase 2B) — was the UTC date and the server's clock.
  const ts = await truckTimeSettings(truck)
  const today = getLocalDateInTz(ts.timeZone)

  // 🔴 AN EVENT THAT RUNS PAST MIDNIGHT (lib/event-window.ts): one that started yesterday is still on the schedule until
  // its end on the next day. So the query reads from yesterday, the rows are kept when upcoming or still running, and
  // THEN the 50 are taken — the limit after the filter. A normal event from yesterday is dropped: the list is as before.
  const floor = upcomingQueryFloor(ts.timeZone)
  const nowMins = getNowMinsInTz(ts.timeZone)
  const { data: allRows, error } = await supabase
    .from('truck_events')
    // status + opened_at expose the operator-STARTED signal so customer surfaces derive "live" from
    // status==='open' (live-redefinition), not the published clock window. Times stay DISPLAY-only.
    .select('id, event_date, start_time, end_time, venue_name, town, postcode, notes, status, opened_at, van_id')
    .eq('truck_id', truck.id)
    .in('status', ['confirmed', 'open'])
    .gte('event_date', floor)
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false })

  if (error) {
    console.error('Events API error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const rows = (allRows || []).filter(e => isUpcomingOrRunning(e, today, nowMins)).slice(0, 50)

  // ── 🔴 THE CUSTOMER COLLECTION INTERVAL, PER EVENT — NOT PER TRUCK ────────────────────────────────
  // The order page's FALLBACK picker (reached only when /api/slots fails or returns nothing) needs to
  // offer the same minutes the server grid would have. That interval belongs to the EVENT'S VAN, so a
  // two-van truck running two events in one day offers each its own grid. Putting it on the truck
  // would be wrong for exactly that truck, silently.
  // ⚠️ ONLY THE CUSTOMER VALUE IS EXPOSED. `operator_collection_interval_mins` is the operator's own
  // grid and has no business on a public endpoint — readVanIntervals returns both, and only `.customer`
  // is read here.
  // ONE tolerant read for the whole page of events, keyed by van id, so this stays a single extra query
  // whatever the event count. Any failure ⇒ every event reads 5, which is today's behaviour.
  const vanIds = [...new Set((rows || []).map(e => (e as { van_id?: string | null }).van_id).filter(Boolean) as string[])]
  const vanPairByVan = new Map<string, VanIntervals>()
  await Promise.all(vanIds.map(async id => {
    vanPairByVan.set(id, await readVanIntervals(supabase, id))
  }))
  // 🔴 THE EVENT LAYER. One probed read for the whole page; a failure leaves every event on its van,
  // which is this endpoint's behaviour before the event columns existed.
  const eventOverrides = await readEventIntervalsForTruck(supabase, truck.id)
  /* One extra probed read for the whole list, not one per event — see readEventTypesForTruck. */
  const eventTypes = await readEventTypesForTruck(supabase, truck.id, floor)   // from yesterday too: a running overnight event

  /* ══ 🔴 PRIVATE EVENTS APPEAR HERE, AND THEY APPEAR REDACTED (20261014) ═══════════════════════════
   * This is the truck's PUBLIC SCHEDULE, and decision 4 is that a private event always shows on it —
   * as "Private event" with the date and times only. It is not dropped: a customer looking at the
   * schedule should see that the truck is busy that evening, which is the whole reason an operator
   * wants it listed at all.
   * ⛔ WHAT IS REMOVED: the venue, the town, the postcode and the notes. The name
   * (`private_name`) is never selected by this route in the first place.
   * ⛔ AND `is_private` IS PUBLISHED, so the order page can refuse to offer an Order button. A feed
   * that hid the venue but gave no flag would force every consumer to guess from the label text.
   * ⚠️ ONE PROBED READ FOR THE WHOLE PAGE, FAILING CLOSED — see lib/private-events/read.ts. On a
   * failure every event is treated as private, which is visible and safe rather than silent and
   * leaky. */
  const privacy = await readPrivateEventIds(supabase, (rows || []).map(e => e.id), '/api/events')
  // The events' states (lib/event-region-read.ts): a separate best-effort read; a key only when one is known.
  // address-formats-1 (21 October 2026): the truck's address format — each event carries it, and its region is read in it.
  const addressFormat = await addressFormatForTruck(truck)
  const regions = await readEventRegions(supabase, (rows || []).map(e => e.id), addressFormat)

  const feedLocale = await localeForTruck(truck)
  const tFeed = translatorFor(feedLocale, 'manageApi')
  // languages-1: a private event's public name in the truck's language (`privateEvents.publicName` — "Private event" in en-GB).
  const privateLabel = translatorFor(feedLocale, 'privateEvents')('publicName')
  const seen = new Set<string>()
  const events = (rows || []).map(e => {
    /* ⛔ THE DEDUP KEY IS BUILT ON THE **REAL** VENUE NAME, BEFORE ANY SUBSTITUTION — §70.2 names this
     * explicitly and it is not a style point. Substituting first would give every private event on one
     * date the key `date|Private event|` and the second one would be silently dropped as a duplicate:
     * a truck with two private bookings in an evening would publish one of them. */
    const key = `${e.event_date}|${e.venue_name || ''}|${e.start_time || ''}`
    if (seen.has(key)) return null
    seen.add(key)
    const isPrivate = privacy.isPrivate(e.id)
    return {
      id:            e.id,
      date:          toddmmyyyy(e.event_date),
      date_iso:      e.event_date,
      date_friendly: formatFriendly(e.event_date, ts, tFeed),
      start_time:    e.start_time || '',
      end_time:      e.end_time || '',
      truck_name:    truck.name,
      /* 🔴 THE REDACTION, FIELD BY FIELD. `publicVenueName` is not used here because this mapper
       * renames the columns as it goes (`town` → `village`), so the substitution is spelt out
       * alongside each one rather than applied to a row shape this object does not have. */
      venue_name:    isPrivate ? privateLabel : (e.venue_name || ''),
      village:       isPrivate ? '' : (e.town || ''),
      postcode:      isPrivate ? '' : (e.postcode || ''),
      ...(!isPrivate && regions.get(e.id) ? { region: regions.get(e.id) } : {}),
      ...(addressFormat ? { addressFormat } : {}),
      notes:         isPrivate ? '' : (e.notes || ''),
      /* So the order page can show it without an Order button. */
      is_private:    isPrivate,
      status:        e.status || 'confirmed', // 'open' = operator-started/auto-opened = LIVE
      opened_at:     e.opened_at || null,
      // The minutes the fallback picker may offer for THIS event: the event's own override when it has
      // one, else its van's, else 5. 🔴 ONLY `.customer` is published — the operator grid has no
      // business on a public endpoint, and applyEventIntervals returns both.
      /* ⚠️ THE EVENT'S TYPE IS PASSED (October 2026). This value is what the fallback picker OFFERS a
       * customer, and /api/slots resolves the same chain through `resolveIntervalsFor` — so omitting
       * the type here would publish one grid and serve another. The event's own override still wins,
       * and a truck with no types gets `undefined` for every event, which is today's value. */
      collection_interval_mins: applyEventIntervals(
        vanPairByVan.get((e as { van_id?: string | null }).van_id || '') ?? NO_VAN_INTERVALS,
        eventOverrides.byEventId.get(e.id) ?? null,
        eventTypes.byEventId.get(e.id) ?? null,
      ).customer,
    }
  }).filter(Boolean)

  return NextResponse.json({
    truck_slug:  truckSlug,
    truck_name:  truck.name,
    events,
    next_event:  events[0] || null,
    // 🔴 The truck's zone and display settings (Phase 2B) — the order page's "ended" and 14-day checks
    // run on the truck's clock, and its cards read in the truck's country's style.
    time:        ts,
  })
}
