// lib/paperwork/email.ts — Paperwork's two emails (paperwork-1, 4 November 2026). SERVER ONLY. Brevo, the transactional path
// every HatchGrab email takes (lib/demo-link-email.ts), in the TRUCK's language (`paperwork` words).
//   • to an ORGANISER: from the verified HatchGrab sender with the truck's name in the From name ("<Truck> via HatchGrab"),
//     Reply-To the truck's contact email, the truck's message, the documents and the link;
//   • a REMINDER to the truck's contact email: the documents that need renewing, and a link to Manage › Paperwork.
// Never throws: a failed send is `{ sent: false, reason }` for the caller to log (and, for a reminder, to try again tomorrow).
import { HATCHGRAB_SENDER, HATCHGRAB_LOGO_URL } from '@/lib/email-config'
import { translatorFor } from '@/lib/i18n/translator'
import { formatLongDate, type TimeSettings } from '@/lib/time-utils'
import { daysBetween, type ReminderStage } from './model'
import '@/lib/i18n/catalog/paperwork'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
type Sent = { sent: boolean; reason?: string }
/** The From name: the truck's name, then "via HatchGrab". Quote marks and angle brackets are taken out of a name. */
export const fromName = (truck: string) => `${truck.replace(/["<>\r\n]/g, '').trim().slice(0, 60)} via ${HATCHGRAB_SENDER.name}`

async function brevo(payload: Record<string, unknown>, fetchImpl: typeof fetch): Promise<Sent> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) return { sent: false, reason: 'BREVO_API_KEY unset' }
  try {
    const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' }, body: JSON.stringify(payload),
    })
    return res.ok ? { sent: true } : { sent: false, reason: `Brevo ${res.status}` }
  } catch (e) { return { sent: false, reason: e instanceof Error ? e.message : 'send failed' } }
}

const shell = (inner: string) => `<div style="font-family:Arial,sans-serif;color:#334155;max-width:600px">
  <img src="${HATCHGRAB_LOGO_URL}" alt="HatchGrab" width="160" style="margin-bottom:24px;display:block"/>${inner}
  <p style="color:#94a3b8;font-size:12px;margin-top:32px">HatchGrab · hatchgrab.com</p></div>`
const button = (url: string, label: string) => `<p style="margin:24px 0"><a href="${esc(url)}" style="background:#ea580c;color:#fff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block">${esc(label)}</a></p>`

/** One document as an email line: its name and its date ("expires 12 March 2027", "review by …", "no expiry"). */
export interface EmailDoc { name: string; expiresOn: string | null; dateLabel: 'expires' | 'review_by' }

export async function sendShareEmail(p: {
  to: string; truckName: string; replyTo: string | null; locale: string; time: TimeSettings
  docs: EmailDoc[]; message: string | null; eventName: string | null; url: string; until: string
}, fetchImpl: typeof fetch = fetch): Promise<Sent> {
  const t = translatorFor(p.locale, 'paperwork')
  const when = (d: EmailDoc) => !d.expiresOn ? t('email.noExpiry') : d.dateLabel === 'review_by' ? t('email.reviewBy', { date: formatLongDate(d.expiresOn, p.time) }) : t('email.expires', { date: formatLongDate(d.expiresOn, p.time) })
  const until = formatLongDate(p.until, p.time)
  const lines = p.docs.map(d => `${d.name} — ${when(d)}`)
  const html = shell(`
    <h2 style="color:#0f172a">${esc(t('email.shareHeading', { truck: p.truckName }))}</h2>
    <p>${esc(t('email.shareIntro', { truck: p.truckName }))}</p>
    ${p.eventName ? `<p><strong>${esc(t('email.event', { event: p.eventName }))}</strong></p>` : ''}
    ${p.message ? `<p style="white-space:pre-line;border-left:3px solid #e2e8f0;padding-left:12px">${esc(p.message)}</p>` : ''}
    <ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    ${button(p.url, t('email.shareButton'))}
    <p style="color:#64748b;font-size:13px">${esc(t('email.shareUntil', { date: until, truck: p.truckName }))}</p>
    ${p.replyTo ? `<p style="color:#64748b;font-size:13px">${esc(t('email.shareReply', { truck: p.truckName }))}</p>` : ''}`)
  const textContent = [t('email.shareHeading', { truck: p.truckName }), t('email.shareIntro', { truck: p.truckName }),
    p.eventName ? t('email.event', { event: p.eventName }) : '', p.message ?? '', lines.map(l => `- ${l}`).join('\n'), p.url,
    t('email.shareUntil', { date: until, truck: p.truckName })].filter(Boolean).join('\n\n')
  return brevo({
    sender: { name: fromName(p.truckName), email: HATCHGRAB_SENDER.email },
    to: [{ email: p.to }],
    ...(p.replyTo ? { replyTo: { email: p.replyTo, name: p.truckName } } : {}),
    subject: t('email.shareSubject', { truck: p.truckName }),
    htmlContent: html, textContent,
  }, fetchImpl)
}

/** One line of a reminder: the document and how its date stands today. */
export function reminderLine(t: ReturnType<typeof translatorFor<'paperwork'>>, d: EmailDoc & { stage: ReminderStage }, today: string, time: TimeSettings): string {
  const date = formatLongDate(d.expiresOn!, time)
  const days = daysBetween(today, d.expiresOn!)
  if (days > 0) return t('email.reminderIn', { document: d.name, date, days })
  if (days === 0) return t('email.reminderToday', { document: d.name })
  return t('email.reminderExpired', { document: d.name, date })
}

export async function sendReminderEmail(p: {
  to: string; truckName: string; locale: string; time: TimeSettings; today: string
  docs: (EmailDoc & { stage: ReminderStage })[]; url: string
}, fetchImpl: typeof fetch = fetch): Promise<Sent> {
  const t = translatorFor(p.locale, 'paperwork')
  const lines = p.docs.map(d => reminderLine(t, d, p.today, p.time))
  const html = shell(`
    <h2 style="color:#0f172a">${esc(t('email.reminderHeading'))}</h2>
    <p>${esc(t('email.reminderIntro', { truck: p.truckName }))}</p>
    <ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    ${button(p.url, t('email.reminderButton'))}
    <p style="color:#64748b;font-size:13px">${esc(t('email.reminderFooter'))}</p>`)
  return brevo({
    sender: { name: HATCHGRAB_SENDER.name, email: HATCHGRAB_SENDER.email },
    to: [{ email: p.to }],
    replyTo: { email: HATCHGRAB_SENDER.replyTo },
    subject: t('email.reminderSubject', { count: p.docs.length }),
    htmlContent: html,
    textContent: [t('email.reminderHeading'), t('email.reminderIntro', { truck: p.truckName }), lines.map(l => `- ${l}`).join('\n'), p.url, t('email.reminderFooter')].join('\n\n'),
  }, fetchImpl)
}
