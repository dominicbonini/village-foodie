// lib/partner-mail-poll.ts — the reply poll's PARTNER half (partners-1, 5 November 2026).
//
// The poll (lib/outreach-mail-poll.ts) reads the mailbox exactly as before and asks
// `matchIncomingWithPartners` who a message belongs to. When the answer is a partner, these functions write it:
//   • an `outreach_messages` row with `partner_id` (never `prospect_id`), through the same `insertMessageOnce` gate;
//   • NO `outreach_contacts` row — the ladder is a prospect thing;
//   • a reply sets `last_reply_at` and moves the status `contacted` → `replied` (the one automatic move on this side),
//     logged in `partner_events`. An auto-reply or a bounce moves nothing.
// 🔴 A PARTNER'S INBOUND ROW IS WRITTEN WITH `handled_at` SET. Truck Today lists unhandled inbound rows; the Today route
// also filters `prospect_id is not null`, and this is the second lock on the same door.
import type { SupabaseClient } from '@supabase/supabase-js'
import { insertMessageOnce } from '@/lib/outreach-poll-claims'
import { bodyColumns, type StoredBodies } from '@/lib/outreach-mail-bodies'
import type { PartnerDirectory } from '@/lib/outreach-mail-poll-rules'
import { autoStatusOnReply, autoStatusOnSend, isPartnerStatus } from '@/lib/partners'

/** Partners by address and by our own Message-IDs. A missing table (before the migration) ⇒ empty. */
export async function loadPartnerDirectory(
  supabase: SupabaseClient, partnerMessageRows: { message_id: string; partner_id: string }[],
): Promise<PartnerDirectory> {
  const byAddress = new Map<string, string>()
  const byMessageId = new Map<string, string>()
  try {
    const { data, error } = await supabase.from('partner_orgs').select('id, email')
    if (!error) {
      for (const p of (data ?? []) as { id: string; email: string | null }[]) {
        const e = (p.email ?? '').trim().toLowerCase()
        if (e) byAddress.set(e, p.id)
      }
    }
  } catch { /* no partners table: nothing matches a partner, and the prospect rules run exactly as before */ }
  for (const r of partnerMessageRows) byMessageId.set(r.message_id, r.partner_id)
  return { byAddress, byMessageId }
}

/** Log one status change for a partner, only if it still has the status we expect (no clobbering a manual move). */
export async function applyPartnerAutoStatus(
  supabase: SupabaseClient, partnerId: string, rule: 'send' | 'reply', extra: Record<string, unknown> = {},
): Promise<{ moved: boolean }> {
  const { data } = await supabase.from('partner_orgs').select('status').eq('id', partnerId).maybeSingle()
  const cur = (data as { status?: unknown } | null)?.status
  const now = new Date().toISOString()
  const to = isPartnerStatus(cur) ? (rule === 'send' ? autoStatusOnSend(cur) : autoStatusOnReply(cur)) : null
  if (!to || !isPartnerStatus(cur)) {
    if (Object.keys(extra).length) await supabase.from('partner_orgs').update({ ...extra, updated_at: now }).eq('id', partnerId)
    return { moved: false }
  }
  // 🔴 FILTERED ON THE OLD STATUS: if Dominic changed it a moment ago, this matches nothing and logs nothing.
  const { data: upd } = await supabase.from('partner_orgs')
    .update({ ...extra, status: to, updated_at: now }).eq('id', partnerId).eq('status', cur).select('id')
  if (!upd || !(upd as unknown[]).length) {
    if (Object.keys(extra).length) await supabase.from('partner_orgs').update({ ...extra, updated_at: now }).eq('id', partnerId)
    return { moved: false }
  }
  await supabase.from('partner_events').insert({ partner_id: partnerId, kind: 'status', from_status: cur, to_status: to })
  return { moved: true }
}

export interface PartnerSeen {
  uid: number; messageId: string; subject: string | null
  from: string[]; to: string[]; date: string | null
}

const rowFor = (m: PartnerSeen, path: string, account: string, partnerId: string, status: string, direction: 'inbound' | 'outbound') => ({
  partner_id: partnerId,
  direction, status, is_test: false, source: 'poll', account,
  message_id: m.messageId, in_reply_to: null as string | null,
  subject: m.subject, from_address: m.from[0] ?? null, to_address: m.to[0] ?? null,
  message_date: m.date, mailbox: path, uid: m.uid,
})

/** An inbound partner message: a reply, or an auto-reply (recorded, moves nothing). */
export async function recordPartnerIncoming(
  supabase: SupabaseClient, dir: PartnerDirectory, m: PartnerSeen, path: string, account: string,
  partnerId: string, kind: 'reply' | 'auto_reply', bodies: StoredBodies | null,
): Promise<{ created: boolean; error: string | null }> {
  const made = await insertMessageOnce(supabase, {
    ...rowFor(m, path, account, partnerId, kind === 'reply' ? 'received' : 'auto_reply', 'inbound'),
    handled_at: new Date().toISOString(),
    ...(bodies ? bodyColumns(bodies) : {}),
  })
  if (!made.created) return { created: false, error: 'error' in made ? made.error : null }
  dir.byMessageId.set(m.messageId, partnerId)
  if (kind === 'reply') await applyPartnerAutoStatus(supabase, partnerId, 'reply', { last_reply_at: m.date ?? new Date().toISOString() })
  return { created: true, error: null }
}

/** Mail Dominic sent from Outlook to a partner: recorded on the partner's timeline; first email ⇒ contacted. */
export async function recordPartnerOutlookSent(
  supabase: SupabaseClient, dir: PartnerDirectory, m: PartnerSeen, path: string, account: string,
  partnerId: string, bodies: StoredBodies | null,
): Promise<{ created: boolean; error: string | null }> {
  const made = await insertMessageOnce(supabase, {
    ...rowFor(m, path, account, partnerId, 'sent', 'outbound'),
    sent_copy: 'server_filed',
    ...(bodies ? bodyColumns(bodies) : {}),
  })
  if (!made.created) return { created: false, error: 'error' in made ? made.error : null }
  dir.byMessageId.set(m.messageId, partnerId)
  await applyPartnerAutoStatus(supabase, partnerId, 'send', { last_contacted_at: m.date ?? new Date().toISOString() })
  return { created: true, error: null }
}

/** A delivery report about one of OUR partner emails: the original marked bounced, the report recorded. */
export async function recordPartnerBounce(
  supabase: SupabaseClient, dir: PartnerDirectory, m: PartnerSeen, path: string, account: string,
  partnerId: string, originalId: string, bodies: StoredBodies | null,
): Promise<{ created: boolean; error: string | null }> {
  await supabase.from('outreach_messages')
    .update({ status: 'bounced', updated_at: new Date().toISOString() })
    .eq('message_id', originalId).eq('direction', 'outbound').eq('partner_id', partnerId)
  const made = await insertMessageOnce(supabase, {
    ...rowFor(m, path, account, partnerId, 'bounce', 'inbound'),
    in_reply_to: originalId,
    handled_at: new Date().toISOString(),
    ...(bodies ? bodyColumns(bodies) : {}),
  })
  if (!made.created) return { created: false, error: 'error' in made ? made.error : null }
  dir.byMessageId.set(m.messageId, partnerId)
  return { created: true, error: null }
}
