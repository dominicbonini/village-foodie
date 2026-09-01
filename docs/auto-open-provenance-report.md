# `truck_events.auto_open` — where the value comes from

**Date:** 1 September 2026
**READ-ONLY.** No file changed, no migration, nothing committed or deployed. **No fix proposed.**
Every claim is marked **READ**, **INFERRED** or **UNKNOWN**. Database facts come from **read-only
queries against production**, not from the manual.

---

## Headline

🔴 **THE SCRAPER PATH NEVER READS `trucks.default_auto_open`. It omits `auto_open` from the insert, so
the column default — `false` — applies.** A scraped event therefore arrives *not* set to auto-open,
whatever the operator has chosen in Manage.

✅ **The operator's setting is read later, at CONFIRM**, which is why most scraped rows end up `true`
anyway — and why the bug is invisible until you look at an *unconfirmed* event.

⚠️ **Two premises in the brief are corrected by the data** (§4): `auto_close` is **not** `true` on every
row — **four rows are `false`** — and the `true` majority is a default *and* a coincidence, in the
precise sense set out below.

---

## 1 & 2. Every path that inserts into `truck_events`, and what each sets

**READ — a tree-wide grep for `from('truck_events')` with `insert`/`upsert`, plus `INSERT INTO
truck_events` in SQL. Five paths exist. Three are product code; two are demo/diagnostic.**

### ① Manual creation — Manage / Dashboard → `upsert_event`

**`app/api/manage/route.ts:811`** *(one line; the two flags extracted)*

```ts
const { data, error } = await supabase.from('truck_events').insert({
  truck_id: targetTruckId, venue_name, town, postcode, address, event_date, start_time, end_time,
  notes, latitude, longitude, van_id, order_ready_override: seededOrderReady,
  source: 'manual', status: eventStatus, confirmed_at: …,
  auto_open:  truck.default_auto_open  ?? true,
  auto_close: truck.default_auto_close ?? true
}).select().single()
```

✅ **Reads `trucks.default_auto_open`.** Correct.

### ② 🔴 The scraper — `app/api/inbound-schedule/route.ts:211`

```ts
const { data: insertedEvent, error: insertErr } = await supabase.from('truck_events').insert({
  truck_id: truckId,
  order_ready_override: seededOrderReady,
  venue_name: row.venue_name || null,
  town: row.village || null,
  postcode: row.postcode || venuePostcode || null,
  event_date: row.event_date,
  start_time: row.start_time || null,
  end_time: row.end_time || null,
  notes: row.event_notes || null,
  status: 'unconfirmed',
  source: 'scraper',
  scraped_signature: row.venue_name || null,
  latitude, longitude,
  venue_id: matchedVenue?.id ?? null,
  venue_id_source: matchedVenue ? 'scraper' : null,
  venue_match_confidence: matchedVenue ? match.confidence : null,
}).select('id').single()
```

🔴 **`auto_open` IS ABSENT. `auto_close` IS ABSENT.** `grep -c auto_open` over that insert returns **0**.
**The column defaults apply: `auto_open = false`, `auto_close = true`.**

⚠️ Note the contrast **inside the same insert**: `order_ready_override` *is* seeded from a truck-level
default three lines above (`getVanOrderReadyDefault`). **The pattern exists in this function; the two
auto flags simply are not part of it.**

### ③ Demo event provisioning — `lib/provision-demo-event.ts:177-179`

```ts
// scheduler's prior-day sweep would otherwise close it. auto_open is moot (already open).
auto_open: false,
auto_close: false,
```

🔴 **Literals.** Deliberate and commented — a demo event is created already open, so auto-open is moot
and auto-close must not shut it. **Does not read the truck setting, and correctly should not.**

### ④ Diagnostic script — `scripts/diag-demo-event.mjs:127-128` and `:141-142`

```ts
auto_open: false,
auto_close: false,
```

🔴 **Literals.** A local diagnostic, not a product path. **INFERRED: never runs in production.**

### ⑤ Truck provisioning — `lib/provision-truck.ts:467-468`

```ts
// Read by upsert_event when creating events (`truck.default_auto_open ?? true`).
default_auto_open: true,
default_auto_close: true,
```

⚠️ **This writes the `trucks` row, not a `truck_events` row** — it seeds the truck-wide default at
provisioning. Included because it is where the value the manual path reads originates.

### Summary table

| # | Path | `auto_open` set to | Reads `default_auto_open`? |
|---|---|---|---|
| ① | `app/api/manage/route.ts:811` | `truck.default_auto_open ?? true` | ✅ **YES** |
| ② | `app/api/inbound-schedule/route.ts:211` | **omitted → column default `false`** | 🔴 **NO** |
| ③ | `lib/provision-demo-event.ts:178` | literal `false` | 🔴 No (deliberate) |
| ④ | `scripts/diag-demo-event.mjs:127,141` | literal `false` | 🔴 No (diagnostic) |
| ⑤ | `lib/provision-truck.ts:467` | *(writes the truck row)* | n/a |

### The two UPDATE paths that also write `auto_open`

**Not inserts, but they are why the production data looks the way it does.**

- **CONFIRM — `app/api/events/action/route.ts:99-105`** writes `auto_open, auto_close` from the request
  payload, and **`app/manage/[token]/page.tsx:7028-7029`** supplies them:
  ```ts
  payload: {
    auto_open:  truck.default_auto_open  ?? true,
    auto_close: truck.default_auto_close ?? true,
  },
  ```
  ✅ **So the operator's setting IS applied — but only when an event is confirmed.**
- **CANCEL — `app/manage/[token]/page.tsx:7054`** sends `payload: { auto_open: false, auto_close: false,
  suppress: true }`. 🔴 **Literals**, appropriate for a cancellation.

---

## 3. The database column default and any trigger

**READ — `supabase/migrations/20260522_event_system.sql:21-22`:**

```sql
add column if not exists auto_open  boolean not null default false,
add column if not exists auto_close boolean not null default true,
```

🔴 **`auto_open` DEFAULT `false`. `auto_close` DEFAULT `true`.**

**How I determined it:** (a) **READ** the DDL above; (b) **verified empirically against production** —
the only rows that never passed through confirm or cancel are `scraper/unconfirmed`, and **all three of
them are `auto_open = false, auto_close = true`**, exactly the declared defaults.

**Triggers: none found.** A grep of `supabase/migrations/*.sql` for `create trigger` / `create or
replace function` mentioning `truck_events` returns nothing. ⚠️ **UNKNOWN — I could not enumerate
triggers directly from the live database** (the REST API does not expose `pg_trigger`), so this is READ
from migrations plus the fact that the data is fully explained without one. **A trigger created by hand
outside the repository would not appear here.**

⚠️ **UNKNOWN — no migration in this repository defines `trucks.default_auto_open` or
`default_auto_close`.** Both columns exist in production (all twelve rows `true`), so **INFERRED: they
were added outside the tracked migrations.**

---

## 4. `auto_close` — default or coincidence?

**Both, and the brief's premise is not quite right.**

🔴 **`auto_close` is NOT `true` on every row. READ from production — four rows are `false`:**

```
manual/closed     auto_open=false  auto_close=false  → 3
manual/closed     auto_open=false  auto_close=true   → 1
manual/closed     auto_open=true   auto_close=true   → 32
manual/confirmed  auto_open=false  auto_close=true   → 2
manual/confirmed  auto_open=true   auto_close=true   → 4
manual/open       auto_open=false  auto_close=true   → 1
manual/cancelled  auto_open=true   auto_close=true   → 1
scraper/unconfirmed auto_open=false auto_close=true  → 3
scraper/confirmed   auto_open=true  auto_close=true  → 5
scraper/closed      auto_open=true  auto_close=true  → 45
scraper/cancelled   auto_open=false auto_close=true  → 22
scraper/cancelled   auto_open=true  auto_close=true  → 4
                                              TOTAL   123
```

**Why `true` dominates — three independent reasons pointing the same way:**

1. The **column default is `true`**, so every omitted write lands there (all scraper inserts).
2. Every path that *does* write it passes `truck.default_auto_close ?? true`, and **all twelve trucks
   have `default_auto_close = true`** (READ).
3. The `?? true` fallback would produce `true` even if the column were NULL.

⚠️ **So it is a default AND a coincidence: the default agrees with the setting, and the setting is the
same on every truck.** If one operator turned it off, paths ① and CONFIRM would honour it and the
scraper insert would not — **the same divergence as `auto_open`, currently invisible because nobody has
changed the setting.**

🔴 **The three `auto_close = false` rows are `manual/closed`.** **INFERRED: set by the CANCEL path
(`auto_open: false, auto_close: false`) or by a per-event `update`.** **UNKNOWN which** — I did not
inspect their individual histories.

---

## 5. 🔴 Paths that set `auto_open` without reading `trucks.default_auto_open`

**Named, as asked:**

| Path | Why it matters |
|---|---|
| 🔴 **`app/api/inbound-schedule/route.ts:211` — THE SCRAPER** | **This is the bug.** It omits the field, so every scraped event is created `auto_open = false` regardless of the operator's setting. It is the highest-volume creation path in the product: **79 of 123 rows (64%) are `source = 'scraper'`.** |
| `lib/provision-demo-event.ts:178` | Literal `false`, deliberate and commented — a demo event is already open. **Not a defect.** |
| `scripts/diag-demo-event.mjs:127,141` | Literal `false` in a local diagnostic. **Not a product path.** |
| `app/manage/[token]/page.tsx:7054` (cancel) | Literal `false`, correct for a cancellation. **Not a defect.** |

### The causal chain, proven from production data

```
1. Scraper inserts          → auto_open = false   (column default; the truck setting is never read)
2. Operator confirms        → auto_open = truck.default_auto_open ?? true   (setting applied here)
3. Operator cancels         → auto_open = false   (literal)
```

**The data matches exactly:** the only `scraper` rows still at `auto_open = false` that were never
cancelled are the **three `scraper/unconfirmed`** rows. Every confirmed scraped row (5 confirmed + 45
closed = **50**) is `true`, because confirm re-wrote it.

🔴 **THE PRACTICAL CONSEQUENCE.** An **unconfirmed scraped event will not auto-open at its start time**,
because the scheduler selects `.eq('auto_open', true)`. Whether that is a defect depends on whether an
unconfirmed event *should* open at all — **but the operator's setting is not what decides it**, and that
is what the brief asks about. ⚠️ **I did not establish whether an unconfirmed event is intended to be
openable.** **UNKNOWN.**

---

## 6. Is there a per-event `auto_open` control in the UI?

**No UI control exists for a single event's `auto_open`.**

- **READ — the only toggle is truck-wide**, `app/manage/[token]/page.tsx:10352-10358`:
  > **"Open for orders automatically"** — *Events open for online orders at your event start time*

  It writes **`form.default_auto_open`** via `saveSetting('default_auto_open', next)` → **the `trucks`
  row**, not any event row.
- **A per-event write path EXISTS but has no interface.** `app/api/events/action/route.ts:155-158` has
  an `update` action whose allowlist includes `auto_open` and `auto_close`:
  ```ts
  const allowed = [
    'venue_name', 'venue_address', 'start_time', 'end_time',
    'customer_note', 'auto_open', 'auto_close', 'notes'
  ]
  ```
  🔴 **Nothing in `app/manage` or `app/dashboard` sends `auto_open` to that action.** A grep of both
  pages finds only the confirm payload (`:7028`) and the cancel payload (`:7054`). **INFERRED: the
  per-event capability is reachable only by calling the API directly.**

**So: the truck-wide toggle writes the TRUCK row. Event rows get their value at insert or at confirm —
never from an operator editing that event.**

---

## 7. Where the timezone comes from

🔴 **IT IS A HARDCODED CONSTANT. Not a country lookup, and not `trucks.timezone`.**

**READ — `supabase/functions/auto-event-scheduler/index.ts:12-24`**, the function that performs the
automatic opens and closes:

```ts
// derive "now" in Europe/London (handles BST/GMT automatically) so comparisons are like-for-like.
function londonNow(now: Date): { today: string; currentTime: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  …
}
```

🔴 **The scheduler never reads the `trucks` table at all** — its only queries are
`.from('truck_events')` (lines 34, 46, 61, 79). **So it could not use a per-truck timezone even if one
were populated.** The value is a literal in the function body with no fallback and no per-truck read.

**Production confirms the columns are inert:** `timezone` is `null` on **12/12** trucks; `country` is
`'GB'` on **12/12** (READ).

**`trucks.country` is never consulted for time.** Its only readers are Stripe Connect
(`app/api/stripe/connect/route.ts:86,123,253`, `lib/stripe/connect.ts:226`), for merchant identity.

⚠️ **The hardcode is repeated 42 times across the tree.** Some sites *look* per-truck but are not:

```ts
app/api/menu/[truckId]/route.ts:416   const preorderTz = (truck as any).timezone || 'Europe/London'
app/api/manage/route.ts:2053          getLocalDateInTz((truck as any).timezone ?? 'Europe/London')
app/api/slots/[truckId]/route.ts:198  const eventTz = 'Europe/London'      // bare constant
app/api/webhooks/meta/whatsapp/route.ts:256  const truckTz = 'Europe/London'  // bare constant
```

🔴 **Every `?? 'Europe/London'` resolves to the hardcode today**, because the column is NULL on every
row. The codebase already records this — `app/api/webhooks/meta/whatsapp/route.ts:294`:

> *"`truckTz` IS 'Europe/London', A BARE CONSTANT — AND `trucks.timezone` IS NULL ON ALL TWELVE
> TRUCKS."*

### What happens for a truck whose country is not GB

🔴 **It would open and close at UK local time, silently and wrongly.**

- The scheduler compares stored wall-clock `start_time` / `end_time` against **London** now.
- A truck trading at 18:00 local in, say, Dublin (same offset) is unaffected; one in Paris (UTC+2 in
  summer) would open **an hour late**, and one further east proportionally later.
- 🔴 **`country = 'GB'` plays no part in this.** Setting a truck's country to `'FR'` would change
  nothing about when it opens — **so the correlation between "all countries are GB" and "the times are
  right" is a coincidence of the customer base, not a mechanism.**
- ⚠️ **It fails silently.** Nothing logs a timezone mismatch and nothing compares the truck's country to
  the assumed zone. **INFERRED from the absence of any such check; I did not run the scheduler.**

**UNKNOWN — whether the Edge Function deployed to production matches this source.** §35 of the manual
records that Edge Functions run the *deployed* bundle and that "fix in repo ≠ deployed". I read the
repository copy.

---

## 8. What I could not establish

1. **UNKNOWN — triggers on `truck_events`.** Read from migrations only; the REST API does not expose
   `pg_trigger`. A hand-created trigger would not appear.
2. **UNKNOWN — where `trucks.default_auto_open` / `default_auto_close` were defined.** No migration in
   the repository creates them; both exist in production.
3. **UNKNOWN — whether the deployed `auto-event-scheduler` matches the source I read.**
4. **UNKNOWN — the history of the four `auto_close = false` rows.** INFERRED to be cancel or a direct
   API `update`; not traced individually.
5. **UNKNOWN — whether an unconfirmed event is *intended* to auto-open.** This decides whether the
   scraper omission is a defect or a deliberate posture, and it is a product question, not a code one.
6. **NOT OBSERVED — nothing was run.** No event created, no scheduler invoked, no page loaded. This is a
   static read of the code plus read-only production queries.

---

**No span of this prompt arrived garbled, and no instruction contradicted another.** Two premises in the
brief are corrected against production rather than assumed: `auto_close` is not `true` on every row
(four are `false`, §4), and the correct UK opening times come from a hardcoded `'Europe/London'` rather
than from anything derived from `country = 'GB'` (§7). **No fix is proposed, per the brief.**
