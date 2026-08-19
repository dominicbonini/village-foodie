# Add-order name field — the input delay

**READ ONLY. Nothing changed except this file.** No fix, no design. `next dev` / `next build` were not
run. **Surface: `components/dashboard/AddOrderPanel.tsx` — the OPERATOR's Add order panel.** The customer
ordering page is a near-duplicate and was **not** read; nothing here is a claim about it.

# 🔴 THE HEADLINE: YOUR REQUIREMENT IS ALREADY MET. NO CHECK RUNS ON A KEYSTROKE.

**No fetch, no Supabase query, no capacity recompute, no slot-availability recompute, no effect, no
storage write, no native bridge call.** ✅ **Every heavy computation on this screen is behind a `useMemo`,
and `manualName` is in NONE of their dependency arrays.**

🔴 **THE COST IS PURE RE-RENDER, AND IT IS THE WHOLE SCREEN.** The name input and the entire menu grid are
in **one component with no memo boundary between them**, so each keystroke re-renders the menu pane, the
slot picker and the basket. **INFERRED as the cause; ranked in §8, with the measurement that settles it.**

---

## 1 · The input and its handler

**READ — `components/dashboard/AddOrderPanel.tsx`:**

```tsx
      <input
        type="text"
        placeholder="Customer name — optional"
        value={manualName}
        onChange={e => setManualName(e.target.value)}
        className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
      />
```

**The state, one line:**

```tsx
  const [manualName, setManualName] = useState('')
```

✅ **The handler does exactly one thing.** No validation, no trim, no lookup, no side effect.

## 2 · 🔴 EVERY CONSEQUENCE OF ONE KEYSTROKE

**`manualName` appears in exactly FOUR places in the file** — `grep -n "manualName"`:

```
287:  const [manualName, setManualName] = useState('')      ← the state
1155:        customerName: manualName,                      ← SUBMIT only
1242:          customer_name: manualName || 'Walk-up', …    ← SUBMIT only
1577:        value={manualName}                             ← the input
```

**And `grep -rn "manualName" app lib` returns NOTHING** — it never leaves this component.

| Does a keystroke… | Answer |
|---|---|
| trigger a fetch / API call / Supabase query | ❌ **NO.** The two fetchers are `useCallback`s keyed to `[token]` and `[truck?.id]`, invoked from effects and handlers, never from typing |
| recompute capacity / slot availability / occupancy / ready-time | ❌ **NO.** §below |
| re-run a `useEffect` | ❌ **NO.** `manualName` is in no dependency array anywhere |
| re-render the panel, the order list, the slot picker | 🔴 **YES — all of it. This is the entire cost** |
| write to localStorage or Preferences | ❌ **NO.** `grep -n "Preferences\|Capacitor\|keepAwake\|localStorage"` on this file returns **nothing** |

**🔴 THE FIVE HEAVY MEMOS AND THEIR DEPENDENCY ARRAYS, QUOTED — none contains `manualName`:**

```ts
  const calculation   = useMemo(…)  }, [manualItems, appliedDeals, truckMenu])
  const basketByCat   = useMemo(…)  }, [manualItems, appliedDeals, truckMenu])
  const queueAware    = useMemo(…)  }, [manualItems, appliedDeals, basketByCat, apiQueueByCat, manualEvent, categoryConfigs, waitMinutes])
  const slotIndicators= useMemo(…)  }, [capacityInputs, manualSlots, serverCatConfigs, categoryOrder])
  const asapResult    = useMemo(…)  }, [manualSlots, capacityInputs, serverCatConfigs, basketByCat, manualAsapSlot, eventTz, manualEvent])
```

✅ **`buildSlotIndicators`, `earliestBackwardFitSlot` and `calcQueueAwareReadySecs` — the expensive engine
calls — are inside `slotIndicators`, `asapResult` and `queueAware` respectively, and all three are cached
across a keystroke.** **Typing does not touch the capacity engine.**

## 3 · Where the state lives, and what that component also renders

🔴 **`manualName` lives in `AddOrderPanel` itself — the same component that renders BOTH PANES.** The final
return is one tree:

```tsx
  return (
    <>
      {/* ── iPad / desktop: two-column split ── */}
      <div className="hidden md:flex flex-1 min-h-0 -mx-4">
        {/* LEFT — scrollable menu. … */}
        {addOrderLayout === 'scroll' ? (
          <div className="w-[58%] flex flex-col min-h-0 border-r border-slate-200">
```

**LEFT is the whole menu. RIGHT is the basket, the name field, the slot selector and the submit panel.**
🔴 **THERE IS NO COMPONENT BOUNDARY BETWEEN THEM AND NO `React.memo` ANYWHERE IN THE FILE** —
`grep -n "React.memo\|memo("` returns only the `useMemo` import. **So a keystroke in the name field
re-renders the menu.**

⚠️ **AND THREE LARGE SUBTREES ARE PLAIN CONSTS, REBUILT ON EVERY RENDER — not memoised:**

```
1434:  const slotSelector = (
1550:  const contactDetails = (
2081:  const menuList = addOrderLayout === 'scroll' ? ( … )
1843:  const menuCats = [ …
1863:  const categoryTabs = menuCats.length > 1 ? ( …
1967:  const renderListItems = (cat: string) => ( …
```

## 4 · The size of what re-renders

**The file has 47 `.map(` calls and 2,616 lines.** The ones on the typing path:

- 🔴 **`menuList` — the biggest.** In the **`scroll`** layout it renders `ScrollMenuSections` over **every
  category**; in **`tabs`** it renders **one** selected category. **The `addOrderLayout` setting therefore
  changes the per-keystroke cost by roughly the number of categories.**
- **`slotSelector`** filters and maps the slot list, calling `isSlotPast(...)` per slot, plus a second
  `.filter(...).map(...)` over generated times:

```tsx
          {manualSlots.filter(s => s.is_grace || !isSlotPast(s, eventTz, manualEvent?.event_date)).map(s => {
```

- **The basket map does an O(menu) lookup per line:**

```tsx
            {grouped[cat].map(item => {
              const fullMenuItem = truckMenu?.items.find(m => m.name === item.name)
```

  ⚠️ **`Array.find` inside a `map` is O(basket × menu) on every render.** Small for a 3-line basket; it
  scales with both.

⚠️ **CANNOT DETERMINE THE ACTUAL COUNTS** — the menu size is per-truck data. **What would settle it:**
`select count(*) from menu_items_db where truck_id = '<truck>' and is_available;` and
`select count(*) from menu_categories where truck_id = '<truck>';` — **and the truck's `add_order_layout`
value, since `scroll` renders all of it and `tabs` one category.**

## 5 · Debounce, memoisation or throttle on this path

- ✅ **`useMemo` × 5** — quoted in §2. **They protect the engine, not the render.**
- ❌ **NO debounce and NO throttle on the input.** `grep` for `debounce`/`throttle` in this file returns
  nothing.
- ❌ **NO `React.memo` on any child**, so memoised *values* still get re-rendered *into* a fresh tree.

## 6 · Timers on this screen — one, and it is 30 seconds, not 15

**READ:**

```tsx
  // Live 30s tick so the ASAP label + the dropdown's isSlotPast re-evaluate as time passes.
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])
```

```tsx
  const [, setNowTick] = useState(0)
```

⚠️ **THE VALUE IS DISCARDED — the destructure drops it.** The tick exists solely to force a re-render so
`isSlotPast` re-evaluates. **It recomputes nothing itself**, but it re-renders the same full tree as a
keystroke, **every 30 seconds, whether or not anyone is typing.**

🔴 **IT IS NOT THE CAUSE OF A PER-KEYSTROKE DELAY** — 30 seconds is far too slow to be felt as input lag.
⚠️ **It would show as an occasional stutter mid-typing**, which is worth knowing if the delay felt
intermittent rather than constant.

## 7 · Native-specific work on this path — ✅ NONE

⚠️ **INFERRED FROM ABSENCE, and I name the search:** `grep -n "Preferences\|Capacitor\|keepAwake\|
localStorage"` over `components/dashboard/AddOrderPanel.tsx` returns **no matches**.

✅ **So there is no plugin bridge round trip on a keystroke.** The iPad shell loads the same web code, and
this path is pure React. 🔴 **THE DEVICE STILL EXPLAINS WHY YOU FELT IT THERE AND NOT IN A BROWSER:** the
work is the same, but an iPad's single-threaded JS on a large re-render is materially slower than a
desktop browser. **Same cause, lower headroom.**

## 8 · What I think is responsible — ranked, and INFERRED

| Rank | Cause | Confidence |
|---|---|---|
| **1** | 🔴 **The whole-screen re-render: the name state and the menu grid share one component with no `React.memo` and no child boundary.** Every keystroke rebuilds `menuList`, `slotSelector`, `contactDetails`, `categoryTabs` and the basket tree | ⚠️ **INFERRED — the strongest candidate by a distance** |
| **2** | ⚠️ **`addOrderLayout === 'scroll'` multiplies rank 1** by rendering every category instead of one | ⚠️ **INFERRED.** Checkable: does the delay differ between the two layouts? |
| **3** | ⚠️ **`truckMenu?.items.find(...)` inside the basket map** — O(basket × menu) per render | ⚠️ **INFERRED.** Small unless both are large |
| **4** | ⚠️ **The 30s tick** — same full re-render, but far too infrequent to feel like input lag | ⚠️ **Compounding at most** |
| — | ❌ **A fetch, a capacity recompute, an effect, a storage write, a native bridge call** | ✅ **RULED OUT BY READING**, each with its quote above |

🔴 **I CANNOT TELL YOU WHICH WITHOUT MEASURING, AND I AM NOT GOING TO GUESS HARDER THAN THE EVIDENCE
ALLOWS.** **What would settle it, in order of effort:**

1. **React DevTools Profiler on the iPad (or Safari remote-inspecting it):** record while typing three
   characters. It names the committed components and their durations. **If `AddOrderPanel` shows one long
   commit per keystroke dominated by the menu subtree, rank 1 is confirmed outright.**
2. **Toggle `add_order_layout` between `scroll` and `tabs` and type in both.** A clear difference confirms
   rank 2 and, with it, rank 1.
3. **Type with an empty basket and with ten lines in it.** A difference implicates rank 3.

⚠️ **UNOBSERVED: I did not run the app, profile anything, or reproduce the delay.** Everything above is
read from source.

---

## Marking summary

| Claim | Status |
|---|---|
| The input, its handler, and the four uses of `manualName` | ✅ **READ** — grep output quoted |
| No fetch / effect / capacity recompute on a keystroke | ✅ **READ** — all five memo dep arrays quoted |
| The name state and the menu share one component | ✅ **READ** — the final return quoted |
| No `React.memo`, no debounce, no throttle | ⚠️ **INFERRED FROM ABSENCE** — searches named |
| No native or storage work on this path | ⚠️ **INFERRED FROM ABSENCE** — search named |
| The 30s tick, and that its value is discarded | ✅ **READ** — both lines quoted |
| Menu / category / basket sizes | ⚠️ **CANNOT DETERMINE** — per-truck data; queries given |
| **The cause** | ⚠️ **INFERRED and ranked. Not measured** |

**Surfaces:** `components/dashboard/AddOrderPanel.tsx` only — the **operator's** Add order panel. **The
customer ordering page was not read and nothing here describes it.**

**No instruction contradicted another, and no span of the prompt arrived garbled.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** this file was
written — never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. ⚠️ **This report is
the only file written** — nothing else was touched. The result, the non-ASCII census and the
carrier-aware per-base variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
