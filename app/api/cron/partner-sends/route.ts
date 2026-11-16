// app/api/cron/partner-sends/route.ts — partners-2 (16 November 2026, docs/partners-2-report.md): THE SCHEDULED PARTNER SENDER.
// Every 5 minutes (vercel.json). Takes AT MOST ONE email per run — the earliest queued send whose time has come — and sends it
// through the one partner send path (lib/partner-send.ts), so every refusal of Admin's compose applies, plus the opt-out line.
//
// 🔴 WHAT MUST BE TRUE FOR ANYTHING TO GO:
//   • approval mode ON (the default): the row was approved ("Approve today's sends"). OFF: planned rows go too.
//   • the partner is still eligible (✓ verified, an allowed country, not a software platform, not stopped / opted out);
//   • the shared daily cap (truck prospects + partners, Europe/London day) is not reached, and the last send was ≥ 3 minutes ago;
//   • a template exists for the step and language (`partner-<assoc|dir>-<step>-<lang>`) — none exists until Dominic signs the
//     wording off, so until then this route sends NOTHING and says why;
//   • the partner has an active code (its deal and commission are in the email).
// `?dry_run=1&now=<ISO>` (admin only): everything above is decided against that clock and reported; the mail server is never
// contacted and nothing is written. That is how partners-2 tested it — nothing was sent.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { resolveAccounts, accountForSend } from '@/lib/outreach-mail-accounts'
import { readOutreachSettings } from '@/lib/outreach-settings-read'
import { docFromTemplateText } from '@/lib/outreach-doc'
import { readSchedule, sentToday, readCountryRules, ineligible, templateSlugFor, nextStep, type ProgrammePartner } from '@/lib/partner-programme'
import { windowOn, SPACING_MIN, SENDER_ZONE } from '@/lib/partner-send-schedule'
import { renderPartnerText, withPostalAddress, commissionText } from '@/lib/partner-template'
import { dealTextEn } from '@/lib/partner-codes'
import { sendPartnerEmail } from '@/lib/partner-send'
import { localDateOfInstant } from '@/lib/time-utils'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function authorised(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization') || ''
  if (secret && authz === `Bearer ${secret}`) return true
  return verifyAdmin(req)
}

export async function GET(req: NextRequest) {
  if (!await authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const dryRun = req.nextUrl.searchParams.get('dry_run') === '1'
  const nowParam = req.nextUrl.searchParams.get('now')
  if (nowParam && !dryRun) return NextResponse.json({ error: 'now= only with dry_run=1' }, { status: 400 })
  const now = nowParam ? new Date(nowParam) : new Date()
  if (Number.isNaN(now.getTime())) return NextResponse.json({ error: 'Bad now' }, { status: 400 })
  return NextResponse.json(await runOnce(now, dryRun))
}

type Outcome = { action: 'none' | 'would_send' | 'sent' | 'skipped'; reason?: string; partner?: string; step?: string; to?: string; subject?: string }

async function runOnce(now: Date, dryRun: boolean): Promise<Outcome & { dryRun: boolean; at: string }> {
  const done = (o: Outcome) => ({ ...o, dryRun, at: now.toISOString() })
  const settings = await readSchedule(supabase)
  const sent = await sentToday(supabase, now)
  if (sent.count >= settings.dailyCap) return done({ action: 'none', reason: `daily cap reached (${sent.count}/${settings.dailyCap})` })
  if (sent.lastAt !== null && now.getTime() - sent.lastAt < SPACING_MIN.min * 60_000) return done({ action: 'none', reason: 'last send under 3 minutes ago' })
  const day = localDateOfInstant(now, SENDER_ZONE)
  const statuses = settings.approvalMode ? ['approved'] : ['approved', 'planned']
  const { data: rows, error } = await supabase.from('outreach_send_queue').select('id, partner_id, step, scheduled_at, status')
    .eq('send_day', day).in('status', statuses).lte('scheduled_at', now.toISOString()).order('scheduled_at').limit(1)
  if (error) return done({ action: 'none', reason: `queue unreadable: ${error.message}` })
  const row = (rows ?? [])[0] as { id: string; partner_id: string; step: string; scheduled_at: string } | undefined
  if (!row) return done({ action: 'none', reason: settings.approvalMode ? 'nothing approved is due' : 'nothing is due' })

  const skip = async (reason: string, extra: Partial<Outcome> = {}) => {
    if (!dryRun) await supabase.from('outreach_send_queue').update({ status: 'skipped', skip_reason: reason }).eq('id', row.id)
    return done({ action: 'skipped', reason, ...extra })
  }
  const { data: p } = await supabase.from('partner_orgs')
    .select('id, name, type, country_code, language, timezone, email, status, verify_status, auto_send, do_not_contact, sequence_step, sequence_stopped, contact_name')
    .eq('id', row.partner_id).maybeSingle()
  const partner = p as ProgrammePartner | null
  if (!partner) return skip('partner gone')
  const rules = await readCountryRules(supabase)
  const why = ineligible(partner, partner.country_code ? rules[partner.country_code] ?? null : null)
  if (why) return skip(`not eligible: ${why}`, { partner: partner.name })
  if (nextStep(partner) !== row.step) return skip(`step moved on (${partner.sequence_step ?? 'none'} → ${nextStep(partner)})`, { partner: partner.name })
  const win = windowOn(localDateOfInstant(now, partner.timezone || SENDER_ZONE), partner.timezone || SENDER_ZONE, settings.window)
  if (now.getTime() > win.end) return skip('missed its window — planned again on the next one', { partner: partner.name })

  const slug = templateSlugFor(partner, nextStep(partner)!)
  const { data: tpl } = await supabase.from('outreach_templates').select('id, slug, subject, body, active').eq('slug', slug).maybeSingle()
  if (!tpl || !(tpl as { active: boolean }).active) return done({ action: 'none', reason: `no approved template "${slug}" yet`, partner: partner.name, step: row.step })
  const { data: codes } = await supabase.from('partner_codes').select('code, deal_type, deal_value, deal_months, pct_year1, pct_year2, active')
    .eq('partner_id', partner.id).eq('active', true).order('created_at').limit(1)
  const code = (codes ?? [])[0] as { code: string; deal_type: 'extra_trial_months' | 'percent_off'; deal_value: number; deal_months: number | null; pct_year1: number; pct_year2: number } | undefined
  if (!code) return skip('the partner has no active code', { partner: partner.name })

  const { data: postal } = await supabase.from('outreach_settings').select('value').eq('key', 'postal_address').maybeSingle()
  const values = {
    contact_name: partner.contact_name || undefined, org: partner.name, code: code.code,
    deal: dealTextEn({ dealType: code.deal_type, dealValue: code.deal_value, dealMonths: code.deal_months }),
    commission: commissionText(Number(code.pct_year1), Number(code.pct_year2)),
  }
  const t = tpl as { subject: string | null; body: string }
  const subject = renderPartnerText(t.subject ?? '', values)
  const body = renderPartnerText(withPostalAddress(t.body, (postal?.value as { text?: string } | null)?.text ?? null, partner.country_code), values)
  if (!subject.ok || !body.ok) return skip(`template field without a value: ${[...(subject.ok ? [] : subject.missing), ...(body.ok ? [] : body.missing)].join(', ')}`, { partner: partner.name })
  const os = await readOutreachSettings(supabase)
  const doc = docFromTemplateText(body.text, { signatureLines: os.values.signature?.lines ?? [], optOut: os.values.optOut?.text ?? null })

  if (dryRun) return done({ action: 'would_send', partner: partner.name, step: row.step, to: partner.email!, subject: subject.text })
  const sender = accountForSend(resolveAccounts())
  if (!sender) return done({ action: 'none', reason: 'no mailbox credentials on this environment' })
  const result = await sendPartnerEmail(supabase, {
    partner: { id: partner.id, name: partner.name, email: partner.email, status: partner.status },
    toAddress: partner.email!, subject: subject.text, document: doc, parent: null, isTest: false, attachments: [],
    idempotencyKey: `partner-queue:${row.id}`, sender, requireOptOut: os.values.optOut?.text ?? null,
  })
  if (result.kind === 'refused') return skip(result.refusal, { partner: partner.name })
  if (!result.sent) return done({ action: 'none', reason: 'the mail server did not accept it — the row shows why', partner: partner.name })
  await supabase.from('outreach_send_queue').update({ status: 'sent', sent_at: now.toISOString() }).eq('id', row.id)
  await supabase.from('partner_orgs').update({ sequence_step: row.step, ...(row.step === '4_final_chase' ? { sequence_stopped: 'done' } : {}), updated_at: now.toISOString() }).eq('id', partner.id)
  return done({ action: 'sent', partner: partner.name, step: row.step, to: partner.email!, subject: subject.text })
}
