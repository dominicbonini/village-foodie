HatchGrab Engineering Reference Manual · V6.3

**HatchGrab**

Engineering Reference Manual

*Village Foodie · Food Truck Ordering Platform*

**Version 6.3**

June 2026

*This document defines the rules, conventions, and architecture decisions for the HatchGrab platform. It is the source of truth for any coding session and must be consulted before making structural changes.*

# Changelog

## V6.3 — June 2026 (this session)

Order-numbering rebuild and dashboard-stability session. Replaces the global order primary key (which had taken customer ordering fully down with a duplicate-key collision) with a two-id architecture — `order_key` (uuid row identity) plus a per-event display number that restarts at 1 — closing the collision class permanently and the enumerable-order-id privacy hole as a bonus. Also: introduces layered anti-scraping rate limiting (Upstash Redis + Vercel Edge Middleware) with a strict tiering rule; migrates the WhatsApp integration from Twilio to the Meta Cloud API with a four-bucket classifier; fixes a cascade of order-flow bugs (events disappearing, orders invisible, ASAP slot timing, false prep-now urgency, a kitchen/assembly split that was broken for every truck, basket loss on tab switch); and splits the operator slot traffic-light from the customer slot picker. Key changes relative to V6.2:

- **Per-event order numbering with a uuid row key** — orders now carry `order_key` (uuid, the primary key and the only row identifier used in any WHERE clause, URL, FK, dedupe, or React key) and `id` (a per-event display number, "Order #5", that restarts at 1 each event). The old global PK on `id` alone caused a 23505 duplicate-key outage; the two-id split fixes it permanently and closes the guessable-order-link privacy hole. Per-event counters are atomic. See Section 18a (new) and Section 16.

- **Anti-scraping rate limiting** — Upstash Redis + Vercel Edge Middleware (middleware.ts at the repo root, lib/ratelimit.ts), plus public/robots.txt blocking AI crawlers and X-Robots-Tag headers in vercel.json. A STRICT tier (3/min) covers only public bulk-scrapeable data; a GENERAL tier (60/min) covers everything else; authenticated/ordering routes are EXEMPT. See new Section 28.

- **WhatsApp migrated to Meta Cloud API, four-bucket classifier** — Twilio (which required trucks to surrender their phone number) is replaced by the Meta Cloud API (trucks keep their number). The classifier gained a fourth bucket: SPECIFIC_QUERY, MENU_QUERY, ALLERGEN_QUERY (with a mandatory safety caveat), IGNORE. Twilio's order-notification send was removed (operators get email anyway); the Twilio webhook is dormant, not deleted. See Section 20.

- **Events disappearing / orders invisible — fixed** — two root causes: a rate-limit regression that wiped the events list on a 429 (fixed by exempting the route and never setting state from a failed fetch), and orders.event_id never being written by any insert path (so the event-scoped order filter always returned empty, which also silently broke event-cancellation emails). Both insert paths now write event_id; the dashboard filter falls back to event_date+van_id; a backfill ran. See Section 5 and Section 15.

- **Unified ASAP formula across client and server** — the Add Order panel and /api/slots now share calcQueuePushSecs in lib/prep-utils.ts so the dropdown and sub-label can never disagree; the future-event ASAP-shows-end-time bug is fixed. See Section 6.

- **Date-aware urgency, 60-minute window** — the order-card urgency blend and the "prep needed now" logic now account for the event date, not just time-of-day, so a future event no longer shows red "prep now" the day before. Age-urgency only blends in when the slot is under 60 minutes away. See Section 9.

- **Kitchen/assembly prep split fixed for every truck** — getCatConfig was returning {secs:0} for all categories after prep moved to the DB, so the kitchen/assembly split was broken platform-wide; it now reads categoryConfigs[cat].secs. See Section 6.

- **Operator slot traffic-light split from the customer picker** — the server conflated too_soon into is_past; too_soon is now its own field (lib/slot-availability.ts). Operators see ALL slots (except genuinely past) with an override modal (lib/slot-indicator.ts, operator-only); customers see only cleanly-available slots, with full/too-soon hidden, not disabled. Interim directional wording shipped (green / "Filling up" / "Full"); the proper items-based capacity display is deferred. See Section 10 and Section 7.

- **Basket persists across tab switches** — AddOrderPanel is now always-mounted with an isActive prop; the basket clears only on placement, never on a tab switch. See Section 10 and Section 22.

- **Email confirmation venue + contact details** — confirmation emails now include the venue (name/town/postcode) in both the customer and truck copies, plus contact details driven by trucks.preferred_contact_method. The cancel link is now /order/{order_key}/manage (uuid, no ?truck= slug needed). See Section 18.

- **Applied-migrations drift found** — two migrations from the 20260529 batch (checkout_upsells → upsell_events, and the whatsapp_logs migration) were never applied to prod, so those tables don't exist and their writes have been failing silently. A migrations reconciliation is on the backlog. See Section 16 and Section 27.

- **New migration** — 20260607_order_key_per_event.sql (order_key uuid PK, per-event + truck-level atomic counters, two partial unique indexes, dropped the Studio-added messages_order_id_fkey). Applied in chunks via the Supabase SQL editor. See Section 16.

## V6.2 — June 2026

Schedule-ingestion session. Rebuilds the operator schedule-import review into a breakpoint-divergent UX (compact mobile cards, always-editable desktop table), adds an operator scraper preference with a self-service "verify my website" flow and an in-app approval queue for scraped events, makes the daily scraper learn each truck's best update day (adaptive scheduling) with hash-based change detection and an empty-schedule nudge email, consolidates the three independent Gemini schedule-extraction prompts behind a shared `lib/schedule-extract.ts` library, adds a per-truck exclusion list so unwanted scraped/imported events can be suppressed, moves the GitHub Actions scraper to Node 24, and fixes a batch of discovery-map venue-matching data errors. Key changes relative to V6.1:

- **Schedule import review rebuilt (breakpoint-divergent)** — the always-expanded card design from V6.1 is superseded. On mobile the review is now compact ~90px summary cards with three states (collapsed / focused / fully expanded): incomplete cards auto-open to a focused state showing only the missing fields, complete cards expand fully via an Edit affordance, and there is no Done button. On desktop the review is an always-editable fixed-layout table with explicit column widths and amber highlighting on incomplete rows. See Section 15.

- **30-minute time dropdowns, shared with the event form** — schedule times are entered through `SCHEDULE_TIME_OPTIONS` `<select>` dropdowns (30-minute increments, 07:00–23:00) instead of native time inputs. Start and end are always paired, the end list is filtered to options after the chosen start, selecting a start auto-populates end at +3h (clamped to 23:00), and moving the start past the end auto-clears the end. `SCHEDULE_TIME_OPTIONS` and `applyStartTimeChange` live at module level and are shared by both the import review and the Add/Edit event form. `process-schedule` discards any event where end ≤ start. See Section 15 and Section 3.

- **Historical events handled in import** — past-dated events extracted from a schedule render in a separate "Past dates — update to save" section below the future events, with the save checkbox disabled and pre-seeded unselected. Editing a past event's date to a future date auto-selects it; an `_originalDate` snapshot keeps the card in the historical section regardless of later date edits. The Save count only includes selected future events. See Section 15.

- **Operator scraper preference + self-service verify** — new `trucks.scraper_preference` (`manual`/`auto`, default `manual`), `trucks.schedule_url`, and `trucks.scraper_rule` (`scroll_lazy`/`scroll_next`). A "Your schedule" section in Settings offers two choices: "I'll upload the schedule myself" (default) or "Find my events automatically", the latter revealing a schedule URL field with an inline Verify button. Verify rejects Facebook/Instagram URLs, runs a self-contained Puppeteer scrape via the new `verify-schedule-url` route, stores the winning scroll rule, and opens the import review with whatever it found. See Section 15.

- **In-app approval queue for scraped events** — scraped, unconfirmed events surface in the Schedule tab under a "Needs your approval" heading with an amber left accent and Approve / Edit & Approve / Reject actions. The scraper-to-`truck_events` bridge is now gated by `scraper_preference`: only `auto` trucks have scraped events bridged and are emailed; `manual` trucks skip the `truck_events` insert entirely (their `discovery_events` are unaffected). See Section 15.

- **Adaptive scraper scheduling** — the daily GitHub Actions scraper now learns each linked truck's best update day. A new `scraper_run_log` table records every run; for the first 30 days a truck is scraped daily, after which `recordRunAndLearn` analyses the 90-day log to find the weekday with the most schedule changes and stores it in `scraper_update_day`, thereafter scraping only on that day and the two days following. Change detection is a hash (MD5 of sorted `event_date|venue_name`) compared against `scraper_last_hash`. An empty-schedule run sends a fire-and-forget nudge to the operator's own email with a 14-day resend guard. `scraper_run_log` is pruned to 90 days every run; `truck_events` and `discovery_events` are never pruned. A `SCRAPE_TRUCK_ID` single-truck mode bypasses the day gate. See Section 24.

- **Gemini schedule-extraction consolidated** — the new `lib/schedule-extract.ts` is the single in-repo home for schedule extraction: `ExtractedEvent`, `INVALID_VENUES`, `buildScheduleExtractionPrompt`, `extractScheduleEvents` (with `callGeminiWithRetry`), and the exclusion helpers `normaliseExclusionTerm`/`isExcluded`. `process-schedule/route.ts` is now a ~40-line auth-and-input wrapper, and `verify-schedule-url` plus the scraper's HatchGrab loop import the same library. The model is `gemini-2.5-flash` everywhere (the lingering flash-lite references are gone). Only the two Google Apps Script paths remain independent. See Section 3.

- **Per-truck exclusion list** — a new `excluded_terms` table lets an operator suppress unwanted venues. Deleting or rejecting an event prompts "exclude similar?"; choosing to exclude stores the normalised venue name. Excluded events are matched by fuzzy substring (`isExcluded`), shown struck-through in a collapsed section, and can be added back (removal is by term, not id). Settings shows the exclusion list with remove controls when non-empty. See Section 15 and Section 16.

- **Always-mounted tab pattern** — tabs that receive cross-tab props (notably the Schedule tab, which the Settings Verify flow drives) are now always mounted with an `isActive` prop; their data-loading effects are guarded with `if (!isActive) return`, and their modals are rendered outside the `isActive` gate so they can be opened from another tab. See Section 22.

- **Import address field fix** — `ExtractedEvent.address` is optional, the extraction prompt is instructed never to put a town or postcode in the address, and the area field is labelled "Area (village, town or city)". See Section 15.

- **Scraper on Node 24** — `.github/workflows/daily_scrape.yml` now runs on Node 24 (the forced actions-runtime deprecation landed and the earlier Puppeteer issues are resolved). See Section 24.

- **Discovery-map venue-matching fixes** — common pub names (The Bell, The Fox, The Bull) were matching the first same-named venue regardless of village. Eight missing venues were added with correct coordinates and aliases, the Five Bells Cavendish alias set was extended, 52 upcoming events were re-pinned, and wrong `venue_id`s were nulled where the correct venue did not yet exist. The unique constraint on `venues` is `name + village`, so upserts must use `onConflict: 'name,village'`. The proper fix — village-aware matching in `inbound-schedule` — is on the backlog. See Section 25 and Section 27.

- **Schema / migration conventions reaffirmed** — `trucks.id` is `text`, not `uuid`, so every FK column referencing `trucks(id)` (including `scraper_run_log.truck_id` and `excluded_terms.truck_id`) must be `text`. New tables ship with RLS enabled and a service-role-only posture. Migrations are applied by hand in the Supabase SQL editor, in order, followed by `notify pgrst, 'reload schema'`. New migrations this session: `20260604_scraper_preference.sql`, `20260604_scraper_adaptive.sql`, `20260604_exclusion_terms.sql`. See Section 16 and Section 22.

## V6.1 — June 2026

Follow-on polish-and-hardening session after V6. Enables Row Level Security across the database, completes the admin auth migration by removing ADMIN_SECRET entirely, fixes the discovery map data pipeline so events plot correctly, rebuilds the operator schedule-import review UX, fixes the soft-delete fetch gap that left deleted categories visible, and clears a long run of dashboard, manage, and settings UI inconsistencies. Adds a new Section 25 documenting the Village Foodie discovery map and scraper data pipeline. Key changes relative to V6:

- **Row Level Security enabled** — RLS is now ON for every table in the public schema. Public-read SELECT policies on discovery_events, discovery_trucks, venues, trucks, truck_events, the menu/modifier/deal/slot tables, and orders (anon read needed for the customer order page and dashboard realtime). Sensitive tables (operators, subscribers, password_reset_tokens, operator_email_changes, truck_users, kds_sessions, etc.) have RLS on with NO anon policy — the service role key used by all API routes bypasses RLS, so the app is unaffected while direct anon access is blocked. See Section 16.

- **ADMIN_SECRET fully removed** — the emergency password fallback flagged for removal in V6 is gone. Admin auth is now solely the session-based operators.is_admin check via verifyAdmin() on every admin route. No password form, no env var, no fallback. See Section 12.

- **Deleted categories/items soft-delete fetch gap fixed** — menu_categories and menu_items_db both carry is_active, but three fetch paths were missing the filter, so soft-deleted categories and their items still appeared in the Add Order panel and Menu & Stock tab. Added .eq('is_active', true) to the menu_categories and menu_items_db queries in app/api/menu/[truckId]/route.ts and the menu_categories query in app/api/dashboard/route.ts. Historical orders are unaffected — orders.items is a JSONB snapshot and never joins these tables. See Section 17.

- **Discovery map data pipeline fixed** — discovery_events rows were being written with null discovery_truck_id and null venue_id, so the map (which JOINs on those IDs for coordinates) could not plot most events. app/api/inbound-schedule/route.ts now fetches all discovery_trucks and venues up front and resolves both IDs via normalised name matching before upserting. Existing null rows were backfilled by SQL. See Section 25.

- **Apps Script API-key recovery** — the Google Apps Script scraper had lost GEMINI_API_KEY, GOOGLE_API_KEY, and BREVO_API_KEY from Script Properties after a Google Cloud account consolidation and key rotation, causing silent failures (geocoding, email, and screenshot processing all broke). All four properties restored and a testAllKeys() helper added. Rule: after any key rotation, update Script Properties AND the separate GitHub Actions secret copy, then run testAllKeys(). See Section 24 and Section 25.

- **Screenshot scraper accuracy** — processFoodTruckScreenshots reverted from gemini-2.5-flash-lite to gemini-2.5-flash (lite caused day-of-week→date errors and mis-extractions). Prompt now injects an explicit 14-day day→date reference, and an invalid-venue filter skips "Closed", "N/A", "TBC", "Unavailable", "Cancelled". Fixed a dbVilNng → dbVilNorm typo in venue matching. See Section 24.

- **Schedule import review rebuilt** — the operator schedule-import review (both the Add-event-modal upload path and the Import-schedule header path) showed always-expanded inline editable cards instead of a collapsed-with-Edit design. Fields are ordered date → venue → area/postcode → start/end time → van, matching the operator's natural reading order. Missing required fields (time, van) are flagged amber with labels, an attention banner counts incomplete events, and Save is disabled until every event is complete. *(Superseded in V6.2 — the always-expanded design was replaced by the breakpoint-divergent review; see Section 15.)*

- **Multi-van event rules** — events must be attached to a van. With one van it is auto-assigned silently; with multiple vans the van selector is required on the Add/Edit event form and the schedule import, blocking save until chosen. A copied event carries its source van_id. Adding a van now shows a billing-confirmation dialog before creation, and each van renders as its own bordered card in Settings → Your trucks. See Section 14 and Section 15.

- **Add/Edit event field order + friendly date** — the Add and Edit event modals now lead with Date, then Venue name, Full address, Area + Postcode, Start/End time, Van, Notes. The date field shows the friendly "Wed 3rd Jun" format via a clickable display over a hidden native date input. *(V6.2 — the Start/End time inputs moved from native step="300" controls to the shared 30-minute dropdowns; see Section 15.)* The address block carries a locale comment for future non-UK formats. See Section 15.

- **Dashboard prep list event scoping** — the "Prep needed now / Coming up" slotted-orders list read from the unfiltered orders array (line 890), so orders from other events bled in. Changed to eventOrders, matching the slotless section. See Section 10.

- **Offline protection UX** — toggling offline protection now uses window.confirm dialogs (enable warns to keep the screen on and force-enables Screen On; disable warns of the impact) instead of a persistent on-screen warning or green toast. Toggle size and colour unified to w-11 h-6 / bg-teal-500 across all dashboard and settings toggles. See Section 11.

- **Settings tab layout** — the Settings tab is a single centred column (max-w-2xl mx-auto) rather than full-bleed or two-column; a two-column experiment was reverted as poorer UX. Full heading hierarchy standardised: section labels text-base font-bold, feature/toggle labels text-sm font-semibold, descriptions text-xs text-slate-500. Auto-accept converted from the Toggle component to an inline button matching the others. See Section 23.

- **Kitchen capacity copy single source** — the dashboard Menu & Stock kitchen-capacity description now matches the Settings copy verbatim: "Maximum items per 5-minute window. Items with no prep time set are excluded. Leave blank for no limit." The stray "global van setting" warning and the auto-accept "review to avoid over-commitment" warning were removed (auto-accept is programmatically capacity-safe).

- **UI consistency pass** — expand/collapse arrows unified to ▶ + rotate-90 everywhere (schedule deals, past-events, menu categories, modifier groups); category delete moved inside the expanded category view with the whole header row tappable to expand (no more accidental deletes); Menu & Stock category row goes two-line on mobile; the event bar shows on the Menu & Stock tab; the "Import with AI" button is renamed "Import menu" (whitespace-nowrap, laid out to match the Schedule tab); and the Upsells rule dropdowns stack on mobile.

- **process-schedule / scraper DRY gap noted** — app/api/manage/process-schedule/route.ts, processFoodTruckScreenshots, and analyzeEmailWithGemini all implement the same Gemini schedule-extraction logic independently. Prompt improvements must currently be applied to all three. *(Partly resolved in V6.2 — the in-repo paths now share lib/schedule-extract.ts; only the two Apps Script paths remain independent. See Section 3.)*

## V6.0 — June 2026

Pre-trial polish session. Confirms and hardens the multi-van pause isolation, completes the platform admin model with session-based auth, adds the Tester plan, builds the operator schedule-import flow, rebuilds the Schedule tab UX, fixes the scraper workflow, and clears a batch of dashboard event-scoping and contrast issues ahead of the first trial truck. Key changes relative to V5:

- **Coding tool clarified** — Claude within Cursor is the coding tool. All implementation instructions are written as Cursor prompts. Audits can be sent to Cursor directly for a summary response rather than grep + paste back.

- **Tester plan** — a fifth plan value alongside starter/trial/pro/max. Full Max feature set, Pay-at-Hatch online orders, billing tab hidden, trial-conversion popup suppressed. Lifetime subscription discount tracked on trucks.lifetime_discount_pct (integer) and trucks.lifetime_discount_note (text). PLAN_ORDER is now ['starter', 'trial', 'tester', 'pro', 'max'].

- **Trial column in billing tab** — when plan is trial and the trial is unexpired, a Trial column is shown first in the billing matrix (label TRIAL / Free trial / until {date}). It highlights as current and disappears automatically on expiry. Trial and Tester online orders show Pay at Hatch, not 0.99% + card fee.

- **Admin session auth** — operators.is_admin boolean. The admin page auto-authenticates via a Supabase session check on mount (GET /api/admin?section=check_admin); the ADMIN_SECRET password prompt is retained only as an emergency fallback and is slated for removal at launch. A loadWithSecret(s) helper avoids the async-state race that showed "0 trucks" on load.

- **Admin role as 4th permission level** — owner/manager/staff (truck roles) plus a platform-level admin on operators.is_admin. UserMenu shows a 🔐 Admin link when isAdmin is true. /api/auth/me returns is_admin.

- **Admin page rebuilt** — uses the shared AppHeader and slate-900 tabs; two tabs, Trucks and Features. Features tab renders from FEATURE_SECTIONS (single source of truth) with section headers, footnotes, and the tester column. Truck edit modal: plan selector, trial controls, lifetime discount fields, feature overrides, create-operator, dashboard link.

- **Manual pause isolation fixed** — the set_paused action now writes to truck_vans.paused_until scoped to the active event's van_id (falling back to trucks.paused_until only when there is no van). The pause button is gated on activeEvent?.status === 'open'. Operator UI reload state still reads trucks.paused_until — backlog fix noted.

- **Offline protection per-event override** — truck_events.offline_protection_override (nullable boolean): null = use van default (auto_pause_on_offline), true/false = explicit per-event override set from the dashboard Menu & Stock tab. The menu API checks the event override before the van default. The dashboard warns that disabling is for this event only.

- **Kitchen capacity in the dashboard** — the active van's kitchen_capacity is shown and editable in the dashboard Menu & Stock tab when an event is selected; it is a global van setting. Options are now No limit then 1–20 items on both the dashboard and the manage page (was a sparse 3/5/8/10/15/20).

- **Dashboard event scoping** — with no event selected: the Orders tab shows a prominent amber "No event selected" box and the tab count reads 0; Add Order shows the same amber box and disables Confirm with "Select an event to confirm" (basket persists on event change); Menu & Stock sold counts read 0. Auto-accept, kitchen capacity, and offline protection cards render only when an event is active. Auto-accept moved to the top of Menu & Stock.

- **Inline category prep/batch editing** — the Edit accordion was removed from the dashboard Menu & Stock category header. Prep time (minutes input + 0s/30s seconds select) and batch size (blank = no limit, placeholder ∞, "no limit" label when null) are now inline on the category header and save on blur/change.

- **Auto-accept copy corrected** — the old "Full slots are still rejected" was wrong. Copy now reads: "Orders confirm automatically. If the requested slot is full, the order bumps to the next available slot. Only confirms when there is capacity." See Section 5 for the verified behaviour.

- **ASAP cancellation cutoff** — for ASAP orders (no explicit slot) the cancellation cutoff falls back to the event end_time. The cancel route joins truck_events!event_id (end_time); effectiveSlot = order.slot ?? event.end_time ?? null; if neither is available the check is skipped.

- **Affected order count on cancel** — openEventCancelModal now fetches the real affected order count from /api/events/affected-orders (counts pending + confirmed orders for the event) before showing the modal. It was hardcoded to 0.

- **Schedule tab rebuilt** — date-anchored card: a large orange day number in a left column (day name / number / month), a thin divider, venue + town with an inline status badge, the time prominent, postcode on its own muted line, and Copy / Edit / Cancel right-aligned. The town is dropped from the venue line when already present in the venue name. Deals are collapsed into a `<details>` summary that shows the active deal names. Past events show Copy only (Edit and Cancel hidden) and no deals section; cancelled past events show a "Cancelled" badge, not "Finished".

- **Import schedule feature** — a 📤/✨ Import schedule button on the Schedule tab header (styled to match the Menu tab's "Import with AI": sparkle icon, "photo, PDF or text" subtitle). Opens a dedicated modal with a drag-and-drop upload zone (the shared useDragDrop hook from lib/useDragDrop.ts), paste-text input, and a "Process schedule" button. New API route app/api/manage/process-schedule/route.ts calls Gemini (gemini-2.5-flash-lite) and extracts six fields only — event_date, start_time, end_time, venue_name, town, postcode — and never a truck name (the truck is always the logged-in operator). Extracted events show an interactive review: a checkbox per event (all pre-selected), inline edit with the venue-suggestions dropdown, drag-and-drop reordering, and a "Save N events" selective save. Events save via upsert_event as status confirmed, source operator_upload, geocoded through the existing path, and surface on both maps via the existing read path.

- **QR / order-URL DRY fix** — the dashboard_token fallback was removed from every customer-facing order-URL construction. The single pattern is truck.slug ? /trucks/${slug}/order : null; a missing slug surfaces a visible error rather than silently exposing the token. Fixed in the manage page, dashboard, discovery events API, and WhatsApp webhook.

- **isHG gate removed** — the discovery/events route no longer restricts operator truck_events to HatchGrab; confirmed/open truck_events now surface on both the Village Foodie and HatchGrab maps unconditionally (the V5 "operator events HatchGrab-only" rule was temporary for testing).

- **Feature labels and footnotes** — FEATURE_SECTIONS in lib/plan-features.ts is the single source of truth for feature rows, human-readable labels, section grouping, and coming-soon status; coming-soon rows are ordered last in the data itself (not at render time). "Facebook, Messenger & Instagram auto-replies" renamed to "Messenger & Instagram auto-replies". PLAN_FOOTNOTES is exported and rendered by both the admin Features tab and the operator Billing tab.

- **Heartbeat architecture documented** — a single last_heartbeat_at per truck_vans row, a 15s ping from both the KDS and the dashboard, a 30s stale threshold, a 2h auto-pause that clears online_paused_until on the next live receipt. All-or-nothing offline detection works by design — the last device still pinging keeps the van live.

- **Scraper workflow** — the GitHub Actions daily_scrape workflow runs on Node 22 (Node 20 lacked native WebSocket for @supabase/realtime-js; Node 24 forced the actions deprecation and Puppeteer Chrome issues). Chrome installs via npx puppeteer browsers install chrome (cache cleared first). Gemini quota resolved by upgrading to a paid plan. *(V6.2 — the workflow moved to Node 24; see Section 24.)*

- **is_test scope reconfirmed** — is_test has exactly one effect: filtering test trucks from the public discovery map. It never gates an operator feature (carried forward from V5).

## V5.0 — June 2026

Pre-trial polish-and-plumbing session. Establishes the shared operator header and sticky layout, finishes the event lifecycle (auto-select, Start/Restart, recoverable close), bridges scraped and emailed events into the operator schedule, rebuilds the operator emails on the shared formatter, and clears a batch of auth, security, and mobile issues ahead of the first trial truck. Key changes relative to V4:

- **Shared AppHeader + brand colours** — new components/shared/AppHeader.tsx (Village Foodie logo left, truck logo centre, right slot via children) used by ALL operator pages, and lib/brand.ts holding HEADER_BG / PAGE_BG / TABS_BG (all slate-900). Resolved the header/tabs colour mismatch.

- **Sticky header, tabs, and event bar** — AppHeader sticky top-0 (51px tall), tabs sticky below it, dashboard event bar sticky below the tabs. The operator never loses the header or event context while scrolling.

- **Dashboard event bar** — a slim bar below the tabs (Orders and Add Order tabs only) showing venue, times, status, Change, and a ··· menu. Bi-directional event sync with the Add Order panel via controlledEvent / onEventChange.

- **Auto-event selection on dashboard load** — the dashboard now auto-selects the best event (open today, else upcoming today, else next upcoming any date) once on load, never overriding a manual choice. activeEvent reads from the full upcomingEvents list, not just today.

- **Start Event / Restart Event wording** — replaced "Open for orders" / "Go live" throughout the dashboard, event bar, and ··· menu. Status labels are now ● Live / ⏸ Paused / ● Closed.

- **Closed events are recoverable** — closing an event sets status 'closed' (only an open event can be closed); the picker now shows closed events with a badge and a Restart Event button, and the server open action accepts confirmed OR closed. An accidental close is no longer permanent.

- **ASAP base-time rule clarified** — the Add Order panel computes ASAP as max(now + prep, eventStart), never eventStart + prep. Prep time is not added on top of a future event start.

- **Scraper → HatchGrab bridge** — inbound-schedule now promotes events to truck_events (status unconfirmed, source scraper) for trucks linked via discovery_trucks.hatchgrab_truck_id. All event sources (scraper, email, manual) now flow to one place; the truck confirms.

- **Operator email rebuild** — operator-confirm and slot-change emails now use the shared formatConfirmationEmail (was two bespoke inline HTML emails missing modifiers, deals, venue, cancel link, and HatchGrab branding). Added slotAdjustedFrom param.

- **Customer cancel page** — /order/[id]/manage with /api/orders/cancel and /api/orders/[id]. Cancel URL carries ?truck=[slug] to avoid per-truck order-ID collisions. *(Superseded in V6.3 — the cancel link is now /order/{order_key}/manage with no slug; see Section 18 and Section 18a.)*

- **Settings auto-save** — the Settings tab Save button is gone; text fields save on blur, toggles and dropdowns on change, via saveFormField().

- **Truck emoji** — trucks.truck_emoji column (default 🍕) with a categorised picker in Settings; used as the Menu tab icon.

- **Team role enforcement** — owner edits everyone, manager edits/invites staff only, staff edits only self; enforced server-side in the manage API and client-side via canEdit/canRemove/invitableRoles.

- **Delete category** — a 🗑 control on the category header soft-deletes the category and its items (bulk_delete_items), with an item-count confirmation. bulk_delete_items is staff-blocked.

- **is_test scope corrected** — is_test now ONLY filters test trucks from the public discovery map. It must never gate operator-facing features; the erroneous Billing-tab guard was removed.

- **Auth hardening** — password-reset and email-change flows now check Brevo sends and roll back on failure; email change does a pre-flight duplicate check and forces sign-out on completion; a cancel-pending-change flow was added. Login debug logging removed.

- **Discovery map security** — dashboard_token removed from all public API responses; the customer order URL is /trucks/[slug]/order; operator events are HatchGrab-only and never shown on the public Village Foodie map. *(Note: the HatchGrab-only restriction was temporary and was lifted in V6 — see Section 15.)*

- **Geocoding fallback** — manual events geocode via Gemini with an api.postcodes.io postcode fallback; the operator is warned on failure and a Fix button re-geocodes events with null coordinates.

- **Slug + emoji columns** — trucks gained slug (unique, populated from name) and truck_emoji.

- **Order card contact button** — a Contact control next to the customer name reveals email (mailto:) and phone (tel:) inline; hidden for walk-ups with no details.

- **iOS auto-zoom fix** — viewport set to device-width / initial-scale 1, and inputs locked to 16px on mobile so Safari no longer zooms on focus.

- **Meta social webhooks scaffolded** — verification + placeholder endpoints at /api/webhooks/meta/whatsapp, /messenger, and /instagram. The existing Twilio handler at /api/webhooks/whatsapp must not be overwritten. *(V6.3 — the Meta WhatsApp webhook is now fully wired and Twilio is retired to dormant; see Section 20.)*

## V4.0 — May 2026

Hardening pass between V3 and trial. Consolidates utilities, fixes auth and wake lock bugs, builds out the Reports tab with tier-gated analytics, and establishes the single dropdown component pattern. Key changes relative to V3:

- **New shared utilities** — lib/time-utils.ts (formatTime, canonical time display) and lib/modifier-utils.ts (isModifierAvailable, used across customer and operator surfaces).

- **lib/order-utils.ts is server-only** and must never be imported in client components — it references SUPABASE_SERVICE_ROLE_KEY.

- **Sign-out fixed** — was clearing in-memory auth only, leaving the SSR session cookie intact and silently re-authenticating users. Now uses createSupabaseBrowserClient() from @supabase/ssr with a hard redirect to /login.

- **Wake lock fixed** — browser auto-releases on page-hidden events; now re-acquires on visibility return and on the lock's release event. Older Safari shows a compatibility warning.

- **UserMenu consolidated** — was dashboard-only, now used on the manage page too. Single dropdown component everywhere with prop-driven sections. No inline dropdowns anywhere.

- **OrderLineItem shared component** — used by operator order cards, Add Order panel, and customer order confirmation. Variant prop controls operator vs customer rendering.

- **Menu API ?dashboard=1 flag** — dashboard surfaces see all modifier options with their available field; customers see only available options with the field stripped. Fixes the stock toggle's stale-state bug and the operator's previously-filtered modifier list.

- **Reports tab built** — date-range filter (Pro+), event filter (all tiers), orders/items toggle, CSV export (all tiers), revenue breakdown (Pro+). Pro placeholder card sells the locked features.

- **Modifier availability rule** — unavailable modifiers are HIDDEN everywhere (customer and operator), unlike main items which show "Sold out" crossed. Modifiers appear contextually in popups so hiding is cleaner UX.

- **Tab rename** — "Modifiers" became "Extras & Upsells" (icon ⚡ unchanged). Restructured into Upsells + Custom Extras sections.

- **Loyalty stamp cards** added to pricing matrix as Max coming-soon. V1 spec frozen in code comments — do not build until instructed.

- **Grace period banner** replaces hard block — events ended >30 min no longer disable the Confirm order button; a passive amber banner reminds the operator instead.

- **All menu categories collapsed by default** on Manage page open.

- **Menu tab mobile header** restructured into three rows for clarity at 375px.

## V3.0 — May 2026

Major update following an extended build session. Adds operator account model, staff access, email verification, the deals-on-events system, WhatsApp logging, and numerous UX and naming decisions. Key changes relative to V2:

- **Email provider is now Brevo**, not Resend. All transactional email (order confirmations, staff invites, email verification, ready notifications) sends via Brevo.

- **HatchGrab email domain** — hello@hatchgrab.com is the operator-facing sender. Set via NEXT_PUBLIC_SUPPORT_EMAIL. Do NOT fall back to villagefoodie.co.uk. DNS propagating as of end of session; HatchGrab emails fail until complete.

- **Trial is 3 months** for Pro/Max early signups (was 1 month default in V2). Trial maps to MAX features plus Pay-at-Hatch online ordering, so trial trucks can operate without entering billing details.

- **Personal vs business contact split** — operators table now has first_name, last_name, phone. Personal profile edited in Team tab. Business contact (shown to customers) stays in Settings, renamed "Business contact".

- **Email change flow** — operator_email_changes table, verification link via Brevo, pending banner with resend, duplicate check against auth.users (covers operators and staff).

- **Staff access (Phase 3) is now LIVE** — truck_users with owner/manager/staff roles, truck_user_vans for per-vehicle access, invite flow, dashboard access via truck_users membership.

- **Manual events auto-confirm** — events created in the manage page are always confirmed immediately. Only scraped events (inbound-schedule API) stay unconfirmed. No confirmation popup.

- **Auto open/close moved to truck-level** Order settings (was per-event).

- **Kitchen capacity moved to per-vehicle settings** (was on the event form). Counts cooked items only; drinks/instant items excluded.

- **Deals-on-events system** — apply_to_new_events default plus per-event override via event_deals, with stock-aware auto-hide on the customer order page.

- **WhatsApp interaction logging** — whatsapp_logs table, possible_miss flag, surfaced in Reports tab. Classifier and schedule prompts hardened with explicit TODAY/TOMORROW labels and day-of-week mapping.

- **Naming convention** — UI uses "truck" for physical vehicles (was "van"/"vehicle"); DB tables stay truck_vans / truck_user_vans. User-defined names are operator data and never auto-changed.

- **Billing tab** — full pricing matrix lives inside Manage (owner-only) with single source of truth lib/plan-features.ts. Old /account page deleted.

- **ASAP slot calculation is event-date aware** — future events compute ASAP from event start time, not now. Fixed UTC midnight date-parse bug.

- **QR code and order link surfaced in dashboard header**; fullscreen QR composites the logo into the centre with error-correction H.

## V2.0 — May 2026

Merged the earlier engineering-decisions document into a single reference. Starter became permanently free (was £19/mo). Trial became a distinct plan tier. Capacitor native wrapper designated a pre-trial deliverable. Three-stage offline progression documented. Cook screen made Max-only; Instagram/Messenger confirmed Pro; WhatsApp confirmed Max. Per-truck feature_overrides added. KDS view/layout modes and urgency logic documented.

## V1.0 — Earlier sessions

Initial documentation of lib/ structure, order calculation rules, customer page UX, prep time logic, pricing strategy, and forward-looking multi-truck and iPad app architecture.

# 1. Purpose of this document

This manual exists to prevent regressions. Every coding session loses context. Without a written record of how features work, why decisions were made, and what rules must not be broken, the codebase drifts. Patterns get duplicated. Conventions get abandoned. Bugs get reintroduced.

Read this before every coding session. Update it after every meaningful change. When a coding chat is uncertain about how a feature should behave, the answer is in here.

## How to use this manual

- Before adding any new feature, search this manual for related rules.

- When auditing existing code for DRY compliance, this manual defines what should be shared.

- When making a UX decision, check whether the rule already exists here.

- When a feature seems to contradict this manual, the manual wins. Either update the code or update the manual — never let them disagree silently.

> **CRITICAL** — If a coding session produces code that violates rules in this manual, that is a regression. Either the rule changes (with explicit agreement) or the code changes. The two must never diverge.

# 2. Architecture overview

## Platform identity

HatchGrab is the operator-facing brand for the ordering platform. Village Foodie is the consumer-facing discovery brand. The two share infrastructure but are separate products in the user's mind:

- **Village Foodie** — the discovery map, weekly newsletter, and "find food trucks near me" experience. Customer-facing. villagefoodie.co.uk.

- **HatchGrab** — the iPad KDS, operator dashboard, menu management, order flow, and billing. Truck-facing. hatchgrab.com.

When in doubt about naming: customer-facing surfaces use Village Foodie branding; operator-facing surfaces use HatchGrab branding.

## Tech stack

- **Frontend** — Next.js with TypeScript, Tailwind CSS, deployed to Vercel.

- **Database** — Supabase (PostgreSQL). Project ref ffphgwonshgxamtvefcv. Token-based access for operator surfaces, Supabase Auth for operator/staff logins.

- **Realtime** — Supabase realtime channels (postgres_changes) for KDS queue updates, with 60s polling fallback.

- **Email** — Brevo for all transactional email (changed from Resend in V3).

- **Rate limiting / edge** — Upstash Redis behind Vercel Edge Middleware for anti-scraping protection on public data routes (V6.3, Section 28).

- **Native wrapper** — Capacitor around the existing Next.js app. App ID com.hatchgrab.app, points to https://www.hatchgrab.com. Native modules only for hardware (printer) and OS features (background notifications, offline detection, screen wake).

- **Scraper** — Google Apps Script (not in repo) processes Drive screenshots and vendor emails via Gemini, mirrors events to Supabase via /api/inbound-schedule. A separate GitHub Actions web scraper runs daily on Node 24 (see Section 24). Subject to the 6-minute Apps Script execution limit — needs a time guard.

## Key surfaces

- **Discovery map (/)** — Village Foodie public site, map of trucks and events. No login.

- **Customer order page (/trucks/[slug]/order)** — pre-orders or pay-at-hatch orders. No login. This is the canonical customer-facing order URL. Online card pre-orders are a Pro/Max feature; Starter is Pay-at-Hatch only.

- **Truck dashboard (/dashboard/[token])** — operator order management. Token + auth. Tabs: Orders, + Add order, Menu & Stock. Uses the shared AppHeader (see Section 3): Village Foodie logo left, truck logo and name centre, avatar dropdown right carrying identity, screen-on toggle, order link, QR code, kitchen screen, Manage, and Sign out. Below the tabs, a slim event bar (Orders and Add Order tabs only) shows the active event with a Change button and a ··· menu. Header, tabs, and event bar are all sticky.

- **iPad KDS (/kds/[kds_token])** — kitchen display system, per vehicle. Opened from the dashboard header.

- **Manage page (/manage/[token])** — operator settings, menu, schedule, team, billing. Tabs (in order): Menu, Schedule, Deals, Extras & Upsells, Reports, Team, Settings, Billing.

- **Admin console (/admin)** — platform admin for trucks, plans, trials, feature overrides, and discovery-truck linking. Session auth via operators.is_admin only (verifyAdmin() on every route; no ADMIN_SECRET fallback as of V6.1). Uses the shared AppHeader and slate-900 tabs. Reads plan data from the shared source of truth. See Section 12.

- **Verify email (/verify-email)** — public page that completes an operator email change via token. Not auth-gated.

# 3. DRY — Don't Repeat Yourself

DRY is the most important architectural principle in this codebase. Every audit before every feature must check for DRY violations. The cost of duplication compounds — every duplicate is a future bug.

> **THE RULE** — If the same logic, value, or pattern appears in two places, it belongs in one place. Audit before adding. Extract before duplicating. Use props before re-deriving.

## Where logic lives

### Shared calculation libraries — lib/

All business calculations live in lib/. These are the only places these calculations should be implemented:

- **lib/order-calculations.ts** — order totals, deal pricing, discount application.

- **lib/basket-utils.ts** — basket add/remove, deal cleanup, grouping by category.

- **lib/deal-utils.ts** — bundle slot category extraction, deal original price calculation.

- **lib/slot-utils.ts** — ASAP slot selection (event-date aware as of V3), future-time validation.

- **lib/slot-bookings.ts** — production slot operations, normaliseOrderLines.

- **lib/slot-capacity.ts** — canFitInProductionSlot.

- **lib/slot-availability.ts** (V6.3) — per-slot availability flags including the too_soon field split out from is_past. See Section 10.

- **lib/slot-indicator.ts** (V6.3) — operator-only slot traffic-light state (green / "Filling up" / "Full"). Never imported by the customer page. See Section 10.

- **lib/prep-utils.ts** — prep time, category configs, queue-aware ready time, buildCatConfigs, and calcQueuePushSecs (V6.3 — the single ASAP queue-push helper shared by client and server, Section 6).

- **lib/plan-features.ts** — SINGLE SOURCE OF TRUTH for plan pricing, the feature matrix (FEATURE_SECTIONS), footnotes (PLAN_FOOTNOTES), plan prices, and descriptions. Imported by both the Billing tab and the admin console.

- **lib/features.ts / lib/useFeatures.ts** — plan tier feature map, PLAN_ORDER, PLAN_META, and canAccess()/useFeatures() for gating.

- **lib/whatsapp-classifier.ts** — message classification (four buckets as of V6.3) and schedule-response prompt building.

- **lib/meta-whatsapp.ts** (V6.3) — sendMetaWhatsApp and Meta Cloud API helpers (replaces the Twilio send path). See Section 20.

- **lib/ratelimit.ts** (V6.3) — Upstash Redis rate-limit configuration and tier helpers. See Section 28.

- **lib/time-utils.ts** (V4) — canonical time formatter. formatTime(t) strips seconds from HH:MM:SS to HH:MM. This is the only implementation. Never inline t.slice(0,5) or write a parallel formatter.

- **lib/modifier-utils.ts** (V4) — client-safe modifier helpers. isModifierAvailable(opt) returns opt.available !== false. Used to filter modifier options in both the customer page and the operator Add Order panel. undefined and null mean available — backward-compatible against rows where the column wasn't set.

- **lib/order-utils.ts** — **server-only**. Exports nextOrderId(eventId, truckId) (V6.3 signature — event RPC first, truck RPC fallback, bare-integer display number; Section 18a). Imports SUPABASE_SERVICE_ROLE_KEY — importing this in a client component will fail the build. Client-safe utilities go in their own files (e.g. modifier-utils.ts), never co-located here.

- **lib/useDragDrop.ts** (V6) — the shared drag-and-drop hook. useDragDrop(onFileDrop, acceptedTypes) encapsulates isDragging plus a dragCounter ref (prevents flicker when dragging over child elements) and returns { isDragging, dragProps }. dragProps spreads onto a label. Used by the Menu "Import with AI" upload zone, the Schedule "Import schedule" upload zone, and the extracted-events reorder list. Never re-implement drag handlers inline.

- **lib/schedule-extract.ts** (V6.2) — the single in-repo home for Gemini schedule extraction and exclusion matching. Exports:

  - **ExtractedEvent** — the extracted-event type (event_date DD/MM/YYYY, start_time, end_time, venue_name, town, postcode, optional address). `address` is optional and must never contain a town or postcode.

  - **INVALID_VENUES** — the skip list ("Closed", "N/A", "TBC", "Unavailable", "Cancelled") applied in both the prompt and post-parse.

  - **buildScheduleExtractionPrompt(inputText)** — assembles the extract-then-enrich prompt, injecting a pre-computed 14-day day→date reference table (the model is never asked to infer today's date), the venue-name-cleaning and postcode-assembly rules, the address rule, and the invalid-venue filter.

  - **extractScheduleEvents(content, options)** — calls Gemini through callGeminiWithRetry (3 attempts, 2-second backoff), strips markdown fences, parses, and post-processes: uppercases the postcode, discards any event where end ≤ start, and drops invalid venues. Model is **gemini-2.5-flash** (never flash-lite).

  - **normaliseExclusionTerm(term)** / **isExcluded(name, terms)** — the exclusion helpers (lowercase, strip punctuation, fuzzy substring inclusion) used by the import review and the scraper.

  In-repo callers: **app/api/manage/process-schedule/route.ts** (now a ~40-line auth-and-input wrapper), **app/api/manage/verify-schedule-url/route.ts**, and the GitHub Actions scraper's HatchGrab loop all import from here. See Section 15 and Section 24.

### Display helpers — components/dashboard/helpers.ts

Display-only helpers that handle visual concerns (header colour, ticket age state) may live with the components they serve: getCombinedUrgency, getAgeState, getHeaderStyle, getTicketAge. These translate state into display properties — they contain no business logic.

> **RULE** — Business calculations live in lib/. Display-only helpers may live with the components they serve. When unsure whether something is business logic or display logic, put it in lib/.

### Type definitions

Shared types and constants such as CatConfig and DEFAULT_CAT_CONFIG live in lib/prep-utils.ts. components/dashboard/types.ts re-exports them. Defining types in two places caused TypeScript export conflicts. The Order type carries both order_key (uuid) and id (display number) as of V6.3 (Section 18a).

## What must be shared

### Category ordering and grouping

Menu category sort order is set in the Manage page and applied consistently everywhere items display: KDS window view, KDS cook view, Add Order panel, customer order page, and the TO MAKE all-day count bar. Fetched once in /api/dashboard and passed down as props (categoryOrder, itemCategoryMap). Never re-derived in components.

### Order creation logic

Two valid paths create an order: Manual (operator via Add Order; lands confirmed) and Customer (self-order via /trucks/[slug]/order; lands pending, auto-confirm if truck.auto_accept). Intentional divergences exist (status default, auto_accept, server-side total validation, notifications) and must NOT be consolidated. But these utilities MUST be shared: buildCatConfigs, normaliseOrderLines, nextOrderId, canFitInProductionSlot, calculateOrderTotal. Both paths MUST write event_id and let order_key default (V6.3, Section 5 / Section 18a).

### OrderCard component

There is ONE OrderCard component for all order ticket rendering. It accepts a viewMode prop (solo / window / cook) and branches internally. Never create WindowOrderCard/CookOrderCard, never duplicate render logic, never have a layout page build its own ticket display. The KDS page is a thin layout wrapper that composes OrderCard.

### Single dropdown component (V4)

components/dashboard/UserMenu.tsx is the single avatar dropdown used by every operator-facing page. Sections render based on boolean prop flags (showScreenToggle, showOrderUtilities, showManageLink, showDashboardLink). The dropdown order is canonical and never changes:

- Identity block (truck name bold, operator first name muted) — always.

- Screen on toggle — mobile only, if showScreenToggle.

- Order link / QR code / Kitchen screen — mobile only, if showOrderUtilities.

- 🔐 Admin — if the operator is_admin (V6).

- ⚙️ Manage — if showManageLink.

- ← Orders dashboard — mobile only, if showDashboardLink.

- Sign out (red) — always.

No inline dropdowns anywhere. Any future page (admin, KDS settings) must use UserMenu with appropriate flag props.

### Shared operator header — AppHeader (V5)

components/shared/AppHeader.tsx is the single operator-facing page header, used by the dashboard, the manage page, the admin page (V6), and any future operator surface. Layout: Village Foodie logo left (links to /), the truck logo and name centred, and a right-hand slot supplied via children (typically the UserMenu avatar dropdown). It is bg-slate-900 and sticky top-0 z-50. Pages must not build their own inline header — this was an inline duplication across the dashboard and manage pages before V5. On the admin page, which has no truck context, AppHeader is used with truckName={null} and truckLogoUrl={null}.

Colour constants live in lib/brand.ts: HEADER_BG, PAGE_BG, and TABS_BG, all slate-900. The perceived header/tabs mismatch fixed in V5 was caused by the tabs bar being slate-800 while the header was slate-900; both now reference the shared constant.

Sticky layout contract: AppHeader is sticky top-0 z-50 (measured 51px tall). The tabs bar is sticky top-[51px] z-40. On the dashboard, the event bar is sticky top-[95px] z-30 and shows on the Orders and Add Order tabs only. On the manage page the tabs are sticky top-[51px] z-40. Any new operator page must reuse AppHeader and slate-900 tabs rather than re-deriving these values.

### Single order-line renderer (V4)

components/dashboard/OrderLineItem.tsx renders a priced line item across all surfaces. Variant prop (operator | customer) controls rendering: operator variant shows total only; customer variant shows base price, individual modifier upcharges as sub-rows, and a total footer with border-top. Props include nameSuffix for the Edit/Customise button slot and rightSlot for the price editor.

### Shared column class constants (V4)

When rendering multi-column list views (Reports Orders/Items, future surfaces), shared Tailwind class constants must be defined once at the top of the component. Both Orders and Items views in the Reports tab use these — never inline the same Tailwind string twice. See Section 19 (Reports tab) for the canonical set.

### Feature gating

All feature access goes through canAccess() from lib/features.ts — the single source of truth handling per-truck overrides, trial expiry, and plan tier resolution in the correct order. Forbidden: if (plan === "pro"), if (truck.plan !== "starter"), or hardcoded feature lists outside lib/features.ts.

### canAccess vs hasFeature (V4)

lib/features.ts exports two checks with distinct purposes:

- **canAccess(plan, feature, featureOverrides, trialExpiresAt)** — use this for ALL UI gates. Respects per-truck overrides and trial expiry.

- **hasFeature(plan, feature)** — plan-only check, no overrides. Use only where override/trial logic is irrelevant.

When in doubt, use canAccess().

### Plan pricing and feature matrix

lib/plan-features.ts is the single source of truth for the pricing matrix, feature sections, footnotes, plan prices, and descriptions. Both the Billing tab and the admin console import it. Never hardcode pricing or feature rows in a component.

FEATURE_SECTIONS (V6) is the canonical structure: three sections — Core operations, Online sales & automation, and Max tier — each a list of FeatureRow objects carrying a human-readable label and starter/pro/max values. Trial and Tester always take the same value as Max. Coming-soon rows are ordered last within their section in the data itself, so both the admin Features tab and the billing matrix render them last without any render-time sorting. PLAN_FOOTNOTES is exported and rendered by both surfaces.

### Schedule extraction via Gemini — mostly consolidated (V6.2)

V6.2 closed most of the V6.1 DRY gap. The in-repo paths now share lib/schedule-extract.ts (above):

- **app/api/manage/process-schedule/route.ts** — operator imports their own schedule into HatchGrab. Now a ~40-line wrapper: verify token, read input (text or file), call extractScheduleEvents, return { events }. No prompt or parsing logic of its own.

- **app/api/manage/verify-schedule-url/route.ts** (V6.2) — the self-service "verify my website" route. Self-contained Puppeteer scrape that calls extractScheduleEvents on the scraped content.

- **GitHub Actions scraper, HatchGrab loop** — imports extractScheduleEvents (and uses gemini-2.5-flash, no longer flash-lite).

Two paths remain independent and must still receive prompt improvements by hand:

- **processFoodTruckScreenshots** (Google Apps Script) — scrapes public schedule screenshots from a Drive folder into the discovery map.

- **analyzeEmailWithGemini** (Google Apps Script) — processes vendor schedule emails into the discovery map.

> **RULE (V6.2)** — Any new in-repo code that extracts events from text, an image, or a scraped page MUST import from lib/schedule-extract.ts. Never re-implement the prompt or the parser in a route. The two Apps Script paths cannot import the library (different runtime); consolidating them requires migrating the Apps Script processing off Google Sheets (see Section 25), and remains on the backlog.

### Development process — Claude within Cursor (V6)

> **RULE** — Claude within Cursor is the coding tool. The planning chat writes Cursor-ready prompts; it does not edit files directly. Audits can be sent to Cursor for a summary response rather than always requiring grep output to be pasted back.

## DRY audit before every feature

- Search the codebase for related logic that already exists.

- Identify whether the new feature should extend an existing pattern or create a new one.

- Paste the existing structure for review before writing new code.

- Make extraction the default; duplication requires explicit justification.

# 4. Plan tiers and feature gating

## Five plans

- **Starter (Free)** — Walk-up orders, KDS, dashboard, menu, deals, sold-out toggle, stock countdown, and Pay-at-Hatch online ordering. 0% platform fee. No online card pre-orders.

- **Pro (£29/mo)** — Everything in Starter, plus online payments (Stripe Connect), advance pre-ordering, time slot selection, smart batch pacing, auto-accept, advanced reporting, branded QR code, Messenger/Instagram auto-replies, offline sync protection, dynamic fee splitting. 0.99% platform fee plus card processing on online orders.

- **Max (£49/mo)** — Everything in Pro, plus unlimited WhatsApp auto-replies, kitchen ticket printing, multi-device kitchen sync, multi-user access, customer-facing display (coming soon), festival pricing (coming soon), digital loyalty stamp cards (coming soon).

- **Trial** — All MAX features, PLUS Pay-at-Hatch online ordering, so trial trucks can operate without entering billing details at signup. Default 3 months for hand-picked Pro/Max early signups. Expires automatically to Starter.

- **Tester (V6)** — All MAX features plus Pay-at-Hatch online ordering. The billing tab is hidden and the trial-conversion popup is suppressed. A lifetime subscription discount is tracked on trucks.lifetime_discount_pct (integer, e.g. 50 = 50% off) and trucks.lifetime_discount_note (text). Intended for hand-picked pre-launch testers who keep a permanent discount; can later convert to a paid plan.

## PLAN_ORDER (V6)

PLAN_ORDER in lib/features.ts is ['starter', 'trial', 'tester', 'pro', 'max']. PLAN_META holds each plan's display name; PLAN_PRICES and PLAN_DESCRIPTIONS live in lib/plan-features.ts (tester price label "Lifetime", tester description "Pre-launch tester — full feature access, lifetime discount").

## Pricing matrix

| **Feature** | **Starter (Free)** | **Pro (£29)** | **Max (£49)** |
| --- | --- | --- | --- |
| **Best for** | Weekend traders & walk-up pitches | Busy trucks scaling pre-orders | High-volume operations & festivals |
| **Walk-up orders — platform fee** | 0% | 0% | 0% |
| **Online orders — platform fee** | Pay at Hatch | 0.99% + card fee | 0.99% + card fee |
| **Discovery map listing** | ✓ | ✓ | ✓ |
| **Universal web dashboard** | ✓ | ✓ | ✓ |
| **iPad kitchen app** | ✓ | ✓ | ✓ |
| **QR code menu & ordering** | ✓ | ✓ | ✓ |
| **Meal deals & upsells** | ✓ | ✓ | ✓ |
| **Walk-up order processing** | ✓ | ✓ | ✓ |
| **Online ordering — Pay at Hatch** | ✓ | — | — |
| **Instant sold-out toggle** | ✓ | ✓ | ✓ |
| **Automated stock countdown** | ✓ | ✓ | ✓ |
| **Offline sync protection** | — | ✓ | ✓ |
| **Online payments (Stripe Connect)** | — | ✓ | ✓ |
| **Advance pre-ordering** | — | ✓ | ✓ |
| **Customer time slot selection** | — | ✓ | ✓ |
| **Smart batch pacing** | — | ✓ | ✓ |
| **Auto-accept online orders** | — | ✓ | ✓ |
| **Advanced reporting (date range, breakdowns)** | — | ✓ | ✓ |
| **Branded QR code** | — | ✓ | ✓ |
| **Messenger & Instagram auto-replies** | — | ✓ | ✓ |
| **Unlimited WhatsApp auto-replies** | — | — | ✓ |
| **Kitchen ticket printing** | — | — | ✓ |
| **Multi-device kitchen sync** | — | — | ✓ |
| **Multi-user access** | — | — | ✓ |
| **Digital loyalty stamp cards** | — | — | Coming soon |
| **Customer-facing display** | — | — | Coming soon |
| **Event & festival pricing** | — | — | Coming soon |

Trial and Tester columns (rendered in the admin Features tab and, for Trial, in the operator Billing tab) take the same feature values as Max, with Pay-at-Hatch online ordering and a 0% walk-up fee. Their online-order fee shows Pay at Hatch, not 0.99% + card fee.

Footnotes (held in lib/plan-features.ts as PLAN_FOOTNOTES): (1) Walk-up orders use the truck's own card terminal — HatchGrab charges 0%, terminal provider fees apply. (2) Online payments via Stripe Connect: 0.99% platform fee plus Stripe card processing ~1.5% + 20p in the UK. (3) Kitchen ticket printing requires the HatchGrab iPad app and a compatible thermal printer, neither supplied. (4) iPad not supplied; the kitchen app runs on any modern tablet browser, Apple iPad recommended. (5) Auto-replies require a Business account on each platform and respond with schedule and order link only.

## Pricing rationale

- Starter free reduces signup friction — trucks try the platform before committing.

- £29 Pro sits below the £30 psychological threshold.

- £20 gap between Pro and Max is deliberately small to encourage upgrades.

- All platform fees on online orders apply on top of card processing (~1.5% + 20p with Stripe).

- Walk-up orders have 0% platform fee on all tiers.

## Feature gating rules

- Static feature map lives in lib/features.ts; pricing/matrix in lib/plan-features.ts.

- Resolution order in canAccess(): per-truck override → trial expiry check → plan tier.

- Per-truck overrides stored in trucks.feature_overrides (JSONB), edited in admin.

- Trial expiry checked against trucks.trial_expires_at; expired trials silently drop to Starter.

- UI uses useFeatures(truck); non-React code uses canAccess() directly.

- Gating happens both UI-side (hide buttons, upgrade prompts) and API-side (reject forbidden features).

- WhatsApp auto-replies are MAX only (cost-incurring). Instagram/Messenger are Pro.

### FeatureValue type (V4)

The FeatureValue type in lib/plan-features.ts is boolean | 'coming_soon'. Set the plan column to 'coming_soon' directly — the Billing tab renders this as a "Coming soon" badge automatically. No separate flag is needed.

## Billing tab

- Billing lives inside the Manage page as an owner-only tab. Removed the standalone /account page.

- Visible to all operators including trial AND test accounts. (Corrected in V5: the Billing tab was previously hidden for is_test = true, which was wrong. is_test now has exactly one effect — filtering test trucks from the public discovery map. See Section 4, is_test scope, and Section 16.)

- **Hidden for Tester plan (V6)** — the billing tab is hidden when truck.plan === 'tester' (the tab visibility guard is userRole === 'owner' && truck?.plan !== 'tester'), and the trial popup / default-to-billing behaviour is suppressed for testers.

- Trial maps to the MAX column; header shows "Free trial (Max features)" with trial end date.

- Transaction fees show actual values (0%, 0.99% + card fee, Pay at Hatch), not checkmarks.

- Upgrade buttons open an email-to-upgrade modal until Stripe Connect billing is built.

### Trial column in the billing matrix (V6)

When the truck is on an active trial — trialActive = plan === 'trial' && trial_expires_at !== null && new Date(trial_expires_at) > new Date() — a Trial column is prepended to the billing matrix (billingPlans = trialActive ? ['trial','starter','pro','max'] : ['starter','pro','max']). The column header shows TRIAL / Free trial / until {DD MMM YYYY}; isCurrent is simply p === truck.plan so the orange "current" highlight lands on Trial while on trial and on Starter once it expires (and the column disappears). Trial cells: walk-up 0%, online orders Pay at Hatch, all features same as Max.

### Billing tab layout by plan (V5)

The Billing tab restructures itself by the truck's plan so the right thing is foremost:

- **Trial / Starter** — upgrade card first, then billing & payments, then the full pricing matrix. The whole matrix is visible because these operators are deciding what to buy.

- **Pro / Max** — a quiet current-plan summary, then a collapsible "Compare all plans" section (collapsed by default), then billing & payments. Paying operators don't need the sales matrix in their face.

### Trial conversion prompts (V5)

When plan is trial, the Manage page defaults to the Billing tab on load (this fires after any ?tab= URL param so it takes priority). A once-per-day reminder popup (guarded by a localStorage flag plus a date check, key hg_trial_reminder_shown) shows the trial end date with an X to dismiss and an "Upgrade here" action that switches to Billing. Trial copy frames the value as full Max features plus Pay-at-Hatch, free until the trial ends, reverting to Starter if not upgraded. (V6: this default-to-billing and the popup are suppressed for the Tester plan.)

### is_test scope (V5)

> **RULE** — is_test has exactly ONE effect: filtering test trucks out of the public discovery map (Village Foodie). It must NEVER gate an operator-facing feature. Test accounts (including the Test Kitchen truck) see the full operator product, Billing tab included. A V4-era guard that hid Billing for is_test accounts was a bug and was removed in V5.

## Loyalty stamp cards (Max, coming soon) — V4

The V1 spec is frozen in code comments above the matrix row in lib/plan-features.ts. Schema is loyalty_cards(id, truck_id, customer_email, customer_phone, stamps_earned, stamps_redeemed, created_at, last_stamp_at). V1 rule: 1 stamp per order — not per item, to avoid categorisation complexity. Walk-up flow uses phone lookup in the Add Order panel; online flow matches on email at submit. Redemption requires both an operator-side trigger in Add Order and a customer-side prompt at online checkout.

> **RULE** — Do NOT build flexible stamp criteria until V1 is live and operators request it.

Strategic note: once stamps are earned, operator churn drops to near zero — customers won't want to lose their progress. This is the primary stickiness argument for the Max tier.

## Branded QR code (Pro+) — V4

trucks.qr_code_style column ('standard'|'branded' default 'standard') controls whether the public QR composites the truck logo into the centre. Logo compositing uses error-correction level H. Manage page selector greys the Pro badge for Starter trucks. The Pro feature row in lib/plan-features.ts is "Branded QR code (logo in centre)".

## No premium badges on customer surfaces

> **CRITICAL RULE** — Customers must NEVER see "Premium" badges, upsell language, or any indication that features are gated behind subscription tiers. Premium features are silently enabled or disabled per truck. This protects the customer experience and the truck's relationship with their customers.

# 5. Order management

## Order lifecycle

- **pending** — customer placed order, not yet confirmed. Only set by the customer path when truck.auto_accept is false.

- **confirmed** — accepted into the queue. Default for manual orders. Set by auto_accept for customer orders.

- **cooking** — optional intermediate state used in kdsMode for two-step prep tracking.

- **ready** — food prepared, waiting for collection. Customer notified by email automatically.

- **collected** — customer collected and paid. Disappears from active views; appears in Done strip.

- **cancelled / rejected** — will not be fulfilled. Removed from active views.

## Walk-up vs customer orders

> **CRITICAL DISTINCTION** — Walk-up orders and customer orders are two different flows with intentionally different behaviour. They must not be merged.

### Walk-up (manual) orders

- Created by operator via Add Order panel. Submits to /api/dashboard/action with action="manual".

- Customer name optional; defaults to "Walk-up" if blank. Email and phone behind a "+ Add email / phone" toggle.

- Auto-confirms immediately — the operator is present and knows queue state.

- Button label: "Confirm order". No modifier popup on item tap; items add instantly at base price. Modifiers added by tapping the cart line.

- Decrements stock on success (separate API call after the manual action).

### Customer self-orders

- Created via /trucks/[slug]/order. Submits to /api/orders/submit.

- Customer name required; email collected for confirmation; phone optional (no asterisk, no submit guard).

- Server-side total validation against DB prices (untrusted client).

- Lands pending; auto-confirms only if truck.auto_accept and slot capacity allows.

- Button label: "Place order". Modifier popup on item tap drives accuracy and upsells.

- Sends truck notification (WhatsApp on Max, else email).

## Auto-accept logic

Only customer-path orders are subject to auto_accept. Manual orders bypass auto_accept and always confirm. The precise behaviour of resolveAutoAcceptSlot() (V6 — verified against the code):

- **Slot has capacity** → confirm at the requested slot (slotChanged: false).

- **Requested slot full, a later slot has capacity** → bump forward to the first later slot with capacity and confirm (slotChanged: true; the order's slot column is updated).

- **All slots full** → the order is left pending (canConfirm: false); it is not rejected and not confirmed; the operator handles it manually. The customer still receives a "pending" confirmation email (autoAccepted = false).

- **No slot requested** → confirm immediately.

- **Unrecognised slot** (not in the times list) → short-circuits to confirm with no slot change.

When auto_accept is false the customer path skips this block entirely, but the slot-capacity check at submission still runs: a full production window returns a 409 and the order is never created; otherwise it inserts as pending.

> **RULE (V6)** — Auto-accept description copy in the dashboard: "Orders confirm automatically. If the requested slot is full, the order bumps to the next available slot. Only confirms when there is capacity." The earlier "Full slots are still rejected" was inaccurate and must not return.

> **RULE (V6.1)** — No amber "review regularly to avoid over-commitment" warning under the auto-accept toggle. Auto-accept is programmatically capacity-safe (it never confirms beyond slot capacity — see resolveAutoAcceptSlot above), so the warning was misleading and was removed.

## Dashboard event scoping (V6)

With no event selected on the dashboard, every event-scoped surface degrades gracefully:

- **Orders tab** — the whole tab body is gated on activeEvent; with none selected it shows a prominent amber "No event selected — select an event to view orders" box with a Select event button (opens the event picker). The Orders tab label count reads 0 regardless of how many orders are loaded.

- **Add Order** — items can still be added to the basket, but the Confirm button is disabled (disabled={loading || !hasItems || !manualEvent}) with the label "Select an event to confirm". A prominent amber "No event selected" box with a Select event button sits at the top. Basket items persist when the event changes (the controlled-event sync only updates manualEvent and re-fetches slots; it never clears manualItems) — operators frequently realise mid-build they picked the wrong event.

- **Menu & Stock** — both catOrdered and itemOrdered return 0 when there is no active event, so no cross-event totals bleed into the stock view. Auto-accept, kitchen capacity, and offline protection cards render only when an event is active.

- **Auto-accept** toggle sits at the top of the Menu & Stock tab (moved from the bottom).

### Orders must carry event_id; the dashboard filter is resilient (V6.3)

> **RULE** — Both order insert paths (/api/orders/submit and /api/dashboard/action manual) MUST write event_id on the row. For most of V6.2 neither did, so the event-scoped order filter (o.event_id === activeEvent.id) always returned empty — the dashboard showed "0 orders / All complete" despite orders existing, AND event-cancellation emails silently went to nobody (affected-orders queried by event_id, got 0). Inserts now write event_id (with a single-event-per-date fallback when ambiguous). The dashboard display filter is resilient: event_id is primary, with an event_date + van_id fallback so a legacy null-event_id order still shows. A backfill migration ran against the existing rows.

> **RULE** — Never setState from a failed fetch. A rate-limit 429 on /api/events/manage was wiping upcomingEvents to [] ("events disappearing"). Fetches must check res.ok before setting state, and the last active event is cached in a ref so a transient failure doesn't blank the UI. (The route is also now rate-limit-exempt — see Section 28.)

## Pause and extra wait

- **Pause orders:** stops customer ordering for the active event's vehicle until resumed. Confirmation dialog before activating; none to unpause.

- **Extra wait:** global delay on all collection estimates, 10-minute increments, no confirmation.

- Both show a persistent banner on KDS and dashboard while active.

- Both controls live in the KDS header AND mobile dashboard — same API calls, no duplication.

### Manual pause is van-scoped (V6)

> **RULE** — The set_paused action writes to truck_vans.paused_until scoped to the active event's van_id, NOT trucks.paused_until. The menu API read path already resolves van-level manual pause correctly; before V6 the writer targeted trucks.paused_until, which paused every van under a multi-van operator. When there is no van_id on the active event, it falls back to trucks.paused_until. The pause button is gated on activeEvent?.status === 'open' on both the dashboard and the KDS page, and vanId is included in the payload.

> **BACKLOG** — The operator UI reload still reads pause state from trucks.paused_until rather than truck_vans.paused_until for the active event's van. Update before scaling multi-van operators.

# 6. Prep time and queue logic

## Queue-aware ready time formula

> **FORMULA** — totalQty = queueByCat[cat] + newByCat[cat]; finalBatch = ceil(totalQty / batchSize); prepSecs = finalBatch × prepSecsPerBatch

This is the same logic used by the live truck dashboard and the customer pre-order page. calcQueueAwareReadySecs in lib/prep-utils.ts is the only implementation.

## Batch logic

New items are placed AFTER the existing queue. If batch 2 has space, new items slot into batch 2 and finish alongside it. If batch 2 is full, they spill into batch 3. Kitchens do not restart a partially-filled batch for a new order.

## Categories cook in parallel

When an order contains multiple categories (pizza + sides), ready time is the MAX across categories, not the sum. Pizza taking 8 minutes and sides taking 2 minutes are ready together at 8 minutes.

## Buffer application

- Truck dashboard passes waitMinutes × 60 + 120 (manual wait override + 2 min handoff buffer).

- Customer pre-order page passes 0 (no buffer — the event has not started yet).

## Customer page is a pre-order context

The customer page calculates ASAP from event.start_time, not new Date(). A customer pre-ordering at 10am for a 17:00 event sees ASAP = 17:00 + prep, not now + prep. Fundamentally different from the dashboard which calculates from now.

## ASAP is event-date aware

getAsapSlot in lib/slot-utils.ts takes an optional eventDate. For a future-date event it returns the first available slot regardless of current time. For today's event it uses current time as the floor (event start if not yet open, else now). This fixed a bug where a future event showed the current time as ASAP. Also fixed a UTC-midnight parse bug — build dates with new Date(y, mo-1, d, h, m) (local), never new Date('YYYY-MM-DD') then setHours.

## ASAP queue-aware calculation (V4)

The ASAP slot calculation must use a single formula everywhere. calcQueueAwareReadySecs in lib/prep-utils.ts is the only implementation. The queueByCat input comes from the /api/slots API (which includes "modified" status orders) — never rebuild it from the orders prop on the dashboard. The dropdown and the sub-label below the slot picker must always agree; they did not in V3 because two different formulas were in play (one bespoke pre-event Path A using (totalBatches-1) × prepSecs, the other the shared queue-aware function). Both paths now use calcQueueAwareReadySecs, with adjustedAsapSlot picking the first slot at/after eventStart + queueAware.minsFromNow.

### ASAP base time — never add prep on top of event start (V5)

> **FORMULA** — ASAP base = max(now + totalSecs, eventStart). Never eventStart + totalSecs.

In the Add Order panel (components/dashboard/AddOrderPanel.tsx), the ASAP collection time is the later of (now + prep) and the event start — not the event start with prep added on top. For an event that has not started yet, ASAP is simply the event start (prep runs during the lead time); for an event already underway, ASAP is now + prep. The earlier bug added prep on top of a future event start, pushing ASAP needlessly late. This complements the event-date-aware getAsapSlot rule above — that rule chooses the right floor (event start vs now); this rule governs how prep combines with that floor.

### Unified ASAP push formula — client and server share one helper (V6.3)

> **RULE** — calcQueuePushSecs in lib/prep-utils.ts is the single implementation of the queue-push seconds, imported by BOTH the Add Order panel (components/dashboard/AddOrderPanel.tsx) and the server /api/slots/[truckId]. They must agree to the second; two separate formulas previously disagreed. The unified rule: t = max(now + totalSecs, eventStart + pushSecs). For a future event with an empty queue this is exactly the event start (no boundary discontinuity); a future event no longer shows the event END time as ASAP (the prior overflow bug for overnight distances, where minsFromNow overflowed and surfaced the end time instead of the start). The math was verified across the no-queue and queued cases for both today and future events.

### Kitchen/assembly category split reads the DB config (V6.3)

> **BUG FIXED** — after category prep times moved to the DB, getCatConfig was returning {secs:0} for ALL categories, so the kitchen-vs-assembly prep split was broken for EVERY truck (everything treated as instant). It now reads categoryConfigs[cat].secs. Any code computing a per-category split must read the resolved DB config, never a hardcoded or zero default.

## ASAP cancellation cutoff (V6)

For ASAP orders (null slot), the cancellation cutoff falls back to the event end_time. /api/orders/cancel joins truck_events!event_id (end_time) and computes effectiveSlot = order.slot ?? event.end_time ?? null; if neither is available the cutoff check is skipped. This fixed ASAP orders being uncancellable (or wrongly cancellable) because they carried no slot to measure the cutoff against.

> **POST-TRIAL CONSIDERATION** — Store a ready_time on the order row at submit time so the cancellation cutoff has an exact target rather than falling back to the event end time.

## Time rounding and display

- Customer-facing ASAP rounds to NEAREST 5 minutes. 17:06 → 17:05, 17:08 → 17:10.

- Truck dashboard shows exact ready times — the operator needs precision.

- ASAP button shows "Around 17:10" — clearer than a tilde.

- Times display as HH:MM throughout — seconds are stripped via the shared **formatTime** helper in lib/time-utils.ts. This is the canonical formatter. Never inline t.slice(0,5) or write a parallel implementation. Excluded from refactor: toTimeString().slice(0,5) for current-time logic, array slice ops, server-side classifier data.

## Slots API contract

The slots API (/api/slots/[truckId]) returns the slots list with availability flags, queueByCat, and catConfigs so the customer page can do queue-aware ASAP client-side. Even with no collection_times configured, catConfigs and queueByCat are still returned; only the slots array is empty. As of V6.3 the availability flags include too_soon as a separate field (Section 10).

## prep_secs and batch_size defaults

In the menu API, prep_secs and batch_size return null when unset, NOT 0 (0 ?? 240 evaluates to 0). Consumers use || 0 for the "instant items" interpretation (drinks, dips) and fall back to DEFAULT_CAT_CONFIG when truly missing.

> **NOTE (V6)** — A null batch_size means "no limit" and renders as a blank input with an ∞ placeholder and a "no limit" label, not as 1. Watch for legacy rows storing a sentinel like 999 — clean these to null.

# 7. Customer order page UX

## Collection time default

On the customer order page, ASAP is auto-selected by default (asapChosen initialises to true). The customer never sees an unselected state requiring action. ASAP and Choose Time remain mutually exclusive — selecting one clears the other.

## ASAP button visual states

- Deselected, available: white background, slate border, orange ASAP text and time.

- Selected: solid orange background, white text.

- Unavailable: greyed out, "Unavailable" label.

## Choose Time visual states

- Deselected, premium enabled: white background, dropdown showing "Choose time".

- Selected: solid orange background showing the chosen time.

- Free tier: greyed out with "ASAP only" subtitle, NO premium badge.

> **RULE (V6.3)** — the customer slot picker shows only cleanly-available slots. Full and too-soon slots are HIDDEN entirely, never shown disabled or with a traffic-light. The slot traffic-light is an operator-only affordance (Section 10). This keeps internal capacity state off the customer surface, consistent with the no-premium-badges principle (Section 4).

## Time selection premium flag

trucks.time_selection_enabled controls whether Choose Time is functional. Default true; set false for free-tier trucks. Supports tiered pricing without code changes.

## Slot auto-clear on basket change

If the customer picks a specific time then adds items that push ASAP past it, the chosen time auto-clears and must be reselected. The Choose Time dropdown only shows slots at or after the calculated ASAP.

## Event lookup pattern (V4)

The events API at /api/menu/[truckId]/events (and any truck-scoped API) must support both slug and UUID lookups. Customer URLs use slug (/trucks/[slug]/order); dashboard surfaces use UUID. Try slug first, fall back to UUID. This was the root cause of a "No upcoming events" bug where the customer order page used UUID lookup against a slug param. The pattern is documented in Section 12 as a general API rule but applies here specifically.

## Past events filtered (V4)

Future-dated events with end times already passed must not appear in the customer event picker. isPastEvent uses local-time parse:

new Date('${event_date}T${end_time}') < new Date()

Never new Date('YYYY-MM-DD') then setHours — that parses as UTC midnight and breaks in BST (and any non-UTC timezone). The same rule applies on the Schedule tab in the manage page, where past events show a grey "Finished" badge regardless of database status (which is never auto-written to past), except cancelled events which show "Cancelled" (V6).

## Phone optional (V4)

Phone is collected but never required for customer self-orders. The submit guard checks name and email only. The phone field has no asterisk. Email is required for the order confirmation; phone enables SMS notifications when configured but is otherwise discretionary.

## Item notes (specialInstructions) — V4

Categories have an allow_notes boolean (default false). When enabled:

- Items with no modifiers and allow_notes=true show a "+ Add note" affordance on the basket line (no forced popup).

- Items with modifiers AND allow_notes=true show the note field at the bottom of the modifier popup.

- The operator Add Order panel ALWAYS shows the note field regardless of category setting — operators may need to record information for any item.

- The field name is specialInstructions end-to-end (orders.items[i].specialInstructions). Canonical.

- Use the shared ItemNoteInput component (compact + default variants).

## Event card display (V4)

Improved typography on the event card at the top of the customer order page: 📍 prefix on venue (font-semibold text-slate-800), date/time muted (text-slate-600 text-sm), "● Open now" inline green badge when current time is between event start and end. Single separator style throughout.

## Footer and layout

- Footer padding-bottom uses iOS safe-area-inset-bottom for home indicator clearance.

- Dynamic footer height via ResizeObserver sets main content padding.

- No discount code input on the customer page.

- Categories group in the truck's drag-and-drop sort order, not alphabetical.

## No server roundtrip on basket change

ASAP is calculated entirely client-side from category configs and queue data in the initial slots API call. No debounced re-fetch on basket change — mobile coverage is unreliable, client-side is instant.

## Category name lowercase consistency

All category lookups use lowercase keys. The slots API lowercases itemCatMap values; the customer page lowercases menuItem.category before lookup. Prevents "Pizza" failing to match "pizza".

# 8. Deal management

## What is a deal

A deal is a bundle grouping multiple menu items into a single purchase at a discounted price. Example: Lunch Deal — one pizza + one dip + one drink for £12. Stored in bundles_db with up to six category slots.

## Deals on events

- Each deal has apply_to_new_events (default true). When true, the deal auto-applies to new events; when false, it is selected manually per event.

- Per-event control via the event_deals table (event_id, bundle_id, active, overridden). The per-event active flag overrides the bundle default.

- In the Deal create/edit modal, the operator chooses "Apply to all future events automatically" or "Select manually per event". The deal card shows an "Auto-apply" or "Manual" badge.

- In the Schedule tab, each event card shows deal toggles with name, price, and a stock warning indicator. As of V6 these toggles live inside a collapsed `<details>` summary on the rebuilt event card (see Section 15).

## Stock-aware auto-hide

> **RULE** — A deal is shown on the customer order page only if it is active for the event AND every slot category has at least one available item (is_available = true and stock_count null or > 0). If any slot has no available item, the deal is hidden from customers automatically but still shown to the operator with a "currently hidden" warning.

The menu API supports an ?operator=true param: operators receive all deals with a stock_warning field; customers receive only available deals. The Deals tab shows an amber "Currently hidden" banner when a deal is suppressed by stock.

## How deals render on tickets

### Window view (and solo)

- Deal renders as a SINGLE priced line: "🎁 Lunch Deal £12.00".

- Constituent items indented below, no individual base prices.

- Modifier upcharges still shown on constituent items.

- Standalone items render in category groups ABOVE the deals block. The deals block is its own section, not distributed into category groups.

### Cook view

- No deal labels, no yellow border, no prices.

- All items (deal and standalone) merged into category groups and sorted. The cook cares only about what to make.

## Deal pricing and removal

- Deal price is the total for the bundle regardless of constituent base prices. Modifiers still add at their individual upcharge.

- Order total = sum(standalone × prices) + sum(deal prices) + sum(modifier upcharges). Server re-validates against DB prices on the customer path.

- AppliedDeal.itemsTakenFromBasket tracks which basket items the deal consumed. On removal only those items are removed; fresh USE_EXISTING items added for the deal are not deleted.

- cleanupDealsForItem in lib/basket-utils.ts is generic over <T extends Deal> to preserve AppliedDeal fields when filtering.

## Quantity expansion in DealsModal (V4)

When a basket contains multiple units of the same item, deal slot assignment must operate on units, not lines. DealsModal flat-maps expandedBasketOpts by quantity, giving each unit a unique key ${cartKey}::unit{n}. stripUnit() is the helper at the boundary so callers receive the original cart key unchanged. takenByOtherSlots tracks full unit keys to prevent the same unit being assigned to two slots.

The DealsModal is shared between the operator Add Order panel and the customer order page — fixing this once fixes both surfaces. The previous bug: 2× BBQ Chicken Pizza in basket plus a 2-pizza deal only showed the item once in the slot picker.

## Inline price editing on deal headers (V4)

Operators can override the deal price on the order card by editing the deal header price directly. The price input must:

- Have [appearance:textfield] so spinner arrows are hidden.

- Use the same font-bold text-slate-900 text-lg weight as standalone item names.

- Save on blur or Enter; revert on Escape.

# 9. Kitchen Display System (KDS) rules

## Access

The KDS opens from the dashboard header "Kitchen screen" button. Single-vehicle trucks open directly to /kds/[kds_token]; multi-vehicle trucks get a vehicle picker first. Opens in a new tab so the dashboard stays available alongside it.

## View modes

- **solo** — mobile/web dashboard view. Compact, expand/collapse, all controls.

- **window** — iPad KDS window mode. Full ticket detail, prices visible, Mark paid & done.

- **cook** — iPad KDS cook mode. No prices, no deal labels, larger tap targets, Ready button.

## Layout modes

Independent of view mode: list (single column, counter-top) and grid (multi-column auto-fill, mounted displays). All four combinations work independently. The in-header switcher toggles them without going to settings. (These layout controls live on the dashboard/KDS directly, not in van settings.)

## Header design

- Order number large and bold; customer name and slot time secondary on the same line.

- Price inline on window view, hidden on cook view.

- Long names truncated; slot time always visible.

- Header background driven by urgency; text always readable (dark on light tints, white on solid green for ready).

## Urgency colour logic

getCombinedUrgency(slotTime, createdAt, status): ready = solid green top border (overrides all); cooking = amber; otherwise take the MORE urgent of slot-relative and age-based urgency (new <5min, ok 5-15, warn 15-30, late 30+). An order 25 minutes old with a slot an hour away is still amber — the operator must see what is neglected.

> **RULE (V6.3) — urgency is date-aware, age blends only inside 60 minutes.** getCombinedUrgency / the prep-needed-now logic must account for the event DATE, not just time-of-day. Two bugs were fixed: (1) the age-urgency blend fired regardless of how far away the slot was, so a future order went red; it now blends age in only when the slot is under 60 minutes away (components/dashboard/helpers.ts). (2) the "prep needed now" check compared time-of-day while ignoring the date, so a future event showed "prep now" the day before; it is now date-aware per Section 7's local-date parse rule. A future-dated event must NEVER show red "prep needed now" urgency.

## Card and price layout

- Grid mode uses items-stretch for equal row heights; action buttons use mt-auto to sit at the bottom.

- "Mark paid & done" uses dark slate (not green/teal) to differentiate from the green ready state.

- Prices right-align to the same column edge using tabular-nums and a fixed-width price column; item name takes remaining space.

## Category grouping and counts

- Section header: text-xs font-bold uppercase tracking-widest; rule extends right; first:mt-0 on first category.

- Items within a category sorted alphabetically as a secondary sort; unknown categories fall into "Other" at the bottom.

- TO MAKE all-day count bar aggregates base items across all in-flight orders (excludes modifiers), updating in real time.

## Allergy and notes

- Item special instructions shown italic below the item line.

- Order-level notes shown as a separate red block at the bottom, always visible, never truncated.

- Cook view shows notes too — allergy information must never be hidden from the cook.

### Customer contact on the order card (V5)

OrderCard shows a Contact control inline next to the customer name when the order has an email or phone. Tapping it reveals the email (mailto:) and phone (tel:) inline below the name; tapping again collapses. It renders on all view modes (solo, window, cook) — a cook may need to call a customer about an allergy or a missing item — and is hidden entirely for walk-up orders with no contact details. The control is a compact inline button, not a full expandable section, to keep the card from growing. customer_email and customer_phone must be included in the dashboard orders query and the Order type for this to populate.

## Per-vehicle KDS settings

show_cooking_step lives per vehicle (truck_vans). It adds a "Cooking" step between confirmed and done — useful when a vehicle has separate cook and window staff. Different vehicles can have different settings.

## Inline stock and category editing in the dashboard (V6)

The dashboard Menu & Stock tab edits category prep and batch inline on the category header — there is no Edit accordion. Prep time is a minutes input plus a 0s/30s seconds select; batch size is a number input that is blank when null (placeholder ∞) with a "no limit" label, and saves null when cleared. updateCategoryField saves on blur (prep) or change (seconds select, batch), hitting the same update_category endpoint the manage page uses. The category rename, allow-notes toggle, and full category settings remain on the Manage page only.

# 10. Add Order panel

## Purpose

For operators to manually enter orders — walk-ups at the hatch and phone/Facebook pre-orders. Used frequently throughout service; must be fast.

## Layout

- **iPad (md: and above)** — split screen. Menu left, live cart and submit right. No scrolling for typical orders.

- **Phone (below md:)** — single column LIST layout with a + button per item that expands to inline − qty + controls. Sticky bottom bar shows total £X.XX and item count with a "Review order →" button opening a bottom sheet for name, slot, and confirm.

The desktop grid and mobile list serve genuinely different use cases (known menu vs browsing) and are intentionally not unified — DRY applies to logic and data, not always to UI when contexts differ.

## Fast-tap rules

- Tapping an item adds it immediately at base price — no popup, no confirmation, no upsell.

- Tapping the same item increments quantity. Modifiers added by tapping the cart line.

- This is the Square/Toast POS pattern — operators do not have time for popups mid-transaction.

## Event selection

- The event selector lists all upcoming confirmed events, not just today's — operators take phone pre-orders for future events.

- Auto-selects today's event if there is exactly one.

- Selecting a future event shows an amber warning with the date. Selecting today's not-yet-open event shows a blue info note. ASAP is computed from the selected event's date/time.

- **With no event selected (V6):** a prominent amber "No event selected" box with a Select event button shows at the top of the panel; items can still be added but Confirm is disabled with "Select an event to confirm". Basket persists across event changes (see Section 5).

### Event bar and in-panel event box (V5)

The active event is shown in the sticky event bar below the tabs (see Section 9-A / dashboard surface). The Add Order panel keeps its own event box ONLY while the event is not yet live — that box carries the Start Event action. Once the event status is open, the in-panel box is hidden (manualEvent?.status !== 'open') and the sticky header bar is the single source of event context. This prevents the event details showing twice.

Event selection is bi-directional: the dashboard owns selectedEventId as the single source of truth and passes the resolved event into the panel via controlledEvent, with onEventChange flowing changes back up. The Change button in the event bar opens the existing event picker modal (it does not use a separate inline dropdown). Selecting a closed event surfaces a Restart Event action; see Section 15.

### Auto-event selection on dashboard load (V5)

The dashboard auto-selects the most relevant event once on load so the operator never lands on a "No event selected" state. Priority: (1) an event happening now today (started, not ended); (2) an upcoming event today not yet started; (3) the next upcoming event on any future date. A guard ensures this runs only once and never overrides a manual selection. activeEvent resolves from the full upcomingEvents list, not just today's events — otherwise a future selected event reads back as undefined and the bar wrongly shows "No event selected". Opening an event also updates upcomingEvents so the Start Event control disappears immediately without a refresh.

## Customer details and slot

- Name optional, defaults to "Walk-up". Email/phone behind a collapsible toggle, hidden by default.

- Slot defaults to ASAP; the operator can override to a future slot. The operator sees ALL slots except genuinely past ones — including too-soon and full slots — each with a traffic-light indicator and an override modal (operator-only, lib/slot-indicator.ts). See the slot traffic-light rule below.

### Slot traffic-light — operator-only, customer picker stays clean (V6.3)

> **RULE** — too_soon is its own slot-availability field (lib/slot-availability.ts), no longer conflated into is_past (the server previously merged them, so the operator couldn't see or override a too-soon slot).

- **Operator (dashboard / Add Order)** — sees every slot except genuinely past ones, each with a traffic-light state and an override modal: green (available), amber ("Filling up"), red ("Full"). lib/slot-indicator.ts is operator-only and is never imported by the customer page.

- **Customer order page** — NO traffic-light. Only cleanly-available slots are shown; full and too-soon slots are HIDDEN (not shown-disabled), consistent with the no-internal-state-on-customer-surfaces principle (Section 4 / Section 7).

> **INTERIM (V6.3) — directional wording only.** The amber/red labels are directional ("Filling up" / "Full"), not a precise count. kitchen_capacity counts BATCHES but the UI says "items"; the proper items-based capacity display and the kitchen_capacity semantics fix (decided: ITEMS is the intended meaning) are DEFERRED to a careful session — it touches the slot engine and existing slot_capacity data. Do not ship the precise count until that is done. See Section 27.

## Confirm order button

- Label "Confirm order" (not "Place order"). Shows price suffix when items present.

- Disabled until at least one item/deal AND an event is selected (V6). Submits to /api/dashboard/action with action="manual". On success: toast, reset, switch to Orders tab.

## Grace period banner (V4)

Orders for an event whose end time has passed by more than 30 minutes show a passive amber banner above the form:

*⚠ This event has ended — you're adding an order after close. Make sure you've selected the right event.*

The Confirm order button is NOT disabled. Operators frequently take orders after the official end time and the previous hard-block created friction without preventing genuine mistakes. No per-order acknowledgement is required.

Customer-side grace filtering is unchanged — events ended >30 min are filtered out of the customer event picker.

## Basket persists across tab switches (V6.3)

> **RULE** — AddOrderPanel is always-mounted with an isActive prop (the Section 22 pattern), visually hidden when inactive, never unmounted. The basket (manualItems, manualDeal, customerName, manualSlot, manualEvent) survives tab switches and event changes. The basket clears ONLY on successful order placement — never on a tab switch, never on an event change (an operator mid-build who switches to Orders to check the queue must come back to an intact basket).

## Modifier rendering inside customise modal

The customise modal in the Add Order panel calls /api/menu/[truckId] with ?dashboard=1, so it receives all modifier options with their available field intact. Options where available === false are then HIDDEN by the client via isModifierAvailable from lib/modifier-utils.ts — same rule as the customer page. Operators set the stock; they know what they turned off; no "unavailable" label is needed. See Section 17 for the API rules and the menu modifier availability rule.

## Cart summary visual hierarchy (V4)

Deal header rows use the same font-bold text-slate-900 text-lg weight as standalone item names — the deal is a first-class line item, not a sub-heading. Inline price editing on deal headers (operators can override the deal price). Spinner arrows removed from price inputs via [appearance:textfield]. The "Items subtotal" row was removed (it was a confusing partial). All cart line rendering goes through OrderLineItem with variant="operator".

## Kitchen capacity and offline protection in the dashboard (V6, updated V6.1)

The Menu & Stock tab shows the slim event bar at the top (V6.1 — added to this tab so it is consistent with the Orders and Add Order tabs). When an event is selected it then shows (in order) Auto-accept, Kitchen capacity, and Offline protection cards:

- **Kitchen capacity** — reads and writes the active van's kitchen_capacity (truck_vans). Options: No limit, then 1–20 items (matching the manage page). The description is the single canonical copy, identical to the Settings tab: "Maximum items per 5-minute window. Items with no prep time set are excluded. Leave blank for no limit." (V6.1 — the previous "Max cooked items..." wording and the amber "this is a global van setting" warning were both removed; Settings is the source of truth for this copy.)

- **Offline protection** — reads the van's auto_pause_on_offline as the default and the event's offline_protection_override; the toggle writes the per-event override (see Section 15). The card description is identical in both on and off states ("Pauses online orders if this device goes offline"), with a secondary line showing whether the event override or van default is in effect. (V6.1 — see the confirm-dialog behaviour in Section 11.)

# 11. Native app and offline architecture

## Why native is needed

Food trucks operate in villages with patchy 4G. A web-only KDS that loses connection during service is a critical failure. Offline reliability is non-negotiable.

> **DECISION** — A native wrapper using Capacitor must be built BEFORE any trial begins. This is non-negotiable for the operational reliability of trucks in low-coverage areas.

## Capacitor wrapper, not React Native rebuild

The native app is a Capacitor wrapper (com.hatchgrab.app) around the existing Next.js app, pointing at https://www.hatchgrab.com. Native code only for: offline detection, local order storage, background sound on new orders, screen wake, and Bluetooth printer (Max, post-trial). The Next.js UI is reused unchanged — no separate native KDS UI, no duplicated OrderCard.

## Three-stage offline progression

### Stage A — Read-only offline cache (V1 pre-trial)

- Active orders cached to the iPad while online; shown while offline.

- Cook can see, mark ready, mark done — actions queued locally and synced on reconnect.

- New orders cannot be created while offline. Pause banner appears automatically. Solves the "blank screen during outage" failure.

### Stage B — Walk-up orders while offline (post-trial)

- Operator adds walk-ups offline with device-generated IDs; server assigns display IDs and resolves conflicts on reconnect. Online customer orders still blocked offline. (V6.3 note: with order_key as a client-generatable uuid and id as a server-assigned per-event display number, this stage is now architecturally cleaner — the device can mint order_key offline and the display number is assigned at sync. See Section 18a.)

### Stage C — Full offline with reconciliation (future)

- Device UUIDs throughout, display IDs at sync time; slot capacity reconciliation; multi-device conflict resolution (Max). Operator notified when synced orders exceed capacity.

## Trial scope

Trial begins with Stage A only, in villages with reliable coverage. Stages B and C are post-trial once real outage patterns are understood.

## Per-vehicle offline protection

truck_vans.auto_pause_on_offline pauses online orders for that vehicle if its kitchen device goes offline. Per vehicle — each can be set independently. A "Protected" badge shows on the vehicle in settings when enabled. As of V6 an individual event can override the van default via truck_events.offline_protection_override, set from the dashboard (Section 15).

### Offline protection toggle UX (V6.1)

The dashboard Menu & Stock offline-protection toggle confirms both directions through native window.confirm dialogs rather than a persistent on-screen warning banner or a success toast (both removed):

- **Enabling** — warns that the device must keep the screen on for protection to work, and force-enables Screen On (calls the existing keep-awake function) so the operator cannot enable protection while leaving the screen free to dim.

- **Disabling** — warns that online orders will no longer auto-pause if the device drops offline for this event.

The toggle itself uses the unified control styling shared by every dashboard and settings toggle: w-11 h-6 track, bg-teal-500 when on. No bespoke toggle sizes or colours anywhere.

## Heartbeat architecture (V6)

- One last_heartbeat_at column per truck_vans row — there is no per-device heartbeat table.

- Both the KDS page and the main dashboard fire a heartbeat every 15 seconds, passing { token, vanId }.

- The heartbeat monitor treats last_heartbeat_at older than 30 seconds as stale and, for vans with auto_pause_on_offline (or an event override) on, sets online_paused_until = now + 2h.

- A live heartbeat receipt clears online_paused_until back to null.

- **All-or-nothing offline detection is by design** — whichever device pings most recently overwrites last_heartbeat_at, so as long as any one device on the van is online and pinging, the van stays live. Only when ALL devices stop pinging does the van go stale and auto-pause. Single-device setups behave exactly as expected; multi-device setups don't pause just because one of several iPads drops out.

## Wake lock and screen-on (V4)

The dashboard is the operator's live order view during service. If the screen dims and locks, the operator misses new orders. The "Screen on" toggle in the avatar dropdown requests the Wake Lock API.

### Implementation rules

The Wake Lock API auto-releases the lock on any page-hidden event (tab switch, app backgrounding, screen dim, OS-level interruption). A naive wakeLock.request('screen') call fails permanently after the first focus loss. lib/native/keepAwake.ts must implement:

- **Release listener on the lock** — re-requests immediately if the page is visible and intent is still on.

- **visibilitychange listener** — added once via a sentinel flag; re-requests on page becoming visible if the lock was lost.

- **Intent tracking** — a module-level keepAwakeEnabled flag persists across auto-releases so re-acquisition only happens when the operator still wants it.

- **Double-lock guard** — if (!webLock) in keepAwake() prevents calling request() while a lock is already held.

enableKeepAwake and disableKeepAwake are legacy aliases retained for KDS page compatibility. Do not remove.

### Browser compatibility

navigator.wakeLock is supported in Chrome (mobile and desktop) since v84, Firefox Android since 72, Samsung Internet since 14, and Safari (iOS and macOS) from 16.4 (March 2023). Firefox desktop does not support it. Older Safari silently no-ops.

When 'wakeLock' in navigator is false, show an inline amber warning under the toggle:

*Screen lock isn't supported on this browser. Keep the device plugged in and the app in the foreground to prevent the screen dimming.*

# 12. Authentication and access

## Operator and staff accounts

- Operators authenticate via Supabase Auth (email/password). The operators table holds account-level data; auth_user_id links to the auth user.

- Staff are invited via the Team tab and stored in truck_users (role: owner/manager/staff). An invite creates an auth user and a truck_users row; accepting the invite (setting a password) sets accepted_at and links auth_user_id.

- Dashboard access is granted if the user is the truck owner OR a truck_users member of that truck. The owner check runs first; if not owner, truck_users membership is checked. An orphaned operators record (created during a staff invite) must not block the truck_users check.

- Staff are redirected to their vehicle KDS on login and cannot access the Manage page. The Manage link is hidden from staff in the dashboard dropdown; manage tabs are role-gated (Billing owner-only).

## Four permission levels (V6)

There are four distinct levels of access:

1. **Staff** — redirected to their vehicle KDS on login; cannot access the Manage page.

2. **Manager** — all Manage tabs except Billing; can edit/invite staff only.

3. **Owner** — full access to their truck including Billing.

4. **Admin (platform-level)** — operators.is_admin = true. A platform role, not a truck role; it is NOT stored in truck_users and admin accounts are not attached to any truck. The UserMenu shows a 🔐 Admin link when is_admin is true, and /api/auth/me returns is_admin.

> **RULE** — Admin is a platform role on operators (is_admin), never a truck role on truck_users. Do not attach admin accounts to trucks to grant admin.

## Sign-out implementation (V4)

> **CRITICAL** — Sign-out must use createSupabaseBrowserClient() from lib/supabase-browser.ts (which wraps createBrowserClient from @supabase/ssr), followed by a hard redirect via window.location.href = '/login'.

The plain createClient from @supabase/supabase-js only clears in-memory auth state — the SSR session cookie persists and the middleware re-authenticates the user on the next page load, making sign-out silently fail. This was the root cause of a long-standing sign-out bug fixed in V4.

A hard redirect (not router.push) ensures all client-side state is cleared before the next page loads. The sign-out handler lives inside the UserMenu component — pages do not pass an onSignOut prop. The dashboard page's handleSignOut is effectively unused for the avatar dropdown but still exists in the file.

## Token-based surfaces

- Each truck has a long random dashboard_token in the URL; KDS uses per-vehicle kds_token.

- Customer order URLs use the truck slug (/trucks/[slug]/order). Slug must be unique and URL-safe.

## Email change verification

- Changing an operator email writes a row to operator_email_changes (old_email, new_email, token, expires_at) and sends a Brevo verification link to the NEW address. The old email stays active until verified.

- A pending banner with a Resend action shows in the Team tab until verified; state persists across reloads (loaded from the API).

- Duplicate check is against auth.users (covers operators and staff), not just operators.

- Brevo send is checked — a failed send returns an error and cleans up the pending row rather than silently reporting success.

### Login identity: which email is the credential (V5)

> **RULE** — auth.users.email is the login credential (what the operator types to sign in). operators.email is the display / contact email shown in the app and used for account correspondence. They are kept in sync on email change, but conceptually distinct. /api/auth/me returns operator.email, not the auth user email.

Ghost auth user pattern: a duplicate row in auth.users (e.g. one created during an earlier staff invite or a half-completed change) will collide with an email change and make the two emails appear to desync. The email-change flow now does a pre-flight duplicate check against auth.users (covering operators and staff) before writing, and rolls back all writes on any failure. On successful verification it forces a sign-out and redirects to /login?message=email_changed so the session always reflects the new credential.

### Auth flow hardening (V5)

- **Password reset** — the Brevo send is now checked; a failed send returns an error and cleans up the token rather than reporting success. The broken logo reference was removed and the confirmation message genericised ("If an account exists…").

- **Email change** — pre-flight duplicate check, error handling with rollback on every write, forced sign-out on completion, and a cancel-pending-change action with Resend / Cancel controls in the Team tab (the field is locked while a change is pending).

- **Login page** — temporary debug logging that recorded submitted email addresses was removed. The reset-success notice clears on keystroke or submit, and the page surfaces Supabase's actual error message.

## Admin console (V6, ADMIN_SECRET removed V6.1)

The admin page (/admin) authenticates solely via the operator's Supabase session. As of V6.1 there is no password prompt, no ADMIN_SECRET env var, and no emergency fallback — the entire secret path documented in V6 has been removed.

- Every admin API route calls verifyAdmin() server-side, which resolves the caller's Supabase session to an operators row and checks is_admin = true. A request from a non-admin (or unauthenticated) caller is rejected. There is no shared secret to leak, rotate, or fall back to.

- On mount, the page calls GET /api/admin?section=check_admin. If the session operator is an admin the endpoint returns success and the page loads; otherwise the page shows an "access denied" state. There is no password form to fall back to.

- A loadWithSecret-style race guard is retained in spirit: the data-loading effect runs only after the session check resolves, avoiding the async-state race that previously showed "0 trucks" on first load. A checkingSession state shows a brief spinner while the session is verified.

- The page uses the shared AppHeader (truckName / truckLogoUrl null) and slate-900 sticky tabs (px-4, overflow-x-auto, border-slate-700), with two tabs: 🍕 Trucks and 📋 Features. The Trucks tab lists trucks with plan, trial days, lifetime-discount badge, and a dashboard link, plus a truck edit modal (plan, trial, lifetime discount, feature overrides, create-operator). The Features tab renders from FEATURE_SECTIONS with section headers, the tester column, PLAN_FOOTNOTES, and a static transaction-fees block. The Discovery-trucks linking UI lives under the Trucks tab.

> **RULE (V6.1)** — Admin authorisation is session + operators.is_admin only, enforced by verifyAdmin() on every admin route. Never reintroduce a shared admin password or env-var secret.

## Slug or UUID resolution pattern

APIs that accept truck identifiers must handle both slug (customer-side) and UUID (dashboard-side). This was the root cause of multiple "truck not found" bugs. Support both lookups from day one for any new truck-scoped API.

## Known gaps (before public launch)

- Rate limiting on auth attempts. (Note: V6.3 added anti-scraping rate limiting on public data routes — Section 28 — but auth-attempt throttling specifically is still open.)

- ~~Admin secret~~ — RESOLVED in V6.1. ADMIN_SECRET has been fully removed; admin auth is session + operators.is_admin via verifyAdmin() only.

# 13. Operator and multi-truck model

## Operators own trucks

- **operators** — account holder. Columns: id, name, first_name, last_name, email (unique, login), phone, auth_user_id, is_admin (V6), billing fields, stripe_customer_id.

- **trucks.operator_id** is a nullable FK to operators.id. One operator can own multiple trucks (brands operate under one login).

## Single vs multi-truck UI

> **RULE** — When an operator has ONE truck, the truck name and truck selector are never shown — it is implied. When an operator has multiple trucks, the truck selector appears in the event form and the truck name appears on event cards. All multi-truck UI is gated on operatorTrucks.length > 1.

- A second truck under the same brand is auto-named "[Brand] 2" by default and can be renamed. Adding additional trucks is already built; selecting a truck when adding an event becomes mandatory once more than one exists.

- What stays at truck level: menu, categories, items, orders, events, schedules, stock, dashboard_token.

- What is operator level: billing/subscription, login credentials, business name and personal contact details.

## Personal vs business contact

- Personal/account-holder details (first name, last name, phone, login email) live on operators and are edited in Team tab → owner row → Edit. Private, never shown to customers, used for account management and billing/KYC.

- Business contact (email, phone shown to customers on order confirmations) lives on the truck and is edited in Settings under "Business contact".

- For Stripe Connect KYC later, first_name/last_name/phone are captured now; full verification (DOB, address, ID, bank) is handled by Stripe at onboarding, not stored in our system.

# 14. Vehicles (trucks under a brand)

## Concept and naming

> **NAMING** — The platform UI calls a physical vehicle a "truck". The underlying DB tables remain truck_vans and truck_user_vans (internal only). User-defined vehicle names (e.g. "Van1", "Main Truck") are operator data and must never be auto-changed. A "truck" brand record is a row in the trucks table; a "vehicle" under it is a row in truck_vans.

Settings section is "Your trucks" with "+ Add truck". Each vehicle is rendered as its own bordered card (border border-slate-200 rounded-2xl p-4 — V6.1, replacing the flat list rows) showing its user-defined name (bold), a "Protected" badge when offline protection is on, and Rename/Delete actions.

> **RULE (V6.1)** — Adding a truck shows a window.confirm billing-warning dialog before creation, because each additional vehicle may affect the operator's subscription. Creation only proceeds on confirmation.

## Per-vehicle settings

- **auto_pause_on_offline** (boolean) — pause online orders for this vehicle if its device goes offline. An individual event can override this via truck_events.offline_protection_override (V6).

- **show_cooking_step** (boolean) — adds the Cooking step on this vehicle's KDS.

- **kitchen_capacity** (integer, nullable) — max COOKED items per 5-minute window; drinks/instant items do not count; blank = no limit. Options are No limit then 1–20 items (V6 — was a sparse 3/5/8/10/15/20). Editable from both the manage page Settings and, when an event is active, the dashboard Menu & Stock tab; both surfaces use identical options. It remains a global van setting. (V6.3 note: the slot engine currently counts BATCHES against this while the UI calls it "items" — the items-based semantics fix is on the backlog, Section 27.)

- **display_layout and split_screen** columns exist in the DB but are NOT exposed in van settings — they are set from the dashboard/KDS directly.

## Kitchen capacity wiring

When an event is created or confirmed with a vehicle assigned, slot_capacity rows are written automatically using that vehicle's kitchen_capacity. No vehicle assigned, or no capacity set, means no limit.

## Staff vehicle access

truck_user_vans links staff to specific vehicles. Leaving a staff member's vehicle access empty grants access to all trucks. Staff see only their assigned vehicle's orders.

# 15. Events and venues

## Concept

An event is a truck appearing at a venue on a date and time. The discovery map shows current and upcoming events. Each confirmed event has its own ordering page if pre-orders are enabled.

## Event confirmation

> **RULE** — Events created manually in the Manage page auto-confirm immediately (source='manual', status='confirmed'). There is no confirmation popup. Only scraped/uploaded events (inbound via /api/inbound-schedule, or via the operator schedule import) arrive as unconfirmed and require explicit confirmation — except operator schedule imports, which the operator is reviewing and which therefore save as confirmed (see Import schedule below). The Confirm button on an unconfirmed event confirms instantly using the truck's auto-open/close defaults.

Unconfirmed events show on the discovery map with the order button DISABLED and "Awaiting truck confirmation". Only confirmed events accept orders — this shields customers and the platform from bot errors.

### All event sources flow to truck_events — the scraper bridge (V5, gated by preference V6.2)

> **RULE** — Every event source — the web/Apps Script scraper, vendor emails to schedule@villagefoodie.co.uk, and manual entry — can end up in truck_events as an event for a linked truck. The truck confirms inbound (scraper/email) events before they can take orders; manual entries and operator schedule imports are confirmed on save.

Bridge mechanics in /api/inbound-schedule: after the usual write to discovery_events, the endpoint normalises the incoming truck name and matches it against discovery_trucks rows that have a hatchgrab_truck_id set. On a match it inserts a truck_events row with status 'unconfirmed' and source 'scraper', after a dedup check on truck_id + event_date + venue_name (so re-scrapes and manual duplicates don't pile up). Venue coordinates are looked up from the venues table where available. A best-effort notification email is sent once per truck per batch (fire-and-forget — it must never block ingestion). Trucks with no hatchgrab_truck_id are unaffected: their events stay in discovery_events only, exactly as before.

> **RULE (V6.2) — bridge is gated by scraper_preference.** The bridge into truck_events now also checks trucks.scraper_preference. Only trucks set to 'auto' have their scraped events bridged into truck_events and the operator emailed. A truck set to 'manual' (the default) skips the truck_events insert entirely — it has opted to upload its own schedule, so scraped events would only create noise. The discovery_events write is unaffected in both cases (the public map still shows whatever the scraper found). A legacy value of 'both' is treated as 'auto'.

Linking is a one-time admin step per truck: the admin console shows a "Link HG truck" dropdown on each discovery truck row, which sets discovery_trucks.hatchgrab_truck_id. Until a truck is linked, nothing bridges — this is the intended gate during onboarding.

## Scraper preference and self-service verify (V6.2)

Operators choose how their schedule reaches HatchGrab. Three new columns on trucks back this:

- **scraper_preference** (text, enum 'manual' | 'auto', default 'manual'; a legacy 'both' is treated as 'auto').

- **schedule_url** (text) — the operator's own schedule/website URL, used by the auto flow and the verify route.

- **scraper_rule** (text, enum 'scroll_lazy' | 'scroll_next') — the scroll strategy that successfully extracted events for this site, learned at verify time and reused by the daily scraper.

### Settings → "Your schedule"

The Settings tab carries a "Your schedule" section with two radio cards:

1. **"I'll upload the schedule myself"** — first and default. The operator imports their schedule by hand (see Import schedule below) and scraped events are not bridged.

2. **"Find my events automatically"** — second; subtitle "You can still add events manually at any time." Selecting it reveals a schedule URL field with an inline **Verify** button.

### Verify flow

The Verify button lets an operator confirm, there and then, that we can read events off their site:

- **Blocked-domain check** — isBlockedDomain (against BLOCKED_DOMAINS) rejects Facebook and Instagram URLs both on blur and again before fetch; a blocked URL is never persisted. Social pages can't be reliably scraped, so the operator is told to use their own website.

- Pressing Verify shows an amber status box: "Checking your website... This can take up to 2 minutes." (Scraping with a headless browser is slow.)

- The request hits **app/api/manage/verify-schedule-url/route.ts** — a self-contained Puppeteer scrape (@sparticuz/chromium + puppeteer-core) that loads the page, runs BOTH scroll rules (scroll_lazy and scroll_next), and calls extractScheduleEvents from lib/schedule-extract.ts on the resulting content. If a rule yields events, the winning scroll rule is stored on trucks.scraper_rule. The route returns { found, events, reason } where reason is 'no_content' (page didn't load / nothing scraped) or 'no_events' (scraped fine, nothing schedule-like found). export const maxDuration = 60.

- On success the import review modal opens **on the Settings tab without switching tabs**, pre-loaded with whatever was found, so the operator reviews and saves exactly as with a manual upload. This is why the Schedule tab is always-mounted with modals outside its isActive gate (Section 22).

### Schedule tab info strip

The Schedule tab carries an info strip at the top showing the truck's current preference (upload-myself vs find-automatically) with a "Change in Settings" link, so the operator always knows which mode they're in.

### Approval queue for scraped events

When a linked, auto-preference truck has scraped, still-unconfirmed events, they surface in the Schedule tab under a **"Needs your approval"** heading, each card with an amber left accent and three actions:

- **Approve** — confirms the event as-is.

- **Edit & Approve** — opens the event in the Add/Edit form (with an editingEventConfirmOnSave flag set) so saving both edits and confirms in one step.

- **Reject** — removes the event and prompts "exclude similar?" exactly like the import delete (see Exclusion list below).

## Import schedule (operator upload) — review UX rebuilt V6.2

Operators can bulk-import their own schedule from a screenshot, photo, PDF, or pasted text:

- A 📤/✨ Import schedule button sits on the Schedule tab header beside + Add event, styled to match the Menu tab's "Import menu" (sparkle icon, "photo, PDF or text" subtitle). It opens a dedicated modal — separate from the Add event modal — with a drag-and-drop upload zone (the shared useDragDrop hook), a paste-text area, and a "Process schedule" button. Once events have been extracted, the upload/paste UI is hidden (gated on extractedEvents.length === 0) so only the review list and action buttons remain.

- The route app/api/manage/process-schedule/route.ts verifies the dashboard token, reads the input, calls extractScheduleEvents from lib/schedule-extract.ts (Section 3), and returns { events: [...] } with the ExtractedEvent fields: event_date (DD/MM/YYYY), start_time, end_time (HH:MM, empty string if none — never "00:00"), venue_name, town, postcode (or empty string), and optional address. It performs no DB writes, no dedup, and is NOT asked for a truck name — the truck is always the logged-in operator's truck. As of V6.2 it is a ~40-line wrapper around the shared library, with no prompt or parsing logic of its own.

### Time entry — 30-minute dropdowns (V6.2)

Schedule times are entered through dropdowns, not native time inputs:

- **SCHEDULE_TIME_OPTIONS** — a module-level constant of 30-minute increments from 07:00 to 23:00, rendered as `<select>` options. Defined once and shared by the import review AND the Add/Edit event form (the V6.1 native step="300" inputs on the Add/Edit form are superseded).

- Start and end are **always paired**; the end dropdown is filtered to options strictly after the chosen start.

- **applyStartTimeChange** (module-level, shared) — selecting a start auto-populates the end at start + 3h, clamped to 23:00; if the start is moved past the current end, the end is auto-cleared so it can be re-chosen.

- process-schedule (via extractScheduleEvents) discards any event where end ≤ start before it is ever returned.

### Review UX — breakpoint-divergent (V6.2, supersedes V6.1 always-expanded)

The V6.1 "always-expanded inline editable cards" design is replaced by a layout that diverges by breakpoint, because the right interaction differs sharply between a phone and a desktop. Field order on both is **Date → Venue name → Area + Postcode → Start time + End time → Van**.

**Mobile** — compact summary cards (~90px) with three states:

- **collapsed** — a one-glance summary line (date · venue · time).

- **focused** — auto-opened for any incomplete card, showing ONLY the missing fields (driven by per-card _missingDate / _missingVenue / _missingTime flags) so the operator fixes exactly what's wrong and nothing else.

- **fully expanded** — every field editable, opened via an Edit affordance on a complete card.

There is **no Done button** — a card simply collapses back when complete. focusedEventIds and expandedEventIds are sets that are only ever added to, never removed during a session, so a card the operator has opened stays open (it never snaps shut under them as they type).

**Desktop** — an always-editable inline table:

- table-layout: fixed with an explicit colgroup so columns never jump as content changes. Widths: checkbox 32px, date 130px, venue 220px, area 150px, postcode 100px, start time 100px, end time 100px, delete 36px.

- Incomplete rows get an amber row highlight plus amber highlighting on the specific empty required field.

An attention banner counts the incomplete events and the Save button is disabled until every selected event is complete. The "Area" field label is "Area (village, town or city)" and covers villages, towns, cities, and city districts.

### Historical (past-dated) events (V6.2)

A schedule screenshot often includes dates that have already passed. These are handled separately so they can't be silently saved as live events:

- Past-dated extracted events render in their own **"Past dates — update to save"** section below the future events.

- Their save checkbox is **disabled** and they are seeded selected: false.

- Editing a past event's date to a future date **auto-selects** it and enables its checkbox.

- An **_originalDate** snapshot is taken on extraction; the card stays in the historical section regardless of later date edits (so it doesn't jump between sections mid-edit). parseDDMMYYYY and sortByDate are the helpers used to classify and order.

- The Save button count only includes **selected future** events.

### Exclusion list interaction (V6.2)

Deleting an event in the review (or rejecting a scraped event in the approval queue) prompts **"exclude similar?"**:

- **"Yes, exclude"** — adds the normalised venue_name to the truck's excluded_terms via add_exclusion_term, which returns { ok, id }; callers store the returned id for any later remove.

- **"Just remove"** — removes the event from the list without excluding.

Excluded events are shown struck-through inside a collapsed `<details>` section at the bottom of the review, each with an **Add back** button.

- **Add back removes by term, not by id** (handleAddBack) — this is deliberate: an exclusion added earlier in the same session may not have its id to hand, and matching by term is always safe.

- **selectedEvts is derived from includedEvents only** — excluded events are excluded from the saveable set, so an excluded event can never be accidentally saved even if its checkbox state lingers.

See Section 16 for the excluded_terms schema and Section 3 for normaliseExclusionTerm / isExcluded.

### Address field (V6.2)

ExtractedEvent.address is optional. The extraction prompt is explicitly instructed never to put a town or postcode into the address (those belong in town and postcode). This stopped the address field swallowing the area/postcode and leaving them blank in the review.

### Saving

saveExtractedEvents geocodes via the existing geocodeLocation path and writes via upsert_event with status 'confirmed' and source 'operator_upload'. Imported events surface on both maps via the existing discovery/events read path. The same review UI is shared with the Add event modal's upload mode and with the Settings Verify flow — one set of state covers all instances, so edits to the review behaviour must be applied consistently across them.

### Geocoding and the Fix button (V5)

Manual events geocode via Gemini from venue name + town + postcode at save time, with an api.postcodes.io fallback when the postcode is present (free, UK-only, no key). The event still saves if geocoding fails, but the operator is warned with a toast, and events with null coordinates show a Fix button in the Schedule tab that re-runs geocoding (update_event_coords action). Always build dates with local-time parse, never new Date('YYYY-MM-DD'), per Section 7.

## Auto open/close (truck-level)

trucks.default_auto_open and default_auto_close live in Settings → Order settings, not per-event. Events open for online orders at start time and stop at end time per these defaults.

### Event lifecycle controls — Start, Restart, Close (V5)

Operators control whether an event is taking orders through the event bar and the in-panel box. Wording and status, canonical:

- **Start Event** — opens a confirmed event for orders (replaces the old "Open for orders" / "Go live"). Success toast: "Event started". Status becomes ● Live (green).

- **Restart Event** — reopens a closed event. Success toast: "Event restarted".

- **Close** — sets status 'closed'; only an event currently 'open' can be closed. Status shows ● Closed (slate). Pausing shows ⏸ Paused (amber).

> **RULE** — Closing an event must be recoverable. A closed event still appears in the event picker (filter allows confirmed, open, AND closed) with a Closed badge and a Restart Event button, and the server open action accepts status confirmed OR closed. An accidental early close must never strand the operator with no way back. Cancelled events remain excluded from the picker.

On the dashboard, the in-panel event box (with the Start Event button) shows only while status is not open; once live, the sticky event bar is the sole event display (see Section 10).

## Cancelling an event (V6)

The Cancel action on an event card opens a confirmation modal with an optional reason dropdown and an optional message-to-customers field. On confirm, the event status is set to cancelled and all pending and confirmed orders for that event are set to cancelled; each affected customer with an email receives a cancellation email via Brevo (including the reason and note when provided), and the email acknowledges payment status where the order was paid. Refunds are NOT yet automated — cancellation does not trigger a Stripe refund; this is manual for now (backlog).

> **RULE** — openEventCancelModal fetches the real affected order count from /api/events/affected-orders (counts pending + confirmed orders for the event, token-verified) before showing the modal. It must never be hardcoded to 0, which previously misled the operator into thinking no orders were affected.

> **RULE (V6.3)** — Event cancellation queries and bulk-cancels affected orders by event_id, and the bulk cancel updates rows by order_key (`.in('order_key', …)`), NEVER by display id (`.in('id', …)` would cancel the same-numbered order across every other event — Section 18a). Note this depended on orders carrying event_id, which for most of V6.2 they did not — so cancellation emails silently went to nobody until the event_id-on-insert fix (Section 5). Both are now in place.

## Add/Edit event form

- **Field order (V6.1)** — the form leads with Date, then Venue name, Full address, Area + Postcode, Start/End time, Van, Notes. This matches the operator's natural "when → where → what time → which truck" reading order and is consistent with the schedule-import review cards.

- Date is blank on open; start/end times pre-fill from the most recent event. Mandatory fields: date, venue name, start time, end time (and van when multi-van — see rule below). Missing fields highlight red with inline errors.

- **Friendly date display (V6.1)** — the date field shows the friendly "Wed 3rd Jun" format via a clickable styled div over a hidden native date input (the same pattern used in the import review cards), rather than a raw DD/MM/YYYY or native control.

- **Time inputs (V6.2)** — Start and End time use the shared SCHEDULE_TIME_OPTIONS 30-minute dropdowns with applyStartTimeChange behaviour (auto +3h end, end filtered after start), the same as the import review. This supersedes the V6.1 native step="300" time inputs.

- **Address (V6.1)** — the address block carries a code comment marking it as UK-format so future non-UK locales can adapt it; Area + Postcode sit together below the full address.

- Venue name is a combobox — selecting a recent venue auto-fills town, postcode, address, and typical times. A "Copy a recent event" row offers one-click duplication (date and notes blank, venue/times/van carried over — the source van_id is preserved, V6.1).

- A Copy button also appears on each event card in the Schedule list (retained on past events too — see below).

- Modal is responsive — single column on mobile, wider on desktop.

> **RULE (V6.1)** — Events must be attached to a van. With a single van it is auto-assigned silently and no selector is shown. With two or more vans the van selector is required (red asterisk) on both the Add/Edit form and the schedule import, and save is blocked until a van is chosen. This applies wherever an event is created or edited.

## Event card display (Schedule tab, rebuilt V6)

The Schedule tab uses a date-anchored card layout:

- A left column with the day name (slate), a large orange day number (font-black text-orange-600), and the month (slate); no border on the column (pl-2 spacing kept); a thin slate divider separates it from the content.

- Venue name + town with an inline status badge. The town is omitted from the line when it already appears in the venue name (e.g. "The Royal Oak WARBOYS, WARBOYS" renders as "The Royal Oak WARBOYS").

- The time is prominent (text-sm font-semibold); the postcode sits on its own muted line below (no longer duplicated inline on the time line or repeated as a separate town+postcode line).

- Actions right-aligned: Copy, Edit, Cancel for active/upcoming events.

- Deals are collapsed into a `<details>` summary showing the active deal names (e.g. "1 deal active · Dinner 2 pizzas for £15"), expanding to the per-event deal toggles with stock warnings.

- **Past events** show Copy only (Edit and Cancel hidden) and no deals section. **Cancelled** events (past or otherwise) show a "Cancelled" badge rather than "Finished"; other past events show "Finished". Uses the same local-time parse rule as the customer page (Section 7).

- Scraped, still-unconfirmed events for an auto-preference truck appear in the "Needs your approval" section described above rather than as ordinary cards.

- All times display HH:MM (seconds stripped via formatTime). Cancellation confirmation shows the formatted date and time, e.g. "Wed 27 May · 18:00–20:00".

### Offline protection override on the event (V6)

truck_events.offline_protection_override (nullable boolean): null = use the van's auto_pause_on_offline default; true/false = an explicit per-event override set from the dashboard Menu & Stock tab (Section 10/11). The menu API checks the event override first and falls back to the van default. The dashboard toggle warns that disabling protection applies to this event only, and that disabling for all events is done via the Manage page (van settings). Rationale: a truck staff member should be able to turn protection off for one event without overriding the owner/manager's van-wide setting.

## Multiple events handling

- Distinct order queues per event; optional distinct menus/slot configs per event; clear operator navigation between events. Per-event order numbering (display ids restart at 1 per event) is the V6.3 model — see Section 18a.

## Discovery map visibility (V6)

As of V6 the temporary "operator events are HatchGrab-only" restriction is lifted. The discovery/events route reads both discovery_events and truck_events (status confirmed or open), merges at read time, and deduplicates by a truck-date-venue key with the operator version winning. Confirmed/open truck_events surface on BOTH the Village Foodie and HatchGrab maps (the isHG gate that previously returned operator events only to HatchGrab was removed — visibleOperatorEvents is now always the mapped operator events). isHG is still used elsewhere for the visibility allowlist.

# 16. Database schema essentials

## Core tables

- **trucks** — one row per truck/brand. Holds plan (starter/pro/max/trial/tester), settings, dashboard_token, operator_id, default_auto_open/close, is_test, qr_code_style (V4), slug (V5, unique, URL-safe, populated from name — used by the customer order URL /trucks/[slug]/order), truck_emoji (V5, default 🍕 — used as the Menu tab icon and chosen via the Settings emoji picker), lifetime_discount_pct (V6, integer nullable) and lifetime_discount_note (V6, text nullable) for the Tester plan, paused_until, order_counter (V6.3, int default 0 — no-event fallback display-number counter, see below), and the scraper-preference / adaptive-scheduling columns added in V6.2 (see below).

> **RULE (V6.2)** — trucks.id is **text**, not uuid. Every FK column that references trucks(id) must therefore be declared `text`, NOT `uuid` — this includes scraper_run_log.truck_id and excluded_terms.truck_id below, and the increment_order_counter(p_truck_id text) signature (V6.3). Declaring them uuid will fail the migration (or silently never match). Existing tables already follow this (truck_vans, truck_events, etc.).

### Scraper-preference and adaptive-scheduling columns on trucks (V6.2)

- **scraper_preference** (text, enum 'manual' | 'auto', default 'manual') — whether the operator uploads their schedule themselves or the platform finds events automatically. Governs the scraper bridge (Section 15).
- **schedule_url** (text, nullable) — the operator's own schedule page, used by the self-service Verify flow and the scraper.
- **scraper_rule** (text, enum 'scroll_lazy' | 'scroll_next', nullable) — the winning scrape strategy stored after a successful Verify or run.
- **scraper_last_changed_at** (timestamptz, nullable) — last time the hash of extracted events changed.
- **scraper_update_day** (smallint 0–6, nullable) — the learned day of week on which this truck's schedule most often changes.
- **scraper_learning_complete** (boolean, default false) — set true once the 30-day learning window has elapsed and a day has been learned.
- **scraper_last_empty_notify_at** (timestamptz, nullable) — guards the empty-schedule nudge email to a 14-day resend window.
- **scraper_first_run_at** (timestamptz, nullable) — anchors the 30-day learning window.
- **scraper_last_hash** (text, nullable) — MD5 of the sorted event_date|venue_name pairs from the last run, for change detection.

- **operators** — account holder. first_name, last_name, phone, email, auth_user_id, is_admin (V6, boolean default false), billing.

- **truck_vans** — vehicles under a truck. auto_pause_on_offline, show_cooking_step, kitchen_capacity, display_layout, split_screen, kds_token, name, active, last_heartbeat_at, online_paused_until, paused_until.

- **truck_users** — staff. role (owner/manager/staff), email, name, auth_user_id, invited_at, accepted_at.

- **truck_user_vans** — staff ↔ vehicle access junction.

- **operator_email_changes** — email change audit. old_email, new_email, token, requested_at, verified_at, expires_at.

- **menu_categories** — categories per truck with sort_order (source of truth for display order). allow_notes boolean (V4) for per-category item-note availability. prep_secs, batch_size (nullable — null means no batch limit). is_active boolean (default true) — soft-delete flag; deleted categories set is_active false and MUST be filtered out on read (V6.1, see Section 17).

- **menu_items_db** — items per truck; is_available, stock_count, allergens, dietary_info, prep_secs, batch_size. is_active boolean (default true) — soft-delete flag, filtered on read alongside the category (V6.1).

- **modifier_options** — modifier choices. available boolean (V4) — defaults true; sentinel column for visibility. See Section 17 modifier rules.

- **bundles_db** — deals: bundle_price, original_price, slot_1..6_category, apply_to_new_events, is_available, start/end_time.

- **event_deals** — per-event deal activation: event_id, bundle_id, active, overridden.

- **truck_events** — events: event_date, start/end_time, venue_name, town, postcode, address, notes, status, source, van_id, confirmed_at, offline_protection_override (V6, nullable boolean — null = use van default), latitude/longitude (geocoded), order_counter (V6.3, int default 0 — the per-event display-number counter, incremented atomically by increment_event_order_counter; Section 18a).

- **orders** — order_key (V6.3, uuid, NOT NULL DEFAULT gen_random_uuid(), PRIMARY KEY — the row identity and the ONLY identifier used in any WHERE clause, URL, FK, dedupe, or React key), id (text — the per-event DISPLAY number, "Order #5", restarts at 1 each event, NEVER a lookup key), items (JSONB), deals (JSONB), status, paid_at, collected_at, event_id, van_id, slot. orders.items[i].specialInstructions for item notes (V4). Two partial unique indexes protect display-number integrity: `UNIQUE (event_id, id) WHERE event_id IS NOT NULL` and `UNIQUE (truck_id, id) WHERE event_id IS NULL`. See Section 18a.

- **collection_times / slot_capacity** — fixed slot definitions and per-slot capacity rows.

- **whatsapp_logs** — message_in, classification, events_found, response_sent, possible_miss, customer_number, created_at. (V6.3 — this table's migration was never applied to prod; it does not exist and its writes fail silently. Run the migration before relying on WhatsApp logging — Section 20 / Section 27.)

- **kds_sessions** — active KDS device sessions for multi-device enforcement.

- **discovery_trucks / discovery_events** — scraped discovery data; visibility column controls public/HG exposure. discovery_trucks.hatchgrab_truck_id (FK to trucks.id — text, on delete set null) links a discovery truck to its HatchGrab account; this is what the scraper-to-truck_events bridge matches on (Section 15 / Section 17). Set via the admin console "Link HG truck" dropdown.

- **scraper_run_log (V6.2)** — one row per scraper run per truck for adaptive scheduling (Section 24). Columns: id, truck_id (**text**, FK to trucks.id), run_at (timestamptz), day_of_week (smallint 0–6), events_found (int), events_changed (boolean), rule_used (text). RLS enabled, service-role only (no anon policy). **Pruned to 90 days** by pruneScraperRunLog at the end of every daily workflow — it is the only table that is pruned; truck_events and discovery_events are permanent.

- **excluded_terms (V6.2)** — operator exclusion list for schedule import and scraped-event rejection (Section 15). Columns: id (uuid, default gen_random_uuid()), truck_id (**text**, FK to trucks.id), term (text). Unique constraint on (truck_id, term). RLS enabled, service-role only.

- **upsell_events (planned/unapplied)** — the 20260529_checkout_upsells migration was never applied to prod, so this table does not exist; the fire-and-forget upsell insert in /api/orders/submit has been failing silently. order_id is plain text (no FK). Reconcile before relying on upsell analytics (V6.3, Section 27). As of V6.3 the insert writes order_key as the order reference (future-proof identity) with a comment noting the table is unprovisioned.

- **loyalty_cards (planned)** — V4 spec frozen in lib/plan-features.ts comments. Do not build until instructed.

## Key columns of note

- trucks.plan (starter/pro/max/trial/tester), trial_expires_at, feature_overrides (JSONB), is_test, time_selection_enabled, preferred_contact_method, allow_customer_cancellation, cancellation_cutoff_mins, qr_code_style, lifetime_discount_pct, lifetime_discount_note, order_counter (V6.3, no-event fallback display counter), scraper_preference, schedule_url, scraper_rule, and the scraper_* adaptive-scheduling columns (V6.2, listed above).

- Mirror writes from the scraper land via /api/inbound-schedule; the scraper currently dual-writes to Google Sheets and Supabase (Sheets still the config store — migration to Supabase-only is pre-paying-operator work).

## Order counters and atomic functions (V6.3)

Per Section 18a, display numbers are generated by atomic counters, never by read-max-then-check:

- **truck_events.order_counter** (int, default 0) + **increment_event_order_counter(p_event_id uuid)** → single `UPDATE truck_events SET order_counter = order_counter + 1 WHERE id = p_event_id RETURNING order_counter`. First call returns 1; returns NULL if the event doesn't exist (caller falls back to the truck counter).

- **trucks.order_counter** (int, default 0) + **increment_order_counter(p_truck_id text)** → the no-event fallback. p_truck_id is text because trucks.id is text.

## Migrations (as of June 2026)

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
20260603_menu_is_active.sql
20260603_enable_rls_all_tables.sql
20260604_scraper_preference.sql
20260604_scraper_adaptive.sql
20260604_exclusion_terms.sql
20260607_order_key_per_event.sql
```

### Migration process (V6.2, extended V6.3)

> **RULE** — Migrations are applied manually in the Supabase SQL editor, run in filename order, and followed by `notify pgrst, 'reload schema';` so PostgREST picks up the new columns/tables immediately (otherwise the API keeps serving the old schema cache and new columns 404). New tables must have RLS enabled at creation (see Row Level Security below). Use idempotent (`if not exists`) statements where possible.

> **NOTE (V6.3)** — A full-file paste into the Supabase SQL editor can silently run nothing (the 20260607 migration appeared to "succeed" while applying zero statements). Run large migrations in clearly separated CHUNKS and verify each (PK definition, column existence, function existence) before moving on. The guarded DO-block PK swap in 20260607 is re-runnable.

> **APPLIED-MIGRATIONS DRIFT (V6.3)** — confirmed that 20260529_checkout_upsells.sql (upsell_events) and the whatsapp_logs migration were never applied to prod — those tables do not exist and their writes fail silently. Reconcile the applied-migrations list against the migration files before trial; assume other migrations from that era may also be missing.

### 20260607_order_key_per_event.sql (V6.3)

The order-numbering rebuild migration, applied in chunks. It: dropped the Studio-added messages_order_id_fkey; added orders.order_key (uuid, NOT NULL DEFAULT gen_random_uuid()); swapped the PK from id to order_key via a guarded DO block; added the two partial unique indexes (event_id,id WHERE event_id NOT NULL; truck_id,id WHERE event_id NULL); added truck_events.order_counter + increment_event_order_counter(uuid); re-declared trucks.order_counter + increment_order_counter(text) defensively; and issued the schema reload. The orders/production_slot_usage/messages tables were wiped (all test data) before the swap, so there was no backfill or counter-seeding. See Section 18a.

## Realtime

- orders — INSERT/UPDATE/DELETE subscribed. trucks — UPDATE only (pause/wait). UI updates within ~1s; 60s polling fallback.

## Row Level Security (V6.1, extended V6.2)

RLS is enabled on every table in the public schema. The application is unaffected because all API routes and edge functions use the SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS; the anon key is used only in the browser Supabase clients (lib/supabase-browser.ts, lib/supabase/server.ts, lib/supabase/client.ts) and in a few Server Components that read with the service role. RLS therefore governs only direct anon-key access, closing the Supabase security-advisor warning.

Two policy patterns are used:

- **Public read (anon SELECT allowed, `using (true)`)** — on the tables the customer order page, discovery map, and dashboard realtime read directly with the anon key: discovery_events, discovery_trucks, venues, trucks, truck_events, menu_categories, menu_items_db, modifier_groups, modifier_options, bundles_db, category_modifier_groups, item_modifier_overrides, item_overrides, collection_times, slot_capacity, category_stock, and orders. Writes still go through service-role routes.

- **Service-role only (RLS on, no anon policy)** — anon access fully blocked on the sensitive/internal tables: operators, subscribers, password_reset_tokens, operator_email_changes, truck_users, truck_user_vans, truck_vans, kds_sessions, slot_bookings, production_slot_usage, event_deals, event_price_overrides, upsell_rules, excluded_terms, scraper_run_log, discount_codes_db, messages, order_counters, referrals.

> **RULE (V6.1, reaffirmed V6.2)** — New tables must have RLS enabled at creation. Decide deliberately between a public-read policy (only if an anon-key surface genuinely reads it) and no policy (service-role only). Both V6.2 tables — excluded_terms and scraper_run_log — are internal and are service-role only. Never leave a new table with RLS off. Never expose a sensitive table (anything with personal data, tokens, or billing) to anon.

# 17. Menu API behaviour

- Slug or ID lookup — /api/menu/[truckId] and /api/orders/submit accept slug or UUID. Try slug first (customer URLs), fall back to ID; resolvedTruckId used for subsequent queries.

- No active filter on menu lookup — if the truck exists, the menu returns. Pausing is controlled by dashboard pause state, not the active flag.

- Category data — returns name, prep_secs (nullable), batch_size (nullable), allow_notes (V4) for client-side ASAP and note-input gating.

- Deal stock filtering — customers receive only available deals; ?operator=true returns all deals with stock_warning. Logo URL is derived for the dashboard from logo_storage_path (deriveLogo) in every setTruck path to avoid flicker.

## Dashboard flag (?dashboard=1) — V4

/api/menu/[truckId] accepts a ?dashboard=1 query parameter that changes modifier option behaviour:

- **Without flag (customer-facing)** — modifier options with available === false are filtered out entirely. The available field is not included in the response.

- **With flag (dashboard/operator)** — all modifier options are returned regardless of availability. Each option includes available: o.available !== false so the dashboard stock toggle can read back the persisted state.

The dashboard's fetchMenu must append ?dashboard=1&nocache=${Date.now()}. Customer-facing calls must not.

This fixed two coexisting bugs in V3: (1) the dashboard stock toggle showed stale ON state after refetch because available was stripped from the response and undefined !== false evaluates to true; (2) the operator's Add Order panel was filtering out unavailable modifier options because it called the same endpoint as customers without the flag.

## Modifier availability rule (V4)

> **RULE** — Unavailable modifiers are HIDDEN everywhere — customer page AND operator Add Order panel. This differs from main items which show "Sold out" crossed out.

The reasoning: main items appear in a menu that customers browse; seeing a sold-out item conveys useful information. Modifier options appear contextually inside a popup after the customer has committed to an item; showing an unavailable modifier creates confusion. Operators turning off a modifier already know what they did — no visual indicator is needed in the Add Order panel either.

The filter is opt.available !== false. Shared util: isModifierAvailable in lib/modifier-utils.ts. Applied in:

- components/dashboard/AddOrderPanel.tsx (customise modal).

- app/trucks/[slug]/order/page.tsx (customer modifier popup).

## Item availability resolution

Item availability uses item_overrides as the override path and menu_items_db.is_available as the base:

const isAvailable = override != null ? (override.available !== false) && (stockRemaining === null || stockRemaining > 0) : i.is_available !== false

Stock exhaustion counts as unavailable. Override availability takes precedence over the base column.

## Soft-deleted categories and items must be filtered (V6.1)

> **RULE** — menu_categories and menu_items_db carry an is_active flag (default true). Deleting a category or item sets is_active = false (soft delete) rather than removing the row, so historical orders that snapshot item data stay intact. Every read path that lists current menu data MUST filter `.eq('is_active', true)`. Three queries were missing this filter and leaked deleted categories and items back into the Add Order panel and the Menu & Stock tab; the fix added the filter to:

- app/api/menu/[truckId]/route.ts — the menu_categories query AND the menu_items_db query (the items query was the last gap found).

- app/api/dashboard/route.ts — the menu_categories query.

Historical orders are unaffected: orders.items is a JSONB snapshot taken at order time and never joins menu_categories or menu_items_db, so a past order still shows what was actually sold even after the category is deleted. Any new query that surfaces live menu data must include the is_active filter from the outset.

## Offline protection in the menu API (V6)

When resolving whether to apply online_paused_until for a customer order, the menu API checks the event's offline_protection_override first and falls back to the van's auto_pause_on_offline. Effective rule: offlineProtectionEnabled = eventRow.offline_protection_override (if not null/undefined) else van.auto_pause_on_offline. The pause is only applied when offlineProtectionEnabled is true.

# 18. Customer communications and email

## Provider

> **V3** — Email sends via Brevo (changed from Resend). Operator-facing sender is hello@hatchgrab.com via NEXT_PUBLIC_SUPPORT_EMAIL. Do NOT fall back to villagefoodie.co.uk. The hatchgrab.com domain was added to Brevo at end of session; HatchGrab emails fail until DNS (SPF/DKIM) propagates.

## Order ready email

- Fires only when status changes to "ready"; only if order.customer_email is set (notifyCustomer also guards empty email).

- Subject "Your order is ready"; body includes order number and truck name; sent with truck branding.

## Order confirmation email (V4 updates, venue/contact V6.3)

- Includes venue, contact method, and a cancel link. **As of V6.3 the cancel link is `/order/{order_key}/manage`** — the order_key uuid, with no `?truck=` slug (the slug is no longer needed to disambiguate, and the link is no longer guessable). The customer cancel page is built as of V5 (see Customer cancel page below).

- **Venue and contact details (V6.3)** — both the customer confirmation and the truck-notification copies now include the venue (name / town / postcode) and contact details. Contact details are driven by trucks.preferred_contact_method so the customer is shown the channel the truck actually wants to be reached on. Previously these were missing from the confirmation.

- **No "Discount" line** — the V4 rewrite removed the discount line for deal-driven savings. It was confusing customers because the maths didn't reconcile cleanly. Deals now render as: deal name with bundle price → indented modifier upcharges below → Total. The maths visibly reconciles without a separate discount line.

- **On submit (pending)** the customer receives an "Order #X received" email; **on confirm** an "Order #X confirmed" email. Both go through formatConfirmationEmail + sendConfirmationEmail. The "#X" is the per-event display id (Section 18a).

## Truck notification

- Sent on customer self-order (not manual). WhatsApp on Max, else email. Includes order summary, venue, and dashboard confirm link. (V6.3 — the Twilio WhatsApp order-notification send was removed; the Max WhatsApp path now runs through the Meta Cloud API where wired, otherwise email. See Section 20.)

## Transactional email integrity

- All Brevo sends must check the response and surface failures rather than reporting success silently. Failed verification sends clean up their pending DB row.

### Operator-confirm and slot-change emails use the shared formatter (V5)

> **RULE** — The operator-confirm email (pending → confirmed) and the slot-change email both go through formatConfirmationEmail + sendConfirmationEmail. The two bespoke inline HTML emails that previously handled these — missing modifiers, deals, venue, cancel link, and using Village Foodie instead of HatchGrab branding — were removed. This is a DRY fix (Section 3).

formatConfirmationEmail gained a slotAdjustedFrom param: when set, the email shows an amber "Your collection time has been updated to HH:MM (previously HH:MM)" box and the plain-text fallback mirrors it. The slot-change email passes the original slot as slotAdjustedFrom and the new slot as slot, with the subject "Your order #X has been updated". Both emails inherit the correct "Powered by HatchGrab" branding automatically. The local notifyCustomer() helper is no longer used for confirm or adjust_slot (it remains for reject, cancel, ready, and edit).

> **RULE (V6.3)** — formatConfirmationEmail takes orderKey as a REQUIRED parameter and builds the cancel link from it (`/order/{order_key}/manage`). The old `?? orderId` fallback was removed — a confirmation email that 404s on cancel because it used a display id is worse than a compile error. tsc passing is the guarantee that all five callers pass order_key.

### Customer cancel page (V5, updated V6.3)

The customer-facing cancel page lives at app/order/[id]/manage/page.tsx and loads the order, shows items and status, and offers Cancel subject to cutoff rules. /api/orders/cancel verifies trucks.allow_customer_cancellation, that the order is pending or confirmed, and the cutoff window (computed from the order slot and event date), then removes the order from its production slot and sends a cancellation email. 

> **V6.3** — the route segment value is now the **order_key uuid**, not the per-truck display id, and `/api/orders/[id]` (GET) + `/api/orders/cancel` resolve by order_key. This supersedes the V5 model where order IDs were sequential per-truck and a `?truck=[slug]` query param disambiguated which truck's "order #N" was meant. order_key is globally unique, so no slug is needed, and the cancel link is no longer enumerable (the old sequential id leaked customer name, items, and total to anyone incrementing the URL number). The display id is never used as a lookup key. As of V6 the cutoff for ASAP orders (no slot) falls back to the event end_time (Section 6).

## 18a. Order numbering — the two-id architecture (V6.3)

> **CRITICAL ARCHITECTURE — do not undo.** Orders carry TWO identifiers with opposite jobs. Conflating them caused the 6 June duplicate-key outage that took customer ordering fully down (Vercel 23505, duplicate key on orders_pkey). A future session must never reintroduce `id` into a WHERE clause, nor collapse the two fields back into one.

### The two identifiers

- **order_key** (uuid, NOT NULL DEFAULT gen_random_uuid()) — the row identity and the PRIMARY KEY. EVERY lookup, update, WHERE clause, URL parameter, foreign-key reference, dashboard dedupe Map key, and React key uses order_key. It is NEVER shown to a human.

- **id** (text) — the DISPLAY number only ("Order #5"). It restarts at 1 for each event. It is rendered to humans (order cards, KDS header, email subjects, toasts) and NEVER appears in a WHERE clause, key, or URL after V6.3.

> **RULE** — `order.id` in a WHERE clause / as a key / in a URL is a bug. `order.order_key` rendered to a human is a bug. A new order fetch must select order_key (use `select('*')` or include it explicitly) so it is available as the key everywhere.

### Why two ids — the original bug

The orders PK was GLOBAL on `id` alone. nextOrderId checked only `eq('truck_id')`, so it generated an id that was free for this truck but already taken by another truck's row, colliding on the global PK. An atomic counter existed (migration 20260529_order_counter) but was never wired. The two-id split fixes the collision class permanently: order_key (uuid) is globally unique row identity; id is only ever a per-scope display number, protected by partial unique indexes rather than a global PK.

### Per-event restart and the atomic counter

Display numbers restart at 1 per event because the operator calls "order 5" at the hatch — a low per-event number is clearer than a truck-lifetime running total. (This supersedes the older per-truck-sequential model that Section 18 described before V6.3.) Numbering is generated by an atomic counter, never by a read-max-then-check (that racy pattern was the original bug):

- truck_events.order_counter (int, default 0) + increment_event_order_counter(p_event_id uuid) — a single `UPDATE … SET order_counter = order_counter + 1 … RETURNING order_counter`. First call returns 1. Returns NULL if the event doesn't exist (e.g. cancelled mid-order) — the caller then falls back to the truck counter.

- trucks.order_counter (int, default 0) + increment_order_counter(p_truck_id text) — the no-event fallback. Note p_truck_id is text because trucks.id is text (Section 16).

- nextOrderId(eventId, truckId) in lib/order-utils.ts calls the event RPC first, falls back to the truck RPC, and returns the bare integer as a string ("5", never "0005"). A single code path generates the number, so the text partial-unique index can never see "5" vs "0005" for one event. The old 10-attempt clash loop is gone; the DB serialises, so there is no client-side retry.

### Display format

Display numbers are bare integers ("5"), not zero-padded ("0005"), everywhere — single code path, single format.

### Uniqueness

Two partial unique indexes protect display-number integrity (the PK is order_key alone):
- `UNIQUE (event_id, id) WHERE event_id IS NOT NULL` — per-event numbering.
- `UNIQUE (truck_id, id) WHERE event_id IS NULL` — the no-event fallback sequence.

### Bulk operations and dedupe

- Event cancellation bulk-cancels by order_key (`.in('order_key', …)`), never by id — an id-list `.in('id', …)` would cancel the same-numbered order across every other event (a corruption bug found and fixed in this rebuild — Section 15).
- The dashboard payload dedupes with `Map.set(o.order_key, o)` — keying by id would silently drop one of two same-numbered orders from different events.

### messages.order_id

messages is a log; messages.order_id stores the display id as plain text with NO foreign key (a Studio-added messages_order_id_fkey was dropped in 20260607 — a log row must never block an order deletion). It is a non-authoritative debugging field, never a lookup key. It is currently written null by every live path (logMessage callers pass no order id, and the Twilio order-notification that once populated it was removed — Section 20).

# 19. Reports tab (V4)

The Reports tab is the operator's reconciliation and analytics surface in the Manage page. Built in V4 with tier-gated functionality — Starter gets the operational minimum, Pro and Max get analytical insights.

## Tier gating

- **Starter** — Event filter only. filterMode is forced to 'event' on mount; the Date range toggle is hidden entirely. No auto-load on mount — the operator must select an event. CSV export available. Order list and Items view available.

- **Pro / Max / Trial / Tester** — Full filter toggle (Date range and Event), revenue breakdown, items sold ranking, deal performance, hourly sales patterns (planned), event ROI comparison (planned).

Date-range gating uses canAccess('advanced_reporting', ...). advanced_reporting is in PRO_FEATURES which spreads into MAX_FEATURES and TRIAL_FEATURES (and the Tester feature set, which mirrors Max).

## Why CSV export is not Pro-locked

Square's free tier offers CSV export, so locking it on Starter would put us below the competition on a key practical feature. The right tier line is

*raw data = Starter, analysed insights = Pro*

CSV is raw data; revenue breakdowns and rankings are insights. CSV export is therefore available on all tiers including Starter.

## Toolbar layout

Single row, fixed positioning:

[filter controls — 320px min-width] [View report] [📋 Orders] [📦 Items] → ml-auto → [⬇ Export CSV]

- Filter container has minWidth: 320px and flex-shrink-0 so the row never shifts when switching between Date and Event modes.

- Event dropdown has w-[320px] to fill the container.

> **RULE** — Use invisible (CSS visibility:hidden), not hidden (display:none), on Export CSV and the Orders/Items toggle when no results are loaded. This reserves space and prevents layout shift in fixed toolbars.

## Items view

Same columns as Orders view for spreadsheet consistency:

#OrderID Date Event Time Type Customer Item name ×Qty Unit price Modifiers Item total

- Order ID repeats on every item row from the same order. (This is the per-event display id — a human-readable reference for reconciliation, not order_key.)

- border-t border-slate-100 between different orders, not between items within the same order.

- Deal items prefixed 🎁 with the deal name as smaller muted text on a second line.

- "Modifiers" column uses text-slate-300 for the dash when none — lighter than other muted text.

## Shared column class constants

Defined once at the top of the Reports component; both Orders and Items views import them. Never inline the same Tailwind string twice.

```
const colId    = 'font-mono text-slate-400 flex-shrink-0 w-10'
const colDate  = 'text-slate-400 flex-shrink-0 w-10'
const colVenue = 'text-slate-500 flex-shrink-0 w-24 truncate hidden sm:block'
const colTime  = 'text-slate-400 flex-shrink-0 w-10'
const colType  = (online) => `flex-shrink-0 w-14 font-medium ${online ? 'text-blue-600' : 'text-slate-500'}`
const colCust  = 'text-slate-600 flex-shrink-0 w-16 truncate'
const colTotal = 'font-medium text-slate-900 flex-shrink-0'
const colMuted = 'text-slate-400 flex-shrink-0'
```

## Order type heuristic

customer_email IS NULL → 'Placed by truck' (walk-up); else 'Customer online'. This is a heuristic — the long-term fix is an orders.source column. TODO comments are in app/api/orders/submit/route.ts and app/api/dashboard/action/route.ts. Do not introduce more callers of this heuristic; migrate when the column is added.

## Revenue calculation

- Status filter excludes 'cancelled' and 'rejected' from totals. Cancelled orders still appear in the list with opacity-50 so the operator can see them.

- Revenue breakdown (Pro) is positive-framed: Base items + Deal revenue + Modifier upcharges. No "Discount" line — confusing to operators (same reasoning as the customer email change).

## Pro placeholder card (Starter view)

Shown to Starter users where the breakdown analytics would appear:

*Date range reporting, revenue breakdown, deal performance, items sold ranking, hourly sales patterns, and event ROI comparison. Available on Pro and Max.*

# 20. Social media and WhatsApp auto-replies

## Four-bucket classification (V6.3)

The classifier (lib/whatsapp-classifier.ts) routes inbound messages into four buckets:

- **SPECIFIC_QUERY** — schedule/location/date/availability → auto-respond with matching event(s).

- **MENU_QUERY** — menu/prices/ordering → auto-respond with a live DB menu summary and the order link.

- **ALLERGEN_QUERY** — allergen/dietary → respond with DB allergen info AND a mandatory safety caveat (never assert an item is safe; direct the customer to confirm with the truck before ordering).

- **IGNORE** — spam/gibberish → no response.

(This replaces the V3 three-bucket model — the prior GENERAL_QUERY bucket is split into MENU_QUERY and ALLERGEN_QUERY so allergen questions always get the safety caveat.)

## Event lookup

- WhatsApp handler queries truck_events for the truck (resolved by whatsapp_sender), confirmed/open/unconfirmed, from today forward.

- Be generous — any message mentioning tomorrow/tonight/a weekday/this week/weekend/a village should classify as SPECIFIC_QUERY.

- Don't rely on the LLM to infer dates: inject an explicit DATE REFERENCE mapping (Today/Tomorrow/weekday = exact YYYY-MM-DD) and label events (TODAY)/(TOMORROW)/(IN 2 DAYS). Include town so location queries match.

- If the asked-about day has nothing but there are nearby upcoming events, mention them ("Nothing tomorrow but we're in Wickhambrook on Friday").

## Interaction logging

- Every interaction logs to whatsapp_logs (message_in, classification, events_found, response_sent, possible_miss). Logging is fire-and-forget — it must never break the response. (V6.3 — whatsapp_logs does NOT exist in prod; its migration was never applied, so logging is silently failing. Run the migration before relying on the message-review data — Section 16 / Section 27.)

- possible_miss = SPECIFIC_QUERY with events_found = 0 — a likely wrong answer to review.

- Reports tab surfaces totals, answered, and possible misses (amber when > 0). This is the foundation for a future truck-facing "Recent messages" review panel with flagging.

## Provider — Meta Cloud API (V6.3, replaces Twilio)

> **RULE** — WhatsApp now runs on the Meta Cloud API, not Twilio. Twilio required trucks to surrender their existing phone number; the Meta Cloud API lets them keep it and covers WhatsApp / Messenger / Instagram in one integration (free under ~1000 conversations/month). The live handler is app/api/webhooks/meta/whatsapp/route.ts (GET verify challenge + POST classifier pipeline); the send helper is lib/meta-whatsapp.ts (sendMetaWhatsApp). The Meta app sits under the Village Foodie Meta Business Account (the HatchGrab Facebook page is advertising-restricted; messaging APIs are unaffected; migrate to a HatchGrab Ltd account later — one-click, no code change). Env: META_WHATSAPP_APP_SECRET, META_WHATSAPP_PHONE_NUMBER_ID, META_WHATSAPP_ACCESS_TOKEN (permanent System User token), META_WEBHOOK_VERIFY_TOKEN, META_WHATSAPP_BUSINESS_ACCOUNT_ID.

> **RULE** — The Twilio handler at /api/webhooks/whatsapp is DORMANT, not deleted (kept as a fallback/demo until Meta is fully live). Do not overwrite it. The Twilio order-notification send was removed from /api/orders/submit (operators get the order by email anyway — no per-message cost); formatWhatsAppOrder is now dead code, delete when Twilio is formally retired (Section 27).

> **PENDING (V6.3)** — the four-bucket smoke tests have NOT been run; the lib/whatsapp-classifier.ts service-role-key usage is unconfirmed; and whatsapp_logs does not exist in prod (Section 16), so logging is silently failing. Run the migration and the smoke tests before relying on WhatsApp at trial.

## Platform compliance and tone

- Build on the official Meta Graph / Cloud API (not scrapers); stay within the 24-hour window; customer initiates. Rate limits are irrelevant at food-truck scale.

- Full villagefoodie.co.uk / hatchgrab.com URLs — no shorteners (Meta deboosts them).

- Responses sound like the owner typed them — warm, casual, truck name and emoji where appropriate ("Hey! 👋 … — {truckName} {emoji}"). A confidence threshold routes uncertain messages to review rather than auto-responding.

- Tier mapping: Instagram and Messenger are Pro; WhatsApp is Max only (per-message cost).

### Meta webhook endpoints (V5 scaffolded, WhatsApp wired V6.3)

Verification + webhook endpoints exist for the three Meta channels: /api/webhooks/meta/whatsapp, /api/webhooks/messenger, and /api/webhooks/instagram. Each handles the GET verification challenge (returns the raw hub.challenge string) and a POST. **As of V6.3 the WhatsApp POST is fully wired** to the four-bucket classifier pipeline and the Meta send helper; Messenger and Instagram POSTs still only log and return 200 (classifier wiring TODO). They must always return 200 to Meta. The shared verify token is META_WEBHOOK_VERIFY_TOKEN (Vercel env).

Build order is Messenger → Instagram → WhatsApp (WhatsApp now done). Messenger/Instagram remain parked: per-truck OAuth Page tokens, token storage (ENCRYPTION_KEY / lib/crypto.ts — AES-256, chosen over Supabase Vault on the free tier), send API, and classifier wiring are deferred. App review will need privacy-policy and terms pages (Section 27).

# 21. Competitive positioning

## Hatches Up cost model

Hatches Up charges 4.5% + 20p all-in on online orders (includes card processing) and 1.5% + 10p for in-person. No subscription fee. Their public positioning is vague on reporting features, but at their volume they almost certainly have date-range filtering, item breakdowns, and CSV export — assume their Starter-equivalent is feature-comparable on raw data access.

## Real differentiators

- Offline protection (auto-pause on signal loss); smart queue-aware pacing; social/WhatsApp auto-responses; ticket printing (Max); multi-device sync (Max); time slot selection; auto-accept; village-specific hyperlocal discovery.

- Digital loyalty stamp cards (Max, coming soon) — the stickiness lever once stamps are earned, churn drops to near zero.

## Honest comparison rule

> **RULE** — When pitching against Hatches Up, be transparent about all costs. Do not lead with a misleading "4.5% vs 0.99%". Honest framing: "Hatches Up is 4.5% all in. We are £29/month plus 0.99% plus card processing. Above ~£1,750/month online orders we are cheaper, and you get features they do not have."

- Discovery is a supporting argument, not the lead, until the subscriber base reaches scale. Lead with features; price closes.

- Migration pitch: "Currently on Hatches Up? Switch and get 3 months free on any tier."

# 22. Development process

> **OPERATOR PREFERENCE** — When presenting any code or file, the file path must appear immediately above it as path/to/file.tsx in bold inline code. Never make Dominic scroll up to find which file to update.

## Two-chat pattern

- **Planning chat (Claude)** — strategy, UX, architecture, instruction writing. Does NOT write code. Claude within Cursor is the coding tool (V6); the planning chat writes Cursor-ready prompts.

- **Coding chat (Claude within Cursor)** — implementation, file edits, smoke tests. Does NOT make strategic decisions.

- Instructions flow planning → coding; audit reports flow coding → planning. Audits can be sent to Cursor for a summary response rather than always pasting grep output back (V6).

## Audit before build

- Read relevant files and paste excerpts; identify duplications/conflicts; confirm DRY; only then implement.

## Smoke tests

- Every change includes a smoke test: the action to perform, expected behaviour, and edge cases. Nothing is "done" without an operator-confirmed smoke test.

> **NOTE (V6.3)** — A passing data-layer / RPC smoke test is NOT the same as an operator-confirmed live test. The order-key rebuild passed 9/9 smoke tests against the live DB and RPCs, but the React keys, toasts, and action buttons were only type-checked and logic-verified — never clicked on a real device. A live iPad click-through is still outstanding and gates the trial (Section 26 / Section 27).

## Context limit handling

- When a chat hits its limit, open a fresh one, re-prime with file paths and the task, reference this manual, and never assume the new chat knows prior decisions. Image limits in long chats are a sign to split work to the coding chat or start fresh.

## Always-mounted tab pattern (V6.2, extended V6.3)

> **RULE** — A tab or panel that receives cross-tab props (or that another surface needs to drive — e.g. the Verify flow opening the import modal on the Settings tab, Section 15) must be **always mounted**, not conditionally rendered on `activeTab === '…'`. Conditional mounting destroys the component's state and effects every time the operator switches away, which breaks cross-tab interactions, re-fires data loads, and (in the case of the Add Order panel) loses the in-progress basket.

The pattern:

- The component is always in the tree and takes an `isActive` boolean prop; it is visually hidden when inactive, never unmounted.
- Data-loading effects inside it are guarded so they only run when active: `useEffect(() => { if (!isActive) return; … }, [isActive, …])`. This keeps the component mounted (state preserved) while still deferring its fetches until it is shown.
- **Modals are rendered OUTSIDE the `isActive` gate** so they can be opened from another tab. The import/verify modal, for example, is mounted regardless of which tab is visually active, so the Settings-tab Verify button can open it without a tab switch.

Components on this pattern: the **Schedule** and **Settings** tabs (the self-service Verify flow needs the import modal openable from Settings — V6.2) and the **Add Order panel** (so the basket survives a tab switch — V6.3, Section 10). It is the standard for any new cross-talking tab or any panel holding in-progress user input.

## Shared schedule-extraction utility (V6.2)

> **RULE** — lib/schedule-extract.ts is the single in-repo home for Gemini schedule extraction (Section 3). Any new route that turns text or an image into structured event rows MUST import buildScheduleExtractionPrompt / extractScheduleEvents (and the exclusion helpers normaliseExclusionTerm / isExcluded) from there — never re-implement the prompt, the retry loop, or the parsing. The only remaining independent copies are the two Google Apps Script paths, which cannot import the TypeScript module until the Sheets→Supabase migration (Section 25 / backlog).

## SQL migrations (V6.2, extended V6.3)

- Run migrations in the Supabase SQL editor, in filename order; confirm clean before deploying. Use "Claude"-authored, idempotent (`if not exists`) migrations where possible.
- **After running, issue `notify pgrst, 'reload schema';`** so PostgREST refreshes its schema cache and the new columns/tables are immediately visible to the API (Section 16).
- New tables get RLS enabled in the same migration (Section 16, Row Level Security).
- **Run large migrations in CHUNKS, not as one full-file paste** — a single paste can silently apply nothing (Section 16, the 20260607 note). Verify each chunk (column exists, PK is correct, function exists) before the next.
- **Keep an applied-vs-file reconciliation** — drift is real (upsell_events and whatsapp_logs were never applied; Section 16 / Section 27).

# 23. Mobile UX patterns (V4)

Operator-facing mobile patterns established across the dashboard and manage pages. Apply consistently — any new operator-facing page must match these patterns.

## Dashboard avatar dropdown

The mobile dashboard avatar dropdown contains everything the operator needs without leaving the page. Five header rows on the dashboard were reduced to three: top branding row, tab row, and a slim mobile event bar (sm:hidden) showing "● venue · time · ···" with a modal for +30 min, Close early, and Cancel event. The dropdown order is canonical (see Section 3, Single dropdown component).

## Manage page avatar dropdown

Uses the same UserMenu component with showDashboardLink=true. The mobile-only "← Orders dashboard" link is included; on desktop it is wrapped in sm:hidden because the page header already has it (avoiding duplication). The chevron is always visible on the avatar.

## Menu tab header (mobile)

Three rows for clarity at 375px:

- Row 1: "Menu" heading left + "+ Add category" orange button right.

- Row 2: "N categories · N items" muted subtext.

- Row 3: "✨ Import menu" outline button (full single line, whitespace-nowrap, no subtitle). (V6.1 — renamed from "Import with AI".)

Desktop is unchanged — Import menu lives in the right column alongside Add category with the "photo, PDF or text" subtitle visible. Subtitle is hidden sm:block. The Schedule tab's "✨ Import schedule" button mirrors this styling (V6).

## All categories collapsed by default

On Manage page open, all menu categories initialise collapsed (expandedCat = null). The previous default (first category auto-expanded) was disorienting on a page with multiple categories. Operators tap to expand whichever they want to edit.

## invisible vs hidden for layout-reserved elements

> **RULE** — When a button or control is conditionally shown but its absence would cause layout shift in a fixed toolbar, use invisible (CSS visibility: hidden) which reserves space, not hidden (which removes the element). Applied in the Reports toolbar for the Export CSV button and Orders/Items toggle when no results are loaded.

## Identity block in dropdowns

Truck name bold (text-slate-800 font-semibold), operator first name muted below (text-slate-400). First name is derived from currentUserName.split(' ')[0]. Van name is NOT included — it was confusing and added no value. Truck name + operator first name is sufficient.

### Preventing iOS Safari auto-zoom (V5)

> **RULE** — Inputs, selects, and textareas must be at least 16px on mobile. iOS Safari zooms the viewport whenever a focused field has font-size below 16px. globals.css locks these controls to 16px below the 640px breakpoint and reverts to inherit at ≥640px so desktop is untouched.

The viewport is set in app/layout.tsx as width=device-width, initialScale=1 — deliberately WITHOUT maximumScale or userScalable:false, which would break accessibility pinch-zoom. The 16px-input rule is the correct fix for the focus-zoom annoyance (especially on the customer order page); viewport scale locking is not.

### V6.1 manage-page UX pass

A round of manage-page consistency and mobile fixes:

- **Settings tab is a single centred column** — max-w-2xl mx-auto. A two-column desktop experiment was tried and reverted as worse UX (the eye had to track across unrelated fields). Heading hierarchy was standardised across the whole tab: section labels text-base font-bold text-slate-800, feature/toggle labels text-sm font-semibold text-slate-800, descriptions text-xs text-slate-500. The auto-accept control was converted from the standalone Toggle component to an inline button matching the other toggles.

- **Expand/collapse arrows unified** — every collapsible header (schedule deals, past events, menu categories, modifier/Extras groups) uses the same ▶ glyph rotated 90° when open (rotate-90 transition). No mix of ▶/▼/＋/－ across surfaces.

- **Category delete relocated** — the 🗑 control was removed from the collapsed category header and now lives inside the expanded category view, and the entire collapsed header row is the tap target to expand. This fixes accidental deletes from fat-finger taps on mobile.

- **Category row goes two-line on mobile** — the prep-time and batch-size controls move to a second row on narrow screens (the top row is hidden sm:flex, the duplicated second row is flex sm:hidden) so the category name and actions are not cramped at 375px.

- **Upsells rule dropdowns stack on mobile** — the Extras & Upsells rule selectors are flex-col on mobile and flex-row at sm:+.

- **Mobile schedule actions** — Copy/Edit/Cancel show as icons only below sm: and gain text labels at sm:+.

### Text prominence floor (V6 sweep)

A dashboard contrast sweep bumped muted UI text up to the contrast floor: slate-700 body, slate-500 secondary, slate-400 decorative only; orange reserved for current-plan/active highlights. Genuinely decorative or intentionally-muted lines (the refresh timestamp, "tap to close", the closed badge, "No event selected" event-bar label, the "Done" stat label) stay muted. Apply the floor to any new operator surface.

# 24. Scraper workflow (V6, updated V6.2)

The web scraper runs as a GitHub Actions workflow, .github/workflows/daily_scrape.yml (separate from the Apps Script screenshot/email processor):

- **Node 24 (V6.2).** Earlier versions pinned Node 22 because Node 20 lacked native WebSocket support, which @supabase/realtime-js requires (it threw "Node.js 20 detected without native WebSocket support"), and an earlier attempt at Node 24 had hit the actions/checkout and actions/setup-node deprecation path plus Puppeteer Chrome issues. As of V6.2 the workflow runs on **node-version: '24'**: the forced action-runtime Node 24 migration has effectively landed (see the NOTE below) and the Puppeteer Chrome issues that blocked the earlier bump have been resolved on Puppeteer 24.x. Node 24 has native WebSocket.

- **Chrome install** via npx puppeteer browsers install chrome (with the cache cleared first: rm -rf ~/.cache/puppeteer/chrome) so a cached node_modules layer without the actual Chrome binary doesn't break the run.

- Schedule: cron '0 6 * * *' plus workflow_dispatch for manual runs. Secrets: SPREADSHEET_ID, GEMINI_API_KEY, GOOGLE_SHEETS_CREDENTIALS, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

- **Gemini quota** — the free tier capped gemini-2.5-flash-lite at ~20 calls/day; the project is now on a paid Gemini plan so quota is no longer the limiter. The HatchGrab loop and lib/schedule-extract.ts both use gemini-2.5-flash (not lite — see Section 3 / Section 24 Apps Script rules).

- The Apps Script processor remains subject to the 6-minute execution limit — a time guard is still needed (backlog).

> **NOTE (updated V6.2)** — actions/checkout@v4 and actions/setup-node@v4 emit a Node 20 deprecation warning, and from 16 June 2026 GitHub forces Node 24 for the action runtime itself. The workflow's own `node-version` is now '24' to match; bump the action major versions (checkout/setup-node) as they release Node-24 builds. The runtime forcing is independent of the `node-version` the workflow installs.

## Adaptive scraper scheduling (V6.2)

The scraper learns each truck's update rhythm so it doesn't hammer every site every day. State lives on the trucks scraper_* columns (Section 16) and in the scraper_run_log table.

### scraper_run_log

One row is appended per truck per run: truck_id (text), run_at, day_of_week (0–6), events_found, events_changed, rule_used. RLS service-role only. **It is pruned to 90 days by pruneScraperRunLog at the end of every daily workflow** — it is the ONLY table pruned. truck_events and discovery_events are permanent reporting records and must never be pruned (Section 27 backlog reiterates this).

### shouldRunToday(truck)

Decides whether a given truck is scraped on today's run:

- **During the learning phase** — the first 30 days from scraper_first_run_at, OR whenever scraper_learning_complete is false / no scraper_update_day has been learned — it returns **true every day** (gather data).
- **After learning** — it returns true only on the learned scraper_update_day and the **two days following** it (learned day, +1, +2), catching late updates around the day the truck usually changes its schedule.

### recordRunAndLearn

Called after each truck's scrape:

- Inserts the scraper_run_log row for this run.
- Once 30 days have elapsed since scraper_first_run_at, analyses the **90-day** run history to find the day_of_week with the most runs where events_changed = true, writes it to scraper_update_day, and flips scraper_learning_complete to true.

### Hash-based change detection — hashEvents

Computes an MD5 over the sorted list of `event_date|venue_name` pairs from this run's extracted events. If it differs from scraper_last_hash, events_changed is set true for the log row and scraper_last_changed_at is updated; the new hash is stored in scraper_last_hash. This is what feeds the learning analysis above — "changed" means the schedule content actually moved, not merely that the scraper ran.

### Empty-schedule nudge — checkEmptySchedule

When a run finds zero future events for a truck, a nudge email is sent to the **operator's** email address (not customer-facing), suggesting they upload or check their schedule. A **14-day resend guard** via scraper_last_empty_notify_at prevents repeat nagging. The send is fire-and-forget — it must never block or fail the run. (Seasonal suppression after repeated unanswered nudges is on the backlog, Section 27.)

### Single-truck mode

For targeted testing/operations:

- The **SCRAPE_TRUCK_ID** env var filters hgTrucks to a single truck and **bypasses shouldRunToday** (so the targeted truck always runs regardless of its learned day).
- workflow_dispatch exposes a **scrape_truck_id** input so a manual run can target one truck from the Actions UI.

> **PENDING DIAGNOSIS (V6.2)** — a recent scraper run took ~23 minutes before failing (normal runs are far shorter). The likely causes are a Gemini rate-limit stall or a hung Puppeteer navigation on a slow/unresponsive site without a hard per-site timeout. Add a per-site navigation timeout and a per-call Gemini timeout, and confirm on the next Node 24 cron run.

## Apps Script screenshot processor (recovered V6.1)

The Google Apps Script processFoodTruckScreenshots function reads schedule screenshots from a Drive folder and writes events to the discovery map (full pipeline in Section 25). V6.1 fixes (still current):

- **Model is gemini-2.5-flash, not gemini-2.5-flash-lite.** Lite was cheaper but produced day-of-week→date errors and mis-extractions on dense screenshots. Flash is the required model for this path.

- **14-day date mapping** — the prompt injects an explicit "today + next 13 days → DD/MM/YYYY" reference table before processing, so relative phrases ("this Friday", "Sat") resolve correctly.

- **Invalid-venue filter** — extracted rows whose venue resolves to "Closed", "N/A", "TBC", "Unavailable", or "Cancelled" are skipped, not written.

- **dbVilNorm typo fixed** — a dbVilNng → dbVilNorm typo in the venue-normalisation matching was silently breaking some venue matches.

> **RULE (V6.1) — API key management.** The Apps Script holds four Script Properties: GEMINI_API_KEY, GOOGLE_API_KEY (use the "New Maps Platform API Key" with the full API set enabled), BREVO_API_KEY, and INBOUND_SCHEDULE_SECRET. After ANY key rotation or Google Cloud account change, update the Script Properties AND the separate GitHub Actions repository secret copy of GEMINI_API_KEY, then run testAllKeys() to confirm all four resolve. A silent missing key takes down geocoding, email, and screenshot processing with no error surfaced — this was the root cause of the V6.1 pipeline outage (see Section 25).

> **DRY NOTE (V6.2)** — the in-repo extraction paths (process-schedule, verify-schedule-url, the GitHub Actions HatchGrab loop) now all import from lib/schedule-extract.ts. The two Apps Script paths above (processFoodTruckScreenshots, analyzeEmailWithGemini) remain independent copies and still need prompt changes applied by hand until the Sheets→Supabase migration lets them move in-repo (Section 3 / Section 25 / backlog).

# 25. Village Foodie Discovery Map

## Architecture

The Village Foodie public site (villagefoodie.co.uk) is a Next.js app in the same repo as HatchGrab. Its discovery map reads from the discovery_events and discovery_trucks tables in Supabase, with coordinates resolved through venues.

> **CRITICAL** — A discovery event only plots as a map pin if it has BOTH a discovery_truck_id and a venue_id. The map JOINs through venue_id to the venues table for latitude/longitude; an event with a null venue_id (or null discovery_truck_id) has no coordinates and silently fails to appear. This was the root cause of the V6.1 "events not showing on the map" outage — rows were being written with null IDs.

The venues table is the single coordinate store: name, village, latitude, longitude, and an aliases column (a PostgreSQL text array) for fuzzy name matching.

> **UNIQUE CONSTRAINT (V6.2)** — the venues uniqueness key is **(name, village)**, not name alone. Two different villages can legitimately have a venue of the same name (The Bell, The Fox, The Plough…), so upserts MUST use `onConflict: 'name,village'`. Using name alone collapses distinct pubs into one row and mis-pins events.

## Data sources

Three independent pipelines write to discovery_events, all of them POSTing to the secret-authenticated /api/inbound-schedule route:

1. **processFoodTruckScreenshots** (Google Apps Script) — processes schedule screenshots saved to the Drive folder SOURCE_FOLDER_ID (see Section 24 for model and prompt rules).

2. **processVendorEmails / analyzeEmailWithGemini** (Google Apps Script) — processes vendor schedule emails (the schedule@villagefoodie.co.uk inbox / "Process Schedule" Gmail label).

3. **GitHub Actions web scraper** — scrapes truck websites and Hatches Up on the daily cron (Section 24).

## inbound-schedule route — ID resolution (V6.1)

As of V6.1 /api/inbound-schedule resolves the foreign keys at insert time rather than storing raw name strings:

1. Fetch all discovery_trucks and all venues up front in a single Promise.all.

2. Normalise the incoming truck_name and venue_name (lower-case, trim, strip punctuation) and match against the fetched rows, including the venue aliases array.

3. Write the matched discovery_truck_id and venue_id onto the upserted discovery_events row, with visibility 'public'.

Earlier versions stored only the raw truck_name and venue_name strings, leaving discovery_truck_id and venue_id null — so most events never plotted. Existing null rows were backfilled with a one-off SQL pass (regexp-normalised name matching) that resolved ~862/881 truck IDs and ~843/881 venue IDs; the small remainder were genuine one-off venues (festivals, private parties) that will not recur.

### Venue-matching bug — common pub names (V6.2)

> **KNOWN BUG (on backlog)** — name-only matching mis-pins venues whose names recur across villages. "The Bell", "The Fox", "The Bull", "The Plough", "The Red Lion" etc. match the FIRST same-named venue in the table regardless of which village the event is actually in. The fix is **village-aware matching** in inbound-schedule: match on name **+ village** combined first, and only fall back to name-only when there is no village or no combined match. Until that lands, mis-pins are corrected by hand in SQL (see the V6.2 data fixes below).

### V6.2 venue data fixes (run manually in the SQL editor)

A batch of village-aware corrections was applied directly:

- **Pizzeria Gusto's Saturday event re-pointed** to The Five Bells, Cavendish (id 6e23389e-4d1c-405b-be22-7cc39bbd558f; 52.0876415, 0.6324885), and the Five Bells alias set was extended.

- **Eight venues added** with coordinates and aliases: Market Square Bildeston (52.1075, 0.9081), The Fox Burwell (52.2800, 0.3248), The Bell Bottisham (52.2050, 0.2750), The Bell Great Paxton (52.2606, -0.2282 — the scraper mislabels this "The Bull Pub", so "The Bull Pub Great Paxton" was added as an alias), The Plough Birdbrook (52.0419, 0.4870), The Bell Inn Castle Hedingham (51.9927, 0.6025), The Lion Stoke by Clare (52.0624, 0.5383), and The Red Lion Great Sampford (51.9925, 0.3927).

- **52 events were re-pinned** to the correct venues.

- **Wrong venue_ids were nulled** where the correct venue was not yet in the table — the events still show in the operator's list, they just won't plot on the map until the next scraper run resolves them against the now-present venue.

## Apps Script key rules

See the API-key RULE in Section 24 — four Script Properties (GEMINI_API_KEY, GOOGLE_API_KEY, BREVO_API_KEY, INBOUND_SCHEDULE_SECRET) plus a separate GitHub Actions copy of GEMINI_API_KEY, verified with testAllKeys() after any rotation. INBOUND_SCHEDULE_SECRET is fixed and only changes if regenerated in the Next.js env.

## processFoodTruckScreenshots details

- Model gemini-2.5-flash (not lite); 14-day date-mapping reference injected into the prompt; invalid-venue filter ("Closed", "N/A", "TBC", "Unavailable", "Cancelled").

- Pacer: a 15-second sleep between files to stay under burst rate limits.

- Time guard: exits safely at ~280 seconds (well inside the 6-minute Apps Script execution ceiling).

- On success: events are written to the Google Sheets Events tab, mirrored to Supabase via mirrorEventsToSupabase() (which calls /api/inbound-schedule), and the processed screenshot file is trashed.

## Venue matching and creation

- A new venue is geocoded via the Google Maps API on creation and stored with name, village, latitude, longitude, and an aliases array. Upserts use onConflict 'name,village' (V6.2).

- Aliases drive fuzzy matching — e.g. the alias {"Edwardstone White Horse"} on the canonical venue "The White Horse", Edwardstone lets a differently-worded source row match the right venue rather than creating a duplicate.

- The Google Sheets Venues tab holds aliases in columns N/O/P for the Apps Script's own matching; these are SEPARATE from the Supabase aliases array and must be kept in step (adding a Supabase alias does not update the Sheet, and vice versa).

- backfillMissingVenueCoords() geocodes any venue rows created without coordinates.

> **DATA HYGIENE (V6.1)** — Two recurring issues to watch: (1) the same event arriving from two pipelines with a one-day date offset (e.g. a screenshot vs the website scraper) creates a near-duplicate — dedup on truck + date + venue; (2) duplicate venue rows with slightly different names (e.g. "Edwardstone White Horse" vs "The White Horse, Edwardstone") split a venue's events — merge to the canonical row and add the variant as an alias in BOTH Supabase and the Sheet.

## Visibility

- discovery_events default to visibility = 'public'; there is no status column — every public event shows on the map.

- RLS (V6.1, Section 16): public SELECT policies on discovery_events, discovery_trucks, and venues; writes are service-role only via /api/inbound-schedule.

- is_test on the linked truck still filters test trucks out of the public map (Section 25 / is_test scope, carried from V5).

## Known DRY gap

process-schedule/route.ts now imports lib/schedule-extract.ts (V6.2 — see Section 3), but processFoodTruckScreenshots and analyzeEmailWithGemini still implement the same Gemini schedule-extraction logic independently in Apps Script. Prompt improvements must still be applied to those two by hand. Long-term: consolidate fully by migrating the Apps Script processing off Google Sheets onto Supabase as the config store, then move those paths in-repo behind the shared utility.

# 26. Testing and dev environment

## Dev setup

- localhost:3000 for local testing. Test Kitchen test truck (dashboard_token test-abc123def456, id test-truck, slug test-kitchen, is_test true).

- iPad Air simulator for KDS; Safari responsive mode at tablet sizes; phone widths 375/414px.

## Pre-trial checklist

- Capacitor wrapper built; Stage A offline working reliably.

- All known bugs fixed (target zero at trial start).

- Sheets-to-DB migration complete or safe parallel-run.

- Auth hardening (auth-attempt rate limiting still open; admin secret RESOLVED V6.1 — ADMIN_SECRET removed, session-based is_admin via verifyAdmin() is the only path). Public-data anti-scraping rate limiting is DONE (V6.3, Section 28).

- Event confirmation flow live (done).

- Order flow rebuilt on the order-key two-id model (V6.3, Section 18a) — migration 20260607 applied and verified; 9/9 data-layer/RPC smoke tests passed (per-event #1/#2/#3, restart on new event, two events both #1 with distinct keys, duplicate-#1-same-event rejected 23505, dedupe Map size correct, cross-event cancel isolation, 5 concurrent increments distinct 1–5, UUID lookup, nonexistent-event→truck fallback). **STILL TO DO: full live iPad click-through of the whole order flow on a real device** — React keys, toasts, and action buttons were type-checked and logic-verified only, never clicked. This gates the trial.

- Rate limiting live and correctly tiered (V6.3, Section 28) — STRICT only on /api/discovery and /api/events; ordering/authenticated routes exempt. Verify 429s fire on public routes only and never block ordering behind shared café/CGNAT IPs.

- WhatsApp on Meta Cloud API (V6.3, Section 20) — webhook wired; four-bucket smoke tests and the whatsapp_logs migration still outstanding.

- End-to-end smoke test of all flows: customer order, walk-up, ready notification, mark paid & done (verified in V4; re-run live on the V6.3 order-key build).

- Brevo hatchgrab.com domain verified and propagated (SPF + DKIM authenticated — can send from @hatchgrab.com; no inbound mailbox purchased yet, so use a reply-to of an existing address for the trial).

- Row Level Security enabled across all tables (DONE V6.1 — Supabase security-advisor warning cleared; see Section 16). New V6.2 tables (excluded_terms, scraper_run_log) created with RLS on, service-role only.

- Discovery map plotting verified: events resolve discovery_truck_id and venue_id and appear as pins (DONE V6.1 — root-cause null-ID bug fixed and existing rows backfilled; see Section 25). Re-verify after the V6.2 venue re-pins — in particular confirm the Pizzeria Gusto Saturday pin at The Five Bells, Cavendish shows correctly.

- Apps Script scraper confirmed working end-to-end after the key recovery (DONE V6.1 — all four Script Properties restored, testAllKeys() passing; see Section 24/25).

- Production deploy to Vercel with production Supabase; real iPad testing with simulated connectivity drops.

- Wake lock confirmed working under iOS 16.4+ and Chrome Android.

- End-to-end customer order flow verified: place order → appears on dashboard/KDS → confirmation email → cancel page from email link (now /order/{order_key}/manage) → mark ready notification → mark paid & done. (Still to run live on V6.3.)

- QR code and dashboard order link resolve to /trucks/[slug]/order (slug column populated for every truck; dashboard_token fallback removed in V6).

- Scraper bridge verified: a linked truck's inbound event creates an unconfirmed truck_events row and shows in its Schedule tab; an unlinked truck stays discovery-only. As of V6.2 the bridge is gated on scraper_preference (only 'auto' trucks bridge into truck_events; manual trucks stay discovery-only — Section 15).

- Scraper GitHub Actions workflow passes on **Node 24** (Chrome install + Supabase realtime both clean). Diagnose the ~23-minute run failure (Section 24, pending diagnosis) before relying on the cron.

- API keys rotated out of the Apps Script and into Script Properties (DONE V6.1). Rotate the exposed Upstash Redis REST token (V6.3, Section 28 / Section 27).

- Migrations run in Supabase: 20260602_admin_role.sql, 20260602_event_offline_override.sql, 20260602_tester_plan_discount.sql, 20260603_menu_is_active.sql, 20260603_enable_rls_all_tables.sql, 20260604_scraper_preference.sql, 20260604_scraper_adaptive.sql, 20260604_exclusion_terms.sql, **20260607_order_key_per_event.sql** (V6.3 — applied in chunks, followed by `notify pgrst, 'reload schema';`). Reconcile the applied-vs-file list — upsell_events and whatsapp_logs were never applied (Section 16). Admin operator account set (operators.is_admin = true).

## Contextual reminders

- orders has TWO ids: order_key (uuid, identity, every WHERE/key/URL/FK/dedupe) and id (text, per-event display number, restarts at 1, NEVER a lookup key). Never conflate them (Section 18a).

- Order display numbers are bare integers ("5"), generated only by nextOrderId via the atomic event/truck counter — never read-max-then-check (Section 18a).

- STRICT rate limiting is for public bulk-scrapeable data ONLY; ordering and authenticated routes are exempt (Section 28).

- Both order insert paths must write event_id; never setState from a failed fetch (Section 5).

- calcQueuePushSecs is shared by client and server ASAP — never fork it (Section 6).

- Future-dated events never show red "prep now" urgency; age blends in only under 60 minutes (Section 9).

- The slot traffic-light is operator-only; the customer picker shows only clean slots (Section 10 / 7).

- WhatsApp runs on the Meta Cloud API; the Twilio handler is dormant, do not overwrite (Section 20).

- UI text contrast floor on white: slate-700 body, slate-500 secondary, slate-400 decorative only; orange reserved for current-plan/active highlights.

- Watch for new Date('YYYY-MM-DD') UTC bugs and for next/image shadowing the global Image constructor (use document.createElement('img')).

- Always strip seconds via formatTime — never inline t.slice(0,5) or write a parallel implementation.

- ASAP base time is max(now + prep, eventStart) — never add prep on top of a future event start (Section 6).

- Customer order URL is /trucks/[slug]/order; the cancel link is /order/{order_key}/manage. Never use the dashboard_token in a customer-facing or public URL, and never return dashboard_token in a public API response (Section 12 / Section 2).

- New operator pages reuse AppHeader and slate-900 tabs (lib/brand.ts) — no inline page headers (Section 3).

- is_test never gates operator features — it filters the public discovery map only (Section 4).

- Manual pause writes to truck_vans.paused_until for the active event's van, not trucks.paused_until (Section 5).

- A null batch_size means "no limit" — render blank with an ∞ placeholder, never a sentinel like 999 (Section 6).

- trucks.id is text, not uuid — any new FK to trucks(id) must be text, including RPC params like increment_order_counter(p_truck_id text) (Section 16).

- Schedule extraction goes through lib/schedule-extract.ts in-repo — never re-implement the Gemini prompt/retry/parse (Section 3 / Section 22).

- venues uniqueness is (name, village) — upsert with onConflict 'name,village' (Section 25).

- Cross-talking tabs and in-progress-input panels are always-mounted with an isActive prop; modals render outside the isActive gate (Section 22).

- Run large SQL migrations in chunks, not a single full-file paste, and keep an applied-vs-file reconciliation (Section 16 / Section 22).

# 27. Open backlog (June 2026)

## Critical — before trial

- **LIVE iPad click-through of the entire order flow on a real device (V6.3)** — the single most important pre-trial task. Every V6.3 order-flow fix (per-event numbering, urgency, slots, basket persistence, email venue/contact) stacks on this one path and NONE of it has been exercised end-to-end by a human on a real device; the smoke tests proved the data layer and RPCs only. This gates the trial.

- Capacitor native wrapper; Stage A offline cache; offline detection banner; background sound; screen wake.

- Auth-attempt rate limiting (public-data anti-scraping rate limiting is done — Section 28).

- **Run the whatsapp_logs migration in prod (V6.3)** — the table does not exist, so logging is silently failing; and confirm the lib/whatsapp-classifier.ts service-role-key usage. Then run the WhatsApp four-bucket smoke tests (Section 20).

- **Applied-migrations reconciliation (V6.3)** — upsell_events (20260529_checkout_upsells) and whatsapp_logs were never applied to prod; audit the full applied-vs-file list, as others from that era may also be missing (Section 16).

- **Rotate the Upstash Redis REST token (V6.3)** — exposed in chat during setup (Section 28).

- **Delete the now-vacuous supabase/migrations/20260607_backfill_order_event_id.sql (V6.3)** — the orders table was wiped, so it backfills nothing; hygiene.

- Google Sheets → DB migration (scraper currently dual-writes; Sheets still config store). Also the natural home for the Gemini-extraction DRY consolidation (Section 3 / Section 25) — once done, the two Apps Script paths can move in-repo behind lib/schedule-extract.ts.

- Full end-to-end order flow test (place order → KDS → confirmation email → cancel → ready → paid & done) — run live on the order-key build.

- Reports tab data verification across multiple events.

- Discovery map VF vs HG visibility test (operator events now show on both maps as of V6; map plotting fixed in V6.1; V6.2 venue re-pins to re-verify).

- Heartbeat/auto-pause end-to-end test.

- Diagnose the ~23-minute scraper run failure (Section 24) — add per-site navigation and per-Gemini-call timeouts; confirm on the next Node 24 cron run.

- Apps Script screenshot processor 6-minute timeout — the ~280s time guard is in place; confirm it exits cleanly on a large batch. Gemini billing on Google Cloud (paid plan active).

- GitHub Actions GEMINI_API_KEY secret — verify the repository-secret copy matches the current Script Properties key after the V6.1 rotation (the two are maintained separately).

- Link each trial truck's discovery_trucks row to its HatchGrab truck (hatchgrab_truck_id) via the admin console, so scraped/emailed events bridge into the operator schedule.

- orders.source column migration — replaces the customer_email IS NULL heuristic for order type in Reports. TODO comments in app/api/orders/submit/route.ts and app/api/dashboard/action/route.ts.

- truck_events.customer_note surfacing on the customer order page below event details (column saves, API select needs adding, render needed).

- Add "Edwardstone White Horse" to the Google Sheets Venues tab alias columns N/O/P (the Supabase alias is already set; the Sheet copy is maintained separately — Section 25).

- DRY: consolidate the remaining Apps Script Gemini schedule-extraction paths into the shared utility / a single shared /api/schedule/process endpoint (Section 3 / Section 25). The in-repo paths are already consolidated into lib/schedule-extract.ts as of V6.2.

## Important — before public launch

- **Village-aware venue matching in inbound-schedule (V6.2)** — match on venue_name + village combined before falling back to name-only, to stop common pub names ("The Bell", "The Fox", "The Bull") pinning to the wrong village (Section 25). Currently corrected by hand in SQL.

- **Items-based slot capacity display + kitchen_capacity semantics fix (V6.3, decided: ITEMS)** — replace the interim directional slot wording (Section 10) with a precise count; the slot engine currently counts BATCHES while the UI says "items". This touches the slot engine and existing slot_capacity data, so do it carefully in a dedicated session.

- **Retire the dormant Twilio WhatsApp handler and delete formatWhatsAppOrder dead code (V6.3)** — Meta Cloud API is now canonical (Section 20); the Twilio-vs-Meta consolidation decision is resolved in Meta's favour. Remaining work is the cleanup.

- **Messenger + Instagram per-truck OAuth (parked, V6.3)** — facebook_page_id / instagram_account_id / encrypted-token columns, OAuth callback routes, ENCRYPTION_KEY (AES-256, lib/crypto.ts), send API, and classifier wiring, then Meta app review (needs privacy policy + terms first).

- Stripe Connect integration (upgrade buttons currently email support).

- Refunds process — event cancellation cancels orders and emails customers but does not yet refund; customer menu imports for onboarding at scale.

- Multi-device session enforcement (kds_sessions exists, logic pending).

- Stage B offline; proper post-trial login (email/password or magic link — partially in place).

- Operator UI pause-state reload — read from truck_vans.paused_until for the active event's van, not trucks.paused_until (V6).

- orders.ready_time column — store the calculated collection time at submit for tighter ASAP cancellation control post-trial (V6).

- Schedule tab map panel — latitude/longitude are already stored on truck_events; show event locations on a desktop map alongside the schedule list (like the discovery page's right-side map) (V6).

- FAQ / help page; HatchGrab logo asset at public/logos/hatchgrab-logo.png.

- QR-with-logo scan test. (Dashboard order link and QR use /trucks/[slug]/order; final scan test still outstanding.)

- Allergen onboarding flow: prompt operator per-category allow_notes toggle at signup.

- Loyalty stamp cards V1 build (Max only): schema migration, walk-up phone lookup, online email match, redemption flow — when instructed.

- Branded QR code implementation: trucks.qr_code_style column, logo compositing in centre, manage page selector.

- password_reset_tokens cleanup job — tokens are marked used_at but never deleted; add a periodic purge.

- slot_capacity.max_orders → max_batches rename — the column counts batches, not orders; the name misleads. (Related to the items-based capacity fix above.)

- is_instant boolean on menu_categories — consideration, to make zero-prep items (drinks, dips) explicit rather than inferred from prep_secs.

- Companies House registration for HatchGrab — recommended ahead of taking payments and Meta app review.

- Privacy policy + terms pages — required for Meta app review and for launch.

## Adaptive scraping rollout (V6.2)

- **Site viability learning for all tracked trucks** — after N consecutive zero-event runs, mark a discovery truck inactive and drop it to a monthly check. Needs a scraper_status column and a consecutive_empty_runs counter on discovery_trucks.

- **Adaptive update-day scheduling for all discovery_trucks** — roll shouldRunToday / recordRunAndLearn out to the Loop A discovery trucks (not just linked HatchGrab trucks) once the Google Sheets → Supabase migration is complete.

- **Seasonal suppression for empty-schedule nudge emails** — after 3 consecutive empty nudges with no operator response, suppress further nudges until the truck next has a confirmed event. Add a scraper_empty_notify_count column.

- **Do NOT add a 90-day cleanup job for truck_events or discovery_events** — these are permanent reporting records. Only scraper_run_log is pruned (Section 24).

## Later

- Stage C full offline; customer-facing display (Max); advanced reporting visualisations (hourly velocity chart, event ROI comparison); festival pricing; personalised schedule generator.

- Truck-facing WhatsApp "Recent messages" review panel with flagging; event cleanup job (note: scraper_run_log only — events are permanent).

## Open questions

- AI DM classifier confidence threshold (set from real performance).

- iPad printer model (Star Micronics vs Epson) — affects Capacitor native module.

- Truck-level vs operator-level billing in Phase 2 — schema supports either.

- Loyalty redemption UX: operator-side trigger placement in Add Order panel; customer-side prompt design at online checkout.

# 28. Anti-scraping and rate limiting (V6.3)

Layered protection against bulk scraping of the public discovery and event data, without ever throttling real ordering.

## Components

- **lib/ratelimit.ts** — Upstash Redis sliding-window limiters. Redis DB "HatchGrab", London (eu-west-2). Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN (in .env.local and Vercel).
- **middleware.ts** (repo root) — Vercel Edge Middleware applying the limiter by route tier.
- **public/robots.txt** — blocks AI crawlers (GPTBot, ClaudeBot, CCBot, etc.).
- **vercel.json** — X-Robots-Tag headers.

## Tiering — the rule that must not drift

> **RULE** — The STRICT limiter applies ONLY to public, bulk-scrapeable data. It must NEVER touch an authenticated or ordering route — doing so caused two regressions this session (events disappearing on the dashboard when /api/events/manage got a 429; customer ordering blocked behind shared café/CGNAT IPs).

- **STRICT — 3/min** — /api/discovery and /api/events (public slug lookups) ONLY.
- **GENERAL — 60/min** — everything else, including /api/menu and /trucks (these sit behind shared IPs and must stay generous).
- **EXEMPT (no limit)** — /api/dashboard/action, /api/orders/submit, /api/webhooks, /api/admin, /api/events/manage, /api/events/action, /api/events/affected-orders, /api/inbound-schedule.

> **RULE** — Any new route handling authenticated operator actions or order placement is EXEMPT by default. Only add a route to STRICT if it serves public bulk-scrapeable data and nothing else.

> **SECURITY NOTE** — the Upstash REST token was pasted in chat during setup; rotate it before trial (Section 27).

# 29. Closing note

This manual is living documentation. Update it whenever a new rule is established, a feature behaviour is decided, a DRY violation is identified and fixed, a plan tier feature changes, or a coding convention shifts.

When in doubt about how something should work: check here first. If the answer is not here, work out the right answer, document it here, then implement.

The cost of writing things down is a few minutes. The cost of not writing them down is rebuilding the same decision next week.

HatchGrab Engineering Reference Manual · V6.3
