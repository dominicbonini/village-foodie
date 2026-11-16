// lib/partner-programme.ts — partners-2 (16 November 2026, docs/partners-2-report.md): who may be emailed automatically, which
// step is next, and today's send queue. The rules are pure (the harness tests them); the reads and writes take a client.
//
// REUSED, not copied: the truck ladder (lib/outreach.ts CONTACT_KINDS / FOLLOW_UP_DAYS — first contact → +3 → +7 → +14), the
// opt-out sentence and signature (outreach_settings), the sending path (lib/partner-send.ts, shared with Admin's partner
// compose), and the reply poller (lib/partner-mail-poll.ts stops a sequence on a reply or a bounce).
// NEW: eligibility, the schedule (lib/partner-send-schedule.ts), outreach_send_queue, approval mode, and the country rules.
import type { SupabaseClient } from '@supabase/supabase-js'
import { CONTACT_KINDS, FOLLOW_UP_DAYS, type LadderKind } from '@/lib/outreach'
import { planToday, dueDate, DEFAULT_WINDOW, DEFAULT_DAILY_CAP, SENDER_ZONE, type SendWindow, type PlannedSend } from '@/lib/partner-send-schedule'
import { instantOfLocal, localDateOfInstant } from '@/lib/time-utils'

// ── the rules (pure) ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface ProgrammePartner {
  id: string; name: string; type: string; country_code: string | null; language: string | null; timezone: string | null
  email: string | null; status: string; verify_status: string | null; auto_send: boolean; do_not_contact: boolean
  sequence_step: string | null; sequence_stopped: string | null; contact_name: string | null
}
export type CountryRule = 'allowed' | 'manual_only'
export type Ineligible = 'no_email' | 'not_verified' | 'software_platform' | 'manual_only' | 'auto_off' | 'do_not_contact' | 'stopped' | 'status' | 'done'

/** Statuses a sequence keeps running in: before a reply, a talk or a decision. */
const RUNNING = new Set(['to_contact', 'contacted'])

/** Why this partner is NOT emailed automatically, or null when it may be. Only a ✓ verified row ever is. */
export function ineligible(p: ProgrammePartner, rule: CountryRule | null): Ineligible | null {
  if (!p.email || !p.email.trim()) return 'no_email'
  if (p.do_not_contact) return 'do_not_contact'
  if (p.sequence_stopped) return 'stopped'
  if (p.type === 'software_platform') return 'software_platform'
  if ((rule ?? 'manual_only') === 'manual_only') return 'manual_only'
  if (p.verify_status !== 'verified') return 'not_verified'
  if (!p.auto_send) return 'auto_off'
  if (!RUNNING.has(p.status)) return 'status'
  if (nextStep(p) === null) return 'done'
  return null
}

/** The next rung of the truck ladder after the partner's last automatic step (null when the ladder is finished). */
export function nextStep(p: Pick<ProgrammePartner, 'sequence_step'>): LadderKind | null {
  if (!p.sequence_step) return CONTACT_KINDS[0]
  const i = (CONTACT_KINDS as readonly string[]).indexOf(p.sequence_step)
  return i >= 0 && i < CONTACT_KINDS.length - 1 ? CONTACT_KINDS[i + 1] : null
}

/** The gap (days) after the step before `step` — the truck ladder's own FOLLOW_UP_DAYS. */
export function gapBefore(step: LadderKind): number {
  const i = CONTACT_KINDS.indexOf(step)
  return i <= 0 ? 0 : (FOLLOW_UP_DAYS[CONTACT_KINDS[i - 1]] ?? 0)
}

/** Which template a partner's step uses: `partner-<assoc|dir>-<step>-<language>` (no row yet → nothing is sent). */
export function templateSlugFor(p: Pick<ProgrammePartner, 'type' | 'language'>, step: LadderKind): string {
  const audience = ['directory', 'media', 'press', 'software_platform'].includes(p.type) ? 'dir' : 'assoc'
  return `partner-${audience}-${step}-${(p.language || 'en').toLowerCase()}`
}

/** What the table's "Next send" column says. */
export function nextSendLabel(p: ProgrammePartner, rule: CountryRule | null, queued: { scheduled_at: string; status: string } | null): string {
  const why = ineligible(p, rule)
  if (why === 'manual_only') return 'You send'
  if (why === 'software_platform' || why === 'not_verified' || why === 'auto_off') return 'Manual only'
  if (why) return '—'
  if (!queued) return 'Next window'
  const tz = p.timezone || SENDER_ZONE
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(queued.scheduled_at)) + ' local'
}

// ── settings ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ScheduleSettings { approvalMode: boolean; dailyCap: number; window: SendWindow }

export async function readSchedule(supabase: SupabaseClient): Promise<ScheduleSettings> {
  const { data } = await supabase.from('outreach_settings').select('value').eq('key', 'send_schedule').maybeSingle()
  const v = (data?.value ?? {}) as { approval_mode?: unknown; daily_cap?: unknown; window?: Partial<SendWindow> }
  return {
    approvalMode: v.approval_mode !== false,                       // anything but an explicit false is ON
    dailyCap: typeof v.daily_cap === 'number' && v.daily_cap >= 0 ? v.daily_cap : DEFAULT_DAILY_CAP,
    window: { ...DEFAULT_WINDOW, ...(v.window ?? {}) },
  }
}

/** Every email the WHOLE outreach system sent today (Europe/London): truck prospects and partners, never tests or imports. */
export async function sentToday(supabase: SupabaseClient, now: Date): Promise<{ count: number; lastAt: number | null }> {
  const today = localDateOfInstant(now, SENDER_ZONE)
  const from = new Date(instantOfLocal(today, '00:00:00', SENDER_ZONE)).toISOString()
  const { data, error } = await supabase.from('outreach_messages').select('message_date')
    .eq('direction', 'outbound').eq('is_test', false).eq('source', 'system').in('status', ['sent', 'sending'])
    .gte('message_date', from).order('message_date', { ascending: false })
  if (error) throw new Error(`[partner-programme] today's sends could not be counted: ${error.message}`)
  const rows = (data ?? []) as { message_date: string }[]
  return { count: rows.length, lastAt: rows[0] ? Date.parse(rows[0].message_date) : null }
}

const PARTNER_FIELDS = 'id, name, type, country_code, language, timezone, email, status, verify_status, auto_send, do_not_contact, sequence_step, sequence_stopped, contact_name'

/** The country rules as a map (a country with no row is manual_only). */
export async function readCountryRules(supabase: SupabaseClient): Promise<Record<string, CountryRule>> {
  const { data, error } = await supabase.from('outreach_country_rules').select('country_code, cold_email')
  if (error) throw new Error(`[partner-programme] country rules unreadable: ${error.message}`)
  return Object.fromEntries((data ?? []).map(r => [r.country_code as string, r.cold_email as CountryRule]))
}

export interface QueuePlan {
  sendDay: string; cap: number; sentToday: number; approvalMode: boolean
  planned: (PlannedSend & { partnerId: string; name: string; step: LadderKind; language: string; email: string })[]
  later: { partnerId: string; name: string; reason: string; nextDay: string }[]
}

/**
 * Today's plan: every eligible partner whose next step is due, in its own working window, under the shared cap, spaced 3–8
 * minutes apart. `write` stores it in outreach_send_queue (status planned; an approved, sent or cancelled row is never touched).
 */
export async function planQueue(supabase: SupabaseClient, now: Date, opts: { write?: boolean; rand?: () => number } = {}): Promise<QueuePlan> {
  const [settings, rules, sent, { data: partners, error }] = await Promise.all([
    readSchedule(supabase), readCountryRules(supabase), sentToday(supabase, now),
    supabase.from('partner_orgs').select(PARTNER_FIELDS),
  ])
  if (error) throw new Error(`[partner-programme] partners unreadable: ${error.message}`)
  const list = (partners ?? []) as ProgrammePartner[]
  const eligible = list.filter(p => ineligible(p, p.country_code ? rules[p.country_code] ?? null : null) === null)
  // The last real email to each eligible partner (any source — a hand-sent one counts for the gap too).
  const lastSent = new Map<string, string>()
  if (eligible.length) {
    const { data: msgs, error: mErr } = await supabase.from('outreach_messages').select('partner_id, message_date')
      .in('partner_id', eligible.map(p => p.id)).eq('direction', 'outbound').eq('is_test', false).in('status', ['sent', 'sending'])
      .order('message_date', { ascending: false })
    if (mErr) throw new Error(`[partner-programme] partner sends unreadable: ${mErr.message}`)
    for (const m of (msgs ?? []) as { partner_id: string; message_date: string }[]) if (!lastSent.has(m.partner_id)) lastSent.set(m.partner_id, m.message_date)
  }
  const byId = new Map(eligible.map(p => [p.id, p]))
  const due = eligible.map(p => {
    const step = nextStep(p)!
    const tz = p.timezone || SENDER_ZONE
    return { id: p.id, tz, dueYmd: dueDate(step === CONTACT_KINDS[0] ? null : lastSent.get(p.id) ?? null, gapBefore(step), tz, now) }
  })
  const plan = planToday(due, { now, sentToday: sent.count, cap: settings.dailyCap, window: settings.window, rand: opts.rand, lastSentAt: sent.lastAt })
  const sendDay = localDateOfInstant(now, SENDER_ZONE)
  const out: QueuePlan = {
    sendDay, cap: settings.dailyCap, sentToday: sent.count, approvalMode: settings.approvalMode,
    planned: plan.planned.map(s => { const p = byId.get(s.id)!; return { ...s, partnerId: p.id, name: p.name, step: nextStep(p)!, language: p.language || 'en', email: p.email! } }),
    later: plan.later.map(l => ({ partnerId: l.id, name: byId.get(l.id)!.name, reason: l.reason, nextDay: l.nextDay })),
  }
  if (opts.write && out.planned.length) {
    const { data: existing } = await supabase.from('outreach_send_queue').select('partner_id, step, status')
      .in('partner_id', out.planned.map(p => p.partnerId))
    const locked = new Set(((existing ?? []) as { partner_id: string; step: string; status: string }[])
      .filter(r => r.status !== 'planned' && r.status !== 'skipped').map(r => `${r.partner_id}|${r.step}`))   // a skipped row (missed window) is planned again
    const rows = out.planned.filter(p => !locked.has(`${p.partnerId}|${p.step}`))
      .map(p => ({ partner_id: p.partnerId, step: p.step, send_day: sendDay, scheduled_at: p.at, status: 'planned' }))
    if (rows.length) {
      const { error: wErr } = await supabase.from('outreach_send_queue').upsert(rows, { onConflict: 'partner_id,step' })
      if (wErr) throw new Error(`[partner-programme] the queue could not be written: ${wErr.message}`)
    }
  }
  return out
}

/** "Approve today's sends": today's planned rows become approved (the sender only takes approved rows while approval is on). */
export async function approveToday(supabase: SupabaseClient, now: Date): Promise<number> {
  const day = localDateOfInstant(now, SENDER_ZONE)
  const { data, error } = await supabase.from('outreach_send_queue').update({ status: 'approved', approved_at: now.toISOString() })
    .eq('send_day', day).eq('status', 'planned').select('id')
  if (error) throw new Error(`[partner-programme] approval failed: ${error.message}`)
  return (data ?? []).length
}

/** Stop a partner's sequence (a reply, a bounce, an opt-out): mark it, and cancel anything still queued. */
export async function stopSequence(supabase: SupabaseClient, partnerId: string, why: 'reply' | 'bounce' | 'opt_out' | 'manual'): Promise<void> {
  await supabase.from('partner_orgs').update({ sequence_stopped: why, ...(why === 'opt_out' ? { do_not_contact: true } : {}), updated_at: new Date().toISOString() })
    .eq('id', partnerId).is('sequence_stopped', null)
  await supabase.from('outreach_send_queue').update({ status: 'cancelled', skip_reason: why })
    .eq('partner_id', partnerId).in('status', ['planned', 'approved'])
}
