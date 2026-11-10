# demo-claim-1 — did Le Roi du Churrasco's demo menu carry over?

Diagnosis only. Nothing was changed: no code, no data, no commit, push or deploy. The only file written is this report. Evidence comes from the production DB and the Supabase edge (PostgREST/Auth) request logs, read 9 Nov 2026 at about 21:12 UTC.

> **Cleanup timing (step 5).** The demo their account claimed, `demo-mk65q6…`, is **not** due for cleanup within 48 hours. The earliest it can be swept is the hourly run at **9 Dec 2026, 21:00 UTC**. One of their other, unclaimed demos (`demo-rev4r1…`, 16:56) **will be swept at about 17:00 UTC on 10 Nov**. Recovery does not need it. It holds a near-identical copy of the menu.

> **Flag: the premise doesn't match the data.** The brief says they uploaded "around 05:00 UTC, 9 Nov". **No demo of any kind was created between 03:00 and 07:00 UTC on 9 Nov.** Their three demos were built at **16:56, 18:13 and 20:04 UTC** (17:56, 19:13 and 21:04 Paris time). "05:00" may have meant 5 pm. Nothing in the prompt was garbled, and no two instructions contradict each other.

---

## Verdict: case (a), triggered by a switch to the phone

The claim landed, and the stored extraction is intact (`upload`, 10 items, all priced). The `?import=demo` bootstrap **did run once**, at 20:13:58 on their Windows desktop, and pre-loaded the import offer. **Nothing was ever committed.**

About 2½ minutes later they clicked the verification email link. Within 16 seconds an **Android phone** signed in. As designed, verify-signup landed them on `/manage/<token>?verify=ok` with **no `?import=demo`**, so they saw an empty Menu tab. They then went to the Schedule and added 4 events. They were still active at 21:12 UTC.

---

## 1. Who they are

**Operator** (one account, nothing else matches)

| field | value |
|---|---|
| id | `7dcbf755-5370-4656-85be-074687109ea7` |
| email | leroiduchurrasco@gmail.com (same as the contact email) |
| name | first "Jenny & Ludo", last "DA SILVA" |
| created_at | 2026-11-09 20:13:43.85 UTC |
| is_admin / marketing / promo | false / false / none |

**Real truck** (the only truck for this operator)

| field | value |
|---|---|
| id / slug | `le-roi-du-churrasco` |
| name | LE ROI DU CHURRASCO |
| created_at | 2026-11-09 20:13:45.36 UTC |
| country / plan | FR / trial (expires 2027-02-09) |
| setup_step | `menu` (onboarded_at null) |
| dashboard_token | `le-roi…` (masked) |
| **menu** | **0 categories, 0 items**, 0 subcategories, 0 bundles |
| other | 1 van, 4 events (created 20:22–20:27), 2 places, 0 orders |

**Their demos** (all landing demos from France on 9 Nov, matched on visitor email; no outreach demo)

| demo truck | created (UTC) | expires_at | saved email? | claimed | extraction | menu rows (cats/items) |
|---|---|---|---|---|---|---|
| `demo-rev4r1eqw6c70ywbaczczqxr14` | 16:56:52 | 10 Nov 16:56 | no | — | upload, 5 cats / 10 items | 5 / 10 |
| `demo-0r5zmyfjgrs82vg399a6kc36dd` | 18:13:12 | 23 Nov 18:20 (saved 18:20:55) | yes | — | upload, 6 cats / 10 items | 6 / 10 |
| **`demo-mk65q66spjck0g9mxt50btfxtr`** | **20:04:53** | 10 Nov 20:04 | no | **their operator** | **upload, 5 cats / 10 items** | **5 / 10** |

All three demos are country FR, plan `demo`, setup_step null. Their dashboard tokens (masked) are `demo-sk5ry…`, `demo-sd4tc…` and `demo-s3ry5…`. Two other demos from today (`demo-m9se7y…` GB and `demo-e0tgbw…` FR, 2 items each, the only ones with `signup_started` events) don't belong to them. They look like test runs.

The three extractions are the same menu with small differences:
- **16:56** — Poulet Portugais 7, Batatinhas do Rei 3, Arroz Soltinho 3, Beignets de Viande 3, Beignets de Morue 3, **Boisson** 2, **Vin** 8, Pastel de nata 1.5, Bolo brigadeiro 2.5, Pudim do Rei 2.5
- **18:13** — **Poulet Rôti** 7, …, **Beignets** 3 (one item), Boissons 2, Vins 8, …, plus **"Spécialité en Grillade de la Semaine" 0** (a 6th category, "Specials")
- **20:04 (claimed)** — the same as 16:56, except the drinks came out in English: **"Drinks"** 2, **"Wine"** 8

## 2. The claim

- **Claimed?** Yes. `demo_sessions.claimed_by_operator_id = 7dcbf755…` on `demo-mk65q6…`, the demo they built 9 minutes before signing up. The two earlier demos are unclaimed.
- **When:** 2026-11-09 20:13:44.04 UTC (`PATCH demo_sessions?truck_id=eq.demo-mk65q6…&claimed_by_operator_id=is.null`). That is 0.4 s after the auth user was created and in the same request (`signup_done` demo_event at 20:13:44.12).
- **Token or slug?** **By slug.** The `claimed_by_operator_id=is.null` filter on that PATCH is only added on the slug path ([app/api/signup/route.ts](app/api/signup/route.ts), `await (byToken.data ? claim : claim.is('claimed_by_operator_id', null))`). The lookup by dashboard token found nothing, and the slug matched.
- **Extraction:** present, `extraction_source = 'upload'`, keys `items, categories, existing_categories`, 10 items, **0 unpriced**, so the price gate won't block. GET /api/setup therefore returns the extraction, not `no_extraction` or `template_withheld`.

## 3. Their path, in order (UTC, 9 Nov)

| time | event | evidence |
|---|---|---|
| 16:56:52 | Demo 1 built from an upload (email given at build 16:57:13) | demo_sessions, `build_ok` 16:57:13 |
| 16:57–17:51 | Demo 1 viewed and polled for about an hour | `menu_viewed` ×3, demo_sessions GETs every 60 s |
| 18:13:12 | Demo 2 built from an upload | `build_ok` 18:13:37 |
| 18:20:55 | **"Save your demo"** on demo 2 (expiry moved to 14 days) | demo_sessions email + expires_at 23 Nov, upsert in the log |
| ~19:10 | Public signup switched on (per the brief) | — |
| 20:04:53 | Demo 3 built from an upload | `build_ok` 20:05:12 |
| 20:13:43.6 | **Signup OK** (auth user created) | `POST /auth/v1/admin/users` 200 |
| 20:13:44.0 | **Claim** of demo 3 by slug | PATCH above, `signup_done` |
| 20:13:44.1 | Verification row created | operator_email_verifications `af78017f…` |
| 20:13:44.4 | Signed in on **Windows Chrome** (desktop) | `POST /auth/v1/token?grant_type=password`, UA Windows NT 10.0 |
| 20:13:45.5 | **Real truck created** (`le-roi-du-churrasco`) | `PATCH trucks?id=eq.le-roi-du-churrasco`, trucks.created_at |
| 20:13:57 | /manage opened | trucks / menu reads for le-roi-du-churrasco |
| **20:13:58.2** | **`?import=demo` bootstrap ran**: GET /api/setup read the claimed extraction | `GET demo_sessions?select=truck_id,extraction,extraction_source&claimed_by_operator_id=eq.7dcbf755…` (the **only** such read all evening) |
| 20:14–20:16 | Desktop tab open, polling every 15 s | repeated trucks/vans reads |
| **20:16:19** | **Clicked the verification link** (verified_at written) | operator_email_verifications.verified_at 20:16:19.012 |
| **20:16:34.7** | **Signed in on an Android phone** | `POST /auth/v1/token`, UA "Linux; Android 10; K … Mobile" |
| 20:16:35 | /manage loaded on the phone, **no bootstrap read** (no `?import=demo`) | menu reads for the truck, no demo_sessions read |
| 20:19–20:27 | Schedule work: 4 events and 2 places created | truck_events.created_at 20:22:04 → 20:27:22 |
| up to 21:12 | Still active | last log hit for the truck at 21:12:14 |
| — | **Commit-menu attempts: none** | no POST/PATCH/DELETE on menu_categories, menu_items_db or menu_subcategories for their truck. The only menu writes in the window were 3 PATCHes on `pizzeria-gusto`. Their truck has 0 menu rows. |

The "the menu is empty" moment is the phone landing at 20:16:35. The desktop tab was showing the welcome card and then the "use this menu / upload another" offer. Whether they pressed anything there can't be seen server-side, but neither path reached a commit.

- **Accounts and trucks:** one operator and one truck. No duplicate account, and no second truck.
- **Signup refusals before 19:10:** not visible in the evidence I have. A `signup_closed` 403 returns before any Supabase write; the only Supabase call it makes is a cookie `getUser`, which can't be told apart from the others. Vercel function logs were **not** checked. They used "Save your demo" at 18:20, and that is the button shown while signup is off, so that is consistent with signup being shut then. It is not proof that they tried and were refused.
- **Instrumentation gap:** their demos have **no `signup_started` event**, although they clearly signed up from the demo. The `signup_started` events today all belong to the two test demos. Whatever surface they used to reach the signup form (probably the post-save "Set up my truck →" CTA on the slug-only surface) doesn't fire it, so the funnel undercounts this route.

## 4. Which case: (a)

Case (a): **claimed and extraction intact, but the import review never committed.**

The evidence for each part:
- **Claimed:** `claimed_by_operator_id = 7dcbf755…` on `demo-mk65q6…`, set at 20:13:44 by the signup request.
- **Intact:** `extraction` is non-null, `extraction_source = 'upload'`, 10 items, all priced.
- **Bootstrap reached:** exactly one GET of the claimed extraction, at 20:13:58, from the desktop session.
- **Never committed:** 0 menu rows on `le-roi-du-churrasco`, and no menu writes for it in the logs.
- **Why:** verify-signup at 20:16:19, then a fresh Android sign-in at 20:16:34. verify-signup deliberately redirects to `/manage/<token>?verify=ok` without `?import=demo` ([app/api/auth/verify-signup/route.ts:43-46, 69](app/api/auth/verify-signup/route.ts#L43-L46)). The pre-loaded import therefore exists **only in the desktop tab's memory**. On any other device or tab, nothing points back to it.

It is not (b), because the claim landed and was made from the demo. It is not (c), because the payload is present.

## 5. Recovery (not applied)

**Recommended: they open the import link themselves, signed in, on either device.**

```
https://<app host>/manage/<their dashboard token>?import=demo
```

On load, the bootstrap calls GET /api/setup. It returns the claimed extraction, because their session is the claiming operator. Manage then shows the setup welcome card, followed by the offer "use this menu (10 items)". **"Use this menu"** opens the normal review: grouping, allergens, and a price gate that passes (all items priced). The commit runs with `clearFirst: true`, which is allowed because `setup_step = 'menu'`. It writes only menu rows and leaves their 4 events and 2 places alone.

During the review they can rename "Drinks"/"Wine" back to "Boisson"/"Vin". The 18:13 demo had "Poulet Rôti" and a weekly special. Those aren't in the claimed extraction, so they can add them afterwards or ignore them.

**Why them, and not you as admin:**
- The bootstrap is scoped to the **signed-in operator's** claim: `.eq('claimed_by_operator_id', operator.id)` ([app/api/setup/route.ts:261-267](app/api/setup/route.ts#L261-L267)). Opened under your admin session, it would find **no claim** and show a blank upload.
- The admin alternative is a server-side commit of the stored extraction onto `le-roi-du-churrasco` through `commitMenu` / `clearMenu` ([lib/menu-commit.ts](lib/menu-commit.ts)). That is a core-table row change, so it needs your explicit go-ahead first. It would also skip the review the operator is meant to make (grouping choices, allergen decisions). Keep it as the fallback if they can't or won't do it, done through a committed script per the migrations rule. It wasn't prepared here.
- This session hasn't contacted them, per the brief. Sending them the link (with the token filled in) is up to you.

**Safety of the source until then:**

| sweep | applies to `demo-mk65q6…`? | when |
|---|---|---|
| Expiry sweep (24 h / 14 d) | **No.** It excludes claimed sessions (`.is('claimed_by_operator_id', null)`). Its expires_at of 10 Nov 20:04 doesn't matter. | never, while claimed |
| Claimed-but-abandoned sweep | Yes, once expired **and** `created_at` is older than 30 days | first run after 9 Dec 20:04:53, i.e. **9 Dec 2026 ≈ 21:00 UTC** |
| Orphan sweep (2 h, no menu or no event) | Not while it keeps its rows: 10 active items and 1 truck_event | only if its menu or event were deleted (e.g. someone restarting or clearing that demo) |

The hourly cleanup ran clean all day (every run `ok`, 0 deletions). That leaves about 30 days. **Not within 48 h.**

Also due:
- `demo-rev4r1…` (unclaimed, no saved email) will be swept at about **17:00 UTC on 10 Nov**.
- `demo-0r5zmy…` (saved email) will be swept at about **19:00 UTC on 23 Nov**.

Neither is needed for recovery.

## 6. Product fix proposal (not built)

The failure: the hand-off lives only in a URL parameter in one browser tab, and the verification email, the most likely next click, deliberately leads away from it.

1. **A lasting "Finish importing your menu" prompt (recommended first).** Show it in Manage on any tab, and in the app, while the truck has `setup_step = 'menu'`, 0 menu items, and its operator has a claimed `upload` extraction. A banner or card with "Use the menu from your demo" reopens the same offer and review. It needs no URL, survives devices and verify-signup, and changes no data. The cost is one extra read on Manage load for in-setup trucks only, and the banner should be dismissable for operators who'd rather upload fresh.
2. **verify-signup returns to the unfinished import.** Use `?import=demo` when the resolved truck is in setup, has no menu, and the operator has an un-committed claimed upload. The cost: the duplicate-toast issue that made it drop `?import=demo` came from a *second* navigation through /setup. A direct redirect to Manage doesn't have it, but it needs a re-test. It only fixes the email path, so (1) is still needed.
3. **Commit the claimed extraction automatically at account creation.** The menu would never be empty. The costs:
   - It skips the operator's grouping and allergen decisions and the deliberate "is this your menu?" offer, which B1/C1 built on purpose.
   - It may commit an AI misread straight onto a real truck.
   - It needs a guard so it never commits a template.

   A middle option is to auto-commit only once the operator has passed the offer ("Use this menu") but abandoned the review. Recommended only as a later step, if (1) and (2) still leak.
4. **Small extra:** fire `signup_started` from every surface that opens the signup form, not just the walkthrough's "Start free". Today this signup has no `signup_started` row.

---

## SQL run (all read-only)

Postgres (production):

```sql
select t.id, t.name, t.slug, t.country, t.plan, t.setup_step, t.created_at, t.operator_id,
  left(t.dashboard_token,6)||'…' as token_masked,
  (select count(*) from menu_categories c where c.truck_id=t.id) as cats,
  (select count(*) from menu_items i where i.truck_id=t.id) as items
from trucks t
where t.name ilike '%churras%' or t.name ilike '%roi du%' or t.slug ilike '%churras%'
order by t.created_at;
-- failed: menu_items does not exist (the table is menu_items_db)
```

```sql
select table_name, string_agg(column_name, ',' order by ordinal_position) cols from information_schema.columns
where table_schema='public' and (table_name ilike '%menu%' or table_name in ('trucks','demo_sessions','demo_events','operators','operator_email_verifications','truck_users','demo_cleanup_log'))
group by table_name order by 1;
```

```sql
select t.id, t.name, t.slug, t.country, t.plan, t.setup_step, t.created_at, t.operator_id, t.contact_email,
  left(t.dashboard_token,6)||'…' as token_masked,
  (select count(*) from menu_categories c where c.truck_id=t.id) as cats,
  (select count(*) from menu_items_db i where i.truck_id=t.id) as items
from trucks t
where t.name ilike '%churras%' or t.name ilike '%roi du%' or t.slug ilike '%churras%' or t.name ilike '%churas%' or t.contact_email ilike '%churras%'
order by t.created_at;
```

```sql
select o.id, o.email, o.name, o.first_name, o.last_name, o.created_at, o.is_admin, o.marketing_opt_in, o.signup_promo_code
from operators o
where o.email ilike '%churras%' or o.name ilike '%silva%' or o.last_name ilike '%silva%' or o.first_name ilike any (array['jenny%','ludo%'])
   or o.created_at >= '2026-11-09'
order by o.created_at;
```

```sql
select ds.truck_id, t.name, t.country, t.plan, t.setup_step, t.slug, left(t.dashboard_token,10)||'…' token_masked,
  ds.created_at, ds.expires_at, ds.email is not null as has_email, ds.visitor_email is not null as has_visitor_email,
  ds.email ilike '%churras%' or ds.visitor_email ilike '%churras%' as email_match,
  ds.email_given_at, ds.claimed_by_operator_id, ds.extraction is not null as has_extraction, ds.extraction_source,
  ds.discovery_truck_id, ds.first_opened_at, ds.retired_at,
  (select count(*) from menu_categories c where c.truck_id=ds.truck_id) cats,
  (select count(*) from menu_items_db i where i.truck_id=ds.truck_id) items
from demo_sessions ds left join trucks t on t.id=ds.truck_id
where ds.created_at >= '2026-11-08 18:00' or ds.claimed_by_operator_id='7dcbf755-5370-4656-85be-074687109ea7'
   or t.name ilike '%churras%' or ds.email ilike '%churras%' or ds.visitor_email ilike '%churras%'
order by ds.created_at;
```

```sql
select truck_id, jsonb_typeof(extraction) typ, (select array_agg(k) from jsonb_object_keys(extraction) k) keys,
  pg_column_size(extraction) bytes, md5(extraction::text) hash
from demo_sessions where truck_id in ('demo-rev4r1eqw6c70ywbaczczqxr14','demo-0r5zmyfjgrs82vg399a6kc36dd','demo-mk65q66spjck0g9mxt50btfxtr');
```

```sql
select truck_id, jsonb_array_length(extraction->'items') n_items, jsonb_array_length(extraction->'categories') n_cats,
  (select string_agg(coalesce(c->>'name', c#>>'{}'), ' | ') from jsonb_array_elements(extraction->'categories') c) cat_names,
  (select string_agg((i->>'name')||' '||coalesce(i->>'price',''), ' | ') from jsonb_array_elements(extraction->'items') i) item_names
from demo_sessions where truck_id in ('demo-rev4r1eqw6c70ywbaczczqxr14','demo-0r5zmyfjgrs82vg399a6kc36dd','demo-mk65q66spjck0g9mxt50btfxtr');
```

```sql
select e.at, e.demo_id, e.event, e.source from demo_events e
where e.demo_id in ('demo-rev4r1eqw6c70ywbaczczqxr14','demo-0r5zmyfjgrs82vg399a6kc36dd','demo-mk65q66spjck0g9mxt50btfxtr')
   or (e.at >= '2026-11-09 03:00' and e.at < '2026-11-09 07:00')
order by e.at;
```

```sql
select id, created_at, expires_at, verified_at, email = 'leroiduchurrasco@gmail.com' as same_email
from operator_email_verifications where operator_id='7dcbf755-5370-4656-85be-074687109ea7' order by created_at;
```

```sql
select count(*) filter (where created_at >= '2026-11-09' and created_at < '2026-11-10') demos_today,
  count(*) filter (where created_at >= '2026-11-09 03:00' and created_at < '2026-11-09 07:00') demos_0300_0700
from demo_sessions;
```

```sql
select id, run_at, ok, expired_deleted, orphans_deleted, files_deleted from demo_cleanup_log where run_at >= '2026-11-09' order by run_at;
```

```sql
select
 (select count(*) from truck_events where truck_id='le-roi-du-churrasco') events,
 (select min(created_at) from truck_events where truck_id='le-roi-du-churrasco') first_event_created,
 (select max(created_at) from truck_events where truck_id='le-roi-du-churrasco') last_event_created,
 (select count(*) from truck_places where truck_id='le-roi-du-churrasco') places,
 (select count(*) from truck_vans where truck_id='le-roi-du-churrasco') vans,
 (select count(*) from menu_subcategories where truck_id='le-roi-du-churrasco') subcats,
 (select count(*) from bundles_db where truck_id='le-roi-du-churrasco') bundles,
 (select count(*) from trucks where operator_id='7dcbf755-5370-4656-85be-074687109ea7') trucks_for_operator,
 (select count(*) from truck_users where truck_id='le-roi-du-churrasco') truck_users,
 (select count(*) from orders where truck_id='le-roi-du-churrasco') orders,
 (select setup_step from trucks where id='le-roi-du-churrasco') setup_step,
 (select trial_expires_at from trucks where id='le-roi-du-churrasco') trial_expires_at,
 (select onboarded_at from trucks where id='le-roi-du-churrasco') onboarded_at,
 now() as db_now;
```

```sql
select
 (select count(*) from truck_events where truck_id='demo-mk65q66spjck0g9mxt50btfxtr') demo_events_rows,
 (select count(*) from menu_items_db where truck_id='demo-mk65q66spjck0g9mxt50btfxtr' and is_active) demo_active_items,
 (select count(*) from demo_events where event='signup_started' and at >= '2026-11-09') signup_started_today,
 (select count(*) from demo_events where event='signup_done' and at >= '2026-11-09') signup_done_today,
 (select count(*) from operators where created_at >= '2026-11-09 19:00') operators_since_1900,
 (select count(*) from jsonb_array_elements((select extraction->'items' from demo_sessions where truck_id='demo-mk65q66spjck0g9mxt50btfxtr')) i where coalesce((i->>'price')::numeric,0) <= 0 or (i->>'price_missing')::boolean) claimed_unpriced_items;
```

```sql
select at, demo_id, source from demo_events where event='signup_started' and at >= '2026-11-09' order by at;
```

Supabase log queries (ClickHouse, `logs`):

```sql
select distinct source from logs limit 50
-- window 2026-11-09 19:00 → 23:59 UTC
```

```sql
select timestamp, event_message from logs where source='edge_logs' and (event_message like '%claimed_by_operator_id%' or event_message like '%le-roi-du-churrasco%' or event_message like '%7dcbf755%' or event_message like '%demo-mk65q66%') order by timestamp limit 200
-- window 19:00 → 23:59 UTC (hit the 200-row limit at 20:09)
```

```sql
select timestamp, substring(event_message, 1, 300) as m from logs where source='edge_logs' and (event_message like '%claimed_by_operator_id=eq%' or event_message like '%le-roi-du-churrasco%' or event_message like '%7dcbf755%' or event_message like '%demo-mk65q66%' or event_message like '%operator_email_verifications%' or event_message like '%/auth/v1/%') and event_message not like '%modifier%' and event_message not like '%upsell%' order by timestamp limit 150
-- window 20:13 → 23:59 UTC
```

```sql
select timestamp, substring(event_message, 1, 260) as m from logs where source='edge_logs' and (event_message like '%claimed_by_operator_id=eq%' or event_message like '%le-roi-du-churrasco%' or event_message like '%7dcbf755%' or event_message like '%demo-mk65q66%' or event_message like '%grant_type%' or event_message like 'POST%menu_%' or event_message like 'DELETE%menu_%' or event_message like 'PATCH%menu_%') and event_message not like '%/auth/v1/user %' and event_message not like '%truck_vans?select=id&truck_id%' and event_message not like '%active=eq.true |%' and event_message not like '%Deno%' order by timestamp limit 150
-- window 20:16:37 → 23:59 UTC
```

```sql
select
  countIf(event_message like '%demo_sessions?select=truck_id%2Cextraction%2Cextraction_source&claimed_by_operator_id=eq.7dcbf755%') as bootstrap_gets,
  minIf(timestamp, event_message like '%demo_sessions?select=truck_id%2Cextraction%2Cextraction_source&claimed_by_operator_id=eq.7dcbf755%') as first_bootstrap,
  maxIf(timestamp, event_message like '%demo_sessions?select=truck_id%2Cextraction%2Cextraction_source&claimed_by_operator_id=eq.7dcbf755%') as last_bootstrap,
  countIf((event_message like 'POST%' or event_message like 'DELETE%' or event_message like 'PATCH%') and (event_message like '%/menu_categories%' or event_message like '%/menu_items_db%' or event_message like '%/menu_subcategories%')) as menu_writes_any_truck,
  countIf(event_message like '%grant_type=password%' and event_message like 'POST%') as password_logins,
  maxIf(timestamp, event_message like '%le-roi-du-churrasco%') as last_activity
from logs where source='edge_logs'
-- window 20:13 → 23:59 UTC
```

```sql
select timestamp, substring(event_message,1,300) m from logs where source='edge_logs' and ((event_message like 'POST%' or event_message like 'DELETE%' or event_message like 'PATCH%') and (event_message like '%/menu_categories%' or event_message like '%/menu_items_db%' or event_message like '%/menu_subcategories%')) order by timestamp
-- window 20:13 → 23:59 UTC
```

```sql
select timestamp, substring(event_message,1,260) m from logs where source='edge_logs' and (event_message like '%grant_type=password%' and event_message like 'POST%') order by timestamp
-- window 20:13 → 23:59 UTC
```

```sql
select timestamp, substring(event_message,1,300) m from logs where source='edge_logs' and event_message like '%demo_sessions%' and timestamp >= '2026-11-09 16:50:00' and event_message not like '%expires_at=lt%' order by timestamp limit 80
-- window 16:50 → 20:13:30 UTC
```

Not checked: Vercel function logs (which would show any `signup_closed` 403s before 19:10).
