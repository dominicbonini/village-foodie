# Two SECURITY DEFINER functions open to the browser key — read-only check

**11 October 2026 · read-only · no file changed except this report · no SQL run · no commit · no push · no `.env*` opened**

**Verdict: safe to revoke both now, for the deployed code (`f4bd277`) and for the current tree.**

| Function | Caller | Runs as |
|---|---|---|
| `find_stranded_authorisations` | exactly one: the Vercel cron `/api/cron/capture-stranded-authorizations` | a **service-role** client |
| `purge_order_drafts` | **none** (its own migration says "NOTHING CALLS IT YET") | — |

No browser code, native app, Edge Function, GitHub workflow, Apps Script copy or `pg_cron` job in the migrations calls either one.

**`find_stranded_authorisations` is the serious one.** Called with the anon key, it hands back `order_key`s. An `order_key` is the secret in a customer's order link: with it, a stranger can open the order page (customer details) and, where the truck allows it, cancel the order.

Brief: nothing arrived garbled, and no instruction contradicted another.

---

## 1. What each one is

### `find_stranded_authorisations(p_grace_minutes integer, p_limit integer)`

**Defined in:**
- current: `supabase/migrations/20260816_find_stranded_authorisations_settled.sql:57`;
- first version: `20260815_find_stranded_authorisations.sql:47`.

It is `language sql stable security definer`, with `search_path = public`. **No migration grants or revokes on it.**

**What it does:** read-only. It returns accepted card orders whose hold was never captured or cancelled and that still owe money. For each one, across every truck:
- `order_key` (uuid);
- `truck_id`;
- the display `order_id`;
- `order_status`;
- the Stripe `payment_intent_id`;
- `total_minor`;
- `promoted_at`.

Up to `p_limit` rows. The caller picks the limit, and the function only clamps it to at least 1. It changes nothing.

**What a stranger with the anon key gets** by calling `POST /rest/v1/rpc/find_stranded_authorisations`:
- Because it is SECURITY DEFINER, **RLS does not apply.** They get those rows for **every truck**, with any `p_limit` and `p_grace_minutes` (0 = everything now).
- **`order_key` is a bearer secret:**
  - `/order/<order_key>` shows the order. The page reads it unscoped and says so: "The order_key is an unguessable UUID, so the unscoped read above is not a leak" (`app/order/[id]/page.tsx:16-21`). This function makes it guessable.
  - `POST /api/orders/cancel { order_key }` cancels a `pending` / `confirmed` / `modified` order when the truck allows customer cancellation (`app/api/orders/cancel/route.ts:24-75`). A confirmed, unpaid card order is exactly what this function lists.
- **Also leaked:**
  - Stripe `payment_intent_id`s. They aren't usable without the secret key, but are still not public;
  - order totals and statuses: business information.
- In practice the list is usually short or empty: it covers stranded holds only, after a 10-minute grace by default, but the caller can set it to 0. When it isn't empty, the exposure is real.

### `purge_order_drafts()`

**Defined in:**
- current: `supabase/migrations/20260814_purge_order_drafts_display_note.sql:39`;
- earlier versions: `20260812_order_drafts.sql:241` and `20260813_order_drafts_authorization.sql:71`.

It is `plpgsql security definer`, with `search_path = public`. **No migration grants or revokes on it.**

**What it changes:** it hard-deletes `order_drafts` rows that meet all three conditions:
- never promoted (`promoted_at is null`);
- expired (`expires_at < now()`);
- holding no live card authorisation (`payment_intent_id is null or authorization_cancelled_at is not null`).

It returns how many it deleted. This is the GDPR erasure of abandoned checkouts. `createOrderDraft` already does the same delete, one truck at a time, on every card checkout (`lib/payments/order-drafts.ts:174-181`).

**What a stranger can do:** trigger that delete early. It only removes rows that are already due for deletion and hold no money; promoted drafts and held authorisations are excluded by the function itself. It reveals one number: how many abandoned drafts were waiting. **Low harm**, but nobody outside the server should be able to delete rows, so revoke it too.

## 2. Every caller

| | `f4bd277` (deployed) | current tree |
|---|---|---|
| `find_stranded_authorisations` | `lib/payments/stranded-authorisations.ts:78` (`supabase.rpc('find_stranded_authorisations', …)`), called from `recoverStrandedAuthorisations` (`:138-142`), called only from `app/api/cron/capture-stranded-authorizations/route.ts:56` | same lines; unchanged by Phase 3 |
| …which client | **service role**: that route builds its own client from `SUPABASE_SERVICE_ROLE_KEY` (`route.ts:35-38`, `f4bd277:route.ts:37`). It is gated by `CRON_SECRET` or an admin session (`:42-47`) | same |
| …schedule | Vercel Cron, every 15 minutes (`vercel.json:82`, `"*/15 * * * *"`). It is an HTTP call to our route, not a database job | same |
| `purge_order_drafts` | **no caller** | **no caller** |

**Checked and found clear for both functions:**
- `app`, `lib`, `components`, `hooks`;
- `supabase/functions` (`auto-event-scheduler`, `heartbeat-monitor`);
- `scripts`: `scripts/list-stranded-authorisations.cjs` duplicates the query in JavaScript on a service-role client and **does not call the function** (`:23-50`);
- `.github/workflows` (`daily_scrape`, `discovery_prune`, `hatchgrab_scrape`, `process-next-truck`);
- the Apps Script copy `docs/apps-script/village-foodie-v6.57.js`;
- `ios`, `android`, `plugins`;
- `supabase/migrations`: **no `cron.schedule`** anywhere (one comment mentions pg_cron, in `20260723_demo_sessions.sql:53`).

Every other mention is a comment.

**The only thing the repo can't see is a `pg_cron` job created by hand in the dashboard.** The "before" query below checks for one. If a job does exist, it runs as its owner (normally `postgres`, which owns the functions and keeps EXECUTE regardless), so the revoke would not stop it either.

**Browser and native:**
- The only browser client is `lib/supabase-browser.ts` (anon key). It is used for realtime channels and two reads on the dashboard and KDS pages, with **no `.rpc(` call** anywhere in client code.
- The native apps are Capacitor shells that load the hosted site, with no Supabase code of their own.

## 3. Verdict

**Safe to revoke EXECUTE from `public`, `anon` and `authenticated` on both, keeping `service_role`.**

| Function | Effect of the revoke |
|---|---|
| `find_stranded_authorisations` | Its one caller uses the service role, which the explicit grant keeps. Without the grant, `service_role` might have held EXECUTE only through `PUBLIC`, so the grant matters |
| `purge_order_drafts` | Nothing calls it. A future server caller would use the service role |

**pg_cron:**
- No job exists in the migrations.
- A hand-made job runs as its owner (`postgres`), which owns the functions and is unaffected.
- The script still grants `postgres` explicitly, which is harmless and makes that guarantee visible.

**Nothing breaks.** The only thing that stops working is a direct call with the anon key or a user session, and no code makes one.

## 4. The SQL — all NOT RUN

**Before (read-only).** Today's grants, plus any hand-made cron job. Keep the output for the rollback:

```sql
select p.oid::regprocedure as fn, p.prosecdef as security_definer, p.proacl,
       has_function_privilege('anon',          p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role',  p.oid, 'execute') as service_role
  from pg_proc p
 where p.oid in ('public.find_stranded_authorisations(integer, integer)'::regprocedure,
                 'public.purge_order_drafts()'::regprocedure);

-- Any pg_cron job naming either function. An error saying schema "cron" does not exist means pg_cron is
-- not installed, which is also a "no".
select jobid, jobname, schedule, command, username from cron.job
 where command ilike '%find_stranded_authorisations%' or command ilike '%purge_order_drafts%';
```

**The revoke and grants, in one transaction:**

```sql
begin;
revoke execute on function public.find_stranded_authorisations(integer, integer) from public, anon, authenticated;
revoke execute on function public.purge_order_drafts()                          from public, anon, authenticated;
grant  execute on function public.find_stranded_authorisations(integer, integer) to service_role, postgres;
grant  execute on function public.purge_order_drafts()                          to service_role, postgres;
commit;
notify pgrst, 'reload schema';
```

**Verify (read-only).** Expect two rows, each with `anon` false, `authenticated` false and `service_role` true:

```sql
select p.oid::regprocedure as fn,
       has_function_privilege('anon',          p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role',  p.oid, 'execute') as service_role
  from pg_proc p
 where p.oid in ('public.find_stranded_authorisations(integer, integer)'::regprocedure,
                 'public.purge_order_drafts()'::regprocedure);
```

Then check the stranded-capture cron still runs. In Vercel's cron log, the next `/api/cron/capture-stranded-authorizations` run should be a 200, not the "THE BACKSTOP COULD NOT RUN" error. An admin can also trigger it by hand with `?dry=1`, which captures nothing.

**Rollback.** This restores the defaults; compare with the "before" output:

⛔ DO NOT RUN — this reopens the functions to the public key. Running it is what undid the 12 Oct revokes.

```sql
begin;
grant execute on function public.find_stranded_authorisations(integer, integer) to public, anon, authenticated;
grant execute on function public.purge_order_drafts()                          to public, anon, authenticated;
commit;
notify pgrst, 'reload schema';
```

## 5. Other SECURITY DEFINER functions in `supabase/migrations`

A full scan finds **six** `security definer` lines in the migrations, covering **three functions**:

| Function | Latest definition | Revoke from anon? |
|---|---|---|
| `find_stranded_authorisations` | `20260816_find_stranded_authorisations_settled.sql:57` | **no**, covered above |
| `purge_order_drafts` | `20260814_purge_order_drafts_display_note.sql:39` | **no**, covered above |
| `orders_fill_currency_country` (the trigger that stamps `orders.currency` and `country`) | `20261010_07_orders_currency_country.sql:70` | ✓ yes, in the same file: revoked from `public, anon, authenticated` |

**There are no others in the repository.** The live database may still hold functions the migrations don't show: ones made by hand, by an extension, or by Supabase itself. This read-only query lists every SECURITY DEFINER function in `public` that the anon key can execute, so you can check them the same way:

```sql
select p.oid::regprocedure as fn, pg_get_userbyid(p.proowner) as owner, p.proacl
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.prosecdef
   and has_function_privilege('anon', p.oid, 'execute')
 order by 1;
```

## Rules kept

| Rule | |
|---|---|
| Read-only; only this report written | ✓ |
| No SQL run; no commit or push | ✓ |
| No `.env*` opened | ✓ only variable names were read, in source |
