# Kitchen ticket - leading whitespace for the rail clip

Task: kitchen rails use spring clips that hide roughly 15-25mm from the top of a ticket. Establish how
much blank paper the ticket already gets, then add a bounded, configurable leading feed.

Scope honoured: no `next dev`, no `next build`, no `cap sync`, no deploy, no commit, no package
installed, no database column, no settings control, no environment variable touched. One constant and
one guarded `b.push` added to one file.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

🔴 **THE STANDING CAVEAT FOR THIS WHOLE REPORT: nothing here has been measured. No printer was
connected, no ticket was printed, no ruler was used.** Every millimetre below is arithmetic on top of
a published-default assumption. Byte-level claims are READ from the tree and are certain; millimetre
claims are INFERRED and are not.

---

## PART A - WHAT IS EMITTED TODAY

### A1. `renderTicket`, in full, in emission order

**READ** - [lib/printing/ticket.ts:457-460](lib/printing/ticket.ts#L457-L460). `renderTicket` is a
two-line delegate; all byte emission is in `encodeEscPos`:

```ts
/** The one entry point: order + config (+ type) → ESC/POS bytes for the plugin (Phase B) to send. */
export function renderTicket(order: TicketOrder, config: TicketConfig, type: TicketType = 'combined'): Uint8Array {
  return encodeEscPos(buildTicketLines(order, config, type), config)
}
```

**READ** - `encodeEscPos` as it stood **before** this change,
[lib/printing/ticket.ts:431-455](lib/printing/ticket.ts#L431-L455):

```ts
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
```

**Every byte before the first printed glyph, before the change - READ, exhaustively:**

| Bytes | Command | Moves paper? |
|---|---|---|
| `1B 40` | `ESC @` - initialise | **No** |
| `1B 74 10` | `ESC t 16` - select code page | **No** |
| `1B 61 n` | `ESC a` - alignment (first loop iteration) | No |
| `1B 21`/`1D 21`/`1B 45`/`1D 42` | size, bold, invert | No |

**Five bytes, none of which advance the paper by a single dot.** The very next byte is the first
character of the first line.

### A2. Does anything feed blank lines at the START?

**NOT FOUND.** Stated plainly: before this change, `encodeEscPos` emitted **no feed command of any
kind before the first glyph**. There was exactly one `ESC d` in the entire printing module, and it was
at the bottom - **READ**, `grep -rn "0x64" lib/printing/` returned a single hit:

```
lib/printing/ticket.ts:452:  b.push(ESC, 0x64, 0x04)        // ESC d 4 — feed 4 lines
```

There is also **no line-spacing command anywhere** - **READ**, no `ESC 2` (`1B 32`) and no `ESC 3`
(`1B 33`) is emitted. That matters for A4: we inherit whatever default line height `ESC @` restores on
the specific printer, so line height is a printer property, not ours.

### A3. The END of the ticket - trailing feed and cut

**READ** - [lib/printing/ticket.ts:451-454](lib/printing/ticket.ts#L451-L454):

```ts
  b.push(GS, 0x21, 0x00, ESC, 0x45, 0x00, ESC, 0x61, 0x00, GS, 0x42, 0x00)   // reset size/bold/align/invert
  b.push(ESC, 0x64, 0x04)        // ESC d 4 — feed 4 lines
  b.push(GS, 0x56, 0x01)         // GS V 1  — partial cut
```

**Four lines are fed before the cut.**

🔴 **And that is exactly why it does nothing for the next ticket's leading edge.** The order is
feed-then-cut, so those 4 lines are paper that ends up **below the last printed line of THIS ticket**,
on THIS ticket's side of the cut. They are this ticket's tail. The next ticket begins at the cut edge
with **zero** lines of paper contributed by us.

**INFERRED** - the 4-line trailing feed is almost certainly there to push the last printed line past
the cutter so it is not sliced through, which is standard ESC/POS practice and is why its size roughly
matches the head-to-cutter gap discussed in B1. That is a reason to leave it exactly as it is (C4).

### A4. Converting lines to millimetres - the arithmetic and its provenance

| Quantity | Value | READ or INFERRED |
|---|---|---|
| Paper width | 80mm (also 58mm) | **READ** - `export type PaperWidth = 58 \| 80` |
| Characters per line | 48 at 80mm, 32 at 58mm | **READ** - `colsFor` |
| Print density | 203 dpi = **8 dots/mm** | **INFERRED** - the near-universal thermal POS standard; not in our code |
| Printable width | 576 dots (72mm) at 80mm | **INFERRED** - follows from 48 cols x 12-dot Font A |
| Line height | **30 dots = 3.75mm**, up to **1/6 inch = 4.23mm** | **INFERRED** - printer default; we emit no `ESC 2`/`ESC 3` (that part is READ) |
| Lines per mm | **0.24 - 0.27 lines/mm**, i.e. **~4mm per line** | **INFERRED**, derived from the row above |

**The arithmetic:** at 8 dots/mm, a 30-dot default line spacing is 30 / 8 = **3.75mm**. The other
common default, 1/6 inch, is 25.4 / 6 = **4.23mm**. So one fed line is **3.75-4.23mm**, and I use
**~4mm per line** throughout, always carrying the range rather than a false single figure.

⚠️ `ESC d n` feeds **n lines at the current line spacing**, and `ESC @` immediately before it resets
that spacing to the printer default - so the feed and the ticket body are measured in the same unit.
That is a property of the command set (INFERRED from the ESC/POS spec), not something our code sets.

### A5. What is printed FIRST - i.e. what a clip would hide

**READ** - the first content pushed by `buildCombined` for a normal (non-reprint) ticket,
[lib/printing/ticket.ts:232-246](lib/printing/ticket.ts#L232-L246):

```ts
  const idText = `#${order.id}`
  const collectText = order.collection_time ? `COLLECT ${order.collection_time}` : 'COLLECT ASAP'
  ...
  if (idText.length + collectText.length + 1 <= largeWidth) {
    lines.push({ text: padBetween(idText, collectText, largeWidth), size: 'large', bold: true })
  } else {
    for (const w of wrap(idText, largeWidth)) lines.push({ text: w, size: 'large', bold: true })
    for (const w of wrap(collectText, largeWidth)) lines.push({ text: padBetween('', w, largeWidth), size: 'large' })
  }
```

**The first printed row is `#17            COLLECT 18:45`** - double-width, bold, the order number
hard left and the collection time hard right. Those are precisely the two facts named in the brief,
and they are the literal first thing on the paper. **A clip that covers the top of the ticket covers
them and nothing else of value first.**

Two qualifications, both **READ**:
- On a **reprint**, a boxed inverted banner (`MAY BE A DUPLICATE` / `REPRINT`) is pushed **above** the
  header, [ticket.ts:201-213](lib/printing/ticket.ts#L201-L213) - so on those tickets the clip would
  hide the duplicate warning, which is arguably worse.
- ⚠️ **Double-width rows are also double-HEIGHT** (`GS ! 0x11` = double w+h). So the header row is
  roughly **8mm tall, not 4mm** - a clip does not need to reach far past the blank margin to swallow
  the whole of it.

---

## PART B - THE HEAD-TO-TEAR-BAR GAP

### B1. The automatic gap - 🔴 INFERRED, NOT MEASURED

**INFERRED.** On an 80mm thermal receipt printer the print head sits **upstream of** (below) the
cutter/tear bar, typically **10-15mm** apart. This is a mechanical fact of the class of device, quoted
from general knowledge of Epson TM-series and the common Chinese POS mechanisms; **it varies by model,
we own no printer, and nobody has measured ours.** Treat 10-15mm as a plausible band, not a value.

The consequence: after a cut, the paper's new leading edge is at the cutter, while the first dot the
head can lay down is 10-15mm further back. **So 10-15mm of blank paper appears above the first printed
line automatically, whatever we send.**

### B2. Current total blank space above the first printed line

```
  from our bytes      0.0 mm        (READ - A2: no feed command before the first glyph)
  head-to-cutter gap 10.0 - 15.0 mm (INFERRED - B1)
  --------------------------------
  TOTAL              10.0 - 15.0 mm
```

### B3. Is that enough for a 15-25mm clip?

**No - and I can say that much without hardware, because the ranges barely overlap.** 10-15mm of blank
paper against a clip that hides 15-25mm means that in the *best* case (15mm blank, 15mm clip) the clip
stops exactly at the first printed dot with no tolerance, and in every other combination it eats into
the header. At the pessimistic end (10mm blank, 25mm clip) the clip covers **15mm of printed content**
- the entire double-height `#id COLLECT` row and the customer row under it.

⚠️ **What I cannot tell you without hardware** is *which* end of the 10-15mm band your printer sits at,
and therefore exactly how much is being lost today. The direction is safe to act on; the magnitude is
not. That is why the change below is a small, named, single-integer top-up rather than a generous feed.

---

## PART C - THE CHANGE

### C1/C2. A named constant in the printing module - no column, no setting

Added immediately above `encodeEscPos`, and consumed once inside it.

### C3. The constant, quoted

```ts
const TICKET_LEADING_FEED_LINES = 2
```

| | |
|---|---|
| **Unit** | **LINES** (not dots, not mm) - the operand of `ESC d n`, an integer 0-255 |
| **Value** | **2** |
| **Millimetres** | **7.5 - 8.5mm** (2 x 3.75mm to 2 x 4.23mm) - INFERRED, per A4 |
| **New total above the first line** | 10-15mm automatic + 7.5-8.5mm fed = **17.5 - 23.5mm, mid ~20.5mm** |

That is the ~20mm the brief asked for, and it lands inside the 15-25mm clip band from both ends rather
than overshooting it.

The full comment as committed - **READ**, [lib/printing/ticket.ts:431-449](lib/printing/ticket.ts#L431-L449):

```ts
// ── 🔴 LEADING FEED — BLANK PAPER FOR THE RAIL CLIP ───────────────────────────────────────────────────
// WHY IT EXISTS: kitchen rails use spring clips that grip the top of the ticket and hide roughly 15-25mm
// of paper. The FIRST thing this ticket prints is the double-width `#id  COLLECT hh:mm` row — the two
// facts a cook reads at a glance — so a ticket that starts printing immediately gets its header clipped.
//
// ⚠️ THIS IS NOT THE ONLY BLANK PAPER. The print head sits BELOW the cutter, so after every cut there is
// already a head-to-cutter gap of blank paper above the first printable dot — typically 10-15mm on an
// 80mm thermal printer, but it is MODEL-SPECIFIC AND HAS NOT BEEN MEASURED HERE. This constant is the
// TOP-UP on that gap, not the whole margin. Over-feeding is not free: it wastes paper on every ticket.
//
// THE ARITHMETIC (all of it inferred — no printer was measured):
//   We never emit ESC 2 / ESC 3, so line height is the printer's default that ESC @ restores: 30 dots
//   (3.75mm at 203dpi / 8 dots per mm) to 1/6 inch (4.23mm), depending on model.
//   2 lines  = 7.5-8.5mm  +  a 10-15mm head gap  =  17.5-23.5mm total, i.e. ~20mm.
//
// HOW TO CHANGE IT: this is a count of LINES, not millimetres or dots — one integer, 0-255, sent as
// `ESC d n`. Raise it by 1 to add ~4mm, lower it by 1 to remove ~4mm. Measure a real ticket first (see
// docs/printing-ticket-layout-report.md, Part G). A per-truck setting can come later if rails differ;
// deliberately NOT a database column or a settings control today.
const TICKET_LEADING_FEED_LINES = 2
```

And the emission site - **READ**, [lib/printing/ticket.ts:452-461](lib/printing/ticket.ts#L452-L461):

```ts
export function encodeEscPos(lines: TicketLine[], config: TicketConfig): Uint8Array {
  const width = colsFor(config.paper_width)
  const b: number[] = []
  b.push(ESC, 0x40)              // ESC @  — initialise
  b.push(ESC, 0x74, 0x10)        // ESC t 16 — code page (Phase-B tunable)
  // 🔴 BEFORE THE FIRST GLYPH, AFTER THE INIT. ESC @ resets line spacing, so the feed below is measured
  // in the same line height the ticket body will use. Guarded at 0 so setting the constant to 0 emits
  // NOTHING rather than `ESC d 0` — a printer-dependent no-op we should not rely on.
  if (TICKET_LEADING_FEED_LINES > 0) b.push(ESC, 0x64, TICKET_LEADING_FEED_LINES)   // ESC d n — leading feed
```

**Byte prefix, before and after** (READ, from the source; the ordering was asserted statically without
building):

```
  old:  1B 40   1B 74 10               <first glyph...>
  new:  1B 40   1B 74 10   1B 64 02    <first glyph...>      (+3 bytes per ticket)
```

Emission order asserted programmatically as: `ESC @` -> `ESC t` -> **`ESC d` leading feed** -> line
loop -> `ESC d 4` trailing feed -> `GS V 1` cut. Assertion passed.

### C4. The trailing feed and cut are UNCHANGED

**Confirmed - READ from the diff.** `b.push(ESC, 0x64, 0x04)` and `b.push(GS, 0x56, 0x01)` do not
appear in the diff as either a `-` or a `+` line. Still 4 lines fed, still a partial cut, still in that
order. A top-of-ticket problem was not solved by shortening the bottom.

### C5. Paper cost

- **Per ticket: +7.5 to +8.5mm.**
- **Per 200-ticket service: 1,500 - 1,700mm, i.e. about 1.5 - 1.7 metres of paper.**
- **INFERRED** context: a standard 80mm x 80m roll is 80,000mm, so a 200-ticket service spends roughly
  **2% of one roll** on this margin. Arithmetic: 1,700 / 80,000 = 2.1%.

That is the price of the header being readable while clipped. If the measured ticket shows the gap is
already generous, drop the constant to 1 and halve the cost.

---

## PART D - THE 58mm CASE

### D1. Does the leading feed need to differ between 58mm and 80mm?

**No - and it is confirmed, not assumed.**

**READ** - paper width enters the renderer in exactly one place, and it is a **horizontal**
computation:

```ts
const colsFor = (w: PaperWidth): number => (w === 58 ? 32 : 48)   // chars/line at normal size
```

`config.paper_width` is used only via `colsFor` (character wrapping and divider length). It never
reaches a vertical quantity. **READ** - the feed I added does not reference `config` or `width` at all;
it is a bare constant.

**INFERRED** (spec-level): `ESC d n` feeds n lines at the current **line spacing**, which is a vertical
measurement in dots. Line spacing is unaffected by how wide the paper is. So 2 lines is 7.5-8.5mm on
58mm paper exactly as it is on 80mm paper, and one constant is correct for both.

⚠️ One honest caveat: 58mm mechanisms are still typically 203 dpi, but if a given 58mm printer used a
different default line spacing, its millimetres per line would differ - as would the ticket body's, in
the same proportion. The constant would still be right in *lines*; only the mm conversion would move.

### D2. Nothing changed affects the 58mm layout

**Confirmed.** The diff touches two hunks, both inside the `encodeEscPos` byte-emission region -
**READ**, `git diff -U0` hunk headers:

```
@@ -431 +431,22 @@ function strBytes(s: string): number[] {
@@ -436,0 +458,4 @@ export function encodeEscPos(lines: TicketLine[], config: TicketConfig): Uint8Ar
```

`colsFor`, `wrap`, `wrapIndented`, `padBetween`, `buildTicketLines` and `buildCombined` - everything
that decides 58mm layout - are outside both hunks and are byte-identical.

---

## PART E - BOUNDARIES

### E1. `git diff --stat`, and what belongs to this task

```
 app/trucks/[slug]/order/page.tsx         |  30 +-
 components/dashboard/AddOrderPanel.tsx   |   2 +-
 components/printing/PrintingSettings.tsx |  91 +++-
 docs/customer-quantity-row-report.md     | 404 ++++++++--------
 docs/printing-ble-report.md              | 797 +++++++++++--------------------
 docs/printing-ui-report.md               | 615 +++++++++++-------------
 lib/printing/bleTransport.ts             |  87 +++-
 lib/printing/ticket.ts                   |  27 +-
 lib/printing/transport.ts                |   9 +-
```

🔴 **THIS TASK'S ENTRY IS `lib/printing/ticket.ts` (27 lines) AND NOTHING ELSE.** Every other entry
predates this task and belongs to earlier turns in this session - the BLE transport build
(`bleTransport.ts`, `transport.ts`, `docs/printing-ble-report.md`), the printing UI work
(`PrintingSettings.tsx`, `docs/printing-ui-report.md`), the customer quantity row
(`app/trucks/[slug]/order/page.tsx`, `docs/customer-quantity-row-report.md`) and the Review order
button colour (`AddOrderPanel.tsx`). Proof that `ticket.ts` is new to the working tree this task:
it was **absent** from `git diff --stat` at the start of this task and present after.

**Trigger logic, transport, chunking and pacing: unchanged, verified individually.**

| Concern | File | Result |
|---|---|---|
| Trigger + dedupe | `lib/printing/printWatcher.ts` | **NOT in the diff** |
| Mount + gate | `lib/printing/usePrinting.ts` | **NOT in the diff** |
| Chunking | `bleTransport.ts` `CHUNK = 180` | unchanged (READ, line 84) |
| Pacing | `bleTransport.ts` `CHUNK_GAP_MS = 12` | unchanged (READ, line 89) |

`bleTransport.ts` and `transport.ts` carry earlier turns' diffs, but this task added no hunk to either,
and the two constants that define chunking and pacing read exactly as they did.

### E2. `mapOrderToTicket` is untouched

**Confirmed.** `lib/printing/mapOrderToTicket.ts` does not appear in `git diff --stat` at all. This is a
**rendering change only**: no order field is read differently, no mapping rule moved, the
`TicketOrder` shape is unchanged. The same ticket content is emitted, preceded by blank paper.

### E3. No customer-facing surface is affected

**Confirmed.** `encodeEscPos` produces ESC/POS bytes consumed by the operator's Bluetooth printer.
Its only callers are `renderTicket` (used by `lib/printing/usePrinting.ts`, mounted on the operator
dashboard only) and `app/dev/ticket-preview/page.tsx`, a dev page. No customer route, email, receipt,
SMS or push payload reads any of this. No database write, no Stripe call, no schema change.
Pizzeria Gusto's live money paths and Tikka Tonic's handed-over install are unaffected: the only
behavioural difference is 3 extra bytes at the head of a Bluetooth print job that neither is sending
today unless the device print toggle is on.

---

## PART F - INTEGRITY

### F1/F2. Non-ASCII census of `lib/printing/ticket.ts`, side by side

| | Before | After | Delta |
|---|---|---|---|
| bytes | 30,178 | 32,322 | +2,144 |
| chars | 29,177 | 31,187 | +2,010 |
| lines | 461 | 486 | +25 |
| non-ASCII total | 496 | 562 | +66 |
| **distinct classes** | **14** | **14** | **0** |

Per class:

| Codepoint | Name | Before | After | Delta | Explanation |
|---|---|---|---|---|---|
| U+2500 | BOX DRAWINGS LIGHT HORIZONTAL | 337 | 390 | +53 | the two section rules in the new comment block |
| U+2014 | EM DASH | 62 | 70 | +8 | prose dashes in the new comment |
| U+1F534 | LARGE RED CIRCLE | 29 | 31 | +2 | one on the section heading, one on the emission-site comment |
| U+26A0 | WARNING SIGN | 14 | 15 | +1 | the "not the only blank paper" caveat |
| U+FE0F | VARIATION SELECTOR-16 | 14 | 15 | +1 | pairs with that one warning sign - see F3 |
| U+2192 | RIGHTWARDS ARROW | 9 | 10 | +1 | the updated `encodeEscPos` docstring gained one step in its arrow chain |
| U+00A3, U+21D2, U+2022, U+00A7, U+00D7, U+2026, U+00B7, U+00E9 | (8 classes) | - | - | **0** | untouched |

**No character class was gained and none was lost.** Every delta is an increase in a class the file
already contained, and each is accounted for above.

### F3. Carrier-aware variation-selector check

🔴 Carriers are taken from **what actually precedes each U+FE0F**, never from a Unicode-category
filter - a filter on `category == 'So'` silently misses bases like U+2139 INFORMATION SOURCE, whose
category is `Ll`.

**`lib/printing/ticket.ts`, per base:**

| Base | Before (n / paired / bare) | After (n / paired / bare) |
|---|---|---|
| U+26A0 WARNING SIGN | 14 / 14 / **0** | 15 / 15 / **0** |
| U+1F534 LARGE RED CIRCLE | 29 / 0 / 29 | 31 / 0 / 31 |
| U+2500 BOX DRAWINGS | 337 / 0 / 337 | 390 / 0 / 390 |

Sum of per-base paired = **15** = total U+FE0F count **15**. Every selector has a named carrier; no
orphan, no double-count. The file's pre-existing convention is preserved exactly: **every warning sign
is paired, every red circle is bare** - the glyph I added follows it, so the bare-warning-sign count is
still zero.

**This report, per base:** U+26A0 n=8, paired=8, bare=**0**; U+1F534 n=7, all bare; sum of per-base
paired equals the total U+FE0F count exactly. (Measured in the F5 pass after writing, not predicted.)

### F4. Byte scan of the edited file - byte-level, never grep

Scanned all 32,322 bytes of `lib/printing/ticket.ts` for NUL, every control byte below 0x09, the
0x0B/0x0C pair, 0x0E-0x1F and 0x7F:

```
scanned 32322 bytes; offending=0 -> NONE
CRLF=0 lone CR=0 tabs=0
```

⚠️ Worth stating for this file specifically: the ESC/POS control bytes are **numeric literals in
source** (`0x1B`, `0x0A`), not literal control characters in the file, which is why a byte scan of the
source is clean even though the file's output is full of control codes.

### F5. Byte scan of this report

Run as a **separate pass after writing**; result recorded at the end of this document.

### F6. `git status` / `git diff --stat`

Nothing staged, nothing committed, branch still `main`. The stat is reproduced in E1, with this task's
single entry identified there.

---

## PART G - WHAT YOU MUST MEASURE

⚠️ **Every number in this report is arithmetic, not observation.** The following three measurements
replace the assumptions, and take about a minute with a ruler.

**1. The blank space above the first printed line.** Print one ticket. Let the printer cut it. Take the
NEXT ticket (not the first of the roll - the first one carries whatever slack was loaded by hand) and
measure from the top edge to the top of the `#id COLLECT` row.

- **Expected: 17.5 - 23.5mm.**
- **If it measures ~10-15mm**, the leading feed is not reaching the printer - check the ticket actually
  rendered through `renderTicket` and not a cached job.
- **If it measures over 28mm**, your printer's head-to-cutter gap is larger than assumed. Lower
  `TICKET_LEADING_FEED_LINES` to 1, or 0.

**2. Whether the clip covers any printed content.** Clip the ticket to the rail exactly as a cook
would. Then look at it from where a cook stands.

- **You must be able to read the order number and the collection time with the clip on.** That is the
  entire test.
- Check a **reprint** ticket too - it puts a boxed `MAY BE A DUPLICATE` banner above the header, so it
  is the ticket with the most to lose at the top.

**3. What to change if it does cover content.** Only one number moves:
`TICKET_LEADING_FEED_LINES` in [lib/printing/ticket.ts:449](lib/printing/ticket.ts#L449).

| Symptom | Change | Effect |
|---|---|---|
| Clip covers part of the header | `2` -> `3` | +~4mm, ~24mm total |
| Clip still covers it (deep clip) | `3` -> `4` | +~8mm, ~28mm total |
| Wasteful margin, clip nowhere near the print | `2` -> `1` | -~4mm, ~16mm total |
| Gap already sufficient without us | `2` -> `0` | emits nothing at all (the guard) |

**Measure once, set it once.** ⚠️ Do not adjust the trailing feed (`ESC d 4`) to compensate - it
protects the bottom of the ticket from the cutter, and shortening it slices the last printed line.

---

## Summary

Before this change the ticket emitted **five bytes and no feed** before its first glyph - **READ**, and
certain - so the only blank paper above the double-width `#id COLLECT hh:mm` header was the printer's
own head-to-cutter gap, **INFERRED** at 10-15mm and never measured. The 4-line feed at the bottom is
fed *before* the cut, so it belongs to that ticket's tail and contributes nothing to the next ticket's
leading edge. A 15-25mm rail clip would therefore land on printed content. The fix is one named
constant, `TICKET_LEADING_FEED_LINES = 2`, emitted as `ESC d 2` after the init and before the first
glyph: ~8mm added, ~20mm total, +3 bytes and ~1.6 metres of paper per 200-ticket service. The trailing
feed and cut are untouched, `mapOrderToTicket` is untouched, no customer surface is involved, and the
constant is width-independent so 58mm needs no separate value. **Nothing here has been printed - Part G
is the measurement that turns this arithmetic into fact.**
