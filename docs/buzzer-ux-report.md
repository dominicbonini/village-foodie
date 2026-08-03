# Buzzer grid — confirm removal + stay-open Done

**Date:** 2026-08-03 · `tsc --noEmit` clean · `BuzzerGrid.tsx` lints clean.
Nothing run beyond `tsc` and `eslint`. No `next dev`, no `next build`.

---

## 0. Prompt integrity

Nothing arrived garbled. Both items were unambiguous, and both diagnoses matched what you saw on screen.

One instruction needed a judgement call I want on the record rather than buried: *"'Done' appears only
when the order already has a buzzer **at the time the grid is open**"*. I read "at the time the grid is
open" as **at open**, captured once — not "currently has one, re-evaluated every render". §2.2 explains
why the alternative reading breaks, and what you would see instead if you disagree.

---

## 1. THE TWO CONFIRMS — before and after

### 1.1 Trigger conditions as they were

Both lived in `choose()`, evaluated top to bottom after the deselect branch:

```ts
const choose = (n: number) => {
  if (saving) return
  const holder = taken.get(n)
  if (n === currentNumber) { onAssign(null); return }                                              // deselect
  // CONFIRM 2 — the chosen buzzer is with someone else. Names BOTH orders and the customer.
  if (holder && holder.order_key !== targetOrderKey) { setPending({ kind: 'take', number: n, holder }); return }
  // CONFIRM 1 — the target already has a different buzzer. Names BOTH numbers.
  if (currentNumber != null) { setPending({ kind: 'replace', number: n, currentNumber }); return }
  onAssign(n)
}
```

| | Trigger | Copy | Verdict |
|---|---|---|---|
| **`take`** | `holder && holder.order_key !== targetOrderKey` — the tapped number is held by a **different** order | *"Buzzer 7 is with order #15 (Sarah). Take it for order #12?"* | **KEPT, unchanged** |
| **`replace`** | `currentNumber != null` — reached only after the two branches above fell through, i.e. the tapped number is **free** and this order **already holds a different one** | *"Order #12 has buzzer 4. Give them buzzer 8 instead?"* | **REMOVED** |

### 1.2 What was removed

**The `replace` confirm, deleted — not disabled, not hidden.** Four sites:

1. The branch itself, `choose()` — [BuzzerGrid.tsx:130-142](components/dashboard/BuzzerGrid.tsx#L130-L142) now falls straight through to `onAssign(n, openedWithBuzzer)`.
2. The `Pending` union — [:35-39](components/dashboard/BuzzerGrid.tsx#L35-L39) collapsed from two variants to one:
   ```ts
   type Pending = { kind: 'take'; number: number; holder: BuzzerHolder }
   ```
3. The modal's `pending.kind === 'replace' ? … : …` ternary — [:138-142](components/dashboard/BuzzerGrid.tsx#L138-L142) is now the take copy unconditionally.
4. The affirmative button's label ternary — [:171](components/dashboard/BuzzerGrid.tsx#L171) is now always `Take buzzer {n}`.

Your point (a) is fixed as a side effect: `Order #{targetOrderId || '—'}` was the **only** place the
em-dash fallback rendered, and it went with the branch. `targetOrderId` still feeds the header and the
take confirm, both of which only run where a real order number exists.

Point (b) is recorded at the deletion site — moving *this* order between buzzers takes nothing from
anyone, so there is no second party for the dialog to protect and it was pure friction.

### 1.3 What remains

Exactly one dialog in the grid, unchanged in trigger, copy and styling:

```tsx
Buzzer <strong>{pending.number}</strong> is with <strong>order #{pending.holder.id}</strong>
{pending.holder.customer_name ? ` (${pending.holder.customer_name})` : ''}.
{' '}Take it for <strong>{orderLabel}</strong>?
```

⚠️ Net effect on the add-order screen: with a pending selection of 4, tapping a **free** buzzer 8 now
switches immediately. Tapping a buzzer held by a **real** order still asks. That is the intended split.

---

## 2. "DONE" AND THE STAY-OPEN SESSION

### 2.1 The behaviour now

| Grid opened with | Tap a free buzzer | Tap a buzzer held by another order | Tap the held (red) cell |
|---|---|---|---|
| **no buzzer** | assign → **closes** | take confirm → assign → **closes** | n/a |
| **a buzzer** | switch → **stays open** | take confirm → switch → **stays open** | deselect → **stays open** |

Closing, when the grid stays open: the **Done** button, or the ✕ (untouched).

### 2.2 The mechanism, and why it is captured at open

[BuzzerGrid.tsx:84-98](components/dashboard/BuzzerGrid.tsx#L84-L98):

```ts
const [openedWithBuzzer] = useState(currentNumber != null)
```

One flag drives **both** the close behaviour and Done's visibility, so the modal cannot behave
differently from how it looks. `onAssign` gained a second argument that carries it back to the caller:

```ts
onAssign: (buzzerNumber: number | null, keepOpen: boolean) => void
```

The grid owns this decision because it owns the **session**; a caller only ever sees one tap.

**⚠️ Why not read live `currentNumber` instead** — the reading I did not take. Under it, Done would
**vanish the instant the operator deselects**, which is exactly the moment they still need a way out,
and the close behaviour would flip mid-session: deselect (stays open, per your spec) then tap a fresh
buzzer, and `currentNumber` is null again, so that tap would be treated as a "first selection" and slam
the grid shut. Captured state keeps one rule for the whole time the modal is up. If you would rather
Done disappear on deselect, it is a one-word change (`openedWithBuzzer` → `currentNumber != null`) and I
will make it — but the close rule should move with it or the two will disagree.

Mount-time capture is safe because both call sites conditionally **render** the grid
(`{buzzerTarget && …}`, `{showBuzzerPicker && …}`), so every open is a fresh mount.

### 2.3 The button

[BuzzerGrid.tsx:301-322](components/dashboard/BuzzerGrid.tsx#L301-L322). It occupies the exact slot the
removed "No buzzer (clear)" button had — same `px-5 pb-5 flex gap-3` wrapper, same `flex-1` fill.

```tsx
<button type="button" onClick={onClose}
  className="flex-1 min-h-[44px] bg-slate-800 hover:bg-slate-900 text-white py-3.5 rounded-xl text-sm font-bold">
  Done
</button>
```

- **Height: 48px** — `py-3.5` (14+14) + 20px `text-sm` line — with `min-h-[44px]` as an explicit floor so no future copy or font change can take it under the target. Pressed mid-service on an iPad.
- **Colour: slate.** `bg-slate-800` is the codebase's COMPLETION colour (`DARK_SOLID`, [lib/ui-tokens.ts:42-43](lib/ui-tokens.ts#L42-L43) — *"Completion — Done, Mark paid & done"*). Not orange: orange is the affirmative in the take confirm, and Done commits nothing — it closes a dialog. This introduces no new colour and touches no cell colour.
- Grid padding follows the footer: `pb-4` when a footer button exists, `pb-5` when the grid is the last block ([:220](components/dashboard/BuzzerGrid.tsx#L220)).

### 2.4 🔴 The grid visibly updating — the part that needed a parent fix

Staying open is useless if the cells do not move, and they would not have. `currentNumber` was
`buzzerTarget.buzzer_number` — and `buzzerTarget` is the `Order` object **snapshotted when the chip was
tapped**. It never refreshes. Switching 4→8 would have left the grid frozen: cell 4 still red and
labelled "This order", cell 8 red but labelled with the holder's `#id` rather than "This order".

Fixed by re-reading from the live `orders` list on every render, at both card call sites:

```tsx
currentNumber={(orders.find(o=>o.order_key===buzzerTarget.order_key)?.buzzer_number??buzzerTarget.buzzer_number)??null}
```

Same source the grid's `taken` map is built from, so the two cannot disagree. After `fetchAll`, the
newly held cell turns red with **"This order"** and the previously held one turns green, in place.
`buzzerTarget` is still the identity handle (`order_key`, `id`) — those do not change.

The add-order picker needed nothing: `manualBuzzer` is local state and updates synchronously.

⚠️ **One thing to watch on screen.** On the card path the flip is not instantaneous — it lands when
`fetchAll()` returns. During the write the cells are `disabled` and dimmed (`saving`), so it reads as a
brief in-flight state rather than a stall, but on a slow connection it will be perceptible. Item 5 of the
verification list below.

### 2.5 Every call site touched

| File | Line | Change |
|---|---|---|
| [components/dashboard/BuzzerGrid.tsx](components/dashboard/BuzzerGrid.tsx) | [78-83](components/dashboard/BuzzerGrid.tsx#L78-L83) | `onAssign` signature gains `keepOpen` |
| | [84-98](components/dashboard/BuzzerGrid.tsx#L84-L98) | `openedWithBuzzer` captured at mount |
| | [129](components/dashboard/BuzzerGrid.tsx#L129), [143](components/dashboard/BuzzerGrid.tsx#L143), [169](components/dashboard/BuzzerGrid.tsx#L169), [294](components/dashboard/BuzzerGrid.tsx#L294) | all four `onAssign` calls pass it |
| | [220](components/dashboard/BuzzerGrid.tsx#L220) | grid bottom padding follows the footer |
| | [280-322](components/dashboard/BuzzerGrid.tsx#L280-L322) | footer becomes `blocking ? "No buzzer" : openedWithBuzzer ? "Done" : null` |
| [components/dashboard/AddOrderPanel.tsx](components/dashboard/AddOrderPanel.tsx) | [1800](components/dashboard/AddOrderPanel.tsx#L1800) | picker: `if (!keepOpen) setShowBuzzerPicker(false)` |
| [app/dashboard/[token]/page.tsx](app/dashboard/[token]/page.tsx) | [1275-1281](app/dashboard/[token]/page.tsx#L1275-L1281) | `saveBuzzer(…, keepOpen = false)`; `prior` read from live `orders` |
| | [1292-1295](app/dashboard/[token]/page.tsx#L1292-L1295) | toast uses `prior`; `if(!keepOpen) setBuzzerTarget(null)` |
| | [3615-3621](app/dashboard/[token]/page.tsx#L3615-L3621) | live `currentNumber`; `onAssign` forwards `keepOpen` |
| [app/dashboard/[token]/kds/page.tsx](app/dashboard/[token]/kds/page.tsx) | [456-461](app/dashboard/[token]/kds/page.tsx#L456-L461) | same signature + `prior` |
| | [466-471](app/dashboard/[token]/kds/page.tsx#L466-L471) | same toast + conditional close |
| | [480](app/dashboard/[token]/kds/page.tsx#L480) | `useCallback` deps: `buzzerTarget` → `orders` |
| | [1143-1148](app/dashboard/[token]/kds/page.tsx#L1143-L1148) | live `currentNumber`; `onAssign` forwards `keepOpen` |

⚠️ **Two consequential details inside those edits**, both caused by the grid outliving a write:

- **`prior` moved off `buzzerTarget` and onto the live `orders` list** on both surfaces. The "Buzzer N removed" toast read `buzzerTarget?.buzzer_number`, which is the same stale snapshot — after one switch it would have named the *original* number, not the one just given back.
- **The KDS `useCallback` dependency changed from `buzzerTarget` to `orders`.** It now closes over `orders` and no longer over `buzzerTarget`. Miss this and `prior` freezes at the value from the first render after mount.

### 2.6 The post-order prompt — untouched, and confirmed

**It still has its "No buzzer" button.** [BuzzerGrid.tsx:280-300](components/dashboard/BuzzerGrid.tsx#L280-L300)
gates it on `blocking`, and [AddOrderPanel.tsx:1810](components/dashboard/AddOrderPanel.tsx#L1810) passes
`blocking`. Its `onAssign` handler at [:1821](components/dashboard/AddOrderPanel.tsx#L1821) was not
edited: it takes one argument, ignores `keepOpen`, and always closes + resolves.

That is correct by construction rather than by luck — the prompt only fires for an order with **no**
buzzer, so `currentNumber` is null, so `openedWithBuzzer` is false, so `keepOpen` is false. A blocking
prompt can never enter stay-open mode and can never show Done.

Also unchanged, as instructed: cell colours, the two-channel label, the ✕, the confirm bar, the
all-taken message.

---

## 3. What to verify on screen, in priority order

1. **Add-order, switch with no dialog.** Pick buzzer 4, then tap 8. It must switch **with no confirm at all** — this is the bug you reported. Confirm no "Order #—" copy appears anywhere.
2. **The take confirm still fires.** With a real order holding buzzer 7, open another order's grid and tap 7 — *"Buzzer 7 is with order #15 (Sarah). Take it for order #12?"* must still appear, with Cancel and "Take buzzer 7".
3. **First selection still closes.** Open the grid on an order with no buzzer, tap one — it assigns and the grid closes, and there is **no Done button** while it is open.
4. **Stay-open session.** Open the grid on an order that already has one. Done is present. Switch, deselect, switch again — the grid stays up throughout. Done and ✕ both close it.
5. **The cells actually move** (the one with a network round trip). On the ORDER CARD path, switch 4→8 and watch: cell 8 goes red with "This order", cell 4 goes green. Note the brief dimmed/disabled state while the write lands.
6. **Toast names the right number after a switch.** Switch 4→8, then deselect 8 — the toast must read "Buzzer 8 removed", not "Buzzer 4 removed". This is the stale-snapshot fix.
7. **KDS parity** — repeat 4, 5 and 6 on a KDS card. It is a separate `saveBuzzer` with its own dependency array.
8. **Post-order prompt intact.** Place a walk-up with the event prompt on: the blocking grid appears, has **"No buzzer"** and **no Done**, no ✕, and tapping outside does nothing.
9. **Touch targets on the iPad.** Done ≥44px (renders 48px), and the cells are still 56px.

---

## 4. Still outstanding, not applied

Carried forward from the previous round — the all-taken banner still reads:

> All 30 buzzers are out. Tap one to take it from another order.

Suggested: **"All 30 buzzers are out. Tap one to take it from another order, or tap your own to give it
back."** Not applied, as instructed.
