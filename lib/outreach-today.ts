// lib/outreach-today.ts — what is actually waiting, in the order it should be done.
//
// 🔴 FOUR SECTIONS, AND EACH ONE ANSWERS A DIFFERENT QUESTION. "Someone wrote to me" is not "I said I
// would chase this one today", and neither is "an email I sent went wrong". Merged into a single list
// they would be sorted against each other by a date that means something different in each.
//
// 🔴 NOTHING HERE DERIVES A STEP. `nextStep` (§57) is the one derivation and it is passed IN, already
// computed, by the caller that also renders the list. A second derivation — even "just the due date"
// — is the thing §57.1 says does not exist, and it would drift the first time an interval changed.
//
// ⚠️ PURE. Rows in, sections out. The harness stands it on a fixed `today` and a fixed clock.
import type { Step } from '@/lib/outreach-step'

export interface WaitingReply {
  /** The `outreach_messages` row. */
  id: string
  prospect_id: string
  prospect_name: string | null
  /** Already trimmed to ~140 characters by `replySnippet`. */
  snippet: string
  message_date: string | null
}

export interface ProblemEmail {
  id: string
  prospect_id: string
  prospect_name: string | null
  status: string
  subject: string | null
  message_date: string | null
  last_error: string | null
}

export interface TodayProspect {
  id: string
  name: string | null
  /** 🔴 DERIVED BY `nextStep`, UPSTREAM. Never recomputed here. */
  step: Step
  /** `channelFor(p) !== null`. ⚠️ `channelFor`, never `step.channel` — see §57.2. */
  channel: 'email' | 'whatsapp' | null
  next_action_at: string | null
}

export interface ChaserDue {
  prospect_id: string
  name: string | null
  /** The rung's own label, from the step. */
  label: string
  kind: string | null
  dueOn: string | null
  daysOverdue: number
  channel: 'email' | 'whatsapp' | null
}

export interface FollowUpDue {
  prospect_id: string
  name: string | null
  due: string
  daysOverdue: number
}

export interface TodayView {
  replies: WaitingReply[]
  chasers: ChaserDue[]
  followUps: FollowUpDue[]
  problems: ProblemEmail[]
  /** Every row across the four sections — what the tab counts. */
  total: number
}

/** Whole days between two 'YYYY-MM-DD' dates, never negative. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

export function buildToday(input: {
  waiting: readonly WaitingReply[]
  prospects: readonly TodayProspect[]
  problems: readonly ProblemEmail[]
  /** 'YYYY-MM-DD' in Europe/London. Passed in so the answer does not depend on the device's clock. */
  today: string
}): TodayView {
  // (a) 🔴 OLDEST FIRST. A reply that has been waiting three days outranks one from this morning;
  // newest-first is right for a history and wrong for a queue.
  const replies = [...input.waiting].sort((a, b) =>
    String(a.message_date ?? '') < String(b.message_date ?? '') ? -1
      : String(a.message_date ?? '') > String(b.message_date ?? '') ? 1 : 0)

  // (b) 🔴 CONTACTABLE AND DUE. `step.state === 'due'` covers "due today" and "overdue" — the state
  // is computed against the same calendar. ⚠️ A prospect with no channel is not work: the queue's own
  // gate (§57.2) leaves it on the "needs details" list, and Today must not contradict that.
  const chasers: ChaserDue[] = input.prospects
    .filter(p => p.step.state === 'due' && p.channel !== null)
    .map(p => ({
      prospect_id: p.id,
      name: p.name,
      label: p.step.label,
      kind: p.step.kind,
      dueOn: p.step.dueOn,
      // A never-contacted prospect has no due date — it is due now, not overdue.
      daysOverdue: p.step.dueOn ? daysBetween(p.step.dueOn, input.today) : 0,
      channel: p.channel,
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || (a.name ?? '').localeCompare(b.name ?? ''))

  // (c) ⚠️ ONLY WHAT IS NOT ALREADY ABOVE. A prospect whose reply is waiting, or whose chase is due,
  // is already on the screen once; a second row for the same truck is a second job that does not exist.
  const already = new Set<string>([
    ...replies.map(r => r.prospect_id),
    ...chasers.map(c => c.prospect_id),
  ])
  const followUps: FollowUpDue[] = input.prospects
    .filter(p => !already.has(p.id) && !!p.next_action_at && p.next_action_at <= input.today)
    .map(p => ({
      prospect_id: p.id,
      name: p.name,
      due: p.next_action_at as string,
      daysOverdue: daysBetween(p.next_action_at as string, input.today),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || (a.name ?? '').localeCompare(b.name ?? ''))

  // (d) Newest first: an email that failed a minute ago is the one to look at.
  const problems = [...input.problems].sort((a, b) =>
    String(a.message_date ?? '') < String(b.message_date ?? '') ? 1
      : String(a.message_date ?? '') > String(b.message_date ?? '') ? -1 : 0)

  return {
    replies, chasers, followUps, problems,
    total: replies.length + chasers.length + followUps.length + problems.length,
  }
}

/** The outbound statuses that need a person. 🔴 The same three the Emails list already acts on. */
export const PROBLEM_STATUSES = ['failed', 'uncertain', 'bounced'] as const
export const PROBLEM_LABEL: Record<string, string> = {
  failed: 'Failed — nothing reached them',
  uncertain: 'May have been sent — check Sent before retrying',
  bounced: 'Bounced — check the address',
}
