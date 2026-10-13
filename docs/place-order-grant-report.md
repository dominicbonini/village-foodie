# `place_order_atomic` callers — read-only check before revoking EXECUTE

**11 October 2026 · read-only · no file changed except this report · no SQL run · no commit · no push · no `.env*` opened**

**Verdict: safe to revoke now.** The live code at `f4bd277` calls `place_order_atomic` from exactly one place: the customer submit route, running on the server with the **service-role** client. Nothing in a browser, the native apps, an Edge Function or a script calls it, or could. Revoking EXECUTE from `public`, `anon` and `authenticated`, with an explicit grant to `service_role`, changes nothing for any caller that exists. It only stops a browser key from calling the function directly, round the route's pricing.

Brief: nothing arrived garbled, and no instruction contradicted another.

---

## 1. Every caller

Searched: `app`, `lib`, `components`, `hooks`, `scripts`, `supabase/functions` (`auto-event-scheduler`, `heartbeat-monitor`), `supabase/migrations`, `docs` (including the Apps Script copy `docs/apps-script/village-foodie-v6.57.js` and the `.sql` seed files), `ios`, `android`, `plugins`, and the built `out/` and `public/` folders. I searched both for the name and for any `.rpc(` call whose name is not a literal string (there are none).

### At `f4bd277` (deployed)

| Caller | Function | Client | Where |
|---|---|---|---|
| Customer submit, pay at the truck | `place_order_atomic` | **service role** — `import { supabase } from '@/lib/supabase'` (`app/api/orders/submit/route.ts:6`), built with `SUPABASE_SERVICE_ROLE_KEY` (`lib/supabase.ts:3-5`) | `app/api/orders/submit/route.ts:1207` |

That is the only call. Every other hit is a comment, or text in a report:
- comments in `lib/buzzer.ts`, `lib/option-stock.ts`, `lib/payments/capture.ts`, `lib/payments/promote-draft.ts`, `app/api/manage/route.ts`, `app/trucks/[slug]/order/page.tsx` and the submit route itself;
- source pins in `scripts/batch-reservation-*.cjs`;
- prose in `docs/*.md` and `docs/seed-app-tester-sept.sql`.

**Card orders do not call it.** `promoteDraft` inserts into `orders` itself, also with the service-role client. Its header explains why it does not use this function (`lib/payments/promote-draft.ts:34`).

### The checkpoint commit `3033a53` (HEAD, not deployed)

The same single call, `app/api/orders/submit/route.ts:1226`, on the same service-role client.

### The current tree (Phase 3, uncommitted)

| Caller | Function | Client | Where |
|---|---|---|---|
| Customer submit, pay at the truck | **`place_order_atomic_v2`** | service role (`route.ts:6` → `lib/supabase.ts:3-5`) | `app/api/orders/submit/route.ts:1262` |

**Nothing in the current tree calls the old `place_order_atomic`.** v2 is already service-role only (`20261010_17_order_charges.sql:323-324`).

### SQL

- No other database function calls `place_order_atomic`.
- The only other mention in `supabase/migrations` is a `drop function if exists` of an older eight-argument version (`20260715_place_order_atomic_drop_drawlist.sql:94`), which isn't the one being revoked.
- No Edge Function mentions either function.

### Test harnesses

- `scripts/order-charges.cjs` calls `rpc('place_order_atomic…')` only on its in-memory fake database, never a real client.
- The run screen refuses any harness that names `createClient` or the service-role key.

## 2. Browser-side and native code

**Nothing in a browser calls either function, and nothing could through our own code:**
- The only browser client is `lib/supabase-browser.ts` (anon key). Its users are the dashboard and KDS pages: `app/dashboard/[token]/page.tsx` and `app/dashboard/[token]/kds/page.tsx`.
- They use it for realtime channels and two reads (`truck_events`, `truck_vans`). **No `.rpc(` call exists in `components/`, `hooks/` or any client page.**
- Customers place orders by POSTing to `/api/orders/submit`, which runs on the server.
- Four other files build their own clients: `app/demo/[ref]/route.ts`, `app/kds/[kds_token]/page.tsx`, `app/dashboard/page.tsx`, `app/verify-email/page.tsx`, and `app/api/demo/*`. None of them names either function.

**The native apps:**
- They are Capacitor shells that load the hosted site (`capacitor.config.ts:27-28`, `server.url = …/app`).
- Their own code (`ios/App/App/*.swift`, `android/app/src/main/java/**`, `plugins/hatchgrab-net-printer`) has no Supabase client and no RPC call.
- Inside the app, orders go through the same web routes.

**The exposure the revoke closes:**
- Any holder of the public anon key (it ships in every page) could call `place_order_atomic` directly via PostgREST, if the function is executable by `anon`.
- Postgres grants EXECUTE to `PUBLIC` by default, and Supabase's default privileges also grant it directly to `anon` and `authenticated`. That is why the revoke names all three.
- Whether such a call would then succeed also depends on RLS on `orders`, because the function is `SECURITY INVOKER`. Either way, the grant should not be there.

## 3. Verdict

**Safe to revoke now, for the deployed code (`f4bd277`), for the checkpoint, and for the current tree.**
- Deployed: the only caller uses the service role, and the explicit `grant … to service_role` keeps it working even if `service_role` held EXECUTE only through `PUBLIC`.
- Current tree: it doesn't call the old function at all.

**What would break:** nothing that exists in this repository. The only thing that would stop working is a direct call to the function with the anon key or a signed-in user's session, and no code makes one.

**Two notes:**
- Run the "before" query first, so the rollback can restore exactly what was there.
- Keep the old function after the Phase 3 deploy. The brief says never drop it, and a request still running on the old build may call it during the deploy. The revoke doesn't affect that, because those requests use the service role too.

## 4. The SQL — NOT RUN

**Before (read-only).** This records today's grants; keep the output for the rollback:

```sql
select r.rolname,
       has_function_privilege(r.rolname, 'public.place_order_atomic(jsonb, text, text, uuid, text, date, jsonb)', 'execute') as can_execute
  from pg_roles r
 where r.rolname in ('anon', 'authenticated', 'service_role', 'postgres')
 order by 1;

select p.proacl from pg_proc p
 where p.oid = 'public.place_order_atomic(jsonb, text, text, uuid, text, date, jsonb)'::regprocedure;
```

**The revoke:**

```sql
begin;
revoke execute on function public.place_order_atomic(jsonb, text, text, uuid, text, date, jsonb) from public, anon, authenticated;
grant execute on function public.place_order_atomic(jsonb, text, text, uuid, text, date, jsonb) to service_role;
commit;
notify pgrst, 'reload schema';
```

**Verify (read-only).** Expect `anon` false, `authenticated` false, `service_role` true:

```sql
select has_function_privilege('anon',          'public.place_order_atomic(jsonb, text, text, uuid, text, date, jsonb)', 'execute') as anon,
       has_function_privilege('authenticated', 'public.place_order_atomic(jsonb, text, text, uuid, text, date, jsonb)', 'execute') as authenticated,
       has_function_privilege('service_role',  'public.place_order_atomic(jsonb, text, text, uuid, text, date, jsonb)', 'execute') as service_role;
```

Then place one pay-at-the-truck test order on **Pizza Kitchen** (`test-kitchen`), never Pizzeria Gusto, and confirm it is created.

**Rollback.** This restores the default grants; compare with the "before" output:

```sql
begin;
grant execute on function public.place_order_atomic(jsonb, text, text, uuid, text, date, jsonb) to public, anon, authenticated;
commit;
notify pgrst, 'reload schema';
```

## Rules kept

| Rule | |
|---|---|
| Read-only; only this report written | ✓ |
| No SQL run; no commit or push | ✓ |
| No `.env*` opened | ✓ the client files were read for which variable *name* they use. Values not read: `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` were not checked for set/missing, as no run needed them |
