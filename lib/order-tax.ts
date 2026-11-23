// lib/order-tax.ts — 🔴 france-vat-1 (24 November 2026, docs/france-vat-1-report.md): WHICH RATE EACH PART OF AN ORDER IS SOLD AT.
//
// PURE AND CLIENT-SAFE: no database, no clock, no React. The server (customer submit, card drafts, walk-up, operator edit)
// and the browser previews (order page, Add order, dashboard edit) call the SAME functions, so a preview can never show a
// figure the server will not charge. lib/order-charges.ts turns the parts this module returns into tax.
//
// ── THE RULES (Dominic, france-vat-1) ─────────────────────────────────────────────────────────────────────────────────────
//   • A DISH LINE is sold at its dish's own rate (menu_items_db.tax_rate_milli), or the order's DEFAULT rate when the dish has
//     none (NULL). Its extras are inside its unit price and take the same rate.
//   • A DEAL's price (bundle price + its slot extras) is split across its chosen dishes in proportion to those dishes'
//     à-la-carte prices (the price book's, i.e. the price at this event), each share at that dish's rate. If a chosen dish
//     cannot be found in the book, or every chosen dish's price is zero, the WHOLE deal takes the default rate — logged
//     (`[order-tax] deal fallback`) and returned in `fallbacks`.
//   • AN ORDER-LEVEL DISCOUNT (codes, and any other reduction already inside `foodMinor`) is spread across the rates in
//     proportion to each rate's pre-discount food: the parts are `foodMinor` itself, allocated by those totals.
//   • LARGEST REMAINDER everywhere, so the allocated minor units always add up to the amount allocated, exactly.
//   • RATE-LOCK (an operator edit, D4 extended): a line already on the order keeps the rate it was stamped with; an older line
//     with no stamp takes the order's own stored rate; a line the edit adds takes today's dish rate (or the order's default).
//
// ── WHAT IS STAMPED ON THE STORED ROW ───────────────────────────────────────────────────────────────────────────────────
//   items[i].item_id         menu_items_db.id (null when the dish is not on the menu: an operator's hand-priced line)
//   items[i].tax_rate_milli  the rate the line was SOLD at (the effective rate: its own, else the default; null = no rate)
//   deals[i].tax_parts       [{ tax_rate_milli, minor }] — the deal's pre-discount split, so an edit keeps it
// 🔴 A RATE OR AN ID FROM THE BROWSER IS NEVER TRUSTED: every stamp is overwritten from the book the caller resolved.
import { minorDigits } from '@/lib/money-format'

/** One dish in the book, by NAME (order lines carry names; the menu's names are the join everywhere else too). */
export interface TaxBookEntry {
  id?: string | null
  /** The dish's own rate, thousandths of a percent. null = the default. */
  rate: number | null
  /** The à-la-carte price, minor units — the deal-split weight. */
  priceMinor: number
}
export type TaxBook = Record<string, TaxBookEntry>

/** One rate's share of the food, after the discount. `rate` null = no rate (no tax). */
export interface FoodPart { rate: number | null; minor: number }

export interface ItemStamp { item_id: string | null; tax_rate_milli: number | null }
export interface DealTaxPart { tax_rate_milli: number | null; minor: number }
export interface DealStamp { tax_parts: DealTaxPart[] }
export interface DealFallback { deal: string; reason: 'unknown_dish' | 'zero_prices' | 'no_dishes' }

export interface LineTaxInput {
  /** The PRICED lines (server-repriced, or the basket in a preview): name, quantity, unit_price (major units, extras included). */
  items: readonly { name?: unknown; quantity?: unknown; unit_price?: unknown; modifiers?: unknown }[] | null | undefined
  /** The PRICED deals: name, price (major, the bundle price), slots {slot → dish name}, slotModifiers {slot → [{price}]}. */
  deals: readonly { name?: unknown; price?: unknown; slots?: unknown; slotModifiers?: unknown }[] | null | undefined
  /** The food after the discount, minor units — what the parts must add up to. */
  foodMinor: number
  book: TaxBook
  /** The order's default rate (the truck's, or — on an edit — the order's own stored one). null = no rate. */
  defaultRate: number | null
  currency: string | null | undefined
  /** An operator edit: the order as stored, for the rate-lock. */
  stored?: { items?: unknown; deals?: unknown } | null
}

export interface LineTaxResult {
  itemStamps: ItemStamp[]
  dealStamps: DealStamp[]
  /** Ascending by rate (no rate first), one per rate, adding up to `foodMinor` exactly. */
  parts: FoodPart[]
  fallbacks: DealFallback[]
}

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : 0 }
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const toMinorOf = (major: number, currency: string | null | undefined) => Math.round(major * 10 ** (currency ? minorDigits(currency) : 2))
const rateOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null)
/** A rate as a map key: no rate is its own key. */
const keyOf = (r: number | null) => (r === null ? 'none' : String(r))

/**
 * `total` split by `weights`, LARGEST REMAINDER: each share floor(total × w ÷ W), then the leftover units one each to the
 * largest remainders (ties to the earlier index). Always adds up to `total`. All weights 0 → everything to the first.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(total)) throw new RangeError(`[order-tax] allocate needs an integer total (got ${total})`)
  const n = weights.length
  if (n === 0) return []
  const w = weights.map(x => (Number.isFinite(x) && x > 0 ? Math.round(x) : 0))
  const W = w.reduce((s, x) => s + x, 0)
  if (W === 0) return w.map((_, i) => (i === 0 ? total : 0))
  const sign = total < 0 ? -1 : 1
  const T = Math.abs(total)
  const base = w.map(x => Math.floor((T * x) / W))
  let left = T - base.reduce((s, x) => s + x, 0)
  const order = w.map((x, i) => ({ i, rem: (T * x) % W })).sort((a, b) => b.rem - a.rem || a.i - b.i)
  for (const o of order) { if (left <= 0) break; base[o.i] += 1; left -= 1 }
  return base.map(x => sign * x)
}

/** The same identity as lib/order-repricing's lineIdentity (name + sorted modifier names), so the rate-lock pairs lines exactly
 *  as price-lock does. Kept local so this module stays free of the repricer's imports. */
function lineIdentity(name: unknown, modifiers: unknown): string {
  const mods = asArray<{ name?: unknown }>(modifiers).map(m => String(m?.name ?? '')).filter(Boolean).sort().join('|')
  const n = String(name ?? '')
  return mods ? `${n}::${mods}` : n
}

/** The stored lines' stamps, queued by identity (duplicates pair in order). `stamped` false = an older line with no stamp. */
function storedLineQueues(items: unknown): Map<string, { stamped: boolean; id: string | null; rate: number | null }[]> {
  const m = new Map<string, { stamped: boolean; id: string | null; rate: number | null }[]>()
  for (const it of asArray<Record<string, unknown>>(items)) {
    const k = lineIdentity(it?.name, it?.modifiers)
    const stamped = it != null && typeof it === 'object' && 'tax_rate_milli' in it
    const entry = { stamped, id: typeof it?.item_id === 'string' ? it.item_id : null, rate: rateOrNull(it?.tax_rate_milli) }
    const q = m.get(k); if (q) q.push(entry); else m.set(k, [entry])
  }
  return m
}
function storedDealQueues(deals: unknown): Map<string, (DealTaxPart[] | null)[]> {
  const m = new Map<string, (DealTaxPart[] | null)[]>()
  for (const d of asArray<Record<string, unknown>>(deals)) {
    const k = String(d?.name ?? '')
    const parts = Array.isArray(d?.tax_parts)
      ? (d.tax_parts as unknown[]).map(p => ({ tax_rate_milli: rateOrNull((p as DealTaxPart)?.tax_rate_milli), minor: Math.max(0, Math.round(num((p as DealTaxPart)?.minor))) }))
      : null
    const q = m.get(k); if (q) q.push(parts); else m.set(k, [parts])
  }
  return m
}

/** A dish's effective rate from the book: its own, else the default. Unknown dish → the default. */
const effectiveRate = (book: TaxBook, name: string, defaultRate: number | null): number | null => {
  const e = book[name]
  return e && e.rate !== null && e.rate !== undefined ? e.rate : defaultRate
}

/**
 * 🔴 THE SPLIT. Stamps for every line and deal, and the food after the discount split by rate.
 * Every line on the same rate → one part, `{ rate, minor: foodMinor }`, which lib/order-charges.ts taxes exactly as before.
 */
export function lineTax(input: LineTaxInput): LineTaxResult {
  const { book, defaultRate, currency } = input
  if (!Number.isSafeInteger(input.foodMinor) || input.foodMinor < 0) throw new RangeError(`[order-tax] foodMinor must be a non-negative integer (got ${input.foodMinor})`)
  const lockLines = input.stored ? storedLineQueues(input.stored.items) : null
  const lockDeals = input.stored ? storedDealQueues(input.stored.deals) : null
  const preByRate = new Map<string, { rate: number | null; minor: number }>()
  const add = (rate: number | null, minor: number) => {
    const k = keyOf(rate)
    const cur = preByRate.get(k)
    if (cur) cur.minor += minor; else preByRate.set(k, { rate, minor })
  }

  const itemStamps: ItemStamp[] = []
  for (const it of input.items ?? []) {
    const name = String(it?.name ?? '')
    const lineMinor = Math.max(0, toMinorOf(num(it?.unit_price) * num(it?.quantity), currency))
    const locked = lockLines?.get(lineIdentity(name, it?.modifiers))?.shift()
    let stamp: ItemStamp
    if (locked) {
      // On the order already: its own stamp, or (an older line) the order's stored rate. The id is the stamp's, else the book's.
      stamp = { item_id: locked.id ?? book[name]?.id ?? null, tax_rate_milli: locked.stamped ? locked.rate : defaultRate }
    } else {
      stamp = { item_id: book[name]?.id ?? null, tax_rate_milli: effectiveRate(book, name, defaultRate) }
    }
    itemStamps.push(stamp)
    add(stamp.tax_rate_milli, lineMinor)
  }

  const dealStamps: DealStamp[] = []
  const fallbacks: DealFallback[] = []
  for (const d of input.deals ?? []) {
    const name = String(d?.name ?? '')
    const slotMods = (d?.slotModifiers && typeof d.slotModifiers === 'object') ? d.slotModifiers as Record<string, unknown> : {}
    const extra = Object.values(slotMods).reduce<number>((s, list) => s + asArray<{ price?: unknown }>(list).reduce((a, m) => a + num(m?.price), 0), 0)
    const dealMinor = Math.max(0, toMinorOf(num(d?.price) + extra, currency))
    const locked = lockDeals?.get(name)?.shift()
    let parts: DealTaxPart[]
    if (locked && locked.length > 0) {
      // On the order already: the stored split's proportions, applied to today's (locked) deal price.
      const shares = allocate(dealMinor, locked.map(p => p.minor))
      parts = locked.map((p, i) => ({ tax_rate_milli: p.tax_rate_milli, minor: shares[i] }))
    } else {
      const slots = (d?.slots && typeof d.slots === 'object') ? Object.values(d.slots as Record<string, unknown>).map(v => String(v ?? '')).filter(Boolean) : []
      const unknown = slots.find(s => !book[s])
      const weights = slots.map(s => Math.max(0, Math.round(book[s]?.priceMinor ?? 0)))
      const reason: DealFallback['reason'] | null = slots.length === 0 ? 'no_dishes' : unknown !== undefined ? 'unknown_dish' : weights.every(w => w === 0) ? 'zero_prices' : null
      // A deal stored before this build has no split: on an edit it keeps the order's stored rate (rate-lock), like an older line.
      const lockedOld = locked !== undefined && (locked === null || locked.length === 0)
      if (lockedOld) {
        parts = [{ tax_rate_milli: defaultRate, minor: dealMinor }]
      } else if (reason) {
        fallbacks.push({ deal: name, reason })
        console.warn(`[order-tax] deal fallback: "${name}" (${reason}) — the whole deal takes the default rate`)
        parts = [{ tax_rate_milli: defaultRate, minor: dealMinor }]
      } else {
        const shares = allocate(dealMinor, weights)
        const byRate = new Map<string, DealTaxPart>()
        slots.forEach((s, i) => {
          const r = effectiveRate(book, s, defaultRate)
          const k = keyOf(r)
          const cur = byRate.get(k)
          if (cur) cur.minor += shares[i]; else byRate.set(k, { tax_rate_milli: r, minor: shares[i] })
        })
        parts = [...byRate.values()]
      }
    }
    dealStamps.push({ tax_parts: parts })
    for (const p of parts) add(p.tax_rate_milli, p.minor)
  }

  // The discount, spread: the food after it, allocated by each rate's pre-discount total.
  const groups = [...preByRate.values()].sort((a, b) => (a.rate ?? -1) - (b.rate ?? -1))
  let parts: FoodPart[]
  if (groups.length === 0) parts = [{ rate: defaultRate, minor: input.foodMinor }]
  else {
    const shares = allocate(input.foodMinor, groups.map(g => g.minor))
    parts = groups.map((g, i) => ({ rate: g.rate, minor: shares[i] }))
  }
  return { itemStamps, dealStamps, parts, fallbacks }
}

/** The stamps written onto the lines (a copy; a browser-sent `item_id` / `tax_rate_milli` is always overwritten). */
export function stampItems<T extends object>(items: readonly T[], stamps: readonly ItemStamp[]): (T & ItemStamp)[] {
  return items.map((it, i) => ({ ...it, item_id: stamps[i]?.item_id ?? null, tax_rate_milli: stamps[i]?.tax_rate_milli ?? null }))
}
export function stampDeals<T extends object>(deals: readonly T[], stamps: readonly DealStamp[]): (T & DealStamp)[] {
  return deals.map((d, i) => ({ ...d, tax_parts: stamps[i]?.tax_parts ?? [] }))
}

/** A menu row (server or browser) → a book entry. `price` in major units. */
export function taxBookFrom(rows: readonly { id?: unknown; name?: unknown; price?: unknown; tax_rate_milli?: unknown }[] | null | undefined, currency: string | null | undefined): TaxBook {
  const book: TaxBook = {}
  for (const r of rows ?? []) {
    const name = typeof r?.name === 'string' ? r.name : ''
    if (!name) continue
    book[name] = { id: typeof r.id === 'string' ? r.id : null, rate: rateOrNull(r.tax_rate_milli), priceMinor: Math.max(0, toMinorOf(num(r.price), currency)) }
  }
  return book
}

/** True when any dish in the book has its own rate — the only case in which a preview needs the split at all. */
export const bookHasOwnRates = (book: TaxBook): boolean => Object.values(book).some(e => e.rate !== null)
