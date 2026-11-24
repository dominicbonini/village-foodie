// lib/line-notes.ts — france-notes-1 (24 November 2026, docs/france-notes-1-report.md): THE LINE NOTES LIVE OUTSIDE THE ORDER LINES.
//
// A dish's note (`items[].specialInstructions`) and a deal's slot notes (`deals[].slotNotes`) are free text a customer types — where
// allergy requests land. They used to sit inside the order's `items` / `deals`, so the 12-month retention had to REWRITE those columns to
// blank them. Now every new order and draft keeps them in `orders.line_notes` / `order_drafts.line_notes`, and retention blanks that
// column alone: the lines (names, quantities, prices, modifiers, tax stamps) are never rewritten.
//
// PURE AND CLIENT-SAFE. Two directions, and every caller uses one of them:
//   splitLineNotes(items, deals)              at the WRITE boundary (an insert or update of orders / order_drafts): the lines without
//                                             the two fields, and `line_notes` (null when no line had either field).
//   mergeLineNotes(items, deals, line_notes)  at the READ boundary: the lines exactly as they were before the split — the same keys, in
//   withLineNotes(row)                        the same order, with the same values ('' included) — so every screen, email, ticket, CSV
//                                             and API answer is byte-identical. No `line_notes` (every order before this, and any order the
//                                             deployed code writes) → the lines as stored, notes inside them, as today.
//
// THE SHAPE (v1). Each line is tied to its note by its `cartKey` when it carries one, else by its POSITION ("#0", "#1" …); a cartKey seen
// twice falls back to the position for the second. The merge puts the field back where the stored order would have had it: a jsonb column
// returns every object with its keys in jsonb's order (shortest first, then byte order), so for a line read from the database that is the
// field's jsonb place; `at` (its place among the line's keys when it was split) is used for a line in any other order:
//   { "v": 1,
//     "items": { "#0": { "at": 4, "note": "No onions" }, "#2": { "at": 4, "note": "" } },
//     "deals": { "#0": { "at": 5, "slotNotes": { "main": "no peanuts" } } } }
// Only lines that HAD the field get an entry (an absent field stays absent; an empty one comes back empty).

export interface LineNoteEntry { at: number; note: unknown }
export interface DealNoteEntry { at: number; slotNotes: unknown }
export interface LineNotes { v: 1; items?: Record<string, LineNoteEntry>; deals?: Record<string, DealNoteEntry> }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
/** A line HAS the field when it carries a value for it — a key set to `undefined` is dropped by JSON and never reaches the column. */
const has = (l: unknown, field: string): l is Obj => isObj(l) && Object.prototype.hasOwnProperty.call(l, field) && l[field] !== undefined

/** Each line's key: its cartKey when it has one (and it is not already taken), else its position. */
function keysOf(lines: unknown[]): string[] {
  const seen = new Set<string>()
  return lines.map((l, i) => {
    const ck = isObj(l) && typeof l.cartKey === 'string' && l.cartKey ? `k:${l.cartKey}` : null
    const k = ck && !seen.has(ck) ? ck : `#${i}`
    seen.add(k)
    return k
  })
}

/** The keys of a line AS IT IS STORED: a key whose value is `undefined` is dropped by JSON, so it never reaches the column. */
const storedKeys = (obj: Obj) => Object.keys(obj).filter(k => obj[k] !== undefined)
/** `obj` without `field`. */
function without(obj: Obj, field: string): Obj {
  const out: Obj = {}
  for (const [k, v] of Object.entries(obj)) if (k !== field) out[k] = v
  return out
}
/** Postgres jsonb's own key order: shorter keys first, then byte order (UTF-8). A jsonb column hands every object back in it. */
const utf8 = (s: string) => Array.from(new TextEncoder().encode(s))
function jsonbBefore(a: string, b: string): boolean {
  if (a.length !== b.length) return utf8(a).length < utf8(b).length
  const x = utf8(a), y = utf8(b)
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] < y[i]
  return x.length < y.length
}
const inJsonbOrder = (keys: string[]) => keys.every((k, i) => i === 0 || jsonbBefore(keys[i - 1], k))
/** `obj` with `field: value` put back where it was. A line READ FROM THE DATABASE has its keys in jsonb's order — and an order stored with
 *  its notes inside came back with the note field in that order too — so the field goes where jsonb puts it. A line whose keys are in any
 *  other order (built in memory, or a test's database that keeps insertion order) gets it back at `at`, its place when it was split. */
function withAt(obj: Obj, field: string, value: unknown, at: number): Obj {
  const entries = Object.entries(obj).filter(([k, v]) => k !== field && v !== undefined)
  const keys = entries.map(([k]) => k)
  let i: number
  if (keys.length > 1 && inJsonbOrder(keys)) { i = keys.findIndex(k => jsonbBefore(field, k)); if (i < 0) i = keys.length }
  else i = Math.max(0, Math.min(Number.isInteger(at) ? at : entries.length, entries.length))
  entries.splice(i, 0, [field, value])
  return Object.fromEntries(entries)
}

export function isLineNotes(v: unknown): v is LineNotes {
  return isObj(v) && v.v === 1
}

/** The write boundary: the lines without their notes, and the notes on their own (null when no line had a note field). */
export function splitLineNotes<I, D>(items: I, deals: D): { items: I; deals: D; line_notes: LineNotes | null } {
  const ln: LineNotes = { v: 1 }
  let outItems: unknown = items, outDeals: unknown = deals
  if (Array.isArray(items) && items.some(l => has(l, 'specialInstructions'))) {
    const keys = keysOf(items)
    const rec: Record<string, LineNoteEntry> = {}
    outItems = items.map((l, i) => {
      if (!has(l, 'specialInstructions')) return l
      rec[keys[i]] = { at: storedKeys(l).indexOf('specialInstructions'), note: l.specialInstructions }
      return without(l, 'specialInstructions')
    })
    ln.items = rec
  }
  if (Array.isArray(deals) && deals.some(d => has(d, 'slotNotes'))) {
    const keys = keysOf(deals)
    const rec: Record<string, DealNoteEntry> = {}
    outDeals = deals.map((d, i) => {
      if (!has(d, 'slotNotes')) return d
      rec[keys[i]] = { at: storedKeys(d).indexOf('slotNotes'), slotNotes: d.slotNotes }
      return without(d, 'slotNotes')
    })
    ln.deals = rec
  }
  return { items: outItems as I, deals: outDeals as D, line_notes: ln.items || ln.deals ? ln : null }
}

/** The read boundary: the lines with their notes back exactly where they were. No (or an unreadable) `line_notes` → as stored. */
export function mergeLineNotes<I, D>(items: I, deals: D, lineNotes: unknown): { items: I; deals: D } {
  if (!isLineNotes(lineNotes)) return { items, deals }
  let outItems: unknown = items, outDeals: unknown = deals
  const ir = isObj(lineNotes.items) ? lineNotes.items : null
  if (ir && Array.isArray(items)) {
    const keys = keysOf(items)
    outItems = items.map((l, i) => {
      const e = ir[keys[i]]
      return e && isObj(l) ? withAt(l, 'specialInstructions', e.note, e.at) : l
    })
  }
  const dr = isObj(lineNotes.deals) ? lineNotes.deals : null
  if (dr && Array.isArray(deals)) {
    const keys = keysOf(deals)
    outDeals = deals.map((d, i) => {
      const e = dr[keys[i]]
      return e && isObj(d) ? withAt(d, 'slotNotes', e.slotNotes, e.at) : d
    })
  }
  return { items: outItems as I, deals: outDeals as D }
}

/** A stored row as every reader expects it: its lines merged, and no `line_notes` key (so an API answer is byte-identical). */
export function withLineNotes<R>(row: R): R {
  if (!isObj(row) || !('line_notes' in row)) return row
  const { line_notes, ...rest } = row as Obj
  if (!('items' in rest) && !('deals' in rest)) return rest as R
  const m = mergeLineNotes(rest.items, rest.deals, line_notes)
  const out: Obj = {}
  for (const [k, v] of Object.entries(rest)) out[k] = k === 'items' ? m.items : k === 'deals' ? m.deals : v
  return out as R
}

/** Retention: `line_notes` with every note blanked ('' / {}), and whether anything changed. Never the lines. */
export function blankLineNotes(lineNotes: unknown): { value: unknown; changed: boolean } {
  if (!isLineNotes(lineNotes)) return { value: lineNotes, changed: false }
  let changed = false
  const items = isObj(lineNotes.items) ? Object.fromEntries(Object.entries(lineNotes.items).map(([k, e]) => {
    if (isObj(e) && !(e.note == null || e.note === '')) { changed = true; return [k, { ...e, note: '' }] }
    return [k, e]
  })) : lineNotes.items
  const deals = isObj(lineNotes.deals) ? Object.fromEntries(Object.entries(lineNotes.deals).map(([k, e]) => {
    const n = isObj(e) ? e.slotNotes : undefined
    if (isObj(n) && Object.values(n).some(x => !(x == null || x === ''))) { changed = true; return [k, { ...(e as unknown as Obj), slotNotes: {} }] }
    return [k, e]
  })) : lineNotes.deals
  return { value: changed ? { ...lineNotes, ...(items !== undefined ? { items } : {}), ...(deals !== undefined ? { deals } : {}) } : lineNotes, changed }
}

/** An INSERT payload with its lines split: `items` / `deals` without their notes, and `line_notes` — named ONLY when a line had a note
 *  field, so the payload of an order with none is exactly what it was. */
export function withSplitNotes<R extends Record<string, unknown>>(row: R): R {
  if (!('items' in row) && !('deals' in row)) return row
  const s = splitLineNotes(row.items, row.deals)
  if (!s.line_notes) return row
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[k] = k === 'items' ? s.items : k === 'deals' ? s.deals : v
  out.line_notes = s.line_notes
  return out as R
}
