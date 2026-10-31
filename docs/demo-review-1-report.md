# demo-review-1 — report

**30 October 2026.** Written for Dominic, to prepare the demo redesign: the customer order screen first, then a kitchen
screen showing only that order.

- **Research only:** no code, data or database change, and nothing deployed or pushed.
- Only read-only SQL was used (§7).
- No `.env*` file was opened, and no `outreach_templates` row was touched.
- **Nothing in the brief arrived garbled, and no instruction contradicts another.**

**How this was done:**
- The manual's demo sections were read: §55 the outreach demo, §56 the restart triggers, the V9 onboarding / demo notes,
  §16's demo schema facts and the PostHog sections. Then the code was read.
- **Timings come from the code's own constants and comments, not from measurement.** No request logs were read.

**One stale line found in the manual (not changed):** §56 says the demo event ends "+3h". The code says 4 hours
(`DEMO_WINDOW_HOURS = 4`, `lib/provision-demo-event.ts:65`), and §55 agrees with the code.

---

## 1 · The current flow, step by step

### 1a · The landing-page demo ("Upload my menu")

| # | What the visitor sees | URL / component | Time |
|---|---|---|---|
| 1 | Presses **"Upload my menu →"** (hero, nav and lower page) | Any page using `<DemoCta>`: landing, `/features`, `/about`, `/compare`, the country pages. `components/landing/DemoUpload.tsx` | instant |
| 2 | **A modal over the page:** the dropzone or pasted text (`MenuUploadFields`, shared with Manage's importer), "Build my demo", and a smaller "See sample menu" | `DemoModal`, portalled to `<body>` | until they choose |
| 3 | **The build, inside the same modal:** a spinner, one line of text, and 5 progress pips | the modal's `working` phase | **~40–45 s typical** |
| 4 | **A full page load** to the demo dashboard (`window.location.assign`) | `/dashboard/<demo-token>` | a normal page load |
| 5 | **"🎉 Here's your demo"** popup over the board: two things to try (press the button on an order; scan the QR or tap the link and order as a customer), with the QR, the link and Copy link | `components/dashboard/DemoWelcome.tsx` | until dismissed |
| 6 | **The operator dashboard,** with a DEMO MODE strip and a "Get started" / "Save my menu" button in it, and **a board of seeded orders** (see §2) | `app/dashboard/[token]/page.tsx`, `DemoModeBanner`, `DemoGetStarted` | — |
| 7 | **On the phone, or a new tab, the customer order page:** a DEMO strip, the menu, the basket, details (an **email is required**), then "Place order" with **no card step** (§5). Then the confirmation screen | `/trucks/<demo-slug>/order` → `/api/orders/submit` | about a minute of their tapping |
| 8 | **The order appears on the dashboard,** already confirmed (auto-accept is on for demos), live over Realtime. A card at the top says it arrived, names it, and offers "Show me", which scrolls to it and rings it | `DemoLoopComplete` | about 1 s after submit |
| 9 | **Optional, "Kitchen screen":** a new tab with the kitchen screen, a one-time demo intro, grid layout, all the event's orders. Live over Realtime | `/dashboard/<token>/kds` | — |
| 10 | **Signup:** "Set up my truck" (a two-step wizard in a modal), or "Save my menu" (email only), depending on a build flag | `DemoGetStarted` (§3) | — |

**The build (step 3) in detail:**
- **One blocking request,** `POST /api/demo`, with `maxDuration` 300 s (this needs Vercel Pro).
- **On the server, in order** (`lib/provision-demo.ts`):
  1. the truck + van (`provisionTruck` kind `demo`, `demo-` identity, hidden, auto-accept on, no order emails);
  2. the `demo_sessions` row (24 h expiry);
  3. **menu extraction with Gemini**, the long pole, about 20 s (a per-attempt abort at 90 s);
  4. assumptions, then the menu commit;
  5. a live 4-hour event + slot grid (`provisionDemoEvent`);
  6. **`seedDemoOrders`** (§2);
  7. the occupancy rebuild.
- **The progress text is timed, not real progress** (`STEPS` at 0 / 20 / 25 / 30 / 35 s): "Reading your menu…", then
  found, kitchen, page, almost. The last stage holds until the response.
  - A fast response "flushes" the remaining stages, in at most 2 s.
  - At 60 s, an amber "still working" note appears.
  - At 75 s, the sample-menu escape hatch appears.
- **The sample menu (Pizza)** makes no Gemini call: about 10–15 s, with different labels.
- **A failed read** shows "we couldn't read that menu", with: try again, upload another, see the sample, or send us your
  email (`/api/demo/build-request`).
- **The rate limit** is 5 builds an hour per IP.

### 1b · The outreach demo ("Create Demo")

| # | Who · what | URL / component | Time |
|---|---|---|---|
| 1 | **You, in Admin › Outreach › prospect modal › Create Demo:** a menu file, text or the sample; collection times (5–30 min); cook time; batch size | `components/admin/CreateDemoModal.tsx` → `POST /api/admin/provision-demo` (`verifyAdmin`, `maxDuration` 300) | **the same ~40–45 s build**, plus the logo copy |
| 2 | **The modal shows the link and does not navigate.** The demo is branded with the prospect's name and logo, keeps a 30-day expiry, and is linked by `demo_sessions.discovery_truck_id` | `/demo/<public_ref>` | — |
| 3 | **The prospect opens the link:** a 307 redirect, with no writes | `app/demo/[ref]/route.ts` → `/dashboard/<demo-token>` | instant |
| 4 | **First open (T2):** the dashboard claims `first_opened_at` with a compare-and-set POST, then **wipes the board and builds a fresh event + seeded orders for "now"**. The prospect sees **"Setting up your demo…"** meanwhile | `/api/demo/restart` → `lib/demo-restart.ts` | the re-seed; unmeasured, a few seconds (no Gemini; up to ~200 database round trips) |
| 5 onward | **The same as the landing demo's steps 5–10,** but branded: their name on the header, and their logo in the QR | — | — |

- **An admin opening the link** does not use up the first open: `isAdmin` is excluded.
- **T1** restarts any demo whose event is over (an "ended" card, then "Start a new service").

### 1c · Where the two share code

**Almost everything after the request:**
- **`provisionDemo`** is one path for both. The outreach demo only adds a name, a logo, a discovery id, the three kitchen
  numbers, and the 30-day tier.
- **Also shared:** `seedDemoOrders`, `provisionDemoEvent`, `demo_sessions`, the whole demo dashboard (`DemoWelcome`,
  `DemoLoopComplete`, `DemoModeBanner`, `DemoGetStarted`), the demo KDS, the customer order page, `/api/orders/submit`,
  the restart library and the cleanup cron.
- **The difference is the entry:** `/api/demo` (anonymous, rate-limited, navigates at once) against
  `/api/admin/provision-demo` (admin, returns a link). And the first-open restart applies to outreach demos only.

---

## 2 · The seeded orders, and starting with none

### How `seedDemoOrders` works (`lib/seed-demo-orders.ts`)

- **Real rows in `orders`** against the real event: `status: 'confirmed'`, `payment_status: 'unpaid'`, made-up first
  names, and **`customer_email` always null**. That null is how seeded orders are told apart from a visitor's, because
  `/api/orders/submit` requires an email.
- **The count follows the kitchen:** it scales with the number of batch-windows in the 4-hour event, the batch size and a
  fill pattern (full / part / empty), between **4 and 80** (`MAX_TARGET_ORDERS = 80`).
  - The three demos alive today have **47, 69 and 78**, so "about 80" is the landing demo's normal size.
- **Order shapes cycle** (singles, pairs, family orders, one drinks-only order).
- **Each order goes into a collection slot** within its mains budget, so no slot is over capacity by construction.
- **Each row is inserted one at a time and admitted through `admitForManual`,** the same call as the dashboard's Add
  Order, with its cooking reservation written. A row the engine refuses is deleted.
- **Afterwards:**
  - the event's order counter moves past the seeded block, so the visitor's order cannot clash with a seeded number;
  - the occupancy table is rebuilt, so the traffic lights are true.
- **Called from:** `provisionDemo` (both demos), `restartDemoService` (T1, T2 and "Start a new service").

### Starting the demo with no seeded orders: what already works

- **The demo order page submits real orders into the demo truck.** `/api/orders/submit` waives the "hidden truck" gate
  for `demo-` trucks only, saves the order, and books the slot. **Every email is suppressed** for a demo truck (customer
  and truck). Auto-accept is on, so the order lands `confirmed`.
- **The demo KDS updates live:**
  - `app/dashboard/[token]/kds/page.tsx:1163` subscribes to Realtime `postgres_changes` on `orders` for the truck, and the
    dashboard does the same (`page.tsx:1553`).
  - Both refetch on any change, with a 60 s poll as the backstop.
  - **Confirmed in the database:** `orders` is in the `supabase_realtime` publication (with `trucks`), and has a public
    SELECT policy (`using true`), which is the Realtime gate the manual describes.
  - So an anonymous visitor's screen does receive the event.
- **The kitchen screen shows any confirmed order at once:** its cook view lists active orders (not ready). There is no
  extra step.

### What would be needed

1. **Seed nothing:**
   - an option on `provisionDemo` / `restartDemoService` that skips `seedDemoOrders`;
   - `args.count` exists, but `count: 0` is untested, so a skip flag is cleaner.
   - The event, slot grid and occupancy rebuild still run.
   - **T2 and T1 re-seed today,** so both restart paths must take the same option, or an outreach demo will fill up on
     first open.
2. **The kitchen screen "showing only that order":**
   - with no seeds, the board naturally holds only the visitor's order(s), and no filter is needed;
   - if seeds stay for the dashboard, the KDS would need a demo-only filter (`customer_email is not null`, or a passed
     `order_key`). Today it has none.
3. **Order of screens:**
   - today the visitor lands on the **operator dashboard** and must find the QR or link to become a customer;
   - "customer order screen first" means `/api/demo` (or the client after it) going to `/trucks/<demo-slug>/order`
     instead, then to the KDS after the confirmation;
   - **the order page never sees the dashboard token** (only the slug), so linking from the confirmation to the KDS needs
     the token passed along (e.g. in the client's memory from the build response) or a slug-based KDS view. That is a
     security decision: the token is the access credential.
4. **What is lost without seeds:**
   - the "busy service" and capacity story (traffic lights, full and part-full slots);
   - `DemoWelcome`'s copy ("The orders already on it are examples…");
   - `DemoLoopComplete`'s premise of finding one order among many.

   These need rewriting with the redesign.
5. **Speed:** seeding is up to ~200 sequential database round trips inside the build. Dropping it takes some seconds off
   the ~40–45 s (unmeasured). Gemini stays the long pole.

---

## 3 · What happens to the uploaded menu on signup

**It is carried over, but only on one path, and only if they uploaded their own menu.**

- **Stored at build time:** `persistExtraction` saves the **raw Gemini extraction** to `demo_sessions.extraction`, with
  `extraction_source = 'upload'`. A sample-menu demo stores `'template'`.
- **Signup ON** (`NEXT_PUBLIC_SIGNUP_PUBLIC === 'true'`, decided at build time):
  1. "Set up my truck" runs `POST /api/signup` with the demo token, which **claims the session**
     (`claimed_by_operator_id`);
  2. then sign-in, `/api/setup create_truck`, and the profile fields;
  3. then it redirects to **`/manage/<new token>?import=demo`**.
  4. Manage calls `GET /api/setup`, which returns the claimed demo's extraction, and **pre-loads the menu importer's
     review step** with it (`app/manage/[token]/page.tsx:3684-3700`).
  5. **The operator reviews it and commits it into their real truck.** Nothing is committed without that review.
- **Not carried over:**
  - **a sample-menu demo** (`template_withheld`, on purpose: a sample is not their menu);
  - **a swept demo:** the extraction is deleted with the truck. A claimed demo is protected from the expiry sweep, so this
    only bites someone who never claimed;
  - **the demo truck itself, its orders, its settings and its kitchen numbers:** only the menu is carried.
- **Signup OFF:**
  - the banner offers **"Save my menu"** instead: an email capture (`/api/demo/save-email`) that extends the demo to 14
    days and emails a link back (`/api/demo/return`, which re-provisions on GET);
  - **no account, so nothing is carried** until someone signs up some other way.
  - The manual (V13.1) recorded the flag as not `'true'` in at least one environment. Its production value can't be read
    without the environment files, so it is **UNVERIFIED** here.
- **Outreach demos also:** signup writes the discovery row's link to the new truck (`linked` / `conflict` / `failed` on
  the session), and never deletes the new truck on a conflict.

---

## 4 · Analytics

### PostHog events for this funnel: none explicit

- **Every explicit `posthog.capture` call is on Village Foodie discovery pages:** postcode search, newsletter, share,
  calendar, directions, contact.
- **No demo step has an event:** not the CTA, the upload, the build, the success, the failure, the sample, the order,
  the loop complete, or the signup.
- **What PostHog does see:**
  - **autocapture** (clicks) and **pageviews** on the landing page and the modal, and on the customer order page
    `/trucks/<demo-slug>/order`;
  - **nothing on `/dashboard/*`, `/manage/*` or `/kds`:** `app/providers.tsx` does not start PostHog when the page is
    entered there, and `before_send` drops any event from those paths;
  - so the demo dashboard, the KDS and the Manage import are invisible.
  - `/demo/<ref>` is a server redirect, with no pageview.
- **Persistence is `memory`** (cookieless, 19 Oct): the anonymous id resets on every full page load.
  - The jump from the landing modal to the dashboard is a full load, as is opening the order page on a phone.
  - **So even the visible steps cannot be joined into one visitor's funnel.**
- **Missing:**
  - a stable funnel id per demo (e.g. the session's `truck_id`, which is not a credential);
  - events for: modal opened, menu chosen, build started, build ok / failed / sample, dashboard seen, order page opened,
    order placed, loop complete, signup started, signup done;
  - **a server-side event from `/api/demo` and `/api/orders/submit`** would measure without any browser identity.
  - Any client event on the dashboard routes must not carry the token or URL (the reason they are blocked).

### Database counts, last 30 days (read-only; §7)

| What | Count | Note |
|---|---|---|
| `demo_sessions` created and still present | **3** | 2 outreach (14 and 20 Oct), 1 landing (27 Oct); all uploads, no samples; 1 with an email saved |
| Demos deleted by the cleanup sweep | **13 expired + 3 orphans** | 720 hourly runs, 0 failed. **Swept demos take their session and orders with them**, so they can't be counted further |
| Demos with at least one visitor-placed order (`customer_email` not null) | **0 of the 3 surviving** | seeded orders: 194 (47 / 69 / 78) |
| Outreach demos opened by the prospect (`first_opened_at`) | **2 of 2** | |
| Signups from a demo (`claimed_by_operator_id`) | **0** | claimed sessions are kept by the sweep, so 0 is real for surviving claims |
| Operators created at all | **0** | no signups of any kind in 30 days |

**What this means for measuring:**
- The database can count demos only while they live: 24 h for an anonymous demo without an email.
- **Today nothing records how many anonymous demos were built in a month,** or whether a visitor ordered before the sweep.
- A small, permanent `demo_events` table (or `demo_cleanup_log` recording counts before deleting) would fix that,
  alongside the PostHog events.

---

## 5 · Risks for the redesign

- **Mobile:**
  - **today's first screen is the operator dashboard** (an h-dvh app shell with dense order cards, a header, the DEMO
    strip, then the `DemoWelcome` modal on top). On a phone, the "scan the QR" route is useless, so the link was made a
    peer of the QR (G1);
  - the kitchen screen opens in a **new tab** (`window.open … '_blank'`), which is awkward on a phone, and is forced to
    grid layout in demo;
  - **the build modal is fixed-height with a scrolling body** (the manual's fixed-height modal rule); a new full-screen
    waiting view must keep that rule on short screens;
  - **the order page's sticky stack** (header → DEMO strip → status banners → category tabs) is offset by the strip's
    **measured** height (`ResizeObserver`); a new demo screen sharing that page must keep the measurement.
- **The payment step:**
  - a demo truck has **no Stripe account**, so `card_payments_ready` is false and the order goes straight through with no
    card step; **card payment cannot be shown**;
  - showing it would need a test-mode connected account and a demo-only path through `authorize`, with real Stripe risk.
    The honest alternative is a clearly-marked "this is where your customer pays" step that charges nothing;
  - **an email is required on the order form,** and is never sent to. It is friction in a demo, but it is also how a
    visitor's order is told apart from seeded ones.
- **The demo banner:**
  - `DemoModeBanner` is the one component on all three surfaces, and it carries the signup / save button;
  - new screens must use it, not a copy (the manual records the drift that made it one component);
  - the KDS variant defaults to the `upload` wording and `isAdmin: false` (V9 backlog).
- **Expiry:**
  - an anonymous demo lives **24 h** (14 days once an email is saved); an outreach demo **30 days**;
  - `expires_at` only ever moves later;
  - the sweep runs **hourly** and deletes the truck, orders, session and stored extraction;
  - a visitor returning the next day finds `?demo=expired`;
  - **if the redesign leans on "come back later and sign up", the 24 h window is the constraint.**
- **The outreach first-open triggers:**
  - **T2 wipes and re-seeds on the prospect's first open, and T1 does so whenever the event is over.** Both call
    `restartDemoService` → `seedDemoOrders`, so "start empty" must be applied there too, or a prospect's demo arrives
    full;
  - **a restart deletes every order, visitor-placed ones included**;
  - an open KDS does not follow a restart, except for the demo-only re-point.
  - **Neither trigger may become a GET side effect** (link scanners).
  - `/api/demo/return` is still a GET that writes; it is not on the redesign's path, but don't copy its shape.
- **The browser-state flags:**
  - `hg_demo_welcome_<token>` (sessionStorage) and `hg_demo_seen_orders_<token>` (localStorage) drive the welcome and the
    "your order arrived" card, and **must go through `lib/demo-board-build.ts`**;
  - a redesign that changes what the board holds without it shows the wrong panel.
- **Security:**
  - the `demo-` prefix is a security boundary (`proxy.ts` waives the session gate for `/dashboard/demo-*`), and the
    dashboard token is the credential;
  - **taking the visitor from the order page (slug) to a kitchen screen (token) must not put the token in a public URL**
    or an analytics event;
  - `orders` is publicly readable for Realtime, which is fine for demo rows.
- **The 40–45 s wait stays:**
  - the customer order screen needs the menu, and the menu needs Gemini;
  - the build is still one blocking request with timed, not real, progress;
  - removing the seeding saves seconds, not the wait.
- **Analytics:** with no events and cookieless PostHog, the redesign can't be compared with today's flow unless the
  events and the persistent demo count are added **first**.

---

## 6 · Files read

- **Landing:** `components/landing/DemoUpload.tsx`, `components/menu/MenuUploadFields` (referenced).
- **Routes:** `app/api/demo/route.ts`, `app/api/demo/{restart,return,save-email,build-request}`,
  `app/demo/[ref]/route.ts`, `app/api/admin/provision-demo/route.ts`, `app/api/cron/demo-cleanup/route.ts`.
- **Libraries:** `lib/provision-demo.ts`, `lib/provision-demo-event.ts`, `lib/seed-demo-orders.ts`,
  `lib/demo-restart.ts`, `lib/demo-session.ts`, `lib/provision-truck.ts` (demo profile).
- **Dashboard and KDS:** `components/dashboard/DemoWelcome.tsx`, `DemoLoopComplete.tsx`,
  `components/DemoModeBanner.tsx`, `components/DemoGetStarted.tsx`, `app/dashboard/[token]/page.tsx` (demo parts),
  `app/dashboard/[token]/kds/page.tsx` (demo parts, Realtime).
- **Customer order:** `app/trucks/[slug]/order/page.tsx` (demo parts, payment gating), `app/api/orders/submit/route.ts`
  (demo exemptions).
- **Signup carry-over:** `app/api/setup/route.ts` (the claim and the extraction GET), `app/api/signup/route.ts` (the
  claim), `app/manage/[token]/page.tsx` (`?import=demo`).
- **Analytics:** `app/providers.tsx`, and every `posthog.capture` call.

## 7 · Read-only SQL that was run

```sql
select table_name, column_name, data_type from information_schema.columns where table_schema = 'public' and table_name in ('demo_sessions', 'demo_cleanup_log') order by table_name, ordinal_position;
```
```sql
select count(*) as sessions_now, count(*) filter (where created_at >= now() - interval '30 days') as created_last_30d, count(*) filter (where created_at >= now() - interval '30 days' and discovery_truck_id is not null) as outreach_last_30d, count(*) filter (where created_at >= now() - interval '30 days' and discovery_truck_id is null) as landing_last_30d, count(*) filter (where created_at >= now() - interval '30 days' and extraction_source = 'upload') as upload_last_30d, count(*) filter (where created_at >= now() - interval '30 days' and extraction_source = 'template') as template_last_30d, count(*) filter (where created_at >= now() - interval '30 days' and extraction_source is null) as no_menu_last_30d, count(*) filter (where created_at >= now() - interval '30 days' and email is not null) as email_saved_last_30d, count(*) filter (where created_at >= now() - interval '30 days' and claimed_by_operator_id is not null) as claimed_last_30d, count(*) filter (where discovery_truck_id is not null and first_opened_at is not null) as outreach_opened_ever, min(created_at) as oldest_session from public.demo_sessions;
```
The next query failed, because the column is `run_at` and there is no claimed-stale column. It was run again corrected:
```sql
select count(*) as cleanup_runs_30d, sum(expired_deleted) as expired_deleted_30d, sum(orphans_deleted) as orphans_deleted_30d, sum(claimed_stale_deleted) as claimed_stale_deleted_30d, max(ran_at) as last_run from public.demo_cleanup_log where ran_at >= now() - interval '30 days';
```
```sql
select count(*) as cleanup_runs_30d, count(*) filter (where not ok) as failed_runs_30d, sum(expired_deleted) as expired_deleted_30d, sum(orphans_deleted) as orphans_deleted_30d, max(run_at) as last_run, max(gap_mins) as max_gap_mins from public.demo_cleanup_log where run_at >= now() - interval '30 days';
```
```sql
select count(distinct o.truck_id) filter (where o.customer_email is not null) as demos_with_visitor_order, count(*) filter (where o.customer_email is not null) as visitor_orders, count(*) filter (where o.customer_email is null) as seeded_orders, count(distinct o.truck_id) as demo_trucks_with_orders from public.orders o join public.demo_sessions s on s.truck_id = o.truck_id where s.created_at >= now() - interval '30 days';
```
```sql
select s.truck_id, s.created_at, (s.discovery_truck_id is not null) as outreach, s.extraction_source, s.first_opened_at, s.expires_at, count(o.*) filter (where o.customer_email is null) as seeded, count(o.*) filter (where o.customer_email is not null) as visitor_orders from public.demo_sessions s left join public.orders o on o.truck_id = s.truck_id where s.created_at >= now() - interval '30 days' group by s.truck_id, s.created_at, s.discovery_truck_id, s.extraction_source, s.first_opened_at, s.expires_at order by s.created_at;
```
```sql
select count(*) as operators_with_claimed_demo, count(*) filter (where s.created_at >= now() - interval '30 days') as claimed_from_demos_created_30d, count(*) filter (where s.discovery_link_status is not null) as with_discovery_link_status from public.demo_sessions s where s.claimed_by_operator_id is not null;
```
```sql
select count(*) as demo_trucks_now, count(*) filter (where t.id not in (select truck_id from public.demo_sessions)) as demo_trucks_without_session from public.trucks t where t.id like 'demo-%';
```
```sql
select pubname, tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename;
```
```sql
select policyname, roles, cmd, left(qual, 160) as qual from pg_policies where schemaname = 'public' and tablename = 'orders' order by policyname;
```
```sql
select count(*) as operators_created_30d from public.operators where created_at >= now() - interval '30 days';
```
