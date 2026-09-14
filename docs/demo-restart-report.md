# Demo restart reachability, auto-restart on load, and the demo link in outreach

**Built 14 September 2026.** Nothing staged, nothing committed, nothing reverted. Item 7 (KDS) untouched.
The seeder capacity defect (0d) is **diagnosed only** — no line of `lib/seed-demo-orders.ts` was changed.

Every claim is marked **READ** (read in source this session) or **INFERRED**. Citations are by symbol.

---

## 🔴 PREMISES — what was wrong, and what is true instead

1. **"The outreach Create Demo build may still be uncommitted."** It is. 12 modified files and 7 untracked
   paths, all from that build plus three older doc edits. Verbatim in §0. Nothing was staged or reverted.
2. **The gate quoted in the prompt is exactly right** — READ, verbatim at HEAD:
   `demoServiceEnded = !!(isDemo && activeEvent && (activeEvent.status==='closed' || …end_time…))`.
   The diagnosis follows from it, and §1 replaces it.
3. **"…with no active event the first clause is false and the demo is a dead end."** Correct, and the
   cause is one line further out than the card: **`/api/events/manage?upcoming=true` applies
   `.gte('event_date', today)`** (READ), so a Saturday demo opened on Monday returns **zero** events.
   `upcomingEvents` is `[]`, so `pickDefaultEventByTime([])` returns null, so `activeEvent` is null. The
   card was never the thing that failed — the **event list** is.
4. **0d's premise is confirmed, with one addition.** READ: `DEMO_VAN_CAPACITY = null`
   (`lib/provision-demo.ts`), and `provisionDemoEvent` writes **no `slot_capacity` rows at all** when the
   van's `kitchen_capacity` is null (its own comment: *"No van-level total → no slot_capacity rows"*). So
   `kitchenCapacity` reaches the engine as null, `remainingTotal` is `Infinity`, and the global veto
   cannot fire — **every breach must be per-category**. The addition: a per-category breach has **two**
   shapes, not one — an ordinary cooking window, and the **event-start pile** (`pileByStart`), which sums
   *all* pre-open windows into one pseudo-window and compares that total against a single batch. The
   breach I reproduced is the second kind.
5. **Review §E said the restart is "user-triggered (button), not on load or poll."** That was true and is
   now deliberately half-false: §2 adds an automatic press **once per page load**, never on the poll.
6. **Pre-existing oddity, observed, NOT touched (out of scope).** At HEAD and still today, the line after
   `resolvePaidStep(truck, activeEvent)` is `??(selectedEventId && lastActiveEventRef.current?.id===selectedEventId ? lastActiveEventRef.current : null)` — a fragment that reads like the tail of the
   `activeEvent` fallback merged onto the wrong statement. Its visible consequence: **`activeEvent` is
   plainly `= resolvedEvent`** with no fallback, despite the comment above it promising *"Fall back to the
   last known event when upcomingEvents is transiently empty"*. That promise is inert. It does not affect
   this build (`setUpcomingEvents` is only ever called on a **successful** fetch, so the list cannot go
   transiently empty from a failure — proved in §V4), but it should be cleaned up separately.

### The two git commands, verbatim

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/api/admin/provision-demo/route.ts
	modified:   app/api/dashboard/route.ts
	modified:   app/api/demo/save-email/route.ts
	modified:   app/api/setup/route.ts
	modified:   app/dashboard/[token]/page.tsx
	modified:   components/admin/OutreachPanel.tsx
	modified:   components/dashboard/DemoWelcome.tsx
	modified:   docs/manual-update-report.md
	modified:   docs/reference-manual.md
	modified:   docs/scraper-reference-manual.md
	modified:   lib/demo-session.ts
	modified:   lib/provision-demo.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/demo/
	components/admin/CreateDemoModal.tsx
	docs/demo-outreach-build-report.md
	docs/demo-outreach-review-report.md
	lib/demo-logo.ts
	lib/self-serve-discovery-link.ts
	supabase/migrations/20260912_demo_sessions_outreach.sql

no changes added to commit (use "git add" and/or "git commit -a")
════
5e57c45 scraper
7a9b823 landing and scraper
6e1259b scraper updates
9e83a5e migration changes
69c4fdd migration changes
```

---

# PHASE 0 — DIAGNOSIS

## 0a · Is there a `truck_events` row, or is one not being selected?

**The chain, read by symbol:**

| step | symbol | what it does |
|---|---|---|
| 1 | `fetchAll` → `fetch(\`/api/events/manage?token=…&upcoming=true\`)` | the ONLY writer of `upcomingEvents` |
| 2 | `/api/events/manage` GET | `.eq('truck_id', truck.id)` · `.neq('status','cancelled')` · **`if (upcoming === 'true') query.gte('event_date', today)`** |
| 3 | `setUpcomingEvents(eventsData.events ?? [])` | success branch only; a non-ok response warns and **keeps** the old list |
| 4 | `selectedOrDefaultEvent` | `selectedEventId ? upcomingEvents.find(…) ?? null : pickDefaultEventByTime(upcomingEvents)` |
| 5 | `pickDefaultEventByTime` (`lib/time-utils.ts`) | `if (!events?.length) return null`; otherwise in-progress → earliest upcoming → **most recent past** |
| 6 | `resolvedEvent` → `activeEvent` | `const activeEvent: TruckEvent\|null = resolvedEvent` |

**Verdict — INFERRED for the specific truck, CONFIRMED for the mechanism.** Step 5 has a *past-event*
fallback, so if the Saturday row had reached the client the dashboard **would** have selected it and the
old `demoServiceEnded` **would** have fired. It did not, which means step 2 returned nothing. Two things
can produce that, and only the database can say which:

- **(a) the row exists, dated Saturday, and `.gte('event_date', today)` excludes it** — the expected
  state. Nothing deletes a demo's event between visits: `restartDemoService` (button only, not pressed),
  `provisionDemoEvent(replaceExisting)` (only via `/api/demo/return`, not clicked) and the cron's
  `deleteTruckCascade` (which would have removed the whole truck) are the only deleters (READ).
  `auto-event-scheduler` closes a prior-day event but never deletes it (READ, review C12).
- **(b) no row at all** — the event insert failed at provision time. Possible but unlikely here: the
  orphan sweep deletes any `demo-%` truck older than 2h that lacks a menu **or** an event, so a
  no-event demo built on Saturday should not have survived to Monday.

SQL to settle it is in §SQL, query 2. **Either way the fix is the same**, which is why §1 does not branch
on it: the card must render when there is no *live* event, whatever the reason.

## 0b · What the Select-event picker lists, and why a past demo event is excluded

**READ.** The picker is opened by `setPendingOpenEventPicker(true); setActiveTab('add')` and consumes the
same `upcomingEvents` array (passed to `AddOrderPanel` as `requestEventPickerOpen`). So in exactly the
state that produces the "No event selected" strip, **the picker is empty** — the button opens a list of
nothing. A past demo event is excluded twice over: at the server by `.gte('event_date', today)`, and at
the client because `upcomingEvents` is the only source the picker has.

A stale `?event=<id>` cannot strand the page: `urlEventParamRef` is a **one-shot** consumed on the first
resolution attempt, and membership is validated against `upcomingEvents` (`const owned = upcomingEvents
.find(e => e.id === fromUrl)`), so a deleted, cancelled, past or foreign id falls through to the priority
chain (READ, the auto-select effect).

## 0c · Every demo state with no live event, and whether it offered a route back

| # | state | `upcomingEvents` | `activeEvent` | route back BEFORE | AFTER |
|---|---|---|---|---|---|
| S1 | no `truck_events` row at all | `[]` | null | ❌ amber strip + empty picker | ✅ card |
| S2 | row exists, `event_date < today` — **the observed case** | `[]` (server filter) | null | ❌ | ✅ card |
| S3 | row today, `status='open'`, `now > end_time` | `[row]` | row | ✅ card | ✅ card |
| S4 | row today, `status='closed'` | `[row]` | row | ✅ card | ✅ card |
| S5 | row `status='cancelled'` | `[]` (`.neq`) | null | ❌ | ✅ card |
| S7 | `?event=` names a row that is gone, and nothing else qualifies | `[]` | null | ❌ | ✅ card |

(There is no S6: `demoEventWindow` always dates the event **today**, so a future-dated demo event is
unreachable. A demo event that has not *started* is treated as live, not ended — see §1.)

**Four of six states had no route back**, and S2 is the one a prospect actually arrives in, because it is
what "we sent the link on Saturday, they opened it on Monday" produces.

## 0d · 🔴 SEPARATE DEFECT — "1 slot over capacity" on a fresh demo (DIAGNOSIS ONLY, nothing changed)

**What the seeder targets — READ, `seedDemoOrders`.** It budgets **mains per COLLECTION SLOT**:

- `const ceiling = Math.max(1, args.capacity)` where `args.capacity` is `DEMO_MAINS_BATCH = 4`, a
  **constant** in `lib/provision-demo.ts`. It never reads `menu_categories.batch_size`, never reads
  `slot_capacity.max_orders`, never reads `slot_bookings`, and never models a production window.
- `budgets` are `Math.min(…, ceiling, mainsLeft)`, strided across the window; packing puts an order in
  `remaining.find(r => r.left >= shape.mains)` and returns `peakPerSlot` *"so a breach is provable"*.

**So its guarantee is: at most `ceiling` items of `shape.mains` per collection slot.** The capacity engine
measures something else entirely — `projectBackwardOccupancy` seats each production slot's load
**backward** on the prep grid (`numWindows = Math.ceil(N / batch)`, `startMins = deadline − (numWindows−i)
× prepMins`) and compares **per category per window**, plus the event-start pile.

**Can it overfill a cooking window while respecting collection slots? YES — and the mechanism is one line:**

```
const otherPool = others.length ? others : all
```

`others = all.filter(l => !l.cooked)`, and `cooked = menu_categories.prep_secs > 0`. **When an extraction
produces no instant-category items, `otherPool` falls back to `all` — which is the mains pool.** The
planner then charges only `shape.mains` against the slot budget while `shape.extras` (up to 3 per order,
`ORDER_SHAPES`) land as **cooked items too**. A slot budgeted 4 receives 4 counted mains *plus* every
uncounted extra.

**Reproduced with the real modules** (harness C — the real `seedDemoOrders`, the real
`detectCapacityBreaches`/`projectBackwardOccupancy`, `kitchenCapacity: null`, a 17:00–20:00 window):

| menu shape | orders | `peakPerSlot` (what the seeder believes) | cooked items in one slot (what the engine sees) | breaches |
|---|---|---|---|---|
| **Sample** — Pizza + Sides + Drinks | 37 | 4 / 4 | **4** | **0** |
| **Extracted** — `Mains` only | 37 | 4 / 4 | **14** | **4** — first: `17:00`, `over capacity at event-start`, `mains over 4` |
| Two cooked cats + Drinks | 37 | 4 / 4 | 4 | 0 |

**So yes: "some at max, none over" depended on the sample menu having non-cooked categories**, not on the
planner. The third row bounds it — the trigger is an **empty instant pool**, not the number of cooked
categories. `buildDemoAssumptions` makes this easy to hit: it applies `MAIN_PREP_SECS`/`MAIN_BATCH_SIZE`
to every category in `KNOWN_MAIN_CATEGORIES` **and**, when none match, to the most-populated category —
so a single-category extraction ("Mains") has every item cooked.

**Two further latent couplings, same area (not reproduced, stated as risks):**
- `DEMO_MAINS_BATCH` is a constant that happens to equal `MAIN_BATCH_SIZE`. Change either alone and the
  seeder's ceiling stops matching the committed `batch_size`. `/api/dashboard` reads `batch: c.batch_size
  || 1`, so a category with `prep_secs > 0` and `batch_size = 0` would be **batch 1** (READ).
- The budget is a **global** mains count; the engine's ceiling is **per category**. With two cooked
  categories the budget can be satisfied while one category's share is what matters.

**Proposed fix (not applied), in order of value:**
1. **Count what is actually cooked.** Charge the slot budget with every cooked line an order carries, not
   `shape.mains` — i.e. derive the charge from the lines after `lineFor`, or draw extras strictly from a
   non-cooked pool and place **no extras at all** when `others` is empty. The second is a two-line change
   and removes the class.
2. **Read the ceiling from the data.** Pass the committed `menu_categories.batch_size` for the chosen
   category instead of the `DEMO_MAINS_BATCH` constant.
3. **Budget per category**, so a slot's 4 are 4 *of one category* rather than 4 mains in aggregate.
4. **Assert rather than trust.** `seedDemoOrders` already returns `peakPerSlot` *"so a breach is
   provable"* — that number counts only `shape.mains`, so today it cannot prove anything. Return the
   per-category cooked peak instead, and have the admin panel fail loudly when it exceeds the batch.

---

# PHASE 1 — the restart is reachable with no event

**`app/dashboard/[token]/page.tsx`** (READ, edited).

- **`eventsLoaded`** — new state, set `true` **only** inside the `eventsRes.ok` branch of `fetchAll`.
  Without it `upcomingEvents` is `[]` on the first render and "no live event" would be true before the
  client had asked what was on the board.
- **`demoBoardLive`** — `!!(activeEvent && activeEvent.status!=='closed' && !(event_date && end_time &&
  Date.now() > <date>T<end_time>))`. A not-yet-started event counts as **live**, not ended.
- **`demoServiceEnded = !!(isDemo && eventsLoaded && !demoBoardLive)`** — the inversion. It no longer
  requires `activeEvent`, so no-event, closed and elapsed are one rule.
- **Both moved ABOVE the early returns**, beside `activeEvent`, because §2's hook reads them and
  `if(loading)return …` sits between the old position and the top of the component.
- **`demoEndedCard`** — the card JSX, defined **once**, rendered in both arms of the orders tab: the
  `activeEvent` arm (where `{demoServiceEnded && (…)}` used to be) and the `!activeEvent` arm, where it
  replaces the amber "No event selected" strip via `demoEndedCard ?? (<amber…>)`. **Copy and handler are
  byte-identical to what shipped** — the JSX was moved, not rewritten.

**Gusto:** `demoEndedCard` is null for an operator truck, so the amber strip and the picker are exactly
as they were. Proved in §V1.

# PHASE 2 — auto-restart on load

A `useEffect` keyed `[demoServiceEnded, token]`, declared above the early returns:

```
if(!demoServiceEnded)return                       // includes !isDemo and !eventsLoaded
if(autoRestartFiredRef.current||restartingRef.current)return
… localStorage claim, then …
startNewServiceRef.current?.()
```

- **It is a client-side POST after load, not a GET side effect.** It calls the same `startNewService` the
  button calls → `POST /api/demo/restart` → the triple-guarded `restartDemoService` (review C5), reused
  unchanged. **It does not route through `/api/demo/return`** — that is a GET that writes, deletes by
  `event_date` only, and rewrites `expires_at`.
- **Three guards, because one is not enough:**
  1. `autoRestartFiredRef` — synchronous, once per **page load**. The effect re-runs on every render,
     including those the 60-second `fallbackInterval` poll causes.
  2. `restartingRef` — the button's own in-flight latch, shared, so a click and this cannot race.
  3. `hg_demo_autorestart_<token>` in `localStorage`, **claimed before the POST** — the only guard that
     survives the `window.location.reload()` that `startNewService` performs on success, and the
     cross-tab guard. Cooldown `AUTO_RESTART_COOLDOWN_MS = 120_000`.
- **Why (3) is not optional.** `demoEventWindow` clamps the end to `23:59`, so a restart at 23:58 yields a
  board with about a minute left. Without a stamp that is restart → reload → still ended → restart, for
  ever. With it, the second load stands down and the visitor gets the card.
- **The button is deliberately NOT gated by the cooldown** — someone who presses "Start a new service"
  means it, whatever happened automatically a minute ago.
- **Concurrency, stated plainly.** Two tabs loading in the same instant: the stamp is claimed before the
  POST, so the second stands down (§V3). The residual race is the few milliseconds between read and
  write; if both did fire, the server calls serialise into a consistent end state rather than a half-built
  board — `restartDemoService` deletes orders **then** events truck-wide before creating its own, so the
  later call wipes the earlier one's work and reseeds. The one degraded outcome is the earlier call's
  `seedDemoOrders` insert failing its FK against a just-deleted event, which `restartDemoService` catches
  as a non-fatal warning (READ) — leaving one complete board, not two partial ones.

# PHASE 3 — the demo link in the outreach prospect modal

- **`/api/admin/outreach` GET** (READ, edited): one bulk read of `demo_sessions` keyed on
  `discovery_truck_id`, ordered `created_at desc`, expired rows skipped, newest kept, `liveCount`
  counted. **Guarded in the same capability-probe spirit the route already uses for `contact_name`** —
  the migration `20260912_demo_sessions_outreach.sql` is still unapplied, so an undefined-column error is
  logged and degrades to "no demo", never a 500 on the whole page. Response gains `demo` per prospect and
  a `hasDemoLinks` flag.
- **`OutreachPanel`** (READ, edited): the modal header shows **`DemoLinkChip`** when `modalProspect.demo`
  exists — the `/demo/<public_ref>` path as a link, a **Copy** button matching `CreateDemoModal`'s
  affordance, the **expiry date** via the page's own `fmtDate`, and `· newest of N` when `liveCount > 1`.
  When there is no demo it shows the **Create demo** button exactly as before. `onCreated` now calls
  `load()` so the chip replaces the button without a page reload.
- **🔴 The modal-on-modal trap is avoided by not opening a modal.** The chip renders **inside** the
  prospect modal that is already open: no portal, no overlay, no z-index, and **no new key listener**.
  The keydown-listener census is unchanged from HEAD (§V6). The Create flow still opens
  `CreateDemoModal`, whose stacking (inline `zIndex: 95`) and gated bubble-phase Escape are unchanged.
- `public_ref` null (a live demo with no readable segment) renders `demo · no link` rather than a broken
  URL.

---

# VERIFICATION

**Instruments, and what each would look like if it proved nothing.**

- `tsc --noEmit -p .` — exit 0 after every phase. *Null result:* the project excludes the edited files.
  *Control:* a deliberate `const bad: number = 'x'` made tsc exit **2** naming that file (run in the
  previous build on this same tree); the edited files are in the same program, which is why the ref-write
  and `any` findings below were attributable at all.
- **Harness A/B — the SHIPPED expressions, extracted from the source, not retyped.** `extract.mjs` slices
  `demoBoardLive`, `demoServiceEnded` and the auto-restart effect body out of `page.tsx` by marker and
  `new Function`s them. *Null result:* a harness that retypes the predicate proves only that I can retype
  it. *Excluded:* a failed extraction throws, and the harness prints the extracted text it ran.
- **Harness C — the real `seedDemoOrders` and the real `detectCapacityBreaches`.** *Null result:* a stub
  that returns whatever the assertion wants. *Excluded:* the sample-menu case runs through the identical
  code and comes back **clean** (0 breaches) — if the harness could only produce breaches, that case
  would have breached too.
- **ESLint** — the changed files' findings are **rule-for-rule identical to HEAD**. Two new ones appeared
  mid-build (`react-hooks/refs` from a render-time ref write, two `no-explicit-any`) and both were fixed;
  the ref assignment now lives in a `useEffect`.

**1 · An operator dashboard is untouched — the predicate.** `isDemo = token.startsWith('demo-')` (READ),
and `demoServiceEnded` has `isDemo` as its **first** conjunct, so it is permanently false on Gusto.
Harness A evaluates the shipped expression with `isDemo=false` across **all eight** states and gets
`false` every time — so `demoEndedCard` is null, the amber strip and picker render verbatim, and the
auto-restart effect returns on its first line. Structurally: `demo-` is a reserved prefix no operator
truck can carry (`assertReservedPrefix`), and `/api/demo/restart` refuses a non-`demo-` token **and** a
non-`demo-` resolved truck id. *Null result:* asserting `isDemo` appears in the file. *Excluded:* the
assertion runs the expression and reads its value.

**2 · Every 0c state now offers a route back.** Harness A drives the shipped predicate through S1, S2,
S3, S4, S5, S7 → `demoServiceEnded === true` in all six; two live states → `false`. The card is rendered
from `demoEndedCard` in **both** arms of the orders tab, so `activeEvent` null or not, it is on screen.
*Control:* the **old** predicate, run through the same eight states, disagrees on **4** of them — exactly
the no-event ones. A harness that could not tell the two predicates apart would prove nothing; this one
names the four.

**3 · Once per load, never on the poll.** Harness B executes the shipped effect body: 13 renders in one
load (mount + twelve 60-second poll re-renders) → **1** restart. Reload one second later → **0**. Again →
**0**. After the cooldown → **1**. Two tabs at the same instant → **1** in total. `restartingRef` already
true → **0**. `localStorage` throwing (private mode) → still **1** per load.
*Controls, both of which FAIL as required:* remove `autoRestartFiredRef` and the same 13 renders fire
**13** restarts; remove the `localStorage` claim and the reload **does** restart again.

**4 · A live event never triggers it.** `demoServiceEnded=false` over 20 renders → **0** restarts **and
nothing written to localStorage** (the stamp is only claimed on the acting path). A prospect refreshing
mid-service keeps their orders because the effect returns on line 1 — and `setUpcomingEvents` is called
**only** in the `eventsRes.ok` branch (READ), so a failed poll cannot empty the list and fake an ended
board; `eventsLoaded` likewise only flips on success.

**5 · GET still writes nothing.** Each verb searched **alone** in `app/api/dashboard/route.ts`:
`.insert(` **0**, `.update(` **0**, `.upsert(` **0**, `.delete(` **0**, `.rpc(` **0**. The page is
`'use client'` with no server component in `app/dashboard/[token]/` (only `page.tsx` and `kds/`), so a
bot fetch renders the shell and triggers nothing. *Positive control over the same greps:* `.delete(` → 4
in `lib/demo-restart.ts` and `.insert(` → 1 in `lib/seed-demo-orders.ts`, so the search finds write verbs
when they exist. My edit to `/api/dashboard` added two field mappings to an existing `select('*')` result
— no new query, no write.

**6 · The outreach modal shows the link and closes one layer.** The keydown census is **2 in
`OutreachPanel` now, 2 at HEAD**, plus the 1 in `CreateDemoModal` — this phase added **none**, which is
the only way to be certain nothing double-closes. An `EventTarget` model re-run: the C15 shape is
reproduced first as the control (listener 1's `stopPropagation` does not stop its sibling — both fire),
then the shipped arrangement: Escape #1 closes the child only, Escape #2 closes the prospect modal, and
with only the link chip on screen Escape closes the prospect modal and nothing else.

---

# Files touched

`app/dashboard/[token]/page.tsx` (Phases 1–2) · `app/api/admin/outreach/route.ts` and
`components/admin/OutreachPanel.tsx` (Phase 3). Nothing else: `lib/seed-demo-orders.ts`,
`lib/demo-restart.ts`, `app/api/demo/restart/route.ts`, `app/api/events/manage/route.ts`, the KDS, the
cron, `/manage` and `/api/admin/create-truck` are all unmodified.

# Open items

- **0d is unfixed by design.** The `otherPool` fallback is a live defect on any demo whose menu has no
  instant-category items; the fix is proposed above and not applied.
- `/api/events/manage?upcoming=true` still hides a demo's own past event from its own dashboard. §1 makes
  that harmless, but if the demo ever needs to *show* the ended service, the fetch is where to change it.
- The pre-existing `??` fragment after `resolvePaidStep` (premise 6) leaves `activeEvent`'s documented
  fallback inert.
- The add-order tab still renders `AddOrderPanel`'s own no-event state; the route back lives on the
  orders tab (the default) and, with §2, the no-event state is normally transient.

# SQL — for Dominic to run; **nothing here was executed**

**First, confirm the columns these queries name** (every one was read in source this session, but the
database is the authority):

```sql
select c.table_name, c.column_name, c.data_type
  from information_schema.columns c
 where c.table_schema = 'public'
   and (c.table_name, c.column_name) in (
     ('truck_events','event_date'), ('truck_events','start_time'), ('truck_events','end_time'),
     ('truck_events','status'), ('truck_events','auto_close'),
     ('demo_sessions','public_ref'), ('demo_sessions','discovery_truck_id'), ('demo_sessions','expires_at'),
     ('menu_categories','prep_secs'), ('menu_categories','batch_size'),
     ('menu_items_db','category_id'), ('orders','slot'), ('orders','items'),
     ('collection_times','production_slot'), ('slot_capacity','max_orders'))
 order by c.table_name, c.column_name;
```

**0a — does that demo have an event row, and would the dashboard's fetch see it?**

```sql
select te.id,
       te.event_date,
       te.start_time,
       te.end_time,
       te.status,
       te.auto_close,
       (te.event_date >= current_date) as passes_upcoming_filter,
       (te.status <> 'cancelled')      as passes_cancelled_filter
  from public.truck_events te
 where te.truck_id = 'demo-mcd75g9sxdktev5p0dprqhz4wc'
 order by te.event_date desc, te.start_time desc;
```

Zero rows ⇒ state **S1**. Rows with `passes_upcoming_filter = false` ⇒ state **S2**, the expected answer.

**0a — the session behind it (tier, readable URL, whether the outreach link is set):**

```sql
select ds.truck_id,
       ds.public_ref,
       ds.discovery_truck_id,
       ds.created_at,
       ds.expires_at,
       ds.expires_at - ds.created_at as retention,
       ds.claimed_by_operator_id is not null as claimed
  from public.demo_sessions ds
 where ds.truck_id = 'demo-mcd75g9sxdktev5p0dprqhz4wc';
```

**0d — the breach, per collection slot and per category, on that truck.** Rows returned are slots whose
cooked items exceed their own category's batch — i.e. the seeder's budget under-counted:

```sql
select o.slot,
       mc.name                                as category,
       sum((li ->> 'quantity')::int)          as cooked_items,
       max(mc.batch_size)                     as batch_size
  from public.orders o
  cross join lateral jsonb_array_elements(o.items) as li
  join public.menu_items_db mi
    on mi.truck_id = o.truck_id and mi.name = li ->> 'name'
  join public.menu_categories mc
    on mc.id = mi.category_id
 where o.truck_id = 'demo-mcd75g9sxdktev5p0dprqhz4wc'
   and o.status in ('pending','confirmed','modified','cooking')
   and coalesce(mc.prep_secs, 0) > 0
 group by o.slot, mc.name
having sum((li ->> 'quantity')::int) > max(mc.batch_size)
 order by o.slot;
```

**0d — which demo trucks are exposed to the `otherPool` fallback** (no instant-category items at all —
every one of these will over-seed its cooking windows):

```sql
select t.id,
       t.name,
       count(*) filter (where coalesce(mc.prep_secs, 0) > 0)  as cooked_items,
       count(*) filter (where coalesce(mc.prep_secs, 0) = 0)  as instant_items
  from public.trucks t
  join public.menu_items_db mi on mi.truck_id = t.id and mi.is_active
  join public.menu_categories mc on mc.id = mi.category_id
 where t.id like 'demo-%'
 group by t.id, t.name
having count(*) filter (where coalesce(mc.prep_secs, 0) = 0) = 0
 order by t.id;
```

**Sanity check for §0d's production-slot assumption** — a demo truck should have **no** `collection_times`
rows, so `production_slot` equals the collection slot (expect zero rows):

```sql
select ct.truck_id, count(*) as rows
  from public.collection_times ct
 where ct.truck_id like 'demo-%'
 group by ct.truck_id;
```

## Closing `git status`, verbatim (nothing staged)

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/api/admin/outreach/route.ts
	modified:   app/api/admin/provision-demo/route.ts
	modified:   app/api/dashboard/route.ts
	modified:   app/api/demo/save-email/route.ts
	modified:   app/api/setup/route.ts
	modified:   app/dashboard/[token]/page.tsx
	modified:   components/admin/OutreachPanel.tsx
	modified:   components/dashboard/DemoWelcome.tsx
	modified:   docs/manual-update-report.md
	modified:   docs/reference-manual.md
	modified:   docs/scraper-reference-manual.md
	modified:   lib/demo-session.ts
	modified:   lib/provision-demo.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/demo/
	components/admin/CreateDemoModal.tsx
	docs/demo-outreach-build-report.md
	docs/demo-outreach-review-report.md
	docs/demo-restart-report.md
	lib/demo-logo.ts
	lib/self-serve-discovery-link.ts
	supabase/migrations/20260912_demo_sessions_outreach.sql

no changes added to commit (use "git add" and/or "git commit -a")
```
