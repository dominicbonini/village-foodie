# HatchGrab — Onboarding Flow Spec

**Status:** Phases 1–4 BUILT and LIVE-WALKED on preview (4 August). Phase 5 (nomination / go-live) DESIGN ONLY and **blocking launch** (§15). Written July 2026. **v8.0** — revised 3 September 2026 at launch. 🔴 **This document went untouched from 13 August to 3 September while onboarding content accumulated in the reference manual instead** — see §15C.
**Scope:** Anonymous demo → signup → guided setup → go-live. Cold-start (inbound) path only; the warm/branded outreach path is a later variant (§13).
**Companion doc:** `docs/reference-manual.md`, now **V12.0** (architecture invariants — this spec must not contradict it). 🔴 **Where the two overlap, the manual is authoritative.** This spec describes the FLOW an operator experiences and the DECISIONS behind it; the manual owns the schema facts, the invariants and the backlog. Cross-reference rather than restate — a fact recorded twice is a fact that can disagree with itself.

> **v2 changes:** corrected the capacity model (§5), the deletion cascade (§7) and the seeded-order email problem (§6.1). Added three blockers v1 missed: the `/dashboard` proxy gate (B8), the non-visibility-gated public surfaces (B9), and the pre-trial plan problem (B10). Added a security must-fix (§9.1). Dropped one build step that turned out unnecessary (importer changes — B2 dissolved).
>
> **v3 changes (post-build):** Stage 3 and Stage 4 rewritten AS BUILT — several written decisions turned out wrong in practice (hiding the selling points, hiding the QR/order link, a snoozeable save bar, blocking the KDS). Added §9.3 **build discoveries** (the expensive ones — read before touching provisioning) and §9.4 **structural gaps**. Phase 2 marked complete with as-built notes. Phase 4 expanded from four words into a spec.
>
> **v4 changes (23 July, post-Step-4 session):** Phase 4 step 4 (menu migration) BUILT — but the session's headline finding is that the previous build was **unreachable**: `demo_sessions.extraction` had no writer, so `/api/setup` GET always returned null and the `?import=demo` bootstrap silently fell through to a blank upload. Fixed, plus four related changes (§9.3 #7–#9, §9.4 G4–G6, §12 O14). ⚠️ **Everything in this batch is tsc-clean and UNVERIFIED** — no live run, nothing committed. Test order is at the end of §10 Phase 4.

> **v7.2 changes (13 August):** **Two corrections and one new blocker.** 🔴 **Mitigation 2 IS BUILT** — `/api/orders/submit` refuses `excluded === true` with a 404, so the B9 hole recorded as open is closed; and mitigation 1 does **not** apply to an operator truck, whose slug is `readable` by design, leaving `excluded` as the ONLY thing protecting a pre-trial truck. 🔴 **The admin create-truck route violated the capacity rule** until 13 August, writing `5` even when the field was cleared; it now passes an explicit `null` and the input is gone. 🔴 **NEW BLOCKER, item 5: `EMAIL_FROM_ADDRESS` is unset, so self-serve signup completes without sending the activation link** and reports success — the same shape as the payment-domain script, and the cheapest of the five to fix. Also recorded: an operator truck is created BEFORE its operator, deliberately, and promotion is a different journey from the setup wizard. Manual **V11.14**.

> **v7.1 changes (5 August):** 🔴 **THE PLAN DECISION IS RESOLVED — self-serve provisions `trial`, not `demo`, and a NULL `trial_expires_at` now means THE TRIAL HAS NOT STARTED.** `canAccess()` previously denied **every** feature on a NULL expiry, which is the entire reason §3 / B10 ruled `'trial'` out for a pre-trial truck; that reason no longer exists and B10 is **CLOSED**. The DEMO provisioning profile still writes `demo` — a prospect sandbox is not a signup. 🔴 **What this does NOT resolve: nomination still does not exist, so a self-serve trial cannot be STARTED; and what happens at EXPIRY is undecided.** Both are in §15. Also settled: the Billing Trial column now shows until the trial **ends** rather than only while it runs, and two investigations closed clean — the deals three-layer model and upsells-live-on-save were both found **sound as designed** (§15B). No new build in this session; the flow an operator walks is unchanged from v7. Manual **V11.1** §4, §13, §27, §35.

> **v7 changes (3–4 August):** The signup chain and setup wizard were walked end to end on preview and largely rebuilt around what that exposed. **The wizard now has a beginning and an end** — a welcome screen before the menu step, a settings review after the schedule step, and a walkthrough offer on the done screen (§15A). **Route A of the schedule step now IMPORTS as well as enrolling** — it opens the same editable event modal Settings uses, rather than a read-only count that wrote nothing (its previous behaviour is recorded in `docs/schedule-verify-report.md`). **Two operator emails** were built (verification at signup, welcome on confirmation) and neither carries a dashboard token. 🔴 **One silent food-safety defect found and fixed:** a hardcoded literal in `makeGroupingRow` unverified every grouped dish's allergens — 24 standalone items committed verified, exactly the 5 grouped parents did not. 🔴 **Eleven open questions closed, four corrections made** (§12), and **three things now block launch** (§15). ⚠️ **O11 was recorded as open while the verification system was already built and shipping** — see its entry.

> **v6 changes (27–28 July):** The demo event **roll is deleted**; an elapsed demo now ENDS and offers "Start a new service" (§10 Phase 2E). Seeded order count **scales with window length**, which also fixes the stride collapse (§9.3 #14). Signup copy centralised into one variant-keyed object with deliberate upload/sample divergence (§10 Phase 4D). `/api/dashboard` now serves a `demo` block, retiring the `?welcome=sample` param entirely; `canSetup` is admin-aware, so the signup path can be walked on production without opening signup publicly. Landing page promotes Android to available alongside iPad. 🔴 **Two live-schema findings:** `demo_sessions.extraction_source` existed in production with no migration (now written); and **kitchen ticket printing does not exist on any platform** while the compare table advertises it (§12 O18).

> **v5 changes (24 July — the day the chain first worked):** 🎉 **Verification step 10 PASSED, walked end to end**: demo → save my menu → two-step signup wizard → the `now + 10` seeded floor, fresh-seed order scatter, and the window rule. Signup moved INTO the demo modal (§10 Phase 4); /setup's identity step is now bypassed; the import wizard is setup-aware (§10 Phase 4A); a schedule step was added after the menu commit (§10 Phase 4B). 🔴 **Two findings that outrank the UI work: the free month is not wired to anything (§12 O15), and /api/demo had NO maxDuration until today (§9.3 #10) — meaning the demo has never worked in production.** ⚠️ Still nothing committed; ~60+ paths across five days.

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
3. Create a **live event**: start = now floored to the nearest **half hour** (:00 or :30), end = start **+3h**, clamped to `23:59` if it would reach 24:00. Must be written `status: 'open'` directly with `opened_at` set — `upsert_event` hard-codes `'confirmed'`; `'open'` normally only comes from the scheduler edge function or `/api/events/action`.

> 🔴 **CORRECTION TO v3 — the window is now FIXED-LENGTH.** v3 specified "now → next whole hour +2h", which the code implemented as `start = h:(m − m%5)`, `end = (h+3):00`. Because the end snapped to a whole hour while the start kept its floored minute, real windows were **variable (2h05–3h00)**. A live demo was observed at 21:35–23:45: a 2h10 window rolled forward from a ~20:50 provision. Both the initial window and the roll now derive from the same `demoEventWindow()`, so an odd length cannot propagate.

> ⚠️ **The midnight clamp is LOAD-BEARING — do not remove it.** See §12 / O14. A genuinely cross-midnight window is an engine change, not a demo change.
4. Run the existing menu importer against the demo truck.
5. Make wizard assumptions silently (categories, prep times, batch sizes, allergen display mode).
6. Seed ~10 realistic orders (§6).

**Load screen:** simple progress framed around *their* menu — "Reading your menu… / Found your items… / Building your ordering page… / Almost ready…". Degrades gracefully if fast; never pad the wait. No feature carousel, no tips.

> ✅ **The importer needs no changes.** `truck.name` appears in one prompt line, and the heavier "existing menu" prompt block is conditional — for a fresh demo truck those queries return empty and the block is omitted automatically. Creating the truck first (as sequenced) resolves this with zero importer work.

### Stage 3 — The demo (play forever) ✅ BUILT

Lands on the **orders dashboard** with their extracted menu and the seeded orders in the queue.

**Can do:** place orders — BOTH the walk-up path and the real customer path (order page → dashboard → kitchen screen) · watch the queue, mark ready/collected · adjust stock and watch the countdown · adjust kitchen capacity and watch slots respond · open the kitchen screen.

> 🔴 **CORRECTION TO v2 — the QR code and order link are AVAILABLE in demo, not hidden.** v2 hid them on the reasoning that they expose the public order URL of a deliberately hidden truck. That was backwards: **opening your own order page, placing an order and watching it land is the demo's whole loop**, and it's the single most convincing thing a prospect can do. It is safe because a demo slug is 130-bit random and absent from both discovery feeds. The QR renders the branded composite with **"Your logo here"** where a logo would sit — it shows the branded-QR feature working and hints at what signing up adds, without faking a logo they haven't given us.

> 🔴 **CORRECTION TO v2 — the KDS is DEMO-MODED, not blocked.** `/dashboard/demo-*/kds` matches the proxy exception, so blocking the link never blocked the route. Demo-moding it was both safer and better: banner, config hidden (`+30 min`, `⋯`, "This device"), defaults to Window + Grid, and a one-time intro explaining what a kitchen screen is for.

**Settings tab — GREY OUT, don't hide.** v2 hid everything. Wrong: hiding a feature sells nothing, and a prospect can't want what they can't see.

| Card | Demo state |
|---|---|
| Auto-accept (+ notes-review) | ✅ **LIVE and interactive, default ON** — it genuinely works, and toggling it then placing a test order is convincing. Set at provision (`profile.autoAccept`). |
| Offline protection | 🔒 shown, greyed, forced OFF |
| Order-ready notifications | 🔒 shown, greyed, shows OFF |
| Kitchen capacity | ✅ live (Total-capacity row shows `∞` — see §5) |
| Sounds | 🚫 hidden — the model is moving to per-device, so it would advertise a control that won't exist where they'd look for it |
| Printing · Notifications | 🚫 hidden — device/hardware config a prospect has nothing to point at |

Locked controls carry a **"Not available in demo" chip beside the card TITLE** (not under the toggle): the reader meets the constraint while still working out what the thing is. Every locked control is enforced in its handler as well as `disabled` — styling is not enforcement.

**Hidden entirely:** everything in Manage (settings, menu editing, schedule, team, billing, reports) · the truck name (a generated internal id) · the event date · Event actions · the profile menu on desktop (it opened empty) · Sign out.

**Persistent UI:** a **DEMO MODE** banner on all three surfaces from one shared component, carrying the permanent signup CTA (Stage 4). The fake truck name is *never shown*.

> **Why no order cap:** with no reporting, no menu editing, no schedule and no public visibility, the demo is unusable as a real system. The earlier ~30-order cap is dropped as unnecessary.

### Stage 4 — Email capture ✅ BUILT (as a permanent CTA, not a save bar)

- Email → persists **14 days**, return link emailed, deletion date stated.
- No email → deleted after **24 hours**.
- **Return via email link → re-provision:** the original event will be stale, so `/api/demo/return` re-provisions (fresh event, capacity, seeded board) before redirecting. Same code path as first run, via `existingTruckId`.

> 🔴 **CORRECTION TO v2 — the timed, snoozeable save bar was REPLACED by a permanent CTA in the DEMO MODE banner.** v2 specified a bar appearing after 90s with a "No thanks" dismissal. Two things were wrong with it: (1) **it was the ONLY forward action anywhere in the demo** — no signup CTA exists on the dashboard, KDS, user menu or welcome popup, and Manage/Admin/Sign-out are hidden — so dismissing it left a visitor with a demo they could play with forever and never convert from; (2) **time is the wrong trigger** for a permanent prompt. The banner CTA ("Get started" → the same `/api/demo/save-email`) is always visible and cannot be dismissed, but it is one button in a thin strip rather than a strip demanding an answer — a LOWER-pressure ask than the thing it replaced.

**What "Get started" actually does, and why that's honest.** Self-serve signup does not exist yet (Phase 4 / B5 — account creation is admin-gated). So it opens the email capture: keeps the demo 14 days, emails a link back, and puts the address where a human can follow up. The copy promises exactly that — *"we'll be in touch to get you set up"* — which is literally the current process. Deliberately NOT a link to a `/signup` route: one that 404s or lands on an admin-gated page costs more trust than no CTA at all. `components/DemoGetStarted.tsx` is the single place to re-point when Phase 4 lands.

**Plus a behaviour-triggered prompt at the aha** (§8).

### Stage 5 — Signup (full account) 📐 SPEC — full detail in §10 Phase 4

Minimal: **email + password only.**

1. Create real operator + auth user.
2. Create real truck (hidden), **`plan = 'trial'`** with `trial_expires_at` NULL (§3 — CORRECTED v7.1; was `'demo'`).
3. **Carry the demo menu across.** Offer re-upload; never require redoing it.
4. **Clear all demo orders** — blank slate.
5. Delete the demo truck and scaffolding — **copy-then-delete, never promote** (the `demo-` prefix is a proxy security boundary; see Phase 4).
6. Open the setup wizard.

> Seven decisions this stage still needs are open — O7–O13 (§12).

### Stage 6 — Setup wizard (expanded)

Job: **get them from "signed up" to "safe to take a real order."** Nothing more. Every demo assumption surfaces here for confirmation.

> 🔴 **THIS SIX-STEP LIST IS THE ORIGINAL SPEC. What was BUILT is nine screens — see §15A**, which is the authoritative description of what an operator walks. The list below is kept because the *inclusion reasoning* underneath it (the table, the capacity rule) still governs; the sequence itself has been superseded. **Updated v7.1 to name where each spec step landed**, so the two do not read as two different products.

| # | Spec step | As built (§15A) |
|---|---|---|
| 1 | **Identity** — truck name, logo (skippable), their name, contact email | **Moved EARLIER, out of the wizard** — collected in the signup modal, because the truck cannot exist before it has a name (O10). The wizard opens on a truck that is already named. |
| 2 | **Menu confirm** — pre-filled from the demo extraction | **Screens 2–4** — the demo offer, the editable review, and the extras/grouping pass |
| 3 | **Allergens** | **Screen 5**, structure first then a confirmation table |
| 4 | **Kitchen capacity** — actively re-set | **Screen 6**, and it is the one atomic commit |
| 5 | **Schedule** | **Screen 7 — and it now IMPORTS as well as enrolling** (see below) |
| — | *(not in the original spec)* | 🔴 **Screen 8 — a settings review**, four rows read live before Done |
| 6 | **Done** | **Screen 9**, plus the walkthrough offer |
| — | *(not in the original spec)* | **Screen 1 — a welcome screen**, shown alone before the menu step |

> ✅ **The schedule step changed shape (v7, recorded here at v7.1).** The original *"Yes: URL, scraper takes over"* understated it and, as built the first time, overstated it — the events it found were held in component state and **never written**. Route A now opens the **same editable event modal Settings uses**, so the dates are corrected and saved, **and** the URL is enrolled for the scraper. One modal, one save path. The other two routes are a photo/text import and *"I'll add dates later"* — a real answer, not a skip. §12 / O16.

> ✅ **A settings review screen now sits before Done**, which the original spec did not have at all. Four rows, each reading its **live** value and writing through the same endpoint Settings uses, with every label and help string coming from one shared constant that Manage → Settings also reads. Nothing on it is mandatory. §15A step 8.

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

- Hidden (§4). **`plan = 'trial'` with `trial_expires_at` NULL** (§3 — CORRECTED v7.1; was `'demo'`, per the now-closed B10). NULL means *not started*, so the full feature set is on and no clock is running — the same operator experience as before, on a plan value nomination can act on.
- Test orders freely on their real truck, including on a nominated event before it opens.
- Indicator: **"Setup mode — your free month starts when you go live."** Reassuring, not ominous. Disappears on nomination.
- No time limit. Nudges only (§8).

### Stage 8 — Nomination (go-live)

**A separate decision, not a wizard step** — a wizard step could have nothing to pick from (scraper may not have run; schedule may be skipped).

Surfaced on the dashboard/schedule once events exist: *"Ready to go live? Pick the event that starts your free month."* Mechanism: a radio/selector against each event.

**One action, four consequences:**
1. Starts the clock — **sets `trial_expires_at`. The `plan` value is ALREADY `'trial'`** (§3, corrected v7.1); nomination now writes one column, not two.
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

### 🔴 RESOLVED (v7.1, 5 August) — self-serve provisions `trial`

> **SUPERSEDES the two paragraphs below, which are retained because the reasoning still matters.** `lib/provision-truck.ts` carries two profiles and only the operator one changed: **operator → `trial`**, **demo → `demo`** (unchanged). The plan value a self-serve signup lands on is now the same one it will still be holding when nomination eventually stamps a date. Manual **V11.1 §4, §13** is authoritative on the mechanism; this section records the flow decision.

**A NULL `trial_expires_at` now means THE TRIAL HAS NOT STARTED**, and grants the full trial feature set. There are three states, not two — not started (NULL), running (future date), expired (past date) — and only the last denies anything. **The expired branch is unchanged.**

> **Why `demo` stopped being the right answer.** It was never wrong about *access*: `PLAN_FEATURES.demo` is the trial set either way, so the operator saw the same product before and after. It was wrong about *meaning* — a sandbox plan that nothing will ever expire, worn by a real operator, is the product being given away with no value that nomination could later act on. **The distinction is the point: a prospect demo is not a signup.** The sandbox keeps `demo` and keeps never expiring, which is correct for a sales surface with nobody behind it.

> ⚠️ **What this does NOT fix.** A NULL expiry granting everything indefinitely is still exactly what a self-serve operator has, because **nomination does not exist** — see §15. The change makes the eventual fix a nomination screen rather than a nomination screen plus a plan migration. It does not shorten the list of what blocks launch.

---

*(Retained for the reasoning — both were true when written.)*

**`plan = 'demo'` covered two states:** the anonymous demo truck (Stages 2–4), and the signed-up pre-trial truck (Stage 7). Both want full features, no clock. `PLAN_FEATURES.demo = TRIAL_FEATURES` already exists in code. ⚠️ **The second of those two states is now `trial`** — see above.

> 🔴 **Why pre-trial could not be `plan='trial'`** (B10) — **CLOSED v7.1.** `canAccess()` returned **false for every feature** when `plan === 'trial'` and `trial_expires_at` was null. A pre-trial truck on `'trial'` would have had time-slot selection, pre-ordering, auto-accept, offline protection and batch pacing all switched off — breaking Stage 7's promise that they can test freely. **The observation was correct and the blocker was real.** It was closed by changing `canAccess`, not by working around it: NULL now grants rather than denies. ⚠️ **Do not re-derive B10 from an old reading of `lib/features.ts`** — the deployed function denied on NULL for longer than the repo did, which cost a full diagnostic session (manual V11.1 §35).

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
| `excluded` | `true` | — | master hide — **and the order gate** |
| `active` | **`true`** | — | **required** — `/api/orders/submit` filters `.eq('active', true)`. Cannot hide via `active=false`. |

### 4.2 🔴 Discovery gating is NOT the whole public surface (B9)

Three surfaces have **no visibility gating at all**:

| Surface | Gating |
|---|---|
| `/api/menu/[truckId]` | **none** — deliberately doesn't filter on `active` |
| `/api/events?truck=slug` | **none** — resolves any truck by slug/id |
| `/api/orders/submit` | ~~`active === true` only — does **not** check `excluded` or `show_on_*`~~ **CORRECTED v7.2: `active === true` in the lookup, then `excluded !== true` fourteen lines below it — see 4.2. `show_on_*` is still not checked and governs the MAP only.** |

**So anyone who knows or guesses the slug can load a "hidden" demo truck's menu and place a real order on it.**

**Mitigation 2 IS BUILT (verified 13 August 2026).** `/api/orders/submit` refuses `excluded === true`
with a **404**, checked fourteen lines below the truck lookup — deliberately outside both queries so one
condition covers the slug and the id path. It sits **above all event, menu, stock and payment logic**,
and the 404 is intentionally identical to an unknown truck: a hidden truck should not confirm its own
existence. The only exemption is an id carrying the `demo-` prefix, because ordering on a demo IS the
demo.

⚠️ **Mitigation 1 does not apply to an operator truck, by design.** The unguessability requirement was
written for demo trucks, whose provisioning identity is `random`. The **operator** identity is
`readable` — the slug is the printed QR URL and must be. So a pre-trial operator truck has a guessable
slug, and mitigation 2 is the ONLY thing protecting it.

🔴 **Therefore: `excluded` is load-bearing, not cosmetic.** A pre-trial truck is protected by exactly
one condition. Do not weaken it, and do not clear it as a matter of routine — clearing `excluded` is
what OPENS a truck for real orders.

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
| Event window | start = now floored to nearest **half hour**; end = start **+3h**; clamped to `23:59`; `status: 'open'` + `opened_at` | Fixed length (was variable 2h05–3h00). Clamp is load-bearing — §12 / O14 |
| `allergen_display_mode` | sensible default | never blocks the demo |

> ⚠️ **Category detection:** extracted menus vary wildly (pizza van vs coffee van). The provisioner must *infer which category is the "main"* — likely highest-priced or most-populated — and treat the rest as instant. Real logic, not a trivial default.

---

## 6. Seeded orders ✅ BUILT (`lib/seed-demo-orders.ts`)

> 🔴 **CORRECTION TO v2 — 37 orders, not ~10.** ~10 across a 2-hour window reads as a *quiet* truck, which sells nothing. 37 is deliberately not a round number: 40 looks chosen, 37 looks counted. It's a plausible lunch service for a single-van truck and it makes the board look like a business.

**Shapes, not random lines.** A 12-shape cycle (solo main · main+side · two mains sharing · main+drink+side · sides only …) produces **14 mains across 31 lines** with realistic order sizes, and every seeded order has a UK-plausible customer name and a **collection code**. Modifier choices are made by a deterministic `pickIdx(seed, groupIdx, len)` so the same demo always rebuilds identically — and the CHOSEN OPTION IS STORED AND DISPLAYED, so a board of "Burger ×1" doesn't render where a real board would show "Burger ×1 · Medium · No onion".

**Budget-packed against the real engine, never breaching it.** Placement walks slots with a running per-slot main count and a `FILL_PATTERN` that weights earlier slots. Simulated result: **37/37 placed, peak 4 mains in any slot = exactly the category ceiling, never over**, giving 6 FULL / 10 PARTIAL / 8–19 EMPTY slots — full at the front, amber in the middle, headroom at the back, all of it genuine engine output rather than painted-on colour.

**First collection is now-aware** — `max(start + 10, now + 10)` rounded up to the 5-min grid. `demoEventWindow` floors the start to the nearest half hour, so the start can be up to 29 min in the past, and the front-weighted `FILL_PATTERN` puts the *fullest* budgets in exactly those elapsed slots — so a prospect's first impression would be a block of orders that are already late. `now` is passed in rather than read inside the seeder, so it stays deterministic and testable.

**The seeder has no other clock awareness and no hardcoded window length** — slots derive from start/end, and `FILL_PATTERN` is a 10-element ratio strided across whatever `slots.length` is. A 3h window simply yields more slots (~35 at 5-min grid); the full-front / amber-middle / headroom-back shape survives. On a window too short to hold 37 orders under the category ceiling it places **fewer** — it never breaches the ceiling.

**`unit_price` includes modifiers**, matching what the real order paths store — checked against `/api/orders/submit`, not assumed.

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

### 🔴 7.2 `demo_sessions.truck_id → trucks` is ON DELETE CASCADE (verified against the live schema this session)

**Deleting a demo truck destroys its session row and the stored extraction with it.** Two consequences:

1. **The cleanup sweep could delete a converting operator's menu source.** The expiry query filtered only on `expires_at < now()` — no exclusion for `claimed_by_operator_id`, and `retired_at` has no writer anywhere. An operator signing up at hour 23 of a 24h demo and taking an hour over the identity step would have their demo swept mid-wizard, the extraction cascaded away, and `/api/setup` would return null — landing them on a **blank upload with no error**, menu unrecoverable. **FIXED:** the expiry sweep now excludes claimed sessions, plus a second sweep for claimed-but-abandoned at **30 days past `created_at`** (a claim is paying intent; a demo is a few rows; growth stays bounded).

2. **Demo-truck retirement must not fire until the menu is committed.** §10 Phase 4 specifies copy-then-delete. Because the session cascades with the truck, deleting the demo truck destroys the retry source — a partial copy would leave nothing to retry from. Delete only after a verified copy.

> `retired_at` still has **no writer**. If it is the right mechanism for retirement, that is its own diff.

---

## 8. Conversion triggers

**Ranked for this audience** (cautious operators buying a system they'll run their business on):

1. **First-event reassurance (strongest)** — "Set up free. Your month doesn't start until your first event."
2. **Save-your-setup** — invested effort worth keeping.
3. **Post-order momentum** — right after they place an order and watch it work. ✅ **BUILT as the loop-completion prompt** (`components/dashboard/DemoLoopComplete.tsx`): fires when an order key appears that wasn't in a *persisted baseline* captured on first load — so it survives remounts, tab switches and reloads, and never mistakes the seeded orders for the visitor's own. Renders as a **card at the top of the board, not a modal** — they've just come back to watch the order land, so a modal would block the exact thing they came to see, and reads as being pounced on. "Not yet" **snoozes 10 minutes; it never dismisses permanently.**
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
| **B10** | ~~Pre-trial can't be `plan='trial'`~~ | ✅ **CLOSED (v7.1, 5 August)** — `canAccess()` **returned** false for everything when `trial_expires_at` was null. It no longer does: NULL now reads as *the trial has not started* and grants the trial set. Closed by changing the gate, not by routing around it. Self-serve provisions `trial` (§3). |

### 9.1 ✅ RESOLVED — SECURITY (was: must fix before any demo token is issued)

`/api/manage` authenticates on **`dashboard_token` alone**, and `update_truck`'s allowlist includes **`plan`** and **`trial_expires_at`**.

You are about to hand a `dashboard_token` to an anonymous stranger. As it stands, a demo visitor could set their own plan to `max` and their own trial expiry.

**Fixed (July 2026):** `plan`, `trial_expires_at` **and `feature_overrides`** removed from the `update_truck` allowlist. `feature_overrides` was the one v2 missed and the worst of the three — it grants individual features directly, so a token holder could hand themselves the product without touching `plan` at all.

> **Generalise it:** with token-only auth, *anything an admin would use to grant entitlement must not be in a token-authenticated allowlist.* Re-check the allowlist whenever a new entitlement column is added.

### 9.2 Softer risks

- **`commit-menu` is non-transactional** — partial inserts on failure (§10 Phase 1.7).
- **Demo trucks must have `dashboard_pin = NULL`** — `verifyToken` rejects when a pin is set and unmatched.
- The landing page **already advertises the demo**.

### 9.3 🔴 Build discoveries — read this before touching provisioning

Thirteen things that cost real time across Phase 2 and Phase 4. They are recorded because each one was *reasoned about wrongly first*.

**1. Only the LIVE SCHEMA tells you what a column requires — third strike.**
`truck_events.venue_name` is **NOT NULL with NO DEFAULT**. Provisioning omitted it, on the reasoning that "omit and let the default apply" — which had worked for `trucks.whatsapp`. It failed with `23502` on every single demo build.

> **The rule, stated properly:** omitting a column only helps when that column **HAS A DEFAULT**. NOT NULL + no default fails *identically* whether you pass `null` or omit the key. There is no way to tell these apart from the TypeScript types, the codebase, or any other insert site — `information_schema.columns` (`is_nullable`, `column_default`) is the only authority.

This is the **third variant of the same family** in this codebase, after *"recorded-as-applied ≠ applied"* (the §65 RPC that was never run) and *"verify columns before trusting applied"* (the allergen card columns). Same lesson each time: **a belief about the database is not a fact about the database.** The general form is that anything derived from docs, memory, types or neighbouring code is a *hypothesis*; a query against the live schema, or a behavioural write test, is *evidence*.

Method that finally settled it: `scripts/diag-demo-event.mjs` — bisecting insert + per-column nullability probe, self-cleaning. It also proved `town`/`postcode`/`address`/`latitude`/`longitude` ARE genuinely nullable, which stopped the next round of guessing. **Write the probe; don't reason harder.**

**2. Occupancy must be rebuilt a SECOND time, after seeding.**
Provisioning rebuilds occupancy when the event is created (empty board). Seeding then inserts orders directly, bypassing the order API — which is what does the rebuild on the real path. Without a second explicit rebuild the board shows 37 orders sitting on an all-green slot map: the single most damaging possible first impression, because the capacity engine is the thing being demonstrated.

**3. `increment_event_order_counter` collides across demos.**
Order numbers come from a shared counter keyed by event. Seeding 37 orders per demo through it serialises unrelated visitors against each other. The seeder allocates its own contiguous block instead, and sets the counter past it so a *visitor's* first real order continues the sequence naturally.

**4. `auto_close: false` on demo events — non-obvious and load-bearing.**
Auto-close would silently end the demo mid-session for anyone still playing after the window. The demo event must sit `status: 'open'` **with `opened_at` set** (not `'confirmed'`, which is what `upsert_event` hard-codes) and with **both** `auto_open` and `auto_close` off. A demo that closes itself is indistinguishable from a demo that broke.

**5. `kitchen_capacity: null` means UNLIMITED, and that's what demos want.**
Null is not "unset, apply a default" — it removes the *global concurrency veto* while **per-category `batch_size`/`prep_secs` still drive red/amber**. So the board still shows a working traffic-light system, without a truck-wide ceiling nobody chose throttling a menu we inferred. The Total-capacity row correspondingly renders `∞`. `provisionTruck` distinguishes an omitted `kitchen_capacity` (→ default 5) from an explicit `null` via `'kitchen_capacity' in vanOpts` — passing `undefined` would NOT have worked.

**6. Demo customer URLs must use `window.location.origin`, not `NEXT_PUBLIC_HATCHGRAB_URL`.**
The env var points at production, so on localhost the demo handed out a link to a truck that doesn't exist there — the demo's central action, broken, in the exact environment it's developed in. Real trucks still use the env var (they want the canonical branded domain); demo uses the origin it's actually being viewed from.

**7. A column with a read, a route and a UI — and no writer.**
`demo_sessions.extraction` was declared, read by `/api/setup` GET, and consumed by the `?import=demo` bootstrap in Manage. Nothing ever wrote it. `lib/provision-demo.ts` held the extraction as a local, passed it to `commitExtraction`, and discarded it. So the entire signup menu migration silently fell through to a blank upload — and because the GET returned `{ok:true, extraction:null}` identically for "no claim", "no extraction" and "no row", **nothing anywhere said so**.

> **The lesson, stated properly:** a feature can be "built" at every layer except the one that populates it, and still read as working in a build report. The diagnostic caught it as recorded-as-applied ≠ applied: **wiring is not data flow.** For anything that persists, verify the WRITE separately from the read.

**8. Store the RAW extraction, never the demo-patched shape.**
`commitExtraction` applies an inline patch forcing `isRequired`/`singleSelect` on `_inferredFromVariants` groups, and `computeRegroupCandidates` never runs on the demo path (G1). Persisting the *patched* items would carry both divergences onto a real operator truck. Persisting the **raw `extractMenu()` output** means the signup path re-enters the wizard's own `withImpUids(ungroupAiVariantsForReview(autoSplitConflicts(...)))` → `makeGroupingRow` pipeline, so **the wizard makes the grouping decisions and G1 stops at the demo's display.** Verified safe: `commitExtraction` builds a new array via `.map` + spread and does not mutate its input, so the raw is intact at the write point.

> **Consequence to be honest about:** the menu a prospect played with in the demo is *not shape-identical* to what they see at signup (regroup candidates become groupable; inferred variant groups become required). Better, not worse — but never claim "your menu came across exactly."

**9. The roll fires on every dashboard poll, and used to preserve the old duration.**
`rollDemoEventIfStale` runs on **every `/api/dashboard` GET** for a demo truck (load and poll), triggering once `now > end_time`. It re-anchors the start and shifts every seeded order's slot by the delta. It previously **preserved the previous window's length** — that is how one demo's variable 2h10 window propagated indefinitely. It now re-derives from `demoEventWindow()`. It remains an **in-place UPDATE** (not delete+insert); `provisionDemoEvent(replaceExisting)` is the delete+insert path, used by `/api/demo/return`.

**10. 🔴 The demo has never worked in production — no `maxDuration`, ever.**
`/api/demo` blocks for the entire provision (Gemini + ~85 Supabase round trips + event + seeding) and carried **no `maxDuration`** at all: no route segment export, and `vercel.json`'s `functions` block covers only `verify-schedule-url`. So it inherited the platform default of ~10–15s against a 40–45s workload. Every demo run to date has failed the same way: the function would be killed mid-flight, the visitor would get a **504 rather than the honest-failure screen**, and a partially-built demo truck would be orphaned with no clean failure path.
Now set explicitly to `300` (Vercel Pro confirmed; Pro's Node ceiling is 300s). On Hobby the hard cap is 60s and a higher value is silently ignored — an 80s provision cannot run there at any setting, and the route would need an async job+poll shape instead.

> **The lesson:** an inherited platform default is an unstated dependency. A route that blocks for tens of seconds must declare its own ceiling; "it works locally" says nothing about whether the platform will let it finish.

**11. A 25-second timeout on a 20–30 second call is not a timeout, it is a truncation.**
The Gemini timeout added this morning was set to 25s per attempt × 3 attempts + backoff = 78s. It fired on a real upload: `AbortError` on all three attempts, 80s total, demo failed with "Menu extraction produced nothing". Gemini is the long pole at roughly 18–30s of a 40–45s provision, so 25s sat **inside the normal range** — it was policing slowness, not catching a hang. Two corrections follow: the bound must sit well clear of normal latency, and **an abort must not be retried** (a slow call will be slow again; retrying multiplies the wait to reach the same failure screen). Retry on 429/503 only.

> Diagnosis cost a round trip because all three of extraction-aborted, zero-items-returned and commit-inserted-nothing collapse into one error string, with the distinguishing detail sitting **unread in `warnings[]`**. Logging `warnings[]` server-side on the failure branch is two lines and pays for itself the next time.

**12. A `position: fixed` overlay inside a transformed ancestor is silently mispositioned.**
`DemoGetStarted`'s modal was `fixed inset-0` rendered inline inside `DemoModeBanner`'s action slot, which carries `-translate-y-1/2`. A CSS transform makes that element the **containing block for fixed descendants**, so `inset-0` resolved to a button box at the right edge instead of the viewport. No error, no exception, no console warning — it presented as "a text bar mostly hidden behind the screen."
Fixed by portalling to `document.body`, matching `DemoUpload`'s existing SSR-guarded `createPortal` — the precedent already existed in the codebase for exactly this reason.

> **Wider than the instance:** containing blocks are also created by `filter`, `backdrop-filter`, `perspective`, `will-change` and `contain: paint`, and by any Tailwind `scale-` / `rotate-` / `translate-` on ANY ancestor. The grep that cleared this one looked only for the transform-wrapping-`{action}` pattern, so the class is not cleared — only this instance. **Durable fix: portal every `fixed inset-0` overlay by default**, so a future transform on an ancestor cannot silently break one. On the backlog.

**13. The scheduler's prior-day sweep ignores `auto_close`.**
All three of 23 July's demo events were `status: 'closed'` with `auto_close: false` — systematic, not manual clicks. The scheduler's filter returns `true` for any prior-day open event **before `auto_close` is ever read**; `auto_close` gates only the same-day branch. So `auto_close: false` does not protect a demo overnight, contrary to the provisioner's comment.
`rollDemoEventIfStale` now heals it on read (see §9.4 G7), but the scheduler will keep re-closing demos nightly until it either excludes `demo-` trucks from the prior-day sweep or honours `auto_close` there. Treating the symptom, knowingly.
*(⚠️ 28 July: `rollDemoEventIfStale` is DELETED — see #15. The nightly re-closure is now healed by "Start a new service" (§10 Phase 2E) instead, which is a visitor action rather than an automatic one. The underlying scheduler defect is unchanged and still open.)*

**14. The seeded board's gaps came from the STRIDE, not from `FILL_PATTERN`'s zeros.**
`stride = slots.length / budgets.length`. The budget count capped near 16 regardless of window, so once a window fell to ≤~16 bookable slots the stride hit **1**, every slot got a budget, and the taper flattened into a solid block. A **threshold effect, not gradual degradation** — and the reason late-night demos looked broken while midday ones looked right.
`FILL_PATTERN`'s zeros are filtered out at `:222` *before* the stride is computed, so the comment claiming "the zeros are what leave gaps" described an intent the code never implemented.
**Fixed by scaling the order target to bookable slots** (`ORDERS_PER_SLOT ≈ 1.057`), which scales the budget count with it and keeps stride > 1 at every window size: 35 slots → 37 orders, stride 2.19; 5 slots → 5 orders, stride 2.50. Before the fix, a 5-slot window placed 14 of 37 and **silently dropped 23**.

**15. The roll's healing was worse than the illness.**
`rollDemoEventIfStale` shifted an elapsed demo forward on every dashboard load. Three faults, all confirmed against live data:
- It wrote order slots **directly, bypassing the seeder**, and clamped overshoots with `Math.min(shifted, newEnd)` — **15 orders landed on `23:59`**, breaching the per-slot mains ceiling the seeder guarantees.
- It preserved the old distribution, so a compressed board rolled forward compressed **forever**.
- It shifted the **visitor's own test order** too: one placed at 23:40 reappeared at 09:45 the next morning, indistinguishable from a seeded one.
Deleted entirely (218 lines). An elapsed demo now ends and offers a restart.

**16. 🔴 A hand-applied column looks identical to a working migration — until a fresh environment.**
`demo_sessions.extraction_source` was written and read by code and present in production, but **in no migration file**. It went missing because `extraction` and `extraction_source` are written in one `update` whose three siblings all got a phase-4 migration, and the write is best-effort:
```js
if (error) console.warn('[provision-demo] could not persist extraction … (migration applied?)', error.message)
```
**A missing column would have looked exactly like a working system** — a `console.warn` is the only signal this class of problem produces — right up until signup silently fell back to a blank upload. Second occurrence of this pattern after `place_order_atomic`. Now written as `add column if not exists`.

### 9.4 Structural gaps (open — not blockers, but they will bite)

| # | Gap | Why it matters |
|---|---|---|
| **G1** | **The demo bypasses the wizard's grouping pass.** `computeGroupingRows`/`makeGroupingRow` live inside the import wizard component, so the server-side provisioner can't call them. It re-implements the parts it needs — including forcing `isRequired`/`singleSelect` on `_inferredFromVariants` groups. | Two code paths now decide what an extracted menu becomes. They have **already diverged once** (required-flag on inferred variant groups). Every future grouping fix must be made twice or it silently regresses in demo. **Fix:** extract to `lib/` (logged in reference-manual backlog as option (b) — deliberately deferred because it restructures click targets on two live operator surfaces). |
| **G2** | **The KDS grid caps visible orders at 8, and the hidden ones are unreachable.** `MAX_GRID_VISIBLE = 8`, introduced in WIP commit `1d3d73c` for a fixed-column grid that no longer exists. The panel already scrolls, and the "+N more" indicator is a `<div>`, not a button. | This is **not a demo bug — it's a live-operator bug** the demo merely surfaced (a demo board of 37 orders hits it instantly). On a busy real service, orders 9+ are invisible with no way to reach them. Removal is pending the user's list-mode scroll test. |
| **G3** | **All demo saved-state is keyed per identifier.** `hg_demo_welcome_<token>`, `hg_demo_seen_orders_<token>`, `hg_demo_loop_<token>`. | Correct *today* — separate visitors must not inherit each other's dismissals. But **return-visit re-provisioning issues a new identifier**, so a returning visitor re-sees the welcome popup and gets a fresh loop-completion baseline as though they'd never been. Also leaves orphan localStorage keys. Decide at Phase 4 whether re-provision should carry the old key namespace forward. |
| **G4** | ✅ **CLOSED (28 July) — the roll is deleted.** *(Was: "the roll does not re-apply the `now + 10` floor" — it shifted orders by a start-to-start delta only, so after a roll the board's earliest order could sit ~19 min in the past.)* | There is no longer a code path that moves seeded orders without going through the seeder, so the "no already-late orders" guarantee now holds everywhere it is claimed. See §9.3 #15 for the three faults that ended the roll, and §10 Phase 2E for what replaced it. |
| **G5** | **The customer order page has no demo exemption on its clock gate.** `isEventClosed` (`order/page.tsx:1324`) and the slot-picker's "no longer available" check both block on elapsed `end_time` with no `isDemo` branch — and the roll is reachable **only from `/api/dashboard`**. | An elapsed demo shows **closed on its own order link** — the demo's central loop — until someone opens the dashboard and triggers a roll. A returning visitor landing straight on their order link hits a dead page. The 3h window makes it rarer, not impossible. **Highest-value gap to close before real prospects.** |
| **G6** | **The orphan sweep does not check `claimed_by_operator_id`.** Its gate is `if (hasMenu && hasEvent) continue`, so a fully-provisioned claimed demo is spared — but a claimed demo that is *momentarily eventless* (e.g. `replaceExisting` deleted the old event and the request died before the insert) and older than the 2h orphan window would be swept. | Narrow, but it arises exactly on the re-provision path. One `.is('claimed_by_operator_id', null)` closes it. Deliberately not widened in the same diff that added the expiry-sweep exclusion. |
| **G7** | ⚠️ **STALE as of 28 July — the roll is deleted (§9.3 #15); a closed demo is now recovered by "Start a new service" (§10 Phase 2E), which is a VISITOR action rather than an automatic one. Not marked CLOSED here because the edit list did not cover G7 — see the task report.** *(Was:)* **The roll now recovers CLOSED demo events — and that is load-bearing, not defence-in-depth.** `rollDemoEventIfStale` previously acted only on `status='open'`, so a closed demo was unrecoverable by the visitor. Widened to `.in('status', ['open','closed'])`, reopening with `opened_at` set. Double-guarded on `isDemoIdentifier` (the function's first line and its only caller). | Since the scheduler closes every demo nightly (§9.3 #13), a returning next-day visitor **always** lands on a closed event. The reopen path is the only thing between them and a dead board. |
| **G8** | ✅ **CLOSED, DIFFERENTLY (28 July) — with the roll gone there is nothing to roll.** *(Was: "the customer order page still never rolls"; was G5 before that.)* The page now shows an **honest closed state in demo mode**, naming the ended window as the product working correctly and telling them to open their dashboard and choose "Start a new service". | 🔴 **No link is possible.** A demo's `id`, `slug` and `dashboard_token` are three independent 130-bit values by design (`lib/provision-truck.ts` — *"leaking one must not hand over the others"*), so the order page cannot construct the dashboard URL. Making it possible would mean returning `dashboard_token` from a customer-facing response — the entire security boundary for `/dashboard/demo-*`. The copy therefore names the dashboard without pretending to navigate there. |
| **G9** | **The import wizard cannot rename or add categories.** Items can be added and edited; categories cannot. | A signup operator whose AI-derived categories are wrong has no way to fix them inside the wizard. Backlog. |
| **G10** | ✅ **CLOSED (28 July).** *(Was: `demo_sessions.email`, `extraction_source` and the saved-state flag were all client-side or URL-param signals.)* `/api/dashboard` now serves `demo: { extraction_source, email, expires_at }` **for demo trucks only**, gated on `isDemoIdentifier(truck.id)` so the key is absent entirely for an operator truck, and **cached client-side on the config-seed branch** so it is not re-read on the 60s poll. | `?welcome=sample` is **removed** — it survived exactly one navigation, so a reloaded sample demo used to start calling itself "your menu". `email` and `expires_at` are exposed but **not yet consumed**. |
| **G11** | **The KDS demo banner defaults to the `upload` copy variant on a sample demo**, because that page makes no `/api/auth/me` or `/api/dashboard` demo-block call. Same for `isAdmin`. | Fixing it means adding a request that page doesn't make — the trade deliberately declined. A sample-demo visitor reading the KDS banner sees "Save my menu" where the dashboard says "Set up my truck". Low impact; recorded so it isn't rediscovered. |

---

## 10. Build sequence

### Phase 1 — Foundations ✅ COMPLETE (July 2026)

**1. ✅ DB truth pass.** Findings:
- Only 3 trucks exist, all `plan='trial'`. **`tester` was never in use** — manual is stale.
- Full FK map read; **`DELETE FROM trucks` fails without 7 explicit deletes first** (§7.1).
- **`upsell_events` doesn't exist** — that migration was never applied. Concern dropped.
- **`trucks.slug` EXISTS**, nullable, UNIQUE index `trucks_slug_key`. Stale memory settled.
- `dashboard_token` UNIQUE. `trucks.id` TEXT NOT NULL (PK). `trucks.whatsapp` nullable.
- 🔴 **`trucks.sheet_id` is NOT NULL with NO default** — a legacy Google Sheets column. Any insert without it fails outright. Live convention is `''`. This was the one landmine; nothing else in `trucks` is NOT NULL-without-default.
- ✅ `truck_vans.kds_token` has a DB default (`encode(gen_random_bytes(24),'hex')`) — omit it, it populates.
- ✅ `truck_vans.kitchen_capacity` nullable, **no default** — must set explicitly or the capacity engine is inert.

> ⚠️ **Separate discrepancy found — not yet actioned.** Three columns the reference manual records as *applied* are **absent** from the live `trucks` table: `notes_require_review`, `sound_config`, `keep_screen_on`. The code reading them is in the undeployed batch, so it hasn't bitten — but **those columns must be created before that batch deploys**, or it fails the same way the `hide_name` hang did. Add to the deploy-coupling list.

**2. ✅ Plan constraint widened** to include `demo` and `tester`, verified via `pg_constraint` (§3).

**3. ✅ Security fixes.** `plan`, `trial_expires_at` and `feature_overrides` all removed from the `update_truck` allowlist (token-only auth). `feature_overrides` was the worst — `canAccess()` checks it *before* the plan, so a token holder could grant themselves any paid feature, bypassing plan and expiry. All three remain writable via `/api/admin` (session + `is_admin` gated), which is the correct home.
> ⚠️ Closes the *write* hole only. Any override already in the DB is still honoured on read — audit `trucks.feature_overrides` for grants you didn't set.

**4. ✅ DECIDED + BUILT — demo route: token-aware `/dashboard` exception (Option A).**
> `proxy.ts` narrows `isProtected` so `/dashboard/demo-*` bypasses the session gate, reusing the `/kds` precedent. Predicate is path-only (no DB lookup in edge middleware): `/^\/dashboard\/demo-[a-z0-9]+(\/|$)/`. `/manage` is never exempt.
>
> **Rationale: DRY.** The demo *is* the dashboard — one page, one codebase. Demo-mode differences are conditional rendering inside the existing page.
>
> 🔴 **Load-bearing cross-file invariant:** the exception is only safe because `lib/provision-truck.ts` guarantees *both* halves — demo tokens are always `demo-` prefixed, **and** no operator truck can ever carry a `demo-` prefixed id/slug/token (`assertReservedPrefix` throws pre-insert). Without half two, a truck named "Demo Kitchen" would slug to `demo-kitchen`, token `demo-kitchen-<hex>`, and **silently lose its session gate**. Do not change one without the other.
>
> For demo trucks the **token is the entire security boundary** (no session layer) — hence 130-bit random.

**5. ✅ BUILT + VERIFIED — truck-create path and delete cascade.**
- `lib/provision-truck.ts` — one function, `PROVISION_PROFILES` table for operator/demo deltas (no fork). Crockford base32, 130-bit. Insert-and-retry on 23505 (never SELECT-then-INSERT, TOCTOU). All six visibility columns written explicitly as a security property. `sheet_id: ''`.
- `lib/delete-truck.ts` — `deleteTruckCascade()`, the verified §7.1 ordered sequence. Not transactional; throws `DeleteTruckError` naming the failing step. Every step is an idempotent delete-by-truck_id, so **re-running after a partial failure is safe and correct**.
- Compensating delete on van-insert failure; on compensation failure logs `PROVISION_ORPHAN_TRUCK` + id, and returns the orphan id in the response body.
- `POST /api/admin/create-truck` and `/api/admin/delete-truck`, both `verifyAdmin` first. Delete enforces **typed slug confirmation** and an **operator-attached override** server-side (UI-only guards are theatre).
- Admin console UI for both, with a dry-run impact panel showing real row counts.

> ✅ **Verified against the live DB** — a demo truck was created and deleted end to end. All checks passed: `excluded=true`, `show_on_hg=false`, `order_link_hg=false` (overrides beat the TRUE defaults), `plan='demo'`, `allergen_display_mode='card'`, `truck_order_email_enabled=false`, `kds_token` auto-populated, id and slug independently random. No column surprised us beyond `sheet_id`.

**6. ✅ Order-submit `excluded` gate** — `excluded !== true` added after the truck fetch, covering both slug and id lookups. Returns the same 404 as an unknown truck (a hidden truck shouldn't confirm its own existence).

**7. ⬜ `commit-menu` honesty** — deferred; see below. Not blocking Phase 2 start, but must land before unattended anonymous demos.
> ⚠️ **`finally` is the wrong instrument.** `handleCommitMenu` already has try/catch and the catch recovers. The hang is specifically the `data.ok === false` branch (no `else`). A `finally` would clobber the success path's "done" screen. The fix is an **`else` branch** — *but*: `ok:false` doesn't mean "nothing saved", nothing consumes `failed[]`, retry isn't idempotent for `modifier_groups`, and four sibling `catch { /* non-fatal */ }` swallows sit in the same block.
> **And:** the demo provisioner is server-side — it calls `commit-menu` directly and never touches `handleCommitMenu`. **Fixing the manage UI does not protect the demo path.** Both need doing; they're separate.

> 🔴 **OPEN RISK carried into Phase 2:** the proxy exception is live, so a demo token now reaches the **full operator dashboard** — no DEMO MODE banner, Manage reachable, reporting visible. Harmless today (no demo tokens exist in the wild), but **step 10 cannot lag behind step 8**: the moment provisioning ships, tokens exist and the dashboard must already know what to hide.

### Phase 2 — The demo ✅ COMPLETE (July 2026)

Everything below shipped. Structural gaps it left behind are **§9.4**; the things it disproved are **§9.3**.

**8. Demo provisioning service** — `lib/provision-demo.ts`, one path used by first-run, return-visit re-provisioning and the template fallback. Composed of small libs rather than one procedure, so each piece is separately testable and the operator path can reuse them:
   - `lib/provision-truck.ts` — truck + van (Phase 1), profiles as **data, not a fork**.
   - `lib/slots.ts` — `generateSlots()` **extracted** from `app/api/manage/route.ts` (it was module-local and unexported; end-inclusive semantics preserved).
   - `lib/provision-demo-event.ts` — `demoEventWindow()` rounds the start **down** to 5 min; event is `status:'open'` + `opened_at`, `auto_open:false`, `auto_close:false` (§9.3 #4), `venue_name: 'Demo event'` (§9.3 #1).
   - `lib/menu-extract.ts` + `lib/menu-commit.ts` — extraction prompt lifted **byte-for-byte** from the wizard and verified identical; commit reports `submitted`/`unaccounted` so a partial commit is visible rather than silent.
   - `lib/demo-assumptions.ts` — §5, closed-vocabulary main-category inference with a most-populated fallback.
   - `lib/demo.ts` — `DEMO_PREFIX` / `isDemoIdentifier()` as a **leaf module**, so hot paths (proxy, order submit) get the check without pulling in the provisioning graph.
   - The session row is opened at **step 2, before the menu** — so a build that dies mid-extraction is still attributable and still sweepable.

**9. Order seeding** ✅ — `lib/seed-demo-orders.ts`, direct insert, `customer_email = NULL` (§6.1), own counter block (§9.3 #3), occupancy rebuilt after (§9.3 #2).

**10. Dashboard demo mode** ✅ — landed **with** step 8 as required. `DemoModeBanner` on all three surfaces from one component (they had already drifted into three). Email suppression is enforced **server-side** through a single `sendEmailUnlessDemo()` wrapper funnelling all 8 send sites in `dashboard/action` — not per-call `if`s, which is how one gets missed. The `excluded !== true` gate on `/api/orders/submit` carries a demo exemption.

**11. Template fallback** — 🅿️ **PARKED, and nothing dangles.** `lib/demo-templates.ts` (Pizza/Burgers/Curries) exists and is wired to the honest-failure UI, but the templates themselves are not authored. Extraction failure currently shows the honest failure screen (§11) rather than silently substituting someone else's menu.

**Also built, unplanned:**
   - **Public entry point** — `app/api/demo/route.ts`: 10 MB cap, type check, `demoRatelimit` 5/hour, **fail-open** on rate-limiter unavailability.
   - **`components/menu/MenuUploadFields.tsx`** — the dropzone shared between the operator wizard and the landing page, with an `accent` prop rather than a copy.
   - **`components/landing/DemoUpload.tsx`** — every landing CTA opens the same modal, **portalled to `document.body`** (the landing sheet's `.hg-landing * { margin:0; padding:0 }` reset beat Tailwind at equal specificity and flattened the modal in place).
   - **Admin scaffolding** — `/api/admin/provision-demo` (⚠️ temporary; surfaces provisioning errors in its response body, which is how the `venue_name` failure was finally read).

### Phase 2E — An elapsed demo ENDS ⚠️ BUILT, UNVERIFIED (28 July)

**Decided: no roll. A service ends; you start another.** That is what a real truck does, and it removes the drift where a visitor's own order kept reappearing at new times.

**On "Start a new service"** (`lib/demo-restart.ts`, `POST /api/demo/restart`):
delete ALL orders for the truck → delete ALL events → clear `slot_capacity` and `production_slot_usage` → provision a fresh window from `demoEventWindow(now)` → re-seed → rebuild occupancy. The menu is never touched.

🔴 **Orders are deleted BEFORE events, and that ordering is load-bearing.** `orders.event_id` is `ON DELETE SET NULL`, so order rows outlive their event — deleting events first leaves every order dangling with a null `event_id`, still counted by the capacity engine, which reads by **date**, not by event.

🔴 **Every delete is truck-wide, NOT date-scoped.** `provisionDemoEvent(replaceExisting)` scopes its deletes `.eq('event_date', date)` — the *new* date. Reusing it alone would sail straight past yesterday's event and leave the old orders live alongside the new ones, reproducing the exact bug this feature exists to fix. **The next-morning case is the whole point** and is the first thing to test.

**Triple-guarded on the `demo-` prefix** — the token, the resolved truck id, and inside `restartDemoService` itself. This endpoint deletes every order on the truck it is given.

**`DemoLoopComplete` state is reset** (`hg_demo_seen_orders_*`, `hg_demo_loop_*`); its baseline is a persisted list of order keys, every one of which has just been deleted, so without the reset the new seeded board would read as 37 orders the visitor caused and the prompt would fire on load.

**The second occupancy rebuild is not redundant** (§9.3 #2): `provisionDemoEvent` runs one against an empty board, so without the second pass the seeded orders occupy nothing and every slot reads green.

### Phase 3 — Persistence + cleanup ✅ BUILT — ⚠️ NOT YET DEPLOYABLE
12. **Email capture + return link** ✅ — `/api/demo/save-email` (accepts **token or slug**), `/api/demo/return` re-provisions before redirecting.
13. **Cleanup job** ✅ — `/api/cron/demo-cleanup`, 24h / 14d, ordered delete via `deleteTruckCascade` (§7.1), plus an **orphan sweep** for trucks whose session row never landed. Hourly `vercel.json` cron.

> 🔴 **TWO THINGS GATE THIS.** `supabase/migrations/20260723_demo_sessions.sql` (`demo_sessions` + `demo_cleanup_log`) is **NOT APPLIED**, and `CRON_SECRET` is **NOT SET**. Per §9.3 #1 and the recorded-as-applied lesson: apply it, then **verify against `information_schema`**, then commit — do not trust this line.

### Phase 4 — Conversion ⚠️ BUILT, UNVERIFIED (23 July)

> ⚠️ **Nothing in this phase has been run.** tsc-clean only, and uncommitted alongside the whole Phase 2/3 build. The verification order is at the end of this section.

**Built this session (5 changes):**

1. **Persist the extraction** (`lib/provision-demo.ts`) — best-effort `update` on `demo_sessions.extraction` after a successful commit, at BOTH the `extractMenu` and template branches. Stores the RAW `MenuExtraction` (§9.3 #8). A failed session write must never fail demo provisioning.
2. **Protect claimed sessions** (`/api/cron/demo-cleanup`) — expiry sweep excludes `claimed_by_operator_id`; second sweep reclaims claimed-but-abandoned at 30 days (§7.2). `retired_at` deliberately left unwritten.
3. **Silent commit hang fixed** (`handleCommitMenu`) — the missing `else` on `if (data.ok)` added, landing on `importStep('prep')` with the real error surfaced. **`else`, not `finally`** (Phase 1.7). Copy is honest about partial writes: commit-menu is non-transactional, so "nothing saved" would be a lie. **This was a prerequisite, not a bonus:** `clearFirst` exists to make RETRY safe, but every failure returned `ok:false`/400 into an indefinite spinner, so the operator never learned to retry and the clear-before-retry path never executed.
4. **`/api/setup` GET disambiguated** — returns `reason: 'no_claim'` vs `reason: 'no_extraction'` vs the extraction, all 200/ok. The Manage bootstrap toasts on `no_extraction` ("your demo menu is no longer available — please upload it again") and stays silent on `no_claim`. Previously all three were an identical silent null — the same swallowed-failure-reads-as-empty-state class as the false "Truck not found".
5. **Two comment corrections** (`lib/menu-commit.ts`) — the `clearMenu` header cited `delete-truck.ts`'s inventory as confirming `modifier_groups → modifier_options`; it does not (that inventory establishes `trucks → modifier_groups`, a different relationship). The cascade IS real — **verified against the live schema this session**: `modifier_options.group_id → modifier_groups` CASCADE, `item_modifier_groups` cascades from BOTH parents. Plus a retirement note recording the §7.2 hazard.

**VERIFIED FACTS worth not re-deriving:**

- **`trucks.setup_step` is written by `/api/setup`** (`create_truck`), NOT by `/api/signup` and NOT by `provisionTruck`. It is a **second, non-atomic statement** after provisioning — if it fails, the truck exists with `setup_step` null and its `clearFirst` retry path is dead. All 8 pre-existing trucks show null because they predate the flow.
- **The `clearFirst` guard is fail-closed on all three traces** — `setup_step` null, select errors, and field absent all refuse with 400. The client value can only *request*; the server's own `trucks` lookup authorises.
- **`clearMenu` deletes `modifier_groups` → `menu_items_db` → `menu_categories`, all `truck_id`-scoped.** `modifier_options` and `item_modifier_groups` are reached by cascade (verified above). Note `menu_items_db.category_id → menu_categories` is **SET NULL**, not CASCADE — harmless only because items are deleted before categories, so that **ordering is load-bearing**.
- **`menu_items_db.price` is `numeric NOT NULL` with no default,** but `lib/menu-extract.ts` coerces any unreadable price to `0` before commit; null never reaches the insert. `commitMenu` writes `price: item.price` verbatim and never reads `price_missing`.
- **The price gate is import-review only.** It does not touch the per-item edit modal in Manage. Blast radius contained.
- **`_free` commits `0`, not null** — preserving the "0 = free" rule.

**DECIDED: £0 demo items are SHOWN, not skipped.** An operator whose menu says "everything £5" or whose prices the AI can't parse still gets a working demo; a £0 item is a cosmetic wrong, and signup is where they correct it. The downstream consequence is intended: at signup those rows appear amber and block Next until priced or marked free. If a 20-row all-unpriced menu proves tedious in practice, the answer is a bulk "apply this price to all flagged" control — **not** weakening the gate.

**STILL DEFERRED (flagged honestly at build time, neither blocking):** `truck_order_email_enabled` is provisioned at its correct default (`true`) but the wizard never asks; category prep is settable but not pre-filled from `buildDemoAssumptions` with a "we guessed this" label.

**VERIFICATION ORDER (nothing here has been run):**

1. **Extraction persists** — fresh demo → `select truck_id, (extraction is not null) from demo_sessions order by created_at desc limit 1`. Everything downstream depends on this and it has never been true.
2. **Fresh demo board** — 3h window, half-hour start, first order ≥ now+10, taper still reads as a busy truck.
3. **Roll behaves** — let a demo elapse, hit the dashboard, confirm the new window is half-hour/3h (not a legacy length) and orders shifted coherently. Watch for G4 (earliest order up to ~19 min past).
4. **Claimed session survives the sweep** — set a claimed session's `expires_at` past, run the cron, confirm it survives; confirm an *unclaimed* expired one is still swept.
5. **Operator path unchanged (the regression surface)** — normal import, all prices read → no banner, Next enabled, commits as before.
6. **Price gate fires** — unreadable price → amber row, empty field, Next blocked until priced or marked free.
7. **Behaviour change to confirm you want it** — editing an existing item's price to empty now blocks Next; previously it could commit at £0.
8. **`clearFirst` refused — safely.** Exercise the 400 against **test-truck**, NEVER Gusto. Pointing a menu-wiping request at the live trading truck to prove a guard works means an inverted guard IS the incident.
9. **Retry produces no duplicates** — now observable because the `else` surfaces the failure. Verify via DB query, not by watching the UI.
10. **Full signup → menu** — demo → identity → Manage review pre-loaded from the demo menu; grouped-vs-separate genuinely asked; "separate" produces separate items.

---

**The original Phase 4 spec (pre-build) follows — retained for the decisions it records:**

The demo currently has **no forward path in the product**: "Get started" captures an email and promises a human will follow up (Stage 4). That is honest but manual, and it caps the funnel at whatever a person can process. Phase 4 replaces the promise with a route.

**14. `/signup` — self-serve account creation** (B5 — today account creation is admin-gated).

Minimal: **email + password only.** Everything else is the wizard's job (Stage 6). On submit:
1. Create the auth user + `operators` row.
2. Create the **real truck** via `provisionTruck({ kind: 'operator' })` — hidden on every visibility column, **`plan = 'trial'` with `trial_expires_at` NULL** (§3 — CORRECTED v7.1; was `'demo'` per B10, which is now closed because `canAccess()` no longer denies on a NULL expiry). ⚠️ The `kind: 'demo'` profile is unchanged and still writes `'demo'`.
3. **Carry the demo menu across** (below).
4. Open the setup wizard.

**15. Demo → real-truck migration.**

> ⚠️ **CORRECTED v7 — "the menu carries across" is a SERVER HANDOFF, not an automatic copy.** `/api/setup` GET returns the stored extraction; the **re-commit is client-side, in `MenuTab`**, and happens only when the operator walks the import wizard to the Kitchen step and presses Save. Nothing is written to the real truck until then. Two consequences the table below does not convey: a signup that abandons the wizard has a truck with **no menu at all** (which is why re-entry from the Menu tab is a supported path), and the demo's menu is re-committed through the wizard's OWN pipeline, so the operator makes the grouping and allergen decisions rather than inheriting the demo's.

> 🔴 **CORRECTED v7 — a SAMPLE demo's payload is deliberately WITHHELD.** `/api/setup` GET returns `reason: 'template_withheld'` for a demo whose `extraction_source` is `'template'`: the payload is intact and is not handed over, because it was never the operator's menu. The wizard opens at the upload step instead, with no error toast — nothing failed and nothing was lost. **The upload route and the sample route share one flow and one state machine**; only the entry point differs. Do not "fix" the withholding by carrying a sample menu onto a real truck.


**What carries — decided:**

| | Carries? | Why |
|---|---|---|
| **Menu** (items, categories, modifier groups + options, prices) | ✅ **YES** | The extracted menu is the entire reason they're still here. Re-uploading is the one thing that would make signing up feel like a punishment. Offer re-upload; **never require** it. |
| **Orders** (all 37 seeded + anything they placed) | ❌ **NO** | Fake orders in a real truck's history poison reports, counters and any future analytics permanently. **Blank slate, stated plainly** — "your menu came across; the demo orders didn't, so your reports start clean." Framed as a benefit, which it is. |
| **Demo event + slots** | ❌ NO | Time-boxed to the demo session and in the past by definition. The wizard's schedule step creates real ones. |
| **Wizard assumptions** (§5 capacity, prep times, batch sizes) | ⚠️ **OPEN — see Q13** | |
| **Truck identity** (name, logo, contact, WhatsApp) | ❌ NO — none exists | Demo trucks have a generated internal id, deliberately never shown. The wizard's identity step is where a name first exists (Stage 6). |

**Demo-truck retirement.** ⚠️ **STILL SPEC ONLY — re-confirmed 4 August. `retired_at` has no writer anywhere, and `deleteTruckCascade` is never called from any signup path.** A converted operator's demo truck is still standing; it is reclaimed only by the 30-day claimed-but-abandoned sweep (§7.2). The design below is what to build, not what exists.

Do **not** promote the demo truck into the real one: its id carries the reserved `demo-` prefix, which is a **security boundary** — `proxy.ts` exempts `/dashboard/demo-*` from the session gate. A promoted truck would be a real operator's console reachable without a session. So: **provision a fresh real truck, copy the menu, then delete the demo truck** via `deleteTruckCascade` (§7.1) and close its `demo_sessions` row.

> ⚠️ **Order the migration so a crash can't lose the menu.** Copy-then-delete, and only delete after the copy is verified — `commitMenu` is non-transactional (§9.2), so a partial copy is a real outcome, not a hypothetical. On partial copy: keep the demo truck, surface the failure, let them retry. **Never** delete on an unverified copy.

**How "Get started" re-points.** `components/DemoGetStarted.tsx` is the single place — the banner CTA and the loop-completion prompt (§8) both render it, deliberately, so they can't drift. When `/signup` exists it becomes a link carrying the demo identifier (`/signup?demo=<token>`), and `/api/demo/save-email` stays as the fallback for anyone who wants the return link without an account. **Keep the email capture** — it serves a different person (not ready to commit) and it's what the 14-day return link hangs off.

**Open questions — flagged, NOT answered:**

| # | Question |
|---|---|
| **O7** | **What happens to the demo tab that's still open?** After migration the demo truck is deleted; the visitor's other tab (dashboard or KDS) starts 404ing mid-session. Poll for retirement and show a "you've signed up — continue here" interstitial, or accept the dead tab? |
| **O8** | **Can someone signing up already have an account?** `/signup` with an existing email — sign them in and offer to attach the demo menu to an existing truck, or refuse and send them to `/login`? An operator with a truck already has a menu that would be **overwritten**. |
| **O9** | **Do the §5 wizard assumptions carry, or does the wizard re-ask?** They're honest guesses that made the demo work. Carrying them means a real truck silently runs on inferred prep times; re-asking means the capacity behaviour they just watched changes under them. (Leaning: **carry as pre-filled defaults in the wizard's capacity step**, visibly labelled as guesses — but this is a decision, not a conclusion.) |
| **O10** | **What's the identifier for the real truck?** Demo ids are 130-bit random and unshown. A real truck needs a public slug, which needs a name, which the wizard hasn't asked for yet at step 2 above. Provision with a temporary id and rename at the identity step (`trucks.id` is TEXT and referenced by 7 tables — a rename is a **migration**, not an UPDATE), or defer truck creation until after the identity step? |
| **O11** | **Does email verification gate anything?** Nothing is public until go-live (Stage 8), so an unverified account can't do harm — but the 14-day return link and any nudge email both assume a reachable address. Verify at signup, at go-live, or not at all? |
| **O12** | **Rate limiting and abuse on `/signup`.** The demo endpoint is 5/hour per IP. Signup creates auth users; it needs its own tier and a decision on whether a failed migration leaves a half-built account behind. |
| **O13** | **G3 (§9.4) — does the demo's localStorage namespace carry forward?** Same question return-visit re-provisioning already raises; signup is where it stops mattering, since the real dashboard has its own state. Probably just **clear the `hg_demo_*` keys** on successful migration. |

### Phase 4A — Signup moved into the demo modal ⚠️ BUILT, PARTIALLY VERIFIED (24 July)

> ✅ **The full chain was walked end to end on 24 July** and observed working: account created, truck provisioned, redirect to `/manage/<token>?import=demo`, 37 items pre-loaded in review from the stored extraction. That is verification step 10, passing. Everything else in this subsection is built but unobserved.

**Why it moved.** The demo→signup click is the highest-intent moment in the funnel. Navigating to `/signup` — unfamiliar dark chrome, re-asking for an email already captured — is where people are lost. The modal now orchestrates instead:

`/api/signup` (auth user + `operators` row + `claimed_by_operator_id`) → `signInWithPassword` (establishes the cookie session `/api/setup` needs) → `/api/auth/update-profile` (name) → `/api/setup` `create_truck` (truck name, sets `setup_step: 'menu'`) → `/api/manage` `update_settings` (cuisine, emoji, phone, whatsapp, `phone_is_whatsapp`) → logo upload → redirect.

**No endpoint contract changed.** `/signup` remains for direct traffic.

**Failure posture:** the account and the truck are CRITICAL — a failure keeps them in the wizard with the real error and a retry that never re-runs `/api/signup` (the `accountCreated` guard). `update-profile`, `update_settings` and the logo are BEST-EFFORT: logged, non-blocking, redirect anyway. Every field there is editable in Settings, and a blocked signup is far worse than a missing website.

**The wizard, as built:**
- **Step 1 "About your truck"** — your name, truck name, phone + WhatsApp tick, "Setting up as `<email>`" with a change link.
- **Step 2 "Finish setting up"** — cuisine, logo, password, terms tick, free-month line, "Create my account →".
- Then a progress list (Creating your account / Setting up your truck / Loading your menu) that ticks **only after each write returns** — the confirmation trails the write, never leads it.
- Then a confirmation beat: "Your account's ready — now let's finish setting up your truck", with an explicit Continue.
- Stepper shows "Your details › Menu › Allergens › Kitchen setup" — both modal steps under ONE entry, matching the import wizard's own precedent (reviewStep 1 and 2 both sit under "Menu").

**`/setup` is now bypassed on this path.** Its identity step asked only for the truck name, which the modal already collected and wrote; its submit was a no-op (the server discards the re-typed name and returns the existing truck). `/setup` is NOT deleted — it remains the target of post-login's resume redirect.

> 🔴 **Known bug on the /setup path, unfixed:** post-login sends a resuming operator to `/setup?truck=<id>`, which ignores the param, renders the truck-name form, and the server **discards the re-typed name**. An operator who comes back and renames their truck sees the rename silently not happen. Separate diff, different path.

**Decided: the journey is LINEAR, not reversible.** Once the account exists, each step commits and there is no going back past a saved stage. Precedent: Stripe/Shopify onboarding. The alternative — back-editing already-created rows — turns every correction into an update against live data, for a benefit most operators will not use. The obligation linear takes on: "you can change this later in Settings" must be true and reachable. It is.
(Back WITHIN a stage — the wizard's own ← Back between menu/extras/allergens — is unaffected.)

**Fields deliberately NOT asked at signup:** description, socials, WhatsApp sender, preferred contact method, `operators.phone`, website (the schedule step asks for a URL later), and "how many trucks" (moved to Kitchen setup, where `kitchen_capacity` is set per `truck_vans` row).

**Terms:** `/signup` uses consent-by-conduct ("by creating an account you agree…"); the modal uses an actively-ticked box that blocks submit. Both produce an identical server record — `/api/signup` stamps `terms_accepted_at` and `terms_version` **unconditionally** on the operator insert, reading no consent field from the body. Flagged: the column therefore records that a signup happened, not that consent was given. Adequate while the client gate holds; the honest version passes acceptance through and stamps on it.

### Phase 4B — The import wizard is setup-aware ⚠️ BUILT, UNVERIFIED (24 July)

**One signal unlocked five fixes.** `inSetup = setup_step != null && setup_step !== 'done'` — the same condition `commit-menu` already uses. `getTruck` selects `*`, so no new fetch was needed; only the client `Truck` type was missing the field.

🔴 **Every change is gated on `inSetup`, which is false for every truck with `setup_step` NULL** — Gusto, RTF and all pre-wizard trucks see today's behaviour, byte for byte.

1. **Stepper continuity** — prepends a completed, non-clickable "Your details ✓"; real steps renumber from 2. So the operator sees one journey, not a second wizard starting at 1.
2. **Exit path** — the × no longer opens "Discard this import?". A new operator who discards is left with an account, a truck, no menu, `setup_step` still `'menu'` and no route forward; the old copy ("your changes won't be saved") badly understated that. Replaced with "Finish setting up later?" — truck and `setup_step` intact.
3. **"In Settings" wording** — four places pointed a brand-new operator at a screen they had never seen. Reworded when `inSetup`. The duplicated "editable later in Settings" line in review step 2 was removed on both paths.
4. **The false allergens notice** — the done screen's amber "Allergens & dietary aren't set yet" rendered **unconditionally**, telling an operator who had just confirmed every dish that they had not. Now keyed on the committed `allergen_display_mode`: `card` → complete (a card IS a complete setup, and the card path never sets per-dish `_allergensChecked`); `per_dish` → complete only if every dish is confirmed; **anything else → SHOW (fail loud)**. An unnecessary allergen warning is harmless; a missing one is not.
5. **`done` is no longer terminal in setup mode** — its 2.5s auto-dismiss would yank the operator out mid-step.

### Phase 4C — Schedule step 📐 SPECIFIED, BUILDING (24 July)

**Placement decided: after the menu commit, not before.** `prep` → "Save & add to menu" → commit → **schedule** → done. The menu must be durable before a new, skippable concern is introduced; abandoning during schedule costs nothing.

**It is assembly, not a new build.** Every piece exists in `ScheduleTab` and is proven: the `schedule_url` field, `isBlockedDomain` / `BLOCKED_DOMAIN_MSG`, `handleVerifyUrl` → `/api/manage/verify-schedule-url`, photo/text import → `/api/manage/process-schedule`, and manual entry → `upsert_event`.

**Verify is safe to run at signup** — reachability + exactly one write (`trucks.scraper_rule`). It does NOT enrol the scraper, write events, or trigger a scrape.

🔴 **Enrolment rule, decided:** the scraper picks up a truck when `schedule_url IS NOT NULL AND scraper_preference IN ('auto','both')`. The wizard sets **both, together, and only after Verify succeeds**. Settings saves `schedule_url` on blur regardless — fine there, wrong here: enrolling a new truck against a page the scraper cannot read fails **silently forever** (hourly job, finds nothing, nobody notices). Verification is the evidence enrolment will work.

Photo import and manual entry create `truck_events` directly and do NOT enrol — there is no URL to scrape.

**Skipping still completes setup.** On finish OR skip, `setup_step = 'done'`. Leaving it non-null keeps `inSetup` true forever and the setup chrome haunts their Manage page. The "no events yet" nudge should key on `truck_events` being empty — a better signal anyway, since an operator who adds an event a week later should stop being nagged. No new column.

### Phase 4D — Signup copy centralised ⚠️ BUILT, UNVERIFIED (28 July)

Copy in `DemoGetStarted` diverged per-surface **four times**, each fixed separately. The cause was not that variants existed — it was that they were scattered through the JSX as inline conditionals, so one got updated and the others didn't.

**One object, three variants as sibling keys with identical shapes**, so editing one shows the others unchanged in the same diff hunk:

| Variant | Banner button | Modal sub-line |
|---|---|---|
| `upload` | Save my menu → | Your menu carries straight over. |
| `sample` | Set up my truck → | You'll upload your own menu next — takes a minute. |
| `saveOnly` | Save my menu → | We'll keep it for 14 days and email you a link straight back. |

**The upload/sample divergence is deliberate and chosen for conversion, not tidiness.** Someone who uploaded their own menu has made something and watched it work; naming that artifact and implying it is at risk converts better than naming a task. A sample demo has no such artifact — "save my menu" would be false, and the sample line instead answers the question actually in their head ("this isn't my menu, then what?"). ⚠️ Do not collapse `upload` and `sample` because they nearly match.

`saveOnly` wins the derivation first: with no setup path on offer, upload-vs-sample is moot — both would promise a door that isn't there.

**Variant is sourced from `extraction_source`** via the `demo` block, never a URL param. Default is `upload` when null: it is the common case, and "Save my menu" briefly shown on a sample is a milder error than "Set up my truck" shown to someone whose own menu is on screen unmentioned.

**`canSetup` is now admin-aware** — `(NEXT_PUBLIC_SIGNUP_PUBLIC === 'true' || isAdmin) && !!token` — so the signup path can be walked on production without opening signup publicly. This is not a client-trusted auth flag: `/api/signup` already allows an admin session through when `SIGNUP_PUBLIC` is unset, re-reading the session server-side and checking `operators.is_admin` against the database. Forging `isAdmin` in the browser gains a button and then a 403. `isAdmin` costs no new request — `/api/auth/me` already fires on demo dashboard load.

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
| O1 | Signup timing — trigger-based only, or a harder nudge after a threshold? | ✅ **Resolved — trigger-based only.** A permanent, undismissable CTA in the DEMO MODE banner, plus one behaviour-triggered prompt at loop completion (§8). No time-based nudge: time measures patience, not interest. |
| O2 | Pre-trial test orders on the real truck | ✅ **Resolved** — `get_report`'s event mode already scopes strictly by `event_id`, so scoping reports to the nominated event onward is nearly free: no new column, no deletion, no conflict with the `is_test` prohibition. |
| O3 | Does `show_on_vf` / `order_link_vf` flip true at nomination, or only the HG pair? | **STILL OPEN** — separate product decision, untouched by this session (nomination itself does not exist, §15). |
| O4 | Sample-template maintenance — who keeps Pizza/Burgers/Curries current? | **STILL OPEN.** Lower stakes than recorded: a sample menu is never carried onto a real truck (the payload is withheld, §10 Phase 4), so a stale template misleads a prospect in the demo but cannot reach an operator's menu. |
| O5 | "We'll build your menu for you" — fulfilment process and volume ceiling? | **STILL OPEN** — not touched this session. |
| O6 | Does the demo include an *online* ordering path, given seeding can't use `/api/orders/submit` (§6.1)? | ✅ **Resolved — YES, it's the demo's whole loop.** The seeder's constraint never applied to the *visitor's* orders: they go through `/api/orders/submit` normally (with a demo exemption on the `excluded` gate), and email suppression is handled server-side by `sendEmailUnlessDemo()` rather than by avoiding the path. The order page is demo-moded, and the link + QR are surfaced (Stage 3). |
| **O7** | **What happens to the demo tab that's still open?** | **SUPERSEDED.** The premise was "after migration the demo truck is deleted" — it is not, and never has been (`retired_at` has no writer, §10 Phase 4). The demo tab keeps working until the 30-day sweep. Re-ask this **if and when** retirement is built; the question is real but its trigger does not exist. |
| **O8** | **Can someone signing up already have an account?** | **PARTLY ANSWERED.** `/api/signup` returns a 409 with `existing: true` and the modal shows "There's already an account with that email — sign in instead" plus a Sign in link. **The overwrite hazard is unresolved**: attaching a demo menu to an existing truck is still not offered and still not refused, because the path never gets that far. STILL OPEN as a product question. |
| **O9** | **Do the §5 wizard assumptions carry, or does the wizard re-ask?** | **ANSWERED — the wizard RE-ASKS, and that is now settled by build.** The Kitchen-setup step asks per-category prep and batch and the total capacity ceiling; `/api/setup` passes `van: { kitchen_capacity: null }` **deliberately**, so a real truck never inherits a demo's guessed ceiling ("capacity must be an active decision, not an inherited guess"). |
| **O10** | **What's the identifier for the real truck?** | **ANSWERED — truck creation is DEFERRED until after the identity step.** `/api/signup` creates the auth user and `operators` row and **no truck**; `/api/setup` `create_truck` mints it from the typed name. The rename-is-a-migration problem is avoided rather than solved. |
| **O11** | 🔴 **Does email verification gate anything?** | **ANSWERED — it gates NOTHING today.** `operator_email_verifications` is written, the link is clicked, `verified_at` is set — and **`lib/go-live-checks.ts` has ZERO call sites and is imported by no file**, so the `email_unverified` issue it defines is evaluated by nothing. Two signups with `verified_at` NULL produced fully working trucks. ⚠️ **This question was recorded as open while the verification system was already built and shipping** — the gap was never the build, it was that nothing consumed it. **DECIDED (Dominic, 4 August): verification is KEPT, and go-live WILL be gated on it. Not yet built** — see §15. |
| **O12** | **Rate limiting and abuse on `/signup`.** | **ANSWERED.** Two dimensions, both live: per-IP (`signupRatelimit`) and per-EMAIL (`signupEmailRatelimit`), failing OPEN if the limiter is unreachable. The half-built-account question is also answered: a failed `operators` insert triggers a **compensating delete** of the auth user, and `/api/auth/post-login` repairs if that delete itself fails. |
| **O13** | **Does the demo's localStorage namespace carry forward?** | **STILL OPEN.** No `hg_demo_*` clearing was built. ⚠️ Now slightly larger than recorded: the walkthrough adds its own per-truck key (`hg_walkthrough_<token>`) on the REAL truck, so the two namespaces are adjacent and a future sweep must not take both. |
| **O14** | **Cross-midnight demo window — SCOPED AND PARKED (23 July).** A demo provisioned after ~23:15 gets a thin board (e.g. 23:40 → 23:59, clamped). The obvious fix is a window that CROSSES midnight, and a read-only diagnostic established that is **not demo-scoped**: there is **no demo seam** — `isDemoIdentifier` appears in none of `slot-availability.ts`, `slot-bookings.ts`, `slot-generation.ts`, `slots.ts`, `slot-display.ts`, or `/api/slots`. The demo runs Gusto's engine by design (§6, "genuine engine output"). Wrap-awareness would have to reach **nine files** including the core of `slot-availability.ts`, plus a dateless-slot schema assumption (`orders.slot`, `production_slot_usage.production_slot`, `slot_capacity.slot` are all HH:MM with no date; every read is `.eq('event_date', …)`). `generateSlots` with `end < start` returns `[]` — a dead board, gracefully. **The `23:59` clamp is the containment that keeps all nine files on their single-day assumption. Do not remove it.** Two cheap demo-scoped alternatives if this ever bites: (a) roll on elapse rather than staleness only — the mechanism already exists, the gap is that it is dashboard-only; (b) **after ~23:15, provision the event on the NEXT day's date** with a normal 3h window — single-day assumption intact, no wrap, confined to `provision-demo-event.ts`. (b) is probably the cleanest. Mitigating factor: the roll self-corrects a thin window within minutes (a 23:40 demo rolls at 23:59 to 00:00–03:00 on the new date) — but only via a dashboard poll, and only if the visitor is still there. | **PARKED** — deliberate, with the scope recorded so it is not re-derived |
| **O15** | 🔴 **THE FREE MONTH IS NOT WIRED TO ANYTHING.** `trial_expires_at` is `null` at provision (`lib/provision-truck.ts`), null means all features on, and the **only** code that ever sets it is the admin panel — you, by hand. Nomination is the intended trigger and is deliberately Phase 5 (`lib/go-live-checks.ts`). So every promise the onboarding makes — the welcome popup's "your free month starts at your first live event", the signup modal's "setting up won't start your free month", §8's strongest conversion trigger — describes a mechanism that **does not exist**. A signed-up operator's trial is currently unbounded and starts only if you remember to stamp it. **DECIDED: accept manual stamping for now.** Two reasons: nomination is the intended home, and duplicating the trigger means two places that can stamp a trial expiry — customer money. The launch plan is 15 hand-picked trucks; fifteen manual stamps over months is not a burden when you're speaking to each of them. **What to build instead: an admin view listing operators with a confirmed event and no `trial_expires_at`** — turning "remember" into "check a screen". The copy stays honest either way: the policy is real, it is enforced by hand until Phase 5. | **SUPERSEDED by §15 — and it is worse than recorded.** The finding stands and the manual-stamping decision stands, but two things this session established change the shape of the problem: (a) signup provisions plan **`demo`**, not `trial`, and `canAccess()` applies its expiry check ONLY when `plan === 'trial'` — so a self-serve operator has the full trial feature set **permanently**, not "unbounded until stamped"; and (b) an expired trial has **LESS** access than Starter, not Starter's set. Nomination's design must therefore answer what happens at EXPIRY, not just at start. §15. <br><br>⚠️ **UPDATED v7.1 — half of (a) is now out of date, and NOTHING ELSE HAS CHANGED.** Signup provisions **`trial`**, and a NULL expiry grants the trial set rather than denying it (§3). **The practical position is identical:** a self-serve operator still holds the full trial feature set indefinitely, because nothing starts the clock. What changed is *why* — it was "a plan the expiry check never looks at", it is now "a plan whose expiry check reads NULL as not-started". **(b) is unchanged and is now the sharper half:** an expired trial still has less access than Starter, and the three live trials have dates (manual V11.1 §4). The manual-stamping decision stands. |
| **O16** | **Route A of the schedule step gives no immediate payoff.** | ✅ **ANSWERED AND BUILT — Route A now imports as well as enrolling.** It was worse than "no payoff": the events it found were held in component state, rendered as a count, and **never written** — a truck finished this route with `schedule_url` set, `scraper_preference` `'auto'` and **zero `truck_events` rows**. It now opens the SAME editable event modal Settings uses (one modal, one save path, one editable event list in the codebase), and still enrols the URL. Both promises are kept: these dates now, and the page watched from here on. |
| **O17** | **Should the setup-mode done screen point at the live order link?** | **STILL OPEN — and now competing for the same space.** The done screen is no longer bare: it carries the celebration, the item/category count, the Manage-vs-Dashboard line and the three-way walkthrough offer (§15A). Adding the order link is still the natural payoff, but it is now a question of what it displaces, not what fills a gap. |
| **O18** | 🔴 **Kitchen ticket printing is advertised but does not exist on any platform.** The compare table shows `Kitchen ticket printing — Max: ✓`, and the manual records printing as ready at launch. `lib/printing/` contains only `createStubTransport` ("Phase A, no hardware"); there is no BLE plugin, no Star/Epson SDK, and no `printer_class` column. Footnote 5 has been made platform-neutral ("the HatchGrab kitchen app") but the ✓ remains. **Also relevant to Android:** the recommended backend (`mfi`, Star/Epson via Apple's External Accessory framework) is **iOS-only by construction** — MFi has no Android equivalent, so Android printing means the `ble` path, which the code itself calls the budget fallback with "LIMITED/NO status + fiddlier reconnect". For a truck printing all service, "the printer silently stopped and nothing told you" is what an Android printing promise would underwrite. **Decision needed: ship it, mark the row `coming_soon`, or accept the claim.** | **OPEN — the sharpest claim on the pricing page** |
| **O19** | **STILL OPEN — untouched this session.** **Should the seeded-order floor protect the hour after seeding, not just the moment of it?** `max(start+10, now+10)` guarantees no order is seeded into the past, but on a short window every order crosses the late threshold within minutes of the others and the board turns uniformly red. On a full 3h board the front goes red while the back is still grey — which reads as a working kitchen. The order-count scaling mitigates this; whether it fully solves it wants watching on a real late-night demo. | Open |

---

## 13. Warm path (later)

For operators whose details you already hold (name, logo, contact), the flow inverts: **pre-build a branded demo** and send a personalised link via email/WhatsApp — *"We built your ordering page — here's [Truck Name], with your menu, ready to try."*

Signup becomes **"claim it"** rather than "save it" — lower friction still. Requires the same create path (B1), seeded from known details instead of an upload. Specify separately once the cold path is built.

---

## 14. Session carry-over (28 July) — read before resuming

**🔴 Nothing is committed.** ~60+ uncommitted paths across five days — the whole Phase 2/3/4 build, plus the signup-wizard, setup-aware-wizard and schedule-step work, plus this week's Android and demo-restart work. Both touch the 8700-line live Manage component.

**Commit to a BRANCH, not `main`.** `main` is the Vercel production branch; pushing there deploys to production (reference-manual §33 deploy-coupling landmines: `ee31dbf` + `3da0855` must ship together or 441 orphaned events drop off the live site, and the both-paths smoke test has not been run). A short-lived `onboarding-phase4` branch gives the rollback point without the deploy. This is not a violation of the web-change→main rule — that rule explicitly sanctions feature branches; what it forbids is a long-lived native-named branch accumulating web work.

**🔴 Login-path tests still owed, and they gate the merge.** `/login`'s post-login routing was changed and verified only via admin→dashboard, which does not enter the new block. Two tests remain: (a) a real login with a throwaway operator account, (b) blocking `/api/auth/post-login` to prove login falls through safely when the endpoint errors. Auth, on a codebase where a real truck trades.

**Built 27–28 July, UNVERIFIED:** the roll deleted and replaced with "Start a new service"; order count scaled to window; the order page's honest closed state; `canSetup` admin-aware; the `/api/dashboard` demo block; the `extraction_source` migration (applied to prod, returned success); the copy object with upload/sample variants; the loop-complete order naming, scroll and green flash; the focus-ring fix on the landing email field and privacy link; the landing page's Android promotion.

**Verified live (the scraper work, 27 July):** Gusto pinned to `scroll_lazy`, 3 scrapes/day, `notes` populated, and their Sunday dates found at 13:34 after the fix deployed. That is the only part of this week's work confirmed working in production.

**Test order, when you next sit down to it:**
1. **The full signup chain on hatchgrab.com** as admin — demo → set up my truck → account → truck → redirect → menu pre-loaded. Verification step 10 on the real site. Check the sample variant too, and check a reload.
2. **The next-morning restart** — leave a demo overnight, open it, "Start a new service". The truck-wide delete exists for exactly this and has never been exercised.
3. **The two login-path tests**, owed since 23 July. A brand-new signup exercises the first directly.
4. A late-night demo, to see whether the scaled order count reads as quiet rather than broken.

---

## 15. What still blocks self-serve launch

> Recorded in full in **manual V11.1 §27** under `🔴 BLOCKING SELF-SERVE LAUNCH` and `🔴 THE EXPIRY CLIFF`. Not duplicated here — this is the onboarding-shaped summary and the manual is authoritative. **Four items, and v7.1 changed the wording of one and split another out.**

**1. 🔴 Trial nomination does not exist.** No UI, no route, nothing writes `trial_expires_at` except an admin by hand. **UPDATED v7.1:** signup now provisions plan `trial` rather than `demo`, so the truck is no longer parked on a plan value nothing could ever expire — but with `trial_expires_at` NULL meaning *not started*, **a self-serve operator still holds the full trial feature set indefinitely.** The consequence is unchanged; only the shape of the remaining fix is. **A self-serve trial cannot be STARTED.**

**2. 🔴 Four feature gates are declared and enforced nowhere.** `auto_accept`, `meal_deals`, `upsells`, `offline_protection` are in the `Feature` union and the plan sets, with no `canAccess` call anywhere. A Starter truck can use all four — and provisioning now turns `auto_accept` on for every new truck.

**3. 🔴 Both `SIGNUP_PUBLIC` variables.** The server-side one is the real gate on `/api/signup`; `NEXT_PUBLIC_SIGNUP_PUBLIC` only chooses which client path renders and is baked at BUILD time. Flipping one without the other either opens the API with no UI or shows a UI the API refuses. ⚠️ An admin session already bypasses the client flag, which is how the chain is walked before it is public — so "the flag is off" does not mean "nobody can reach it".

**4. 🔴 What happens at EXPIRY is undecided.** Split out of item 1 at v7.1, because it is a separate decision that nomination does not answer by shipping. Once `trial_expires_at` passes, `canAccess()` returns **`false` for EVERY feature** — an expired trial has **LESS** access than Starter, not Starter's feature set — and **nothing writes the `plan` value at expiry**, so the row still reads `trial` while behaving as nothing. Two questions, and answering one does not answer the other: **what feature set an expired trial falls back to**, and **what the `plan` value becomes and what writes it**. ⚠️ **This one has dates in the calendar rather than waiting on a build** — three live trials expire between August and October (manual V11.1 §4, §27). ⚠️ And it is not uniform: `hasFeature()` skips the expiry check entirely and gates `advance_preordering` on the customer order page, so an expired trial's **customers keep pre-ordering** while the operator's own screens go dark.

> ✅ **What v7.1 DID settle**, so it is not re-litigated: the NULL case. It used to deny every feature, which is why §3 / B10 ruled `'trial'` out for a pre-trial truck at all. NULL now means *not started* and grants. **The expired branch was deliberately left untouched** — changing what expiry means was never in scope for a provisioning fix, and it is item 4.

**5. 🔴 `EMAIL_FROM_ADDRESS` IS UNSET, SO SIGNUP SILENTLY COMPLETES WITHOUT SENDING THE ACTIVATION
LINK.** The signup mailer falls back to `hello@hatchgrab.com`, which the code's own comment says Brevo
will reject as unverified, and the send result is checked **only to log it** — never thrown. `/api/signup`
returns `{ ok: true }`, the operator sees a successful signup, and the activation link they are waiting
for was never sent. **Nothing surfaces anywhere.**

⚠️ **This is the same shape as the payment-domain registration script: a real failure that reports
success.** It blocks launch independently of the other four items, and it is the cheapest of them to
fix — an environment variable and a verified sender domain.

⚠️ **The admin account-creation route is unaffected** — it hand-rolls its own send from the verified
`villagefoodie.co.uk` address. So the operator-side path works today while the self-serve path does not,
which is exactly the asymmetry that would let this ship unnoticed.

**Also owed before launch, and not in the manual's blocking list:** go-live gating on `verified_at` (O11 — decided, not built), and the demo-truck retirement §10 Phase 4 specifies but nothing implements.

---

---

## 15A. The setup wizard as it stands (4 August)

> This is what an operator EXPERIENCES, start to finish. It is deliberately not organised by what was built when — that is in the nineteen session reports in `docs/`. Schema facts and invariants live in the manual (V11.1 §13, §16, §35); this is the journey. ⚠️ **Unchanged at v7.1** — the plan-model session altered what a truck's `plan` column says, not a single screen of this.

They arrive on Manage from the signup modal, already signed in, with `setup_step: 'menu'` on their truck. Everything below is gated on that: an operator who has finished setup sees none of it, and neither does a live truck importing a menu.

**1. Welcome.** One screen, alone: *Welcome to HatchGrab — {truck name} is set up. Next we'll add your menu, then your first event. You can stop and come back whenever.* ⚠️ **It is shown ALONE.** It and the wizard were briefly mounted together, the welcome in front and the wizard visible behind it; the fix was a render gate, not a z-index (manual §35). "Let's go" reveals whichever first screen was already chosen.

**2. Offer, or upload.** A demo whose own menu was extracted is asked *"Use the menu from your demo?"* with the item count — accept, or upload a different one. A **sample** demo skips straight to the upload step, because its payload is deliberately withheld (§10 Phase 4).

**3. Menu review.** The extracted items as a flat, editable list grouped by category: rename an item, correct a price, untick anything they do not want. Categories can be **renamed, added and deleted** here, and deleting one that still holds dishes makes them say where those dishes go first — items with no category are silently dropped at commit, so the question is compulsory. 🔴 **A price the AI could not read blocks Next** until it is priced or marked free; committing at £0 is indistinguishable from a deliberately free item once it is live.

**4. Extras.** Only when variants were detected: "one customisable item, or separate dishes?" per family. The default is grouped.

**5. Allergens.** Structure first (per-dish or an allergen card), then — for per-dish — a confirmation table, opening in TABLE view because a whole freshly-extracted menu is faster to review as a matrix. 🔴 **Next stays disabled until every dish is confirmed**, with "Skip Allergen setup for now" as the always-available escape. Unconfirmed dishes commit `allergens_verified = false` and are **hidden from customers entirely** in per-dish mode — not shown without allergen info, absent.

**6. Kitchen setup.** Per-category prep time and batch size, then the total capacity ceiling and its window. Left blank by provisioning **on purpose** — a ceiling nobody chose would quietly promise collection times the kitchen cannot hit. This step is the ONE atomic commit: nothing before it has been written, and abandoning the wizard here loses the review, not the account.

⚠️ **The admin create-truck route violated this until 13 August 2026**, defaulting the field to `5` and
— worse — writing `5` when the field was cleared, because an omitted key reads as "use the default".
**The route now always passes an explicit `null`** and the input was removed, bringing it into line with
this rule. A third path, Manage's add-van, still supplies nothing and inherits the column's null default.

**7. Schedule.** Three routes, one of which is the operator's own website: verify it, and the dates found open in the **same editable event modal Settings uses** — correct a venue, a date or a time, deselect what they do not want, save. The URL is enrolled for the scraper at the same time, so both promises hold. The other two routes are a photo/text import and "I'll add dates later", which is a real answer rather than a skip.

**8. A few settings to check.** Four rows, each reading its **live** value and writing through the same endpoint Settings uses: let customers cancel (and the window), auto-accept, the order-ready step, and buzzers (with a count). Every label and help string comes from one shared constant that Manage → Settings reads too, so the wizard and the settings screen cannot describe the same toggle differently. Nothing here is mandatory.

**9. Done.** A celebration, the count of what landed, one line explaining Manage versus Dashboard, and three choices: **Show me around**, **Remind me later**, or **I'll explore myself**. "Remind me later" leaves a dismissible strip at the top of Manage; the tour itself is five coach marks over the tab bar that never navigate, and can be re-opened from the bottom of Settings.

> ⚠️ **Re-entry is a supported path, not a fallback.** `setup_step` is read live, so an operator who leaves at any point and later presses "Import menu" on the Menu tab resumes the setup-aware wizard — Schedule and Settings steps included. What they do NOT get again is the welcome screen or the demo offer; those are first-arrival only.

---

## 15B. Decisions this session made — do not silently reverse

Each of these was a choice between defensible options. The reasoning matters more than the outcome, because the outcome is easy to "tidy" back.

- **Two emails, sequenced — verification at account creation, welcome on confirmation.** NOT merged into one, and NOT both at once. The verification email asks for one thing; the welcome email is the payoff for doing it, and arrives only on the FIRST successful confirmation. A second click on the same link sends nothing.
- **🔴 Neither email carries a dashboard token.** `/api/manage` authenticates on `dashboard_token` ALONE with no session, so mailing one puts a long-lived bearer credential in an inbox. The emails link to a **tokenless `/manage`**, which resolves the operator's truck from their session and forwards; a logged-out click lands on login and returns there afterwards.
- **Provisioning defaults, chosen deliberately per profile:** pre-orders **off** (a truck with no menu and no event cannot take one, and showing the deadline section already configured presents a feature as a fait accompli); **auto-accept ON** (off meant a new operator's first order sat unconfirmed until they found the dashboard, which reads as the product being broken); **notes-review ON** (what makes auto-accept safe — an order carrying an allergy note still stops for a human); **separate paid step ON**; **cash OFF** (an operator-side button layout, not a customer payment method — turning it on for a truck that has not asked puts a Cash/Card choice in front of every order).
- **The sample and upload routes share one flow and one state machine.** Only the entry point differs. ⚠️ **The two CTA copy variants stay divergent on purpose** — someone who uploaded their own menu has made something and watched it work; a sample demo has no such artifact and "save my menu" would be false (§10 Phase 4D). Do not collapse them because they nearly match.
- **Deals: the three-layer model is unchanged and working as designed** — template (`is_available`), new-event default (`apply_to_new_events`), per event (`event_deals.active`). Manual V11.1 §8. ⚠️ A finding that "Off does not hide a deal from customers" was **WRONG** and has been retracted there; do not re-derive it from the customer read path. ✅ **Re-investigated v7.1 and found SOUND — no change needed and none made.** Recorded because a model that has been challenged once and held is worth marking settled, or the same read gets re-run.
- **Upsells being live on save is the design, not a gap.** A rule is a suggestion, not a published object: it surfaces only items already on the menu and already available, and one pointing at an empty category degrades to nothing. **No `is_active` column is wanted.** ✅ **Re-confirmed v7.1 — investigated as a possible gap and found intended.**
- **🔴 Discount codes are CAPTURED ONLY.** `operators.signup_promo_code` is recorded at signup, never validated against anything, never applied, and read by nothing except a read-only admin chip. There is no list to check against **by design** — a code is a marketing artifact and nothing about it may stand between an operator and an account. An unrecognised code is a recorded fact, not an error. Deals are honoured by hand.

### Added v7.1 (5 August)

- **🔴 Self-serve provisions `trial`; the demo profile stays `demo`.** Two profiles in one file, and they diverged the moment the difference mattered. **A prospect sandbox is not a signup:** a plan that never expires is correct for a sales surface with nobody behind it and wrong for a real operator. ⚠️ **Do not "tidy" them back onto one value** — they shared one for exactly as long as it took for that to become the launch blocker. Manual V11.1 §13.
- **🔴 A NULL `trial_expires_at` means NOT STARTED, and grants.** It used to deny every feature. The reasoning is that the failure direction is one-way: the worst outcome of granting on NULL is that somebody is not charged when they might have been, whereas denying on NULL took the product away from operators who had not begun using it — during the setup wizard, which is exactly when they are deciding whether to stay. **The EXPIRED branch was deliberately left untouched in the same change**; what expiry should mean is a separate decision (§15 item 4). Manual V11.1 §4.
- **The Billing Trial column shows until the trial ENDS, not only while it runs.** The condition asks *"has this trial ended"* (NULL or future → show), not *"is it running now"*. The old question hid the column from an operator whose trial had not started — **the exact audience it exists to inform**, since they are the ones deciding whether the plan is worth having. ⚠️ **One condition, three readers** (the column array and two header spacer rows): they must evaluate the same expression or every section header sits one cell out of alignment, with both halves looking correct in isolation. Manual V11.1 §4, §35.

### Added v7.2 (13 August 2026)

- **🔴 An operator truck is created BEFORE its operator, deliberately.** `/api/manage` authenticates on
  the dashboard token alone, so a truck with a null `operator_id` can be fully built — menu, allergens,
  capacity, schedule — before any account exists. **This is not a workaround; it is the correct sequence
  for an onboarded truck**, because creating the operator is also what excludes the truck's Village
  Foodie shadow. Creating the account first opens a window in which the truck is absent from the
  consumer map with nothing to replace it.
- **The setup wizard is for self-serve. Promotion is a different journey.** An admin-created truck has
  `setup_step: null`, which means *not in setup* and never *at step 1* — reading it the other way would
  sweep existing live operators into an onboarding flow. **Such a truck never sees the wizard, the
  welcome screen, or the "Setup mode" indicator**, and that is correct. ⚠️ **But it also never gets the
  wizard's writes**, so `allergen_display_mode` stays null and behaves as per-dish — hiding every
  unverified dish from customers while showing them all to the operator. **Set it, then check the
  CUSTOMER url; the dashboard cannot show you this failure.**

---

---

## 15C. The front door was shut for a month (v8.0, 3 September 2026)

> Moved here from `docs/reference-manual.md` §51 on 3 September 2026. It was written into the manual
> because the delta that carried it named its target by heading text and no heading of that name
> existed — **and the author did not know this document existed.** The invariant it yields stays in the
> manual (§35, *"A VALIDATION ADDED TO A ROUTE IS A CHANGE TO THE FORM THAT POSTS TO IT"*); the journey
> is here. **Cross-reference rather than restate**, per this file's own header.

### 🔴 THE FRONT DOOR WAS SHUT FOR A MONTH, AND THE FAILURE MODE WAS A TRAP

**OBSERVED.** A required field was added to the server six hours after the form was last edited. The
commit touched twelve files and not the form. **The result: an error that was specific, accurate and
unactionable** — it named a field the page had never displayed and offered no way to supply it.

🔴 **THE SHAPE THAT MADE IT SERIOUS: THE FAILURE CAME AFTER ACCOUNT CREATION.** So each attempt left an
operator with an account, no truck, and an email address permanently spent. Logging in returned them to
the same form. **The loop was closed in every direction** — including the working demo path, which
begins by creating an account and therefore refuses an email that already exists.

🔴 **AND NO ADMIN ROUTE COULD REPAIR IT.** Creating an operator fails on an existing email; creating a
truck binds no operator. **An admin could delete the account or run SQL. Nothing else.**

**THE RULE THIS YIELDS: when a validation is added to a route, the form that posts to it is part of the
change.** And **a flow that can fail after creating durable state must have a route back in** — not a
redirect to the step that failed.

### ⚠️ THE WIZARD IS BUILT. IT NEVER CHECKS ITS OWN RESULT.

Nine screens end to end. The menu importer, the allergen flow, the capacity model, the schedule scraper
and the terminal screen are all real and carefully reasoned.

🔴 **But every step after naming the truck is skippable, and the review screen is a confirmation rather
than a check.** An operator who skipped the schedule step is congratulated in the same words as one who
did everything. **"You're all set" is unconditional.**

**And two things the platform needs are ABSENT rather than skippable:**

- 🔴 **The ordering link and QR code are never surfaced by the wizard.** A truck can complete setup with a
  menu and an event and still have no customer able to reach it.
- 🔴 **Payment setup is never mentioned.** Not blocking — pay-at-hatch needs none — but an operator who
  signed up for online payments finishes onboarding without learning the step exists.

⚠️ **The schedule step has one working route.** Scraping a URL writes real events; the manual-entry route
is copy and a Continue button that skips. **There is no "add one event" in the wizard.**

### The two entry paths are not equivalent

The demo path collects phone, messaging preference, first and last name and cuisine, and arrives with an
extracted menu. **The direct path collects a truck name and a phone.** The difference is not one field:
the contact method, the messaging number and the truck emoji are all derived from what the demo path
asks for, so the direct path lands a named shell.

⚠️ **The public entry points now use the demo path.** The direct route remains as the destination for an
operator who already has an account and no truck — **which is what it was always for**, and its own
comment says so.

---

⚠️ **The eventless-order finding that sat beside these in the manual did NOT move here.** It is not an
onboarding defect — it applies to any truck with no event for a date, however it got there — and it now
lives in **manual §15 (Events and venues)**. It remains the highest-priority unverified claim on the
platform.
