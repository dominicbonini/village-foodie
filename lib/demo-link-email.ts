// lib/demo-link-email.ts — demo-2 (30 October 2026, docs/demo-2-report.md): "here is the link to your demo", sent to the
// email a landing-page visitor gives before the build, once the build has finished.
//
// THE SAME TRANSACTIONAL PATH as /api/demo/save-email: Brevo, from HATCHGRAB_SENDER, written in the demo truck's
// language (the `demoLinkEmail` words). It is not an order email, so the demo's "never email" rule (which suppresses
// ORDER mail on a demo truck) does not apply to it.
// 🔴 THE LINK CARRIES NO TOKEN: `/try/<slug>`, the walkthrough page, which reads the demo by its slug — the same
// identifier the customer order page already shows in its URL. The dashboard token never leaves the server here.
// BEST-EFFORT: a failed send is logged and reported to the caller, never thrown — the visitor already has their demo.
import { HATCHGRAB_SENDER, HATCHGRAB_LOGO_URL } from '@/lib/email-config'
import { translatorFor } from '@/lib/i18n/translator'
import { formatLongDate, localDateOfInstant, timeSettingsOr, type TimeSettings } from '@/lib/time-utils'
import type { AppLocale } from '@/lib/i18n/locales'
import '@/lib/i18n/catalog/demoLinkEmail'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The walkthrough link for a demo — `/try/<slug>` on the given base. Never a dashboard token. */
export const demoWalkthroughUrl = (base: string, slug: string) => `${base.replace(/\/$/, '')}/try/${encodeURIComponent(slug)}`

export async function sendDemoLinkEmail(p: {
  to: string; slug: string; expiresAt: string | null; locale: AppLocale; time: TimeSettings | null
  /** The site base the link points at (NEXT_PUBLIC_HATCHGRAB_URL, else the request's own origin). */
  base: string
}): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) return { sent: false, reason: 'BREVO_API_KEY unset' }
  const t = translatorFor(p.locale, 'demoLinkEmail')
  const url = demoWalkthroughUrl(p.base, p.slug)
  const ts = timeSettingsOr(p.time, 'demo link email')
  const deletion = p.expiresAt ? t('deletion', { date: formatLongDate(localDateOfInstant(p.expiresAt, ts.timeZone), ts) }) : t('deletionSoon')
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: HATCHGRAB_SENDER.name, email: HATCHGRAB_SENDER.email },
        to: [{ email: p.to }],
        replyTo: { email: HATCHGRAB_SENDER.replyTo },
        subject: t('subject'),
        htmlContent: `
          <div style="font-family:Arial,sans-serif;color:#334155;max-width:600px">
            <img src="${HATCHGRAB_LOGO_URL}" alt="HatchGrab" width="180" style="margin-bottom:24px;display:block"/>
            <h2 style="color:#0f172a">${esc(t('heading'))}</h2>
            <p>${esc(t('intro'))}</p>
            <p style="margin:24px 0">
              <a href="${esc(url)}" style="background:#ea580c;color:#fff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block">${esc(t('button'))}</a>
            </p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
            <p style="color:#64748b;font-size:13px">${esc(deletion)}</p>
            <p style="color:#94a3b8;font-size:12px">HatchGrab · hatchgrab.com</p>
          </div>`,
        textContent: `${t('heading')}\n\n${t('intro')}\n\n${url}\n\n${deletion}`,
      }),
    })
    if (!res.ok) return { sent: false, reason: `Brevo ${res.status}` }
    return { sent: true }
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : 'send failed' }
  }
}
