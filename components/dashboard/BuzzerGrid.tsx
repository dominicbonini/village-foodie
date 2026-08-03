'use client'
// ── THE BUZZER GRID — ONE COMPONENT, THREE CALLERS ───────────────────────────────────────────────
// The dashboard order card, the KDS order card and the Add Order panel all open THIS component. There
// is no second grid and there must not be: the available/taken rule, the two confirms and the
// colour-plus-label contract below are the whole feature's correctness surface, and a copy would drift.
//
// ── COLOUR IS NEVER THE ONLY CHANNEL ─────────────────────────────────────────────────────────────
// 🔴 A taken cell shows the NUMBER AND THE ORDER ("7" over "#12"). That label is REQUIRED, not
// decorative, and BOTH halves must stay.
// Roughly 8% of men have red-green colour deficiency, and this grid is read at speed, outdoors, by
// someone holding a pager in one hand. Green-vs-red alone would carry the entire state for a sighted-
// as-designed operator and nothing at all for a deuteranopic one. The text is the primary channel;
// the colour reinforces it. Do not "clean up" the label to just the number.
//
// ── WHERE THE COLOURS COME FROM ──────────────────────────────────────────────────────────────────
// The green and red families are the ones getHeaderStyle already uses on the order card header
// (components/dashboard/helpers.ts:148-158): 'ready' is bg-green-50 + border-t-green-500, 'late' is
// bg-red-50 + border-t-red-500. Same two families, so the grid reads as part of the same board.
// ⚠️ NOT from lib/slot-indicator.ts. That file calls itself "SINGLE SOURCE OF TRUTH for the slot
// traffic-light" and has NO live caller — buildSlotIndicators in lib/slot-display.ts is what actually
// runs. Taking colours from a dead module would look authoritative and be wrong.

import { useState } from 'react'
import { buildBuzzerMap, type BuzzerHolder } from '@/lib/buzzer'

interface GridOrder {
  order_key: string
  id: string
  customer_name: string
  status?: string | null
  event_id?: string | null
  buzzer_number?: number | null
}

/** A pending confirm — the grid has been tapped but nothing has been written yet.
 *  ONE variant, deliberately: taking a buzzer off another order is the only action here that affects
 *  a customer who is not the one being served. Switching this order between buzzers used to have a
 *  'replace' variant and does not any more — see the note in `choose`. */
type Pending = { kind: 'take'; number: number; holder: BuzzerHolder }

export function BuzzerGrid({
  open,
  buzzerCount,
  orders,
  eventId,
  targetOrderKey,
  targetOrderId,
  currentNumber,
  blocking = false,
  onAssign,
  onClose,
  saving = false,
}: {
  open: boolean
  /** 1..N from the van. The caller must not render this at all when null. */
  buzzerCount: number
  /** Every order the caller knows about; the grid filters to `eventId` + in-use itself. */
  orders: GridOrder[]
  eventId: string | null
  /** The order being assigned. Empty string for an Add Order selection made before the row exists. */
  targetOrderKey: string
  /** Display number for the copy ("#12"). '' ⇒ the confirms say "this order". */
  targetOrderId: string
  /** The number THIS target holds — saved on the card path, and on the add-order path the PENDING
   *  form selection for an order row that does not exist yet. Both render as taken (see the cell
   *  loop): the grid must never show a number as free when the operator has already picked it. */
  currentNumber: number | null
  /**
   * BLOCKING MODE — the after-order prompt.
   * 🔴 No backdrop dismiss and no ✕. A mis-tap on the backdrop during a rush is the exact failure this
   * prevents: the operator hands over a pager and the board has no record of which one. The only ways
   * out are picking a number or pressing "No buzzer", both of which are ACTIVE choices.
   * ⚠️ The escape is labelled "No buzzer", never "Skip". No skip affordance exists anywhere in this
   * app, and "skip" frames a completed decision as something left unfinished.
   */
  blocking?: boolean
  /**
   * number | null (null = deselect / "No buzzer"). The caller performs the write.
   * `keepOpen` tells the caller NOT to close the grid after this change — see `openedWithBuzzer`.
   * The grid owns that decision because it owns the session: the caller only knows about one tap.
   */
  onAssign: (buzzerNumber: number | null, keepOpen: boolean) => void
  onClose: () => void
  saving?: boolean
}) {
  const [pending, setPending] = useState<Pending | null>(null)
  // ── 🔴 CAPTURED ONCE, AT OPEN — NOT DERIVED FROM THE LIVE currentNumber. ─────────────────────────
  // "Did this order already have a buzzer when the grid opened?" It decides two things together, and
  // they must agree or the modal behaves differently from how it looks:
  //   • whether a change keeps the grid OPEN (passed back through onAssign's `keepOpen`), and
  //   • whether the Done button is rendered at all.
  // Reading live currentNumber instead would make Done VANISH the moment the operator deselects —
  // exactly when they still need a way out — and would flip the close behaviour mid-session. Captured
  // state keeps one rule for the whole time the modal is up: opened with a buzzer ⇒ stays open until
  // Done; opened without ⇒ the first pick assigns and closes, as before.
  // Safe as a mount-time capture because both call sites conditionally RENDER the grid
  // (`{buzzerTarget && …}` / `{showBuzzerPicker && …}`), so every open is a fresh mount.
  const [openedWithBuzzer] = useState(currentNumber != null)

  if (!open) return null

  const taken = buildBuzzerMap(orders, eventId)
  const numbers = Array.from({ length: buzzerCount }, (_, i) => i + 1)
  // ── 🔴 "ALL OUT" IS A FACT ABOUT THE EVENT, NOT ABOUT WHO IS LOOKING. ────────────────────────────
  // This used to filter `h.order_key !== targetOrderKey`, the same bug class as the cell colours: a
  // rack could be genuinely full while the banner stayed hidden, purely because the order that opened
  // the grid was holding one of the buzzers. Whether every buzzer is out does not change depending on
  // which card you tapped. Counts every held buzzer, including the current order's own.
  // currentNumber counts too. On the card path it is already in `taken` (the target IS its holder), so
  // this is a no-op there; on the ADD-ORDER path there is no order row yet, so a pending selection
  // exists ONLY in currentNumber — and a rack whose last free buzzer is pending is not free.
  const heldCount = numbers.filter(n => taken.has(n) || n === currentNumber).length
  const allTaken = heldCount === buzzerCount

  const orderLabel = targetOrderId ? `order #${targetOrderId}` : 'this order'

  const choose = (n: number) => {
    if (saving) return
    const holder = taken.get(n)
    // ── DESELECT — tapping the buzzer this order ALREADY holds gives it back. ────────────────────
    // 🔴 IMMEDIATE AND UNCONFIRMED, DELIBERATELY. This is the quick action, and it is why it beats
    // hunting for the "No buzzer" button once a number is set: the operator taps the lit cell and the
    // pager is back on the rack. A confirm here would make giving a buzzer back slower than giving one
    // out, which is backwards — and it is trivially reversible (tap the same cell again).
    // It used to call onAssign(n) with the SAME number: a real POST, a real UPDATE and a toast reading
    // "Buzzer 6 assigned" for something that had not changed.
    // ⚠️ This does NOT touch the post-order prompt's "No buzzer" button. There no number is set yet,
    // so there is nothing to deselect and that button is the only active way to say "none" — it stays.
    if (n === currentNumber) { onAssign(null, openedWithBuzzer); return }
    // ── THE ONLY CONFIRM IN THIS GRID ────────────────────────────────────────────────────────────
    // The chosen buzzer is with a DIFFERENT order. Names both orders and the customer, because taking
    // it means walking up to someone who is holding a pager that is about to stop being theirs. That
    // is the one buzzer action with a consequence outside this order, so it is the one that asks.
    if (holder && holder.order_key !== targetOrderKey) { setPending({ kind: 'take', number: n, holder }); return }
    // ── 🔴 SWITCHING THIS ORDER FROM ONE BUZZER TO ANOTHER IS IMMEDIATE. NO CONFIRM. ─────────────
    // There used to be a second dialog here — "Order #12 has buzzer 4. Give them buzzer 8 instead?" —
    // fired whenever currentNumber was set. It was wrong twice over:
    //   • Nothing is taken from anyone. The operator is correcting THEIR OWN order, deliberately, and
    //     asking them to confirm their own correction is friction with no one on the other side of it.
    //   • On the add-order screen there is no order row yet, so targetOrderId is '' and the copy
    //     rendered as "Order #— has buzzer 4" — a dialog naming an order that has no number.
    // Deleted, not disabled. The take confirm above is the only remaining dialog.
    onAssign(n, openedWithBuzzer)
  }

  // ── The take confirm. A POPUP, not an inline row: it is read and tapped one-handed while holding a
  //    pager, so the targets are full-width buttons at py-3.5, not a cramped confirm strip. It names
  //    every number, both orders and the customer — an operator must never have to remember which
  //    buzzer they were about to take, or from whom.
  const confirmModal = pending && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5 flex flex-col gap-4">
        <p className="text-base text-slate-900">
          Buzzer <strong>{pending.number}</strong> is with <strong>order #{pending.holder.id}</strong>
          {pending.holder.customer_name ? ` (${pending.holder.customer_name})` : ''}.
          {' '}Take it for <strong>{orderLabel}</strong>?
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setPending(null)}
            className="flex-1 border border-slate-200 text-slate-600 py-3.5 rounded-xl text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { const n = pending.number; setPending(null); onAssign(n, openedWithBuzzer) }}
            className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-3.5 rounded-xl text-sm font-bold"
          >
            {`Take buzzer ${pending.number}`}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        // Backdrop dismiss exists ONLY outside blocking mode. See the `blocking` prop note.
        onClick={blocking ? undefined : (e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="absolute inset-0 bg-black/50 pointer-events-none" />
        <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h3 className="text-lg font-black text-slate-900">
                {blocking ? `Buzzer for order #${targetOrderId || '—'}?` : 'Choose a buzzer'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {targetOrderId ? `Order #${targetOrderId}` : 'This order'}
                {currentNumber != null ? ` · currently buzzer ${currentNumber}` : ''}
              </p>
            </div>
            {/* No ✕ in blocking mode — "No buzzer" below is the only exit, and it is an active choice. */}
            {!blocking && (
              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold w-8 h-8 flex items-center justify-center"
              >
                ✕
              </button>
            )}
          </div>

          {/* Every buzzer is out. STATED, never enforced: taking one back from another order is a
              legitimate move (that customer may have already been served), so the grid stays live. */}
          {allTaken && (
            <p className="mx-5 mb-3 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              All {buzzerCount} buzzers are out. Tap one to take it from another order.
            </p>
          )}

          {/* pb-5 when the grid is the LAST block in the modal, matching the pt-5 header; pb-4 when a
              footer button follows it. */}
          <div className={`px-5 grid grid-cols-4 gap-2 ${blocking || openedWithBuzzer ? 'pb-4' : 'pb-5'}`}>
            {numbers.map(n => {
              const holder = taken.get(n)
              // ── 🔴 APPEARANCE DEPENDS ON THE BUZZER, NEVER ON WHO IS LOOKING. ────────────────────
              // `isTaken` is `!!holder` and nothing else. It used to carry
              // `&& holder.order_key !== targetOrderKey`, which made the SAME buzzer in the SAME state
              // render two different ways: green-with-a-ring when the order holding it had opened the
              // grid, red when any other order had. An operator cannot learn a colour that means
              // different things depending on which card they tapped.
              // It also silently dropped the `#id` sub-label on that one cell, because the label is
              // gated on this flag — so the cell lost the non-colour channel exactly where the colour
              // was wrong too. Both are fixed by the same removal.
              // ⚠️ Do NOT reintroduce a "this one is yours" ring, border, badge or highlight. Which
              // buzzer belongs to this order is carried by the SUB-LABEL ("This order"), in the same
              // text channel every other cell uses — not by a second visual treatment.
              // The PROMPTS are still context-dependent, and correctly so — see `choose` above, which
              // is the only place `targetOrderKey` and `currentNumber` may branch.
              // ── A PENDING (UNSAVED) SELECTION IS TAKEN TOO. ──────────────────────────────────────
              // `currentNumber` is the number THIS target holds — saved on the card path, still just a
              // form choice on the add-order path, where no order row exists yet so `taken` cannot
              // know about it. Both are "in use" as far as the operator is concerned, and the grid must
              // not tell them buzzer 3 is free when they picked it thirty seconds ago.
              // ⚠️ NOT a third state. Identical red, identical styling — the only difference is the
              // wording of the sub-label below.
              const isOurs = n === currentNumber
              const isTaken = !!holder || isOurs
              // ⚠️ `isOurs` is checked FIRST. On the card path the current order IS the holder, so
              // without this order the cell would print the target's own display number back at them
              // ("#12") when what they need to know is "this one is already yours".
              const subLabel = isOurs ? 'This order' : holder ? `#${holder.id}` : ''
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => choose(n)}
                  disabled={saving}
                  className={[
                    // ── 🔴 FIXED HEIGHT — EVERY CELL, SUB-LABEL OR NOT. ───────────────────────────
                    // h-14 (56px) fits the number + a sub-label line with room to spare, and is well
                    // clear of the 44px touch minimum. Without it, a row containing one taken cell was
                    // taller than a row of free ones and the grid stepped.
                    'h-14 rounded-xl border-2 px-1 flex flex-col items-center justify-center leading-none transition-colors active:scale-95 disabled:opacity-50',
                    // Colour families from getHeaderStyle (helpers.ts:148-158): 'late' red, 'ready' green.
                    isTaken ? 'bg-red-50 border-red-500 text-red-900' : 'bg-green-50 border-green-500 text-green-900',
                  ].join(' ')}
                >
                  <span className="text-lg font-black">{n}</span>
                  {/* 🔴 REQUIRED, NOT DECORATIVE — the non-colour channel. See the header note.
                      ⚠️ ALWAYS RENDERED, even when empty (a non-breaking space). The sub-label line is
                      what would otherwise push the number upward on a taken cell and downward on a free
                      one, so the digits would not sit on a common baseline across the grid. Reserving
                      the line unconditionally is what keeps them aligned. */}
                  <span className="text-[10px] font-bold truncate max-w-full mt-0.5">
                    {subLabel || ' '}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ── "No buzzer" — THE POST-ORDER PROMPT ONLY. ────────────────────────────────────────
              🔴 GATED ON `blocking`, NOT DELETED, BECAUSE IT IS ONE BUTTON SERVING TWO SURFACES.
              In the prompt this is the ONLY exit — no backdrop dismiss, no ✕ — and it is the active
              choice that says "this customer got no pager". It must stay.
              Everywhere else it used to double as "clear the buzzer I already set", and that job is
              gone: deselecting is now tapping the held (red) cell, which is quicker and sits on the
              thing it acts on. A second way to do it at the bottom of the modal was the slower,
              less-discoverable duplicate.
              ⚠️ In blocking mode `currentNumber` is always null (the prompt only fires for an order
              with no buzzer), which is why the label no longer needs a "(clear)" variant. */}
          {blocking ? (
            <div className="px-5 pb-5 flex gap-3">
              <button
                type="button"
                onClick={() => onAssign(null, openedWithBuzzer)}
                disabled={saving}
                className="flex-1 min-h-[44px] border border-slate-300 text-slate-700 py-3.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                No buzzer
              </button>
            </div>
          ) : openedWithBuzzer ? (
            /* ── DONE — the exit for a grid that is staying open on purpose. ──────────────────────
               When the order already had a buzzer, a change no longer closes the modal: the operator
               can switch, look at the board, change their mind again, and only then confirm they are
               finished. That needs an explicit end, and this is it. It occupies the slot the old
               "No buzzer (clear)" button used to have (deselecting is now tapping the held cell).
               🔴 min-h-[44px] on top of py-3.5 (14+14 padding + 20px line = 48px) — this is pressed
               mid-service on an iPad, and the floor must survive any future text or font change.
               SLATE, the codebase's COMPLETION colour (DARK_SOLID, lib/ui-tokens.ts:42-43 — "Done,
               Mark paid & done"), not orange: orange is reserved for the money/affirmative action in
               the take confirm, and this closes a dialog rather than committing anything.
               ⚠️ The ✕ in the header is untouched and still closes without it. */
            <div className="px-5 pb-5 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 min-h-[44px] bg-slate-800 hover:bg-slate-900 text-white py-3.5 rounded-xl text-sm font-bold"
              >
                Done
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {confirmModal}
    </>
  )
}
