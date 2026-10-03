// lib/schedule-graphics/event-preview.ts — the Add event form, as the public schedule page would
// show it.
//
// 🔴 AN ADAPTER, NOT A SECOND CARD. The preview renders `components/TruckListCard` — the SAME
// component `app/trucks/[slug]/TruckClient.tsx` uses for every event on a truck's public page. This
// file only builds the props. Copying that card's markup would give the operator a preview that drifts
// from the thing it is previewing the first time either is restyled, which is the one failure a
// preview must not have.
//
// ⚠️ PURE. It takes the form's current values and returns a `VillageEvent`; it reads no clock beyond
// the `now` it is handed, no network and no database, so it is testable and cannot surprise a render.

import type { VillageEvent } from '@/types'

/** What an unfilled field shows. 🔴 NEVER '', 'undefined' or 'Invalid date'. */
export const PREVIEW_PLACEHOLDERS = {
  venue: 'Where are you trading?',
  date: 'Pick a date',
  time: '--:--',
} as const

/** The form fields the preview reads. A subset of the Add event form's state. */
export interface PreviewForm {
  venue_name?: string | null
  town?: string | null
  postcode?: string | null
  address?: string | null
  event_date?: string | null
  start_time?: string | null
  end_time?: string | null
  notes?: string | null
}

/**
 * Is this a complete, previewable event yet? Used to decide whether the card is shown at full
 * confidence or with its placeholders.
 */
export function previewIsComplete(form: PreviewForm): boolean {
  return !!String(form.venue_name ?? '').trim()
    && isYmd(form.event_date)
    && !!String(form.start_time ?? '').trim()
    && !!String(form.end_time ?? '').trim()
}

const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/**
 * The form, as a `VillageEvent` for `TruckListCard`.
 *
 * 🔴 EVERY FIELD IS DEFENDED, because the form is half-empty for most of its life. The card formats a
 * date and a time range, and `new Date('')` is an Invalid Date — which renders as the literal string
 * "Invalid Date" and would sit in the operator's preview until they filled the field. So:
 *   • a date that is not 'YYYY-MM-DD' becomes the placeholder, never a parsed value;
 *   • a blank time becomes '--:--', which reads as "not set yet" rather than as midnight;
 *   • a blank venue becomes the prompt, not ''.
 *
 * ⚠️ `status: 'unconfirmed'` DELIBERATELY. The card's CTA branch keys off `status === 'open'` and on
 * `source === 'operator'`; an unsaved event is neither live nor orderable, and a preview showing a
 * working Order button for an event that does not exist would be a lie the operator could click.
 * The caller also passes `hideOrderButton`, so this is the belt to that braces.
 *
 * ⚠️ `id` IS A FIXED SENTINEL, not a uuid and not a random value. It is a React `key` and nothing
 * else — a fresh random id on every keystroke would remount the card and lose its CSS transitions.
 */
export function previewEventFromForm(input: {
  form: PreviewForm
  truckName: string
  /** The van's display name, when the truck has more than one and one is chosen. */
  vanName?: string | null
}): VillageEvent {
  const { form, truckName } = input
  const txt = (v: unknown): string => String(v ?? '').trim()

  const venueName = txt(form.venue_name) || PREVIEW_PLACEHOLDERS.venue
  // 🔴 THE DATE IS PASSED THROUGH ONLY WHEN IT IS A REAL 'YYYY-MM-DD'. Anything else — '', a partial
  // value mid-typing — becomes the prompt, so the card never formats a parse failure.
  const date = isYmd(form.event_date) ? form.event_date : PREVIEW_PLACEHOLDERS.date
  const startTime = txt(form.start_time) || PREVIEW_PLACEHOLDERS.time
  const endTime = txt(form.end_time) || PREVIEW_PLACEHOLDERS.time

  return {
    id: 'add-event-preview',
    date,
    startTime,
    endTime,
    truckName: txt(truckName) || 'Your truck',
    venueName,
    status: 'unconfirmed',
    village: txt(form.town) || undefined,
    town: txt(form.town) || undefined,
    postcode: txt(form.postcode) || undefined,
    eventNotes: txt(form.notes) || undefined,
  }
}

/**
 * The one-line version, for the phone's pinned card: "Lavenham Village Hall · Tue 13 Oct ·
 * 17:00–20:00 · Van 2".
 *
 * ⚠️ IT DROPS EMPTY PARTS RATHER THAN PRINTING SEPARATORS AROUND THEM. A line reading
 * "· Tue 13 Oct · ·" is worse than a short one, and it is what naive joining produces on a form that
 * is half filled in.
 * ⚠️ `fmtDay` IS INJECTED so the caller supplies the same formatter the rest of the feature uses —
 * building a date here would be a second definition of "Tue 13 Oct".
 */
export function previewLine(input: {
  form: PreviewForm
  vanName?: string | null
  fmtDay: (ymd: string | null) => string
  fmtTimes: (start: string | null | undefined, end: string | null | undefined) => string
}): string {
  const { form, vanName, fmtDay, fmtTimes } = input
  const parts: string[] = []
  const venue = String(form.venue_name ?? '').trim()
  parts.push(venue || PREVIEW_PLACEHOLDERS.venue)
  const day = isYmd(form.event_date) ? fmtDay(form.event_date) : ''
  if (day) parts.push(day)
  const times = fmtTimes(form.start_time, form.end_time)
  if (times) parts.push(times)
  const van = String(vanName ?? '').trim()
  if (van) parts.push(van)
  return parts.join(' · ')
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE VAN DEFAULT
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** An event, as the van default reads it. */
export interface VanPickEvent {
  event_date?: string | null
  status?: string | null
  van_id?: string | null
}

/**
 * Which van to pre-select when a place is picked: the one used at that place's most recent
 * non-cancelled event.
 *
 * 🔴 IT RETURNS `null` RATHER THAN GUESSING. No history, no van recorded, or a van that is no longer
 * active ⇒ null, and the caller leaves the field exactly as it is today ("Select a van"). A wrong
 * pre-selection is worse than none: the operator may not look, and the van decides which screen the
 * order appears on.
 *
 * 🔴 AN INACTIVE VAN IS NEVER OFFERED. `activeVanIds` is the gate. A van that has been removed from
 * the truck still appears on its old events, and pre-selecting one would put a new event on a screen
 * nobody is watching.
 *
 * ⚠️ `cancelled` IS EXCLUDED AND `closed` IS NOT — the same split as Last/Next in places.ts: a closed
 * event is the clearest evidence of which van actually traded there.
 */
export function vanForPlace(input: {
  events: readonly VanPickEvent[]
  activeVanIds: readonly string[]
}): string | null {
  const active = new Set(input.activeVanIds)
  const candidates = input.events
    .filter(e => String(e.status ?? '').trim().toLowerCase() !== 'cancelled')
    .filter(e => !!e.van_id && active.has(e.van_id as string))
    .filter(e => isYmd(e.event_date))
    // Most recent first. ⚠️ String comparison on 'YYYY-MM-DD' — no `new Date()`, which on a date-only
    // value is UTC midnight and shifts the ordering for anyone west of London.
    .sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)))
  return candidates[0]?.van_id ?? null
}
