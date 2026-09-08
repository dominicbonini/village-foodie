# Village Foodie map events — diagnosis

**GARBLED SPANS: none. No instruction contradicted another.**

⚠️ **DIAGNOSIS ONLY. No file changed, no policy or grant altered, nothing restored, nothing deployed.**
Every action was a GET to the endpoint or a file read. I did **not** reverse the revoke to test anything.

🔴 **HEADLINE: THE HYPOTHESIS IS REFUTED. The map's server read path uses the SERVICE ROLE for every query
and returns 708 events on production right now — the anon/authenticated grant revoke cannot and does not
affect it.** There is no anon-key query in the path to be denied.

---

## The endpoint the map calls

Found by tracing, not assumed: `app/page.tsx` → `hooks/useVillageData.ts:34` →
**`GET /api/discovery/events`** (`app/api/discovery/events/route.ts`). The client fetches it with a
cache-busting `?t=<now>` and `cache: 'no-store'`.

## 1. Production vs local — both healthy, both identical

| | HTTP | events | trucks |
|---|---|---|---|
| **Production** `https://www.villagefoodie.co.uk/api/discovery/events` | **200** | **708** | 119 |
| **Local dev** (villagefoodie host, same hosted DB) | **200** | **708** | 119 |

🔴 **Production returns 708 events, not ~3.** Sources: 707 `discovery`, 1 `operator`. Local returns the
**identical** 708 (it queries the same production Supabase). **The endpoint is not returning a degraded
response.** Of the 708, **79 carry map coordinates** (venue lat/long) — the rest have no venue coords and
were never pinnable. Those 79 span **35 distinct venue pins across 8 trucks**, and **only 1 is dated
today**.

## 2. Which Supabase client each query uses — 🔴 SERVICE ROLE, EVERY ONE

The route constructs **exactly one** client, at `app/api/discovery/events/route.ts:7-10`:
```ts
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!    // ← service role
)
```
Every query in the read path uses it:

| Query | Line | Table | Client |
|---|---|---|---|
| discovery events (main) | `:84` | `discovery_events` (embeds `venues`) | **service role** |
| discovery trucks (visible) | `:93` | `discovery_trucks` | **service role** |
| orphaned-event name map | `:125` | `discovery_trucks` (all) | **service role** |
| operator events | `:191` | `truck_events` embedding **`trucks!truck_id`** | **service role** |
| operator read-through | `:241` | `discovery_trucks` (linked) | **service role** |

🔴 **ABSENCE REPORTED AS ABSENCE: there is NO anon-key query anywhere in this route** — grepped for
`ANON_KEY`, a second `createClient`, `supabase-browser`, `supabase/client`: none. Nor does any client
component on the map path (`MapView.tsx`, `app/page.tsx`, `useVillageData.ts`) make an anon Supabase
query — the only client-side call is the `fetch` above. **Item 2's premise — "any query touching `trucks`
with the anon key now returns permission denied" — has ZERO instances.** The `trucks` read is at `:191`,
via the service role, which bypasses RLS entirely; the revoke of anon/authenticated grants leaves it
untouched. The endpoint returning a full 708 confirms this behaviourally.

## 3. How a failed / empty truck lookup is handled

Two mechanisms, both quoted verbatim. **Both are real; neither is triggered by the revoke, because the
queries succeed under the service role.**

**(a) The main discovery query FAILS CLOSED to empty** (`:104-114`):
```
} catch (err) {
    // FAIL CLOSED: on error we drop the scraped-discovery feed entirely rather than fall back to an
    // UNFILTERED query — the old fallback could leak hg_only/hidden rows onto the public Village Foodie
    // site. Operator events are computed separately below and are unaffected by this.
    console.error('[Discovery] Scraped-discovery query failed — failing closed (empty):', err)
    evData = []
    trData = []
}
```
If this query had failed, **all** discovery events would vanish (leaving only operator events). It is
**not** failing — 707 discovery events come back — because it is a service-role query.

**(b) A per-event SILENT DROP when the truck cannot be resolved** (`:139-152`):
```
const truck = e.discovery_trucks || discByName.get(normalize(e.truck_name || '')) || {}
…
if (truck.excluded) return null
// Truck-level gate (in case the event row passed but its truck is not shown on this site).
if (!truck[showCol]) return null
```
🔴 **This IS the "swallowed error that filters events silently" the hypothesis describes** — an event whose
truck resolves to `{}` fails `!truck[showCol]` and is dropped with no error. **So the mechanism exists.**
But it fires on the truck's own `excluded`/`show_on_vf` fields, read via the **service role** — not on a
permission denial. With the revoke in place the endpoint still returns 707 discovery events, so this drop
is not being mass-triggered. **Confirmed as a real code path; refuted as the cause here.**

**(c) Operator events are best-effort** (`:189`, `:233`): the whole block is wrapped in `try/catch` that
logs and continues, and the read-through "on failure the map is empty and we fall back to operator-only
fields … never throw." A failure there cannot break the discovery feed.

## 4. How the route decides an event belongs to a discovery truck — BOTH FK and name

`:141`: `const truck = e.discovery_trucks || discByName.get(normalize(e.truck_name || '')) || {}`.
It tries the **foreign-key join first** (`e.discovery_trucks`, resolved via `discovery_truck_id`), then
**falls back to a normalised-name match** against all discovery trucks (`discByName`), then `{}`.

🔴 **So the route does NOT filter on the FK alone — it deliberately recovers the orphaned (null-FK) events
by name** (`:120-137`, "~half of discovery_events have a NULL discovery_truck_id … recover the STATIC
truck by normalized name"). **Therefore the FK sparsity — 81/737 populated, 9 trucks by key — does NOT
explain a small residue:** the name fallback is exactly what lets 707 discovery events through rather than
~81. FK sparsity is handled, not a cause.

## 5. Production server logs

🔴 **I could not read the production server logs — I have no access to the Vercel runtime logs from here.**
**Absence of access, reported as such — NOT a claim that there are no 42501 errors.** What I can say: if
the revoke were breaking this path, the code would emit `[Discovery] Scraped-discovery query failed —
failing closed (empty)` and the endpoint would return an empty (or operator-only) feed. It is instead
returning a full 708, so that failure branch is not firing. To read the actual logs, check the Vercel
dashboard's Functions logs for `/api/discovery/events` since ~09:00 for `42501` / `permission denied`.

---

## Conclusion — and why I propose no fix

**The revoke did not break the map's server read path.** The path is service-role-only, returns 708 events
on both production and local, and contains no anon query that the grant revoke could deny. Items 2 and 3's
hypothesis — anon `trucks` read denied → events dropped — is **refuted at the read**, not merely doubted:
there is no such read.

⚠️ **What the server measurement does NOT explain, and where the "~3 pins" actually comes from:** the map
pins only events with **venue coordinates** — 79 of 708 — and the client then applies a **date filter**
(default `'all'` = next 14 days) and an optional distance filter. Only **1 coord-bearing event is today**,
and the pins collapse to **35 venues / 8 trucks** over the window. **The reduction to a handful of pins is
CLIENT-SIDE (coords + filter), not a server regression from the revoke.** Whether "more earlier today"
reflects a genuine change is not visible in the server response, which is full — so if it is real it lies
in the client filter/viewport, the venue-coord coverage, or a transient, **none of which is the revoke.**

🔴 **No fix proposed, per instruction** — and there is nothing to fix in the server read path, which is
healthy. **No grant or policy was restored.** If you want the client-side pin behaviour or the coord
coverage investigated, that is a separate, safe piece of work.

**Nothing changed. Nothing deployed. The revoke stands.**
