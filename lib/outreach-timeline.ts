// lib/outreach-timeline.ts — one conversation, from three tables, in one order.
//
// 🔴 WHAT REPLACED WHAT. The prospect modal used to show a Contact-history TABLE and, below it, an
// Emails list. The same email appeared in both — once as the rung it wrote and once as the message it
// was — and neither list knew about the other's ordering, so reading "what happened with this truck"
// meant reading two lists and merging them by eye. This merges them once, here, where it can be
// tested, instead of in a component where it cannot.
//
// ⚠️ PURE AND SYNCHRONOUS. It takes rows and returns rows; every caller has already read them.

export interface TimelineMessage {
  id: string
  direction: string | null
  status: string | null
  is_test?: boolean | null
  source?: string | null
  subject?: string | null
  /** 🔴 Who wrote it. A reply goes back to THIS address, not to the truck's stored one. */
  from_address?: string | null
  message_date?: string | null
  created_at?: string | null
  handled_at?: string | null
  snoozed_until?: string | null
  /** The first few lines only. The full body is fetched when a row is expanded. */
  preview?: string | null
  sent_copy?: string | null
  last_error?: string | null
  attempts?: number | null
  has_body?: boolean
  attachment_count?: number
}

export interface TimelineContact {
  id: string
  contacted_at?: string | null
  created_at?: string | null
  channel?: string | null
  direction?: string | null
  kind?: string | null
  message?: string | null
  /** 🔴 Non-null ⇒ this contact IS one of the emails above, and the email is what gets shown. */
  email_message_id?: string | null
}

export interface TimelineEvent {
  id: string
  kind: string
  from_stage?: string | null
  to_stage?: string | null
  body?: string | null
  created_at: string
}

export type TimelineItem =
  | { type: 'email'; at: string; id: string; message: TimelineMessage }
  | { type: 'contact'; at: string; id: string; contact: TimelineContact }
  | { type: 'event'; at: string; id: string; event: TimelineEvent }

/** The instant a row belongs at. `contacted_at` is a DATE the operator picked, so `created_at`
 *  breaks same-day ties — the rule the history table already used, kept. */
const atOf = (primary: string | null | undefined, fallback: string | null | undefined): string =>
  String(primary ?? fallback ?? '')

/**
 * Build the timeline, newest first.
 *
 * 🔴 AN EMAIL LINKED TO A CONTACT ROW APPEARS ONCE, AS THE EMAIL. The contact row carries a rung and
 * a timestamp; the email carries the subject, the status, the body and the actions. Showing both is
 * showing one thing twice, and the one to drop is the thinner of the two.
 * ⚠️ A CONTACT WHOSE EMAIL IS FILTERED OUT IS STILL DROPPED. Hiding test sends hides the email; the
 * rung behind it (if any) is not then promoted into view, because that would make "show test sends"
 * change what the ladder looks like rather than what is displayed.
 */
export function buildTimeline(input: {
  messages: readonly TimelineMessage[]
  contacts: readonly TimelineContact[]
  events: readonly TimelineEvent[]
  /** Test sends are hidden unless this is true. They are not correspondence. */
  showTests?: boolean
}): TimelineItem[] {
  const items: TimelineItem[] = []

  for (const m of input.messages) {
    if (m.is_test === true && !input.showTests) continue
    items.push({ type: 'email', at: atOf(m.message_date, m.created_at), id: m.id, message: m })
  }
  for (const c of input.contacts) {
    // 🔴 THE DE-DUPLICATION. `email_message_id` is set by the routes from `outreach_messages.contact_id`.
    if (c.email_message_id) continue
    items.push({ type: 'contact', at: atOf(c.contacted_at, c.created_at), id: c.id, contact: c })
  }
  for (const e of input.events) {
    items.push({ type: 'event', at: e.created_at, id: e.id, event: e })
  }

  // Newest first. ⚠️ The id breaks a dead tie so the order is stable between renders rather than
  // whatever the sort happened to do with two equal keys.
  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1))
}

/** The first two or three lines of an email, for the collapsed row. */
export const PREVIEW_LINES = 3
export function previewOf(text: string | null | undefined, lines = PREVIEW_LINES): string {
  const clean = String(text ?? '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean)
  if (!clean.length) return ''
  return clean.slice(0, lines).join('\n')
}
