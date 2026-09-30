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
      /** 🔴 How long they have been waiting, in whole days. The banner leads with it. */
      waitingDays: number
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

/** The London calendar date of an instant, as 'YYYY-MM-DD'. ⚠️ The same zone every other date on
 *  these screens is printed in, so "waiting 2 days" agrees with the dates beside it. */
export function ymdOf(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d)
  const g = (t: string) => p.find(x => x.type === t)?.value ?? ''
  return `${g('year')}-${g('month')}-${g('day')}`
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
    // ⚠️ IN WHOLE DAYS, FROM THE CALENDAR IN LONDON, so "waiting 2 days" agrees with the dates
    // printed beside it rather than with a 48-hour clock.
    const waitingDays = waiting.message_date
      ? daysLate(ymdOf(waiting.message_date), input.today)
      : 0
    return {
      kind: 'reply',
      messageId: waiting.id,
      label: `${who} replied${when ? ` ${when}` : ''} — waiting for you`,
      cta: 'Reply →',
      waitingDays,
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

// ── THE COMPOSER'S OPENING STATE ────────────────────────────────────────────────────────────────────
/**
 * 🔴 THE COMPOSER IS ALWAYS OPEN, SO IT MUST OPEN ON THE RIGHT THING. The previous page had four
 * buttons and nothing open; this one is a writing surface with the email already set up, which is
 * only an improvement if "set up" means set up for the action the Next line just named. One
 * derivation feeds both: the banner and the composer read the SAME `NextAction`.
 */
export type ComposerMode =
  /** Answer a specific inbound message. */
  | { mode: 'reply'; replyToMessageId: string; templateKind: null }
  /** Send the rung the ladder says is next, on that rung's own template. */
  | { mode: 'chase'; replyToMessageId: null; templateKind: string | null }
  /** Write in the existing thread with no template — a follow-up, or a prospect who has replied. */
  | { mode: 'thread'; replyToMessageId: null; templateKind: null }
  /** Nobody has been emailed yet: a new thread on the first-contact template. */
  | { mode: 'first'; replyToMessageId: null; templateKind: string }

/** The first rung, named once. ⚠️ It is `CONTACT_KINDS[0]`'s value and the harness pins them equal. */
export const FIRST_CONTACT_KIND = '1_first_contact'

/**
 * What the composer opens as.
 * 🔴 IT READS THE NEXT LINE AND NOTHING ELSE. `nextAction` already ordered the possibilities against
 * the shared predicate, the derived step and the follow-up date; asking those questions again here
 * would be the second derivation §57.1 forbids, and the banner and the box could then disagree about
 * what this prospect needs — which is worse than either being wrong on its own.
 */
export function composerDefault(next: NextAction | null, opts: { everEmailed: boolean }): ComposerMode {
  if (next?.kind === 'reply') return { mode: 'reply', replyToMessageId: next.messageId, templateKind: null }
  if (next?.kind === 'chase') return { mode: 'chase', replyToMessageId: null, templateKind: next.rung }
  // ⚠️ A FOLLOW-UP, A REPLIED PROSPECT, OR NOTHING DUE all write into the existing conversation with
  // no template — there is no rung to pick one from, and a chase template under a "just following
  // up" would be the wrong email.
  if (opts.everEmailed) return { mode: 'thread', replyToMessageId: null, templateKind: null }
  return { mode: 'first', replyToMessageId: null, templateKind: FIRST_CONTACT_KIND }
}

// ── LOGGING IN ONE CLICK ────────────────────────────────────────────────────────────────────────────
/** The four buttons, and exactly what each writes. The `message` is the button's own words. */
export const ONE_CLICK_LOGS = [
  { id: 'no_answer', label: 'Called — no answer', channel: 'phone', message: 'Called — no answer' },
  { id: 'spoke', label: 'Called — spoke', channel: 'phone', message: 'Called — spoke' },
  { id: 'voicemail', label: 'Left voicemail', channel: 'phone', message: 'Left voicemail' },
  { id: 'whatsapp', label: 'WhatsApp sent', channel: 'whatsapp', message: 'WhatsApp sent' },
] as const
export type OneClickLog = (typeof ONE_CLICK_LOGS)[number]

/**
 * The `kind` a one-click log is written with.
 *
 * 🔴 THIS IS A BUG FIX, NOT A NEW RULE. The log form defaulted to the first rung whenever the
 * dropdown had not been touched, so a call to a prospect who had ALREADY REPLIED was recorded as a
 * first contact — and §57 derives the next step from exactly that column. §57.3 records the same
 * failure from the template path ("a chaser sent to Pizza Mondo was logged as a FIRST CONTACT").
 *
 * 🔴 THE RULE, IN ORDER:
 *   • they have replied  ⇒ `reply`. Their reply already ended the sequence; a rung would restart it.
 *   • mid-sequence       ⇒ the rung `nextStep` says is next. That IS the derivation, read not redone.
 *   • anything else — a stopped, complete or unreadable step ⇒ `reply`, which is the one kind that
 *     is recognised and is NOT a rung, so it records the contact without moving a ladder nobody can
 *     currently read.
 * ⚠️ IT NEVER RETURNS A KIND `nextStep` WOULD NOT RECOGNISE. That is the whole point: a blind row is
 * what makes a step 'unknown', and this is a writer.
 */
export function oneClickKind(step: Step | null, hasReplied: boolean): string {
  if (hasReplied) return 'reply'
  if (step && (step.state === 'due' || step.state === 'scheduled') && step.kind) return step.kind
  return 'reply'
}

// ── ONE FOLLOW-UP CONTROL ───────────────────────────────────────────────────────────────────────────
export const FOLLOW_UP_CHOICES = ['tomorrow', '3_days', '1_week', 'pick', 'none'] as const
export type FollowUpChoice = (typeof FOLLOW_UP_CHOICES)[number]
export const FOLLOW_UP_LABEL: Record<FollowUpChoice, string> = {
  tomorrow: 'Tomorrow', '3_days': '+3 days', '1_week': '+1 week', pick: 'Pick', none: 'None',
}
const FOLLOW_UP_DAYS: Partial<Record<FollowUpChoice, number>> = { tomorrow: 1, '3_days': 3, '1_week': 7 }

/** 'YYYY-MM-DD' n days after a 'YYYY-MM-DD'. Calendar arithmetic, anchored at midday to clear DST. */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const at = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0))
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/** The date a chip produces. Null for None; null for Pick until a date is chosen. */
export function followUpDateForChoice(choice: FollowUpChoice, today: string): string | null {
  const days = FOLLOW_UP_DAYS[choice]
  return days == null ? null : addDays(today, days)
}

/**
 * Which chip is selected when the page opens.
 *
 * 🔴 IT IS WHATEVER `followUpDateFor` WOULD WRITE FOR THE ACTION BEING TAKEN, and that function is
 * passed IN rather than reimplemented — it is the one rule for follow-up intervals and it already
 * writes `next_action_at` on every log. A second table of intervals here would drift the first time
 * one changed, and the drift would be invisible: the chip would say one date and the server would
 * store another.
 * ⚠️ NO MATCH ⇒ `pick`, holding the exact date, rather than a chip that silently rounds it.
 */
export function defaultFollowUpChoice(
  kind: string | null,
  today: string,
  followUpDateFor: (kind: string, from: string) => string | null,
): { choice: FollowUpChoice; date: string | null } {
  const due = kind ? followUpDateFor(kind, today) : null
  if (!due) return { choice: 'none', date: null }
  for (const c of ['tomorrow', '3_days', '1_week'] as const) {
    if (followUpDateForChoice(c, today) === due) return { choice: c, date: due }
  }
  return { choice: 'pick', date: due }
}

// ── THE EMAIL FRAME ─────────────────────────────────────────────────────────────────────────────────
/**
 * How tall an opened email's frame should be.
 *
 * 🔴 SIZED TO ITS CONTENT, CAPPED AT 80% OF THE WINDOW. A fixed 320px box was the complaint: a
 * three-line reply wasted two thirds of it and a real email scrolled inside a letterbox. Above the
 * cap the frame scrolls internally, because a frame taller than the window makes the PAGE scroll
 * past the row it belongs to.
 * ⚠️ A FLOOR OF 120px, so a frame that reports nothing (a body that has not painted yet) is still
 * visibly a frame rather than a line.
 */
export const FRAME_MAX_FRACTION = 0.8
export const FRAME_MIN_PX = 120
export function frameHeight(contentPx: number, viewportPx: number): number {
  const cap = Math.max(FRAME_MIN_PX, Math.floor(viewportPx * FRAME_MAX_FRACTION))
  if (!Number.isFinite(contentPx) || contentPx <= 0) return FRAME_MIN_PX
  return Math.min(cap, Math.max(FRAME_MIN_PX, Math.ceil(contentPx)))
}

/**
 * 🔴 THE SANDBOX, AND WHY THIS ONE TOKEN IS SAFE.
 * The frame must be measured to be sized, and measuring means reading `document.body.scrollHeight`
 * inside it — which a frame with an opaque origin cannot expose. `allow-same-origin` gives the frame
 * our origin back and NOTHING ELSE: no `allow-scripts`, so nothing in the document can run, and a
 * document that cannot run code cannot use the origin it has been given. The two tokens are only
 * dangerous TOGETHER — that pair lets a frame remove its own sandbox — which is exactly why the list
 * below is a constant with a test standing on it rather than a string typed at each call site.
 * ⚠️ NO `allow-forms` AND NO `allow-popups` EITHER: a quoted email can carry a form, and a message we
 * are only reading has no business submitting or opening anything.
 */
export const EMAIL_FRAME_SANDBOX = 'allow-same-origin'
export const FORBIDDEN_SANDBOX_TOKENS = ['allow-scripts', 'allow-forms', 'allow-popups', 'allow-top-navigation'] as const
export const sandboxIsSafe = (value: string): boolean =>
  !FORBIDDEN_SANDBOX_TOKENS.some(t => String(value ?? '').includes(t))

// ── BREAKPOINTS ─────────────────────────────────────────────────────────────────────────────────────
/**
 * 🔴 ONE LAYOUT FOR A LAPTOP AND A 27" MONITOR. Three columns from 1024px up, and the side columns
 * are FIXED — they hold cards and buttons whose ideal width does not change with the window, so
 * every extra pixel goes to the email. A fourth column on a wide screen would be a different page to
 * learn at a different desk.
 */
/**
 * 🔴 THE LEFT COLUMN IS THE WIDE ONE, and that is a correction. It was 300px, the same as the right,
 * and it holds prose — "About this truck", a note being written, an address — where the right holds
 * buttons. 380px is about 55 characters at 13px, which is a readable line; 300px was 43 and wrapped
 * every address.
 * ⚠️ 1280 IS WHERE THE WIDTHS STEP, NOT WHERE THE COLUMNS DO. Three columns still start at 1024
 * (`THREE_COL_AT_PX`), and between 1024 and 1279 they take the narrow pair — that band is a small
 * laptop and giving the sides 700px of a 1024px window would leave 320px for the email.
 */
export const COL_LEFT_PX = 380
export const COL_LEFT_WIDE_PX = 420
export const COL_RIGHT_PX = 280
export const COL_RIGHT_WIDE_PX = 320
/** ⚠️ 1920, not 1800: it is the width of the monitor this is for, and a round number to reason about. */
export const WIDE_AT_PX = 1920
export const THREE_COL_AT_PX = 1024
export const TWO_COL_AT_PX = 768
/** ⚠️ Apple's own minimum, and the reason the phone layout has no small buttons. */
export const TOUCH_TARGET_PX = 44
