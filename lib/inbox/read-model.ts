// lib/inbox/read-model.ts — 🔴 ONE READ MODEL OVER EVERY INCOMING EMAIL (inbox-1, 23 November 2026; docs/inbox-1-report.md).
// No data is moved: each type is read where it already lives.
//   • Prospects — the Today screen's own "Replies waiting" list: app/api/admin/outreach/today/route.ts GET, called as it is (passed in as
//     `todayWaiting`), so the rule (needsAttention, linked trucks excluded, snoozes, done) is the Today rule and not a copy of it.
//   • Partners — inbound outreach_messages with a partner_id: received, not a test, not done or snoozed (needsAttention, the same
//     predicate), and with no later email from us to that partner.
//   • Enquiries and Customers — enquiries / enquiry_messages (enquiries-backend-1): an incoming message with no later reply from us, the
//     enquiry not closed (Mark done) and not snoozed. A Customer is an enquiry from a linked HatchGrab truck's address.
// Counts are EMAILS waiting (the Today count is per email too); the list has one row per conversation.
// ⚠️ READS ONLY, AND NO MAILBOX. Everything is Postgres; nothing here sends or writes.
import type { SupabaseClient } from '@supabase/supabase-js'
import { needsAttention, replySnippet } from '@/lib/outreach-attention'
import type { WaitingReply } from '@/lib/outreach-today'
import { stripQuotedHistory } from '@/lib/outreach-mail-poll-rules'
import { parseAliases, ALIASES_KEY, REPLY_FROM_ALIAS_KEY, aliasLanguage, enquiryReplyFrom, DOMINIC_ADDRESS, HELLO_ADDRESS } from '@/lib/inbox/aliases'
import { settleLanguage } from '@/lib/inbox/language'
import { keyOf, parseKey, type InboxConversation, type InboxCounts, type InboxType, type ThreadMessage, type InboxThread } from '@/lib/inbox/types'

type Row = Record<string, unknown>
const s = (v: unknown) => (v == null ? '' : String(v))
const lower = (v: unknown) => s(v).trim().toLowerCase()
const fail = (what: string, e: { message: string } | null) => { if (e) throw new Error(`${what}: ${e.message}`) }
/** The text of an email for reading: what they wrote, without the quoted history under it. Never cut short. */
export const readable = (t: unknown) => stripQuotedHistory(s(t), 200_000).trim() || s(t).trim()
const OUT_DONE = ['sent', 'uncertain', 'sending']

export interface InboxSettings { aliases: string[]; replyFromAlias: boolean }
export async function readInboxSettings(db: SupabaseClient): Promise<InboxSettings> {
  const { data, error } = await db.from('outreach_settings').select('key, value').in('key', [ALIASES_KEY, REPLY_FROM_ALIAS_KEY])
  fail('settings', error)
  const m = new Map(((data ?? []) as Row[]).map(r => [s(r.key), r.value]))
  return { aliases: parseAliases(m.get(ALIASES_KEY)), replyFromAlias: m.get(REPLY_FROM_ALIAS_KEY) === true }
}

/** The stored English and language of the latest messages the Inbox has translated (prospects and partners), by message id. */
async function inboxDraftsFor(db: SupabaseClient, keys: string[]): Promise<Map<string, Row>> {
  const out = new Map<string, Row>()
  if (!keys.length) return out
  const { data, error } = await db.from('inbox_drafts').select('conversation_key, source_message_id, their_language, their_english, english_draft, customer_draft, translated_from')
    .in('conversation_key', keys.slice(0, 500))
  fail('inbox drafts', error)
  for (const r of (data ?? []) as Row[]) out.set(`${s(r.conversation_key)}|${s(r.source_message_id)}`, r)
  return out
}

interface Built { conv: InboxConversation; waitingIds: string[] }

function conversation(o: {
  kind: 'enquiry' | 'prospect' | 'partner'; id: string; type: InboxType; name: string; organisation: string | null; email: string | null
  wroteTo: string | null; viaForm: boolean; language: string; latest: { id: string; at: string | null; text: string }; waiting: { id: string; at: string | null }[]; ref: string | null
}): Built {
  const preview = replySnippet(o.latest.text)
  const at = o.waiting.map(w => s(w.at)).filter(Boolean).sort()
  return {
    conv: {
      key: keyOf(o.kind, o.id), type: o.type, name: o.name, organisation: o.organisation, email: o.email, wroteTo: o.wroteTo, viaForm: o.viaForm,
      language: o.language, preview, waitingSince: at[0] ?? o.latest.at, latestAt: o.latest.at, waitingCount: o.waiting.length, latestInboundId: o.latest.id,
      ref: o.ref, searchText: [o.name, o.organisation, o.email, o.wroteTo, o.ref, o.latest.text].map(lower).join(' \u0001 '),
    },
    waitingIds: o.waiting.map(w => w.id),
  }
}

// ── prospects ─────────────────────────────────────────────────────────────────────────────────────────────────────────
async function prospectInfo(db: SupabaseClient, ids: string[]) {
  const info = new Map<string, { name: string; organisation: string | null; email: string | null; country: string | null; platform: string | null }>()
  if (!ids.length) return info
  const { data: p, error } = await db.from('outreach_prospects').select('id, contact_name, contact_first_name, platform, discovery_truck_id').in('id', ids)
  fail('prospects', error)
  const prows = (p ?? []) as Row[]
  const dIds = [...new Set(prows.map(r => s(r.discovery_truck_id)).filter(Boolean))]
  const trucks = new Map<string, Row>()
  if (dIds.length) {
    const { data: d, error: e2 } = await db.from('discovery_trucks').select('id, name, country, contact_email').in('id', dIds)
    fail('discovery trucks', e2)
    for (const r of (d ?? []) as Row[]) trucks.set(s(r.id), r)
  }
  for (const r of prows) {
    const t = trucks.get(s(r.discovery_truck_id))
    const truckName = s(t?.name).trim() || null
    const contact = s(r.contact_name).trim() || null
    info.set(s(r.id), {
      name: contact ?? truckName ?? '(no truck name)', organisation: contact ? truckName : null, email: lower(t?.contact_email) || null,
      country: s(t?.country).trim().toUpperCase() || null, platform: s(r.platform).trim() || null,
    })
  }
  return info
}

async function prospects(db: SupabaseClient, waiting: WaitingReply[]): Promise<Built[]> {
  if (!waiting.length) return []
  const byProspect = new Map<string, WaitingReply[]>()
  for (const w of waiting) byProspect.set(w.prospect_id, [...(byProspect.get(w.prospect_id) ?? []), w])
  const ids = waiting.map(w => w.id)
  const { data, error } = await db.from('outreach_messages').select('id, to_address, from_address, text_body, message_date').in('id', ids)
  fail('waiting messages', error)
  const msg = new Map(((data ?? []) as Row[]).map(r => [s(r.id), r]))
  const info = await prospectInfo(db, [...byProspect.keys()])
  const drafts = await inboxDraftsFor(db, [...byProspect.keys()].map(id => keyOf('prospect', id)))
  const out: Built[] = []
  for (const [pid, rows] of byProspect) {
    const latest = [...rows].sort((a, b) => s(a.message_date).localeCompare(s(b.message_date))).at(-1)!
    const m = msg.get(latest.id) ?? {}
    const p = info.get(pid)
    const text = readable(m.text_body) || latest.snippet
    const d = drafts.get(`${keyOf('prospect', pid)}|${latest.id}`)
    out.push(conversation({
      kind: 'prospect', id: pid, type: 'prospect', name: p?.name ?? latest.prospect_name ?? '(no truck name)', organisation: p?.organisation ?? null,
      email: lower(latest.from_address ?? m.from_address) || p?.email || null, wroteTo: lower(m.to_address) || DOMINIC_ADDRESS, viaForm: false,
      language: settleLanguage({ stored: s(d?.their_language) || null, text, hints: [] }).language,
      latest: { id: latest.id, at: latest.message_date, text }, waiting: rows.map(r => ({ id: r.id, at: r.message_date })), ref: null,
    }))
  }
  return out
}

// ── partners ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function partners(db: SupabaseClient, now: Date, onlyPartner?: string): Promise<Built[]> {
  let q = db.from('outreach_messages').select('id, partner_id, status, is_test, direction, handled_at, snoozed_until, message_date, from_address, to_address, subject, text_body')
    .eq('direction', 'inbound').eq('status', 'received').eq('is_test', false).is('handled_at', null)
  q = onlyPartner ? q.eq('partner_id', onlyPartner) : q.not('partner_id', 'is', null)
  const { data, error } = await q.order('message_date', { ascending: true }).limit(300)
  fail('partner replies', error)
  const inbound = ((data ?? []) as Row[]).filter(r => needsAttention(r as never, { now }))
  if (!inbound.length) return []
  const ids = [...new Set(inbound.map(r => s(r.partner_id)))]
  const { data: outs, error: e2 } = await db.from('outreach_messages').select('partner_id, message_date, status, is_test').eq('direction', 'outbound').in('partner_id', ids)
  fail('partner sends', e2)
  const lastOut = new Map<string, string>()
  for (const r of (outs ?? []) as Row[]) {
    if (r.is_test === true || !OUT_DONE.includes(s(r.status))) continue
    const k = s(r.partner_id); if (s(r.message_date) > (lastOut.get(k) ?? '')) lastOut.set(k, s(r.message_date))
  }
  const { data: orgs, error: e3 } = await db.from('partner_orgs').select('id, name, contact_name, email, language').in('id', ids)
  fail('partner orgs', e3)
  const org = new Map(((orgs ?? []) as Row[]).map(r => [s(r.id), r]))
  const drafts = await inboxDraftsFor(db, ids.map(id => keyOf('partner', id)))
  const out: Built[] = []
  for (const id of ids) {
    const rows = inbound.filter(r => s(r.partner_id) === id && s(r.message_date) > (lastOut.get(id) ?? ''))
    if (!rows.length) continue
    const latest = rows[rows.length - 1]
    const o = org.get(id) ?? {}
    const text = readable(latest.text_body)
    const contact = s(o.contact_name).trim() || null
    const d = drafts.get(`${keyOf('partner', id)}|${s(latest.id)}`)
    out.push(conversation({
      kind: 'partner', id, type: 'partner', name: contact ?? (s(o.name).trim() || lower(latest.from_address)), organisation: contact ? (s(o.name).trim() || null) : null,
      email: lower(latest.from_address) || lower(o.email) || null, wroteTo: lower(latest.to_address) || DOMINIC_ADDRESS, viaForm: false,
      language: settleLanguage({ stored: s(d?.their_language) || null, text, hints: [s(o.language) || null] }).language,
      latest: { id: s(latest.id), at: s(latest.message_date) || null, text }, waiting: rows.map(r => ({ id: s(r.id), at: s(r.message_date) || null })), ref: null,
    }))
  }
  return out
}

// ── enquiries and customers ──────────────────────────────────────────────────────────────────────────────────────────
const ENQ_COLS = 'id, ref, source, name, email, country, language, truck_id, contact_message_id, status, created_at, updated_at, snoozed_until'
const MSG_COLS = 'id, enquiry_id, direction, received_at, send_status, original_text, original_language, english_text, to_address, from_address, subject, mail_message_id, "references", in_reply_to'

async function linkedAddresses(db: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await db.from('discovery_trucks').select('contact_email, hatchgrab_truck_id').not('hatchgrab_truck_id', 'is', null)
  fail('linked trucks', error)
  return new Set(((data ?? []) as Row[]).map(r => lower(r.contact_email)).filter(Boolean))
}

async function enquiries(db: SupabaseClient, now: Date, aliases: string[], onlyEnquiry?: string): Promise<Built[]> {
  let q = db.from('enquiries').select(ENQ_COLS)
  q = onlyEnquiry ? q.eq('id', onlyEnquiry) : q.neq('status', 'closed')
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(300)
  fail('enquiries', error)
  const enqs = ((data ?? []) as Row[]).filter(e => onlyEnquiry || !(e.snoozed_until && new Date(s(e.snoozed_until)).getTime() > now.getTime()))
  if (!enqs.length) return []
  const ids = enqs.map(e => s(e.id))
  const { data: m, error: e2 } = await db.from('enquiry_messages').select(MSG_COLS).in('enquiry_id', ids).order('received_at', { ascending: true }).limit(3000)
  fail('enquiry messages', e2)
  const msgs = (m ?? []) as Row[]
  const contactIds = enqs.map(e => s(e.contact_message_id)).filter(Boolean)
  const business = new Map<string, string>()
  if (contactIds.length) {
    const { data: c, error: e3 } = await db.from('contact_messages').select('id, business_name').in('id', contactIds)
    fail('contact messages', e3)
    for (const r of (c ?? []) as Row[]) if (s(r.business_name).trim()) business.set(s(r.id), s(r.business_name).trim())
  }
  const truckIds = [...new Set(enqs.map(e => s(e.truck_id)).filter(Boolean))]
  const truckName = new Map<string, string>()
  if (truckIds.length) {
    const { data: t, error: e4 } = await db.from('trucks').select('id, name').in('id', truckIds)
    fail('trucks', e4)
    for (const r of (t ?? []) as Row[]) truckName.set(s(r.id), s(r.name))
  }
  const linked = await linkedAddresses(db)
  const out: Built[] = []
  for (const e of enqs) {
    const mine = msgs.filter(x => s(x.enquiry_id) === s(e.id))
    const lastOut = mine.filter(x => x.direction === 'out' && OUT_DONE.includes(s(x.send_status))).map(x => s(x.received_at)).sort().at(-1) ?? ''
    const ins = mine.filter(x => x.direction === 'in')
    const waiting = ins.filter(x => s(x.received_at) > lastOut)
    const latest = (waiting.length ? waiting : ins).at(-1)
    if (!latest || (!waiting.length && !onlyEnquiry)) continue
    const customer = !!e.truck_id || linked.has(lower(e.email))
    const org = business.get(s(e.contact_message_id)) ?? (e.truck_id ? truckName.get(s(e.truck_id)) ?? null : null)
    const text = s(latest.original_text)
    out.push(conversation({
      kind: 'enquiry', id: s(e.id), type: customer ? 'customer' : 'enquiry', name: s(e.name).trim() || lower(e.email), organisation: org,
      email: lower(e.email) || null, wroteTo: lower(latest.to_address) || null, viaForm: e.source === 'form' && !latest.mail_message_id,
      language: settleLanguage({ stored: s(e.language || latest.original_language) || null, text, hints: [aliasLanguage(s(latest.to_address))] }).language,
      latest: { id: s(latest.id), at: s(latest.received_at) || null, text }, waiting: waiting.map(x => ({ id: s(x.id), at: s(x.received_at) || null })), ref: s(e.ref) || null,
    }))
  }
  return out
}

/** The whole list. `todayWaiting` is the Today route's own "Replies waiting" (its GET, called as it is). */
export async function loadInbox(db: SupabaseClient, now: Date, todayWaiting: () => Promise<WaitingReply[]>): Promise<{ conversations: InboxConversation[]; counts: InboxCounts }> {
  const settings = await readInboxSettings(db)
  const [p, pa, en] = await Promise.all([todayWaiting().then(w => prospects(db, w)), partners(db, now), enquiries(db, now, settings.aliases)])
  const conversations = [...p, ...pa, ...en].map(b => b.conv)
    // 🔴 OLDEST UNANSWERED FIRST, as Today does (the page groups them under Older / Today).
    .sort((a, b) => s(a.waitingSince).localeCompare(s(b.waitingSince)) || a.key.localeCompare(b.key))
  return { conversations, counts: countsOf(conversations) }
}

export function countsOf(conversations: readonly InboxConversation[]): InboxCounts {
  const n = (t: InboxType) => conversations.filter(c => c.type === t).reduce((k, c) => k + c.waitingCount, 0)
  const c = { enquiries: n('enquiry'), prospects: n('prospect'), partners: n('partner'), customers: n('customer') }
  return { all: c.enquiries + c.prospects + c.partners + c.customers, ...c }
}

// ── one conversation, in full ─────────────────────────────────────────────────────────────────────────────────────────
export interface ThreadContext {
  thread: Omit<InboxThread, 'drafting' | 'draftHeld'>
  /** What drafting and sending need beyond the page's view. */
  kind: 'enquiry' | 'prospect' | 'partner'
  id: string
  country: string | null
  platform: string | null
  /** The latest inbound row as stored (outreach_messages or enquiry_messages). */
  latestRow: Row
  enquiry: Row | null
  /** The AI's draft English for this message (to tell a hand edit from the AI's words). */
  aiEnglish: string | null
  settings: InboxSettings
}

function threadMessage(r: Row, kind: 'enquiry' | 'outreach'): ThreadMessage {
  if (kind === 'enquiry') {
    return {
      id: s(r.id), direction: r.direction === 'out' ? 'out' : 'in', at: s(r.received_at) || null, from: s(r.from_address) || null, to: s(r.to_address) || null,
      subject: s(r.subject) || null, text: s(r.original_text), english: s(r.english_text) && s(r.english_text) !== s(r.original_text) ? s(r.english_text) : null,
      language: s(r.original_language) || null, status: r.direction === 'out' ? s(r.send_status) || null : null,
    }
  }
  return {
    id: s(r.id), direction: r.direction === 'inbound' ? 'in' : 'out', at: s(r.message_date) || null, from: s(r.from_address) || null, to: s(r.to_address) || null,
    subject: s(r.subject) || null, text: readable(r.text_body) || '(The text of this email was not stored — open it from the Outreach timeline.)',
    english: null, language: null, status: r.direction === 'inbound' ? null : s(r.status) || null,
  }
}

/** One conversation, both directions, newest last, with its draft. null when the key names nothing. */
export async function loadThread(db: SupabaseClient, now: Date, key: string, todayWaiting: () => Promise<WaitingReply[]>): Promise<ThreadContext | null> {
  const k = parseKey(key)
  if (!k) return null
  const settings = await readInboxSettings(db)
  let built: Built | undefined, messages: ThreadMessage[] = [], latestRow: Row | undefined, enquiry: Row | null = null
  let country: string | null = null, platform: string | null = null
  if (k.kind === 'enquiry') {
    built = (await enquiries(db, now, settings.aliases, k.id))[0]
    if (!built) return null
    const { data: e } = await db.from('enquiries').select(ENQ_COLS).eq('id', k.id).maybeSingle()
    enquiry = (e as Row | null) ?? null
    country = s(enquiry?.country).trim() || null
    const { data, error } = await db.from('enquiry_messages').select(MSG_COLS).eq('enquiry_id', k.id).order('received_at', { ascending: true }).limit(500)
    fail('thread', error)
    const rows = (data ?? []) as Row[]
    messages = rows.map(r => threadMessage(r, 'enquiry'))
    latestRow = rows.find(r => s(r.id) === built!.conv.latestInboundId)
  } else {
    const base = db.from('outreach_messages').select('id, prospect_id, partner_id, direction, status, is_test, message_date, from_address, to_address, subject, text_body, html_body, message_id, "references"')
    const { data, error } = await (k.kind === 'prospect' ? base.eq('prospect_id', k.id) : base.eq('partner_id', k.id))
      .eq('is_test', false).order('message_date', { ascending: true }).limit(500)
    fail('thread', error)
    const rows = ((data ?? []) as Row[]).filter(r => r.direction === 'inbound' ? ['received'].includes(s(r.status)) : OUT_DONE.includes(s(r.status)) || ['failed', 'bounced'].includes(s(r.status)))
    messages = rows.map(r => threadMessage(r, 'outreach'))
    if (k.kind === 'prospect') {
      const waiting = (await todayWaiting()).filter(w => w.prospect_id === k.id)
      built = (await prospects(db, waiting))[0]
      const info = (await prospectInfo(db, [k.id])).get(k.id)
      country = info?.country ?? null; platform = info?.platform ?? null
      if (!built) {
        // Answered already (or a deep link): the conversation as it stands, its latest incoming email the one shown.
        const lastIn = rows.filter(r => r.direction === 'inbound').at(-1)
        if (!lastIn) return null
        const text = readable(lastIn.text_body)
        built = conversation({ kind: 'prospect', id: k.id, type: 'prospect', name: info?.name ?? '(no truck name)', organisation: info?.organisation ?? null,
          email: lower(lastIn.from_address) || info?.email || null, wroteTo: lower(lastIn.to_address) || DOMINIC_ADDRESS, viaForm: false,
          language: settleLanguage({ text }).language, latest: { id: s(lastIn.id), at: s(lastIn.message_date) || null, text }, waiting: [], ref: null })
      }
    } else {
      built = (await partners(db, now, k.id))[0]
      const { data: o } = await db.from('partner_orgs').select('id, name, contact_name, email, language, country_code').eq('id', k.id).maybeSingle()
      const org = (o as Row | null) ?? {}
      country = s(org.country_code).trim().toUpperCase() || null
      if (!built) {
        const lastIn = rows.filter(r => r.direction === 'inbound').at(-1)
        if (!lastIn) return null
        const text = readable(lastIn.text_body)
        const contact = s(org.contact_name).trim() || null
        built = conversation({ kind: 'partner', id: k.id, type: 'partner', name: contact ?? (s(org.name) || lower(lastIn.from_address)), organisation: contact ? s(org.name) || null : null,
          email: lower(lastIn.from_address) || null, wroteTo: lower(lastIn.to_address) || DOMINIC_ADDRESS, viaForm: false,
          language: settleLanguage({ text, hints: [s(org.language) || null] }).language, latest: { id: s(lastIn.id), at: s(lastIn.message_date) || null, text }, waiting: [], ref: null })
      }
    }
    latestRow = rows.find(r => s(r.id) === built!.conv.latestInboundId)
  }
  if (!built || !latestRow) return null
  const conv = built.conv
  const latest = messages.find(m => m.id === conv.latestInboundId)!

  // the draft: the Inbox's own (Update reply, prospects, partners) first; an enquiry's poll-made draft otherwise
  const { data: d } = await db.from('inbox_drafts').select('their_language, their_english, english_draft, customer_draft, translated_from')
    .eq('conversation_key', conv.key).eq('source_message_id', conv.latestInboundId).maybeSingle()
  const own = d as Row | null
  let draft: InboxThread['draft'] = null, aiEnglish: string | null = null
  let theirEnglish: string | null = latest.english
  let theirLanguage = s(own?.their_language) || conv.language
  if (own) {
    draft = { english: s(own.english_draft), customer: s(own.customer_draft) || null, translatedFrom: s(own.translated_from) || null, language: theirLanguage }
    aiEnglish = s(own.english_draft)
    if (s(own.their_english)) theirEnglish = s(own.their_english)
  } else if (k.kind === 'enquiry') {
    const { data: ed } = await db.from('enquiry_drafts').select('english_draft, customer_draft, created_at').eq('message_id', conv.latestInboundId).order('created_at', { ascending: false }).limit(1)
    const r = ((ed ?? []) as Row[])[0]
    if (r) { draft = { english: s(r.english_draft), customer: s(r.customer_draft) || null, translatedFrom: s(r.english_draft), language: theirLanguage }; aiEnglish = s(r.english_draft) }
  }
  if (k.kind === 'enquiry') theirLanguage = s(enquiry?.language || latestRow.original_language) || theirLanguage
  const english = /^en(-|$)/i.test(theirLanguage)
  if (theirEnglish && theirEnglish.trim() === latest.text.trim()) theirEnglish = null
  const from = k.kind === 'enquiry' ? enquiryReplyFrom({ replyFromAlias: settings.replyFromAlias, wroteTo: conv.wroteTo, aliases: settings.aliases }) : DOMINIC_ADDRESS
  return {
    thread: { ok: true, conversation: { ...conv, language: theirLanguage }, messages, latest, theirEnglish: english ? null : theirEnglish, theirLanguage, translated: !english && !!theirEnglish, draft, from },
    kind: k.kind, id: k.id, country, platform, latestRow, enquiry, aiEnglish, settings,
  }
}

export { HELLO_ADDRESS }
