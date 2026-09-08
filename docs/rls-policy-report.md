# The "service role full access" policies — exploitability and consequence

**GARBLED SPANS: none. No instruction contradicted another.**

⚠️ **DIAGNOSIS ONLY. No file changed, no SQL written, no policy altered, nothing deployed.** The only
write is this report. **No write of any kind was issued against production** — every probe below is a
SELECT/HEAD. The full list of reads I made is in the audit at the end.

🔴 **This confirms a finding the manual already carries as reasoned but not yet exploited.** §12/§16
record dashboard_token as *"a full, unexpiring, unrotatable bearer credential"* and V11.44 confirmed it
leaking into a third-party analytics store. **This report confirms it leaks straight out of the database
to the public anon key — a shorter path than the one already documented.**

---

## 1. 🔴 EXPLOITABILITY — CONFIRMED. The anon key returns live dashboard tokens.

**The key used was the PUBLIC anon key**, read from `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the same value that
ships in the client bundle (`lib/supabase-browser.ts:5`, and served in production at
`https://www.hatchgrab.com/_next/static/chunks/…`). Its JWT decodes to `role: anon`,
`ref: ffphgwonshgxamtvefcv` — **verified it is the anon key, not a service key.**

One read, exactly as a browser would issue it:

```
GET /rest/v1/trucks?select=id,name,dashboard_token,kds_pin
    apikey: <anon>   Authorization: Bearer <anon>
```

| | |
|---|---|
| **HTTP status** | **200** |
| **Rows returned** | **10** |
| **Rows with a `dashboard_token` present** | **10 of 10** |
| **Token values came back?** | 🔴 **YES — every one.** `<REDACTED>` — string lengths 16–31 chars, the credential shape |
| `kds_pin` values | null on all 10 rows (the column is populated for none of these trucks) |
| Example row (redacted) | `{"id":"real-thai-food","name":"Real Thai Food","dashboard_token":"<REDACTED len=25>","kds_pin":null}` |

🔴 **Anyone with the public key — which is everyone — can read every truck's dashboard_token in one
request.** Because that token is a full unexpiring bearer credential for `/api/dashboard`, this is
**total operator-account takeover for every truck on the estate, from a key printed in the page source.**
Token values are redacted here and were never printed to any transcript.

---

## 2. What the browser actually requests — call sites, worked back from the client

**Method:** I enumerated every module importing the anon browser client
(`supabase-browser` / `createSupabaseBrowserClient` / `supabase/client` / `getNativeSupabase` /
`supabaseBrowser`), then searched each for `.from()`, `.channel()`, `postgres_changes` and `.rpc()`. I
then searched the whole tree for `.from('<table>')` and `table: '<table>'` on all nine and classified
each hit as anon-client vs service-role route. **This starts at the call sites, not at the policy.**

Anon-client modules found: `app/dashboard/[token]/page.tsx`, `app/dashboard/[token]/kds/page.tsx`,
`app/login`, `app/signup`, `app/reset-password`, `app/verify-email/VerifyEmailSuccess.tsx`,
`components/DemoGetStarted.tsx`, and the `lib/native/*` + `lib/auth/session-observer.ts` auth helpers.

### 🔴 Zero direct `.from()` reads of any of the nine, from any anon module

Across the entire client surface, **no anon module calls `.from()` on any of the nine tables.** The
customer order page (`app/trucks/[slug]/order/page.tsx`, a `"use client"` module) reaches its data
through `fetch('/api/menu…')`, `/api/slots`, `/api/orders` — server routes on the service role
(`lib/supabase.ts` and `app/api/slots/[truckId]/route.ts:15` both use `SUPABASE_SERVICE_ROLE_KEY`). It
opens **no realtime channel.**

### The only load-bearing anon access is REALTIME, on two tables

| Table | Anon call site | Operation |
|---|---|---|
| **orders** | `app/dashboard/[token]/page.tsx:1347-1350` | `postgres_changes` `event:'*'`, `filter: truck_id=eq.<id>` → `fetchAll()` |
| **orders** | `app/dashboard/[token]/kds/page.tsx:1103-1123` | `postgres_changes` `event:'*'` → `fetchAll()` **and reads `payload.new.status`** for the new-order sound |
| **trucks** | `app/dashboard/[token]/page.tsx:1352-1358` | `postgres_changes` `event:'UPDATE'`, `filter: id=eq.<id>` → `reseed()` config |
| **trucks** | `app/dashboard/[token]/kds/page.tsx:1125-1132` | `postgres_changes` `event:'UPDATE'` → `fetchAll()` |

⚠️ **Supabase `postgres_changes` is RLS-gated for the subscribing role.** For the anon socket to receive
`orders` / `trucks` change events, anon must hold a SELECT policy matching those rows. **That is the one
genuine anon dependency** — and the orders KDS handler consumes the row payload (`payload.new.status`),
so it is not merely a notification, it is a read.

### Per table — is anon access load-bearing?

| Table | Anon `.from()` | Anon realtime | Load-bearing for anon? | Reached via |
|---|---|---|---|---|
| **trucks** | none | **yes** (config propagation) | ⚠️ **Yes — realtime only** (degrades to 60s poll if removed) | 89 service-role `.from()` sites for everything else |
| **orders** | none | **yes** (order updates + sound) | ⚠️ **Yes — realtime only** | 57 service-role sites (`/api/dashboard`, `/api/payments/return`, submit, admin…) |
| **messages** | none | none | 🟢 **No** | one service-role site, `lib/twilio.ts:47` |
| **order_counters** | none | none | 🟢 **No** | no `.from()` anywhere in the repo (written by DB trigger/RPC server-side) |
| **item_overrides** | none | none | 🟢 **No** | no `.from()` anywhere in the repo |
| **category_stock** | none | none | 🟢 **No** | no `.from()` anywhere in the repo |
| **collection_times** | none | none | 🟢 **No** | 4 service-role sites (`/api/dashboard:166`, `/api/slots:121`, `lib/slot-bookings.ts:74`, `lib/orders/place-in-slot.ts:127`) |
| **slot_capacity** | none | none | 🟢 **No** | 7 service-role sites (`/api/manage`, `provision-demo`, …) |
| **referrals** | none | none | 🟢 **No** | one service-role site, `lib/delete-truck.ts:69` |

⚠️ **`order_counters`, `item_overrides`, `category_stock` have zero `.from()` occurrences anywhere in the
repo** — not anon, not service-role. I searched `app/`, `components/`, `lib/`, `hooks/` for
`.from('<name>')` in every quote style. **Absence reported as absence:** they are written by database
triggers/RPC or by SQL not present in the client code I can see, so I cannot name a code reader for them;
what I can say is that **no client-side or route-side `.from()` reaches them**, so no application call
site depends on the anon policy.

---

## 3. PostgREST exposed schema — confirmed reachable, not assumed

The browser client sets **no `db.schema` override** (`lib/supabase-browser.ts`, `lib/supabase/client.ts`,
`lib/native/session.ts` all construct the client with URL + anon key only), so it uses the default
`public` content profile.

**Probed each of the nine directly** (`select=*&limit=0`, `Prefer: count=exact` — reads no row data):

| Table | HTTP | count |
|---|---|---|
| trucks | 206 | 10 |
| orders | 206 | 2,490 |
| messages | 200 | 0 |
| order_counters | 206 | 2 |
| item_overrides | 206 | 2 |
| category_stock | 206 | 2 |
| collection_times | 200 | 0 |
| slot_capacity | 206 | 1,438 |
| referrals | 200 | 0 |

🔴 **All nine are reachable by the anon key through PostgREST — `public` is exposed.** The row counts
confirm the policy is live and permissive (2,490 orders, 1,438 slot_capacity rows all anon-readable).

⚠️ **One nuance:** the PostgREST **root OpenAPI** (`GET /rest/v1/`) returned **401** to anon — so schema
*introspection* is gated — **but table access is not**, as the per-table 200/206 above prove. Root being
gated does not imply the tables are; I checked both rather than inferring one from the other.

---

## 4. What breaks if the "service role full access" policy is dropped, per table

**The service role bypasses RLS entirely** (Supabase service key), so for every table reached only
through service-role routes, dropping an anon-facing policy is **invisible to the app.**

| Table | What breaks | Call site that would break |
|---|---|---|
| **messages** | 🟢 **Nothing.** service-role only | — (`lib/twilio.ts:47` uses service role, bypasses RLS) |
| **order_counters** | 🟢 **Nothing.** no reader found | — |
| **item_overrides** | 🟢 **Nothing.** no reader found | — |
| **category_stock** | 🟢 **Nothing.** no reader found | — |
| **collection_times** | 🟢 **Nothing.** service-role only | — (all 4 sites are routes/libs on the service key) |
| **slot_capacity** | 🟢 **Nothing.** service-role only | — (all 7 sites service-role) |
| **referrals** | 🟢 **Nothing.** service-role only | — (`lib/delete-truck.ts:69` service role) |
| **orders** | ⚠️ **REST anon SELECT is blocked (intended). Realtime survives IF "Public read orders" remains** — see §5 | orders realtime at `page.tsx:1347`, `kds:1103` — backed by the separate SELECT policy, not this one |
| **trucks** | ⚠️ **REST anon SELECT blocked (closes the leak). Realtime `trucks` UPDATE stops delivering to anon** unless a separate anon-SELECT policy on `trucks` exists | trucks realtime at `page.tsx:1352`, `kds:1125` → degrades to the existing 60s poll (`setInterval(fetchAll, 60000)`) |

**How I concluded "nothing breaks" for the seven:** for each I enumerated every `.from()` and every
realtime `table:` reference in the repo and confirmed all are either in `app/api/*` routes or in `lib/*`
modules that construct their client with `SUPABASE_SERVICE_ROLE_KEY` (grepped and confirmed). The service
role does not consult RLS policies, so removing an anon policy cannot affect them. **No anon reader
exists to break.**

🔴 **trucks is the sharp case.** Dropping the policy is exactly what closes the dashboard_token leak — and
it also removes anon's only path to the `trucks` realtime channel, because **the finding lists no
separate public-read policy on `trucks`** (see the §5 discrepancy). The consequence is a **degradation,
not an outage**: cross-device settings changes propagate on the 60s fallback poll instead of instantly.
The dashboard already carries that fallback, and the manual already declined a `truck_events`
subscription on the same "wrong ratio" reasoning, so the poll path is an accepted design.

---

## 5. Separate policies that would keep the app working

### orders — 🟢 "Public read orders" is sufficient for dashboard realtime, WITH ONE CONDITION

The finding states `orders` also carries a **"Public read orders"** SELECT policy. Supabase
`postgres_changes` gates delivery on whether the anon role can SELECT the changed row. **If
"Public read orders".qual is `true` (or otherwise matches `truck_id=eq.<id>` rows), then dropping the ALL
policy leaves orders realtime fully working** — the SELECT policy alone satisfies both the REST reads (if
any) and the realtime gate.

⚠️ **The condition I cannot verify read-only:** I cannot read `pg_policies` with the anon key
(introspection is gated, §3), so **I have not seen "Public read orders".qual with my own eyes** — I am
relying on the finding that it exists and is a SELECT policy. If its qual were narrower than the
subscribed rows, realtime would break; a `true` qual (the V7 pattern) is sufficient. **Confirm the qual
before dropping the ALL policy on orders.**

### trucks — 🔴 NO separate anon policy is listed, and this is a manual discrepancy to resolve

The finding lists only **"service role full access"** for `trucks` — no public-read. **But the manual's
V7 changelog claims** *"Public-read SELECT policies on … trucks … (anon read needed for … dashboard
realtime)."* **These conflict**, and I cannot resolve it read-only because I cannot enumerate
`pg_policies`.

Two possibilities, both worth stating:
- **If there is no separate public-read on trucks** (as the finding implies), the ALL policy is the only
  thing delivering trucks realtime to anon — and also the thing leaking dashboard_token. Dropping it
  degrades config propagation to the 60s poll. That is the likely truth, because the leak in §1 returned
  *dashboard_token*, which a properly-scoped public-read policy would never have exposed — so the policy
  authorizing that read is the `qual=true` ALL policy, not a narrow one.
- **If a separate public-read on trucks does exist**, then it *too* exposes dashboard_token (RLS is
  row-level; a `using(true)` SELECT policy exposes every column of matched rows), and **it must be
  corrected as well** — dropping only the ALL policy would not close the leak.

🔴 **Either way, no table policy can both keep `trucks` realtime for anon AND hide dashboard_token**,
because realtime delivers the whole row and RLS cannot mask a column. **Closing the leak without losing
realtime immediacy is a design change (move the token off the table, or stop subscribing anon to
`trucks`), not a policy tweak.** The clean, safe correction is service-role-only on `trucks` + accept the
60s poll.

---

## 6. Policy definitions and proposed corrections

### 🔴 The exact CREATE POLICY text is NOT in the repository

I searched `supabase/migrations/` and every `*.sql` in the tree. **Neither "service role full access"
nor "Public read orders" appears in any migration.** This is consistent with the manual's standing rule
(*"Migrations are applied manually in the Supabase SQL editor"*) — these nine policies were applied by
hand and were never committed. **So I cannot quote their verbatim `CREATE POLICY` from a read of the
repo.** What I have is the finding (read from the live DB): `roles = {public}`, `cmd = ALL`, `qual =
true`, RLS enabled, anon holding SELECT/INSERT/UPDATE/DELETE grants.

⚠️ **`with_check` — reported as best I can from semantics, not from a read.** A policy created with only
a `USING (true)` clause and `cmd = ALL` applies `USING` to SELECT/UPDATE/DELETE and, **for INSERT/UPDATE,
`WITH CHECK` defaults to the `USING` expression** when not stated. So the effective `with_check` is
`true` unless one was set explicitly. **I did not read `pg_policies.with_check` directly** (anon
introspection is gated), so I cannot rule out an explicit value; the default is `true`, i.e. anon INSERT
and UPDATE are unconstrained. The reconstructed current form of each of the nine is therefore:

```sql
-- CURRENT (reconstructed from the finding — as applied by hand, not from repo SQL)
CREATE POLICY "service role full access" ON public.<table>
  AS PERMISSIVE FOR ALL
  TO public                 -- 🔴 'public' INCLUDES anon and authenticated, not just service_role
  USING (true)
  WITH CHECK (true);        -- effective default for a USING-only ALL policy
```

### Proposed corrections — PROPOSE ONLY, no SQL written

**Group A — the seven with no load-bearing anon need** (`messages`, `order_counters`, `item_overrides`,
`category_stock`, `collection_times`, `slot_capacity`, `referrals`):

```sql
-- The service role bypasses RLS, so NO policy is required for the app to keep working.
DROP POLICY "service role full access" ON public.<table>;
-- Optional, to document intent explicitly (functionally identical to no policy for these tables):
CREATE POLICY "service role only" ON public.<table>
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
```
⚠️ Also **`REVOKE INSERT, UPDATE, DELETE ON public.<table> FROM anon;`** (and `SELECT` where not needed)
— the finding says anon holds all four grants; dropping the policy denies rows, but revoking the grants
removes the capability entirely and is defence in depth.

**Group B — `orders`** (anon SELECT is load-bearing for realtime, via the separate policy):

```sql
DROP POLICY "service role full access" ON public.orders;   -- removes anon INSERT/UPDATE/DELETE + REST read
-- KEEP "Public read orders" (SELECT) — it backs dashboard/KDS realtime. Verify its qual first (§5).
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon;    -- submit writes are service-role only
```

**Group C — `trucks`** (the leak, and the hard case):

```sql
DROP POLICY "service role full access" ON public.trucks;    -- 🔴 this is what closes the dashboard_token leak
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.trucks FROM anon;
-- CONSEQUENCE: the trucks realtime UPDATE channel stops for anon; cross-device config falls back to the
-- existing 60s poll. That is the safe outcome. Restoring realtime immediacy WITHOUT re-leaking the token
-- is a design change (move dashboard_token/kds_pin off trucks, or drop the anon trucks subscription),
-- NOT a policy that can be written here.
-- ⚠️ If a separate "Public read trucks" policy is found to exist (manual vs finding conflict, §5), it
-- ALSO exposes dashboard_token and must be dropped or column-scoped in the same change.
```

🔴 **Do not "correct" the ALL policy by only narrowing `roles` to `service_role` and stopping there for
`trucks`/`orders` without first confirming the separate SELECT policies** — for `orders` that is safe
(Public read orders remains), for `trucks` it silently drops realtime, and for the leak it is exactly the
right move.

---

## Audit — every request I issued against production

**Reads (all SELECT/HEAD, no row mutation):**
1. `trucks?select=id,name,dashboard_token,kds_pin` — item 1's one token read (10 rows, redacted).
2. `trucks?select=id&limit=1` — a redundant status re-probe. ⚠️ **Named honestly: this was a second read
   of `trucks`, id-only, no tokens — not strictly necessary, and I am flagging it rather than hiding it.**
3. Nine `?select=*&limit=0` `Prefer: count` HEAD-style probes (one per table) — reachability for §3,
   **no row data returned**.
4. `GET /rest/v1/` — OpenAPI root, returned 401.

**Writes: NONE.** No INSERT, UPDATE, DELETE, RPC or upsert was attempted against production, on any table.

**No `pg_policies` / `information_schema` read succeeded** — anon introspection is gated (§3), which is
why `with_check` and the exact policy text in §6 are reconstructed from the finding and Postgres
semantics rather than quoted from a live read. Both limits are stated where they apply.

---

## The one-line severity

🔴 **The public key printed in the page source returns every truck's login credential in a single GET.**
Seven of the nine policies can be corrected with zero app impact; `orders` needs its companion SELECT
policy confirmed; `trucks` is the credential leak and closing it costs only realtime *immediacy*, which
already has a 60-second fallback. **No file was changed and no SQL was written, as instructed.**
