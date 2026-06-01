# HatchGrab Engineering Reference Manual · V4

**HatchGrab**  
Engineering Reference Manual  
*Village Foodie · Food Truck Ordering Platform*

**Version 4.0** · May 2026

*This document defines the rules, conventions, and architecture decisions for the HatchGrab platform. It is the source of truth for any coding session and must be consulted before making structural changes.*

---

## Changelog

### V4.0 — May 2026 (this session)

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
- **Customer order page (`/trucks/[slug]/order`)** — pre-orders or pay-at-hatch orders. No login. This is the canonical customer-facing order URL.
- **Truck dashboard (`/dashboard/[token]`)** — operator order management. Token + auth. Tabs: Orders, + Add order, Menu & Stock.
- **iPad KDS (`/kds/[kds_token]`)** — kitchen display system, per vehicle. Opened from the dashboard header.
- **Manage page (`/manage/[token]`)** — operator settings, menu, schedule, team, billing. Tabs: Menu, Schedule, Deals, Extras & Upsells, Reports, Team, Settings, Billing.
- **Admin console (`/admin`)** — platform admin. Admin secret auth.
- **Verify email (`/verify-email`)** — completes an operator email change via token. Not auth-gated.

---

## 3. DRY — Don't Repeat Yourself

DRY is the most important architectural principle in this codebase. Every audit before every feature must check for DRY violations.

> **THE RULE** — If the same logic, value, or pattern appears in two places, it belongs in one place. Audit before adding. Extract before duplicating. Use props before re-deriving.

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
- `lib/modifier-utils.ts` **(V4)** — client-safe modifier helpers. `isModifierAvailable(opt)` returns `opt.available !== false`. Used to filter modifier options everywhere. `undefined` and `null` mean available — backward-compatible against old rows.
- `lib/order-utils.ts` — **SERVER-ONLY**. Exports `nextOrderId(truckId)`. Imports `SUPABASE_SERVICE_ROLE_KEY` — importing this in a client component will fail the build. Client-safe utilities go in their own files, never co-located here.

> **RULE** — Business calculations live in `lib/`. Display-only helpers may live with the components they serve. When unsure, put it in `lib/`.

### canAccess vs hasFeature (V4)

- `canAccess(plan, feature, featureOverrides, trialExpiresAt)` — use this for **ALL UI gates**. Respects per-truck overrides and trial expiry.
- `hasFeature(plan, feature)` — plan-only check, no overrides. Use only where override/trial logic is irrelevant.

When in doubt, use `canAccess()`.

### Single dropdown component (V4)

`components/dashboard/UserMenu.tsx` is the single avatar dropdown used by every operator-facing page. Sections render based on boolean props. **Canonical dropdown order:**

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

### Cook screen — Max only

The cook screen (`?view=cook`) is Max-only because:
- A cook screen is only useful with two physical devices
- Starter/Pro enforce one active KDS session — a second device kills the first
- Max gets unlimited concurrent sessions

Hide the Cook button from Pro even though it could technically work on one device — it would confuse operators.

### Trial behaviour

- No payment details required at signup
- Duration set per-truck in admin console (1 month default, 3 months for early signups)
- Warning banner on KDS in last 7 days of trial
- Red expired banner if trial lapsed and plan not yet upgraded
- Drops to Starter automatically on expiry — no lock-out, no data loss

### FeatureValue type (V4)

`FeatureValue = boolean | 'coming_soon'` in `lib/plan-features.ts`. Set the plan column to `'coming_soon'` directly — the Billing tab renders this as a "Coming soon" badge automatically.

### Loyalty stamp cards (Max, coming soon) — V4

V1 spec frozen in code comments in `lib/plan-features.ts`. Schema: `loyalty_cards(id, truck_id, customer_email, customer_phone, stamps_earned, stamps_redeemed, created_at, last_stamp_at)`. V1 rule: 1 stamp per order (not per item). Walk-up flow: phone lookup in Add Order; online flow: email match at submit. Redemption: operator trigger in Add Order + customer-side prompt at online checkout.

> **RULE** — Do NOT build flexible stamp criteria until V1 is live and operators request it.

Strategic note: once stamps are earned, operator churn drops to near zero.

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

### ASAP base time rule (V4 fix)

The ASAP ready time is:

```
t = max(now + totalSecs, eventStart)
```

NOT:

```
t = eventStart + totalSecs  ← WRONG — causes pre-event orders to show prep time added on top of event start
```

When an operator places an order well before the event (e.g. 85 min before), prep time completes before the event starts. The event start is the floor, not the base. If prep completes after event start (e.g. order placed 2 min before, 7 min prep), the prep time naturally wins.

Implemented in: `components/dashboard/AddOrderPanel.tsx` (`t = new Date(Math.max(Date.now() + totalSecs * 1000, base.getTime()))`).

### Time rounding and display

- Customer-facing ASAP rounds to NEAREST 5 minutes.
- Truck dashboard shows exact ready times.
- All times display as `HH:MM` — seconds stripped via `formatTime()` from `lib/time-utils.ts`. **This is the canonical formatter. Never inline `t.slice(0,5)` or write a parallel implementation.**

### UTC parse bug prevention

Always use `new Date(\`${date}T${time}\`)` for local-time parse. **Never** `new Date('YYYY-MM-DD')` then `setHours` — parses as UTC midnight, breaks in BST and any non-UTC timezone. Same rule applies everywhere dates are compared: customer page, schedule tab, reports tab.

---

## 7. Customer order page UX

### Collection time default

ASAP is auto-selected by default (`asapChosen` initialises to `true`). **This reverses the V2 rule** where both ASAP and Choose Time started unselected. The change was deliberate — forcing a manual selection added friction without preventing mistakes. ASAP and Choose Time remain mutually exclusive.

### Event lookup pattern (V4)

APIs that accept truck identifiers must handle both slug (customer-side) and UUID (dashboard-side). Try slug first, fall back to UUID. This was the root cause of a "No upcoming events" bug on the customer order page.

### Past events filtered (V4)

`isPastEvent` uses local-time parse: `new Date(\`${event_date}T${end_time}\`) < new Date()`. Never `new Date('YYYY-MM-DD')` then setHours. Past events show a grey "Finished" badge on the Schedule tab regardless of database status.

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

DealsModal flat-maps `expandedBasketOpts` by quantity, giving each unit a unique key `${cartKey}::unit{n}`. `stripUnit()` helper at the boundary so callers receive the original cart key. `takenByOtherSlots` tracks full unit keys. DealsModal is shared between Add Order panel and customer page — fixing once fixes both.

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

All prices in a card right-align to the same column edge:
- `tabular-nums` on price spans — fixed-width digit glyphs prevent layout shift
- `w-16 flex-shrink-0 text-right` on price column
- `flex-1 min-w-0` on item name

£1.50 and £12.00 must align at the decimal point. Modifier upcharges must align in the same column as base prices.

### Allergy and notes

- Item special instructions shown italic below the item line.
- Order-level notes shown as a separate red block at the bottom, always visible, never truncated.
- Cook view shows notes too — allergy information must never be hidden from the cook.

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

- Lists all upcoming confirmed events, not just today's.
- Auto-selects today's event if there is exactly one.
- ASAP is computed from the selected event's date/time.

### Grace period banner (V4)

Orders for an event whose end time has passed >30 min show a passive amber banner:

> ⚠️ This event has ended — you're adding an order after close. Make sure you've selected the right event.

The Confirm order button is **NOT disabled**. No per-order acknowledgement required. Customer-side grace filtering is unchanged.

### Modifier rendering

Calls `/api/menu/[truckId]?dashboard=1`. Options where `available === false` are HIDDEN via `isModifierAvailable` from `lib/modifier-utils.ts` — same rule as the customer page. Operators set the stock; they know what they turned off.

---

## 11. Native app and offline architecture

> **DECISION** — A native wrapper using Capacitor must be built BEFORE any trial begins.

Capacitor wrapper (`com.hatchgrab.app`) around the existing Next.js app at `https://www.hatchgrab.com`. Native code only for: offline detection, local order storage, background sound, screen wake, and Bluetooth printer (Max, post-trial).

### Three-stage offline progression

- **Stage A (V1 pre-trial)** — Read-only offline cache. Cook can see/mark orders offline; new orders blocked offline.
- **Stage B (post-trial)** — Walk-up orders while offline with device-generated IDs.
- **Stage C (future)** — Full offline with reconciliation.

### Wake lock and screen-on (V4)

The Wake Lock API auto-releases on any page-hidden event. `lib/native/keepAwake.ts` must implement:

- **Release listener** on the lock — re-requests immediately if page is visible and intent is still on.
- **visibilitychange listener** — added once via a sentinel flag; re-requests on page becoming visible.
- **Intent tracking** — module-level `keepAwakeEnabled` flag persists across auto-releases.
- **Double-lock guard** — `if (!webLock)` prevents calling `request()` while a lock is already held.
- `enableKeepAwake` and `disableKeepAwake` are legacy aliases for KDS page compatibility — **do not remove**.

**Browser compatibility:** Chrome mobile/desktop (v84+), Firefox Android (v72+), Samsung Internet (v14+), Safari iOS/macOS (16.4+). Firefox desktop: not supported.

When `'wakeLock' in navigator` is false, show amber warning under the toggle:
> *Screen lock isn't supported on this browser. Keep the device plugged in and the app in the foreground to prevent the screen dimming.*

---

## 12. Authentication and access

### Sign-out implementation (V4)

> **CRITICAL** — Sign-out must use `createSupabaseBrowserClient()` from `lib/supabase-browser.ts` (wraps `createBrowserClient` from `@supabase/ssr`), followed by a hard redirect via `window.location.href = '/login'`.

The plain `createClient` from `@supabase/supabase-js` only clears in-memory auth state — the SSR session cookie persists and middleware re-authenticates the user. This was the root cause of a long-standing sign-out bug. The sign-out handler lives inside `UserMenu` — pages do not pass an `onSignOut` prop.

### Operator and staff accounts

- Dashboard access: truck owner OR `truck_users` member. Owner check runs first.
- Staff redirected to vehicle KDS on login; cannot access the Manage page.
- Manage tabs are role-gated (Billing owner-only).

### Known gaps (before public launch)

- Rate limiting on auth attempts.
- Admin secret is a single shared value — fine for solo use, not for staff at scale.

### Future auth model (post-trial)

- First visit: email/password or magic link
- Subsequent visits: persistent cookie — no re-login during service
- Quick PIN re-entry if iPad screen locks during service
- Token URL retained as iPad bookmark fallback for edge cases

### Email change verification

- Writes to `operator_email_changes`, sends Brevo verification link to NEW address. Old email stays active until verified.
- Duplicate check is against `auth.users` (covers operators and staff).

### Slug or UUID resolution pattern

APIs that accept truck identifiers must handle both slug and UUID. Try slug first (customer URLs), fall back to UUID. Apply this to any new truck-scoped API from day one.

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

The reason unconfirmed events exist: the scraper can be wrong. Showing unconfirmed events on the map with ordering disabled protects customers from ordering for events that won't happen, and protects the platform from refund disputes caused by bot errors. Only confirmed events accept orders.

- Unconfirmed events show on the discovery map with order button DISABLED and "Awaiting truck confirmation".
- `trucks.default_auto_open` and `default_auto_close` live in Settings → Order settings, not per-event.
- Past events (end time already passed) show a grey "Finished" badge on the Schedule tab — uses local-time parse, never UTC midnight parse.

---

## 16. Database schema essentials

### Core tables

- `trucks` — plan, settings, `dashboard_token`, `operator_id`, `default_auto_open/close`, `is_test`, `qr_code_style` (V4).
- `operators` — `first_name`, `last_name`, `phone`, `email`, `auth_user_id`.
- `truck_vans` — vehicles. `auto_pause_on_offline`, `show_cooking_step`, `kitchen_capacity`, `kds_token`.
- `truck_users` — staff. `role` (owner/manager/staff), `invited_at`, `accepted_at`.
- `truck_user_vans` — staff ↔ vehicle access junction.
- `operator_email_changes` — email change audit.
- `menu_categories` — `sort_order`, `allow_notes` boolean (V4).
- `menu_items_db` — `is_available`, `stock_count`, `allergens`, `dietary_info`, `prep_secs`, `batch_size`.
- `modifier_options` — `available` boolean (V4) — defaults true. `available: false` = hidden everywhere.
- `bundles_db` — deals. `bundle_price`, `slot_1..6_category`, `apply_to_new_events`.
- `event_deals` — per-event deal activation.
- `truck_events` — `event_date`, `start/end_time`, `venue_name`, `status`, `source`, `van_id`.
- `orders` — `items` (JSONB). `orders.items[i].specialInstructions` for item notes (V4).
- `whatsapp_logs` — `message_in`, `classification`, `events_found`, `possible_miss`.
- `loyalty_cards` (planned) — V4 spec frozen in `lib/plan-features.ts` comments. Do not build until instructed.

### Key columns of note

| Column | Type | Purpose |
|--------|------|---------|
| `trucks.plan` | text | `starter / pro / max / trial` |
| `trucks.trial_expires_at` | timestamptz | Null if not on trial |
| `trucks.feature_overrides` | jsonb | Per-truck feature grants/revocations |
| `trucks.is_test` | boolean | Hides Billing tab; test truck flag |
| `trucks.time_selection_enabled` | boolean | Controls customer Choose Time dropdown |
| `trucks.qr_code_style` | text | `standard` or `branded` (V4) |
| `trucks.kds_mode` | boolean | Enables cooking intermediate state |
| `trucks.display_mode` | text | `list` or `grid` (KDS default layout) |
| `orders.paid_at` | timestamptz | Set when marked paid & done |
| `orders.collected_at` | timestamptz | Set when collected |

---

## 17. Menu API behaviour

- Slug or ID lookup — try slug first (customer URLs), fall back to UUID.
- No active filter on menu lookup — pausing controlled by dashboard pause state.
- Category data returns `name`, `prep_secs` (nullable), `batch_size` (nullable), `allow_notes` (V4).

### Dashboard flag (`?dashboard=1`) — V4

- **Without flag (customer):** modifier options with `available === false` filtered out entirely. `available` field not in response.
- **With flag (dashboard):** all options returned; each includes `available: o.available !== false`.

Dashboard's `fetchMenu` must append `?dashboard=1&nocache=${Date.now()}`. Customer-facing calls must not.

This fixed two coexisting bugs: (1) dashboard stock toggle showed stale ON state after refetch; (2) operator Add Order panel was filtering out unavailable options.

### Modifier availability rule (V4)

> **RULE** — Unavailable modifiers are HIDDEN everywhere — customer page AND operator Add Order panel. Unlike main items which show "Sold out" crossed out.

Reasoning: modifier options appear contextually inside a popup after the customer has committed to an item; showing an unavailable modifier creates confusion. The filter is `opt.available !== false`. Shared util: `isModifierAvailable` in `lib/modifier-utils.ts`.

Applied in:
- `components/dashboard/AddOrderPanel.tsx` (customise modal)
- `app/trucks/[slug]/order/page.tsx` (customer modifier popup)

---

## 18. Customer communications and email

> **V3** — Email sends via Brevo. Operator-facing sender is `hello@hatchgrab.com` via `NEXT_PUBLIC_SUPPORT_EMAIL`. Do NOT fall back to villagefoodie.co.uk.

### Order confirmation email (V4 update)

No "Discount" line for deal-driven savings. Deals render as: deal name + bundle price → indented modifier upcharges → Total. The maths visibly reconciles without a separate discount line (which was confusing customers).

### Transactional email integrity

All Brevo sends must check the response and surface failures rather than reporting success silently.

---

## 19. Reports tab (V4)

### Tier gating

- **Starter** — Event filter only. `filterMode` forced to `'event'` on mount. No auto-load — operator must select an event. CSV export available. Order list and Items view available.
- **Pro / Max / Trial** — Full filter toggle (Date range + Event), revenue breakdown, items sold ranking, deal performance.

`advanced_reporting` is in `PRO_FEATURES` which spreads into `MAX_FEATURES` and `TRIAL_FEATURES`.

### Why CSV export is not Pro-locked

Square's free tier offers CSV export. The right tier line is *raw data = Starter, analysed insights = Pro*. CSV is raw data — available on all tiers.

### Toolbar layout

```
[filter controls — 320px min-width]  [View report]  [📋 Orders] [📦 Items]   → ml-auto →  [⬇ Export CSV]
```

- Filter container: `minWidth: 320px`, `flex-shrink-0`.
- Use `invisible` (not `hidden`) on Export CSV and Orders/Items toggle when no results — reserves space, prevents layout shift.

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

Excludes `'cancelled'` and `'rejected'` from totals. Revenue breakdown is positive-framed: Base items + Deal revenue + Modifier upcharges. No "Discount" line.

### Pro placeholder card text

> *Date range reporting, revenue breakdown, deal performance, items sold ranking, hourly sales patterns, and event ROI comparison. Available on Pro and Max.*

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

---

## 21. Competitive positioning

### Hatches Up cost model

4.5% + 20p all-in on online orders; 1.5% + 10p in-person. No subscription. Assume their reporting is feature-comparable on raw data access.

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

## 23. Mobile UX patterns (V4)

### Dashboard avatar dropdown

Five header rows reduced to three: top branding row, tab row, slim mobile event bar (`sm:hidden`) showing `● venue · time · ···` with a modal for +30 min, Close early, Cancel event. Dropdown order is canonical — see Section 3.

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

---

## 24. Testing and dev environment

### Dev setup

- `localhost:3000` for local testing.
- Test Kitchen test truck: `dashboard_token test-abc123def456`, `id test-truck`, `is_test true`.
- iPad Air simulator for KDS; Safari responsive mode at tablet sizes; phone widths 375/414px.

### Pre-trial checklist

- Capacitor wrapper built; Stage A offline working reliably.
- Auth hardening (rate limiting, tighter admin secret).
- Brevo hatchgrab.com domain verified and propagated.
- End-to-end smoke test: customer order → KDS → confirmation email (done in V4).
- Wake lock confirmed working under iOS 16.4+ and Chrome Android.

### Contextual reminders

- UI text contrast floor on white: `slate-700` body, `slate-500` secondary, `slate-400` decorative only; orange for active highlights.
- Watch for `new Date('YYYY-MM-DD')` UTC bugs.
- Watch for `next/image` shadowing the global `Image` constructor — use `document.createElement('img')`.
- Always strip seconds via `formatTime()` — never inline.

---

## 25. Open backlog (end May 2026)

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

### Important — before public launch

- Stripe Connect integration.
- `/order/[id]/manage` customer cancel page.
- Multi-device session enforcement.
- Allergen onboarding: prompt operator per-category `allow_notes` toggle at signup.
- Loyalty stamp cards V1 build (Max only) — when instructed.
- Branded QR code: `trucks.qr_code_style` column, logo compositing, manage page selector.
- QR-with-logo scan test; verify dashboard order link uses `/trucks/[slug]/order`.

### Later

- Stage C full offline; customer-facing display (Max); advanced reporting visualisations; festival pricing.
- WhatsApp "Recent messages" review panel; event cleanup job (delete events > 90 days).
- Rename `slot_capacity.max_orders` → `max_batches` (DB migration + call-site update in `lib/slot-capacity.ts` and `lib/slot-bookings.ts`). Low urgency — naming is confusing but behaviour is correct.
- Consider adding `is_instant boolean` to `menu_categories` as a first-class alternative to relying on `prep_secs = 0`. Would allow explicit UI labelling ("Instant — won't affect kitchen capacity") and decouple the capacity exclusion logic from the prep time value.

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
