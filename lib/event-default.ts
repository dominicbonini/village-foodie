// lib/event-default.ts — 🔴 WHICH EVENT A STAFF SCREEN MAY USE, AND WHICH ONE AN UNAPPROVED EVENT DUPLICATES
// (events-overlap-2, 17 November 2026; docs/events-overlap-1-report.md is the incident review).
//
// On 13 November Pizzeria Gusto had an approved event and a scraped, never-approved copy at the same times. Staff took
// 23 walk-ups on the copy. The dashboard picked an event by TIME alone (pickDefaultEventByTime — deliberately status-blind)
// and listed both as "Not started". This module holds the status-aware rules the staff screens and the walk-up route share:
//   • pickDefaultApprovedEvent — the default event: a STARTED one that has not ended, else an APPROVED (confirmed) one that
//     is current or next by time, else NOTHING. An unconfirmed event is never a default. pickDefaultEventByTime stays pure
//     and status-blind; this is a wrapper over it.
//   • approvedOverlaps / overlapTarget — the approved or started events an unconfirmed event overlaps in time
//     (lib/event-conflicts.ts detectEventConflicts), and the one to name: the one with the most orders.
// Pure. Client-safe and server-safe.
import { pickDefaultEventByTime, localDateOfInstant } from '@/lib/time-utils'
import { eventEndInstant, crossesMidnight, clockMins, daysBetween, eventDates } from '@/lib/event-window'
import { detectEventConflicts, type ConflictEvent } from '@/lib/event-conflicts'

/** The statuses staff may take orders on. 'closed' is approved but finished; a walk-up is never refused for being late. */
export const ORDERABLE_STATUSES = ['confirmed', 'open'] as const

type TimedEvent = { event_date: string; start_time: string | null; end_time: string | null; status?: string | null }

/** True when the event has an end and it is in the past (an overnight event ends on the next day). */
function hasEnded(e: TimedEvent, tz: string, nowMs: number): boolean {
  const end = eventEndInstant(e.event_date, e.start_time, e.end_time, tz)
  return end != null && nowMs > end
}

/**
 * The default event for a staff screen with nothing selected.
 *   1. a STARTED (status 'open') event that has not ended — current by time, else the earliest (opened early);
 *   2. an APPROVED (status 'confirmed') event that is current or next by time;
 *   3. null. Never an unconfirmed, closed or cancelled event, and never a past one.
 */
export function pickDefaultApprovedEvent<T extends TimedEvent>(events: T[], tz: string, nowMs: number = Date.now()): T | null {
  if (!events?.length) return null
  const live = events.filter(e => !hasEnded(e, tz, nowMs))
  const started = live.filter(e => e.status === 'open')
  if (started.length) return pickDefaultEventByTime(started, tz)
  const approved = live.filter(e => e.status === 'confirmed')
  if (approved.length) return pickDefaultEventByTime(approved, tz)
  return null
}

/** Minutes of [start, end) on the candidate's timeline; null without both times. */
function windowOn(e: TimedEvent, dayOff: number): [number, number] | null {
  const s = clockMins(e.start_time), en = clockMins(e.end_time)
  if (s == null || en == null) return null
  return [s + dayOff * 1440, en + (crossesMidnight(e.start_time, e.end_time) ? 1440 : 0) + dayOff * 1440]
}

/** True when the two events' time windows overlap (half-open), across midnight too. */
export function timesOverlap(a: TimedEvent, b: TimedEvent): boolean {
  const wa = windowOn(a, 0)
  const wb = windowOn(b, daysBetween(a.event_date, b.event_date))
  return !!wa && !!wb && wa[0] < wb[1] && wb[0] < wa[1]
}

/**
 * The approved or started events that `candidate` (an unconfirmed event) overlaps IN TIME. Built on detectEventConflicts —
 * which already compares only confirmed/open events, same date or a neighbouring overnight one. Its 'review' kind (same
 * venue, DIFFERENT time) is kept only when the times still overlap: the question here is "two at once", not "same venue".
 */
export function approvedOverlaps<T extends ConflictEvent>(candidate: ConflictEvent, all: T[], addressFormat?: string | null): T[] {
  if (candidate.status !== 'unconfirmed') return []
  const byId = new Map(all.map(e => [e.id, e]))
  return detectEventConflicts(candidate, all, addressFormat)
    .filter(c => c.kind !== 'review' || timesOverlap(candidate, c.event))
    .map(c => byId.get(c.event.id))
    .filter((e): e is T => !!e)
}

/** Of several overlapping events, the one to name: the most orders; on a tie a started one, then the earliest start. */
export function overlapTarget<T extends ConflictEvent>(overlaps: T[], counts: Record<string, number> | null | undefined): T | null {
  if (!overlaps.length) return null
  const n = (e: T) => counts?.[e.id] ?? 0
  return [...overlaps].sort((a, b) =>
    n(b) - n(a)
    || (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1)
    || (clockMins(a.start_time) ?? 0) - (clockMins(b.start_time) ?? 0)
    || a.id.localeCompare(b.id))[0]
}

/* ══ events-overlap-5: THE STAFF EVENT LIST, GROUPED BY DATE, DUPLICATES UNDER THEIR APPROVED EVENT ══════════════════════
 * Anchors are the APPROVED events — open, confirmed and closed. An unconfirmed event that overlaps an anchor (the same
 * detectEventConflicts test; a closed anchor is compared as approved) is not listed on its own: it is attached under the
 * anchor it overlaps with the most orders (overlapTarget's order: most orders, then started, then earliest start). An
 * unconfirmed event that overlaps no anchor is listed on its own. Each date's items are in start-time order. Pure. */
export type ListEvent = ConflictEvent & { status: string }
export type ListDuplicate<T> = { event: T; sameTime: boolean }
export type ListItem<T> = { event: T; duplicates: ListDuplicate<T>[] }
export type ListDay<T> = { date: string; items: ListItem<T>[] }

const isAnchor = (s: string | null | undefined) => s === 'open' || s === 'confirmed' || s === 'closed'

export function buildEventListGroups<T extends ListEvent>(events: T[], counts: Record<string, number> | null | undefined, addressFormat?: string | null): ListDay<T>[] {
  const anchors = events.filter(e => isAnchor(e.status))
  // detectEventConflicts compares confirmed/open only; a closed anchor is presented as approved so it can hold duplicates.
  const asApproved = anchors.map(a => (a.status === 'closed' ? { ...a, status: 'confirmed' } : a))
  const byId = new Map(anchors.map(a => [a.id, a]))
  const attached = new Map<string, ListDuplicate<T>[]>()
  const standalone: T[] = []
  for (const e of events) {
    if (isAnchor(e.status)) continue
    if (e.status !== 'unconfirmed') { standalone.push(e); continue }
    const hits = approvedOverlaps(e, asApproved, addressFormat).map(h => byId.get(h.id)!).filter(Boolean)
    const target = overlapTarget(hits, counts)
    if (!target) { standalone.push(e); continue }
    const same = e.event_date === target.event_date && clockMins(e.start_time) === clockMins(target.start_time) && clockMins(e.end_time) === clockMins(target.end_time)
    const list = attached.get(target.id) ?? []
    list.push({ event: e, sameTime: same })
    attached.set(target.id, list)
  }
  const startKey = (e: T) => clockMins(e.start_time) ?? 24 * 60
  const items = [...anchors, ...standalone].map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.event_date.localeCompare(b.e.event_date) || startKey(a.e) - startKey(b.e) || a.i - b.i)
  const days: ListDay<T>[] = []
  for (const { e } of items) {
    let day = days[days.length - 1]
    if (!day || day.date !== e.event_date) { day = { date: e.event_date, items: [] }; days.push(day) }
    const dups = (attached.get(e.id) ?? []).slice().sort((a, b) => startKey(a.event) - startKey(b.event))
    day.items.push({ event: e, duplicates: dups })
  }
  return days
}

/** True when today's events (an overnight one from yesterday included) exist and NONE is approved — every one is still
 *  unconfirmed. The dashboard then selects nothing and says "Approve an event to take orders". */
export function onlyUnapprovedToday<T extends TimedEvent>(events: T[], tz: string, nowMs: number = Date.now()): boolean {
  const today = localDateOfInstant(new Date(nowMs), tz)
  const todays = (events ?? []).filter(e => e.status !== 'cancelled' && eventDates(e.event_date, e.start_time, e.end_time).includes(today))
  return todays.length > 0 && todays.every(e => e.status === 'unconfirmed')
}

/** The dashboard's default: nothing when today has only unapproved events (rule 1's carve-out), else pickDefaultApprovedEvent. */
export function pickDashboardDefaultEvent<T extends TimedEvent>(events: T[], tz: string, nowMs: number = Date.now()): T | null {
  if (onlyUnapprovedToday(events, tz, nowMs)) return null
  return pickDefaultApprovedEvent(events, tz, nowMs)
}
