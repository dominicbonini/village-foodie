// lib/inbox/types.ts — the shapes Admin › Inbox's route and page share (inbox-1, 23 November 2026). Types and two tiny pure helpers.

/** Enquiry blue, Prospect violet, Partner teal, Customer amber. A Customer is mail from a linked HatchGrab truck (an enquiry). */
export type InboxType = 'enquiry' | 'prospect' | 'partner' | 'customer'
export type InboxFilter = 'all' | 'enquiries' | 'prospects' | 'partners' | 'customers'
export const INBOX_FILTERS: readonly InboxFilter[] = ['all', 'enquiries', 'prospects', 'partners', 'customers']
export const FILTER_TYPE: Record<Exclude<InboxFilter, 'all'>, InboxType> = { enquiries: 'enquiry', prospects: 'prospect', partners: 'partner', customers: 'customer' }

/** `enquiry:<uuid>`, `prospect:<uuid>`, `partner:<uuid>` — one conversation each. */
export type ConversationKey = string
export function parseKey(key: string | null | undefined): { kind: 'enquiry' | 'prospect' | 'partner'; id: string } | null {
  const m = /^(enquiry|prospect|partner):([0-9a-f-]{36})$/.exec(String(key ?? ''))
  return m ? { kind: m[1] as 'enquiry' | 'prospect' | 'partner', id: m[2] } : null
}
export const keyOf = (kind: 'enquiry' | 'prospect' | 'partner', id: string): ConversationKey => `${kind}:${id}`

/** One row of the list: a conversation with at least one email waiting. */
export interface InboxConversation {
  key: ConversationKey
  type: InboxType
  /** The person (or, for a prospect, the truck). */
  name: string
  /** Shown in brackets where known. */
  organisation: string | null
  email: string | null
  /** The address they wrote to (bonjour@hatchgrab.com …); null for the contact form. */
  wroteTo: string | null
  /** 'contact form' when the enquiry came through the website's form. */
  viaForm: boolean
  language: string
  /** The latest waiting email, on one line. */
  preview: string
  /** When the oldest unanswered email in it arrived. */
  waitingSince: string | null
  /** When the latest email in it arrived. */
  latestAt: string | null
  /** How many emails in it are waiting (what the counts add up). */
  waitingCount: number
  /** The inbound message the reply answers (enquiry_messages.id or outreach_messages.id). */
  latestInboundId: string
  ref: string | null
  /** Lower-cased name, organisation, address and the latest email's words, for the search box. */
  searchText: string
}

export interface InboxCounts { all: number; enquiries: number; prospects: number; partners: number; customers: number }

export interface InboxListResponse {
  ok: true
  conversations: InboxConversation[]
  counts: InboxCounts
  /** Is a Claude model configured on this environment? false until the key is added. */
  drafting: boolean
}

/** One email in a thread, either direction. */
export interface ThreadMessage {
  id: string
  direction: 'in' | 'out'
  at: string | null
  from: string | null
  to: string | null
  subject: string | null
  /** As written (their language, or what we sent). */
  text: string
  /** In English, when known and different. */
  english: string | null
  language: string | null
  /** An outgoing email's state, when there is one ('sent', 'failed' …). */
  status: string | null
}

export interface InboxThread {
  ok: true
  conversation: InboxConversation
  messages: ThreadMessage[]
  /** The message being answered (the latest inbound). */
  latest: ThreadMessage
  /** Their message in English (translated), or null when it is English or no translation exists yet. */
  theirEnglish: string | null
  /** The language their message is in, and whether a translation is needed to reply. */
  theirLanguage: string
  translated: boolean
  /** The draft to show, or null (none yet; drafting off). */
  draft: { english: string; customer: string | null; translatedFrom: string | null; language: string } | null
  /** The address the reply will come from. */
  from: string
  drafting: boolean
  /** Why no draft: 'no_model' | 'cap_reached' | null. */
  draftHeld: string | null
}

export interface InboxActionResult {
  ok: boolean
  message?: string
  refusal?: string
  draft?: InboxThread['draft']
  sentFrom?: string
  sentLanguage?: string
}

/** The words on the page that the harness checks (one place). */
export const INBOX_WORDS = {
  empty: 'No customer emails waiting.',
  needComment: 'Add a comment first.',
  rewritten: 'Reply rewritten with your comments.',
  draftingOff: "Drafting isn't switched on yet.",
  translationOff: "Translation isn't switched on yet.",
} as const

/** "Sent in French from bonjour@hatchgrab.com. It's in the conversation history." */
export const sentNote = (languageName: string, from: string, english: boolean) =>
  `Sent${english ? '' : ` in ${languageName}`} from ${from}. It's in the conversation history.`
