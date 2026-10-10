// lib/payments/currency.ts — the ONE place a currency code is normalised on the money path.
//
// 🔴 NO DEFAULT. Until 10 October 2026 three writers fell back to the literal 'GBP' (ledger, order drafts,
// authorisation), and one wrote Stripe's lower-case 'gbp' into the ledger (the synchronous refund path).
// Now every money row carries the currency of the order it belongs to — orders.currency, snapshotted from
// the truck at insert (20261010_07), or the draft's, which the submit route sets from the truck — and a
// missing or malformed code is a THROW, not a guess. A wrong currency on a ledger row is a wrong amount.
//
// ⚠️ TWO SPELLINGS, TWO OWNERS: our database stores ISO 4217 in UPPER case (20261010_06/_09 CHECK it);
// Stripe's API takes and returns it in lower case. Convert at the boundary, here, never inline.

/** "GBP" — as order_payments / order_drafts / orders store it. Throws on anything that is not 3 letters. */
export function ledgerCurrency(code: unknown, where: string): string {
  if (typeof code !== 'string' || !/^[A-Za-z]{3}$/.test(code.trim())) {
    throw new Error(`[payments] ${where}: no usable currency (${JSON.stringify(code)}) — refusing to guess one`)
  }
  return code.trim().toUpperCase()
}

/** "gbp" — as Stripe's API takes it. Same validation. */
export function stripeCurrency(code: unknown, where: string): string {
  return ledgerCurrency(code, where).toLowerCase()
}
