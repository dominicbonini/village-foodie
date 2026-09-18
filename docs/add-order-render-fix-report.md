# Add Order — the render crash, fixed

18 September 2026. Localhost only; nothing deployed, nothing staged or committed. No live truck was
called and no order was created anywhere.

## 0. The prompt

No span arrived garbled and no instruction contradicted another.

## 1. What happened, and why nothing caught it

My change of 17 September added `manualFitWhy`, a `useMemo`, to `AddOrderPanel`. Its body calls
`readyToMins` — which was a `const` arrow declared **~75 lines below it in the same component body**. A
`useMemo` body runs **during render**, so the call landed in the temporal dead zone.

With an **empty basket** the memo returns early (`if (!Object.keys(basketByCat).length) return out`) and
never reaches the call. The moment Dominic selected a pizza it did:

```
Runtime ReferenceError: Cannot access 'readyToMins' before initialization.
  at AddOrderPanel.useMemo[manualFitWhy] (components/dashboard/AddOrderPanel.tsx:612:9)
```

🔴 **Why every check I ran passed anyway.** `tsc` and `next build` both type-check a reference that
appears earlier in source order without complaint — whether a binding is *initialised* depends on the
order the code **runs**, not on its types, and neither tool models that. And all three harnesses I wrote
for that change tested the **engine** (`fitOrderBackward`, `buildFitMessage`, the customer path) and the
component's **source text**. **Not one of them rendered the component.** A change that adds render-time
code to a component has to render that component; `scripts/add-order-render.cjs` now does, and its broken
variant reproduces this exact `ReferenceError`.

## 2. `git status`

**Before** — HEAD `fc0fddc outreach`; 32 modified, 51 untracked (the collection-times work, the rolling
fix, the durable harness, wired printing and yesterday's Add Order change, all uncommitted).

**After** — 85 entries. Changed or added by *this* fix:

```
 M components/dashboard/AddOrderPanel.tsx     the fix (§3) and the memo-input change (§5)
?? scripts/add-order-render.cjs               NEW — the render harness
```
(`?? scripts/add-order-fit-message.cjs` and `?? docs/add-order-fit-message-report.md` are yesterday's,
unchanged today.) Nothing staged, committed, stashed, reset or restored. The temporary lint file used in
§4 was deleted; **the repo's eslint config was not touched**.

## 3. The fix, by symbol

**`readyToMins` — moved from a component-body `const` to a module-level `function`.**

I took the second of the two options offered, because the function qualifies for it exactly:

```ts
const readyToMins = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0) }
```

It is **pure** — it reads only its argument and closes over nothing in the component. So hoisting it is
behaviour-preserving for all nine call sites, and it is strictly better than moving `manualFitWhy` below
it:

- **it removes the whole class of error for this helper**, rather than fixing one caller. A `function`
  declaration is hoisted and initialised before any component code runs, so no future render-time caller
  can land in its dead zone;
- **it does not reorder hooks.** Moving the memo would shift the index of every hook after it — safe, but
  a larger and less obvious edit to a 2,600-line panel that is in daily use;
- it stops re-creating the closure on every render.

Nothing about what it or `manualFitWhy` computes changed.

## 4. The sweep for the same bug class

Run as a one-off with `@typescript-eslint/no-use-before-define` at `{ functions: false, classes: false,
variables: true }`, over the files the last change touched, via a temporary override file — **the repo's
eslint config was not modified**, and the file was deleted afterwards. (Three `Definition for rule
'react-hooks/exhaustive-deps' was not found` lines are noise from inline disable comments in a config
that does not load that plugin; they are not findings and are filtered below.)

**BEFORE the fix — 4 findings:**
```
components/dashboard/AddOrderPanel.tsx:612:9   'readyToMins' was used before it was defined.
components/dashboard/AddOrderPanel.tsx:829:63  'resetManual' was used before it was defined.
components/dashboard/AddOrderPanel.tsx:974:5   'takePaymentRef' was used before it was defined.
components/dashboard/AddOrderPanel.tsx:975:5   'paymentMethodRef' was used before it was defined.
```

**AFTER the fix — 3 findings:**
```
components/dashboard/AddOrderPanel.tsx:855:63  'resetManual' was used before it was defined.
components/dashboard/AddOrderPanel.tsx:1000:5  'takePaymentRef' was used before it was defined.
components/dashboard/AddOrderPanel.tsx:1001:5  'paymentMethodRef' was used before it was defined.
```

Nothing else was flagged in `lib/slot-availability.ts`, `lib/slot-fit-message.ts`,
`components/printing/PrinterTypeChoice.tsx` or `components/printing/PrintingSettings.tsx`.

**The three that remain are the same lint hit but a different runtime class, and I did not reorder them.**
The rule flags *source position*; the crash needs the reference to be *evaluated* during render. I read
each:

| Hit | Where the reference sits | Runs when | Verdict |
|---|---|---|---|
| `readyToMins` | inside `useMemo(() => …)` — `manualFitWhy` | **during render** | 🔴 **real TDZ crash** — fixed |
| `resetManual` | inside a `useEffect(() => { … }, [controlledEvent?.id, isActive])` body | **after** render, by which time line 977 has run | safe |
| `takePaymentRef`, `paymentMethodRef` | inside `const resetManual = () => { … }`, a function body that is only *called* later | when called | safe |

All three are **pre-existing**, none was introduced by my change, and none can execute in the dead zone.
Reordering a `useEffect` and two `useRef` calls in a live panel to silence a lint rule would move hook
indices for no runtime benefit, so I left them and am reporting them instead. They are now also covered
empirically: the render harness renders the panel seven ways without a throw.

## 5. Performance

**My previous report's "~2.25 ms per recompute" was wrong, and I am correcting it.** That number came
from dividing a loop's total elapsed time by the number of combinations — but the loop also *built* each
fixture (random slot generation, grid construction), so it attributed fixture-building to the memo.

Measured properly (Apple M2 Pro, Node v22.22.3, 500 iterations after a 200-iteration warm-up, timing only
the memo body). There is no Chrome DevTools here, so the stated equivalent is a straight multiplier —
**×6 for the requested throttling, and ×20 as a pessimistic floor for an old iPad**:

| Case | Times | Per recompute | ×6 | ×20 |
|---|---|---|---|---|
| Dominic's: 17:00–21:00, 15-minute grid, 9 pizzas | 19 | **0.049 ms** | 0.30 ms | 0.99 ms |
| 17:00–21:00, 5-minute grid, 9 pizzas | 55 | **0.043 ms** | 0.26 ms | 0.85 ms |
| Pathological: 08:00–23:00, 5-minute, every slot full, 40 pizzas | 187 | **0.566 ms** | 3.40 ms | 11.32 ms |
| Pathological: three categories, kitchen cap 12, 08:00–23:00, 5-minute, 24+9+6 order | 187 | **37.07 ms** | 222 ms | 741 ms |

🔴 **The last row exceeds a 16 ms frame on its own, unthrottled.** So, per the brief, I memoised the
inputs rather than leaving it:

| Symbol | Change |
|---|---|
| `capacityInputs` | wrapped in `useMemo(… , [apiCapacityInputs, offlineForThisEvent])`. **Same fields, same order, same nulls — only its identity is now held across renders.** The offline branch built a fresh object literal on *every* render, so the three memos that depend on it (`slotIndicators`, `manualFitWhy`, `manualPlacement`) recomputed on every keystroke while offline |
| `EMPTY_SLOTS`, `EMPTY_CAT_CONFIGS` | **new** module-level constants. `manualSlots`' `?? []` and `serverCatConfigs`' `?? {}` minted a new empty object each render, defeating the same memos by the same mechanism |

Online this was already stable (`apiCapacityInputs` is state); the change makes the offline path behave
the same way. `manualFitWhy` now recomputes only when the basket, the event, the grid or the capacity
data actually change — which is what the brief asked for.

**Independent confirmation from a tool I did not aim at this:** `react-hooks/exhaustive-deps` on these
files fell from **7 warnings to 1**. Six of the seven were eslint saying exactly this — *"`capacityInputs`
… could make the dependencies of useMemo Hook change on every render"* — for all three memos. Fixing the
real problem removed them.

Residual, stated plainly: a *single* recompute in that pathological shape still costs ~37 ms, and it now
happens on a genuine basket/grid/capacity change rather than per render. That shape is a 15-hour event on
a 5-minute grid with every slot full across three cooking categories; no real truck config resembles it,
so I did not optimise the engine itself.

## 6. Each harness

### `scripts/add-order-render.cjs` (new)
**Failure mode:** `AddOrderPanel` throws while rendering, so selecting an item blanks the dashboard — the
exact bug above, which the engine-level harnesses could not see.

**Renderer:** `react-dom/server`'s `renderToString`. The repo has react-dom 19.2.3 and **no** jsdom,
happy-dom, linkedom, react-test-renderer or testing-library, and this harness **adds no dependency**.
`renderToString` executes the component body and every `useMemo`/`useCallback`, which is where this class
of bug lives. It does **not** run `useEffect` (see §8).

**Broken variant, run first:** the pre-fix ordering restored in a copy — `readyToMins` un-hoisted and put
back below the memo — then rendered with a 9-pizza basket.
→ **✓ FAILED as required: `ReferenceError: Cannot access 'readyToMins' before initialization`** — the
crash reproduced exactly.

**Real result — `✅` 33 checks, 0 🔴.** All seven fixture cases render without throwing: empty basket,
1 pizza and 9 pizzas on the 15-minute grid; 1 and 9 pizzas on the 5-minute grid; and 9 pizzas plus an
empty basket with capacity data missing (4,903–9,914 bytes each). The markup is then read as rendered
(React's `<!-- -->` text-node markers stripped):

- 9 pizzas → the 18:45 option is `18:45 🟢 · Order won't fit` and is greyed, while 19:30 is `19:30 🟢`;
- empty basket → no label anywhere, and the 🔴 dots are still on 18:30/19:00 unchanged;
- 1 pizza → 18:45 is **not** labelled (it fits) while 18:30 **is** (`18:30 🔴 8 Pizzas · Order won't fit` —
  that window is already full), which also proves the basket seeding really took effect;
- capacity data missing → no label at all;
- the 5-minute grid behaves the same.

**How the basket is set:** it is internal `useState` with no prop, and an empty basket is precisely the
case that did *not* crash — so `React.useState` is patched for the duration of one render to seed the
first empty-array initialiser (`manualItems`). The seeding is **self-verifying**: had it targeted a
different cell, the 9-pizza and 1-pizza assertions above would stop holding. The grid, the stored load
(8 @18:30, 8 @19:00) and the capacity inputs all arrive through the **real `offlineCapacity` prop** — no
patching.

**Also covered:** `PrinterTypeChoice` renders both on web (nothing — correctly gated) and as the native
app with the plugin present (387 bytes containing "Printer type"). Memo-input stability is asserted at
source level (§5).

### Components that could not be rendered, and why
- **The Collection times box** — it is **inline JSX inside `app/dashboard/[token]/page.tsx`** (~line
  4971), not a component. Rendering it means rendering `DashboardPage`: a ~5,000-line client component
  needing a route token, an authenticated `/api/dashboard` fetch and a dozen effects. Extracting it is a
  refactor of a file this work must not touch, so the harness asserts its location and **reports** the
  gap rather than faking coverage.
- **`PrintingSettings`** renders, but only its **gate**: it opens `if (!isNativeApp() || !ready) return
  null`, and `ready` is set inside a `useEffect` that `renderToString` never runs. Its body is therefore
  unreachable under server rendering whatever the platform mock says. A TDZ bug *below* that gate would
  **not** be caught — stated in the harness output and here.

### `scripts/add-order-fit-message.cjs`, `scripts/customer-path-identity.cjs` (yesterday's, unchanged)
Both still pass with their broken variants failing first: V1 the popup re-deriving its own total (caught
by the no-"16" assertion), V2 the label from the no-basket dot, V3 the label with no data; and the
customer-path V1, one slot forced into the unfittable set.

### `scripts/batch-rolling-identity.cjs` — golden **not** regenerated
Passes against `scripts/fixtures/batch-rolling-golden.json`, sha256 `8bdae817748ad334…` — **the same hash
as when it was generated**, and the file is untouched (`git status` still shows it only under the
untracked `scripts/fixtures/`). Its two broken variants (the off-by-one overlap, and `fits` inverted on
one fixture) both fail first.

## 7. Verification

| Step | Result |
|---|---|
| `npx tsc --noEmit` | rc 0 |
| `npx next build` | rc 0 — `✓ Compiled successfully` |
| **All harnesses** (`add-order-*`, `customer-path-identity`, `batch-*`, `slot-interval-*`, `printing-*`, `outreach-*`, `whatsapp-*`) | **32 files, every one rc=0** |
| eslint vs a clean HEAD worktree, per rule | `@typescript-eslint/no-explicit-any` 3 → 3 · `@typescript-eslint/no-unused-vars` 5 → **4** · `react-hooks/exhaustive-deps` 7 → **1** · `react-hooks/set-state-in-effect` 5 → 5 · `react/no-unescaped-entities` 2 → 2 |

Two rules improved and none regressed.

## 8. Localhost check — test-truck (Pizza Kitchen) only

🔴 **Never Pizzeria Gusto.** `npm run dev`, open `/dashboard/<test-truck token>`, today's event on Van1,
Pizza set to **prep 15 min, batch 8**, kitchen capacity empty, collection interval **15**. Seed the board
first: place **8 Pizzas at 18:30** and **8 Pizzas at 19:00**.

1. **Add 1 pizza → no error.** Add Order → Margherita ×1. The panel must stay on screen — this is the
   step that used to blank the dashboard with the ReferenceError. Check the browser console is clean.
2. **Add 8 more (9 total) → 18:45 shows the label.** Open the time list: **18:45** reads
   `18:45 🟢 · Order won't fit`, greyed but still selectable; 18:30 and 19:00 likewise; 19:30 onward are
   unlabelled.
3. **Pick 18:45 and press place → the new popup.** Expect exactly *Order won't fit at 18:45* /
   *Pizza: 8 at a time, every 15 minutes.* / *This order needs 2 batches to be ready by 18:45, but only 1
   has room.* / *18:15–18:30 · Pizza · Full* / *18:30–18:45 · Pizza · 8 free*. **No "16" anywhere.**
   *Pick another time* clears the slot; *Place it anyway* places at 18:45.
4. **Empty the order → the labels disappear.** Remove every line. The time list returns to dots and
   `{n} Pizzas` labels only — no greying, no `· Order won't fit`.
5. **Optional, the offline path** (this is what §5's memoisation touched): with items in the basket, go
   offline in DevTools and type into the customer-name field. Typing must stay responsive — before the
   change, every keystroke recomputed the whole list.

## 9. Anything I could not establish

- **That no `useEffect`-only TDZ or crash exists.** `renderToString` does not run effects, so the harness
  covers the render pass only. The three remaining `no-use-before-define` hits (§4) live in effect and
  function bodies and are reasoned about, not executed, by this harness.
- **`PrintingSettings`' body** — unreachable under server rendering (§6). Covering it needs a DOM, which
  means a new dependency.
- **The Collection times box** — not renderable in isolation (§6).
- **Real browser timings.** §5 is Node on an M2 Pro with stated multipliers, not Chrome DevTools
  throttling on a real iPad; the multipliers are an assumption, clearly labelled.
- **That the seeded basket matches what the UI produces on a click.** The harness seeds `manualItems`
  directly; a real click also goes through `addManualItem` (modifier resolution, stock checks, cart
  keys). The rendered assertions confirm the *shape* is right, but the click path itself is only
  exercised by step 1 of §8.
- **Whether any other component in the dashboard has the same latent ordering bug.** The sweep covered
  the files the last change touched, as instructed — not the whole component tree.
