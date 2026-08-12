// ── Kitchen ticket renderer (Phase A — pure, hardware-independent, testable now) ──────────────────────
// PURE: given an order + config (+ ticket type), produce (a) a layout model (TicketLine[]) and (b) the
// ESC/POS byte stream. The layout model is SHARED by the on-screen preview and the byte encoder, so the
// preview is a faithful representation of what will print. No DOM, no I/O, no clock — the caller supplies
// any "now"-derived values (printedLabel) so this stays deterministic + unit-testable.
//
// EXTENSIBILITY: buildTicketLines() switches on `type`. Only 'combined' exists today; a 2nd type (e.g.
// 'kitchen' / 'customer') is an ADDITIVE branch here — the encoder + preview are type-agnostic (they only
// consume TicketLine[]), so a new ticket type is never a re-architecture.

// ── 🔴 THE CONTENT SPEC, AND WHY IT DIVERGES FROM §8's COOK VIEW (V11.4) ─────────────────────────────
// §8 records that the KDS COOK view deliberately STRIPS prices and deal labels: a restaurant kitchen has a
// front/back split, the cook does not handle money, and price on a cook ticket is noise.
//
// 🔴 THAT CONVENTION IS RIGHT FOR A RESTAURANT AND WRONG HERE, AND THE DIVERGENCE IS DELIBERATE.
// A food truck is two or three people with NO front/back split — the person cooking is the person handing
// over and taking payment. This ticket is a WHOLE-ORDER ARTIFACT, not a cook artifact: it is what the
// operator holds while they hand the food over. So it follows the ORDERS TAB treatment, not the cook view.
// It carries prices, deals, the order total and payment state, all of which the cook view removes.
//
// ⚠️ DO NOT "align this with §8" in a later tidy. The two surfaces answer different questions and the
// difference is the point: the cook view answers "what do I make", this answers "what is this order".
//
// WHAT IS DELIBERATELY EXCLUDED — TIMING-TO-START ONLY:
// prep countdowns, urgency colouring, age-based state, "start by" times, the TO MAKE bar. A ticket prints
// AHEAD of the due time and is then a static piece of paper; a countdown printed on it is wrong within a
// minute and cannot self-correct. ⚠️ The COLLECTION TIME is NOT timing-to-start and stays — it is the
// handover fact, not a cooking instruction.
//
// 🔴 ALLERGENS ARE NOT PRINTED, AND THAT IS A DECISION, NOT AN OMISSION.
// `menu_items_db.allergens` is per-dish CUSTOMER REFERENCE data, not per-order kitchen data — the cook
// knows their own recipes, just as a ticket does not list ingredients. What IS order-specific is the
// customer's own typed note, and that is carried below, untruncated and boxed. Do not add allergens here.
export type PaperWidth = 58 | 80
export type TicketType = 'combined'          // extensible: | 'kitchen' | 'customer'

export interface TicketConfig {
  paper_width: PaperWidth
  show_phone?: boolean                        // additive content toggle
}

/** Minimal order shape the renderer needs — decoupled from the app's full Order type (keeps this pure +
 *  testable). The caller maps a real Order → TicketOrder; see lib/printing/mapOrderToTicket.ts. */
/** Why this ticket might not be the only copy.
 *  'possible_duplicate' — an earlier attempt ended with an UNKNOWN outcome, so paper may already exist.
 *  'reprint'            — a deliberate re-print of a ticket known to have printed.
 *  ⚠️ There is NO reason for a retry after a clean 'failed': nothing came out, so that ticket is the
 *  FIRST one and must carry no marker at all. A banner on every retry would train the kitchen to ignore
 *  the banner, which is the only thing making the duplicate-over-missing trade survivable. */
export type ReprintReason = 'possible_duplicate' | 'reprint'

/** 🔴 AN INPUT, NEVER INFERRED. This module has no attempt history and must not acquire one — the
 *  renderer stays pure. usePrintWatcher supplies `mayDuplicate`; the mapper turns it into this. */
export interface TicketReprint { reason: ReprintReason; attempt?: number }

export interface TicketOrder {
  id: string                                  // display number ("17"); may be a provisional "A13" offline
  customer_name: string
  customer_phone?: string | null
  collection_time?: string | null             // collection time "HH:MM" (event tz); null ⇒ ASAP
  // 🔴 `minutesUntilDue` WAS HERE AND WAS REMOVED. It fed a "(in 5m)" countdown on the due line. A
  // countdown is timing-to-START — deliberately not this ticket's job — and it is STALE THE MOMENT IT
  // PRINTS: paper cannot be updated, so "in 5m" is wrong five minutes later and misleading ten minutes
  // later. The field is gone rather than merely unread, because an unused input on this type is exactly
  // how the countdown would come back. Print the absolute collection time; it is true forever.
  /** 🔴 The handover key when buzzers are in use. Null/undefined ⇒ no buzzer assigned AT PRINT TIME —
   *  see the staleness note in docs/printing-report.md. The line is omitted entirely rather than printed
   *  blank: an empty buzzer field on paper reads as "buzzer 0" or as a printer fault. */
  buzzer_number?: number | null
  /** Item prices — the Orders tab shows them, so the ticket does. `unit_price` × quantity, matching
   *  OrderCard's own `£{(line.unit_price * line.quantity).toFixed(2)}`. */
  items: {
    name: string
    quantity: number
    unit_price?: number | null
    modifiers?: { name: string; price?: number | null }[]
    specialInstructions?: string
  }[]
  /** 🔴 SLOT MODIFIERS AND SLOT NOTES ARE CARRIED, NOT DROPPED. A real `Order.deals[]` carries
   *  `slotModifiers` and `slotNotes` keyed by the SAME slot key as `slots`, and this type had nowhere to
   *  put them — so a deal slot carrying "no peanuts" lost that note on the way to paper. That is
   *  allergy-adjacent, and paper has no scroll to recover it. All three are keyed alike so a fill, its
   *  modifiers and its note render together under the slot they belong to. */
  deals?: {
    name: string
    price?: number | null
    slots?: Record<string, string>
    slotModifiers?: Record<string, { name: string; price?: number | null }[]>
    slotNotes?: Record<string, string>
  }[] | null
  /** 🔴 ORDER-LEVEL NOTES — the allergy carrier. Printed UNTRUNCATED and boxed; see buildCombined. */
  notes?: string | null
  total: number
  /** ── PAYMENT (D) ────────────────────────────────────────────────────────────────────────────────
   *  🔴 RESOLVED BY THE CALLER, NEVER RE-DERIVED HERE. `showPaidStep` comes from resolvePaidStep()
   *  (lib/payments/paid-step.ts — the single resolver, this is its ninth consumer) and the balance from
   *  getOrderBalance() (lib/payments/ledger.ts). This module does no payment arithmetic and reads none of
   *  trucks.show_paid_step / trucks.takes_cash / truck_events.show_paid_step_override.
   *  ⚠️ `showPaidStep: false` ⇒ NO PAYMENT LINE AT ALL — not "unpaid". A truck that does not use the paid
   *  step has no concept of an unpaid order at handover, and printing one would invent a state it does
   *  not have. Pizzeria Gusto is exactly this truck. */
  showPaidStep?: boolean
  paymentStatus?: 'unpaid' | 'paid' | 'part_paid' | 'refunded' | 'refund_due' | 'failed'
  /** 🔴 A LIVE, UNCAPTURED CARD AUTHORISATION. Resolved by lib/payments/held-authorisation.ts and passed
   *  in — never derived here. NOT a payment status: the order is genuinely `unpaid` and no money has
   *  moved. It says only that the money is HELD and must not be collected at the hatch. */
  heldAuthorisation?: boolean
  /** Outstanding balance in MINOR units, as getOrderBalance returns it. Only read when part_paid/unpaid. */
  balanceMinor?: number
  truck_name?: string
  /** Caller-formatted print stamp. 🔴 DATE **AND** TIME, e.g. "6 Aug 18:40" — a ticket found on a
   *  counter may be from a previous service, and a bare "18:40" cannot say which day it belongs to.
   *  The renderer prints what it is given and cannot add a date it does not have, so this contract is
   *  the guarantee. */
  printedLabel?: string
  /** Undefined/null ⇒ a first ticket ⇒ no banner. See TicketReprint. */
  reprint?: TicketReprint | null
}

/** One rendered line. `divider` draws a full-width rule; `size:'large'` = ESC/POS double width+height. */
export interface TicketLine {
  text?: string
  align?: 'left' | 'center'
  size?: 'normal' | 'large'
  bold?: boolean
  divider?: boolean
  /** ESC/POS reverse video (white-on-black). 🔴 The ONLY emphasis a thermal printer has beyond size and
   *  bold — there is no colour. Reserved for the order-notes block, where allergy information lives. */
  invert?: boolean
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

/** Wrap `text` and prefix EVERY resulting line with `indent`.
 *  🔴 REQUIRED because `wrap()` splits on /\s+/ and rejoins with single spaces, so leading whitespace
 *  baked into the input is silently discarded. Modifiers and item instructions are sub-lines of the item
 *  above them and MUST stay visually indented — without this, an unpriced modifier ("+ dip") sat flush
 *  left while a priced one kept its indent via padBetween, so the same concept rendered two ways on one
 *  ticket. Wrap to the REDUCED width so the indent cannot push a line over the paper width. */
function wrapIndented(text: string, width: number, indent = '  '): string[] {
  return wrap(text, Math.max(1, width - indent.length)).map(w => indent + w)
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

  // ── 🔴 THE REPRINT BANNER — ABOVE EVERYTHING, BOXED AND INVERTED ────────────────────────────────
  // WHY IT EXISTS: the print pipeline deliberately prefers a duplicate ticket to a missing one, because a
  // duplicate is visible on the rail and a missing ticket is invisible until the customer asks. That trade
  // is only survivable if the cook can tell a duplicate IS one — otherwise two identical tickets for #17
  // read as two orders and one gets made twice.
  //
  // WHY HERE AND WHY THIS TREATMENT:
  //   • FIRST, above ORDER #. A cook reads down and may start moving before reaching the bottom of the
  //     ticket, so a footer marker would be read after the decision it is meant to inform.
  //   • INVERTED + boxed by rules — the same "this is not a menu item" vocabulary the allergy NOTE block
  //     uses, which is already established on this paper as *stop and read*. One idiom, not two.
  //   • DOUBLE-WIDTH headline so it is legible at arm's length on the pass; the instruction line stays
  //     normal size so it fits 58mm without wrapping into noise.
  //   • Wrapped to `largeWidth`, so it cannot overflow at 58mm (16 cols large / 32 normal).
  if (order.reprint) {
    const headline = order.reprint.reason === 'possible_duplicate' ? 'MAY BE A DUPLICATE' : 'REPRINT'
    const detail = order.reprint.reason === 'possible_duplicate'
      ? 'Check the rail before making'
      : 'Reprint of an earlier ticket'
    lines.push({ divider: true })
    for (const w of wrap(headline, largeWidth)) lines.push({ text: w, align: 'center', size: 'large', bold: true, invert: true })
    for (const w of wrap(detail, width)) lines.push({ text: w, align: 'center', invert: true })
    if (order.reprint.attempt != null && order.reprint.attempt > 1) {
      lines.push({ text: `attempt ${order.reprint.attempt}`, align: 'center', invert: true })
    }
    lines.push({ divider: true })
  }

  // ── HEADER — #id LEFT, COLLECT time RIGHT, both double-width, ON ONE ROW WHEN THEY FIT ───────────
  // 🔴 NO COUNTDOWN. A relative "(in 5m)" is timing-to-START, which this ticket deliberately does not
  // carry, and it is STALE THE MOMENT IT PRINTS — a ticket produced at 18:40 reading "in 5m" is simply
  // wrong by 18:50, and paper cannot be updated. The absolute collection time is true forever.
  //
  // 🔴 THE FIT TEST IS LOAD-BEARING, NOT DEFENSIVE DRESSING. padBetween never truncates — it uses
  // `Math.max(1, …)` for the gap — so an over-long pair OVERRUNS the line and the printer wraps it
  // wherever it likes. And `size` is emitted once per line (GS ! before the text), so a single row
  // CANNOT mix double and normal width: "drop the time to normal size on the same row" is not
  // expressible in this model at all.
  //   80mm: 24 double-width cols. "#17" + "COLLECT 18:45" = 17 → fits (and so does "#A123").
  //   58mm: 16 double-width cols. "#17" + "COLLECT 18:45" = 17 → DOES NOT FIT. It stacks.
  // ⚠️ Testing the FIT rather than the paper width means a long id ("#A13" offline, "#123" on a busy
  // day) degrades to stacking at 80mm too, instead of overflowing at exactly the moment the board is
  // busiest. That is why this is a measurement, not an `if (paper_width === 58)`.
  // ⚠️ REJECTED: dropping "COLLECT" to fit "#17  18:45" at double width on 58mm. That puts TWO BARE
  // NUMBERS side by side — the same failure the BUZZER label exists to prevent.
  const idText = `#${order.id}`
  const collectText = order.collection_time ? `COLLECT ${order.collection_time}` : 'COLLECT ASAP'
  // 🔴 ONE RIGHT MARGIN FOR THE WHOLE HEADER, COMPUTED THE SAME WAY EVERY TIME. The id anchors LEFT and
  // every handover fact (collect time, buzzer) anchors RIGHT — on one row when they fit, stacked when they
  // do not. Right alignment is padBetween('', text, largeWidth) in all three places rather than an
  // `align: 'right'` flag, so the edge is produced by the SAME arithmetic and cannot land differently.
  // ⚠️ The stacked branch used to CENTRE both lines. Centring them while the buzzer below was right-aligned
  // would have put three header elements on three different margins, so the stacked case moved to the same
  // rule. That is a wider change than "right-align BUZZER" and is called out in the report.
  if (idText.length + collectText.length + 1 <= largeWidth) {
    lines.push({ text: padBetween(idText, collectText, largeWidth), size: 'large', bold: true })
  } else {
    for (const w of wrap(idText, largeWidth)) lines.push({ text: w, size: 'large', bold: true })
    for (const w of wrap(collectText, largeWidth)) lines.push({ text: padBetween('', w, largeWidth), size: 'large' })
  }

  // 🔴 BUZZER — the handover key, so it gets the same double-width treatment as the order number.
  // Omitted ENTIRELY when unassigned: a blank buzzer field on paper reads as "buzzer 0" or a fault.
  if (order.buzzer_number != null) {
    // 🔴 RIGHT-ALIGNED to the SAME edge as the collect time, by the same padBetween call. It was centred,
    // which put it on neither the left nor the right margin and made the header read as three unrelated
    // elements. The word BUZZER stays — see the wording note.
    for (const w of wrap(`BUZZER ${order.buzzer_number}`, largeWidth)) {
      lines.push({ text: padBetween('', w, largeWidth), size: 'large', bold: true })
    }
  }

  // ── CUSTOMER — name LEFT, phone RIGHT, one row. Same justification as the header above it.
  // ⚠️ NO SEPARATOR GLYPH. "Jamie · 07700 900123" would print as "Jamie ? 07700 900123": strBytes maps
  // everything outside 0x20-0x7E (except £) to '?'. Left/right justification needs no glyph at all, which
  // removes the failure mode rather than picking a safer character.
  //
  // 🔴 WHEN THEY DO NOT FIT, WRAP — NEVER TRUNCATE, AND NEVER SPLIT THE NUMBER.
  // A truncated phone number is worse than no phone number: it still LOOKS like one, so it gets dialled.
  // A wrapped name loses nothing. And the fallback puts the phone on its OWN line rather than wrapping
  // the combined string, because "07700 900123" contains a space — a greedy wrap would happily break it
  // across two lines, which is the same wrong-number failure by another route.
  const custName = order.customer_name || 'Walk-up'
  const custPhone = config.show_phone && order.customer_phone ? order.customer_phone : ''
  if (custPhone && custName.length + custPhone.length + 1 <= width) {
    lines.push({ text: padBetween(custName, custPhone, width) })
  } else {
    for (const w of wrap(custName, width)) lines.push({ text: w })
    if (custPhone) lines.push({ text: padBetween('', custPhone, width) })
  }

  lines.push({ divider: true })

  // ── 🔴 A CUSTOMER INSTRUCTION ON A DISH — ONE TREATMENT, TWO CALL SITES ─────────────────────────
  // An item's `specialInstructions` and a deal slot's `slotNotes` entry are THE SAME CLASS OF DATA: text
  // the customer typed about one dish. They were both plain parenthesised text while the ORDER-level note
  // got rules + a heading + inversion — so "no peanuts" typed against a dish was the quietest thing on the
  // ticket and "no peanuts" typed in the order box was the loudest. A cook had to know which box the
  // customer happened to use in order to compensate. That is a safety gap, not a styling inconsistency.
  //
  // 🔴 INVERTED TEXT, NOT A BOXED BLOCK. Both treatments were rendered before choosing (see the report).
  // A full boxed block per item note turns a four-item order into a mostly-black ticket, at which point
  // nothing stands out and the ORDER note stops being the loudest thing — the emphasis defeats itself.
  // Inversion alone is the strongest mark ESC/POS has, so an item note is unmissable; the order note keeps
  // THREE marks (rules + heading + inversion) and therefore keeps the top of the hierarchy.
  //
  // ⚠️ ONE FUNCTION, CALLED FROM BOTH PLACES, so the two can never drift apart again.
  // ⚠️ The leading indent inverts too (GS B applies to spaces), which prints as a solid left-edge block —
  // that is the intended marker, not an artefact.
  const dishNote = (note: string, indent: string): TicketLine[] =>
    wrapIndented(`! ${note.trim()}`, width, indent).map(w => ({ text: w, invert: true }))

  // ── 🔴 ONE BLOCK PER TOP-LEVEL LINE, JOINED BY A BLANK LINE ─────────────────────────────────────
  // Item lines used to run together, so a modifier of item 2 and the name of item 3 sat on adjacent lines
  // with nothing to say which belonged to which. Building each order line as a BLOCK and joining the
  // blocks makes the grouping structural: a modifier, an item note or a deal slot fill CANNOT be separated
  // from its parent, because the separator is only ever emitted BETWEEN blocks. No leading or trailing
  // blank — the section dividers already bound the list.
  const blocks: TicketLine[][] = []

  // ITEMS — qty + name LEFT, line price RIGHT; modifiers and the item's own note indented beneath it.
  // Prices are present because this follows the ORDERS TAB, not the cook view (see the header note).
  for (const it of order.items || []) {
    const b: TicketLine[] = []
    const label = `${it.quantity}x ${it.name}`
    const lineTotal = it.unit_price != null ? `£${(it.unit_price * it.quantity).toFixed(2)}` : ''
    // Only pad onto one line when both halves fit; otherwise wrap the name and put the price on its own
    // right-aligned line, so a long dish name never collides with its price.
    if (lineTotal && label.length + lineTotal.length + 1 <= width) {
      b.push({ text: padBetween(label, lineTotal, width) })
    } else {
      for (const w of wrap(label, width)) b.push({ text: w })
      if (lineTotal) b.push({ text: padBetween('', lineTotal, width) })
    }
    for (const m of it.modifiers ?? []) {
      const mLabel = `  + ${m.name}`
      const mPrice = m.price != null && m.price > 0 ? `+£${m.price.toFixed(2)}` : ''
      if (mPrice && mLabel.length + mPrice.length + 1 <= width) b.push({ text: padBetween(mLabel, mPrice, width) })
      else for (const w of wrapIndented(`+ ${m.name}`, width)) b.push({ text: w })
    }
    if (it.specialInstructions && it.specialInstructions.trim()) b.push(...dishNote(it.specialInstructions, '  '))
    blocks.push(b)
  }

  // ── DEALS — name + price, slot fills beneath. Present for the same reason prices are.
  for (const d of order.deals ?? []) {
    const b: TicketLine[] = []
    const dLabel = `* ${d.name}`
    const dPrice = d.price != null ? `£${Number(d.price).toFixed(2)}` : ''
    if (dPrice && dLabel.length + dPrice.length + 1 <= width) b.push({ text: padBetween(dLabel, dPrice, width) })
    else for (const w of wrap(dLabel, width)) b.push({ text: w })
    // 🔴 ENTRIES, NOT VALUES. The slot KEY is what ties a fill to its modifiers and its note; iterating
    // values threw the key away, which is how "no peanuts" on a deal slot used to vanish.
    // Layout deliberately mirrors the ITEM block above — fill at one indent, its modifiers as `+` and its
    // note one indent deeper — so a deal slot and a line item read the same way.
    for (const [slotKey, fill] of Object.entries(d.slots ?? {})) {
      for (const w of wrapIndented(`- ${fill}`, width)) b.push({ text: w })
      for (const m of d.slotModifiers?.[slotKey] ?? []) {
        const mLabel = `    + ${m.name}`
        const mPrice = m.price != null && m.price > 0 ? `+£${m.price.toFixed(2)}` : ''
        if (mPrice && mLabel.length + mPrice.length + 1 <= width) b.push({ text: padBetween(mLabel, mPrice, width) })
        else for (const w of wrapIndented(`+ ${m.name}`, width, '    ')) b.push({ text: w })
      }
      // 🔴 SAME CLASS, SAME TREATMENT — a customer instruction on a dish inside a deal is not a lesser
      // instruction than one on a line item. Same function, deeper indent.
      const slotNote = d.slotNotes?.[slotKey]
      if (slotNote && slotNote.trim()) b.push(...dishNote(slotNote, '    '))
    }
    blocks.push(b)
  }

  blocks.forEach((b, i) => { if (i > 0) lines.push({ text: '' }); lines.push(...b) })

  lines.push({ divider: true })

  lines.push({ text: padBetween('TOTAL', `£${order.total.toFixed(2)}`, width), bold: true })

  // ── PAYMENT (D) — the caller has already resolved this. See the TicketOrder note.
  // 🔴 ABSENT when showPaidStep is false. Not "unpaid" — a truck without the paid step has no such state.
  if (order.showPaidStep && order.paymentStatus) {
    const bal = order.balanceMinor ?? 0
    const money = (minor: number) => `£${(minor / 100).toFixed(2)}`
    if (order.paymentStatus === 'paid') lines.push({ text: padBetween('PAYMENT', 'PAID', width), bold: true })
    // 🔴 HELD BEATS 'unpaid', AND ONLY 'unpaid'. `TO PAY £6.00` on a ticket whose card is already
    // authorised is a printed instruction to collect money that is held — the exact double-payment path
    // this change closes. It cannot mask a real balance: a captured order is 'paid' and takes the branch
    // above, and the resolver excludes captured intents.
    // ⚠️ THE WORD "PAID" IS ABSENT. Nothing has been charged; the kitchen must not read it as settled.
    else if (order.heldAuthorisation) lines.push({ text: padBetween('CARD HELD', 'DO NOT COLLECT', width), bold: true })
    else if (order.paymentStatus === 'part_paid') lines.push({ text: padBetween('TO PAY', money(bal), width), bold: true })
    else if (order.paymentStatus === 'unpaid') lines.push({ text: padBetween('TO PAY', money(bal), width), bold: true })
    else lines.push({ text: padBetween('PAYMENT', order.paymentStatus.replace('_', ' ').toUpperCase(), width), bold: true })
  }

  // ── 🔴 ORDER NOTES — THE ALLERGY CARRIER. UNTRUNCATED AND VISUALLY LOUDEST THING ON THE TICKET.
  // The KDS shows notes as an always-visible block precisely because allergy information must never be
  // hidden. A thermal printer has NO COLOUR, so this uses the three emphases it does have, together:
  //   1. a full-width RULE above and below, boxing it off from the items;
  //   2. INVERTED (white-on-black) text — the strongest mark ESC/POS offers;
  //   3. a "NOTE" heading so it cannot be mistaken for an item line.
  // ⚠️ NEVER TRUNCATE AND NEVER ELLIPSISE. `wrap()` is unbounded by design — a note is wrapped across as
  // many lines as it needs. A clipped allergy note is the failure this block exists to prevent, and paper
  // is the one medium with no scroll to recover it.
  if (order.notes && order.notes.trim()) {
    lines.push({ divider: true })
    lines.push({ text: 'NOTE', bold: true, invert: true })
    for (const w of wrap(order.notes.trim(), width)) lines.push({ text: w, invert: true })
    lines.push({ divider: true })
  }

  if (order.truck_name) lines.push({ text: order.truck_name, align: 'center' })
  if (order.printedLabel) lines.push({ text: `printed ${order.printedLabel}`, align: 'center' })

  return lines
}

// ── ESC/POS byte encoding ─────────────────────────────────────────────────────────────────────────────
const ESC = 0x1B, GS = 0x1D, LF = 0x0A

/** Encode a string to printer bytes: ASCII direct, £ → 0xA3 (Latin-1), other non-ASCII → '?'. The exact code
 *  page is printer-specific and is tuned in Phase B against the real Epson/Star; the preview is unaffected. */
/** 🔴 THE CHARACTER RULE, AS TEXT — exported so the PREVIEW can show what will REALLY print.
 *  The on-screen preview renders a browser string; the printer renders this. Without it, "José" previews
 *  perfectly and prints "Jos?", and nobody finds out until there is hardware. Anything outside printable
 *  ASCII becomes '?', except '£' which the printer has at 0xA3.
 *  ⚠️ strBytes() is DERIVED from this, so there is exactly one rule and the preview cannot drift from the
 *  byte stream. Do not re-implement this mapping anywhere. */
export function printableText(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0x3F
    if (c >= 0x20 && c <= 0x7E) out += ch
    else if (ch === '£') out += '£'
    else out += '?'
  }
  return out
}

function strBytes(s: string): number[] {
  const out: number[] = []
  for (const ch of printableText(s)) out.push(ch === '£' ? 0xA3 : (ch.codePointAt(0) ?? 0x3F))
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
      b.push(ESC, 0x61, 0x00, GS, 0x21, 0x00, ESC, 0x45, 0x00, GS, 0x42, 0x00)   // left, normal, bold off, invert off
      b.push(...strBytes('-'.repeat(width)), LF)
      continue
    }
    b.push(ESC, 0x61, line.align === 'center' ? 0x01 : 0x00)      // ESC a  — align
    b.push(GS, 0x21, line.size === 'large' ? 0x11 : 0x00)         // GS !   — size (0x11 = double w+h)
    b.push(ESC, 0x45, line.bold ? 0x01 : 0x00)                    // ESC E  — bold
    b.push(GS, 0x42, line.invert ? 0x01 : 0x00)                   // GS B   — reverse video (white on black)
    b.push(...strBytes(line.text ?? ''), LF)
  }

  b.push(GS, 0x21, 0x00, ESC, 0x45, 0x00, ESC, 0x61, 0x00, GS, 0x42, 0x00)   // reset size/bold/align/invert
  b.push(ESC, 0x64, 0x04)        // ESC d 4 — feed 4 lines
  b.push(GS, 0x56, 0x01)         // GS V 1  — partial cut
  return new Uint8Array(b)
}

/** The one entry point: order + config (+ type) → ESC/POS bytes for the plugin (Phase B) to send. */
export function renderTicket(order: TicketOrder, config: TicketConfig, type: TicketType = 'combined'): Uint8Array {
  return encodeEscPos(buildTicketLines(order, config, type), config)
}
