# First-open restart for demo dashboards (T2), alongside the not-live restart (T1)

**Built 14 September 2026.** Nothing staged, committed or reverted. Item 7 (KDS), the seeder, the
capacity engine, the cron, `/api/events/manage`, `/manage`, `/api/admin/create-truck` and the `??`
fragment after `resolvePaidStep` are untouched.

Every claim is marked **READ** (read in source this session) or **INFERRED**. Citations are by symbol.

---

## 🔴 PREMISES — what was wrong, and what is true instead

1. **"`20260912_demo_sessions_outreach.sql` IS applied."** Accepted, and **the file's own header said
   otherwise** — it still read *"⚠️ NOT YET APPLIED"*. That is the fifth instance of the family
   `20260723_demo_sessions_phase4.sql` and `20260728_demo_sessions_extraction_source.sql` each exist to
   record, and it is the dangerous direction: an applied file whose header says "not applied" invites
   someone to append columns to it, where `add column if not exists` runs clean and adds **nothing**.
   **I corrected that one header line in place** (SQL comment only, no statement changed) and the new
   migration's header names the trap. Flagging rather than silently leaving it.
2. **"§2's trigger is `demoServiceEnded` = no live event… the not-live rule cannot express [first
   open]."** CONFIRMED, READ: `demoServiceEnded = !!(isDemo && eventsLoaded && !demoBoardLive)` and
   `demoBoardLive` is true for a `status:'open'` event whose `end_time` has not passed. A 10:00–13:00
   event opened at 10:40 is live, so T1 stood down correctly. This is a spec gap, not a bug in T1.
3. **"Both triggers reuse `restartDemoService` unchanged."** True — `lib/demo-restart.ts` is untouched
   by this task. But `startNewService` (the client function) and `/api/demo/restart` (the route) both
   changed: the route gained the claim and the admin gate, and the client now tells the two outcomes
   apart. The *library* is unchanged; the *path to it* is not, and the report says so rather than
   letting "unchanged" cover more than it should.
4. **One thing the brief did not mention that the build needed:** `startNewService`'s POST carried no
   auth header. On web the session cookie rides along automatically (same-origin `fetch`), but the
   **native app has no cookie and passes its session as a Bearer** — so without `nativeAuthHeader()` the
   server-side admin check would have been blind in the iPad shell and Dominic's native preview would
   have consumed the first open. Added.

### The two git commands, verbatim

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
	modified:   lib/demo-restart.ts
	modified:   lib/demo-session.ts
	modified:   lib/provision-demo.ts
	modified:   lib/seed-demo-orders.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/demo/
	components/admin/CreateDemoModal.tsx
	docs/demo-outreach-build-report.md
	docs/demo-outreach-review-report.md
	docs/demo-restart-report.md
	docs/demo-seeder-capacity-report.md
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

# THE MIGRATION — `supabase/migrations/20260914_demo_sessions_first_opened_at.sql` — 🔴 NOT APPLIED

One nullable column, `add column if not exists`, no default, no index, no row touched:

```sql
alter table demo_sessions add column if not exists first_opened_at timestamptz;
```

**Why nullable with no default:** NULL means *never opened*, and every existing row is NULL — which is
exactly right. `NOT NULL DEFAULT now()` would have back-dated every demo already in flight to "already
opened" and silently disabled the feature for precisely the links Dominic has already sent.

**Why no index:** the only read is by `truck_id` (the primary key) and the only write is the conditional
update on that same key; `demo_sessions_pkey` serves both. The full SQL, including the VERIFY block, is
in §SQL and in the file.

---

# THE BUILD

## Where the latch lives, and why it cannot be `localStorage`

READ, and this is the whole reason for a migration: T1's guard is `hg_demo_autorestart_<token>` in
`localStorage`, which is correct for what it guards — a restart→reload loop inside one browser. It
cannot carry T2. A prospect who opens the link on their phone and then on their laptop is **one person
opening one demo once**, and two browsers hold two stamps, so a `localStorage` first-open would restart
twice. Only the server can answer "has this link been opened before". T1's stamp is unchanged and stays.

## `claimDemoFirstOpen` (`lib/demo-session.ts`, new) — the atomic claim

```
update demo_sessions
   set first_opened_at = <now>
 where truck_id = $1
   and discovery_truck_id is not null
   and first_opened_at is null
returning truck_id
```

- **Compare-and-set, not read-then-write.** The predicate is part of the UPDATE and `.select('truck_id')`
  makes the affected-row count observable — an UPDATE matching nothing is not an error in PostgREST, so
  checking `error` alone would let the zero-row case through (the same lesson as the promote's
  `.is('hatchgrab_truck_id', null)` guard).
- **How two simultaneous opens produce one restart, and what the loser does.** Both statements target the
  same primary-key row, so the second blocks on the first's row lock. When the first commits, the second
  re-evaluates its `WHERE` against the updated row under **READ COMMITTED** (EvalPlanQual), sees a
  non-null `first_opened_at`, and matches **zero rows**. No advisory lock, no explicit transaction, no
  serialisable retry. The loser receives `{claimed:false, reason:'already-opened'}`, the route answers
  `restarted:false`, and the client **does not reload and shows no error** — nothing failed, nothing was
  done.
- **Four distinct refusals, classified with one extra read** taken only on the not-first-open path:
  `already-opened`, `not-outreach`, `no-session`, `unavailable`. Collapsing them would make the logs
  useless.
- **Anonymous demos are excluded in the SQL predicate, not by a caller**, so no future caller can forget
  it — see below.

## Does T2 apply to an anonymous landing-page demo? **No — and the justification is in the code**

READ, `components/landing/DemoUpload.tsx`: on success it calls
`window.location.assign(data.redirectTo)` — the visitor is navigated to `/dashboard/<token>` **the
instant `/api/demo` answers**. READ, `lib/provision-demo.ts`: that same call seeded the board with
`seedDemoOrders(…, { now })` against the same clock. So an anonymous demo's first open is seconds after
its board was built **for that moment** — there is nothing stale to fix, and a restart would delete the
orders the visitor just watched appear and add another ~10–20 s to a flow whose promise is "about 30
seconds". An outreach demo is the opposite shape: built by an admin at one moment (`CreateDemoModal`
shows the link and deliberately does **not** navigate), opened by a prospect at another, possibly days
later. A returning anonymous visitor is already covered — `/api/demo/return` re-provisions, and a
bookmarked stale board is what T1 exists for.

**Proof the anonymous path is otherwise unchanged:** §V-effect shows `demoFirstOpenPending` is false for
`discovery_truck_id: null`, T2 never fires, and T1 fires **exactly as before, with no claim flag**, for
both the live and the ended case.

## `/api/demo/restart` — the gate

READ, the route's own responses: `admin-preview` and each claim refusal return
`{ok:true, restarted:false, skipped:<reason>}` and **return early, before `restartDemoService`**; the
restart path returns `{ok:true, restarted:true, firstOpen:true}`. Without `claimFirstOpen` in the body
(the button, and T1) the route is byte-identical in behaviour to what it was — the whole block is inside
`if (claimFirstOpen)`. It remains **POST-only** (READ: `export async function POST` is the only handler).

### How an admin is identified, and what happens when the check cannot run

**`verifyAdmin(req)`** (`lib/auth/admin.ts`) — the canonical check, the same one `/api/admin` and the
landing gate use: the Supabase session **cookie** on web, resolved first; failing that, and only when a
`NextRequest` is supplied, the **`Authorization: Bearer` JWT** the native shell sends; then
`operators.is_admin` on the resolved user. The client makes the same decision before POSTing at all, but
**that is an optimisation, not the guard**: `isAdmin` on the dashboard is resolved asynchronously by the
`/api/auth/me` effect (READ) and is `false` for the first moments of every load, so a client-only check
would let an admin's own preview consume the first open in the race.

**When the check cannot run it FAILS OPEN** — the `try/catch` logs and treats the viewer as a prospect,
so the claim proceeds. Deliberate, and it is the cheaper error in both directions: a prospect landing on
a stale board is the defect this task exists to remove, whereas an admin whose preview consumed the
first open still has the "Start a new service" button and can see exactly what the prospect will see by
pressing it.

## The client — ordering, and one restart per load

READ, `app/dashboard/[token]/page.tsx`:

```
demoFirstOpenPending = !!(isDemo && !isAdmin && demoSession && demoSession.discovery_truck_id && !demoSession.first_opened_at)
```

One effect, T2 first:

| | condition | action |
|---|---|---|
| **T2** | `demoFirstOpenPending && !firstOpenChecked` | `startNewService({claimFirstOpen:true})`; if the server declines, set `firstOpenChecked` so T1 gets its turn **on the same load** |
| **T1** | `demoServiceEnded` | the existing path, unchanged, including the `localStorage` cooldown |

- **T2 is asked first** because its question is narrower and its answer is authoritative: if this is the
  first open the board is being rebuilt regardless of whether the current one is live, so evaluating "is
  it live?" first would ask a question whose answer cannot change the outcome.
- **Separate latches.** `firstOpenAttemptedRef` (T2) and `autoRestartFiredRef` (T1). Sharing one would
  have meant an admin previewing a **dead** demo got no restart at all — §V-effect asserts that case.
- **`!isAdmin` is folded into the predicate** rather than checked inside the effect, so an admin simply
  never has a pending first open; no state write, and no new lint finding.
- **Only one restart per load**, three ways over: T2 returns before reaching T1; `restartingRef` is a
  single synchronous latch shared by the button and both triggers; and a real restart reloads the page.
- **What the client reads is a cache, not the decision.** `first_opened_at` from `/api/dashboard` only
  decides whether it is worth asking. A stale null costs one POST answered `skipped: already-opened`,
  never a second restart.

## 🔴 Still not a GET side effect

The claim-and-restart is a **client-side POST after the page has loaded**. `/api/demo/return` — the GET
that writes — is not involved. §V7 re-runs review §E's greps with a positive control.

---

# VERIFICATION

**The instruments, and what each would look like if it proved nothing.**

- **`tsc --noEmit -p .` — exit 0.** *Null:* the file is outside the program. *Excluded:* it failed three
  times during this build (the ref type, the button's `MouseEvent` reaching the options parameter, the
  return type) and each had to be fixed.
- **ESLint on the four changed files — rule-for-rule IDENTICAL to HEAD.** One new
  `react-hooks/set-state-in-effect` appeared mid-build and was removed by folding `!isAdmin` into the
  predicate.
- **Harness A** drives the REAL `claimDemoFirstOpen` against a stub whose UPDATE honours its WHERE the
  way Postgres does. **Harness B** extracts the **shipped** predicate and effect body out of `page.tsx`
  by marker and executes them — a failed extraction throws. **Harness C** calls the REAL
  `demoEventWindow`. *Null:* a stub that answers whatever is asked, or a harness that retypes the logic.
  *Excluded by the controls below, each of which FAILS first.*

**1 · Gusto and every operator truck untouched — the predicate.** `isDemo = token.startsWith('demo-')`
(READ). The effect's **first line** is `if(!isDemo)return`, and `demoFirstOpenPending` has `isDemo` as
its first conjunct. §V-effect runs the shipped effect with `isDemo=false` and every other input set to
fire: **zero calls**. Server-side, `/api/demo/restart` rejects a non-`demo-` token (403) and a
non-`demo-` resolved truck id (403), and `claimDemoFirstOpen` refuses a non-`demo-` id **before issuing
any statement** (asserted: the stub's statement log is empty). `demo-` is a prefix
`assertReservedPrefix` forbids on an operator truck. `lib/demo-restart.ts` is unmodified.

**2 · First open of a LIVE event restarts, from the visitor's own time.** The shipped effect with a live
board (`demoServiceEnded = false`) and a fresh outreach session fires **exactly one** restart carrying
`claimFirstOpen: true`, across 13 renders. And the window it produces, from the REAL `demoEventWindow`:

```
  built 09:05 → 09:00-12:00   ·   first open 10:40 → 10:30-13:30
```

Dominic's case exactly. Across 10:40 / 17:00 / 21:29 / 23:40 the start is always **now floored to the
half hour (0–29 minutes back, never ahead)** and the end `+3h` clamped to 23:59.

**3 · Second open does not restart — across a different browser, not just a reload.** The claim harness
runs the second open through a **separate client instance** with no shared memory and no storage: the
row is the only shared state, and it answers `already-opened` with the timestamp **unmoved**. On the
client, `first_opened_at` being set makes the predicate false — **zero calls over 13 renders**.

**4 · T1 unchanged.** Ended board → **one** restart, **without** the claim flag, across 13 renders (so
never on the 60-second poll). The cooldown still holds: restart → reload stands down → a fresh attempt
allowed after 120 s. Both triggers true at once → **T2 only**; a declined claim hands over to T1 on the
same load (one POST each, no loop).

**5 · Two simultaneous first opens → ONE restart.** Two concurrent `claimDemoFirstOpen` calls against one
row: exactly one returns `claimed:true`, and exactly one UPDATE matched a row.
🔴 **Control:** with only the `first_opened_at is null` predicate disabled in the stub, **both** callers
claim — so the harness can tell a compare-and-set from a blind write, and the passing result above is
not an artefact of the stub.

**6 · An admin preview neither claims nor restarts.** Client: `demoFirstOpenPending` is false for
`isAdmin`, **zero calls**. Server: `verifyAdmin` → `{restarted:false, skipped:'admin-preview'}` returned
**before** the claim, so `first_opened_at` is never written. And the case that a shared latch would have
broken: an admin previewing a **dead** demo still gets the T1 restart.

**7 · GET still writes nothing.** Each verb searched **alone** in `app/api/dashboard/route.ts`:
`.insert(` **0**, `.update(` **0**, `.upsert(` **0**, `.delete(` **0**, `.rpc(` **0**. The page is
`'use client'` with no server component in `app/dashboard/[token]/`. `/api/demo/restart` exposes **only**
`POST`, and `claimDemoFirstOpen` has exactly **one** caller — inside it. *Positive control over the same
greps:* `.delete(` → 4 in `lib/demo-restart.ts`, `.update(` → 2 in `lib/demo-session.ts`, so the search
finds write verbs when they exist.

**8 · A demo whose session row is missing.** READ, `/api/dashboard`: when there is no session row (or the
read fails) the demo block is sent as **all nulls**, so `discovery_truck_id` is null and
`demoFirstOpenPending` is **false** — T2 never fires. If a POST did reach the route, the claim returns
`no-session` and the route does not restart. **It errs toward leaving the board alone**, and that is the
right direction: without a session row nothing can record that the first open happened, so a restart
would repeat on *every* load — an endless wipe, far worse than the stale board it was trying to fix. T1
still covers such a demo once its board is actually dead. The same reasoning covers the **migration
being unapplied today**: the claim returns `unavailable`, nothing restarts, and the refusal is logged.

---

# Files touched

New: `supabase/migrations/20260914_demo_sessions_first_opened_at.sql` (unapplied).
Modified: `lib/demo-session.ts` (the claim), `app/api/demo/restart/route.ts` (the gate),
`app/api/dashboard/route.ts` (surface `first_opened_at`), `app/dashboard/[token]/page.tsx` (T2 branch,
`startNewService` returns whether it restarted and sends `nativeAuthHeader()`), and one stale header
line in `supabase/migrations/20260912_demo_sessions_outreach.sql`. Nothing else.

# Open items

- The migration is **unapplied**, so T2 is inert until it runs: every outreach demo load will POST once
  and receive `skipped: unavailable`, logged server-side. Harmless, and it stops the moment the column
  exists.
- `first_opened_at` is never set for anonymous demos by design, so the column stays NULL for most rows.
  Nothing else reads it.
- An admin preview that *does* consume a first open (the fail-open path, or an admin without a resolvable
  session) leaves no trace a prospect can see; the "Start a new service" button is the recovery.

# SQL — for Dominic to run; **nothing here was executed**

**Apply the migration:**

```sql
alter table demo_sessions add column if not exists first_opened_at timestamptz;

comment on column demo_sessions.first_opened_at is
  'When this demo link was first opened by a prospect, claimed atomically (update ... where first_opened_at is null) by /api/demo/restart. NULL = never opened.';

notify pgrst, 'reload schema';
```

**Then verify it — expect one row, nullable, no default:**

```sql
select c.column_name, c.data_type, c.is_nullable, c.column_default
  from information_schema.columns c
 where c.table_schema = 'public'
   and c.table_name = 'demo_sessions'
   and c.column_name = 'first_opened_at';
```

**And confirm nothing was back-dated — `already_opened` must be 0 immediately after applying:**

```sql
select count(*) as sessions,
       count(ds.first_opened_at) as already_opened
  from public.demo_sessions ds;
```

**Dominic's observed demo — is its event the stale one, and has its link been opened?**

```sql
select ds.truck_id,
       ds.public_ref,
       ds.discovery_truck_id is not null as is_outreach,
       ds.created_at,
       ds.first_opened_at,
       te.event_date,
       te.start_time,
       te.end_time,
       te.status
  from public.demo_sessions ds
  left join public.truck_events te
    on te.truck_id = ds.truck_id and te.event_date = current_date
 where ds.truck_id = 'demo-8c95xz1twsn1xfhx3a4nkjv7j3'
 order by te.start_time desc;
```

**Every outreach demo still awaiting its first open** (these are the links where T2 will fire):

```sql
select ds.truck_id,
       ds.public_ref,
       ds.created_at,
       ds.expires_at,
       ds.first_opened_at
  from public.demo_sessions ds
 where ds.discovery_truck_id is not null
   and ds.first_opened_at is null
 order by ds.created_at desc;
```

**Seeded versus visitor-placed orders on a demo board** — seeded rows always carry a NULL
`customer_email`, so this separates them without guessing:

```sql
select o.truck_id,
       count(*) filter (where o.customer_email is null)     as seeded,
       count(*) filter (where o.customer_email is not null) as visitor_placed,
       min(o.slot) as first_slot,
       max(o.slot) as last_slot
  from public.orders o
 where o.truck_id like 'demo-%'
   and o.status in ('pending','confirmed','modified','cooking')
 group by o.truck_id
 order by o.truck_id;
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
	modified:   app/api/demo/restart/route.ts
	modified:   app/api/demo/save-email/route.ts
	modified:   app/api/setup/route.ts
	modified:   app/dashboard/[token]/page.tsx
	modified:   components/admin/OutreachPanel.tsx
	modified:   components/dashboard/DemoWelcome.tsx
	modified:   docs/manual-update-report.md
	modified:   docs/reference-manual.md
	modified:   docs/scraper-reference-manual.md
	modified:   lib/demo-restart.ts
	modified:   lib/demo-session.ts
	modified:   lib/provision-demo.ts
	modified:   lib/seed-demo-orders.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/demo/
	components/admin/CreateDemoModal.tsx
	docs/demo-first-open-report.md
	docs/demo-outreach-build-report.md
	docs/demo-outreach-review-report.md
	docs/demo-restart-report.md
	docs/demo-seeder-capacity-report.md
	lib/demo-logo.ts
	lib/self-serve-discovery-link.ts
	supabase/migrations/20260912_demo_sessions_outreach.sql
	supabase/migrations/20260914_demo_sessions_first_opened_at.sql

no changes added to commit (use "git add" and/or "git commit -a")
```
