// lib/enquiries/learning.ts — 🔴 HOW DOMINIC'S EDITS BECOME KNOWLEDGE, BACKEND ONLY (enquiries-backend-1, 23 November 2026). Pure.
//   • suggestFromEdit(aiDraft, sentText): what Dominic ADDED to the AI's draft becomes a SUGGESTED fact (source 'edit').
//   • "Note:" lines in Dominic's text become SUGGESTED guidance (source 'note') and are stripped from anything that could reach a
//     customer (lib/enquiries/rules.ts splitNotes).
// 🔴 NOTHING HERE APPROVES. Every line it makes is status 'suggested'; only 'approved' lines ever reach the answer pack
//    (lib/enquiries/answer-pack.ts selectKnowledge), and approving is Dominic's.
import { splitNotes } from '@/lib/enquiries/rules'
import type { KnowledgeRow } from '@/lib/enquiries/answer-pack'

export type SuggestedLine = Omit<KnowledgeRow, 'id'> & { status: 'suggested' }

/** Sentences, normalised for comparison (case, spacing, quotes, trailing punctuation). */
function sentences(text: string): { raw: string; key: string }[] {
  return text.replace(/\r\n/g, '\n').split(/(?<=[.!?。！？])\s+|\n+/u).map(s => s.trim()).filter(Boolean)
    .map(raw => ({ raw, key: raw.toLowerCase().replace(/[“”«»"']/g, '').replace(/\s+/g, ' ').replace(/[.!?。！？,;:\s]+$/u, '') }))
}
/** Greetings and sign-offs are not knowledge. */
const CHATTER = /^(hi|hello|dear|bonjour|hallo|hola|ciao|thanks?|thank you|merci|best|kind regards|regards|cheers|dominic|bien à vous|cordialement)\b[^.]{0,40}$/i

/**
 * A suggested fact from what Dominic added when he edited the draft — or null when he added nothing that reads as knowledge.
 * `topics`: the asks' topics of the enquiry (Dominic can change them when he approves). Note lines are not part of the fact.
 */
export function suggestFromEdit(aiDraft: string, sentText: string, o: { topics?: string[]; country?: string | null; ref?: string | null } = {}): SuggestedLine | null {
  const before = new Set(sentences(aiDraft).map(s => s.key))
  const added = sentences(splitNotes(sentText).text).filter(s => !before.has(s.key) && !CHATTER.test(s.raw) && s.key.length >= 12)
  if (!added.length) return null
  return {
    kind: 'fact', topics: [...new Set(o.topics ?? [])], wording: added.map(s => s.raw).join(' '), customer_safe: true,
    countries: o.country ? [o.country] : [], status: 'suggested', source: 'edit', source_ref: o.ref ?? null,
  }
}

/** Each "Note:" line in Dominic's text → a suggested guidance line (never customer-safe). */
export function suggestFromNotes(text: string, o: { topics?: string[]; ref?: string | null } = {}): SuggestedLine[] {
  return splitNotes(text).notes.map(n => ({
    kind: 'guidance', topics: [...new Set(o.topics ?? [])], wording: n, customer_safe: false, countries: [], status: 'suggested', source: 'note', source_ref: o.ref ?? null,
  }))
}

/** What may go to a customer from Dominic's text: the text with every "Note:" line removed. */
export const customerTextOf = (text: string) => splitNotes(text).text
