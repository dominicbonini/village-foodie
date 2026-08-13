// lib/payments/sold-out-copy.ts
// 🔴 ONE SENTENCE FOR A SOLD-OUT REFUSAL, AND EXACTLY ONE PLACE THAT WRITES IT.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────────
// The wording reaches a customer by three routes that do not share a runtime: promoteDraft composes it
// on the server; /api/payments/return rebuilds it when the OTHER trigger refused and only the machine
// reason survives; and the order page renders it when a pay-at-hatch refusal empties the basket, where
// no server sentence exists at all. Three places composing one sentence is three places for it to drift,
// and it already had — the page appended a second half the server knew nothing about.
//
// ⚠️ IT IS ONE WORDING, NOT A FAMILY. One item, several items, and a basket emptied by the removal all
// read the same. The only thing that moves is the list of names and the pronoun that refers to them.
// ⚠️ "sold out" IS PAST TENSE AND INVARIANT — "Fish Cake sold out", "Fish Cake and Prawn Toast sold
// out". What pluralises is "it" -> "them".
//
// ── CONVENTIONS, MATCHED TO THE REST OF THE CUSTOMER COPY ───────────────────────────────────────
// ASCII apostrophe ('), as lib/email.ts uses throughout ("We're still confirming your payment"), and the
// em dash (—) that every customer-facing sentence in this codebase uses mid-sentence.

/** "A" · "A and B" · "A, B and C" — Oxford-free, which is how the rest of the copy reads. */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * What the customer was doing when it sold out under them — and the only thing that differs between the
 * two paths.
 *
 * 🔴 'ordering' MUST NOT MENTION MONEY. A pay-at-hatch refusal happens on tapping Place order; no card
 * was ever presented, so "we have not taken any money" answers a question the customer did not have and
 * plants the idea that one might have been. 'paying' must say it first, for the opposite reason: their
 * banking app is showing a pending authorisation right now.
 */
export type SoldOutStage = 'paying' | 'ordering'

/**
 * The sentence a customer reads when what they were ordering sold out underneath them.
 *
 * 🔴 IT LEADS WITH THE FACT AND, ON THE CARD PATH, CLEARS THE MONEY IN THE SAME BREATH — not as a last
 * clause they may never reach.
 *
 * @param names the item names the guard refused on. An empty list is not describable by this sentence —
 *              the caller keeps its own generic refusal for that, and there is no wording here to guess.
 */
export function soldOutRefusalMessage(names: string[], stage: SoldOutStage): string | null {
  const named = names.map(n => n.trim()).filter(Boolean)
  if (!named.length) return null
  const pronoun = named.length === 1 ? 'it' : 'them'
  const money = stage === 'paying' ? ' and have not taken any money' : ''
  return `${joinNames(named)} sold out while you were ${stage}. We've removed ${pronoun}${money} — please check your order before placing it again.`
}
