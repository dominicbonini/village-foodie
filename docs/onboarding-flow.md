# HatchGrab — Onboarding Flow Spec

**Status:** DESIGN — not built. Written July 2026. **v2** — revised after codebase investigation.
**Scope:** Anonymous demo → signup → guided setup → go-live. Cold-start (inbound) path only; the warm/branded outreach path is a later variant (§13).
**Companion doc:** `docs/reference-manual.md` (architecture invariants — this spec must not contradict it).

> **v2 changes:** corrected the capacity model (§5), the deletion cascade (§7) and the seeded-order email problem (§6.1). Added three blockers v1 missed: the `/dashboard` proxy gate (B8), the non-visibility-gated public surfaces (B9), and the pre-trial plan problem (B10). Added a security must-fix (§9.1). Dropped one build step that turned out unnecessary (importer changes — B2 dissolved).

---

## 1. The model in one paragraph

A prospect uploads a photo of their menu on the landing page. With no other questions asked, we provision a hidden throwaway "demo truck" behind the scenes, run the existing AI menu importer against it, make sensible assumptions for every setting the import wizard would normally ask, seed a live event with realistic pre-filled orders, and drop them straight onto a working orders dashboard with a **DEMO MODE** banner. They can play indefinitely. Giving an email persists the demo for 14 days; giving nothing deletes it after 24 hours. Signing up carries their menu across to a real truck, clears all demo orders, and opens an expanded setup wizard. They are **not** on a clock and **not** publicly visible until they deliberately nominate a first event — that single act starts the free month, flips them public, and enables real orders.

**Governing principle throughout: conversion comes from removing fear, not adding pressure.**

---

## 2. Stage-by-stage flow

### Stage 0 — Landing page

Entry point is the hero CTA: **Upload my menu →**.

> ⚠️ The landing CTAs are currently **stubs** — they point at `#try`, and the button in that section is `href="#"`. The hook point exists, unwired.

### Stage 1 — Upload

- **Menu photo/PDF/text only.** Nothing else asked. Every additional field is friction on the highest-value action.
- No truck name, no email, no account.

### Stage 2 — Provisioning + load screen

On upload, behind the scenes:

1. Create a **demo truck** (hidden — §4). Generated internal name, **never shown**.
2. Create a **van** with assumed capacity (§5).
3. Create a **live event**: now → next whole hour **+2h** (17:05 → 20:00). Must be written `status: 'open'` directly — `upsert_event` hard-codes `'confirmed'`; `'open'` normally only comes from the scheduler edge function or `/api/events/action`.
4. Run the existing menu importer against the demo truck.
5. Make wizard assumptions silently (categories, prep times, batch sizes, allergen display mode).
6. Seed ~10 realistic orders (§6).

**Load screen:** simple progress framed around *their* menu — "Reading your menu… / Found your items… / Building your ordering page… / Almost ready…". Degrades gracefully if fast; never pad the wait. No feature carousel, no tips.

> ✅ **The importer needs no changes.** `truck.name` appears in one prompt line, and the heavier "existing menu" prompt block is conditional — for a fresh demo truck those queries return empty and the block is omitted automatically. Creating the truck first (as sequenced) resolves this with zero importer work.

### Stage 3 — The demo (play forever)

Lands on the **orders dashboard** with their extracted menu and the seeded orders in the queue.

**Can do:** place orders (walk-up path — see §6.1 caveat on the online path) · watch the queue, mark ready/collected · adjust stock and watch countdown · adjust kitchen capacity and watch slots respond.

**Hidden/disabled:** everything in Manage (settings, menu editing, schedule, team, billing, reports) · offline protection (meaningless in a demo) · auto-accept (a policy setting, not demo-able) · reporting.

**Persistent UI:** a **DEMO MODE** banner. The fake truck name is *never shown*.

**Also stated:** the settings are our best guesses, and signing up walks them through configuring properly. Honest (explains odd capacity) and reassuring.

> **Why no order cap:** with no reporting, no menu editing, no schedule and no public visibility, the demo is unusable as a real system. The earlier ~30-order cap is dropped as unnecessary.

### Stage 4 — Email capture (soft signup)

Optional, offered *after* the aha. Framed as **saving what they already have**: "This demo resets when you leave — pop your email in to keep it."

- Email → persists **14 days**, return link emailed, deletion date stated.
- No email → deleted after **24 hours**.

**Return via email link → re-provision:** the original event will be stale, so create a fresh event (now → next hour +2), re-seed capacity and orders. Same provisioning code path as first run.

### Stage 5 — Signup (full account)

Minimal: **email + password only.**

1. Create real operator + auth user.
2. Create real truck (hidden), `plan = 'demo'` (§3).
3. **Carry the demo menu across.** Offer re-upload; never require redoing it.
4. **Clear all demo orders** — blank slate.
5. Delete the demo truck and scaffolding.
6. Open the setup wizard.

### Stage 6 — Setup wizard (expanded)

Job: **get them from "signed up" to "safe to take a real order."** Nothing more. Every demo assumption surfaces here for confirmation.

1. **Identity** — truck name, logo (skippable), their name, contact email.
2. **Menu confirm** — pre-filled from the demo extraction.
3. **Allergens** — the existing allergen wizard.
4. **Kitchen capacity** — actively re-set (below).
5. **Schedule** — "Does your website have your schedule?" → Yes: URL, scraper takes over. No: optional photo/email upload, **or skip for later**.
6. **Done** — "You're set up. When you're ready, pick the event that starts your free month."

> ⚠️ **Kitchen capacity must be actively RE-SET, not pre-filled.** Deliberate exception to the pre-fill rule. Capacity drives the slot engine; a silently-inherited guess means promising times they can't hit — the exact failure the product prevents.

> ⚠️ **Sanity-check copy must derive from all three values** — `kitchen_capacity`, `capacity_window_mins`, `prep_secs` — never from capacity alone (§5).

**No new endpoints needed for identity:** `update_settings`' allowlist already covers `name`, `logo_storage_path`, `contact_email`, `cuisine_type`, `website`; `get_upload_url` handles the logo. Identity and menu remain two distinct commit concerns; both paths exist.

**Inclusion test:** *if this is wrong or missing, does something break or mislead a customer?*

| In the wizard | Settings (later) |
|---|---|
| Truck name | Social handles, website |
| Kitchen capacity + prep/batch | WhatsApp sender, preferred contact method |
| Menu confirm | Auto-open/close defaults |
| Allergens | Order-ready settings, pre-order rules |
| Contact email | Deals, upsells, extras |
| Logo (skippable), their name | Anything cosmetic or optional |

### Stage 7 — Pre-trial ("setup mode")

Signed up, set up, **not on the clock, not public.**

- Hidden (§4). `plan = 'demo'` — **not `'trial'`** (§3 / B10).
- Test orders freely on their real truck, including on a nominated event before it opens.
- Indicator: **"Setup mode — your free month starts when you go live."** Reassuring, not ominous. Disappears on nomination.
- No time limit. Nudges only (§8).

### Stage 8 — Nomination (go-live)

**A separate decision, not a wizard step** — a wizard step could have nothing to pick from (scraper may not have run; schedule may be skipped).

Surfaced on the dashboard/schedule once events exist: *"Ready to go live? Pick the event that starts your free month."* Mechanism: a radio/selector against each event.

**One action, four consequences:**
1. Starts the clock (`plan` → `'trial'`, sets `trial_expires_at`)
2. Flips the truck **public**
3. Enables **real** customer orders
4. Marks the reporting boundary (§12 / O2)

Therefore: **consequence-explicit labelling** ("Start my free month here — this event goes live to customers") · **a confirmation step** · **changeable before it fires**.

**Pre-orders allowed** on the nominated event once selected.

### Stage 9 — Live

Trial runs one month from the nominated event. Reports scope to the nominated event onward, so pre-trial test orders fall away naturally (§12 / O2).

---

## 3. Plan values

> ✅ **APPLIED (July 2026).** `trucks_plan_check` now allows `('starter','pro','max','trial','demo','tester')`, verified via `pg_constraint`.

**Decision: `demo` and `tester` are separate values** — so they can be reported on separately and diverge later.

**Migration applied:**

```sql
alter table trucks drop constraint trucks_plan_check;
alter table trucks add constraint trucks_plan_check
  check (plan = any (array['starter','pro','max','trial','demo','tester']));
```

> ✅ **`tester` was NOT in live use** — a live count returned only 3 trucks, all `plan='trial'`. The reference manual's claim that tester is in use is **stale**; the constraint had never been violated. No hidden hand-run statement to worry about.

**`plan = 'demo'` covers two states:** the anonymous demo truck (Stages 2–4), and the signed-up pre-trial truck (Stage 7). Both want full features, no clock. `PLAN_FEATURES.demo = TRIAL_FEATURES` already exists in code.

> 🔴 **Why pre-trial cannot be `plan='trial'`** (B10): `canAccess()` returns **false for every feature** when `plan === 'trial'` and `trial_expires_at` is null. A pre-trial truck on `'trial'` would have time-slot selection, pre-ordering, auto-accept, offline protection and batch pacing all switched off — breaking Stage 7's promise that they can test freely.

---

## 4. Visibility rules (critical)

### 4.1 Discovery gating

To appear publicly a truck needs **all** of: `truck_events.status ∈ (confirmed, open)`, `event_date >= today`, `trucks.active = true`, `trucks.excluded !== true`, `trucks[show_on_vf|show_on_hg] = true`.

**Demo + pre-trial trucks must set:**

| Column | Value | Default | Note |
|---|---|---|---|
| `show_on_vf` | `false` | false ✓ | |
| `show_on_hg` | `false` | **true ✗** | **must override** |
| `order_link_vf` | `false` | false ✓ | |
| `order_link_hg` | `false` | **true ✗** | **must override** |
| `is_customer` | `false` | false ✓ | |
| `excluded` | `true` | — | master hide |
| `active` | **`true`** | — | **required** — `/api/orders/submit` filters `.eq('active', true)`. Cannot hide via `active=false`. |

### 4.2 🔴 Discovery gating is NOT the whole public surface (B9)

Three surfaces have **no visibility gating at all**:

| Surface | Gating |
|---|---|
| `/api/menu/[truckId]` | **none** — deliberately doesn't filter on `active` |
| `/api/events?truck=slug` | **none** — resolves any truck by slug/id |
| `/api/orders/submit` | `active === true` only — does **not** check `excluded` or `show_on_*` |

**So anyone who knows or guesses the slug can load a "hidden" demo truck's menu and place a real order on it.**

Two mitigations, both required:

1. **`id`, `slug` and `dashboard_token` must be cryptographically unguessable.** A *security property of the create path*, not a cosmetic detail.
2. **Add `excluded !== true` to the truck check in `/api/orders/submit`.** One condition; closes the hole; also protects the pre-trial state. **In Phase 1.**

### 4.3 At nomination

Flip `show_on_hg` → `true`, `order_link_hg` → `true`, `excluded` → `false`. (`show_on_vf` / `order_link_vf` — see O3.)

---

## 5. Demo assumptions

> 🔴 **`kitchen_capacity` is a CONCURRENCY ceiling, not throughput** — "N counted items in production at once", measured over `capacity_window_mins`. The v1 framing ("4 mains per 5 min ≈ 48/hour") only worked because `prep_secs` happened to equal `capacity_window_mins`. Change either and the relationship breaks.

| Setting | Value | Note |
|---|---|---|
| `kitchen_capacity` | **5** | concurrency ceiling; matches Gusto, a real single-van truck |
| `capacity_window_mins` | **5** | NOT NULL DEFAULT 5, CHECK 1–20 |
| Mains category | `batch_size: 4`, `prep_secs: 300` | |
| Sides / drinks | `prep_secs: 0` | instant |
| Event window | now → next whole hour **+2h**, `status: 'open'` | |
| `allergen_display_mode` | sensible default | never blocks the demo |

> ⚠️ **Category detection:** extracted menus vary wildly (pizza van vs coffee van). The provisioner must *infer which category is the "main"* — likely highest-priced or most-populated — and treat the rest as instant. Real logic, not a trivial default.

---

## 6. Seeded orders

**~10 orders** against the demo event, so the capacity engine computes genuine occupancy and the traffic lights are true engine output.

**Target spread — busy with visible headroom:** earlier slots **full** (proof of volume) · middle slots **partial** (traffic-light system visibly working) · later slots **open** (room to grow).

> ⚠️ **Don't fill every slot red.** A full board reads as "the system blocked business," not "the system manages capacity." Weight orders toward earlier slots for a natural taper.

**Customer names:** realistic (Sarah, Dave, Priya…), not "Demo order 1." The DEMO MODE banner does the honesty work.

**Persistence:** the seeded set stays present across refresh, exactly as for a real truck.

### 🔴 6.1 Seeded orders must NOT send email

`/api/orders/submit` sends a confirmation email, and **every** dashboard status action (confirm / reject / cancel / ready) emails `order.customer_email`. Stage 3's headline activity is "mark ready/collected" — one Brevo send per click to a fake address. Hard bounces damage sender reputation, and Brevo Free is a shared 300/day cap that stops silently.

**Solution:** seed via **direct insert with `customer_email = NULL`.** Every email site is already guarded by `if (order.customer_email)`, so the problem disappears.

**Consequence:** seeding cannot go through `/api/orders/submit` (which requires `customerEmail`). The demo's *online* ordering path needs its own decision — omit it, or provide a demo-specific path not requiring a customer email (O6).

**Also:** `truck_order_email_enabled` defaults `true`, so every demo order would email the truck's own contact address. Set that flag `false` on demo trucks, or leave `contact_email` null.

---

## 7. Deletion + cleanup

| Case | Retention |
|---|---|
| No email given | **24 hours** |
| Email given | **14 days** (stated in the email) |
| Signed up | Deleted immediately; menu carried across |

Both need a scheduled cleanup job (`pg_cron` precedent exists).

### ✅ 7.1 The cascade — VERIFIED against the live DB (July 2026)

> 🔴 **`DELETE FROM trucks` WILL FAIL on its own.** `orders.truck_id → trucks` is **NO ACTION**, and `orders.event_id → truck_events` is only **SET NULL** — so order rows survive every cascade and block the parent delete with an FK violation.

**Seven tables are `NO ACTION` and must be deleted explicitly, first:**

```sql
begin;
delete from orders           where truck_id = $1;
delete from category_stock   where truck_id = $1;
delete from collection_times where truck_id = $1;
delete from item_overrides   where truck_id = $1;
delete from order_counters   where truck_id = $1;
delete from slot_capacity    where truck_id = $1;
delete from referrals        where referring_truck = $1 or referred_truck = $1;
delete from trucks           where id = $1;   -- cascades the rest
commit;
```

**Cascades automatically** (no action needed): `booking_locks`, `bundles_db`, `discount_codes_db`, `excluded_terms`, `kds_sessions`, `menu_categories`, `menu_items_db`, `menu_subcategories`, `modifier_groups`, `production_slot_usage`, `rejected_event_signatures`, `scraper_run_log`, `slot_bookings`, `truck_events`, `truck_users`, `truck_vans`, `upsell_rules`, `van_devices`, `whatsapp_logs`. Via `truck_events`: `collection_times`, `event_deals`, `event_option_stock`, `production_slot_usage`.

**SET NULL (correct — do not delete):** `discovery_trucks.hatchgrab_truck_id`, `messages.truck_id`.

> ⚠️ Postgres evaluates `NO ACTION` at end-of-statement, so *some* of those might incidentally pass if a cascade clears them first (e.g. `collection_times` also cascades via `event_id`). **Don't rely on it** — explicit deletes are deterministic. `orders` definitely requires it.

> ✅ **`upsell_events` does not exist** — absent from the live FK list, confirming `20260529_checkout_upsells.sql` was never applied. The uuid-vs-TEXT concern is moot.

---

## 8. Conversion triggers

**Ranked for this audience** (cautious operators buying a system they'll run their business on):

1. **First-event reassurance (strongest)** — "Set up free. Your month doesn't start until your first event."
2. **Save-your-setup** — invested effort worth keeping.
3. **Post-order momentum** — right after they place an order and watch it work.
4. **WhatsApp human** — "Questions? Message us, we're real people." Underused; converts hesitant buyers better than automation.
5. **Gentle reset warning** — "This demo resets when you leave."
6. **Social proof** — once Gusto's real testimonial + consent are in hand.

**Not available:** edit-intent — menu editing isn't in the demo dashboard.

**Explicitly avoid:** countdowns, artificial scarcity, escalating discounts on hesitation. A long session means they're stuck on a *fear or question* — offer help and "save and decide later."

**Pricing:** *free* framing at the signup moment; quiet Pricing link always available; value-justified price only after engagement. Lean on **"there's a free-forever plan."** Never open with the number.

**Nudges post-signup:** email + in-app, timed. **No 30-day setup deadline** — contradicts the "no rush" promise and penalises seasonal operators who set up early.

**Trial reminders:** **no persistent TRIAL MODE banner.** Banner blindness makes it ineffective, and a permanent "this will cost money" strip creates anxiety during live service, working against the habituation that converts a trial. Instead: contextual reminders in Manage/account/email (where they think about their account), never on the dashboard (where they cook). Nudge around week 2, a few days before expiry, and on expiry.

---

## 9. Blockers

| # | Blocker | Detail |
|---|---|---|
| B1 | **No app-side truck-creation path** | Zero `.from('trucks').insert(...)` anywhere. Out-of-band SQL only. |
| B2 | ~~Importer requires a truck~~ | ✅ **Dissolved** — sequencing (create truck → import) resolves it; no importer change needed. |
| B3 | **No demo state in the data model** | `plan='demo'` is TypeScript-only and **fails the DB constraint** (§3). |
| B4 | ~~No way to mark an order as practice~~ | ✅ **Dissolved for the demo** — the demo *is* its own truck. Pre-trial handled by report scoping (O2). |
| B5 | **No self-serve signup** | `/signup` doesn't exist. Both account-creation paths are admin-gated and require a pre-existing truck. |
| B6 | **Trial has no automatic start** | Set by hand in admin. Nothing ties it to an event. |
| B7 | **Preview-vs-live designed but not built** | An accepted seam, not an enforced mode. |
| **B8** | 🔴 **`/dashboard` is session-gated** | `proxy.ts` 307s any `/dashboard/*` request without a session to `/login`. **An anonymous demo visitor cannot reach the dashboard at all.** APIs are fine (token-auth); purely the page route. |
| **B9** | 🔴 **Public surfaces aren't visibility-gated** | Menu, events and order-submit are reachable by slug regardless of `excluded`/`show_on_*` (§4.2). |
| **B10** | 🔴 **Pre-trial can't be `plan='trial'`** | `canAccess()` returns false for everything when `trial_expires_at` is null (§3). |

### 9.1 🔴 SECURITY — must fix before any demo token is issued

`/api/manage` authenticates on **`dashboard_token` alone**, and `update_truck`'s allowlist includes **`plan`** and **`trial_expires_at`**.

You are about to hand a `dashboard_token` to an anonymous stranger. As it stands, a demo visitor could set their own plan to `max` and their own trial expiry.

**Fix:** remove `plan` and `trial_expires_at` from the `update_truck` allowlist (or gate them to admin/non-demo trucks) **before** the first demo token exists.

### 9.2 Softer risks

- **`commit-menu` is non-transactional** — partial inserts on failure (§10 Phase 1.7).
- **Demo trucks must have `dashboard_pin = NULL`** — `verifyToken` rejects when a pin is set and unmatched.
- The landing page **already advertises the demo**.

---

## 10. Build sequence

### Phase 1 — Foundations

**1. ✅ DONE — DB truth pass.** Findings:
- Only 3 trucks exist, all `plan='trial'`. **`tester` was never in use** — manual is stale.
- Full FK map read; **`DELETE FROM trucks` fails without 7 explicit deletes first** (§7.1).
- **`upsell_events` doesn't exist** — that migration was never applied. Concern dropped.
- **`trucks.slug` EXISTS**, nullable, with UNIQUE index `trucks_slug_key`. The stale memory saying otherwise is settled.
- `dashboard_token` has UNIQUE index `trucks_dashboard_token_key`. `trucks.id` is TEXT NOT NULL (PK).
- `trucks.whatsapp` is nullable — the DROP NOT NULL was applied.
- ⚠️ **Create path must handle unique-violation retries** on `id`, `slug` and `dashboard_token`.

**2. ✅ DONE — Plan constraint widened** to include `demo` and `tester`, verified via `pg_constraint` (§3).

**3. Security fix (§9.1)** — remove `plan` / `trial_expires_at` from the `update_truck` allowlist. **Before** any demo token exists.

**4. ✅ DECIDED — demo route: token-aware `/dashboard` exception (Option A).**
> Add a narrow exception in `proxy.ts` so `/dashboard/demo-*` bypasses the session gate, reusing the existing `/kds` precedent. Demo tokens are **self-identifying by prefix** (`demo-` + cryptographically random string) so edge middleware can pattern-match without a DB lookup.
>
> **Rationale: DRY.** The demo *is* the dashboard — one page, one codebase, so every future dashboard improvement appears in the demo automatically. Demo-mode differences (DEMO MODE banner, hidden Manage links) are conditional rendering inside the existing page. A separate `/demo/[token]` route would duplicate the dashboard and drift.
>
> ⚠️ **Security consequence:** the operator dashboard is token-authed; the session gate is an extra layer. Removing it for demo tokens means **the token alone is the security boundary** — so demo tokens must be cryptographically random after the prefix. Real operator tokens never start with `demo-`, so their protection is untouched. The exception must match `/dashboard/demo-*` only, never all of `/dashboard`.

**5. Truck-create path as a module + admin-authed route.** `lib/provision-truck.ts`, called first by an **admin-only** endpoint. **Prove it on a real onboarding** (a real truck, or a rebuild of `test-truck`) with a human watching, before an anonymous stranger drives it — prod `trucks` has constraints the code doesn't match, and that's exactly where drift bites.

**6. Order-submit gate** — add `excluded !== true` to the truck check (§4.2).

**7. `commit-menu` honesty.** Server-side signal first, then the UI.
> ⚠️ **`finally` is the wrong instrument.** `handleCommitMenu` already has try/catch and the catch recovers. The hang is specifically the `data.ok === false` branch (no `else`). A `finally` would clobber the success path's "done" screen. The fix is an **`else` branch (~5 lines)** — *but*: `ok:false` doesn't mean "nothing saved" (partial inserts already happened), nothing consumes `failed[]`, retry isn't idempotent for `modifier_groups`, and four sibling `catch { /* non-fatal */ }` swallows sit in the same block.
> **And:** the demo provisioner is server-side — it calls `commit-menu` directly and never touches `handleCommitMenu`. **Fixing the manage UI does not protect the demo path.** Both need doing; they're separate.

### Phase 2 — The demo
8. **Demo provisioning service** — one code path used by first-run, return-visit re-provisioning, *and* the template fallback (DRY).
9. **Order-seeding logic** (§6) — category inference, spread targeting, direct insert with `customer_email = NULL`.
10. **Dashboard demo mode** — DEMO MODE banner; hide Manage/reporting/offline-protection/auto-accept.
11. **Template fallback** — Pizza first, then Burgers, Curries.

### Phase 3 — Persistence + cleanup
12. **Email capture + return link.**
13. **Cleanup job** — 24h / 14d, ordered transactional delete per the verified cascade (§7.1).

### Phase 4 — Conversion
14. **Self-serve signup** (B5) — `/signup`, minimal.
15. **Demo → real-truck migration** — carry menu, clear demo orders, delete demo scaffolding.

### Phase 5 — Setup + go-live
16. **Expand the wizard** (Stage 6) — identity step, capacity re-set, schedule step.
17. **Nomination / go-live** (B6, B7) — event selector, confirmation, the four-way switch.
18. **Nudges** — email + in-app timing.

---

## 11. Extraction-failure fallback

Extraction *will* fail sometimes (bad photo, handwriting, timeout, partial commit).

**Be honest — never silently substitute a stock menu as if it were theirs.** For a trust-led product, a discovered deception is far more damaging than a visible fallback.

- Honest message: we couldn't read that menu.
- Offer a **sample truck** — **Pizza / Burgers / Curries** (build **Pizza first**).
- Offer **"try another photo."**
- Offer **"we'll build your menu for you"** — ⚠️ a promise of human work; requires capturing their email. Fine at low volume; a real obligation at scale.

Sample demos are **per-visitor clones from a fixed template menu** via the same provisioning path — not one shared demo truck (shared state would leak visitors' test orders into each other's view).

---

## 12. Open questions

| # | Question | Status |
|---|---|---|
| O1 | Signup timing — trigger-based only, or a harder nudge after a threshold? | Open |
| O2 | Pre-trial test orders on the real truck | ✅ **Resolved** — `get_report`'s event mode already scopes strictly by `event_id`, so scoping reports to the nominated event onward is nearly free: no new column, no deletion, no conflict with the `is_test` prohibition. |
| O3 | Does `show_on_vf` / `order_link_vf` flip true at nomination, or only the HG pair? | Open — separate product decision |
| O4 | Sample-template maintenance — who keeps Pizza/Burgers/Curries current? | Open |
| O5 | "We'll build your menu for you" — fulfilment process and volume ceiling? | Open |
| O6 | Does the demo include an *online* ordering path, given seeding can't use `/api/orders/submit` (§6.1)? | Open |

---

## 13. Warm path (later)

For operators whose details you already hold (name, logo, contact), the flow inverts: **pre-build a branded demo** and send a personalised link via email/WhatsApp — *"We built your ordering page — here's [Truck Name], with your menu, ready to try."*

Signup becomes **"claim it"** rather than "save it" — lower friction still. Requires the same create path (B1), seeded from known details instead of an upload. Specify separately once the cold path is built.
