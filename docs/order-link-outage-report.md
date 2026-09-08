# Order-link outage — diagnosis (Pizzeria Gusto)

**GARBLED SPANS: none.**
**No file changed, no policy or grant altered, no write issued.** Every probe below is an anonymous HTTP GET or a read of the repo.

---

## 🟢 VERDICT — this is NOT an RLS/grant outage, and the path is working right now

**The entire customer order path uses the SERVICE-ROLE key, which bypasses BOTH RLS policies AND table GRANTs.** Today's revokes (anon grants on `trucks`, anon write on `orders`, the seven dropped policies) are therefore **architecturally incapable** of affecting customer ordering. Live probes confirm the path is up. Your mid-turn note agrees: **`/o/pizzeria-gusto` is working — the link the customer had likely changed.** The V12.1 manual correction ("the customer order page reaches its data through server routes on the service role and opens no realtime channel") is **correct** and is confirmed below by code + live measurement.

**No grant should be restored** (see the restore section — restoring would reopen the token leak for zero benefit).

---

## 1. Anonymous fetch of the two URLs

| URL | Result |
|---|---|
| `GET /o/pizzeria-gusto` | **307** → `location: /trucks/pizzeria-gusto/order` |
| `GET /trucks/pizzeria-gusto/order` | **200** (17 KB) |

- **No error redirect, no 4xx/5xx.** The 307→200 is the designed flow (`/o/` decides, `/trucks/[slug]/order` serves).
- The "15 error" strings in the body are **Next.js RSC framework markers** (`"error":"$undefined"`, `.next-error-h1` CSS), **not** real errors. The page is a client component; the menu and ordering controls are fetched in the browser from the API routes below (so they aren't in the SSR shell — expected).

## 2. Whole customer-order-path trace — file · table · client

| Step | File · line | Reads/writes | **Client** |
|---|---|---|---|
| `/o/` decider | `app/o/[slug]/page.tsx:44` → `lib/custom-domain/redirect-target.ts:18,45` | `trucks` (slug→custom domain) | **service role** (`SUPABASE_SERVICE_ROLE_KEY`) |
| Order page | `app/trucks/[slug]/order/page.tsx` (`'use client'`) + `layout.tsx` | **none directly** — no supabase client, **no realtime channel** | — (calls the API routes below) |
| Events | `app/api/events/route.ts:6` | truck/events | **service role** (`@/lib/supabase`) |
| Menu | `app/api/menu/[truckId]/route.ts:5` | trucks, menu, event stock | **service role** (`@/lib/supabase`) |
| Slots | `app/api/slots/[truckId]/route.ts:13-15` | orders, slot/capacity | **service role** (own `createClient` with `SUPABASE_SERVICE_ROLE_KEY`) |
| Submit | `app/api/orders/submit/route.ts:6,1038,1128,1155` | `place_order_atomic` RPC (INSERT orders), `orders` update, `upsell_events` | **service role** (`@/lib/supabase`) |

`lib/supabase.ts` = `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`. **There is no anon (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) client anywhere on the customer order path, and no `.channel()`/realtime.**

**Live probes (anonymous), all 200 with real data:**
- `/api/events?truck=pizzeria-gusto` → **200**, one **confirmed** event **today** (Fri 4 Sep, 17:00–20:00, Stambourne Village Hall).
- `/api/menu/pizzeria-gusto` → **200**, full menu, `"paused":false`, **`"ordering_available":true`**, `categories:[…]`.
- `/api/slots/pizzeria-gusto` → **200**, slot list returned (the 17:00 slot is `remaining:0` — genuine capacity 2/2, not an outage; later slots follow).

## 3. Does ANY anon-key query touch trucks / orders / the seven?

**No.** Enumerated from the customer path (not from the nine tables), **every** query runs on the **service-role** client. So no anon read of `trucks`, `orders`, `slot_capacity`, `collection_times`, `category_stock`, `item_overrides` or `order_counters` occurs on this path — the "silent empty array with 200" failure mode you flagged **cannot arise here**, because none of these are read with the anon key. (Service role bypasses the dropped policies and the revoked grants alike.)

## 4. Does order submission INSERT into `orders` with the anon key?

**No.** Submission calls `supabase.rpc('place_order_atomic', …)` (`submit/route.ts:1038`) on the **service-role** client; the `orders` INSERT happens **inside that RPC**, plus a service-role `orders` UPDATE (`:1128`). The **revoked anon INSERT grant on `orders` is irrelevant** — no anon INSERT is attempted. (Also confirmed the RPC path is the only order-creation route.)

## 5. Vercel function logs since 09:00 — reported as ABSENCE

🔴 **I could not read the Vercel runtime function logs.** `VERCEL_API_TOKEN` is present, but runtime/function logs are not retrievable via a simple REST call (they need a configured log drain or the dashboard), and I did not have a way to pull "since 09:00 today" for `/o/`, `/trucks/[slug]/order` or the submit route. **So I am reporting this as unread, not as "no errors found."** The **positive** substitute evidence is the live probes in §2: those exact routes return **200 with data now**, i.e. they are **not** currently returning `42501` / permission-denied.

---

## Restore question — nothing to restore

The cause is **not** a revoked grant, so **no grant or policy needs restoring** to fix ordering. For the record: the only revoke that could *conceivably* be blamed is anon SELECT on `trucks` — but **restoring it would reopen the `dashboard_token` leak** (`trucks` carries `dashboard_token` **and** `kds_pin`; that is the exact §1 account-takeover the revoke closed) **for zero benefit**, since the order path never uses the anon key. **Do not restore anything.**

## Most likely actual cause
A **stale/changed link**, consistent with your mid-turn note. The `/o/<slug>` redirector exists precisely so a printed code survives changes — but if the customer scanned an **older code or a different URL** (a previous slug, or a custom-domain/`order.` link that has since moved), that link could fail while `/o/pizzeria-gusto` works. The canonical link resolves and orders can be placed right now. If you have the exact URL the customer used, I can trace that specific string.

*2026-09-04, 08:32 UTC. Diagnosis only — no change made.*
