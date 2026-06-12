HatchGrab Engineering Reference Manual · V6.5

**HatchGrab**

Engineering Reference Manual

*Village Foodie · Food Truck Ordering Platform*

**Version 6.5**

June 2026

*This document defines the rules, conventions, and architecture decisions for the HatchGrab platform. It is the source of truth for any coding session and must be consulted before making structural changes.*

# Changelog

## V6.5 — June 2026 (this session)

Pre-trial per-event-stock and live-site-correctness session. The headline change rebuilds stock from a truck-level model into a **per-event sparse-override** model, closing the cross-event sold-out bug (an item marked sold out — or sold through — on one event showed sold out on every other event). Also: brings the dormant operator-events branch of the discovery API alive and gates it by the linked discovery truck's visibility (so a test/hg-only truck shows on hatchgrab.com and is hidden on villagefoodie.co.uk); rebuilds the bridge venue matcher from loose substring matching into token-overlap + village-rank + best-effort, fixing a live-site venue mislink that cascaded the wrong postcode and map pin; strengthens the scraper's town extraction; consolidates the order page → profile page navigation; and clears a batch of small UI/data items (header logo size, billing-tab "coming soon" + sticky pricing header, order-button cart icon, test-kitchen logo). Key changes relative to V6.4:

- **Per-event stock — sparse-override model (replaces the truck-level model)** — stock was truck-level (`item_overrides` keyed `truck_id + item_name`, no event scope) and date-level (`category_stock`), while only the sold count was event-scoped. So a manual sold-out toggle, a manual stock-ceiling edit, OR organic sell-through (via `enforceStockLimits` writing a truck-wide `available=false`) all leaked across every event. The new model: two additive tables `event_item_stock` (PK `event_id,item_name`) and `event_category_stock` (PK `event_id,category`) hold a per-event OVERRIDE that exists ONLY when the dashboard edits stock for that specific event. Every read is `event_item_stock.stock_count (if an override row exists) ?? menu_items_db.default_stock (live Settings)` — so un-edited events read live Settings and a Settings default change PROPAGATES to all future events (confirmed and unconfirmed), while a per-event edit stays isolated to that event. Item names are always read live from `menu_items_db.name` so renames propagate. The atomic oversell guard is preserved: ceiling and sold count share the same `event_id`, a missing override row falls back to `default_stock` (never accidental-unlimited, never 0). See new Section 30.

- **Settings>Menu is the seed; the dashboard is the per-event override** — confirmed clean two-layer split. `menu_items_db.default_stock` / `menu_categories.default_stock` (the Settings>Menu "Default stock per event" field) are the live seed; the dashboard set_stock / sold-out toggle / set_category_stock write the per-event override into `event_item_stock` / `event_category_stock`. There is NO snapshot-on-event-creation and NO backfill — un-edited events simply read the live default. See Section 30.

- **Operator-events branch revived + visibility-gated (the test-kitchen-on-hatchgrab fix)** — `trucks.is_test` does NOT exist as a column despite being referenced in code, so the operator-events branch of `/api/discovery/events` had been ERRORING on the phantom column and silently returning `[]` — operator events were dormant on BOTH domains. The `is_test` references were removed from the operator select + filter, reviving the branch, and operator events are now gated by their LINKED discovery truck's `visibility` (via a dedicated UNFILTERED `hatchgrab_truck_id → visibility` fetch — NOT the visibility-filtered `trData`, which would default an `hg_only` row to public and leak it). Test-kitchen's discovery rows were flipped `public → hg_only`, so it shows on hatchgrab.com (with order buttons) and is hidden on villagefoodie.co.uk. This also FIXED a pre-existing leak: test-kitchen was previously a public discovery row, visible on villagefoodie. See Section 15 and Section 16.

- **Bridge venue matcher rebuilt — token-overlap + village-rank + best-effort (replaces loose substring)** — `findVenue` matched on name substring with a vacuous village AND-filter and took the first match (`.find`), so "The Cavendish Five Bells" matched the RATTLESDEN "Five Bells" (substring) while the correct Cavendish "The Five Bells" was rejected on word order — and the mislink cascaded the wrong postcode (IP30 0RA) and wrong coordinates onto the event (the customer-facing map pin and "Cavendish Five Bells in Rattlesden" display). The matcher now: gathers candidates by token-overlap (so all "Five Bells" venues become candidates), ranks by normalised village agreement (with an embedded-town fallback that reads a town token out of the scraped venue_name), and picks the best candidate. See Section 25.

- **Best-effort, not bail — the truck validates at approval (the matcher's ambiguous-case philosophy)** — pending events are customer-invisible (every public read gates `status IN (confirmed, open)`), so a best-effort venue guess is only ever seen by the truck during approval, and the truck edits anything wrong before it goes live. The matcher therefore picks the best candidate rather than leaving a blank, and an approved event becomes a trusted anchor for future scrapes. (The confidence-flag surfacing and the venue_id anchor column are scoped but NOT yet built — see Section 27.) See Section 25.

- **Scraper town extraction strengthened** — `hgPrompt` already requested a `town` field but returned null when the town was embedded in the venue name ("The Cavendish Five Bells" → venue kept whole, town null). The prompt now always emits town and splits an embedded place-name out of the venue name, with few-shot examples. The town flows through the already-wired chain (prompt → POST `village` → bridge → `findVenue` village param → `truck_events.town`) with no new plumbing. See Section 24 and Section 25.

- **Order page → profile page consolidation (Piece A)** — the schedule/profile page (`/trucks/[slug]`) shows an Order button per orderable event (gated `isHatchGrab() && event.source === 'operator'`, so only confirmed operator events show it) that deep-links to `/trucks/[slug]/order?event_id=…`. The order page's "Change event" control now navigates back to the profile page (the event chooser), not the redundant order-page picker. The cart/trolley emoji was removed from the Order button. See Section 7 and Section 15.

- **localhost-as-hatchgrab dev view** — because every host gate is a substring `.includes('hatchgrab')` check (server reads the Host header, client reads `window.location.hostname`, no middleware, no exact-match), browsing `http://hatchgrab.localhost:3000` (via a one-line `/etc/hosts` alias `127.0.0.1 hatchgrab.localhost`) makes BOTH server and client treat localhost as HatchGrab with zero code change and zero production risk (no real visitor can present that host). `localhost:3000` stays villagefoodie. See Section 26.

- **Billing tab: "Coming soon" + sticky pricing header** — iPad kitchen app, advanced reporting, kitchen ticket printing, and Messenger & Instagram auto-replies are shown as "Coming soon" (testers don't have these yet), via the existing `coming_soon` FeatureValue, and ordered last within their sections. The plan/price header row is now `sticky top-[95px]` (below the nav + tabs, `z-30` under the `z-40` tabs) so it stays visible while scrolling the feature list, on desktop and mobile. The "Branded QR code composites your logo…" footnote (footnote 6) was removed. See Section 4.

- **Test-kitchen logo + header logo size** — the profile-page header truck logo was enlarged (mobile 24→40px, desktop 28→48px, intrinsic 48×48) within the existing 60px header (it lives in an absolute centered overlay, so it grows without pushing the bar taller). Test-kitchen's `discovery_trucks.logo_url` was null (the profile reads only that column; the operator-uploaded logo lives in `trucks.logo_storage_path` and is not mirrored) — fixed for test-kitchen by SQL. The systemic fallback (discovery mapping falls back to the linked operator truck's `logo_storage_path` when `logo_url` is null) is on the backlog. See Section 14 and Section 27.

- **New migrations** — `20260611_event_item_stock.sql` and `20260611_event_category_stock.sql` (the two additive per-event stock tables). Both applied by hand in the Supabase SQL editor, followed by `notify pgrst, 'reload schema'`. See Section 16.

- **Schema fact corrected (prod-verified)** — `trucks.slug` and `trucks.active` EXIST; `trucks.is_test` does NOT exist as a column (the "is_test filters the public discovery map" rule from V5/V6 was implemented via the discovery row `visibility` enum, not a `trucks.is_test` column). Code still references the phantom `is_test` in admin/manage paths, which therefore likely error — on the backlog. See Section 16 and Section 27.

## V6.4 — June 2026

Pre-trial capacity-engine and event-scoping session. Rebuilds the slot capacity / oven-occupancy traffic light from directional wording into a precise, items-based continuous-queue projection; re-keys `production_slot_usage` from date-scoped to event-scoped to stop same-date events pooling each other's load; adds a per-event booking lock; resolves a family of date/event-resolution bugs surfaced by live iPad testing (orders invisible or mis-numbered, future-event slot pickers floored to today's clock, capacity showing "No limit", phantom red on empty events); and fixes the customer ASAP-selection state machine. The capacity system is now event-scoped, race-safe, and verified on clean data. Key changes relative to V6.3:

- **Oven-occupancy capacity engine — the precise items-based projection (replaces V6.3 directional wording)** — the V6.3 "Filling up / Full" directional labels and the BATCHES-vs-items ambiguity are superseded. `projectOvenOccupancy` (lib/slot-availability.ts) is now a continuous per-category FIFO simulation across production windows: a window's occupancy = items still cooking (carried forward) + items starting in it, where per-window throughput `rate = batch_size × (windowSecs / prep_secs)`. kitchen_capacity now counts ITEMS (the intended meaning, per the V6.3 decision), as a cross-category per-window ceiling. Two constraints bind: (a) a per-window global item ceiling (kitchen_capacity), and (b) cumulative per-category throughput. RED = batch full OR ceiling hit (label "Full"); AMBER = partial, showing the binding per-category count ("Pizza 2/4"); GREEN = empty. The same helper drives BOTH the operator dots AND placement — one implementation, no fork. See Section 6 and Section 10.

- **ASAP / placement = tail-completion window** — ASAP and auto-accept resolve an order to the window where its LAST item finishes cooking in the projected queue (project with the order folded in, find its tail-completion window), not "first non-red slot". A 10-pizza ASAP order on an empty queue resolves to the window where its last items complete, telling the customer the truthful ready time. If the tail would fall after event end → pending (never rejected). See Section 6.

- **production_slot_usage re-keyed by event (was date-keyed)** — the table was keyed `(truck_id, event_date, production_slot)`, so two events on the same date pooled into the same rows — an empty event projected another same-date event's load (phantom red), and ASAP/null-slot orders mis-windowed into the date's earliest event. It is now keyed `(truck_id, event_id, production_slot)`: each event's load is physically separate, null-event orders are un-poolable, and `getEventStartHHMM`/`resolveBookingSlot` resolve a null slot to THIS event's start. `event_date` is retained for the date-scoped rebuild orchestrator. The table is a pure cache, reconstructable from orders via `rebuildProductionSlotUsage`. New migration: 20260608_production_slot_usage_event_key.sql. See Section 6, Section 14, and Section 16.

- **Per-event booking lock** — `booking_locks` (keyed `(truck_id, event_date)`) is an INSERT-mutex with ~1s retry, a 10s stale TTL, and a contention→pending fallback, protecting the cumulative per-category capacity check from races. The customer claim path and ASAP both go through it; reassign-or-pend is preserved. New migration: 20260608_booking_locks.sql. See Section 5 and Section 6.

- **Event resolution by id, not by date guess** — the customer order page now sends the chosen `event_id`; the submit route uses it directly instead of re-deriving by `(truck_id, event_date)` with `.maybeSingle()` (which returned NULL — and thus a null event_id, the wrong order number, and an invisible order — whenever a truck had 2+ non-cancelled events on one date). The fallback resolves by date with `.order(...).limit(1)` and warns on ambiguity. Customer orders now also carry `van_id`. `eventKitchenCapacity` likewise resolves the order's actual event, not the date's earliest. See Section 5 and Section 7.

- **Date-aware slot floors consolidated (UTC/local bug)** — a future-dated event's slot picker was floored to today's wall-clock time because the "is this event today?" check used `toISOString()` (UTC date) while the floor compared against the local clock; in the behind-UTC evening window a tomorrow event read as "today". A shared `localTodayIso()` (lib/time-utils.ts, local Y-M-D, never `toISOString`) now date-gates all four floors (`/api/slots` earliest/too_soon, `buildSlotAvailability` is_past, `getAsapSlot` fallback, `isEventClosed`). The same-day floor (now+lead) is unchanged. See Section 6 and Section 7.

- **Rebuild-on-cancel** — event-cancel and event-delete previously set orders to cancelled but never removed their contributions from `production_slot_usage`, so cancelled load lingered and bled into other same-date events. Both paths now call `rebuildProductionSlotUsage` (recomputes the date's usage from live orders only). See Section 15.

- **ASAP selection is a first-class state** — on the customer order page, ASAP was a fake selection (a highlight flag plus an effect that secretly populated a concrete time) while the real selection lived elsewhere and started empty — so on load the order couldn't be placed until ASAP was tapped, and adding items cleared it. ASAP is now genuinely selected by default (submits `slot: null`, server resolves it), persists across basket changes, and the highlight always matches what submits. See Section 7.

- **Kitchen-capacity display fixed (RLS) + reads the selected event** — the dashboard capacity card read `truck_vans.kitchen_capacity` directly with the anon browser client, which RLS blocks (truck_vans is service-role-only), so it always showed "No limit" while the engine read the correct value server-side. The card now sources capacity (and the active van name) from the `/api/dashboard` response (service-role), and its write routes through the service-role `/api/manage update_van_settings` (the anon write was also silently failing). It also keys off the selected event, not the date's first event. See Section 10 and Section 14.

- **Slot-label wording** — RED slots read "Full" (the category name and ratio dropped); AMBER reads the per-category count ("Pizza 2/4"); the leading "·" separator before slot labels was removed. The internal `bound_by` reason (incl. "global ceiling") is still computed, just not shown for red. See Section 10.

- **New migrations** — 20260608_booking_locks.sql; 20260608_production_slot_usage_event_key.sql. Both applied in chunks via the Supabase SQL editor. See Section 16.

## V6.3 — June 2026

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

- **Discovery-map venue-matching fixes** — common pub names (The Bell, The Fox, The Bull) were matching the first same-named venue regardless of village. Eight missing venues were added with correct coordinates and aliases, the Five Bells Cavendish alias set was extended, 52 upcoming events were re-pinned, and wrong `venue_id`s were nulled where the correct venue did not yet exist. The unique constraint on `venues` is `name + village`, so upserts must use `onConflict: 'name,village'`. The proper fix — village-aware matching in `inbound-schedule` — landed in V6.5 (Section 25). See Section 25 and Section 27.

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

- **isHG gate removed** — the discovery/events route no longer restricts operator truck_events to HatchGrab; confirmed/open truck_events now surface on both the Village Foodie and HatchGrab maps unconditionally (the V5 "operator events HatchGrab-only" rule was temporary for testing). *(V6.5 — operator events are again visibility-gated, this time by the linked discovery truck's visibility enum rather than a host gate; see Section 15.)*

- **Feature labels and footnotes** — FEATURE_SECTIONS in lib/plan-features.ts is the single source of truth for feature rows, human-readable labels, section grouping, and coming-soon status; coming-soon rows are ordered last in the data itself (not at render time). "Facebook, Messenger & Instagram auto-replies" renamed to "Messenger & Instagram auto-replies". PLAN_FOOTNOTES is exported and rendered by both the admin Features tab and the operator Billing tab.

- **Heartbeat architecture documented** — a single last_heartbeat_at per truck_vans row, a 15s ping from both the KDS and the dashboard, a 30s stale threshold, a 2h auto-pause that clears online_paused_until on the next live receipt. All-or-nothing offline detection works by design — the last device still pinging keeps the van live.

- **Scraper workflow** — the GitHub Actions daily_scrape workflow runs on Node 22 (Node 20 lacked native WebSocket for @supabase/realtime-js; Node 24 forced the actions deprecation and Puppeteer Chrome issues). Chrome installs via npx puppeteer browsers install chrome (cache cleared first). Gemini quota resolved by upgrading to a paid plan. *(V6.2 — the workflow moved to Node 24; see Section 24.)*

- **is_test scope reconfirmed** — is_test has exactly one effect: filtering test trucks from the public discovery map. It never gates an operator feature (carried forward from V5). *(V6.5 — prod-verified that `trucks.is_test` does NOT exist as a column; the discovery-map filtering is done via the discovery row `visibility` enum, and the phantom `is_test` references in code are a latent bug; see Section 16 and Section 27.)*

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

- **is_test scope corrected** — is_test now ONLY filters test trucks from the public discovery map. It must never gate operator-facing features; the erroneous Billing-tab guard was removed. *(V6.5 — see the V6.1 note above: the column does not actually exist; the effect is achieved via discovery-row visibility.)*

- **Auth hardening** — password-reset and email-change flows now check Brevo sends and roll back on failure; email change does a pre-flight duplicate check and forces sign-out on completion; a cancel-pending-change flow was added. Login debug logging removed.

- **Discovery map security** — dashboard_token removed from all public API responses; the customer order URL is /trucks/[slug]/order; operator events are HatchGrab-only and never shown on the public Village Foodie map. *(Note: the HatchGrab-only restriction was temporary and was lifted in V6, then reintroduced as a per-truck visibility gate in V6.5 — see Section 15.)*

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

> **HOST GATING (clarified V6.5)** — which brand a request is treated as is decided by a substring `.includes('hatchgrab')` check on the host, in five places: the server reads the HTTP Host header (lib/brand.ts isHatchGrabHost, the discovery/events route, layout.tsx generateMetadata) and the client reads window.location.hostname (lib/domain.ts isHatchGrab, the login page). There is no middleware host rewrite and no exact-match — any host containing "hatchgrab" is HatchGrab, anything else (including localhost) is Village Foodie. Server and client agree automatically because the browser sends the navigated hostname as the Host header. This is why `hatchgrab.localhost:3000` makes localhost render as HatchGrab (Section 26).

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

- **Truck profile / schedule page (/trucks/[slug])** — the public schedule + map for a single truck (resolved via discovery_trucks by cleanKey/slug). On HatchGrab, each orderable event shows an Order button (V6.5, Section 7); on Village Foodie the same page is read-only. This is the canonical "see this truck's upcoming events" page and the event chooser the order page links back to.

- **Customer order page (/trucks/[slug]/order)** — pre-orders or pay-at-hatch orders. No login. This is the canonical customer-facing order URL. Online card pre-orders are a Pro/Max feature; Starter is Pay-at-Hatch only. Resolves via /api/events with a slug-then-id fallback (no is_test filter), so it loads by direct URL even for an hg_only truck.

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

- **lib/slot-availability.ts** (V6.3, engine rebuilt V6.4) — per-slot availability flags including the too_soon field split out from is_past, and `projectOvenOccupancy`, the items-based oven-occupancy projection that drives both the operator dots and ASAP/auto-accept placement. See Section 6 and Section 10.

- **lib/slot-indicator.ts** (V6.3) — legacy operator slot traffic-light state. As of V6.4 it no longer drives the operator dots or placement (projectOvenOccupancy does); it serves only the customer available/unavailable flags. Candidate for removal post-trial (Section 27). Never imported by the customer page for a traffic-light.

- **lib/prep-utils.ts** — prep time, category configs, queue-aware ready time, buildCatConfigs, calcQueuePushSecs (V6.3 — the single ASAP queue-push helper shared by client and server), and the per-category projection helpers calcReadySecsByCat / calcQueuePushSecsByCat (V6.4). See Section 6.

- **lib/plan-features.ts** — SINGLE SOURCE OF TRUTH for plan pricing, the feature matrix (FEATURE_SECTIONS), footnotes (PLAN_FOOTNOTES), plan prices, and descriptions. Imported by both the Billing tab and the admin console.

- **lib/features.ts / lib/useFeatures.ts** — plan tier feature map, PLAN_ORDER, PLAN_META, and canAccess()/useFeatures() for gating.

- **lib/whatsapp-classifier.ts** — message classification (four buckets as of V6.3) and schedule-response prompt building.

- **lib/meta-whatsapp.ts** (V6.3) — sendMetaWhatsApp and Meta Cloud API helpers (replaces the Twilio send path). See Section 20.

- **lib/ratelimit.ts** (V6.3) — Upstash Redis rate-limit configuration and tier helpers. See Section 28.

- **lib/time-utils.ts** (V4, extended V6.4) — canonical time formatter. formatTime(t) strips seconds from HH:MM:SS to HH:MM. localTodayIso() (V6.4) is the single local-Y-M-D helper used by every "is this event today / has this slot passed" floor (never toISOString — Section 6). These are the only implementations; never inline t.slice(0,5) or a parallel date floor.

- **lib/modifier-utils.ts** (V4) — client-safe modifier helpers. isModifierAvailable(opt) returns opt.available !== false. Used to filter modifier options in both the customer page and the operator Add Order panel. undefined and null mean available — backward-compatible against rows where the column wasn't set.

- **lib/order-utils.ts** — **server-only**. Exports nextOrderId(eventId, truckId) (V6.3 signature — event RPC first, truck RPC fallback, bare-integer display number; Section 18a). Imports SUPABASE_SERVICE_ROLE_KEY — importing this in a client component will fail the build. Client-safe utilities go in their own files (e.g. modifier-utils.ts), never co-located here.

- **lib/useDragDrop.ts** (V6) — the shared drag-and-drop hook. useDragDrop(onFileDrop, acceptedTypes) encapsulates isDragging plus a dragCounter ref and returns { isDragging, dragProps }. Used by the Menu and Schedule import upload zones and the extracted-events reorder list. Never re-implement drag handlers inline.

- **lib/schedule-extract.ts** (V6.2, town extraction strengthened V6.5) — the single in-repo home for Gemini schedule extraction and exclusion matching. Exports:

  - **ExtractedEvent** — the extracted-event type (event_date DD/MM/YYYY, start_time, end_time, venue_name, town, postcode, optional address). `address` is optional and must never contain a town or postcode.

  - **INVALID_VENUES** — the skip list ("Closed", "N/A", "TBC", "Unavailable", "Cancelled") applied in both the prompt and post-parse.

  - **buildScheduleExtractionPrompt(inputText)** — assembles the extract-then-enrich prompt, injecting a pre-computed 14-day day→date reference table, the venue-name-cleaning and postcode-assembly rules, the address rule, the invalid-venue filter, and (V6.5) the strengthened town rule: ALWAYS emit town and SPLIT an embedded place-name out of venue_name, with few-shot examples ("The Cavendish Five Bells" → venue "Five Bells", town "Cavendish").

  - **extractScheduleEvents(content, options)** — calls Gemini through callGeminiWithRetry (3 attempts, 2-second backoff), strips markdown fences, parses, and post-processes. Model is **gemini-2.5-flash** (never flash-lite).

  - **normaliseExclusionTerm(term)** / **isExcluded(name, terms)** — the exclusion helpers.

  In-repo callers: **app/api/manage/process-schedule/route.ts** (a ~40-line auth-and-input wrapper), **app/api/manage/verify-schedule-url/route.ts**, and the GitHub Actions scraper's HatchGrab loop. The scraper's inline hgPrompt is a SEPARATE prompt (a divergence — V6.5 found and noted it; convergence onto buildScheduleExtractionPrompt is on the backlog, Section 27). See Section 15 and Section 24.

- **lib/venue-signature.ts** / venue matching in inbound-schedule — see Section 25. The single fuzzy matcher `findVenue` (V6.5 rebuild) resolves BOTH venue_id and postcode/coords for a scraped event; never resolve a venue twice with two different matchers.

### Display helpers — components/dashboard/helpers.ts

Display-only helpers that handle visual concerns (header colour, ticket age state) may live with the components they serve: getCombinedUrgency, getAgeState, getHeaderStyle, getTicketAge. These translate state into display properties — they contain no business logic.

> **RULE** — Business calculations live in lib/. Display-only helpers may live with the components they serve. When unsure whether something is business logic or display logic, put it in lib/.

### Type definitions

Shared types and constants such as CatConfig and DEFAULT_CAT_CONFIG live in lib/prep-utils.ts. components/dashboard/types.ts re-exports them. The Order type carries both order_key (uuid) and id (display number) as of V6.3 (Section 18a).

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

No inline dropdowns anywhere.

### Shared operator header — AppHeader (V5)

components/shared/AppHeader.tsx is the single operator-facing page header, used by the dashboard, the manage page, the admin page (V6), and any future operator surface. Layout: Village Foodie logo left (links to /), the truck logo and name centred, and a right-hand slot supplied via children (typically the UserMenu avatar dropdown). It is bg-slate-900 and sticky top-0 z-50. Pages must not build their own inline header.

> **NOTE (V6.5)** — The centred truck logo (the scroll-revealed one) was enlarged this session: mobile w-10 h-10 (40px), desktop sm:w-12 sm:h-12 (48px), intrinsic 48×48, inside the existing 60px header via the absolute inset-0 centered overlay (it grows within the bar, never pushing the bar taller). The large profile-body badge (w-24 h-24) is separate and unchanged.

Colour constants live in lib/brand.ts: HEADER_BG, PAGE_BG, and TABS_BG, all slate-900.

Sticky layout contract: AppHeader is sticky top-0 z-50 (51px tall). The tabs bar is sticky top-[51px] z-40. On the dashboard, the event bar is sticky top-[95px] z-30 and shows on the Orders and Add Order tabs only. On the manage page the tabs are sticky top-[51px] z-40; the Billing tab's plan/price header is sticky top-[95px] z-30 (V6.5, Section 4). Any new operator page must reuse AppHeader and slate-900 tabs rather than re-deriving these values.

### Single order-line renderer (V4)

components/dashboard/OrderLineItem.tsx renders a priced line item across all surfaces. Variant prop (operator | customer) controls rendering. Props include nameSuffix for the Edit/Customise button slot and rightSlot for the price editor.

### Shared column class constants (V4)

When rendering multi-column list views (Reports Orders/Items, future surfaces), shared Tailwind class constants must be defined once at the top of the component. See Section 19.

### Feature gating

All feature access goes through canAccess() from lib/features.ts — the single source of truth handling per-truck overrides, trial expiry, and plan tier resolution in the correct order. Forbidden: if (plan === "pro"), if (truck.plan !== "starter"), or hardcoded feature lists outside lib/features.ts.

### canAccess vs hasFeature (V4)

- **canAccess(plan, feature, featureOverrides, trialExpiresAt)** — use this for ALL UI gates. Respects per-truck overrides and trial expiry.
- **hasFeature(plan, feature)** — plan-only check, no overrides. Use only where override/trial logic is irrelevant.

When in doubt, use canAccess().

### Plan pricing and feature matrix

lib/plan-features.ts is the single source of truth for the pricing matrix, feature sections, footnotes, plan prices, and descriptions. Both the Billing tab and the admin console import it. Never hardcode pricing or feature rows in a component.

FEATURE_SECTIONS (V6) is the canonical structure: three sections — Core operations, Online sales & automation, and Max tier — each a list of FeatureRow objects carrying a human-readable label and starter/pro/max values. Trial and Tester always take the same value as Max. Coming-soon rows (FeatureValue 'coming_soon') are ordered last within their section in the data itself, so both surfaces render them last without any render-time sorting. PLAN_FOOTNOTES is exported and rendered by both surfaces.

### Schedule extraction via Gemini — mostly consolidated (V6.2)

The in-repo paths share lib/schedule-extract.ts:

- **app/api/manage/process-schedule/route.ts** — operator imports their own schedule. A ~40-line wrapper.
- **app/api/manage/verify-schedule-url/route.ts** (V6.2) — the self-service "verify my website" route.
- **GitHub Actions scraper, HatchGrab loop** — imports extractScheduleEvents (gemini-2.5-flash).

> **DIVERGENCE NOTED (V6.5)** — the GitHub Actions scraper's per-event extractor is actually its own inline `hgPrompt` (run-scraper.js), NOT buildScheduleExtractionPrompt — a separate prompt that had the embedded-town bug fixed in this session's town-extraction work while the shared library prompt was already correct. Two further paths remain independent: **processFoodTruckScreenshots** and **analyzeEmailWithGemini** (Google Apps Script). Convergence — having the scraper import buildScheduleExtractionPrompt, and migrating the Apps Script paths off Google Sheets so they can move in-repo — is on the backlog (Section 27). Until then, prompt improvements must be applied to each by hand.

> **RULE** — Any new IN-REPO code that extracts events from text, an image, or a scraped page MUST import from lib/schedule-extract.ts. Never re-implement the prompt or the parser in a route.

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

- **Tester (V6)** — All MAX features plus Pay-at-Hatch online ordering. The billing tab is hidden and the trial-conversion popup is suppressed. A lifetime subscription discount is tracked on trucks.lifetime_discount_pct (integer) and trucks.lifetime_discount_note (text). Intended for hand-picked pre-launch testers who keep a permanent discount; can later convert to a paid plan.

## PLAN_ORDER (V6)

PLAN_ORDER in lib/features.ts is ['starter', 'trial', 'tester', 'pro', 'max']. PLAN_META holds each plan's display name; PLAN_PRICES and PLAN_DESCRIPTIONS live in lib/plan-features.ts.

## Pricing matrix

| **Feature** | **Starter (Free)** | **Pro (£29)** | **Max (£49)** |
| --- | --- | --- | --- |
| **Walk-up orders — platform fee** | 0% | 0% | 0% |
| **Online orders — platform fee** | Pay at Hatch | 0.99% + card fee | 0.99% + card fee |
| **Discovery map listing** | ✓ | ✓ | ✓ |
| **Universal web dashboard** | ✓ | ✓ | ✓ |
| **iPad kitchen app** | Coming soon | Coming soon | Coming soon |
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
| **Advanced reporting (date range, breakdowns)** | — | Coming soon | Coming soon |
| **Branded QR code** | — | ✓ | ✓ |
| **Messenger & Instagram auto-replies** | — | Coming soon | Coming soon |
| **Unlimited WhatsApp auto-replies** | — | — | ✓ |
| **Kitchen ticket printing** | — | — | Coming soon |
| **Multi-device kitchen sync** | — | — | ✓ |
| **Multi-user access** | — | — | ✓ |
| **Digital loyalty stamp cards** | — | — | Coming soon |
| **Customer-facing display** | — | — | Coming soon |
| **Event & festival pricing** | — | — | Coming soon |

> **COMING-SOON STATUS (V6.5)** — iPad kitchen app, advanced reporting, kitchen ticket printing, and Messenger & Instagram auto-replies are shown as "Coming soon" (FeatureValue 'coming_soon') because trial/test operators do not have these yet. Set the relevant plan column to 'coming_soon' in lib/plan-features.ts; the Billing tab and admin Features tab render the badge and order the row last within its section automatically. (The capability of some of these — e.g. the iPad app running in any tablet browser — still exists; "Coming soon" reflects what the current testers are given, and can be flipped back to ✓ when ready.)

Trial and Tester columns take the same feature values as Max, with Pay-at-Hatch online ordering and a 0% walk-up fee. Their online-order fee shows Pay at Hatch, not 0.99% + card fee. The Trial column auto-follows Max (a 'trial' column value is derived as row.max), so any 'coming_soon' set on Max shows on Trial without extra work.

Footnotes (held in lib/plan-features.ts as PLAN_FOOTNOTES): (1) Walk-up orders use the truck's own card terminal — HatchGrab charges 0%, terminal provider fees apply. (2) Online payments via Stripe Connect: 0.99% platform fee plus Stripe card processing ~1.5% + 20p in the UK. (3) Kitchen ticket printing requires the HatchGrab iPad app and a compatible thermal printer, neither supplied. (4) iPad not supplied; the kitchen app runs on any modern tablet browser, Apple iPad recommended. (5) Auto-replies require a Business account on each platform and respond with schedule and order link only.

> **NOTE (V6.5)** — footnote 6 ("Branded QR code composites your truck logo into the centre of the QR code at high error-correction level. Requires a logo to be uploaded in Settings.") was REMOVED. Footnotes 1–5 are unchanged and still referenced.

## Pricing rationale

- Starter free reduces signup friction. £29 Pro sits below the £30 psychological threshold. £20 gap between Pro and Max is deliberately small to encourage upgrades. All platform fees on online orders apply on top of card processing (~1.5% + 20p with Stripe). Walk-up orders have 0% platform fee on all tiers.

## Feature gating rules

- Static feature map lives in lib/features.ts; pricing/matrix in lib/plan-features.ts.
- Resolution order in canAccess(): per-truck override → trial expiry check → plan tier.
- Per-truck overrides stored in trucks.feature_overrides (JSONB), edited in admin.
- Trial expiry checked against trucks.trial_expires_at; expired trials silently drop to Starter.
- UI uses useFeatures(truck); non-React code uses canAccess() directly.
- Gating happens both UI-side and API-side.
- WhatsApp auto-replies are MAX only (cost-incurring). Instagram/Messenger are Pro.

### FeatureValue type (V4)

The FeatureValue type in lib/plan-features.ts is boolean | 'coming_soon'. Set the plan column to 'coming_soon' directly — the Billing tab renders this as a "Coming soon" badge (muted-italic) automatically. No separate flag is needed.

## Billing tab

- Billing lives inside the Manage page as an owner-only tab. Removed the standalone /account page.
- Visible to all operators including trial AND test accounts (corrected in V5).
- **Hidden for Tester plan (V6)** — the tab visibility guard is userRole === 'owner' && truck?.plan !== 'tester'.
- Trial maps to the MAX column; header shows "Free trial (Max features)" with trial end date.
- Transaction fees show actual values (0%, 0.99% + card fee, Pay at Hatch), not checkmarks.
- Upgrade buttons open an email-to-upgrade modal until Stripe Connect billing is built.

### Sticky pricing header (V6.5)

> **RULE** — In the billing matrix, the plan/price header row (TRIAL / STARTER / PRO / MAX with their prices and "per truck / month" subtitles) is `position: sticky; top: 95px; z-index: 30; background: white` — pinned below the 51px nav + ~44px tabs and tucked UNDER the z-40 tabs (z-30 < z-40), with a white background so feature rows scroll cleanly beneath it. It works on desktop and mobile because the matrix wrapper has no overflow ancestor and the page scrolls on the window. The `top-[95px]` offset is tied to the current nav+tabs heights — if either bar's height changes, update this value (and the dashboard event bar's matching top-[95px], Section 3).

### Trial column in the billing matrix (V6)

When the truck is on an active trial, a Trial column is prepended (billingPlans = trialActive ? ['trial','starter','pro','max'] : ['starter','pro','max']). Header: TRIAL / Free trial / until {DD MMM YYYY}; isCurrent is p === truck.plan. Trial cells: walk-up 0%, online orders Pay at Hatch, all features same as Max.

### Billing tab layout by plan (V5)

- **Trial / Starter** — upgrade card first, then billing & payments, then the full pricing matrix.
- **Pro / Max** — a quiet current-plan summary, then a collapsible "Compare all plans" section (collapsed by default), then billing & payments.

### Trial conversion prompts (V5)

When plan is trial, the Manage page defaults to the Billing tab on load. A once-per-day reminder popup (localStorage flag hg_trial_reminder_shown) shows the trial end date. (V6: suppressed for the Tester plan.)

### is_test scope (V5, corrected V6.5)

> **RULE (updated V6.5)** — There is NO `trucks.is_test` COLUMN in prod (verified). The intended effect — "test trucks don't appear on the public Village Foodie discovery map" — is achieved via the discovery row `visibility` enum (set a test truck's discovery_trucks + discovery_events rows to 'hg_only', so villagefoodie's allowedVisibility ['public'] excludes them while hatchgrab's ['public','hg_only'] includes them). Code in /api/discovery/events (operator branch), admin, and manage still REFERENCES a phantom `is_test`; the discovery/events references were removed in V6.5, but the admin/manage ones remain and likely error — on the backlog (Section 27). is_test must NEVER gate an operator-facing feature; test accounts see the full operator product, Billing tab included.

## Loyalty stamp cards (Max, coming soon) — V4

V1 spec frozen in code comments in lib/plan-features.ts. Schema is loyalty_cards(id, truck_id, customer_email, customer_phone, stamps_earned, stamps_redeemed, created_at, last_stamp_at). V1 rule: 1 stamp per order. Do NOT build flexible stamp criteria until V1 is live and operators request it.

## Branded QR code (Pro+) — V4

trucks.qr_code_style column ('standard'|'branded' default 'standard') controls whether the public QR composites the truck logo into the centre (error-correction level H). The Pro feature row in lib/plan-features.ts is "Branded QR code".

## No premium badges on customer surfaces

> **CRITICAL RULE** — Customers must NEVER see "Premium" badges, upsell language, or any indication that features are gated behind subscription tiers. Premium features are silently enabled or disabled per truck.

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
- Customer name optional; defaults to "Walk-up" if blank. Email/phone behind a toggle.
- Auto-confirms immediately. Button label: "Confirm order". No modifier popup on item tap. Decrements stock on success.

### Customer self-orders

- Created via /trucks/[slug]/order. Submits to /api/orders/submit.
- Customer name required; email collected; phone optional. Server-side total validation.
- Lands pending; auto-confirms only if truck.auto_accept and slot capacity allows.
- Button label: "Place order". Modifier popup on item tap. Sends truck notification (WhatsApp on Max, else email).

## Auto-accept logic

Only customer-path orders are subject to auto_accept. The behaviour of resolveAutoAcceptSlot():

- **Slot has capacity** → confirm at the requested slot.
- **Requested slot full, a later slot has capacity** → bump forward and confirm (slotChanged: true).
- **All slots full** → left pending (canConfirm: false); not rejected, not confirmed; operator handles it. Customer still receives a "pending" email.
- **No slot requested** → confirm immediately.
- **Unrecognised slot** → short-circuits to confirm.

When auto_accept is false the customer path skips this block, but the slot-capacity check at submission still runs (a full window returns 409, order never created).

### Per-event booking lock (V6.4)

> **RULE** — The capacity claim is protected by a per-event INSERT-mutex: `booking_locks`, keyed `(truck_id, event_date)`, acquired before the fresh capacity read and released after the insert. ~1s retry, 10s stale TTL, contention→pending fallback (never a hard error). Both the customer claim path and ASAP go through it; reassign-or-pend is preserved. The lock is keyed by date, so two same-date events serialise together — conservative but correct. New migration: 20260608_booking_locks.sql.

> **RULE (V6)** — Auto-accept description copy: "Orders confirm automatically. If the requested slot is full, the order bumps to the next available slot. Only confirms when there is capacity." No amber "review regularly" warning (auto-accept is programmatically capacity-safe).

## Dashboard event scoping (V6)

With no event selected, every event-scoped surface degrades gracefully:

- **Orders tab** — amber "No event selected" box with a Select event button; tab count reads 0.
- **Add Order** — items can be added but Confirm is disabled ("Select an event to confirm"); basket persists when the event changes.
- **Menu & Stock** — catOrdered and itemOrdered return 0; Auto-accept, kitchen capacity, offline protection cards render only when an event is active.

### Orders must carry event_id; the dashboard filter is resilient (V6.3, resolution hardened V6.4)

> **RULE** — Both order insert paths MUST write event_id. The dashboard display filter is resilient: event_id is primary, with an event_date + van_id fallback.

> **RULE (V6.4) — resolve event by id, never guess by date.** The customer order page sends the chosen `event_id` and the submit route resolves by that id directly. Previously it re-derived from `(truck_id, event_date)` with `.maybeSingle()`, returning NULL whenever a truck had 2+ non-cancelled events on one date (null event_id, wrong display number, invisible order). The fallback (no event_id sent) resolves by date with `.order(...).limit(1)` and warns on ambiguity. Customer orders also set `van_id`. `eventKitchenCapacity` takes the order's event_id.

> **RULE** — Never setState from a failed fetch. A 429 on /api/events/manage was wiping upcomingEvents to []. Fetches must check res.ok before setting state; the last active event is cached in a ref.

## Pause and extra wait

- **Pause orders:** stops customer ordering for the active event's vehicle until resumed.
- **Extra wait:** global delay on all collection estimates, 10-minute increments.
- Both show a persistent banner on KDS and dashboard.

### Manual pause is van-scoped (V6)

> **RULE** — set_paused writes to truck_vans.paused_until scoped to the active event's van_id, NOT trucks.paused_until. Falls back to trucks.paused_until when there is no van. The pause button is gated on activeEvent?.status === 'open'.

> **BACKLOG** — The operator UI reload still reads pause state from trucks.paused_until. Update before scaling multi-van operators.


# 6. Prep time and queue logic

## Queue-aware ready time formula

> **FORMULA** — totalQty = queueByCat[cat] + newByCat[cat]; finalBatch = ceil(totalQty / batchSize); prepSecs = finalBatch × prepSecsPerBatch

This is the same logic used by the live truck dashboard and the customer pre-order page. calcQueueAwareReadySecs in lib/prep-utils.ts is the only implementation.

## Batch logic

New items are placed AFTER the existing queue. If batch 2 has space, new items slot into batch 2 and finish alongside it. If batch 2 is full, they spill into batch 3. Kitchens do not restart a partially-filled batch for a new order.

## Categories cook in parallel

When an order contains multiple categories (pizza + sides), ready time is the MAX across categories, not the sum. Pizza taking 8 minutes and sides taking 2 minutes are ready together at 8 minutes. (V6.4: the oven-occupancy projection likewise treats categories as cooking on independent equipment — see the shared-equipment caveat in the capacity-engine subsection below.)

## Buffer application

- Truck dashboard passes waitMinutes × 60 + 120 (manual wait override + 2 min handoff buffer).
- Customer pre-order page passes 0 (no buffer — the event has not started yet).

## Customer page is a pre-order context

The customer page calculates ASAP from event.start_time, not new Date(). A customer pre-ordering at 10am for a 17:00 event sees ASAP = 17:00 + prep, not now + prep. Fundamentally different from the dashboard which calculates from now.

## ASAP is event-date aware

getAsapSlot in lib/slot-utils.ts takes an optional eventDate. For a future-date event it returns the first available slot regardless of current time. For today's event it uses current time as the floor (event start if not yet open, else now). Build dates with new Date(y, mo-1, d, h, m) (local), never new Date('YYYY-MM-DD') then setHours.

### Date-aware slot floors — local date, never UTC (V6.4)

> **RULE** — Every "is this event today / has this slot passed" gate must decide the event's date with a LOCAL Y-M-D, never `toISOString()` (UTC). There are FOUR such floors and they must agree: `/api/slots` (earliestCollectionMins / too_soon), `buildSlotAvailability` (is_past), `getAsapSlot` (the asapSlot fallback), and `isEventClosed`. A shared `localTodayIso()` helper (lib/time-utils.ts) is the single source.

> **BUG FIXED (V6.4)** — A future-dated event's slot picker offered slots only from the current wall-clock time. The "is this event today?" check used the UTC date while the floor compared against the local clock; in the behind-UTC evening window (e.g. 20:05 BST on the 8th) UTC had already rolled to the 9th, so a 9 June event read as "today" and got the 20:05 floor applied. For a future-dated event the whole event is in the future → no wall-clock floor → all in-window slots are selectable. Today's event mid-service still floors at now+lead (unchanged). Lesson: when the same date logic is reimplemented in several places, fixing one floor is not enough — enumerate every gate.

## ASAP queue-aware calculation (V4)

The ASAP slot calculation must use a single formula everywhere. calcQueueAwareReadySecs in lib/prep-utils.ts is the only implementation. The queueByCat input comes from the /api/slots API (which includes "modified" status orders) — never rebuild it from the orders prop on the dashboard. The dropdown and the sub-label below the slot picker must always agree.

### ASAP base time — never add prep on top of event start (V5)

> **FORMULA** — ASAP base = max(now + totalSecs, eventStart). Never eventStart + totalSecs.

In the Add Order panel, the ASAP collection time is the later of (now + prep) and the event start — not the event start with prep added on top. For an event that has not started yet, ASAP is simply the event start (prep runs during the lead time); for an event already underway, ASAP is now + prep.

### Unified ASAP push formula — client and server share one helper (V6.3)

> **RULE** — calcQueuePushSecs in lib/prep-utils.ts is the single implementation of the queue-push seconds, imported by BOTH the Add Order panel and the server /api/slots/[truckId]. They must agree to the second. The unified rule: t = max(now + totalSecs, eventStart + pushSecs). For a future event with an empty queue this is exactly the event start (no boundary discontinuity); a future event no longer shows the event END time as ASAP.

### Kitchen/assembly category split reads the DB config (V6.3)

> **BUG FIXED** — after category prep times moved to the DB, getCatConfig was returning {secs:0} for ALL categories, so the kitchen-vs-assembly prep split was broken for EVERY truck. It now reads categoryConfigs[cat].secs. Any code computing a per-category split must read the resolved DB config, never a hardcoded or zero default.

### Oven-occupancy capacity engine (V6.4 — replaces the V6.3 directional model)

> **MODEL** — `projectOvenOccupancy` (lib/slot-availability.ts) is a continuous per-category FIFO simulation across production windows. For each window: occupancy = items still cooking (carried forward from earlier windows) + items starting in this window. Per-window throughput is `rate = batch_size × (windowSecs / prep_secs)`. When window == prep (e.g. 5-min window, 5-min prep) the rate is exactly `batch_size`; a slower category (10-min prep on 5-min windows → rate = batch_size/2) spreads a batch across multiple windows. `prep_secs == 0` (instant items: drinks, dips) never occupies the oven.

> **RULE — kitchen_capacity counts ITEMS, not batches.** kitchen_capacity is a per-window cross-category ceiling on total items cooking. TWO constraints bind a window: (a) the global item ceiling (total items in the window ≤ kitchen_capacity — a cross-category backstop), and (b) cumulative per-category throughput (the FIFO rate above). The per-category math lives in `calcReadySecsByCat` / `calcQueuePushSecsByCat` (lib/prep-utils.ts) — one formula, no fork.

> **RULE — the ceiling reddens, it does not slow.** kitchen_capacity makes a window RED when total cooking ≥ capacity, but does NOT slow any category's drain rate — each category drains at its own batch rate. This assumes categories cook on INDEPENDENT equipment. For a truck whose categories share one oven/fryer, the projection runs optimistic. A shared-equipment model is a deeper change (backlog, Section 27).

> **RULE — tail-completion placement.** ASAP and auto-accept resolve an order to the window where its LAST item finishes cooking in the projected queue (project with the order folded in; find its tail-completion window), NOT "first non-red slot". This tells the customer the truthful ready time. If the tail-completion window would fall after event end → pending (never rejected). The chosen-slot (non-ASAP) path measures the tail from the chosen slot.

> **RULE — one helper for dots and placement.** The same projection drives BOTH the operator traffic-light dots AND the ASAP/auto-accept placement. The dots are queue-only; the basket affects only the live ASAP estimate, not the dot colours.

> **VERIFIED EXAMPLES (test-kitchen, batch 4, 5-min window == 5-min prep, capacity 6):** 1 pizza @17:20 → 17:20 AMBER "Pizza 1/4", 17:25 GREEN. 10 pizzas @17:00 → 17:00 RED 4/4, 17:05 RED 4/4, 17:10 AMBER 2/4, 17:15+ GREEN. 4 pizzas @17:00 → 17:00 only. Rate scaling: a 10-min-prep category on 5-min windows runs at rate 2.

> **TWO BUGS FIXED in the rate/carry math (V6.4):** (1) the displayed denominator was doubled because the rate used the caller's `slot_duration`-based windowSecs; it now derives the real step (`stepSecs`). (2) A single sub-batch order lit two windows because two 5-min display rows mapped to one production bucket; units are now read only on the first collection row per production_slot (countedSlots).

## ASAP cancellation cutoff (V6)

For ASAP orders (null slot), the cancellation cutoff falls back to the event end_time. /api/orders/cancel joins truck_events!event_id (end_time) and computes effectiveSlot = order.slot ?? event.end_time ?? null; if neither is available the cutoff check is skipped.

> **POST-TRIAL CONSIDERATION** — Store a ready_time on the order row at submit time so the cancellation cutoff has an exact target.

## Time rounding and display

- Customer-facing ASAP rounds to NEAREST 5 minutes. ASAP button shows "Around 17:10".
- Truck dashboard shows exact ready times.
- Times display as HH:MM throughout — seconds stripped via the shared **formatTime** helper. Never inline t.slice(0,5).

## Slots API contract

The slots API (/api/slots/[truckId]) returns the slots list with availability flags, queueByCat, and catConfigs so the customer page can do queue-aware ASAP client-side. As of V6.3 the availability flags include too_soon as a separate field (Section 10).

## prep_secs and batch_size defaults

In the menu API, prep_secs and batch_size return null when unset, NOT 0. Consumers use || 0 for the "instant items" interpretation and fall back to DEFAULT_CAT_CONFIG when truly missing.

> **NOTE (V6)** — A null batch_size means "no limit" and renders as a blank input with an ∞ placeholder. Watch for legacy rows storing a sentinel like 999 — clean these to null.

# 7. Customer order page UX

## Collection time default

On the customer order page, ASAP is auto-selected by default (asapChosen initialises to true). ASAP and Choose Time remain mutually exclusive.

## ASAP button visual states

- Deselected, available: white background, slate border, orange ASAP text and time.
- Selected: solid orange background, white text.
- Unavailable: greyed out, "Unavailable" label.

> **RULE (V6.4) — ASAP is a first-class selection.** ASAP is genuinely selected by default on load (the customer can place an order immediately, no tap required) and the submit payload sends `slot: null` for it (the server resolves it via tail-completion, Section 6). It PERSISTS across basket changes — adding/removing items recomputes the "Around HH:MM" estimate but never clears the selection. Only an explicit tap on a specific time deselects ASAP. `asapChosen` is the single source of truth for both the highlight and the submit.

## Choose Time visual states

- Deselected, premium enabled: white background, dropdown showing "Choose time".
- Selected: solid orange background showing the chosen time.
- Free tier: greyed out with "ASAP only" subtitle, NO premium badge.

> **RULE (V6.3)** — the customer slot picker shows only cleanly-available slots. Full and too-soon slots are HIDDEN entirely. The slot traffic-light is an operator-only affordance (Section 10).

## Time selection premium flag

trucks.time_selection_enabled controls whether Choose Time is functional. Default true; set false for free-tier trucks.

## Slot auto-clear on basket change

If the customer picks a specific time then adds items that push ASAP past it, the chosen time auto-clears. The Choose Time dropdown only shows slots at or after the calculated ASAP.

## Reaching the order page — the profile page is the event chooser (V6.5)

> **RULE (V6.5)** — On HatchGrab, the truck profile/schedule page (`/trucks/[slug]`) is the canonical place a customer picks WHICH event to order for. Each orderable event renders an Order button, gated `isHatchGrab() && event.source === 'operator'` — so it shows only on hatchgrab.com (Village Foodie's copy of the page is read-only) and only for confirmed operator events (a pending/scraped event is customer-invisible per the status gate, so no button). The button deep-links to `/trucks/[slug]/order?event_id=…`, threading the chosen event straight into the order page (which resolves by that id — Section 5). The cart/trolley emoji on the button was removed (plain "Order" reads cleaner).

> **RULE (V6.5)** — The order page's "Change event" control navigates BACK to the profile page (`/trucks/[slug]`), the event chooser, rather than opening a second event picker on the order page itself. One chooser, one place — the profile page lists the events; the order page orders for one. (Piece A of the order-page consolidation; further consolidation of the in-order-page picker is follow-on.)

## Event lookup pattern (V4)

The events API (/api/events, /api/menu/[truckId]/events, and any truck-scoped API) must support both slug and UUID lookups. Customer URLs use slug; dashboard surfaces use UUID. Try slug first, fall back to UUID. (V6.5: /api/events resolves slug-then-id with NO is_test filter, so an hg_only truck's order page loads by direct URL — see Section 15.)

## Past events filtered (V4)

Future-dated events with end times already passed must not appear in the customer event picker. isPastEvent uses local-time parse: `new Date('${event_date}T${end_time}') < new Date()`. Never new Date('YYYY-MM-DD') then setHours. The same rule applies on the Schedule tab, where past events show a grey "Finished" badge (except cancelled events which show "Cancelled" — V6).

## Phone optional (V4)

Phone is collected but never required for customer self-orders. The submit guard checks name and email only.

## Item notes (specialInstructions) — V4

Categories have an allow_notes boolean (default false). When enabled, items show a "+ Add note" affordance (no modifiers) or the note field in the modifier popup. The operator Add Order panel ALWAYS shows the note field. Field name is specialInstructions end-to-end. Use the shared ItemNoteInput component.

## Event card display (V4)

📍 prefix on venue (font-semibold text-slate-800), date/time muted, "● Open now" inline green badge when current time is between event start and end.

## Footer and layout

- Footer padding-bottom uses iOS safe-area-inset-bottom. Dynamic footer height via ResizeObserver. No discount code input. Categories group in the truck's drag-and-drop sort order.

## No server roundtrip on basket change

ASAP is calculated entirely client-side from category configs and queue data in the initial slots API call.

## Category name lowercase consistency

All category lookups use lowercase keys. Prevents "Pizza" failing to match "pizza".

# 8. Deal management

## What is a deal

A deal is a bundle grouping multiple menu items into a single purchase at a discounted price. Stored in bundles_db with up to six category slots.

## Deals on events

- Each deal has apply_to_new_events (default true). Per-event control via the event_deals table (event_id, bundle_id, active, overridden).
- In the Schedule tab, each event card shows deal toggles inside a collapsed `<details>` summary (Section 15).

## Stock-aware auto-hide

> **RULE** — A deal is shown on the customer order page only if it is active for the event AND every slot category has at least one available item. If any slot has no available item, the deal is hidden from customers automatically but still shown to the operator with a "currently hidden" warning.

The menu API supports ?operator=true: operators receive all deals with a stock_warning field; customers receive only available deals. (V6.5: "available" now resolves per-event via the sparse-override read — a deal hides when its slot's only item is sold out FOR THIS EVENT, not truck-wide; Section 30.)

## How deals render on tickets

### Window view (and solo)
- Deal renders as a SINGLE priced line: "🎁 Lunch Deal £12.00". Constituent items indented below, no individual base prices. Modifier upcharges still shown. Standalone items render in category groups ABOVE the deals block.

### Cook view
- No deal labels, no yellow border, no prices. All items merged into category groups and sorted.

## Deal pricing and removal

- Deal price is the total for the bundle. Order total = sum(standalone × prices) + sum(deal prices) + sum(modifier upcharges). Server re-validates on the customer path.
- AppliedDeal.itemsTakenFromBasket tracks which basket items the deal consumed. cleanupDealsForItem in lib/basket-utils.ts is generic over <T extends Deal>.

## Quantity expansion in DealsModal (V4)

DealsModal flat-maps expandedBasketOpts by quantity, giving each unit a unique key ${cartKey}::unit{n}. stripUnit() is the boundary helper. Shared between the operator Add Order panel and the customer order page.

## Inline price editing on deal headers (V4)

[appearance:textfield] to hide spinners; font-bold text-slate-900 text-lg weight; save on blur/Enter, revert on Escape.

# 9. Kitchen Display System (KDS) rules

## Access

Opens from the dashboard header "Kitchen screen" button. Single-vehicle trucks open directly to /kds/[kds_token]; multi-vehicle trucks get a vehicle picker first. Opens in a new tab.

## View modes

- **solo** — mobile/web dashboard view.
- **window** — iPad KDS window mode. Full ticket detail, prices, Mark paid & done.
- **cook** — iPad KDS cook mode. No prices, no deal labels, larger tap targets, Ready button.

## Layout modes

Independent of view mode: list and grid. The in-header switcher toggles them. These layout controls live on the dashboard/KDS directly, not in van settings.

## Header design

Order number large and bold; customer name and slot time secondary. Price inline on window view, hidden on cook view. Header background driven by urgency; text always readable.

## Urgency colour logic

getCombinedUrgency(slotTime, createdAt, status): ready = solid green top border; cooking = amber; otherwise take the MORE urgent of slot-relative and age-based urgency (new <5min, ok 5-15, warn 15-30, late 30+).

> **RULE (V6.3) — urgency is date-aware, age blends only inside 60 minutes.** Two bugs were fixed: (1) the age-urgency blend fired regardless of how far away the slot was; it now blends age in only when the slot is under 60 minutes away. (2) the "prep needed now" check ignored the date; it is now date-aware. A future-dated event must NEVER show red "prep needed now" urgency.

## Card and price layout

Grid mode uses items-stretch; action buttons use mt-auto. "Mark paid & done" uses dark slate. Prices right-align with tabular-nums and a fixed-width price column.

## Category grouping and counts

Section header text-xs font-bold uppercase tracking-widest. Items sorted alphabetically as secondary sort; unknown categories fall into "Other". TO MAKE all-day count bar aggregates base items across all in-flight orders.

## Allergy and notes

Item special instructions shown italic below the item line. Order-level notes shown as a separate red block at the bottom, always visible. Cook view shows notes too.

### Customer contact on the order card (V5)

OrderCard shows a Contact control inline next to the customer name when the order has an email or phone, on all view modes, hidden for walk-ups with no details. customer_email and customer_phone must be in the dashboard orders query and the Order type.

## Per-vehicle KDS settings

show_cooking_step lives per vehicle (truck_vans). It adds a "Cooking" step between confirmed and done.

## Inline stock and category editing in the dashboard (V6)

The dashboard Menu & Stock tab edits category prep and batch inline on the category header. Prep time is a minutes input plus a 0s/30s seconds select; batch size is a number input that is blank when null (placeholder ∞). updateCategoryField saves on blur/change. The category rename, allow-notes toggle, and full category settings remain on the Manage page only.


# 10. Add Order panel

## Purpose

For operators to manually enter orders — walk-ups at the hatch and phone/Facebook pre-orders. Used frequently; must be fast.

## Layout

- **iPad (md: and above)** — split screen. Menu left, live cart and submit right.
- **Phone (below md:)** — single column LIST layout with a + button per item; sticky bottom bar with total and a "Review order →" button.

The desktop grid and mobile list serve genuinely different use cases and are intentionally not unified.

## Fast-tap rules

Tapping an item adds it immediately at base price — no popup. Tapping the same item increments quantity. Modifiers added by tapping the cart line. (Square/Toast POS pattern.)

## Event selection

- The event selector lists all upcoming confirmed events. Auto-selects today's event if there is exactly one. Selecting a future event shows an amber warning. **With no event selected (V6):** an amber "No event selected" box; items can be added but Confirm is disabled. Basket persists across event changes.

### Event bar and in-panel event box (V5)

The active event is in the sticky event bar below the tabs. The Add Order panel keeps its own event box ONLY while the event is not yet live (it carries the Start Event action). Once open, the in-panel box is hidden and the sticky bar is the single source. Event selection is bi-directional via controlledEvent / onEventChange.

### Auto-event selection on dashboard load (V5)

Priority: (1) an event happening now today; (2) an upcoming event today; (3) the next upcoming event on any future date. Runs once, never overrides a manual selection. activeEvent resolves from the full upcomingEvents list.

## Customer details and slot

- Name optional, defaults to "Walk-up". Email/phone behind a collapsible toggle. Slot defaults to ASAP; the operator sees ALL slots except genuinely past ones, each with a traffic-light and an override modal (operator-only, lib/slot-indicator.ts).

### Slot traffic-light — operator-only, customer picker stays clean (V6.3, engine rebuilt V6.4)

> **RULE** — too_soon is its own slot-availability field (lib/slot-availability.ts), no longer conflated into is_past.

- **Operator (dashboard / Add Order)** — sees every slot except genuinely past ones, each with a traffic-light state driven by `projectOvenOccupancy` (Section 6): green (empty), amber (partial — shows the binding per-category count, e.g. "Pizza 2/4"), red ("Full").
- **Customer order page** — NO traffic-light. Only cleanly-available slots are shown; full and too-soon slots are HIDDEN.

> **PRECISE ITEMS-BASED DISPLAY (V6.4).** The dots are driven by the items-based oven-occupancy projection; kitchen_capacity counts ITEMS. RED reads just "Full"; AMBER reads the per-category count ("Pizza 2/4"); GREEN has no label. The leading "·" separator was removed. The internal `bound_by` reason is computed for diagnostics but not shown for red.

> **RULE — operator dots and customer availability use different reads.** The operator dots and ASAP placement run through `projectOvenOccupancy`. The legacy `getSlotIndicator` / `lib/slot-indicator.ts` and `buildSlotAvailability`'s indicator path now serve ONLY the customer available/unavailable flags. Candidates for removal post-trial (Section 27).

## Confirm order button

Label "Confirm order". Disabled until at least one item/deal AND an event is selected (V6). Submits to /api/dashboard/action with action="manual".

## Grace period banner (V4)

Orders for an event ended >30 min show a passive amber banner; the Confirm order button is NOT disabled. Customer-side grace filtering is unchanged.

## Basket persists across tab switches (V6.3)

> **RULE** — AddOrderPanel is always-mounted with an isActive prop, visually hidden when inactive, never unmounted. The basket survives tab switches and event changes; it clears ONLY on successful order placement.

## Modifier rendering inside customise modal

The customise modal calls /api/menu/[truckId] with ?dashboard=1 (all options with their available field). Options where available === false are HIDDEN by the client via isModifierAvailable.

## Cart summary visual hierarchy (V4)

Deal header rows use font-bold text-slate-900 text-lg. Inline price editing on deal headers. Spinner arrows removed via [appearance:textfield]. All cart line rendering goes through OrderLineItem with variant="operator".

## Kitchen capacity and offline protection in the dashboard (V6, updated V6.1)

The Menu & Stock tab shows the slim event bar at the top. When an event is selected it shows (in order) Auto-accept, Kitchen capacity, and Offline protection cards:

- **Kitchen capacity** — the active van's kitchen_capacity (truck_vans). Options: No limit, then 1–20 items. (V6.4 — the copy is being simplified toward an explicit per-category opt-in; see the per-category capacity tickbox on the backlog, Section 27.)

> **RULE (V6.4) — capacity display is read AND written via the service role; never anon.** `truck_vans` is RLS service-role-only (Section 16), so the dashboard's old direct anon-client read always showed "No limit". The card now sources `kitchenCapacity` (and `activeVanName`) from the `/api/dashboard` response and refreshes on the normal 60s poll / realtime; a failed poll must not wipe a good value. The in-card SAVE routes through the service-role `/api/manage update_van_settings`. The displayed capacity keys off the SELECTED event's van. Do not add an anon RLS policy on truck_vans — route through the server.

- **Offline protection** — reads the van's auto_pause_on_offline as the default and the event's offline_protection_override; the toggle writes the per-event override (Section 15). (V6.1 — see the confirm-dialog behaviour in Section 11.)

# 11. Native app and offline architecture

## Why native is needed

Food trucks operate in villages with patchy 4G. A web-only KDS that loses connection during service is a critical failure.

> **DECISION** — A native wrapper using Capacitor must be built BEFORE any trial begins.

## Capacitor wrapper, not React Native rebuild

A Capacitor wrapper (com.hatchgrab.app) around the existing Next.js app, pointing at https://www.hatchgrab.com. Native code only for: offline detection, local order storage, background sound, screen wake, and Bluetooth printer (Max, post-trial). The Next.js UI is reused unchanged.

## Three-stage offline progression

### Stage A — Read-only offline cache (V1 pre-trial)
- Active orders cached to the iPad while online; shown while offline. Cook can mark ready/done — queued locally, synced on reconnect. New orders cannot be created while offline.

### Stage B — Walk-up orders while offline (post-trial)
- Operator adds walk-ups offline with device-generated IDs; server assigns display IDs on reconnect. (V6.3 note: with order_key a client-generatable uuid, the device can mint order_key offline and the display number is assigned at sync. See Section 18a.)

### Stage C — Full offline with reconciliation (future)
- Device UUIDs throughout, display IDs at sync time; slot capacity reconciliation; multi-device conflict resolution.

## Trial scope

Trial begins with Stage A only, in villages with reliable coverage.

## Per-vehicle offline protection

truck_vans.auto_pause_on_offline pauses online orders for that vehicle if its kitchen device goes offline. As of V6 an individual event can override the van default via truck_events.offline_protection_override.

### Offline protection toggle UX (V6.1)

The dashboard Menu & Stock offline-protection toggle confirms both directions through native window.confirm dialogs:
- **Enabling** — warns the device must keep the screen on, and force-enables Screen On.
- **Disabling** — warns online orders will no longer auto-pause for this event.

The toggle uses the unified control styling: w-11 h-6 track, bg-teal-500 when on.

## Heartbeat architecture (V6)

- One last_heartbeat_at column per truck_vans row. Both the KDS page and the dashboard fire a heartbeat every 15 seconds, passing { token, vanId }. The monitor treats last_heartbeat_at older than 30 seconds as stale and, for vans with auto_pause_on_offline (or an event override) on, sets online_paused_until = now + 2h. A live heartbeat receipt clears it.
- **All-or-nothing offline detection is by design** — as long as any one device on the van is online and pinging, the van stays live.

## Wake lock and screen-on (V4)

The "Screen on" toggle in the avatar dropdown requests the Wake Lock API. lib/native/keepAwake.ts must implement: a release listener (re-requests if visible and intent on), a visibilitychange listener (added once via a sentinel), intent tracking (module-level keepAwakeEnabled), and a double-lock guard. enableKeepAwake/disableKeepAwake are legacy aliases — do not remove.

### Browser compatibility

navigator.wakeLock: Chrome since v84, Firefox Android since 72, Samsung Internet since 14, Safari (iOS/macOS) from 16.4. Firefox desktop does not support it. When 'wakeLock' in navigator is false, show an inline amber warning under the toggle.

# 12. Authentication and access

## Operator and staff accounts

- Operators authenticate via Supabase Auth. The operators table holds account-level data; auth_user_id links to the auth user.
- Staff are invited via the Team tab and stored in truck_users (owner/manager/staff). Dashboard access is granted if the user is the truck owner OR a truck_users member. Staff are redirected to their vehicle KDS on login and cannot access the Manage page.

## Four permission levels (V6)

1. **Staff** — redirected to their vehicle KDS; cannot access Manage.
2. **Manager** — all Manage tabs except Billing; edits/invites staff only.
3. **Owner** — full access including Billing.
4. **Admin (platform-level)** — operators.is_admin = true. A platform role, NOT a truck role.

> **RULE** — Admin is a platform role on operators (is_admin), never a truck role on truck_users.

## Sign-out implementation (V4)

> **CRITICAL** — Sign-out must use createSupabaseBrowserClient() from lib/supabase-browser.ts (wrapping createBrowserClient from @supabase/ssr), followed by a hard redirect via window.location.href = '/login'. The plain createClient only clears in-memory state, leaving the SSR cookie. The handler lives inside the UserMenu component.

## Token-based surfaces

Each truck has a long random dashboard_token; KDS uses per-vehicle kds_token. Customer order URLs use the truck slug.

## Email change verification

Changing an operator email writes operator_email_changes and sends a Brevo verification link to the NEW address. Duplicate check is against auth.users. Brevo send is checked — a failed send cleans up the pending row.

### Login identity: which email is the credential (V5)

> **RULE** — auth.users.email is the login credential; operators.email is the display/contact email. Kept in sync on email change but conceptually distinct. /api/auth/me returns operator.email. The email-change flow does a pre-flight auth.users duplicate check, rolls back on failure, and forces sign-out + /login?message=email_changed on success.

### Auth flow hardening (V5)

Password reset: Brevo send checked, cleans up token on failure. Email change: pre-flight duplicate check, rollback, forced sign-out, cancel-pending-change action. Login page: debug logging removed; surfaces Supabase's actual error.

## Admin console (V6, ADMIN_SECRET removed V6.1)

The admin page authenticates solely via the operator's Supabase session. No password prompt, no ADMIN_SECRET, no fallback. Every admin route calls verifyAdmin() server-side (resolves the session to an operators row, checks is_admin). On mount the page calls GET /api/admin?section=check_admin. Shared AppHeader (truckName/truckLogoUrl null), slate-900 tabs, two tabs (🍕 Trucks, 📋 Features).

> **RULE (V6.1)** — Admin authorisation is session + operators.is_admin only. Never reintroduce a shared admin password or env-var secret.

## Slug or UUID resolution pattern

APIs that accept truck identifiers must handle both slug (customer-side) and UUID (dashboard-side). Support both from day one for any new truck-scoped API.

## Known gaps (before public launch)

- Rate limiting on auth attempts (anti-scraping rate limiting on public data routes is done — Section 28).
- ~~Admin secret~~ — RESOLVED in V6.1.

# 13. Operator and multi-truck model

## Operators own trucks

- **operators** — account holder. id, name, first_name, last_name, email (unique, login), phone, auth_user_id, is_admin (V6), billing, stripe_customer_id.
- **trucks.operator_id** is a nullable FK to operators.id. One operator can own multiple trucks.

## Single vs multi-truck UI

> **RULE** — When an operator has ONE truck, the truck name and selector are never shown. With multiple trucks, the selector appears in the event form and the name on event cards. All multi-truck UI is gated on operatorTrucks.length > 1.

- What stays at truck level: menu, categories, items, orders, events, schedules, stock, dashboard_token.
- What is operator level: billing/subscription, login credentials, business name and personal contact details.

## Personal vs business contact

- Personal details (first/last name, phone, login email) live on operators, edited in Team tab. Private, never shown to customers.
- Business contact (email, phone shown to customers) lives on the truck, edited in Settings under "Business contact".

# 14. Vehicles (trucks under a brand)

## Concept and naming

> **NAMING** — The UI calls a physical vehicle a "truck". DB tables remain truck_vans / truck_user_vans. User-defined vehicle names are operator data and must never be auto-changed. A "truck" brand record is a row in trucks; a "vehicle" under it is a row in truck_vans.

Settings section is "Your trucks" with "+ Add truck". Each vehicle renders as its own bordered card (V6.1) showing its name (bold), a "Protected" badge when offline protection is on, and Rename/Delete.

> **RULE (V6.1)** — Adding a truck shows a window.confirm billing-warning dialog before creation.

## Per-vehicle settings

- **auto_pause_on_offline** (boolean) — an event can override via truck_events.offline_protection_override (V6).
- **show_cooking_step** (boolean) — adds the Cooking step on this vehicle's KDS.
- **kitchen_capacity** (integer, nullable) — max items cooking per production window; instant items (prep_secs 0) do not count; blank = no limit. Options No limit then 1–20 items. Editable from Settings and the dashboard Menu & Stock tab. (V6.4: the slot engine counts ITEMS, not batches; reads/writes via the service role — Section 10.) A per-category opt-in is on the backlog (Section 27).
- **display_layout and split_screen** columns exist in the DB but are NOT exposed in van settings.

## Kitchen capacity wiring

When an event is created/confirmed with a vehicle assigned, slot_capacity rows are written using that vehicle's kitchen_capacity. No vehicle, or no capacity, means no limit.

> **NOTE (V6.4)** — The live oven-occupancy engine reads kitchen_capacity through the service-role projection, not the legacy `slot_capacity` cache. The `slot_capacity` rows are vestigial for the projection; the engine works from `production_slot_usage` (event-keyed) + the van's kitchen_capacity.

## Staff vehicle access

truck_user_vans links staff to vehicles. Empty access grants all trucks. Staff see only their assigned vehicle's orders.

## Truck logo (V6.5)

> **NOTE (V6.5)** — The public profile page (`/trucks/[slug]`) reads its truck logo from `discovery_trucks.logo_url` ONLY. The operator-uploaded logo lives in `trucks.logo_storage_path` and is NOT automatically mirrored into the discovery row, so a truck that uploaded a logo in Settings can still show a blank/placeholder logo on its public profile if `discovery_trucks.logo_url` is null. Test-kitchen's null `logo_url` was fixed by SQL this session (pointing it at the storage URL). The systemic fix — the discovery/profile mapping falling back to the linked operator truck's `logo_storage_path` when `logo_url` is null — is on the backlog (Section 27). The header logo SIZE was also enlarged this session (Section 3, AppHeader note).

# 15. Events and venues

## Concept

An event is a truck appearing at a venue on a date and time. The discovery map shows current and upcoming events. Each confirmed event has its own ordering page if pre-orders are enabled.

## Event confirmation

> **RULE** — Events created manually in the Manage page auto-confirm immediately (source='manual', status='confirmed'). Only scraped/uploaded events (inbound via /api/inbound-schedule) arrive as unconfirmed — except operator schedule imports, which save as confirmed (the operator is reviewing them). Unconfirmed events show on the discovery map with the order button DISABLED. Only confirmed events accept orders.

> **CUSTOMER-INVISIBILITY OF PENDING EVENTS (reaffirmed V6.5)** — Every public read path gates event status to `IN (confirmed, open)`. A scraped/pending event is NEVER shown to a customer (no map pin, no order button, not orderable by direct URL). This is the load-bearing fact behind the best-effort venue matcher (Section 25): a best-effort venue guess on a pending event is only ever seen by the TRUCK during approval, so the truck validates and corrects it before it can reach a customer.

### All event sources flow to truck_events — the scraper bridge (V5, gated by preference V6.2)

> **RULE** — Every event source — the scraper, vendor emails to schedule@villagefoodie.co.uk, and manual entry — can end up in truck_events for a linked truck. Inbound (scraper/email) events arrive unconfirmed; manual entries and operator imports are confirmed on save.

Bridge mechanics in /api/inbound-schedule: after writing discovery_events, it normalises the incoming truck name, matches discovery_trucks rows with a hatchgrab_truck_id set, and inserts a truck_events row (status 'unconfirmed', source 'scraper') after a dedup on truck_id + event_date + venue_name. Venue coordinates are looked up via the venue matcher (Section 25). A best-effort notification email fires once per truck per batch (fire-and-forget).

> **RULE (V6.2) — bridge is gated by scraper_preference.** Only trucks set to 'auto' have scraped events bridged into truck_events and the operator emailed. A truck set to 'manual' (default) skips the truck_events insert. The discovery_events write is unaffected either way. A legacy value of 'both' is treated as 'auto'.

Linking is a one-time admin step: the admin console's "Link HG truck" dropdown sets discovery_trucks.hatchgrab_truck_id.

## Discovery / operator-events visibility (rebuilt V6.5)

> **CRITICAL (V6.5) — the operator-events branch was dormant and is now visibility-gated.** `/api/discovery/events` reads two sources: discovery_events (scraped public data) and truck_events (operator events for linked trucks), merging and deduping at read time. The operator-events branch had been ERRORING on a phantom `trucks.is_test` column (which does not exist — Section 16) and silently returning `[]`, so operator events were dormant on BOTH domains. The fix:

- **Removed the phantom `is_test`** from the operator-events select and filter — reviving the branch (it now returns the linked trucks' confirmed/open events).
- **Gate each operator event by its LINKED discovery truck's `visibility`.** discovery_trucks / discovery_events carry a `visibility` enum: `public` | `hg_only` | `hidden`. The host allowlist is `villagefoodie → ['public']`, `hatchgrab → ['public','hg_only']` (so hatchgrab sees public AND hg-only; villagefoodie sees only public; nobody sees hidden). An operator event inherits the visibility of its linked `discovery_trucks` row.

> **RULE (V6.5) — gate via a DEDICATED UNFILTERED visibility fetch, not `trData`.** To know a linked truck's visibility you must fetch `hatchgrab_truck_id → visibility` from discovery_trucks WITHOUT the visibility filter already applied. Reusing the visibility-filtered `trData` (the list already narrowed to the host's allowlist) would mean an `hg_only` truck is simply absent from that list, and a naive "not found → default public" would then LEAK it onto villagefoodie. The dedicated unfiltered map returns the true visibility for every linked truck, so an `hg_only` operator event is correctly excluded from villagefoodie and included on hatchgrab. (This was a sharp trap: the safe-looking default is the leak.)

This replaces the V6 "operator events show on both maps unconditionally" rule and the V5 host-based "HatchGrab-only" rule — visibility is now a per-truck DATA property (the discovery row's enum), not a host hardcode.

> **TEST-KITCHEN (V6.5)** — test-kitchen's discovery_trucks + discovery_events rows were flipped `public → hg_only` by SQL. Result: hatchgrab.com/trucks/test-kitchen resolves with its schedule and order buttons; villagefoodie 404s/hides it. This ALSO fixed a pre-existing leak — test-kitchen had been a public discovery row, visible on the live villagefoodie map. NOTE: `/trucks/test-truck` (the id) 404s — use the slug `test-kitchen`; the order page tolerates the id via its slug-then-id fallback, but the profile page resolves by slug.

## Scraper preference and self-service verify (V6.2)

Three columns on trucks: **scraper_preference** ('manual'|'auto', default 'manual'; legacy 'both' = 'auto'), **schedule_url** (text), **scraper_rule** ('scroll_lazy'|'scroll_next').

### Settings → "Your schedule"

Two radio cards: "I'll upload the schedule myself" (default) and "Find my events automatically" (reveals a schedule URL field with an inline Verify button).

### Verify flow

- **Blocked-domain check** — isBlockedDomain rejects Facebook/Instagram URLs on blur and before fetch; never persisted.
- Pressing Verify shows an amber "Checking your website... up to 2 minutes" box.
- The request hits **app/api/manage/verify-schedule-url/route.ts** — a self-contained Puppeteer scrape that runs BOTH scroll rules and calls extractScheduleEvents. The winning scroll rule is stored on trucks.scraper_rule. Returns { found, events, reason }. export const maxDuration = 60.
- On success the import review modal opens on the Settings tab without switching tabs (Section 22).

### Schedule tab info strip

Shows the truck's current preference with a "Change in Settings" link.

### Approval queue for scraped events

Linked, auto-preference trucks see scraped, still-unconfirmed events under a **"Needs your approval"** heading with Approve / Edit & Approve / Reject actions.

## Import schedule (operator upload) — review UX rebuilt V6.2

A 📤/✨ Import schedule button on the Schedule tab header opens a dedicated modal with a drag-and-drop upload zone, a paste-text area, and a "Process schedule" button. Once events are extracted, the upload UI is hidden.

The route app/api/manage/process-schedule/route.ts verifies the token, reads input, calls extractScheduleEvents, and returns { events } with the ExtractedEvent fields. No DB writes, no dedup, no truck name. A ~40-line wrapper around the shared library.

### Time entry — 30-minute dropdowns (V6.2)

**SCHEDULE_TIME_OPTIONS** — 30-minute increments 07:00–23:00, shared by the import review AND the Add/Edit event form. Start and end always paired; end filtered to options after start. **applyStartTimeChange** auto-populates end at start +3h (clamped to 23:00); moving start past end auto-clears end. process-schedule discards any event where end ≤ start.

### Review UX — breakpoint-divergent (V6.2)

Field order on both: **Date → Venue name → Area + Postcode → Start time + End time → Van**.

**Mobile** — compact ~90px summary cards, three states: collapsed (one-glance summary), focused (auto-opened for incomplete cards, only the missing fields), fully expanded (Edit affordance). No Done button. focusedEventIds / expandedEventIds are only ever added to.

**Desktop** — an always-editable inline table, table-layout: fixed with an explicit colgroup (checkbox 32px, date 130px, venue 220px, area 150px, postcode 100px, start 100px, end 100px, delete 36px). Incomplete rows get an amber highlight.

An attention banner counts incomplete events; Save is disabled until every selected event is complete. The "Area" label is "Area (village, town or city)".

### Historical (past-dated) events (V6.2)

Past-dated events render in their own "Past dates — update to save" section; their checkbox is disabled and seeded selected: false. Editing a past event's date to a future date auto-selects it. An _originalDate snapshot keeps the card in the historical section regardless of later edits. Save count only includes selected future events.

### Exclusion list interaction (V6.2)

Deleting an event (or rejecting a scraped event) prompts "exclude similar?": "Yes, exclude" adds the normalised venue_name via add_exclusion_term; "Just remove" doesn't. Excluded events show struck-through in a collapsed `<details>` with an Add back button (removes by term, not id). selectedEvts is derived from includedEvents only.

### Address field (V6.2)

ExtractedEvent.address is optional; the prompt is instructed never to put a town or postcode in the address.

### Saving

saveExtractedEvents geocodes via geocodeLocation and writes via upsert_event (status 'confirmed', source 'operator_upload'). The review UI is shared with the Add event modal's upload mode and the Settings Verify flow.

### Geocoding and the Fix button (V5)

Manual events geocode via Gemini from venue name + town + postcode, with an api.postcodes.io fallback when the postcode is present. Events with null coordinates show a Fix button (update_event_coords). Always build dates with local-time parse.

## Auto open/close (truck-level)

trucks.default_auto_open and default_auto_close live in Settings → Order settings. Events open for online orders at start time and stop at end time per these defaults.

> **BACKLOG (V6.4) — auto open/close not firing.** With "Open for orders automatically" ON and the event start time passed, the dashboard still showed the event as Closed with a manual Start Event button. Needs diagnosis-first: clarify whether "open for orders" (the auto toggle) and "event started" (the Start Event control / event `status`) are DISTINCT states or the same. Auto-close likely has the same gap. See Section 27.

### Event lifecycle controls — Start, Restart, Close (V5)

- **Start Event** — opens a confirmed event for orders. Status ● Live (green).
- **Restart Event** — reopens a closed event.
- **Close** — sets status 'closed'; only an 'open' event can be closed. Status ● Closed (slate). Pausing shows ⏸ Paused (amber).

> **RULE** — Closing an event must be recoverable. A closed event still appears in the picker (confirmed, open, AND closed) with a Restart Event button. Cancelled events remain excluded.

## Cancelling an event (V6)

The Cancel action opens a confirmation modal with an optional reason and message. On confirm, the event status is set to cancelled and all pending/confirmed orders are cancelled; each affected customer with an email receives a Brevo cancellation email. Refunds are NOT yet automated (backlog).

> **RULE** — openEventCancelModal fetches the real affected order count from /api/events/affected-orders before showing the modal. Never hardcoded to 0.

> **RULE (V6.3)** — Event cancellation queries affected orders by event_id and bulk-cancels by order_key (`.in('order_key', …)`), NEVER by display id (Section 18a).

> **RULE (V6.4) — cancel must rebuild production_slot_usage.** Both event-cancel and event-delete now call `rebuildProductionSlotUsage(truckId, eventDate)` after cancelling the orders (recomputes from LIVE orders only). The order-level cancel paths already did this; event-level cancel was the gap. `rebuildProductionSlotUsage` stays date-scoped.

## Add/Edit event form

- **Field order (V6.1)** — Date, Venue name, Full address, Area + Postcode, Start/End time, Van, Notes.
- Date blank on open; times pre-fill from the most recent event. Mandatory: date, venue name, start/end time (and van when multi-van).
- **Friendly date display (V6.1)** — "Wed 3rd Jun" via a clickable styled div over a hidden native date input.
- **Time inputs (V6.2)** — the shared SCHEDULE_TIME_OPTIONS 30-minute dropdowns.
- Venue name is a combobox — selecting a recent venue auto-fills town/postcode/address/times. A "Copy a recent event" row offers one-click duplication (source van_id preserved).

> **RULE (V6.1)** — Events must be attached to a van. Single van auto-assigned silently; with 2+ vans the selector is required.

## Event card display (Schedule tab, rebuilt V6)

Date-anchored card: a left column with day name / large orange day number / month and a thin divider; venue + town with an inline status badge (town omitted when already in the venue name); the time prominent; the postcode on its own muted line. Actions right-aligned (Copy, Edit, Cancel). Deals collapsed into a `<details>` summary. Past events show Copy only and no deals; cancelled events show "Cancelled", other past events show "Finished". Scraped unconfirmed events for an auto-preference truck appear in "Needs your approval".

### Offline protection override on the event (V6)

truck_events.offline_protection_override (nullable boolean): null = use the van default; true/false = explicit per-event override set from the dashboard. The menu API checks the event override first.

## Multiple events handling

Distinct order queues per event; per-event order numbering (display ids restart at 1 per event) is the V6.3 model (Section 18a).


# 16. Database schema essentials

## Core tables

- **trucks** — one row per truck/brand. Holds plan, settings, dashboard_token, operator_id, default_auto_open/close, qr_code_style (V4), slug (V5, unique, URL-safe — used by /trucks/[slug]/order; prod-verified to EXIST V6.5), active (prod-verified to EXIST V6.5), truck_emoji (V5), logo_storage_path (operator-uploaded logo — note it is NOT mirrored to discovery_trucks.logo_url, Section 14), lifetime_discount_pct / lifetime_discount_note (V6), paused_until, order_counter (V6.3, int default 0 — no-event fallback display counter), and the scraper-preference / adaptive-scheduling columns (V6.2).

> **RULE (V6.5) — there is NO `trucks.is_test` column.** Prod verification confirmed `trucks.is_test` does not exist. Code still references it in places (the discovery/events operator branch did — fixed V6.5 — and admin/manage paths still do — backlog). Declaring or selecting `is_test` errors or silently returns nothing. The "filter test trucks from the public map" effect is achieved via the discovery row `visibility` enum (set a test truck's discovery rows to `hg_only`), NOT a trucks column. See Section 4 (is_test scope) and Section 27.

> **RULE (V6.2)** — trucks.id is **text**, not uuid. Every FK column referencing trucks(id) must be `text` — including scraper_run_log.truck_id, excluded_terms.truck_id, and increment_order_counter(p_truck_id text). Declaring them uuid fails the migration or silently never matches.

### Scraper-preference and adaptive-scheduling columns on trucks (V6.2)

- **scraper_preference** (text, 'manual'|'auto', default 'manual'), **schedule_url** (text), **scraper_rule** (text, 'scroll_lazy'|'scroll_next'), **scraper_last_changed_at** (timestamptz), **scraper_update_day** (smallint 0–6), **scraper_learning_complete** (boolean default false), **scraper_last_empty_notify_at** (timestamptz), **scraper_first_run_at** (timestamptz), **scraper_last_hash** (text). See Section 24.

- **operators** — first_name, last_name, phone, email, auth_user_id, is_admin (V6), billing.
- **truck_vans** — auto_pause_on_offline, show_cooking_step, kitchen_capacity, display_layout, split_screen, kds_token, name, active, last_heartbeat_at, online_paused_until, paused_until.
- **truck_users** — role (owner/manager/staff), email, name, auth_user_id, invited_at, accepted_at.
- **truck_user_vans** — staff ↔ vehicle access junction.
- **operator_email_changes** — old_email, new_email, token, requested_at, verified_at, expires_at.
- **menu_categories** — sort_order, allow_notes (V4), prep_secs, batch_size (nullable), default_stock (V5.x — the Settings "default stock per event" seed; per-event category stock now overrides this, Section 30), is_active (default true — soft-delete, filtered on read).
- **menu_items_db** — is_available, stock_count (legacy/display), default_stock (the Settings "default stock per event" seed — the live per-event ceiling source, Section 30), allergens, dietary_info, prep_secs, batch_size, **name** (the item-name column — NOT item/item_name; per-event stock keys on this), is_active (default true).
- **modifier_options** — available boolean (V4) — defaults true.
- **bundles_db** — bundle_price, original_price, slot_1..6_category, apply_to_new_events, is_available, start/end_time.
- **event_deals** — event_id, bundle_id, active, overridden.
- **truck_events** — event_date, start/end_time, venue_name, town, postcode, address, notes, status, source, van_id, confirmed_at, offline_protection_override (V6), latitude/longitude, scraped_signature (dedup), order_counter (V6.3). (V6.5: `town` and `postcode` are the columns the venue matcher resolves; there is no venue_id column on truck_events yet — adding it is the keystone for the best-effort matcher's anchors and history-prior, Section 27.)
- **orders** — order_key (V6.3, uuid, PRIMARY KEY — the only identifier in any WHERE/URL/FK/dedupe/React key), id (text — per-event DISPLAY number, restarts at 1, NEVER a lookup key), items (JSONB — carries frozen item NAMES, no item id), deals (JSONB), status, paid_at, collected_at, event_id, van_id, slot. Two partial unique indexes: `UNIQUE (event_id, id) WHERE event_id IS NOT NULL` and `UNIQUE (truck_id, id) WHERE event_id IS NULL`. See Section 18a.
- **event_item_stock (V6.5)** — per-event item stock OVERRIDE. PK `(event_id, item_name)`. Columns: event_id (uuid, FK truck_events(id) on delete cascade), item_name (text — matches menu_items_db.name and the frozen order-line name), stock_count (int nullable — the per-event ceiling override), available (boolean nullable — per-event sold-out override). A row exists ONLY when the dashboard has edited that item's stock for that event; absence means "read the live Settings default". RLS service-role only. See Section 30.
- **event_category_stock (V6.5)** — per-event category stock OVERRIDE. PK `(event_id, category)`. Columns: event_id (uuid, FK), category (text), stock_count (int nullable). Same sparse-override semantics. RLS service-role only. See Section 30.
- **collection_times / slot_capacity** — fixed slot definitions and per-slot capacity rows.
- **whatsapp_logs** — (V6.3 — migration never applied to prod; does not exist; writes fail silently — Section 27).
- **kds_sessions** — active KDS device sessions.
- **discovery_trucks / discovery_events** — scraped discovery data; `visibility` enum (public|hg_only|hidden) controls public/HG exposure (the load-bearing gate for operator-event visibility, Section 15). discovery_trucks.hatchgrab_truck_id (FK to trucks.id — text) links a discovery truck to its HatchGrab account. discovery_trucks.logo_url is the profile-page logo source (Section 14). Set via the admin "Link HG truck" dropdown.
- **scraper_run_log (V6.2)** — id, truck_id (text), run_at, day_of_week (0–6), events_found, events_changed, rule_used. RLS service-role only. Pruned to 90 days — the ONLY pruned table.
- **excluded_terms (V6.2)** — id (uuid), truck_id (text), term. Unique (truck_id, term). RLS service-role only.
- **upsell_events (planned/unapplied)** — migration never applied; table does not exist. As of V6.3 the insert writes order_key as the order reference.
- **loyalty_cards (planned)** — V4 spec frozen. Do not build until instructed.

## Key columns of note

- venues uses **village** (NOT area — "Area" is a UI label only; the columns are village/town). venues uniqueness = (name, village). truck_events.town and discovery_events.village hold the locality. The venue matcher ranks candidates on normalised village agreement (Section 25).

## Order counters and atomic functions (V6.3)

- **truck_events.order_counter** + **increment_event_order_counter(p_event_id uuid)** → single UPDATE … RETURNING. First call returns 1; NULL if the event doesn't exist (caller falls back to the truck counter).
- **trucks.order_counter** + **increment_order_counter(p_truck_id text)** → the no-event fallback. p_truck_id is text because trucks.id is text.

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
20260608_booking_locks.sql
20260608_production_slot_usage_event_key.sql
20260611_event_item_stock.sql
20260611_event_category_stock.sql
```

### Migration process (V6.2, extended V6.3)

> **RULE** — Migrations are applied manually in the Supabase SQL editor, in filename order, followed by `notify pgrst, 'reload schema';`. New tables must have RLS enabled at creation. Use idempotent (`if not exists`) statements.

> **NOTE (V6.3)** — A full-file paste into the SQL editor can silently run nothing. Run large migrations in CHUNKS and verify each (PK, column existence, function existence) before moving on.

> **APPLIED-MIGRATIONS DRIFT (V6.3)** — 20260529_checkout_upsells.sql (upsell_events) and the whatsapp_logs migration were never applied to prod. Reconcile the applied-vs-file list; assume others from that era may also be missing.

### 20260607_order_key_per_event.sql (V6.3)

Dropped messages_order_id_fkey; added orders.order_key (uuid, PK via a guarded DO block); added the two partial unique indexes; added truck_events.order_counter + increment_event_order_counter(uuid); re-declared trucks.order_counter + increment_order_counter(text); schema reload.

### 20260608_booking_locks.sql (V6.4)

Adds `booking_locks` for the per-event booking mutex: key `(truck_id, event_date)`, a timestamp for the stale-TTL check, RLS service-role only.

### 20260608_production_slot_usage_event_key.sql (V6.4)

Re-keys `production_slot_usage` from date-scoped to event-scoped (Section 6). Adds `event_id uuid REFERENCES truck_events(id) ON DELETE CASCADE`; drops the old PK and adds a unique index on `(truck_id, event_id, production_slot)`; DELETEs the pooled rows; adds a read index. `event_date` is KEPT (the rebuild/cancel orchestrator deletes a whole date in one statement). event_id is uuid, not text (the "FKs to trucks(id) are text" rule is specific to trucks; FKs to truck_events(id) are uuid).

### 20260611_event_item_stock.sql (V6.5)

Creates `event_item_stock` (PK `(event_id, item_name)`; event_id uuid FK to truck_events(id) on delete cascade; item_name text; stock_count int nullable; available boolean nullable). RLS enabled, service-role only, no anon policy. Applied + verified, schema reloaded. See Section 30.

### 20260611_event_category_stock.sql (V6.5)

Creates `event_category_stock` (PK `(event_id, category)`; event_id uuid FK; category text; stock_count int nullable). RLS enabled, service-role only. Applied + verified, schema reloaded. See Section 30.

> **PHASE-2 UNWIND (V6.5)** — an eager-snapshot first attempt (143 item + 55 category backfilled rows) was DELETED when the model pivoted to sparse-override. BBQ Chicken Pizza's old truck-level `item_overrides=25` was migrated to `menu_items_db.default_stock=25` (so it now propagates) and the item_overrides row deleted. lib/event-stock-snapshot.ts and scripts/backfill-event-stock.ts were deleted. The legacy `item_overrides` / `category_stock` tables are now UNUSED by live paths but LEFT IN PLACE for rollback safety (Section 30).

## Realtime

orders — INSERT/UPDATE/DELETE subscribed. trucks — UPDATE only. UI updates within ~1s; 60s polling fallback.

## Row Level Security (V6.1, extended V6.2/V6.5)

RLS is enabled on every table in the public schema. All API routes use SUPABASE_SERVICE_ROLE_KEY (bypasses RLS); the anon key is used only in the browser clients and a few Server Components. RLS governs only direct anon-key access.

- **Public read (anon SELECT, `using (true)`)** — discovery_events, discovery_trucks, venues, trucks, truck_events, menu_categories, menu_items_db, modifier_groups, modifier_options, bundles_db, category_modifier_groups, item_modifier_overrides, item_overrides, collection_times, slot_capacity, category_stock, and orders.
- **Service-role only (RLS on, no anon policy)** — operators, subscribers, password_reset_tokens, operator_email_changes, truck_users, truck_user_vans, truck_vans, kds_sessions, slot_bookings, production_slot_usage, booking_locks (V6.4), event_item_stock (V6.5), event_category_stock (V6.5), event_deals, event_price_overrides, upsell_rules, excluded_terms, scraper_run_log, discount_codes_db, messages, order_counters, referrals.

> **NOTE (V6.4/V6.5)** — `truck_vans`, `event_item_stock`, and `event_category_stock` are service-role-only. The per-event stock reads/writes all go through service-role API routes (the menu API, the dashboard action) — a browser-side anon read would silently return nothing, which is exactly the class of bug that made the kitchen-capacity card show "No limit" (Section 10). Never add an anon policy to "fix" a read — route through the server.

> **RULE (V6.1)** — New tables must have RLS enabled at creation. Decide deliberately between public-read and service-role-only. Both per-event stock tables are internal and service-role only.

# 17. Menu API behaviour

- Slug or ID lookup — /api/menu/[truckId] and /api/orders/submit accept slug or UUID. Try slug first, fall back to ID.
- No active filter on menu lookup — pausing is controlled by dashboard pause state, not the active flag.
- Category data returns name, prep_secs, batch_size, allow_notes.
- Deal stock filtering — customers receive only available deals; ?operator=true returns all with stock_warning. Logo URL derived via deriveLogo to avoid flicker.

## Dashboard flag (?dashboard=1) — V4

- **Without flag (customer-facing)** — modifier options with available === false are filtered out; the available field is not included.
- **With flag (dashboard/operator)** — all options returned, each with available: o.available !== false.

The dashboard's fetchMenu must append ?dashboard=1&nocache=${Date.now()}. Customer-facing calls must not.

## Modifier availability rule (V4)

> **RULE** — Unavailable modifiers are HIDDEN everywhere (customer page AND operator Add Order panel). This differs from main items which show "Sold out" crossed out. The filter is opt.available !== false (shared util isModifierAvailable in lib/modifier-utils.ts), applied in AddOrderPanel.tsx (customise modal) and the customer modifier popup.

## Item availability resolution (per-event as of V6.5)

> **RULE (V6.5) — item availability composes the live base AND the per-event override.** The effective ceiling is `event_item_stock.stock_count (if an override row exists for this event_id+item_name) ?? menu_items_db.default_stock (live)`. Availability is an AND-composition: `(menu_items_db.is_available !== false) && (override ? override.available !== false : true) && (stockRemaining === null || stockRemaining > 0)`. The override can only RESTRICT — it can never re-enable an item the Settings base has turned off (so "Settings unavailable = unavailable everywhere" holds). The item NAME is always read live from menu_items_db.name. This supersedes the pre-V6.5 truck-level `item_overrides` path for live reads (item_overrides is left in place for rollback only). The menu-API ceiling read and the stock-guard ceiling read must use the SAME event_id as getLiveItemCounts (the sold count) — same key, so the oversell invariant holds. A missing override row falls back to default_stock, never to accidental-unlimited and never to 0. See Section 30.

## Soft-deleted categories and items must be filtered (V6.1)

> **RULE** — menu_categories and menu_items_db carry is_active (default true). Deleting sets is_active = false (soft delete). Every read path listing current menu data MUST filter `.eq('is_active', true)` — the menu_categories query AND the menu_items_db query in app/api/menu/[truckId]/route.ts, and the menu_categories query in app/api/dashboard/route.ts. Historical orders are unaffected (orders.items is a JSONB snapshot).

## Offline protection in the menu API (V6)

offlineProtectionEnabled = eventRow.offline_protection_override (if not null/undefined) else van.auto_pause_on_offline. The pause is only applied when true.

# 18. Customer communications and email

## Provider

> **V3** — Email via Brevo. Operator-facing sender is hello@hatchgrab.com via NEXT_PUBLIC_SUPPORT_EMAIL. Do NOT fall back to villagefoodie.co.uk.

## Order ready email

Fires only when status changes to "ready"; only if order.customer_email is set. Subject "Your order is ready".

## Order confirmation email (V4 updates, venue/contact V6.3)

- Cancel link is `/order/{order_key}/manage` (the uuid, no `?truck=` slug).
- **Venue and contact details (V6.3, confirmed V6.4)** — both copies include the venue (name/town/postcode) and contact details driven by trucks.preferred_contact_method. Venue renders from the resolved `eventRow`. A missing venue is a DATA gap (blank town/postcode), not a code gap.
- **No "Discount" line** — deals render as deal name + bundle price → indented modifier upcharges → Total.
- On submit (pending): "Order #X received"; on confirm: "Order #X confirmed". Both via formatConfirmationEmail + sendConfirmationEmail.

## Truck notification

Sent on customer self-order (not manual). WhatsApp on Max (Meta Cloud API where wired), else email. (V6.3 — the Twilio order-notification send was removed.)

## Transactional email integrity

All Brevo sends must check the response and surface failures.

> **RULE (V6.4) — cancellation email branding is HatchGrab.** All customer-facing cancellation emails carry the "Powered by HatchGrab · hatchgrab.com" footer. The operator-cancel email (app/api/dashboard/action) was corrected from "Powered by Village Foodie". Sender ADDRESS is env-driven; only the footer branding text changed. Brand-name-vs-sender split: operator-facing from-name "HatchGrab", customer-facing from-name the truck name, address env-driven.

### Operator-confirm and slot-change emails use the shared formatter (V5)

> **RULE** — Both go through formatConfirmationEmail + sendConfirmationEmail (a DRY fix). formatConfirmationEmail gained a slotAdjustedFrom param (amber "collection time updated" box). The local notifyCustomer() helper remains for reject, cancel, ready, and edit.

> **RULE (V6.3)** — formatConfirmationEmail takes orderKey as a REQUIRED parameter and builds the cancel link from it. The old `?? orderId` fallback was removed. tsc passing guarantees all five callers pass order_key.

### Customer cancel page (V5, updated V6.3)

app/order/[id]/manage/page.tsx loads the order, shows items and status, offers Cancel subject to cutoff rules. /api/orders/cancel verifies allow_customer_cancellation, pending/confirmed status, and the cutoff window.

> **V6.3** — the route segment value is the **order_key uuid**, not the display id; `/api/orders/[id]` (GET) + `/api/orders/cancel` resolve by order_key. order_key is globally unique (no slug needed) and not enumerable. As of V6 the ASAP cutoff falls back to event end_time.

## 18a. Order numbering — the two-id architecture (V6.3)

> **CRITICAL ARCHITECTURE — do not undo.** Orders carry TWO identifiers with opposite jobs. Conflating them caused the 6 June duplicate-key outage (Vercel 23505 on orders_pkey). Never reintroduce `id` into a WHERE clause, nor collapse the two fields.

### The two identifiers

- **order_key** (uuid, NOT NULL DEFAULT gen_random_uuid()) — the row identity and PRIMARY KEY. EVERY lookup, update, WHERE, URL, FK, dedupe Map key, and React key uses it. NEVER shown to a human.
- **id** (text) — the DISPLAY number only ("Order #5"), restarts at 1 per event. Rendered to humans, NEVER in a WHERE clause, key, or URL.

> **RULE** — `order.id` in a WHERE clause / key / URL is a bug. `order.order_key` rendered to a human is a bug.

### Why two ids — the original bug

The orders PK was GLOBAL on `id` alone. nextOrderId checked only `eq('truck_id')`, generating an id free for this truck but taken by another truck's row, colliding on the global PK. The two-id split fixes it permanently: order_key is globally unique row identity; id is a per-scope display number protected by partial unique indexes.

### Per-event restart and the atomic counter

- truck_events.order_counter + increment_event_order_counter(p_event_id uuid) — first call returns 1; NULL if the event doesn't exist (caller falls back to the truck counter).
- trucks.order_counter + increment_order_counter(p_truck_id text) — the no-event fallback (text because trucks.id is text).
- nextOrderId(eventId, truckId) calls the event RPC first, falls back to the truck RPC, returns the bare integer as a string ("5", never "0005"). The DB serialises; no client-side retry.

### Uniqueness

- `UNIQUE (event_id, id) WHERE event_id IS NOT NULL` — per-event numbering.
- `UNIQUE (truck_id, id) WHERE event_id IS NULL` — the no-event fallback.

### Bulk operations and dedupe

- Event cancellation bulk-cancels by order_key (`.in('order_key', …)`), never by id.
- The dashboard payload dedupes with `Map.set(o.order_key, o)`.

### messages.order_id

messages is a log; messages.order_id stores the display id as plain text with NO foreign key (the Studio-added FK was dropped in 20260607). Non-authoritative, never a lookup key, currently written null by every live path.


# 19. Reports tab (V4)

The operator's reconciliation and analytics surface in the Manage page. Tier-gated.

## Tier gating

- **Starter** — Event filter only (filterMode forced to 'event'); Date range toggle hidden; no auto-load. CSV export, Order list, and Items view available.
- **Pro / Max / Trial / Tester** — Full filter toggle, revenue breakdown, items sold ranking, deal performance.

Date-range gating uses canAccess('advanced_reporting', ...).

## Why CSV export is not Pro-locked

Square's free tier offers CSV export. The tier line is *raw data = Starter, analysed insights = Pro*. CSV is raw data; revenue breakdowns and rankings are insights.

## Toolbar layout

[filter controls — 320px min-width] [View report] [📋 Orders] [📦 Items] → ml-auto → [⬇ Export CSV]. Filter container minWidth: 320px, flex-shrink-0.

> **RULE** — Use invisible (visibility:hidden), not hidden (display:none), on Export CSV and the toggle when no results are loaded — reserves space, prevents layout shift.

## Items view

Columns: #OrderID Date Event Time Type Customer Item name ×Qty Unit price Modifiers Item total. Order ID repeats per item row (the per-event display id — a reconciliation reference, not order_key). Deal items prefixed 🎁.

## Shared column class constants

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

customer_email IS NULL → 'Placed by truck' (walk-up); else 'Customer online'. The long-term fix is an orders.source column (TODO comments in submit + dashboard/action). Do not add more callers.

## Revenue calculation

Status filter excludes 'cancelled' and 'rejected'. Cancelled orders show with opacity-50. Revenue breakdown (Pro) is positive-framed: Base items + Deal revenue + Modifier upcharges. No "Discount" line.

## Pro placeholder card (Starter view)

*Date range reporting, revenue breakdown, deal performance, items sold ranking, hourly sales patterns, and event ROI comparison. Available on Pro and Max.*

# 20. Social media and WhatsApp auto-replies

## Four-bucket classification (V6.3)

lib/whatsapp-classifier.ts routes inbound messages into: **SPECIFIC_QUERY** (schedule/location/date), **MENU_QUERY** (menu/prices/ordering → live DB menu summary + order link), **ALLERGEN_QUERY** (allergen/dietary → DB info AND a mandatory safety caveat), **IGNORE** (spam/gibberish).

## Event lookup

Queries truck_events for the truck (resolved by whatsapp_sender), confirmed/open/unconfirmed, from today forward. Be generous. Inject an explicit DATE REFERENCE mapping and label events (TODAY)/(TOMORROW)/(IN 2 DAYS). Include town.

## Interaction logging

Every interaction logs to whatsapp_logs (fire-and-forget). (V6.3 — whatsapp_logs does NOT exist in prod; logging silently failing — Section 27.) possible_miss = SPECIFIC_QUERY with events_found = 0.

## Provider — Meta Cloud API (V6.3, replaces Twilio)

> **RULE** — WhatsApp runs on the Meta Cloud API, not Twilio. The live handler is app/api/webhooks/meta/whatsapp/route.ts; the send helper is lib/meta-whatsapp.ts (sendMetaWhatsApp). The Meta app sits under the Village Foodie Meta Business Account. Env: META_WHATSAPP_APP_SECRET, META_WHATSAPP_PHONE_NUMBER_ID, META_WHATSAPP_ACCESS_TOKEN, META_WEBHOOK_VERIFY_TOKEN, META_WHATSAPP_BUSINESS_ACCOUNT_ID.

> **RULE** — The Twilio handler at /api/webhooks/whatsapp is DORMANT, not deleted. Do not overwrite it. formatWhatsAppOrder is dead code (delete when Twilio is retired — Section 27).

> **PENDING (V6.3)** — the four-bucket smoke tests have NOT been run; whatsapp_logs does not exist in prod. Run the migration and smoke tests before relying on WhatsApp at trial.

## Platform compliance and tone

Official Meta Graph/Cloud API; stay within the 24-hour window; customer initiates. Full URLs, no shorteners. Responses sound like the owner ("Hey! 👋 … — {truckName} {emoji}"). Instagram/Messenger are Pro; WhatsApp is Max only.

### Meta webhook endpoints (V5 scaffolded, WhatsApp wired V6.3)

/api/webhooks/meta/whatsapp, /messenger, /instagram. Each handles the GET verification challenge and a POST. The WhatsApp POST is fully wired; Messenger/Instagram POSTs only log and return 200 (classifier wiring TODO). Shared verify token META_WEBHOOK_VERIFY_TOKEN. Messenger/Instagram remain parked (per-truck OAuth, token storage via ENCRYPTION_KEY / lib/crypto.ts, send API, classifier wiring deferred).

# 21. Competitive positioning

## Hatches Up cost model

4.5% + 20p all-in on online orders, 1.5% + 10p in-person, no subscription fee. Assume their Starter-equivalent is feature-comparable on raw data access.

## Real differentiators

Offline protection; smart queue-aware pacing; social/WhatsApp auto-responses; ticket printing (Max); multi-device sync (Max); time slot selection; auto-accept; village-specific hyperlocal discovery. Digital loyalty stamp cards (Max, coming soon).

## Honest comparison rule

> **RULE** — Be transparent about all costs. "Hatches Up is 4.5% all in. We are £29/month plus 0.99% plus card processing. Above ~£1,750/month online orders we are cheaper, and you get features they do not have." Lead with features; price closes. Migration pitch: "Currently on Hatches Up? Switch and get 3 months free on any tier."

# 22. Development process

> **OPERATOR PREFERENCE** — When presenting any code or file, the file path must appear immediately above it as path/to/file.tsx in bold inline code. Never make Dominic scroll up to find which file to update.

## Two-chat pattern

- **Planning chat (Claude)** — strategy, UX, architecture, Cursor-ready prompts. Does NOT write code.
- **Coding chat (Claude within Cursor)** — implementation, file edits, smoke tests.
- Instructions flow planning → coding; audit reports flow coding → planning.

## Audit before build

Read relevant files and paste excerpts; identify duplications/conflicts; confirm DRY; only then implement.

## Smoke tests

Every change includes a smoke test. Nothing is "done" without an operator-confirmed smoke test.

> **NOTE (V6.3, reaffirmed V6.5)** — A passing data-layer / RPC / tsc-clean smoke test is NOT the same as an operator-confirmed live test. The order-key rebuild passed 9/9 data-layer smoke tests but was never clicked on a real device; the per-event stock build (V6.5) is fully built and tsc-clean but its two-device oversell e2e is still pending. A live iPad click-through still gates the trial (Section 26 / Section 27). "tsc-clean / simulated-pass" ≠ "works" — verify the END STATE on a live run, and confirm DEPLOYED before judging a prod-endpoint result.

## Context limit handling

When a chat hits its limit, open a fresh one, re-prime with file paths and the task, reference this manual, never assume prior decisions are known.

## Always-mounted tab pattern (V6.2, extended V6.3)

> **RULE** — A tab or panel that receives cross-tab props (or that another surface needs to drive) must be **always mounted**, not conditionally rendered on `activeTab === '…'`. It takes an `isActive` boolean prop; it is visually hidden when inactive, never unmounted. Data-loading effects are guarded `if (!isActive) return`. Modals are rendered OUTSIDE the `isActive` gate so they can be opened from another tab. Components on this pattern: the Schedule and Settings tabs and the Add Order panel.

## Shared schedule-extraction utility (V6.2)

> **RULE** — lib/schedule-extract.ts is the single in-repo home for Gemini schedule extraction. Any new route turning text/image into structured event rows MUST import from there. (V6.5 noted the scraper's inline hgPrompt is a divergence — convergence is on the backlog, Section 27.) The two Apps Script paths can't import the module until the Sheets→Supabase migration.

## SQL migrations (V6.2, extended V6.3)

- Run in the SQL editor, in filename order; confirm clean before deploying. Idempotent (`if not exists`) where possible.
- After running, issue `notify pgrst, 'reload schema';`.
- New tables get RLS enabled in the same migration.
- Run large migrations in CHUNKS, not a single full-file paste — a single paste can silently apply nothing.
- Keep an applied-vs-file reconciliation.

# 23. Mobile UX patterns (V4)

## Dashboard avatar dropdown

Everything the operator needs without leaving the page. Five header rows reduced to three: branding row, tab row, slim mobile event bar (sm:hidden). The dropdown order is canonical (Section 3).

## Manage page avatar dropdown

Same UserMenu with showDashboardLink=true. The mobile-only "← Orders dashboard" link is sm:hidden on desktop.

## Menu tab header (mobile)

Three rows: "Menu" + "+ Add category"; "N categories · N items"; "✨ Import menu" outline button (whitespace-nowrap). The Schedule tab's "✨ Import schedule" button mirrors this styling.

## All categories collapsed by default

expandedCat = null on Manage page open.

## invisible vs hidden for layout-reserved elements

> **RULE** — Use invisible (visibility: hidden), not hidden, when a conditionally-shown control would cause layout shift in a fixed toolbar.

## Identity block in dropdowns

Truck name bold, operator first name muted below (currentUserName.split(' ')[0]). Van name is NOT included.

### Preventing iOS Safari auto-zoom (V5)

> **RULE** — Inputs, selects, and textareas must be at least 16px on mobile. globals.css locks these to 16px below 640px. The viewport is width=device-width, initialScale=1, WITHOUT maximumScale/userScalable:false.

### V6.1 manage-page UX pass

- Settings tab is a single centred column (max-w-2xl mx-auto). Heading hierarchy standardised.
- Expand/collapse arrows unified to ▶ + rotate-90.
- Category delete relocated inside the expanded view; the whole collapsed header row is the tap target.
- Category row goes two-line on mobile.
- Upsells rule dropdowns stack on mobile.
- Mobile schedule actions: icons only below sm:, text labels at sm:+.

### Text prominence floor (V6 sweep)

slate-700 body, slate-500 secondary, slate-400 decorative only; orange reserved for current-plan/active highlights. Apply to any new operator surface.

# 24. Scraper workflow (V6, updated V6.2)

The web scraper runs as .github/workflows/daily_scrape.yml (separate from the Apps Script processor):

- **Node 24 (V6.2).** Node 24 has native WebSocket (which @supabase/realtime-js requires). The Puppeteer Chrome issues are resolved on Puppeteer 24.x.
- **Chrome install** via npx puppeteer browsers install chrome (cache cleared first).
- Schedule: cron '0 6 * * *' plus workflow_dispatch. Secrets: SPREADSHEET_ID, GEMINI_API_KEY, GOOGLE_SHEETS_CREDENTIALS, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
- **Gemini quota** — on a paid plan. The HatchGrab loop and lib/schedule-extract.ts use gemini-2.5-flash.

> **NOTE (V6.2)** — actions/checkout@v4 and actions/setup-node@v4 emit a Node 20 deprecation warning; from 16 June 2026 GitHub forces Node 24 for the action runtime. The workflow's own node-version is '24' to match.

## Town extraction strengthened (V6.5)

> **RULE (V6.5)** — The scraper's per-event extractor (the inline `hgPrompt` in the HatchGrab loop) must ALWAYS emit a `town` and SPLIT an embedded place-name out of the venue name. Previously `hgPrompt` requested a town field but returned null whenever the town was embedded in the venue ("The Cavendish Five Bells" → venue kept whole, town null), which starved the venue matcher of its village signal (Section 25). The prompt now carries explicit instructions and few-shot examples ("The Cavendish Five Bells" → venue "Five Bells", town "Cavendish"; "Five Bells, Cavendish" → venue "Five Bells", town "Cavendish"). The town flows through the already-wired chain — prompt → POST `village` field → bridge → findVenue village param → truck_events.town — with no new plumbing. (NOTE: this is the scraper's OWN prompt, separate from lib/schedule-extract.ts's buildScheduleExtractionPrompt, which already had the town split; convergence is on the backlog, Section 27.)

## Adaptive scraper scheduling (V6.2)

State lives on the trucks scraper_* columns (Section 16) and scraper_run_log.

### scraper_run_log

One row per truck per run: truck_id (text), run_at, day_of_week, events_found, events_changed, rule_used. RLS service-role only. Pruned to 90 days — the ONLY pruned table. truck_events and discovery_events are permanent.

### shouldRunToday(truck)

During the learning phase (first 30 days, or while learning incomplete / no day learned) → true every day. After learning → true only on the learned scraper_update_day and the two days following.

### recordRunAndLearn

Inserts the log row; once 30 days elapse, analyses the 90-day history for the day_of_week with the most events_changed=true runs, writes scraper_update_day, flips scraper_learning_complete.

### Hash-based change detection — hashEvents

MD5 over sorted `event_date|venue_name` pairs. If it differs from scraper_last_hash, events_changed is set true and scraper_last_changed_at updated.

### Empty-schedule nudge — checkEmptySchedule

Zero future events → a nudge to the operator's email, 14-day resend guard (scraper_last_empty_notify_at), fire-and-forget.

### Single-truck mode

SCRAPE_TRUCK_ID env var filters to one truck and bypasses shouldRunToday. workflow_dispatch exposes a scrape_truck_id input.

> **PENDING DIAGNOSIS (V6.2)** — a recent run took ~23 minutes before failing. Likely a Gemini rate-limit stall or a hung Puppeteer navigation. Add a per-site navigation timeout and a per-Gemini-call timeout.

## Apps Script screenshot processor (recovered V6.1)

processFoodTruckScreenshots reads schedule screenshots from a Drive folder. Model gemini-2.5-flash (not lite); 14-day date mapping injected; invalid-venue filter; dbVilNorm typo fixed.

> **RULE (V6.1) — API key management.** Four Script Properties: GEMINI_API_KEY, GOOGLE_API_KEY, BREVO_API_KEY, INBOUND_SCHEDULE_SECRET. After ANY rotation, update Script Properties AND the separate GitHub Actions copy of GEMINI_API_KEY, then run testAllKeys().

> **DRY NOTE (V6.2/V6.5)** — the in-repo extraction paths import lib/schedule-extract.ts; the two Apps Script paths (processFoodTruckScreenshots, analyzeEmailWithGemini) AND the scraper's inline hgPrompt remain independent copies needing prompt changes by hand until convergence (Section 3 / Section 27).

# 25. Village Foodie Discovery Map

## Architecture

The Village Foodie public site is a Next.js app in the same repo as HatchGrab. Its discovery map reads from discovery_events and discovery_trucks, with coordinates resolved through venues.

> **CRITICAL** — A discovery event only plots as a map pin if it has BOTH a discovery_truck_id and a venue_id. The map JOINs through venue_id to venues for lat/lng; a null venue_id (or null discovery_truck_id) silently fails to appear.

The venues table is the single coordinate store: name, **village**, latitude, longitude, and an aliases column (text array).

> **UNIQUE CONSTRAINT (V6.2)** — venues uniqueness is **(name, village)**, not name alone. Upserts MUST use `onConflict: 'name,village'`.

## Data sources

Three independent pipelines POST to /api/inbound-schedule: processFoodTruckScreenshots (Apps Script), analyzeEmailWithGemini (Apps Script), and the GitHub Actions web scraper.

## inbound-schedule route — ID resolution (V6.1) + venue matcher (rebuilt V6.5)

As of V6.1, /api/inbound-schedule resolves the FKs at insert time: fetch all discovery_trucks and venues up front, normalise the incoming truck_name and venue_name, match (including the aliases array), write the matched discovery_truck_id and venue_id with visibility 'public'.

### Venue matcher — token-overlap + village-rank + best-effort (V6.5, replaces loose substring)

> **CRITICAL (V6.5)** — `findVenue` resolves a scraped event's venue (and through it the postcode and coordinates). The old matcher matched on a bare name substring with a vacuous village AND-filter and took the FIRST match (`.find`). This was simultaneously too loose AND too narrow: "The Cavendish Five Bells" matched the RATTLESDEN "Five Bells" (substring hit) while the correct Cavendish "The Five Bells" was REJECTED on word order, and the town safeguard was inert because the scraped town was null (the embedded-town bug, now fixed — Section 24). The mislink then CASCADED — the wrong venue's postcode (IP30 0RA), coordinates, and map pin were written onto the event, so a customer would see "Cavendish Five Bells" pinned in Rattlesden.

> **RULE (V6.5) — the rebuilt matcher.** findVenue now:
> 1. **Gathers candidates by TOKEN-OVERLAP** — every venue sharing significant name tokens with the scraped venue_name (so all "Five Bells" venues become candidates, regardless of "The"/word order).
> 2. **Ranks by normalised VILLAGE agreement** — the candidate whose village matches the scraped town (normalised: lowercased, punctuation-stripped) wins. An **embedded-town fallback** reads a town token out of the scraped venue_name when the town field is still blank.
> 3. **Picks the BEST candidate** (best-effort), rather than bailing to null or taking the first.

> **RULE (V6.5) — best-effort, NOT bail, is the right behaviour for the ambiguous case.** Because pending events are customer-invisible (Section 15), a best-effort venue guess is only ever seen by the TRUCK at approval, which validates and corrects it before it goes live; and an approved event becomes a trusted anchor for future scrapes. So when village can't disambiguate, the matcher picks the most plausible candidate rather than leaving a blank. (Two enhancements are scoped but NOT built — see Section 27: a **confidence flag** column to surface low-confidence guesses to the truck, and a **venue_id column on truck_events** which is the keystone that unlocks both trusted-anchor reuse and a **history-prior** tie-breaker — using the truck's prior CONFIRMED venues to rank candidates, with a ≥2-visit floor and anti-reinforcement since confirmed = event-approved not venue-validated.)

> **RESULT (V6.5, ran reresolve-event-venues.ts for test-truck, dry-run then --apply)** — of the all-events comparison: 3 changed, all improvements (Cavendish event → correct Five Bells, Cavendish; "Old School" blank → matched "The Old School"; a Platform One duplicate-row swap), 5 unchanged, 0 regressions. EYEBALL flags logged: confirm "The Old School" resolves to the Great Cornard centre, and there are duplicate "Platform One Café" venue rows to merge (Section 27).

### Single-resolution rule

> **RULE (V6.5)** — `findVenue` is the single fuzzy matcher and resolves venue_id AND postcode/coords together for a scraped event. Never resolve a venue twice with two different matchers (that was how the postcode and the pin diverged). The earlier discovery-upsert 500 (postcode leaked via `...row` spread into the discovery_events upsert, which has no postcode column → PGRST204 → route 500'd before the bridge → "0 bridged, 0 discovery") was fixed by destructuring it out: `const { postcode, ...discoveryRow } = row`.

### Earlier venue data fixes (V6.2, retained)

Pizzeria Gusto's Saturday event re-pointed to The Five Bells, Cavendish (id 6e23389e-…; 52.0876415, 0.6324885); eight venues added with coordinates and aliases; 52 events re-pinned; wrong venue_ids nulled where the correct venue wasn't yet present.

## Apps Script key rules

Four Script Properties plus a separate GitHub Actions copy of GEMINI_API_KEY, verified with testAllKeys() after any rotation (Section 24).

## processFoodTruckScreenshots details

gemini-2.5-flash; 14-day date mapping; invalid-venue filter; a 15-second pacer between files; a ~280s time guard (inside the 6-minute ceiling); on success, written to the Sheets Events tab, mirrored via mirrorEventsToSupabase(), screenshot trashed.

## Venue matching and creation

A new venue is geocoded via the Google Maps API and stored with name, village, lat, lng, aliases. Upserts use onConflict 'name,village'. The Sheets Venues tab holds aliases in columns N/O/P (SEPARATE from the Supabase aliases array — keep in step). backfillMissingVenueCoords() geocodes rows without coordinates.

> **DATA HYGIENE (V6.1)** — (1) the same event from two pipelines with a one-day offset creates a near-duplicate — dedup on truck + date + venue; (2) duplicate venue rows with slightly different names split a venue's events — merge to the canonical row and add the variant as an alias in BOTH Supabase and the Sheet.

## Visibility

discovery_events default to visibility = 'public'; there is no status column. The `visibility` enum (public|hg_only|hidden) is also the gate for operator-event exposure per host (Section 15). RLS public SELECT on discovery_events, discovery_trucks, venues; writes service-role only. A test truck is kept off the public map by setting its discovery rows to `hg_only` (NOT a trucks.is_test column — Section 16).

## Known DRY gap

process-schedule imports lib/schedule-extract.ts, but processFoodTruckScreenshots, analyzeEmailWithGemini, AND the scraper's inline hgPrompt still implement extraction independently. Long-term: migrate the Apps Script processing off Google Sheets, route the scraper through buildScheduleExtractionPrompt, then move all paths in-repo behind the shared utility (Section 27).

# 26. Testing and dev environment

## Dev setup

- **localhost:3000** for local testing, treated as **Village Foodie** (the host gate is a substring `.includes('hatchgrab')` check — Section 2 — and "localhost" doesn't match).

- **localhost-as-HatchGrab (V6.5)** — to test HatchGrab-only surfaces (operator events, the order buttons on the profile page, the visibility gate) locally, add a one-line `/etc/hosts` alias `127.0.0.1 hatchgrab.localhost` and browse **http://hatchgrab.localhost:3000**. Because both the server (Host header) and the client (`window.location.hostname`) run the same substring check and the browser sends the navigated hostname as the Host header, the two agree automatically and the whole app renders as HatchGrab — zero code change, zero production risk (no real visitor can present a `*.localhost` host). `localhost:3000` continues to render as Village Foodie, so both brands are testable side by side.

- **Test Kitchen** test truck: dashboard_token test-abc123def456, **id `test-truck`, slug `test-kitchen`** (the public profile resolves by slug — `/trucks/test-kitchen`; `/trucks/test-truck` 404s, though the order page tolerates the id via a fallback). Contact dominicbonini@hotmail.com. As of V6.5 its discovery rows are `hg_only` (shows on hatchgrab.com, hidden on villagefoodie.co.uk) — there is no `trucks.is_test` column (Section 16).

- iPad Air simulator for KDS; Safari responsive mode at tablet sizes; phone widths 375/414px.

## Pre-trial checklist

- Capacitor wrapper built; Stage A offline working reliably.

- All known bugs fixed (target zero at trial start).

- Sheets-to-DB migration complete or safe parallel-run.

- Auth hardening (auth-attempt rate limiting still open; admin secret RESOLVED V6.1 — ADMIN_SECRET removed, session-based is_admin via verifyAdmin() is the only path). Public-data anti-scraping rate limiting is DONE (V6.3, Section 28).

- Event confirmation flow live (done).

- Order flow rebuilt on the order-key two-id model (V6.3, Section 18a) — migration 20260607 applied and verified; 9/9 data-layer/RPC smoke tests passed. **STILL TO DO: full live iPad click-through of the whole order flow on a real device** — React keys, toasts, and action buttons were type-checked and logic-verified only, never clicked. This gates the trial.

- **Per-event stock built and tsc-clean (V6.5, Section 30) — two-device oversell e2e STILL PENDING.** All four read/write phases are in place (menu-API ceiling, stock-guard ceiling, enforceStockLimits, dashboard overrides), proven on real data for cross-event isolation (White Lion 25 vs The Oak 25−20=5). NOT YET RUN: a **live two-device oversell test on hatchgrab.com with two same-date events** — Test 2 (sell-through on event A leaves event B's ceiling untouched) and Test 3 (concurrent oversell race — exactly ONE of two simultaneous last-item orders succeeds) are non-negotiable before trial. As of the latest session this build was tsc-clean but NOT YET DEPLOYED.

- Capacity engine (V6.4, Section 6) — oven-occupancy projection, event-keyed `production_slot_usage`, per-event booking lock, ASAP tail-completion placement, date-aware slot floors. Verified by simulation + spot-checks; folded into the live iPad click-through above.

- Rate limiting live and correctly tiered (V6.3, Section 28) — STRICT only on /api/discovery and /api/events; ordering/authenticated routes exempt.

- WhatsApp on Meta Cloud API (V6.3, Section 20) — webhook wired; four-bucket smoke tests and the whatsapp_logs migration still outstanding.

- End-to-end smoke test of all flows: customer order, walk-up, ready notification, mark paid & done (verified in V4; re-run live on the V6.3/V6.4/V6.5 build).

- Brevo hatchgrab.com domain verified and propagated (SPF + DKIM authenticated).

- Row Level Security enabled across all tables (DONE V6.1; new V6.5 tables `event_item_stock` and `event_category_stock` created with RLS on, service-role only — Section 16).

- Discovery map plotting verified: events resolve discovery_truck_id and venue_id and appear as pins (DONE V6.1). **Re-verify after the V6.5 venue-matcher rebuild** — in particular the Cavendish Five Bells event now resolves to the correct Cavendish venue with the correct postcode/pin, and confirm the EYEBALL flags (the "Old School" → Great Cornard centre, the duplicate "Platform One Café" rows — Section 27).

- **Operator-events visibility verified (V6.5)** — `/trucks/test-kitchen` resolves on hatchgrab.com with its schedule and order buttons, and 404s on villagefoodie.co.uk / localhost. Confirm no `hg_only` truck ever leaks onto the public Village Foodie map (the dedicated unfiltered visibility fetch is the guard — Section 15).

- Apps Script scraper confirmed working end-to-end after the key recovery (DONE V6.1).

- Production deploy to Vercel with production Supabase; real iPad testing with simulated connectivity drops.

- Wake lock confirmed working under iOS 16.4+ and Chrome Android.

- QR code and dashboard order link resolve to /trucks/[slug]/order (slug populated for every truck; dashboard_token fallback removed in V6).

- Scraper bridge verified: a linked, auto-preference truck's inbound event creates an unconfirmed truck_events row and shows in its Schedule tab; an unlinked or manual truck stays discovery-only (Section 15).

- Scraper GitHub Actions workflow passes on Node 24. Diagnose the ~23-minute run failure (Section 24) before relying on the cron.

- Migrations run in Supabase (filename order, `notify pgrst, 'reload schema';` after each, in chunks): through 20260608 (capacity/lock) and the two V6.5 stock migrations **20260611_event_item_stock.sql** and **20260611_event_category_stock.sql**. Reconcile the applied-vs-file list — upsell_events and whatsapp_logs were never applied (Section 16). Admin operator account set (operators.is_admin = true).

## Contextual reminders

- orders has TWO ids: order_key (uuid, identity, every WHERE/key/URL/FK/dedupe) and id (text, per-event display number, restarts at 1, NEVER a lookup key). Never conflate them (Section 18a).

- Order display numbers are bare integers ("5"), generated only by nextOrderId via the atomic event/truck counter — never read-max-then-check (Section 18a).

- **Stock is per-event via sparse override: read `event_item_stock.stock_count ?? menu_items_db.default_stock`; the override exists only when the dashboard edited that event; un-edited events read live Settings (so defaults propagate). Ceiling and sold count must share the SAME event_id, and a missing override falls back to default_stock — never accidental-unlimited, never 0 (Section 30).** (V6.5)

- **An override can only RESTRICT availability, never re-enable a Settings-disabled item. Item names are always read live from `menu_items_db.name` (Section 30).** (V6.5)

- **The venue matcher (`findVenue`) is best-effort, not bail: token-overlap candidates → village-rank → best-pick. Pending events are customer-invisible, so the truck validates the guess at approval. Never resolve a venue with two different matchers — postcode and pin must come from one resolution (Section 25).** (V6.5)

- **The scraper's inline `hgPrompt` is SEPARATE from `lib/schedule-extract.ts` — a known divergence. It must always emit a `town` and split an embedded place-name out of the venue name (Section 24).** (V6.5)

- **There is NO `trucks.is_test` column. Test trucks are kept off the public map via the discovery row `visibility` enum (`hg_only`). Phantom `is_test` references in admin/manage code likely error — backlog (Section 16 / Section 27).** (V6.5)

- **Operator events are gated by the LINKED discovery truck's `visibility`, fetched via a DEDICATED UNFILTERED `hatchgrab_truck_id → visibility` map — never via the visibility-filtered `trData` (which would default `hg_only` to public and leak it) (Section 15).** (V6.5)

- **Host gating is a substring `.includes('hatchgrab')` check on the Host header (server) and `window.location.hostname` (client); no middleware, no exact-match. `hatchgrab.localhost:3000` renders localhost as HatchGrab (Section 2 / Section 26).** (V6.5)

- Both order insert paths must write event_id; never setState from a failed fetch (Section 5).

- calcQueuePushSecs is shared by client and server ASAP — never fork it (Section 6).

- kitchen_capacity counts ITEMS, not batches; the ceiling reddens but does not slow per-category drain (independent-equipment assumption) (Section 6).

- Future-dated events never show red "prep now" urgency; age blends in only under 60 minutes (Section 9). Every "is this event today" floor uses a LOCAL Y-M-D, never toISOString (Section 6).

- The slot traffic-light is operator-only; the customer picker shows only clean slots (Section 10 / 7).

- WhatsApp runs on the Meta Cloud API; the Twilio handler is dormant, do not overwrite (Section 20).

- UI text contrast floor on white: slate-700 body, slate-500 secondary, slate-400 decorative only; orange reserved for current-plan/active highlights.

- Watch for new Date('YYYY-MM-DD') UTC bugs and for next/image shadowing the global Image constructor.

- Always strip seconds via formatTime — never inline t.slice(0,5).

- ASAP base time is max(now + prep, eventStart) — never add prep on top of a future event start (Section 6).

- Customer order URL is /trucks/[slug]/order; the cancel link is /order/{order_key}/manage; the profile/chooser is /trucks/[slug]. Never use dashboard_token in a customer-facing URL or public API response (Section 12 / Section 2 / Section 7).

- New operator pages reuse AppHeader and slate-900 tabs (lib/brand.ts) — no inline page headers (Section 3).

- Manual pause writes to truck_vans.paused_until for the active event's van, not trucks.paused_until (Section 5).

- A null batch_size means "no limit" — render blank with an ∞ placeholder, never a sentinel like 999 (Section 6).

- trucks.id is text, not uuid — any new FK to trucks(id) must be text. truck_events(id) and orders.event_id are uuid (Section 16).

- Schedule extraction goes through lib/schedule-extract.ts in-repo — never re-implement the Gemini prompt/retry/parse (the scraper's hgPrompt is the one known divergence) (Section 3 / Section 22).

- venues uniqueness is (name, village) — upsert with onConflict 'name,village' (Section 25).

- Cross-talking tabs and in-progress-input panels are always-mounted with an isActive prop; modals render outside the isActive gate (Section 22).

- Run large SQL migrations in chunks, not a single full-file paste, and keep an applied-vs-file reconciliation (Section 16 / Section 22).

- "tsc-clean / simulated-pass" ≠ "works": verify the END STATE on a live run, and confirm DEPLOYED before judging a prod-endpoint result (the local scraper POSTs to the PROD bridge) (Section 22).

# 27. Open backlog (June 2026)

## Critical — before trial

- **LIVE iPad click-through of the entire order flow on a real device** — the single most important pre-trial task. Every order-flow change (per-event numbering, urgency, slots, basket persistence, email venue/contact, the V6.4 oven-occupancy engine / event-keyed usage / per-event lock / ASAP-selection state machine / date-aware floors, and now the V6.5 per-event stock model) stacks on this one path. Highest-value live checks: (a) place a customer order on ASAP WITHOUT touching the picker → confirms → shows #1 → right venue in the email; (b) the slot traffic light reads correctly; (c) a full slot bumps, not rejects.

- **Per-event stock two-device oversell e2e (V6.5)** — deploy, then run on hatchgrab.com with two same-date events: Test 2 (sell-through on A leaves B untouched) and Test 3 (concurrent oversell race — exactly ONE of two simultaneous last-item orders succeeds). Non-negotiable (Section 30).

- **Availability auto-reset on order-cancel (V6.5)** — Phase 4 left the per-event `available=false` flip MANUAL-only. A cancellation frees stock but leaves the item stuck sold-out, and cancellations mid-service are normal. Add an auto-reset (recompute the per-event availability from live sold count) on the cancel path, mirroring the way `rebuildProductionSlotUsage` runs on cancel for capacity (Section 30).

- Capacitor native wrapper; Stage A offline cache; offline detection banner; background sound; screen wake.

- Auth-attempt rate limiting (public-data anti-scraping rate limiting is done — Section 28).

- **Run the whatsapp_logs migration in prod (V6.3)** — the table does not exist, so logging is silently failing; confirm the lib/whatsapp-classifier.ts service-role-key usage; then run the WhatsApp four-bucket smoke tests (Section 20).

- **Applied-migrations reconciliation (V6.3)** — upsell_events (20260529_checkout_upsells) and whatsapp_logs were never applied to prod; audit the full applied-vs-file list.

- **Rotate the Upstash Redis REST token (V6.3)** — exposed in chat during setup (Section 28).

- **Phantom `trucks.is_test` references in admin + manage (V6.5)** — `is_test` does not exist as a column (Section 16). The discovery/events operator branch was fixed in V6.5, but admin and manage paths still select/reference it and therefore likely error on those queries. Remove the references (the public-map exclusion is the discovery `visibility` enum, not a trucks column). Diagnose-first which queries break.

- Google Sheets → DB migration (scraper currently dual-writes; Sheets still config store). Also the home for the Gemini-extraction DRY consolidation — once done, the two Apps Script paths AND the scraper's inline hgPrompt can move in-repo behind lib/schedule-extract.ts (Section 3 / Section 24 / Section 25).

- Reports tab data verification across multiple events.

- Heartbeat/auto-pause end-to-end test.

- Diagnose the ~23-minute scraper run failure (Section 24) — add per-site navigation and per-Gemini-call timeouts; confirm on the next Node 24 cron run.

- Apps Script screenshot processor 6-minute timeout — confirm the ~280s guard exits cleanly on a large batch.

- GitHub Actions GEMINI_API_KEY secret — verify the repository-secret copy matches the current Script Properties key.

- Link each trial truck's discovery_trucks row to its HatchGrab truck (hatchgrab_truck_id) via the admin console.

- orders.source column migration — replaces the customer_email IS NULL heuristic for order type in Reports.

- truck_events.customer_note surfacing on the customer order page below event details.

- Add "Edwardstone White Horse" to the Google Sheets Venues tab alias columns N/O/P.

## Important — before public launch

- **Venue matcher enhancements — the keystone is `venue_id` on `truck_events` (V6.5)** — the best-effort matcher (Section 25) is built, but two scoped-not-built enhancements both depend on adding a **`venue_id` column to `truck_events`**: (1) a **confidence flag** column so a low-confidence guess is surfaced to the truck at approval; (2) a **history-prior tie-breaker** — rank candidates by the truck's prior CONFIRMED venues (village wins → history → best-pick), with a ≥2-visit floor and anti-reinforcement (confirmed = event-approved, NOT venue-validated). `venue_id` also unlocks trusted-anchor reuse and rename-safety. This is the single highest-leverage matcher follow-up.

- **Extractor convergence (V6.5)** — route the scraper's inline `hgPrompt` through the shared `buildScheduleExtractionPrompt` (the manage "Import" path already does), so there is one prompt with truth-based `findVenue` rather than two. The manage prompt trusts the LLM for postcode (hallucination risk); the scraper has truth-based findVenue — converge on the stronger combination (Section 3 / Section 24).

- **Systemic logo fallback (V6.5)** — the public profile reads `discovery_trucks.logo_url` only; an operator-uploaded logo lives in `trucks.logo_storage_path` and isn't mirrored, so a truck can show a blank logo (test-kitchen was fixed by SQL this session). Make the discovery/profile mapping fall back to the linked operator truck's `logo_storage_path` when `logo_url` is null (Section 14).

- **"Old School" + "Platform One Café" venue cleanup (V6.5)** — EYEBALL flags from the reresolve run: confirm "The Old School" resolves to the Great Cornard centre, and merge the duplicate "Platform One Café" venue rows (to the canonical row, variant as an alias in BOTH Supabase and the Sheet) (Section 25).

- **Rename-safety for stock (V6.5)** — per-event stock keys on `item_name` because orders carry no item id (the frozen order-line name is the only join to the sold count). Renaming an item in Settings propagates the display name (read live) but a per-event OVERRIDE row keyed on the old name is orphaned. The proper fix is to carry `item_id` on order lines so ceiling and sold count can key on id; deferred (Section 30).

- **Auto open/close not firing (V6.4)** — diagnose-first: is "open for orders automatically" the same state as "event started" (Start Event / event `status`), or distinct? Auto-close likely shares the gap. Must use local-date-aware "now vs event window" logic consistent with the slot floors (Section 6 / Section 15).

- **Merge Business contact + Customer contact into one "what the customer sees" box (V6.4)** — Settings shows a Business contact box and a separate Customer contact box that doesn't display the resolved detail. Combine into one section showing the resolved contact as the customer sees it, driven by `preferred_contact_method` (Section 18).

- **Per-category "apply kitchen capacity limit" tickbox (V6.4)** — replace the inferred "instant items don't count" rule with an explicit per-category opt-in (Section 6 / Section 14).

- **Shared-equipment capacity model (V6.4)** — the oven-occupancy projection assumes INDEPENDENT equipment; for a truck sharing one oven/fryer it runs optimistic. Flag when a multi-category shared-equipment truck onboards (Section 6).

- **Order-copy vs notification email format (V6.4)** — an order reportedly went to the truck in the wrong email format; diagnose which path sent which template before changing.

- **Remove dead slot code (V6.4)** — `getSlotIndicator` / `lib/slot-indicator.ts` and the vestigial `slot_capacity` cache no longer drive the operator dots or placement; they still power the customer available/unavailable flags. Slim once the trial baseline is committed — do NOT remove mid-stack. Likewise the legacy `item_overrides` / `category_stock` tables are unused by live paths but kept for stock rollback (Section 30) — remove together post-trial.

- **Retire the dormant Twilio WhatsApp handler and delete formatWhatsAppOrder dead code (V6.3)** — Meta Cloud API is canonical (Section 20).

- **Messenger + Instagram per-truck OAuth (parked, V6.3)** — page-id / account-id / encrypted-token columns, OAuth callback routes, ENCRYPTION_KEY (AES-256, lib/crypto.ts), send API, classifier wiring, then Meta app review (needs privacy policy + terms first).

- Stripe Connect integration (upgrade buttons currently email support).

- Refunds process — event cancellation cancels orders and emails customers but does not yet refund.

- Multi-device session enforcement (kds_sessions exists, logic pending).

- Stage B offline; proper post-trial login.

- Operator UI pause-state reload — read from truck_vans.paused_until for the active event's van, not trucks.paused_until (V6).

- orders.ready_time column — store the calculated collection time at submit for tighter ASAP cancellation control post-trial.

- Schedule tab map panel — latitude/longitude are already stored on truck_events; show event locations on a desktop map alongside the schedule list.

- FAQ / help page; HatchGrab logo asset at public/logos/hatchgrab-logo.png.

- QR-with-logo scan test.

- Allergen onboarding flow: prompt operator per-category allow_notes toggle at signup.

- Loyalty stamp cards V1 build (Max only) — when instructed.

- Branded QR code implementation.

- password_reset_tokens cleanup job.

- slot_capacity.max_orders → max_batches rename.

- is_instant boolean on menu_categories — to make zero-prep items explicit rather than inferred from prep_secs.

- Companies House registration for HatchGrab.

- Privacy policy + terms pages — required for Meta app review and for launch.

## Adaptive scraping rollout (V6.2)

- **Site viability learning for all tracked trucks** — after N consecutive zero-event runs, mark a discovery truck inactive and drop it to a monthly check.

- **Adaptive update-day scheduling for all discovery_trucks** — roll shouldRunToday / recordRunAndLearn out to the Loop A discovery trucks once the Sheets → Supabase migration is complete.

- **Seasonal suppression for empty-schedule nudge emails** — after 3 consecutive empty nudges with no response, suppress until the truck next has a confirmed event.

- **Do NOT add a 90-day cleanup job for truck_events or discovery_events** — these are permanent reporting records. Only scraper_run_log is pruned (Section 24).

## Later

- Stage C full offline; customer-facing display (Max); advanced reporting visualisations; festival pricing; personalised schedule generator.

- Truck-facing WhatsApp "Recent messages" review panel with flagging.

## Open questions

- AI DM classifier confidence threshold (set from real performance).

- iPad printer model (Star Micronics vs Epson) — affects Capacitor native module.

- Truck-level vs operator-level billing in Phase 2.

- Loyalty redemption UX.

## Resolved this session (V6.5)

- **Items-based slot capacity display + kitchen_capacity = items** — DONE V6.4, the V6.3 interim wording is gone (Sections 6 and 10).

- **Village-aware venue matching in inbound-schedule** — DONE V6.5: the `findVenue` rebuild (token-overlap + village-rank + best-effort) replaces loose substring matching (Section 25). Remaining matcher work is the `venue_id`-keystone enhancements above.

- **Cross-event sold-out bug** — DONE V6.5: per-event sparse-override stock (Section 30).

- **Operator events dormant on both domains** — DONE V6.5: phantom `is_test` removed from the discovery/events branch, branch revived and visibility-gated (Section 15).

- **Orphaned `event_id: NULL` order** — DONE V6.4: cancelled by `order_key` so it no longer pollutes any projection.

# 28. Anti-scraping and rate limiting (V6.3)

Layered protection against bulk scraping of the public discovery and event data, without ever throttling real ordering.

## Components

- **lib/ratelimit.ts** — Upstash Redis sliding-window limiters. Redis DB "HatchGrab", London (eu-west-2). Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN (in .env.local and Vercel).
- **middleware.ts** (repo root) — Vercel Edge Middleware applying the limiter by route tier.
- **public/robots.txt** — blocks AI crawlers (GPTBot, ClaudeBot, CCBot, etc.).
- **vercel.json** — X-Robots-Tag headers.

## Tiering — the rule that must not drift

> **RULE** — The STRICT limiter applies ONLY to public, bulk-scrapeable data. It must NEVER touch an authenticated or ordering route — doing so caused two regressions (events disappearing on the dashboard when /api/events/manage got a 429; customer ordering blocked behind shared café/CGNAT IPs).

- **STRICT — 3/min** — /api/discovery and /api/events (public slug lookups) ONLY.
- **GENERAL — 60/min** — everything else, including /api/menu and /trucks (these sit behind shared IPs and must stay generous).
- **EXEMPT (no limit)** — /api/dashboard/action, /api/orders/submit, /api/webhooks, /api/admin, /api/events/manage, /api/events/action, /api/events/affected-orders, /api/inbound-schedule.

> **RULE** — Any new route handling authenticated operator actions or order placement is EXEMPT by default. Only add a route to STRICT if it serves public bulk-scrapeable data and nothing else.

> **NOTE (V6.5)** — the discovery/events route is on the STRICT tier and is the same route whose operator branch was revived this session (Section 15). The revival changes what the route returns, not its rate-limit tier — STRICT still applies and ordering stays exempt.

> **SECURITY NOTE** — the Upstash REST token was pasted in chat during setup; rotate it before trial (Section 27).

# 30. Per-event stock — the sparse-override model (V6.5)

> **CRITICAL ARCHITECTURE — do not undo.** Stock is now scoped to the EVENT, held as a SPARSE override over the live Settings default. Conflating stock back to truck-level (the pre-V6.5 model) reintroduces the cross-event sold-out bug that this section exists to prevent.

## The bug this replaced

Before V6.5, stock was **truck-level** and **date-level** while only the SOLD count was event-scoped — a structural mismatch:

- `item_overrides` was keyed `truck_id + item_name` (NO event scope). A manual sold-out toggle or a manual stock-ceiling edit wrote a truck-wide row.
- `category_stock` was date-scoped.
- `enforceStockLimits` (organic sell-through) wrote a truck-wide `available = false` when an item sold through.

So three independent leak vectors — manual toggle, manual ceiling edit, and auto sell-through — all made an item that was sold out (or sold through) on ONE event show sold out on EVERY event. Observed as "BBQ Chicken Pizza sold-out on two different events".

## The model

Two additive tables hold a per-event **override** that exists ONLY when the dashboard has edited stock for that specific event:

- **`event_item_stock`** — PK `(event_id, item_name)`. Columns: `event_id` (uuid, FK `truck_events(id)` on delete cascade), `item_name` (text), `stock_count` (int nullable — the per-event ceiling override), `available` (boolean nullable — the per-event sold-out override).
- **`event_category_stock`** — PK `(event_id, category)`. Columns: `event_id` (uuid, FK), `category` (text), `stock_count` (int nullable).

Both are RLS service-role only.

### The read formula (the core invariant)

> **FORMULA** — effective ceiling = `event_item_stock.stock_count` **(if an override row exists for this `event_id` + `item_name`)** `?? menu_items_db.default_stock` **(live from Settings)**.

- An un-edited event has NO override row, so it reads the **live Settings default** — which means a Settings>Menu change to `default_stock` (or an item rename) **PROPAGATES to every future event** (confirmed AND unconfirmed). This propagation requirement is exactly why the model is sparse-override and NOT eager-snapshot (a snapshot at event-creation freezes the default and breaks propagation — an eager-snapshot first attempt was built and then unwound for this reason; see below).
- A per-event edit writes an override row, isolating that event from Settings and from every other event.
- A **missing override row falls back to `default_stock`** — never to accidental-unlimited, and never to 0.

### Availability is an AND-composition

> **FORMULA** — available = `(menu_items_db.is_available !== false)` `&& (override ? override.available !== false : true)` `&& (stockRemaining === null || stockRemaining > 0)`.

The override can only **RESTRICT** — it can never re-enable an item the Settings base has disabled. This preserves "Settings unavailable = unavailable everywhere". The item **NAME** is always read live from `menu_items_db.name`.

### The oversell invariant — same key for ceiling and sold count

> **RULE** — The effective ceiling and the sold count MUST be read by the SAME `event_id`. The sold count (`getLiveItemCounts`) is name-keyed off the FROZEN order-line names (orders carry no item id — Section 18a / the rename-safety backlog), so the override is also name-keyed (`item_name`), keeping ceiling and sold on the same key. The menu-API ceiling read (`/api/menu/[truckId]`) and the stock-guard ceiling read (`stock-guard.ts`) both read `event_item_stock` by the same `event_id` as the sold count. Proven on real data: White Lion event ceiling 25, The Oak event 25 − 20 sold = 5 — cross-event isolation holds.

## The four phases (all built, tsc-clean, e2e pending)

- **Phase 1 — migrations.** `20260611_event_item_stock.sql` and `20260611_event_category_stock.sql` (above). Applied in chunks, verified, schema reloaded.

- **Phase 2 — UNWOUND.** The first attempt was an **eager snapshot** (143 item + 55 category rows backfilled at event creation). It was deleted because it freezes the Settings default and breaks propagation. The unwind: DELETE all eager rows; migrate BBQ's truck-level `item_overrides = 25` into `menu_items_db.default_stock = 25` (so it now propagates) and delete the `item_overrides` row; strip the `snapshotEventStock` calls from the bridge and manual-create; delete `lib/event-stock-snapshot.ts` and `scripts/backfill-event-stock.ts` (the bridge keeps its `.select('id').single()` with `void insertedEvent`).

- **Phase 3 — oversell-critical reads.** The menu-API ceiling and the stock-guard ceiling read `event_item_stock` by the same `event_id` as the sold count (the invariant above).

- **Phase 4 — enforceStockLimits event-scoped.** `enforceStockLimits` (lib/stock-availability.ts) now reads sold by `event_id` and writes `event_item_stock.available = false` per-event, never clobbering `stock_count` and never writing a truck-wide flag. The enforce ceiling equals the guard ceiling.

- **Phase 5 — dashboard writes the override.** `set_stock` / the sold-out toggle / `set_category_stock` write a per-event override into `event_item_stock` / `event_category_stock`, using the dashboard's existing `selectedEventId` / `selectedEventRef` (no new UI). `set_stock` re-enables an item on a stock raise; the toggle preserves the ceiling. Display reads (`get_stock`) are event-scoped.

## What is NOT built

- **Two-device oversell e2e (PENDING — Section 26 / Section 27)** — Test 2 (sell-through isolation) and Test 3 (concurrent oversell race, exactly one succeeds) on hatchgrab.com with two same-date events. NOT YET DEPLOYED as of the latest session.

- **Availability auto-reset on cancel (PENDING — Section 27)** — Phase 4 left the `available = false` flip manual-only; a cancellation frees stock but leaves the item stuck sold-out. Mirror the capacity path (`rebuildProductionSlotUsage` on cancel) for availability.

- **Rename-safety (PENDING — Section 27)** — keying on `item_name` orphans an override row when the item is renamed; the proper fix carries `item_id` on order lines so ceiling and sold count can key on id.

## Legacy tables

`item_overrides` and `category_stock` are now UNUSED by live read/write paths but are LEFT IN PLACE for rollback safety. Remove them post-trial together with the other dead slot code (Section 27).

## Deal stock interaction

A deal hides on the customer page when its slot's only item is sold out — and as of V6.5 that resolves **per-event** through the sparse-override read, not truck-wide (Section 8 / Section 17).

# 29. Closing note

This manual is living documentation. Update it whenever a new rule is established, a feature behaviour is decided, a DRY violation is identified and fixed, a plan tier feature changes, or a coding convention shifts.

When in doubt about how something should work: check here first. If the answer is not here, work out the right answer, document it here, then implement.

The cost of writing things down is a few minutes. The cost of not writing them down is rebuilding the same decision next week.

HatchGrab Engineering Reference Manual · V6.5
