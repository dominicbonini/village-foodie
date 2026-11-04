// lib/paperwork/reminders.ts — the daily Paperwork run (paperwork-1, 4 November 2026). SERVER ONLY. Called by the existing
// daily cron, /api/cron/order-retention (04:30 UTC), after its retention work.
//
// 1 · REMINDERS: for every CURRENT document with an expiry, the stage due today in the truck's own calendar (lib/paperwork/model
//     reminderDue: 28 days, 7 days, on the day, then weekly while expired). One email per truck per day listing its documents,
//     to the truck's contact email, in the truck's language, linking to Manage › Paperwork (TOKENLESS: /manage?tab=paperwork).
//     🔴 NEVER THE SAME STAGE TWICE: the stage is recorded (with the expiry date it was for) only after the email went; a failed
//     send records nothing and is tried again tomorrow.
//     🔴 EMAIL ONLY. The operator push (lib/apns.ts, lib/fcm.ts) can send ONE thing — "an order needs confirming", with its
//     fixed words, payload and channel; it has no general message to carry a reminder, so none is sent (the report says so).
//     Skipped: a demo truck, an inactive one, one with no contact email, and one whose plan or override switches `paperwork` off.
// 2 · ABANDONED UPLOADS: pending rows older than a day (an upload never saved) — files and rows (store.sweepPending).
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPlanCatalog } from '@/lib/plans-server'
import { truckCan, type PlanCatalog } from '@/lib/plans'
import { isDemoIdentifier } from '@/lib/demo'
import { localeForTruck } from '@/lib/i18n/server-locale'
import { translatorFor } from '@/lib/i18n/translator'
import { truckTimeSettings } from '@/lib/truck-time'
import { localDateOfInstant } from '@/lib/time-utils'
import { reminderDue, typesForCountry, type ReminderStage } from './model'
import { docOf, readTypeRows, sweepPending, type DocRow } from './store'
import { sendReminderEmail } from './email'
import '@/lib/i18n/catalog/paperwork'

export interface PaperworkDailyResult { trucks: number; emails: number; documents: number; skipped: number; pendingSwept: number; failures: string[] }

export async function runPaperworkDaily(
  db: SupabaseClient,
  deps: { now?: Date; send?: typeof sendReminderEmail; catalog?: PlanCatalog; base?: string } = {},
): Promise<PaperworkDailyResult> {
  const now = deps.now ?? new Date()
  const send = deps.send ?? sendReminderEmail
  const base = (deps.base ?? process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? 'https://www.hatchgrab.com').replace(/\/$/, '')
  const out: PaperworkDailyResult = { trucks: 0, emails: 0, documents: 0, skipped: 0, pendingSwept: 0, failures: [] }

  // Every current document that could be due: an expiry within 28 days of the latest calendar (UTC+14), or past.
  const horizon = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await db.from('truck_documents')
    .select('id, truck_id, type_key, custom_name, issuer, issued_on, expires_on, name_on_document, cover_amount_minor, currency, storage_path, mime, size_bytes, original_filename, status, superseded_by, created_at, updated_at, reminder_stage, reminder_expires_on')
    .eq('status', 'current').not('expires_on', 'is', null).lte('expires_on', horizon).limit(5000)
  if (error) { out.failures.push(`read documents: ${error.message}`); return out }
  const byTruck = new Map<string, DocRow[]>()
  for (const r of (data ?? []) as Record<string, unknown>[]) { const d = docOf(r); byTruck.set(d.truckId, [...(byTruck.get(d.truckId) ?? []), d]) }

  if (byTruck.size) {
    const catalog = deps.catalog ?? await getPlanCatalog()
    const typeRows = await readTypeRows(db)
    const { data: trucks, error: e2 } = await db.from('trucks').select('*').in('id', [...byTruck.keys()])
    if (e2) { out.failures.push(`read trucks: ${e2.message}`); return out }
    for (const truck of (trucks ?? []) as Record<string, unknown>[]) {
      const id = String(truck.id)
      try {
        const contact = typeof truck.contact_email === 'string' ? truck.contact_email.trim() : ''
        if (isDemoIdentifier(id) || truck.active === false || !contact || !truckCan(truck as never, catalog, 'paperwork', now)) { out.skipped++; continue }
        const time = await truckTimeSettings(truck as { timezone?: string | null; country?: string | null })
        const today = localDateOfInstant(now, time.timeZone)
        const due = (byTruck.get(id) ?? []).map(d => ({ d, stage: reminderDue(d, today) })).filter((x): x is { d: DocRow; stage: ReminderStage } => !!x.stage)
        if (!due.length) continue
        out.trucks++
        const locale = await localeForTruck(truck as { country?: string | null })
        const t = translatorFor(locale, 'paperwork')
        const types = typesForCountry(typeRows, truck.country as string | null)
        const sent = await send({
          to: contact, truckName: String(truck.name ?? ''), locale, time, today, url: `${base}/manage?tab=paperwork`,
          docs: due.map(({ d, stage }) => ({ stage, expiresOn: d.expiresOn, name: d.typeKey ? t(`types.${d.typeKey}` as never) : (d.customName ?? ''),
            dateLabel: types.find(x => x.key === d.typeKey)?.dateLabel ?? 'expires' })),
        })
        if (!sent.sent) { out.failures.push(`${id}: ${sent.reason ?? 'not sent'}`); continue }
        out.emails++
        for (const { d, stage } of due) {
          const { error: e3 } = await db.from('truck_documents').update({ reminder_stage: stage, reminder_expires_on: d.expiresOn, reminder_sent_at: now.toISOString() })
            .eq('id', d.id).eq('truck_id', id).eq('status', 'current')
          if (e3) out.failures.push(`${id}: record stage: ${e3.message}`)
          else out.documents++
        }
      } catch (e) { out.failures.push(`${id}: ${e instanceof Error ? e.message : String(e)}`) }
    }
  }
  try { out.pendingSwept = await sweepPending(db, now) } catch (e) { out.failures.push(`sweep uploads: ${e instanceof Error ? e.message : String(e)}`) }
  return out
}
