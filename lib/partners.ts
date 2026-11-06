// lib/partners.ts — Admin › Partners: the vocabulary and every rule, as PURE functions (partners-1, 5 November 2026).
//
// No network, no database, no clock of its own: the routes, the tab and scripts/partners-1.cjs all call these, so
// "what is due", "what an edit may write" and "when the status moves by itself" have one implementation each.

export const PARTNER_TYPES = ['association', 'organiser', 'consultant', 'supplier', 'directory', 'press', 'other'] as const
export type PartnerType = typeof PARTNER_TYPES[number]
export const PARTNER_STATUSES = ['to_contact', 'contacted', 'replied', 'in_talks', 'partner', 'not_now'] as const
export type PartnerStatus = typeof PARTNER_STATUSES[number]
export const PARTNER_PRIORITIES = ['high', 'medium', 'low'] as const
export type PartnerPriority = typeof PARTNER_PRIORITIES[number]

export const TYPE_LABEL: Record<PartnerType, string> = {
  association: 'Association', organiser: 'Organiser', consultant: 'Consultant', supplier: 'Supplier',
  directory: 'Directory', press: 'Press', other: 'Other',
}
export const STATUS_LABEL: Record<PartnerStatus, string> = {
  to_contact: 'To contact', contacted: 'Contacted', replied: 'Replied', in_talks: 'In talks', partner: 'Partner', not_now: 'Not now',
}
export const STATUS_TONE: Record<PartnerStatus, string> = {
  to_contact: 'bg-slate-100 text-slate-700 border-slate-300',
  contacted: 'bg-sky-50 text-sky-800 border-sky-300',
  replied: 'bg-amber-50 text-amber-900 border-amber-300',
  in_talks: 'bg-violet-50 text-violet-800 border-violet-300',
  partner: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  not_now: 'bg-slate-50 text-slate-400 border-slate-200',
}
export const PRIORITY_LABEL: Record<PartnerPriority, string> = { high: 'High', medium: 'Medium', low: 'Low' }

export interface Partner {
  id: string
  name: string
  type: PartnerType
  country_code: string | null
  region: string | null
  website: string | null
  contact_name: string | null
  contact_role: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  source: string | null
  status: PartnerStatus
  priority: PartnerPriority
  next_follow_up_on: string | null
  offered: string | null
  outcome: string | null
  notes: string | null
  last_contacted_at: string | null
  last_reply_at: string | null
  created_at: string
  updated_at: string
}

/** Every column the routes select — one list, so a select and the type cannot drift. */
export const PARTNER_COLUMNS = 'id, name, type, country_code, region, website, contact_name, contact_role, email, phone, linkedin_url, source, status, priority, next_follow_up_on, offered, outcome, notes, last_contacted_at, last_reply_at, created_at, updated_at'

const TEXT_FIELDS = ['name', 'region', 'website', 'contact_name', 'contact_role', 'email', 'phone', 'linkedin_url', 'source', 'offered', 'outcome', 'notes'] as const
const LONG_TEXT = new Set(['offered', 'outcome', 'notes'])
const MAX_SHORT = 300
const MAX_LONG = 5000

export const isPartnerType = (v: unknown): v is PartnerType => typeof v === 'string' && (PARTNER_TYPES as readonly string[]).includes(v)
export const isPartnerStatus = (v: unknown): v is PartnerStatus => typeof v === 'string' && (PARTNER_STATUSES as readonly string[]).includes(v)
export const isPartnerPriority = (v: unknown): v is PartnerPriority => typeof v === 'string' && (PARTNER_PRIORITIES as readonly string[]).includes(v)

/** Case-insensitive, trimmed — the same key the unique index uses (`lower(btrim(email))`). Blank ⇒ null. */
export function emailKey(email: string | null | undefined): string | null {
  const e = String(email ?? '').trim().toLowerCase()
  return e ? e : null
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * What an edit or an Add may write. Unknown keys are dropped; a bad value is a refusal sentence, never a silent
 * coercion. ⚠️ `status` is NOT accepted here — a status change goes through `statusChange` so it is always logged.
 */
export function validatePartnerPatch(input: Record<string, unknown>, opts: { creating?: boolean } = {}):
  { ok: true; patch: Record<string, string | null> } | { ok: false; error: string } {
  const patch: Record<string, string | null> = {}
  for (const k of TEXT_FIELDS) {
    if (!(k in input)) continue
    const raw = input[k]
    if (raw != null && typeof raw !== 'string') return { ok: false, error: `${k} must be text.` }
    const v = String(raw ?? '').trim()
    const cap = LONG_TEXT.has(k) ? MAX_LONG : MAX_SHORT
    if (v.length > cap) return { ok: false, error: `${k} is longer than ${cap} characters.` }
    patch[k] = v || null
  }
  if ('name' in patch && !patch.name) return { ok: false, error: 'The organisation needs a name.' }
  if (opts.creating && !patch.name) return { ok: false, error: 'The organisation needs a name.' }
  if (patch.email) {
    if (!EMAIL_RE.test(patch.email)) return { ok: false, error: `“${patch.email}” is not an email address.` }
    patch.email = patch.email.trim()
  }
  if ('type' in input) {
    if (!isPartnerType(input.type)) return { ok: false, error: 'Unknown type.' }
    patch.type = input.type
  }
  if ('priority' in input) {
    if (!isPartnerPriority(input.priority)) return { ok: false, error: 'Unknown priority.' }
    patch.priority = input.priority
  }
  if ('country_code' in input) {
    const c = String(input.country_code ?? '').trim().toUpperCase()
    if (c && !/^[A-Z]{2}$/.test(c)) return { ok: false, error: 'Country must be a two-letter code, e.g. GB.' }
    patch.country_code = c || null
  }
  if ('next_follow_up_on' in input) {
    const d = String(input.next_follow_up_on ?? '').trim()
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, error: 'Follow-up must be a date (YYYY-MM-DD).' }
    patch.next_follow_up_on = d || null
  }
  if ('status' in input) return { ok: false, error: 'Change the status with the status selector, so it is logged.' }
  return { ok: true, patch }
}

/** A status change, and the event that records it. Null when nothing changes (same status). */
export function statusChange(from: PartnerStatus, to: unknown):
  { ok: true; change: null | { to: PartnerStatus; event: { kind: 'status'; from_status: PartnerStatus; to_status: PartnerStatus } } } | { ok: false; error: string } {
  if (!isPartnerStatus(to)) return { ok: false, error: 'Unknown status.' }
  if (to === from) return { ok: true, change: null }
  return { ok: true, change: { to, event: { kind: 'status', from_status: from, to_status: to } } }
}

/** 🔴 THE TWO AUTOMATIC MOVES, AND ONLY THESE. Everything else is Dominic's. */
export function autoStatusOnSend(current: PartnerStatus): PartnerStatus | null {
  return current === 'to_contact' ? 'contacted' : null
}
export function autoStatusOnReply(current: PartnerStatus): PartnerStatus | null {
  return current === 'contacted' ? 'replied' : null
}

/** "Today" in London as YYYY-MM-DD — the follow-up date is a calendar date, not an instant. */
export function londonToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Due = a follow-up date of today or earlier. No date ⇒ not due. */
export function isDue(p: Pick<Partner, 'next_follow_up_on'>, today: string): boolean {
  return !!p.next_follow_up_on && p.next_follow_up_on <= today
}

const PRIORITY_RANK: Record<PartnerPriority, number> = { high: 0, medium: 1, low: 2 }
/** Follow-up date ascending (no date last), then priority high → low, then name. */
export function comparePartners(a: Pick<Partner, 'next_follow_up_on' | 'priority' | 'name'>, b: Pick<Partner, 'next_follow_up_on' | 'priority' | 'name'>): number {
  const da = a.next_follow_up_on, db = b.next_follow_up_on
  if (da !== db) {
    if (!da) return 1
    if (!db) return -1
    return da < db ? -1 : 1
  }
  const pr = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
  if (pr) return pr
  return a.name.localeCompare(b.name)
}

export interface PartnerFilter {
  q?: string
  status?: PartnerStatus | ''
  type?: PartnerType | ''
  country?: string
  dueOnly?: boolean
}

/** The list on the left: search + filters, then the one sort. */
export function filterPartners<P extends Partner>(rows: readonly P[], f: PartnerFilter, today: string): P[] {
  const q = (f.q ?? '').trim().toLowerCase()
  return rows
    .filter(p => !f.status || p.status === f.status)
    .filter(p => !f.type || p.type === f.type)
    .filter(p => !f.country || (p.country_code ?? '') === f.country)
    .filter(p => !f.dueOnly || isDue(p, today))
    .filter(p => !q || [p.name, p.contact_name, p.email, p.region, p.website, p.notes, p.source]
      .some(v => (v ?? '').toLowerCase().includes(q)))
    .sort(comparePartners)
}

/** One timeline row: an email (outreach_messages) or an event (partner_events). Newest first. */
export interface PartnerTimelineItem {
  kind: 'email' | 'note' | 'status'
  id: string
  at: string | null
}
export function timelineOrder<T extends PartnerTimelineItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))
}

// ── BULK ADD (scripts/partners-add.cjs) ────────────────────────────────────────────────────────────────
/** The dedupe key for a row without an email: name + country, both case-insensitive. */
export function nameCountryKey(name: string | null | undefined, country: string | null | undefined): string {
  return `${String(name ?? '').trim().toLowerCase()}|${String(country ?? '').trim().toUpperCase()}`
}

/**
 * Which incoming rows to insert: skipped when the email (case-insensitive) or name+country is already present —
 * in the table OR earlier in the same file. Pure, so the script and the check share it.
 */
export function planBulkAdd(existing: readonly { name: string; country_code: string | null; email: string | null }[],
  incoming: readonly Record<string, unknown>[]):
  { add: Record<string, string | null>[]; skipped: { name: string; reason: string }[]; invalid: { row: number; error: string }[] } {
  const emails = new Set(existing.map(e => emailKey(e.email)).filter((x): x is string => !!x))
  const names = new Set(existing.map(e => nameCountryKey(e.name, e.country_code)))
  const add: Record<string, string | null>[] = []
  const skipped: { name: string; reason: string }[] = []
  const invalid: { row: number; error: string }[] = []
  incoming.forEach((raw, i) => {
    const { status: _status, ...rest } = raw ?? {}
    void _status   // a bulk add never sets a status: every new row starts at to_contact
    const v = validatePartnerPatch({ type: 'other', priority: 'medium', ...rest }, { creating: true })
    if (!v.ok) { invalid.push({ row: i + 1, error: 'error' in v ? v.error : 'invalid' }); return }
    const row = (v as { patch: Record<string, string | null> }).patch
    const ek = emailKey(row.email)
    const nk = nameCountryKey(row.name, row.country_code)
    if (ek && emails.has(ek)) { skipped.push({ name: row.name ?? '', reason: `email ${ek} already present` }); return }
    if (names.has(nk)) { skipped.push({ name: row.name ?? '', reason: `${row.name} (${row.country_code ?? 'no country'}) already present` }); return }
    if (ek) emails.add(ek)
    names.add(nk)
    add.push(row)
  })
  return { add, skipped, invalid }
}

// ── SENDING (app/api/admin/partners/mail-send) ─────────────────────────────────────────────────────────
/** Where a partner's attachment lives in the outreach bucket: `partners/<partner_id>/<uuid>-<filename>`. */
export function partnerStoragePath(partnerId: string, uuid: string, safeName: string): string {
  return `partners/${partnerId}/${uuid}-${safeName}`
}
export function pathBelongsToPartner(path: string, partnerId: string): boolean {
  return !!partnerId && String(path ?? '').startsWith(`partners/${partnerId}/`)
}

/**
 * Why a partner email may not go, or null. 🔴 THE EXISTING DO-NOT-CONTACT LIST IS HONOURED: `dncAddresses` is the
 * lower-cased contact address of every prospect marked do_not_contact — an address on it is never emailed from this
 * tab either, whether it is the partner's own or the address a reply goes back to.
 */
export function partnerSendRefusal(input: {
  partner: { email: string | null } | null
  to: string | null
  dncAddresses: ReadonlySet<string>
  isTest: boolean
}): string | null {
  if (!input.partner) return 'That partner could not be read.'
  const to = emailKey(input.to)
  if (!to) return 'This partner has no email address — add one first.'
  if (!EMAIL_RE.test(to)) return `“${input.to}” is not an email address.`
  if (input.dncAddresses.has(to)) return `${to} is on the do-not-contact list, so nothing is sent to it.`
  const own = emailKey(input.partner.email)
  if (own && input.dncAddresses.has(own)) return `${own} is on the do-not-contact list, so nothing is sent to this partner.`
  return null
}
