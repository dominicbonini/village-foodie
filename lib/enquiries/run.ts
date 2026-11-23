// lib/enquiries/run.ts — 🔴 THE ENQUIRY STEP OF THE REPLY POLL: LOG, TRANSLATE, DRAFT. NOTHING IS SENT (enquiries-backend-1, 23 November
// 2026; docs/enquiries-backend-1-report.md). Called by lib/outreach-mail-poll.ts AFTER all of its own work, inside its lock, and only
// when outreach_settings 'enquiries_intake_enabled' is true. While it is false this returns null before doing anything else, and the
// poll's answer is exactly what it was before this file existed.
//
// THE ORDER: the switch → contact-form messages saved since it was switched on become enquiries (source 'form') → hello@ INBOX mail the
// outreach poll did not claim becomes enquiry messages (source 'email'), except what lib/enquiries/rules.ts skipReason says to leave
// (counted only, never stored) → drafts for the enquiries waiting for one, at most DRAFTS_PER_RUN, never past the monthly cap or the
// run's deadline.
// 🔴 THIS FILE IMPORTS NO SEND PATH AND NO MAILBOX: mail arrives through `deps.mail`, which the poll builds from its own read-only
//    helpers; the model through `deps.model`. scripts/enquiries-backend-1.cjs's census fails if that changes.
import { skipReason, threadFor, refInSubject, splitNotes, numbersCheck, SKIP_REASONS, type MailHeaders, type SkipReason, type DraftFlag, type AskStatus, type ThreadLookup } from '@/lib/enquiries/rules'
import { buildAnswerPack, settleAsk, topicVocabulary, type KnowledgeRow, type PackInputs } from '@/lib/enquiries/answer-pack'
import type { EnquiryModel, Understood } from '@/lib/enquiries/model'
import { messageIdsIn, stripQuotedHistory } from '@/lib/outreach-mail-poll-rules'

export const ENQUIRY_SWITCH_KEY = 'enquiries_intake_enabled'
/** 🔴 $5 per calendar month across every enquiry model call (the FAQ translator's cap is separate). No call starts once reached. */
export const MONTHLY_CAP_USD = 5
/** At most this many drafts per run. */
export const DRAFTS_PER_RUN = 3
/** At most this many contact-form messages and mail messages taken in per run (the rest wait for the next run). */
export const FORMS_PER_RUN = 50
export const MAIL_PER_RUN = 50
/** The longest message text stored. */
export const TEXT_CAP = 20_000

export type EnquiryStatus = 'new' | 'drafted' | 'needs_review' | 'answered' | 'closed'
export interface EnquiryRow {
  id: string; ref: string; source: 'form' | 'email'; name: string | null; email: string; country: string | null; language: string | null
  truck_id: string | null; contact_message_id: string | null; status: EnquiryStatus; created_at: string; updated_at: string
}
export interface MessageRow {
  id: string; enquiry_id: string; direction: 'in' | 'out'; original_text: string; original_language: string | null; english_text: string | null
  subject: string | null; mail_message_id: string | null; in_reply_to: string | null; references: string | null; mailbox: string | null
  uid: number | null; received_at: string
}
export interface DraftRow {
  enquiry_id: string; message_id: string; english_draft: string; customer_draft: string; back_translation: string | null
  asks: { ask: string; topics: string[]; status: AskStatus; knowledge_ids: string[]; sources: string[]; note: string }[]
  flags: DraftFlag[]; numbers_check: 'pass' | 'fail'; numbers_details: { unknown: string[]; checked: number }; model: string; cost_usd: number
}
/** The contact_messages columns intake reads (lib/contact-server.ts ContactRow). */
export interface ContactForIntake { id: string; created_at: string; topic: string; name: string; email: string; business_name: string | null; message: string; country: string | null; locale: string | null }

export interface EnquiryStore {
  /** The switch, and when it was switched on (its row's updated_at) — intake reads nothing older. */
  readSwitch(): Promise<{ enabled: boolean; since: string | null }>
  /** Contact-form messages saved at or after `since` that have no enquiry yet, oldest first. */
  contactMessagesSince(since: string, limit: number): Promise<ContactForIntake[]>
  /** Is this mail message already held? (the unique (mailbox, mail_message_id) is the guard; this saves the work before it). */
  messageHeld(mailbox: string, mailMessageId: string): Promise<boolean>
  threadLookup(email: string, mailIds: string[], ref: string | null): Promise<ThreadLookup>
  /** The ONE truck whose contact address is this one, or null (none, or more than one — never guessed). */
  truckFor(email: string): Promise<{ id: string; country: string | null } | null>
  /** null = an enquiry for this contact message already exists. */
  createEnquiry(row: Pick<EnquiryRow, 'source' | 'name' | 'email' | 'country' | 'language' | 'truck_id' | 'contact_message_id'>): Promise<{ id: string; ref: string } | null>
  addMessage(row: Omit<MessageRow, 'id'>): Promise<{ id: string } | null>
  updateEnquiry(id: string, patch: Partial<EnquiryRow>): Promise<void>
  updateMessage(id: string, patch: Partial<MessageRow>): Promise<void>
  /** Enquiries waiting for a draft (status 'new'), oldest first, each with its latest incoming message. */
  pendingDrafts(limit: number): Promise<{ enquiry: EnquiryRow; message: MessageRow }[]>
  /** 🔴 APPROVED lines only — nothing else is ever read for a draft. */
  approvedKnowledge(): Promise<KnowledgeRow[]>
  insertDraft(row: DraftRow): Promise<void>
  monthSpent(month: string): Promise<number>
  addSpent(month: string, usd: number): Promise<void>
}

/** One message from hello@ INBOX that the outreach poll did NOT claim. Its body is read only if it is kept (readText). */
export interface MailCandidate {
  mailbox: string; uid: number; messageId: string; headers: MailHeaders; fromName: string | null; date: string | null
  readText(): Promise<string | null>
}
export interface MailSource {
  /** Walk the new messages (read-only), oldest first, handing each to `handle`. A throw stops the walk there; that message is read again
   *  next run. Returns how many it examined and how many the outreach poll had claimed (left alone). */
  walk(handle: (c: MailCandidate) => Promise<void>, limit: number): Promise<{ examined: number; outreach: number }>
}

export interface EnquiryDeps {
  store: EnquiryStore
  mail: MailSource | null
  /** null: no Claude API login on this environment — intake still runs, drafting waits. */
  model: EnquiryModel | null
  packInputs(country: string | null): Promise<PackInputs>
  /** 🔴 ORDER_MAIL_MODEL_HOOK (lib/enquiries/rules.ts): absent today. When present it is asked, before anything is stored, whether a
   *  message the header rules kept is about a diner's own order; true → not stored, counted as order_mail. */
  classifyOrderMail?: (headers: MailHeaders, text: string) => Promise<boolean>
  orderSubjects: readonly RegExp[]
  now(): Date
  /** Epoch ms after which no new step starts (the cron's own time limit). */
  deadline: number
}

export interface EnquirySummary {
  formsLogged: number
  mailExamined: number
  /** Messages the outreach poll claims (a prospect's or a partner's mail) — left to it, as before. */
  mailLeftToOutreach: number
  mailLogged: number
  joinedExisting: number
  /** Counted only: nothing about these is stored. */
  skipped: Record<SkipReason | 'empty' | 'duplicate', number>
  drafted: number
  needsReview: number
  /** Why drafting did not run (or stopped): no model here, the monthly cap, the run's time, or null. */
  draftingHeld: 'no_model' | 'cap_reached' | 'out_of_time' | null
  usd: number
  errors: string[]
}

const month = (d: Date) => d.toISOString().slice(0, 7)
const lower = (s: string) => s.trim().toLowerCase()
const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s)
/** An error's message without anything that could be message content: the first line, capped. */
const errText = (step: string, e: unknown) => `${step}: ${String(e instanceof Error ? e.message : e).split('\n')[0].slice(0, 160)}`

class CapReached extends Error { constructor() { super('the monthly enquiry spend cap is reached') } }

/** The whole step. null = switched off (or the switch unreadable): nothing was done and the poll's answer must not change. */
export async function runEnquiries(deps: EnquiryDeps, hooks: { onEnabled?(deps: EnquiryDeps): Promise<void> } = {}): Promise<EnquirySummary | null> {
  let sw: { enabled: boolean; since: string | null }
  try { sw = await deps.store.readSwitch() } catch { return null }
  if (!sw.enabled) return null
  // What only an enabled run needs (the order-mail subjects, the live model) is loaded here, never while switched off.
  if (hooks.onEnabled) await hooks.onEnabled(deps)
  const { store } = deps
  const now = deps.now()
  const since = sw.since ?? now.toISOString()
  const s: EnquirySummary = {
    formsLogged: 0, mailExamined: 0, mailLeftToOutreach: 0, mailLogged: 0, joinedExisting: 0,
    skipped: Object.fromEntries([...SKIP_REASONS, 'empty', 'duplicate'].map(k => [k, 0])) as EnquirySummary['skipped'],
    drafted: 0, needsReview: 0, draftingHeld: null, usd: 0, errors: [],
  }
  const late = () => deps.now().getTime() >= deps.deadline

  // ── contact-form messages ───────────────────────────────────────────────────────────────────────────────────────────
  try {
    for (const c of await store.contactMessagesSince(since, FORMS_PER_RUN)) {
      const email = lower(c.email)
      const truck = await store.truckFor(email)
      const made = await store.createEnquiry({
        source: 'form', name: c.name, email, country: c.country ?? truck?.country ?? null, language: c.locale, truck_id: truck?.id ?? null, contact_message_id: c.id,
      })
      if (!made) continue
      await store.addMessage({
        enquiry_id: made.id, direction: 'in', original_text: cap(c.message, TEXT_CAP), original_language: c.locale,
        english_text: c.locale?.startsWith('en') ? c.message : null, subject: null, mail_message_id: null, in_reply_to: null, references: null,
        mailbox: null, uid: null, received_at: c.created_at,
      })
      s.formsLogged++
    }
  } catch (e) { s.errors.push(errText('forms', e)) }

  // ── hello@ INBOX mail the outreach poll did not claim ─────────────────────────────────────────────────────────────────
  if (deps.mail && !late()) {
    try {
      const r = await deps.mail.walk(c => intakeMail(c, deps, s), MAIL_PER_RUN)
      s.mailExamined = r.examined; s.mailLeftToOutreach = r.outreach
    } catch (e) { s.errors.push(errText('mail', e)) }
  }

  // ── drafts ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (!deps.model) { s.draftingHeld = 'no_model'; return s }
  const m = month(now)
  let spent: number
  try { spent = await store.monthSpent(m) } catch (e) { s.errors.push(errText('spend', e)); return s }
  if (spent >= MONTHLY_CAP_USD) { s.draftingHeld = 'cap_reached'; return s }
  let pending: { enquiry: EnquiryRow; message: MessageRow }[] = []
  let knowledge: KnowledgeRow[] = []
  try { [pending, knowledge] = await Promise.all([store.pendingDrafts(DRAFTS_PER_RUN), store.approvedKnowledge()]) } catch (e) { s.errors.push(errText('pending', e)); return s }
  const ledger = {
    canStart: () => spent < MONTHLY_CAP_USD,
    add: async (usd: number) => { if (usd > 0) { spent += usd; s.usd += usd; await store.addSpent(m, usd) } },
  }
  for (const p of pending.slice(0, DRAFTS_PER_RUN)) {
    if (late()) { s.draftingHeld = 'out_of_time'; break }
    if (!ledger.canStart()) { s.draftingHeld = 'cap_reached'; break }
    try {
      const status = await draftOne(p.enquiry, p.message, knowledge, deps, deps.model, ledger)
      if (status === 'drafted') s.drafted++; else s.needsReview++
    } catch (e) {
      if (e instanceof CapReached) { s.draftingHeld = 'cap_reached'; break }
      s.errors.push(errText(`draft ${p.enquiry.ref}`, e))
    }
  }
  return s
}

async function intakeMail(c: MailCandidate, deps: EnquiryDeps, s: EnquirySummary): Promise<void> {
  const reason = skipReason(c.headers, deps.orderSubjects)
  if (reason) { s.skipped[reason]++; return }
  const { store } = deps
  if (await store.messageHeld(c.mailbox, cap(c.messageId, 1000))) { s.skipped.duplicate++; return }
  const raw = await c.readText()
  const text = raw ? stripQuotedHistory(raw, TEXT_CAP).trim() : ''
  if (!text) { s.skipped.empty++; return }
  if (deps.classifyOrderMail && await deps.classifyOrderMail(c.headers, text)) { s.skipped.order_mail++; return }
  const from = lower(c.headers.fromAddress ?? '')
  const inReplyTo = c.headers.get('in-reply-to'), references = c.headers.get('references')
  const lookup = await store.threadLookup(from, [...messageIdsIn(inReplyTo), ...messageIdsIn(references)], refInSubject(c.headers.subject))
  const decision = threadFor({ from, subject: c.headers.subject, inReplyTo, references }, lookup)
  let enquiryId: string
  if (decision.kind === 'join') {
    enquiryId = decision.enquiryId
    s.joinedExisting++
  } else {
    const truck = await store.truckFor(from)
    const made = await store.createEnquiry({ source: 'email', name: c.fromName ? cap(c.fromName.trim(), 200) || null : null, email: from, country: truck?.country ?? null, language: null, truck_id: truck?.id ?? null, contact_message_id: null })
    if (!made) throw new Error('could not create an enquiry')
    enquiryId = made.id
  }
  const added = await store.addMessage({
    enquiry_id: enquiryId, direction: 'in', original_text: text, original_language: null, english_text: null,
    subject: c.headers.subject ? cap(c.headers.subject, 1000) : null, mail_message_id: cap(c.messageId, 1000), in_reply_to: inReplyTo, references,
    mailbox: c.mailbox, uid: c.uid, received_at: c.date ?? deps.now().toISOString(),
  })
  if (!added) { s.skipped.duplicate++; return }
  // A new message reopens its enquiry for a draft (an answered or closed one included: the person wrote again).
  if (decision.kind === 'join') await store.updateEnquiry(enquiryId, { status: 'new', updated_at: deps.now().toISOString() })
  s.mailLogged++
}

type Ledger = { canStart(): boolean; add(usd: number): Promise<void> }

/** One draft: understand → pack → draft → back-translate → checks. Returns the status it set. */
export async function draftOne(e: EnquiryRow, msg: MessageRow, knowledge: KnowledgeRow[], deps: Pick<EnquiryDeps, 'store' | 'packInputs' | 'now'>, model: EnquiryModel, ledger: Ledger): Promise<'drafted' | 'needs_review'> {
  let cost = 0
  async function call<T>(f: () => Promise<{ value: T; usd: number }>): Promise<T> {
    if (!ledger.canStart()) throw new CapReached()
    try { const r = await f(); cost += r.usd; await ledger.add(r.usd); return r.value }
    catch (err) { const u = Number((err as { usd?: number }).usd) || 0; cost += u; await ledger.add(u); throw err }
  }
  const flags: DraftFlag[] = []

  // a · translate, b · list the asks with topics
  const u: Understood = await call(() => model.understand({ text: msg.original_text, subject: msg.subject, knownLanguage: msg.original_language ?? e.language, topics: topicVocabulary(knowledge) }))
  const language = e.language ?? msg.original_language ?? u.language
  await deps.store.updateMessage(msg.id, { english_text: cap(u.english_text, 40_000), original_language: msg.original_language ?? normLang(u.language) })
  if (!e.language) await deps.store.updateEnquiry(e.id, { language: normLang(u.language) })
  if (!u.asks.length) flags.push({ kind: 'no_asks', detail: 'nothing asked was found' })

  // the country: the form's or the linked truck's; else the message's own guess (flagged); else unknown (flagged, no prices)
  let country = e.country
  if (!country && /^[A-Z]{2}$/.test(u.country_guess)) { country = u.country_guess; flags.push({ kind: 'country_guessed', detail: `country taken from the message: ${country}` }) }
  if (!country) flags.push({ kind: 'country_unknown', detail: 'no country known: the pack has no prices' })

  // c · the answer pack
  const topics = [...new Set(u.asks.flatMap(a => a.topics))]
  const pack = buildAnswerPack(await deps.packInputs(country), knowledge, topics)

  // e · the draft
  const d = await call(() => model.draft({ englishText: u.english_text, asks: u.asks, packText: pack.text, customerLanguage: language, name: e.name }))
  const en = splitNotes(d.english_draft), cu = splitNotes(d.customer_draft)
  if (en.notes.length || cu.notes.length) flags.push({ kind: 'note_lines_removed', detail: `${en.notes.length + cu.notes.length} "Note:" line(s) removed from the draft` })
  const english = language.startsWith('en')
  const customer = english ? en.text : cu.text
  const back = english ? null : (await call(() => model.backTranslate({ text: customer, fromLanguage: language }))).english

  // d · each ask matched, checked in code
  const asks = d.asks.map(a => {
    const r = settleAsk(a, pack)
    if (r.dropped.length) flags.push({ kind: 'unknown_source', detail: `"${a.ask}" named sources not in the pack: ${r.dropped.join(', ')}` })
    if (r.status !== 'available') flags.push({ kind: `ask_${r.status}`, detail: `${a.ask}${a.note ? ` — ${a.note}` : ''}` })
    return { ask: r.ask, topics: r.topics, status: r.status, knowledge_ids: r.knowledge_ids, sources: r.sources, note: a.note }
  })

  // f · the numbers check, and the wording rules that code can see
  const nums = numbersCheck([en.text, customer], pack.text)
  if (nums.result === 'fail') flags.push({ kind: 'numbers', detail: `not in the answer pack: ${nums.unknown.join(', ')}` })
  if ([en.text, customer].some(t => /pay\s+at\s+(the\s+)?hatch/i.test(t))) flags.push({ kind: 'mentions_pay_at_hatch', detail: 'the draft names Pay at Hatch' })
  if (/\b(free|trial)\b/i.test(en.text) && /card fees/i.test(pack.text) && !/\bcard\b[^.]{0,40}\bfees?\b|\bstripe\b/i.test(en.text)) flags.push({ kind: 'card_fees_not_stated', detail: 'free or the trial is mentioned without the card fees stated separately' })

  const row: DraftRow = {
    enquiry_id: e.id, message_id: msg.id, english_draft: en.text, customer_draft: customer, back_translation: back, asks, flags,
    numbers_check: nums.result, numbers_details: { unknown: nums.unknown, checked: nums.checked }, model: model.model, cost_usd: Math.round(cost * 1e6) / 1e6,
  }
  await deps.store.insertDraft(row)
  const status: 'drafted' | 'needs_review' = flags.length || !asks.every(a => a.status === 'available') ? 'needs_review' : 'drafted'
  // 🔴 Whatever the status, lib/enquiries/rules.ts canAutoSend(row) is false: for any flag, and — no send path exists — for every draft.
  await deps.store.updateEnquiry(e.id, { status, updated_at: deps.now().toISOString() })
  return status
}

/** "fr" / "fr-fr" / "fr-FR" → the stored form ("fr", "fr-FR"); anything else → null. */
export function normLang(l: string | null | undefined): string | null {
  const m = /^([a-z]{2,3})(?:-([a-z]{2}))?$/i.exec(String(l ?? '').trim())
  return m ? (m[2] ? `${m[1].toLowerCase()}-${m[2].toUpperCase()}` : m[1].toLowerCase()) : null
}
