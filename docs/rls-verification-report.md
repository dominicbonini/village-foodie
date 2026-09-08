# RLS remediation — behavioural verification

**GARBLED SPANS: none. No instruction contradicted another.**

⚠️ **VERIFICATION ONLY. No file changed, no policy altered, no write of any kind issued** against
production — every probe below is a SELECT/HEAD or a realtime *subscribe* (no row was inserted, updated
or deleted). Token values are redacted and were never printed to any transcript.

**Headline: the leak is closed, confirmed from behaviour, not from a success message.** The exact §1
request that returned ten live `dashboard_token` values now returns **401 permission denied**.

---

## Item 1 — the exact §1 request, re-issued ✅ RAN

Same key (public anon, `role: anon`, `ref: ffphgwonshgxamtvefcv` — re-decoded, unchanged), same request:

```
GET /rest/v1/trucks?select=id,name,dashboard_token,kds_pin
    apikey: <anon>   Authorization: Bearer <anon>
```

| | Before (§1) | **Now** |
|---|---|---|
| **HTTP status** | 200 | 🟢 **401** |
| **Rows / tokens returned** | 10 rows, 10 tokens | 🟢 **none — no array, no row, no token** |

**Response body, verbatim** (an error object — no token in it, safe to quote in full):

```json
{"code": "42501", "details": null,
 "hint": "Grant the required privileges to the current role with: GRANT SELECT ON public.trucks TO anon;",
 "message": "permission denied for table trucks"}
```

🟢 **No token value came back. Stated plainly: the anon key can no longer read `trucks` at all.** This is
a `42501` *table-privilege* denial (the REVOKE), which is a harder stop than an RLS row filter — the
request is refused before any row is considered.

---

## Item 2 — nine-table reachability, re-probed ✅ RAN

`select=*&limit=0`, `Prefer: count=exact` (reads no row data — the count is a header):

| Table | Before (§3) | **Now: HTTP** | **Now: count** | Reading |
|---|---|---|---|---|
| **trucks** | 206, 10 | 🟢 **401** | — | `permission denied for table trucks` — grant revoked, table closed |
| **orders** | 206, 2490 | ⚠️ **206** | **2455** | 🟢 **still readable — EXPECTED.** "Public read orders" SELECT policy survives; this is the load-bearing realtime gate |
| messages | 200, 0 | 200 | 0 | policy gone; was already empty |
| order_counters | 206, **2** | 200 | **0** | 🟢 policy drop now filters all rows (was 2) |
| item_overrides | 206, **2** | 206 | **0** | 🟢 was 2 → 0 |
| category_stock | 206, **2** | 200 | **0** | 🟢 was 2 → 0 |
| collection_times | 200, 0 | 200 | 0 | was already empty |
| slot_capacity | 206, **1438** | 206 | **0** | 🟢 was 1438 → 0 — the clearest proof the drop took effect |
| referrals | 200, 0 | 200 | 0 | was already empty |

🔴 **Two different remediation shapes are visible, and the difference matters:**
- **`trucks` → 401** (grant *revoked*): the table is refused outright.
- **The seven dropped-only tables → 200/206 with count 0** (policy *dropped*, grant *intact*): the request
  is *accepted* but RLS default-deny returns **zero rows**. Data is withheld — `order_counters`,
  `item_overrides`, `category_stock` and `slot_capacity` all went from populated counts to 0 — **but the
  anon SELECT grant still exists on those seven.** No data leaks, and this is safe; it is defence-in-depth
  short of the `trucks`/`orders` treatment. Worth a follow-up `REVOKE` for symmetry, not a live risk.
- **`orders` → 206, 2455 rows** (ALL policy dropped, "Public read orders" kept): still readable **by
  design**, because orders realtime needs it (Item 4).

---

## Item 3 — narrower `trucks` probes, so a token-column failure isn't mistaken for closure ✅ RAN

| Request | HTTP | Body |
|---|---|---|
| `trucks?select=id` | 🟢 **401** | `permission denied for table trucks` |
| `trucks?select=name` | 🟢 **401** | `permission denied for table trucks` |

🟢 **Both non-secret columns are refused with the same table-level `42501`.** This rules out the
false-positive the instruction warned about: the closure is **the whole `trucks` table denied to anon**,
not merely the `dashboard_token`/`kds_pin` columns masked while the table stays open. A column-mask would
have let `select=id` through; it did not.

**Cross-check on the seven's soft-deny** — that count-0 is real row suppression, not an artefact of
`limit=0`:

| Table | `select=*&limit=2` | Rows returned |
|---|---|---|
| order_counters | HTTP 200 | **0** (empty array) |
| slot_capacity | HTTP 200 | **0** (empty array) |

Genuine empty arrays — RLS is withholding the rows, not the count header lying.

---

## Item 4 — dashboard / KDS render + live realtime delivery 🔴 NOT RUN AS SPECIFIED

**Stated plainly, per the instruction: I did NOT open a real dashboard by token, confirm it renders live
orders, or observe the orders realtime channel delivering a live change.** Two reasons, both principled:

1. 🔴 **The only anon route to a `dashboard_token` is now closed — which is the fix working.** Item 1
   proves I can no longer obtain a token the way an attacker would. I have no legitimately-obtained
   session for any truck.
2. 🔴 **I will not use a real trading operator's leaked bearer token against their live dashboard.** The
   manual (V11.44) quotes a real production token; the prior task stated *"a live truck is trading
   today."* Opening a real operator's live order screen mid-service — even read-only — is their
   operational data, not mine to observe uninvited. Provisioning a throwaway demo truck to test cleanly
   would be a **write**, which this task forbids.

### What I DID establish toward Item 4, and its limits

| Check | Result | What it does and does not prove |
|---|---|---|
| Production up | `GET https://www.hatchgrab.com/` → **200** | The site serves. Not a dashboard render |
| Dashboard route alive | `GET /dashboard/<invalid-token>` → **307** (redirect) | The route responds and rejects a bad token. **Does NOT prove a valid dashboard renders orders** |
| Realtime channels open | anon `postgres_changes` subscribe: `orders` → **SUBSCRIBED**, `trucks` → **SUBSCRIBED** | ⚠️ **INCONCLUSIVE ON DELIVERY.** Supabase accepts the channel, then enforces RLS at *delivery*. SUBSCRIBED means the socket opened, **not** that rows will be broadcast. Observing delivery needs a row change to fire — a write — which I did not do |
| **RLS delivery gate (the reliable write-free signal)** | anon SELECT `orders` → **200/206**; anon SELECT `trucks` → **401** | 🟢 The strongest read-only evidence: `postgres_changes` delivers a row only if the subscriber can SELECT it. **Anon can still SELECT `orders` → the orders realtime channel will still deliver.** **Anon can no longer SELECT `trucks` → the trucks realtime UPDATE channel will no longer reach anon**, so cross-device config propagation degrades to the existing 60s poll (`page.tsx:1352`, `kds:1125`) — exactly the consequence predicted in the prior report §4/§5 |

**So the RLS *consequence* for realtime is confirmed by the SELECT gate (orders delivers, trucks does
not), but the end-to-end "operator opens the deployed dashboard and watches a live order appear" was NOT
run.** That check needs a legitimate token and a live order event, and I had neither without acting on a
real operator's data or issuing a write.

---

## Which of the four ran

| Item | Status |
|---|---|
| 1 — exact §1 request | ✅ **RAN** — leak closed, 401, no token |
| 2 — nine-table reachability | ✅ **RAN** — trucks 401; orders still 206 (by design); seven return 0 rows |
| 3 — narrow trucks probes | ✅ **RAN** — id and name both 401, whole table closed |
| 4 — deployed dashboard render + live realtime delivery | 🔴 **NOT RUN** — no legitimate token; would require a real operator's live data or a write. RLS delivery *consequence* derived from the SELECT gate instead |

---

## Verdict

🟢 **The dashboard_token leak is closed, confirmed behaviourally: the request that returned ten
credentials now returns 401, and it stays 401 for `id`-only and `name`-only, so the table — not just the
column — is shut to anon.** The seven policy-dropped tables now yield zero rows (some still hold the anon
grant, a tidy-up rather than a risk). `orders` remains anon-readable **by design**, which keeps the
dashboard/KDS orders realtime working — inferred from the surviving SELECT gate, since observing live
delivery was out of scope without a write.

⚠️ **The one thing I could not verify and am not claiming:** that a real operator's deployed dashboard
loads, renders orders and receives a live realtime update. **That check did not run.** The RLS gate says
orders realtime *should* still deliver and the trucks channel *should* fall back to the 60s poll — but
"should, from the gate" is not "observed on the deployed screen," and I am marking it as the former.

**No file changed. No policy altered. No write issued.**
