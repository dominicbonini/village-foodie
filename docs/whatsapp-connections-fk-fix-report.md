# FK type fix — `whatsapp_connections.truck_id` was `uuid`, is now `text`

**4 September 2026. Branch `whatsapp-connections-s1-s3`. NOT COMMITTED, not staged, not pushed, not deployed. No cap sync, native binary untouched. `main` still `2ca66cd`. `git add -A` / `git add .` never run.**

⛔ **THE MIGRATION IS STILL NOT APPLIED.** `whatsapp_connections` does not exist until you run the SQL below by hand in the Supabase SQL editor.

**Read first, as instructed:** `docs/whatsapp-connections-build-report.md`. 🔴 **That report is now wrong on one point** — its migration block, and its column table, both show `truck_id uuid`. **This report supersedes it on that line.** Everything else in it stands.

---

## THE DEFECT — CONFIRMED, AND IT WAS MINE

🔎 The file declared, at what is now line 48:

```sql
truck_id  uuid  primary key references public.trucks(id) on delete cascade
```

**`trucks.id` is `text`.** The rule is in `docs/reference-manual.md` and its own wording is the consequence:

> **RULE (V6.2)** — trucks.id is **text**, not uuid. Every FK column referencing trucks(id) must be `text` — including scraper_run_log.truck_id, excluded_terms.truck_id, and increment_order_counter(p_truck_id text). **Declaring them uuid fails the migration or silently never matches.** *(`reference-manual.md:9161`; restated at `:4659` and `:12005`)*

⚠️ **"Or silently never matches" is the half that would have hurt.** A failed migration is loud and fixed in a minute. A table that exists, accepts nothing and joins to nothing is a feature that appears built and is not.

## THE FIX — ONE LINE

```sql
truck_id  text  primary key references public.trucks(id) on delete cascade
```

🟢 **Nothing else in the SQL changed.** The CHECK constraint, the partial unique index on `phone_number_id`, `enable row level security`, the `service_role only` policy, the `revoke all … from anon, authenticated, public`, `set lock_timeout = '3s'`, the transaction and `notify pgrst, 'reload schema'` are all exactly as they were. Verified by re-reading the whole file: **the only substantive change is `uuid` → `text`**, plus a comment block above it recording the rule so the mistake is not repeated.

## HOW OTHER TABLES IN THIS REPO REFERENCE `trucks(id)`

🧪 **Executed** — `grep -rn "references public.trucks(id)\|references trucks(id)" supabase/migrations/*.sql` returned **13 declarations. Twelve were already `text`. The thirteenth was mine, and was the only `uuid` in the set.**

**The closest analogue, quoted for comparison — identical in shape (text, primary key, FK, cascade):**

```sql
-- supabase/migrations/20260723_demo_sessions.sql:34
truck_id      text primary key references trucks(id) on delete cascade,
```

And the nearest neighbour in this same feature area:

```sql
-- supabase/migrations/20260605_whatsapp_logs.sql:7
truck_id         text        references public.trucks(id) on delete cascade,
```

Independently consistent with your live-data check: `whatsapp_logs.truck_id` holds `'pizzeria-gusto'`, `'test-truck'` — **slugs, not uuids.**

---

## THE SWEEP — EVERY FILE IN THIS WORKSTREAM

**Patterns searched** (case-insensitive where noted): `uuid` / `UUID` (`grep -in`), `truckId`, `truck_id`, `crypto.randomUUID`, `::uuid`, `as uuid`, `z.string().uuid`, `isUUID`, `validate(`, and the regex `[0-9a-f]{8}-[0-9a-f]{4}` (a uuid-shaped literal).

| File | uuid occurrences | Truck id typed as | Changed? |
|---|---|---|---|
| `supabase/migrations/20260904_whatsapp_connections.sql` | **1 — the defect (line 38)** | `uuid` → **`text`** | ✅ **CHANGED** |
| `lib/whatsapp/connection-read.ts` | **0** | `truckId: string` (`:70`) | no change needed |
| `lib/whatsapp/connection-state.ts` | **0** | *(takes no truck id at all)* | no change needed |
| `lib/whatsapp/token-crypto.ts` | **0** | *(takes no truck id)* | no change needed |
| `app/api/manage/route.ts` | 1, **unrelated** — a comment at `:1908` about `order_key (uuid)`, pre-existing, not this workstream | passes `truck.id` (`:289`), untyped at the call | no change needed |
| `app/manage/[token]/page.tsx` | 1, **unrelated** — a comment at `:1100` about `dishId`, pre-existing | never handles a truck id for this feature | no change needed |
| **harness** `scratchpad/s2/run.ts` | 0 | stubbed `'t1'` | ⚠️ **CHANGED — see below** |
| **harness** `scratchpad/s2/proof4.ts` | 0 | *(no truck id)* | no change needed |

🟢 **`truckId: string` in `connection-read.ts:70` was already correct** — `string` is the right TypeScript type for a text column, and it is passed straight into `.eq('truck_id', truckId)` with no cast, no coercion and no validation. **There was never a uuid assumption in the TypeScript.** The defect was confined to the SQL.

🔴 **Stated explicitly, as instructed: apart from the migration line, there were NO occurrences of a truck id typed, cast or validated as uuid anywhere in this workstream.** That is the result of the searches listed above, not an assumption — and I am reporting the patterns so an empty result can be judged rather than trusted.

### The harness — changed, and why it matters

⚠️ `scratchpad/s2/run.ts` stubbed the truck id as **`'t1'`**. That is a plain string, **not** a uuid, so the proofs were **not** run against the wrong type and nothing they proved is invalidated. But `'t1'` is not shaped like a real id either. **I changed both occurrences to `'pizzeria-gusto'`** — a real live truck id — so the harness now exercises the actual value shape, and re-ran everything. Said plainly because the instruction was right in principle: *a proof that ran against the wrong type proved nothing.* This one did not, and now it demonstrably runs on the real shape.

I also **re-copied `connection-state.ts` and `connection-read.ts` from source** before re-running, so the proofs ran against the current modules, not stale copies. `diff` confirms the state module is **byte-identical to `lib/whatsapp/connection-state.ts`**, and the read module differs **only** in the import specifier (`@/lib/whatsapp/connection-state` → a relative path, so Node can resolve it without the Next path alias).

---

## THE CORRECTED MIGRATION — COMPLETE, PASTE THIS

⛔ **Run by hand in the Supabase SQL editor. Idempotent, so re-running is safe.**

```sql
set lock_timeout = '3s';

begin;

create table if not exists public.whatsapp_connections (
  -- 🔴 TEXT, NOT uuid — trucks.id is text (live ids are slugs like 'pizzeria-gusto').
  truck_id                 text        primary key references public.trucks(id) on delete cascade,

  waba_id                  text        not null,
  phone_number_id          text,
  business_id              text,
  finish_type              text,

  access_token_ciphertext  text,
  token_expires_at         timestamptz,
  token_revoked_at         timestamptz,

  payment_method_present   boolean,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint whatsapp_connections_token_expiry_together
    check (access_token_ciphertext is null or token_expires_at is not null)
);

create unique index if not exists whatsapp_connections_phone_number_id_key
  on public.whatsapp_connections (phone_number_id)
  where phone_number_id is not null;

alter table public.whatsapp_connections enable row level security;

drop policy if exists "service_role only" on public.whatsapp_connections;
create policy "service_role only" on public.whatsapp_connections
  for all to service_role using (true) with check (true);

revoke all on public.whatsapp_connections from anon, authenticated, public;

commit;

notify pgrst, 'reload schema';
```

⚠️ **If you already applied the `uuid` version**, `create table if not exists` will **silently do nothing** and leave the wrong column in place — drop the table first (`drop table if exists public.whatsapp_connections;`) and re-run. You said it has not been applied, so this is a precaution, not an instruction.

---

## RE-VERIFICATION — ALL RE-RUN AFTER THE FIX

| Check | Method | Result |
|---|---|---|
| `npx tsc --noEmit` | 🧪 **Executed** | **exit 0, clean** |
| `findPlanParityViolations()` | 🧪 **Executed** on a fresh copy of the real `lib/plan-features.ts` | **0 violations** |
| Proof 1 — token never reaches the client | 🧪 **Re-executed** | ✅ pass |
| Proof 2 — all six states + affordances | 🧪 **Re-executed** | ✅ pass |
| Proof 3 — missing table → `not_connected` | 🧪 **Re-executed** | ✅ pass |
| Proof 4 — Setup acts either way | 🧪 **Re-executed** | ✅ pass |

**Proof 1** (now with `truck_id: 'pizzeria-gusto'`):
```
keys: [ 'state', 'offerSignup', 'offerReauthorise', 'expiringSoon' ]
payload: {"state":"ready","offerSignup":false,"offerReauthorise":false,"expiringSoon":false}
  ✅ absent: plaintext token   ✅ absent: ciphertext   ✅ absent: base64 of token
  ✅ absent: any waba/phone/business id   ✅ absent: the word token
```

**Proof 2** — unchanged from the last build, every row identical:
`not_connected`(signup) · `onboarding_incomplete`(reauth) · `token_missing`(support) · `revoked` from **both** observed revocation and **elapsed expiry**(reauth) · `awaiting_payment_method`(opAction) · `ready`(send) · `ready + expiringSoon`(send **and** expSoon). `REAUTHORISE_BEFORE_EXPIRY_DAYS = 14`. 🟢 `paymentMethodPresent = null` (UNREAD) → `ready`, **not** `awaiting_payment_method`.

**Proof 3:**
```
[whatsapp/connection-read] read failed, treating as not_connected: relation "whatsapp_connections" does not exist
missing table → {"state":"not_connected","offerSignup":true,"offerReauthorise":false,"expiringSoon":false}
```

**Proof 4:**
```
FIELD UNTOUCHED — OLD: wizard opened = false 🔴 SILENT FAILURE  |  NEW: setup acted = true ✅
FIELD EDITED   — OLD: wizard opened = false 🔴 SILENT FAILURE  |  NEW: setup acted = true ✅
```

---

## THE THREE CONFIRMATIONS ABOUT EXISTING TRUCKS

### 1. 🟢 NEW TABLE ONLY — nothing existing is altered, dropped or backfilled

🧪 **Executed** — every statement in the file, comments stripped:

```
set lock_timeout = '3s';
begin;
create table if not exists public.whatsapp_connections (…)
create unique index if not exists whatsapp_connections_phone_number_id_key …
alter table public.whatsapp_connections enable row level security;
drop policy if exists "service_role only" on public.whatsapp_connections;
create policy "service_role only" on public.whatsapp_connections …
revoke all on public.whatsapp_connections from anon, authenticated, public;
commit;
notify pgrst, 'reload schema';
```

🟢 **Ten statements. Every one that names a table names `whatsapp_connections`.** A grep for `alter table|drop table|drop column|add column|insert into|update |delete from|truncate` **excluding** `whatsapp_connections` returned **NONE**. There is **no `INSERT`, no `UPDATE`, no backfill of any kind** — the table is created empty. The only `alter` enables RLS on the table being created; the only `drop` is `drop policy if exists` on that same new table, present so a re-run is idempotent.

⚠️ **The one effect on an existing table** is not a change to it: the FK adds a referential constraint **on the new table**, pointing at `trucks(id)`. Postgres will take a brief lock on `trucks` to validate it — which is exactly why `lock_timeout = '3s'` is set: **if `trucks` is busy the migration fails fast rather than queueing behind a trading truck's writes.**

### 2. 🟢 NO LIVE PATH READS OR WRITES `whatsapp_connections`

🧪 **Executed.** Patterns searched: `whatsapp_connections`, `readWhatsAppConnection`, `whatsapp/connection-read`, `whatsapp/connection-state`, `whatsapp/token-crypto`.

**Repo-wide, `whatsapp_connections` appears in exactly four files:** the migration; `lib/whatsapp/connection-read.ts` (the `.from()` at `:76`); `app/api/manage/route.ts` (two **comments**, `:10` and `:287`); `lib/whatsapp/token-crypto.ts` (one **comment**, `:97`, about a future re-encrypt pass). **There is exactly one query against this table in the entire codebase** — `connection-read.ts:76` — and its only caller is `app/api/manage/route.ts:289`.

**Files checked individually, each returning 0:**

| Surface | File | Hits |
|---|---|---|
| Ordering | `app/api/orders/submit/route.ts`, `app/api/orders/[id]/route.ts`, `app/api/orders/cancel/route.ts` | **0, 0, 0** |
| KDS | `app/kds/[kds_token]/page.tsx`, `app/dashboard/[token]/kds/page.tsx` | **0, 0** |
| Dashboard | `app/api/dashboard/route.ts`, `app/api/dashboard/action/route.ts`, `app/dashboard/[token]/page.tsx` | **0, 0, 0** |
| Customer order page | `app/o/[slug]/page.tsx`, `app/order/[id]/page.tsx` | **0, 0** |
| Webhooks | `app/api/webhooks/meta/whatsapp/route.ts`, `app/api/webhooks/whatsapp/route.ts`, `app/api/webhooks/messenger/route.ts`, `app/api/webhooks/instagram/route.ts`, `app/api/webhooks/stripe/route.ts` | **0, 0, 0, 0, 0** |
| Send path / client | `lib/meta-whatsapp.ts`, `lib/supabase.ts` | **0, 0** |

🟢 **`lib/whatsapp/token-crypto.ts` has ZERO importers repo-wide.** It is dead code until S4 wires it — which is why it has never been executed (below).

🟢 **Therefore: applying this migration cannot change ordering, KDS, dashboard, the customer order page or the webhook, because none of them know the table exists.** The single reader is the Manage settings payload, and it already degrades to `not_connected` when the table is absent (Proof 3).

### 3. 🟢 CASCADE DIRECTION — one way, truck → connection

```sql
truck_id text primary key references public.trucks(id) on delete cascade
```

**`on delete cascade` sits on the REFERENCING side.** It means: **delete a truck → Postgres deletes that truck's `whatsapp_connections` row.** 🟢 **Nothing about this table can delete a truck.** An FK cascade only ever propagates from the referenced row toward the rows that reference it; deleting a `whatsapp_connections` row touches `trucks` not at all, and there is no trigger, rule or `on update` clause anywhere in the migration.

⚠️ **The consequence worth naming:** deleting a truck **silently discards its stored Meta business token** with no revocation call to Meta. The token stays valid at Meta until it expires (≤60 days) or the operator removes the app's access. That is the right database behaviour — an orphaned credential row would be worse — but **S4 should revoke at Meta before a truck is deleted**, and nothing does that today. Recorded, not built.

---

## THE TREE

🟢 **Branch `whatsapp-connections-s1-s3`. HEAD `2ca66cd`. `main` `2ca66cd` — untouched. Nothing staged (0 files). No commit, no push, no deploy.**

| Group | Diff | Status |
|---|---|---|
| **Pre-existing work** — `app/o/[slug]/page.tsx`, `components/EventListCard.tsx`, `ios/App/App.xcodeproj/project.pbxproj`, `lib/custom-domain/copy.ts`, `proxy.ts`, `vercel.json` | **6 files, 52 insertions(+), 56 deletions(-)** | 🟢 **byte-for-byte identical to every prior check** |
| `docs/reference-manual.md` (V12.2 delta) | 1 file, 565+/4− | 🟢 unchanged this turn |
| **This workstream, tracked** — `app/api/manage/route.ts`, `app/manage/[token]/page.tsx`, `lib/whatsapp/connection-state.ts` | 3 files, 200+/31− | 🟢 unchanged this turn |
| **Copy workstream** — `lib/plan-features.ts`, `lib/landing-table.ts`, `lib/meta/webhook-signature.ts` | 3 files, 93+/30− | 🟢 unchanged |
| **`app/landing/page.tsx`** | 49+/19− | ⚠️ **NOT identical to the last report — see below** |
| Untracked outreach files, `app/order/[id]/page.tsx`, `lib/outreach.ts`, `lib/whatsapp-hint.ts`, outreach migrations, docs | — | 🟢 still untracked, unstaged |

🔴 **ONE HONEST DISCREPANCY, FLAGGED RATHER THAN SMOOTHED OVER.** The previous report recorded the copy workstream as **139+/49−** across four files; it is now **142+/49−**. **That is not drift and not this change** — it is the landing-page tile move **you asked for in the turn between the two reports** (WhatsApp auto-replies moved from 3rd to 5th in the "What it does" grid, below "Never type your schedule twice"). Net +3 lines, all in the comment recording the move. **So the copy workstream is not byte-for-byte unchanged since the last report, and I am not going to claim it is.** It is unchanged *by this FK fix*, which touched only the migration and one scratchpad harness.

**Files changed by THIS task, in full:**
1. `supabase/migrations/20260904_whatsapp_connections.sql` — `uuid` → `text`, plus the comment recording RULE (V6.2) and the cascade direction. **Untracked; still not applied.**
2. `/private/tmp/.../scratchpad/s2/run.ts` — harness truck id `'t1'` → `'pizzeria-gusto'`. **Outside the repo, not in git.**

**Nothing else in the repository was touched.**

---

## WHAT I COULD NOT READ OR VERIFY

- 🔴 **The migration has still never run.** The corrected `text` column, the CHECK, the partial index, RLS and the revoke remain **unexercised SQL**. The type fix is verified against the rule and against twelve sibling declarations — **not** against Postgres. **The FK will only be proven when you apply it.**
- 🔴 **I did not read `trucks.id`'s type from the live database.** `information_schema` is unreachable from this environment (PostgREST refuses that schema; no direct Postgres connection, no `pg`, no psql). My evidence is the reference-manual rule, the twelve existing `text` FKs, and **your** live-data observation that `whatsapp_logs.truck_id` holds `'pizzeria-gusto'`. All three agree — but none of them is a schema read, and I am not claiming one.
- 🔴 **I rendered nothing in a browser.** Every statement here is source-read or executed Node; the Manage settings surface has not been looked at since the fix. Nothing in this change touches the UI, so nothing should have moved — that is a reasoned expectation, **not** an observation.
- ⚠️ **`lib/whatsapp/token-crypto.ts` has still never been executed.** No key is configured, it has zero importers, and its correctness remains source-read only. **Generate a key and round-trip a string before S4 depends on it.**
- ⚠️ **The parity check ran against a copy** of `lib/plan-features.ts` with the `@/lib/features` alias rewritten to a relative path (Node cannot resolve Next's path aliases). The copy was taken from source in this same run; only the import specifier differs.
- 🔴 **Nothing about Meta was checked** — no dashboard, no docs, no API call. Unchanged from the last report.

## FLAGS

- ⚠️ **No span of the prompt arrived garbled, and no instruction contradicted another.** Nothing required me to stop and ask.
- 🔴 **The defect was real, was mine, and `docs/whatsapp-connections-build-report.md` still carries the wrong `uuid` in its SQL block and column table.** That file was not edited — this report supersedes it on that one line.
- 🔴 **`whatsapp_connections` still does not exist.** Applying it is yours to do, by hand.
- ⚠️ **If the `uuid` version was ever applied, `create table if not exists` will not fix it** — drop first.
- ⚠️ **Deleting a truck discards its Meta token without revoking it at Meta.** Correct DB behaviour, missing product behaviour; S4's problem.

*Nothing committed. Nothing staged. `main` = `2ca66cd`. Migration NOT applied.*
