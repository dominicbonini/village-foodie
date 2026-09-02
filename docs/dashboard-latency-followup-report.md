# `/api/dashboard` — follow-up after the 45-second 401

**Date:** 1 September 2026 · **Status:** production still down · **Scope:** report only, nothing changed.
**Supersedes the conclusion of** `docs/dashboard-timeout-report.md`.

---

## VERIFICATION — what I actually did

- **PARSE / EXECUTION against production: NEITHER.** No SQL, no build, no deploy, no migration. I did
  not call the endpoint. **The 44.8 s and 49.6 s measurements are yours, not mine.**
- **What I executed locally:** `git log` / `git diff-tree` / `git ls-files` against this repository, and
  a script that walks the `import` graph. **That is execution of my analysis, not of the route.**
- **TYPECHECK: not run, and it would establish nothing here.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 🔴 WHAT MY PREVIOUS REPORT GOT WRONG

**The central claim was: "a data plane that accepts connections but never answers."** The 45-second 401
refutes it. **Something answered. It was slow, not dead.** Three consequences:

| Previous claim | Status now |
|---|---|
| "Supabase HTTP data plane is not answering" | **WRONG.** It answers. The correct statement is **severe per-request latency**, order tens of seconds. |
| "26 idle + 2 active is the signature of a component not sending work to the database" | **WITHDRAWN AS REASONING.** It was inference, not observation, and it was the sole basis for ruling out pooler/pool exhaustion. **That exclusion is now reopened** — see §6. |
| "If the logs are silent, the function never got past line 75" | **WRONG, and it was wrong when I wrote it.** §5. |

⚠️ **One earlier finding is STRENGTHENED, not weakened:** two dates with wildly different order counts
took ~the same time (44.8 s vs 49.6 s). **That is direct observational proof that cost does not scale
with order count** — previously I could only argue it from the code.

---

## 1. The invalid-token path, in execution order

`app/api/dashboard/route.ts:63–84`. **The entire path is nine operations and exactly ONE outbound call.**

| # | Line | Operation | Kind | Cost |
|---|---|---|---|---|
| 1 | 64 | `searchParams.get('token')` | in-process | ~0 |
| 2 | 65 | `searchParams.get('pin')` | in-process | ~0 |
| 3 | 66 | `searchParams.get('van_id')` | in-process | ~0 |
| 4 | 67 | `searchParams.get('date')` ‖ `new Date().toISOString()` | in-process | ~0 |
| 5 | 68 | `searchParams.get('event_id')` | in-process | ~0 |
| 6 | 70 | `if (!token)` — not taken, a token was supplied | in-process | ~0 |
| 7 | **75** | **`supabase.from('trucks').select('*').eq('dashboard_token', token).single()`** | **OUTBOUND — PostgREST** | **the entire 45 s** |
| 8 | 81 | `console.error('[dashboard] truck lookup failed: …')` | in-process | ~0 |
| 9 | 82 | `NextResponse.json({error:'Invalid token'}, {status:401})` | in-process | ~0 |

**Plus, before the handler runs at all — middleware. §7 establishes this is ONE more outbound call:**

| # | File:line | Operation | Kind |
|---|---|---|---|
| 0 | `proxy.ts:281` | `supabase.auth.getUser()` | **OUTBOUND — GoTrue** |

### What takes 45 seconds on a path whose only outcome is a rejection

**At most two sequential Supabase round trips: one GoTrue call in middleware, one PostgREST call in the
handler.** Nothing else on the path does I/O; items 1–6, 8 and 9 are string and object work measured in
microseconds.

🔴 **THE WORK ITSELF CANNOT ACCOUNT FOR IT, AND THAT IS THE FINDING.** `trucks` holds **12 rows**. Even
an unindexed sequential scan of 12 rows returning one wide row is sub-millisecond. **So the 45 seconds
is not query execution — it is a fixed per-request overhead in front of query execution.**

**Two candidate locations, and I cannot separate them from the repository:**

- **~45 s in the handler's single PostgREST call**, with middleware fast; or
- **~22 s each**, middleware's GoTrue call and the handler's PostgREST call both degraded.

⚠️ **The second date's 49.6 s is the more informative number.** It is **not** a constant — 44.8 vs 49.6
is ~11 % variance. **A fixed timeout constant would repeat exactly.** Variable multi-second latency is
the signature of **queueing or contention**, not of a socket-level timeout.

**UNKNOWN and not reasoned around:** whether the reported 44.8 s is the function duration alone or
function + middleware. **Vercel reports them separately and you can read it directly (§5).**

---

## 2. Reconciling this with "the hang localises to line 75"

**Direct answers to the three questions asked.**

**Does the rejection path reach line 75? — YES.** There is exactly one earlier return (`line 70`,
missing token) and an invalid token is not a missing one.

**Is the token validated by a database read? — YES, and it is the ONLY validation.** There is no cache,
no in-memory token list, no JWT to verify locally. `.eq('dashboard_token', token).single()` **is** the
authentication check. `.single()` raises `PGRST116` when no row matches; `if (error || !truck)` catches
it and returns the 401.

**Is the same call that hangs the valid path answering the invalid one in 45 seconds? — YES. That is
exactly what happens, and it is the most important sentence in this report.**

🔴 **BOTH PATHS ISSUE THE IDENTICAL QUERY.** Same table, same column, same `select('*')`, same
`.single()`. **The only difference is whether a row comes back.** So:

> **The valid path is not blocked by a call that never returns. It is blocked by ~15 sequential calls
> that each return in tens of seconds.** 15 × 45 s = **675 s**; 15 × 22 s = **330 s**. **Both exceed the
> 300-second ceiling.** The 401 is that same latency sampled once instead of fifteen times.

**This explains every observation at once:** the 401 completes because it pays the cost once; the valid
path times out because it pays it fifteen times; order volume is irrelevant because the cost is
per-round-trip, not per-row; and the rollback changed nothing because no code on this path changed.

⚠️ **My previous localisation was right about the line and wrong about the mechanism.** Line 75 is
indeed where a valid request first waits — but it waits ~45 s and then **proceeds**, and is killed
later, further down the route.

---

## 3. Revised remedy — and what is not ours to fix

**You are right that timeouts do not produce a working dashboard.** Restating it precisely: at ~45 s per
round trip, **there is no arrangement of this route's existing queries that renders a dashboard inside
300 s with acceptable UX.** Even one round trip is a 45-second page load.

### 🔴 NOT OURS TO FIX — and this is the actual outage

**The per-round-trip latency at Supabase is the fault. Nothing in this repository causes it and nothing
in this repository can remove it.** Until a Supabase request costs milliseconds again, the dashboard
does not work. **Every item below is damage limitation, not a cure.**

**I have NOT established the cause of the latency.** Candidates, none confirmed, listed so they can be
discriminated rather than guessed:

| Candidate | What would confirm it |
|---|---|
| PostgREST connection-pool saturation / queueing | Pool metrics; requests queued vs executing |
| Supavisor / pooler degradation | Supabase status + pooler metrics |
| Project resource exhaustion (CPU / memory / disk / IO) | Project health metrics |
| Quota or plan throttling | Billing / usage page |
| Regional incident in `eu-west-2` | Supabase status page |
| Network path degradation `lhr1` → `eu-west-2` | Latency from a second network |

⚠️ **Variable latency (44.8 / 49.6) favours queueing or contention over a hard timeout.** That is a
lean, not a conclusion.

### OURS TO FIX — none of it restores service today

1. **Reduce sequential depth: ~15 waves → ~5.** The single highest-value code change (§4). At 45 s/wave
   it takes 675 s to 225 s — **under the ceiling, so the page would load instead of 504** — but a
   225-second dashboard is not a working dashboard. **This buys a degraded page, not a good one.**
2. **A client timeout on the Supabase client** (`lib/supabase.ts:3` takes no third argument today).
   **This does not fix anything and I want to be clear that I am not re-proposing it as a fix.** Its
   value is: fail in 8 s instead of 300 s, stop each poll pinning a function slot for five minutes, let
   the board's own "keep existing state" path (`page.tsx:936`) engage, and **make the next incident
   diagnosable in seconds.**
3. **`export const maxDuration`** — a backstop only. Do #2 first.
4. **Not in the code, but do it now: close the open dashboard tabs.** `page.tsx:1227` re-fires every
   60 s while each attempt occupies a slot for 300 s, so **one tab sustains ~5 concurrent hung
   invocations.** ⚠️ **This will also delay apparent recovery after the real cause clears**, because the
   backlog drains at 300 s per slot. **It costs nothing and needs no deploy.**

⚠️ **Deploys are frozen, and a deploy is also an instant release to a shipped iOS app and an in-review
Play build.** I have applied nothing.

---

## 4. Sequential round trips on the valid-token path

**Counted as WAVES** — a `Promise.all` of two queries is one wave, because it costs one latency unit.

| Wave | Operation(s) | Parallel? | Conditional? |
|---|---|---|---|
| 0 | `proxy.ts:281` `auth.getUser()` — **middleware** | — | every request |
| 1 | `trucks` (`:75`) | — | always |
| 2 | `actor.ts:90` `auth.getUser()` [GoTrue] | — | always |
| 3 | `actor.ts:99` `auth.getUser(jwt)` [GoTrue] | — | native Bearer only |
| 4 | `actor.ts:107` `operators` | — | only if a user resolved |
| 5 | `actor.ts:124` `truck_users` | — | only if not owner/admin |
| 6 | `collection_times` + `truck_events` | **✅ 2 in parallel** | always |
| 7 | `operators` (stripe) | — | if `truck.operator_id` |
| 8 | `orders` ACTIVE + `orders` DONE | **✅ 2 in parallel** | if `selectedEventId` |
| 9 | `order_payments` (ledger rows) | — | if `visibleKeys.length` |
| 10 | `order_drafts` (held-auth) | — | if `visibleKeys.length` |
| 11 | `order_payments` (captured) | — | **only if wave 10 returned drafts** |
| 12 | `action_audit_log` | — | if `visibleKeys.length` |
| 13 | `menu_categories` + `menu_items_db` | **✅ 2 in parallel** | always |
| 14 | `truck_vans` count | — | always |
| 15 | `truck_vans` select | — | if `selectedEvent.van_id` |
| 16 | `production_slot_usage` | — | if `selectedEventId` |
| 16a | +5 more reads if 16 is empty | partly | **empty cache only** |
| 17 | `demo_sessions` | — | demo trucks only |

**For a real operator truck, cookie-authenticated owner, non-demo, no card drafts:**

> **~15 sequential waves · ~19 individual queries · only 3 waves parallelised today.**

⚠️ **Waves 10→11 are genuinely sequential** — `held-authorisation.ts:83` keys its `.in()` on the
idempotency keys derived from wave 10's rows. **But it early-returns at `:81` when there are no drafts**,
so for seeded/cash orders this is 1 wave, not 2.

🔴 **A truck whose event has no cached slot usage pays wave 16a: five more reads** (`buildUnitsFromOrders`
= `orders` + `menu_items_db` + `menu_categories` + `collection_times` + `truck_events`). **The fourteen
events seeded for 4–17 September have NO `production_slot_usage` rows**, so opening one of those days
costs more waves than opening 1 September. **Not the cause — 1 September has cached usage and still
fails — but it makes those days worse.**

### What could be batched or parallelised, and the saving

**Dependency depth is only 5. The other 10 waves are sequential by accident, not necessity.**

| Level | What can run together | Depends on |
|---|---|---|
| 1 | `trucks` | — |
| 2 | the actor auth chain · `collection_times` · `truck_events` · `operators`(stripe) · `menu_categories` · `menu_items_db` · `truck_vans` count | only `truck.id` |
| 3 | `orders` ACTIVE+DONE · `production_slot_usage` · `truck_vans` select | `selectedEventId` / `van_id` |
| 4 | `order_payments` · `order_drafts` · `action_audit_log` | `visibleKeys` |
| 5 | `order_payments` (captured) | wave 4's drafts — **usually skipped** |

**Saving: ~15 waves → ~5 (6 with middleware). A 3× reduction, ~10 waves eliminated.**

- at 45 s/wave: **675 s → 225 s** (under the 300 s ceiling — a 504 becomes a very slow 200)
- at 22 s/wave: **330 s → 110 s**
- at healthy ~50 ms: 750 ms → 250 ms

⚠️ **The auth chain (waves 2→4→5) cannot be flattened** — each step needs the previous one's result.
It can, however, run *concurrently with* the truck-scoped reads, which is where most of the saving is.

🔴 **AND THE HONEST CONCLUSION: THIS IS WORTH DOING AND IT IS NOT THE FIX.** A 225-second dashboard is
not a working dashboard. **It converts a total outage into an unusable page. Only the Supabase latency
returning to normal restores service.**

---

## 5. Did a failing invocation log anything? — **I CANNOT ESTABLISH IT FROM THE REPOSITORY**

**Saying so plainly, and correcting the test I proposed last time.**

**What I can establish by reading:** `app/api/dashboard/route.ts` contains **17 `console.error` /
`console.warn` calls and ZERO `console.log`.** Every one of the 17 is inside an `if (err)` branch.

🔴 **THEREFORE A SLOW-BUT-SUCCESSFUL RUN LOGS NOTHING, AND MY PREVIOUS DISCRIMINATOR WAS INVALID.** I
wrote that silence would localise the hang to line 75. **That was wrong.** If every query *succeeds* and
merely takes 45 s, the route emits no output at all and is killed mid-flight. **Silence is consistent
with the function reaching wave 6, or wave 12, or anywhere.** It distinguishes nothing.

**The one thing that IS certain: the two 401s DID log.** `route.ts:81` runs on that path, so
`[dashboard] truck lookup failed: …` will be in the logs for both, with a PostgREST message — `PGRST116`
("no rows") for a genuine invalid token. ⚠️ **If it says something else — a timeout, a connection error,
`57014`, `08006` — that message names the failure directly and is worth more than everything in §3.**

### Exactly what to look for in the Vercel logs

1. 🔴 **The duration split on ONE failing request.** Vercel logs middleware and function durations
   separately. **Is the ~45 s in the middleware line, the function line, or ~22 s in each?** This is the
   single most valuable unknown in this report and it settles §1 outright.
2. **The two 401 requests.** Find `[dashboard] truck lookup failed:` and read the message after it.
3. **A timed-out valid request.** Filter to `[dashboard]`. **Expect nothing** — and if that is what you
   see, it confirms only "no query returned an error", not where it stopped.
4. **Anything from `[ratelimit]` or `[held-auth]`.** `[ratelimit] REFUSED` would appear in the
   **middleware/edge** stream, not the function stream. **Its absence is expected** (§7).
5. **Whether other Supabase-backed routes are equally slow** — `/api/menu/<truckId>`,
   `/api/events/manage`. **If they are, it is infrastructure and not this route.** ⚠️ **This is the
   cheapest discriminator available to you and I could not run it.**

---

## 6. Exclusions: OBSERVED vs REASONED

**Fair challenge. Marking each honestly, including the one that is now reopened.**

| Exclusion | Basis | Falsified by |
|---|---|---|
| **Order volume** | 🔴 **OBSERVED — and now doubly so.** Your two measurements (44.8 s / 49.6 s on dates with very different order counts) are direct evidence. Previously REASONED from the code. | Nothing plausible. **This is the strongest exclusion in either report.** |
| **The two deploys** | **OBSERVED for the file lists** (`git diff-tree`: 13 files, 10 of them `docs/*.md`, the rest client components + `lib/event-display.ts`). **REASONED for "cannot affect the route"** — via the import walk, which enumerates what IS reachable rather than grepping for what is not. | A module my resolver mis-resolved; a runtime-config change. ⚠️ **Neither commit touches `next.config.ts`, `package.json`, `vercel.json` or `proxy.ts`** — I checked. **And the 45 s 401 independently kills this**: it runs 9 operations, none of which either commit touched. |
| **Vercel API env vars** | **REASONED** — the graph reads only 4 env vars, all Supabase. ⚠️ **NOW ALSO CHECKED IN MIDDLEWARE** (§7), which the import walk did not cover: `proxy.ts` reads only `NEXT_PUBLIC_SUPABASE_*`. **No `VERCEL_*` anywhere on the request path.** | A Vercel variable read by an *unrelated* function that degrades shared Supabase capacity. **Not investigated. Not excluded.** |
| **Upstash rate limiting** | **OBSERVED from the predicates** — `/api/dashboard` matches none of the four scope tests, so `inLimitedScope` is false and `limiter.limit()` is never reached (§7). | A predicate I misread. **Checkable in the logs: a `[ratelimit]` line for this path would falsify it.** |
| **A per-order/per-item query or await-in-loop** | **OBSERVED** by reading each helper. `capacity-breach`, `slot-availability`, `slot-display`, `slot-capacity`, `slot-generation` contain **zero** `supabase`/`await`/`fetch`. | — |
| **A write or lock taken by this route** | **OBSERVED** — `slot-bookings.ts:190` passes `persistReseed=false`. | — |
| **Third-party APIs (Stripe/Gemini/Brevo/Meta)** | **REASONED** from the graph: the only packages are `@supabase/*`, `next/*`, `react`. | A dynamic `import()` my walker missed. It does scan `import()` and `require()`. |
| 🔴 **Pooler / connection exhaustion** | **PREVIOUSLY: "ruled out." THAT IS NOW SPLIT IN TWO.** | |
| — *caused by this application* | **OBSERVED, and it stands.** No Postgres driver in `package.json`; no `DATABASE_URL`/`POSTGRES_URL`/`connectionString` referenced in `app/`, `lib/`, `scripts/`, `supabase/`. **The app never opens a Postgres connection, so it cannot leak one.** | A driver reached via a transitive dependency. |
| — *inside Supabase's own infrastructure* | ⚠️ **REOPENED. My exclusion was REASONED from "26 idle + 2 active", and I now think that reasoning was weak.** A saturated pool that queues requests ~45 s and then executes them in ~1 ms would show **exactly** low active counts at any instant. **My argument does not survive the 45-second 401. This is now a leading candidate.** | Pool metrics. **I cannot see them.** |

---

## 7. Middleware — what runs before the handler

**`proxy.ts`, 449 lines. It DOES run for `/api/dashboard`:** the matcher excludes only
`_next_next/image`, `favicon.ico`, `apple-touch-icon.png`, `logos`, `photos`, `sw.js`, `manifest.json`,
`offline.html`.

### Upstash Redis — **NOT called on this path**

`inLimitedScope = isStrict || isEvents || isEmbed || isGeneralPublic` (`:186`). Reading the four:

| Predicate | Line | Matches | `/api/dashboard`? |
|---|---|---|---|
| `isStrictPublic` | 29 | `/api/discovery`, `/api/discovery/*` | **No** |
| `isCustomerEvents` | 28 | `/api/events` exactly | **No** |
| `isEmbedPublic` | 46 | `/embed`, `/embed/*`, `/api/embed/*` | **No** |
| `isGeneralPublic` | 37 | `/trucks`, `/trucks/*`, `/o`, `/o/*` | **No** |

**So `inLimitedScope` is false, the `if` at `:212` never opens, and `limiter.limit()` at `:230` is never
reached.** §28's Upstash layer is real but **does not apply to this route**. Redis is not on this path.

### 🔴 BUT MIDDLEWARE MAKES ONE SUPABASE CALL, UNCONDITIONALLY

```
proxy.ts:257  let supabaseResponse = NextResponse.next({ request })
proxy.ts:259  const supabase = createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {cookies:{…}})
proxy.ts:281  const { data: { user } } = await supabase.auth.getUser()      ← OUTBOUND, GoTrue
```

**I looked for an early return before `:281` and there is none** — no `return` statement of any kind
executes before it on this path. The `pathname.startsWith('/api')` test appears **after**, in the
public-path list used for redirect decisions.

⚠️ **`createServerClient` here is also constructed with no timeout** — its options object carries only
`cookies`. **So middleware's GoTrue call has the same unbounded-wait property as every handler call.**

### What "Middleware 200" does and does not exclude

**DOES exclude:** a middleware *refusal* — no 429, no redirect, no rewrite. The request reached the
handler. **Upstash is excluded independently, by the predicates.**

🔴 **DOES NOT EXCLUDE: middleware being SLOW.** **200 is a status, not a duration.** Middleware makes one
GoTrue call with no timeout, so **if GoTrue is degraded, middleware contributes to the 45 s and still
returns 200.**

**UNKNOWN:** how the 44.8 s divides between middleware and handler. **Vercel logs them separately — §5,
item 1.** ⚠️ **This matters for the remedy: if middleware's GoTrue call is a large share, every matched
request on the whole site pays it, not just this route.**

---

## 8. The seeding SQL for `test-truck-3-2`

**Three files exist for this truck. Reporting all three, since "the SQL Cursor generated" most directly
names the first.**

### `docs/seed-apple-tester-orders.sql` — the Cursor-generated one

- **368 lines. TRACKED. Git history: exactly ONE commit — `dea3aba`, 2026-08-20, "kds fix".**
- **`git diff HEAD` is empty. What is on disk now is byte-identical to what was committed.**

🔴 **BUT — AND THIS IS THE PART THAT MATTERS — "UNMODIFIED SINCE COMMIT" IS NOT "THIS IS WHAT WAS RUN",
AND I CANNOT ESTABLISH THAT IT IS.** My earlier order-seeding work found the production rows **do not
match this script**: production has 14 dates where it writes 8, `placed_at` is NULL on the recent
generation where this script sets it, and the status mixes differ. **Either it was never run, or it was
run and something else wrote the live rows.** **I cannot tell which, and I am not going to guess.**

**What it writes** (all inside one transaction, `v_truck_id := 'test-truck-3-2'` at line 42 — *"the one
place the target is named"*):

```
delete from orders               where truck_id = v_truck_id and event_id = v_event_ids[e]   (:210)
delete from production_slot_usage where truck_id = v_truck_id and event_date = …             (:212)
insert into orders               … 8 events × N orders
update truck_events set order_counter = … where id = … and truck_id = v_truck_id
```

**Every statement is scoped by `truck_id`. No statement can reach another truck.**

### Could it affect a live route or another truck? — **No, and it carries its own guards**

- **`test-truck-3` appears ONLY in a REFUSAL** (`:123` `if v_truck_id = 'test-truck-3' then` → abort).
  It is a guard against the two-character-different neighbouring truck, not a target.
- **There is an explicit Gusto guard** at `:126`: `if v_truck_name ilike '%gusto%' then` → abort.
- **`docs/seed-thai-kitchen-orders.sql:132-133` carries the same refusal**, commented *"Pizzeria Gusto is
  the only real trading customer and nothing here may touch it."*

### The `order_payments` contamination — can it reach a live route or another truck?

**24 `livemode = true` charge rows against `test-truck-3-2`, 19 attached to demo-email orders.**

**I read all 15 `order_payments` call sites in `app/` and `lib/`. Every one is scoped** — by
`.eq('truck_id', …)`, `.in('order_key', …)`, `.eq('order_key', …)`, `.in('idempotency_key', …)` or
`.eq('id', …)`. **I found no unscoped cross-truck aggregation over `order_payments`.**

- `lib/payments/ledger.ts:431/443` *looks* cross-truck but derives `truckIds` from rows **already
  fetched under a scope**, then reads `trucks`/`operators` to annotate them. It widens nothing.
- `app/api/admin/delete-truck/route.ts:161` is `.eq('truck_id', truckId)` — a safety count before delete.

🔴 **CONCLUSION: the contamination is confined to `test-truck-3-2`'s own rows and cannot reach
pizzeria-gusto or any other truck through any code path I read. It is a data-integrity problem on one
test truck, NOT a mechanism for this outage.** ⚠️ **It also has no plausible performance effect** — 24
rows.

### The other two (mine, from earlier today)

| File | Lines | Tracked | State |
|---|---|---|---|
| `docs/seed-app-tester-sept.sql` | 472 | **UNTRACKED** | **HAS BEEN RUN** — 896 rows exist |
| `docs/seed-app-tester-sept-align.sql` | 267 | **UNTRACKED** | **NOT RUN** |

**Both are scoped to `test-truck-3-2` throughout; `test-truck-3` appears in the first only as a refusal
guard. Neither writes any table other than `orders` and `truck_events.order_counter`. Neither touches
pizzeria-gusto.**

⚠️ **Untracked means no git history exists for either — "is what is on disk what was run?" cannot be
answered from version control.** For `seed-app-tester-sept.sql` I can say the **effect** matches
(896 rows, all `table_ref='SEED'`, the status mix the file generates), which is corroboration, not proof.

🔴 **One honest connection I will not overstate.** The 896 rows landed on **4–17 September**, and those
fourteen events have **no `production_slot_usage`**, so opening one costs 5 extra reads (§4, wave 16a).
**But the captured failing request is 2026-09-01, which is NOT one of them and DOES have cached usage —
and pizzeria-gusto has none of these rows at all. The seed is not the cause.**

---

## 9. All SQL generated in this repository in the last seven days

**Five `.sql` files exist outside `supabase/migrations/`. Two fall in the window; three are older and
listed for completeness.**

| File | Modified | Tracked | Target | Writes | Touches gusto? |
|---|---|---|---|---|---|
| `docs/seed-app-tester-sept.sql` | **1 Sep 14:47** | Untracked | `test-truck-3-2` | `insert orders`, `update truck_events.order_counter`; `delete orders` **only in a header comment**, not executable | **No** |
| `docs/seed-app-tester-sept-align.sql` | **1 Sep 15:01** | Untracked | `test-truck-3-2` | `update orders` (content only) | **No** |
| `docs/seed-apple-tester-orders.sql` | 20 Aug 13:37 | `dea3aba` | `test-truck-3-2` | `delete`/`insert orders`, `delete production_slot_usage`, `update truck_events` | **No — explicit refusal at :126** |
| `docs/seed-thai-kitchen-orders.sql` | 20 Aug 11:10 | tracked | `test-truck` | same shape | **No — explicit refusal at :132-133** |
| `scripts/seed-thai-kitchen-screenshots.sql` | 18 Aug 19:11 | tracked | `test-truck` | same, **plus `update trucks`** | **No** |

⚠️ **The one `update trucks` — `scripts/seed-thai-kitchen-screenshots.sql:81` — is COMMENTED OUT** and
scoped to `id = 'test-truck'` regardless. It sets a display name.

🔴 **NOTHING IN ANY OF THE FIVE TARGETS, NAMES OR CAN REACH `pizzeria-gusto`.** Two of them refuse to run
against it by name. **I ran none of them.**

**And the load-bearing point for this investigation: pizzeria-gusto's dashboard hangs identically while
no SQL written here has ever touched it.** ⚠️ **That is strong evidence the cause is shared
infrastructure, not this truck's data — and it is the same shape of evidence as the 13-orders-vs-64
comparison.**

---

## What I could not establish

**Listed rather than reasoned around.**

1. **The cause of the Supabase latency.** Six candidates in §3; **none confirmed.** I did not call
   Supabase.
2. **The middleware/function duration split** on a failing request. **The single most valuable unknown.**
3. **Whether other Supabase-backed routes are equally slow.** Would separate "this route" from
   "everything" in one request.
4. **Whether anything logged before the timeout.** §5 gives the exact search.
5. **Whether the 504 and the pizzeria-gusto spinner share a cause.** Consistent with one; one captured
   request, not two.
6. **Whether `docs/seed-apple-tester-orders.sql` was ever executed.** The disk content is unmodified
   since its only commit; **it does not match the live rows.**
7. **The account-level default `maxDuration`.** A Console fact. The 300 in the error message is the
   authority; `app/api/demo/route.ts:26`'s "10s/15s" comment is stale.

**Nothing was changed, run, deployed or migrated. The only write was this report.**
