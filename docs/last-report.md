# Shared event picker — extraction report

**Date:** 1 September 2026
**Built.** `next dev` and `next build` were not run. Nothing committed, nothing deployed.
⚠️ **This overwrites the audit that previously occupied this path** (kept at
`docs/kds-event-picker-report.md` and `docs/kds-picker-fix-report.md` for the diagnosis and the layout
fix respectively).

---

## STEP 1 — the helper survey, before any change

### `eventDateLabel` — 3 render call sites, **all single-event headers, none a list**

| file:line | Renders |
|---|---|
| `app/dashboard/[token]/kds/page.tsx:2563` | `<span className="hidden sm:block …">📅 {eventDateLabel(activeEvent.event_date)}</span>` — the KDS header bar, **the active event only** |
| `app/dashboard/[token]/page.tsx:3138` | `<span className="hidden sm:block …">📅 {eventDateLabel(activeEvent.event_date)}</span>` — the dashboard header bar, same shape |
| `components/shared/EventActionsModal.tsx:102` | `{event.event_date ? eventDateLabel(event.event_date) : ''}` — the modal's subtitle, **one event** |

🔴 **THE LONG `Today 6th September` FORM IS REQUIRED IN ALL THREE.** Each is a header or title with one
date and room for it; two are `hidden sm:block`, so they only appear where there is width.

**Recommendation, implemented: `eventDateLabel` gains a `style` parameter rather than a second
function.** `'long'` is the **default**, so all three call sites are byte-identical and were not
touched. `'compact'` returns `Today` / `Tomorrow` / `Sat 6 Sep`.

**Reasoning.** The picker is a dense list of up to 17 rows on a kitchen screen; the long form is roughly
twice the width and pushes the time off a phone row — that is a real regression on the surface whose
overflow was fixed hours ago. **A mode rather than a sibling function keeps ONE place deciding what
"today" means**: the today/tomorrow boundary computation is shared by both branches, so a timezone or
rule change cannot land in one and miss the other. **Compact adopts AddOrderPanel's shape because it
distinguishes Tomorrow** — the distinction an operator acts on — which the KDS's version did not.

### `eventStatusDisplay` — 2 render call sites, usable as-is ✅

`app/dashboard/[token]/page.tsx:3145` and `app/dashboard/[token]/kds/page.tsx:2547`, both for the
**active** event in a header, both pairing the returned `tone` with their own palette table
(`EVENT_STATUS_TEXT_ON_DARK` / `_ON_LIGHT`).

**No variant needed.** It returns `'● Live'`, `'● Finished'`, `'Cancelled'`, `'Not started'`, `'⏸
Paused'` — which is a **superset** of the badges AddOrderPanel hand-rolled. The picker passes
`paused: false` (pausing is truck-wide; a per-row "Paused" would be wrong on every row but one) and maps
the tone through `EVENT_STATUS_TEXT_ON_LIGHT`, because the card is white. **No fourth palette table was
invented.**

### `fmtVenue` — 6 render call sites, usable as-is ✅

`dashboard:3133` · `kds:2560` · `EventActionsModal:99` · `AddOrderPanel:2114` and `:2574`. **No variant
needed.** It already handles `null`, and `EventActionsModal:90` documents that its town-folding is why
the town is not a third line — the exact behaviour the picker wants.

---

## STEP 2 — what was built

### `components/shared/EventPickerPanel.tsx` — 162 lines, new

**Hardcoded (identical in both callers):** the overlay, the card, row layout and padding, hover, the
selected treatment, the status badge, the offline gate's appearance, the demo hide, and every
formatter — `eventDateLabel(date, 'compact')`, `fmtVenue`, `formatTime`, `eventStatusDisplay`.

**Props signature:**

```ts
export interface PickableEvent {
  id: string; event_date: string; start_time: string; end_time: string
  venue_name?: string | null; town?: string | null; status?: string | null
}

export interface EventPickerPanelProps<T extends PickableEvent> {
  open: boolean
  isDemo?: boolean                                 // 🔴 hides the picker — KDS behaviour, both callers
  events: T[]
  isSelected: (event: T) => boolean                // KDS: activeEvent?.id · AOP: manualEvent?.id
  onSelect: (event: T) => void                     // stays entirely with the caller
  onClose: () => void
  title: string                                    // "Change event" / "Select event"
  closeLabel: string                               // "Cancel" / "Done"
  isEventBlocked?: (event: T) => boolean           // the offline gate, now in both
  emptyState?: React.ReactNode                     // AOP's skeletons stay AOP's
}
```

🔴 **IT IS GENERIC OVER `T`, AND THAT WAS NOT OPTIONAL.** The KDS's `switchEvent` needs a full
`TruckEvent` (`truck_id`, `postcode`, `opened_at` and nine more). Typing the callbacks as
`PickableEvent` narrowed it and forced a cast **at the handler that changes what a kitchen screen is
showing** — the worst place in the app for one. `T` returns each caller exactly what it passed, checked
by the compiler. **`tsc` caught this; it was not foreseen.**

⚠️ **`PickableEvent`'s three display fields accept `undefined`** because the callers type them
differently (`TruckEvent` uses `string | null`, `EventRecord` has them optional). **Both helpers already
accept `null | undefined`.**

### The layout fix was carried across, not re-derived

```
max-h-[85dvh]                    ✅ present   ·  vh (not dvh) anywhere: 0
flex flex-col on the card        ✅
flex-1 min-h-0 overflow-y-auto   ✅ on the LIST
shrink-0 header + footer         ✅ siblings OUTSIDE the scroll region
click-stop on the card           ✅
```

### Both callers use it

```
app/dashboard/[token]/kds/page.tsx:2807   <EventPickerPanel …/>
components/dashboard/AddOrderPanel.tsx:2576   <EventPickerPanel …/>
```

### Untouched, as required

`switchEvent` (7 refs, KDS) · `resetManual` (11) · `fetchManualSlots` (9) · `onEventChange` (3) ·
`/api/events/manage` fetches (3 KDS, 1 AOP) — **all unchanged.**

---

## 🔴 Behaviour that changed beyond the listed decisions — flagged explicitly

The decisions already made (demo hide, offline gate in both, no status filter, shared formatters)
account for most of the delta. **These are the ones that go further, and you should read them:**

1. 🔴 **The KDS row is now two lines, not one, and shows more.** It gains a **town** (via `fmtVenue`),
   an **end time**, and a **labelled status badge**. Its bare `●` is gone — replaced by `● Live`.
   ⚠️ **This makes each row taller on the surface whose overflow was fixed this morning.** The scroll
   region handles it, but **more scrolling is now needed for the same 17 events.**
2. 🔴 **The KDS's inverted `bg-slate-900 text-white` selected row is gone**, replaced by AddOrderPanel's
   orange border and tint. **My audit flagged this as a distance-legibility decision on a kitchen
   screen, not a palette choice.** Unifying the row meant one had to win; **I did not add a prop for it,
   because the brief listed row layout and hover as hardcoded.** ⚠️ **If the kitchen screen needs the
   high-contrast marker, that is a prop I have not added — say so and it is a small change.**
3. ⚠️ **AddOrderPanel's status badges changed colour.** They were `bg-green-50/border-green-200` for
   Live and `bg-slate-100` for Finished; they are now a neutral `bg-slate-50 border-slate-200` chip with
   the **text** coloured from `EVENT_STATUS_TEXT_ON_LIGHT`. **I did this rather than invent a fourth
   palette table** — the existing three map tone → *text* colour only.
4. ⚠️ **AddOrderPanel gains `Cancelled` and `Not started` badges it never showed**, because its filter is
   gone and `eventStatusDisplay` labels every status. **Intended consequence of the no-filter decision,
   but worth seeing stated.**
5. 🔴 **The KDS gains the offline gate, which it has never had.** `isEventBlocked` there is
   `isOffline && activeEvent?.id !== event.id`. ⚠️ **It is deliberately COARSER than AddOrderPanel's**,
   which also consults `isEventLoaded(ev.id)` — the KDS has no per-event cache map to consult. **So
   offline, a KDS operator cannot switch to ANY other event.** That is stricter than AddOrderPanel and
   stricter than the KDS's previous behaviour (which allowed it and would have shown an empty board).
   **UNKNOWN whether that is the posture you want** — it is the safe direction, but it is a real change.
6. ⚠️ **AddOrderPanel's two warning panels moved OUT of the modal**, per the brief, and now render
   beneath the trigger beside `isEventEnded`. **Copy and conditions are verbatim.** This is arguably an
   improvement — inside the modal they vanished the instant a choice was made, which is when they became
   relevant — **but their position changed and you did not ask for that.**
7. ⚠️ **AddOrderPanel's card grew from `max-h-[80vh]` to `max-h-[85dvh]`.** Required by the "carry the
   KDS layout" instruction; the `vh → dvh` half is a fix, the `80 → 85` half is unification.

---

## Verification

```
npx tsc --noEmit                                     ✅ clean

ESLINT                                          BEFORE                    AFTER
app/dashboard/[token]/kds/page.tsx              21 (18 err, 3 warn)       21 (18 err, 3 warn)   ✅ did not rise
components/dashboard/AddOrderPanel.tsx          23 (12 err, 11 warn)      21 (10 err, 11 warn)  ✅ two errors fewer
lib/event-display.ts                            0                         0                     ✅
components/shared/EventPickerPanel.tsx          (new)                     0                     ✅
```

**No inline formatter survives in either picker:** `toLocaleDateString` in the KDS picker region **0** ·
`fmtEvDate` **0** · `venue_name.split(',')` in either file **0** · AddOrderPanel's status filter **0**.

**Sizes:** kds `3173 → 3151` (2 hunks) · AddOrderPanel `2616 → 2592` (6 hunks) · event-display
`109 → 129` (2 hunks) · panel `162` new. **Net −45 lines across the callers.**

---

## What I could not establish

1. **NOT OBSERVED — nothing was rendered.** No `next dev`, no `next build`, no page loaded, no viewport
   measured. **This is a source change; it is not verified behaviour.** The row is taller than the KDS's
   was, so the scroll region matters more than it did — **and that is exactly what has not been seen.**
2. **UNKNOWN — whether the coarser KDS offline gate (§5) is the intended posture.**
3. **UNKNOWN — whether losing the KDS's inverted selected row (§2) is acceptable on a kitchen screen at
   distance.** I flagged it in the audit as deliberate; the brief's "row layout hardcoded" decision
   overrode it, and I have implemented the decision rather than re-litigating — but the concern stands.
4. **The titles and footers stayed props.** I could not find one wording that reads correctly for both
   *"change which event this screen shows"* and *"pick the event for this order"* without being vaguer
   than either. **I did not force it.**

---

**No part of this prompt reached me garbled, and I found no self-contradiction in it.** One tension
worth naming rather than repairing silently: the brief hardcodes row layout *and* preserves the KDS
layout fix, and the KDS's high-contrast selected row is arguably part of what made that surface
readable. **I followed the decision as written and flagged the cost in §2 rather than quietly adding a
prop for it.**
