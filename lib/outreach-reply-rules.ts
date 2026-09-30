// lib/outreach-reply-rules.ts — who a reply may be addressed to, and which message it attaches to.
//
// 🔴 A REPLY IS THE FIRST PATH ON WHICH THE RECIPIENT IS NOT THE TRUCK'S STORED ADDRESS. Everywhere
// else the browser sends a prospect id and the route reads `discovery_trucks.contact_email` itself —
// deliberately, so a stale address on screen can never become the envelope. A reply has to go back to
// whoever actually wrote, which may legitimately be a different mailbox at the same business
// (`info@` writes, `sam@` replies). That is a hole unless the set of acceptable addresses is closed,
// so it is: the truck's own address, or the From of a non-test inbound message ALREADY RECORDED for
// this prospect. Both are values the server already holds. A caller cannot introduce a new one.
//
// Pure: no Supabase. `scripts/outreach-reply-attach.cjs` proves every rule.

export const normaliseAddress = (a: string | null | undefined): string =>
  String(a ?? '').trim().toLowerCase()

export interface ReplyRecipientInput {
  /** The address the compose window is about to send to. */
  to: string | null | undefined
  /** `discovery_trucks.contact_email`. */
  contactEmail: string | null | undefined
  /** The From of every non-test INBOUND message recorded for this prospect. */
  knownInboundFroms: readonly (string | null | undefined)[]
}

/**
 * May this reply go to this address?
 * ⚠️ THE REFUSAL NAMES THE ADDRESS AND SAYS WHAT TO DO. "Not allowed" on its own would be unactionable
 * for the case it exists to catch: a reply to a message whose From was never recorded, which is fixed
 * by running Import past emails or by correcting the truck's address.
 */
export function replyRecipientRefusal(input: ReplyRecipientInput): { refusal: string } | null {
  const to = normaliseAddress(input.to)
  if (!to) return { refusal: 'That reply has no recipient address.' }
  const allowed = new Set<string>()
  const contact = normaliseAddress(input.contactEmail)
  if (contact) allowed.add(contact)
  for (const f of input.knownInboundFroms) {
    const n = normaliseAddress(f)
    if (n) allowed.add(n)
  }
  if (!allowed.has(to)) {
    return {
      refusal: `${to} is not this truck's address and has never written to us, so nothing was sent. `
        + 'Check the address on the truck, or run Import past emails if the message is in the mailbox but not recorded.',
    }
  }
  return null
}

/** The shape the send route reads back for the message being replied to. */
export interface ReplyParent {
  id: string
  prospect_id: string
  is_test: boolean | null
  direction: string | null
  message_id: string | null
  references: string | null
  subject: string | null
  from_address: string | null
  to_address: string | null
  message_date: string | null
  html_body: string | null
  text_body: string | null
}

/**
 * May this message be replied to at all?
 * 🔴 IT MUST BELONG TO THIS PROSPECT. The id comes from the browser; without this check a reply could
 * be threaded onto another truck's conversation and quote their words into this one's inbox.
 * 🔴 AND IT MUST NOT BE A TEST. A test went to Dominic's own address; replying to it in a prospect's
 * thread would quote a message that prospect never received.
 * ⚠️ A MESSAGE WITH NO Message-ID CANNOT BE THREADED. `In-Reply-To` would be empty and the reply would
 * arrive as a new conversation, which is the one thing replying in-thread exists to avoid.
 */
export function replyParentRefusal(
  parent: ReplyParent | null | undefined, prospectId: string,
): { refusal: string } | null {
  if (!parent) return { refusal: 'That message is not in the log any more, so there is nothing to reply to.' }
  if (parent.prospect_id !== prospectId) return { refusal: 'That message belongs to a different prospect.' }
  if (parent.is_test === true) return { refusal: 'That was a test send to your own address — there is nobody to reply to.' }
  if (!parent.message_id) return { refusal: 'That message has no Message-ID, so a reply could not be threaded onto it.' }
  return null
}

/**
 * Who a reply goes back to.
 *
 * 🔴 IT DEPENDS ON WHICH WAY THE PARENT WENT, AND GETTING IT WRONG EMAILS OURSELVES. Answering their
 * email goes to whoever wrote it (`from_address`); following up on MY OWN goes to whoever I sent it
 * to (`to_address`) — `from_address` on an outbound row is our own mailbox. The route already made
 * this choice inline; it is a function so the page can make the same one and a harness can hold
 * them to it.
 * ⚠️ IT IS STILL CHECKED AFTERWARDS. `replyRecipientRefusal` decides whether the address is
 * allowed at all; this only decides which of the row's two addresses is the candidate.
 */
export function replyRecipientFor(
  parent: {
    direction?: string | null
    from_address?: string | null
    to_address?: string | null
  } | null | undefined,
): string | null {
  if (!parent) return null
  const back = parent.direction === 'inbound' ? parent.from_address : parent.to_address
  return (back ?? '').trim() || null
}

/** The kind a reply is logged as. 🔴 NEVER A LADDER RUNG — see the note at the call site. */
export const REPLY_KIND = 'reply'
