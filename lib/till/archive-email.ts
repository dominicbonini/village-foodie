// lib/till/archive-email.ts — till-pack-5 (25 November 2026, docs/till-pack-5-6-report.md; Q10): THE ARCHIVE EMAIL — the one new message.
//
// To the truck's OWNER, in the owner's language (messages `emailTillArchive`, translated for every language base), exactly:
//   Subject: "Your sales archive for {period} is ready"
//   Body:    "Your HatchGrab sales archive for {period} is ready. Download it here: {link} (the link works for 7 days). Keep a copy: in some
//             countries, such as France, you must keep sales records for 10 years. Archive fingerprint: {hash}. You don't need to do anything else."
// {link} is a 7-day signed URL to the private bucket (a new one comes from the on-demand API); {hash} is the manifest's sha256. Pure: no
// network (lib/till/archive-mailer.ts sends it), so the harness renders it in every language.
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/emailTillArchive'
import { formatYmd } from '@/lib/time-utils'

export interface TillArchiveEmail { to: string; subject: string; text: string; html: string; locale: string }

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

/** The period in the reader's language: a calendar year is just "2026"; anything else is "1 Jan 2026 – 31 Dec 2026". */
export function archivePeriodLabel(from: string, to: string, locale: string, timeZone: string): string {
  if (from.slice(5) === '01-01' && to.slice(5) === '12-31' && from.slice(0, 4) === to.slice(0, 4)) return from.slice(0, 4)
  const ts = { timeZone, locale, timeFormat: '24h' as const, dateOrder: 'dmy' as const, weekStart: 'monday' as const }
  const f = (ymd: string) => formatYmd(ymd, ts, { day: 'numeric', month: 'short', year: 'numeric' })
  return from === to ? f(from) : `${f(from)} – ${f(to)}`
}

export function composeArchiveEmail(args: { to: string; locale: string; timeZone: string; from: string; to_: string; link: string; hash: string }): TillArchiveEmail {
  const t = translatorFor(args.locale, 'emailTillArchive')
  const period = archivePeriodLabel(args.from, args.to_, args.locale, args.timeZone)
  const subject = t('subject', { period })
  const text = t('body', { period, link: args.link, hash: args.hash })
  // HTML: the same words, the link clickable (the URL is escaped, then wrapped — it appears exactly once in the body).
  const escaped = esc(text)
  const html = `<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111">${escaped.replace(esc(args.link), `<a href="${esc(args.link)}">${esc(args.link)}</a>`)}</p>`
  return { to: args.to, subject, text, html, locale: args.locale }
}
