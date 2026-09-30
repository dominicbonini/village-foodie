// lib/outreach-workspace.ts — the decisions the prospect workspace makes, outside React.
//
// 🔴 THE PAGE IS LAYOUT; THIS IS THE THINKING. "What is the next thing to do with this truck", "which
// badges does a timeline row deserve", "does this row match the filter" — each is a rule, and a rule
// written inside a component cannot be tested without a browser. The workspace renders what these
// functions return.
//
// 🔴 AND NOTHING HERE DERIVES A STEP. `nextStep` (§57.1) is the one derivation in the codebase and it
// is passed IN, already computed. `needsAttention` (Part 1) is the one answer to "is this reply
// waiting" and it is imported, not restated. This module ORDERS existing answers; it invents none.
import type { Step } from '@/lib/outreach-step'
import { needsAttention, type AttentionRow } from '@/lib/outreach-attention'

// ── THE FOCUS LINE ──────────────────────────────────────────────────────────────────────────────────
/** A timeline message, as the Next line needs to read it. */
export interface NextActionMessage extends AttentionRow {
  id: string
  from_address?: string | null
  subject?: string | null
  message_date?: string | null
}

export type NextAction =
  | {
      kind: 'reply'
      /** The `outreach_messages` row to answer. */
      messageId: string
      label: string
      cta: string
    }
  | { kind: 'chase'; rung: string | null; label: string; cta: string; dueOn: string | null; daysOverdue: number }
  | { kind: 'follow_up'; due: string; label: string; cta: string; daysOverdue: number }
  | { kind: 'none'; label: string; reason: string | null; cta: null }

/** "15 Sep". Short because the line is a sentence, not a table cell. */
export function shortDate(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }).format(d)
}

/** Whole days between two 'YYYY-MM-DD' dates, never negative. Same rule the Today screen uses. */
export function daysLate(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

/** The stop reasons, in the words the Focus line uses. */
export const STOP_WORDS: Record<string, string> = {
  do_not_contact: 'Do not contact',
  replied: 'Replied',
  stage: 'Stage is terminal',
  converted: 'Now a HatchGrab truck',
  sequence_complete: 'Sequence finished',
}

/**
 * The ONE thing to do next with this truck.
 *
 * 🔴 FIRST MATCH WINS, AND THE ORDER IS THE DESIGN — somebody waiting on an answer outranks a chase
 * this app decided was due, which outranks a date Dominic wrote down for himself. Showing all three
 * would be the modal's problem again: everything at equal weight and nothing decided.
 * ⚠️ PURE, AND EVERY INPUT IS PASSED IN — the clock included — so the harness can stand it on a date.
 */
export function nextAction(input: {
  /** This prospect's inbound messages, as the timeline holds them. */
  messages: readonly NextActionMessage[]
  /** From `nextStep`. Null when it could not be derived (no step is not an error). */
  step: Step | null
  /** `channelFor(p)`, never `step.channel` — §57.2. A chase with no channel is not work. */
  channel: 'email' | 'whatsapp' | null
  nextActionAt: string | null
  /** `discovery_trucks.hatchgrab_truck_id` is set: a customer, not a prospect. */
  linkedTruck: boolean
  now: Date
  /** 'YYYY-MM-DD' in Europe/London. */
  today: string
  /** For the sentence: "Stephen replied 15 Sep". Falls back to the address, then to "They". */
  contactName?: string | null
}): NextAction {
  // (1) 🔴 A PERSON IS WAITING. The oldest unanswered reply, by the shared predicate.
  const waiting = input.messages
    .filter(m => needsAttention(m, { now: input.now, linkedTruck: input.linkedTruck }))
    .sort((a, b) => String(a.message_date ?? '') < String(b.message_date ?? '') ? -1 : 1)[0]
  if (waiting) {
    const who = (input.contactName ?? '').trim() || (waiting.from_address ?? '').trim() || 'They'
    const when = shortDate(waiting.message_date)
    return {
      kind: 'reply',
      messageId: waiting.id,
      label: `${who} replied${when ? ` ${when}` : ''} — waiting for you`,
      cta: 'Reply →',
    }
  }

  // (2) THE DERIVED CHASE. ⚠️ `state === 'due'` covers today and overdue; the channel gate is §57.2's.
  if (input.step && input.step.state === 'due' && input.channel) {
    const dueOn = input.step.dueOn
    const late = dueOn ? daysLate(dueOn, input.today) : 0
    const due = dueOn ? ` due ${shortDate(dueOn)}` : ''
    const over = late > 0 ? ` · ${late} day${late === 1 ? '' : 's'} overdue` : ''
    return {
      kind: 'chase',
      rung: input.step.kind,
      label: `${input.step.label}${due}${over}`,
      cta: `Send ${input.step.label} →`,
      dueOn, daysOverdue: late,
    }
  }

  // (3) THE DATE HE WROTE DOWN HIMSELF.
  if (input.nextActionAt && input.nextActionAt <= input.today) {
    const late = daysLate(input.nextActionAt, input.today)
    return {
      kind: 'follow_up',
      due: input.nextActionAt,
      label: `Follow up due ${shortDate(input.nextActionAt)}${late > 0 ? ` · ${late} day${late === 1 ? '' : 's'} overdue` : ''}`,
      cta: 'Follow up →',
      daysOverdue: late,
    }
  }

  // (4) NOTHING — and WHY, when there is a reason. "No next step" alone reads as a bug.
  const reason = input.step?.stopReason ? (STOP_WORDS[input.step.stopReason] ?? null) : null
  return { kind: 'none', label: 'No next step', reason, cta: null }
}

// ── THE TIMELINE ROW ────────────────────────────────────────────────────────────────────────────────
/**
 * 🔴 BADGES ARE FOR THINGS THAT NEED DOING OR WENT WRONG, AND NOTHING ELSE.
 * Every row used to carry a status word — Sent, Reply, imported, from Outlook — which meant the
 * column was noise on every line and therefore read as noise on the lines that mattered. Direction is
 * already in the icon and the tint; provenance is in the expanded row's details line. What is left
 * here is exactly the set a person must act on or explain.
 */
export type RowBadge = 'waiting' | 'bounced' | 'failed' | 'uncertain' | 'auto_reply' | 'test'

export const BADGE_LABEL: Record<RowBadge, string> = {
  waiting: 'Waiting',
  bounced: 'Bounced',
  failed: 'Failed',
  uncertain: 'May have been sent',
  auto_reply: 'Auto-reply',
  test: 'test',
}

/** The badges this message row earns. Order is the order they render in. */
export function rowBadges(
  m: AttentionRow,
  opts: { now: Date; linkedTruck: boolean; showTests: boolean },
): RowBadge[] {
  const out: RowBadge[] = []
  if (needsAttention(m, { now: opts.now, linkedTruck: opts.linkedTruck })) out.push('waiting')
  if (m.status === 'bounced' || m.status === 'bounce') out.push('bounced')
  if (m.status === 'failed') out.push('failed')
  if (m.status === 'uncertain') out.push('uncertain')
  if (m.status === 'auto_reply') out.push('auto_reply')
  // ⚠️ ONLY WHILE TESTS ARE SHOWN. With the toggle off there are no test rows to mark.
  if (m.is_test === true && opts.showTests) out.push('test')
  return out
}

// ── FILTERING AND SEARCHING ─────────────────────────────────────────────────────────────────────────
export const TIMELINE_FILTERS = ['all', 'conversation', 'notes'] as const
export type TimelineFilter = (typeof TIMELINE_FILTERS)[number]
export const isTimelineFilter = (v: unknown): v is TimelineFilter =>
  typeof v === 'string' && (TIMELINE_FILTERS as readonly string[]).includes(v)

export const TIMELINE_FILTER_LABEL: Record<TimelineFilter, string> = {
  all: 'All',
  conversation: 'Conversation',
  notes: 'Notes & changes',
}

/** Which chip a timeline item belongs under. 🔴 What was SAID vs what was RECORDED. */
export function itemGroup(item: { type: string }): 'conversation' | 'notes' {
  return item.type === 'event' ? 'notes' : 'conversation'
}

/**
 * Does this item match the filter and the search box?
 * ⚠️ THE SEARCH IS CLIENT-SIDE, OVER WHAT IS ALREADY LOADED — the subject and the stored preview of an
 * email, the message of a contact, the body of a note. It is not a mailbox search and does not pretend
 * to be: a body that was never stored cannot be matched, and the timeline says so where that is true.
 */
export function matchesTimelineQuery(
  item:
    | { type: 'email'; message: { subject?: string | null; preview?: string | null } }
    | { type: 'contact'; contact: { message?: string | null; kind?: string | null; channel?: string | null } }
    | { type: 'event'; event: { body?: string | null; to_stage?: string | null; from_stage?: string | null } },
  filter: TimelineFilter,
  query: string,
): boolean {
  if (filter !== 'all' && itemGroup(item) !== filter) return false
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return true
  const hay = item.type === 'email'
    ? `${item.message.subject ?? ''} ${item.message.preview ?? ''}`
    : item.type === 'contact'
      ? `${item.contact.kind ?? ''} ${item.contact.channel ?? ''} ${item.contact.message ?? ''}`
      : `${item.event.body ?? ''} ${item.event.from_stage ?? ''} ${item.event.to_stage ?? ''}`
  return hay.toLowerCase().includes(q)
}

// ── KEYBOARD ────────────────────────────────────────────────────────────────────────────────────────
/**
 * 🔴 A SHORTCUT MUST NEVER FIRE WHILE SOMEBODY IS TYPING. "n" in the middle of a note would open
 * another note; "e" in an email address would open the composer. The test is the event's target, not
 * a flag the page tries to keep in step with focus.
 * ⚠️ `isContentEditable` IS THE ONE THAT MATTERS HERE: the message editor is a ProseMirror surface,
 * not a <textarea>, so a tag-name test alone would let every shortcut fire inside the email body.
 */
export function isTypingTarget(target: unknown): boolean {
  const el = target as { tagName?: unknown; isContentEditable?: unknown } | null
  if (!el || typeof el !== 'object') return false
  if (el.isContentEditable === true) return true
  const tag = String(el.tagName ?? '').toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export interface Shortcut { keys: string; does: string }
/** The list `?` shows, and the source of every tooltip suffix. */
export const SHORTCUTS: Shortcut[] = [
  { keys: 'J / K', does: 'Next / previous prospect in this queue' },
  { keys: 'E', does: 'Email' },
  { keys: 'R', does: 'Reply to the waiting message' },
  { keys: 'N', does: 'Note' },
  { keys: 'C', does: 'Log call' },
  { keys: 'Enter', does: 'Go to the next item in the queue' },
  { keys: 'Esc', does: 'Close the composer or the expanded row' },
  { keys: '?', does: 'Show this list' },
]
