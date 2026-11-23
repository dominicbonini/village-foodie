// lib/enquiries/store.ts — the enquiry step's database, through the service-role client the reply poll already holds (enquiries-backend-1,
// 23 November 2026). It writes ONLY the five enquiry tables (enquiries, enquiry_messages, enquiry_drafts, enquiry_spend; reply_knowledge
// is read, approved rows only) and reads outreach_settings (the switch; inbox-1: the aliases), contact_messages and trucks — it never writes those three.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EnquiryStore, EnquiryRow, MessageRow, ContactForIntake } from '@/lib/enquiries/run'
import { ENQUIRY_SWITCH_KEY } from '@/lib/enquiries/run'
import type { KnownThread } from '@/lib/enquiries/rules'
import type { KnowledgeRow } from '@/lib/enquiries/answer-pack'
import { parseAliases, ALIASES_KEY } from '@/lib/inbox/aliases'

type Row = Record<string, unknown>
const fail = (what: string, e: { message: string } | null) => { if (e) throw new Error(`${what}: ${e.message}`) }
/** An ilike pattern that matches this text exactly (case aside): %, _ and \ escaped. */
const exactly = (s: string) => s.replace(/[\\%_]/g, c => `\\${c}`)
const MESSAGE_COLS = 'id, enquiry_id, direction, original_text, original_language, english_text, subject, mail_message_id, in_reply_to, references, mailbox, uid, received_at, to_address'
const ENQUIRY_COLS = 'id, ref, source, name, email, country, language, truck_id, contact_message_id, status, created_at, updated_at'

export function supabaseEnquiryStore(db: SupabaseClient): EnquiryStore {
  return {
    async readSwitch() {
      const { data, error } = await db.from('outreach_settings').select('value, updated_at').eq('key', ENQUIRY_SWITCH_KEY).maybeSingle()
      fail('switch', error)
      const row = data as { value?: unknown; updated_at?: string } | null
      return { enabled: row?.value === true, since: row?.updated_at ?? null }
    },
    async contactMessagesSince(since, limit) {
      const { data, error } = await db.from('contact_messages').select('id, created_at, topic, name, email, business_name, message, country, locale')
        .gte('created_at', since).order('created_at', { ascending: true }).limit(limit * 4)
      fail('contact_messages', error)
      const rows = (data ?? []) as ContactForIntake[]
      if (!rows.length) return []
      const { data: had, error: e2 } = await db.from('enquiries').select('contact_message_id').in('contact_message_id', rows.map(r => r.id))
      fail('enquiries by contact message', e2)
      const taken = new Set(((had ?? []) as Row[]).map(r => String(r.contact_message_id)))
      return rows.filter(r => !taken.has(r.id)).slice(0, limit)
    },
    async messageHeld(mailbox, mailMessageId) {
      const { data, error } = await db.from('enquiry_messages').select('id').eq('mailbox', mailbox).eq('mail_message_id', mailMessageId).limit(1)
      fail('message held', error)
      return !!data && data.length > 0
    },
    async threadLookup(email, mailIds, ref) {
      const byMailId = new Map<string, KnownThread>(), byRef = new Map<string, KnownThread>()
      if (mailIds.length) {
        const { data, error } = await db.from('enquiry_messages').select('mail_message_id, enquiry_id, enquiries(email)').in('mail_message_id', mailIds.slice(0, 50))
        fail('thread ids', error)
        for (const r of (data ?? []) as unknown as { mail_message_id: string; enquiry_id: string; enquiries: { email: string } | null }[]) {
          if (r.enquiries) byMailId.set(r.mail_message_id, { enquiryId: r.enquiry_id, email: r.enquiries.email })
        }
      }
      if (ref) {
        const { data, error } = await db.from('enquiries').select('id, email').eq('ref', ref).maybeSingle()
        fail('thread ref', error)
        const r = data as { id: string; email: string } | null
        if (r) byRef.set(ref, { enquiryId: r.id, email: r.email })
      }
      const { data: f, error: e3 } = await db.from('enquiries').select('id, email').eq('source', 'form').eq('email', email).order('created_at', { ascending: false }).limit(1)
      fail('latest form enquiry', e3)
      const latest = ((f ?? []) as { id: string; email: string }[])[0]
      return { byMailId, byRef, latestFormFor: (e: string) => (latest && latest.email === e ? { enquiryId: latest.id, email: latest.email } : null) }
    },
    async truckFor(email) {
      const { data, error } = await db.from('trucks').select('id, country').ilike('contact_email', exactly(email)).limit(2)
      fail('truck by email', error)
      const rows = (data ?? []) as { id: string; country: string | null }[]
      return rows.length === 1 ? rows[0] : null
    },
    async createEnquiry(row) {
      const { data, error } = await db.from('enquiries').insert(row).select('id, ref').single()
      // 23505 on contact_message_id: the form message already has its enquiry (a second run, or a race) — not an error.
      if (error && (error as { code?: string }).code === '23505') return null
      fail('create enquiry', error)
      return data as { id: string; ref: string }
    },
    async addMessage(row) {
      const { data, error } = await db.from('enquiry_messages').insert(row).select('id').single()
      if (error && (error as { code?: string }).code === '23505') return null
      fail('add message', error)
      return data as { id: string }
    },
    async updateEnquiry(id, patch) {
      const { error } = await db.from('enquiries').update({ updated_at: new Date().toISOString(), ...patch }).eq('id', id)
      fail('update enquiry', error)
    },
    async updateMessage(id, patch) {
      const { error } = await db.from('enquiry_messages').update(patch).eq('id', id)
      fail('update message', error)
    },
    async pendingDrafts(limit) {
      const { data, error } = await db.from('enquiries').select(ENQUIRY_COLS).eq('status', 'new').order('updated_at', { ascending: true }).limit(limit)
      fail('pending enquiries', error)
      const out: { enquiry: EnquiryRow; message: MessageRow }[] = []
      for (const e of (data ?? []) as unknown as EnquiryRow[]) {
        const { data: m, error: e2 } = await db.from('enquiry_messages').select(MESSAGE_COLS).eq('enquiry_id', e.id).eq('direction', 'in')
          .order('received_at', { ascending: false }).limit(1)
        fail('latest message', e2)
        const msg = ((m ?? []) as unknown as MessageRow[])[0]
        if (msg) out.push({ enquiry: e, message: msg })
      }
      return out
    },
    async approvedKnowledge() {
      const { data, error } = await db.from('reply_knowledge').select('id, kind, topics, wording, customer_safe, countries, status, source, source_ref').eq('status', 'approved')
      fail('knowledge', error)
      return ((data ?? []) as unknown as KnowledgeRow[]).filter(r => r.status === 'approved')
    },
    async insertDraft(row) {
      const { error } = await db.from('enquiry_drafts').insert(row)
      fail('insert draft', error)
    },
    async monthSpent(month) {
      const { data, error } = await db.from('enquiry_spend').select('usd_spent').eq('month', month).maybeSingle()
      fail('spend', error)
      return Number((data as { usd_spent?: unknown } | null)?.usd_spent ?? 0) || 0
    },
    async truckCountry(truckId) {
      const { data, error } = await db.from('trucks').select('country').eq('id', truckId).maybeSingle()
      fail('truck country', error)
      return ((data as { country?: string | null } | null)?.country ?? null) || null
    },
    async aliases() {
      const { data, error } = await db.from('outreach_settings').select('value').eq('key', ALIASES_KEY).maybeSingle()
      fail('aliases', error)
      return parseAliases((data as { value?: unknown } | null)?.value)
    },
    async addSpent(month, usd) {
      // Under the poll's lock there is one writer, so read-then-write is safe here.
      const before = await this.monthSpent(month)
      const { error } = await db.from('enquiry_spend').upsert({ month, usd_spent: Math.round((before + usd) * 1e6) / 1e6, updated_at: new Date().toISOString() }, { onConflict: 'month' })
      fail('add spend', error)
    },
  }
}
