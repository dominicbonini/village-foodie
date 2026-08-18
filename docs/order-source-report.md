# `orders.source` — the manual path now says so; the customer path cannot without a migration

**File changed — ONE:** 🔴 `app/api/dashboard/action/route.ts` — **one field and its comment.**
**Also written:** `docs/order-source-report.md` (this file).
🔴 **NO MIGRATION WAS WRITTEN, NO SQL WAS EXECUTED, THE CHECK WAS NOT TOUCHED AND NO VALUE WAS ADDED.**
**Nothing committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or `restore`.

**No span of the prompt arrived garbled.** 🔴 **BUT ITEM 1 AND THE DO-NOT LIST CANNOT BOTH HOLD, AND I
STOPPED ON IT RATHER THAN CHOOSING — §1. The customer insert is not in TypeScript: it is inside the SQL
function `place_order_atomic`, so "the customer submit path writes `source: 'web'` explicitly" requires
changing that function, which is a migration, which the same brief forbids.**

---

# 1 — 🔴 THE CUSTOMER PATH: BLOCKED, AND HERE IS THE PROOF

**The customer route does not insert the order. It calls an RPC:**
```ts
      const { data: rpcData, error: rpcErr } = await supabase.rpc('place_order_atomic', {
```
**and that function's insert list — `supabase/migrations/20260804_place_order_atomic_placed_at.sql` —
does not name `source` at all:**
```sql
    id, truck_id, customer_name, customer_email, customer_phone, slot, order_type,
    event_date, event_id, van_id, items, deals, discount_code, subtotal, discount_amt,
    total, total_minor, notes, status, payment_status, placed_at
  ) values (
```
✅ **EXECUTED — `grep -c source` on that migration returns 0.**

🔴 **SO PASSING `source` IN `p_order` WOULD DO NOTHING** — the function inserts a fixed column list and
ignores anything else in the jsonb. **The only way to make the customer path write `'web'` explicitly is
to add the column to that function's insert, i.e. `create or replace function place_order_atomic` — a
migration file, and a change to `place_order_atomic`'s insert list. Both are on this task's DO-NOT
list.**

⚠️ **THE PRACTICAL EFFECT OF LEAVING IT: the customer path still writes `'web'`, via the column default,
which is the correct VALUE — it is simply not written explicitly, so a future default change would move
it silently.** **Say the word and it is a five-line migration; I have not written one.**

---

# 2 — THE MANUAL PATH NOW WRITES `'manual'`

```ts
          notes: notes || null, status: 'confirmed',
          // WHICH ROUTE THIS ROW TOOK. Written explicitly rather than left to the column default, which
          // is what made `source` useless: every row read 'web' whatever created it.
          // orders_source_check  CHECK (source = ANY (ARRAY['web', 'manual', 'whatsapp']))
          // 'manual' is in that list and is honest -- these are operator-created orders, placed at the
          // hatch or replayed from this device's outbox. OFFLINE-NESS IS NOT CARRIED HERE: 'offline' is
          // NOT an allowed value, and the O-prefix on the display id says it instead.
          // A FOURTH VALUE NEEDS THE CHECK CHANGED FIRST -- a value outside that list is a 23514 that
          // fails the whole insert, i.e. the order is lost, not degraded.
          source: 'manual',
```

✅ **The constraint is quoted verbatim beside the write, as asked.** ⚠️ **It could only be quoted beside
ONE write, because §1 blocked the other — when the customer path is unblocked, the same comment belongs
in that migration.**

**`insertPayload` is used by BOTH the upsert (replay) and the plain insert on that path, so a walk-up
and a synced offline order both now read `'manual'`.**

---

# 3 — IS THERE A WHATSAPP ORDER PATH?

🔴 **NO — NOT ONE THAT CREATES ORDERS.** ✅ **EXECUTED: `grep` for an insert into `orders` across `app/`
and `lib/` returns exactly three sites** — the upsert and the insert on the manual path (both now
`'manual'`), and `lib/seed-demo-orders.ts`. **`'whatsapp'` appears nowhere as a `source` value in the
codebase.** WhatsApp exists in the product as onboarding and messaging, not as an order-creation route.

⚠️ **`lib/seed-demo-orders.ts` DOES rely on the default.** 🔴 **REPORTED, NOT CHANGED, as instructed** —
it seeds demo orders, which are neither operator-created nor customer-placed, and `'web'` by default is
arguably right for them. **It is the one remaining insert that does not say what it is.**

---

# 4 — NO BACKFILL, SAID PLAINLY

🔴 **EVERY ROW WRITTEN BEFORE THIS CHANGE READS `'web'`, WHATEVER ROUTE IT TOOK, AND THAT IS NOW
PERMANENT.** There is no UPDATE, no backfill and no SQL in this change. **The seven rows in the 21
August diagnosis — including the three that came through the outbox — will read `'web'` for ever.
`source` becomes trustworthy from this deploy forward and not before.**

---

# ⚠️ GUSTO — BOTH PATHS, AND THE CHECK

| Path | Value written | In the CHECK? |
|---|---|---|
| Customer order page → `place_order_atomic` | `'web'` **by default (unchanged)** | ✅ **yes** |
| Add order / outbox replay → the action route | 🔴 **`'manual'`, explicit (new)** | ✅ **yes** |

✅ **NEITHER INSERT CAN NOW VIOLATE THE CHECK.** The only literal introduced is `'manual'`, which is a
member of the array; nothing else in either path writes the column. **`'offline'` is not written
anywhere — offline-ness rides on the display id's `O` prefix, per the previous task.**

🔴 **AND THIS IS NOT A NEW FAILURE MODE. A 23514 could only arise from a value outside the array, and the
value here is a hardcoded literal, not derived from a request body** — there is no input that could
carry an unexpected string into it. **Nothing about the insert's other columns, its `onConflict` or its
error handling changed.**

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0. `npx eslint` on the file: 19 errors / 1 warning — unchanged from before
this edit.**

| Required claim | Method |
|---|---|
| The customer path writes `web`, the action path writes `manual` | ⚠️ **HALF DONE, AND THE HALF IS NAMED.** ✅ **EXECUTED (source): the action path now writes `'manual'`.** 🔴 **The customer path still relies on the default because its insert is inside `place_order_atomic` — §1, blocked on the no-migration rule** |
| Both values satisfy the CHECK | ✅ **SOURCE READ against the constraint you supplied** — `'web'` and `'manual'` are both members. **The constraint itself was not read by me; it is quoted from your LIVE-VERIFIED text** |
| No other insert into `orders` relies on the default | 🔴 **ONE DOES: `lib/seed-demo-orders.ts`.** ✅ **EXECUTED — three insert sites exist in total; two are the manual path, the third is that seeder. Reported, not changed** |
| No existing row is changed | ✅ **EXECUTED** — no UPDATE, no backfill, no SQL anywhere in the diff |

## 🔴 WHAT THIS DOES NOT PROVE

- **NOTHING WAS RUN.** No order placed, no row read, no constraint inspected by me.
- 🔴 **`source` STILL CANNOT DISTINGUISH THE TWO ROUTES FOR ANY EXISTING ROW, AND WILL NOT DISTINGUISH
  THEM FOR NEW CUSTOMER ROWS EITHER — those read `'web'` because the default says so, not because the
  path asserted it.** The distinction is real from this deploy only for `'manual'`.

---

# INTEGRITY

```
app/api/dashboard/action/route.ts   175,225 → 177,920 bytes · classes 14 → 14
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0 · added vs HEAD: NONE
```
⚠️ **The byte delta includes the previous task's numbering work, which was already uncommitted in this
file; THIS task's contribution is one field and its comment block.**
✅ **No class gained or lost — the comment is ASCII by construction.**

## This report — a SEPARATE pass, run AFTER writing

```
docs/order-source-report.md   bytes 9,913
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 19 | 0 | 19 |
| U+26A0 (warning sign — TEXT presentation) | 7 | 7 | 0 |
| U+2705 (check mark button) | 12 | 0 | 12 |

U+26A0 is the only TEXT-presentation base here and every occurrence is PAIRED with U+FE0F.
U+1F534 and U+2705 have emoji presentation by default, so bare is correct for them.

## Working tree

```
 M app/api/dashboard/action/route.ts
 M app/api/dashboard/route.ts
 M app/api/heartbeat/route.ts
 M app/api/manage/route.ts
 M app/api/orders/submit/route.ts
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/CapacityBreachBanner.tsx
 M components/dashboard/DayLoadStrip.tsx
 M lib/copy/offlineProtection.ts
 M lib/native/orderGate.ts
 M supabase/functions/heartbeat-monitor/index.ts
?? docs/breach-banner-copy-report.md
?? docs/breach-banner-safe-area-report.md
?? docs/capacity-strip-marker-report.md
?? docs/offline-fit-check-report.md
?? docs/offline-notice-gate-report.md
?? docs/offline-numbering-fix-report.md
?? docs/offline-order-numbering-capacity-report.md
?? docs/offline-protection-modes-build.md
?? docs/offline-protection-modes-review.md
?? docs/offline-protection-popup-report.md
?? docs/order-source-report.md
?? docs/oversell-warning-review-report.md
?? supabase/migrations/20260818_offline_protection_mode.sql
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M app/api/dashboard/action/route.ts` | ⚠️ already `M` from the numbering task; 🔴 **THIS TASK wrote to it — the only source file written** |
| 🔴 `?? docs/order-source-report.md` | 🔴 **THIS TASK** — this file |
| every other `M` and `??` entry | ✅ pre-existing — earlier tasks this session |

No `git stash`, `git checkout` or `git restore` was run at any point.
