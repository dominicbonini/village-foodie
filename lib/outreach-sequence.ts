// lib/outreach-sequence.ts — the sequence grid, and the guards that stop a truck getting the same
// email twice.
//
// 🔴 ONE TEMPLATE PER BOX, AND THE BOX IS (channel, step, lead type). The old rule was a hardcoded
// slug map (`STEP_TEMPLATE`) with tagged templates layered over it: four rungs × two channels in
// code, plus `serves_kind` / `serves_lead_type` on the rows, plus `suggestTemplateId`'s own
// heuristic — three mechanisms that could disagree about which template a step gets, and did. This
// is one table read by one function.
//
// 🔴 THE RESOLUTION ORDER IS THE WHOLE DESIGN: the truck's OWN column, else the row's default
// column ('any'), else nothing. "Nothing" is a real answer and is shown as one; it is never a
// silent fallback to a template nobody chose for that box.
//
// ⚠️ `serves_kind` AND `serves_lead_type` ARE NO LONGER READ TO CHOOSE A TEMPLATE. The columns stay
// (they are history on rows Dominic tagged by hand, and the Templates tab still shows them
// read-only as "Used in"), but `chooseTemplate` never looks at them. Every reader that changed is
// listed in docs/outreach-sequence-report.md.

import { CONTACT_KINDS, type LadderKind } from '@/lib/outreach'
import { LEAD_TYPES, type LeadType, type Step } from '@/lib/outreach-step'

/** The default column. Not a lead type — a fifth value this table alone uses. */
export const ANY_LEAD = 'any' as const
export type SlotLeadType = LeadType | typeof ANY_LEAD
export const SLOT_LEAD_TYPES: readonly SlotLeadType[] = [ANY_LEAD, ...LEAD_TYPES]

export type SlotChannel = 'email' | 'whatsapp'
export const SLOT_CHANNELS: readonly SlotChannel[] = ['email', 'whatsapp']

/** One box. `template_id` is the templates table's uuid, never the slug — see the report. */
export interface SequenceSlot {
  channel: string
  step: string
  lead_type: string
  template_id: string
  updated_at?: string | null
}

/** What `chooseTemplate` needs to know about a template. The shape the tab and the page already hold. */
export interface SlotTemplate {
  /** The row uuid — what a slot points at. */
  uuid: string
  /** The slug. It is what the composer selects by, and what every older path names. */
  slug: string
  label: string
  channel: string
  active: boolean
}

export const isSlotLeadType = (v: unknown): v is SlotLeadType =>
  v === ANY_LEAD || (LEAD_TYPES as readonly string[]).includes(v as string)
export const isSlotStep = (v: unknown): v is LadderKind =>
  (CONTACT_KINDS as readonly string[]).includes(v as string)
export const isSlotChannel = (v: unknown): v is SlotChannel => v === 'email' || v === 'whatsapp'

/** The key a box is addressed by, in one place, so the grid and the lookup cannot disagree. */
export const slotKey = (channel: string, step: string, leadType: string): string =>
  `${channel}|${step}|${leadType}`

export const indexSlots = (slots: readonly SequenceSlot[]): Map<string, SequenceSlot> => {
  const m = new Map<string, SequenceSlot>()
  // ⚠️ LAST WRITE WINS ONLY IF THE DATABASE LETS TWO EXIST, AND IT DOES NOT: the table carries
  // `unique (channel, step, lead_type)`. This is defensive, not a policy.
  for (const s of slots) m.set(slotKey(s.channel, s.step, s.lead_type), s)
  return m
}

/** Why a box resolves to nothing, or to something that cannot be sent. Null ⇒ it resolved cleanly. */
export type SlotMiss =
  | 'no_step'          // the prospect has no rung: stopped, replied, unknown
  | 'no_channel'       // no way to reach them
  | 'unknown_type'     // the lead type is not one of the four
  | 'empty'            // no template in this box and none in the default column
  | 'inactive'         // the box points at a retired template
  | 'wrong_channel'    // the box points at a template of the other channel
  | null

export interface ChosenTemplate {
  /** The template to pre-select, or null. The SLUG, because that is what the composer selects by. */
  slug: string | null
  uuid: string | null
  label: string | null
  /** True when this came from the default column rather than the truck's own. */
  inherited: boolean
  miss: SlotMiss
}

const NOTHING = (miss: SlotMiss): ChosenTemplate =>
  ({ slug: null, uuid: null, label: null, inherited: false, miss })

/**
 * 🔴 THE ONE CHOICE FUNCTION. Own column, then the default column, then nothing.
 *
 * ⚠️ A BOX POINTING AT AN INACTIVE OR WRONG-CHANNEL TEMPLATE RESOLVES TO NOTHING, WITH A REASON —
 * it does NOT fall through to the default column. Falling through would quietly send the default
 * template to a segment somebody had deliberately given its own words, and the difference between
 * "this box is empty" and "this box is broken" is the difference between an intention and a
 * mistake. The grid paints the second red.
 */
export function chooseTemplate(input: {
  slots: ReadonlyMap<string, SequenceSlot>
  templates: readonly SlotTemplate[]
  channel: string | null
  step: string | null
  leadType: string | null
}): ChosenTemplate {
  const { slots, templates, channel, step, leadType } = input
  if (!step || !isSlotStep(step)) return NOTHING('no_step')
  if (!channel || !isSlotChannel(channel)) return NOTHING('no_channel')
  if (!leadType || !(LEAD_TYPES as readonly string[]).includes(leadType)) return NOTHING('unknown_type')

  const own = slots.get(slotKey(channel, step, leadType))
  const fallback = slots.get(slotKey(channel, step, ANY_LEAD))
  const slot = own ?? fallback
  if (!slot) return NOTHING('empty')

  const t = templates.find(x => x.uuid === slot.template_id)
  // ⚠️ A SLOT WHOSE TEMPLATE HAS BEEN DELETED READS AS EMPTY, not as an error: the FK makes it
  // impossible in the database, and a client holding a stale list is not a reason to refuse.
  if (!t) return NOTHING('empty')
  if (t.channel !== channel) return { slug: null, uuid: t.uuid, label: t.label, inherited: !own, miss: 'wrong_channel' }
  if (!t.active) return { slug: null, uuid: t.uuid, label: t.label, inherited: !own, miss: 'inactive' }
  return { slug: t.slug, uuid: t.uuid, label: t.label, inherited: !own, miss: null }
}

/** The same question for a whole step, for the composer's one-line explanation. */
export function chooseForStep(input: {
  slots: ReadonlyMap<string, SequenceSlot>
  templates: readonly SlotTemplate[]
  step: Step
}): ChosenTemplate {
  const { slots, templates, step } = input
  // 🔴 THE SAME GATE `templateForStep` USED: a step that is not due or scheduled has no rung, so it
  // has no box. A replied prospect is the common case and it is why the Email tab opens on Blank.
  if (step.state !== 'due' && step.state !== 'scheduled') return NOTHING('no_step')
  return chooseTemplate({ slots, templates, channel: step.channel, step: step.kind, leadType: step.leadType })
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE SEND-TIME GUARDS
// ════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * 🔴 EVERY GUARD IS A PURE FUNCTION HERE AND IS CALLED BY THE SERVER. The composer may show the
 * same answer early, but the decision is the route's: a client that skipped the check, an older tab,
 * or a second window must hit the same wall. Nothing below reads the network or the clock unless it
 * is handed one.
 */

export type GuardId = 'already_sent' | 'not_due' | 'shared_address' | 'after_final' | 'history_unreadable'

export interface Guard {
  id: GuardId
  /** `refuse` cannot be overridden without an explicit flag; `confirm` asks. */
  kind: 'refuse' | 'confirm'
  message: string
}

/** One outbound thing that has already happened, as the guards need to see it. */
export interface PriorSend {
  /** The rung it was logged as, or null when nothing recorded a rung (an email sent from Outlook). */
  kind: string | null
  /** ISO date/time. */
  at: string | null
  /** Where the evidence came from, for the sentence the operator reads. */
  via: 'log' | 'mailbox'
  isTest?: boolean
}

const dayOf = (iso: string | null | undefined): string => String(iso ?? '').slice(0, 10)

export const fmtDay = (iso: string | null | undefined): string => {
  const d = new Date(String(iso ?? ''))
  if (Number.isNaN(d.getTime())) return 'an unknown date'
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

export const daysBetween = (fromIso: string | null | undefined, to: Date): number | null => {
  const d = new Date(String(fromIso ?? ''))
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((to.getTime() - d.getTime()) / 86_400_000)
}

/**
 * 3a — EACH STEP GOES ONCE.
 *
 * 🔴 IT COUNTS THE CONTACT LOG *AND* THE MAILBOX. An email sent from Outlook reaches the ladder only
 * when the prospect has already replied, and then only as `reply` (see the report's 0c) — so a
 * chase sent by hand leaves a `outreach_messages` row and no rung. Both are passed in.
 * ⚠️ AN OUTLOOK EMAIL CARRIES NO STEP, AND THIS DOES NOT INVENT ONE. A prior send with a null kind
 * cannot prove that THIS step has gone, so it never triggers the refusal; it produces the separate
 * `confirm` below, which names the date and says it could not be attributed. Guessing would either
 * block a legitimate first contact or wave through a second chase.
 * ⚠️ TEST SENDS NEVER COUNT — they went to Dominic.
 */
export function guardAlreadySent(input: {
  step: string | null
  priors: readonly PriorSend[]
}): Guard | null {
  const { step, priors } = input
  if (!step || !isSlotStep(step)) return null
  const real = priors.filter(p => p.isTest !== true)
  const same = real.filter(p => p.kind === step)
  if (same.length > 0) {
    const when = same.map(s => s.at).filter(Boolean).sort().reverse()[0] ?? null
    const via = same.find(s => s.at === when)?.via ?? 'log'
    return {
      id: 'already_sent', kind: 'refuse',
      message: `${STEP_LABELS[step as LadderKind]} has already gone to this prospect — ${fmtDay(when)}`
        + (via === 'mailbox' ? ' (found in your Sent folder)' : '')
        + '. Send anyway only if you mean to send it twice.',
    }
  }
  return null
}

/**
 * The companion to 3a for mail this system cannot attribute: an outbound email with no rung. It
 * asks rather than refusing, because it may well be a reply typed in Outlook.
 */
export function guardUnattributed(input: {
  step: string | null
  priors: readonly PriorSend[]
  now: Date
  /** Only mail since the last recorded rung matters; older mail is already accounted for. */
  sinceIso?: string | null
}): Guard | null {
  const { step, priors, now, sinceIso } = input
  if (!step || !isSlotStep(step)) return null
  const loose = priors.filter(p => p.isTest !== true && p.kind == null && p.via === 'mailbox'
    && (!sinceIso || dayOf(p.at) >= dayOf(sinceIso)))
  if (loose.length === 0) return null
  const when = loose.map(s => s.at).filter(Boolean).sort().reverse()[0] ?? null
  const days = daysBetween(when, now)
  return {
    id: 'already_sent', kind: 'confirm',
    message: `An email went to this prospect ${fmtDay(when)}${days == null ? '' : ` (${days} day${days === 1 ? '' : 's'} ago)`}`
      + ' that is not recorded as a step — it was sent from Outlook. Send anyway?',
  }
}

/**
 * 🔴 THE HISTORY COULD NOT BE READ, SO IT ASKS INSTEAD OF REFUSING (2 October 2026).
 *
 * Every guard below is an answer derived from this prospect's own rows. When the read that produces
 * those rows fails — a missing column, a timeout, a dropped connection — there are no rows, and an
 * empty read is INDISTINGUISHABLE FROM "never contacted". That is the shape of the Smother Spudders
 * incident: a Chase 1 send derived `1_first_contact` from a ladder it could not see.
 *
 * 🔴 SO THE READ FAILURE IS NOT SILENT, AND IT IS ALSO NOT A WALL. It used to refuse outright, which
 * is what blocked every real send for a day after the recorded-steps build named a column that does
 * not exist (`outreach_messages.preview`, 42703). A schema slip in a DUPLICATE CHECK should not be
 * able to stop the outreach; the operator knows what they last sent, and the honest thing is to say
 * what could not be checked and let them decide — exactly as `not_due` does.
 *
 * ⚠️ IT CARRIES THE REASON, because "I couldn't check" with no cause is unactionable: a 42703 is a
 * build to fix and a timeout is a retry, and only the code tells them apart. The sentence is stored in
 * `outreach_messages.guard_override` when it is waved, so the reason survives in the record.
 * ⚠️ IT DOES NOT APPLY TO A TEST SEND — the caller never asks, because a test goes to Dominic and
 * counts towards nothing.
 */
export function guardHistoryUnreadable(input: { reason: string | null | undefined }): Guard | null {
  const reason = String(input.reason ?? '').trim()
  if (!reason) return null
  return {
    id: 'history_unreadable', kind: 'confirm',
    message: "I couldn't check this truck's earlier emails, so I can't confirm this step hasn't already"
      + ` gone (reason: ${reason}). Send anyway?`,
  }
}

/**
 * 3b — NOT BEFORE IT IS DUE.
 * ⚠️ A `scheduled` step is one with a date in the future; `due` is one whose date has passed. The
 * step's own `dueOn` is the authority, so this cannot disagree with the banner above it.
 */
export function guardNotDue(input: { step: Step; lastEmailAt: string | null; now: Date }): Guard | null {
  const { step, lastEmailAt, now } = input
  if (step.state !== 'scheduled' || !step.dueOn || !step.kind) return null
  if (dayOf(step.dueOn) <= dayOf(now.toISOString())) return null
  const days = daysBetween(lastEmailAt, now)
  const sinceText = days == null ? 'The last email has no date recorded'
    : `Last email was ${days} day${days === 1 ? '' : 's'} ago`
  return {
    id: 'not_due', kind: 'confirm',
    message: `${sinceText}. ${STEP_LABELS[step.kind]} isn't due until ${fmtDay(step.dueOn)}. Send it now?`,
  }
}

/**
 * 3d — SHARED ADDRESS.
 * ⚠️ CASE-INSENSITIVE, because `Info@` and `info@` are one mailbox, and the same caterer appears
 * twice in the discovery data more often than anybody would like.
 */
export const SHARED_ADDRESS_DAYS = 14
export function guardSharedAddress(input: {
  address: string | null
  others: readonly { prospectName: string; address: string; lastOutboundAt: string | null }[]
  now: Date
}): Guard | null {
  const { address, others, now } = input
  const a = (address ?? '').trim().toLowerCase()
  if (!a) return null
  const hit = others.find(o =>
    o.address.trim().toLowerCase() === a
    && o.lastOutboundAt != null
    && (daysBetween(o.lastOutboundAt, now) ?? 999) <= SHARED_ADDRESS_DAYS)
  if (!hit) return null
  return {
    id: 'shared_address', kind: 'confirm',
    message: `${a} is also ${hit.prospectName}'s address, and they were emailed ${fmtDay(hit.lastOutboundAt)}.`
      + ' The same person will get both. Send anyway?',
  }
}

/** 3e — AFTER THE FINAL CHASE. */
export function guardAfterFinal(input: { step: Step; priors: readonly PriorSend[] }): Guard | null {
  const { step, priors } = input
  const done = priors.some(p => p.isTest !== true && p.kind === '4_final_chase')
  if (!done) return null
  if (step.kind === '4_final_chase' && step.state === 'due') return null
  return {
    id: 'after_final', kind: 'confirm',
    message: 'The final chase has already gone to this prospect. There is no further step. Send anyway?',
  }
}

/**
 * 🔴 EVERY GUARD, IN ONE ORDER, FOR EVERY PATH. A refusal wins over a confirmation; otherwise the
 * order is the order they are written, which is the order they matter in.
 * ⚠️ 3f — A REPLY IS A CONVERSATION. `already_sent`, `not_due` and `after_final` do not apply to a
 * reply; the shared-address warning still does, because the person at the other end is the point.
 *
 * ── 🔴 AND WHEN THE HISTORY COULD NOT BE READ, THE LADDER GUARDS SAY NOTHING ────────────────────
 * `historyUnreadable` carries the reason the prospect's own rows could not be fetched. With no rows,
 * `priors` is empty and `step` was derived from an empty ladder — so `already_sent`, `not_due` and
 * `after_final` would all return null and the send would sail through LOOKING clean. That silence is
 * the defect, not the absence of a warning: three guards answering "no problem" from rows they never
 * saw is worse than one guard saying it could not look.
 * 🔴 SO THEY ARE SKIPPED, NOT TRUSTED, and `history_unreadable` speaks in their place. It is a
 * `confirm`, so the operator may wave it through — and the override is recorded on the message row
 * with this sentence in it.
 * ⚠️ `shared_address` STILL RUNS. It is derived from a DIFFERENT read (the other prospects on this
 * address), which succeeded or failed on its own; suppressing it here would suppress a warning about
 * a third party for a reason that has nothing to do with them.
 * ⚠️ AND IT APPLIES TO A REPLY TOO, unlike the three it replaces. `isReply` comes from
 * `inConversation`, which is itself derived from the contacts read — so on a failed read it is
 * `false` whatever the truth is, and exempting a reply would mean trusting the very read that failed.
 */
export function evaluateGuards(input: {
  isReply: boolean
  step: Step
  priors: readonly PriorSend[]
  lastEmailAt: string | null
  address: string | null
  others: readonly { prospectName: string; address: string; lastOutboundAt: string | null }[]
  now: Date
  /** Why this prospect's contacts/messages could not be read, or null when they were. */
  historyUnreadable?: string | null
}): Guard[] {
  const { isReply, step, priors, lastEmailAt, address, others, now } = input
  const out: Guard[] = []
  const unreadable = guardHistoryUnreadable({ reason: input.historyUnreadable })
  if (unreadable) out.push(unreadable)
  if (!isReply && !unreadable) {
    const a = guardAlreadySent({ step: step.kind, priors })
    if (a) out.push(a)
    else {
      const u = guardUnattributed({ step: step.kind, priors, now, sinceIso: lastRungAt(priors) })
      if (u) out.push(u)
    }
    const d = guardNotDue({ step, lastEmailAt, now })
    if (d) out.push(d)
    const f = guardAfterFinal({ step, priors })
    if (f) out.push(f)
  }
  const s = guardSharedAddress({ address, others, now })
  if (s) out.push(s)
  return out
}

/** The most recent send that DID carry a rung — everything looser than that is already accounted for. */
export function lastRungAt(priors: readonly PriorSend[]): string | null {
  const dated = priors.filter(p => p.isTest !== true && p.kind != null && p.at).map(p => p.at as string)
  return dated.sort().reverse()[0] ?? null
}

export const STEP_LABELS: Record<LadderKind, string> = {
  '1_first_contact': 'First contact',
  '2_chase_1': 'Chase 1',
  '3_chase_2': 'Chase 2',
  '4_final_chase': 'Final chase',
}

/** "Send · Chase 1" / "Send reply" — 3g, from one place so every button says the same thing. */
export function sendButtonLabel(input: { isReply: boolean; step: string | null }): string {
  if (input.isReply) return 'Send reply'
  if (input.step && isSlotStep(input.step)) return `Send · ${STEP_LABELS[input.step as LadderKind]}`
  return 'Send'
}

/**
 * What a send is LOGGED as.
 *
 * 🔴 `reply` IS FOR ANSWERING SOMEBODY, NOT FOR QUOTING SOMETHING. Replying to an email the prospect
 * sent is a conversation and is not a rung — it neither advances the chase sequence nor restarts it.
 * Following up on MY OWN email is not answering anybody: it is the step the ladder is on, it must
 * carry that step's follow-up, and every guard must apply to it. The two look identical in the
 * composer (both quote a parent and both thread) and they are completely different records.
 * ⚠️ THE CLIENT'S VALUE IS THE LAST RESORT, for the case the server could not derive a step at all
 * (a stopped or unreadable ladder). It is never preferred over the server's own.
 */
export function loggedKindFor(input: {
  hasParent: boolean
  inConversation: boolean
  stepKind: string | null
  clientKind?: string | null
}): string | null {
  if (input.hasParent && input.inConversation) return 'reply'
  return input.stepKind ?? input.clientKind ?? null
}

/**
 * "day 0", "+3 days" — when each step happens, under its column heading.
 *
 * 🔴 DERIVED FROM `FOLLOW_UP_DAYS`, NEVER A SECOND TABLE. The interval stored against a step is the
 * one that leads to the NEXT one: first contact carries 3, which is when chase 1 becomes due. So a
 * column's offset is the interval of the step BEFORE it, and the first column is day 0 by
 * definition. Writing the four numbers out again here is how a grid ends up promising a cadence the
 * queue does not run.
 * ⚠️ A STEP WITH NO INTERVAL BEFORE IT SHOWS NOTHING rather than "+null days" — `4_final_chase`
 * carries null because the sequence ends there, and that null belongs to the step after it, which
 * does not exist.
 */
export function stepOffsetLabel(
  step: LadderKind,
  followUpDays: Partial<Record<LadderKind, number | null>>,
): string {
  /* ── 🔴 THEY READ AS GAPS NOW, NOT AS OFFSETS (1 October 2026, operator decision) ─────────────────
   * It returned 'day 0' and '+3 days'. Both are true and neither says WHAT the number is measured
   * from, so a column heading of "+7 days" under Chase 2 reads as "7 days after first contact" — it is
   * 7 days after CHASE 1. Naming the step the gap runs from is the whole change.
   * 🔴 STILL DERIVED FROM `FOLLOW_UP_DAYS`, AND STILL FROM THE STEP BEFORE: the interval stored against
   * a step is the one that LEADS TO the next, so a column's gap is the previous step's interval and the
   * label names that previous step. No second table, and the label cannot promise a cadence the queue
   * does not run. ⚠️ `STEP_LABELS` is lower-cased for mid-sentence use — "3 days after first contact",
   * not "3 days after First contact" — and it is the same map, not a second set of words. */
  const i = CONTACT_KINDS.indexOf(step)
  if (i <= 0) return 'day 0'
  const before = CONTACT_KINDS[i - 1]
  const days = followUpDays[before]
  if (typeof days !== 'number') return ''
  return `${days} days after ${STEP_LABELS[before].toLowerCase()}`
}
