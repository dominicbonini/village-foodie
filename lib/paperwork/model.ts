// lib/paperwork/model.ts — Manage › Paperwork's rules, PURE and CLIENT-SAFE (paperwork-1, 4 November 2026,
// docs/paperwork-1-report.md). No database, no network, no words: the screens and the server routes ask this module, so a
// status, a reminder stage or a warning is decided in ONE place.
//
// Dates are 'YYYY-MM-DD' strings in the TRUCK's calendar (today = lib/time-utils getLocalDateInTz for its time zone).

/** The largest file accepted: 20 MB. The bucket (20261066) refuses anything bigger too. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024
/** What may be uploaded, as its bytes say (lib/paperwork/sniff.ts) — never the name or the declared type. */
export const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'] as const
export type AcceptedMime = (typeof ACCEPTED_MIME)[number]
/** What is stored: HEIC is converted to JPEG before it is kept. */
export const STORED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const
export type StoredMime = (typeof STORED_MIME)[number]
/** The file picker's `accept` (camera, library or file). */
export const ACCEPT_ATTRIBUTE = 'application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp,.pdf,.jpg,.jpeg,.png,.heic,.heif,.webp'

/** "Due soon": an expiry within this many days. */
export const DUE_SOON_DAYS = 30
/** A link's default life without an event, and its longest. */
export const SHARE_DEFAULT_DAYS = 14
export const SHARE_MAX_DAYS = 90
/** Organisers one send may name. */
export const MAX_ORGANISER_EMAILS = 5
export const MAX_MESSAGE_CHARS = 1000

export type DateLabel = 'expires' | 'review_by'
/** One row of public.paperwork_document_types. */
export interface DocumentTypeRow { key: string; countryCode: string | null; position: number; hasExpiry: boolean; dateLabel: DateLabel; active: boolean }
export interface DocumentType { key: string; hasExpiry: boolean; dateLabel: DateLabel }

/** The country's own list when it has one (any active row), else the general list (country NULL). In position order. */
export function typesForCountry(rows: readonly DocumentTypeRow[], country: string | null | undefined): DocumentType[] {
  const code = String(country ?? '').toUpperCase()
  const own = rows.filter(r => r.active && r.countryCode === code)
  const list = own.length ? own : rows.filter(r => r.active && r.countryCode == null)
  return [...list].sort((a, b) => a.position - b.position || a.key.localeCompare(b.key))
    .map(r => ({ key: r.key, hasExpiry: r.hasExpiry, dateLabel: r.dateLabel }))
}

// ── dates ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const YMD = /^\d{4}-\d{2}-\d{2}$/
/** A real calendar date: '2026-02-30' is not (JavaScript would roll it over to 2 March). */
export const isYmd = (s: unknown): s is string => {
  if (typeof s !== 'string' || !YMD.test(s)) return false
  const t = Date.parse(`${s}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s
}
const dayNumber = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000)
/** Whole days from `from` to `to` (to − from): tomorrow is 1, yesterday −1. */
export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from)
export function addDays(ymd: string, days: number): string {
  return new Date((dayNumber(ymd) + days) * 86_400_000).toISOString().slice(0, 10)
}

// ── a document's status ─────────────────────────────────────────────────────────────────────────────────────────────
export type DocStatus = 'missing' | 'up_to_date' | 'due_soon' | 'expired'
/** Up to date / due soon (expires within 30 days, today included) / expired (the date has passed) / missing (none). A
 *  document with no date, or of a type that has none, is up to date. `daysLeft` is null without a date. */
export function documentStatus(doc: { expiresOn: string | null } | null | undefined, today: string): { status: DocStatus; daysLeft: number | null } {
  if (!doc) return { status: 'missing', daysLeft: null }
  if (!doc.expiresOn) return { status: 'up_to_date', daysLeft: null }
  const daysLeft = daysBetween(today, doc.expiresOn)
  if (daysLeft < 0) return { status: 'expired', daysLeft }
  if (daysLeft <= DUE_SOON_DAYS) return { status: 'due_soon', daysLeft }
  return { status: 'up_to_date', daysLeft }
}

// ── reminders: 28 days, 7 days, on the day, then weekly while expired ──────────────────────────────────────────────
export type ReminderStage = string   // 'd28' | 'd7' | 'd0' | 'w<N>'
/** The stage a document is in today, or null when no reminder is due yet (more than 28 days left). */
export function reminderStageFor(expiresOn: string, today: string): ReminderStage | null {
  const days = daysBetween(today, expiresOn)
  if (days > 28) return null
  if (days > 7) return 'd28'
  if (days > 0) return 'd7'
  if (days > -7) return 'd0'
  return `w${Math.floor(-days / 7)}`
}
/** A stage's order: d28 < d7 < d0 < w1 < w2 … (null = nothing sent). */
export function stageRank(stage: ReminderStage | null | undefined): number {
  if (!stage) return 0
  if (stage === 'd28') return 1
  if (stage === 'd7') return 2
  if (stage === 'd0') return 3
  const m = /^w(\d+)$/.exec(stage)
  return m ? 3 + Number(m[1]) : 0
}
/**
 * The reminder to send today, or null. 🔴 NEVER THE SAME STAGE TWICE: a stage is sent only when it is LATER than the last one
 * recorded for this expiry date. A new expiry date (a renewal is a new document; an edited date) starts again. A document
 * saved with 5 days left gets the 7-day reminder, not the 28-day one; a missed day is caught up once, never repeated.
 */
export function reminderDue(doc: { expiresOn: string | null; reminderStage: string | null; reminderExpiresOn: string | null }, today: string): ReminderStage | null {
  if (!doc.expiresOn) return null
  const stage = reminderStageFor(doc.expiresOn, today)
  if (!stage) return null
  const last = doc.reminderExpiresOn === doc.expiresOn ? doc.reminderStage : null
  return stageRank(stage) > stageRank(last) ? stage : null
}

// ── the AI's draft and its warnings ─────────────────────────────────────────────────────────────────────────────────
export interface DraftDetails {
  typeKey: string | null          // a key of the country's list, or null = "Other…"
  customName: string | null       // the name for "Other…" (the AI's suggestion, editable)
  issuer: string | null
  issuedOn: string | null
  expiresOn: string | null
  nameOnDocument: string | null
  coverAmountMinor: number | null
  currency: string | null
}
export type DraftWarning =
  | { code: 'notRead' }
  | { code: 'expired'; params: { date: string } }
  | { code: 'expiresSoon'; params: { days: number } }
  | { code: 'nameMismatch'; params: { name: string } }

const NAME_NOISE = new Set(['ltd', 'limited', 'llc', 'inc', 'plc', 'llp', 'gmbh', 'ug', 'sarl', 'sas', 'srl', 'bv', 'nv', 'ab', 'as', 'oy', 'kft', 'sro', 'spa', 'sa', 'the', 'and', 'co', 'company', 't/a', 'ta', 'trading', 'as'])
const nameWords = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1 && !NAME_NOISE.has(w))
/** Does the name on a document look like one of the truck's names? True when they share a word (company suffixes and
 *  accents ignored), or either is empty — the warning is for a document in SOMEONE ELSE's name, not for a blank. */
export function nameLooksLike(onDocument: string | null | undefined, truckNames: readonly (string | null | undefined)[]): boolean {
  const doc = new Set(nameWords(String(onDocument ?? '')))
  if (!doc.size) return true
  const names = truckNames.map(n => nameWords(String(n ?? ''))).filter(w => w.length)
  if (!names.length) return true
  return names.some(ws => ws.some(w => doc.has(w)))
}

/** The plain-words warnings for "Check the details", in the order they show. Computed again as the truck edits. */
export function draftWarnings(d: Pick<DraftDetails, 'expiresOn' | 'nameOnDocument'>, today: string, truckNames: readonly (string | null | undefined)[], read: boolean): DraftWarning[] {
  const out: DraftWarning[] = []
  if (!read) out.push({ code: 'notRead' })
  if (d.expiresOn && isYmd(d.expiresOn)) {
    const days = daysBetween(today, d.expiresOn)
    if (days < 0) out.push({ code: 'expired', params: { date: d.expiresOn } })
    else if (days <= DUE_SOON_DAYS) out.push({ code: 'expiresSoon', params: { days } })
  }
  if (d.nameOnDocument && !nameLooksLike(d.nameOnDocument, truckNames)) out.push({ code: 'nameMismatch', params: { name: d.nameOnDocument } })
  return out
}

// ── sending to organisers ───────────────────────────────────────────────────────────────────────────────────────────
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/
export const isEmail = (s: string) => s.length <= 254 && EMAIL.test(s)
/** "a@x.com, b@y.org" → the addresses (trimmed, lower-cased, duplicates once) and the ones that are not addresses. */
export function parseOrganiserEmails(input: string): { emails: string[]; invalid: string[] } {
  const parts = String(input ?? '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
  const emails: string[] = [], invalid: string[] = []
  for (const p of parts) {
    if (!isEmail(p)) { invalid.push(p); continue }
    const e = p.toLowerCase()
    if (!emails.includes(e)) emails.push(e)
  }
  return { emails, invalid }
}

/** "Link works until": the day after the chosen event, else 14 days from today — never past 90 days, never before tomorrow. */
export function defaultShareUntil(today: string, eventDate: string | null | undefined): string {
  const want = eventDate && isYmd(eventDate) ? addDays(eventDate, 1) : addDays(today, SHARE_DEFAULT_DAYS)
  return clampShareUntil(today, want)
}
export function clampShareUntil(today: string, until: string): string {
  const max = addDays(today, SHARE_MAX_DAYS), min = addDays(today, 1)
  if (!isYmd(until)) return addDays(today, SHARE_DEFAULT_DAYS)
  return until > max ? max : until < min ? min : until
}

/** A link's state as the Sent list shows it. */
export function shareState(s: { expiresAt: string; revokedAt: string | null }, now: Date): 'live' | 'expired' | 'off' {
  if (s.revokedAt) return 'off'
  return Date.parse(s.expiresAt) > now.getTime() ? 'live' : 'expired'
}

/** A file name that is safe as a storage key and in a download: letters, digits, dot, dash, underscore; at most 80. */
export function safeFileName(name: string | null | undefined, fallback = 'document'): string {
  const base = String(name ?? '').normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '')
  return (base || fallback).slice(0, 80)
}
/** The extension a stored file gets from its type. */
export const EXTENSION: Record<StoredMime, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// ── the details the truck saves ─────────────────────────────────────────────────────────────────────────────────────
const clean = (v: unknown, max: number): string | null => { if (typeof v !== 'string') return null; const s = v.replace(/\s+/g, ' ').trim(); return s ? s.slice(0, max) : null }
/** The details the screen sends, checked: the saved shape, or null when they cannot be saved (a type not in the country's list,
 *  no name for "Other…", a bad date, an expiry before the issue date, a cover amount without its currency). */
export function checkedDetails(raw: unknown, types: readonly DocumentType[]): DraftDetails | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const typeKey = typeof r.typeKey === 'string' && r.typeKey ? r.typeKey : null
  const type = typeKey ? types.find(t => t.key === typeKey) : null
  if (typeKey && !type) return null
  const customName = typeKey ? null : clean(r.customName, 120)
  if (!typeKey && !customName) return null
  const date = (v: unknown): string | null | undefined => (v == null || v === '' ? null : isYmd(v) ? v : undefined)
  const issuedOn = date(r.issuedOn), expiresRaw = date(r.expiresOn)
  if (issuedOn === undefined || expiresRaw === undefined) return null
  const expiresOn = type && !type.hasExpiry ? null : expiresRaw
  if (issuedOn && expiresOn && expiresOn < issuedOn) return null
  const cover = r.coverAmountMinor == null || r.coverAmountMinor === '' ? null : Number(r.coverAmountMinor)
  if (cover !== null && !(Number.isSafeInteger(cover) && cover > 0)) return null
  const currency = cover ? (typeof r.currency === 'string' && /^[A-Z]{3}$/.test(r.currency) ? r.currency : null) : null
  if (cover && !currency) return null
  return { typeKey, customName, issuer: clean(r.issuer, 160), issuedOn, expiresOn, nameOnDocument: clean(r.nameOnDocument, 160), coverAmountMinor: cover, currency }
}
