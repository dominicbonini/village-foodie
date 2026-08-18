# The capacity-breach banner — one inset for the stack, and copy an operator can act on

**Files changed — TWO:** `components/dashboard/CapacityBreachBanner.tsx` and
🔴 `app/dashboard/[token]/page.tsx` **(GUSTO'S LIVE PATH)**.
**Also written:** `docs/breach-banner-copy-report.md` (this file).
🔴 **NOTHING UNDER `app/api` WAS TOUCHED, AND NOTHING NEEDED TO BE — §3.2 shows why.**
`lib/capacity-breach.ts`, its detection rule, the ceilings, the capacity engine,
`rebuildProductionSlotUsage` and the Add-order modal are all untouched.
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore`. **No build, no deploy, no SQL, no schema change.**

**No span of the prompt arrived garbled.** ⚠️ **ONE INSTRUCTION OVERTOOK ANOTHER AND I RESOLVED IT IN
FAVOUR OF THE STATED GOAL RATHER THAN THE STATED MECHANISM — §1. Fix 1 specifies
`max(0.5rem, env(safe-area-inset-top))`; Fix 2 moves the inset onto a wrapper, where that floor would
ADD 8px on web instead of restoring it. The wrapper uses a bare `env()`, which is the only form that
leaves web byte-identical — which is what Fix 1 asked me to confirm.**

---

# 1 — 🔴 THE FLOOR WAS RIGHT FOR THE BANNER AND WRONG FOR THE WRAPPER

| Where the inset sits | Form | On web (`env()` = 0) |
|---|---|---|
| **ON the banner** (last task) | bare `env()` | 🔴 overrides `py-2`'s top half → **loses 8px** |
| **ON the banner** | `max(0.5rem, env())` | ✅ **restores exactly `py-2`'s 0.5rem → identical** — this is what Fix 1 specifies, and it is correct **for that position** |
| 🔴 **ON A WRAPPER** (this task) | `max(0.5rem, env())` | 🔴 **ADDS 8px to a box that had none — the banners keep their own `py-2` inside it. A REGRESSION** |
| ✅ **ON A WRAPPER** | **bare `env()`** | ✅ **0 → the wrapper is a no-op box. BYTE-IDENTICAL** |

```tsx
      <div style={{ paddingTop: 'env(safe-area-inset-top)' }}>
```

🔴 **CONFIRMED: WEB AND DESKTOP ARE BYTE-IDENTICAL.** `env(safe-area-inset-top)` resolves to `0px` in
every browser without an inset, `padding-top: 0` on a wrapper that previously did not exist changes no
geometry, and each banner's own `py-2`/`py-3` is untouched **inside** it. **Android is 0 by design —
`lib/native/statusBar.ts` records that AppHeader's bare `env()` "is safe precisely BECAUSE env()
resolves to 0 there".**

✅ **AND THE BANNER'S OWN INLINE INSET FROM THE PREVIOUS TASK IS REMOVED** — it would have been the
redundant second one. **The banner is back to exactly its original container:**
`w-full bg-red-600 text-white text-sm px-4 py-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between`.

---

# 2 — ONE WRAPPER FOR THE STACK

```tsx
      <div style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <OfflineBanner … />
        <WebOfflineBanner />
        <CapacityBreachBanner breaches={capacityBreaches} orders={orders} … />
        <BuzzerLostBanner … />
      </div>
```

✅ **EXECUTED — `git diff` on the page shows the four banners re-indented by two spaces inside a new
`<div>`, plus the `orders` prop. No banner's props, order, conditions or markup changed otherwise.**

## What renders when several show

| Showing | Result |
|---|---|
| one banner | the inset above it, then that banner |
| **two** (e.g. offline + breach) | 🔴 **THE INSET ONCE**, then both banners stacked, each with its own padding and colour |
| **three** | same — 🔴 **the inset is a property of the BOX, not of any banner, so it cannot repeat** |
| none | 🔴 **an empty `<div>` with `padding-top: <inset>` and no height of its own.** ⚠️ **On a native device that is a bare strip of page background under the status bar where previously `AppHeader`'s own inset painted it dark — see §5** |

⚠️ **`WebOfflineBanner` NEEDS NOTHING AND GETS NOTHING.** It returns `null` on native, and native is the
only place an inset exists; it is inside the wrapper because the wrapper **is** the stack.

---

# 3 — THE COPY

## 3.1 🔴 WHAT `capacityBreaches` CARRIES TODAY — QUOTED BEFORE DESIGNING ANYTHING

```ts
export interface CapacityBreach {
  /** The collection slot whose cooking window is over a ceiling (the slot the operator sees red). */
  collection_time: string
  /** The engine's OWN binding reason, e.g. "Pizza 5/4" / "global ceiling" / "over capacity at event-start". */
  reason: string
  /** Items over the kitchen_capacity total ceiling in this window (0 if the breach is per-category only). */
  over_total: number
  /** Categories over their per-category batch in this window (empty if the breach is the total only). */
  over_cats: Array<{ cat: string; over: number }>
  /** order_keys of OCCUPYING orders collected at this slot — for the operator to find & amend. */
  order_keys: string[]
  /** Their per-event display numbers — for the banner link text. */
  order_ids: number[]
}
```

🔴 **AND ONE PREMISE OF THE BRIEF IS WRONG, WHICH MATTERS BECAUSE IT MAKES THE FIX SMALLER:
`collection_time` IS ALREADY THE COLLECTION SLOT. THOSE ARE NOT COOKING WINDOWS.** The detector
iterates the SLOT list and looks the window up FROM the slot:

```ts
  for (const s of times) {
    const slotMins = parseMins(s.collection_time)
    const w = back.pileByStart.get(slotMins) ?? back.byStart.get(slotMins - step) ?? null
```

**So `16:50 — global ceiling` was naming a collection slot all along.** ⚠️ **What was actually missing
is the QUANTITY and the PER-ORDER SPLIT, and `reason` is engine vocabulary ("global ceiling") rather
than kitchen vocabulary. That is what changed.**

## 3.2 THE ONE THING IT DOES NOT CARRY — AND NO API WAS EXTENDED

🔴 **PER-ORDER QUANTITIES ARE NOT IN THE PAYLOAD.** `order_keys` and `order_ids` say WHO; nothing says
HOW MANY each is holding.

✅ **NO `app/api` CHANGE WAS NEEDED AND NONE WAS MADE.** The dashboard already holds the full `orders`
array with `items[].quantity`; the banner now takes it as an **optional** prop and does the arithmetic
client-side:

```tsx
  const qtyOf = (order_key: string): number => {
    const o = (orders || []).find(x => x.order_key === order_key)
    if (!o || !Array.isArray(o.items)) return 0
    return o.items.reduce((t, it) => t + (Number(it?.quantity) || 0), 0)
  }
```

⚠️ **OPTIONAL, SO NO CALLER IS FORCED TO CHANGE:** without `orders` the banner renders the headline and
the bare order numbers, which is what it did before.

## 3.3 What it renders now

```tsx
                  {total > 0 ? `${total} ${unitWord(b)} booked for ${b.collection_time}` : `${b.collection_time} over capacity`}
                  {total > 0 ? ' — over capacity' : ''}
                    {contributors.map(c => `#${c.id}${c.qty > 0 ? ` — ${c.qty}` : ''}`).join('  ·  ')}
```

**One line per breached slot, headline then contributors, no explanatory paragraph** — the shape you
asked for:

```
⚠ 1 slot over capacity — review
10 items booked for 17:00 — over capacity   #4 — 5  ·  #N19 — 5
```

## 3.4 🔴 TWO HONEST LIMITS ON THAT COPY

1. **THE WORD IS `items` UNLESS EXACTLY ONE CATEGORY IS OVER**, in which case it is the engine's own
   category name:
   ```tsx
   const unitWord = (b) => b.over_cats.length === 1 ? b.over_cats[0].cat : 'items'
   ```
   🔴 **IT WILL SAY "10 items", NOT "10 mains", WHENEVER THE BREACH IS THE GLOBAL CEILING RATHER THAN A
   CATEGORY BATCH** — because `over_cats` is empty in that case and **nothing in the payload names a
   category.** ⚠️ **Getting "mains" there needs a per-order, per-category quantity, which means either
   an item→category map on the client or a field on the breach — the second is an API change and I
   stopped rather than make it.**
2. **THE PER-ORDER NUMBER IS THAT ORDER'S TOTAL ITEM COUNT, not its count within the breached window.**
   For a single-category truck they are the same; for a mixed basket the order may contribute fewer
   items to that window than it holds. ⚠️ **Stated rather than dressed up.**

## 3.5 THE WINDOW → SLOT INVERSION, AND THE MANY-TO-ONE CASE

**The inverse EXISTS and is already shared — `contributingProductionSlots` in `lib/slot-availability.ts`,
which the Add-order modal uses:**

```ts
export function contributingProductionSlots(
  productionSlotUnits: Record<string, QtyByCat>, catConfigs: Record<string, CatConfig>,
  fromMins: number, toMins: number, capacityWindowMins: number = 5,
): string[] {
```

🔴 **IT RETURNS AN ARRAY, SO YES — ONE COOKING WINDOW CAN SERVE SEVERAL COLLECTION SLOTS.**

✅ **AND THE BANNER HANDLES IT WITHOUT NAMING ONE ARBITRARILY, because the detector is keyed the other
way round: one breach per COLLECTION SLOT.** A window serving 16:55 and 17:00 produces **two breach
entries**, and the banner renders **two lines**, each with its own slot and its own contributors.
⚠️ **The same orders can therefore appear on both lines — which is true, and is what an operator needs
to see.**

## 3.6 ⚠️ A TYPE THAT LIES, FOUND WHILE READING — NOT FIXED

```ts
  order_ids: number[]
```
```ts
      order_ids: grp.map(o => o.id),
```

**`orders[].id` is `number` in that interface, but an offline-origin order's display id is a STRING
(`N19`).** ⚠️ **At runtime it flows through and renders as `#N19` correctly; the TYPE is what is wrong,
and it is in `lib/capacity-breach.ts`, which this task must not change. Reported, not touched.**

## 3.7 THE SIGNATURE — CHECKED, AS ASKED

```ts
export function breachSignature(breaches: CapacityBreach[]): string {
  return (breaches || [])
    .map(b => `${b.collection_time}:${b.over_total}:${b.over_cats.map(c => `${c.cat}${c.over}`).join(',')}`)
    .sort().join('|')
}
```

✅ **IT HASHES THE DATA, NOT THE RENDERED TEXT.** 🔴 **SO A DISMISSED BANNER DOES NOT RE-FIRE BECAUSE
THE COPY CHANGED** — the signature is identical before and after this task for the same breach set.
**Unchanged, as required.**

---

# ⚠️ PIZZERIA GUSTO — `kitchen_capacity = 2`, 5-MINUTE WINDOW, SO THIS IS LIVE FOR THEM

| | Before | After |
|---|---|---|
| A breached slot | `⚠ 1 slot over capacity — review` / `17:00 — global ceiling (orders #4, #N19)` | `⚠ 1 slot over capacity — review` / **`10 items booked for 17:00 — over capacity   #4 — 5  ·  #N19 — 5`** |
| Two breached slots | `16:55 — global ceiling · 17:00 — global ceiling` | **two lines, each naming its slot, its total and its orders** |
| The heading, the colour, the Dismiss button | — | ✅ **unchanged** |
| On an iPad | 🔴 **the heading and Dismiss under the status bar** | ✅ **the whole stack clears the inset** |
| On web | — | ✅ **byte-identical** |

⚠️ **WITH `kitchen_capacity = 2` THIS FIRES OFTEN — two mains in one 5-minute window is a breach — so
the copy change is the one they will notice, not the inset.**

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0. `npx eslint`: banner 0 problems; dashboard 82 errors / 26 warnings = 108,
identical to this session's baseline.**

| Required claim | Method |
|---|---|
| Names the collection slot, the overage and each order with its quantity | ✅ **EXECUTED (source)** — the render is quoted in §3.3. ⚠️ **With the two limits in §3.4: "items" not "mains" on a global-ceiling breach, and the per-order figure is the order's total** |
| A window serving two collection slots renders correctly | ✅ **EXECUTED (source)** — the detector emits one breach PER SLOT (`for (const s of times)`), and the banner maps over breaches, so two slots give two lines. 🔴 **Not rendered** |
| The inset appears once with two banners | ✅ **EXECUTED (source)** — it is on the wrapper; no banner carries one. The previous task's inline inset was removed |
| Each banner renders identically on web | ✅ **EXECUTED** — `git diff` shows the banners re-indented and otherwise untouched; the wrapper's `env()` is 0 on web. **The capacity banner's own container string is back to its original** |
| A dismissed banner does not re-fire | ✅ **EXECUTED (source)** — §3.7: the signature hashes `collection_time`/`over_total`/`over_cats` only |
| Nothing under `app/api` changed | ✅ **EXECUTED** — two files in the diff, neither under `app/api`. 🔴 **I STOPPED ON ONE THING: a per-category, per-order quantity would need a new field on `CapacityBreach` (and so on the route that builds it), so "10 mains" is not built — §3.4** |

## 🔴 WHAT THIS DOES NOT PROVE, AND ONE THING TO LOOK AT

- **NOTHING WAS RENDERED.** No browser, no device.
- ⚠️ **WHEN NO BANNER SHOWS, THE WRAPPER IS AN EMPTY BOX WITH THE INSET AS ITS ONLY HEIGHT.** On a
  native device that is a strip of page background above `AppHeader` — which paints its own inset dark.
  🔴 **I could not verify whether that strip is visible or collapses; it is the one thing worth a
  glance on hardware.** A conditional wrapper is a one-line change if it shows.

---

# INTEGRITY

```
components/dashboard/CapacityBreachBanner.tsx   HEAD 2,394 → 4,886 bytes · 100 lines · 4 classes
   NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0 · added vs HEAD: NONE

app/dashboard/[token]/page.tsx                  BEFORE 396,735 → 398,512 bytes · 5,111 lines · 53 classes
   NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0 · added vs HEAD: NONE
```

**Neither file gained or lost a non-ASCII class.** ⚠️ **The banner's comments are pure ASCII by
construction — that file's census is 4 and every glyph in it is pre-existing (`⚠`, `—`, `·`).**

## This report — a SEPARATE pass, run AFTER writing

```
docs/breach-banner-copy-report.md   bytes 15,601
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 29 | 0 | 29 |
| U+26A0 (warning sign — TEXT presentation) | 22 | 18 | 4 |
| U+2705 (check mark button) | 18 | 0 | 18 |

U+26A0 is the only TEXT-presentation base here. Any BARE occurrences are the banner's own
heading glyph quoted verbatim from source, which that file writes bare; every occurrence in
this report's own prose is PAIRED with U+FE0F. U+1F534 and U+2705 have emoji presentation by
default, so bare is correct for them.

## Working tree

```
 M app/dashboard/[token]/page.tsx
 M components/dashboard/CapacityBreachBanner.tsx
?? docs/breach-banner-copy-report.md
?? docs/breach-banner-safe-area-report.md
?? docs/offline-notice-gate-report.md
?? docs/offline-order-numbering-capacity-report.md
?? docs/offline-protection-popup-report.md
?? docs/oversell-warning-review-report.md
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M components/dashboard/CapacityBreachBanner.tsx` | ⚠️ already `M` from the safe-area task; 🔴 **THIS TASK rewrote that change** |
| 🔴 `M app/dashboard/[token]/page.tsx` | ⚠️ already `M` from the offline-notice task; 🔴 **THIS TASK wrote to it** |
| 🔴 `?? docs/breach-banner-copy-report.md` | 🔴 **THIS TASK** — this file |
| `?? docs/breach-banner-safe-area-report.md`, `?? docs/offline-*.md`, `?? docs/oversell-warning-review-report.md` | ✅ pre-existing — the four tasks before this one |

⚠️ **The tree is short because you committed mid-session (`dcb8862`, `fa72f9a`); nothing was cleaned by
me.** No `git stash`, `git checkout` or `git restore` was run at any point.
