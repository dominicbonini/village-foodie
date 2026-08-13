# Account-creation investigation, part 6 — `trucks.is_customer`

Date: 13 August 2026
Status: READ-ONLY INVESTIGATION. **No file was changed, no row was written, no migration.** Exactly
**one** read-only `SELECT` was run, as asked. This report is the only file created. No `next dev`, no
`next build`. Pizzeria Gusto was read by that single SELECT and not touched.

Follows reports 1-5. Nothing from them is repeated.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 0. 🔴 THE ANSWER

**`trucks.is_customer` is DEAD. It gates nothing.** It is written by exactly one code path, selected by
one query, typed in one interface, and **never read into a condition anywhere in the repository.**

A migration says so explicitly. `supabase/migrations/20260703_discovery_excluded_boolean.sql:5`:

> *"`is_customer` + `hatchgrab_truck_id` columns are KEPT (reversible) but **removed from the runtime
> path by the accompanying code**."*

It is the second of the two columns part 3 found in this state — `hatchgrab_truck_id` is the other, and
the same migration line covers both.

---

## a. Every occurrence in the repository

`grep -rn "is_customer\|isCustomer"` across `app`, `lib`, `components`, `scripts`, `supabase`:

| Site | Kind | Surrounding condition |
|---|---|---|
| `app/admin/page.tsx:38` | **type declaration** — `is_customer: boolean` on the `AdminTruck` interface | none — a field on a type |
| `app/api/admin/route.ts:54` | **SELECT list** — `…,order_link_vf,order_link_hg,is_customer,excluded` | 🔴 **fetched, then never used.** `grep is_customer app/admin/page.tsx` returns **only line 38** |
| `app/api/discovery/events/route.ts:115` | 🔴 **a COMMENT, not code** — *"the ordinary truck-level gate below drops all its events (no `is_customer` join, no `hatchgrab_truck_id` link)"* | n/a — it names the column to say it is **not** joined |
| `lib/provision-truck.ts:57` | **WRITE** — `is_customer: false` inside `HIDDEN_VISIBILITY` | `visibility !== 'public'` |
| `lib/provision-truck.ts:68` | **WRITE** — `is_customer: true` inside `PUBLIC_VISIBILITY` | `visibility === 'public'` |
| `supabase/migrations/20260702_…:21` | **DDL** — `ADD COLUMN IF NOT EXISTS is_customer boolean NOT NULL DEFAULT false` | n/a |
| `supabase/migrations/20260702_…:39-40` | **one-off backfill** — `true` for `pizzeria-gusto`, `real-thai-food`; explicit `false` for `test-truck` | n/a |
| `supabase/migrations/20260703_…:5` | **comment** — *"KEPT (reversible) but removed from the runtime path"* | n/a |

### 🔴 Read sites that are actually reads: **ZERO**

```
$ grep -rn "\.is_customer\|is_customer ===\|is_customer &&\|is_customer)" app lib components
NONE — never read into a condition
```

The admin console's `SELECT` at `:54` carries it to the browser, the interface at `:38` types it, and
**nothing renders it or branches on it.** ⚠️ It is not on the admin console's per-row tickbox writer
either — `updateTruck`'s `Pick<>` (part 1, §5b) covers `show_on_vf | show_on_hg | order_link_vf |
order_link_hg | excluded | active` and **not** `is_customer`.

---

## b. What it gates — **nothing, today. Here is what it was FOR.**

The `20260702` migration introduced it as part of a five-column visibility model, and its own comment
(`:36-38`) states the intended job:

> *"Customer trucks. SAFE to set now: their `discovery_events` are already off VF (hg_only truck-level
> visibility) and never shown on HG (HG shows operator events only), so **suppression is a no-op
> today**; it becomes load-bearing only once `show_on_vf` is later flipped on."*

**The intended gate: suppress a paying customer's SCRAPED discovery events once their truck went public
on Village Foodie**, so the scraped shadow would not duplicate their real, confirmation-gated schedule.

**One day later, `20260703` replaced that mechanism with `excluded`** — the master hide — and removed
`is_customer` from the runtime path (`:5`). Part 3, §5 traced the surviving mechanism: `excluded` is
tested at `discovery/events/route.ts:146`, `:254` and `:339`, and `is_customer` appears there only in the
`:115` comment noting its absence.

| Candidate | Gated by `is_customer`? |
|---|---|
| Discovery listing | ❌ — `excluded` + `show_on_vf` / `show_on_hg` |
| The map | ❌ — same |
| Ordering | ❌ — `active`, `deletion_requested_at`, `excluded` (part 5) |
| Billing | ❌ — `plan`, `trial_expires_at`, `feature_overrides` |
| Reporting | ❌ — nothing reads it |
| **Anything at all** | ❌ **Nothing.** |

**INFERRED:** it survives because the migration deliberately kept it *reversible* — the redesign was one
day old and the author preserved the option to go back. **Not established:** whether there is any
current intention to revive it.

---

## c. Written by anything other than `provisionTruck`? — **No.**

**In application code: `lib/provision-truck.ts` only**, via the two visibility constants (`:57`, `:68`),
spread into the single `trucks` INSERT at `:451`. Part 1 established that insert is the repo's only one.

**Allow-lists — confirmed absent from both:**

```
$ grep -c "is_customer" app/api/manage/route.ts
0
```

**Zero occurrences in the entire manage route**, so it is absent from `update_settings`'s `ALLOWED`
(`:795-804`) and from `update_truck`'s `allowed` (`:854`) by construction — the string does not appear in
the file at all.

⚠️ **But it IS writable by an admin, incidentally.** `/api/admin`'s POST has **no allow-list**
(`app/api/admin/route.ts:76,93`: `const { truckId, discoveryTruckId, ...updates } = body` →
`.update(updates)`), so a hand-crafted request could set it. **No UI does** — the console neither renders
a control nor includes it in `updateTruck`'s type.

**Outside application code:** the `20260702` backfill (`:39-40`), which is the only reason any row has
`true` today.

---

## d. Live check — one read-only SELECT

```sql
SELECT id, is_customer, excluded, show_on_hg FROM trucks ORDER BY id;
```

```
id                               is_customer  excluded   show_on_hg
demo-15yy2ecnkemmchrr8np69p29n8  false        true       false
demo-4en5jq0q4708kr5avcppe03561  false        true       false
demo-ekwwmqeej70hd5da4d61wzetcw  false        true       false
demo-krh2c8ksabdv28ccprswbfhkdk  false        true       false
demo-m1y02c2mgqag1y4b79401af4hm  false        true       false
pizzeria-gusto                   true         false      true
real-thai-food                   true         false      true
test-truck                       false        false      false
test-truck-2                     false        true       false
test-truck-3                     false        true       false
test-truck-3-2                   false        true       false
tt3                              false        true       false
village-spice                    false        true       false
```

### 🔴 Yes — the live trading truck and the test trucks differ, and the split is exactly the migration's

| Group | `is_customer` | Why |
|---|---|---|
| **`pizzeria-gusto`, `real-thai-food`** | **`true`** | 🔴 **set by hand in `20260702:39` and never touched since.** They are the only two `true` rows in the database. |
| `test-truck` (Test Kitchen) | `false` | set explicitly by `20260702:40` |
| `test-truck-2/3/3-2`, `tt3`, `village-spice` | `false` | created by `provisionTruck` with `visibility: 'hidden'` → `HIDDEN_VISIBILITY.is_customer = false` |
| the five `demo-` trucks | `false` | same constant, demo profile |

**The column perfectly separates "the two real paying customers" from "everything else" — and nothing
reads it.** It is an accurate, well-maintained, entirely inert label.

⚠️ **Two other things this SELECT shows, worth noting since they bear on parts 3 and 5:**

- **`excluded` and `show_on_hg` move together for every row except `test-truck`**, which is
  `excluded: false` + `show_on_hg: false` — it predates `provisionTruck` and was set by migration, not
  by the visibility constants. It can take orders (part 5: `excluded` is the order gate) while being
  absent from HG discovery.
- **Every `provisionTruck`-created truck is `excluded: true`** — consistent with part 5's finding that
  the admin form's default `visibility: 'hidden'` closes a truck for orders until the flag is cleared.

### 🔴 What this means for Tikka Tonic

Whichever route creates it, `is_customer` will be set by the visibility constant:

| Created with | `is_customer` |
|---|---|
| `visibility: 'hidden'` (the admin form's default, or `/api/setup`) | **`false`** |
| `visibility: 'public'` | **`true`** |

⚠️ **So the natural path — create hidden, then clear `excluded` from the admin tickbox to open ordering
— leaves Tikka Tonic at `is_customer: false`, diverging from Gusto and Real Thai Food**, the only two
trucks carrying `true`. **Functionally this costs nothing today**, because nothing reads the column. It
matters only if it is ever revived as a gate, at which point the new customer would be the odd one out.
Cheap to avoid: either create it with `visibility: 'public'`, or set the column once by hand.

---

## e. READ vs INFERRED

**Read from source:** every occurrence from the repo-wide grep, each classified; the absence of any
conditional read (second grep); the zero count in the manage route; both migration files including the
intent comment and the "removed from the runtime path" note; the two visibility constants; the admin
route's allow-list-free POST.

**Read from the live database:** one `SELECT id, is_customer, excluded, show_on_hg FROM trucks`, output
reproduced verbatim above. **No write of any kind.**

**INFERRED, labelled in place:** that the column survives for reversibility rather than for a planned
use.

**Not established:** whether there is any current intention to revive `is_customer` as a gate.
