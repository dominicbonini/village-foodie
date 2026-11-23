// lib/enquiries/rules.ts — 🔴 THE DECISIONS THE ENQUIRY BACKEND MAKES, AS PURE FUNCTIONS (enquiries-backend-1, 23 November 2026;
// docs/enquiries-backend-1-report.md). No network, no database, no mailbox: scripts/enquiries-backend-1.cjs proves every rule.
//
// 1 · WHAT IS NEVER STORED (skipReason). Mail the outreach poll did not claim is an enquiry EXCEPT: the contact-form copies Brevo sends
//     to hello@ (the form path logged them already), bounces and auto-replies, no-reply senders, our own addresses and domains (no
//     loops), and ORDER MAIL FROM DINERS (Dominic, 23 Nov: it stays in the mailbox — no log, no draft). Header and subject rules only;
//     the model's say comes later through ORDER_MAIL_MODEL_HOOK. A skipped message is COUNTED, never stored, logged or named.
// 2 · THREADING (threadFor): the same person, and In-Reply-To / References naming a message we hold, or the ENQ ref in the subject,
//     or a reply to the contact-form copy ("[HatchGrab contact]" in a Re: subject) → their existing enquiry. Anything else is new.
// 3 · THE NUMBERS CHECK (numbersCheck): every price, percentage, amount or day count in a draft must appear in the answer pack (or the
//     customer's own message), compared as values with their units (inbox-2: "1.5" is one and a half, never 15).
// 4 · canAutoSend: false for any draft with a flag — and, because no send path exists, false for every draft today.
import { isAutoReply, isBounce, messageIdsIn, type IncomingHeaders } from '@/lib/outreach-mail-poll-rules'

// ── the reference ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** ENQ-0001 style (the database numbers them: public.enquiry_next_ref). */
export const REF_RE = /\bENQ-(\d{4,})\b/i
export function refInSubject(subject: string | null | undefined): string | null {
  const m = REF_RE.exec(String(subject ?? ''))
  return m ? `ENQ-${m[1]}` : null
}

// ── 1 · what is never stored ──────────────────────────────────────────────────────────────────────────────────────────
/** Our own domains: mail from any address on them is ours (no loops). */
export const OWN_DOMAINS = ['hatchgrab.com', 'villagefoodie.co.uk'] as const
/** The address a truck's order mail is sent from (lib/email-config.ts HATCHGRAB_NOREPLY), written here so this module stays pure. */
export const ORDER_MAIL_FROM = 'donotreply@hatchgrab.com'
/** The subject the contact form's copy to hello@ starts with (lib/contact-server.ts contactMail). */
export const CONTACT_COPY_PREFIX = '[HatchGrab contact]'

export type SkipReason = 'contact_form_copy' | 'own_address' | 'bounce' | 'auto_reply' | 'noreply' | 'order_mail'
export const SKIP_REASONS: readonly SkipReason[] = ['contact_form_copy', 'own_address', 'bounce', 'auto_reply', 'noreply', 'order_mail']

/** The headers a rule may read: the poll's IncomingHeaders plus every recipient. */
export interface MailHeaders extends IncomingHeaders { to: string[] }

const lower = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase()
export function isOwnDomain(address: string | null | undefined): boolean {
  const a = lower(address)
  const at = a.lastIndexOf('@')
  if (at < 1) return false
  const domain = a.slice(at + 1)
  return OWN_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`))
}
/** no-reply, noreply, no_reply, donotreply, do-not-reply … as the local part (or its start: noreply-billing@). */
const NOREPLY_RE = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer-daemon|postmaster)([-_.+][^@]*)?@/i
export const isNoReplySender = (address: string | null | undefined) => NOREPLY_RE.test(lower(address))

/** "Re: ", "RE : ", "Fwd:", "AW:", "TR:", "Réf. :" … stripped from the front, as many times as they repeat. */
export function stripReplyPrefixes(subject: string | null | undefined): string {
  let s = String(subject ?? '').trim()
  for (let i = 0; i < 10; i++) {
    const next = s.replace(/^\s*(re|fw|fwd|aw|wg|tr|sv|vs|rv|odp|r|enc|antw|réf|ref)\s*(\[\d+\])?\s*[:：]\s*/i, '')
    if (next === s) break
    s = next
  }
  return s.trim()
}

/**
 * Why this message is NOT an enquiry, or null when it is one.
 * `orderSubjects`: the order-mail subjects in every language (lib/enquiries/order-subjects.ts orderSubjectPatterns), passed in so this
 * stays pure. `ownAddresses` (inbox-1): the aliases, also our own. The order is fixed: our own mail first (a loop is the worst outcome), then delivery reports, then the rest.
 */
export function skipReason(h: MailHeaders, orderSubjects: readonly RegExp[], ownAddresses: readonly string[] = []): SkipReason | null {
  const subject = String(h.subject ?? '').trim()
  // The Brevo copy of a contact-form message: exactly that subject (never a Re:) — or anything from our own sender.
  if (subject.startsWith(CONTACT_COPY_PREFIX)) return 'contact_form_copy'
  // inbox-1: the 36 aliases (outreach_settings 'mail_aliases') are our own addresses too — named, as well as covered by the domain.
  if (isOwnDomain(h.fromAddress) || ownAddresses.some(a => lower(a) === lower(h.fromAddress))) return 'own_address'
  // ⚠️ Only the null sender "<>" marks a bounce — an ABSENT Return-Path does not (some relays omit it).
  if (isBounce(h) || lower(h.get('return-path')) === '<>') return 'bounce'
  if (isAutoReply(h)) return 'auto_reply'
  if (isNoReplySender(h.fromAddress)) return 'noreply'
  if (isOrderMail(h, orderSubjects)) return 'order_mail'
  return null
}

/**
 * 🔴 ORDER MAIL FROM DINERS (Dominic, 23 Nov 2026: stays in the mailbox, no log, no draft). By headers and subject only:
 *   • it was sent to (or copies) the order-mail address, donotreply@hatchgrab.com;
 *   • its subject, without Re:/Fwd:, is one of the emails a diner gets about their own order (confirmed, ready, refunded, cancelled,
 *     updated, review request), in any of our languages.
 * Anything subtler ("about my order last Saturday" in a fresh email) needs the model: ORDER_MAIL_MODEL_HOOK.
 */
export function isOrderMail(h: Pick<MailHeaders, 'subject' | 'to'>, orderSubjects: readonly RegExp[]): boolean {
  if (h.to.some(a => lower(a) === ORDER_MAIL_FROM)) return true
  const s = stripReplyPrefixes(h.subject)
  return !!s && orderSubjects.some(re => re.test(s))
}

/**
 * 🔴 THE HOOK FOR THE MODEL TO CLASSIFY LATER (not called today). When the model is available it may be asked, with the message held in
 * memory only and BEFORE anything is stored, whether a message the header rules let through is about a diner's own order. The intake
 * calls `deps.classifyOrderMail` where this name is mentioned (lib/enquiries/run.ts); while that dependency is absent, nothing changes.
 */
export const ORDER_MAIL_MODEL_HOOK = 'classifyOrderMail'

// ── 2 · threading ─────────────────────────────────────────────────────────────────────────────────────────────────────
export interface KnownThread { enquiryId: string; email: string }
export interface ThreadLookup {
  /** Message-IDs we hold (enquiry_messages.mail_message_id) → their enquiry and its person. */
  byMailId: Map<string, KnownThread>
  /** ENQ refs → their enquiry and its person. */
  byRef: Map<string, KnownThread>
  /** The person's most recent FORM enquiry, for a reply to the contact-form copy. */
  latestFormFor(email: string): KnownThread | null
}
export type ThreadDecision = { kind: 'join'; enquiryId: string; by: 'headers' | 'ref' | 'form_copy_reply' } | { kind: 'new' }

/** 🔴 THE SAME PERSON, ALWAYS: a matching thread id or ref from a DIFFERENT address starts a new enquiry (never someone else's). */
export function threadFor(m: { from: string; subject: string | null; inReplyTo: string | null; references: string | null }, k: ThreadLookup): ThreadDecision {
  const from = lower(m.from)
  for (const id of [...messageIdsIn(m.inReplyTo), ...messageIdsIn(m.references)]) {
    const t = k.byMailId.get(id)
    if (t && lower(t.email) === from) return { kind: 'join', enquiryId: t.enquiryId, by: 'headers' }
  }
  const ref = refInSubject(m.subject)
  const r = ref ? k.byRef.get(ref) : undefined
  if (r && lower(r.email) === from) return { kind: 'join', enquiryId: r.enquiryId, by: 'ref' }
  if (stripReplyPrefixes(m.subject) !== String(m.subject ?? '').trim() && String(m.subject ?? '').includes(CONTACT_COPY_PREFIX)) {
    const f = k.latestFormFor(from)
    if (f) return { kind: 'join', enquiryId: f.enquiryId, by: 'form_copy_reply' }
  }
  return { kind: 'new' }
}

// ── 3 · the numbers check ─────────────────────────────────────────────────────────────────────────────────────────────
/** Every decimal digit Unicode has (Arabic-Indic, Devanagari, Bengali, Thai, full-width …) → ASCII. */
export function asciiDigits(s: string): string {
  return s.replace(/\p{Nd}/gu, ch => {
    const c = ch.codePointAt(0)!
    if (c >= 48 && c <= 57) return ch
    // Every Unicode decimal-digit block is ten consecutive code points starting at a value ending in 0 (hex) or 6 (Arabic-Indic: 0x660).
    for (const zero of [0x660, 0x6f0, 0x7c0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xde6, 0xe50, 0xed0, 0xf20, 0x1040, 0x1090, 0x17e0, 0x1810, 0xff10]) {
      if (c >= zero && c < zero + 10) return String(c - zero)
    }
    return ch
  })
}

/** A number as written: its digits (`raw`, what a failure names), every value it can honestly be read as, and its unit. */
export interface ReadNumber {
  raw: string
  values: number[]
  /** '%' (or the Arabic '٪', stored as '%'), a currency symbol written before or after it (£ € $ ¥ ₹ …), or '' for none. */
  unit: string
}

/** Thousands separators that are never decimal marks: a space, a no-break space, a narrow no-break space, a thin space, an apostrophe. */
const GROUP_SPACE = /[ \u00A0\u202F\u2009'’]/
const round4 = (v: number) => Math.round(v * 10000) / 10000

/**
 * 🔴 ONE CHUNK OF DIGITS WITH '.' AND ',' ONLY → the values it can be. inbox-2 (23 Nov 2026): "1.5" is one and a half — NEVER 15 (the
 * old reading took every separator as a possible thousands one, so "1.5%" in a pack let an invented "€15" pass).
 *   • no separator                                  → the integer;
 *   • both '.' and ','                              → the LAST is the decimal mark, the other groups thousands ("1,234.56", "1.234,56");
 *   • one '.' or ',' followed by exactly 3 digits    → genuinely two readings ("4,000" is 4000 in English, 4 in French; "4.000" the reverse);
 *   • one '.' or ',' followed by 1, 2 or 4+ digits   → a decimal only ("1.5", "1,5", "0,99", "12.50");
 *   • the same mark more than once, groups of 3     → thousands ("1,000,000", "1.000.000"); otherwise not one number (a version, a
 *                                                     date) → each part on its own.
 */
function chunkValues(chunk: string): { raw: string; values: number[] }[] {
  const dots = (chunk.match(/\./g) || []).length, commas = (chunk.match(/,/g) || []).length
  if (!dots && !commas) return [{ raw: chunk, values: [Number(chunk)] }]
  if (dots && commas) {
    const dec = chunk.lastIndexOf('.') > chunk.lastIndexOf(',') ? '.' : ','
    const grp = dec === '.' ? ',' : '.'
    const v = Number(chunk.split(grp).join('').replace(dec, '.'))
    return Number.isFinite(v) ? [{ raw: chunk, values: [v] }] : chunk.split(/[.,]/).map(p => ({ raw: p, values: [Number(p)] }))
  }
  const mark = dots ? '.' : ','
  const parts = chunk.split(mark)
  if (parts.length === 2) {
    const [a, b] = parts
    const decimal = Number(`${a}.${b}`)
    return [{ raw: chunk, values: b.length === 3 && a.length <= 3 ? [Number(a + b), decimal] : [decimal] }]
  }
  const thousands = parts[0].length >= 1 && parts[0].length <= 3 && parts.slice(1).every(p => p.length === 3)
  return thousands ? [{ raw: chunk, values: [Number(parts.join(''))] }] : parts.map(p => ({ raw: p, values: [Number(p)] }))
}

/**
 * The numbers a text states. Digits in any script are read as ASCII first (asciiDigits). Thousands may be grouped with a space,
 * a no-break space, a narrow no-break space or an apostrophe ("4 000", "1'000"); decimals use a point or a comma. A currency symbol
 * before or after ("£29", "29 €", "€0.25", "0,25 €") and a percent sign ("1,5 %", "0.99%") are the number's unit.
 */
export function numbersIn(text: string): ReadNumber[] {
  const s = asciiDigits(String(text ?? ''))
  const out: ReadNumber[] = []
  for (const m of s.matchAll(/\d+(?:(?:[.,]|[ \u00A0\u202F\u2009'’])\d+)*/g)) {
    // 1 · spaces / apostrophes join digit groups only before a group of exactly three; otherwise they separate two numbers ("5 7")
    const pieces = m[0].split(GROUP_SPACE)
    const chunks: string[] = []
    let cur = pieces[0]
    for (const p of pieces.slice(1)) {
      if (/^\d{3}(?:[.,]\d+)?$/.test(p) && !/[.,]/.test(cur)) cur += p
      else { chunks.push(cur); cur = p }
    }
    chunks.push(cur)
    // 2 · the unit: a currency symbol or % right before the first chunk or right after the last
    const before = s.slice(Math.max(0, m.index! - 3), m.index!)
    const after = s.slice(m.index! + m[0].length, m.index! + m[0].length + 3)
    const pre = /(\p{Sc})[ \u00A0\u202F]?$/u.exec(before)?.[1] ?? ''
    const postM = /^[ \u00A0\u202F]?([\p{Sc}%٪])/u.exec(after)
    const post = postM ? (postM[1] === '٪' ? '%' : postM[1]) : ''
    const read = chunks.flatMap(chunkValues)
    read.forEach((r, i) => {
      const unit = (i === 0 && pre) ? pre : (i === read.length - 1 && post) ? post : ''
      out.push({ raw: r.raw, values: [...new Set(r.values.filter(Number.isFinite).map(round4))], unit })
    })
  }
  return out
}

export interface NumbersResult { result: 'pass' | 'fail'; unknown: string[]; checked: number }
/**
 * 🔴 Every number in the drafts must be one the answer pack states (the caller adds the customer's own message to the pack text:
 * their numbers are allowed — decision 6). Values are compared, not strings ("1,5 %" = "1.5%", "0,25 €" = "€0.25"), and units must
 * agree when both sides have one: a percentage is not an amount, and "€29" is not "£29". One that is not stated → fail → review.
 */
export function numbersCheck(drafts: readonly string[], packText: string): NumbersResult {
  const allowed = new Map<number, Set<string>>()
  for (const n of numbersIn(packText)) for (const v of n.values) { if (!allowed.has(v)) allowed.set(v, new Set()); allowed.get(v)!.add(n.unit) }
  const fits = (v: number, unit: string) => { const u = allowed.get(v); return !!u && (unit === '' || u.has('') || u.has(unit)) }
  const unknown: string[] = []
  let checked = 0
  for (const d of drafts) for (const n of numbersIn(d)) {
    checked++
    if (!n.values.some(v => fits(v, n.unit)) && !unknown.includes(n.raw)) unknown.push(n.raw)
  }
  return { result: unknown.length ? 'fail' : 'pass', unknown, checked }
}

// ── 4 · auto-send ─────────────────────────────────────────────────────────────────────────────────────────────────────
export type AskStatus = 'available' | 'limited' | 'gap' | 'unknown'
export interface DraftFlag { kind: string; detail: string }
/** 🔴 No send path exists (enquiries-backend-1 sends nothing). Changing this is a decision for Dominic AND new code. */
export const AUTO_SEND_BUILT = false
/**
 * Could this draft ever go out without Dominic? NEVER with a flag, a failed numbers check or an ask that is not fully covered. And today
 * never at all: AUTO_SEND_BUILT is false.
 */
export function canAutoSend(d: { flags: readonly DraftFlag[]; numbers_check: 'pass' | 'fail'; asks: readonly { status: AskStatus }[] }): boolean {
  if (d.flags.length > 0) return false
  if (d.numbers_check !== 'pass') return false
  if (d.asks.some(a => a.status !== 'available')) return false
  return AUTO_SEND_BUILT
}

// ── "Note:" lines ─────────────────────────────────────────────────────────────────────────────────────────────────────
const NOTE_RE = /^\s*(?:[-*•>]\s*)?note\s*:\s*(.*)$/i
/** Lines starting "Note:" are Dominic's instructions to the drafter, never words for a customer: split them off. */
export function splitNotes(text: string): { text: string; notes: string[] } {
  const keep: string[] = [], notes: string[] = []
  for (const line of String(text ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const m = NOTE_RE.exec(line)
    if (m) { if (m[1].trim()) notes.push(m[1].trim()) } else keep.push(line)
  }
  return { text: keep.join('\n').replace(/\n{3,}/g, '\n\n').trim(), notes }
}
