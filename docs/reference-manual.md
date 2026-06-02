# HatchGrab Engineering Reference Manual · V5

**HatchGrab**  
Engineering Reference Manual  
*Village Foodie · Food Truck Ordering Platform*

**Version 5.0** · June 2026

*This document defines the rules, conventions, and architecture decisions for the HatchGrab platform. It is the source of truth for any coding session and must be consulted before making structural changes.*

---

## Changelog

### V5.0 — June 2026 (this session)

Pre-trial polish-and-plumbing session. Establishes the shared operator header and sticky layout, finishes the event lifecycle (auto-select, Start/Restart, recoverable close), bridges scraped and emailed events into the operator schedule, rebuilds the operator emails on the shared formatter, and clears a batch of auth, security, and mobile issues ahead of the first trial truck. Key changes relative to V4:

- **Shared AppHeader + brand colours** — new `components/shared/AppHeader.tsx` (Village Foodie logo left, truck logo centre, right slot via children) used by ALL operator pages, and `lib/brand.ts` holding `HEADER_BG` / `PAGE_BG` / `TABS_BG` (all `slate-900`). Resolved the header/tabs colour mismatch.
- **Sticky header, tabs, and event bar** — AppHeader `sticky top-0` (51px tall), tabs sticky below it, dashboard event bar sticky below the tabs. The operator never loses the header or event context while scrolling.
- **Dashboard event bar** — a slim bar below the tabs (Orders and Add Order tabs only) showing venue, times, status, Change, and a `···` menu. Bi-directional event sync with the Add Order panel via `controlledEvent` / `onEventChange`.
- **Auto-event selection on dashboard load** — the dashboard now auto-selects the best event (open today, else upcoming today, else next upcoming any date) once on load, never overriding a manual choice. `activeEvent` reads from the full `upcomingEvents` list, not just today.
- **Start Event / Restart Event wording** — replaced "Open for orders" / "Go live" throughout the dashboard, event bar, and `···` menu. Status labels are now ● Live / ⏸ Paused / ● Closed. Toasts: "Event started" / "Event restarted".
- **Closed events are recoverable** — closing an event sets status `closed` (only an open event can be closed); the picker now shows closed events with a badge and a Restart Event button, and the server open action accepts `confirmed` OR `closed`. An accidental close is no longer permanent.
- **ASAP base-time rule clarified** — the Add Order panel computes ASAP as `max(now + prep, eventStart)`, never `eventStart + prep`. Prep time is not added on top of a future event start.
- **Scraper → HatchGrab bridge** — `inbound-schedule` now promotes events to `truck_events` (status `unconfirmed`, source `scraper`) for trucks linked via `discovery_trucks.hatchgrab_truck_id`. All event sources (scraper, email, manual) now flow to one place; the truck confirms.
- **Operator email rebuild** — operator-confirm and slot-change emails now use the shared `formatConfirmationEmail` (was two bespoke inline HTML emails missing modifiers, deals, venue, cancel link, and HatchGrab branding). Added `slotAdjustedFrom` param.
- **Customer cancel page** — `app/order/[id]/manage` with `/api/orders/cancel` and `/api/orders/[id]`. Cancel URL carries `?truck=[slug]` to avoid per-truck order-ID collisions.
- **Settings auto-save** — the Settings tab Save button is gone; text fields save on blur, toggles and dropdowns on change, via `saveFormField()`.
- **Truck emoji** — `trucks.truck_emoji` column (default 🍕) with a categorised picker in Settings; used as the Menu tab icon.
- **Team role enforcement** — owner edits everyone, manager edits/invites staff only, staff edits only self; enforced server-side in the manage API and client-side via `canEdit` / `canRemove` / `invitableRoles`.
- **Delete category** — a 🗑 control on the category header soft-deletes the category and its items (`bulk_delete_items`), with an item-count confirmation. `bulk_delete_items` is staff-blocked.
- **`is_test` scope corrected** — `is_test` now ONLY filters test trucks from the public discovery map. It must never gate operator-facing features; the erroneous Billing-tab guard was removed.
- **Auth hardening** — password-reset and email-change flows now check Brevo sends and roll back on failure; email change does a pre-flight duplicate check and forces sign-out on completion; a cancel-pending-change flow was added. Login debug logging removed.
- **Discovery map security** — `dashboard_token` removed from all public API responses; the customer order URL is `/trucks/[slug]/order`; operator events are HatchGrab-only and never shown on the public Village Foodie map.
- **Geocoding fallback** — manual events geocode via Gemini with an `api.postcodes.io` postcode fallback; the operator is warned on failure and a Fix button re-geocodes events with null coordinates.
- **Slug + emoji columns** — `trucks` gained `slug` (unique, populated from name) and `truck_emoji`.
- **Order card contact button** — a Contact control next to the customer name reveals email (`mailto:`) and phone (`tel:`) inline; hidden for walk-ups with no details.
- **iOS auto-zoom fix** — viewport set to `device-width / initialScale: 1`; inputs/selects/textareas locked to `16px` on mobile so Safari no longer zooms on focus.
- **Meta social webhooks scaffolded** — verification + placeholder endpoints at `/api/webhooks/meta/whatsapp`, `/api/webhooks/messenger`, `/api/webhooks/instagram`. `META_WEBHOOK_VERIFY_TOKEN` env var required. Existing Twilio handler at `/api/webhooks/whatsapp` must NOT be overwritten.

### V4.0 — May 2026

Hardening pass between V3 and trial. Consolidates utilities, fixes auth and wake lock bugs, builds out the Reports tab with tier-gated analytics, and establishes the single dropdown component pattern. Key changes relative to V3:

- **New shared utilities** — `lib/time-utils.ts` (formatTime, canonical time display) and `lib/modifier-utils.ts` (isModifierAvailable, used across customer and operator surfaces).
- **`lib/order-utils.ts` is server-only** and must never be imported in client components — it references `SUPABASE_SERVICE_ROLE_KEY`.
- **Sign-out fixed** — was clearing in-memory auth only, leaving the SSR session cookie intact and silently re-authenticating users. Now uses `createSupabaseBrowserClient()` from `@supabase/ssr` with a hard redirect to `/login`.
- **Wake lock fixed** — browser auto-releases on page-hidden events; now re-acquires on visibility return and on the lock's release event. Older Safari shows a compatibility warning.
- **UserMenu consolidated** — was dashboard-only, now used on the manage page too. Single dropdown component everywhere with prop-driven sections. No inline dropdowns anywhere.
- **OrderLineItem shared component** — used by operator order cards, Add Order panel, and customer order confirmation. Variant prop controls operator vs customer rendering.
- **Menu API `?dashboard=1` flag** — dashboard surfaces see all modifier options with their `available` field; customers see only available options with the field stripped. Fixes the stock toggle's stale-state bug and the operator's previously-filtered modifier list.
- **Reports tab built** — date-range filter (Pro+), event filter (all tiers), orders/items toggle, CSV export (all tiers), revenue breakdown (Pro+). Pro placeholder card sells the locked features.
- **Modifier availability rule** — unavailable modifiers are HIDDEN everywhere (customer and operator), unlike main items which show "Sold out" crossed. Modifiers appear contextually in popups so hiding is cleaner UX.
- **Tab rename** — "Modifiers" became "Extras & Upsells" (icon ⚡ unchanged). Restructured into Upsells + Custom Extras sections.
- **Loyalty stamp cards** added to pricing matrix as Max coming-soon. V1 spec frozen in code comments — do not build until instructed.
- **Grace period banner** replaces hard block — events ended >30 min no longer disable the Confirm order button; a passive amber banner reminds the operator instead.
- **All menu categories collapsed by default** on Manage page open.
- **Menu tab mobile header** restructured into three rows for clarity at 375px.

### V3.0 — May 2026

Major update following an extended build session. Adds operator account model, staff access, email verification, the deals-on-events system, WhatsApp logging, and numerous UX and naming decisions. Key changes relative to V2:

- **Email provider is now Brevo**, not Resend. All transactional email sends via Brevo.
- **HatchGrab email domain** — `hello@hatchgrab.com` is the operator-facing sender. Set via `NEXT_PUBLIC_SUPPORT_EMAIL`. Do NOT fall back to villagefoodie.co.uk.
- **Trial is 3 months** for Pro/Max early signups. Trial maps to MAX features plus Pay-at-Hatch online ordering.
- **Personal vs business contact split** — `operators` table now has `first_name`, `last_name`, `phone`. Personal profile edited in Team tab. Business contact stays in Settings.
- **Staff access (Phase 3) is LIVE** — `truck_users` with owner/manager/staff roles, `truck_user_vans` for per-vehicle access, invite flow.
- **Manual events auto-confirm** — events created in the manage page are always confirmed immediately. Only scraped events stay unconfirmed.
- **Deals-on-events system** — `apply_to_new_events` default plus per-event override via `event_deals`, with stock-aware auto-hide on the customer order page.
- **WhatsApp interaction logging** — `whatsapp_logs` table, `possible_miss` flag, surfaced in Reports tab.
- **Naming convention** — UI uses "truck" for physical vehicles (was "van"/"vehicle"); DB tables stay `truck_vans` / `truck_user_vans`.
- **Billing tab** — full pricing matrix lives inside Manage (owner-only) with single source of truth `lib/plan-features.ts`. Old `/account` page deleted.
- **ASAP slot calculation is event-date aware** — future events compute ASAP from event start time, not now. Fixed UTC midnight date-parse bug.

### V2.0 — May 2026

Merged earlier engineering-decisions document into single reference. Starter became permanently free. Trial became a distinct plan tier. Capacitor native wrapper designated a pre-trial deliverable. Three-stage offline progression documented.

### V1.0 — Earlier sessions

Initial documentation of lib/ structure, order calculation rules, customer page UX, prep time logic, pricing strategy, and forward-looking architecture.

---

## 1. Purpose of this document

This manual exists to prevent regressions. Every coding session loses context. Without a written record of how features work, why decisions were made, and what rules must not be broken, the codebase drifts. Patterns get duplicated. Conventions get abandoned. Bugs get reintroduced.

Read this before every coding session. Update it after every meaningful change. When a coding chat is uncertain about how a feature should behave, the answer is in here.

### How to use this manual

- Before adding any new feature, search this manual for related rules.
- When auditing existing code for DRY compliance, this manual defines what should be shared.
- When making a UX decision, check whether the rule already exists here.
- When a feature seems to contradict this manual, the manual wins. Either update the code or update the manual — never let them disagree silently.

> **CRITICAL** — If a coding session produces code that violates rules in this manual, that is a regression. Either the rule changes (with explicit agreement) or the code changes. The two must never diverge.

---

## 2. Architecture overview

### Platform identity

- **Village Foodie** — the discovery map, weekly newsletter, and "find food trucks near me" experience. Customer-facing. villagefoodie.co.uk.
- **HatchGrab** — the iPad KDS, operator dashboard, menu management, order flow, and billing. Truck-facing. hatchgrab.com.

When in doubt about naming: customer-facing surfaces use Village Foodie branding; operator-facing surfaces use HatchGrab branding.

### Tech stack

- **Frontend** — Next.js with TypeScript, Tailwind CSS, deployed to Vercel.
- **Database** — Supabase (PostgreSQL). Project ref `ffphgwonshgxamtvefcv`. Token-based access for operator surfaces, Supabase Auth for operator/staff logins.
- **Realtime** — Supabase realtime channels (`postgres_changes`) for KDS queue updates, with 60s polling fallback.
- **Email** — Brevo for all transactional email (changed from Resend in V3).
- **Native wrapper** — Capacitor around the existing Next.js app. App ID `com.hatchgrab.app`, points to `https://www.hatchgrab.com`. Native modules only for hardware (printer) and OS features (background notifications, offline detection, screen wake).
- **Scraper** — Google Apps Script (not in repo) processes Drive screenshots and vendor emails via Gemini, mirrors events to Supabase via `/api/inbound-schedule`. Subject to the 6-minute Apps Script execution limit — needs a time guard.

### Key surfaces

- **Discovery map (`/`)** — Village Foodie public site, map of trucks and events. No login.
- **Customer order page (`/trucks/[slug]/order`)** — pre-orders or pay-at-hatch orders. No login. This is the **canonical customer-facing order URL**. Never use `dashboard_token` in a public-facing URL.
- **Truck dashboard (`/dashboard/[token]`)** — operator order management. Token + auth. Uses shared `AppHeader` (see Section 3). Tabs: Orders, + Add order, Menu & Stock. Below the tabs on Orders and Add Order: a sticky event bar showing the active event, with Change and `···` controls.
- **iPad KDS (`/kds/[kds_token]`)** — kitchen display system, per vehicle. Opened from the dashboard header.
- **Manage page (`/manage/[token]`)** — operator settings, menu, schedule, team, billing. Uses shared `AppHeader`. Tabs: Menu, Schedule, Deals, Extras & Upsells, Reports, Team, Settings, Billing.
- **Admin console (`/admin`)** — platform admin. Admin secret auth.
- **Verify email (`/verify-email`)** — completes an operator email change via token. Not auth-gated.

---

## 3. DRY — Don't Repeat Yourself

DRY is the most important architectural principle in this codebase. Every audit before every feature must check for DRY violations.

> **THE RULE** — If the same logic, value, or pattern appears in two places, it belongs in one place. Audit before adding. Extract before duplicating. Use props before re-deriving.

### Shared operator header — AppHeader (V5)

`components/shared/AppHeader.tsx` is the single operator-facing page header used by the dashboard, the manage page, and any future operator surface. Layout: Village Foodie logo left (links to `/`), truck logo and name centred, right-hand slot via `children` (typically the UserMenu avatar dropdown). It is `bg-slate-900 sticky top-0 z-50`. **Pages must not build their own inline header.**

Colour constants live in `lib/brand.ts`: `HEADER_BG`, `PAGE_BG`, and `TABS_BG` (all `slate-900`). The V5 header/tabs mismatch was caused by tabs being `slate-800` while the header was `slate-900`; both now reference the shared constant.

**Sticky layout contract:**
- AppHeader: `sticky top-0 z-50` — 51px tall
- Tabs bar: `sticky top-[51px] z-40`
- Dashboard event bar (Orders + Add Order tabs only): `sticky top-[95px] z-30`
- Manage page tabs: `sticky top-[51px] z-40`

Any new operator page must reuse `AppHeader` and `slate-900` tabs (`lib/brand.ts`) — never re-derive these values inline.

### Shared calculation libraries — lib/

- `lib/order-calculations.ts` — order totals, deal pricing, discount application.
- `lib/basket-utils.ts` — basket add/remove, deal cleanup, grouping by category.
- `lib/deal-utils.ts` — bundle slot category extraction, deal original price calculation.
- `lib/slot-utils.ts` — ASAP slot selection (event-date aware), future-time validation.
- `lib/slot-bookings.ts` — production slot operations, `normaliseOrderLines`.
- `lib/slot-capacity.ts` — `canFitInProductionSlot`.
- `lib/prep-utils.ts` — prep time, category configs, queue-aware ready time, `buildCatConfigs`.
- `lib/plan-features.ts` — **SINGLE SOURCE OF TRUTH** for plan pricing, feature matrix, footnotes. Imported by both the Billing tab and the admin console.
- `lib/features.ts` / `lib/useFeatures.ts` — plan tier feature map and `canAccess()`/`useFeatures()` for gating.
- `lib/whatsapp-classifier.ts` — message classification and schedule-response prompt building.
- `lib/time-utils.ts` **(V4)** — canonical time formatter. `formatTime(t)` strips seconds from `HH:MM:SS` to `HH:MM`. **This is the only implementation.** Never inline `t.slice(0,5)` or write a parallel formatter.
- `lib/modifier-utils.ts` **(V4)** — client-safe modifier helpers. `isModifierAvailable(opt)` returns `opt.available !== false`. Used to filter modifier options everywhere.
- `lib/order-utils.ts` — **SERVER-ONLY**. Exports `nextOrderId(truckId)`. Imports `SUPABASE_SERVICE_ROLE_KEY` — importing this in a client component will fail the build.
- `lib/brand.ts` **(V5)** — `HEADER_BG`, `PAGE_BG`, `TABS_BG` colour constants. Single source of truth for the operator-facing dark header palette.

> **RULE** — Business calculations live in `lib/`. Display-only helpers may live with the components they serve. When unsure, put it in `lib/`.

### canAccess vs hasFeature (V4)

- `canAccess(plan, feature, featureOverrides, trialExpiresAt)` — use this for **ALL UI gates**. Respects per-truck overrides and trial expiry.
- `hasFeature(plan, feature)` — plan-only check, no overrides. Use only where override/trial logic is irrelevant.

When in doubt, use `canAccess()`.

### Single dropdown component (V4)

`components/dashboard/UserMenu.tsx` is the single avatar dropdown used by every operator-facing page. **Canonical dropdown order:**

1. Identity block (truck name bold, operator first name muted) — always
2. Screen on toggle — mobile only, if `showScreenToggle`
3. Order link / QR code / Kitchen screen — mobile only, if `showOrderUtilities`
4. ⚙️ Manage — if `showManageLink`
5. ← Orders dashboard — mobile only, if `showDashboardLink`
6. Sign out (red) — always

**No inline dropdowns anywhere.** Any future page must use `UserMenu` with appropriate flag props.

### Single order-line renderer (V4)

`components/dashboard/OrderLineItem.tsx` renders a priced line item across all surfaces. `variant` prop (`'operator' | 'customer'`) controls rendering. Props include `nameSuffix` for Edit/Customise button slot and `rightSlot` for price editor.

### Shared column class constants (V4)

Multi-column list views define shared Tailwind constants once at the top of the component. Both Orders and Items views in Reports use these — never inline the same Tailwind string twice. See Section 19 for the canonical set.

### Feature gating

All feature access goes through `canAccess()` from `lib/features.ts`. **Forbidden:** `if (plan === 'pro')`, `if (truck.plan !== 'starter')`, or hardcoded feature lists outside `lib/features.ts`.

### Plan pricing and feature matrix

`lib/plan-features.ts` is the single source of truth. Both the Billing tab and the admin console import it. Never hardcode pricing or feature rows in a component.

### DRY audit before every feature

1. Search the codebase for related logic that already exists.
2. Identify whether the new feature should extend an existing pattern or create a new one.
3. Paste the existing structure for review before writing new code.
4. Make extraction the default; duplication requires explicit justification.

---

## 4. Plan tiers and feature gating

### Four plans

- **Starter (Free)** — Walk-up orders, KDS, dashboard, menu, deals, sold-out toggle, stock countdown, Pay-at-Hatch online ordering. 0% platform fee.
- **Pro (£29/mo)** — Everything in Starter, plus online payments (Stripe Connect), advance pre-ordering, time slot selection, smart batch pacing, auto-accept, advanced reporting, branded QR code, Instagram/Messenger auto-replies, offline sync protection. 0.99% platform fee plus card processing.
- **Max (£49/mo)** — Everything in Pro, plus unlimited WhatsApp auto-replies, kitchen ticket printing, multi-device kitchen sync, multi-user access, customer-facing display (coming soon), festival pricing (coming soon), digital loyalty stamp cards (coming soon).
- **Trial** — All MAX features plus Pay-at-Hatch online ordering. Default 3 months. Expires to Starter.

### Pricing matrix

| Feature | Starter (Free) | Pro (£29) | Max (£49) |
|---|---|---|---|
| Walk-up orders — platform fee | 0% | 0% | 0% |
| Online orders — platform fee | Pay at Hatch | 0.99% + card fee | 0.99% + card fee |
| Discovery map listing | ✓ | ✓ | ✓ |
| Universal web dashboard | ✓ | ✓ | ✓ |
| iPad kitchen app | ✓ | ✓ | ✓ |
| QR code menu & ordering | ✓ | ✓ | ✓ |
| Meal deals & upsells | ✓ | ✓ | ✓ |
| Walk-up order processing | ✓ | ✓ | ✓ |
| Online ordering — Pay at Hatch | ✓ | — | — |
| Instant sold-out toggle | ✓ | ✓ | ✓ |
| Automated stock countdown | ✓ | ✓ | ✓ |
| Offline sync protection | — | ✓ | ✓ |
| Online payments (Stripe Connect) | — | ✓ | ✓ |
| Advance pre-ordering | — | ✓ | ✓ |
| Customer time slot selection | — | ✓ | ✓ |
| Smart batch pacing | — | ✓ | ✓ |
| Auto-accept online orders | — | ✓ | ✓ |
| Advanced reporting (date range, breakdowns) | — | ✓ | ✓ |
| Branded QR code | — | ✓ | ✓ |
| Instagram & Messenger auto-replies | — | ✓ | ✓ |
| Unlimited WhatsApp auto-replies | — | — | ✓ |
| Kitchen ticket printing | — | — | ✓ |
| Multi-device kitchen sync | — | — | ✓ |
| Multi-user access | — | — | ✓ |
| Digital loyalty stamp cards | — | — | Coming soon |
| Customer-facing display | — | — | Coming soon |
| Event & festival pricing | — | — | Coming soon |

### Pricing rationale

- Starter free reduces signup friction.
- £29 Pro sits below the £30 psychological threshold.
- £20 gap between Pro and Max is deliberately small to encourage upgrades.
- Walk-up orders have 0% platform fee on all tiers.

### Feature gating rules

- Static feature map lives in `lib/features.ts`; pricing/matrix in `lib/plan-features.ts`.
- Resolution order in `canAccess()`: per-truck override → trial expiry check → plan tier.
- Per-truck overrides stored in `trucks.feature_overrides` (JSONB), edited in admin.
- Trial expiry checked against `trucks.trial_expires_at`; expired trials silently drop to Starter.
- UI uses `useFeatures(truck)`; non-React code uses `canAccess()` directly.

### Billing tab

- Billing lives inside the Manage page as an owner-only tab.
- **Visible to all operators including trial AND test accounts.** (V5 correction: a V4-era guard that hid Billing for `is_test = true` accounts was a bug and was removed. See `is_test` scope below.)
- Trial maps to the MAX column; header shows "Free trial (Max features)" with trial end date.
- Transaction fees show actual values (0%, 0.99% + card fee, Pay at Hatch), not checkmarks.
- Upgrade buttons open an email-to-upgrade modal until Stripe Connect billing is built.

### Billing tab layout by plan (V5)

The Billing tab restructures itself based on the truck's plan:
- **Trial / Starter** — upgrade card first, then billing & payments, then the full pricing matrix. The whole matrix is visible because these operators are deciding what to buy.
- **Pro / Max** — quiet current-plan summary first, then a collapsible "Compare all plans" section (collapsed by default), then billing & payments. Paying operators don't need the sales matrix in their face.

### Trial conversion prompts (V5)

When `plan === 'trial'`, the Manage page defaults to the Billing tab on load (fires after any `?tab=` URL param, takes priority). A once-per-day reminder popup (guarded by `localStorage` flag `hg_trial_reminder_shown` + date check) shows the trial end date with an X to dismiss and an "Upgrade here" link that switches to Billing. Trial copy frames the value as full Max features + Pay-at-Hatch, free until trial ends, reverting to Starter if not upgraded.

### `is_test` scope (V5)

> **RULE** — `is_test` has exactly ONE effect: filtering test trucks out of the public discovery map (Village Foodie). It must NEVER gate an operator-facing feature. Test accounts (including the Test Kitchen truck) see the full operator product, Billing tab included. A V4-era guard that hid Billing for `is_test` accounts was a bug and was removed in V5.

### Cook screen — Max only

The cook screen (`?view=cook`) is Max-only because a second physical device is required and Starter/Pro enforce one active KDS session. Hide the Cook button from Pro even though it could technically work on one device.

### Trial behaviour

- No payment details required at signup.
- Duration set per-truck in admin console (3 months for early signups).
- Warning banner on KDS in last 7 days of trial.
- Drops to Starter automatically on expiry — no lock-out, no data loss.

### FeatureValue type (V4)

`FeatureValue = boolean | 'coming_soon'`. Set `'coming_soon'` directly — Billing tab renders it as a "Coming soon" badge automatically.

### Loyalty stamp cards (Max, coming soon) — V4

V1 spec frozen in code comments in `lib/plan-features.ts`. Schema: `loyalty_cards(id, truck_id, customer_email, customer_phone, stamps_earned, stamps_redeemed, created_at, last_stamp_at)`. V1 rule: 1 stamp per order (not per item).

> **RULE** — Do NOT build flexible stamp criteria until V1 is live and operators request it.

### No premium badges on customer surfaces

> **CRITICAL RULE** — Customers must NEVER see "Premium" badges, upsell language, or any indication that features are gated behind subscription tiers. Premium features are silently enabled or disabled per truck.

---

## 5. Order management

### Order lifecycle

- `pending` — customer placed order, not yet confirmed. Only set by the customer path when `truck.auto_accept` is false.
- `confirmed` — accepted into the queue. Default for manual orders.
- `cooking` — optional intermediate state for two-step prep tracking.
- `ready` — food prepared, waiting for collection. Customer notified by email automatically.
- `collected` — customer collected and paid. Disappears from active views.
- `cancelled / rejected` — will not be fulfilled. Removed from active views.

### Walk-up vs customer orders

> **CRITICAL DISTINCTION** — Walk-up orders and customer orders are two different flows with intentionally different behaviour. They must not be merged.

**Walk-up (manual) orders:**
- Created by operator via Add Order panel. Submits to `/api/dashboard/action` with `action="manual"`.
- Customer name optional; defaults to "Walk-up". Email and phone behind a "+ Add email / phone" toggle.
- Auto-confirms immediately. Button label: "Confirm order". Items add instantly at base price; modifiers added by tapping the cart line.

**Customer self-orders:**
- Created via `/trucks/[slug]/order`. Submits to `/api/orders/submit`.
- Customer name required; email required; phone optional (no asterisk, no submit guard).
- Server-side total validation against DB prices (untrusted client).
- Lands pending; auto-confirms only if `truck.auto_accept` and slot capacity allows.
- Button label: "Place order". Modifier popup on item tap.

### Pause and extra wait

- **Pause orders:** stops all customer ordering until resumed. Confirmation dialog before activating.
- **Extra wait:** global delay on all collection estimates, 10-minute increments.
- Both controls live in the KDS header AND mobile dashboard — same API calls, no duplication.

---

## 6. Prep time and queue logic

**FORMULA:** `totalQty = queueByCat[cat] + newByCat[cat]; finalBatch = ceil(totalQty / batchSize); prepSecs = finalBatch × prepSecsPerBatch`

`calcQueueAwareReadySecs` in `lib/prep-utils.ts` is the **only implementation**.

### Batch logic

New items are placed AFTER the existing queue. If batch 2 has space, new items slot in alongside it. If full, they spill into batch 3. Kitchens do not restart a partially-filled batch.

### Categories cook in parallel

Ready time is the MAX across categories, not the sum. Pizza 8 min + sides 2 min = ready at 8 min.

### Customer page is a pre-order context

ASAP is calculated from `event.start_time`, not `new Date()`. A customer pre-ordering at 10am for a 17:00 event sees ASAP = 17:00 + prep.

### ASAP queue-aware calculation (V4)

Single formula everywhere — `calcQueueAwareReadySecs`. The `queueByCat` input comes from the `/api/slots` API (which includes `modified` status orders) — never rebuild it from the orders prop. Dropdown and sub-label must always agree.

### ASAP base time — never add prep on top of event start (V5)

**FORMULA:** `ASAP base = max(now + totalSecs, eventStart). Never eventStart + totalSecs.`

In `components/dashboard/AddOrderPanel.tsx`, ASAP is the later of `(now + prep)` and the event start — not the event start with prep added on top. For a future event, ASAP is simply the event start (prep runs during the lead time); for an event already underway, ASAP is `now + prep`. The earlier bug pushed ASAP needlessly late for future events.

### Time rounding and display

- Customer-facing ASAP rounds to NEAREST 5 minutes.
- Truck dashboard shows exact ready times.
- All times display as `HH:MM` — seconds stripped via `formatTime()` from `lib/time-utils.ts`. **This is the canonical formatter. Never inline `t.slice(0,5)` or write a parallel implementation.**

### UTC parse bug prevention

Always use `new Date(\`${date}T${time}\`)` for local-time parse. **Never** `new Date('YYYY-MM-DD')` then `setHours` — parses as UTC midnight, breaks in BST and any non-UTC timezone.

---

## 7. Customer order page UX

### Collection time default

ASAP is auto-selected by default (`asapChosen` initialises to `true`). ASAP and Choose Time remain mutually exclusive.

### Event lookup pattern (V4)

APIs that accept truck identifiers must handle both slug (customer-side) and UUID (dashboard-side). Try slug first, fall back to UUID.

### Past events filtered (V4)

`isPastEvent` uses local-time parse: `new Date(\`${event_date}T${end_time}\`) < new Date()`. Past events show a grey "Finished" badge on the Schedule tab regardless of database status.

### Phone optional (V4)

Phone is never required for customer self-orders. Submit guard checks name and email only. No asterisk on the phone field.

### Item notes — specialInstructions (V4)

Categories have an `allow_notes` boolean (default false). When enabled:
- Items with no modifiers show a "+ Add note" affordance on the basket line.
- Items with modifiers show the note field at the bottom of the modifier popup.
- The operator Add Order panel ALWAYS shows the note field regardless of category setting.
- Field name: `specialInstructions` end-to-end (canonical).
- Use the shared `ItemNoteInput` component (compact + default variants).

### Footer and layout

- Footer `padding-bottom` uses `iOS safe-area-inset-bottom`.
- Dynamic footer height via `ResizeObserver` sets main content padding.
- No discount code input on the customer page.
- Categories in the truck's drag-and-drop sort order, not alphabetical.

---

## 8. Deal management

### Stock-aware auto-hide

> **RULE** — A deal is shown on the customer order page only if it is active for the event AND every slot category has at least one available item. If any slot has no available item, the deal is hidden from customers automatically but still shown to the operator with a "currently hidden" warning.

`?operator=true` returns all deals with `stock_warning`; customers receive only available deals.

### How deals render on tickets

**Window view:** Deal renders as a SINGLE priced line: "🎁 Lunch Deal £12.00". Constituent items indented below. Standalone items above the deals block.

**Cook view:** No deal labels, no prices. All items merged into category groups.

### Quantity expansion in DealsModal (V4)

DealsModal flat-maps `expandedBasketOpts` by quantity, giving each unit a unique key `${cartKey}::unit{n}`. `stripUnit()` helper at the boundary. `takenByOtherSlots` tracks full unit keys. DealsModal is shared between Add Order panel and customer page.

### Inline price editing on deal headers (V4)

Operators can override the deal price directly on the order card. Price input must have `[appearance:textfield]` (no spinner arrows). Same `font-bold text-slate-900 text-lg` weight as standalone item names.

---

## 9. Kitchen Display System (KDS) rules

### View modes

- `solo` — mobile/web dashboard view. Compact, expand/collapse, all controls.
- `window` — iPad KDS window mode. Full ticket detail, prices visible, Mark paid & done.
- `cook` — iPad KDS cook mode. No prices, no deal labels, larger tap targets, Ready button.

### Urgency colour logic

`getCombinedUrgency(slotTime, createdAt, status)`: ready = solid green (overrides all); cooking = amber; otherwise take the MORE urgent of slot-relative and age-based urgency (new <5min, ok 5-15, warn 15-30, late 30+).

### Price alignment

All prices in a card right-align to the same column edge: `tabular-nums` on price spans; `w-16 flex-shrink-0 text-right` on price column; `flex-1 min-w-0` on item name.

### Allergy and notes

- Item special instructions shown italic below the item line.
- Order-level notes shown as a separate red block at the bottom, always visible, never truncated.
- Cook view shows notes too — **allergy information must never be hidden from the cook.**

### Customer contact on the order card (V5)

`OrderCard` shows a Contact control inline next to the customer name when the order has an email or phone. Tapping reveals the email (`mailto:`) and phone (`tel:`) inline below the name; tapping again collapses. Renders on all view modes (solo, window, cook). Hidden entirely for walk-up orders with no contact details. `customer_email` and `customer_phone` must be included in the dashboard orders query and the `Order` type.

---

## 10. Add Order panel

### Layout

- **iPad (md: and above)** — split screen. Menu left, live cart and submit right.
- **Phone (below md:)** — single column LIST layout. Sticky bottom bar with "Review order →" button opening a bottom sheet.

### Fast-tap rules

- Tapping an item adds it immediately at base price — no popup, no confirmation.
- Tapping the same item increments quantity. Modifiers added by tapping the cart line.
- This is the Square/Toast POS pattern.

### Event selection

- Lists all upcoming confirmed events (and closed events — recoverable via Restart Event), not just today's.
- Auto-selects today's event if there is exactly one.
- ASAP is computed from the selected event's date/time.

### Event bar and in-panel event box (V5)

The active event is shown in the sticky event bar below the tabs. The Add Order panel keeps its own event box **only while the event is not yet live** — that box carries the Start Event action. Once the event `status === 'open'`, the in-panel box is hidden (`manualEvent?.status !== 'open'`) and the sticky header bar is the single source of event context. This prevents the event details showing twice.

Event selection is bi-directional: the dashboard owns `selectedEventId` as the single source of truth and passes the resolved event into the panel via `controlledEvent`, with `onEventChange` flowing changes back up. The Change button in the event bar opens the existing event picker modal — not an inline dropdown.

### Auto-event selection on dashboard load (V5)

The dashboard auto-selects the most relevant event once on load. Priority:
1. An event currently open today (started, not ended)
2. An upcoming event today not yet started
3. The next upcoming event on any future date

A guard ensures this runs only once and never overrides a manual selection. `activeEvent` resolves from the full `upcomingEvents` list, not `todayEvents` — otherwise a future-selected event reads as `undefined` and the bar shows "No event selected". Opening an event also updates `upcomingEvents` so the Start Event control disappears immediately.

### Grace period banner (V4)

Orders for an event whose end time has passed >30 min show a passive amber banner. The Confirm order button is **NOT disabled**. No per-order acknowledgement required. Customer-side grace filtering is unchanged.

### Modifier rendering

Calls `/api/menu/[truckId]?dashboard=1`. Options where `available === false` are HIDDEN via `isModifierAvailable` from `lib/modifier-utils.ts`.

---

## 11. Native app and offline architecture

> **DECISION** — A native wrapper using Capacitor must be built BEFORE any trial begins.

Capacitor wrapper (`com.hatchgrab.app`) around the existing Next.js app at `https://www.hatchgrab.com`. Native code only for: offline detection, local order storage, background sound, screen wake, and Bluetooth printer (Max, post-trial).

### Three-stage offline progression

- **Stage A (V1 pre-trial)** — Read-only offline cache. Cook can see/mark orders offline; new orders blocked offline.
- **Stage B (post-trial)** — Walk-up orders while offline with device-generated IDs.
- **Stage C (future)** — Full offline with reconciliation.

### Wake lock and screen-on (V4)

`lib/native/keepAwake.ts` must implement:
- **Release listener** on the lock — re-requests immediately if page is visible and intent is still on.
- **visibilitychange listener** — added once via a sentinel flag.
- **Intent tracking** — module-level `keepAwakeEnabled` flag persists across auto-releases.
- **Double-lock guard** — `if (!webLock)` prevents calling `request()` while a lock is already held.
- `enableKeepAwake` and `disableKeepAwake` are legacy aliases — **do not remove**.

**Browser compatibility:** Chrome mobile/desktop (v84+), Firefox Android (v72+), Samsung Internet (v14+), Safari iOS/macOS (16.4+). Firefox desktop: not supported.

---

## 12. Authentication and access

### Sign-out implementation (V4)

> **CRITICAL** — Sign-out must use `createSupabaseBrowserClient()` from `lib/supabase-browser.ts` (wraps `createBrowserClient` from `@supabase/ssr`), followed by a hard redirect via `window.location.href = '/login'`.

The plain `createClient` from `@supabase/supabase-js` only clears in-memory auth state — the SSR session cookie persists and middleware re-authenticates the user. The sign-out handler lives inside `UserMenu` — pages do not pass an `onSignOut` prop.

### Login identity: which email is the credential (V5)

> **RULE** — `auth.users.email` is the login credential (what the operator types to sign in). `operators.email` is the display / contact email shown in the app and used for account correspondence. They are kept in sync on email change, but conceptually distinct. `/api/auth/me` returns `operator.email`, not the auth user email.

**Ghost auth user pattern:** a duplicate row in `auth.users` (e.g. created during an earlier staff invite or a half-completed change) will collide with an email change. The email-change flow now does a pre-flight duplicate check against `auth.users` (covering operators and staff) before writing, and rolls back all writes on any failure. On successful verification it forces sign-out and redirects to `/login?message=email_changed`.

### Auth flow hardening (V5)

- **Password reset** — the Brevo send is now checked; a failed send returns an error and cleans up the token rather than reporting success. Broken logo reference removed; confirmation message genericised ("If an account exists…").
- **Email change** — pre-flight duplicate check, error handling with rollback on every write, forced sign-out on completion, cancel-pending-change action with Resend / Cancel controls in the Team tab.
- **Login page** — debug logging that recorded submitted email addresses was removed. The reset-success notice clears on keystroke or submit.

### Operator and staff accounts

- Dashboard access: truck owner OR `truck_users` member. Owner check runs first.
- Staff redirected to vehicle KDS on login; cannot access the Manage page.
- Manage tabs are role-gated (Billing owner-only).

### Team role enforcement (V5)

- **Owner** — sees and edits everyone
- **Manager** — sees all members, edits/invites staff only
- **Staff** — sees and edits only themselves

Enforced server-side in the manage API route. Client-side helpers: `canEdit()`, `canRemove()`, `invitableRoles`.

### Known gaps (before public launch)

- Rate limiting on auth attempts.
- Admin secret is a single shared value — fine for solo use, not for staff at scale.

### Email change verification

- Writes to `operator_email_changes`, sends Brevo verification link to NEW address. Old email stays active until verified.
- Pending banner in Team tab with Resend + Cancel; field locked while change is pending.
- Duplicate check is against `auth.users` (covers operators and staff).

### Slug or UUID resolution pattern

APIs that accept truck identifiers must handle both slug and UUID. Try slug first (customer URLs), fall back to UUID. Apply to any new truck-scoped API from day one.

---

## 13. Operator and multi-truck model

> **RULE** — When an operator has ONE truck, the truck name and truck selector are never shown — it is implied. All multi-truck UI is gated on `operatorTrucks.length > 1`.

- `operators` — account holder. `first_name`, `last_name`, `phone`, `email`, `auth_user_id`.
- `trucks.operator_id` — nullable FK. One operator can own multiple trucks.
- Personal details (name, phone, login email) — edited in Team tab. Never shown to customers.
- Business contact (email, phone shown to customers) — lives on the truck in Settings.

---

## 14. Vehicles (trucks under a brand)

> **NAMING** — The platform UI calls a physical vehicle a "truck". DB tables remain `truck_vans` / `truck_user_vans`. User-defined names are operator data and must never be auto-changed.

### Per-vehicle settings

- `auto_pause_on_offline` — pause online orders if this device goes offline.
- `show_cooking_step` — adds Cooking step on this vehicle's KDS.
- `kitchen_capacity` — max COOKED items per 5-minute window; drinks/instant items excluded.
- `display_layout` and `split_screen` — NOT exposed in van settings; set from dashboard/KDS directly.

---

## 15. Events and venues

> **RULE** — Events created manually in the Manage page auto-confirm immediately (`source='manual'`, `status='confirmed'`). There is no confirmation popup. Only scraped events arrive as unconfirmed and require explicit confirmation.

Unconfirmed events show on the discovery map with order button DISABLED and "Awaiting truck confirmation". Only confirmed events accept orders.

- `trucks.default_auto_open` and `default_auto_close` live in Settings → Order settings, not per-event.
- Past events (end time already passed) show a grey "Finished" badge on the Schedule tab — uses local-time parse, never UTC midnight parse.

### All event sources flow to truck_events — the scraper bridge (V5)

> **RULE** — Every event source — the web/Apps Script scraper, vendor emails to `schedule@villagefoodie.co.uk`, and manual entry — ends up in `truck_events` as an unconfirmed event for a linked truck. The truck confirms it before it can take orders. Manual entries by the operator still auto-confirm; only inbound (scraper/email) events arrive unconfirmed.

**Bridge mechanics in `/api/inbound-schedule`:** after the usual write to `discovery_events`, the endpoint normalises the incoming truck name and matches it against `discovery_trucks` rows that have `hatchgrab_truck_id` set. On a match it inserts a `truck_events` row with `status: 'unconfirmed'` and `source: 'scraper'`, after a dedup check on `truck_id + event_date + venue_name`. Venue coordinates are looked up from the `venues` table. A best-effort notification email is sent once per truck per batch (fire-and-forget — must never block ingestion). Trucks with no `hatchgrab_truck_id` are unaffected; their events stay in `discovery_events` only.

**Linking** is a one-time admin step per truck: the admin console shows a "Link HG truck" dropdown on each discovery truck row, which sets `discovery_trucks.hatchgrab_truck_id`. Until a truck is linked, nothing bridges.

### Geocoding and the Fix button (V5)

Manual events geocode via Gemini from venue name + town + postcode at save time, with an `api.postcodes.io` fallback when the postcode is present (free, UK-only, no key). The event still saves if geocoding fails, but the operator is warned with a toast, and events with null coordinates show a Fix button in the Schedule tab that re-runs geocoding (`update_event_coords` action).

### Event lifecycle controls — Start Event, Restart Event, Close (V5)

Canonical wording and status labels:
- **Start Event** — opens a confirmed event for orders. Success toast: "Event started". Status becomes ● Live (green).
- **Restart Event** — reopens a closed event. Success toast: "Event restarted".
- **Close** — sets `status: 'closed'`; only an event currently `open` can be closed. Status shows ● Closed (slate). Pausing shows ⏸ Paused (amber).

> **RULE** — Closing an event must be recoverable. A closed event still appears in the event picker (filter allows `confirmed`, `open`, AND `closed`) with a Closed badge and a Restart Event button, and the server open action accepts `status: confirmed OR closed`. An accidental early close must never strand the operator. Cancelled events remain excluded from the picker.

The in-panel event box (with the Start Event button) shows only while `status !== 'open'`; once live, the sticky event bar is the sole event display.

---

## 16. Database schema essentials

### Core tables

- `trucks` — plan, settings, `dashboard_token`, `operator_id`, `default_auto_open/close`, `is_test`, `qr_code_style` (V4), `slug` (V5, unique URL-safe identifier, used in customer order URL), `truck_emoji` (V5, default 🍕, used as Menu tab icon).
- `operators` — `first_name`, `last_name`, `phone`, `email`, `auth_user_id`.
- `truck_vans` — vehicles. `auto_pause_on_offline`, `show_cooking_step`, `kitchen_capacity`, `kds_token`.
- `truck_users` — staff. `role` (owner/manager/staff), `invited_at`, `accepted_at`.
- `truck_user_vans` — staff ↔ vehicle access junction.
- `operator_email_changes` — email change audit.
- `menu_categories` — `sort_order`, `allow_notes` boolean (V4).
- `menu_items_db` — `is_available`, `stock_count`, `allergens`, `dietary_info`, `prep_secs`, `batch_size`.
- `modifier_options` — `available` boolean (V4). `available: false` = hidden everywhere.
- `bundles_db` — deals. `bundle_price`, `slot_1..6_category`, `apply_to_new_events`.
- `event_deals` — per-event deal activation.
- `truck_events` — `event_date`, `start/end_time`, `venue_name`, `status`, `source`, `van_id`.
- `orders` — `items` (JSONB). `orders.items[i].specialInstructions` for item notes (V4).
- `whatsapp_logs` — `message_in`, `classification`, `events_found`, `possible_miss`.
- `discovery_trucks / discovery_events` — scraped discovery data. `discovery_trucks.hatchgrab_truck_id` (FK → `trucks.id`, on delete set null) links a discovery truck to its HatchGrab account — what the scraper bridge matches on. Set via the admin console "Link HG truck" dropdown.
- `loyalty_cards` (planned) — V4 spec frozen in `lib/plan-features.ts` comments. Do not build until instructed.

### Key columns of note

| Column | Type | Purpose |
|--------|------|---------|
| `trucks.plan` | text | `starter / pro / max / trial` |
| `trucks.trial_expires_at` | timestamptz | Null if not on trial |
| `trucks.feature_overrides` | jsonb | Per-truck feature grants/revocations |
| `trucks.is_test` | boolean | Filters truck from public discovery map ONLY |
| `trucks.slug` | text | Unique URL-safe identifier; used in `/trucks/[slug]/order` |
| `trucks.truck_emoji` | text | Default 🍕; set via Settings emoji picker |
| `trucks.time_selection_enabled` | boolean | Controls customer Choose Time dropdown |
| `trucks.qr_code_style` | text | `standard` or `branded` (V4) |

---

## 17. Menu API behaviour

- Slug or ID lookup — try slug first (customer URLs), fall back to UUID.
- No active filter on menu lookup — pausing controlled by dashboard pause state.
- Category data returns `name`, `prep_secs` (nullable), `batch_size` (nullable), `allow_notes` (V4).

### Dashboard flag (`?dashboard=1`) — V4

- **Without flag (customer):** modifier options with `available === false` filtered out entirely.
- **With flag (dashboard):** all options returned; each includes `available: o.available !== false`.

Dashboard's `fetchMenu` must append `?dashboard=1&nocache=${Date.now()}`. Customer-facing calls must not.

### Modifier availability rule (V4)

> **RULE** — Unavailable modifiers are HIDDEN everywhere — customer page AND operator Add Order panel. Unlike main items which show "Sold out" crossed out.

The filter is `opt.available !== false`. Shared util: `isModifierAvailable` in `lib/modifier-utils.ts`. Applied in `AddOrderPanel.tsx` and `app/trucks/[slug]/order/page.tsx`.

---

## 18. Customer communications and email

> **V3** — Email sends via Brevo. Operator-facing sender is `hello@hatchgrab.com` via `NEXT_PUBLIC_SUPPORT_EMAIL`. Do NOT fall back to villagefoodie.co.uk.

### Order confirmation email

- **On submit (pending):** subject "Order #X received", heading "Order received!", slot shown as preferred with "We'll confirm your collection time when we accept your order."
- **On operator confirm or auto-accept:** subject "Order #X confirmed", heading "Order confirmed!", slot shown definitively.
- Both use `formatConfirmationEmail` + `sendConfirmationEmail`. Includes items with modifiers, deals, venue, contact method, cancel link, HatchGrab branding.
- No "Discount" line for deal-driven savings. Deals render as deal name + bundle price → indented modifier upcharges → Total.

### Operator-confirm and slot-change emails use the shared formatter (V5)

> **RULE** — The operator-confirm email (pending → confirmed) and the slot-change email both go through `formatConfirmationEmail` + `sendConfirmationEmail`. The two bespoke inline HTML emails that previously handled these — missing modifiers, deals, venue, cancel link, and using Village Foodie instead of HatchGrab branding — were removed. This is a DRY fix (Section 3).

`formatConfirmationEmail` gained a `slotAdjustedFrom` param: when set, the email shows an amber "Your collection time has been updated to HH:MM (previously HH:MM)" box. The slot-change email passes the original slot as `slotAdjustedFrom` and the new slot as `slot`, with subject "Your order #X has been updated". Both emails inherit correct "Powered by HatchGrab" branding automatically. The local `notifyCustomer()` helper is no longer used for `confirm` or `adjust_slot` (it remains for `reject`, `cancel`, `ready`, and `edit`).

### Customer cancel page (V5)

Customer-facing cancel page at `app/order/[id]/manage/page.tsx`. `/api/orders/cancel` verifies `trucks.allow_customer_cancellation`, that the order is `pending` or `confirmed`, and the cutoff window (computed from order slot and event date), then removes the order from its production slot and sends a cancellation email. `/api/orders/[id]` (GET) resolves `?truck=[slug]` to a `truck_id` and filters by it. The `?truck` slug in the cancel URL makes it collision-safe — order IDs are sequential per-truck, so the slug disambiguates.

### Transactional email integrity

All Brevo sends must check the response and surface failures rather than reporting success silently.

---

## 19. Reports tab (V4)

### Tier gating

- **Starter** — Event filter only. `filterMode` forced to `'event'` on mount. No auto-load — operator must select an event. CSV export available.
- **Pro / Max / Trial** — Full filter toggle (Date range + Event), revenue breakdown, items sold ranking, deal performance.

`advanced_reporting` is in `PRO_FEATURES` which spreads into `MAX_FEATURES` and `TRIAL_FEATURES`.

### Why CSV export is not Pro-locked

The right tier line is *raw data = Starter, analysed insights = Pro*. CSV is raw data — available on all tiers.

### Toolbar layout

```
[filter controls — 320px min-width]  [View report]  [📋 Orders] [📦 Items]   → ml-auto →  [⬇ Export CSV]
```

- Filter container: `minWidth: 320px`, `flex-shrink-0`.

> **RULE** — Use `invisible` (not `hidden`) on Export CSV and Orders/Items toggle when no results are loaded. Reserves space, prevents layout shift.

### Items view columns

```
#OrderID  Date  Event  Time  Type  Customer  Item name  ×Qty  Unit price  Modifiers  Item total
```

- Order ID repeats on every item row from the same order.
- `border-t border-slate-100` between different orders, not between items within the same order.
- Deal items prefixed 🎁 with deal name as smaller muted text.

### Shared column class constants

```ts
const colId    = 'font-mono text-slate-400 flex-shrink-0 w-10'
const colDate  = 'text-slate-400 flex-shrink-0 w-10'
const colVenue = 'text-slate-500 flex-shrink-0 w-24 truncate hidden sm:block'
const colTime  = 'text-slate-400 flex-shrink-0 w-10'
const colType  = (online: boolean) => `flex-shrink-0 w-14 font-medium ${online ? 'text-blue-600' : 'text-slate-500'}`
const colCust  = 'text-slate-600 flex-shrink-0 w-16 truncate'
const colTotal = 'font-medium text-slate-900 flex-shrink-0'
const colMuted = 'text-slate-400 flex-shrink-0'
```

Never inline the same Tailwind string twice.

### Order type heuristic

`customer_email IS NULL → 'Placed by truck'`; else `'Customer online'`. Temporary until `orders.source` column is added. TODO comments in `app/api/orders/submit/route.ts` and `app/api/dashboard/action/route.ts`.

### Revenue calculation

Excludes `'cancelled'` and `'rejected'` from totals. Revenue breakdown: Base items + Deal revenue + Modifier upcharges. No "Discount" line.

---

## 20. Social media and WhatsApp auto-replies

### Three-bucket classification

- `SPECIFIC_QUERY` — schedule/location/date/availability → auto-respond with matching event(s).
- `GENERAL_QUERY` — menu/prices/ordering → auto-respond with the order link.
- `IGNORE` — spam/gibberish → no response.

### Event lookup

- Inject explicit DATE REFERENCE mapping (Today/Tomorrow/weekday = exact YYYY-MM-DD).
- Label events (TODAY)/(TOMORROW)/(IN 2 DAYS) so the LLM doesn't have to infer.
- `possible_miss` = SPECIFIC_QUERY with `events_found = 0`.

### Tier mapping

Instagram and Messenger: Pro. WhatsApp: Max only (per-message cost).

### Meta webhook endpoints (V5, scaffolded)

Verification + placeholder endpoints:
- `/api/webhooks/meta/whatsapp` — Meta WhatsApp (NOT Twilio)
- `/api/webhooks/messenger`
- `/api/webhooks/instagram`

Each handles GET verification challenge (returns raw `hub.challenge`) and POST (returns 200, classifier wiring is a TODO). `META_WEBHOOK_VERIFY_TOKEN` env var required.

> **RULE** — The Meta WhatsApp webhook lives at `/api/webhooks/meta/whatsapp`. The existing Twilio WhatsApp handler at `/api/webhooks/whatsapp` must NOT be overwritten — they are different integrations. Consolidating Twilio vs Meta Cloud API is a pre-trial backlog decision.

Build order: Messenger → Instagram → WhatsApp. Phase 1 (webhook setup) done; Phase 2 (OAuth flows, token storage, send API, classifier wiring) deferred. The Meta app sits under the Village Foodie portfolio — HatchGrab portfolio is advertising-restricted, which does NOT affect messaging APIs; migration later is one-click with no code change.

---

## 21. Competitive positioning

### Hatches Up cost model

4.5% + 20p all-in on online orders; 1.5% + 10p in-person. No subscription.

> **RULE** — Honest framing: "Hatches Up is 4.5% all in. We are £29/month plus 0.99% plus card processing. Above ~£1,750/month online orders we are cheaper, and you get features they do not have."

Migration pitch: "Currently on Hatches Up? Switch and get 3 months free on any tier."

---

## 22. Development process

> **OPERATOR PREFERENCE** — When presenting any code or file, the file path must appear immediately above it as `path/to/file.tsx` in bold inline code. Never make Dominic scroll up to find which file to update.

### Two-chat pattern

- **Planning chat (Claude)** — strategy, UX, architecture, instruction writing. Does NOT write code.
- **Coding chat (Cursor)** — implementation, file edits, smoke tests. Does NOT make strategic decisions.

### Audit before build

Read relevant files and paste excerpts; identify duplications/conflicts; confirm DRY; only then implement.

### Smoke tests

Every change includes a smoke test: the action to perform, expected behaviour, and edge cases. Nothing is "done" without an operator-confirmed smoke test.

### SQL migrations

Run in Supabase SQL editor; confirm clean before deploying. Use idempotent (`if not exists`) migrations.

---

## 23. Mobile UX patterns (V4/V5)

### Dashboard avatar dropdown

Five header rows reduced to three: top branding row, tab row, slim mobile event bar (`sm:hidden`) showing `● venue · time · ···`. Dropdown order is canonical — see Section 3.

### Menu tab header (mobile)

Three rows at 375px:
- Row 1: "Menu" heading left + "+ Add category" orange button right
- Row 2: "N categories · N items" muted subtext
- Row 3: "✨ Import with AI" outline button (`whitespace-nowrap`, no subtitle)

Desktop unchanged — Import AI in the right column alongside Add category with "photo, PDF or text" subtitle (`hidden sm:block`).

### All categories collapsed by default

`expandedCat` initialises to `null` on Manage page open. Operators tap to expand.

> **RULE** — Use `invisible` (CSS `visibility: hidden`), not `hidden`, for layout-reserved toolbar elements when conditionally shown. Reserves space, prevents layout shift.

### Identity block in dropdowns

Truck name bold (`text-slate-800 font-semibold`), operator first name muted below (`text-slate-400`). First name derived from `currentUserName.split(' ')[0]`. Van name not included.

### Preventing iOS Safari auto-zoom (V5)

> **RULE** — Inputs, selects, and textareas must be at least `16px` on mobile. iOS Safari zooms the viewport whenever a focused field has `font-size` below `16px`.

`app/globals.css` locks these controls to `16px` below the 640px breakpoint and reverts to `inherit` at ≥640px so desktop is untouched. The viewport is set in `app/layout.tsx` as `width=device-width, initialScale: 1` — deliberately WITHOUT `maximumScale` or `userScalable: false`, which break accessibility pinch-zoom.

---

## 24. Testing and dev environment

### Dev setup

- `localhost:3000` for local testing.
- Test Kitchen test truck: `dashboard_token test-abc123def456`, `id test-truck`, `slug test-kitchen`, `is_test true`.
- iPad Air simulator for KDS; Safari responsive mode at tablet sizes; phone widths 375/414px.

### Pre-trial checklist

- Capacitor wrapper built; Stage A offline working reliably.
- Auth hardening (rate limiting, tighter admin secret).
- Brevo hatchgrab.com domain verified and propagated.
- End-to-end smoke test: place order → KDS → confirmation email → cancel page from email link → mark ready notification → mark paid & done.
- QR code and dashboard order link resolve to `/trucks/[slug]/order` (slug column populated for all trucks).
- Scraper bridge verified: a linked truck's inbound event creates an unconfirmed `truck_events` row and shows in its Schedule tab.
- API keys rotated out of the Apps Script and into Script Properties.
- Wake lock confirmed working under iOS 16.4+ and Chrome Android.

### Contextual reminders

- UI text contrast floor on white: `slate-700` body, `slate-500` secondary, `slate-400` decorative only; orange for active highlights.
- Watch for `new Date('YYYY-MM-DD')` UTC bugs.
- Watch for `next/image` shadowing the global `Image` constructor — use `document.createElement('img')`.
- Always strip seconds via `formatTime()` — never inline `t.slice(0,5)` or write a parallel implementation.
- ASAP base time is `max(now + prep, eventStart)` — never add prep on top of a future event start (Section 6).
- Customer order URL is `/trucks/[slug]/order`. Never use `dashboard_token` in a customer-facing or public URL, and never return `dashboard_token` in a public API response.
- New operator pages reuse `AppHeader` and `slate-900` tabs (`lib/brand.ts`) — no inline page headers (Section 3).

---

## 25. Open backlog (June 2026)

### Critical — before trial

- Capacitor native wrapper; Stage A offline cache; offline detection banner; background sound.
- Auth hardening (rate limiting, admin secret).
- Google Sheets → DB migration.
- Discovery map VF vs HG visibility test.
- Heartbeat/auto-pause end-to-end test.
- Apps Script 6-minute timeout time guard.
- Brevo hatchgrab.com DNS propagation.
- `orders.source` column migration — replaces `customer_email IS NULL` heuristic.
- `truck_events.customer_note` surfacing on customer order page.
- **API key rotation (CRITICAL)** — the Apps Script scraper has hardcoded Google Maps / Gemini / Brevo keys. Rotate all of them and move to Script Properties; they have been exposed.
- Link each trial truck's `discovery_trucks` row to its HatchGrab truck (`hatchgrab_truck_id`) via the admin console, so scraped/emailed events bridge into the operator schedule.
- Confirm the GitHub scraper Chrome fix on the 6am cron run (`puppeteer browsers install chrome` step).

### Important — before public launch

- Stripe Connect integration.
- Multi-device session enforcement.
- Allergen onboarding: prompt operator per-category `allow_notes` toggle at signup.
- Loyalty stamp cards V1 build (Max only) — when instructed.
- Branded QR code: `trucks.qr_code_style` column, logo compositing, manage page selector.
- QR-with-logo scan test (dashboard order link now correctly uses `/trucks/[slug]/order` as of V5).
- `password_reset_tokens` cleanup job — tokens are marked `used_at` but never deleted.
- `slot_capacity.max_orders` → `max_batches` rename — the column counts batches, not orders.
- `is_instant` boolean on `menu_categories` — consideration, to make zero-prep items explicit.
- Twilio WhatsApp vs Meta Cloud API consolidation — decide before trial which path is canonical.
- Companies House registration for HatchGrab — recommended ahead of taking payments and Meta app review.
- Privacy policy + terms pages — required for Meta app review and for launch.

### Later

- Stage C full offline; customer-facing display (Max); advanced reporting visualisations; festival pricing.
- WhatsApp "Recent messages" review panel; event cleanup job (delete events > 90 days).

### Open questions

- AI DM classifier confidence threshold.
- iPad printer model (Star Micronics vs Epson).
- Truck-level vs operator-level billing in Phase 2.
- Loyalty redemption UX design.

---

## 26. Closing note

This manual is living documentation. Update it whenever a new rule is established, a feature behaviour is decided, a DRY violation is identified and fixed, a plan tier feature changes, or a coding convention shifts.

When in doubt about how something should work: check here first. If the answer is not here, work out the right answer, document it here, then implement.

The cost of writing things down is a few minutes. The cost of not writing them down is rebuilding the same decision next week.
