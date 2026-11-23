// lib/enquiries/order-subjects.ts — the subjects of the emails a DINER gets about their own order, in every language we have, as
// patterns (enquiries-backend-1, 23 November 2026). lib/enquiries/rules.ts isOrderMail matches a reply's subject against them, so a
// diner answering "Votre commande #12 est prête — Chez Paul" is left in the mailbox (Dominic: order mail is not an enquiry).
//
// The words are read from the message catalogue the emails themselves are built from (emailCustomer, emailReview) — never retyped —
// and each {placeholder} (including an ICU select) becomes "anything". Read-only: this module only reads words.
import { messagesOf } from '@/lib/i18n/registry'
import { LOCALES } from '@/lib/i18n/locales'
import '@/lib/i18n/catalog/emailCustomer'
import '@/lib/i18n/catalog/emailReview'

/** The subject keys of the diner-facing emails (lib/email.ts, lib/reviews/email.ts). */
export const ORDER_SUBJECT_KEYS: readonly { ns: 'emailCustomer' | 'emailReview'; key: string }[] = [
  { ns: 'emailCustomer', key: 'confirmation.subjectReady' },
  { ns: 'emailCustomer', key: 'confirmation.subjectConfirmed' },
  { ns: 'emailCustomer', key: 'confirmation.subjectReceived' },
  { ns: 'emailCustomer', key: 'refund.subjectFull' },
  { ns: 'emailCustomer', key: 'refund.subjectPartial' },
  { ns: 'emailCustomer', key: 'cancellation.subject' },
  { ns: 'emailCustomer', key: 'eventCancellation.subject' },
  { ns: 'emailCustomer', key: 'rejection.subject' },
  { ns: 'emailCustomer', key: 'updated.subject' },
  { ns: 'emailCustomer', key: 'updated.subjectTotalMoved' },
  { ns: 'emailCustomer', key: 'updated.subjectSlotMoved' },
  { ns: 'emailReview', key: 'subject' },
]

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** One template → a whole-subject pattern: every top-level {…} group (an ICU select's nested braces included) is "anything". Pure. */
export function templatePattern(template: string): RegExp | null {
  const parts: string[] = []
  let depth = 0, buf = ''
  for (const ch of template) {
    if (ch === '{') { if (depth === 0) { parts.push(escapeRe(buf)); buf = '' } depth++; continue }
    if (ch === '}') { depth = Math.max(0, depth - 1); if (depth === 0) parts.push('.+?'); continue }
    if (depth === 0) buf += ch
  }
  parts.push(escapeRe(buf))
  const literal = parts.filter(p => p !== '.+?').join('').replace(/\\s|\s/g, '')
  // A template that is (almost) all placeholder would match any subject: refused.
  if (literal.length < 4) return null
  const body = parts.join('').replace(/\s+/g, '\\s+')
  return new RegExp(`^\\s*${body}\\s*$`, 'iu')
}

const dig = (tree: unknown, key: string): string | null => {
  let v: unknown = tree
  for (const k of key.split('.')) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined
  return typeof v === 'string' ? v : null
}

let cache: RegExp[] | null = null
/** Every order-mail subject pattern, in every locale, de-duplicated. Built once per server instance. */
export function orderSubjectPatterns(): RegExp[] {
  if (cache) return cache
  const seen = new Set<string>(), out: RegExp[] = []
  for (const locale of LOCALES) {
    const tree = messagesOf(locale, ['emailCustomer', 'emailReview']) as unknown as Record<string, unknown>
    for (const { ns, key } of ORDER_SUBJECT_KEYS) {
      const t = dig(tree[ns], key)
      if (!t) continue
      const re = templatePattern(t.replace(/^🔔\s*/u, ''))
      if (re && !seen.has(re.source)) { seen.add(re.source); out.push(re) }
    }
  }
  cache = out
  return out
}
