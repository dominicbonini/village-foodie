// lib/till/archive-mailer.ts — till-pack-5: the archive email's sender (Brevo, from hello@hatchgrab.com — lib/email-config.ts). SERVER ONLY.
// Never throws: a provider failure is a result ({ ok: false }) — the archive itself is already stored and chained; the caller decides
// (account deletion's final archive STOPS when its email was not sent; the yearly run reports it and the owner can ask for a new link).
import 'server-only'
import { HATCHGRAB_SENDER } from '@/lib/email-config'
import type { TillArchiveEmail } from '@/lib/till/archive-email'

export interface ArchiveMailer { send(e: TillArchiveEmail): Promise<{ ok: boolean }> }

export function brevoArchiveMailer(): ArchiveMailer {
  return {
    async send(e) {
      const apiKey = process.env.BREVO_API_KEY
      if (!apiKey) { console.warn('[till/archive-mailer] BREVO_API_KEY not set — archive email not sent'); return { ok: false } }
      try {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: HATCHGRAB_SENDER.name, email: HATCHGRAB_SENDER.email },
            replyTo: { email: HATCHGRAB_SENDER.replyTo },
            to: [{ email: e.to }],
            subject: e.subject, htmlContent: e.html, textContent: e.text,
            tags: ['till-archive'],
          }),
          signal: AbortSignal.timeout(8_000),
        })
        if (!res.ok) { console.error('[till/archive-mailer] Brevo send failed:', res.status); return { ok: false } }
        return { ok: true }
      } catch (err) {
        console.error('[till/archive-mailer] send error:', err instanceof Error ? err.message : err)
        return { ok: false }
      }
    },
  }
}
