# Event pricing — fixes: the ON CONFLICT error, a denser grid, and finishing the render run

**Branch `schedule-graphics` only.** No branch switch, no push, no merge, no deploy. No SQL was run —
`supabase/migrations/20261013_event_item_prices_unique.sql` is written and handed over. Nothing read or
wrote any live trading truck. No card charge was created.

---

## Written for

Dominic, as the operator of this build and the person who runs the SQL.

---

# 1 · The "ON CONFLICT" error

## 1.1 First, which call actually fails — because it is not the switch

You reported the error on turning **"Change prices"** on. That switch cannot produce it. Reproduced by
reading the three code paths the grid can take:

| Call | File:line | What it does | Can it emit 42P10? |
|---|---|---|---|
| `set_type_pricing` — the **"Change prices" switch** | `app/api/event-types/route.ts:738` | a plain `UPDATE` on `event_types` (`price_change_on`, `price_mode`, `price_amount`, `price_rounding`) | **No.** No upsert, no `onConflict`, one table |
| `load` — the read that follows every save | `app/api/event-types/route.ts` `action === 'load'` | reads only — **zero writes** in the whole branch, verified | **No** |
| `set_type_item_price` — **typing a price into an item cell** | **`app/api/event-types/route.ts:759`, the upsert at `:808`** | `upsert(…, { onConflict: 'event_type_id,item_id' })` on `event_item_prices` | **YES — this is the one** |

```ts
// app/api/event-types/route.ts:808
const { error } = await supabase.from('event_item_prices').upsert({
  truck_id: truck.id, event_type_id: id, event_id: null, item_id: itemId,
  price, updated_at: new Date().toISOString(),
}, { onConflict: 'event_type_id,item_id' })   // ← 42P10
```

⚠️ **So the message you saw almost certainly came from the save that followed, not from the switch.** The
screen saves on every change and reloads after; a typed price in the same interaction (or a re-save of a
cell already holding one) is the call that throws, and the error surfaces on the screen that was open.
The fix below makes the distinction moot — both work — but it is worth recording that the switch was
never broken, because "the switch is broken" would have sent the next person to the wrong file.

## 1.2 Reproduced against the real database, non-destructively

Both ids set to an all-zero uuid, so **no row could be created by either attempt**:

| Attempt | Result |
|---|---|
| `upsert`, `onConflict: 'event_type_id,item_id'` | **42P10** — *"there is no unique or exclusion constraint matching the ON CONFLICT specification"* |
| the same row, **plain insert**, no `onConflict` | **23503** — foreign-key violation on `item_id` |

🔴 **That pair is the proof.** The plain insert reached **constraint checking**; the upsert never got
there. 42P10 is a **planning** failure specific to the conflict target, not anything about the row, the
RLS policy, the grants or the payload.

## 1.3 The cause, and your correction to my §4

20261011 created the uniqueness as two **partial** indexes:

```
event_item_prices_type_item_uidx  UNIQUE (event_type_id, item_id) WHERE event_type_id IS NOT NULL
event_item_prices_event_item_uidx UNIQUE (event_id, item_id)      WHERE event_id      IS NOT NULL
```

PostgREST's `on_conflict=` becomes Postgres' `ON CONFLICT (cols)`, and **conflict inference cannot target
a partial index.** It needs a non-partial unique index or constraint on exactly those columns.

> ⛔ **You were right and my report was wrong.** §4 said plain unique indexes "would allow duplicates
> because NULLs are distinct". That is true of NULLs in general and **false for this table**:
>
> - a **TYPE** row always has `event_type_id` set, so `UNIQUE (event_type_id, item_id)` is **fully
>   enforced** for it — there is no NULL in the first column to be distinct from anything;
> - an **EVENT** row always has `event_id` set, so `UNIQUE (event_id, item_id)` is fully enforced for it;
> - `event_item_prices_one_owner` — `CHECK ((event_type_id is not null) <> (event_id is not null))` —
>   guarantees **exactly one** owner, so **every row falls under one of the two constraints**.
>
> The NULLs-are-distinct concern bites only a row with **both** owners null, which the CHECK forbids. The
> predicates were buying nothing and they cost the upsert.

## 1.4 The fix — `supabase/migrations/20261013_event_item_prices_unique.sql`

**Not applied.** 127 lines, three sections, idempotent, ending in `notify pgrst, 'reload schema';`.

- **§0** a read-only preview: duplicate `(event_type_id, item_id)` pairs, duplicate `(event_id, item_id)`
  pairs, the row count (expect **0** — the upsert has never once succeeded), and rows breaking the
  one-owner CHECK. If any count is not 0, stop.
- **§1** one transaction. The **constraints are added before the partial indexes are dropped**, so the
  table is never without uniqueness. `ADD CONSTRAINT … UNIQUE` rather than `CREATE UNIQUE INDEX`, so the
  target can be inferred by columns (what the code does) **or** named with `ON CONFLICT ON CONSTRAINT`
  later. Both constraints carry a `COMMENT` explaining why they are plain.
- **§2** read-only verification from `pg_indexes` (expect two `UNIQUE (…)` with **no** `WHERE`, and no
  `*_uidx` row) and from `pg_constraint`.

⚠️ **20261011 is not edited.** It has been applied, and an applied migration is a **record of what ran**,
not a draft. It carries a correction header pointing at 20261013. The same principle applies to 20261012:
its date correction (§4 below) is inside a **comment** and changes nothing executable.

🔴 **The event-side constraint is made plain too, although nothing upserts onto it today** — the dashboard
sheet replaces an event's whole set with DELETE + INSERT, which needs no conflict target. Both halves of
the table now have the same shape, so a future upsert cannot hit the same 42P10.

## 1.5 Why 92 passing checks did not catch it — and the guard that now does

🔴 **`scripts/event-pricing.cjs` runs against a stub Supabase client, which has no query planner.** It
"upserts" happily. A database-level rule like this is **invisible to it**: 92 checks passed over a call
that could never have worked against Postgres. **A stub proves logic, never schema.**

New **section 7b** of that harness reads the **migrations** instead of the client. For every `onConflict:`
in `app/` and `lib/` it resolves the table from the nearest preceding `.from('…')` and requires a
**non-partial** unique declared in this repository's SQL — accepting `ALTER TABLE … ADD CONSTRAINT …
UNIQUE (…)`, a non-partial `CREATE UNIQUE INDEX`, a table-level `UNIQUE (a,b)` or `PRIMARY KEY (a,b)`
inside `CREATE TABLE`, and an inline single-column `col … UNIQUE`. Column **order** need not match. It has
**four self-tests**, one of them the exact partial shape 20261011 shipped.

**The two `onConflict` sites it cannot prove — reported, not changed, as you asked:**

| Site | `onConflict` | Why it cannot be proved |
|---|---|---|
| `venues` | `name,village` | the table is not created by any migration in this repository — its uniqueness lives only in the hosted database |
| `discovery_events` (`lib/discovery-gate.ts`) | `event_date,truck_name,venue_name` | same |

Both are **allowlisted by name** in an `UNPROVABLE` set, with a rot-check, so a **third** such site fails
the harness rather than joining them silently. ⚠️ Neither is partial as far as can be told from here —
they are unproven, not suspected. If either ever throws 42P10, the same fix applies.

**My first matcher produced 9 false positives** (it missed inline column `UNIQUE` on `van_devices.device_id`
and table-level `UNIQUE (a,b)` in `excluded_terms` and `whatsapp_alerts`). Parsing `CREATE TABLE` bodies
reduced it to the 2 genuine gaps above.

---

# 2 · The denser grid

**Schedule › Event types only.** ⛔ **The dashboard "Prices for this event" sheet is untouched** — you said
it is used by touch during service, and a 28px select is a poor target on an iPad at a hatch.

🔴 **So the two screens have separate constants**, in `components/shared/PriceControls.tsx`:

| | Grid (was → is) | Sheet |
|---|---|---|
| setting rows | 44 → **36px** (`ROW_H.control`) | — |
| item rows | 36 → **28px** (`ROW_H.item`) | — |
| category rows | 26 → **22px** (`ROW_H.category`) | — |
| section bands | 34 → **28px** (`ROW_H.section`) | — |
| selects / inputs | 32 → **28px** (`GRID_CONTROL_H`) | **`CONTROL_H` 32, unchanged** |
| typed-price box | 32 → **22px** (`GRID_TYPED_H`) | **32, unchanged** |
| switch | 44×24 → **38×22**, 16px knob either way | **44×24, unchanged** |
| row labels | **14px semibold** | — |
| item names | **13.5px regular** | — |
| section headings | **11px bold small caps** | — |

⚠️ **`CONTROL_H` genuinely was shared**, so the controls (`Select`, `PriceModeSelect`,
`PriceRoundingSelect`, `PriceAmountInput`, `PriceCell`) take an **optional `height`** and the grid is the
**only caller that passes one**. `ROW_H` was only ever the grid's, which is why those numbers moved freely.

🔴 **The compact switch is a PROP on the one shared `Toggle`, not a second component and not a local
restyle.** `compact` changes the track (38×22) and the travel (`translate-x-[18px]`) and nothing else —
same radius, same transition, same green-500/slate-300, same 16px knob — and **defaults to `false`**, so
all fifteen `page.tsx` usages and the dashboard card are **byte-identical**. `scripts/event-types.cjs`
still refuses a locally-styled switch in that modal; the product once had **three** switch definitions and
the modal's copy had taken the dashboard's orange geometry into a Manage screen.

## 2.1 ITEM PRICES is a section band with a pill

It was a row with a small "Hide" link at the right of its label cell. It is now **its own band, like PRICES
and SERVICE** — `{ k: 'items-band' }`, drawn by the same `isBand` branch as `section` — carrying
*"Press a price to type your own."* across the van columns and a **pill button immediately after the
heading text**: `Hide 23 items ▴` / `Show 23 items ▾`.

🔴 **The pill's position is load-bearing.** The grid scrolls **sideways**, so anything further right is
off-screen on exactly the truck with enough types to need it. Inside the band, right after the heading, is
the one position visible at every scroll offset — and the render harness measures that the pill's right
edge is inside the label column.

⚠️ **One thing was lost with the row, and it is named rather than hidden.** The old row's per-type cells
read "N typed" / "Menu prices"; a band has empty type cells, as PRICES and SERVICE do, so **that per-type
count is gone**. What survives is the evidence itself — a typed price is a blue outlined box in the item
rows — and the dashboard card's summary, which still says "N typed" for an **event**. Restoring it is one
cell in the band's `typeCells` branch; it was dropped to follow "a band like PRICES and SERVICE" literally.
`PRICES_TYPE_OFF_CELL` is kept in `lib/copy/serviceSettings.ts` as the record of it.

## 2.2 "None" blanks the Amount and the Rounding

`price_mode: 'none'` means **typed prices only** — no across-the-board change — so there is no amount to
enter and nothing for a rounding to round. `const ruleLive = on && pr!.price_mode !== 'none'` gates both
cells to **blank**, not an empty input and a faded select: two controls that could not affect anything, and
the Amount box in particular invited a number `cleanPriceAmount` would discard (its unit is `null` there).
⚠️ **The stored values are not cleared, only hidden** — switching back to `+ %` brings the operator's
amount and rounding back, the same promise the "Change prices" switch itself makes.

## 2.3 One real defect found while re-aiming

`stripeIndex` restarted the zebra counter at `section` and `category` but **not** at `items-band`. Today a
category always follows the band and resets it anyway, so the screen was right **by accident**; the day the
band has items directly beneath it, the parity of every item row would have been decided by how many
setting rows happened to sit above. **The band resets it now.**

---

# 3 · Finishing the render run

🔴 **`scripts/event-types-render.cjs` completed a full run for the first time: 1326 measurements passed,
0 failed, Chromium *and* WebKit, 1440 / 820 / 390, and all 20 screenshots taken.** Exit code 0.

Getting there found **three faults, all three in the measuring, none in the screen.** Each is a way a green
harness can lie, so each is recorded in the file and in §70.12.

**1 · A measurement against a stale build artefact.** The fixture lays out with the CSS from
`.next/static`, and the denser grid uses **arbitrary** Tailwind values — `w-[38px]`, `h-[22px]`,
`top-[3px]`, `translate-x-[18px]`. Tailwind emits a rule for one of those only if it was in the source when
the CSS was compiled, so against a pre-`compact` build the browser had **no rule for either dimension** and
the switch measured **0×0**. The harness then said *"the switch is 38×22 (0×0)"* **36 times** — which reads
as "the component draws no switch", a design fault that did not exist. The staleness check was a single
`overflow-x-auto` probe, present in every build this app has ever had; it now **reads the arbitrary classes
out of `primitives.tsx` and looks each one up in the CSS**, so a stale artefact says *"run `npx next
build`"* instead of blaming the component.

**2 · A rect measured inside a hidden subtree.** The grid (`hidden md:block`) and the phone column
(`md:hidden`) are **both in the document at every width** — the screen swaps them at the breakpoint rather
than rendering one. An unscoped `document.querySelector('[role="switch"] > div')` therefore took the
**phone** column's switch at 1440, inside `display: none`. ⚠️ **A hidden element's computed width still
reports `38px` while its `getBoundingClientRect()` is zero**; the two disagreed and only the rect was
asserted. The probe is now scoped to `#grid`. ⛔ It was **not** taught to ignore a zero rect — if the grid's
switch is ever genuinely unrendered, that must still fail.

**3 · A mutation variant that silently stopped mutating.** `event-types.cjs`'s **V29** proved the modal
defines no switch of its own by **replacing a literal call site**. The grid's switches gained `compact`, so
that exact text stopped existing, and `String.replace` of an absent needle **returns the string
unchanged**: the variant mutated nothing, the predicate still held, and the suite reported **"MUST FAIL BUT
PASSED"**. 🔴 That is the failure mode a mutation suite exists to catch, and it caught it in itself. The
needle is now **found, not typed** — the first `<Toggle` in the modal, whatever its props — and the variant
**throws** if there is none.

## 3.1 What else had to be re-aimed (nothing was loosened)

- **The toggle lifts.** `compact` turned the Toggle's track and knob from flat class strings into a base
  plus a ternary, so the two old `lift()` calls found nothing and the harness **refused to build** — which
  is the design: it would otherwise have gone on measuring a switch `primitives.tsx` had stopped drawing.
  Both arms are now lifted from the one definition and the fixture's switch is **assembled from the lifted
  pieces** rather than retyped, so the grid's 38×22 and the phone card's 44×24 both come from the component.
- **The height assertions** read `ROW_H`, `GRID_CONTROL_H` and `GRID_TYPED_H` **out of the component** in
  both scopes (the fixture builder and `main`), at ±2px, because a sub-pixel border is not a design fault.
  A measurement that typed its own copy of 36 or 22 would keep passing after the component changed.
- **The switch's expected size is read out of the lifted class string**, not typed as two numbers.
- **New probes:** `rowHeights` (by `data-rowkind`, on every body row's label cell), `switchBox`,
  `itemsToggle`, `itemsHint`, `priceCell`, `firstStdHdr`.
- **`event-types.cjs`:** the pill assertion re-aimed from the removed `price-items-header` to `items-band`
  plus "it is in column 1"; the heading-row divider assertion to `isBand`; the band asserted to get the
  **same** `SECTION_BG` from the **same** expression; the stripe reset asserted to include the band; the
  height figures re-aimed to 36/28/22/28 **and** `CONTROL_H === 32` asserted alongside, so a future tidy
  that "unified" the grid and the sheet fails here rather than at the hatch; and the import assertion
  changed from pinning the statement's **wrapping** to checking **which names** are imported — adding two
  constants re-wrapped the line and broke a check that cared about neither.
  ⚠️ That last one also had a real bug: `[\s\S]*?` started at the file's **first** `import {` (React's) and
  swallowed three statements. `[^}]*?` cannot cross an earlier `}`.

---

# 4 · The dates

Everything §70.9–§70.11 describes was built on **5 October 2026**, in one sitting. Earlier drafts dated the
pricing work "11 October" and the cash-per-van addition "12 October" — those are **migration filenames**
(`20261011`, `20261012`, `20261013`) read as dates.

**35 authorship dates corrected across ten files:**

| File | n |
|---|---|
| `scripts/event-types.cjs` | 10 |
| `components/manage/EventTypes.tsx` | 7 |
| `docs/reference-manual.md` | 4 |
| `docs/event-pricing-report.md` | 3 |
| `scripts/event-types-render.cjs` | 3 |
| `components/shared/PriceControls.tsx` | 2 |
| `components/dashboard/ThisEventCard.tsx` | 2 |
| `lib/copy/serviceSettings.ts` | 2 |
| `supabase/migrations/20261012_van_cash_and_type_values.sql` | 1 (comment) |
| `components/dashboard/EventPricesSheet.tsx` | 1 |

⚠️ **Two "12 October" strings in the manual are left alone** — Between Buns Royston's demo truck really
does expire on 12 October. That is a product fact, not a byline, and sweeping it would have introduced an
error while fixing one.

`docs/event-pricing-report.md` carries a corrections note at the top: the wrong dates, the wrong §4
partial-index claim, and the fact that the render harness has since finished.

**Manual:** §70.9's partial-index claim replaced by the correction block (including the stub-client lesson
and §7b); §70.11 "The denser Event types grid"; **new §70.12 "What finishing the measurements taught"** —
the three harness faults, the stripe defect, the date correction, and what was run.

---

# 5 · What was run

| | |
|---|---|
| `scripts/event-pricing.cjs` | **✅ 104 passed · 14/14 variants caught** |
| `scripts/event-types.cjs` | **✅ 154 passed · 42/42 variants caught** |
| `scripts/event-types-render.cjs` | **✅ 1326 measurements passed · 0 failed**, both engines, 1440/820/390, **all 20 PNGs regenerated — none stale** |
| `npx tsc --noEmit` | clean |
| `npx next build` | clean |
| ESLint, touched files | the six touched components/routes: **0 problems** |
| ESLint, repo-wide | 1615 vs **1605** at HEAD. All +10 are in the new `scripts/event-pricing.cjs`: **5 `no-require-imports`** — the same count `scripts/event-types.cjs` and every other `.cjs` harness carries — and 5 warnings, which I then cleared, so the delta is now the 5 CommonJS errors alone |
| `run-harnesses.cjs --dry-run` | all 88 listed files pass the source screen (no `createClient`, no service-role key, no `googleapis`, no card-processor SDK, no non-local `fetch`) |

**The 20 screenshots under `docs/screenshots/event-types/` are all from one clean run, verified by
bracketing it** — the run started 08:18:58 and ended 08:19:05, and all 20 PNG mtimes fall inside that
window (08:19:00–08:19:05), with no harness process left running afterwards. **Nothing is stale.**

⚠️ **This needed checking twice, and the first check was wrong.** An earlier set had **mixed** timestamps
across three different minutes: the full sweep I had accidentally started was **still running its own copy
of this harness** and overwriting the same files, so "all 20 from the passing run" would have been a false
claim about three of them. The harness was re-run in the foreground, alone, with a timestamp either side.

🔴 **And that is very likely the "unexplained slowdown" from the earlier report.** This run takes **7
seconds**. The runs that felt minutes long were competing with other copies of the same harness driving the
same two browsers — overlapping runs of my own, not anything on your machine. That retraction (§5.1) stands
as written; this is the explanation it was missing.

Chromium's element screenshot had been hanging to the protocol timeout on earlier attempts — it did not on
this run, and the guard that stops one unviewable PNG from discarding the measurements after it stays in
place either way.

## 5.1 Process

⚠️ **Two process notes against myself.** I passed `--only` to `run-harnesses.cjs`, which has no such flag,
so it began the **full three-hour sweep**; I stopped it by the task id I had recorded, printed what I was
stopping, and used `--dry-run` instead. I also stopped five stale `until … sleep` wait-loops of my own from
earlier aborted runs, by id, after naming them. **Nothing was killed by name or pattern.**

⛔ **The earlier claim that "15 orphaned browser processes were starving the render harness" was wrong** and
is retracted in `docs/event-pricing-report.md`: the grep matched macOS's own
`/System/Library/Frameworks/WebKit.framework` XPC services, none of them mine. ✅ **The slowdown now has an
explanation, and it was mine:** overlapping copies of this harness — launched by me, including the one the
accidental full sweep started — driving the same two browsers at once. Run alone it takes **7 seconds**.

---

# 6 · The SQL, and how to test it

The full migration is in `supabase/migrations/20261013_event_item_prices_unique.sql` and in the chat
message accompanying this report, as three fenced blocks: **§0 preview (run alone, first)**, **§1 the
change**, **§2 verification**. Run §0, confirm every count is **0**, then §1, then §2.

**Then, on Pizza Kitchen only** (never Pizzeria Gusto or any other live trading truck):

1. Schedule › Event types › **"Change prices" ON** for Market — saves with **no error**.
2. Press an item's price, **type 9.50**, press away — it saves, the cell becomes a **blue outlined box**.
   ⛔ This is the call that was throwing 42P10.
3. Clear that typed price — the cell returns to the rule's price.
4. Set the mode to **None** — **Amount and Rounding go blank**. Set it back to **+ %** — your amount and
   rounding **come back**.
5. The **ITEM PRICES** band: darker, bold small caps, the hint across the van columns, and the pill
   `Hide N items ▴` right after the heading. Press it — the whole band's items fold away and it reads
   `Show N items ▾`. Scroll the grid **sideways** with several types — the pill stays visible.
6. The rows are visibly denser (settings 36px, items 28px) and the switches are smaller (38×22), while the
   **dashboard "Prices for this event" sheet is exactly as it was**.
7. **From here the test list in §9 of `docs/event-pricing-report.md` applies unchanged, from its step 5
   onward** — the pricing arithmetic, the event-versus-type precedence, the ambiguous-date refusal, cash
   per van, "Same settings for all vans", and a new type copying Van 1's values.

⚠️ Card payments: test with **pay-at-hatch** orders only. No real charge was created in building this and
none is needed to test it.
