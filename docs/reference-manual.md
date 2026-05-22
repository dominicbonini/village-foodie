# HatchGrab Engineering Reference Manual

**Version 2.0 — May 2026**  
Village Foodie · Food Truck Ordering Platform

> This document defines the rules, conventions, and architecture decisions for the HatchGrab platform. It is the source of truth for any coding session and must be consulted before making structural changes.

---

## How to use this manual

- Before adding any new feature, search this manual for related rules
- When auditing existing code for DRY compliance, this manual defines what should be shared
- When making a UX decision, check whether the rule already exists here
- When a feature seems to contradict this manual, the manual wins — either update the code or update the manual, never let them disagree silently

> **CRITICAL:** If a coding session produces code that violates rules in this manual, that is a regression. Either the rule changes (with explicit agreement) or the code changes. The two must never diverge.

---

## Changelog

### V2.0 — May 2026
Merged content from ther engineering decisions document. Key changes from V1:

- **Starter tier is now FREE** — earlier draft said £19/month
- **Trial is a distinct plan tier** — own plan value (`starter / pro / max / trial`) with `trial_expires_at` timestamp. Default 1 month, 3 months for hand-picked early signups
- **Native wrapper is a pre-trial deliverable** — must be built before any trial begins
- **Offline architecture documented** — three-stage progression (A/B/C) with Stage A as V1 pre-trial scope
- **Plan feature matrix updated** — cook screen is Max-only, Instagram/Messenger confirmed as Pro, WhatsApp confirmed as Max
- **Per-truck feature overrides** — new `feature_overrides` JSONB column on trucks
- **KDS architecture documented** — view modes, layout modes, category grouping, urgency colour logic, deal rendering

---

## 1. Purpose

This manual exists to prevent regressions. Every coding session loses context. Without a written record of how features work, why decisions were made, and what rules must the codebase drifts. Patterns get duplicated. Conventions get abandoned. Bugs get reintroduced.

Read this before every coding session. Update it after every meaningful change.

---

## 2. Architecture overview

### Platform identity

- **Village Foodie** — the discovery map, weekly newsletter, and "find food trucks near me" experience. Customer-facing.
- **HatchGrab** — the iPad KDS, operator dashboard, menu management, and order flow. Truck-facing.

When in doubt about naming: customer-facing surfaces use Village Foodie branding; operator-facing surfaces use HatchGrab branding.

### Tech stack

- **Frontend** — Next.js with TypeScript, Tailwind CSS, deployed to Vercel
- **Database** — Supabase (PostgreSQL) with token-based access
- **Realtime** — Supabase realtime channels (postgres_changes) for KDS queue updates
- **Email** — Resend for transactional emails
- **Native wrapper (planned pre-trial)** — Capacitor around the existing Next.js app. Native modules only for hardware integration (prfeatures (background notifications, offline detection, screen wake)
- **Domain** — villagefoodie.co.uk

### Key surfaces

| Surface | URL | Auth | Purpose |
|---------|-----|------|---------|
| Discovery map | / | None | Village Foodie public site |
| Customer order page | /trucks/[slug]/order | None | Pre-orders and pay-at-hatch. Pro/Max feature |
| Truck dashboard | /dashboard/[token] | Token + PIN | Operator order management |
| iPad KDS | /dashboard/[token]/kds | Token + PIN | Kitchen display system |
| Manage page | /manage/[token] | Token + PIN | Operator settings and menu management |
| Admin console | /admin | Admin secret | Platform admin — plans, trials, overrides |

---

## 3. DRY — Don't Repeat Yourself

> **THE RULE:** If the same logic, value, or pattern appears in two places, it belongs in one place. Audit before adding. Extract before duplicating. Use props before re-deriving.

### Where logic lives

**Shared calculation libraries — `lib/`**

All business calculations live in `lib/`.re the only places where these calculations should be implemented:

- `lib/order-calculations.ts` — order totals, deal pricing, discount application
- `lib/basket-utils.ts` — basket add/remove operations, deal cleanup, grouping by category
- `lib/deal-utils.ts` — bundle slot category extraction, deal original price calculation
- `lib/slot-utils.ts` — ASAP slot selection, future-time validation
- `lib/slot-bookings.ts` — production slot operations, `normaliseOrderLines`
- `lib/slot-capacity.ts` — `canFitInProductionSlot`
- `lib/prep-utils.ts` — prep time calculation, category configs, queue-aware ready time, `buildCatConfigs`
- `lib/features.ts` — plan tier feature map, `canAccess` function
- `lib/useFeatures.ts` — React hook for feature checks

**Display helpers — `components/dashboard/helpers.ts`**

Display-only helpers that handle visual concerns (what colour should a header be, what age state is a ticket in) can live with the components they serve. Examples: `getCombinedUrgency`, `getrStyle`, `getTicketAge`.

> **RULE:** Business calculations live in `lib/`. Display-only helpers may live with the components they serve. When in doubt, put it in `lib/`.

**Type definitions**

Shared types and constants like `CatConfig` and `DEFAULT_CAT_CONFIG` live in `lib/prep-utils.ts`. `components/dashboard/types.ts` re-exports them. Never define the same type in two places.

### What must be shared

**Category ordering and grouping**

The category order is fetched **once** in the API (`/api/dashboard`) and passed down as props (`categoryOrder: string[]` and `itemCategoryMap: Record<string, string>`). It is never re-derived in components. This order must be applied consistently everywhere items are displayed:

- KDS window view (category groups)
- KDS cook view (same category groups)
- Add Order panel (menu grid)
- Customer order page
- TO MAKE all-day count bar

**Order creation logic**

There are two valid paths — manual (operator) and customer self-order. These have intentional divergences and musNOT be consolidated into a single `createOrder` function. However the following utilities **must** be shared between both paths:

- `buildCatConfigs` in `lib/prep-utils.ts`
- `normaliseOrderLines` in `lib/slot-bookings.ts`
- `nextOrderId` in shared utilities
- `canFitInProductionSlot` in `lib/slot-capacity.ts`
- `calculateOrderTotal` in `lib/order-calculations.ts`

**OrderCard component**

There is ONE `OrderCard` component for all rendering of order tickets. It accepts a `viewMode` prop (`solo` / `window` / `cook`) and branches its render internally.

These must never happen:
- A separate `WindowOrderCard` or `CookOrderCard` component
- Duplicated render logic for different views
- Layout pages building their own ticket display instead of using `OrderCard`

The KDS page is a thin layout wrapper. It composes `OrderCard` with the right props. It does not render orders directly.

**Feature gating**

All feature access checks must go through `canAccess()` from `lib/features.ts`.

Forbidden patterns:
- `if (plan === "pro")` — bypasses overrides and trial logic
- `if (truck.plan !== "starter")` — same problem
- Hardcoded feature lists outside `lib/features.ts`

### DRY audit before every feature

Before building any new feature, the coding session must:
1. Search the codebase for related logic that already exists
2. Paste the existing structure for review before writing new code
3. Make extraction the default — duplication requires explicit justification

---

## 4. Plan tiers and feature gating

### Four plans

| Plan | Price | Key additions |
|------|-------|---------------|
| Starter | **Free** | KDS, dashboard, walk-up orders, menu, deals, sold-out toggle, stock countdown, pay-at-hatch |
| Pro | £29/mo | Online payments, advance pre-ordering, time slots, smart pacing, auto-accept, Instagram/Messenger replies, offline protection |
| Max | £49/mo | Ticket printing, multi-device KDS, cook screen, WhatsApp replies, festival pricing |
| Trial | Free | All features except WhatsApp (cost-incurring). Expires tr |

### Pricing rationale

- Starter free reduces signup friction — trucks try before committing
- £29 Pro sits below the £30 psychological threshold
- £20 gap between Pro and Max is deliberately small to encourage upgrades
- Walk-up orders have 0% platform fee on all tiers
- Online orders: N/A on Starter, 0.99% + card processing on Pro and Max

### Feature gating rules

- Static feature map lives in `lib/features.ts`
- Resolution order in `canAccess()`: per-truck override → trial expiry check → plan tier
- Per-truck overrides stored in `trucks.feature_overrides` (JSONB), edited from admin console
- Expired trials silently drop to Starter feature set
- UI components use `useFeatures(truck)` hook; non-React code uses `canAccess()` directly
- Gating happens both UI-side (hide buttons, show upgrade prompts) AND API-side (reject forbidden requests)

### Cook screen — Max only

The cook screen (`?view=cook`) is Max-only because:
- A cook screen is only useful with two physical devices
- Starter/Pro ele active session — a second device kills the first
- Max gets unlimited concurrent sessions

Hide the Cook button from Pro even though it could technically work on one device — it would confuse operators.

### Trial behaviour

- No payment details required at signup
- Duration set per-truck in admin console (1 month default, 3 months for early signups)
- Warning banner on KDS in last 7 days
- Red expired banner if trial lapsed and plan not yet changed
- Drops to Starter automatically on expiry — no lock-out

### No premium badges on customer surfaces

> **CRITICAL:** Customers must NEVER see "Premium" badges, upsell language, or any indication that features are gated behind subscription tiers. Premium features are silently enabled or disabled per truck.

---

## 5. Order management

### Order lifecycle

| Status | Meaning |
|--------|---------|
| `pending` | Customer placed order, not yet confirmed. Only set by customer path when `auto_accept` is false |
| `confirmed` | Accepted into queue. Default fual orders |
| `cooking` | Optional intermediate state in kdsMode |
| `ready` | Food prepared, waiting for collection. Customer notified by email |
| `collected` | Customer collected and paid. Disappears from active views |
| `cancelled` / `rejected` | Will not be fulfilled |

### Walk-up vs customer orders

> **CRITICAL DISTINCTION:** Walk-up orders and customer orders are two different flows with intentionally different behaviour. They must not be merged.

**Walk-up (manual) orders**
- Created by operator via Add Order panel
- Customer name optional — defaults to `"Walk-up"` in DB if blank
- Email and phone hidden behind `"+ Add email / phone"` toggle
- Auto-confirms immediately (operator is physically present)
- Button label: **"Confirm order"**
- No modifier popup on item tap — items add instantly at base price
- Modifiers added by tapping the line in the cart, NOT before adding
- Decrement stock on success (separate API call after manual action)

**Customer self-orders**
- Created via `/trucks/[slurder`
- Customer name is required
- Server-side total validation against DB prices (untrusted client)
- Lands as `pending`; auto-confirms only if `truck.auto_accept` is true and slot capacity allows
- Button label: **"Place order"**
- Modifier popup on item tap (drives accuracy and upsells)
- Sends WhatsApp notification (Max) or email to truck

### Auto-accept logic

Only customer-path orders are subject to `auto_accept`:
- `false`: order stays pending, operator must manually confirm
- `true`, no slot: order auto-confirms immediately
- `true`, with slot: `resolveAutoAcceptSlot()` checks capacity — confirms if fits, bumps to next slot if not

Manual orders bypass `auto_accept` entirely and always confirm directly.

### Intentional divergences between order paths

These are correct and must not be accidentally merged:

| Divergence | Reason |
|-----------|--------|
| Manual always starts confirmed | Operator is physically present and knows queue state |
| Customer starts pending | Operator may want to reviebefore confirming |
| Customer validates totals server-side | Untrusted client |
| Customer sends WhatsApp + email | Truck needs notification. Manual path skips — operator is already there |
| Manual ignores `truck.auto_accept` | Flag governs customer orders only |

### Pause and extra wait

- **Pause orders**: stops all customer-facing ordering. Requires confirmation dialog before activating. No confirmation to unpause
- **Extra wait**: adds global delay to all collection time estimates. 10-minute increments. No confirmation needed
- Both show persistent banner on KDS and dashboard while active
- Both controls live in KDS header AND mobile dashboard — same API calls, no duplication

---

## 6. Prep time and queue logic

### Queue-aware ready time formula

```
totalQty   = queueByCat[cat] + newByCat[cat]
finalBatch = ceil(totalQty / batchSize)
prepSecs   = finalBatch × prepSecsPerBatch
```

`calcQueueAwareReadySecs` in `lib/prep-utils.ts` is the **only** implementation of this formula.

### Batch logic items are placed AFTER the existing queue. If batch 2 has space, new items slot into batch 2 and finish alongside it. If batch 2 is full, new items spill into batch 3. Kitchens do not restart a partially-filled batch for a new order.

### Categories cook in parallel

Ready time = MAX across categories, not SUM. Pizza (8 min) + sides (2 min) = ready at 8 min, not 10 min.

### Buffer application

- Truck dashboard: passes `waitMinutes × 60 + 120` (manual wait override + 2 min handoff buffer)
- Customer pre-order page: passes `0` (no buffer — event has not started yet)

### Customer page is a pre-order context

Customer page calculates ASAP from `event.start_time`, not `new Date()`. A customer pre-ordering at 10am for an event at 17:00 sees ASAP = 17:00 + prep time, not now + prep time.

### Time rounding and display

- Customer-facing ASAP rounds to NEAREST 5 minutes (not always up). 17:06 → 17:05, 17:08 → 17:10
- Truck dashboard shows exact times — operator needs precision
- ASAP button shows **"Ar0"** (not tilde) — clearer to customers

### Slots API contract

`/api/slots/[truckId]` returns three things:
1. List of slots with availability flags
2. `queueByCat` — existing queue by category
3. `catConfigs` — prep configs by category

Even if a truck has no `collection_times` configured, the API still returns `catConfigs` and `queueByCat`. Only the `slots` array is empty.

### No server roundtrip on basket change

Customer page calculates ASAP entirely client-side. No debounced re-fetch on basket change. Mobile coverage is unreliable; client-side is instant.

### Category name lowercase consistency

All category lookups use lowercase keys. The slots API lowercases `itemCatMap` values. Customer page lowercases `menuItem.category` before lookup. "Pizza" (DB) must match "pizza" (config key).

### `prep_secs` and `batch_size` defaults

These return `null` when not set, NOT `0`. Reason: `0 ?? 240` evaluates to `0` (nullish coalescing only catches null/undefined). Consumers use `|| 0` for instant itemspretation and fall back to `DEFAULT_CAT_CONFIG` when truly missing.

---

## 7. Customer order page UX

### Collection time default state

Both ASAP and Choose Time start **unselected** on page load. Customer must explicitly choose one before submit activates. Prevents accidental ASAP selection.

### Mutually exclusive selection

ASAP and Choose Time are mutually exclusive:
- Selecting ASAP clears the Choose Time dropdown to placeholder
- Selecting a specific time removes the ASAP highlight

### ASAP button visual states

- Deselected, available: white background, slate border, orange ASAP text
- Selected: solid orange background, white text
- Unavailable: greyed out, "Unavailable" label

### Choose Time visual states

- Deselected: white background, "Choose time" placeholder
- Selected: solid orange background showing chosen time
- Free tier: greyed out with "ASAP only" subtitle — **NO premium badge**

### Slot auto-clear on basket change

If the customer selects a specific time then adds more items thatush calculated ASAP past their chosen time, the chosen time is automatically cleared. Prevents impossible orders.

### Categories sort order

Menu items group by category in the order defined in `menu.categories` (truck's drag-and-drop sort order from manage page). Not alphabetical, not random.

---

## 8. Deal management

### What is a deal

A bundle grouping multiple menu items into a single purchase at a discounted price. Example: Lunch Deal — one pizza + one dip + one drink for £12.

### How deals render — window/solo view

- Deal renders as a **single priced line**: "🎁 Lunch Deal £12.00"
- Constituent items indented below, no individual base prices
- Modifier upcharges still shown on constituent items (e.g. `+ Extra Cheese +£1.50`)
- Special instructions shown italic below relevant item
- Standalone items render in category groups **above** the deals block
- Deals block is its own section — NOT distributed into category groups

Why: the window person needs to see the bundle price once, cleabuting deal items into categories makes the deal label repeat per category, which is noise.

### How deals render — cook view

- No deal labels at all
- No yellow border
- No prices
- All items (deal and standalone) merged into category groups and sorted
- Cook does not care about commercial bundling — only what to make

### Deal pricing rules

- Deal price is the total for the bundle
- Modifiers on deal items still add their individual upcharge to the order total
- Order total = (standalone items × prices) + (deal prices) + (modifier upcharges)
- Server-side validation re-computes against DB prices to prevent client tampering

### Deal removal preserves basket

`AppliedDeal` includes `itemsTakenFromBasket: string[]` — items taken from the existing basket when the deal was applied. When a deal is removed, only these items are removed. Items added fresh for the deal are not removed.

---

## 9. Kitchen Display System (KDS) rules

### View modes

| Mode | Who uses it | Key features |
|------|--------------------|
| `solo` | Mobile/web dashboard | Compact, expand/collapse, all controls |
| `window` | iPad at serving hatch | Full detail, prices, Mark paid & done |
| `cook` | iPad in kitchen | No prices, no deal labels, Ready button only |

### Layout modes

| Layout | When to use |
|--------|------------|
| `list` | Single column — quiet service or counter-top |
| `grid` | Multi-column auto-fill — busy service or mounted displays |

The four combinations (window-list, window-grid, cook-list, cook-grid) all work independently. In-screen switcher in KDS header lets operators toggle without going to settings.

### Urgency colour logic

Header colour is driven by `getCombinedUrgency(slotTime, createdAt, status)`:

- `ready` → solid green top border (overrides everything)
- `cooking` → amber top border
- Otherwise → take the MORE urgent of:
  - **Slot urgency**: how close is the collection time
  - **Age urgency**: new <5min, ok 5-15min, warn 15-30min, late 30min+

An order sitting 25 minutes unacknowws amber regardless of slot time. Operators must see what is being neglected.

### Card layout rules

- Grid mode: `items-stretch` for equal heights within a row
- Action buttons: `mt-auto` inside `flex-col` card to always sit at bottom
- "Mark paid & done": dark slate colour — distinct from green ready state and teal brand colour
- "Ready" button: solid green on cook view
- No small "Ready" badge if header already shows ready state — redundant

### Price alignment

All prices in a card right-align to the same column edge:
- `tabular-nums` on price spans — fixed-width digit glyphs
- `w-16 flex-shrink-0 text-right` on price column
- `flex-1 min-w-0` on item name

£1.50 and £12.00 must align at the decimal point. Modifier upcharges must align in the same column as base prices.

### Category grouping

- Section header: `text-xs font-bold uppercase tracking-widest text-slate-700` + horizontal rule to the right
- `first:mt-0` removes top margin on first category
- Items within category sorted alphabeticaecondary sort
- Unknown categories fall into "Other" group at the bottom

### TO MAKE all-day count bar

- Aggregated counts of all active items across all in-flight orders
- Excludes modifiers — counts base items only (Toast/Square pattern)
- Updates in real-time as orders change state

### Allergy and notes

- Special instructions: italic below the item line
- Order-level notes: red block at the bottom of items
- Notes always visible — no truncation, no hiding
- **Cook view shows notes too — allergy information must never be hidden from the cook**

---

## 10. Add Order panel

### Purpose

For operators to manually enter orders. Used for walk-up customers and pre-orders received via phone/Facebook/in-person. Used frequently throughout service — must be fast.

### Layout

- **iPad (`md:` and above)**: split screen — menu left (58%), live cart + submit right (42%). No scrolling for typical orders
- **Phone (below `md:`)**: single column. Sticky bottom bar shows count and total. "Order →" opens bwith name, slot, and confirm

### Fast-tap rules

- Tapping an item adds it to cart **immediately** at base price
- No modifier popup, no confirmation, no upsell — just add
- Tapping the same item again increments quantity
- Modifiers added by tapping the line in the cart, not before
- This is the Square/Toast POS pattern — no time for popups mid-transaction

### Customer details

- Name optional — defaults to `"Walk-up"` in DB if blank
- Email and phone behind collapsible `"+ Add email / phone"` toggle — hidden by default

### Confirm order button

- Label: **"Confirm order"** (not "Place order" — that is the customer-facing label)
- Price suffix when items present: `"Confirm order · £23.00"`
- Disabled until at least one item or deal in cart
- On success: toast, reset form, switch to Orders tab

---

## 11. Native app and offline architecture

### Why native is needed

> **DECISION:** A native wrapper using Capacitor must be built BEFORE any trial begins. Food trucks operate in villages with perage. A web-only KDS that loses connection during service is a critical failure.

### Capacitor wrapper, not React Native rebuild

The native app is a Capacitor wrapper around the existing Next.js application. Native code added only for:

- Offline connectivity detection (NWPathMonitor)
- Local storage for orders (IndexedDB / Capacitor Preferences)
- Background sound notifications for new orders
- Screen wake / keep-awake behaviour
- Bluetooth printer integration (Max tier, post-trial)

The Next.js UI is reused unchanged. This preserves DRY completely — no separate native KDS UI, no duplicated OrderCard, no second codebase.

### Three-stage offline progression

**Stage A — Read-only offline cache (V1 pre-trial)**
- When online: all active orders cached to iPad
- When offline: iPad keeps showing cached orders
- Cook can still mark ready / mark done — actions queued locally and sync when reconnected
- New orders cannot be created while offline
- Offline banner appears automatically
- Solves the criticank screen during outage" failure

**Stage B — Walk-up orders while offline (post-trial)**
- Everything in Stage A
- Operator can add walk-up orders while offline — queued locally with device-generated IDs
- On reconnect: server assigns display IDs and resolves conflicts

**Stage C — Full offline with order ID reconciliation (future)**
- Everything in Stage B
- Device-generated UUIDs throughout, display IDs assigned at sync time
- Slot capacity reconciliation when offline orders meet server state
- Multi-device conflict resolution (Max tier)
- Operator notification: "3 orders synced. 1 order exceeded slot capacity — please review."

### Trial scope

Trial begins with Stage A only. Trial trucks selected from villages with reliable mobile coverage. Stage B and C are post-trial priorities. Direction may change based on early trial feedback.

### V1 native features (pre-trial)

- Offline detection and offline banner
- Read-only offline cache (Stage A)
- Screen wake / keep-awake
- Background sound alert frders

### Deferred to post-trial

- Ticket printing (Star Micronics or Epson SDK)
- Walk-up order taking while offline (Stage B)
- Full offline with ID reconciliation (Stage C)

---

## 12. Authentication and access

### Current model

Token-based access with PIN as second factor. Sufficient for V1 trial use.

- **Dashboard/KDS**: long random `dashboard_token` in URL + optional PIN
- **Customer URLs**: truck slug (`/trucks/pizzeria-gusto/order`)
- **Admin**: single `ADMIN_SECRET` environment variable, held in React state

### Slug or UUID resolution pattern

APIs that accept truck identifiers must handle both:
- **Slug** — customer-facing URLs
- **UUID** — dashboard and internal calls

Try slug first, fall back to UUID. This was the root cause of multiple "truck not found" bugs. When adding any new truck-scoped API, support both lookups from day one.

### Known gaps (fix before public launch)

- PIN visible in URL parameters — leaks to browser history and server logs
- No rate limiting on PIN attemptdigit PIN brute-forceable in 10,000 tries
- Admin secret is a single shared value — fine for solo use, not for staff

### Future model (post-trial)

- First visit: email/password or magic link
- Subsequent visits: persistent cookie — no re-login during service
- Quick PIN re-entry if iPad screen locks
- Token URL retained as iPad bookmark fallback

---

## 13. Multi-truck operator schema

Schema separation added now to avoid painful migrations later, even though multi-truck support is Phase 2.

### Operators table

Holds owner/business-level data: id, name, email (login), phone, billing_plan, billing_status, trial_ends_at, stripe_customer_id.

### What stays at truck level

Menu, categories, items, orders, events, schedules, stock, dashboard_token.

### What moves to operator level

Billing, login credentials, business name, global settings.

`trucks.operator_id` is a nullable foreign key to `operators.id`. Phase 1 has each truck with one auto-created operator. Phase 2 introduces one operator owning mule trucks.

---

## 14. Database schema essentials

### Core tables

| Table | Purpose |
|-------|---------|
| `trucks` | One row per truck. Plan, settings, dashboard_token, PIN hash, operator_id |
| `operators` | Business-level entity. Phase 2 ready |
| `menu_categories` | Categories per truck with `sort_order`. Source of truth for display order |
| `menu_items_db` | Items per truck with category |
| `bundles` | Deals and meal deals with slots configuration |
| `orders` | One row per order. `items` (JSONB), `deals` (JSONB), status |
| `collection_times` | Fixed slot definitions |
| `kds_sessions` | Active KDS device sessions for multi-device enforcement |

### Key columns added in V1

| Column | Type | Purpose |
|--------|------|---------|
| `trucks.plan` | text | `starter / pro / max / trial` |
| `trucks.trial_expires_at` | timestamptz | Null if not on trial |
| `trucks.feature_overrides` | jsonb | Per-truck feature grants/revocations |
| `trucks.kds_mode` | boolean | Enables cooking intermediate state |
| `trucks.crew_mode` | boolean | Enables multi-person crew workflow |
| `trucks.display_mode` | text | `list` or `grid` (KDS default layout) |
| `trucks.time_selection_enabled` | boolean | Controls customer Choose Time dropdown |
| `orders.paid_at` | timestamptz | Set when marked paid & done |
| `orders.collected_at` | timestamptz | Set when collected |

### Realtime publication

Supabase realtime enabled for:
- `orders` — INSERT, UPDATE, DELETE
- `trucks` — UPDATE only (pause/wait state changes)

All KDS sessions subscribe to both. Updates within ~1 second. 60s polling as fallback.

---

## 15. Menu API behaviour

### Slug or ID lookup

Both `/api/menu/[truckId]` and `/api/orders/submit` accept slug or UUID. Try slug first (customer URLs), fall back to ID (dashboard/internal). Resolve into `resolvedTruckId` variable for all subsequent queries.

### No active filter on menu lookup

The menu API does not filter by `active = true`. If the truck record exists, the menu is returned. Pausing orders is controlby the dashboard pause state, not the active flag.

---

## 16. Customer communications

### Order ready email

- Fires on `status → ready` only (not on any other transition)
- Only sent if `order.customer_email` is set
- `notifyCustomer()` also guards on empty email (belt and suspenders)
- Subject: "Your order is ready"
- Body includes order number and truck name

### Truck notification

- Sent when a customer self-orders (not on manual orders)
- WhatsApp (Max tier) or email fallback
- Includes order summary and link to confirm in dashboard

---

## 17. Social media auto-replies

### Three-bucket classification

AI classifies incoming DMs into:
1. Order page link request → auto-respond with order URL
2. Event time/location query → auto-respond with next event details
3. Anything else → escalate to truck owner

### Platform rules

- Build on Meta official Instagram Graph API — no scrapers or browser automation
- Stay within the 24-hour messaging window
- Use full `villagefoodie.co.uk` domain URLs horteners (Meta deboosts them)

### Response tone

AI responses must sound like the truck owner typed them — casual, warm, truck name and emojis where appropriate. Not corporate or robotic.

Example: *"Hey! We're at Nethergate Brewery this Saturday 11-5, here's the order link: [link] 🍕"*

### Confidence threshold

Below threshold, messages go to a review queue — not auto-responded. False auto-responses damage trust more than missed ones. Specific threshold to be set based on real classifier performance.

### Tier mapping

- Instagram auto-replies — Pro tier
- Messenger auto-replies — Pro tier
- WhatsApp auto-replies — Max tier only (incurs per-message cost)

---

## 18. Competitive positioning

### Hatches Up cost model

4.5% + 20p all-in on online orders (includes card processing). 1.5% + 10p for in-person. No subscription fee.

### Real differentiators

- Offline protection (auto-pauses on signal loss)
- Smart order pacing with queue-aware ASAP calculation
- Social media auto-responses (Instager, WhatsApp)
- Kitchen ticket printing (Max)
- Multi-device kitchen sync (Max)
- Customer time slot selection
- Auto-accept online orders
- Village-specific hyperlocal discovery

### Pricing comparison honesty rule

> **RULE:** Do not lead with misleading "4.5% vs 0.99%". The honest framing: *"Hatches Up is 4.5% all in. We're £29/month plus 0.99% plus card processing. Above £1,750/month online orders we're cheaper, and you get features they don't have."*

### Discovery as supporting argument

Village Foodie subscriber base is still small. It cannot be the primary selling point until discovery audience reaches meaningful scale. Lead with features, use price as the closer.

---

## 19. Events and venues

### Event confirmation (pre-trial deliverable)

A bot scrapes truck schedules and can be wrong. To protect customers:

- Unconfirmed events appear on the discovery map but order button is **disabled**
- Trucks must explicitly confirm "yes, I am attending this event" in the dashboard
- Only confirmed eventaccept orders
- Customers see "Awaiting truck confirmation" on unconfirmed events

This prevents customers ordering for events that won't happen and shields the platform from refund disputes caused by bot errors.

### Multiple events handling (pre-trial deliverable)

A truck with three events in the same week needs separate queues. Data model must support:
- Distinct order queues per event
- Distinct menus per event (optional — for festival pricing)
- Distinct slot configurations per event
- Clear navigation between events for the operator

---

## 20. Development process

### File path above code

> **OPERATOR PREFERENCE:** When presenting any code or file, the file path must appear immediately above as bold inline code: **`path/to/file.tsx`** — on its own line, directly above the code block. Never make Dominic scroll up to find which file needs updating.

### Two-chat pattern

- **Planning chat** — strategic discussions, UX decisions, architecture, instruction writing
- **Coding chat (Cursor)** — tation, file edits, smoke tests

Instructions flow one way: planning → coding. Results and audit reports flow back: coding → planning. The coding chat does not make strategic decisions.

### Audit before build

Before implementing any feature that touches existing code:
1. Read the relevant files and paste relevant excerpts
2. Identify duplications or conflicts with existing patterns
3. Confirm DRY compliance
4. Then and only then, write the implementation

### Smoke tests

Every code change must include:
- What user action to perform
- What expected behaviour to observe
- What edge cases to verify

No change is "done" without a smoke test that Dominic has run and confirmed.

### Context limit handling

When a coding chat hits its context limit:
1. Open a fresh chat
2. Re-prime with file paths and the specific task
3. Reference this manual
4. Never assume the new chat knows the previous chat's decisions

---

## 21. Testing and dev environment

- Localhost:3000 for local testing
- Pizzeria Gusto test tr— `dashboard_token: gusto-3d87b5d15a6f`
- iPad Air 11-inch M4 simulator (iOS 26.5) for KDS testing
- Safari responsive design mode at 1024×768 and 1180×820 for tablet sizes
- Standard phone widths (375px, 414px) for phone layout testing

### Pre-trial checklist

- [ ] Capacitor native wrapper built
- [ ] Stage A offline (read-only cache + queued mutations) working reliably
- [ ] Offline detection banner
- [ ] Real iPad testing with simulated connectivity drops
- [ ] Zero known bugs
- [ ] Sheets-to-DB migration complete or in safe parallel-run state
- [ ] Authentication gaps fixed (PIN out of URL, rate limiting, tighter admin secret)
- [ ] Event confirmation flow live
- [ ] Multiple events handling complete
- [ ] End-to-end smoke test of all four user flows: customer order, walk-up, ready notification, mark paid & done
- [ ] Deployed to Vercel production with production Supabase

---

## 22. Open backlog (May 2026)

### Critical — before trial

- [ ] Capacitor native wrapper
- [ ] Stage A offline cachequeued mutations
- [ ] Offline detection banner
- [ ] Background sound alerts for new orders
- [ ] Screen wake / keep-awake native feature
- [ ] Authentication hardening (PIN out of URL, rate limiting, admin secret tightening)
- [ ] Google Sheets to DB migration (parallel run strategy)
- [ ] Event confirmation flow
- [ ] Multiple events handling — data model and UI
- [ ] Known bugs sweep — full end-to-end test session

### Important — before public launch

- [ ] Refunds process (needed before online payments go live)
- [ ] Customer menu imports for operator onboarding at scale
- [ ] Phone layout for AddOrderPanel — sticky bottom sheet not yet tested
- [ ] Multi-device session enforcement (kds_sessions table exists, logic not built)
- [ ] Stage B offline (walk-up orders while offline)
- [ ] Proper login flow (email/password or magic link)

### Later

- [ ] Instagram and Messenger auto-replies (Pro tier)
- [ ] WhatsApp auto-replies (Max tier)
- [ ] Ticket printing native integration (Max tier)
- [ ] Sull offline with ID reconciliation
- [ ] Customer-facing display screen (Max tier)
- [ ] Advanced reporting (Pro/Max)
- [ ] Festival pricing (Max tier)
- [ ] Personalised schedule generator (Pro tier)
- [ ] Multi-truck operator onboarding (Phase 2)
- [ ] Truck staff access with roles (Phase 3)

### Open questions

- Confidence threshold for AI DM classification — to be set based on real classifier performance
- iPad printer model selection (Star Micronics or Epson)
- Whether to publish a Hatches Up cost comparison calculator on the marketing site
- Truck-level vs operator-level billing in Phase 2 — schema supports either, decision deferred

---

## 23. Closing note

This manual is living documentation. Update it whenever:
- A new rule is established
- A feature behaviour is decided
- A DRY violation is identified and fixed
- A plan tier feature changes
- A coding convention shifts

When in doubt about how something should work: check here first. If the answer is not here, work out the right answer, docu it here, then implement it.

The cost of writing things down is a few minutes. The cost of not writing them down is rebuilding the same decision next week.
