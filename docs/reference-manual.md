# HatchGrab Engineering Reference Manual · V6

**HatchGrab**
Engineering Reference Manual
*Village Foodie · Food Truck Ordering Platform*

**Version 6.0** · June 2026

*This document defines the rules, conventions, and architecture decisions for the HatchGrab platform. It is the source of truth for any coding session and must be consulted before making structural changes.*

---

## Changelog

### V6.0 — June 2026 (this session)

Pre-trial polish session. Fixes scraper workflow, completes admin auth, adds tester plan, rebuilds schedule UX, and hardens multi-van pause isolation. Key changes relative to V5:

- **Coding tool clarified** — Claude within Cursor is the coding tool. All implementation instructions are written as Cursor prompts. Audits can be sent to Cursor directly for a summary response rather than grep + paste back.
- **Tester plan** — fifth plan value alongside starter/trial/pro/max. Full Max feature set. Billing tab hidden. Trial popup suppressed. Lifetime discount tracked via `trucks.lifetime_discount_pct` and `trucks.lifetime_discount_note`. `PLAN_ORDER` is now `['starter', 'trial', 'tester', 'pro', 'max']`.
- **Trial column in billing tab** — visible when `plan === 'trial'` and `trial_expires_at` is in the future. Disappears automatically on expiry regardless of plan change. Trial shows Pay at Hatch for online orders (not 0.99% + card fee).
- **Admin session auth** — `operators.is_admin` boolean replaces `ADMIN_SECRET` password prompt. Admin page auto-authenticates via Supabase session on mount. `ADMIN_SECRET` retained as emergency fallback only — to be removed at launch.
- **Admin page rebuilt** — two tabs: Trucks (searchable/filterable list with inline plan badge, trial days, lifetime discount badge, dashboard link) and Features (full plan matrix from `FEATURE_SECTIONS`). Truck edit modal with plan selector, trial controls, discount fields, feature overrides, create operator account.
- **Admin role as 4th permission level** — owner/manager/staff/admin. `is_admin` on `operators` table, not `truck_users`. UserMenu shows 🔐 Admin link when `isAdmin` prop is true.
- **Manual pause isolation fixed** — `set_paused` action now writes to `truck_vans.paused_until` scoped to the active event's `van_id`, not `trucks.paused_until`. Operator UI reload state still reads from `trucks.paused_until` — backlog fix needed.
- **Offline protection per-event override** — `truck_events.offline_protection_override` (nullable boolean). `null` = use van default. Dashboard toggle reads van default and allows event-level override. Menu API respects event override first. Warning shown when disabled for a specific event.
- **Kitchen capacity in dashboard** — van-level `kitchen_capacity` shown and editable in Menu & Stock tab when an active event is selected. Options now 1–20 items (was sparse: 3/5/8/10/15/20). Both manage page and dashboard use identical options.
- **Dashboard event scoping** — Orders tab shows empty state when no event selected. Add Order confirm button disabled with "Select an event to confirm" when no event selected. Basket persists on event change. Menu & Stock sold counts show 0 when no event selected. Auto-accept and kitchen capacity only show when event is active.
- **Inline category prep/batch editing** — Edit accordion removed from Menu & Stock. Prep time (minutes + 0s/30s seconds select) and batch size (blank = no limit, placeholder ∞) now inline on category header row. Save on blur/change.
- **Auto-accept copy corrected** — "Full slots are still rejected" was wrong. Now reads: "Orders confirm automatically. If the requested slot is full, the order bumps to the next available slot. Only confirms when there is capacity."
- **ASAP cancellation cutoff** — falls back to `event end_time` for ASAP orders (no explicit slot). Post-trial consideration: store `ready_time` on order row for tighter control.
- **Affected order count on cancel** — `openEventCancelModal` now fetches real affected order count via `/api/events/affected-orders` before showing the modal. Was hardcoded to 0.
- **Schedule tab rebuilt** — date-anchored card layout: large orange day number left column, venue + time + status right, actions far right, deals collapsed into `<details>` summary showing deal names. Town deduplicated from venue display if already present in venue name. Postcode on its own muted line.
- **Import schedule feature** — `📤 Import schedule` button on Schedule tab header. Separate modal with drag-and-drop file upload (reuses `useDragDrop` hook), paste text, "Process schedule" button. Extracted events show interactive review: checkbox per event (all pre-selected), inline edit with venue suggestions dropdown, selective save ("Save N events"). New API route `/api/manage/process-schedule` calls Gemini directly. Events confirmed immediately as `source: 'operator_upload'`. Truck is always the logged-in operator's truck — Gemini is not asked for truck names.
- **Cancel event order count** — modal now shows real affected order count fetched from `/api/events/affected-orders`.
- **Past event cards** — deals section hidden, Edit and Cancel buttons hidden, Copy retained. Cancelled events show "Cancelled" badge not "Finished".
- **QR/order URL DRY fix** — `dashboard_token` fallback removed from all customer-facing URL constructions. Single pattern: `truck.slug ? /trucks/${slug}/order : null`. Slug missing = visible error, never silent token exposure.
- **`isHG` gate removed** — confirmed `truck_events` now surface on both Village Foodie and HatchGrab discovery maps unconditionally.
- **Feature labels** — `FEATURE_SECTIONS` in `lib/plan-features.ts` is single source of truth for feature rows, human-readable labels, order, and coming-soon status. `PLAN_FOOTNOTES` exported and used by both admin Features tab and operator Billing tab. "Facebook, Messenger & Instagram auto-replies" renamed to "Messenger & Instagram auto-replies".
- **Heartbeat architecture documented** — single `last_heartbeat_at` per van row, 15s ping from both KDS and dashboard, 30s stale threshold, 2h auto-pause duration, receipt clears `online_paused_until`. All-or-nothing offline detection works by design.
- **Scraper workflow** — Node 20 (not 24), `rm -rf ~/.cache/puppeteer/chrome` before install, no `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`. Gemini quota resolved by upgrading to paid plan.
- **`is_test` scope confirmed** — `is_test` has exactly ONE effect: filtering test trucks from the public discovery map. Never gates operator features.

### V5.0 — June 2026

Pre-trial polish-and-plumbing session. Shared AppHeader, sticky layout, event lifecycle controls (Start/Restart/Close), scraper bridge, operator email rebuild, customer cancel page, settings auto-save, team role enforcement, discovery map security, geocoding fallback, iOS auto-zoom fix, Meta social webhook scaffolding.

### V4.0 — May 2026

Hardening pass. Consolidated utilities, auth and wake lock fixes, Reports tab, single dropdown component pattern.

### V3.0 — May 2026

Operator account model, staff access, email verification, deals-on-events system, WhatsApp logging.

### V2.0 — May 2026

Starter permanently free. Trial as distinct plan tier. Capacitor native wrapper designated pre-trial deliverable.

### V1.0 — Earlier sessions

Initial documentation of lib/ structure, order calculation rules, customer page UX, prep time logic, pricing strategy.

---

## 1. Purpose of this document

This manual exists to prevent regressions. Every coding session loses context. Without a written record of how features work, why decisions were made, and what rules must not be broken, the codebase drifts.

Read this before every coding session. Update it after every meaningful change. When a coding chat is uncertain about how a feature should behave, the answer is in here.

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
- **Email** — Brevo for all transactional email. Operator-facing sender is `hello@hatchgrab.com` via `NEXT_PUBLIC_SUPPORT_EMAIL`. Do NOT fall back to villagefoodie.co.uk.
- **Native wrapper** — Capacitor around the existing Next.js app. App ID `com.hatchgrab.app`, points to `https://www.hatchgrab.com`.
- **Scraper** — Google Apps Script (not in repo) processes Drive screenshots and vendor emails via Gemini, mirrors events to Supabase via `/api/inbound-schedule`. Node 20 on GitHub Actions. Subject to 6-minute Apps Script execution limit — needs a time guard.

### Key surfaces

- **Discovery map (`/`)** — Village Foodie public site. No login.
- **Customer order page (`/trucks/[slug]/order`)** — canonical customer-facing order URL. Never use `dashboard_token` in a public-facing URL.
- **Truck dashboard (`/dashboard/[token]`)** — operator order management. Uses shared `AppHeader`. Tabs: Orders, + Add order, Menu & Stock.
- **iPad KDS (`/kds/[kds_token]`)** — kitchen display system, per vehicle.
- **Manage page (`/manage/[token]`)** — operator settings. Uses shared `AppHeader`. Tabs: Menu, Schedule, Deals, Extras & Upsells, Reports, Team, Settings, Billing.
- **Admin console (`/admin`)** — platform admin. Session auth via `operators.is_admin`. `ADMIN_SECRET` emergency fallback.
- **Verify email (`/verify-email`)** — completes operator email change via token. Not auth-gated.

---

## 3. DRY — Don't Repeat Yourself

> **THE RULE** — If the same logic, value, or pattern appears in two places, it belongs in one place. Audit before adding. Extract before duplicating.

### Development process (V6)

> **RULE** — Claude within Cursor is the coding tool. All implementation instructions are written as Cursor prompts. Audits can be sent to Cursor directly for a summary response — do not require grep + paste back for every audit.

### Shared operator header — AppHeader

`components/shared/AppHeader.tsx` is used by the dashboard, manage page, admin page, and any future operator surface. Layout: Village Foodie logo left, truck logo and name centred, right slot via `children`. `bg-slate-900 sticky top-0 z-50`.

Colour constants in `lib/brand.ts`: `HEADER_BG`, `PAGE_BG`, `TABS_BG` (all `slate-900`).

**Sticky layout contract:**
- AppHeader: `sticky top-0 z-50` — 51px tall
- Tabs bar: `sticky top-[51px] z-40`
- Dashboard event bar (Orders + Add Order tabs only): `sticky top-[95px] z-30`

Any new operator page must reuse `AppHeader` and `slate-900` tabs — never re-derive inline.

### Shared calculation libraries — lib/

- `lib/order-calculations.ts` — order totals, deal pricing, discount application
- `lib/basket-utils.ts` — basket add/remove, deal cleanup, grouping by category
- `lib/deal-utils.ts` — bundle slot category extraction, deal original price calculation
- `lib/slot-utils.ts` — ASAP slot selection (event-date aware), future-time validation
- `lib/slot-bookings.ts` — production slot operations, `normaliseOrderLines`
- `lib/slot-capacity.ts` — `canFitInProductionSlot`
- `lib/prep-utils.ts` — prep time, category configs, queue-aware ready time, `buildCatConfigs`
- `lib/plan-features.ts` — **SINGLE SOURCE OF TRUTH** for plan pricing, feature matrix (`FEATURE_SECTIONS`), footnotes (`PLAN_FOOTNOTES`), plan prices, descriptions. Imported by both the Billing tab and the admin console.
- `lib/features.ts` / `lib/useFeatures.ts` — plan tier feature map and `canAccess()`/`useFeatures()` for gating
- `lib/whatsapp-classifier.ts` — message classification and schedule-response prompt building
- `lib/time-utils.ts` — canonical time formatter. `formatTime(t)` strips seconds. **Never inline `t.slice(0,5)` or write a parallel implementation.**
- `lib/modifier-utils.ts` — `isModifierAvailable(opt)`. Used everywhere modifier options are filtered.
- `lib/order-utils.ts` — **SERVER-ONLY**. Imports `SUPABASE_SERVICE_ROLE_KEY` — never import in client components.
- `lib/brand.ts` — `HEADER_BG`, `PAGE_BG`, `TABS_BG` colour constants.

### Customer order URL — single pattern (V6)

> **RULE** — `truck.slug ? /trucks/${slug}/order : null` everywhere. `dashboard_token` must never appear in a customer-facing or public API response. Slug missing = visible error, never silent token fallback. Applied in: manage page, dashboard, discovery events API, WhatsApp webhook.

### Feature gating

All feature access goes through `canAccess()` from `lib/features.ts`. **Forbidden:** `if (plan === 'pro')`, hardcoded feature lists outside `lib/features.ts`.

### Plan pricing and feature matrix

`lib/plan-features.ts` is the single source of truth. `FEATURE_SECTIONS` defines human-readable labels, section grouping, and coming-soon values for all three base plan columns. Trial and Tester always get the same values as Max. `PLAN_FOOTNOTES` is exported and rendered by both the admin Features tab and the operator Billing tab.

### DRY audit before every feature

1. Search the codebase for related logic.
2. Identify whether the new feature extends an existing pattern.
3. Paste existing structure for review before writing new code.
4. Extraction is the default; duplication requires explicit justification.

---

## 4. Plan tiers and feature gating

### Five plans

- **Starter (Free)** — Walk-up orders, KDS, dashboard, menu, deals, sold-out toggle, stock countdown, Pay-at-Hatch online ordering. 0% platform fee.
- **Pro (£29/mo)** — Everything in Starter, plus online payments (Stripe Connect), advance pre-ordering, time slot selection, smart batch pacing, auto-accept, advanced reporting, branded QR code, Messenger & Instagram auto-replies, offline sync protection. 0.99% platform fee plus card processing.
- **Max (£49/mo)** — Everything in Pro, plus unlimited WhatsApp auto-replies, kitchen ticket printing, multi-device kitchen sync, multi-user access, customer-facing display (coming soon), festival pricing (coming soon), digital loyalty stamp cards (coming soon).
- **Trial** — All Max features plus Pay-at-Hatch online ordering. Default 3 months. Expires to Starter. No payment details required at signup.
- **Tester (V6)** — All Max features. Billing tab hidden. Trial conversion popup suppressed. Lifetime subscription discount tracked on `trucks.lifetime_discount_pct` (integer, e.g. 50 = 50% off) and `trucks.lifetime_discount_note`. 0.99% transaction fee applies at standard rate. Can convert to paid plan.

### `PLAN_ORDER`

```typescript
['starter', 'trial', 'tester', 'pro', 'max']
```

### Transaction fees

| Plan | Walk-up orders | Online orders |
|---|---|---|
| Starter | 0% | Pay at Hatch |
| Trial | 0% | Pay at Hatch |
| Tester | 0% | Pay at Hatch |
| Pro | 0% | 0.99% + card fee |
| Max | 0% | 0.99% + card fee |

### Feature gating rules

- Resolution order in `canAccess()`: per-truck override → trial expiry check → plan tier.
- Per-truck overrides stored in `trucks.feature_overrides` (JSONB), edited in admin.
- Trial expiry checked against `trucks.trial_expires_at`; expired trials silently drop to Starter.
- UI uses `useFeatures(truck)`; non-React code uses `canAccess()` directly.

### Billing tab

- Owner-only tab. Hidden when `truck.plan === 'tester'`.
- Trial column visible when `plan === 'trial'` AND `trial_expires_at > now`. Disappears automatically on expiry.
- Trial column sits first (before Starter), labelled "TRIAL / Free trial / until {date}".
- Upgrade buttons open email-to-upgrade modal until Stripe Connect is built.

### Billing tab layout by plan

- **Trial / Starter** — upgrade card first, then full pricing matrix, then billing & payments.
- **Pro / Max** — quiet current-plan summary first, then collapsible "Compare all plans" (collapsed by default), then billing & payments.

### `is_test` scope

> **RULE** — `is_test` has exactly ONE effect: filtering test trucks from the public discovery map (Village Foodie). It must NEVER gate an operator-facing feature. Test accounts see the full operator product including Billing tab.

### No premium badges on customer surfaces

> **CRITICAL RULE** — Customers must NEVER see "Premium" badges, upsell language, or any indication that features are gated behind subscription tiers.

---

## 5. Order management

### Order lifecycle

- `pending` — customer placed, not yet confirmed. Only set by customer path when `truck.auto_accept` is false.
- `confirmed` — accepted into queue. Default for manual orders.
- `cooking` — optional intermediate state.
- `ready` — food prepared. Customer notified by email.
- `collected` — customer collected. Disappears from active views.
- `cancelled / rejected` — will not be fulfilled.

### Walk-up vs customer orders

> **CRITICAL DISTINCTION** — Walk-up orders and customer orders are two different flows. They must not be merged.

**Walk-up (manual) orders:** Created by operator via Add Order panel. Auto-confirms immediately. Button label: "Confirm order".

**Customer self-orders:** Created via `/trucks/[slug]/order`. Server-side total validation. Lands pending; auto-confirms only if `truck.auto_accept` and slot capacity allows. Button label: "Place order". Phone field is optional — no asterisk, no submit guard.

### Auto-accept slot behaviour (V6)

Auto-accept does NOT simply confirm or reject. The behaviour is:
- Requested slot has capacity → confirm at requested slot
- Requested slot full, later slot available → bump to next available slot and confirm
- All slots full → leave as pending (operator action needed)
- No slot requested → confirm immediately

> **RULE** — Auto-accept description copy: "Orders confirm automatically. If the requested slot is full, the order bumps to the next available slot. Only confirms when there is capacity."

### Dashboard event scoping (V6)

- **Orders tab** — shows empty amber warning when no event selected. Order count in tab label shows 0 when no event selected.
- **Add Order** — items can be added freely. Confirm button is disabled with "Select an event to confirm" when no event selected. Basket persists on event change.
- **Menu & Stock** — sold counts show 0 when no event selected. Auto-accept, kitchen capacity, and offline protection cards only render when `activeEvent` is set.

### Pause and extra wait

- **Pause orders** — writes to `truck_vans.paused_until` scoped to the active event's `van_id`. Never writes to `trucks.paused_until`. Pause button only visible when `activeEvent?.status === 'open'`.
- **Extra wait** — global delay, 10-minute increments.
- Both show persistent banners on KDS and dashboard while active. Same API calls, no duplication.

> **BACKLOG** — Operator UI reload reads pause state from `trucks.paused_until` — needs updating to read from `truck_vans.paused_until` for the active event's van.

---

## 6. Prep time and queue logic

**FORMULA:** `totalQty = queueByCat[cat] + newByCat[cat]; finalBatch = ceil(totalQty / batchSize); prepSecs = finalBatch × prepSecsPerBatch`

`calcQueueAwareReadySecs` in `lib/prep-utils.ts` is the **only implementation**.

### ASAP base time — never add prep on top of event start (V5)

**FORMULA:** `ASAP base = max(now + totalSecs, eventStart).` Never `eventStart + totalSecs`.

### ASAP cancellation cutoff (V6)

For ASAP orders (null slot), the cancellation cutoff falls back to `event end_time`. The cancel route joins `truck_events!event_id (end_time)`. Effective slot = `order.slot ?? event.end_time ?? null`. If neither is available, the check is skipped.

> **POST-TRIAL CONSIDERATION** — Store `ready_time` on the order row at submit time for tighter ASAP cancellation control.

### Time display

All times display as `HH:MM` — seconds stripped via `formatTime()` from `lib/time-utils.ts`. **Never inline `t.slice(0,5)`.**

### UTC parse bug prevention

Always use `new Date(\`${date}T${time}\`)` for local-time parse. **Never** `new Date('YYYY-MM-DD')` then `setHours`.

---

## 7. Customer order page UX

### Collection time default

ASAP is auto-selected by default. ASAP and Choose Time are mutually exclusive.

### Phone optional

Phone is never required. Submit guard checks name and email only.

### Footer and layout

- Footer `padding-bottom` uses `iOS safe-area-inset-bottom`.
- No discount code input on the customer page.
- Categories in drag-and-drop sort order.

---

## 8. Deal management

### Stock-aware auto-hide

> **RULE** — A deal is shown on the customer order page only if active for the event AND every slot category has at least one available item. Hidden from customers automatically; shown to operator with "currently hidden" warning.

### How deals render on tickets

**Window view:** Deal as single priced line "🎁 Lunch Deal £12.00". Constituent items indented. Standalone items above deals block.

**Cook view:** No deal labels, no prices. All items merged into category groups.

---

## 9. Kitchen Display System (KDS) rules

### View modes

- `solo` — mobile/web dashboard. Compact, all controls.
- `window` — iPad KDS window mode. Full detail, prices, Mark paid & done.
- `cook` — iPad KDS cook mode. No prices, larger tap targets, Ready button. Max-only.

### Event lifecycle wording (V5)

- **Start Event** — opens a confirmed event. Toast: "Event started". Status: ● Live.
- **Restart Event** — reopens a closed event. Toast: "Event restarted".
- **Close** — sets `status: 'closed'`. Only an open event can be closed.

Closing an event is recoverable — closed events appear in the picker with a Restart Event button. The server `open` action accepts `status: confirmed OR closed`.

### Allergy and notes

Cook view shows notes — **allergy information must never be hidden from the cook.**

---

## 10. Add Order panel

### Layout

- **iPad (md:+)** — split screen. Menu left, cart right.
- **Phone (below md:)** — single column list. Sticky bottom bar with "Review order →".

### Fast-tap rules

- Tapping an item adds immediately at base price. No popup.
- This is the Square/Toast POS pattern.

### Event bar

The active event shows in the sticky event bar below the tabs. The in-panel event box shows only while `status !== 'open'`. Once live, the sticky bar is the sole event display.

### Grace period banner (V4)

Orders for an event whose end time has passed >30 min show a passive amber banner. The Confirm order button is NOT disabled.

---

## 11. Native app and offline architecture

> **DECISION** — A native wrapper using Capacitor must be built BEFORE any trial begins.

### Heartbeat architecture (V6)

- One `last_heartbeat_at` column per `truck_vans` row — no per-device granularity.
- Both KDS page and main dashboard fire `POST /api/heartbeat` every 15 seconds, passing `{ token, vanId }`.
- Heartbeat monitor edge function checks `last_heartbeat_at < now - 30s` and sets `online_paused_until = now + 2h`.
- A live heartbeat receipt clears `online_paused_until` back to null.
- **All-or-nothing offline detection works by design** — whichever device pings most recently overwrites `last_heartbeat_at`. As long as any one device is online and pinging, the van stays live. Only when ALL devices stop pinging does the van go stale.

### Three-stage offline progression

- **Stage A (pre-trial)** — Read-only offline cache. New orders blocked offline.
- **Stage B (post-trial)** — Walk-up orders offline with device-generated IDs.
- **Stage C (future)** — Full offline with reconciliation.

---

## 12. Authentication and access

### Sign-out (V4)

Must use `createSupabaseBrowserClient()` from `@supabase/ssr` followed by hard redirect to `/login`.

### Four permission levels (V6)

1. **Staff** — redirected to KDS on login, cannot access Manage page.
2. **Manager** — all Manage tabs except Billing. Can edit/invite staff only.
3. **Owner** — full access including Billing.
4. **Admin (platform-level)** — `operators.is_admin = true`. Sees 🔐 Admin link in UserMenu. Auto-authenticates on `/admin` via session check. Not attached to any specific truck.

> **RULE** — Admin is a platform role on `operators`, not a truck role on `truck_users`. Do not attach admin accounts to trucks.

### Admin page auth (V6)

On mount, `/admin` calls `GET /api/admin?section=check_admin`. If `is_admin: true` on the session operator, the secret is returned and data loads automatically. `ADMIN_SECRET` password input remains as emergency fallback.

> **BACKLOG** — Remove `ADMIN_SECRET` at public launch.

### Email change verification

Writes to `operator_email_changes`, sends Brevo verification link to NEW address. Pending banner in Team tab with Resend + Cancel. Pre-flight duplicate check against `auth.users`. Forces sign-out on completion.

### Slug or UUID resolution

APIs accept both slug and UUID. Try slug first, fall back to UUID. Apply to any new truck-scoped API.

---

## 13. Operator and multi-truck model

> **RULE** — When an operator has ONE truck, the truck name and selector are never shown. All multi-truck UI is gated on `operatorTrucks.length > 1`.

- `operators` — `first_name`, `last_name`, `phone`, `email`, `auth_user_id`, `is_admin`.
- `trucks.operator_id` — nullable FK. One operator can own multiple trucks.
- Personal details (name, phone, login email) — Team tab. Never shown to customers.
- Business contact (email, phone shown to customers) — Settings.

---

## 14. Vehicles (trucks under a brand)

> **NAMING** — UI calls physical vehicles "trucks". DB tables remain `truck_vans` / `truck_user_vans`. User-defined names are operator data and must never be auto-changed.

### Per-vehicle settings

- `auto_pause_on_offline` — pause online orders if this device goes offline.
- `show_cooking_step` — adds Cooking step on this vehicle's KDS.
- `kitchen_capacity` — max COOKED items per 5-minute window; drinks/instant items excluded. Options: No limit, 1–20 items. Editable from both manage page Settings and dashboard Menu & Stock tab (when event active).
- `display_layout` and `split_screen` — NOT in van settings; set from dashboard/KDS directly.

---

## 15. Events and venues

> **RULE** — Events created manually in the Manage page auto-confirm immediately (`source='manual'`, `status='confirmed'`). Only scraped/uploaded events arrive as unconfirmed.

### All event sources flow to truck_events

Every event source — scraper, vendor email, manual entry, operator upload — ends up in `truck_events`. The truck confirms before orders are accepted. Manual entries by the operator auto-confirm; inbound sources arrive unconfirmed.

### Import schedule feature (V6)

- `📤 Import schedule` button on Schedule tab header, next to `+ Add event`.
- Separate modal from Add event modal. Uses drag-and-drop file upload (reuses `useDragDrop` hook from `lib/useDragDrop.ts`), paste text, "Process schedule" button.
- New API route: `app/api/manage/process-schedule/route.ts`. Verifies token, calls `gemini-2.5-flash-lite`, extracts 6 fields only: `event_date`, `start_time`, `end_time`, `venue_name`, `town`, `postcode`. **No truck name extraction** — truck is always the logged-in operator's truck.
- Extracted events show interactive review: checkbox per event (all pre-selected), inline edit with venue suggestions dropdown, selective save ("Save N events").
- Events saved via `upsert_event` → `status: 'confirmed'`, `source: 'operator_upload'`. Surfaces on both maps via existing `discovery/events` read path.

### Event lifecycle controls

- **Start Event** — opens confirmed event. Toast: "Event started". Status: ● Live (green).
- **Restart Event** — reopens closed event. Toast: "Event restarted".
- **Close** — sets `status: 'closed'`. Recoverable — closed events appear in picker with Restart Event button.

### Offline protection per-event override (V6)

`truck_events.offline_protection_override` (nullable boolean). `null` = use van's `auto_pause_on_offline`. `true`/`false` = explicit event override set from dashboard Menu & Stock tab. Menu API checks event override before van default. Warning shown in dashboard when protection is disabled for a specific event: "⚠️ Disabled for this event only. To disable for all events, go to Settings in the Manage page."

### Cancel event (V6)

`openEventCancelModal` fetches real affected order count from `/api/events/affected-orders` before showing the modal. Was hardcoded to 0. Cancellation sets all `pending` and `confirmed` orders to `cancelled` and emails affected customers.

### Schedule tab layout (V6)

Date-anchored card layout:
- Large orange day number in left column with day name and month
- Venue name + town (town omitted if already in venue name) + status badge
- Time prominent (`text-sm font-semibold`), postcode on its own muted line below
- Actions (Copy, Edit, Cancel) right-aligned
- Deals collapsed into `<details>` summary showing deal names — expands on tap
- Past events: Copy only, deals section hidden, Edit and Cancel hidden
- Cancelled past events show "Cancelled" badge, not "Finished"

### Geocoding

Manual events geocode via Gemini from venue name + town + postcode at save time, with `api.postcodes.io` fallback. Event still saves if geocoding fails; operator warned with toast; Fix button re-geocodes events with null coordinates.

### Discovery map

`discovery/events` route queries both `discovery_events` and `truck_events` (status `confirmed` or `open`), merges at read time, deduplicates by `truck-date-venue` key (operator version wins). `truck_events` now surface on both Village Foodie and HatchGrab maps — the `isHG` gate was removed in V5.

---

## 16. Database schema essentials

### Core tables

- `trucks` — `plan` (starter/pro/max/trial/tester), `trial_expires_at`, `feature_overrides` (JSONB), `is_test`, `slug`, `truck_emoji`, `time_selection_enabled`, `qr_code_style`, `lifetime_discount_pct`, `lifetime_discount_note`.
- `operators` — `first_name`, `last_name`, `phone`, `email`, `auth_user_id`, `is_admin`.
- `truck_vans` — `auto_pause_on_offline`, `show_cooking_step`, `kitchen_capacity`, `kds_token`, `last_heartbeat_at`, `online_paused_until`, `paused_until`.
- `truck_users` — `role` (owner/manager/staff), `invited_at`, `accepted_at`.
- `truck_user_vans` — staff ↔ vehicle access.
- `operator_email_changes` — email change audit.
- `menu_categories` — `sort_order`, `allow_notes`, `prep_secs`, `batch_size`.
- `menu_items_db` — `is_available`, `stock_count`, `prep_secs`, `batch_size`.
- `modifier_options` — `available` boolean. `false` = hidden everywhere.
- `bundles_db` — deals. `bundle_price`, `slot_1..6_category`, `apply_to_new_events`.
- `event_deals` — per-event deal activation.
- `truck_events` — `event_date`, `start/end_time`, `venue_name`, `status`, `source`, `van_id`, `offline_protection_override` (nullable boolean, V6).
- `orders` — `items` (JSONB), `slot`, `event_id`, `van_id`.
- `whatsapp_logs` — `message_in`, `classification`, `events_found`, `possible_miss`.
- `discovery_trucks` — `hatchgrab_truck_id` (FK → `trucks.id`) links discovery truck to HatchGrab account.

### Migrations (as of June 2026)

```
20260518_production_slot_usage.sql
20260518_slot_bookings.sql
20260520_kds_foundation.sql
20260521_kds_display_mode.sql
20260521_plans.sql
20260521_plans_and_trial.sql
20260522_discovery_schema.sql
20260522_event_system.sql
20260523_messaging_schema.sql
20260525_heartbeat_keepscreen.sql
20260526_allergen_info.sql
20260526_visibility.sql
20260529_category_default_stock.sql
20260529_checkout_upsells.sql
20260529_item_default_stock.sql
20260529_modifier_option_available.sql
20260529_order_counter.sql
20260529_qr_code_style.sql
20260529_upsell_rules.sql
20260602_admin_role.sql
20260602_event_offline_override.sql
20260602_tester_plan_discount.sql
```

---

## 17. Menu API behaviour

- Slug or ID lookup — try slug first, fall back to UUID.
- No active filter — pausing controlled by dashboard pause state.
- `?dashboard=1` flag — returns all modifier options with `available` field; customers see only available options.
- Modifier availability: `opt.available !== false`. Unavailable modifiers are HIDDEN everywhere — unlike main items which show "Sold out".

---

## 18. Customer communications and email

### Order confirmation email

- **On submit (pending):** subject "Order #X received", heading "Order received!"
- **On confirm:** subject "Order #X confirmed", heading "Order confirmed!"
- Both use `formatConfirmationEmail` + `sendConfirmationEmail`. Includes items with modifiers, deals, venue, contact method, cancel link, HatchGrab branding.
- `slotAdjustedFrom` param: shows amber "Your collection time has been updated" box when slot changed.

### Customer cancel page (V5)

`app/order/[id]/manage/page.tsx`. Cancel URL: `/order/[id]/manage?truck=[slug]`. Verifies `allow_customer_cancellation`, order status (`pending` or `confirmed`), and cutoff window before cancelling.

### Cancellation cutoff (V6)

`effectiveSlot = order.slot ?? event.end_time ?? null`. If neither available, check is skipped. ASAP orders can cancel up to `cancellation_cutoff_mins` before event end time.

---

## 19. Reports tab (V4)

### Tier gating

- **Starter** — Event filter only, CSV export.
- **Pro / Max / Trial / Tester** — Full filter toggle, revenue breakdown, items ranking, deal performance.

> **RULE** — Use `invisible` (not `hidden`) for toolbar elements when conditionally shown. Reserves space, prevents layout shift.

---

## 20. Social media and WhatsApp auto-replies

### Three-bucket classification

- `SPECIFIC_QUERY` → auto-respond with matching event(s).
- `GENERAL_QUERY` → auto-respond with order link.
- `IGNORE` → no response.

### Tier mapping

Messenger & Instagram: Pro. WhatsApp: Max only (per-message cost).

### Meta webhook endpoints (V5, scaffolded)

- `/api/webhooks/meta/whatsapp` — Meta WhatsApp (NOT Twilio)
- `/api/webhooks/messenger`
- `/api/webhooks/instagram`

> **RULE** — The existing Twilio WhatsApp handler at `/api/webhooks/whatsapp` must NOT be overwritten.

---

## 21. Competitive positioning

### Hatches Up cost model

4.5% + 20p all-in on online orders; 1.5% + 10p in-person. No subscription.

> **RULE** — Honest framing: "Hatches Up is 4.5% all in. We are £29/month plus 0.99% plus card processing. Above ~£1,750/month online orders we are cheaper, and you get features they do not have."

Migration pitch: "Currently on Hatches Up? Switch and get 3 months free on any tier."

---

## 22. Development process

> **OPERATOR PREFERENCE** — When presenting any code or file, the file path must appear immediately above it as `path/to/file.tsx` in bold inline code. Never make Dominic scroll up to find which file to update.

### Two-chat pattern (V6)

- **Planning chat (Claude)** — strategy, UX, architecture, instruction writing. Does NOT write code. **Claude within Cursor is the coding tool.**
- **Coding chat (Cursor/Claude)** — implementation, file edits, smoke tests. Does NOT make strategic decisions.
- **Audits** — can be sent to Cursor directly for a summary response. Do not require grep + paste back for every audit.

### Smoke tests

Every change includes a smoke test: action to perform, expected behaviour, edge cases. Nothing is "done" without an operator-confirmed smoke test.

### SQL migrations

Run in Supabase SQL editor; confirm clean before deploying. Use idempotent (`if not exists`) migrations.

---

## 23. Mobile UX patterns

### Preventing iOS Safari auto-zoom

> **RULE** — Inputs, selects, and textareas must be at least `16px` on mobile. `app/globals.css` locks these to `16px` below 640px breakpoint.

### All categories collapsed by default

`expandedCat` initialises to `null` on Manage page open.

> **RULE** — Use `invisible` (CSS `visibility: hidden`), not `hidden`, for layout-reserved toolbar elements. Reserves space, prevents layout shift.

---

## 24. Scraper workflow (V6)

GitHub Actions workflow `.github/workflows/daily_scrape.yml`:
- **Node 20** (not 24) — Puppeteer 24.x compatibility
- **No `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`** — removed
- **Chrome install:** `rm -rf ~/.cache/puppeteer/chrome` then `npx puppeteer browsers install chrome`
- **No custom `PUPPETEER_CACHE_DIR`** — uses default path
- Gemini quota resolved by upgrading to paid plan
- Apps Script 6-minute execution limit — time guard needed

---

## 25. Testing and dev environment

### Dev setup

- `localhost:3000` for local testing.
- Test Kitchen: `dashboard_token test-abc123def456`, `id test-truck`, `slug test-kitchen`, `is_test true`.
- iPad Air simulator for KDS; Safari responsive mode at tablet sizes; phone widths 375/414px.

### Pre-trial checklist

- Capacitor wrapper built; Stage A offline working reliably.
- Auth hardening (rate limiting, admin secret).
- Brevo hatchgrab.com domain verified and propagated.
- End-to-end smoke test: place order → KDS → confirmation email → cancel page from email link → mark ready notification → mark paid & done.
- QR code and dashboard order link resolve to `/trucks/[slug]/order`.
- Scraper bridge verified: linked truck's inbound event creates unconfirmed `truck_events` row.
- API keys in Script Properties (not hardcoded).
- Wake lock confirmed working under iOS 16.4+ and Chrome Android.
- `offline_protection_override` migration run in Supabase.
- `lifetime_discount_pct` and `lifetime_discount_note` migration run.
- `is_admin` migration run; admin operator account set.

### Contextual reminders

- UI text contrast floor on white: `slate-700` body, `slate-500` secondary, `slate-400` decorative only; orange for active highlights.
- Watch for `new Date('YYYY-MM-DD')` UTC bugs — always use `new Date(\`${date}T${time}\`)`.
- Watch for `next/image` shadowing the global `Image` constructor — use `document.createElement('img')`.
- Always strip seconds via `formatTime()` — never inline `t.slice(0,5)`.
- ASAP base time is `max(now + prep, eventStart)` — never add prep on top of a future event start.
- Customer order URL is `/trucks/[slug]/order`. Never return `dashboard_token` in a public API response.
- New operator pages reuse `AppHeader` and `slate-900` tabs (`lib/brand.ts`).
- `is_test` never gates operator features — discovery map only.
- `dashboard_token` must never appear in customer-facing or public API responses.

---

## 26. Open backlog (June 2026)

### Critical — before trial

- Capacitor native wrapper; Stage A offline cache; offline detection banner; background sound.
- Auth hardening (rate limiting).
- Google Sheets → DB migration.
- Discovery map VF vs HG visibility test.
- Heartbeat/auto-pause end-to-end test.
- Apps Script 6-minute timeout time guard.
- Brevo hatchgrab.com DNS propagation.
- `orders.source` column migration — replaces `customer_email IS NULL` heuristic.
- Link each trial truck's `discovery_trucks` row to its HatchGrab truck (`hatchgrab_truck_id`) via admin console.
- Confirm scraper GitHub Actions Node 20 workflow passes cleanly.

### Important — before public launch

- Stripe Connect integration.
- Multi-device session enforcement.
- Remove `ADMIN_SECRET` — session auth is the only path needed.
- Operator UI pause state reload — read from `truck_vans.paused_until` for active event's van, not `trucks.paused_until`.
- `orders.ready_time` column — store calculated collection time at submit for tighter ASAP cancellation control post-trial.
- Schedule tab map panel — lat/long already stored on `truck_events`; show event locations on a map alongside the schedule list on desktop.
- `password_reset_tokens` cleanup job.
- `slot_capacity.max_orders` → `max_batches` rename.
- Loyalty stamp cards V1 (Max only) — when instructed.
- Companies House registration for HatchGrab.
- Privacy policy + terms pages.
- Twilio WhatsApp vs Meta Cloud API consolidation.

### Later

- Stage C full offline; customer-facing display (Max); advanced reporting visualisations; festival pricing.
- WhatsApp "Recent messages" review panel; event cleanup job (delete events > 90 days).

### Open questions

- AI DM classifier confidence threshold.
- iPad printer model (Star Micronics vs Epson).
- Truck-level vs operator-level billing in Phase 2.
- Loyalty redemption UX design.

---

## 27. Closing note

This manual is living documentation. Update it whenever a new rule is established, a feature behaviour is decided, a DRY violation is identified and fixed, a plan tier feature changes, or a coding convention shifts.

When in doubt about how something should work: check here first. If the answer is not here, work out the right answer, document it here, then implement.

The cost of writing things down is a few minutes. The cost of not writing them down is rebuilding the same decision next week.
