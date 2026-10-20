// lib/outreach-retry-rebuild.ts — 🔴 A RETRY RESENDS TODAY'S MESSAGE, NOT YESTERDAY'S BYTES (19 October 2026,
// Dominic's answer 3 to the legal follow-ups' questions; docs/legal-follow-ups-report.md).
//
// Both retries — the manual Retry in the prospect's Emails list (app/api/admin/outreach/mail-send, `action: 'retry'`)
// and the reply poll's automatic retry of a temporary failure (lib/outreach-mail-poll.ts) — used to resend the stored
// row unchanged. A row that failed before the company line existed would have gone without it, and possibly without
// the opt-out line. Now, before either resends, this:
//   1. REBUILDS the stored message with the CURRENT company line, in the prospect's language
//      (lib/outreach-mail-message.ts#rebuildStored — the new part and the quote byte for byte);
//   2. applies the SAME opt-out rule as a send (lib/outreach-doc.ts): exempt for a test and for a reply to a message
//      the prospect sent (`optOutExempt`), otherwise the new part must carry the stored opt-out sentence
//      (`optOutBlockForText`);
//   3. on a refusal, says so with the send's own words (`outreach.optOut.*`) and resends NOTHING;
//   4. otherwise writes the rebuilt bodies to the row (only if they changed), so the history shows what is sent, and
//      hands the row back for `deliver`.
// ⚠️ It never changes WHO the email goes to, its Message-ID, its threading or its attachments: only the bodies.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { rebuildStored } from '@/lib/outreach-mail-message'
import { optOutBlockForText, optOutExempt } from '@/lib/outreach-doc'
import { readOutreachSettings } from '@/lib/outreach-settings-read'
import { localeForTruck } from '@/lib/i18n/server-locale'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/outreach'

export interface RetryRow {
  id: string
  prospect_id?: string | null
  is_test?: boolean | null
  in_reply_to: string | null
  html_body: string | null
  text_body: string | null
}

export type RetryPrep<R> =
  | { ok: true; row: R }
  | { ok: false; refusal: string; code: 'not_rebuilt' | 'no_opt_out_line' | 'no_opt_out_set_up' | 'opt_out_unreadable' }

export async function prepareRetry<R extends RetryRow>(supabase: SupabaseClient, row: R): Promise<RetryPrep<R>> {
  const t = translatorFor(null, 'outreach')   // admin words: en-GB, as the send route's
  // The prospect's truck's country decides the company line's language — exactly as the send did.
  let country: string | null = null
  if (row.prospect_id) {
    const { data } = await supabase.from('outreach_prospects').select('discovery_trucks(country)').eq('id', row.prospect_id).maybeSingle()
    country = (data as { discovery_trucks: { country: string | null } | null } | null)?.discovery_trucks?.country ?? null
  }
  const rebuilt = rebuildStored(row, await localeForTruck({ country }))
  if (!rebuilt) return { ok: false, refusal: t('retry.notRebuilt'), code: 'not_rebuilt' }

  // The parent, for the reply exemption: the message this one answers, if it is the same prospect's.
  let parent: { direction: string | null; is_test: boolean | null } | null = null
  if (row.in_reply_to && row.prospect_id) {
    const { data } = await supabase.from('outreach_messages').select('direction, is_test')
      .eq('message_id', row.in_reply_to).eq('prospect_id', row.prospect_id).limit(1).maybeSingle()
    parent = (data ?? null) as typeof parent
  }
  if (!optOutExempt({ isTest: row.is_test === true, parent })) {
    const settings = await readOutreachSettings(supabase)
    if (settings.error) return { ok: false, refusal: t('optOut.unreadable'), code: 'opt_out_unreadable' }
    const code = optOutBlockForText(rebuilt.newText, settings.values.optOut?.text ?? null)
    if (code) return { ok: false, refusal: t(code === 'no_opt_out_set_up' ? 'optOut.notSetUp' : 'optOut.missing'), code }
  }

  if (rebuilt.html === row.html_body && rebuilt.text === row.text_body) return { ok: true, row }
  await supabase.from('outreach_messages')
    .update({ html_body: rebuilt.html, text_body: rebuilt.text, updated_at: new Date().toISOString() }).eq('id', row.id)
  return { ok: true, row: { ...row, html_body: rebuilt.html, text_body: rebuilt.text } }
}
