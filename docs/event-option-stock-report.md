# `event_option_stock` — a table every caller fails against

**Read-only investigation.** No file changed, no SQL run, no migration, no deploy.

---

## VERIFICATION

- **Executed:** `grep` across the repository and `git`-adjacent reads. **That is execution of my search,
  not of the product.**
- **NOT executed: any database query.** You said run no SQL and I ran none. 🔴 **So every statement about
  the table's schema is either taken from your ESTABLISHED facts or from documents in this repository —
  I have not read `information_schema` and do not assert its contents.**
- **No typecheck is offered as verification.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## THE HEADLINE

**Six access sites. Not one of them can succeed. And not one of them would tell you.**

🔴 **The three reads discard the error in the destructure. The two writes discard the result entirely
and return `{ success: true }` regardless.** The failure is not merely silent — **one of the two writes
reports success to the operator's dashboard for a row that was never inserted.**

⚠️ **And this table's emptiness has already been observed and MISDIAGNOSED.** The manual records
(V11.43): *"`event_option_stock` holds ZERO ROWS — it has never held data… Three tables that exist and do
nothing."* **That reads the zero rows as evidence of an unused feature. It is evidence of a broken
one** — and the distinction decides §4.

---

## 1. Every read and write, and what each does on error

**Six sites. I searched `.ts`, `.tsx`, `.sql`, `.js`, `.mjs`, `.cjs` and `.md` across the repository;
the remaining hits are comments and documentation.**

### READ 1 — `app/api/menu/[truckId]/route.ts:334-341`

```js
const { data: eos } = await supabase
  .from('event_option_stock')
  .select('option_id, stock_count, available')
  .eq('truck_id', truck.id)
  .eq('event_id', effectiveEventId)
;(eos || []).forEach((o: any) => { … })
```

🔴 **SWALLOWED IN THE DESTRUCTURE.** `error` is never bound. `data` is `null`, `(eos || [])` iterates
nothing, `eventOptionOverride` stays `{}`, and `effOption()` falls through to the `modifier_options`
template. **No log, no throw, no degraded flag.**

### READ 2 — `app/api/dashboard/action/route.ts:1150-1157`

```js
const { data: ovRows } = await supabase
  .from('event_option_stock')
  .select('option_id, stock_count, available')
  .eq('truck_id', truck.id)
  .eq('event_id', passedEventId)
  .in('option_id', optList.map(o => o.id))
;(ovRows as any[] | null || []).forEach(r => { … })
```

🔴 **SWALLOWED, identically.** `optList` keeps the template values. This is the operator add-order
required-group guard.

### READ 3 — `lib/option-stock.ts:93-99` (`buildOptionCeiling`)

```js
const { data: ov } = await supabase
  .from('event_option_stock')
  .select('option_id, stock_count')
  …
;(ov as any[] | null || []).forEach(r => { overrideById[r.option_id] = r.stock_count ?? null })
```

🔴 **SWALLOWED.** ⚠️ **AND THE SURROUNDING `try/catch` IS NOT WHAT HANDLES THIS.** `checkOptionCeilingShortfall`
wraps the call and comments *"FAIL-OPEN on error (never block a valid order on a blip)"* with a
`console.error`. **That catch never fires here** — PostgREST *returns* its errors in `error` rather than
throwing, so the error is discarded one level below the catch. **The fail-open behaviour is real; the
logging that was supposed to accompany it is not.**

### READ 4 — `lib/option-stock.ts:151-158` (`findSoldOutOption`)

```js
const { data: ov } = await supabase
  .from('event_option_stock')
  .select('option_id, stock_count, available')
  …
```

🔴 **SWALLOWED**, with the same never-firing `catch` above it.

### WRITE 1 — `app/api/dashboard/action/route.ts:1836-1838` (`set_modifier_option_available`)

```js
await supabase.from('event_option_stock').upsert({
  truck_id: truck.id, event_id, option_id: optionId, available: available !== false,
}, { onConflict: 'event_id,option_id' })
}
return NextResponse.json({ success: true })
```

🔴 **THE RESULT IS NOT CAPTURED AT ALL — there is no `const { error } =`.** The upsert fails, the `await`
resolves, and **the route returns `{ success: true }`.**

### WRITE 2 — `app/api/dashboard/action/route.ts:1858-1860` (`set_modifier_option_stock`)

```js
await supabase.from('event_option_stock').upsert({
  truck_id: truck.id, event_id, option_id: optionId, stock_count: next,
}, { onConflict: 'event_id,option_id' })
…
return NextResponse.json({ success: true })
```

🔴 **Identical.** **Success is reported for a write that did not happen.**

### Summary

| # | Site | Kind | Error handling |
|---|---|---|---|
| 1 | `menu/[truckId]/route.ts:334` | read | **Swallowed** — `error` unbound; falls back to template |
| 2 | `dashboard/action/route.ts:1150` | read | **Swallowed** — same |
| 3 | `lib/option-stock.ts:93` | read | **Swallowed**; the enclosing `catch` cannot fire |
| 4 | `lib/option-stock.ts:151` | read | **Swallowed**; same |
| 5 | `dashboard/action/route.ts:1836` | **write** | 🔴 **Result discarded; returns `success: true`** |
| 6 | `dashboard/action/route.ts:1858` | **write** | 🔴 **Result discarded; returns `success: true`** |

⚠️ **`lib/delete-truck.ts:52` and `docs/onboarding-flow.md` name the table only as a cascade path** — no
query. **`app/dashboard/[token]/page.tsx:2339` is a comment** above the callers.

---

## 2. What depends on it, and what people actually see

### The feature it is supposed to deliver — **READ**

**Per-event override of a modifier option ("extra") — its sold-out flag and its stock ceiling —**
so an operator can mark *Halloumi* sold out **for tonight's event only**, without touching the
`modifier_options` template that every other event and the Manage screen share.

The manual records why it exists (V7.9 → V8.0): the previous implementation UPDATEd the shared
`modifier_options` row, so **a per-event edit leaked into every event and into Manage.** This table was
Stage 1 of that fix.

### What the operator sees today — **READ from the client code, INFERRED as a sequence**

`app/dashboard/[token]/page.tsx:2342-2350`:

```js
patchOption(optionId,{available})   // optimistic
const r=await gatedAction({… action:'set_modifier_option_available' …})
if(r.queued)showToast('Stock saved')
```

**READ:** the UI patches the toggle **optimistically**, the server returns `success: true`, and
`showToast('Stock saved')` fires **only on the offline-queued path** — so online there is no toast.

🔴 **INFERRED (the sequence, not observed): the toggle moves, appears to hold, and then silently reverts
on the next refresh** — because the refresh re-pulls `/api/menu?event_id=…`, whose read (site 1) also
fails and resolves to the template. **The operator sees a control that works until they look away.**

⚠️ **I have NOT observed this in a browser.** It is the behaviour the three code paths compose to.

**Net operator-facing effect: per-event extras stock and sold-out control does not work at all, on
either live truck, and never has.**

### What the customer sees — **READ**

**Nothing wrong, and nothing per-event.** The menu falls back to `modifier_options` — the template. So
extras show their template availability and template ceiling. **The customer experience is coherent; it
is simply not event-scoped.**

### The order guards — **READ**

Sites 3 and 4 back the submit-time sold-out backstop and the option ceiling check
(`docs/stock-guard-bypass-report.md` rows 4 and 7). **Both fail open to the template.** So an extra
marked sold out *for this event* does not block an order — **but since the mark can never be stored, no
such state can exist.** ⚠️ **The guards are not weakened in practice, because there is nothing for them
to enforce.**

### 🔴 The one that is worse than "doesn't work"

**Write 1 and Write 2 return `success: true` for a write that failed.** The manual already records the
false-promise class as a shipped defect elsewhere (the old service-worker `{ok:true, queued:true}`).
**This is another instance, in the money-adjacent stock path, and it has been live for the life of the
table.**

---

## 3. The migration — **THERE ISN'T ONE**

🔴 **NO MIGRATION FILE CREATES THIS TABLE.** I searched `supabase/migrations/` for `event_option_stock`:
**zero hits.** I searched the whole repository for `create table … event_option_stock`: **zero hits.**

**The manual says why (V7.9, line 3971):**

> *"Migration `event_option_stock` applied by hand (`available` MUST be NULLABLE — corrects an earlier
> audit DDL)."*

### So I cannot report why `truck_id` is `uuid` — and that is the finding

**The DDL was never committed, so there is no artefact to read and no review trail.** Anything I said
about the author's intent would be invention.

🔴 **WHAT I CAN SAY IS STRUCTURAL, AND IT IS THE ROOT CAUSE: a table created by hand-run DDL that was
never committed is a table whose column types were never diffed against the 42 others.** Every sibling
table's `truck_id` is `text` because `trucks.id` is `text` — `lib/supabase.ts:27` types `Truck.id` as
`string` and `:29` types `truck_id` as `string`, and the manual records `trucks.id` as a slug with 17
FKs referencing it. **A committed migration sitting beside `20260612_event_item_stock_no_item_cap.sql`
would have made `uuid` visibly wrong in review.** ⚠️ **That is a mechanism, not a motive. I do not know
what the author was thinking.**

### Other inconsistent columns — **CANNOT ESTABLISH**

**There is no migration to inspect and I ran no SQL, so I cannot enumerate the table's columns or
compare them.** What the repository records, second-hand:

- **Key `(event_id, option_id)`** — both `upsert` calls use `onConflict: 'event_id,option_id'`.
- **`stock_count` and `available`, both NULLABLE** — manual V7.9, deliberately, *"because the dashboard
  sets stock + available via two independent toggles, so each must inherit independently."*
- **`truck_id`** — present, and per your established fact, `uuid`.

🔴 **AND NOTE WHAT THE KEY IMPLIES: `truck_id` IS REDUNDANT.** The uniqueness constraint is
`(event_id, option_id)`; `event_id` already determines the truck. **The only broken column is one the
table does not need.** That shapes §4.

---

## 4. Recommendation — **change the column type**

### First, dispose of one option: **"change the callers" is not available**

**Every caller passes `truck.id`, and `trucks.id` IS the slug — there is no uuid truck identifier
anywhere in the schema to pass instead.** Changing the callers would mean inventing one, or joining
through another table on every read. **It is not a smaller change; it is a schema change wearing a
different hat.**

### 🔴 And do not read the empty table as evidence the feature is unwanted

**You asked me not to assume the feature is wanted because the table exists. The inverse trap is the
live one here:**

> **The table is empty because every write fails, not because nobody tried.** Zero rows is what a broken
> INSERT looks like *and* what an unused feature looks like, and **this table cannot distinguish them.**
> ⚠️ **The manual already fell into this at V11.43** — *"three tables that exist and do nothing"* —
> reading a symptom of breakage as a verdict on demand.

**So there is no usage evidence either way, and I am not going to manufacture some.** What I can say:
the feature was built deliberately, to fix a real defect (per-event edits leaking into the shared
template and into Manage), and **that defect is not currently fixed — the dashboard toggles simply
no-op.**

### The recommendation

**Change `event_option_stock.truck_id` from `uuid` to `text`, and fix the six swallowed errors.**

**Why this over removal:**

| | |
|---|---|
| **Cost** | 🔴 **A one-column `ALTER` on an EMPTY table** — no backfill, no data migration, no lock of consequence, no rollback risk. **The cheapest fix available.** |
| **Restores** | Per-event extras control, which is the only reason the table exists |
| **Removal cost** | Removing it means either **deleting the dashboard toggles** (a visible feature loss) or **reverting them to write the shared template** — 🔴 **which reintroduces the exact V7.9 leak this table was built to fix.** Removal is not free. |
| **Reversibility** | If the feature turns out to be unwanted, **removing it later is easy — and you would then be removing it on evidence rather than on a symptom of a bug.** |

### What is lost by removal, stated plainly

**Per-event sold-out and per-event stock ceilings for extras.** An operator could no longer mark
*Halloumi* sold out for tonight without marking it sold out everywhere. ⚠️ **Whether any operator wants
that is UNKNOWN and unknowable from this table** — but two live trucks currently have a dashboard
control that silently does nothing, and that state should not persist under any of the three options.

### 🔴 The variant worth considering, since the broken column is redundant

**Drop `truck_id` entirely rather than retyping it.** The unique key is `(event_id, option_id)`;
`event_id` already implies the truck; the `.eq('truck_id', …)` filters are belt-and-braces on a column
that adds nothing.

- **For:** removes the inconsistency instead of correcting it, and one fewer denormalised column to
  drift.
- **Against:** it touches all six call sites, so it is a larger diff than the `ALTER`, **and it removes a
  defence-in-depth filter on a table that was RLS-disabled until August.**

**My recommendation stays the type change** — smallest correct fix, restores the feature, leaves the
"is this wanted?" question open and answerable. ⚠️ **But whichever is chosen, the swallowed errors must
be fixed in the same change**, or the next schema drift is equally silent.

⚠️ **Migrations are frozen. This is a recommendation, not an action.**

---

## 5. Monitoring — **nothing watches for this, and nothing would have**

### What I checked

- **`package.json` dependencies and devDependencies** for `sentry`, `datadog`, `bugsnag`, `logtail`,
  `opentelemetry`, `newrelic`, `rollbar` → **none.** (`@opentelemetry/api` appears only in
  `package-lock.json` as a transitive dependency of Next.js — not configured.)
- **Code and config** (`.ts`, `.tsx`, `.json`, `.yml`) for the same names plus "log drain",
  "pg_stat_statements", "advisor" → **no integration.**
- **`vercel.json`** — headers, crons and one function override. **No log drain, no alerting.**

⚠️ **An empty grep is not proof of absence, so state it as I found it: I found no error-monitoring
integration in this repository. A drain or alert configured in the Vercel or Supabase dashboards would
not appear here and I cannot see those.**

### Why this specific failure was invisible even to a perfect log drain

🔴 **THE ERROR NEVER REACHED A LOG.** It is not that nothing was watching the logs — **there was nothing
in the logs to watch.** All four reads discard `error` before anything could print it, and the two
writes discard the result entirely. **A 22P02 fired every 10–20 seconds against two live trucks and
produced zero application output.**

⚠️ **The two `console.error` calls that look like they cover this (`lib/option-stock.ts`) sit in
`catch` blocks that cannot fire, because PostgREST returns errors rather than throwing.** **Code that
appears to log this failure exists and is unreachable.** That is the same class the manual records as
*guards that read as protection and were wired to nothing*.

### What would have surfaced it

| Mechanism | Would it have caught this? |
|---|---|
| 🔴 **Binding `error` at the six call sites and logging it** | ✅ **YES — immediately, and it is the smallest fix.** One line each. **The failure would have announced itself the first time an operator touched an extras toggle.** |
| **Supabase Postgres logs / error-rate dashboard** | ✅ **YES.** The error was real at the database, whatever the app did with it. **A continuous 22P02 at this frequency is unmissable in the API/Postgres logs.** The manual already carries a backlog item — *"run Supabase's advisor query periodically"* — added after RLS was found by an email from Supabase rather than by us. **Same gap, same table.** |
| **An alert on non-2xx PostgREST responses** | ✅ **YES**, and it needs no application change. |
| **A row-count sanity check on write** (`upsert(...).select()` and assert one row) | ✅ **YES**, and it would additionally stop `success: true` being returned for a failed write. |
| **Vercel function logs** | 🔴 **NO.** Nothing was written to them. |
| **The zero-row observation** | ⚠️ **It DID happen — in V11.43 — and was misread as an unused table.** **The signal arrived and the diagnosis was wrong**, which is worse than no signal, because it closed the question. |

🔴 **THE PATTERN WORTH RECORDING: THIS PROJECT HAS NOW LEARNED THE SAME LESSON TWICE ON THE SAME
TABLE.** RLS-disabled was found by an email from Supabase. The broken column type was found by you
reading the schema. **Both times the discovering mechanism was external.**

---

## What I could not establish

1. **The table's full column list and types.** **No migration exists and I ran no SQL.** Everything in §3
   beyond your established facts is second-hand from the manual.
2. **Why `uuid` was chosen.** **The DDL was never committed.** I can describe the mechanism that let it
   through; I cannot read the intent.
3. **That the operator sees the toggle revert.** **INFERRED from three code paths, not observed in a
   browser.**
4. **Whether any operator wants per-event extras control.** **The empty table cannot answer it.**
5. **Whether a log drain or alert exists in the Vercel/Supabase dashboards.** **Outside this repository.**
6. **The exact 10–20 second cadence and the 22P02 code.** **Taken from your established facts; I did not
   query.**
