// lib/billing/mailer.ts — billing-2: the billing emails' Brevo sender. SERVER ONLY.
// From "HatchGrab" <hello@hatchgrab.com>, Reply-To the same (lib/email-config.ts HATCHGRAB_SENDER, email-sender-1). Never throws:
// a provider failure is a result (the claim stays, so it is not sent twice; the run reports it).
import 'server-only'
import { HATCHGRAB_SENDER } from '@/lib/email-config'
import type { Mailer } from '@/lib/billing/emails'

export function brevoBillingMailer(): Mailer {
  return {
    async send(e) {
      const apiKey = process.env.BREVO_API_KEY
      if (!apiKey) { console.warn('[billing/mailer] BREVO_API_KEY not set — billing email not sent'); return { ok: false, id: null } }
      try {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: HATCHGRAB_SENDER.name, email: HATCHGRAB_SENDER.email },
            replyTo: { email: HATCHGRAB_SENDER.replyTo },
            to: [{ email: e.to }],
            subject: e.subject, htmlContent: e.html, textContent: e.text,
            tags: ['billing'],
          }),
          signal: AbortSignal.timeout(8_000),
        })
        if (!res.ok) { console.error('[billing/mailer] Brevo send failed:', res.status); return { ok: false, id: null } }
        const body = (await res.json().catch(() => ({}))) as { messageId?: string }
        return { ok: true, id: body.messageId ?? null }
      } catch (err) {
        console.error('[billing/mailer] send error:', err instanceof Error ? err.message : err)
        return { ok: false, id: null }
      }
    },
  }
}
