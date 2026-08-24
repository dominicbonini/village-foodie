// lib/whatsapp/upcoming-events.ts
// THE SCHEDULE READ THAT FEEDS generateWhatsAppReply, IN ONE PLACE.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────────
// `generateWhatsAppReply` does NOT fetch events. It takes them as a parameter, so every caller has to
// build the same query, and the two existing callers -- the Meta webhook and the dormant Twilio webhook
// -- each carry their own copy. A THIRD copy for the operator preview is how the copies start to differ:
// a different status list or a missing limit changes what the model is grounded on, the reply still
// looks plausible, and nothing fails. See docs/whatsapp-simulator-seam-report.md 2.b.
//
// ── ⚠️ THE TWO EXISTING CALLERS ARE DELIBERATELY NOT RE-POINTED AT THIS ─────────────────────────────
// This is a NEW shared definition that the NEW caller uses; it is not a refactor of the live path.
// Three reasons, recorded so the next person does not read it as an unfinished job:
//   1. The Meta webhook is already modified in the working tree (the 20 August secret/lookup fixes) and
//      is queued in an undeployed batch while an App Store review runs. Widening that file's diff with a
//      refactor mixes an unreviewed behavioural change with an unreviewed structural one.
//   2. The substitution is not purely local there: the webhook reuses its `events` binding for
//      `events_found` in the whatsapp_logs insert, so swapping the query also moves that read.
//   3. The dormant Twilio route is explicitly out of scope.
// ⚠️ SO THE DUPLICATION STILL EXISTS -- this file reduces it from "two copies and a third being added"
// to "two copies and one shared definition". Say that rather than calling it de-duplicated.
//
// ── 🔴 THE UTC DATE IS REPRODUCED ON PURPOSE. DO NOT "FIX" IT HERE. ─────────────────────────────────
// `new Date().toISOString()` is UTC, so between 00:00 and 01:00 BST this returns YESTERDAY's date and
// the window opens a day early -- the same defect the live webhook has, and the same one the classifier
// has in its own DATE REFERENCE block. It is real, it is on the live path, and it is a separate
// decision. A preview tool that silently disagreed with the live path about what day it is would be
// worse than one that reproduces the defect faithfully. Fix both together or neither.
import type { SupabaseClient } from '@supabase/supabase-js'

/** The exact shape `generateWhatsAppReply` reads. Kept structural, not imported, because the
 *  classifier's own `TruckEvent` is not exported. */
export interface UpcomingTruckEvent {
  event_date: string
  start_time: string | null
  end_time: string | null
  venue_name: string | null
  town: string | null
  postcode: string | null
  status: string
}

// ⚠️ THESE THREE ARE THE COPY-SENSITIVE PARTS AND ARE NAMED SO A DIFF SHOWS THEM.
// The column list is what the classifier destructures; the status list is what "upcoming" means here
// (note `unconfirmed` IS included -- the classifier labels it [UNCONFIRMED] rather than hiding it);
// the limit is what bounds the prompt. Changing any of them changes what a customer is told.
export const UPCOMING_EVENT_COLUMNS =
  'event_date, start_time, end_time, venue_name, town, postcode, status'
export const UPCOMING_EVENT_STATUSES = ['confirmed', 'open', 'unconfirmed']
export const UPCOMING_EVENT_LIMIT = 10

/**
 * The upcoming-events window for one truck, ready to hand to `generateWhatsAppReply`.
 *
 * Takes the Supabase client rather than creating one: the callers already hold a service-role client,
 * and a module that picks its own credentials is a module that can be wrong about them somewhere else.
 *
 * ⚠️ RETURNS `[]` ON ERROR, and logs. The inline copies discard the error entirely and pass `?? []`,
 * which yields the same array -- the difference is that this one is visible in a log line rather than
 * indistinguishable from "no events". A truck with a schedule and a failing query otherwise reads to the
 * customer as a truck with no schedule.
 */
export async function fetchUpcomingTruckEvents(
  supabase: SupabaseClient,
  truckId: string,
): Promise<UpcomingTruckEvent[]> {
  const today = new Date().toISOString().split('T')[0]   // UTC -- see the header note

  const { data, error } = await supabase
    .from('truck_events')
    .select(UPCOMING_EVENT_COLUMNS)
    .eq('truck_id', truckId)
    .gte('event_date', today)
    .in('status', UPCOMING_EVENT_STATUSES)
    .order('event_date', { ascending: true })
    .limit(UPCOMING_EVENT_LIMIT)

  if (error) {
    console.error('[whatsapp/upcoming-events] query failed for truck', truckId, '--', error.message)
    return []
  }
  return (data as UpcomingTruckEvent[] | null) ?? []
}
