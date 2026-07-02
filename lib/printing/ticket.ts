// ── Kitchen ticket renderer (Phase A — pure, hardware-independent, testable now) ──────────────────────
// PURE: given an order + config (+ ticket type), produce (a) a layout model (TicketLine[]) and (b) the
// ESC/POS byte stream. The layout model is SHARED by the on-screen preview and the byte encoder, so the
// preview is a faithful representation of what will print. No DOM, no I/O, no clock — the caller supplies
// any "now"-derived values (minutesUntilDue, printedLabel) so this stays deterministic + unit-testable.
//
// EXTENSIBILITY: buildTicketLines() switches on `type`. Only 'combined' exists today; a 2nd type (e.g.
// 'kitchen' / 'customer') is an ADDITIVE branch here — the encoder + preview are type-agnostic (they only
// consume TicketLine[]), so a new ticket type is never a re-architecture.

export type PaperWidth = 58 | 80
export type TicketType = 'combined'          // extensible: | 'kitchen' | 'customer'

export interface TicketConfig {
  paper_width: PaperWidth
  show_phone?: boolean                        // additive content toggle
}

/** Minimal order shape the renderer needs — decoupled from the app's full Order type (keeps this pure +
 *  testable). The caller maps a real Order → TicketOrder, computing minutesUntilDue in the EVENT timezone. */
export interface TicketOrder {
  id: string                                  // display number ("17"); may be a provisional "A13" offline
  customer_name: string
  customer_phone?: string | null
  collection_time?: string | null             // due time "HH:MM" (event tz); null ⇒ ASAP
  minutesUntilDue?: number | null              // caller-computed; null/undefined ⇒ omit the "(in Nm)" suffix
  items: { name: string; quantity: number; modifiers?: { name: string }[]; specialInstructions?: string }[]
  deals?: { name: string; slots?: Record<string, string> }[] | null
  total: number
  truck_name?: string
  printedLabel?: string                        // e.g. "18:37" — caller-formatted print time
}

/** One rendered line. `divider` draws a full-width rule; `size:'large'` = ESC/POS double width+height. */
export interface TicketLine {
  text?: string
  align?: 'left' | 'center'
  size?: 'normal' | 'large'
  bold?: boolean
  divider?: boolean
}

const colsFor = (w: PaperWidth): number => (w === 58 ? 32 : 48)   // chars/line at normal size

/** Greedy word-wrap to `width` columns; a single over-long word is hard-broken. */
function wrap(text: string, width: number): string[] {
  const out: string[] = []
  for (const rawLine of text.split('\n')) {
    let cur = ''
    for (const word of rawLine.split(/\s+/).filter(Boolean)) {
      if (word.length > width) {                       // hard-break a word longer than the line
        if (cur) { out.push(cur); cur = '' }
        for (let i = 0; i < word.length; i += width) out.push(word.slice(i, i + width))
        continue
      }
      if (!cur) cur = word
      else if (cur.length + 1 + word.length <= width) cur += ' ' + word
      else { out.push(cur); cur = word }
    }
    out.push(cur)                                      // keep blank lines too
  }
  return out.length ? out : ['']
}

/** Left label + right-aligned value on one line, filling `width`. */
function padBetween(left: string, right: string, width: number): string {
  const gap = Math.max(1, width - left.length - right.length)
  return left + ' '.repeat(gap) + right
}

/** Build the layout model. `type` selects the ticket variant (only 'combined' today). */
export function buildTicketLines(order: TicketOrder, config: TicketConfig, type: TicketType = 'combined'): TicketLine[] {
  switch (type) {
    case 'combined':
    default:
      return buildCombined(order, config)
  }
}

function buildCombined(order: TicketOrder, config: TicketConfig): TicketLine[] {
  const width = colsFor(config.paper_width)
  const largeWidth = Math.max(1, Math.floor(width / 2))   // double-width chars ⇒ half the chars/line
  const lines: TicketLine[] = []

  // Header — big, centred, scannable.
  for (const w of wrap(`ORDER #${order.id}`, largeWidth)) lines.push({ text: w, align: 'center', size: 'large', bold: true })
  const dueBase = order.collection_time ? `DUE ${order.collection_time}` : 'DUE ASAP'
  const dueSuffix = order.minutesUntilDue != null ? ` (in ${order.minutesUntilDue}m)` : ''
  for (const w of wrap(dueBase + dueSuffix, largeWidth)) lines.push({ text: w, align: 'center', size: 'large' })

  // Customer.
  for (const w of wrap(order.customer_name || 'Walk-up', width)) lines.push({ text: w, align: 'center' })
  if (config.show_phone && order.customer_phone) lines.push({ text: order.customer_phone, align: 'center' })

  lines.push({ divider: true })

  // Items — qty + name, modifiers + notes indented. This is the kitchen priority.
  for (const it of order.items || []) {
    for (const w of wrap(`${it.quantity}x ${it.name}`, width)) lines.push({ text: w })
    for (const m of it.modifiers ?? []) for (const w of wrap(`  + ${m.name}`, width)) lines.push({ text: w })
    if (it.specialInstructions) for (const w of wrap(`  (${it.specialInstructions})`, width)) lines.push({ text: w })
  }
  // Deals — name + slot fills.
  for (const d of order.deals ?? []) {
    for (const w of wrap(`* ${d.name}`, width)) lines.push({ text: w })
    for (const fill of Object.values(d.slots ?? {})) for (const w of wrap(`  - ${fill}`, width)) lines.push({ text: w })
  }

  lines.push({ divider: true })

  lines.push({ text: padBetween('TOTAL', `£${order.total.toFixed(2)}`, width), bold: true })

  if (order.truck_name) lines.push({ text: order.truck_name, align: 'center' })
  if (order.printedLabel) lines.push({ text: `printed ${order.printedLabel}`, align: 'center' })

  return lines
}

// ── ESC/POS byte encoding ─────────────────────────────────────────────────────────────────────────────
const ESC = 0x1B, GS = 0x1D, LF = 0x0A

/** Encode a string to printer bytes: ASCII direct, £ → 0xA3 (Latin-1), other non-ASCII → '?'. The exact code
 *  page is printer-specific and is tuned in Phase B against the real Epson/Star; the preview is unaffected. */
function strBytes(s: string): number[] {
  const out: number[] = []
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0x3F
    if (c >= 0x20 && c <= 0x7E) out.push(c)
    else if (ch === '£') out.push(0xA3)
    else out.push(0x3F)
  }
  return out
}

/** ESC/POS bytes for a set of lines. Init → code page → per-line align/size/bold + text + LF → feed + cut. */
export function encodeEscPos(lines: TicketLine[], config: TicketConfig): Uint8Array {
  const width = colsFor(config.paper_width)
  const b: number[] = []
  b.push(ESC, 0x40)              // ESC @  — initialise
  b.push(ESC, 0x74, 0x10)        // ESC t 16 — code page (Phase-B tunable)

  for (const line of lines) {
    if (line.divider) {
      b.push(ESC, 0x61, 0x00, GS, 0x21, 0x00, ESC, 0x45, 0x00)   // left, normal, bold off
      b.push(...strBytes('-'.repeat(width)), LF)
      continue
    }
    b.push(ESC, 0x61, line.align === 'center' ? 0x01 : 0x00)      // ESC a  — align
    b.push(GS, 0x21, line.size === 'large' ? 0x11 : 0x00)         // GS !   — size (0x11 = double w+h)
    b.push(ESC, 0x45, line.bold ? 0x01 : 0x00)                    // ESC E  — bold
    b.push(...strBytes(line.text ?? ''), LF)
  }

  b.push(GS, 0x21, 0x00, ESC, 0x45, 0x00, ESC, 0x61, 0x00)        // reset size/bold/align
  b.push(ESC, 0x64, 0x04)        // ESC d 4 — feed 4 lines
  b.push(GS, 0x56, 0x01)         // GS V 1  — partial cut
  return new Uint8Array(b)
}

/** The one entry point: order + config (+ type) → ESC/POS bytes for the plugin (Phase B) to send. */
export function renderTicket(order: TicketOrder, config: TicketConfig, type: TicketType = 'combined'): Uint8Array {
  return encodeEscPos(buildTicketLines(order, config, type), config)
}
