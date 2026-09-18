# Four fixes to Create Demo: the false unbranded warning, the wrong opening panel, a longer service and a fuller board

**Date** 19 September 2026 · **Scope** localhost only, nothing deployed · **Trucks written to: none.**
No demo was created or rebuilt (see *Anything I could not establish*), no test-truck row changed, no
`outreach_templates` row touched, and Pizzeria Gusto was never called, read or written.

**🔴 ONE CONTRADICTION, FLAGGED AND ANSWERED BEFORE ANY CODE WAS WRITTEN.** Items 3 and 4 change the demo
event to four hours and make the board fuller; the PROOF list also asked that "defaults still reproduce
today's landing-page demo byte-for-byte". Those cannot both hold, because a longer window and more orders
change the landing-page demo too. I stopped and asked. **Dominic chose "change both": one product, one
demo.** The byte-for-byte assertion is therefore restated as *an admin demo built at the control defaults
is identical to a landing-page demo built from the same code* — the invariant the controls were actually
built to keep. Everything below follows that decision.

---

## git status — before

**HEAD `7346860` "between buns demo" · 0 staged · 8 modified · 3 untracked.**

```
 M app/api/admin/provision-demo/route.ts   M lib/seed-demo-orders.ts
 M components/admin/CreateDemoModal.tsx    M scripts/harnesses.json
 M components/admin/OutreachPanel.tsx      M scripts/seed-demo-grid.cjs
 M lib/demo-assumptions.ts
 M lib/provision-demo.ts
?? docs/demo-seed-parameters-report.md   ?? lib/demo-kitchen.ts   ?? scripts/demo-seed-parameters.cjs
```

---

# ITEM 1 · The warning was lying, not the demo

**The condition**, in `CreateDemoModal`:

```tsx
{!result.logoStoragePath && (
  <p …>This demo is unbranded — no logo was copied.</p>
```

`result.logoStoragePath` is whatever `provisionDemo` returned. **The copier is not at fault** —
`classifyDemoLogoSource` and `copyDemoLogo` were never reached. This was the block:

```ts
let logoStoragePath: string | null = null
if (!input.existingTruckId && input.discoveryTruckId) {
  const logo = await copyDemoLogo(supabase, truckId, input.logoUrl ?? null, { now })
  …
}
```

**`!input.existingTruckId` is the whole bug.** A rebuild keeps the truck, so there is nothing to copy and
the block is skipped — leaving `logoStoragePath` at `null`, which the modal reads as "unbranded". The
truck's own `trucks.logo_storage_path` was untouched and still held the logo from the first build, which
is why the demo displayed it perfectly.

**So the warning was lying.** The demo was branded; the modal was reporting a variable that had never been
filled in on that path.

**The fix** reads the existing value back rather than suppressing the check, so a genuinely unbranded demo
still says so:

```ts
if (input.existingTruckId) {
  const { data: row } = await supabase
    .from('trucks').select('logo_storage_path').eq('id', truckId).maybeSingle()
  logoStoragePath = (row as { logo_storage_path?: string | null } | null)?.logo_storage_path ?? null
  if (!logoStoragePath) logoNote = 'This demo has no logo stored, so it is unbranded.'
}
```

**The QR plate agrees by construction and always did.** The demo dashboard passes
`logoUrl = demoBranded && hasFeature(plan,'branded_qr_code') && qr_code_style === 'branded' ? truck.logo : null`
to `DemoWelcome`, and `generateQRWithLogo` prefers a real logo over the `'Your logo here'` plate. That
predicate reads the truck row, not the provisioning result, so it was right while the banner was wrong —
the two were disagreeing because only one of them was looking at the truck.

---

# ITEM 2 · The intro exists; the signup panel was talking over it

## Every panel the demo dashboard can show

| panel | symbol | trigger | intended moment |
|---|---|---|---|
| **Welcome / introduction** | `DemoWelcome` | `isDemo`, and `localStorage['hg_demo_welcome_<token>'] !== 'seen'`. Full-screen modal. | **first open** |
| **"That's exactly how a real order lands"** | `DemoLoopComplete` | an order key on the board that was **not** in the stored baseline `hg_demo_seen_orders_<token>`, plus a 10-minute snooze and an admin exclusion | **after the visitor places their own first order** |
| **Service finished** | `demoEndedCard` | `demoServiceEnded` — the clock is past `end_time`. Shown **instead of** the loop panel. | end of the demo service |
| **Event locked** | `DemoLockChip` / `showDemoEventLock` | the visitor tries an action a demo does not allow | on interaction |

There is no near-expiry panel; the expiry is shown on the outreach row, not to the prospect.

## Why the wrong one fired

**Both flags are keyed on the dashboard token, and the token survives a rebuild.** A rebuild deletes every
order and seeds new ones with fresh `order_key`s, so:

- `hg_demo_seen_orders_<token>` — the baseline — shared **no** key with the new board, and
  `fresh = keys.filter(k => !seen.has(k))` returned all 25 seeded orders. The panel fired as though the
  visitor had placed them.
- `hg_demo_welcome_<token>` was still `'seen'` from the previous build, so the introduction — which exists,
  and is what should have shown — was suppressed.

One cause, two symptoms: **a stored judgement about a board that no longer exists.** `first_opened_at` was
not involved, and the intro panel was neither missing nor mis-triggered.

## The fix

New `lib/demo-board-build.ts` owns the question and both key names:

```ts
export function boardWasReplaced(baseline, current) {
  if (!baseline || baseline.length === 0 || current.length === 0) return false
  const now = new Set(current)
  return !baseline.some(k => now.has(k))
}
```

Strict on purpose: a prospect placing an order **adds** a key, so an overlapping set is the normal case and
must never read as a replacement — that is the case that must still fire the signup panel. `DemoLoopComplete`
now re-baselines and says nothing when it sees a replacement, and `resetDemoBoardFlags` also clears the
welcome flag, so **a rebuilt demo introduces itself again**. It also defers one render while the welcome is
still unseen, so the introduction is always the first thing a demo says.

## The intro copy, for approval

`DemoWelcome` renders as a full-screen modal over the board on first open. Its heading and instructions are
unchanged; **one sentence was missing and is added** — that the orders on the board are examples. A visitor
who does not know that is looking at what appear to be other people's live orders on their own truck.

> ### Here's your menu
> *(a sample demo reads "Here's a sample truck")*
>
> **This is your own menu and branding, on a real board.** The orders already on it are examples, so you
> can see a busy service. Nothing here is a real customer.
>
> *(a sample demo reads: "This is a **stand-in menu** so you can see how it all works — upload your own
> menu any time to make it yours. The orders already on it are examples, so you can see a busy service.
> Nothing here is a real customer.")*
>
> **Two things to try:**
> · Hit **Mark paid & done** on an order
> · Scan the **QR code** — or tap the link — and order as a customer, then watch it land
>
> *(then the QR code and the customer ordering link, side by side, and Got it)*

Only the bolded sentence and the one after it are new. Everything else is the panel as it already was.

---

# ITEM 3 · Four hours, still inside one day

**Old:** `export const DEMO_WINDOW_HOURS = 3`. A demo created at 15:58 gave 16:30–19:30.

**New:** `= 4`. **The start rule is unchanged** — the wall clock in the venue's timezone, floored to the
nearest half hour (`:00` or `:30`), so a demo created at 15:58 now runs **16:30–20:30**.

**The clamp is the rule it always was**, applied to the new raw end:

```ts
const rawEndMins = startMins + DEMO_WINDOW_HOURS * 60
const end = rawEndMins >= 24 * 60 ? '23:59' : toHHMM(rawEndMins)
```

A single `truck_events` row is one `event_date` and the engine assumes `end > start` on it, so the window
never crosses midnight. **19:30 is the last creation time that gets a full four hours**; from 20:00 the end
clamps to `23:59`. The **shortest window it can produce is 23:30–23:59, twenty-nine minutes** — still a
real demo of two fifteen-minute batches, and the harness seeds a board into it.

---

# ITEM 4 · A board sized by the kitchen, not by a number

**The old rule** counted slots: `slots.length × ORDERS_PER_SLOT × batchScale`, capped at 37. A slot is not
a unit of cooking, which is why a four-hour service at eight a batch still read as thin.

**The new rule**, quoted:

```
// THE RULE: aim to fill the windows the seeder can plan into.
//   plannable windows  = ceil(slots ÷ span)            — one batch per batch-window
//   items it can hold  = windows × batch × AVG_FILL    — AVG_FILL is FILL_PATTERN's own mean, so the
//                                                        board keeps its busy/quiet shape
//   orders to make them = items ÷ AVG_MAINS_PER_ORDER  — ORDER_SHAPES' own mean, so the sizes stay plausible
```

Both averages are **derived from the arrays themselves**, so changing the pattern or the shapes moves the
count with them and the two cannot drift. The count scales with the event length, the grid and the batch,
which is what "scaled to … rather than a fixed number" asks for. A ceiling of **80 orders** bounds the work,
not the board: every seeded order is an insert plus a real engine admission plus a reservation write, and a
prospect is watching a spinner. `ORDERS_PER_SLOT`, `TARGET_ORDERS` and `FULL_WINDOW_SLOTS` are gone; the
numbers they carried are recorded in the comment that replaced them, as the tuning `FILL_PATTERN` came from.

## A sample board at 15 minutes / cook 15 / batch 8

Rendered through `buildSlotIndicators` — the code that draws the strip and the Add Order list.
**60 orders, sizes 1–5 items, mixed categories.**

```
  15:00  🟢            15:15  🔴  8 Mains     15:30  🟡  4 Mains     15:45  🔴  8 Mains
  16:00  🟡  2 Mains   16:15  🟡  6 Mains     16:30  🔴  8 Mains     16:45  🟡  4 Mains
  17:00  🔴  8 Mains   17:15  🟡  2 Mains     17:30  🟢             17:45  🟢
  18:00  🟢            18:15  🟢             18:30  🟡  6 Mains     18:45  🔴  8 Mains
  19:00  🟡  4 Mains
```

Five full, seven part-full, five empty, nothing over capacity, no banner on arrival. A four-item order is
offered at ten times; a full batch of eight at five; **sixteen — two batches — at 17:45, 18:00 and 18:15**,
the reserved run, and crossed everywhere else.

---

# PROOF

## `scripts/demo-seed-parameters.cjs` — extended (not replaced)

**Failure mode:** a demo that contradicts itself — a warning that calls a branded demo unbranded, a signup
prompt where an introduction belongs, a service too short to read as one, or a board too thin to be
convincing or too full to demonstrate anything.

**All seven broken variants ran FIRST and FAILED as required:**

```
  ✓ FAILED as required  V1 grid ignored at 15/15/8: 13 times off the grid (15:10, 15:25, 15:40, 15:55)
  ✓ FAILED as required  V2 allowance uncapped: peak 14 in the oven against a batch of 8
  ✓ FAILED as required  V3 no reserved run: an order of 2 × batch fits at 0 of 17 times
  ✓ FAILED as required  V4 the 3-hour window restored: 16:00–19:00
  ✓ FAILED as required  V5 budget capped at half a batch: 0 full times (two are required)
  ✓ FAILED as required  V6 the midnight clamp removed: 22:00–02:00 crosses into the next day
  ✓ FAILED as required  V7 replacement test removed: a wholly new board reads as the SAME board — every seeded order looks like the visitor's
```

**The real tree:**

```
── THE ADMIN DEFAULTS ARE THE LANDING-PAGE DEMO ─────────────────────────────────────────
  ✓ no fields sent (the landing page) ⇒ parseDemoKitchen returns null, so provisioning is untouched
  ✓ the controls' own defaults are today's values: grid 5, prep 300s, batch 4
  ✓ and both read as "today's demo"
  ✓ the admin path at its defaults seeds the same board as the landing page: 80 orders, same times, same items

── THE EVENT WINDOW (ITEM 3) ────────────────────────────────────────────────────────────
  ✓ the demo window is 4 hours
  ✓ an ordinary creation gives a four-hour window: 09:00–13:00 · 15:30–19:30 · 16:00–20:00 · 18:00–22:00
  ✓ and the start rule is unchanged — the wall clock floored to the nearest half hour
     late creations: 20:00–23:59 · 21:30–23:59 · 23:00–23:59 · 23:30–23:59
  ✓ every late creation stays inside its own day and still ends after it starts
  ✓ 19:30 is the last full four hours (19:30–23:30); 20:00 onwards clamp to 23:59
  ✓ the shortest window the clamp can produce is 23:30–23:59, 29 minutes
  ✓ the seeded board still fits the shortest window: 5 orders at 23:45 (warnings [])

── THE MATRIX: 5 grids × 3 cook times × 3 batches ───────────────────────────────────────
  ✓ 45 combinations: every seeded order sits on its own grid (0 off-grid)
  ✓ no minute exceeds the batch in any combination (0 over)
  ✓ every board has at least TWO full, TWO part-full and TWO empty times (worst case 2 full, 2 part, 2 empty; 0 short)
  ✓ every cooking order carries a reservation at its own batch and cook time (0 without)
  ✓ every board mixes order sizes and categories (0 thin)
  ✓ the boards are full services, not samples: 10–80 orders across the matrix
  ✓ every board names a time with two adjacent empty batch windows (0 without)
  ✓ an order of exactly the batch fits somewhere on every board (0 without)
  ✓ an order of 2 × the batch fits on every board (0 without)
  ✓ no board arrives over capacity — the banner would not show (0 over)
  ✓ with kitchen_capacity 8 no minute exceeds it either: peak 8

── THE TARGET SHAPE: 15-minute times, 15-minute cook, 8 a batch ─────────────────────────
     60 orders — mains per time: 15:00=0 15:15=8 15:30=4 15:45=8 16:00=2 16:15=6 16:30=8 16:45=4 17:00=8 17:15=2 17:30=0 17:45=0 18:00=0 18:15=0 18:30=6 18:45=8 19:00=4
     two-batch time reserved: 18:00 · 16 mains fit at: 17:45, 18:00, 18:15
  ✓ an order of 16 is admitted at the reserved time 18:00
  ✓ every cooking order carries a reservation at batch 8 / prep 15

── ITEM 2: WHICH PANEL SPEAKS FIRST ─────────────────────────────────────────────────────
  ✓ a board sharing no order key with the baseline reads as REPLACED — a rebuild, or the first-open restart
  ✓ a prospect placing their own order ADDS a key, which must never read as a replacement — this is the case that must still fire the signup panel
  ✓ no baseline, or an empty board, is not a replacement
  ✓ a replaced board CLEARS the welcome flag, so the rebuilt demo introduces itself again
  ✓ and re-baselines on the seeded orders, so they are never mistaken for the visitor's own

── ITEM 1: THE LOGO WARNING ─────────────────────────────────────────────────────────────
  ✓ a rebuild reads the truck's own logo_storage_path back, so a demo that HAS a logo no longer reports itself unbranded
  ✓ and a demo that genuinely has none still says so
  ✓ the copy itself is unchanged — a rebuild has nothing to copy, it reads what is already there

── SERVER-SIDE VALIDATION ───────────────────────────────────────────────────────────────
  ✓ … all eight bounds assertions unchanged from the previous round …

✅ four hours, a full board, the right panel first, an honest logo warning — on every combination
```

## `scripts/seed-demo-grid.cjs` — one block restated

Its "a van at 5 minutes is unchanged from today" block compared the board against HEAD's byte for byte —
the right check while the van-grid fix was the only change in flight. Two rounds have since changed the
board **deliberately** for every demo, so that comparison now asserts the absence of exactly the
improvements that were asked for, and would fail forever on a correct tree. It is replaced by direct
assertions of what the harness is actually for — a van's own interval is the grid the seeder plans on —
with the fuller board's guarantees asserted where the seeding rule lives. Recorded here rather than
silently re-anchored; this is the second round in which a HEAD-relative assertion has gone stale.

---

# VERIFICATION — true exit codes

| command | exit |
|---|---|
| `node scripts/demo-seed-parameters.cjs` | **0** (44 assertions; V1–V7 failed first) |
| `node scripts/run-harnesses.cjs` | **0** — 56 run · 56 passed · 0 failed |
| `npx tsc --noEmit` | **0** |
| `npx next build` | **0** |

**Goldens — unchanged, byte for byte. No generator was run.**

| golden | sha256 |
|---|---|
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` |

## eslint, per rule, against a clean HEAD worktree (`7346860`)

| rule | HEAD | working tree | delta |
|---|---|---|---|
| `@typescript-eslint/no-explicit-any` (error) | 2 | 2 | 0 |
| `@typescript-eslint/no-require-imports` (error) | 4 | 4 | 0 |

**Zero delta, every rule.** Three warnings appeared mid-change and were cleared at source rather than
suppressed: two superseded constants removed, and `token` added to the effect's dependency list where it is
now read. `lib/demo-board-build.ts` lints clean; `scripts/demo-seed-parameters.cjs` reports 4
`no-require-imports`, the house pattern for `.cjs` harnesses.

---

# LOCALHOST CHECK for Dominic

1. `npm run dev`, sign in as an admin, open the outreach console and find **Between Buns Royston**.
2. Its row shows the demo link with a **Rebuild** button beside it. Press it.
3. Set **Collection times → Every 15 minutes**, **Cook time → 15**, **Batch size → 8**, then **Rebuild the
   demo**. *Expect:* a result with the link, and **no amber "This demo is unbranded" box** — that truck has
   a logo, and the rebuild now reads it back.
4. Open the demo link **as a prospect would**, in a window where you have opened it before. *Expect:* the
   **welcome modal** — "Here's your menu", the new line about the orders being examples, the two things to
   try, the QR with the truck's logo on it. **Not** "That's exactly how a real order lands": the board was
   replaced, so the baseline resets and the welcome flag is cleared.
5. Dismiss it. *Expect:* a four-hour service on quarter-hour times, five-ish red, seven-ish amber, several
   green, and no over-capacity banner.
6. **Add Order → 16 of a burger.** *Expect:* only the quiet stretch around two-thirds through is offered;
   everything else is crossed with "Not enough time". Place it there and watch the strip turn.
7. **Now place an order as a customer** — scan the QR or tap the link. *Expect:* when it lands, the
   "That's exactly how a real order lands" panel appears. That is the moment it is for.

---

# Anything I could not establish

- **I did not create or rebuild a demo.** `/api/admin/provision-demo` is gated by `verifyAdmin` and answers
  `HTTP 401 {"error":"Unauthorised"}` from here; minting an admin session needs the service-role key, which
  the permission classifier refused in an earlier round and which I did not work around. Everything the
  rebuild would have shown is asserted against the real modules: the logo read-back and its warning, the
  panel ordering, the window and its clamp, and the board at 15/15/8.
- **Item 1's database evidence is from the code, not from a live read of that demo.** I did not query
  Between Buns Royston's `trucks.logo_storage_path`, because this task's LIVE-TRUCK RULE limits reads and
  writes to test-truck and demos this task creates or rebuilds, and I did neither. The diagnosis stands on
  the control flow — the copy block is skipped on the rebuild path, so `logoStoragePath` cannot be anything
  but `null` there — which is sufficient and is what the harness asserts.
- **The intro copy is for your approval.** The two new sentences are live in the component; if the wording
  is wrong, it is one edit in `DemoWelcome`.

---

# git status — after

**0 staged · 11 modified · 4 untracked.**

```
 M app/api/admin/provision-demo/route.ts    (previous round)
 M components/admin/CreateDemoModal.tsx     (previous round)
 M components/admin/OutreachPanel.tsx       (previous round)
 M components/dashboard/DemoLoopComplete.tsx  ITEM 2 — self-heal, and defer to the introduction
 M components/dashboard/DemoWelcome.tsx       ITEM 2 — the shared key, and the missing sentence
 M lib/demo-assumptions.ts                  (previous round)
 M lib/provision-demo-event.ts                ITEM 3 — four hours, same start rule, same clamp
 M lib/provision-demo.ts                      ITEM 1 — a rebuild reports the logo it has
 M lib/seed-demo-orders.ts                    ITEM 4 — the board's size is the kitchen's
 M scripts/harnesses.json                   (previous round)
 M scripts/seed-demo-grid.cjs                 one stale HEAD comparison restated
?? docs/demo-seed-parameters-report.md      (previous round)
?? lib/demo-board-build.ts                    ITEM 2 — the replacement test and the two flags
?? lib/demo-kitchen.ts                      (previous round)
?? scripts/demo-seed-parameters.cjs           extended for all four items
```

Plus `docs/demo-polish-report.md`, this report.

Nothing was staged, committed, stashed, reset or restored. The temporary HEAD worktree used for the lint
delta was removed. **No truck row, no `outreach_templates` row and no demo was written to by this task.**
