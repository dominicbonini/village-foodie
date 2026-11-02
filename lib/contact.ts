// lib/contact.ts — 🔴 HATCHGRAB'S OWN CONTACT FORM: THE RULES, ONCE, FOR THE BROWSER AND THE SERVER (contact-1, 2 November 2026;
// docs/contact-1-report.md). PURE — no server import, so app/contact/HatchGrabContactForm.tsx (client) and app/api/contact/route.ts
// (lib/contact-server.ts) validate with the same function and can never disagree.
//
// HatchGrab host only. Village Foodie's /contact, venue and truck pages keep the Tally form (app/contact/ContactForm.tsx).
// Lengths are counted in CHARACTERS (code points), as Postgres's char_length counts them in contact_messages' checks — not in
// UTF-16 units, which would count an emoji twice.

/** The three topics, in the form's order. The first is the default. The ids are stored; the words are `contactPage.form.topics.*`. */
export const CONTACT_TOPICS = ['question', 'account', 'other'] as const
export type ContactTopic = (typeof CONTACT_TOPICS)[number]

export const CONTACT_LIMITS = { name: 100, email: 254, business: 120, messageMin: 10, messageMax: 5000 } as const

/** A ?topic= value → the form's topic. Existing links send Tally's values (lib/contact-topics.ts: "General Enquiry", "Cost
 *  Comparison" …): every one of them, and anything unrecognised, is the first topic. Only the form's own ids pick another. */
export function topicFromParam(v: string | string[] | undefined | null): ContactTopic {
  const s = Array.isArray(v) ? v[0] : v
  return (CONTACT_TOPICS as readonly string[]).includes(s ?? '') ? (s as ContactTopic) : CONTACT_TOPICS[0]
}

/** The business name is required for account help (so we can find the truck); optional otherwise. */
export const businessRequired = (topic: ContactTopic) => topic === 'account'

export interface ContactFields { topic: ContactTopic; name: string; email: string; business: string; message: string }
export type ContactField = 'topic' | 'name' | 'email' | 'business' | 'message'
/** Each error is a key under `contactPage.form.errors`. */
export type ContactFieldError = 'nameRequired' | 'nameTooLong' | 'emailRequired' | 'emailInvalid' | 'emailTooLong' | 'businessRequired' | 'businessTooLong'
  | 'messageTooShort' | 'messageTooLong' | 'topicInvalid'

export const charCount = (s: string) => [...s].length
// One @, something before it, a dot in the domain, no spaces — the same test the signup and demo forms make, no stricter.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Trimmed fields from anything (a form, a JSON body). Never throws. */
export function contactFieldsFrom(raw: Record<string, unknown>): ContactFields {
  const str = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string).trim() : '')
  const topic = str('topic')
  return {
    topic: (CONTACT_TOPICS as readonly string[]).includes(topic) ? (topic as ContactTopic) : ('' as ContactTopic),
    name: str('name'), email: str('email'), business: str('business'), message: str('message'),
  }
}

/** Every field's first problem; an empty object when the message can be sent. */
export function validateContact(f: ContactFields): Partial<Record<ContactField, ContactFieldError>> {
  const e: Partial<Record<ContactField, ContactFieldError>> = {}
  if (!(CONTACT_TOPICS as readonly string[]).includes(f.topic)) e.topic = 'topicInvalid'
  if (!f.name) e.name = 'nameRequired'
  else if (charCount(f.name) > CONTACT_LIMITS.name) e.name = 'nameTooLong'
  if (!f.email) e.email = 'emailRequired'
  else if (charCount(f.email) > CONTACT_LIMITS.email) e.email = 'emailTooLong'
  else if (!EMAIL_RE.test(f.email)) e.email = 'emailInvalid'
  if (!f.business) { if (businessRequired(f.topic)) e.business = 'businessRequired' }
  else if (charCount(f.business) > CONTACT_LIMITS.business) e.business = 'businessTooLong'
  const n = charCount(f.message)
  if (n < CONTACT_LIMITS.messageMin) e.message = 'messageTooShort'
  else if (n > CONTACT_LIMITS.messageMax) e.message = 'messageTooLong'
  return e
}

/** What POST /api/contact answers. `sent` is also the answer to a bot (the trap field, too fast): it learns nothing. */
export type ContactResult =
  | { ok: true }
  | { ok: false; code: 'invalid'; fields: Partial<Record<ContactField, ContactFieldError>> }
  | { ok: false; code: 'rate_limited' | 'failed' }

/** The hidden trap field's name: a person never sees or fills it (off-screen, aria-hidden, no tab stop, autocomplete off). */
export const CONTACT_TRAP_FIELD = 'website'
/** A message sent this soon after the page rendered is a bot's. */
export const CONTACT_MIN_MS = 3000
