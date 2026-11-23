// lib/inbox/aliases.ts — 🔴 THE ADDRESSES PEOPLE WRITE TO, AND WHAT THEY TELL US (inbox-1, 23 November 2026; docs/inbox-1-report.md). Pure.
//
// The 36 aliases (bonjour@, hola@, support@ …) are DATA: outreach_settings 'mail_aliases', a JSON array of addresses, every one delivered
// into hello@. This module only reads that list: which of an email's recipients is ours (the address they wrote to, recorded on the
// message), which From a reply uses, and what language an alias hints at when detection is unsure.
// 🔴 Every alias is one of our own addresses: mail FROM one is never taken in (lib/enquiries/rules.ts skipReason, own_address).

export const HELLO_ADDRESS = 'hello@hatchgrab.com'
export const DOMINIC_ADDRESS = 'dominic@hatchgrab.com'
export const ALIASES_KEY = 'mail_aliases'
export const REPLY_FROM_ALIAS_KEY = 'enquiries_reply_from_alias'

const lower = (s: unknown) => String(s ?? '').trim().toLowerCase()
const ADDRESS_RE = /^[a-z0-9._%+-]+@hatchgrab\.com$/

/** The stored setting → the alias addresses (lower case, @hatchgrab.com only, no duplicates). Anything else in it is ignored. */
export function parseAliases(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(lower).filter(a => ADDRESS_RE.test(a)))]
}

/** Every address that is ours for the loop filter and for "which address did they write to": hello@, dominic@ and the aliases. */
export function ownAddresses(aliases: readonly string[]): string[] {
  return [...new Set([HELLO_ADDRESS, DOMINIC_ADDRESS, ...aliases.map(lower)])]
}

/** The address they wrote to: the first of the email's recipients that is one of ours, else null. */
export function wroteTo(recipients: readonly (string | null | undefined)[], aliases: readonly string[]): string | null {
  const ours = new Set(ownAddresses(aliases))
  for (const r of recipients) { const a = lower(r); if (ours.has(a)) return a }
  for (const r of recipients) { const a = lower(r); if (a.endsWith('@hatchgrab.com')) return a }
  return null
}

/** "bonjour@hatchgrab.com" → "bonjour@" (the list's short form). */
export const shortAddress = (a: string | null | undefined) => (a ? lower(a).replace(/@hatchgrab\.com$/, '@') : '')

/**
 * 🔴 THE FROM OF AN ENQUIRY'S REPLY. dominic@ when they wrote to dominic@ (inbox-2); otherwise hello@ — unless 'enquiries_reply_from_alias' is true AND they wrote to one of the aliases, in which
 * case the reply comes from that alias. Dominic switches the setting on after a test send.
 */
export function enquiryReplyFrom(o: { replyFromAlias: boolean; wroteTo: string | null; aliases: readonly string[] }): string {
  const w = lower(o.wroteTo)
  // inbox-2: a customer who wrote to dominic@ (taken in from dominic@'s INBOX) is answered from dominic@, whatever the alias setting.
  if (w === DOMINIC_ADDRESS) return DOMINIC_ADDRESS
  if (o.replyFromAlias && w && o.aliases.map(lower).includes(w)) return w
  return HELLO_ADDRESS
}

/** The language an alias suggests. Only a HINT, used when detection is unsure. admin@, billing@, privacy@, support@, tester@: none. */
export const ALIAS_LANGUAGE: Readonly<Record<string, string>> = {
  ahoj: 'cs', annyeong: 'ko', bok: 'hr', bonjour: 'fr', buna: 'ro', ciao: 'it', czesc: 'pl', hallo: 'de', halo: 'id', hei: 'fi', hej: 'sv',
  hola: 'es', jambo: 'sw', konnichiwa: 'ja', kumusta: 'fil', labas: 'lt', marhaba: 'ar', merhaba: 'tr', namaste: 'hi', nihao: 'zh', ola: 'pt',
  privet: 'ru', sawasdee: 'th', shalom: 'he', sveiki: 'lv', szia: 'hu', tere: 'et', xinchao: 'vi', yassou: 'el', zdravei: 'bg', zdravo: 'sr',
}
export function aliasLanguage(address: string | null | undefined): string | null {
  const local = lower(address).split('@')[0]
  return ALIAS_LANGUAGE[local] ?? null
}
