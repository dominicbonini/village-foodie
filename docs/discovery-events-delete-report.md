# `discovery_events` — delete control on the Events tab

---

# 0. 🔴 WHERE THE CODE AND THE DATA CONTRADICT THE MANUALS — READ FIRST

Three contradictions, and the first two change what you should expect tomorrow morning.

## 0.1 🔴 YOUR HYPOTHESIS IS WRONG, AND I CAN SHOW YOU WHY

You wrote: *"dedup compares candidate events against EXISTING rows — so a deleted row is not in the
comparison set and cannot suppress anything, meaning a re-scrape re-inserts it fresh."*

**The comparison set is the GOOGLE SHEET's Events tab, not `discovery_events`.** Deleting a database row
does not remove it from the dedup set, so the row stays suppressed and **the scraper will not re-create
it**. Traced in code, three links:

| # | What | Where |
|---|---|---|
| 1 | The dedup array is built from `eventData` — and `eventData` is `getTabData(sheets, TABS.EVENTS)` | `run-scraper.js:818-827`, source at `:450-455`, `TABS.EVENTS = 'Events'` at `:38` |
| 2 | `isDup` tests candidates against **that array only** — it never queries Supabase | `run-scraper.js:1549-1553` |
| 3 | The DB upsert is fed by `newRowsToAdd`, which is appended to **only inside `if (!isDup)`** | pushed `:1558`, upserted `:2296-2312` |

So a candidate that the Sheet already lists is dropped at step 2 and **never reaches the database write at
all**. The database is a mirror of *newly added* rows, not a set that is reconciled each run.

🔴 **THIS ALSO CORRECTS MY OWN `docs/discovery-events-table-report.md` §8**, which stated a deleted row
*"returns the next morning."* That was wrong. I had reasoned from "the scraper re-upserts from the source
page" without reading which set `isDup` compares against.

**A `DEDUP_FROM` switch does NOT exist yet** — the only occurrence of that identifier in the entire
repository is a comment at `run-scraper.js:471` describing planned work. When it lands (Sheet-migration
step 4), this inverts and your hypothesis becomes correct. The manual's "tombstone" warning is about
*that* future, not today.

⚠️ **The honest caveat:** this holds only while the Sheet still lists the row. The Sheet is pruned of
past-dated rows by `removePastEvents` in the Apps Script, so a **past-dated** row is not protected by
dedup — it is protected by the scraper's own historical-date filter instead. Either way it does not come
back.

⚠️ **A SECOND PATH EXISTS AND IT HAS NO DEDUP AT ALL.** `/api/inbound-schedule` upserts whatever the
caller POSTs, unconditionally (`route.ts:108-111`). Its caller is `mirrorEventsToSupabase` in the Apps
Script, called at `:458` (vendor-email scheduler) and `:767` (Drive screenshots) — both with **newly
appended rows only**, not the whole tab. So a deleted row returns through this path only if a vendor
emails or a screenshot re-supplies that same event. **Not a scrape; a re-submission.**

## 0.2 🔴 THE TABLE LOST ~3,400 ROWS SINCE YESTERDAY — "NOTHING DELETES" NO LONGER DESCRIBES REALITY

🧪 Measured live today (2026-09-09), count-asserted, header total = rows fetched = **896**:

| | manual / my report, 8 Sep | live, 9 Sep |
|---|---|---|
| total rows | **4,340** (my own §4) | **896** |
| **future-dated** (`>= today`) | **740** | **740** |
| past-dated | ~3,600 | **156** |

By month: May **312 → 8** · Jun **1,050 → 44** · Jul **1,072 → 52** · Aug **955 → 47**.

🔴 **The future rows are untouched at exactly 740 while past rows collapsed by ~96%.** That is the
signature of a past-only pruner acting on the **database**, which §8.3 of the scraper manual says has
never happened (*"No old event has ever been deleted from Supabase"*). Something removed them between the
manual's measurement and now.

⚠️ **What I did NOT establish:** what did it, when, or whether it was your own hand-run SQL. You said you
deleted **five** rows; this is ~3,400. **I am reporting the gap, not its cause.** Do not treat "nothing
deletes from this table" as true while planning around this feature.

## 0.3 ✅ WHAT THE MANUAL GOT RIGHT — VERIFIED, NOT REPEATED

**No FK points at `discovery_events`.** I did not take this on trust. I enumerated **all 76 tables
exposed by PostgREST** and asked each whether it can embed with `discovery_events`. Only two relate —
`discovery_trucks` and `venues` — and both are **forward** FKs (`discovery_events.venue_id`,
`.discovery_truck_id`), i.e. pointing *out*. Every other table, including `truck_events` and
`outreach_prospects`, returns `PGRST200 — no relationship`. Also 🔎 **zero** SQL files in the repository
contain `references discovery_events`.

**So a delete here cascades to nothing and is blocked by nothing.** The `outreach_prospects` NO-ACTION
block is on `discovery_trucks`, a different table, exactly as the manual says.

🔴 **BUT IT ALSO CLEANS UP NOTHING.** `/api/inbound-schedule` *promotes* some discovery events into
`truck_events` for linked HatchGrab trucks. There is no FK, so **deleting the discovery row leaves any
promoted `truck_events` row untouched.** That is deliberate — `truck_events` is what Pizzeria Gusto trades
on and this feature must never write to it — but it means "delete the event" means "delete the discovery
record", not "delete the event everywhere". Worth knowing before you use it on a linked truck.

## 0.4 An open question in the manual, now closed

§8.7 lists as unresolved whether RLS blocks DELETE (*"No policy in this repository grants DELETE on any of
them"*). 🧪 **The service role IS permitted to DELETE on `discovery_events`** — proven below without
deleting anything.

---

# 1. `git status`, verbatim, before any edit

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/admin/page.tsx
	modified:   app/api/admin/outreach/route.ts
	modified:   components/admin/OutreachPanel.tsx

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/api/admin/discovery-events/
	components/admin/DiscoveryEventsPanel.tsx
	components/admin/InlineField.tsx
	docs/discovery-events-table-report.md
	docs/discovery-run-log-migration-report.md
	docs/outreach-delete-guard-report.md
	docs/outreach-filter-ux-report.md
	docs/outreach-inline-edit-report.md
	docs/outreach-media-build-report.md
	docs/outreach-media-delete-report.md
	docs/outreach-media-report.md
	docs/outreach-modal-density-report.md
	docs/outreach-modal-flow-report.md
	docs/outreach-modal-layout-report.md
	docs/outreach-table-report.md
	docs/truck-name-matching-report.md
	lib/outreach-filter.ts

no changes added to commit (use "git add" and/or "git commit -a")
```

⚠️ **This differs from the snapshot taken when the session began**, which listed ~25 modified files
(`.gitignore`, `proxy.ts`, `vercel.json`, `ios/…`, many `docs/…`). The live status above is the
authoritative one. Flagging it rather than reconciling it silently. `git add -A` / `git add .` were not
run; nothing was staged.

---

# 2. DIAGNOSIS

## 2.1 The two upsert conflict targets — both still read that way

| Writer | Symbol / site | Conflict target |
|---|---|---|
| Scraper DB mirror | `run-scraper.js:2312`, inside `if (newRowsToAdd.length > 0)` | `onConflict: 'event_date,truck_name,venue_name'` |
| `/api/inbound-schedule` | `POST`, `app/api/inbound-schedule/route.ts:108-111` | same key, `ignoreDuplicates: false` |

Both confirmed by reading the current source. Unchanged from the previous report.

## 2.2 What the dedup rules actually prevent

Answered in §0.1. **Summary: dedup DOES stop a deleted event being re-created by the scraper — but not
for the reason you gave, and the mechanism matters because it expires.** It works because the Sheet is the
comparison set and the Sheet still remembers the row. The moment dedup is sourced from `discovery_events`
(Sheet-migration step 4), the protection disappears and your original reasoning becomes correct.

## 2.3 FK / cascade

Answered in §0.3. Nothing references the table; a delete cascades to nothing; nothing blocks it; and it
does **not** remove promoted `truck_events` rows.

---

# 3. WHAT WAS BUILT

## 3.1 The route — a real `DELETE`, not a POST action

`app/api/admin/discovery-events/route.ts`, new `export async function DELETE`.

- **Same gate:** `verifyAdmin(req)` then the module's service-role client — identical to `GET` and `POST`,
  and a **404** (not 401) for a non-admin so the route does not confirm its own existence.
- **A real HTTP `DELETE`, deliberately not a third `action` string.** The existing `POST` has exactly one
  action; a mistyped action must never fall through to a destructive branch. The method name is also its
  own audit trail in every log between here and Postgres.
- **One row per call, by `id`.** No array form, no filter form, no `all`.
- **It verifies the row actually went.** It reads the row first (to name it and to decide `wasFuture` from
  the stored date against the **server's** today), then `.delete().eq('id', id).select('id')`. **Zero rows
  returned ⇒ 404**, not a cheerful 200.
- **It logs the deletion** with truck, venue, date and whether it was future-dated — the first deletion
  path in this codebase should leave a trace.
- 🔴 **It never names `truck_events`.** Proven in §4.

## 3.2 The control and the dialog — 🔴 REUSED, NOT REBUILT

**I reused it, by MOVING it.** `ConfirmDeleteDialog` lived inside `OutreachPanel.tsx` and was not
exported. It is now `components/admin/ConfirmDeleteDialog.tsx`, imported by both panels.

**Why a move rather than a copy:** a second confirmation dialog for a second destructive action is exactly
the "reuse" that app manual §51.7 records as having produced a fourth independent implementation. Two
destructive dialogs that drift apart is the failure being avoided.

**Why a move rather than leaving it alone:** it was hard-coded to `kind: 'logo' | 'photo'` and to the
sentence *"This cannot be undone."* The events caller needs a different sentence for a future-dated row.
Your constraint permits touching shared code *"beyond what a new caller needs"* — this is the minimum a
new caller needs, so I read it as licensed rather than as a contradiction to stop on.

**What changed in the move:** `kind` became `title` / `confirmLabel`; the fixed sentence became
`children`. **Nothing else.** Focus, Escape, backdrop, busy-lock and in-place error are unchanged — proven
in §4.

Interaction requirements, all inherited from the existing dialog:

| Requirement | Mechanism |
|---|---|
| Cancel focused on open | `useEffect(() => cancelRef.current?.focus(), [])` |
| Escape closes **only** the dialog | window listener with `{ capture: true }` + `stopPropagation()` — the capture phase at window runs before the parent modal's bubble-phase listener regardless of registration order |
| Backdrop cancels | `onClick={onCancel}` on the backdrop; the panel calls `stopPropagation` |
| Nothing deletes without confirm | the row button only calls `setPendingDelete`; the dialog's `onConfirm` is the **only** caller of `deleteEvent` |

## 3.3 The warning differs by date — from server truth

The dialog names **truck, venue and date**, then:

- **Past-dated** → *"This cannot be undone."*
- **Future-dated** → that, **plus** an amber panel: *"This event is in the future. The source page may
  still list it, so a later scrape can re-create it. If it comes back, the source is still publishing it —
  deleting it again will not keep it away."*

🔴 **`isFuture` is `event_date >= serverToday`, where `serverToday` comes from the GET response**
(`route.ts` computes `new Date().toISOString().slice(0,10)` server-side and returns it as `today`). The
browser clock is never consulted. If the server date has not loaded, the code **warns as though the row
were future-dated** — the cautious side, and it says so on screen.

⚠️ **The warning's wording is deliberately weaker than "it will come back."** Per §0.1 the scraper will
*not* re-create it today. The honest statement is that a re-creation path exists (`/api/inbound-schedule`)
and that dedup's protection expires at Sheet-migration step 4. Promising either outcome would be a claim I
cannot support for every row.

## 3.4 After a successful delete — one array, three counts

```js
setEvents(es => es.filter(e => e.id !== id))
```

That is the **only** state edit. `events.length`, `orphanCount` and `unlinkedCount` are all `useMemo` over
that same array (`DiscoveryEventsPanel.tsx:199-200, 214-215`), and the visible list is `events.filter(...)`.
**No refetch, no second counter.** A separate counter would be a second source of truth that could
disagree with the list.

**Column arithmetic, re-derived from the current source:** widths `[190,110,120,200,140,150,150,56]`
**sum = 1116**, declared `minWidth = 1116px`, **surplus 0**. The 56px column was added *and* `minWidth`
raised by exactly 56 — because `table-fixed` distributes any surplus across every column, which is how the
other columns silently widened in an earlier task.

---

# 4. 🔴 PROOFS — AND WHAT EACH ONE'S FAILURE WOULD HAVE LOOKED LIKE

**P1 · `truck_events` is never touched.** Census over all four files: `route.ts` 2 hits, `DiscoveryEventsPanel`
1, `ConfirmDeleteDialog` 0, `OutreachPanel` 0 — **every hit is a comment**. Every `.from()` in the route
resolves to `discovery_events` (4×) or `discovery_trucks` (1×, the orphan key set).
*Failure mode:* a `truck_events` write hidden behind a helper. *Ruled out by* enumerating `.from(` rather
than grepping for the word.

**P2 · The service role can actually DELETE — proven without deleting anything.** 🧪 Executed live: a real
`DELETE /rest/v1/discovery_events?id=eq.<random uuid>` with `Prefer: return=representation`, after
confirming by GET that the id matched nothing. Result **200 `[]`**, and the row count **896 before and 896
after**. This proves the grant exists (closing manual §8.7) and exercises the exact zero-rows branch the
route turns into a 404.
*Failure mode:* RLS silently refusing DELETE, so the feature 500s in production the first time it is used.
*Ruled out by* executing the real verb against the real table.

**P3 · No bulk delete is reachable by malforming the request.** 🧪 Executed: `?id=a&id=b` → `"a"`;
`?id[]=a&id[]=b` → `null`; `?id=a,b` → `"a,b"` — `searchParams.get` always yields one string or null. And
🧪 executed against the live uuid PK: `*`, `a,b`, `''`, `eq.any`, `%` **all fail 22P02 before matching
anything**; a well-formed absent uuid returns `[]`.
*Failure mode:* a crafted id widening `.eq()` into a range. *Ruled out by* testing the actual column type,
not by reasoning about it.

**P4 · 🔴 The row leaves the screen ONLY if the server says it left the database.** This is the failure you
named — *"a delete that removes the row from local state but never reaches the database looks identical to
one that worked, until a reload."* I extracted the **shipped `deleteEvent` source text** from the
component and executed it against stubbed responses:

| Server response | Row removed? | Threw? |
|---|---|---|
| `200 {deletedCount: 1}` | **yes** | no |
| `200 {deletedCount: 0}` | **no** | "The server did not confirm a row was deleted." |
| `200 {ok: true}` (no count) | **no** | same |
| `404 {error: …}` | **no** | the server's own sentence |
| `500 {error: 'Delete failed'}` | **no** | "Delete failed" |
| `401`, body unparseable | **no** | "Delete failed (401)" |

**6/6.** The dialog stays open showing the server's sentence and the row stays put.
*Failure mode:* the optimistic-removal bug itself. *Ruled out by* running the real function, not a
transcription — the extraction asserts the three guard branches are present before executing.

**P5 · The counts cannot disagree with the list — and this proof is deliberately weak.** They are `useMemo`
over the one array, so they move together **by construction**.
🔴 *Failure mode you named, and I am not claiming otherwise:* **this agrees with itself whether or not
anything was deleted.** It is a consistency proof, not a persistence proof. Persistence rests entirely on
P2 and P4, and is only fully closed by a real delete followed by a reload — which I could not perform.

**P6 · The media dialog's behaviour survived the move.** Ten behaviour-bearing fragments compared before
vs after (focus-on-open, capture-phase Escape, `stopPropagation`, backdrop cancel, panel
`stopPropagation`, busy lock, in-place error, `alertdialog` role, `z-[70]`, red confirm) — **10/10 present
in both**. Rendered text unchanged: title `Delete the {kind} for {name}?`, button `Delete {kind}`,
sentence *"This cannot be undone."*; and the local duplicate is gone (`function ConfirmDeleteDialog(` no
longer appears in `OutreachPanel.tsx`).
*Failure mode:* a refactor that quietly changes a live destructive path. *Ruled out by* diffing behaviour
fragments against a pre-edit snapshot rather than eyeballing.

**P7 · 🔴 The styling I added can TAKE EFFECT.** The unlayered `!important` rule in `globals.css` targets
`input[type=…]`, `select`, `textarea` — **not `button`**. 🧪 Measured in headless Chrome against the
project's own compiled Tailwind (v4.3.1) with that block copied verbatim:

| element | class | computed font-size |
|---|---|---|
| **`<button>`** (my delete control) | `text-xs` | **12px — takes effect** |
| `<select>` | `text-xs` | 16px — **inert** |
| `<input type=text>` | `text-xs` | 16px — **inert** |
| `<span>` (control) | `text-xs` | 12px |

*Failure mode:* writing `text-xs` and assuming it applies, as happened with `text-sm` on every field in
this app. *Ruled out by* measuring, not reading.

**P8 · Compiler.** `tsc --noEmit` → **exit 0, 0 errors**. No `next build` (your dev server is live).

---

# 5. WHAT A SUPPRESSION TABLE WOULD REQUIRE — REPORTED, NOT BUILT

Not built: no table, no migration, no `deleted_at`, no tombstone write. What it would need:

1. **A table** — `discovery_event_suppressions(event_date, truck_name, venue_name, reason, created_at)`
   keyed on the *natural* key, not `id`: the row being suppressed no longer exists, and a re-scrape would
   mint a new `id` anyway.
2. **A scraper change** to consult it — which is explicitly out of scope here, and is the only thing that
   would make suppression actually bite. **A suppression table nothing reads is decoration.**
3. **A decision about the Sheet.** Today the Sheet suppresses by remembering. A DB-side tombstone would be
   a *second* suppression mechanism with different contents; they would need reconciling, or the Sheet's
   pruning would keep reopening the gap.
4. **It is a precondition of Sheet-migration step 4, not a follow-up** — both manuals say so, and §0.1
   confirms why: step 4 is exactly the change that removes today's protection.

**Stopping there.**

---

# 6. EVIDENCE CLASS

- ✅ **Executed against live data:** the 896/740/156 counts and the monthly distribution (count-asserted,
  header total = rows fetched); the 76-table FK sweep; the zero-row live `DELETE` proving the grant and
  leaving the count at 896; the malformed-id probes.
- ✅ **Executed, but against stubs:** P4's six response cases — real shipped source, simulated server.
- ✅ **Measured in a browser:** P7's font sizes, against the project's own compiled Tailwind.
- ✅ **Compiler-confirmed:** `tsc --noEmit`, 0 errors.
- ✅ **Structural, extracted from source:** the dedup trace (§0.1), both conflict targets, the `.from()`
  census, the `deleteEvent` call-site census, the column arithmetic, the P6 behaviour diff.
- 🔴 **Reasoned only, NOT OBSERVED:** that the control reads well in the table, that the dialog looks
  right, that a real delete round-trips. **No admin session is obtainable here. No control was clicked and
  no row was deleted through this feature. I claim no deletion succeeded.**
- 🔴 **NOT ESTABLISHED:** what removed ~3,400 past-dated rows since yesterday (§0.2). Reported as a gap,
  not attributed.

## The one thing to check tomorrow

Your five hand-deleted rows: on the evidence in §0.1 **the 06:00 scrape should not bring them back** if
they are future-dated and still listed in the Sheet's Events tab. If they *do* return, the most likely
explanation is not the scraper but `/api/inbound-schedule` — a vendor email or a Drive screenshot
re-supplying them. I could not identify which five rows you deleted, so I could not check them directly.
