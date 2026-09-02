# `/api/dashboard` 504 — read-only investigation

**Date:** 1 September 2026 · **Status:** production down · **Scope:** report only, nothing changed.

---

## VERIFICATION — what I actually did

- **PARSE / EXECUTION: NEITHER, against production.** I ran no SQL, no build, no deploy, no migration,
  and I did not call the failing endpoint. **Nothing in this report is a behaviour verification.**
- **What I did do: source reads, and one piece of static analysis I executed locally** — a script that
  walks the `import` graph of `app/api/dashboard/route.ts` transitively and reports every module,
  package, network call site and `process.env` read reachable from it. That is execution of *my
  analysis*, not of the route.
- **TYPECHECK: not run, and it would prove nothing here.** This is a runtime hang, not a type error.

🔴 **THE HONEST LIMIT OF THIS REPORT.** Everything below establishes what the code *can* do. **Not one
line of it establishes what production is doing right now.** The three checks that would settle it are
listed at the end and I cannot run them read-only from here.

**No span of the prompt arrived garbled. No instruction contradicted another.** Items 1–9 are all
answered; item 9 arrived mid-investigation and is answered in full.

---

## THE SHORT VERSION

**Every outbound call this route makes goes to Supabase, and not one of them has a timeout.** The
Supabase client is constructed with no `global.fetch` override, no `AbortSignal`, no deadline. **The
first `await` in the handler is a Supabase query.** If the Supabase *data plane* stops answering, this
route hangs on line 75 and the platform kills it at 300 seconds — which is exactly the observed
symptom.

**The evidence points away from the code and towards the Supabase HTTP layer**, and three independent
facts already in hand support that over every code-based explanation. **It is not proven.**

---

## 1. Every awaited operation on the GET path, in execution order

`app/api/dashboard/route.ts`, `GET` at line 63. **DB** = Supabase PostgREST over HTTPS. **AUTH** =
Supabase GoTrue over HTTPS. **CPU** = in-process, no I/O.

| # | Line | Operation | Kind | Timeout / AbortSignal / deadline |
|---|---|---|---|---|
| 1 | 75 | `trucks.select('*').eq('dashboard_token').single()` | **DB** | **NONE** |
| 2 | 106 | `resolveActor(req, supabase, truck)` → below | **AUTH + DB** | **NONE** |
| 2a | `actor.ts:89` | `createSupabaseServerClient()` — `await cookies()` | CPU | n/a |
| 2b | `actor.ts:90` | `supabaseAuth.auth.getUser()` | **AUTH (GoTrue)** | **NONE** |
| 2c | `actor.ts:99` | `serviceClient.auth.getUser(jwt)` — native Bearer only | **AUTH (GoTrue)** | **NONE** |
| 2d | `actor.ts:107` | `operators.select(...).maybeSingle()` | **DB** | **NONE** |
| 2e | `actor.ts:124` | `truck_users.select(...).maybeSingle()` | **DB** | **NONE** |
| 3 | 124 | `Promise.all` → `collection_times.select(...)` | **DB** | **NONE** |
| 4 | 124 | `Promise.all` → `truck_events.select(<named>)` | **DB** | **NONE** |
| 5 | 235 | `operators.select('stripe_charges_enabled, stripe_account_livemode')` | **DB** | **NONE** |
| 6 | 288 | `Promise.all` → `orders` ACTIVE (`select('*')`) | **DB** | **NONE** |
| 7 | 288 | `Promise.all` → `orders` DONE (`select('*')`) | **DB** | **NONE** |
| 8 | 292 | `order_payments.select(LEDGER_ROW_COLUMNS).in('order_key', visibleKeys)` | **DB** | **NONE** |
| 9 | 313 | `readHeldAuthorisations(supabase, visibleKeys)` → 2 reads | **DB** | **NONE** |
| 9a | `held-authorisation.ts:64` | `order_drafts.select(...)` | **DB** | **NONE** |
| 9b | `held-authorisation.ts:83` | `order_payments.select(...)` | **DB** | **NONE** |
| 10 | 367 | `action_audit_log.select('order_key')...eq('after_state->>ledger_failed','true')` | **DB** | **NONE** |
| 11 | 415 | `Promise.all` → `menu_categories.select(<named>)` | **DB** | **NONE** |
| 12 | 415 | `Promise.all` → `menu_items_db.select('name, category_id')` | **DB** | **NONE** |
| 13 | 519 | `truck_vans.select('id', {count:'exact', head:true})` | **DB** | **NONE** |
| 14 | 536 | `truck_vans.select(<named>).eq('id', van_id).single()` | **DB** | **NONE** |
| 15 | 585 | `getProductionSlotUnits(...)` → `production_slot_usage.select(...)` | **DB** | **NONE** |
| 15a | `slot-bookings.ts:153/162` | **only if 15 returns empty/error** → `buildUnitsFromOrders` = 1 `orders` read + `menu_items_db` + `menu_categories` + `collection_times` + `truck_events` | **DB ×5** | **NONE** |
| 16 | 601 | `buildSlotIndicators(...)` | **CPU** | n/a |
| 17 | 610 | `buildSlotAvailability(...)` | **CPU** | n/a |
| 18 | 640 | `detectCapacityBreaches(...)` | **CPU** | n/a |
| 19 | 668 | `resolveTruckLogo(...)` | **CPU** — see below | n/a |
| 20 | 697 | `demo_sessions.select('*')` — **only if `isDemoIdentifier(truck.id)`** | **DB** | **NONE** |

**Steady-state cost: 16–18 Supabase round trips per request** (20–22 if the slot-usage cache is empty;
one fewer for a non-demo truck; two fewer with no logged-in user).

⚠️ **`resolveTruckLogo` is `async` but makes NO call.** `lib/truck-logo.ts` now returns a template
string; the `supabase` and `truckId` parameters are retained and unused (`_supabase`, `_truckId`) so
the four call sites did not have to change. **It cannot hang.** Recorded because its name and
signature both suggest otherwise.

✅ **`getProductionSlotUnits` passes `persistReseed = false`** (`slot-bookings.ts:190`), so **the GET
path never writes.** The `syncProductionSlotUsage` upsert at `slot-bookings.ts:166` is unreachable
from this route. **No write, therefore no lock this route could take or hold.**

---

## 2. Every outbound network call reachable from this route

Established by walking the import graph transitively, not by grepping the route file.

**21 local modules are reachable.** The complete list of non-relative packages imported anywhere
across all 21:

```
@supabase/ssr   @supabase/supabase-js   next/headers   next/server   react
```

🔴 **THAT IS THE WHOLE ANSWER TO ITEM 2.** There is **no Stripe SDK, no Vercel SDK, no Gemini, no
Brevo, no Meta/Facebook Graph, no Upstash/Redis, no `axios`, no bare `fetch()`** anywhere in the
graph. Every outbound call is `@supabase/*` to one of two Supabase services:

| Target | Call sites | Can it block indefinitely? |
|---|---|---|
| **PostgREST** (`/rest/v1/…`) | items 1, 2d, 2e, 3–15a, 20 above | **YES** |
| **GoTrue** (`/auth/v1/user`) | `lib/audit/actor.ts:90`, `:99` | **YES** |

**Why every one of them can block indefinitely — the single root cause:**

```ts
// lib/supabase.ts:3
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)                                  // ← no third argument
```

**No `global.fetch` override. No `AbortSignal`. No `signal:`. No timeout of any kind.** Same for
`lib/supabase/server.ts:4` (`createServerClient`, options carry only `cookies`). I searched the whole
repo for a global fetch wrapper and for `instrumentation.ts`: **neither exists.**

`supabase-js` calls `undici`'s `fetch` via Node's global. **`undici` applies no request timeout by
default** — only a connect timeout. So a TCP connection that is *established but never answered*
waits forever. **That is precisely the shape of a 300-second function timeout.**

⚠️ **The browser has no timeout either.** `page.tsx:926` is a bare `fetch()`. The spinner therefore
sits for the full 300s and then hits `catch → finally{setLoading(false)}` (`page.tsx:1035`).

---

## 3. HYPOTHESIS — the three Vercel API environment variables · **DROPPED**

🔴 **Nothing on this path reads a Vercel variable or calls the Vercel API. Stating it plainly, as
asked.**

The complete set of `process.env` reads across all 21 reachable modules:

```
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL
```

**Four, all Supabase.** No `VERCEL_*`, no token, no project or team id. `lib/custom-domain/*` is
**not** in the graph — the route does not import it, directly or transitively. The custom-domain cron
(`/api/cron/custom-domain-check`, `vercel.json`) is a **separate function** with a separate invocation;
it shares no code with this route.

**Hypothesis dropped on evidence.** ⚠️ **One caveat I will not paper over:** a missing or wrong Vercel
variable cannot affect *this handler*, but I have **not** established that the custom-domain cron
cannot degrade shared Supabase capacity. That is a different mechanism and I have no evidence for it
either way.

---

## 4. How cost scales with order count

**It barely does, and that is a finding rather than a reassurance.**

- **No per-order query.** Payments, held authorisations and ledger-failures are each **one batched
  query** over `visibleKeys` (`.in('order_key', […])`).
- **No per-item query.**
- **No per-order menu lookup issuing I/O.** `itemCategoryMap` is built once from two truck-scoped reads
  (items 11–12) and consulted in memory.
- **No `await` inside any loop.** The one construct that looks like it — `route.ts:313`,
  `for (const k of await readHeldAuthorisations(...))` — **awaits once and then iterates the resolved
  Set.** `lib/slot-bookings.ts:445` *is* an await-in-loop, but it lives in a backfill helper that this
  route never calls.

| | Cost |
|---|---|
| Supabase round trips | **O(1)** — 16–18, independent of order count |
| In-process | **O(slots × orders × items)** — `buildSlotIndicators`, `buildSlotAvailability`, `detectCapacityBreaches`. All three are pure: **zero** `supabase`/`await`/`fetch` occurrences in `capacity-breach.ts`, `slot-availability.ts`, `slot-display.ts`, `slot-capacity.ts`, `slot-generation.ts` |
| Request-size growth | `.in('order_key', …)` puts one 36-char uuid per order in the query string — ~2.4 KB at 64 orders |

At 64 orders, ~96 slots and ~2 items per order that is on the order of **10⁴ operations — microseconds**.

🔴 **AND THE DECISIVE POINT IS NOT THE COMPLEXITY, IT IS THE COMPARISON.** **pizzeria-gusto's event has
13 orders and hangs identically.** A cost that scales with order count cannot explain a 300-second hang
at 13 orders. **Order volume is ruled OUT** — including the 896 rows seeded onto 4–17 September, which
are not on the failing event (2026-09-01) and are not on pizzeria-gusto at all.

---

## 5. Where the 300-second limit comes from

- **`app/api/dashboard/route.ts` exports no `maxDuration`.** The only `export` in the file is `GET`.
- **`vercel.json` names exactly one function**, `app/api/manage/verify-schedule-url/route.ts`
  (`memory 1024`, `maxDuration 60`). **`/api/dashboard` is not listed.**
- Five other routes set their own (`payments/return` 300, `demo` 300, `webhooks/stripe` 300,
  `demo/restart` 60, `manage/whatsapp-preview` 60). **This route sets nothing.**

**So the 300 s is the platform default for this deployment, not a repository setting.** The observed
`"Task timed out after 300 seconds"` is consistent with the Fluid-Compute default ceiling.

⚠️ **I have NOT verified the account-level default in the Vercel dashboard** — that is a Console fact,
not a repository fact. `app/api/demo/route.ts:26` records the older default as "10s on Hobby / 15s on
Pro", which **contradicts** 300 s, so the effective default has changed at some point. **The 300 in the
error message is the authority here; the comment is stale.**

🔴 **THE LIMIT IS NOT THE BUG, BUT IT IS WHY THE BUG COSTS FIVE MINUTES.** With no client-side timeout,
the function's only deadline is the platform's. Every poll burns a full 300 s of execution.

---

## 6. The two commits · 🔴 **NEITHER TOUCHES THIS ROUTE OR ANYTHING IT IMPORTS**

**`5083d1c` "KDS DRY event picker"** (1 Sep 13:52) — 5 files:

```
app/dashboard/[token]/kds/page.tsx
components/dashboard/AddOrderPanel.tsx
components/shared/EventPickerPanel.tsx
lib/event-display.ts
docs/last-report.md
```

**`4275916` "KDS event scroll fix"** (1 Sep 13:27) — 8 files:

```
app/dashboard/[token]/kds/page.tsx
docs/aab-currency-check-report.md      docs/auto-open-provenance-report.md
docs/kds-event-picker-report.md        docs/kds-picker-fix-report.md
docs/order-seeding-approach-report.md  docs/reference-manual.md
docs/truck-rename-impact-report.md
```

**Cross-checked against the 21 modules reachable from `/api/dashboard`:**

| File | In the route's graph? |
|---|---|
| `app/dashboard/[token]/kds/page.tsx` | **No** |
| `components/dashboard/AddOrderPanel.tsx` | **No** |
| `components/shared/EventPickerPanel.tsx` | **No** |
| `lib/event-display.ts` | **No** |
| `docs/**` (10 files) | **No** — documentation, not compiled |

**One is a client component, three are client components or their helper, ten are Markdown.** The only
non-`docs` change outside `app/dashboard/…/kds` is `lib/event-display.ts`, and **it is not in the 21.**

🔴 **THIS IS THE FINDING THE PROMPT ANTICIPATED, AND IT IS A REAL ONE.** **The rollback could not have
restored service, because neither commit is on this route's code path at all.** That is not "the
rollback didn't work" — it is **"the rollback was never capable of working."** It rules out *both*
deploys as the cause and, more usefully, **it is positive evidence that the fault is not in the
application code**, since the code that runs this route is byte-identical across `4275916`, `5083d1c`
and their parents.

---

## 7. What the browser requests on a dashboard load

`app/dashboard/[token]/page.tsx` — 43 `fetch` sites, of which these fire on mount:

| Request | Line | Required before the page renders? |
|---|---|---|
| **`GET /api/dashboard?token&pin&event_id&date`** | **926** | **🔴 YES — THE ONLY BLOCKER** |
| `GET /api/menu/<truckId>?dashboard=1&…` | 869 | No |
| `GET /api/auth/me` | 1179 | No |
| `POST /api/manage` (`get_vans`) | 1249 | No |
| `GET /api/events/manage?token&upcoming=true` | 1016 | No |
| `GET /api/slots/<truckId>` | 2168 | No — later, on interaction |

**Why `/api/dashboard` alone gates the render.** `loading` starts true and `page.tsx:2758` returns the
`Loading dashboard...` screen while it is set. **The only three places `setLoading(false)` runs —
`:927`, `:936`, `:1035` — are all inside `fetchAll`**, the function that awaits `/api/dashboard`. The
other five requests set their own state and never touch `loading`.

⚠️ **So the spinner is a faithful report of one hung request.** No other endpoint can clear it and none
can be blamed for it.

⚠️ **`page.tsx:1227` re-fires `fetchAll` every 60 s.** With each attempt occupying a function for 300 s,
**a single open dashboard tab accumulates ~5 concurrent hung invocations.** That is an amplifier, not a
cause — but it matters for recovery.

---

## 8. Ruled IN / ruled OUT / not established

### Ruled OUT — by something I read

| Hypothesis | Why |
|---|---|
| **The two deploys** | Neither touches the route or any of its 21 modules (§6). The rollback *couldn't* have helped |
| **Seeded order volume** | Cost is O(1) in round trips; pizzeria-gusto hangs at **13 orders** (§4) |
| **The Vercel API env vars** | Only 4 env vars are read on the path, all Supabase; no Vercel SDK in the graph (§3) |
| **A per-order / per-item query, or an await in a loop** | None exists on this path (§4) |
| **A write or lock taken by this route** | GET passes `persistReseed=false`; no write is reachable (§1) |
| **A third-party API hanging** (Stripe/Gemini/Brevo/Meta/Upstash) | None is in the import graph (§2) |
| **Connection leak / pooler exhaustion caused by this route** | The route holds no Postgres connection (§9) |
| **`resolveTruckLogo` doing I/O** | It builds a string (§1) |

### Ruled IN — consistent with everything observed, **not proven**

🔴 **THE SUPABASE HTTP DATA PLANE (PostgREST / GoTrue / the Kong gateway in front of them) IS NOT
ANSWERING, AND THE CLIENT HAS NO TIMEOUT.**

Five facts, each of which it explains:

1. **Both trucks hang** — 64 orders and 13 orders alike. Volume-independent, as a transport fault is.
2. **The rollback changed nothing** — the code is identical either side.
3. **`/api/ping` returns 200 in ~106 ms.** Read it: `app/api/ping/route.ts` is a synchronous
   `NextResponse.json({ok:true})` with **no auth and no DB work** — its own comment says so. **It proves
   the function platform is healthy and proves nothing about Supabase.**
4. **⚠️ `/login` rendering proves nothing either, and this is worth stating because it reads like
   counter-evidence.** `app/login/page.tsx:1` is `'use client'` and uses
   `createSupabaseBrowserClient` — **the page is shipped to the browser without the server touching
   Supabase.** A rendered `/login` is consistent with Supabase being entirely unreachable.
5. **Postgres looks healthy — and that is what this hypothesis predicts.** PostgREST sits *in front of*
   Postgres. If PostgREST is wedged or unreachable, no query is ever issued: Postgres sees an idle
   pool. **"2 active, 0 idle-in-transaction" is not evidence that queries are succeeding — it is
   evidence that almost no query is running at all**, on a platform whose dashboards poll every 15–60 s
   and should be generating steady load.

🔴 **THE 26 IDLE CONNECTIONS ARE THE STRONGEST SINGLE CLUE, AND THEY POINT AWAY FROM SATURATION.** A
saturated PostgREST pool would show its connections **active**, with requests queueing behind them.
Idle connections plus near-zero activity is the signature of a component that **is not sending work to
the database at all.**

### NOT established — stated rather than reasoned around

- **Whether Supabase is actually failing right now.** I did not call it. **This is the central unproven
  claim of the report.**
- Whether the Supabase project is paused, over quota, rate-limited, or mid-incident.
- Whether `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are still correct and unexpired in the running
  deployment. **A rotated or revoked service key would produce a fast 401, not a hang** — so this is
  unlikely, but I have not read the deployment's env.
- The account-level default `maxDuration` (Console fact, §5).
- Whether anything *outside* this route is consuming shared Supabase capacity.
- **Whether the observed 504 and the pizzeria-gusto spinner have the same cause.** They are consistent
  with one cause; I have one captured failing request, not two.

⚠️ **An empty grep is not proof of absence, so where it mattered I did not rely on one.** §2, §3 and §6
rest on a *transitive import walk* that enumerates what IS reachable, then checks membership — not on
searching for what is not there.

---

## 9. HYPOTHESIS — connection exhaustion at the Supabase pooler · **RULED OUT for this route**

### How this route obtains its database connection: **it does not.**

🔴 **THERE IS NO POSTGRES CONNECTION ANYWHERE IN THIS APPLICATION.** Not a direct connection, not
Supavisor session mode, not transaction mode. **The question does not apply, and that is the finding.**

**How I established it — three independent checks:**

1. **No Postgres driver is a dependency.** I enumerated `dependencies` + `devDependencies` from
   `package.json` against `pg`, `pg-*`, `postgres`, `postgres.js`, `prisma`/`@prisma/*`, `drizzle*`,
   `knex`, `typeorm`, `sequelize`, `@vercel/postgres`, `slonik`, `porsager`. **Zero matches.** The only
   database packages are `@supabase/ssr ^0.10.3` and `@supabase/supabase-js ^2.105.1`.
2. **No connection string is referenced in any code.** Searching `app/`, `lib/`, `scripts/` and
   `supabase/` for `DATABASE_URL`, `POSTGRES_URL`, `connectionString`, `pooler.supabase`, `supavisor`,
   `:6543` and `:5432` returns **exactly one hit, and it is not code**: `supabase/.temp/pooler-url`, a
   Supabase CLI scratch file. **Nothing imports or reads it.**
3. **The import-graph walk (§2) confirms it from the other direction** — the only packages reachable
   from the route are the five listed, and the only env vars are the four Supabase ones. **No
   connection string is even available to the running function.**

**So: `supabase-js` speaks HTTPS to PostgREST. Connection pooling happens inside Supabase's
infrastructure, on the far side of an HTTP boundary the application never crosses.**

### Can any path here acquire a client and fail to release it?

| Failure mode asked about | Answer |
|---|---|
| **A client created per-request without cleanup** | `resolveActor` creates one per request (`createSupabaseServerClient`, `actor.ts:89`). **It is an HTTP wrapper holding cookies — it owns no socket to leak** and needs no release. |
| **A long-lived module-scope client** | Yes — `lib/supabase.ts:3` is module-scope, and 5 others exist across the repo. **This is correct and desirable for an HTTP client**, and it holds no database connection. |
| **A connection held across an await that can hang** | **No connection exists to hold.** What *is* held across a hanging await is an undici socket and a Vercel function slot — see below. |

### Verdict: **RULED OUT as a cause originating in this route.**

⚠️ **BUT ONE ADJACENT MECHANISM IS NOT RULED OUT, AND I WILL NOT COLLAPSE THE TWO.** *PostgREST's* own
internal pool could be exhausted by something else, which would queue requests inside PostgREST and
present exactly as this hang. **The evidence argues against it:** an exhausted pool shows its
connections **active and working**, whereas production reports **26 idle and 2 active**. That reads as
"PostgREST is not issuing work", not "PostgREST is overwhelmed".

🔴 **AND THERE IS A REAL EXHAUSTION HAPPENING — JUST NOT AT THE DATABASE.** Each hung request holds a
**Vercel function slot** for 300 s, and `page.tsx:1227` re-fires every 60 s. **One open dashboard tab
sustains ~5 concurrent hung invocations; two operators with a tab each sustain ~10.** ⚠️ **That is
concurrency exhaustion at the function layer, and it will slow recovery even after the underlying cause
clears** — because the backlog has to drain at 300 s per slot. **Closing the dashboard tabs is worth
doing before concluding a fix did not work.**

---

## If I am right, the fix — reported, not applied

**Two changes, and they address different things. Neither is a cure for an outage at Supabase.**

**1. The actual defect in this repository — no timeout on any Supabase call.** `lib/supabase.ts` takes
a third argument:

```ts
export const supabase = createClient(url, key, {
  global: { fetch: (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(8_000) }) },
})
```

**This does not fix the outage.** What it changes is the failure *shape*: the route would return a fast
5xx instead of burning 300 s, the board's own error path (`page.tsx:936`, "keeping existing state")
would engage, and one hung dependency would stop consuming the function concurrency budget. ⚠️ **It
would also have made this outage diagnosable in seconds rather than requiring a full route read.**

**2. `export const maxDuration = 60` on this route** — a backstop, not a fix. **Do #1 first;** a shorter
ceiling without a client timeout just fails faster with no better information.

⚠️ **Both are code changes and deploys are frozen. I have applied neither.** And note the trap: **a
deploy is also an instant release to a shipped iOS app and to an in-review Play build** (§36/§40 of the
reference manual).

### The three checks that would settle this, none of which I can run read-only

1. **Call the Supabase REST API directly**, bypassing the app:
   `curl -sS -m 20 -o /dev/null -w '%{http_code} %{time_total}\n' -H "apikey: <anon>" "$SUPABASE_URL/rest/v1/trucks?select=id&limit=1"`
   **A hang or timeout here confirms it outright. A fast 200 refutes it and this whole report needs
   re-opening.**
2. **The Supabase status page and the project's own health/quota state** — paused, over-quota, or a
   regional incident in `eu-west-2`.
3. **The Vercel runtime logs for a failing invocation.** The route logs on *every* error path
   (`[dashboard] truck lookup failed`, `EVENTS QUERY FAILED`, …). 🔴 **If the logs are SILENT, the
   function never got past the first `await` on line 75** — which localises it to the trucks read and
   effectively proves the transport hypothesis. **The absence of those log lines is itself the
   evidence.**

---

## One incidental finding, unrelated to the outage

⚠️ **`supabase/.temp/pooler-url` is TRACKED IN GIT and NOT ignored.** It contains
`postgresql://postgres.<project-ref>@aws-1-eu-west-2.pooler.supabase.com:5432/postgres`. **No password**
— so this is not a credential leak — but it commits the project ref and pooler host, and a Supabase CLI
scratch directory should not be in version control. **Not touched, not fixed, flagged only.**
