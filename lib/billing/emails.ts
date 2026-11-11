// lib/billing/emails.ts — billing-2 (11 November 2026; docs/billing-2-report.md): THE BILLING EMAILS — composed in the truck's
// language (messages `emailBilling`), sent through a Mailer (lib/billing/mailer.ts: Brevo, from hello@hatchgrab.com), each ONCE
// per (truck, kind, ref) by an insert-first claim (billing_email_log). Which email is due, and when, is lib/billing/view.ts
// emailsDue — this file only writes the words and posts them. No server-only import, so the harness runs it with a fake Mailer.
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/emailBilling'
import { localizePlans } from '@/lib/plan-names'
import { planByKey, type PlanCatalog } from '@/lib/plans'
import { formatMinor, pctLabel, formatWholeAmount, type MoneyFormat } from '@/lib/money-format'
import { formatYmd, monthName } from '@/lib/time-utils'
import { HATCHGRAB_LOGO_URL } from '@/lib/email-config'
import type { EmailDue } from '@/lib/billing/view'
import type { BillingStore } from '@/lib/billing/store-types'

export interface BillingEmail { to: string; subject: string; html: string; text: string; locale: string }
export interface Mailer { send(e: BillingEmail): Promise<{ ok: boolean; id: string | null }> }

export interface EmailContext {
  locale: string
  timeZone: string
  money: MoneyFormat
  truckName: string
  firstName: string | null
  /** The tokenless Manage › Billing address (/manage?tab=billing), the house pattern for email links. */
  billingUrl: string
  /** Plan names in the truck's language, by key. */
  planName: (key: string | undefined) => string
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

/** Write one due email in the truck's language. Pure (no network). */
export function composeBillingEmail(due: EmailDue, c: EmailContext, to: string): BillingEmail {
  const t = translatorFor(c.locale, 'emailBilling')
  const ts = { timeZone: c.timeZone, locale: c.locale, timeFormat: '24h' as const, dateOrder: 'dmy' as const, weekStart: 'monday' as const }
  const date = (ymd?: string) => (ymd ? formatYmd(ymd, ts, { day: 'numeric', month: 'long' }) : '')
  const p = due.params
  const method = p.method
  const amount = typeof p.amountMinor === 'number' ? formatMinor(p.amountMinor, c.money) : ''
  const truck = c.truckName
  const lines: string[] = []
  let subject = ''
  let button: { label: string; url: string } = { label: t('buttonUpdate', { method }), url: c.billingUrl }
  switch (due.kind) {
    case 'payment_failed':
      subject = t('failed.subject')
      lines.push(t('failed.line1', { amount, truck }), `${t('failed.line2', { method, date: date(p.lastDay) })} ${t('suspended')}`)
      break
    case 'two_days_left':
      subject = t('twoDays.subject', { method })
      lines.push(`${t('twoDays.line1', { amount, truck, method, date: date(p.lastDay) })} ${t('suspended')}`)
      break
    case 'one_day_left':
      subject = t('oneDay.subject', { method })
      lines.push(`${t('oneDay.line1', { amount, truck, method })} ${t('suspended')}`)
      break
    case 'last_day':
      subject = t('lastDay.subject', { method })
      lines.push(`${t('lastDay.line1', { amount, truck })} ${t('suspended')}`)
      break
    case 'paused':
      subject = t('paused.subject')
      lines.push(`${t('paused.line1', { truck, amount })} ${t('paused.line2', { date: date(p.suspendWarningDate) })}`)
      button = { label: t('buttonPay'), url: p.payUrl || c.billingUrl }
      break
    case 'trial_7_days': {
      subject = t('trial7.subject')
      const plan = c.planName(p.planKey)
      const price = formatWholeAmount(p.monthlyMinor ?? 0, c.money)
      lines.push(t('trial7.line1', { truck, date: date(p.trialEnd) }), t('trial7.line2'))
      lines.push((p.monthlyMinor ?? 0) > 0
        ? t('trial7.plan', { plan, price, amount: formatMinor(p.restAmountMinor ?? 0, c.money), month: p.restMonth ? monthName(p.restMonth, c.locale, 'long') : '', nextFirst: date(p.nextFirst) })
        : t('trial7.planFree', { plan }))
      if ((p.feeBps ?? 0) > 0) lines.push(t('trial7.fee', { fee: pctLabel((p.feeBps ?? 0) / 100, { locale: c.locale }) }))
      button = { label: t('buttonAddCard'), url: c.billingUrl }
      break
    }
    case 'trial_1_day': {
      subject = t('trial1.subject')
      const plan = c.planName(p.planKey)
      lines.push(t('trial1.line1', { truck }))
      if (p.hasPaymentMethod) {
        lines.push(t('trial1.allSet', { plan, date: date(p.trialEnd ? addDay(p.trialEnd) : undefined) }))
        if ((p.restAmountMinor ?? 0) > 0) lines.push(t('trial1.charge', { amount: formatMinor(p.restAmountMinor ?? 0, c.money), month: p.restMonth ? monthName(p.restMonth, c.locale, 'long') : '' }))
        button = { label: '', url: '' }
      } else {
        lines.push(t('trial1.noCard'))
        button = { label: t('buttonAddCard'), url: c.billingUrl }
      }
      break
    }
  }
  const greeting = t('greeting', { hasName: c.firstName ? 'yes' : 'no', name: c.firstName ?? '' })
  const tail = [t('questions'), t('signoff')]
  const text = [greeting, '', ...lines, '', ...(button.label ? [`${button.label}: ${button.url}`, ''] : []), ...tail].join('\n')
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1e293b;max-width:560px">
<img src="${HATCHGRAB_LOGO_URL}" alt="HatchGrab" width="140" style="margin-bottom:16px"/>
<p>${esc(greeting)}</p>
${lines.map(l => `<p>${esc(l)}</p>`).join('\n')}
${button.label ? `<p style="margin:24px 0"><a href="${esc(button.url)}" style="background:#ea580c;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px;display:inline-block">${esc(button.label)}</a></p>` : ''}
<p>${esc(tail[0])}</p>
<p>${esc(tail[1])}</p>
</div>`
  return { to, subject, html, text, locale: c.locale }
}

const addDay = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  const x = new Date(Date.UTC(y, m - 1, d + 1))
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`
}

/** Plan names in a language: the plan rows, localised by lib/plan-names.ts (planNames.<key>.name where a language has one). */
export function planNameIn(locale: string, catalog: PlanCatalog): (key: string | undefined) => string {
  const local = localizePlans(catalog, locale)
  return key => (key ? planByKey(local, key)?.name ?? key : '')
}

/**
 * 🔴 SEND WHAT IS DUE, EACH ONCE. The claim (billing_email_log insert) comes BEFORE the send: a second run, or two at once, finds
 * the row and sends nothing. A failed send keeps its claim (no repeat) and is reported — a billing email must never be sent twice.
 */
export async function sendDueEmails(store: BillingStore, mailer: Mailer, a: { truckId: string; due: EmailDue[]; to: string | null; ctx: EmailContext }):
  Promise<{ kind: string; ref: string; outcome: 'sent' | 'already' | 'failed' | 'no_address' }[]> {
  const out: { kind: string; ref: string; outcome: 'sent' | 'already' | 'failed' | 'no_address' }[] = []
  for (const d of a.due) {
    if (!a.to) { out.push({ kind: d.kind, ref: d.ref, outcome: 'no_address' }); continue }
    const { claimed } = await store.claimEmail({ truckId: a.truckId, kind: d.kind, ref: d.ref, locale: a.ctx.locale })
    if (!claimed) { out.push({ kind: d.kind, ref: d.ref, outcome: 'already' }); continue }
    const r = await mailer.send(composeBillingEmail(d, a.ctx, a.to))
    await store.recordEmailProvider(a.truckId, d.kind, d.ref, r.id)
    out.push({ kind: d.kind, ref: d.ref, outcome: r.ok ? 'sent' : 'failed' })
  }
  return out
}
