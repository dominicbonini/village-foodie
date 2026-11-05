// lib/reviews/email.ts — reviews-weather-1 (5 November 2026): the review request email, and its send through Brevo.
// The words are `emailReview` (messages/<locale>.json), in the ORDER's language (its country's locale, as every customer email —
// lib/money-server.ts moneyFormatForOrder). ⚠️ NOT SENT TODAY: lib/reviews/run.ts only sends when platform_switches says so.
//
// 🔴 ONE EMAIL FOR EVERY CUSTOMER (Google's rule): the same words and the same single Google link. No rating step, no
// "if you enjoyed it", no second path for unhappy customers.
// Every email says who it is from and carries an unsubscribe link (in the body, and as List-Unsubscribe / one-click headers).
import { HATCHGRAB_SENDER, HATCHGRAB_LOGO_URL } from '@/lib/email-config'
import { translatorFor } from '@/lib/i18n/translator'
import { privacyFooterHtml, privacyFooterText } from '@/lib/email-privacy'
import '@/lib/i18n/catalog/emailReview'
import '@/lib/i18n/catalog/emailCustomer'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The From name: the truck's name, then "via HatchGrab" (as the Documents emails). Quote marks and angle brackets are taken out. */
export const reviewFromName = (truck: string) => `${truck.replace(/["<>\r\n]/g, '').trim().slice(0, 60)} via ${HATCHGRAB_SENDER.name}`

export function reviewEmail(p: { locale: string; truckName: string; reviewUrl: string; unsubscribeUrl: string }): { subject: string; html: string; text: string } {
  const t = translatorFor(p.locale, 'emailReview')
  const tc = translatorFor(p.locale, 'emailCustomer')
  const truck = p.truckName
  const v = { truck }
  const html = `<div style="font-family:Arial,sans-serif;color:#334155;max-width:600px">
  <img src="${HATCHGRAB_LOGO_URL}" alt="HatchGrab" width="160" style="margin-bottom:24px;display:block"/>
  <h2 style="color:#0f172a">${esc(t('heading', v))}</h2>
  <p>${esc(t('body', v))}</p>
  <p style="margin:24px 0"><a href="${esc(p.reviewUrl)}" style="background:#ea580c;color:#fff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block">${esc(t('button'))}</a></p>
  <p style="color:#64748b;font-size:13px">${esc(t('from', v))}</p>
  <p style="color:#64748b;font-size:13px">${esc(t('unsubscribeLead', v))} <a href="${esc(p.unsubscribeUrl)}" style="color:inherit;text-decoration:underline">${esc(t('unsubscribeLink'))}</a></p>
  <p style="color:#94a3b8;font-size:12px;margin-top:32px">HatchGrab · hatchgrab.com${privacyFooterHtml(tc as never)}</p></div>`
  const text = [t('heading', v), t('body', v), t('linkText', { url: p.reviewUrl }), t('from', v),
    `${t('unsubscribeLead', v)} ${t('unsubscribeText', { url: p.unsubscribeUrl })}`, privacyFooterText(tc as never)].join('\n\n')
  return { subject: t('subject', v), html, text }
}

export type ReviewSend = { to: string; truckName: string; replyTo: string | null; subject: string; html: string; text: string; unsubscribeUrl: string }

/** Brevo, with List-Unsubscribe and one-click unsubscribe (RFC 8058). Never throws. */
export async function sendReviewEmail(m: ReviewSend, fetchImpl: typeof fetch = fetch): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) return { sent: false, reason: 'BREVO_API_KEY unset' }
  try {
    const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: reviewFromName(m.truckName), email: HATCHGRAB_SENDER.email },
        to: [{ email: m.to }],
        ...(m.replyTo ? { replyTo: { email: m.replyTo, name: m.truckName } } : {}),
        subject: m.subject,
        htmlContent: m.html,
        textContent: m.text,
        headers: { 'List-Unsubscribe': `<${m.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      }),
    })
    return res.ok ? { sent: true } : { sent: false, reason: `Brevo ${res.status}` }
  } catch (e) { return { sent: false, reason: e instanceof Error ? e.message : 'send failed' } }
}
