HatchGrab Engineering Reference Manual · V7.8

**HatchGrab**

Engineering Reference Manual

*Village Foodie · Food Truck Ordering Platform*

**Version 7.8**

June 2026

*This document defines the rules, conventions, and architecture decisions for the HatchGrab platform. It is the source of truth for any coding session and must be consulted before making structural changes.*

# Changelog

## V7.8 — June 2026

Extended pre-trial hardening session covering the **auth / account-resolution subsystem**, the capacity engine's **first-order self-count bug**, **booking-lock UX**, **header overlaps**, **order-confirmation hierarchy**, and **operator-settings clarity** — plus prod **data/config changes** to prepare Pizzeria Gusto for handover. Status: **the operator has LIVE-VERIFIED all feature work below on real devices** — including the **two-device concurrent oversell test** (winner takes the slot, loser silently bumps with the moved-note, no double-book) and the **WhatsApp allergen + greeting flow** (Meta number now whitelisted) — **EXCEPT item §8 (operator Confirm-time capacity check), which is BUILT + tsc-clean but LIVE-TEST PENDING**. Tags: **[LIVE-VERIFIED]** operator-confirmed on device; **[BUILT, LIVE-TEST PENDING]** tsc-clean, not yet device-verified; **[DATA/CONFIG — applied]** prod data change made this session.

**1. Capacity engine — first-order-into-empty-cache SELF-COUNT bug + fix (Option B). [LIVE-VERIFIED].** MECHANISM: the order is INSERTED (pending, null-slot for ASAP) BEFORE the fit runs; when `production_slot_usage` cache is EMPTY, the occupancy read lazily reseeds from the orders table (`buildUnitsFromOrders`) INCLUDING pending + null-slot orders — so the order counts ITSELF at the event-start window, sees the target slot full, and over-yields one slot forward (placed 16:05, leaving 16:00 empty). Concurrency only made it visible; a single first-of-event ASAP order reproduced it. FIX: an OPT-IN `excludeOrderKey` param (defaults `undefined` = no exclusion = full occupancy) threaded ONLY through the fit-read path (submit `placeOrderInSlotLocked` → `getProductionSlotUnits` → `readProductionSlotUnits` → `buildUnitsFromOrders`), adding `.neq('order_key', excludeOrderKey)` when present. The placing order excludes ITSELF (by `order_key`, the UUID PK) but counts all others. Live-verified: single order lands at 16:00; order #11 round-trip placed successfully; AND the two-device concurrent oversell test passed — winner takes the contested slot, loser silently bumps to the next available with the moved-note, no double-book. CRITICAL INVARIANT (now in the Section 31 DO-NOT list): the exclude key is passed ONLY on the submit fit-read; the authoritative write (`addOrderToProductionSlot`, `persistReseed=true`), the full rebuild (`rebuildProductionSlotUsage`), and all readers (dashboard/slots/batch) must NEVER pass it — excluding there would undercount and risk an OVERSELL. Orthogonal to the earlier "BUG 1" read-only-reseed fix (which stays). Exclude by `order_key`, never the per-event display id.

**2. Booking-lock silent-bump + confirmation hierarchy. [LIVE-VERIFIED].**
- (a) Lock-acquire budget `LOCK_MAX_WAIT_MS` raised 1000→3000ms (`lib/stock-guard.ts`); retry 150ms, TTL 10s UNCHANGED. Reason: A's heavy first-order critical section can approach ~1s under latency, so B's old 1s budget expired before A released → spurious "handling a lot of orders" contention message on what should be a brief wait. 3s absorbs a single concurrent order's hold so normal contention resolves silently into the already-working next-slot fit. Serialisation (acquire=INSERT, 23505=held, stale-reclaim) UNCHANGED — only the budget constant + return semantics. `acquireEventLock` now returns a reason (`{ok:true} | {ok:false; reason:'error'|'contention'}`) so the 409 message is reserved for genuine failure / sustained overload.
- (b) ASAP "your time moved" confirmation note (web): captured `submittedAsapEstimate` (the client's displayed "Around HH:MM"), compares to the assigned slot; if moved, shows it.
- (c) Confirmation HIERARCHY inverted (web + email, `lib/email.ts`): the COLLECTION TIME is now the prominent line; the "slot was taken / estimated time wasn't available" is smaller supporting text; gentle wording ("next available time" / "slightly later than"), not an apology-led error. Applies to chosen-slot + ASAP-moved (web), chosen-slot (email).
- BACKLOG: the ASAP-moved note is NOT in the email (the ASAP estimate is client-only; the server-rendered email never receives it) — adding it needs the server to pass the resolved ASAP target into email params. Email's collection time is correct, just lacks the "moved" context.

**3. Auth / account-resolution subsystem (the session's largest thread). [LIVE-VERIFIED].**
- `/dashboard` ROUTER hardened: added an admin branch at the top — `operators.is_admin` (via `.maybeSingle()`) → `redirect('/admin')` BEFORE the operator owner-path, so an admin never goes down owner resolution. All `.single()` calls hardened: trucks-by-operator+active and truck_users-by-auth_user_id changed from `.single()` (which returns null on 0-or-2+ rows → silent fall-through → `/login` bounce) to LIST + deterministic pick (0 → fall through, 1 → that one, 2+ → first by `created_at`, with a comment that a proper multi-truck PICKER is backlogged). operators-by-auth_user_id → `.maybeSingle()`. `/api/dashboard` operators/truck_users → `.maybeSingle()`.
- ROOT CAUSE of the blank-dashboard saga (for posterity): an operator owning 2+ ACTIVE trucks hit the trucks-by-operator+active `.single()` → null → fell through → `/login` bounce (surfaced as blank). NOT data corruption (operators/auth were clean). Admin identity (`operators.is_admin`) was never consulted in the router.
- `/api/dashboard` ADMIN BYPASS: added `is_admin` to the operators select; an admin is now authorized (`isOwner || operator.is_admin`) → `userRole='owner'` (owner-equivalent interim) → no more "Access denied" on trucks they don't own. No new `'admin'` role value (backlogged). `/api/manage` already permits via token-possession (looser model — backlogged as an auth-consistency question).
- PASSWORD-SET forced sign-out (`app/reset-password`, token path): on success now signs out the current session (browser client + hard redirect, clears SSR cookie) then → `/login`, preventing the half-state blank when another user was logged in on the device. Reuses the email-change sign-out pattern.
- STAFF ACCESS MODEL CORRECTION (Section 12): staff CAN access the orders dashboard `/dashboard/[token]` (to place orders); staff CANNOT access `/manage`; a one-van staff is auto-routed to KDS on login but can navigate to the dashboard. The old "staff → KDS-only" wording was WRONG — corrected in Section 12.
- KDS → dashboard back-link added (`kds/page.tsx`): "← Dashboard" → `/dashboard/${token}`, unconditional, collapses to ← on narrow. (Backlog: whether to pass `?pin=` to avoid re-prompt.)

**4. Header overlap fixes. [LIVE-VERIFIED].**
- AppHeader (operator pages): name bounded (`min-w-0`/`truncate`/`max-w`) + zone reservation, for large-text overlap. (Earlier in session.)
- CUSTOMER headers (order-page `Hdr` + `TruckClient`): the TRUCK LOGO (`w-10`/`w-12`, rem) scaled unbounded on large OS text and overlapped the VF logo → fixed px (`w-[40px]`/`sm:w-[48px]`, same visual size, no longer scales) + widened centre reservation (`px-[115px]`/`sm:px-[145px]`) to clear the VF logo. Truck logo has visual priority; VF yields; name already truncated.
- BACKLOG (HIGH): the THREE near-identical headers (order `Hdr`, `TruckClient`, AppHeader) are duplicated copies — the same bug class was fixed separately in each this session, proving the DRY debt. Consolidate into one shared header component (parameterised for the differing right-slots). Real DRY-debt, not optional.

**5. Operator settings — WhatsApp field clarity + billing-table alignment. [LIVE-VERIFIED].** The "Auto-replies → WhatsApp" field (`whatsapp_sender`) was indistinguishable from the Contact Phone field (`contact_phone`) — two unlabelled WhatsApp-number inputs. Added: save-on-blur (matching the rest of Settings), a scoped success toast (`saveWhatsappSender` handler + ref guard against the blur→button double-fire), helper text distinguishing it ("WhatsApp Business number for automated replies… separate from your contact number above"), and relabelled the button "Connect"→"Save" (no real Meta linking yet; Messenger/Instagram keep "Connect / Coming soon"). The field always saved correctly — the issue was feedback + confusion. Billing table: the "Free trial" label given `whitespace-nowrap` so the TRIAL column's selected-plan bottom border aligns with the others on mobile (the two-word label was wrapping in the narrow column and dropping the border).

**6. PROD DATA / CONFIG changes (applied this session). [DATA/CONFIG — applied].**
- Account role split for handover: `dominicbonini@hotmail.com` → `is_admin=false`, owns ONLY Pizzeria Gusto (Test Kitchen deactivated, `active=false`). `dominic@villagefoodie.co.uk` → `is_admin=true`, owns no trucks (the platform admin). The stale Gusto staff `truck_users` row for villagefoodie was removed. Handover plan: hand the cleaned hotmail account to Gusto's owners via the existing verified email-change flow (renaming the single-truck account), NOT an ownership-transfer feature.
- Gusto `whatsapp_sender` changed `447941042253` → `07380736226` (operator's number, replacing the platform/test sender; format to be normalised later). The number is now whitelisted in Meta and the allergen/greeting auto-reply was tested live against `07380736226` this session (V7.8 §1 / Section 20).
- Gusto `contact_email` changed `dominicbonini@hotmail.com` → `contact@pizzeriagusto.co.uk` (the customer-facing order-notification / confirmation email — the `contact_email` field, NOT the login/auth email). Removes the founder's personal address from the operator's confirmations for handover.
- AUTH-EMAIL REINFORCEMENT: the operator's LOGIN/auth email is changed ONLY via the verified in-app email-change flow, never raw SQL (`operators.email` vs the Supabase auth user desync). `contact_email` is a plain Settings field, safe to set directly.

**7. Operator Settings — saved value reverted on screen after a tab-switch/reload (`app/manage/[token]/page.tsx`). [LIVE-VERIFIED].** SYMPTOM: editing a Settings field (`contact_email` observed; affected ALL form-bound fields + all `saveSetting` mirrors) saved correctly to the DB but the input reverted to the OLD value on screen after switching tabs or any reload; a hard refresh showed the new value. ROOT: `saveFormField`/`saveSetting` persist to the DB but never updated the parent's in-memory truck state; `form` is seeded from `truck` only at mount (`useState({...truck})`); SettingsTab is conditionally rendered (`activeTab==='settings' &&`) so it unmounts on tab-switch and on any `reload()` spinner, and on remount `form` re-seeds from the STALE parent truck → the saved value reverts. Distinct from the V7.5 phantom-column allowlist fix (#6) — that was a write FAILING; this is a write SUCCEEDING but the display reverting. FIX (no endpoint/DB change): thread `onTruckUpdate` into SettingsTab (parent partial-merges `setTruck`); `saveFormField` applies the fresh row `update_settings` already returns (`{truck:data}`); `saveSetting` (`update_truck` returns only `{ok}`) local-merges `{[key]:value}`; `saveWhatsappSender` calls `onTruckUpdate({whatsapp_sender})`. No spinner flash (`setTruck` merge only, no reload; SettingsTab isn't keyed so it doesn't remount mid-session). The secondary form-resync useEffect was SKIPPED intentionally (would clobber in-flight edits; the parent-truck fix alone resolves the revert). DO-NOT-UNDO: the fix is 'lift the saved value into the authoritative parent truck so a remount re-seeds fresh' — never replace with `reload()`-after-save (spinner flash + read-replica staleness), and never add a truck→form resync effect without gating it against active edits.

**8. Operator Add Order — Confirm-time LIVE capacity check + advisory override (`components/dashboard/AddOrderPanel.tsx` only). [BUILT, tsc-clean, LIVE-TEST PENDING].** When the operator taps "Confirm order", `submitManual` now does a FRESH live `/api/slots` fetch (`{ cache:'no-store' }`) and runs `fitOrderBackward` (+ `projectBackwardOccupancy`) against the CHOSEN slot for the actual basket — the SAME client engine the customer page's `unfittableSlots` memo uses (Section 31), fed by the FRESH `capacityInputs` (NOT the panel's frozen snapshot — the panel holds a no-poll/no-realtime snapshot, so the confirm-time check must re-fetch). Reuses the existing `basketByCat` memo and the existing `getNowMinsInTz`/`getLocalDateInTz` now-clamp (now-mins for a today event, `-Infinity` for a future-dated event). The check is basket-vs-slot FIT, NOT dot-colour: a 1-pizza order onto an amber slot with room, or a drink (instant, no oven window) onto a red cooking slot, FIT → book with NO modal; an order that genuinely won't fit → an advisory `window.confirm` ("This slot is already booked up… Use it anyway? You may need to move another customer's slot.") → OK books at the chosen slot (re-enters as `submitManual(override, true)`, the `skipFitCheck` flag mirroring the stock-shortfall override flow so it doesn't re-loop the prompt) / Cancel returns to the panel, basket UNTOUCHED. ADVISORY — the manual path still bypasses capacity gating and books-as-chosen on override; the modal NEVER blocks. FAILS OPEN: any fetch/check error proceeds to book (the check is operator-visibility, not a double-book guard — the server lock + fresh-read still prevent actual double-booking). The fresh fetch is CHECK-ONLY — it does NOT `setManualSlots`, so the visible dots aren't disturbed mid-confirm (the post-submit refetch still refreshes them). The stock-override re-entry was also switched to `submitManual(true, true)` so it skips the now-already-run fit check. NOT used: `lib/slot-capacity.ts` `canFitInProductionSlot` (the DEAD legacy batch fit — Section 31 forbidden parallel model). NOTE: native `window.confirm` (consistent with the stock-shortfall pattern); styling to match the app's designed modals is a later polish. Distinct from the V7.3 §3.7 change that REMOVED the old over-capacity "Use anyway?" modal from slot *selection* — this is a different, engine-driven, LIVE-data gate at *confirm* time, advisory only, and it does NOT re-introduce selection-time friction (`handleSlotChange` stays local-only). LIVE-VERIFY (do not mark done on tsc alone): (a) drink-on-red / 1-pizza-on-amber → NO modal (proves engine-driven, not dot-driven); (b) a slot filled by a customer order WHILE the panel was open → modal fires (proves the live fetch beats the snapshot); (c) 5-pizzas-no-room → modal; OK books, Cancel keeps the basket; (d) `/api/slots` failure at confirm → fails open, books.

Backlog additions from this session are logged in Section 27.

## V7.7 — June 2026

WhatsApp auto-reply safety + greeting fixes, customer order-row layout rebuild, and the whatsapp_logs migration finally applied to prod. Headline: the allergen answering path was realigned so PRESENCE questions ("does the tiramisu have gluten") reach the presence-confirm path while ABSENCE/SAFETY questions ("gluten free", "safe for") are redirected — with the deterministic guard hoisted to a bucket-independent floor so the classifier can never be the safety boundary. Plus once-per-day-per-sender greeting detection (timezone-correct), and the customer item row moved to the canonical food-app layout (name → description → chips → price-left/Add-right baseline). Most items BUILT + tsc-clean, live-test PENDING; whatsapp_logs migration APPLIED; order-row layout operator-confirmed on device.

- **WhatsApp allergen routing realigned (BUILT, live-test pending) — SAFETY-CRITICAL.** See Section 20.
- **WhatsApp greeting: once per calendar day per sender (BUILT, live-test pending).** Timezone-correct via the truck's resolved tz. See Section 20.
- **whatsapp_logs migration APPLIED to prod (20260605_whatsapp_logs.sql).** Was never applied (Section 27 backlog) — now live; logging inserts succeed. See Section 16; struck from Section 27.
- **Customer item row → canonical food-app layout (operator-confirmed on device).** Name top, description + chips full-width, price-left/Add-right baseline. See Section 7.
- **Customer menu polish (BUILT, live-test pending):** min-height on the menu list so short categories pin tabs to the top; hidden tab-bar scrollbar; subcategory-boundary divider fix; divider prominence slate-100→slate-200; allergen/dietary chips now scale with OS font (text-[0.625rem]). See Section 7.
- **New shared helper localDateOfInstant(instant, tz) in lib/time-utils.ts.** See Section 3 / Section 6.

## V7.6 — June 2026

Customer order-screen UX overhaul, op order round-trip on a real device is LIVE-TEST PENDING and gates the trial (Section 26). The order-page logo fallback (Section 14), the false-404 `useVillageData` hardening (Section 25), and the measured Add-Order sticky tabs (Section 3) already landed as V7.5 notes — not repeated here. Status tags as prior.

- **Customer order page — category TABS + subcategories (BUILT).** The customer menu keeps category tabs with subcategory section headers, in the truck's MENU ORDER — DELIBERATELY divergent from the operator's flat-alphabetical Add Order panel. A future chat must NOT unify them. Sticky subcategory headers (swap-not-stack), postcode on the event card, a compact event card on the chooser, a two-stage form bottom-sheet, a shared order-summary element, and a tab-switch scroll-to-menu. See Section 7.
- **Quantity stepper regression FIXED (high severity).** A widened `opensModal` condition silently killed the +/− stepper on plain menu items (removal became impossible for upsell/notes items). Decouple: the quantity stepper gates on `hasModifiers`, modal-on-first-add gates on `opensModal && !hasModifiers`. See Section 7.
- **Operator order card — deals render FIRST** (OrderCard window/solo branch only; cook view's deal-dissolving untouched). See Section 8.
- **Price input string-buffer fix** (Manage → Extras & Upsells → Edit Option) — kills the stuck-leading-zero bug. See Section 23.
- **WhatsApp auto-reply repoint (testing).** Sender-routing is a testing convenience valid only because of one shared test number; go-live needs recipient-routing. A plan-gate file discrepancy was flagged. See Section 20 / Section 27.
- **Order-page logo fallback (DONE, already in Section 14 V7.5 note); false-404 hardening (DONE, Section 25 V7.5 note); measured Add-Order sticky tabs (DONE, Section 3 V7.5+ note)** — listed for completeness.

## V7.5 — June 2026

Full-session V7.5 (16 Jun 2026): capacity-engine corrections + operator-dashboard overhaul + settings/contact saving fixes + the schedule-verify pipeline rebuild + Gusto onboarding + Manage-console mobile UX. Headline: the **complete→undo capacity orphan** fix (rebuild-on-both) + the **day-load/dot DISPLAY** now = the collection-slot TOTAL (with an off-by-one grid-key regression found+fixed) + the **ASAP/picker over-capacity** fix (combined-load front floor) + the **settings phantom-column** fix (`update_settings` allowlist) + the **WhatsApp-contact** tick + the **verify Chromium-on-Vercel** determinism fix (@sparticuz). Most items BUILT + tsc-clean; live-test status noted per item. Status tags: **[LIVE-VERIFIED]** real device; **[BUILT]** tsc-clean, pending live; **[DATA FIX]** SQL; **[CONFIRMED]** verified-correct by audit.

### Capacity engine — the day's core fixes

**1. Complete→Undo capacity orphan — FIXED (rebuild-on-both).**
- SYMPTOM: marking an order done then undoing it left orphaned pizza load in the slot (observed 7 stored at 12:05 when live orders justified 5).
- ROOT CAUSE: `undo_collected` (action/route.ts ~:218) had NO idempotency guard — it flipped status to confirmed and re-booked via `addOrderToProductionSlot` unconditionally. `collected` IS guarded (BOOKED_STATES check). With TWO undo entry points shipped today (toast + completed-list), a re-fire double-books. Compounded by a reseed asymmetry: `collected`'s remove reads with persistReseed=false (and, post status-flip, the reseed EXCLUDES the order); `undo`'s add reads with persistReseed=true (the reseed INCLUDES the now-confirmed order) — so remove and add operated on inconsistent bases when a reseed landed mid-cycle.
- FIX: both `collected` AND `undo_collected` now call `rebuildProductionSlotUsage(supabase, truck.id, order.event_date)` AFTER the status flip, REPLACING the incremental remove/add. Rebuild is a pure function of live orders → the slot deterministically equals the live order set. Eliminates incremental drift, reseed asymmetry, AND undo re-fire double-count (rebuild is idempotent) in one stroke.
- KEY PROPERTY (do-not-undo): `production_slot_usage` is COLLECTION-SLOT keyed — `buildUnitsFromOrders` writes each order's full load at its own `collection_time` (no spreading in storage; the backward-window spread is only a DISPLAY projection). Each collection slot is independent → reading the stored total per slot is non-overlapping (no double-count).
- PERF: rebuild = one date-scoped delete + per-event `buildUnitsFromOrders` (4 parallel queries) + upsert. Cheap at food-truck volume; completes fire ≤ once per order. Rebuild-on-both chosen over the lighter guard+symmetry alternative.
- STATUS: built, tsc-clean, **LIVE-TEST PENDING** (verify collect→undo nets zero; undo re-fire idempotent; co-located orders survive).
- BACKLOG: the EDIT path (action/route.ts ~:285-293) has the SAME incremental-drift class (`removeOrderFromProductionSlot(old)` + `addOrderToProductionSlot(new)`). The same one-line `rebuildProductionSlotUsage` swap would fix it. NOT YET APPLIED (decision pending) — editing is more common in service than undo, so this is the higher-value remaining drift fix.

**2. Day-load / slot dot DISPLAY — now shows the collection-slot TOTAL.** ⚠️ **SUPERSEDED (17 Jun 2026) — see § "THE SLOT & CAPACITY ENGINE — canonical model" (Section 31).** This mid-saga "collection-slot total" approach was a WRONG turn: the dots now READ the engine's backward cooking occupancy (`back.byStart.get(slotMins − step)`, same source as `buildSlotAvailability`), NOT the raw collection total. A 3-pizza order at 17:05 shows 17:00=2 (red) / 17:05=1 (amber), not 17:05=3. The entry below is retained as historical record only — defer to the canonical spec.
- CHANGE: `buildSlotIndicators` (slot-display.ts) now derives count/label/tone from the stored collection-slot total (`productionSlotUnits[s.collection_time]`), NOT the backward-projected adjacent cooking window.
- WHY: the backward-window read under-reported — a multi-window order showed only the remainder at its collection dot (e.g. 5 pizzas committed at 12:00 displayed as "1" because 4 sat in an invisible pre-open window). Principle: show what's COMMITTED to the slot (the DB value), per category.
- TONE: reflects the full total — a category at/over batch → red; partial → amber (worst wins); plus the global kitchen-capacity ceiling; empty → green. RED = a ceiling reached (batch OR kitchen capacity).
- SAFE (no double-count): storage is collection-slot keyed and independent per slot (confirmed at source), so each dot reads its own slot's total. The old cross-dot spread ("16:50→4, 16:55→1" for a 16:55 order) was a projection artifact, not a stored truth.
- BOTH surfaces: the day-load strip (/api/dashboard attaches the indicator's tone+label) and the order-screen dots use the same source and agree.
- `buildSlotAvailability` / customer slot availability / placement fit (`fitOrderBackward`) left UNCHANGED — those answer capacity/placement, not "what's committed here".
- STATUS: built, tsc-clean, **LIVE-VERIFIED** (the under-read fix), then a regression found+fixed (below, #3).

**3. Day-load off-by-one (grid-key mismatch) — FIXED.**
- SYMPTOM: after fix #2, each slot's dot showed the PREVIOUS slot's value (12:05 showed 12:00's 5; 12:15 showed 12:10's 3; 12:35 showed 12:30's 1).
- ROOT CAUSE: this truck has `slot_duration_mins=10` but `collection_interval_mins=5` (they DIFFER). `generateCollectionTimes` collapses `production_slot` to the 10-min grid (`floor(mins/10)*10`: 12:05→"12:00", 12:15→"12:10"). Storage keys by `collection_time` (5-min grid). Reading `productionSlotUnits[s.production_slot]` (collapsed key) returned the previous slot's row.
- FIX: read `productionSlotUnits[s.collection_time]` (the same key storage uses), not `s.production_slot`. Each dot now reads its own DB row, no shift.
- GENERALISATION: only manifests when `slot_duration_mins ≠ collection_interval_mins`. For a 1:1 truck (`production_slot == collection_time`) the bug doesn't appear. **GUSTO ONBOARDING NOTE: check Gusto's `slot_duration_mins` / `collection_interval_mins` — grid config varies per truck; the display now handles the mismatch but it's a config-dependent area.**
- STATUS: built, tsc-clean, **LIVE-TEST PENDING** (verify per-slot values match DB exactly).

**4. ASAP / picker over-capacity — FIXED (combined-load front floor).**
- SYMPTOM: ASAP suggested 12:00 even though 12:00 had hit its pizza ceiling (5, red). The customer picker ALSO offered 12:00 (shares the fit engine).
- ROOT CAUSE: two divergent capacity models. DISPLAY = collection-slot total (5 ≥ batch 4 → red). FIT engine (`fitOrderBackward`, drives ASAP via `earliestBackwardFitSlot` + the picker veto) = backward cooking-window model. For a FUTURE event, `nowMins = -Inf` → the fit front floor = `eventStart − prep` (11:55), permitting ONE legitimate pre-open window. The fit judged the pre-open lead on the NEW order's windows alone (`nw = ceil(M/batch)`), so a new 1-pizza order seated in the [11:55] window (existing load there only 1) and "fit" — the over-committed batch sat invisibly in the forbidden 2nd pre-open window [11:50].
- DECISION (Option 2): keep the backward multi-window model (uses real kitchen throughput — a slot can hold what's cookable from open onward, not just one batch), but judge the pre-open lead on COMBINED load. RED = ceiling reached (batch or kitchen); a ceiling-reached slot must reject more.
- FIX: `fitOrderBackward` now takes `existingAtSlot` (the slot's committed `production_slot_usage` total by category) and judges the front floor on `nwCombined = ceil((existing + new)/batch)` instead of the new order's `nw`. Results: 12:00 with 5 + new 1 → nwCombined=2 → needs a 2nd pre-open window → REJECTED; 12:00 empty + 4 → nwCombined=1 → fits (first-batch-at-open preserved); 12:00 empty + 5 → rejected; 12:05 with 3 + 1 → fits (genuine room). Seating still uses the new order's `nw`; only the front-floor check uses combined.
- SHARED ENGINE: threaded through 3 call sites — ASAP `earliestBackwardFitSlot` (customer backwardAsap, operator adjustedAsapSlot, submit placement), customer picker veto (order/page.tsx:775), `buildSlotAvailability` hasBasket. A SINGLE shared-engine change — NO separate picker edit. The picker is corrected because it runs the same engine (a customer manually picking a ceiling-reached slot is now blocked, consistent with ASAP + the red dot).
- DISPLAY/placement/storage UNCHANGED. Display and fit models now AGREE on what "full" means.
- STATUS: built, tsc-clean, **LIVE-VERIFIED** (working), BUT confirm the BOUNDARY live: empty 12:00 still accepts up to 4 (first batch at open) but rejects a 5th.

**5. ASAP label — empty-basket refinement.**
- CHANGE: the ASAP selector shows just "⚡ ASAP" (no time) when the basket is EMPTY, and "⚡ ASAP — {time}" only once items are added — so the time reflects the earliest for what's actually being ordered (avoids the misleading "12:00 then jumps to 12:05" on load).
- Display-only (ASAP computation already basket-aware). Both surfaces: customer (order/page.tsx, the "Around {time}" sub-label, gated `hasItems || !asapTime` to preserve the "Unavailable" state) and operator (AddOrderPanel.tsx:589). Empty-basket submit isn't possible (`!hasItems` blocks), so a timeless ASAP never submits.
- STATUS: built, tsc-clean, **LIVE-TEST PENDING**.

### Operator dashboard — UI overhaul (16 Jun 2026)

**Undo for "Mark paid & done" — BUILT.** "collected" was previously terminal in the UI. Now both: (1) a TOAST "Order #N completed — ↩ Undo" (7s, dismiss-then-fire to prevent double-tap) and (2) a ↩ Undo button in the "Completed & cancelled" list, gated to `status==='collected'` only. Both call the existing `undo_collected` action (which now rebuilds capacity — see #1). Toast system extended with an optional `{action:{label,run}}` (existing callers unchanged). Dead OrderCard:317 undo button left as harmless unreachable code. STATUS: built, tsc-clean, **LIVE-TEST PENDING** (verify capacity re-books on undo via the rebuild).

**Reject-reason feature — migration RUN.** When auto-confirm OFF, reject now requires a reason (presets: "Sold out of an item" / "Too busy — can't make it in time" / "Closing soon" / "Other"; or free-text; "Other" requires free-text) emailed to the customer. New column `rejection_reason text NULL` (migration applied + schema reload). Reject email HTML-escaped via the new `escapeHtml` helper. `customer_email` REQUIRED at customer submit (emailless manual orders skip the email via the `if(order.customer_email)` guard). BACKLOG: the existing CANCEL email does NOT escape `cancellationReason` (action/route.ts:155) — same risk, apply escapeHtml when next touched.

**Day-load strip (new feature).** Operator at-a-glance slot/load view. Desktop = vertical sticky sidebar (DayLoadStrip.tsx, lg:w-48). Mobile = horizontal-scroll strip (time + colour dot). Earliest-upcoming-first (event-tz), past excluded. Reads existing /api/dashboard slot state (no new fetch). Display per #2/#3 above (collection-slot total, `collection_time` key, tone = ceiling-reached).

**Contact validation (customer order page).** Email REQUIRED + light format check (x@y.z). Phone OPTIONAL + permissive UK check only when provided. Inline errors on invalid content only.

**Tab badge fix.** "Orders (N)" now counts `pendingOrders.length` (action-needed = awaiting confirmation), matching the "New" summary card. Was counting ['pending','confirmed'] (undercounted modified/cooking/ready). Shows the number only when >0.

**Layout tidy-ups.** (a) "Add extra wait" moved beside New/Confirmed/Done boxes (desktop). (b) "To Make" aggregate box REMOVED (`getAllDayCounts` helper retained — shared by the completed-list line + KDS). (c) Order cards responsive: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`. (d) Button hierarchy: "Mark paid & done" full-width primary; Edit/Cancel ghost (py-2.5). (e) Event header shows the relative DATE ("Today/Tomorrow/{Weekday} {D}th Month", event-tz). (f) Card HEADER rebalanced: Row1 = #N + status badge; name (Row2, flex-1 min-w-0 — fixes "Dom" clipping) + Contact + price (flex-shrink-0).

**Card header — TIME placement.** Time moved beside the order number on Row1 ("#2 · 12:00") so it's prominent (key info) and no longer stacked directly above the price (which read as two related numbers). Price alone on Row2 right. STATUS: built, tsc-clean, **LIVE-TEST PENDING**.

**Deals-on-operator fix.** `event_deals.active` controls CUSTOMER visibility only. The /api/menu/[truckId] deal filter ran unconditionally → wrongly hid off-deals from the operator. Fixed: gated `if (effectiveEventId && !isDashboard)` — operator (dashboard=1) sees ALL deals incl. toggled-off; the customer branch is byte-for-byte unchanged.

### Settings — saving + the phantom-column CLASS

**6. Settings not saving (multiple fields) — FIXED. [VERIFIED saving].** Multiple unrelated fields reverted on save. NOT RLS (the write is already server-side service-role via /api/manage). ROOT: `update_settings` did ONE multi-field UPDATE conditionally including `website`, but `trucks.website` did NOT exist (only on venues/discovery_trucks). Once an operator entered a website, every save included `{ website }` → PostgREST rejected the WHOLE statement → cuisine/contact/social all failed together (explains the "multiple unrelated fields" + intermittence — fine until a website is typed). FIX: (a) migration `ALTER TABLE trucks ADD COLUMN IF NOT EXISTS website text` + add to the Truck type; (b) DURABLE — `update_settings` now ALLOWLISTS writable columns (mirrors `update_truck`), built from `Object.entries(body).filter(allowed && val !== undefined)`, so an unknown/phantom field is DROPPED, not fatal — one bad field can never poison the whole multi-field UPDATE again; (c) clearer error (operator sees "Couldn't save settings — please try again", raw Postgres error logged server-side).

**7. WhatsApp contact method — tick-gated. [LIVE-TEST PENDING — needs migrations].** Disconnect: "Preferred method: WhatsApp" was selectable with no field tying it to a number; the operator's phone usually IS their WhatsApp; the `whatsapp` column existed but nothing wrote it (`whatsapp_sender` = the separate auto-reply Connect integration). FIX: a "This number is on WhatsApp" tick under Phone (`phone_is_whatsapp`, new column). Tick ON → `whatsapp` = the phone number (synced; phone onBlur re-syncs so they don't drift) + WhatsApp becomes selectable as preferred method. Tick OFF → `whatsapp` cleared + WhatsApp not selectable + if preferred was 'whatsapp' it falls back (no orphaned preferred=whatsapp). The customer-facing WhatsApp number lives in the `whatsapp` column; `whatsapp_sender`/Connect (auto-replies) kept entirely separate. Email + Phone got light validation reusing the customer-order-screen helpers (extracted to `lib/contact-validation.ts`: `isValidEmail`, `isValidUKPhone` — shared, no fork). PHONE-RULE OPEN ITEM: validation reuses the customer screen's PERMISSIVE rule (`(\+?44|0)` + 9–11 digits), not strict-11. Dominic asked for "11 digits"; the shared helper keeps both surfaces identical. DECISION OPEN: keep permissive (accepts +44) or tighten to strict-11 (one change in lib/contact-validation.ts, both surfaces follow).

**8. Untick "couldn't save settings" 400 — FIXED. [LIVE-TEST PENDING — needs migration].** Unticking "This number is on WhatsApp" 400'd (brief red toast). ROOT: untick cleared `whatsapp` to `null`, but `trucks.whatsapp` is NOT NULL (dashboard-created, '' default) → the `update_settings` write violated the constraint. (Tick works = string; normal saves carry ''; only untick forced null. Preferred-fallback was a red herring — separate `update_truck` endpoint.) FIX (both, complementary): (a) app-side — `waFromPhone` returns '' not null for the cleared case (matches the '' default, covers both callers); (b) DB — `ALTER TABLE trucks ALTER COLUMN whatsapp DROP NOT NULL` (makes it nullable like the other contact fields, so no path can 400 on null). Confirmed nothing reads `whatsapp` expecting null-vs-'' (the gate checks `phone_is_whatsapp && contact_phone`, not the column value).

### Schedule-verify pipeline — three-layer fix (the "verify" saga)

**9. Verify "Couldn't reach this website" — three distinct bugs, all FIXED. [LIVE-TEST PENDING — needs Vercel deploy Ready].** The Verify button (Find-my-events-automatically → "Where do you post your schedule?") failed on a valid live site (pizzeriagusto.co.uk). Three layered causes, fixed in sequence:
- **(a) Bot user-agent.** The verify route was the ONLY place using a bot UA ('HatchGrabBot/1.0'); hosted-builder/Cloudflare sites instantly 403 a bot UA while serving real browsers. FIX: use the same realistic Chrome UA as the working scrapers (a named `BROWSER_UA` constant) + browser Accept headers.
- **(b) Misleading messaging (3 failures collapsed into one).** Launch-failure, bot-block-empty, and genuine-unreachable all returned "Couldn't reach this website". FIX: capture the nav response (was discarded via `.catch` swallow) and branch the outcome — `launch_failed` ("temporarily unavailable" — our infra), `blocked` (4xx/5xx — site blocking automated checks), `no_content`, `no_events`, `unreachable` (only genuine DNS/cert/connection → "check the URL"). This honest messaging then REVEALED bug (c).
- **(c) Chromium never launched on Vercel (the real blocker).** RECONCILED via Dominic's evidence (it DID work before — 1-2 min single-URL results) + audit: the in-function Puppeteer route IS what serviced the working test; it was NEVER robust — full puppeteer's Chrome lived in an unmanaged `~/.cache/puppeteer` that build-cache luck preserved; a recent redeploy dropped it → `launch_failed`. (Not a scraper regression; not Actions/local; the messaging fix's deploy coincided with the break + made it report honestly.) DECISION: Option (a) — make in-function Chrome DETERMINISTIC (keep the synchronous, single-URL, ~1-2 min UX that worked). FIX: add `@sparticuz/chromium@148.0.0` + `puppeteer-core@24.43.1` (EXACT-pinned — both target Chrome major 148; mismatch = cryptic launch error; exact-pin prevents drift) as direct deps; `vercel.json` memory 1024 for the route; `runtime='nodejs'`; `serverExternalPackages: ['@sparticuz/chromium','puppeteer-core']` (App-Router bundling gotcha); error logging on both previously-bare catches. Full `puppeteer` kept for local-dev fallback. Daily scraper (Actions, `PUPPETEER_EXECUTABLE_PATH`) untouched. REQUIRES Vercel redeploy + Ready before testing.

### Gusto onboarding (Pizzeria Gusto, id 'pizzeria-gusto' — text id, NOT a uuid)
- **Plan:** set to `trial`, `trial_expires_at` = 2026-10-17 (4 months from 17 Jun; stored 22:59:59+00 = end-of-day 17 Oct BST).
- **Van created:** `truck_vans` row — Van1, `kitchen_capacity=5`, `capacity_window_mins=5`, active (mirrors Test Kitchen; Gusto had NO van → the capacity engine had nothing to enforce). Grid config 10/5 (matches Test Kitchen — today's grid-key + ASAP fixes apply identically).
- **Manage console URL:** `hatchgrab.com/manage/{dashboard_token}` → Gusto = `hatchgrab.com/manage/gusto-3d87b5d15a6f`. (Order QR/custom domain → `hatchgrab.com/trucks/pizzeria-gusto/order`.)
- **`trucks.active = false`** — operator-side testing fine; the customer order page needs `active=true` to be visible (flag if the customer link won't load).
- Menu + schedule built via the UI by Dominic (operator-added events, which HatchGrab should show). Event-source rule: HatchGrab shows only operator-added events; VF currently shows events as-is, switching to approved-only once Gusto confirms.

### Mobile UX (Manage console) — [LIVE-TEST PENDING]
- **Reports order-history:** the mobile breakpoint switches the overflowing table to compact rows (#N · date/time + total) with tap-to-expand for type/name/items/qty/price; desktop table unchanged; date/id overlap fixed.
- **Settings kitchen-capacity:** dropdowns narrowed to fit mobile; helper text "below" → "across the selected categories"; example rewritten plain-English to match the model (ceiling = total per window across the selected categories; each cooked category's batch caps that category; example uses ceiling 5); the "cooked — always counts" caption removed from Pizza; Limit-applies-to checkboxes laid side-by-side (wrapping).
- **Schedule copy:** removed the duplicate "You add your own events." sub-line; added a "must be your own website, not Facebook/Instagram" note to the "Find my events automatically" description (the below-URL helper kept as the intentional second mention).

### Reference clarifications (banked this session)
- **`max_orders` / "/5" = `kitchen_capacity`** (legacy/misleading field name) — a concurrency ceiling (= 5 for the one active van), NOT a per-slot order cap. Not a bug.
- **Miso Cheesy Garlic Bread IS a pizza-category item** (counts as a pizza unit for capacity).
- **Test event config:** Nethergate Brewery & Distillery — Long Melford, 20 Jun, `slot_duration_mins=10`, `collection_interval_mins=5` (they DIFFER — see #3).
- **Time engine confirmed sound** (event-tz-pinned, BST-aware via Intl Europe/London; DB UTC vs operator BST is pure display, zero engine impact). Latent pre-multi-tz backlog (non-engine `new Date().getHours()` spots) unchanged — not pre-trial.
- **Offline = deliverability only** (post-trial, native Capacitor app) — unchanged from prior.

### SYSTEMIC THEME worth carrying (banked)
The prod `trucks` schema has columns/constraints the CODE doesn't always match. This session: `truck_events.name` doesn't exist; `trucks.website` didn't exist (added); `trucks.whatsapp` is NOT NULL (the code sent null); the UI "WhatsApp" maps to `whatsapp_sender`, not `whatsapp`. Prior: `is_test` phantom refs. STRUCTURAL GUARD: the `update_settings` allowlist now drops unknown fields so a phantom column can't poison a multi-field write — worth extending the allowlist pattern to other multi-field writes (backlog). When onboarding/working in prod, expect schema-vs-code mismatches; allowlist + IF-NOT-EXISTS migrations + honest error logging are the defences.

### Migrations to run (Supabase SQL editor) — confirm each before testing the dependent feature
1. `ALTER TABLE trucks ADD COLUMN IF NOT EXISTS website text; NOTIFY pgrst, 'reload schema';` (#6 — likely already run)
2. `ALTER TABLE trucks ADD COLUMN IF NOT EXISTS phone_is_whatsapp boolean DEFAULT false; NOTIFY pgrst, 'reload schema';` (#7 — likely already run)
3. `ALTER TABLE trucks ALTER COLUMN whatsapp DROP NOT NULL; NOTIFY pgrst, 'reload schema';` (#8 — pending)

### Open decisions / backlog (post-V7.5)
- **Phone-validation rule:** permissive UK vs strict-11 (#7) — DECISION OPEN.
- **Edit-path capacity rebuild** (#1 backlog) — DECISION OPEN; same drift class as undo, higher value than undo since editing is more common.
- **Extend the allowlist pattern** to other multi-field writes (systemic guard).
- **Verify (#9) live-confirm** post-deploy; the day's other LIVE-TEST-PENDING items.
- **Slot-mismatch re-test** on the deployed build (a fresh ASAP first order files at the resolved slot).
- (Carried) cancel-email HTML-escape; pre-multi-tz device-local `getHours()` conversions; offline-protection via native + multi-van (post-trial); WhatsApp deals/attention notifications; `is_test` phantom-ref cleanup; coarser-grid multi-collection-per-`production_slot` caveat (#3).

## V7.4 — June 2026

Customer-comms + console-polish session (additive on V7.3). Headline: the **reject-reason feature** (operator must give a reason on reject; it is emailed to the customer, HTML-escaped) + a **time-consistency audit** (the capacity engine CONFIRMED sound; a handful of non-engine device-tz spots logged as pre-multi-tz hardening) + the **pricing/feature table** WhatsApp→Pro move and mobile rebalance + the **slot-mismatch re-test** status (the V7.3 fix is confirmed present; a clean re-test on the deployed build is outstanding). Status tags: **[LIVE-VERIFIED]** real device; **[BUILT — pending live test]** tsc-clean, pending live; **[DATA FIX]** SQL; **[CONFIRMED]** verified-correct by audit, no change.

**1. Reject-reason feature — [BUILT — pending live test].** When auto-confirm is OFF, an incoming order is `'pending'` and the operator gets approve / edit / reject. The REJECT now requires a reason that is emailed to the customer (previously one-tap, no reason). Built by cloning the existing Cancel reason pattern (modal → stored reason → reason line in the customer email).
- **New column:** `rejection_reason text NULL` on `orders` (dedicated, NOT reusing `cancellation_reason` — a rejected order isn't cancelled). Migration run manually in the Supabase SQL editor: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejection_reason text NULL; NOTIFY pgrst, 'reload schema';` (applied — confirmed success). **[DATA FIX]**
- **Reject modal** (`app/manage/[token]/page.tsx`): presets "Sold out of an item" / "Too busy — can't make it in time" / "Closing soon" / "Other", plus a free-text note. `doAction('reject')` now OPENS the modal instead of firing immediately (mirrors Cancel).
- **Required-reason validation:** Reject disabled unless a concrete preset is selected OR free-text is entered; "Other" alone is blocked (it requires free-text — Other is meaningless to the customer without detail); a concrete preset alone is allowed. `fullReason` = concrete preset → `"preset"` (or `"preset — note"`); Other/no-preset → the note. Never empty. `confirmRejectOrder` also guards `if (!fullReason) return`.
- **Pass + store:** `confirmRejectOrder` posts `rejectionReason: fullReason` to `/api/dashboard/action`; the reject handler (`action/route.ts:115`) reads it and stores `update({ status: 'rejected', rejection_reason: rejectionReason || null })` — alongside the unchanged `removeOrderFromProductionSlot` unbook (`:120`).
- **Email:** the reject customer email (`action/route.ts:127`, Brevo, guarded on `order.customer_email`) now includes `const reasonLine = rejectionReason ? '<p…>Reason: ${escapeHtml(rejectionReason)}</p>' : ''`, rendered between the "unable to fulfil" and "please order at the truck on arrival" lines. The reason is HTML-escaped (operator free-text → customer email).
- **Prerequisites already in place** (audit-confirmed): the reject action + `'rejected'` status already existed; `customer_email` is REQUIRED at customer submit (every customer order can be emailed); the reject email already existed (it just lacked a reason); emailless manual orders skip the email gracefully (the `customer_email` guard) while still storing the reason.
- Pending-only (reject is pending-gated). Confirm/edit/cancel/auto-confirm and capacity unbooking untouched.

**2. KNOWN ISSUE — Cancel email does NOT HTML-escape the reason (low-priority backlog).** The existing Cancel customer email renders `cancellationReason` raw (`action/route.ts:155`) — an HTML/name-injection / broken-markup risk the reject email now avoids via `escapeHtml`. Exposure is low (operator free-text, not attacker-controlled), so not urgent, but apply the same `escapeHtml` to `cancellationReason` when Cancel is next touched. (An `escapeHtml` helper now exists in `action/route.ts:29`; a comment at `:28` flags the cancel-side gap.)

**3. Time-consistency audit — [CONFIRMED, engine is sound].** Triggered by a 15:59-UTC-vs-17:00-local observation (which reconciled as UTC vs BST — the DB stores UTC `timestamptz`, the operator reads local; pure display, zero engine impact). Full audit verdict: the AUTHORITATIVE capacity/slot engine is time-CONSISTENT and event-tz-pinned — NO UTC/local 1-hour-error risk. Every "now" in slot resolution uses `getNowMinsInTz(eventTz)` (event-local minute-of-day), compared against event-local HH:MM slot strings — the same basis everywhere (the now-clamp, ASAP floor, `isSlotPast`, `earliestCollectionMins`, the `eventDate===today` guard). Helpers are Intl-based (IANA `Europe/London`) so BST/GMT is handled automatically, not a hardcoded offset. The DB-timestamp boundary is clean (the engine never compares a UTC timestamp to a local slot; only elapsed-duration math touches UTC, which is tz-agnostic).
- **LATENT pre-multi-tz hardening** (NOT pre-trial; currently correct for a UK operator because device-tz == event-tz): a few NON-engine spots use device-local `new Date().getHours()` instead of `getNowMinsInTz(eventTz)` — the event closed/ended gates (`isEventClosed` `order/page.tsx:1064`, `isEventEnded` `AddOrderPanel:309`), the ready-time DISPLAY estimate (`calcReadyTime` `prep-utils.ts:70`, `readyMinsFromNow` `AddOrderPanel:227/299`), and UTC-today date fallbacks + Today/Tomorrow picker labels. These only 1-hour-error if device tz != event tz (operator travelling / non-`Europe/London` truck), and even then affect only gating/display, never capacity seating. Convert to `getNowMinsInTz`/`getLocalDateInTz` before multi-tz or native. Same class as the V7.1 `customerAsapTime` fix.

**4. Pricing/feature table — [BUILT — pending live test].**
- **WhatsApp auto-replies moved from Max into PRO** (`lib/plan-features.ts`: `starter:false, pro:true, max:true`), positioned directly above the "Messenger & Instagram auto-replies" row (which stays `coming_soon`) in the "Online sales & automation" section. Result row: Trial ✓ · Starter — · Pro ✓ · Max ✓. (Tier convention is explicit per-row, no auto-inheritance; every `pro:true` also sets `max:true`.)
- **Mobile layout rebalance** (`app/manage/[token]/page.tsx`): the squashed/stacked feature labels were caused by the 4 tier columns at `w-[72px]` (288px) starving the `flex-1` name column (~87px on a ~375px phone) — NOT outer padding (the cards already go full-width on mobile: `px-0 border-0 rounded-none`, with `sm:` restoring desktop chrome). Fix: tier columns `w-[72px]` → `w-14` (56px) at all 11 occurrences (header + 4 transaction spacers + transaction cell + 4 feature spacers + feature cell, kept in lockstep for alignment); desktop `sm:w-28` untouched. Name column ~87px → ~151px (+74%), dropping 3-4-line labels to 1-2. Tradeoff: the 2 transaction rows ("0.99% + card fee" / "Pay at Hatch") may gain one wrap line; the ~20 feature rows (✓/—/Coming soon) fit fine in 56px. Held at `w-14`; `w-12` (48px) is the next lever if still tight on-device, but "Coming soon"/"Pay at Hatch" wrap harder there.

**5. Slot-mismatch (V7.3 §1) — re-test status.** The V7.3 persist-before-file fix (`placeOrderInSlotLocked` resolve-only; persist `order.slot = finalSlot` before filing) is confirmed PRESENT in the customer submit path. A mis-filed order observed this session predated the fix (it was submitted ~58 min before commit `448130f` added the reorder), so it ran on pre-fix code — NOT a gap in the deployed fix. **CLEAN RE-TEST OUTSTANDING** on the deployed build: confirm the Vercel production deployment is `448130f` Ready → clear the test truck → place a fresh ASAP first order → it should file at the resolved slot (not eventStart 10:00). Optional belt-and-suspenders hardening (only if the re-test still mis-files): make the first-order reseed exclude the in-flight order from `buildUnitsFromOrders` (so it never reads the not-yet-persisted slot regardless of ordering) — not needed if the re-test passes.

## V7.3 — June 2026

Booking-core slot-correctness session (additive on V7.1/V7.2). Headline: the **slot-mismatch fix** (persist `finalSlot` before filing capacity) + the **date-correctness invariant** (confirmed) + a **KDS suite** (grid density, two-row header, per-device persistence, cooking-step gate, sound notifications, tap-to-tick disable, "Use anyway" removal) + the **Manage heartbeat** offline-false-pause fix. Plus the 16:55 multi-window seating audit (correct). Status tags: **[LIVE-VERIFIED]** real device; **[BUILT]** tsc-clean, pending live; **[DATA FIX]** SQL; **[CONFIRMED]** verified-correct by audit, no change.

**1. Slot-mismatch — persist `finalSlot` BEFORE filing capacity (do-not-undo) — [BUILT; root + post-fix order confirmed in data].** Bug: an ASAP order was inserted with `orders.slot=null`; `placeOrderInSlotLocked` resolved `finalSlot` (e.g. 16:30), but `order.slot` was updated to `finalSlot` **after** capacity was filed. On a **first-order-after-clear** (`production_slot_usage` empty), `addOrderToProductionSlot`'s lazy reseed (`buildUnitsFromOrders`) read the still-null `order.slot` → hit the `|| eventStart` fallback → filed at eventStart (e.g. 10:00) not the resolved slot, and the explicit merge was skipped (`reseeded=true → return`). Net: `order.slot=16:30` but `production_slot_usage` at 10:00; traffic lights green at the real slot, ASAP computed against wrong occupancy. Only first-order-after-clear + ASAP; order #2+ and specific-time were already correct. **Fix (the root = ordering):** `placeOrderInSlotLocked` is now **RESOLVE-ONLY** (all four `addOrderToProductionSlot` calls removed; returns `{finalSlot, booked}`); the handler (`submit/route.ts`) persists `order.slot = finalSlot` **first**, then files capacity once via `addOrderToProductionSlot(…, claim.finalSlot, …)` under the same event lock — so `buildUnitsFromOrders` reads the resolved slot on the first order too. Verified: a post-fix 16:55 order filed correctly; a pre-fix 16:30 order left a stale `10:00={pizza:2}` orphan (residue — the fix prevents NEW mis-filings, doesn't heal old orphans; cleared by re-clear/rebuild). The `|| eventStart` fallback (`slot-bookings.ts:221/314/346`) is **RETAINED** (defensive for legacy null-slot rows; uses the event's start on the event's date, never today's clock). Logged nuance: the read-only fit-check inside the now-resolve-only `placeOrderInSlotLocked` still includes the in-flight order at its null→eventStart slot for the placement DECISION (never persists; authoritative filing reads the corrected `order.slot`) — make it self-exclusion-aware later if needed.

**2. Date-correctness invariant (do-not-undo) — [CONFIRMED, already enforced].** A collection time (ASAP or specific) must NEVER resolve before the event's actual date/time, and "now" only floors TODAY's events — a pre-order placed the day before must offer slots from the event's start on **its** date, not floored by today's clock. Audit confirmed already enforced across every slot-resolution path (no change): the slots-route floor (`date===today ? now+prep : 0`), `getAsapSlot` (`!isSlotPast`, future/prior-day aware), and `nowClamp = eventDate===today ? now : -Inf` in `buildSlotAvailability`, the customer page, and `AddOrderPanel`. The V7.2 now-clamp applies only to today; future pre-orders floor at eventStart on the event's date. Any future slot-resolution path MUST preserve the cross-day guard (`-Inf` nowMins for non-today events).

**3. KDS suite (all [BUILT] unless noted).**
- **3.1 Window grid density:** unified both views' grid to `repeat(auto-fill, minmax(240px, 1fr))` (~4 across; was Window's fixed `grid-cols-2 xl:grid-cols-3` ~3 across); visible cap 8 for grid; per-mode nudges gated `viewMode==='window'` so Solo is unaffected. `kds/page.tsx` + `OrderCard.tsx`.
- **3.2 Two-row Window header** (fixes overflow at 240px): Row 1 = order# (left) + total (right, `flex-shrink-0` so price never clips); Row 2 = name + time + lateness. Removed the `max-w-[120px]` name cap (full names show; long names truncate within row 2, never clip the card). Cook/Solo headers untouched.
- **3.3 Per-device view/layout persistence:** `hg_kds_view_<token>` / `hg_kds_layout_<token>` localStorage, read-on-mount / write-on-change, per-token. The cooking-step gate still neutralises a persisted `'cook'` to Window when Cook is unavailable.
- **3.4 Cooking-step gate on Cook view:** the Window/Cook toggle + `activeView` were gated only on `can('cook_screen')`; added `&& showCookingStep`. Step OFF → Window-only (no toggle; `activeView` forced Window; stale `?view=cook`/`viewOverride` neutralised). Step ON + Max → both views. `kds/page.tsx`.
- **3.5 Sound notifications — autoplay-unlock + per-device toggle.** Root cause of "no sound ever": the new-order ding code + triggers existed (dashboard pending-count rise; KDS realtime INSERT) but each ding made a FRESH **suspended** `AudioContext` in a non-gesture callback (autoplay-blocked, error swallowed); no unlock existed. Fix: new **`lib/audio.ts`** — singleton `AudioContext`, `primeAudio()`, `installAudioUnlock()` (`pointerdown`/`keydown`/`touchend`), `playDing()`; `playWebBeep` re-sourced to `playDing`. Per-device Sound on/off toggle: dashboard (by "Screen on"), KDS (by the view switcher), per-token localStorage `hg_sound_<token>` / `hg_kds_sound_<token>`, **default ON**; dings gated on the pref; enabling the toggle is the unlock gesture. Test ordering: enable Sound (gesture) THEN place order → ding. `struckPrep` pills (660Hz) + the native Capacitor path untouched.
- **3.6 Per-item tap-to-tick DISABLED via flag (not deleted):** `const ITEM_TICK_ENABLED = false` (`OrderCard.tsx`) gates all of it → items render plain (name + price, like Cook), non-tappable; the `allStruck`-derived header ✓ and card-fade self-disable. `struckUnits`/`tapItem`/`allStruck` RETAINED (flip the flag to `true` to restore). Was Window + Solo (not Cook); purely local visual state, no DB/status dependency.
- **3.7 Over-capacity "Use anyway" modal REMOVED (operator-only):** `handleSlotChange` now just `setManualSlot(value)` (picks any slot, incl. over-capacity, directly); removed `pendingSlot` state, the modal UI, the unused `buildSlotAvailability` import. "Use anyway" carried NO override flag → placement unchanged (over-capacity orders still place/file at the chosen slot). Operator-only: the customer path (`/api/orders/submit`) keeps server-side fit-blocking (untouched). Traffic-light dots (`buildSlotIndicators`) unchanged. `AddOrderPanel.tsx`.

**4. Manage screen heartbeat (offline false-pause fix) — [BUILT].** Bug: dashboard + KDS heartbeat (15s, gated on `activeEventLive`); Manage did NOT → switching dashboard→Manage stopped the only heartbeat → van stale in 30s → the monitor paused the live event (false positive; the device was never offline). Fix: Manage fires `/api/heartbeat` (its truck's `dashboard_token`, no `vanId` → stamps the truck's vans) every 15s + an immediate ping on mount, guarded by `navigator.onLine` (a genuine loss still pauses), ungated on live-event (harmless — the monitor only pauses `status='open'`). Mirrors the dashboard; monitor/route/dashboard/KDS untouched. `app/manage/[token]/page.tsx`. Single-van/single-truck fix; multi-van scoping is post-trial (§6).

**5. Closed backlog (resolved).** Modifiers/Upsells safe-by-design (confirmed V7.1): modifiers are nested `{name,price}`, never a capacity unit; `normaliseOrderLines` ignores `.modifiers`; Upsells are real menu items governed by their category prep; no per-modifier setting needed. Server ASAP placement floor: resolved by the now-clamp (V7.2) applying to submit placement.

**6. Post-trial design decisions (banked, NOT pre-trial).**
- **6.1 Offline protection: screen-presence → connectivity, tied to the iPad/native app.** Principle: offline protection = **deliverability only** (can an order physically reach the device); NOT operator attentiveness (an operator ignoring a CONNECTED phone is out of scope). Correct signal = device→server **reachability**, not screen-presence (which wrongly trips on tab-switch/backgrounding/lock when online). Constraints: `navigator.onLine` insufficient (interface-up ≠ reachable) → a real heartbeat is still needed; **iOS Safari PWA CANNOT keep a background heartbeat alive** (no Background/Periodic Sync; backgrounded JS suspended; Chrome Periodic Sync ~12h min) → the full model effectively **REQUIRES the native Capacitor app** (tie to the iPad app). The offline core was just LIVE-VERIFIED → re-architecting pre-trial is high-risk. Cheap interim ONLY if false pauses are observed in trial prep: lengthen the stale threshold (30s→~90-180s) + a `visibilitychange`/`online` recovery ping (isolated/reversible but re-test). No hybrid/operator-absence handling needed.
- **6.2 Multi-van heartbeat scoping (prerequisite for 6.1):** the heartbeat is per-van but a no-`vanId` dashboard/Manage ping stamps ALL the truck's vans → one online screen keeps every van "online" (per-truck-presence, not per-van-attendance). A correct connectivity model needs each *attended* van's device to report reachability for ITS van. Unresolved. No cross-truck leak (different `dashboard_token`s).

**7. Test status (session end).** **[LIVE-VERIFIED]:** offline protection pauses a stale van's live event; live-redefinition; amber = real-load-only; Specials data fix; the now-clamp ASAP curve; the slot-mismatch fix (post-fix order filed correctly); the 16:55 multi-window seating (audit-confirmed correct). **[BUILT — pending live test]:** the slot-mismatch first-order-after-clear path; the KDS suite (§3); the Manage heartbeat; offline-toggle persistence; reconnect-display; silent-blank retry. **Deploy:** `heartbeat-monitor` edge function via CLI; app fixes via git push → Vercel; confirm the push + **hard-refresh the operator PWA** before testing (a stale service-worker bundle previously masked a deployed fix). **Data note:** Test Kitchen cleared for fresh testing (orders + `production_slot_usage` + counters reset to #1 + pause/wait cleared). Re-run the same clear block (swap to Gusto's `trucks.id`) before onboarding the first real operator.

## V7.2 — June 2026

Slot/ASAP capacity-engine session (banked AFTER V7.1, which was banked mid-session before this work). Headline: the capacity-engine **now-clamp** (backward cooking/capacity windows can never be seated before `now` — the most consequential fix of the session) + the **one-batch prep floor** (now-floor no longer serial-clears the whole queue) + extra-wait wiring **confirmed** + the offline-pause banner **chooser-bleed** scoping. Most BUILT/tsc-clean pending live test; Dominic live-confirmed the corrected ASAP curve. Status tags: **[LIVE-VERIFIED]** real device; **[BUILT]** tsc-clean, pending live; **[DATA FIX]** SQL.

**Capacity engine — NOW-CLAMP on backward-seating (critical; do-not-undo) — [BUILT, curve live-confirmed].** The backward cooking-window seating front-clamped against `eventStartMins` but had **no clamp against `now`**, so a multi-batch order's cooking windows extended into the **past** — counting elapsed oven time as usable. E.g. 12 pizzas (batch 4, prep 5min) at 14:38 seated windows at 14:30/14:35/14:40 (two elapsed) and reported ASAP=14:45 — impossible (3 cycles from 14:38 = 14:53→14:55). The whole large-order ASAP curve was far too early. **Scope:** all three constraint paths referenced `eventStart`, never `now` — (a) per-category prep/batch front-clamp, (b) the **kitchen-capacity ceiling** (van `kitchen_capacity`/`capacity_window_mins`; `maxConcurrentCount` counted past intervals), (c) instant-item placement (`placeInstantPoints`). **Worst consequence:** the **submit placement** (`submit/route.ts`) used the same now-unaware `earliestBackwardFitSlot`, so orders were **actually booked** at unachievable slots (12 pizzas recorded for 14:45) — systematically over-promising customers and backing the kitchen up.
- **Fix — correct model:** cooking can only start at/after `now`; the earliest cooking window for an N-item order at slot S must start ≥ now → **ASAP(N) = now + ceil(N/batch)×prep, grid-rounded** (1-4→14:45, 5-8→14:50, 9-12→14:55, 13-16→15:00 — steps every batch).
- **`nowMins` threaded** into `fitOrderBackward`, `earliestBackwardFitSlot`, `placeInstantPoints` (`lib/slot-availability.ts`); every call site passes it (`buildSlotAvailability`, `submit/route.ts`, both customer memos in `order/page.tsx`, `AddOrderPanel.tsx`). Default `-Inf` (no clamp) for back-compat.
- **Front floor = `Math.max(eventStartMins - prep, nowMins)`** — NOT `max(eventStartMins, nowMins) - prep`. Deliberate: `eventStart` keeps its one pre-open-window pre-prep credit (`- prep`, Manual s.6); `now` gets **no** allowance (you cannot cook in an elapsed window). This yields the physically-honest 14:55-for-12 curve while preserving the pre-event-start credit. (a) cooking: `if (slotMins - nw*prep < Math.max(eventStartMins - prep, nowMins)) runsOffFront = true`; (c) instant: `if (w < Math.max(eventStartMins - capacityStep, nowMins)) …runsOffFront`; (b) ceiling: handled **transitively** — a past-extending placement trips `runsOffFront → consider('red')`, and `consider` only escalates rank (a later amber can't un-red it), so non-off-front placements have every window ≥ now and the concurrency sweep counts only `[now, S]`. No separate ceiling edit.
- **Submit placement clamped:** passes `placeNowMins = eventDate === today ? getNowMinsInTz('Europe/London') : -Inf`, so the **booked** `order.slot` is achievable, not just the displayed slot.
- **Critical cross-day date-guard (do-not-undo):** `nowMins` is minutes-of-day, so clamping a **future-date** event against today's `now` would mis-compare across days and red-flag every slot. **Every caller passes `-Inf` when `eventDate !== getLocalDateInTz(tz)`** → future/pre-order events fall back to legacy event-start-only behaviour. Without this guard all pre-order events break. Any future seating change MUST preserve it.
- **Deliberately NOT clamped — existing-load seating (`projectBackwardOccupancy`):** intentionally left unclamped. (1) its `cantFit` output is never read by `fitOrderBackward` (which reads `back.byStart` + `back.intervals`); (2) existing orders' past-window load is real elapsed oven use; (3) the new order's windows are now ≥ now and never overlap-read existing past load (end-exclusive intervals). Revisit only if a future change makes the new-order fit read existing past-window load.
- **Invariant:** cooking/capacity windows are never seated before `now` (today's events) — consistently across per-category batch, kitchen ceiling, instant placement, customer ASAP display, customer picker, operator ASAP, and the **server booking**. Display and placement agree. Opposite-error checked: a ≤1-batch order still gets the floor slot (not over-clamped); existing real future-window load still blocks.

**ASAP prep floor — one-batch, not whole-queue (do-not-undo) — [BUILT].** The now-floor used `calcMinReadyMins(queueByCat)`, which **serially cleared the entire existing queue** from now (5 queued pizzas → `ceil(5/4)×5 = 10min` → floor 14:25), ignoring **when** those items cook. An order booked at 14:30 cooks ~14:20–14:30, not now — blocking a new order behind it double-reserves the queue. This was a **half-applied fix**: the same serial push was already removed from the event-start term (with a code comment) but survived in the now-floor term. **Fix** (`app/api/slots/[truckId]/route.ts`): feed `calcMinReadyMins` a synthetic **one-batch-per-cooking-category** queue (`oneBatchByCat`), not the real queue → floor = `now + one cook-cycle of the slowest cooking category` (keeps the `Math.max(120,…)` 2-min physical floor), **independent of order/queue size**. Per-window capacity is enforced separately by `fitOrderBackward` (now-clamped, above). `calcMinReadyMins` (`lib/prep-utils.ts`) itself is **unchanged** — only the route's input changed; other `catCookSecs` consumers untouched. (Uses the *slowest* cooking category's cycle, not the smallest, so an off-grid `now` can't offer a slot before a slow order can cook; truck-wide-slow-category over-restriction is pre-existing, out of scope.)

**"Add extra wait" (extraWaitMins) — CONFIRMED correctly wired — [audit-confirmed].** Operator manual delay lever; kept **rigid** for now (prep + capacity drive slots; extra-wait is a manual buffer; smart auto-adjust is future). **Source:** `truck_events.extra_wait_mins` + `extra_wait_started_at` (event-scoped), set via the `set_extra_wait` service-role action (stamps `started_at` on set, nulls on clear). **Single source of truth:** baked into `/api/slots` `earliestCollectionMins` (`+ extraWaitMins`) → all four consumers (customer ASAP, customer picker, operator ASAP, operator picker) inherit it via the slot `too_soon`/`available` flag; the customer ASAP fallback (`customerAsapTime`) uses the same decayed value (via `/api/menu`) — no raw-vs-decayed divergence. **Customer is genuinely blocked** from extra-wait slots (`too_soon` filter + `>= asapTime` gate). **Stacks additively** on the one-batch prep floor. **Decay is BY DESIGN (confirmed by Dominic, not a flaw):** `effectiveExtraWaitMins = max(0, ceil(mins - elapsed))` decays N→0 over N minutes; since the floor is `now + prep + effective` and `effective` decays as `now` advances, the floor is a **fixed-target hold-and-catch-up** — pinned at `t0 + prep + N`, the clock catches up over N minutes, then the normal floor resumes. The stored `extra_wait_mins` column stays at N until the operator clears it (no auto-decrement of the stored value). Intended "block out N minutes, then gradually catch up." See Section 5.

**Traffic-light too_soon→amber fold REMOVED — [LIVE-VERIFIED].** (Already V7.1 §4.1; restated for interaction context.) `lib/slot-display.ts` no longer folds `too_soon` to amber — amber/red reflects **real oven load only** (byCat-backed); `tone = w?.tone ?? 'green'`. **Known nuance (logged, low priority):** post-removal a `too_soon` slot shows **green** (no longer amber), visually identical to a genuinely-available slot — though the customer picker filters it out and the operator ASAP skips it (operator picker still SHOWS it as the override zone). So an operator can see green 14:15/14:20 while ASAP says later, with no on-dot explanation. **Deferred follow-up:** a distinct non-amber "too soon" visual (greyed/marker) so green reliably means selectable — deferred until the now-clamp/one-batch floor fixes settle (they reduce how many slots are wrongly too_soon).

**Offline-pause banner — chooser-bleed fix — [BUILT].** The offline-pause banner ("Online ordering temporarily unavailable / order at the window") rendered on the **event-chooser** screen (`/trucks/[slug]/order`), above the whole chooser including orderable pre-order events — contradicting their "Pre-order" buttons. Contained (pre-orders stayed orderable; not blocking). **Fix** (`order/page.tsx`): gate the banner on `event !== null` (a specific event selected) so it renders only in the single-event order view. On the chooser → no banner (each event's button conveys orderability); a pre-order (non-live) event → never the banner (offline pause applies only to the live event); the live event's order view still shows it when genuinely offline-paused (not over-suppressed). Offline-pause LOGIC unchanged — only WHERE it renders. The connection-error retry card (silent-blank fix) is separate and untouched.

**Backlog deltas:** CLOSED — server ASAP placement floor (V7.1 §2.6 follow-up; resolved by the now-clamp reaching submit placement) and the modifiers/Upsells safety question (safe-by-design, V7.1 §4.3). NEW (deferred) — distinct visual state for `too_soon` slots. Carried — DEALS in WhatsApp; WhatsApp ATTENTION notifications; `is_test` phantom refs; dead-code `getSlotIndicator`/`slot_capacity`; `whatsapp_logs` prod migration; applied-migrations reconciliation; Upstash token rotation; shared-equipment capacity model; cross-van heartbeat leak; phone-backgrounding false-pause; operator FAQ; DELETE stray `app/manage/[token]/page 2.tsx`.

**Deploy reminder:** app fixes deploy via git push → Vercel — confirm the slot/capacity/banner run is pushed and Vercel rebuilt before testing. A stale client bundle / service-worker cache previously masked the too_soon-fold removal → **hard-refresh the operator PWA** after deploy. Edge functions (`heartbeat-monitor`) deploy via CLI only (see Section 22 / V7.1 §6).

## V7.1 — June 2026

Offline-protection system completed end-to-end; slot/ASAP regression fixed (unified prep-aware floor + V6.9 invariant restored); silent-blank customer order page fixed; capacity traffic-light corrected to "amber means real load only"; Specials category data fix; modifiers confirmed safe-by-design. Status tags below: **[LIVE-VERIFIED]** confirmed on a real device this session; **[BUILT]** tsc-clean, pending live test; **[DATA FIX]** applied via Supabase SQL (no code/redeploy). Several items require an edge-function redeploy (see Section 22 / deploy mechanics) — a Next.js git push does NOT deploy `supabase/functions/*`.

**Offline protection (now coherent end-to-end):**
- **Heartbeat-monitor expired-pause bug — FIXED & [LIVE-VERIFIED].** `supabase/functions/heartbeat-monitor/index.ts` (~:80) tested `if (ev.online_paused_until)` (bare non-null), so a stale PAST `online_paused_until` read as truthy → "SKIP — already paused" → the event was never re-paused when the van actually went stale. Fix: skip only if the pause is **still active** (future) — `if (ev.online_paused_until && new Date(ev.online_paused_until).getTime() > now.getTime())`. The 2h pause duration ≫ 30s cron interval → no re-pause spam. Deployed via `npx supabase functions deploy heartbeat-monitor` from repo root.
- **Monitor protection-OFF check — CONFIRMED CORRECT** (`index.ts:78-84`): `effective = offline_protection_override ?? van.auto_pause_on_offline ?? false`; `if (!effective) { SKIP }`. The monitor was never the toggle-persistence culprit.
- **Heartbeat coupled to live event — [BUILT, deployed via push].** Heartbeat (dashboard + KDS, every 15s via `/api/heartbeat`) now fires ONLY when the active event is `status='open'` (effects gated on `activeEventLive`, in deps; immediate ping on the confirmed→open flip to avoid a stale-van window). Customer page does NOT heartbeat (operator-only). Stale threshold = 30s.
- **Offline-protection toggle persistence — FIXED [BUILT, pending live test].** Root cause: it was the ONLY dashboard toggle writing via the browser anon client (`supabaseBrowser.from('truck_events').update(...)`) instead of a service-role route — RLS silently no-ops the anon write (0 rows, no thrown error, unchecked) → never persisted; compounded by the override re-read effect keyed on `[selectedEventId, upcomingEvents]` (re-ran every poll → clobbered the optimistic OFF back to ON). Fix: new `set_offline_protection` service-role action (`app/api/dashboard/action/route.ts`, mirrors `set_paused`/`set_auto_accept`; accepts `true`/`false`/`null`; `.error` checked); toggle + reset-to-default re-pointed to it (optimistic + revert-on-error); re-read re-keyed to `[selectedEventId]` only + a `cancelled` guard; disabling protection also clears `online_paused_until = null` (never touches `paused_until`). Audit confirmed isolated — all other toggles use service-role routes + set state after the awaited write.
- **Customer paused-gate semantics (reference):** customer offline-pause is `offlineProtectionEnabled && online_paused_until > now` (AND-gate, `app/api/menu/[truckId]/route.ts:~228`) — so disabling protection un-pauses the customer even with a leftover value. `Resume orders` (`action/route.ts:~804`) clears BOTH `online_paused_until` and `paused_until`.
- **Reconnect display — dashboard shows Live instantly — [BUILT, pending live test].** After reconnect, `online_paused_until` lingers ~15-30s in the DB. Dashboard-display-only override: `offlinePausedDisplay = offlinePaused && !(deviceOnline && activeEventLive)` → the offline-pause display clears the instant the device is back (`deviceOnline` = `navigator.onLine` + heartbeating for a live event). New `deviceOnline` state + window online/offline listeners; an immediate reconnect-heartbeat fires on the offline→online transition (`deviceOnline` added to heartbeat deps) → clears the DB in ~1-2s. CRITICAL scope: suppresses the OFFLINE pause display ONLY — a manual pause (`paused_until`) still shows paused (`paused = manualPaused || offlinePausedDisplay`). Customer page UNCHANGED (authoritative DB state; ~15-30s lag acceptable).
- **Always-show offline-pause alert — [BUILT, pending live test].** Removed the per-device "Offline-pause alert" toggle entirely (`offlinePauseNoticeEnabled` state/handler/localStorage/gate/UI). An operator must never silence "your orders were paused while you were away." The alert now fires purely on the durable marker (`lastOfflinePauseAt > ack`); the per-event ack (`hg_offline_pause_ack_*`) is KEPT (one-time "seen it" dismissal, not an always-off switch).

**Slot / ASAP / timezone engine:**
- **Timezone architecture — [BUILT].** `getNowMinsInTz(tz)` + `getLocalDateInTz(tz)` (Intl-based, device-independent) in `lib/time-utils.ts`; `localTodayIso()` is now a wrapper over `getLocalDateInTz('Europe/London')`; `/api/slots` returns `tz`; server `is_past` (was UTC-on-Vercel, an hour off in BST) now uses `getNowMinsInTz`. Rule: all date floors use `getNowMinsInTz`/`localTodayIso()`, never `toISOString()`. Future `trucks.timezone` column = one-line change.
- **ASAP slot persistence (server-authoritative) — [BUILT].** ASAP orders stored `slot=null`; incremental booking filed at the `getAsapSlot` boundary but a rebuild read `order.slot || eventStart` → re-filed elsewhere (incremental-vs-rebuild capacity drift). Fix: the server now ALWAYS persists the resolved `finalSlot` to `order.slot` (`submit/route.ts`), never null → both capacity paths converge.
- **ASAP customer visibility — [BUILT].** `confirmedSlot` was nulled at the start-window → customer saw no time. Fix: `confirmedSlot = claim.finalSlot` unconditionally → "Collection time: HH:MM" on-screen + email. Wording: plain "Collection time: HH:MM" (not "(ASAP)"/"around"). Principle: displayed time = when the order is DUE, not the current clock.
- **Unified prep-aware ASAP floor — [BUILT] — regression fix + invariant restore.** The timezone work re-pointed the pickers to `isSlotPast` (`< now`, no lead) while ASAP helpers stayed gated on `available` (folding the old flat `+5` lead) → three different "earliest" values across four consumers; the V6.9 ASAP-equal invariant broke. Decision (Dominic): single floor = now (event tz) + prep/queue, rounded UP to the next 5-min grid slot; the flat `+5` is REMOVED (prep is the real "earliest ready"). Fix: `lib/slot-availability.ts` `isPast = slotMins < nowMins` (no lead), `tooSoon = slotMins < earliestCollectionMins` (the single prep/queue/extraWait lead via `calcMinReadyMins`, 2-min floor); `getAsapSlot` (`lib/slot-utils.ts`) rewritten to `slots.find(s => !isSlotPast(...) && s.available && !s.is_grace)` — one helper, shared by customer/dashboard/server; customer ASAP display precedence `backwardAsap || asapSlot || customerAsapTime`; `customerAsapTime` (now fallback) fixed to `getNowMinsInTz`/`getLocalDateInTz`, `Math.ceil` to grid, `eventTz`+`nowTick` deps.
- **Operator vs customer picker (reference — by design):** the operator picker shows `too_soon` slots (`AddOrderPanel.tsx:632`, `isSlotPast`-only — the deliberate override zone); the customer picker filters `!s.too_soon` → customer earliest = ASAP. So on the operator surface ASAP can be later than the earliest *offered* slot — intentional, not a divergence.
- **KNOWN FOLLOW-UP (logged, post-trial):** server ASAP placement floor still uses non-past + capacity-fit, NOT `earliestCollectionMins` (prep) — under heavy queue the displayed ASAP could be later than where the server books. Recommended: pass `max(startSlot, earliestCollectionMins)` as placement `fromMins`. Low priority pre-trial. See Section 27.

**Silent-blank customer order page — FIXED [BUILT].** Intermittent blank body (header showed; no menu/chooser/spinner/error; refresh fixed it). Root cause: the events fetch swallowed failures (`if (!res.ok) { setEventLoading(false); return }` and `catch { /* Non-fatal */ }`) setting neither `noEvents` nor any error → `events` stayed `[]` → render fell through every branch to `: null` → blank (everything interactive is `event &&`-gated). Fix (three layers): (1) new `eventsError` state set at the now-non-swallowing failure points; (2) the `: null` catch-all replaced with a "We couldn't load the menu — tap to retry" card (retry via `reloadKey`); (3) bounded auto-retry (3 attempts, 1s/2s backoff) before surfacing `eventsError` — `eventLoading` stays true during retries (shows "Loading events…"). Plus a `cancelled` guard. Customer-facing — prevents silently lost orders.

**Capacity traffic-light — amber means real load only:**
- **too_soon→amber fold REMOVED — FIXED [BUILT].** `lib/slot-display.ts:~90` had `if (s.too_soon && tone === 'green') tone = 'amber'`, painting a slot amber purely for being "too soon to collect" (a TIME/lead constraint) even with ZERO oven load — a bare amber dot with no label (SQL-confirmed: `production_slot_usage` all zero, no orders, yet the next slot showed amber). Decision (Dominic): the traffic light reflects ACTUAL oven load only. Fix: fold deleted; `const tone = w?.tone ?? 'green'` — tone comes ONLY from byCat-backed amber/red (`projectBackwardOccupancy` / global ceiling). Grep-verified: no remaining path paints amber/red over an empty `byCat`. `too_soon` is still computed server-side and still drives the customer filter — only its effect on display TONE was removed. Also resolved the perceived ASAP-vs-operator-earliest "conflict" (the override slot is now plainly green).
- **Specials category misconfig — [DATA FIX, applied].** `menu_categories` "Specials" (test-truck, `9bc79999-...`) had `prep_secs=300, batch_size=NULL` — a stray cooking config (the cooking path keys off `prep_secs > 0`, NOT `counts_toward_capacity`, so a booked Specials unit would seat a phantom 5-min window; null batch coerced inconsistently — slots-API `|| 1` → red vs `buildCatConfigs` → 999 → amber). Fix (data only): `update menu_categories set prep_secs=0, batch_size=0` → matches Drinks/Dips (inert in the engine).
- **Modifiers & Extras — CONFIRMED SAFE-BY-DESIGN (no action; closes a backlog item).** The "Extras & Upsells" tab holds two different things: (a) **extras / modifiers** ("Extra Cheese") → `modifier_groups`/`modifier_options` (own tables, NO prep/batch/category), nested `{name, price}` on the parent line, never a separate line; `normaliseOrderLines` reads only item `name`+`quantity` and never touches `.modifiers` → never a `production_slot_usage` unit → can NEVER seat a cooking window. The capacity engine never references the modifier tables (grep-confirmed). Inherently safe FOREVER — no per-modifier attention; would only become unsafe via a code change flattening modifiers into lines. (b) **upsells** ("goes well with", e.g. add a drink) → real menu items added as their own own-category basket lines → counted like any menu item, governed by their category's prep (no separate upsell risk). Specials (above) is unrelated — a genuine menu category, not where extras live.

**Strategy decision:** WhatsApp auto-replies moved from £49 Max to **Pro (£29)** tier — Meta service conversations (customer-initiated, replied within 24h) are free/unlimited since Nov 2024 and HatchGrab uses DIRECT Meta integration (no BSP markup) → marginal cost ≈ £0 (only minimal Gemini Flash on tier-3). WhatsApp is the USP that closes the sale → lives at the conversion price. Open: what justifies the £49 Max tier (multi-van, analytics, team accounts, or the attention-notification feature). See Section 4.

## V7.0 — June 2026

Operator-path capacity DRY + capacity-correctness fixes; durable offline-pause marker + reconnect notification; live-redefinition (status-driven "live") + monitor diagnostic logging; status-driven close lifecycle + early-close confirm; event-conflict detection (duplicate + overlap); WhatsApp tier-3 dietary/allergen answering (presence-confirm / absence-redirect) + deterministic AI caveat. Large logged backlog. Most fixes tsc-clean, NOT live-verified; several need edge-function redeploy / migration.

## V6.9 — June 2026

WhatsApp + capacity-fixes continuation. Tier-3 LLM menu answerer (free-prose, grounded, two safety guards); WhatsApp menu-read column bug fixed + error-swallowing lesson; capacity instant-label restored; capacity first-window pre-open lead; Choose Time ASAP-equal selection fixed. Logged: grounded-allergen answers as a post-trial feature (gated on data restructure); Gemini cost finding (negligible). All built tsc-clean; NONE live-verified.

## V6.8 — June 2026

Capacity-engine completion + fixes session. Completed and corrected the V6.7 kitchen-capacity concurrency rebuild: restored the instant-category dot label (display-only), fixed the first-window pre-open lead for instant items, simplified the capacity description copy (pending), and logged three open issues. Built on V6.7 (`capacity_window_mins` van column + sweep-line concurrency ceiling). Key changes:

- **Instant-category dot label restored (display-only).** The V6.7 rebuild dropped "Other N" from the operator dots (instant items moved out of `byCat` into anonymous concurrency points). Re-added as a DISPLAY-ONLY `byCat` tally in `projectBackwardOccupancy`'s instant branch — the sweep-line ceiling still reads `concurrencyAt(intervals)`, never `byCat`, so no double-count. See Section 6 / Section 10.
- **Instant items get one pre-open window of lead.** `placeInstantPoints`' off-front check changed to `if (w < eventStartMins - capacityStep)` (was strict `< eventStartMins`), mirroring the cooking path's `- prep` allowance, so up to `kitchen_capacity` instant items are ready AT event start (1 item → start, not start+window). One line inside the shared helper → all three callers inherit it. See Section 6.
- **KITCHEN_CAPACITY_DESC copy simplification PENDING** — the "5-minute window" hardcode is wrong post-V6.7 (the window is the configurable `capacity_window_mins`); copy to be shortened, wording not yet finalised. See Section 4 / Section 10.
- **Three issues logged** — Choose-Time can't select the ASAP-equal time; WhatsApp item query falls back to the generic link; and the now-RESOLVED instant first-window lead. See Section 27.

## V6.7 — June 2026

Capacity-engine rebuild session. The global `kitchen_capacity` ceiling is no longer a post-hoc per-window red check — it is now an EXACT sweep-line CONCURRENCY ceiling ("no more than N counted items in production at the same instant"), with its own cadence column `truck_vans.capacity_window_mins` (integer NOT NULL DEFAULT 5, CHECK 1–20) independent of any category's prep and of the cosmetic 5-min customer collection slots. Built + tsc-clean; live-verification pending. Key changes relative to V6.6:

- **Global-ceiling roll-forward gap RESOLVED, then superseded.** The V6.6 KNOWN GAP (an over-ceiling order returned `fits:false` everywhere → empty picker / frozen ASAP) was first fixed with a `cascadeGlobalCeiling` spill helper, which was then REMOVED within the same session and replaced by the concurrency rebuild. Do not reintroduce the cascade helper. See Section 6 and Section 27.
- **Kitchen capacity = exact concurrency ceiling (`maxConcurrentCount`, lib/slot-availability.ts).** A cooking batch of M items (prep P, window-start S) occupies `[S, S+P)` and counts M at every instant in it (a batch spanning a boundary counts M in BOTH windows — never split; splitting under-counts → oversell). An instant counted category is a zero-width point counting M at its instant. No buckets, no anchor/origin constant. See Section 6 and Section 16.
- **Instant counted items are now first-class** — they count toward the concurrency ceiling, are spread on the capacity cadence, and advance the customer ready estimate. This CORRECTS the earlier "instant ceiling-only items aren't spread (out of scope)" framing, which was wrong. See Section 6.
- **`capacity_window_mins` is van-global (operating-mode), not event state** — like `kitchen_capacity`; busy-night flexibility uses the existing dashboard mid-event capacity edit. Per-event overrides of the whole operating-mode set remain the single parked backlog item — do not fork a window-only per-event path. See Section 5 and Section 27.
- **Submit instant-only bypass flipped `!hasOven` → `!hasCounted`** (authoritative gate) — an instant-only counted order previously booked with NO capacity check (an oversell hole now that instant items count); it now falls through to `earliestBackwardFitSlot`. Live-verify first. See Section 5 and Section 6.
- **Cursor instructions must be a fenced code block** — triple-backtick, never free-running text. See Section 22.

## V6.6 — June 2026 (this session)

Pre-trial event-scoping, scheduler-recovery, and venue-keystone session. The headline work is a structural pass that moves PAUSE and EXTRA-WAIT from truck/van scope onto the EVENT (the same class of fix as the V6.5 per-event stock move — transient "what's happening at this event right now" state must be event-scoped, never van/truck), revives the two dead pg_cron schedulers that drive auto-close and offline auto-pause, adds the `venue_id` keystone column to `truck_events` with a live-verified write path and a rebuilt shared venue matcher, completes the per-event stock UI (input-revert, mobile, event-switch flash, follow-category), and ships a temporary HatchGrab event-display fix pending a proper per-truck customer-mode state machine. Key changes relative to V6.5:

- **Pause + extra-wait now EVENT-scoped (replaces van/truck scope)** — manual pause, offline auto-pause, and extra-wait were stored at truck/van level and bled across every event sharing that van (a future event showed "paused" because its van was offline now; a truck-wide manual pause paused every event; extra-wait inflated every event's slots). New columns `truck_events.paused_until`, `online_paused_until`, `extra_wait_mins`, `extra_wait_started_at` hold these per-event. Manual pause writes the selected event; offline auto-pause (`heartbeat-monitor`) stamps the LIVE-NOW event on the stale van (a van with no live event pauses nothing — kills the future-event-paused bug); `/api/heartbeat` clears the event pause on reconnect (incl. the no-vanId dashboard ping — fixes "online dashboard shows Paused"); readers read the event's own columns. The van keeps `auto_pause_on_offline` as the creation default only. New migration `20260612_event_scoped_pause_extrawait.sql`. The legacy `trucks.paused_until` / `truck_vans.paused_until` / `truck_vans.online_paused_until` / `trucks.extra_wait_*` columns are now vestigial (remove post-trial). See Section 5, Section 6, Section 10, Section 11.

- **Customer-side pause handling — basket-safe, view-only while paused** — the submit guard returns 423 (event-scoped) BEFORE any slot/stock/lock work, so a paused order never reaches the kitchen; the vestigial truck-level pause guard in submit was removed (a stale `trucks.paused_until` would falsely 423 every event). The customer order page's "Check again" now RE-FETCHES the menu in place instead of `window.location.reload()` (the reload was wiping the in-memory basket); the basket is kept but read-only while `isOrderingBlocked`. See Section 7.

- **Prominent in-banner "Resume orders" control** — the offline-paused banner on the dashboard gained an inline Resume button (clears both event pause fields), with "connection unstable, may pause again" copy shown for the offline reason only. Primary recovery is still auto-clear-on-heartbeat; Resume is the manual override for stuck/false-positive pauses. See Section 11.

- **Schedulers revived (auto-close + offline auto-pause were silently dead)** — the `auto-event-scheduler` and `heartbeat-monitor` edge functions were deployed with their pg_cron jobs intact, but the cron bearer reads the `service_role_key` secret from Supabase Vault and that Vault secret had been DELETED → empty bearer → 401 → ZERO invocations. So auto-close never fired and offline auto-pause never fired (auto-open limped along only via a client-side loop while a device was open). Fix: restored the Vault secret (`vault.create_secret(<key>, 'service_role_key')`); both jobs now succeed. `heartbeat-monitor` set to a 30-second interval; `auto-event-scheduler` stays 1-minute. Auto-open = "Start Event" = `status:'open'`; auto-close → `closed` is the real ordering gate. (A GitHub-Action-cron alternative was rejected: the 5-minute floor can't meet the 30s offline threshold.) See Section 11 and Section 15.

- **venue_id keystone added to truck_events + venue matcher extracted to a shared module** — new columns `truck_events.venue_id` (uuid FK `venues(id)` ON DELETE SET NULL), `venue_id_source` (scraper|operator|manual|backfill), `venue_match_confidence` (high|low|none). `findVenue` extracted to shared `lib/venue-matcher.ts` (the duplicate copy in `scripts/reresolve-event-venues.ts` was deleted — a latent drift), now returns `{ venue, confidence }`, best-guesses on ambiguity instead of bailing, with a deterministic `pickBest`. The scraper bridge resolves the venue ONCE per row and stamps `venue_id` + `venue_id_source='scraper'` + `venue_match_confidence` on the `truck_events` insert. Live-verified: a test-truck re-scrape stamped 8/8 fresh events high-confidence. New migration `20260612_truck_events_venue_id.sql`. See Section 25 and Section 16.

- **Per-event stock UI completed + `no_item_cap` flag** — four client-side stock fixes on the dashboard: (1) inputs hold a local draft from focus, commit on blur/Enter, revert on Escape (kills the type-over revert + realtime clobber); (2) inputs widened, 16px on mobile, `inputMode="numeric"`; (3) stock state re-shaped to per-event keyed maps with stale-while-revalidate + skeletons (kills the cross-event stale-render flash structurally); (4) a new `event_item_stock.no_item_cap` boolean = "no individual cap this event → ceiling resolves to null → follows the category pool", honoured in all three ceiling readers, surfaced by `get_stock`. The blue "default" label + "reset to default" link were removed (chrome only — empty box still = follow category, a number = cap, retype the default to reset). New migration `20260612_event_item_stock_no_item_cap.sql`. See Section 30.

- **Pending approval-card buttons stack on mobile** — the Approve/Edit/Reject buttons on the "Needs your approval" cards sit in a full-width horizontal row BELOW the venue/time block on mobile (a brief vertical-stack attempt was reverted — too much card height), reverting to the inline horizontal row at `sm:`+. Confirmed-card icon buttons unchanged. See Section 23.

- **HatchGrab event-display fix (TEMPORARY stopgap)** — `/api/discovery/events` now returns operator/approved events ONLY when the host is HatchGrab (`filteredDiscovery = isHG ? [] : …`); scraped `discovery_events` are Village-Foodie-only. This cleared ~10 stale scraped rows off `hatchgrab.com/trucks/test-kitchen` (which had survived a `truck_events` delete because the discovery_truck was flipped `hg_only` but its events stayed `public`). This is a trial expedient — it ties event-source to the HOST, when the durable model ties it to the TRUCK's customer state; to be replaced by the per-truck customer-mode state machine (Section 27, parked work). See Section 7 / Section 15.

- **New migrations** — `20260612_truck_events_venue_id.sql`, `20260612_event_item_stock_no_item_cap.sql`, `20260612_event_scoped_pause_extrawait.sql`. All applied by hand in the Supabase SQL editor, then `notify pgrst, 'reload schema'`. See Section 16.

- **iPad / native app pushed to POST-TRIAL** — the Capacitor wrapper and Stage A offline are no longer pre-trial blockers (dev taking too long); marked "Coming soon" in the features list. The trial runs on web / tablet-browser. Offline auto-pause is browser-agnostic (server-side heartbeat staleness) so it works for the web trial; native only adds the local offline detection banner / screen-wake later. See Section 11 and Section 26.

## V6.5 — June 2026

Pre-trial per-event-stock and live-site-correctness session. The headline change rebuilds stock from a truck-level model into a **per-event sparse-override** model, closing the cross-event sold-out bug (an item marked sold out — or sold through — on one event showed sold out on every other event). Also: brings the dormant operator-events branch of the discovery API alive and gates it by the linked discovery truck's visibility (so a test/hg-only truck shows on hatchgrab.com and is hidden on villagefoodie.co.uk); rebuilds the bridge venue matcher from loose substring matching into token-overlap + village-rank + best-effort, fixing a live-site venue mislink that cascaded the wrong postcode and map pin; strengthens the scraper's town extraction; consolidates the order page → profile page navigation; and clears a batch of small UI/data items (header logo size, billing-tab "coming soon" + sticky pricing header, order-button cart icon, test-kitchen logo). Key changes relative to V6.4:

- **Per-event stock — sparse-override model (replaces the truck-level model)** — stock was truck-level (`item_overrides` keyed `truck_id + item_name`, no event scope) and date-level (`category_stock`), while only the sold count was event-scoped. So a manual sold-out toggle, a manual stock-ceiling edit, OR organic sell-through (via `enforceStockLimits` writing a truck-wide `available=false`) all leaked across every event. The new model: two additive tables `event_item_stock` (PK `event_id,item_name`) and `event_category_stock` (PK `event_id,category`) hold a per-event OVERRIDE that exists ONLY when the dashboard edits stock for that specific event. Every read is `event_item_stock.stock_count (if an override row exists) ?? menu_items_db.default_stock (live Settings)` — so un-edited events read live Settings and a Settings default change PROPAGATES to all future events (confirmed and unconfirmed), while a per-event edit stays isolated to that event. Item names are always read live from `menu_items_db.name` so renames propagate. The atomic oversell guard is preserved: ceiling and sold count share the same `event_id`, a missing override row falls back to `default_stock` (never accidental-unlimited, never 0). See new Section 30.

- **Settings>Menu is the seed; the dashboard is the per-event override** — confirmed clean two-layer split. `menu_items_db.default_stock` / `menu_categories.default_stock` (the Settings>Menu "Default stock per event" field) are the live seed; the dashboard set_stock / sold-out toggle / set_category_stock write the per-event override into `event_item_stock` / `event_category_stock`. There is NO snapshot-on-event-creation and NO backfill — un-edited events simply read the live default. See Section 30.

- **Operator-events branch revived + visibility-gated (the test-kitchen-on-hatchgrab fix)** — `trucks.is_test` does NOT exist as a column despite being referenced in code, so the operator-events branch of `/api/discovery/events` had been ERRORING on the phantom column and silently returning `[]` — operator events were dormant on BOTH domains. The `is_test` references were removed from the operator select + filter, reviving the branch, and operator events are now gated by their LINKED discovery truck's `visibility` (via a dedicated UNFILTERED `hatchgrab_truck_id → visibility` fetch — NOT the visibility-filtered `trData`, which would default an `hg_only` row to public and leak it). Test-kitchen's discovery rows were flipped `public → hg_only`, so it shows on hatchgrab.com (with order buttons) and is hidden on villagefoodie.co.uk. This also FIXED a pre-existing leak: test-kitchen was previously a public discovery row, visible on villagefoodie. See Section 15 and Section 16.

- **Bridge venue matcher rebuilt — token-overlap + village-rank + best-effort (replaces loose substring)** — `findVenue` matched on name substring with a vacuous village AND-filter and took the first match (`.find`), so "The Cavendish Five Bells" matched the RATTLESDEN "Five Bells" (substring) while the correct Cavendish "The Five Bells" was rejected on word order — and the mislink cascaded the wrong postcode (IP30 0RA) and wrong coordinates onto the event (the customer-facing map pin and "Cavendish Five Bells in Rattlesden" display). The matcher now: gathers candidates by token-overlap (so all "Five Bells" venues become candidates), ranks by normalised village agreement (with an embedded-town fallback that reads a town token out of the scraped venue_name), and picks the best candidate. (V6.6: extracted to the shared `lib/venue-matcher.ts` and now stamps `venue_id`; see Section 25.) See Section 25.

- **Best-effort, not bail — the truck validates at approval (the matcher's ambiguous-case philosophy)** — pending events are customer-invisible (every public read gates `status IN (confirmed, open)`), so a best-effort venue guess is only ever seen by the truck during approval, and the truck edits anything wrong before it goes live. The matcher therefore picks the best candidate rather than leaving a blank, and an approved event becomes a trusted anchor for future scrapes. (V6.6 — the `venue_id` anchor column now exists; the confidence-flag SURFACING in the approval queue is still scoped-not-built, Section 27.) See Section 25.

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

- **Manual pause isolation fixed** — the set_paused action now writes to truck_vans.paused_until scoped to the active event's van_id (falling back to trucks.paused_until only when there is no van). The pause button is gated on activeEvent?.status === 'open'. Operator UI reload state still reads trucks.paused_until — backlog fix noted. *(V6.6 — pause is now EVENT-scoped, on truck_events; the van/truck pause columns are vestigial. See Section 5 / Section 11.)*

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

- **isHG gate removed** — the discovery/events route no longer restricts operator truck_events to HatchGrab; confirmed/open truck_events now surface on both the Village Foodie and HatchGrab maps unconditionally (the V5 "operator events HatchGrab-only" rule was temporary for testing). *(V6.5 — operator events are again visibility-gated, this time by the linked discovery truck's visibility enum rather than a host gate; V6.6 — a TEMPORARY host gate `isHG ? []` additionally suppresses scraped discovery events on HatchGrab pending the per-truck state machine; see Section 15.)*

- **Feature labels and footnotes** — FEATURE_SECTIONS in lib/plan-features.ts is the single source of truth for feature rows, human-readable labels, section grouping, and coming-soon status; coming-soon rows are ordered last in the data itself (not at render time). "Facebook, Messenger & Instagram auto-replies" renamed to "Messenger & Instagram auto-replies". PLAN_FOOTNOTES is exported and rendered by both the admin Features tab and the operator Billing tab.

- **Heartbeat architecture documented** — a single last_heartbeat_at per truck_vans row, a 15s ping from both the KDS and the dashboard, a 30s stale threshold, a 2h auto-pause that clears online_paused_until on the next live receipt. All-or-nothing offline detection works by design — the last device still pinging keeps the van live. *(V6.6 — the resulting pause is now stamped on the LIVE-NOW event's truck_events row, not on truck_vans; the heartbeat that detects offline is still a van/device property. See Section 11.)*

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

Merged the earlier engineering-decisions document into a single reference. Starter became permanently free (was £19/mo). Trial became a distinct plan tier. Capacitor native wrapper designated a pre-trial deliverable. Three-stage offline progression documented. Cook screen made Max-only; Instagram/Messenger confirmed Pro; WhatsApp confirmed Max. Per-truck feature_overrides added. KDS view/layout modes and urgency logic documented. *(V6.6 — the Capacitor wrapper is now a POST-trial deliverable; the web/tablet-browser trial does not require it. See Section 11 / Section 26.)*

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

- **Scheduled functions (V6.6)** — two Supabase Edge Functions run on `pg_cron`: `auto-event-scheduler` (1-minute — auto-open/close events at their start/end time) and `heartbeat-monitor` (30-second — offline auto-pause). Both cron jobs authenticate with the `service_role_key` read from Supabase Vault (`vault.decrypted_secrets`); if that Vault secret is missing the bearer is empty and every invocation 401s silently (Section 11). A cron-health alert is on the backlog (Section 27).

- **Native wrapper (POST-TRIAL as of V6.6)** — Capacitor around the existing Next.js app. App ID com.hatchgrab.app, points to https://www.hatchgrab.com. Native modules only for hardware (printer) and OS features (background notifications, offline detection, screen wake). Pushed to post-trial; the web/tablet-browser trial does not require it (Section 11 / Section 26).

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

- **lib/time-utils.ts** (V4, extended V6.4) — canonical time formatter. formatTime(t) strips seconds from HH:MM:SS to HH:MM. localTodayIso() (V6.4) is the single local-Y-M-D helper used by every "is this event today / has this slot passed" floor (never toISOString — Section 6). These are the only implementations; never inline t.slice(0,5) or a parallel date floor. **localDateOfInstant(instant: Date|string, tz='Europe/London') (V7.7)** — returns the LOCAL 'YYYY-MM-DD' date of an ARBITRARY instant in tz (getLocalDateInTz only handles "now"). Mirrors getLocalDateInTz's Intl pattern so the two produce directly comparable strings; used by the WhatsApp once-per-day greeting (Section 20). The shared primitive for "what local day did this timestamp fall on" — never hand-roll a parallel Intl call.

- **lib/modifier-utils.ts** (V4) — client-safe modifier helpers. isModifierAvailable(opt) returns opt.available !== false. Used to filter modifier options in both the customer page and the operator Add Order panel. undefined and null mean available — backward-compatible against rows where the column wasn't set.

- **lib/order-utils.ts** — **server-only**. Exports nextOrderId(eventId, truckId) (V6.3 signature — event RPC first, truck RPC fallback, bare-integer display number; Section 18a). Imports SUPABASE_SERVICE_ROLE_KEY — importing this in a client component will fail the build. Client-safe utilities go in their own files (e.g. modifier-utils.ts), never co-located here.

- **lib/useDragDrop.ts** (V6) — the shared drag-and-drop hook. useDragDrop(onFileDrop, acceptedTypes) encapsulates isDragging plus a dragCounter ref and returns { isDragging, dragProps }. Used by the Menu and Schedule import upload zones and the extracted-events reorder list. Never re-implement drag handlers inline.

- **lib/venue-matcher.ts (V6.6)** — the shared `findVenue` venue matcher, EXTRACTED this session from inline code (the duplicate copy in `scripts/reresolve-event-venues.ts` was deleted — a latent drift). Returns `{ venue: VenueRow|null, confidence: 'high'|'low'|'none' }`. Token-overlap candidates → village-rank → deterministic `pickBest` (exact normName → most token-overlap → lexicographically smallest id). Best-guesses on ambiguity rather than bailing to null. The single fuzzy matcher; resolves venue_id AND postcode/coords together. Separate from lib/venue-signature.ts. See Section 25.

- **lib/schedule-extract.ts** (V6.2, town extraction strengthened V6.5) — the single in-repo home for Gemini schedule extraction and exclusion matching. Exports:

  - **ExtractedEvent** — the extracted-event type (event_date DD/MM/YYYY, start_time, end_time, venue_name, town, postcode, optional address). `address` is optional and must never contain a town or postcode.

  - **INVALID_VENUES** — the skip list ("Closed", "N/A", "TBC", "Unavailable", "Cancelled") applied in both the prompt and post-parse.

  - **buildScheduleExtractionPrompt(inputText)** — assembles the extract-then-enrich prompt, injecting a pre-computed 14-day day→date reference table, the venue-name-cleaning and postcode-assembly rules, the address rule, the invalid-venue filter, and (V6.5) the strengthened town rule: ALWAYS emit town and SPLIT an embedded place-name out of venue_name, with few-shot examples ("The Cavendish Five Bells" → venue "Five Bells", town "Cavendish").

  - **extractScheduleEvents(content, options)** — calls Gemini through callGeminiWithRetry (3 attempts, 2-second backoff), strips markdown fences, parses, and post-processes. Model is **gemini-2.5-flash** (never flash-lite).

  - **normaliseExclusionTerm(term)** / **isExcluded(name, terms)** — the exclusion helpers.

  In-repo callers: **app/api/manage/process-schedule/route.ts** (a ~40-line auth-and-input wrapper), **app/api/manage/verify-schedule-url/route.ts**, and the GitHub Actions scraper's HatchGrab loop. The scraper's inline hgPrompt is a SEPARATE prompt (a divergence — V6.5 found and noted it; convergence onto buildScheduleExtractionPrompt is on the backlog, Section 27). See Section 15 and Section 24.

- **lib/venue-signature.ts** / venue matching in inbound-schedule — see Section 25. The single fuzzy matcher `findVenue` (V6.5 rebuild, V6.6 extracted to lib/venue-matcher.ts) resolves BOTH venue_id and postcode/coords for a scraped event; never resolve a venue twice with two different matchers.

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

> **MEASURED offset — Add Order mobile category tabs (V7.5+).** The Add Order menu's category tabs (`AddOrderPanel.tsx`, mobile/window-scroll path) pin BELOW the event bar using a **measured** offset, NOT a hardcoded `top-[Npx]`. An effect in AddOrderPanel reads the live `getBoundingClientRect().bottom` of the event bar (`id="dashboard-event-bar"` — the lowest chrome element) and publishes it to a CSS var `--addorder-sticky-top` on `:root`; the tabs pin to `top:var(--addorder-sticky-top,145px)` (the `145px` is the first-paint seed/fallback) with `md:top-0` for the desktop internal-scroll column. A `ResizeObserver` on the event bar plus `resize`/`orientationchange` re-measure on every height change (one- vs two-line event bar, font load, future banners), so the tabs self-adjust and never drift. NOTE: the dashboard chrome's own offsets (top-0/51/95) and Village Foodie's date-header offsets (`app/page.tsx`, `sticky top-[158px] md:top-[142px]`) **remain hardcoded** — a future systemic "measured sticky stack" pass could adopt the same CSS-variable mechanism (backlog, Section 27).

### Single order-line renderer (V4)

components/dashboard/OrderLineItem.tsx renders a priced line item across all surfaces. Variant prop (operator | customer) controls rendering. Props include nameSuffix for the Edit/Customise button slot and rightSlot for the price editor.

### Shared discovery/list card + order-summary element (V7.6)

> **RULE (V7.6)** — `components/TruckListCard.tsx` is the SINGLE card used by the truck profile, the event chooser, AND the customer order page's event display. It gained two ADDITIVE, opt-in props this session — `compact?: boolean` (denser flex-row layout: date-left, venue-right, divider removed, venue line-clamped) and `cornerAction?: ReactNode` (an absolute top-right slot, used for the order page's "Change event" link, gated to `events.length > 1`). Both default OFF so the profile and chooser render byte-for-byte identical. Never fork this card for the order page. It renders the area line as "village · POSTCODE" via `areaLine` — which is why the postcode data-gap fix lived in `/api/events` (Section 7), not in the card.

> **RULE (V7.6)** — the customer order page's order breakdown is a SINGLE shared element `orderBreakdownEl`, rendered in BOTH the footer basket-peek and the form bottom-sheet, so the two can never drift. `lib/image-utils.ts` `formatImageUrl` (extracted V7.5) is likewise the one logo-URL formatter shared by `/api/discovery/events` and `/api/menu` (Section 14).

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

> **COMING-SOON STATUS (V6.5)** — iPad kitchen app, advanced reporting, kitchen ticket printing, and Messenger & Instagram auto-replies are shown as "Coming soon" (FeatureValue 'coming_soon') because trial/test operators do not have these yet. Set the relevant plan column to 'coming_soon' in lib/plan-features.ts; the Billing tab and admin Features tab render the badge and order the row last within its section automatically. (The capability of some of these — e.g. the iPad app running in any tablet browser — still exists; "Coming soon" reflects what the current testers are given, and can be flipped back to ✓ when ready. V6.6: the iPad/native app is explicitly post-trial — Section 11.)

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

## Pause and extra wait — EVENT-scoped (V6.6, replaces the van/truck model)

> **CRITICAL ARCHITECTURE (V6.6) — do not undo.** Pause and extra-wait are now scoped to the EVENT, on `truck_events`. They were previously stored at truck level (`trucks.paused_until`, `trucks.extra_wait_mins`) and van level (`truck_vans.paused_until`, `truck_vans.online_paused_until`), which BLED across every event sharing that van/truck: a not-yet-started event showed "paused" because its van was offline now; a truck-wide manual pause paused every event; extra-wait inflated every event's slot estimates. This is the same class of contamination as the pre-V6.5 truck-level stock bug (Section 30) — transient "what's happening at THIS event right now" state must be event-scoped, never van/truck.

New columns on `truck_events`: `paused_until`, `online_paused_until`, `extra_wait_mins`, `extra_wait_started_at` (migration `20260612_event_scoped_pause_extrawait.sql`). The van keeps `auto_pause_on_offline` as the per-event creation DEFAULT only; once an event exists, pause is the event's own property.

- **Manual pause** (`set_paused`, /api/dashboard/action) — writes the SELECTED event's `truck_events.paused_until` (eventId required). Resume clears BOTH `paused_until` and `online_paused_until` on that event. The old truck-wide and van-wide branches are removed. The dashboard and KDS pause/resume controls send `eventId`.

- **Offline auto-pause** (`heartbeat-monitor` edge function) — for each stale van it finds the LIVE-NOW event (London-time `start_time ≤ now ≤ end_time`, today, not cancelled/closed); if effective protection (`event.offline_protection_override ?? van.auto_pause_on_offline`) is true and not already paused, sets `online_paused_until = now + 2h` on THAT event row. A van with NO live-now event pauses nothing (this kills the future-event-paused bug — a future event is never paused just because its van is offline now). Self-heals: if the van is still stale when the next event goes live, that event auto-pauses within ~30s.

- **Readers** (menu API, submit guard, slots, dashboard badge) — read the event's OWN columns. No "live now" gate is needed at the read site because the WRITE side only ever stamps the correct event.

- **Vestigial** — `trucks.paused_until`, `truck_vans.paused_until`, `truck_vans.online_paused_until`, `trucks.extra_wait_mins`, `trucks.extra_wait_started_at` are now unwritten/unread for these features. LEFT IN PLACE (removal post-trial, not mid-stack).

> **BACKLOG (V6.6)** — the KDS pause badge still reads `data.truck?.paused_until` (now null post event-scoping) → it under-reports the event pause on the kitchen screen (display-only; ordering is still blocked server-side). Event-source it like the dashboard badge (Section 27).

> **DEFERRED (V6.6) — "per-event operating overrides".** kitchen capacity, `time_selection_enabled`, slot cadence, and `auto_accept` are truck-wide and COULD optionally vary per event (festival vs quiet pub). These are NOT cross-event contamination (they're set-once operating modes, not live-event activities), so they were deliberately left truck-scoped; making them per-event-overridable is a post-trial config feature (Section 27).


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

> ⚠️ **SUPERSEDED — see Section 31 (canonical, authoritative).** The function described in this V6.4 subsection (`projectOvenOccupancy`) and its continuous FIFO rate model (`rate = batch_size × windowSecs/prep_secs`) were REPLACED by the V6.7 concurrency rebuild (below) and the canonical spec in Section 31. The LIVE engine is `projectBackwardOccupancy` / `fitOrderBackward` (sweep-line `maxConcurrentCount`), and occupancy is a batch-cadence BACKWARD SPREAD, not a continuous FIFO carry. For the correct model, function names, and worked examples, defer to Section 31. This subsection is retained as historical record only.

> **MODEL** — `projectOvenOccupancy` (lib/slot-availability.ts) is a continuous per-category FIFO simulation across production windows. For each window: occupancy = items still cooking (carried forward from earlier windows) + items starting in this window. Per-window throughput is `rate = batch_size × (windowSecs / prep_secs)`. When window == prep (e.g. 5-min window, 5-min prep) the rate is exactly `batch_size`; a slower category (10-min prep on 5-min windows → rate = batch_size/2) spreads a batch across multiple windows. `prep_secs == 0` (instant items: drinks, dips) never occupies the oven.

> **RULE — kitchen_capacity counts ITEMS, not batches.** kitchen_capacity is a per-window cross-category ceiling on total items cooking. TWO constraints bind a window: (a) the global item ceiling (total items in the window ≤ kitchen_capacity — a cross-category backstop), and (b) cumulative per-category throughput (the FIFO rate above). The per-category math lives in `calcReadySecsByCat` / `calcQueuePushSecsByCat` (lib/prep-utils.ts) — one formula, no fork.

> **RULE — the ceiling reddens, it does not slow.** kitchen_capacity makes a window RED when total cooking ≥ capacity, but does NOT slow any category's drain rate — each category drains at its own batch rate. This assumes categories cook on INDEPENDENT equipment. For a truck whose categories share one oven/fryer, the projection runs optimistic. A shared-equipment model is a deeper change (backlog, Section 27).

> **RULE — tail-completion placement.** ASAP and auto-accept resolve an order to the window where its LAST item finishes cooking in the projected queue (project with the order folded in; find its tail-completion window), NOT "first non-red slot". This tells the customer the truthful ready time. If the tail-completion window would fall after event end → pending (never rejected). The chosen-slot (non-ASAP) path measures the tail from the chosen slot.

> **RULE — one helper for dots and placement.** The same projection drives BOTH the operator traffic-light dots AND the ASAP/auto-accept placement. The dots are queue-only; the basket affects only the live ASAP estimate, not the dot colours.

> **RESOLVED (V6.7) — was: global-ceiling roll-forward gap.** The V6.6 gap (an over-ceiling order returned `fits:false` at EVERY slot → empty picker / frozen ASAP) is fixed. The interim `cascadeGlobalCeiling` spill helper was built and then REMOVED in the same session — do NOT reintroduce it. The global `kitchen_capacity` ceiling is now an EXACT sweep-line concurrency check with its own cadence (`capacity_window_mins`), documented in the next subsection. SEVERITY was UX-only (the submit gate pended over-ceiling orders under the lock — never overfilled).

> **VERIFIED EXAMPLES (test-kitchen, batch 4, 5-min window == 5-min prep, capacity 6):** 1 pizza @17:20 → 17:20 AMBER "Pizza 1/4", 17:25 GREEN. 10 pizzas @17:00 → 17:00 RED 4/4, 17:05 RED 4/4, 17:10 AMBER 2/4, 17:15+ GREEN. 4 pizzas @17:00 → 17:00 only. Rate scaling: a 10-min-prep category on 5-min windows runs at rate 2.

> **TWO BUGS FIXED in the rate/carry math (V6.4):** (1) the displayed denominator was doubled because the rate used the caller's `slot_duration`-based windowSecs; it now derives the real step (`stepSecs`). (2) A single sub-batch order lit two windows because two 5-min display rows mapped to one production bucket; units are now read only on the first collection row per production_slot (countedSlots).

### Kitchen capacity = EXACT concurrency ceiling with its own cadence (V6.7)

> **DO-NOT-UNDO (V6.7) — kitchen_capacity is a CONCURRENCY ceiling.** It means "no more than N counted items in production at the SAME INSTANT," judged by an exact SWEEP-LINE max-concurrency (`maxConcurrentCount`, lib/slot-availability.ts) — NOT per-window buckets, with NO anchor/origin constant (if you find yourself adding one, stop). A cooking batch of M items (prep P, window-start S) occupies `[S, S+P)` and counts M at every instant in that interval — a batch spanning a window boundary counts M in BOTH windows, NEVER split (splitting under-counts → oversell). An instant counted category (`secs:0`, `countsToCapacity:true`) is a zero-width point counting M at its instant.

> **`truck_vans.capacity_window_mins` (V6.7)** — integer NOT NULL DEFAULT 5, CHECK 1–20; migration `20260612_capacity_window_mins.sql`. The ceiling's OWN cadence (`capacityStep`), independent of any category's prep AND of the cosmetic 5-min customer collection slots. Van-global — changing it propagates to all that van's events (an operating-mode setting, not transient event state — see Section 5 / Section 27). Read alongside `kitchen_capacity` in `/api/slots`, `/api/dashboard`, `/api/orders/submit` (`eventKitchenCapacity`), `/api/manage` `get_vans`; default 5 if null. Write via `update_van_settings`; an "every N min" 1–20 dropdown sits beside the items dropdown on the Manage van card AND the dashboard capacity card (disabled until a capacity is set).

> **What capacityStep drives** — where instant counted items are SEATED and how `placeInstantPoints` rolls instant overflow backward. Cooking batches are deterministic (prep grid + collection time) — the sweep-line READS their concurrency; the cascade does NOT relocate them. With no cooking category, capacityStep still gives the instant spread a real cadence (closes the old `step==0` collapse). Per-category batch placement (pizza on its prep grid, "Pizza 4/4" tones) is UNCHANGED and independent — it is the category's own ceiling. Both ceilings co-exist via the existing worst-wins `consider()` logic ("4 pizzas + 2 other, or 3 other → 3 pizzas").

> **Instant counted items are FIRST-CLASS (V6.7 — corrects the earlier note).** The prior framing that "instant ceiling-only zero-prep items aren't spread (rare, out of scope)" was WRONG — operators tick Other/sides into the ceiling deliberately. Counted-instant items now count toward concurrency, spread on the capacity cadence, and advance the ready estimate. Remove the "out of scope" framing wherever it surfaces.

> **THE DO-NOT-UNDO — one helper, three callers.** ONE concurrency helper + ONE `placeInstantPoints` rule, used IDENTICALLY by `fitOrderBackward` (picker/dots), `projectBackwardOccupancy` (recorded occupancy), and the submit gate (`earliestBackwardFitSlot`). If any one constructs intervals or places instants differently, the three disagree → oversell. Oversell safety is by CONSTRUCTION, not the final sweep: `placeInstantPoints` pass 2 places the order's points against a base already containing pass 1's existing-instant points (via `back.intervals`) and only ever fills remaining per-window headroom, so `runsOffFront === false` ⟹ full union peak ≤ cap. The final union `maxConcurrentCount` only upgrades green→amber, never reds. Instant-cohort placement is deadline-ascending + latest-window-first (EDF) — exact for existing cohorts. KNOWN LIMITATION (undersell-only, acceptable): the ORDER's instant cohort is always placed last regardless of deadline, so a joint EDF re-pack might occasionally pend a placeable order (operator can place it manually). Never oversell.

> **Ready estimate (V6.7)** — `customerAsapTime` (order/page.tsx) now advances "Around HH:MM" for counted-instant items via `extraCeilingMins = max(0, ceil(totalCounted / kitchenCapacity) - 1) * capacityStep`, folded as `max()` with the per-category cooking lead. `backwardAsap` stays authoritative.

> **SUBMIT BYPASS CHANGED (V6.7 — authoritative gate, verify live first).** The instant-only bypass flipped from `if (!hasOven)` to `if (!hasCounted)`. Previously an instant-only order booked at the start slot with NO capacity check — now that instant items count, that was an oversell hole. Counted-instant orders now fall through to `earliestBackwardFitSlot`; truly-uncounted orders still bypass.

> **LIVE-VERIFICATION PENDING (V6.7, folds into the Section 26/27 pre-trial click-through).** PRIORITY: an instant-only counted order over cap pends/bumps at SUBMIT (the bypass flip — silent-oversell path if wrong). Plus: 16 Other rolls ready time/picker; van window 10 + 8 pizzas reads over-capacity in the 10-min span; normal in-capacity event dots unchanged; "4 pizzas + 2 other / 3 other → 3 pizzas" holds; an unproducible-by-end order pends under the lock. tsc-clean ≠ done.

> **INSTANT-CATEGORY DOT LABEL RESTORED (V6.8 — display-only).** The V6.7 concurrency rebuild relocated counted-instant items (e.g. Other) out of `byCat` into anonymous zero-width concurrency points, so the operator dot COMPOSITION label lost "Other N" (cooking cats kept their `byCat` entry, so Pizza still labelled). RESTORED as a DISPLAY-ONLY `byCat` tally written at `deadline − capacityStep` in `projectBackwardOccupancy`'s instant branch, ADDED alongside the unchanged `instantHere`/concurrency-points path. Safe because `byCat` is read only by display (composition label + `remainingByCat` + the cooking tone loop, which skips `batch==null` so instant cats never self-red); the sweep-line ceiling reads `concurrencyAt(intervals)`, NEVER `byCat` — so the instant item is counted once (as a point) and labelled separately, no double-count. Instant-only windows now create a `loadByStart` key so they emit a labelled `BackwardWindow`. Plain-count label ("Other 3" = 3 Other items in that window), not a ratio. NOTE: when `capacity_window_mins` ≠ a cooking category's prep, the instant tally sits on the capacity-grid window, which may render on a different dot than a co-collected cooking item — expected, given the decoupled cadence. See Section 10.

> **INSTANT FIRST-WINDOW PRE-OPEN LEAD (V6.8 — DO-NOT-UNDO).** Instant counted items get ONE pre-open window of lead, mirroring the cooking path's `eventStartMins - prep` allowance. `placeInstantPoints`' off-front check is `if (w < eventStartMins - capacityStep)` (was strict `< eventStartMins`). So up to `kitchen_capacity` instant items are ready AT event start (1 item → start time, not start+window). Result at cap 6 / window 5 / empty 17:00 event: 1→17:00, 6→17:00, 7→17:05, 12→17:05, 13→17:10. The allowance lives INSIDE `placeInstantPoints` (the single shared helper) so `fitOrderBackward`, `projectBackwardOccupancy`, and the submit gate inherit it identically — NEVER add it in a caller (divergence → oversell). The sweep-line ceiling and per-window headroom check are unchanged; every window incl. the pre-open one is still capped at `kitchen_capacity`.

### Operator-path catConfigs DRY unification (V7.0)

> **FIXED (V7.0).** The operator surfaces (AddOrderPanel Add Order, dashboard Edit Order) previously fed the engine a reconstructed `categoryConfigs` (from `/api/menu`) lacking `countsToCapacity`, so instant items never counted toward the ceiling on the OPERATOR path (worked on the customer path only). FIXED: both operator surfaces now consume the server's complete `catConfigs` from their existing `/api/slots` fetch (`serverCatConfigs` / `editServerCatConfigs`), byte-identical to the customer path. Closes the blast radius: earliest-fit, slot dots/tones, AND the edit picker all under-counted instant items from the same root. **DRY PRINCIPLE (confirmed intent): capacity MATH and inputs are identical across customer and operator; the ONLY operator/customer difference is presentation** (operator sees all slots + traffic-light tones + override; customer sees available-only). The flag-less `categoryConfigs` is KEPT for non-engine prep/display reads (`.secs`/`.batch` only — `calcQueueAwareReadySecs`, kitchen/assembly split, dot labels) because it carries live operator prep-edits; no engine call reads it. See Section 10.

### Instant-point tone under-colouring FIXED (V7.0 — display-only)

> **FIXED (V7.0).** `projectBackwardOccupancy` built its per-window tone list from `loadByStart`, but spilled instant concurrency points were pushed to `intervals` (ceiling) without creating a `loadByStart` key — so a window holding ONLY spilled instant points (e.g. 11 anchovies spilling to a backward window at cap) got NO tone computed and the dot defaulted to green despite being at the ceiling. FIXED: each placed instant point's window-start is now guaranteed a `loadByStart` key (`if (!loadByStart.has(p.startMins)) loadByStart.set(p.startMins, {})`) so the existing `concurrencyAt`→tone loop colours it. **DISPLAY-ONLY** (`fitOrderBackward` reads `back.intervals` which already contained the points → subsequent fits were already correctly gated; this only fixes the dot tone). The single-window instant LABEL (`deadline − capacityStep`) was kept as-is in this fix.

### OPEN — instant LABEL should spread per-window (decision pending, NOT YET BUILT)

> **OPEN (V7.0).** The instant-item dot LABEL is stamped on a single window (`deadline − capacityStep`) while cooking labels spread per cooking-window. After the tone fix (above), tone and label DISAGREE for instant items (tone spreads, label bunches). **Agreed direction (Dominic):** the label should spread per-window like cooking batches — the capacity window has duration+count exactly like a category has prep+batch, so instant items should display per-window uniformly. `placeInstantPoints`' returned points carry per-window counts (`p.items`) directly, so the fix is to write each window's point-count into that window's `byCat` instead of dumping N on one window (REPLACE the single-window stamp, not add). **OPEN DECISION before building:** spread only genuinely `countsToCapacity` categories (e.g. anchovies), keeping forced-for-display-only categories (e.g. Drinks, force-counted in the physical re-projection pass) single-window — vs spread everything. The physical re-projection (`slot-display.ts`) forces all no-prep cats `countsToCapacity` for the label, so naive spreading would smear Drinks across windows and could misalign label vs tone. Also a `runsOffFront` edge: spread shows only placed count; single-window showed full N. NOT YET BUILT.

### production_slot_usage maintenance — first-order double-count + silent rebuild no-op FIXED (V7.0)

> **BUG 1 (confirmed by SQL — one pizza order recorded as `pizza:2`).** The FIRST order of an empty window double-counted. Submit's fit-check `getProductionSlotUnits` read an empty table, lazily rebuilt from `orders` (already including the just-inserted order) AND PERSISTED it; `addOrderToProductionSlot` then read the now-non-empty table, its reseed skip-guard didn't fire, and it merged on top → 2. Triggers only on the first order of an event/window (later orders merge once, correct). FIXED: read-only reseed — `readProductionSlotUnits` gained `persistReseed` (default true); pure reads (`getProductionSlotUnits`) pass false so the fit-check no longer writes; `addOrderToProductionSlot` keeps persist and is the sole authoritative write. `reseeded` now means `didPersist` (zero-count guard: `reseeded` ⟺ it wrote). Submit holds the per-event lock across fit→write so the gap is race-free. NOT the modifier (the parse provably never expands modifiers — that was a red herring; "first order of the window" was the real trigger).

> **BUG 2 (why the reconcile silently failed).** `rebuildProductionSlotUsage` early-returned with only a `console.warn` on a DELETE error, leaving stale rows while the caller counted success → "ran, still 2" masquerade. FIXED: now THROWS on delete/query/per-event-write errors (`syncProductionSlotUsage` returns its upsert error); message includes truckId/eventDate/event id. CAVEAT: a zero-row-matched delete (event_date mismatch — stored `production_slot_usage.event_date` ≠ the event's current date) does NOT error, so it'd still no-op silently — if a rebuild reports ok but the row stays stale, check for that data condition. LESSON (recurring): a swallowed/absent error is indistinguishable from "nothing to do" — surface it. Both bugs: OVER-count → false-full (slots look fuller than reality, turn away fittable orders), NOT oversell. Bug 1 fired on every event = systematic, operator-facing. See Section 15.

## ASAP cancellation cutoff (V6)

For ASAP orders (null slot), the cancellation cutoff falls back to the event end_time. /api/orders/cancel joins truck_events!event_id (end_time) and computes effectiveSlot = order.slot ?? event.end_time ?? null; if neither is available the cutoff check is skipped.

> **POST-TRIAL CONSIDERATION** — Store a ready_time on the order row at submit time so the cancellation cutoff has an exact target.

## Time rounding and display

- Customer-facing ASAP rounds to NEAREST 5 minutes. ASAP button shows "Around 17:10".
- Truck dashboard shows exact ready times.
- Times display as HH:MM throughout — seconds stripped via the shared **formatTime** helper. Never inline t.slice(0,5).

## Slots API contract

The slots API (/api/slots/[truckId]) returns the slots list with availability flags, queueByCat, and catConfigs so the customer page can do queue-aware ASAP client-side. As of V6.3 the availability flags include too_soon as a separate field (Section 10). (V6.6: the route also sources extra-wait from the resolved EVENT's `extra_wait_mins` / `extra_wait_started_at`, not `trucks` — Section 5.)

## prep_secs and batch_size defaults

In the menu API, prep_secs and batch_size return null when unset, NOT 0. Consumers use || 0 for the "instant items" interpretation and fall back to DEFAULT_CAT_CONFIG when truly missing.

> **NOTE (V6)** — A null batch_size means "no limit" and renders as a blank input with an ∞ placeholder. Watch for legacy rows storing a sentinel like 999 — clean these to null.

# 7. Customer order page UX

## Collection time default

On the customer order page, ASAP is auto-selected by default (asapChosen initialises to true). ASAP and Choose Time remain mutually exclusive.

## Category tabs + subcategories — DELIBERATELY divergent from the operator (V7.6)

> **DO-NOT-UNIFY (V7.6).** The customer order page (`app/trucks/[slug]/order/page.tsx`) shows category TABS with subcategory section headers, ordered by the truck's MENU ORDER (subcategories like Taste of the Month / Classics / Meat Lovers under Pizza). The operator Add Order panel is intentionally the OPPOSITE — flat ALPHABETICAL, no subcategory headers (Section 10). These two are deliberately divergent; do NOT unify them.

- **Sticky category tab bar** uses a robust hardcoded offset, deliberately NOT the operator's measured `--addorder-sticky-top` mechanism (which measures `#dashboard-event-bar`, a thing that doesn't exist on the customer page).
- **Sticky subcategory headers (CONFIRMED WORKING)** pin at `top-[121px]` (60 header + 61 tab bar), z-20, as an opaque full-bleed white band (`-mx-4 px-4`). Swap-not-stack: each header lives in its own group `<div>`, the window is the scroll container, no transform/overflow trap. A single-category menu pins its header at `top-[60px]`. The header text is `text-sm`/`py-2`. NOTE: `top-[121px]` depends on what's ABOVE the header (header + tab bar), NOT on the header's own height — do not "recalculate" it when only the subcategory font changes.

## Tab-switch scroll — scroll to the menu anchor, not the top (V7.6)

> **RULE (V7.6)** — on a category-tab change, scroll to the MENU anchor (`menuTopRef.getBoundingClientRect().top + scrollY − 60`), NOT `document` top. Scrolling to the top would re-show the event card and the deals block, which must stay hidden after the customer has started browsing. The window stays the scroll container (this does NOT disturb the sticky subcategory work). First-mount is guarded; scroll is `behavior:'auto'` (instant); `Math.max(0, …)`.

## Item quantity stepper — decouple "change quantity" from "opens a modal" (V7.6)

> **BUG FIXED (V7.6, high severity).** The +/− quantity stepper on plain menu cards disappeared — removal became impossible for any item with an upsell or notes. ROOT CAUSE: `opensModal` had been WIDENED from extras-only to `hasModifiers || itemUpsells.length > 0 || catAllowNotes`, which pulled the modal-only "qty · Add" control onto plain menu items and suppressed the inline stepper. FIX: gate the quantity stepper on `hasModifiers` (NOT `opensModal`); on the qty===0 Add branch, open the modal only for upsell/notes-but-no-modifier items on the FIRST add (`opensModal && !hasModifiers ? openItemModal : addItem`), with subsequent +/− as plain increments. Extras/upsells (add/remove-one inside the modal), the modifier popup, and per-variant +/− are UNTOUCHED. **LESSON: a condition controlling "this opens a modal" must NEVER also gate "can the quantity change."**

## Form bottom-sheet — two-stage commit (V7.6)

> **RULE (V7.6)** — checkout is a two-stage commit. Stage 1 = a footer basket peek (`summaryExpanded`, default COLLAPSED). Stage 2 = a form bottom-sheet (`formSheetOpen`): the Collection-time and Your-details sections are lifted into an overlay (the item-modal idiom — `fixed inset-0 z-[60]`, `bg-black/40` backdrop, `rounded-t-2xl max-h-[90vh] overflow-y-auto`, ✕). The Place-order button moved INTO the sheet with the full validation gate verbatim ("Place order"). The footer button was RE-ROLED to OPEN the sheet (gate dropped to hasItems / not-blocked), reworded "Review & order →". The error / paused-423 / 409-lock / 409-stock notices were RELOCATED into the sheet, above the place-order button. Success → receipt supersedes; a hard error → the error page; a 403-ended event disables the sheet button. Closing the sheet keeps the basket. (Android hardware-back is not wired — matches the existing item modal.)

> **RULE (V7.6)** — the order summary inside the sheet renders the shared `orderBreakdownEl` (Section 3), default EXPANDED (`sheetSummaryExpanded`) with a sheet-only `max-h-[40vh] overflow-y-auto` cap; the footer peek renders the same element but uncapped and collapsed-by-default. DECISION: expanded-by-default beats the Deliveroo collapsed default because truck orders are small; the cap protects the rare large order. The chevron tracks state (`rotate-180`).

## Event card on the chooser — compact + postcode (V7.6)

> **RULE (V7.6)** — the order page renders its event display via the shared `TruckListCard` with `compact` + a `cornerAction="Change event"` link (gated `events.length > 1`); the old standalone Change-event row was deleted. **POSTCODE data-gap fix:** `/api/events` was omitting `postcode` from its SELECT and map — added to the select, the map, the `EventData` type, and `eventToVillage`. `TruckListCard` already rendered "village · POSTCODE" via `areaLine`, so no card change was needed.

## Item row — canonical food-app layout (V7.7)

> **ITEM ROW (V7.7, supersedes the earlier Option-B row note; operator-confirmed on device).** The item row now reads top-to-bottom, full width: (1) top line = optional thumbnail + name + inline badges only; (2) description full-width; (3) dietary/allergen chips full-width; (4) a bottom baseline (`flex justify-between`) = PRICE left, Add button / quantity stepper right. This is the Deliveroo/Uber-Eats pattern — the price gets a stable left edge (consistent down the list regardless of name length), the Add buttons align right. Rows are ~one taller than the prior crowded layout (~one fewer item per screen) — an ACCEPTED tradeoff for tidiness, not a regression. The thumbnail slot (`w-16 h-16`, `flex-shrink-0`, conditional on `item.photo_url`) stays on the top line beside the name; when absent it reserves NO width (so text-only rows use full width). PHOTO LAYOUT DECISION: left-thumbnail chosen over full-width-top photos deliberately — it adds no vertical height and degrades gracefully for a mixed photo/no-photo menu (full-width photos punish missing/amateur operators). Trial launches with NO photos uploaded (cleanest consistent state); photos are post-trial polish.

> **MENU LIST POLISH (V7.7, BUILT, live-test pending unless noted):** (a) the menu list carries a `min-height` of roughly `innerHeight − 121` (header 60 + tab bar 61), measured from a `viewportH` state updated on resize/orientationchange, so a SHORT category (e.g. Dips & Sauces, 3 items) has enough scroll distance to pin its tabs to the top — the earlier tab-switch-scroll fix couldn't pin short categories because the page bottomed out first; min-height is self-cancelling (inert for long categories, no blank gap). (b) the category tab bar's horizontal scrollbar is hidden via a `.scrollbar-hide` utility (`scrollbar-width`/`-ms-overflow-style`/`::-webkit-scrollbar`) — swipe-scroll still works; the intentional `border-b` separator below the tabs is untouched. (c) the subcategory-boundary divider was fixed: `divide-y` on a per-group wrapper dropped the line at the last item before a subcategory header; adding `divide-y` to the category container draws a separator above each subsequent subcategory header (no stray line at category top or after the final item). (d) divider colour lifted slate-100 → slate-200 (clearer but still subtle; both the per-group and category-container declarations matched). (e) allergen/dietary chips converted text-[10px] → text-[0.625rem] so they SCALE with the OS "Larger Text"/Dynamic Type setting (name/description already scaled via rem; chips were the only hardcoded-px type in the row).

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

If the customer picks a specific time then adds items that push ASAP past it, the chosen time auto-clears. The Choose Time dropdown only shows slots at or after the calculated ASAP. (V6.6 known gap: when the basket exceeds the GLOBAL kitchen_capacity for one window, the picker currently goes empty rather than rolling to the next window — Section 6 / Section 27.)

## Pause handling on the customer page — basket-safe, view-only while paused (V6.6)

> **RULE (V6.6) — a paused event never takes an order, and the basket is never lost.** The submit guard (/api/orders/submit) reads the EVENT's own `paused_until` / `online_paused_until` and returns 423 BEFORE any slot/stock/lock work, so a paused order never reaches the kitchen. (The vestigial truck-level `trucks.paused_until` guard in submit was REMOVED — a stale value would have falsely 423'd every event.) On the customer page:
> - The order page reads `truck.paused` / `pauseReason` on load and shows a sticky pause banner; `isOrderingBlocked = isPaused || isEventClosed` disables the order controls.
> - **"Check again" RE-FETCHES the menu in place** (a reusable `refetchMenu`), NOT `window.location.reload()` — the reload was wiping the in-memory basket. If still paused → banner + basket stay; if no longer paused → banner clears, controls re-enable, basket intact.
> - **The basket is kept but READ-ONLY while `isOrderingBlocked`** — the customer can view it but not add/remove/change quantities until ordering re-enables.
> - A submit-time 423 is handled non-destructively (show a pause notice, keep the basket, early-return — never `setError`/clear).
> - The basket is in-memory React state only (no localStorage); a manual browser refresh still clears it — full persistence is deferred (Section 27).

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

## HatchGrab event display — operator-only (V6.6, TEMPORARY)

> **RULE (V6.6, STOPGAP) — on HatchGrab, scraped discovery events are suppressed.** `/api/discovery/events` returns operator events ONLY when the host is HatchGrab: `const filteredDiscovery = isHG ? [] : (mappedDiscoveryEvents…).filter(…)`. So hatchgrab.com shows only operator/approved events (with order buttons); scraped `discovery_events` are Village-Foodie-only. Village Foodie (`isHG === false`) is byte-for-byte unchanged. This cleared the ~10 stale scraped rows that were showing on hatchgrab.com/trucks/test-kitchen (scraped events have no status concept and survived a `truck_events` delete; the discovery_truck was flipped `hg_only` but its events stayed `public`). **THIS IS TEMPORARY** — it ties event-source to the HOST, whereas the durable model ties it to the TRUCK's customer state (discovery → preview → live). To be UNWOUND by the per-truck customer-mode state machine (Section 27, parked work). EXPOSURE NOTE: a stranger with the URL can still place a real order on any `trucks.active=true` truck with a confirmed event — only `active` + event status + pause gate it; there is no `published`/`accepting_online_orders` flag. Closing that gap is the state machine's job.


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

> **RULE (V7.6) — deals render FIRST on the operator order card** (OrderCard window/solo branch ONLY). The deals divider + deal blocks were moved ABOVE the standalone category groups (was after the category loop). The leading divider's top margin was dropped; the deals-only header gate is kept; first-group spacing accounts for a leading deals block. The COOK view (`viewMode==='cook'`, which dissolves deals into category groups per this section) is byte-for-byte UNCHANGED — it's a disjoint branch.

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

> **KDS pause badge note (V6.6)** — the KDS reads its pause indicator from `data.truck?.paused_until`, which is now null because pause moved to `truck_events` (Section 5). The KDS controls write correctly (event-scoped) but the badge can under-report the event pause. Event-source it like the dashboard badge (backlog, Section 27).

# 10. Add Order panel

## Purpose

For operators to manually enter orders — walk-ups at the hatch and phone/Facebook pre-orders. Used frequently; must be fast.

- **The customer order page uses category TABS + subcategory headers in MENU order; the operator Add Order panel is flat ALPHABETICAL with no subcategory headers. These are deliberately divergent — do NOT unify them (Section 7 / Section 10). The customer sticky subcategory header pins at top-[121px] (header + tab bar above it), not by its own height.**

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

- **Operator (dashboard / Add Order)** — sees every slot except genuinely past ones, each with a traffic-light state driven by the engine's backward occupancy (`projectBackwardOccupancy`, read as `back.byStart.get(slotMins − step)` — see Section 31, the authoritative source; the older `projectOvenOccupancy` name in pre-V6.7 notes is superseded): green (empty), amber (partial — shows the binding per-category count, e.g. "Pizza 2/4"), red ("Full").
- **Customer order page** — NO traffic-light. Only cleanly-available slots are shown; full and too-soon slots are HIDDEN.

> **PRECISE ITEMS-BASED DISPLAY (V6.4).** The dots are driven by the items-based oven-occupancy projection; kitchen_capacity counts ITEMS. RED reads just "Full"; AMBER reads the per-category count ("Pizza 2/4"); GREEN has no label. The leading "·" separator was removed. The internal `bound_by` reason is computed for diagnostics but not shown for red.

> **CAPACITY COPY SIMPLIFICATION PENDING (V6.8).** The `KITCHEN_CAPACITY_DESC` copy (lib/kitchen-capacity.ts) is to be shortened to plainer English ("the most items you can make at once, across the categories you tick", one short example, "leave blank for no limit"). Exact wording not yet finalised — when set, update the string AND this manual reference together so the quoted copy doesn't drift. The old "5-minute window" hardcode in the copy is WRONG post-V6.7 (the window is the configurable `capacity_window_mins`).

> **RULE — operator dots and customer availability use different reads.** The operator dots (`buildSlotIndicators`, slot-display.ts) and ASAP placement run through the engine — `projectBackwardOccupancy` / `fitOrderBackward` — NOT a parallel calculation (Section 31). The pre-V6.7 `projectOvenOccupancy` name is superseded. The legacy `getSlotIndicator` / `lib/slot-indicator.ts` and `buildSlotAvailability`'s indicator path now serve ONLY the customer available/unavailable flags. Candidates for removal post-trial (Section 27).

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

### Pause / extra-wait controls are event-scoped (V6.6)

> **RULE (V6.6)** — the dashboard pause/resume and extra-wait controls send `eventId` and write the SELECTED event's `truck_events` columns (Section 5). The dashboard "Paused" badge derives from the active event's own `paused_until` / `online_paused_until`. The KDS controls also write event-scoped (via a render-synced `activeEventIdRef`). The offline-paused banner carries a prominent inline "Resume orders" button (Section 11).

# 11. Native app and offline architecture

## Why native is needed

Food trucks operate in villages with patchy 4G. A web-only KDS that loses connection during service is a critical failure.

> **DECISION (updated V6.6)** — A native wrapper using Capacitor is a POST-TRIAL deliverable. The web/tablet-browser trial does NOT require it: offline AUTO-PAUSE is server-side (heartbeat staleness → `heartbeat-monitor` → event `online_paused_until`) and works in any browser. Native only adds the local offline DETECTION banner, screen wake, and background sound. The iPad/native app is marked "Coming soon" in the features list (Section 4). (This supersedes the V2 "must be built BEFORE any trial" designation.)

## Capacitor wrapper, not React Native rebuild

A Capacitor wrapper (com.hatchgrab.app) around the existing Next.js app, pointing at https://www.hatchgrab.com. Native code only for: offline detection, local order storage, background sound, screen wake, and Bluetooth printer (Max, post-trial). The Next.js UI is reused unchanged.

## Three-stage offline progression

### Stage A — Read-only offline cache (post-trial as of V6.6)
- Active orders cached to the iPad while online; shown while offline. Cook can mark ready/done — queued locally, synced on reconnect. New orders cannot be created while offline.

### Stage B — Walk-up orders while offline (post-trial)
- Operator adds walk-ups offline with device-generated IDs; server assigns display IDs on reconnect. (V6.3 note: with order_key a client-generatable uuid, the device can mint order_key offline and the display number is assigned at sync. See Section 18a.)

### Stage C — Full offline with reconciliation (future)
- Device UUIDs throughout, display IDs at sync time; slot capacity reconciliation; multi-device conflict resolution.

## Trial scope (V6.6)

The trial runs on the WEB (tablet-browser), in villages with reliable coverage. The server-side safety nets (auto-close, offline auto-pause) are the protection during trial; native Stage A offline lands post-trial.

## Per-vehicle offline protection → EVENT-scoped pause effect (V6.6)

truck_vans.auto_pause_on_offline is the per-event creation DEFAULT for offline protection; an individual event overrides it via truck_events.offline_protection_override (V6). The DETECTION trigger is a van/device property (the heartbeat), but the resulting PAUSE is now stamped on the live-now event's `truck_events.online_paused_until`, not on the van (Section 5).

### Offline protection toggle UX (V6.1)

The dashboard Menu & Stock offline-protection toggle confirms both directions through native window.confirm dialogs:
- **Enabling** — warns the device must keep the screen on, and force-enables Screen On.
- **Disabling** — warns online orders will no longer auto-pause for this event.

The toggle uses the unified control styling: w-11 h-6 track, bg-teal-500 when on.

## Heartbeat + scheduler architecture (V6, rescoped V6.6)

- One `last_heartbeat_at` column per truck_vans row (a genuine device/van property). Both the KDS and the dashboard fire a heartbeat every 15 seconds. `/api/heartbeat` writes `last_heartbeat_at = now` and CLEARS the relevant event's `online_paused_until` (the no-vanId dashboard ping clears across the truck's active vans' events — this is what fixes "online dashboard still shows Paused").
- The **`heartbeat-monitor`** edge function (30-second pg_cron) treats `last_heartbeat_at` older than 30 seconds as stale and, for a stale van WITH a live-now event and offline protection on, sets that EVENT's `online_paused_until = now + 2h` (Section 5).
- **Ordering vs atomicity (V6.6):** `last_heartbeat_at` (truck_vans) and `online_paused_until` (truck_events) are on two tables, so a clear is NOT a single atomic UPDATE. The safeguard is ORDERING — every heartbeat branch stamps `last_heartbeat_at` FIRST, then clears the event pause. Because the monitor only pauses ALREADY-stale vans, a just-pinged device can't be re-paused in the gap.
- **All-or-nothing offline detection is by design** — as long as any one device on the van is online and pinging, the van stays live.

### The scheduler MUST be invoked by cron — the dead-Vault-secret failure (V6.6)

> **CRITICAL (V6.6)** — `auto-event-scheduler` (1-min) and `heartbeat-monitor` (30-sec) are Supabase Edge Functions invoked by `pg_cron`. The cron command reads the `service_role_key` from Supabase Vault (`vault.decrypted_secrets`) as the bearer. This session the Vault secret had been DELETED, so the bearer resolved EMPTY → every invocation 401'd → ZERO invocations (auto-close and offline auto-pause silently never fired; auto-open limped along only via a client-side loop while a device was open). FIX: `select vault.create_secret('<service_role_key>', 'service_role_key');` — both jobs then `succeeded`. `heartbeat-monitor` set to `'30 seconds'` via `cron.alter_job`. Deploying NEW edge-function logic requires REDEPLOYING the function (pg_cron calls the deployed version). A cron-health alert (so a silent death surfaces instead of a blank "last run") is on the backlog (Section 27). A GitHub-Action cron was rejected — its 5-minute floor can't meet the 30s offline threshold.

### Prominent in-banner Resume (V6.6)

> **RULE (V6.6)** — the offline-paused banner on the dashboard carries a prominent inline "Resume orders" button that clears BOTH `paused_until` and `online_paused_until` on the active event (the same resume as the ··· menu), with an optimistic local clear so ordering resumes immediately. It shows "If your connection is unstable, orders may pause again" copy for the OFFLINE reason only (a manual pause won't re-pause itself). Primary recovery remains auto-clear-on-heartbeat; Resume is the manual override for stuck/false-positive pauses. Honest behaviour: if the device is genuinely still offline, the monitor re-pauses the live event within ~30s — correct, not a bug.

### Durable offline-pause marker + reconnect notification (V7.0 — NEEDS DEPLOY)

> **NEW (V7.0).** Offline-pause was invisible — operators couldn't tell it fired. NEW: `heartbeat-monitor` stamps `last_offline_pause_at` (new nullable `truck_events` column, migration `20260613_offline_pause_marker.sql`) in the SAME update as `online_paused_until`; the heartbeat reconnect-clear nulls only `online_paused_until`, leaving the marker DURABLE. The dashboard fires a one-time acknowledge popup ("Orders were paused while your device was offline. Customer orders are active again now.") when it sees a `last_offline_pause_at` newer than the localStorage ack (`hg_offline_pause_ack_<eventId>`); per-device toggle (default ON, localStorage `hg_offline_pause_notice`). Manual pauses never trigger it (only the monitor writes the marker). **DEPLOY REQUIRED before it works live:** (a) apply `20260613_offline_pause_marker.sql` + `notify pgrst`; (b) REDEPLOY the `heartbeat-monitor` edge function (pg_cron runs the deployed version). Until both, the column stays null and the popup never fires (fails safe).

## Wake lock and screen-on (V4)

The "Screen on" toggle in the avatar dropdown requests the Wake Lock API. lib/native/keepAwake.ts must implement: a release listener (re-requests if visible and intent on), a visibilitychange listener (added once via a sentinel), intent tracking (module-level keepAwakeEnabled), and a double-lock guard. enableKeepAwake/disableKeepAwake are legacy aliases — do not remove.

### Browser compatibility

navigator.wakeLock: Chrome since v84, Firefox Android since 72, Samsung Internet since 14, Safari (iOS/macOS) from 16.4. Firefox desktop does not support it. When 'wakeLock' in navigator is false, show an inline amber warning under the toggle.


# 12. Authentication and access

## Operator and staff accounts

- Operators authenticate via Supabase Auth. The operators table holds account-level data; auth_user_id links to the auth user.
- Staff are invited via the Team tab and stored in truck_users (owner/manager/staff). Dashboard access is granted if the user is the truck owner OR a truck_users member. A one-van staff member is auto-routed to their vehicle KDS on login, but CAN navigate to the orders dashboard `/dashboard/[token]` to place orders. Staff CANNOT access the Manage page (`/manage`).

> **CORRECTION (V7.8)** — the earlier "staff → KDS-only" wording was WRONG. Staff CAN reach the orders dashboard (to take orders); the KDS auto-route on login is a default landing, not a restriction. The only hard block for staff is `/manage`.

## Four permission levels (V6)

1. **Staff** — default-landed on their vehicle KDS, but CAN reach the orders dashboard to place orders; cannot access Manage. (Corrected V7.8 — was mis-stated as "KDS-only".)
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
- **No per-truck "published / accepting online orders" gate (V6.6)** — a stranger with the URL can place a real order on any `active=true` truck with a confirmed event; `active` doesn't even gate the menu load. The per-truck customer-mode state machine (Section 27, parked) is the durable fix; the temporary `isHG ? []` display rule (Section 7) only suppresses scraped events on HatchGrab, it does NOT gate ordering.

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

- **auto_pause_on_offline** (boolean) — the per-event creation DEFAULT for offline protection; an event overrides via truck_events.offline_protection_override (V6), and the resulting pause is stamped on the event, not the van (V6.6, Section 5 / Section 11).
- **show_cooking_step** (boolean) — adds the Cooking step on this vehicle's KDS.
- **kitchen_capacity** (integer, nullable) — max items cooking per production window; instant items (prep_secs 0) do not count; blank = no limit. Options No limit then 1–20 items. Editable from Settings and the dashboard Menu & Stock tab. (V6.4: the slot engine counts ITEMS, not batches; reads/writes via the service role — Section 10.) A per-category opt-in is on the backlog (Section 27).
- **last_heartbeat_at, online_paused_until, paused_until** — `last_heartbeat_at` is the live device-online property the monitor reads. `online_paused_until` / `paused_until` on truck_vans are now VESTIGIAL — pause moved to truck_events (V6.6, Section 5).
- **display_layout and split_screen** columns exist in the DB but are NOT exposed in van settings.

## Kitchen capacity wiring

When an event is created/confirmed with a vehicle assigned, slot_capacity rows are written using that vehicle's kitchen_capacity. No vehicle, or no capacity, means no limit.

> **NOTE (V6.4)** — The live oven-occupancy engine reads kitchen_capacity through the service-role projection, not the legacy `slot_capacity` cache. The `slot_capacity` rows are vestigial for the projection; the engine works from `production_slot_usage` (event-keyed) + the van's kitchen_capacity.

## Staff vehicle access

truck_user_vans links staff to vehicles. Empty access grants all trucks. Staff see only their assigned vehicle's orders.

## Truck logo (V6.5)

> **NOTE (V6.5)** — The public profile page (`/trucks/[slug]`) reads its truck logo from `discovery_trucks.logo_url` ONLY. The operator-uploaded logo lives in `trucks.logo_storage_path` and is NOT automatically mirrored into the discovery row, so a truck that uploaded a logo in Settings can still show a blank/placeholder logo on its public profile if `discovery_trucks.logo_url` is null. Test-kitchen's null `logo_url` was fixed by SQL this session (pointing it at the storage URL). The systemic fix — the discovery/profile mapping falling back to the linked operator truck's `logo_storage_path` when `logo_url` is null — is on the backlog (Section 27). The header logo SIZE was also enlarged this session (Section 3, AppHeader note).

> **NOTE (V7.5) — order page now falls back the OTHER way (the two surfaces have OPPOSITE default sources).** The customer order page (`/trucks/[slug]/order`, via `/api/menu/[truckId]`) reads its logo from `trucks.logo_storage_path` (the operator upload). When that is null it now falls back to the linked `discovery_trucks.logo_url` (`discovery_trucks.hatchgrab_truck_id = truck.id`, `.maybeSingle()`), resolved through the shared `formatImageUrl(logo_url, 'logos')` helper — so a truck with no operator-uploaded logo shows its Village Foodie discovery logo on the order page, matching the profile. The extra `discovery_trucks` query is **null-gated**: it runs ONLY when `logo_storage_path` is null, so a truck WITH an uploaded logo incurs no extra query (no regression). `formatImageUrl` was EXTRACTED to `lib/image-utils.ts` (was a local copy in `/api/discovery/events`) and is now imported by BOTH `/api/discovery/events` and `/api/menu` — one helper, both callers, so the two surfaces can never drift again (that drift WAS this whole logo bug). Rendering: both the order page and the profile render the logo via next/image `<Image src={truck.logo}>`; the profile already renders this exact discovery URL successfully, and `next.config.ts` `images.remotePatterns` allows `*.supabase.co/storage/v1/object/public/**` (the discovery logos are same-origin `/logos/…` paths or supabase-storage URLs — both already handled), so the order page needs no new allowlist entry. This closes the order-page half of the Section 27 systemic-logo-fallback item. The profile/discovery half (profile reads `discovery_trucks.logo_url` only and does NOT fall back to `logo_storage_path` when null) is STILL open — see Section 27.

# 15. Events and venues

## Concept

An event is a truck appearing at a venue on a date and time. The discovery map shows current and upcoming events. Each confirmed event has its own ordering page if pre-orders are enabled.

## Event confirmation

> **RULE** — Events created manually in the Manage page auto-confirm immediately (source='manual', status='confirmed'). Only scraped/uploaded events (inbound via /api/inbound-schedule) arrive as unconfirmed — except operator schedule imports, which save as confirmed (the operator is reviewing them). Unconfirmed events show on the discovery map with the order button DISABLED. Only confirmed events accept orders.

> **CUSTOMER-INVISIBILITY OF PENDING EVENTS (reaffirmed V6.5)** — Every public read path gates event status to `IN (confirmed, open)`. A scraped/pending event is NEVER shown to a customer (no map pin, no order button, not orderable by direct URL). This is the load-bearing fact behind the best-effort venue matcher (Section 25): a best-effort venue guess on a pending event is only ever seen by the TRUCK during approval, so the truck validates and corrects it before it can reach a customer.

### All event sources flow to truck_events — the scraper bridge (V5, gated by preference V6.2, stamps venue_id V6.6)

> **RULE** — Every event source — the scraper, vendor emails to schedule@villagefoodie.co.uk, and manual entry — can end up in truck_events for a linked truck. Inbound (scraper/email) events arrive unconfirmed; manual entries and operator imports are confirmed on save.

Bridge mechanics in /api/inbound-schedule: after writing discovery_events, it normalises the incoming truck name, matches discovery_trucks rows with a hatchgrab_truck_id set, and inserts a truck_events row (status 'unconfirmed', source 'scraper') after a dedup on truck_id + event_date + venue_name. Venue coordinates are looked up via the venue matcher (Section 25). A best-effort notification email fires once per truck per batch (fire-and-forget).

> **RULE (V6.6) — the bridge resolves the venue ONCE per row and stamps venue_id.** The bridge precomputes a per-row venue resolution (shared `findVenue` from lib/venue-matcher.ts) reused for both the discovery_events enrichment and the truck_events insert, and stamps `venue_id` + `venue_id_source='scraper'` + `venue_match_confidence` on the truck_events row. Never resolve a venue twice with two matchers (Section 25). Live-verified: a test-truck re-scrape stamped 8/8 fresh events high-confidence.

> **RULE (V6.2) — bridge is gated by scraper_preference.** Only trucks set to 'auto' have scraped events bridged into truck_events and the operator emailed. A truck set to 'manual' (default) skips the truck_events insert. The discovery_events write is unaffected either way. A legacy value of 'both' is treated as 'auto'.

Linking is a one-time admin step: the admin console's "Link HG truck" dropdown sets discovery_trucks.hatchgrab_truck_id.

## Discovery / operator-events visibility (rebuilt V6.5, temporary HG suppression V6.6)

> **CRITICAL (V6.5) — the operator-events branch was dormant and is now visibility-gated.** `/api/discovery/events` reads two sources: discovery_events (scraped public data) and truck_events (operator events for linked trucks), merging and deduping at read time. The operator-events branch had been ERRORING on a phantom `trucks.is_test` column (which does not exist — Section 16) and silently returning `[]`, so operator events were dormant on BOTH domains. The fix:

- **Removed the phantom `is_test`** from the operator-events select and filter — reviving the branch (it now returns the linked trucks' confirmed/open events).
- **Gate each operator event by its LINKED discovery truck's `visibility`.** discovery_trucks / discovery_events carry a `visibility` enum: `public` | `hg_only` | `hidden`. The host allowlist is `villagefoodie → ['public']`, `hatchgrab → ['public','hg_only']` (so hatchgrab sees public AND hg-only; villagefoodie sees only public; nobody sees hidden). An operator event inherits the visibility of its linked `discovery_trucks` row.

> **RULE (V6.5) — gate via a DEDICATED UNFILTERED visibility fetch, not `trData`.** To know a linked truck's visibility you must fetch `hatchgrab_truck_id → visibility` from discovery_trucks WITHOUT the visibility filter already applied. Reusing the visibility-filtered `trData` (the list already narrowed to the host's allowlist) would mean an `hg_only` truck is simply absent from that list, and a naive "not found → default public" would then LEAK it onto villagefoodie. The dedicated unfiltered map returns the true visibility for every linked truck, so an `hg_only` operator event is correctly excluded from villagefoodie and included on hatchgrab. (This was a sharp trap: the safe-looking default is the leak.)

> **RULE (V6.6, TEMPORARY) — on HatchGrab, scraped discovery events are suppressed.** In addition to the visibility gate, the merge now does `filteredDiscovery = isHG ? [] : (…)` so HatchGrab returns operator/approved events ONLY (scraped `discovery_events` are Village-Foodie-only). This cleared stale scraped rows from hatchgrab.com profiles. It is a HOST-based stopgap and the WRONG shape long-term (event-source should follow the TRUCK's customer state, not the host) — to be unwound by the per-truck customer-mode state machine (Section 7 / Section 27). Village Foodie is unaffected (branch fires only when `isHG`).

This replaces the V6 "operator events show on both maps unconditionally" rule and the V5 host-based "HatchGrab-only" rule — visibility is now a per-truck DATA property (the discovery row's enum), not a host hardcode. (The V6.6 scraped-suppression IS a host hardcode, explicitly temporary.)

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

> **MOBILE LAYOUT (V6.6)** — on the pending "Needs your approval" cards, the Approve/Edit/Reject buttons sit in a full-width horizontal row BELOW the venue/area/time block on mobile (the venue text gets the full width), reverting to the inline horizontal row at `sm:`+. Confirmed-card icon buttons (copy/✏️/✕) are unchanged. (See Section 23.)

### Event-conflict detection on approval (V7.0)

> **NEW (V7.0).** Two complementary read-time checks (`lib/event-conflicts.ts`, `detectEventConflicts` — pure, source-agnostic) run on ANY unconfirmed event being confirmed (scraper card OR operator-added "Needs confirmation" card), against existing confirmed/open events (same truck, same `event_date`, `id ≠ candidate`). **NAME EXCLUDED** from matching (edited/scraped inconsistently — e.g. "The Star" vs "The Star Pub").
> - **CHECK A (duplicate, postcode-anchored, two tiers)**: postcodes normalised (uppercase, strip spaces). Tier 1 `'duplicate'` = same postcode + same time-window. Tier 2 `'review'` = same postcode + different time. Null postcode on either side → skip A (no name fallback).
> - **CHECK B (overlap, time-only, postcode-agnostic)**: same date + time-windows overlap (`cStart<exEnd && exStart<cEnd`). ONE-VAN assumption — flags all same-day overlaps; multi-van later adds `van_id` equality (a marked inline comment shows where). Null times → skip the pair.
> - Times are TEXT (`'HH:MM'` or `'HH:MM:SS'`) → MINUTE-PARSED (`.slice(0,5)` → `h*60+m`), never string-compared, for both A's equality and B's overlap.
> - Most-specific-wins per pair: duplicate > review > overlap.
> - **UI (ScheduleTab approval cards)**: amber banner with each conflict message + the existing event's venue/date/time/postcode for side-by-side comparison; WARN-WITH-FRICTION (not hard-block) — the first Approve/Confirm click with a conflict reveals "Yes, these are different events — approve/confirm anyway"; `conflictAckId` keys per `event.id`. Computed read-time, no schema change. Independent of (and complementary to) the existing scraper name/signature dedup at `/api/inbound-schedule` (which skips identical re-inserts — untouched). tsc-clean, NOT live-verified.

## Import schedule (operator upload) — review UX rebuilt V6.2

A 📤/✨ Import schedule button on the Schedule tab header opens a dedicated modal with a drag-and-drop upload zone, a paste-text area, and a "Process schedule" button. Once events are extracted, the upload UI is hidden.

The route app/api/manage/process-schedule/route.ts verifies the token, reads input, calls extractScheduleEvents, and returns { events } with the ExtractedEvent fields. No DB writes, no dedup, no truck name. A ~40-line wrapper around the shared library.

### Time entry — 30-minute dropdowns (V6.2)

**SCHEDULE_TIME_OPTIONS** — 30-minute increments 07:00–23:00, shared by the import review AND the Add/Edit event form. Start and end always paired; end filtered to options after start. **applyStartTimeChange** auto-populates end at start +3h (clamped to 23:00); moving start past end auto-clears end. process-schedule discards any event where end ≤ start.

### Review UX — breakpoint-divergent (V6.2)

Field order on both: **Date → Venue name → Area + Postcode → Start time + End time → Van**.

**Mobile** — compact ~90px summary cards, three states: collapsed (one-glance summary), focused (auto-opened for incomplete cards, only the missing fields), fully expanded (Edit affordance). No Done button. focusedEventIds / expandedEventIds are only ever added to.

**Desktop** — an always-editable inline table, table-layout: fixed with an explicit colgroup (checkbox 32px, date 130px, venue 220px, area 150px, postcode 100px, start 100px, end 100px, delete 36px). Incomplete rows get an amber highlight.

An attention banner counts incomplete events; Save is disabled until every event is complete. The "Area" label is "Area (village, town or city)".

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

> **RESOLVED MECHANISM (V6.6)** — auto-open and "Start Event" are the SAME state transition (`truck_events.status` → `'open'`); `auto_open` just automates it. Auto-CLOSE (`status` → `'closed'`) is the real ordering gate. The reason auto-open/close had appeared "not firing" was the dead pg_cron scheduler (the deleted Vault secret — Section 11), now fixed: the `auto-event-scheduler` edge function (1-min) does both auto-open (confirmed + auto_open + start_time ≤ now → open) and auto-close (open past end_time → closed) in London time. The truck-level `default_auto_*` flags only SEED the per-event `truck_events.auto_open` / `auto_close` at confirm. Behaviourally re-verify on a live event.

### Event lifecycle controls — Start, Restart, Close (V5)

- **Start Event** — opens a confirmed event for orders. Status ● Live (green).
- **Restart Event** — reopens a closed event.
- **Close** — sets status 'closed'; only an 'open' event can be closed. Status ● Closed (slate). Pausing shows ⏸ Paused (amber).

> **RULE** — Closing an event must be recoverable. A closed event still appears in the picker (confirmed, open, AND closed) with a Restart Event button. Cancelled events remain excluded.

### LIVE-REDEFINITION — status-driven "live" (V7.0 — BUILT, NEEDS DEPLOY)

> **BUILT V7.0, tsc-clean, NOT live-verified.** "Live" = the operator STARTED the event (`status='open'`, set by Start / `auto-event-scheduler`), NOT the published clock window. Applied across the monitor AND customer surfaces: `/api/events` now exposes `status`+`opened_at`; `isEventLiveNow`, `isOpenNow`, `isEventLive` derive from `status==='open'`. Published `start_time`/`end_time` are DISPLAY-only. The `heartbeat-monitor` live-event gate keys off `status='open'` — by construction it EXCLUDES future `confirmed` events (over-pause fix preserved) AND protects an event from when the operator STARTED it (closes the future-event offline gap). DIAGNOSTIC LOGGING added (`[heartbeat-monitor]` prefix: stale vans, open events per van, pause/skip/already-paused decisions). Customer label UX: green "● Live" when live, Pre-order↔Order now flip, equal 104px button width. Scraped discovery events carry no status → not-live (correct). DEPLOY: REDEPLOY heartbeat-monitor edge function (gate + logging inert until redeployed); `/api/events` + pages deploy via Vercel.

### Status-driven CLOSE + early-close confirm (V7.0 — BUILT)

> **BUILT V7.0, tsc-clean, NOT live-verified.** Server enforcement was already correct (submit 403s `closed`/`cancelled`; `/api/menu` 404s a closed explicit event). NEW: the order page now reflects a closed event for an ALREADY-LOADED customer — a 30s `/api/menu` poll folds `ordering_available`/status into `isOrderingBlocked` (`eventEnded`), AND a submit 403 surfaces a blocking "this event has ended" banner (was a silent fail). The clock-based `isEventClosed` stays as a backstop. EARLY-CLOSE: `finishEvent` (dashboard + KDS) shows a STYLED modal (replaced `window.confirm`) when finishing BEFORE the scheduled `end_time` — "No more orders will be allowed. Confirm to end event? [Yes][Cancel]"; `finishingEarly = now < end_time` (minute-parsed); on-time close keeps the lighter confirm. `doFinishEvent` (the close fetch) is unchanged. Lifecycle: confirmed (pre-order) → open (live) → closed (blocked).

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

Date-anchored card: a left column with day name / large orange day number / month and a thin divider; venue + town with an inline status badge (town omitted when already in the venue name); the time prominent; the postcode on its own muted line. Actions right-aligned (Copy, Edit, Cancel). Deals collapsed into a `<details>` summary. Past events show Copy only and no deals; cancelled events show "Cancelled", other past events show "Finished". Scraped unconfirmed events for an auto-preference truck appear in "Needs your approval" (mobile button layout — Section 23).

### Offline protection override on the event (V6)

truck_events.offline_protection_override (nullable boolean): null = use the van default; true/false = explicit per-event override set from the dashboard. The menu API checks the event override first. (V6.6 — this override, with the van's `auto_pause_on_offline` as the default, decides whether the live-now event gets offline-paused; the pause lands on the event — Section 5 / Section 11.)

## Multiple events handling

Distinct order queues per event; per-event order numbering (display ids restart at 1 per event) is the V6.3 model (Section 18a). Pause, extra-wait, and stock are all per-event (V6.5 / V6.6) — no cross-event bleed.


# 16. Database schema essentials

## Core tables

- **trucks** — one row per truck/brand. Holds plan, settings, dashboard_token, operator_id, default_auto_open/close, qr_code_style (V4), slug (V5, unique, URL-safe — used by /trucks/[slug]/order; prod-verified to EXIST V6.5), active (prod-verified to EXIST V6.5), truck_emoji (V5), logo_storage_path (operator-uploaded logo — note it is NOT mirrored to discovery_trucks.logo_url, Section 14), lifetime_discount_pct / lifetime_discount_note (V6), paused_until (VESTIGIAL post-V6.6 — pause moved to truck_events), extra_wait_mins / extra_wait_started_at (VESTIGIAL post-V6.6 — extra-wait moved to truck_events), order_counter (V6.3, int default 0 — no-event fallback display counter), and the scraper-preference / adaptive-scheduling columns (V6.2).

> **RULE (V6.5) — there is NO `trucks.is_test` column.** Prod verification confirmed `trucks.is_test` does not exist. Code still references it in places (the discovery/events operator branch did — fixed V6.5 — and admin/manage paths still do — backlog). Declaring or selecting `is_test` errors or silently returns nothing. The "filter test trucks from the public map" effect is achieved via the discovery row `visibility` enum (set a test truck's discovery rows to `hg_only`), NOT a trucks column. See Section 4 (is_test scope) and Section 27.

> **RULE (V6.2)** — trucks.id is **text**, not uuid. Every FK column referencing trucks(id) must be `text` — including scraper_run_log.truck_id, excluded_terms.truck_id, and increment_order_counter(p_truck_id text). Declaring them uuid fails the migration or silently never matches.

### Scraper-preference and adaptive-scheduling columns on trucks (V6.2)

- **scraper_preference** (text, 'manual'|'auto', default 'manual'), **schedule_url** (text), **scraper_rule** (text, 'scroll_lazy'|'scroll_next'), **scraper_last_changed_at** (timestamptz), **scraper_update_day** (smallint 0–6), **scraper_learning_complete** (boolean default false), **scraper_last_empty_notify_at** (timestamptz), **scraper_first_run_at** (timestamptz), **scraper_last_hash** (text). See Section 24.

- **operators** — first_name, last_name, phone, email, auth_user_id, is_admin (V6), billing.
- **truck_vans** — auto_pause_on_offline (offline-protection creation default), show_cooking_step, kitchen_capacity, **capacity_window_mins** (V6.7, integer NOT NULL DEFAULT 5, CHECK 1–20 — the concurrency ceiling's own window cadence, independent of category prep; Section 6), display_layout, split_screen, kds_token, name, active, last_heartbeat_at (device-online property), online_paused_until (VESTIGIAL post-V6.6), paused_until (VESTIGIAL post-V6.6). (V6.6 — pause moved to truck_events; the van keeps only `auto_pause_on_offline` as the default and `last_heartbeat_at` as the live device property. Section 5 / Section 11.)
- **truck_users** — role (owner/manager/staff), email, name, auth_user_id, invited_at, accepted_at.
- **truck_user_vans** — staff ↔ vehicle access junction.
- **operator_email_changes** — old_email, new_email, token, requested_at, verified_at, expires_at.
- **menu_categories** — sort_order, allow_notes (V4), prep_secs, batch_size (nullable), default_stock (V5.x — the Settings "default stock per event" seed; per-event category stock now overrides this, Section 30), is_active (default true — soft-delete, filtered on read).
- **menu_items_db** — is_available, stock_count (legacy/display), default_stock (the Settings "default stock per event" seed — the live per-event ceiling source, Section 30), allergens, dietary_info, prep_secs, batch_size, **name** (the item-name column — NOT item/item_name; per-event stock keys on this), is_active (default true).
- **modifier_options** — available boolean (V4) — defaults true.
- **bundles_db** — bundle_price, original_price, slot_1..6_category, apply_to_new_events, is_available, start/end_time.
- **event_deals** — event_id, bundle_id, active, overridden.
- **truck_events** — event_date, start/end_time, venue_name, town, postcode, address, notes, status, source, van_id, confirmed_at, offline_protection_override (V6), latitude/longitude, scraped_signature (dedup), order_counter (V6.3), auto_open / auto_close (per-event, seeded from trucks.default_auto_* at confirm), **venue_id** (V6.6, uuid, FK venues(id) ON DELETE SET NULL), **venue_id_source** (V6.6, text: scraper|operator|manual|backfill — only operator|manual count as validated for history-prior), **venue_match_confidence** (V6.6, text: high|low|none→NULL), **paused_until** (V6.6, timestamptz — event-scoped manual pause), **online_paused_until** (V6.6, timestamptz — event-scoped offline auto-pause), **extra_wait_mins** (V6.6, integer), **extra_wait_started_at** (V6.6, timestamptz). (V6.5: `town`/`postcode` are what the venue matcher resolves. V6.6 added `venue_id` as the keystone for anchors/history-prior, and the four pause/extra-wait columns to make those event-scoped — Sections 5, 25.) Index `idx_truck_events_venue_id`.
- **orders** — order_key (V6.3, uuid, PRIMARY KEY — the only identifier in any WHERE/URL/FK/dedupe/React key), id (text — per-event DISPLAY number, restarts at 1, NEVER a lookup key), items (JSONB — carries frozen item NAMES, no item id), deals (JSONB), status, paid_at, collected_at, event_id, van_id, slot. Two partial unique indexes: `UNIQUE (event_id, id) WHERE event_id IS NOT NULL` and `UNIQUE (truck_id, id) WHERE event_id IS NULL`. See Section 18a.
- **event_item_stock (V6.5, +no_item_cap V6.6)** — per-event item stock OVERRIDE. PK `(event_id, item_name)`. Columns: event_id (uuid, FK truck_events(id) on delete cascade), item_name (text — matches menu_items_db.name and the frozen order-line name), stock_count (int nullable — the per-event ceiling override), available (boolean nullable — per-event sold-out override), **no_item_cap (V6.6, boolean default false — true = no individual cap this event → ceiling resolves to null → follows the category pool; distinct from stock_count=null which means "use default")**. A row exists ONLY when the dashboard has edited that item's stock for that event; absence means "read the live Settings default". RLS service-role only. See Section 30.
- **event_category_stock (V6.5)** — per-event category stock OVERRIDE. PK `(event_id, category)`. Columns: event_id (uuid, FK), category (text), stock_count (int nullable). Same sparse-override semantics. RLS service-role only. See Section 30.
- **collection_times / slot_capacity** — fixed slot definitions and per-slot capacity rows.
- **whatsapp_logs** — APPLIED V7.7 (20260605_whatsapp_logs.sql). Columns: id, truck_id (text FK trucks), customer_number (text, digits-only sender), message_in, classification, events_found (int), response_sent (text), possible_miss (bool), created_at (timestamptz default now()). RLS on, service-role only, no anon policy. The webhook insert writes 7 columns (all but id/created_at). No (customer_number, created_at) index — optional, low volume (Section 27).
- **kds_sessions** — active KDS device sessions.
- **discovery_trucks / discovery_events** — scraped discovery data; `visibility` enum (public|hg_only|hidden) controls public/HG exposure (the load-bearing gate for operator-event visibility, Section 15). discovery_trucks.hatchgrab_truck_id (FK to trucks.id — text) links a discovery truck to its HatchGrab account. discovery_trucks.logo_url is the profile-page logo source (Section 14). Set via the admin "Link HG truck" dropdown.
- **scraper_run_log (V6.2)** — id, truck_id (text), run_at, day_of_week (0–6), events_found, events_changed, rule_used. RLS service-role only. Pruned to 90 days — the ONLY pruned table.
- **excluded_terms (V6.2)** — id (uuid), truck_id (text), term. Unique (truck_id, term). RLS service-role only.
- **booking_locks (V6.4)** — per-event booking mutex, key (truck_id, event_date). RLS service-role only.
- **production_slot_usage (re-keyed V6.4)** — keyed (truck_id, event_id, production_slot); event_date retained for the rebuild orchestrator. RLS service-role only.
- **upsell_events (planned/unapplied)** — migration never applied; table does not exist. As of V6.3 the insert writes order_key as the order reference.
- **loyalty_cards (planned)** — V4 spec frozen. Do not build until instructed.

## Key columns of note

- venues uses **village** (NOT area — "Area" is a UI label only; the columns are village/town). venues uniqueness = (name, village). truck_events.town and discovery_events.village hold the locality. The venue matcher ranks candidates on normalised village agreement (Section 25). venues.id is uuid (truck_events.venue_id FKs to it — V6.6).

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
20260605_whatsapp_logs.sql
20260607_order_key_per_event.sql
20260608_booking_locks.sql
20260608_production_slot_usage_event_key.sql
20260611_event_item_stock.sql
20260611_event_category_stock.sql
20260612_truck_events_venue_id.sql
20260612_event_item_stock_no_item_cap.sql
20260612_event_scoped_pause_extrawait.sql
```

### Migration process (V6.2, extended V6.3)

> **RULE** — Migrations are applied manually in the Supabase SQL editor, in filename order, followed by `notify pgrst, 'reload schema';`. New tables must have RLS enabled at creation. Use idempotent (`if not exists`) statements.

> **NOTE (V6.3)** — A full-file paste into the SQL editor can silently run nothing. Run large migrations in CHUNKS and verify each (PK, column existence, function existence) before moving on.

> **APPLIED-MIGRATIONS DRIFT (V6.3; whatsapp_logs RESOLVED V7.7)** — 20260605_whatsapp_logs.sql is now APPLIED (V7.7). 20260529_checkout_upsells.sql (upsell_events) is STILL not applied to prod. Reconcile the applied-vs-file list; assume others from that era may also be missing.

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

### 20260612_truck_events_venue_id.sql (V6.6)

Adds `truck_events.venue_id` (uuid FK venues(id) ON DELETE SET NULL), `venue_id_source` (text), `venue_match_confidence` (text), and index `idx_truck_events_venue_id`. venues.id is uuid (confirmed). Applied by hand, verified, schema reloaded. The keystone for the best-effort matcher's anchors and history-prior (Section 25 / Section 27).

### 20260612_event_item_stock_no_item_cap.sql (V6.6)

Adds `event_item_stock.no_item_cap boolean not null default false`. Additive, defaults false, no backfill. Honoured in all three ceiling readers; `get_stock` must surface `no_item_cap=true` rows (they carry stock_count=null). See Section 30.

### 20260612_event_scoped_pause_extrawait.sql (V6.6)

Adds `truck_events.paused_until`, `online_paused_until` (timestamptz), `extra_wait_mins` (integer), `extra_wait_started_at` (timestamptz). All nullable/additive, no backfill (old van/truck values are transient and expire). truck_events is anon-readable so the customer page reads them; writes are service-role. Moves pause + extra-wait from van/truck scope to event scope (Section 5).

### 20260612_capacity_window_mins.sql (V6.7)

Adds `truck_vans.capacity_window_mins integer NOT NULL DEFAULT 5 CHECK (capacity_window_mins BETWEEN 1 AND 20)`. The concurrency ceiling's own window cadence, independent of any category's prep (Section 6). DEFAULT 5 so every existing van keeps today's implied behaviour and the ceiling always has a cadence. Apply in chunks, then `notify pgrst, 'reload schema';`. truck_vans is service-role-only; reads/writes route through the API.

> **PHASE-2 UNWIND (V6.5)** — an eager-snapshot first attempt (143 item + 55 category backfilled rows) was DELETED when the model pivoted to sparse-override. BBQ Chicken Pizza's old truck-level `item_overrides=25` was migrated to `menu_items_db.default_stock=25` (so it now propagates) and the item_overrides row deleted. lib/event-stock-snapshot.ts and scripts/backfill-event-stock.ts were deleted. The legacy `item_overrides` / `category_stock` tables are now UNUSED by live paths but LEFT IN PLACE for rollback safety (Section 30).

## Realtime

orders — INSERT/UPDATE/DELETE subscribed. trucks — UPDATE only. UI updates within ~1s; 60s polling fallback.

## Row Level Security (V6.1, extended V6.2/V6.5/V6.6)

RLS is enabled on every table in the public schema. All API routes use SUPABASE_SERVICE_ROLE_KEY (bypasses RLS); the anon key is used only in the browser clients and a few Server Components. RLS governs only direct anon-key access.

- **Public read (anon SELECT, `using (true)`)** — discovery_events, discovery_trucks, venues, trucks, truck_events (incl. the new venue_id and pause/extra-wait columns the customer page reads), menu_categories, menu_items_db, modifier_groups, modifier_options, bundles_db, category_modifier_groups, item_modifier_overrides, item_overrides, collection_times, slot_capacity, category_stock, and orders.
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

## Item availability resolution (per-event as of V6.5, +no_item_cap V6.6)

> **RULE (V6.5/V6.6) — item availability composes the live base AND the per-event override.** The effective ceiling is `event_item_stock.stock_count (if an override row exists for this event_id+item_name) ?? menu_items_db.default_stock (live)`. A row with `no_item_cap=true` resolves the ceiling to **null** (no individual cap → follows the category pool), overriding the default (V6.6). Availability is an AND-composition: `(menu_items_db.is_available !== false) && (override ? override.available !== false : true) && (stockRemaining === null || stockRemaining > 0)`. The override can only RESTRICT — it can never re-enable an item the Settings base has turned off. The item NAME is always read live from menu_items_db.name. This supersedes the pre-V6.5 truck-level `item_overrides` path for live reads (item_overrides is left in place for rollback only). The menu-API ceiling read and the stock-guard ceiling read must use the SAME event_id as getLiveItemCounts (the sold count) — same key, so the oversell invariant holds. A missing override row falls back to default_stock, never to accidental-unlimited and never to 0. See Section 30.

## Pause in the menu API — event-scoped (V6.6)

> **RULE (V6.6)** — the menu API computes the customer-facing pause from the EVENT's own columns: `manualPaused = event.paused_until > now`; `offlineProtectionEnabled = event.offline_protection_override ?? van.auto_pause_on_offline`; `offlinePaused = offlineProtectionEnabled && event.online_paused_until > now`. It also sources extra-wait from `event.extra_wait_mins`/`extra_wait_started_at`. The old truck/van pause reads are removed (Section 5). No "live now" gate is needed because the write side only ever stamps the right event.

## Soft-deleted categories and items must be filtered (V6.1)

> **RULE** — menu_categories and menu_items_db carry is_active (default true). Deleting sets is_active = false (soft delete). Every read path listing current menu data MUST filter `.eq('is_active', true)` — the menu_categories query AND the menu_items_db query in app/api/menu/[truckId]/route.ts, and the menu_categories query in app/api/dashboard/route.ts. Historical orders are unaffected (orders.items is a JSONB snapshot).


## Offline protection in the menu API (V6, event-scoped V6.6)

offlineProtectionEnabled = eventRow.offline_protection_override (if not null/undefined) else van.auto_pause_on_offline. The pause is only applied when true, and reads the EVENT's `online_paused_until` (V6.6, Section 5).

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

> **OPS NOTE (V6.6)** — `orders.event_id` is currently ON DELETE SET NULL. Deleting an event that still has orders nulls their event_id → those display ids land in the no-event uniqueness bucket and can collide (23505 family). To wipe a test truck, delete `orders` BEFORE `truck_events`. A likely-correct fix (ON DELETE RESTRICT or a proper detach) is diagnose-first on the backlog (Section 27).

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

> **MENU_QUERY menu-read bug FIXED (V6.8).** MENU_QUERY returned the bare-link `menuFallback` instead of the menu summary because the query selected a non-existent column `category` on `menu_items_db` (the real column is `category_id`, FK to `menu_categories`). PostgREST returned `42703 undefined_column` → supabase-js `{ data: null, error }` → the code read only `data`, swallowing the error → indistinguishable from "no rows" → fallback. FIXED: (1) select `category_id` + `menu_categories!category_id(name)` join and read the category name from the join, mirroring `app/api/menu/[truckId]/route.ts`; (2) STOP swallowing the query error — destructure `error`, log it, fall back, so the next mismatch surfaces in function logs. **LESSON: a swallowed supabase-js error is indistinguishable from zero rows; always destructure and check `error`.** Two earlier wrong candidates (the `is_available` strict filter, and a truck-id mismatch) were eliminated by SQL (all items `is_available=true`; `whatsapp_sender` 447941042253 = `test-truck`) — the column error pre-empted both. The `is_available !== false` null-tolerant filter was also applied (correct for other trucks with NULL availability, though not this bug's cause). STILL OPEN (post-trial): per-item name matching ("pepperoni" → "Pepperoni Pizza") does not exist (category summary only); the truck-resolution-by-customer-sender-number model is unreviewed. See Section 27.

## Tier-3 LLM menu answerer (V6.9 — free-prose, grounded, two safety guards)

> **Built V6.9, tsc-clean, NOT live-verified.** MENU_QUERY now answers in free prose grounded in the live menu, replacing the fixed category summary. Flow (`lib/whatsapp-classifier.ts`): build the deterministic summary first (the fail-safe target) → **[1] pre-LLM ALLERGEN GUARD** — a broad case/punctuation-normalised stem/substring matcher (`allerg`, `dairy`, `vegan`, `free from`, `gf`/`df` whole-token, etc.) that DELIBERATELY over-triggers (a false positive = a safe redirect; a miss = the LLM answering a safety question with no data); on hit, return the fixed allergen redirect and the LLM is NEVER called → **[2] payload** = name/category/price/availability only → **[3] `callGemini` temp 0.2 with an 8s `AbortController` timeout** (`callGemini` gained an optional `timeoutMs`; existing callers unchanged) → **[4] PRICE VALIDATION** — every £ figure in the reply must exist in the payload's price set, else reject → **[5]** a valid + non-empty reply is returned, else `deterministicReply`; any throw/timeout/empty → `deterministicReply`. Prompt rules: answer ONLY from the payload, quote prices verbatim, "we don't have that" for absent items, REDIRECT (not guess) for ungroundable attribute questions (spicy/veggie/ingredients), never invent. Sounds like the owner; NO body disclaimer. +1 Gemini call per MENU_QUERY only. The ALLERGEN_QUERY branch is unchanged (now shares the redirect string via a single `allergenRedirect` helper). DECISION: an AI/auto-reply disclaimer is DEFERRED pending a check of Meta's current business-messaging disclosure rules. UPGRADE PATH: the payload reads menu fields generically, so future menu attributes (veggie/spicy flags) flow through to richer grounded answers with no answerer rework.

## Tier-3 dietary + allergen answering — presence-confirm / absence-redirect (V7.0 — BUILT)

> **BUILT V7.0, tsc-clean, NOT live-verified.** The tier-3 payload now includes per-item `dietary` (`dietary_info`) + `allergens` (`string[]`, from `menu_items_db`). PRINCIPLE: confirm PRESENCE (the operator's positive declaration — safe), NEVER assert ABSENCE (data optional/unvalidated; a missing tag ≠ "free of"). The pre-LLM guard was RE-POINTED to ABSENCE/SAFETY signals only: `ALLERGEN_STEMS=['allerg','intoleran','coeliac','celiac','free from','safe for','suitable for']`, `ALLERGEN_TOKENS=['gf','df','free']` (whole-token `free` carries the "-free" wall post-normalisation). Bare allergen NAMES + `contain`/`ingredient` were REMOVED from the redirect (they name presence → now reach the LLM); substring false-matches fixed (`vegan`⊄`vegetarian`, `egg`⊄`veggie` via whole-token). So "does it have dairy" / "which are vegetarian|vegan" → LLM (presence-confirm); "gluten-free" / "dairy-free" / "safe for" / "free from" / gf / df → STILL redirect pre-LLM. Prompt: DEFER-never-DENY (allergen tagged → confirm; not tagged → defer to menu, never "no/free of"); dietary phrased "the ones marked X", not exhaustive. DETERMINISTIC caveat: code-APPENDS "Please double-check the full menu for allergen info — this is an automated reply." whenever a payload allergen tag word appears in the reply (guaranteed; the prompt instruction is kept as belt-and-braces). Notes (safe over-redirects): `allerg` substring also catches "what allergens are in X" (can't distinguish allergy/allergens); whole-token `free` over-redirects "free range/delivery" (rare). Supersedes the V6.9 guard's `vegan`/bare-name substrings.

## Event lookup

Queries truck_events for the truck (resolved by whatsapp_sender), confirmed/open/unconfirmed, from today forward. Be generous. Inject an explicit DATE REFERENCE mapping and label events (TODAY)/(TOMORROW)/(IN 2 DAYS). Include town.

## Interaction logging

Every interaction logs to whatsapp_logs (fire-and-forget). (V7.7 — whatsapp_logs migration APPLIED to prod; logging inserts now succeed — Section 16.) possible_miss = SPECIFIC_QUERY with events_found = 0.

## Provider — Meta Cloud API (V6.3, replaces Twilio)

> **RULE** — WhatsApp runs on the Meta Cloud API, not Twilio. The live handler is app/api/webhooks/meta/whatsapp/route.ts; the send helper is lib/meta-whatsapp.ts (sendMetaWhatsApp). The Meta app sits under the Village Foodie Meta Business Account. Env: META_WHATSAPP_APP_SECRET, META_WHATSAPP_PHONE_NUMBER_ID, META_WHATSAPP_ACCESS_TOKEN, META_WEBHOOK_VERIFY_TOKEN, META_WHATSAPP_BUSINESS_ACCOUNT_ID.

> **RULE (V7.6) — sender-routing is a testing convenience; go-live needs recipient-routing.** The auto-reply binding is `trucks.whatsapp_sender` (a single TEXT column, ONE number at a time, stored bare `447…`). The webhook (`app/api/webhooks/meta/whatsapp/route.ts`) matches the inbound SENDER's number against `whatsapp_sender` and replies to that sender. This works ONLY because there is ONE shared US Meta test number during testing — swapping which test phone is "live" means re-pointing `whatsapp_sender` (one number at a time). GO-LIVE MODEL (banked, blocker): customers message the truck's OWN WhatsApp Business number → route by RECIPIENT (`phone_number_id` → truck), reply to sender. Requires per-truck WhatsApp Business number provisioning (not done — the truck-page number is an unconnected US placeholder) + a webhook change from sender-match to recipient-match (Section 27). NOTE: `trucks.whatsapp_sender` (the auto-reply binding) is DISTINCT from `trucks.whatsapp` (the customer-contact number). In Meta dev mode every test sender number must be on the recipient allowlist or delivery silently fails.

> **FEATURE-GATE DISCREPANCY (V7.6, backlog bug).** `whatsapp_replies` is granted as a MAX-tier feature in `lib/features.ts` (max/trial/tester/override only — NOT Pro/Starter), but the marketing table `lib/plan-features.ts` lists it as Pro+Max. The webhook obeys `features.ts`, so a Pro truck would get SILENT no-reply despite the pricing matrix promising it. (Gusto is on trial → granted, so unaffected.) Reconcile the two files (Section 27).

> **ALLERGEN ROUTING — presence-confirm vs absence-redirect, with a bucket-independent floor (V7.7, LIVE-VERIFIED V7.8). SAFETY-CRITICAL.** Two layers were realigned so they agree. (1) The deterministic `mentionsAllergen` guard was HOISTED to run immediately after classification, before ANY branch and before all three callGemini sites (between the IGNORE return and the MENU_QUERY branch in `generateWhatsAppReply`). It redirects on any absence/safety token, regardless of which bucket Gemini chose — so the probabilistic classifier can NEVER be the safety boundary; the deterministic guard is the floor on every path. The pre-existing in-branch check is left as belt-and-braces. (2) The classifier's ALLERGEN_QUERY trigger list was realigned: PRESENCE tokens (gluten, nuts, peanut, dairy, milk, egg, soy, wheat, ingredient) MOVED to MENU_QUERY (→ the presence-confirm path, which CONFIRMS a tagged allergen via the HAS/CONTAINS rule + the deterministic caveat-append, and DEFERS-never-DENIES for an untagged one); SAFETY tokens (allerg, celiac, coeliac, intoleran, free from, gluten free, safe for, suitable for) and `contain` stay ALLERGEN_QUERY → fixed redirect. `contain` deliberately KEPT as ALLERGEN_QUERY (resolves the ambiguous "does it contain any nuts" toward safety — a wrongly-redirected presence question is a mild helpfulness miss; an absence question reaching the LLM is the dangerous error). NET: "does the tiramisu have gluten" → MENU_QUERY → confirms (tiramisu is tagged Gluten) + caveat; "is the tiramisu gluten free" → guard redirect, no LLM; "does it have sesame" (untagged) → defers, never "no". RESIDUAL RISK: the untagged-defer ("never says no") is a PROMPT-STRENGTH guarantee (DEFER-never-DENY), not deterministic — the floor and the caveat-append ARE code-guaranteed. If an untagged item ever returns "no/free of", tighten the prompt; it is not a floor failure.

> **GREETING — once per calendar day per sender (V7.7, LIVE-VERIFIED V7.8).** Previously isFollowUp was hardcoded false → "Hey there 👋" fired on every message. Now the webhook reads whatsapp_logs for the most recent prior REPLIED row (`response_sent is not null`) for this sender (`customer_number`, digits-only exact) + truck, and sets `isFollowUp = prior exists && localDateOfInstant(prior.created_at, truckTz) === getLocalDateInTz(truckTz)` — i.e. greet on the first replied message of the local day, suppress for the rest of that day. The `response_sent is not null` filter means an IGNORE/gibberish message (logged, unreplied) does NOT suppress the greeting on a later real question the same day. The day boundary is computed in `truckTz` — a single const = 'Europe/London' today, swappable to `truck.timezone ?? 'Europe/London'` in one line when that column exists (the multi-country requirement). DST-safe (both date strings go through Intl tz formatting; no manual UTC-offset math). The read runs BEFORE the message's own log insert (no self-suppression) and is FAIL-OPEN (a read error → greet, never block the reply). The downstream greeting machinery (greetingPrefix/greetingInstruction) was already correct and unchanged. (Supersedes the earlier "greeting follow-up detection gated on the whatsapp_logs migration" note — the migration is applied and detection is wired.)

> **RULE** — The Twilio handler at /api/webhooks/whatsapp is DORMANT, not deleted. Do not overwrite it. formatWhatsAppOrder is dead code (delete when Twilio is retired — Section 27).

> **LIVE-VERIFIED (V7.8; whatsapp_logs migration applied V7.7, Section 16)** — the four-bucket / allergen-routing path + the V7.7 once-per-day greeting flow were tested on-device this session. The Gusto auto-reply number (`07380736226`) is now whitelisted in Meta, so delivery succeeds. (Was PENDING V6.3 → partly resolved V7.7 → completed V7.8.)

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

## Gemini / API cost — negligible (V6.9)

> **FINDING (V6.9)** — `gemini-2.5-flash` WhatsApp replies cost ~$0.0007/message (~300–500 input + ~200 output tokens at $0.30/$2.50 per 1M). Do NOT re-tier features (e.g. moving Messenger/Insta to Max) for API cost — the cost is rounding-error. Deterministic-first routing for simple queries (e.g. schedule) is worth doing for LATENCY/SAFETY, not cost.

# 22. Development process

> **OPERATOR PREFERENCE** — When presenting any code or file, the file path must appear immediately above it as path/to/file.tsx in bold inline code. Never make Dominic scroll up to find which file to update.

## Two-chat pattern

- **Planning chat (Claude)** — strategy, UX, architecture, Cursor-ready prompts. Does NOT write code.
- **Coding chat (Claude within Cursor)** — implementation, file edits, smoke tests.
- Instructions flow planning → coding; audit reports flow coding → planning.

### Working with the planning chat (Dominic's method, V6.6)

- Dominic DIRECTS and DECIDES; he does NOT read or write code, and he does the manual PASTE-IN of updates (the planning chat can't write the manual file). Give plain-English instructions; deliver any Cursor action as ONE clean copy-paste block; keep Supabase-SQL-he-runs separate from Cursor prompts.
- He ALWAYS prefers the durable long-term fix; never a temporary patch that needs redoing unless he explicitly asks for one (e.g. the V6.6 event-display stopgap, taken knowingly).
- He works fast-build-then-test, scans rather than reads, and reflex-yeses prompts → the planning chat must CATCH TRAPS before they ship. Diagnose-first (look-only audit → report → his nod → change prompt) is mandatory for: stock, capacity, order_key, migrations, live ordering, the scraper bridge, the venue matcher, and anything touching pause/offline.
- "tsc-clean / simulated-pass" ≠ "works" — verify the END STATE on a live run, confirm DEPLOYED before judging a prod result.
- Manual updates: the planning chat maintains a running tally and hands over a consolidated paste-ready block before a chat closes (Dominic pastes it into the master manual); it can't hold exact wording across chats, so the hand-over must happen with room to spare.

> **RULE (V6.7) — Cursor instructions go in a FENCED CODE BLOCK.** Any Cursor action must be delivered inside a triple-backtick fenced code block, never as free-running prose. Free text forces a manual click-drag selection; a fenced block is one-click copy. This tightens the existing "ONE clean copy-paste block" rule with the explicit format requirement.

## Audit before build

Read relevant files and paste excerpts; identify duplications/conflicts; confirm DRY; only then implement.

## Smoke tests

Every change includes a smoke test. Nothing is "done" without an operator-confirmed smoke test.

> **NOTE (V6.3, reaffirmed V6.5/V6.6)** — A passing data-layer / RPC / tsc-clean smoke test is NOT the same as an operator-confirmed live test. The order-key rebuild passed 9/9 data-layer smoke tests but was never clicked on a real device; the per-event stock build is fully built and tsc-clean but its two-device oversell e2e is still pending; the V6.6 pause event-scoping and scheduler revival are verified by logic + cron-success but the two-event-one-van repro and the behavioural auto-close/offline-pause tests are still live-pending. A live web/tablet click-through still gates the trial (Section 26 / Section 27). "tsc-clean / simulated-pass" ≠ "works" — verify the END STATE on a live run, and confirm DEPLOYED before judging a prod-endpoint result.

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

### Price inputs — string-buffer while editing (V7.6)

> **RULE (V7.6)** — a price/number input must NOT be bound straight to a NUMBER state seeded at 0 and coerced on every keystroke (`parseFloat(v) || 0`) — that produces a stuck leading zero (can't clear "0", `1.50` becomes `01.50`). Hold the editing value as a STRING buffer (`priceInput`): empty-while-editing, `"0"` placeholder, `type=text inputMode=decimal`, coerced to a number only on SAVE (`Number.isFinite` guard, empty → 0/free). "0 = free" is preserved; the stored type is unchanged. The sibling price inputs (menu, deal, original) use a milder `|| ''` pattern with no stuck-zero and were left unchanged; standardising all price inputs on the string-buffer pattern is on the backlog (Section 27).

## Dashboard avatar dropdown

Everything the operator needs without leaving the page. Five header rows reduced to three: branding row, tab row, slim mobile event bar (sm:hidden). The dropdown order is canonical (Section 3).

## Manage page avatar dropdown

Same UserMenu with showDashboardLink=true. The mobile-only "← Orders dashboard" link is sm:hidden on desktop.

## Menu tab header (mobile)

Three rows: "Menu" + "+ Add category"; "N categories · N items"; "✨ Import menu" outline button (whitespace-nowrap). The Schedule tab's "✨ Import schedule" button mirrors this styling.

## Pending approval-card buttons (V6.6)

> **RULE (V6.6)** — on the "Needs your approval" (pending/unconfirmed) event cards, the Approve / Edit / Reject buttons sit in a **full-width horizontal row BELOW** the venue/area/time block on mobile, so the venue text gets the full card width; they revert to the inline horizontal row at `sm:`+ (desktop unchanged). A brief vertical-stack experiment was reverted (ate too much card height). The CONFIRMED-card compact icon buttons (copy / ✏️ / ✕) are unchanged.

## All categories collapsed by default

expandedCat = null on Manage page open.

## invisible vs hidden for layout-reserved elements

> **RULE** — Use invisible (visibility: hidden), not hidden, when a conditionally-shown control would cause layout shift in a fixed toolbar.

## Identity block in dropdowns

Truck name bold, operator first name muted below (currentUserName.split(' ')[0]). Van name is NOT included.

### Preventing iOS Safari auto-zoom (V5)

> **RULE** — Inputs, selects, and textareas must be at least 16px on mobile. globals.css locks these to 16px below 640px. The viewport is width=device-width, initialScale=1, WITHOUT maximumScale/userScalable:false. (V6.6 — the per-event stock inputs were widened and set to `inputMode="numeric"` + 16px on mobile under this rule.)

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

> **NOTE (V6.6)** — the daily scraper is also the natural home for the cron-health alert (Section 27): a check that `cron.job_run_details` shows a recent successful `heartbeat-monitor` / `auto-event-scheduler` run, emailing Dominic via Brevo if a scheduler has gone silent.

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

> **CLIENT FETCH HARDENING (V7.5) — never fail-closed a transient error to a "doesn't exist" state.** Every discovery surface (homepage map, venue page, trucks list, profile `TruckClient`) loads through the `useVillageData` hook, which fetches `/api/discovery/events` ONCE at mount. It previously swallowed any fetch failure (non-200 / network / 10s abort / JSON parse) into `setLoading(false)` while leaving `allTrucks=[]` — so a transient blip (a deploy rollout redeploying that route, a cold start, a 500 under load) made `TruckClient` render a **false "Truck not found"** for a truck that exists (the profile resolves the slug out of `allTrucks`, so an empty list reads as not-found). This recurred around Cursor deploys. Fix: the hook now (a) does **bounded auto-retry** (3 attempts, 400ms/1200ms backoff) so a single blip self-recovers without a reload, and (b) exposes a `loadError` flag (set only after retries exhaust) + a `refetch()`. `TruckClient` uses a **3-way gate**: `loading` → "Loading"; `loadError` → an honest "Couldn't load — Retry" (NOT not-found); fetch-SUCCEEDED-but-slug-absent → the real "Truck not found". So "Truck not found" shows ONLY on a genuine no-row. This is the SAME class as the V7.1 silent-blank customer-page fix — a swallowed failure must surface as an honest error+retry, never as a wrong "doesn't exist"/empty state. The other consumers read additive fields and are unchanged (they fall back to their existing empty/loading states; they may opt into `loadError`/`refetch` later). NOT today's logic — the fault was pre-existing; the deploy was only the trigger.

> **CRITICAL** — A discovery event only plots as a map pin if it has BOTH a discovery_truck_id and a venue_id. The map JOINs through venue_id to venues for lat/lng; a null venue_id (or null discovery_truck_id) silently fails to appear.

The venues table is the single coordinate store: name, **village**, latitude, longitude, and an aliases column (text array).

> **UNIQUE CONSTRAINT (V6.2)** — venues uniqueness is **(name, village)**, not name alone. Upserts MUST use `onConflict: 'name,village'`.

## Data sources

Three independent pipelines POST to /api/inbound-schedule: processFoodTruckScreenshots (Apps Script), analyzeEmailWithGemini (Apps Script), and the GitHub Actions web scraper.

## inbound-schedule route — ID resolution (V6.1) + venue matcher (rebuilt V6.5, extracted + venue_id V6.6)

As of V6.1, /api/inbound-schedule resolves the FKs at insert time: fetch all discovery_trucks and venues up front, normalise the incoming truck_name and venue_name, match (including the aliases array), write the matched discovery_truck_id and venue_id with visibility 'public'.

### Venue matcher — token-overlap + village-rank + best-effort (V6.5, shared module + venue_id stamp V6.6)

> **CRITICAL (V6.5)** — `findVenue` resolves a scraped event's venue (and through it the postcode and coordinates). The old matcher matched on a bare name substring with a vacuous village AND-filter and took the FIRST match (`.find`). This was simultaneously too loose AND too narrow: "The Cavendish Five Bells" matched the RATTLESDEN "Five Bells" (substring hit) while the correct Cavendish "The Five Bells" was REJECTED on word order, and the town safeguard was inert because the scraped town was null (the embedded-town bug, now fixed — Section 24). The mislink then CASCADED — the wrong venue's postcode (IP30 0RA), coordinates, and map pin were written onto the event, so a customer would see "Cavendish Five Bells" pinned in Rattlesden.

> **RULE (V6.5/V6.6) — the rebuilt, shared matcher.** `findVenue` lives in **lib/venue-matcher.ts** (V6.6 — extracted from inline code; the duplicate copy in `scripts/reresolve-event-venues.ts` was deleted, resolving a latent drift) and returns `{ venue, confidence: 'high'|'low'|'none' }`. It:
> 1. **Gathers candidates by TOKEN-OVERLAP** — every venue sharing significant name tokens with the scraped venue_name (so all "Five Bells" venues become candidates, regardless of "The"/word order).
> 2. **Ranks by normalised VILLAGE agreement** — the candidate whose village matches the scraped town (normalised: lowercased, punctuation-stripped) wins. An **embedded-town fallback** reads a town token out of the scraped venue_name when the town field is still blank.
> 3. **Picks the BEST candidate** via a deterministic `pickBest` (exact normName → most token-overlap → lexicographically smallest id — no randomness/first-in-array), rather than bailing to null.
> Confidence: no candidates → `none`; single / clean village agreement / multi-agreeing-with-exact-name → `high`; multi-agreeing-no-exact or multi-no-village → `low`.

> **RULE (V6.6) — the bridge stamps venue_id.** The bridge resolves the venue ONCE per row (precompute map) and stamps `truck_events.venue_id` + `venue_id_source='scraper'` + `venue_match_confidence` on the insert (Section 15). `venue_id` is the keystone that unlocks trusted-anchor reuse, history-prior tie-breaking, and rename-safety. Live-verified: a test-truck re-scrape stamped 8/8 fresh events high-confidence, coords agree (resolve-once map proven end-to-end).

> **RULE (V6.5) — best-effort, NOT bail, is the right behaviour for the ambiguous case.** Because pending events are customer-invisible (Section 15), a best-effort venue guess is only ever seen by the TRUCK at approval, which validates and corrects it before it goes live; and an approved event becomes a trusted anchor for future scrapes. So when village can't disambiguate, the matcher picks the most plausible candidate rather than leaving a blank. (V6.6 added the `venue_id` anchor column. Two enhancements remain scoped-not-built — Section 27: a **confidence flag SURFACED in the approval queue** to flag low-confidence guesses to the truck, and a **history-prior** tie-breaker using the truck's prior CONFIRMED venues, with a ≥2-visit floor and anti-reinforcement since confirmed = event-approved not venue-validated.)

### Class rule — discovery vs orderable (V6.6 directive)

> **RULE (V6.6)** — Discovery-only events (no ordering): best-guess a venue link so the event always plots; no approval (a best-guess pin beats an invisible event). Orderable events (linked trucks): best-guess too, the event still goes to the approval queue, and the OPERATOR approves it (the operator validating their own location is the safety net; Dominic does not approve in production — testing only).

### Single-resolution rule

> **RULE (V6.5/V6.6)** — `findVenue` (lib/venue-matcher.ts) is the single fuzzy matcher and resolves venue_id AND postcode/coords together for a scraped event. Never resolve a venue twice with two different matchers (that was how the postcode and the pin diverged). The earlier discovery-upsert 500 (postcode leaked via `...row` spread into the discovery_events upsert, which has no postcode column → PGRST204 → route 500'd before the bridge → "0 bridged, 0 discovery") was fixed by destructuring it out: `const { postcode, ...discoveryRow } = row`.

### Earlier venue data fixes (V6.2, retained)

Pizzeria Gusto's Saturday event re-pointed to The Five Bells, Cavendish (id 6e23389e-…; 52.0876415, 0.6324885); eight venues added with coordinates and aliases; 52 events re-pinned; wrong venue_ids nulled where the correct venue wasn't yet present.

## Apps Script key rules

Four Script Properties plus a separate GitHub Actions copy of GEMINI_API_KEY, verified with testAllKeys() after any rotation (Section 24).

## processFoodTruckScreenshots details

gemini-2.5-flash; 14-day date mapping; invalid-venue filter; a 15-second pacer between files; a ~280s time guard (inside the 6-minute ceiling); on success, written to the Sheets Events tab, mirrored via mirrorEventsToSupabase(), screenshot trashed.

## Venue matching and creation

A new venue is geocoded via the Google Maps API and stored with name, village, lat, lng, aliases. Upserts use onConflict 'name,village'. The Sheets Venues tab holds aliases in columns N/O/P (SEPARATE from the Supabase aliases array — keep in step). backfillMissingVenueCoords() geocodes rows without coordinates.

> **DATA HYGIENE (V6.1)** — (1) the same event from two pipelines with a one-day offset creates a near-duplicate — dedup on truck + date + venue; (2) duplicate venue rows with slightly different names split a venue's events — merge to the canonical row and add the variant as an alias in BOTH Supabase and the Sheet. (V6.6 — the bridge still dedups on the venue_name STRING; deduping on `(truck_id, event_date, venue_id)` with a name fallback is on the backlog, Section 27, triggered by an operator editing venue_name post-confirm.)

## Visibility

discovery_events default to visibility = 'public'; there is no status column. The `visibility` enum (public|hg_only|hidden) is also the gate for operator-event exposure per host (Section 15). RLS public SELECT on discovery_events, discovery_trucks, venues; writes service-role only. A test truck is kept off the public map by setting its discovery rows to `hg_only` (NOT a trucks.is_test column — Section 16).

## Known DRY gap

process-schedule imports lib/schedule-extract.ts, but processFoodTruckScreenshots, analyzeEmailWithGemini, AND the scraper's inline hgPrompt still implement extraction independently. Long-term: migrate the Apps Script processing off Google Sheets, route the scraper through buildScheduleExtractionPrompt, then move all paths in-repo behind the shared utility (Section 27).


# 26. Testing and dev environment

## Dev setup

- **localhost:3000** for local testing, treated as **Village Foodie** (the host gate is a substring `.includes('hatchgrab')` check — Section 2 — and "localhost" doesn't match).

- **localhost-as-HatchGrab (V6.5)** — to test HatchGrab-only surfaces (operator events, the order buttons on the profile page, the visibility gate) locally, add a one-line `/etc/hosts` alias `127.0.0.1 hatchgrab.localhost` and browse **http://hatchgrab.localhost:3000**. Because both the server (Host header) and the client (`window.location.hostname`) run the same substring check and the browser sends the navigated hostname as the Host header, the two agree automatically and the whole app renders as HatchGrab — zero code change, zero production risk (no real visitor can present a `*.localhost` host). `localhost:3000` continues to render as Village Foodie, so both brands are testable side by side.

> **REMINDER (V6.8) — test HatchGrab-only flows on a HatchGrab host.** Order buttons, the capacity engine, and operator events must be tested on **hatchgrab.com** or **hatchgrab.localhost:3000** — plain `localhost:3000` renders as Village Foodie and masks these paths (the substring host gate). A capacity bug that "doesn't reproduce on localhost" is usually this.

- **Test Kitchen** test truck: dashboard_token test-abc123def456, **id `test-truck`, slug `test-kitchen`** (the public profile resolves by slug — `/trucks/test-kitchen`; `/trucks/test-truck` 404s, though the order page tolerates the id via a fallback). Contact dominicbonini@hotmail.com. As of V6.5 its discovery rows are `hg_only` (shows on hatchgrab.com, hidden on villagefoodie.co.uk) — there is no `trucks.is_test` column (Section 16).

- iPad Air simulator for KDS; Safari responsive mode at tablet sizes; phone widths 375/414px. (V6.6 — the trial runs on web/tablet-browser; the native iPad app is post-trial, Section 11.)

## Pre-trial checklist

- ~~Capacitor wrapper built; Stage A offline working reliably~~ — POST-TRIAL as of V6.6 (Section 11). The web/tablet-browser trial does not require it; auto-close + offline auto-pause are the server-side safety nets and work on web.

- All known bugs fixed (target zero at trial start).

- Sheets-to-DB migration complete or safe parallel-run.

- Auth hardening (auth-attempt rate limiting still open; admin secret RESOLVED V6.1 — ADMIN_SECRET removed, session-based is_admin via verifyAdmin() is the only path). Public-data anti-scraping rate limiting is DONE (V6.3, Section 28).

- Event confirmation flow live (done).

- Order flow rebuilt on the order-key two-id model (V6.3, Section 18a) — migration 20260607 applied and verified; 9/9 data-layer/RPC smoke tests passed. **DONE (V7.8) [LIVE-VERIFIED]: the full live web/tablet click-through of the whole order flow was completed on a real device this session** — a customer order placed end-to-end, order #11 confirmed, with the correct venue + collection time. Every order-flow change (numbering, urgency, slots, basket persistence, email venue/contact, the V6.4 oven-occupancy engine, the V6.5 per-event stock model, and the V6.6 event-scoped pause + customer pause handling) stacks on this one path — now verified.

- **Per-event stock built and tsc-clean (V6.5/V6.6, Section 30) — two-device oversell e2e DONE (V7.8) [LIVE-VERIFIED].** All read/write phases are in place (menu-API ceiling, stock-guard ceiling, enforceStockLimits, dashboard overrides, the V6.6 no_item_cap follow-category, the four UI fixes). Proven on real data for cross-event isolation. RUN THIS SESSION: the **live two-device oversell test on hatchgrab.com with two same-date events** — Test 2 (sell-through on event A leaves event B's ceiling untouched) and Test 3 (concurrent oversell race — exactly ONE of two simultaneous last-item orders succeeds) — both operator-confirmed.

- Capacity engine (V6.4, Section 6) — oven-occupancy projection, event-keyed `production_slot_usage`, per-event booking lock, ASAP tail-completion placement, date-aware slot floors. Verified by simulation + spot-checks; folded into the live click-through above. **KNOWN GAP (V6.6):** the global kitchen_capacity ceiling doesn't roll an over-capacity single order forward — UX-only, parked (Section 6 / Section 27).

- **Schedulers live + event-scoped (V6.6)** — auto-close and offline auto-pause are now wired (pg_cron restored, Vault secret back, both jobs succeeding; heartbeat-monitor on 30s) AND event-scoped. Both are server-side safety nets that work on web. STILL TO DO: behavioural live-test — the two-event-one-van repro (A live pauses, B future stays orderable), the dashboard-online-clears-pause path, auto-close firing at end_time, and confirm the deployed `heartbeat-monitor` runs the NEW event-scoped logic (redeploy the function).

- Rate limiting live and correctly tiered (V6.3, Section 28) — STRICT only on /api/discovery and /api/events; ordering/authenticated routes exempt.

- WhatsApp on Meta Cloud API (V6.3, Section 20) — webhook wired; four-bucket smoke tests and the whatsapp_logs migration still outstanding.

- End-to-end smoke test of all flows: customer order, walk-up, ready notification, mark paid & done (verified in V4; re-run live on the current build).

- Brevo hatchgrab.com domain verified and propagated (SPF + DKIM authenticated).

- Row Level Security enabled across all tables (DONE V6.1; the V6.5 stock tables and the V6.6 truck_events columns are covered — truck_events stays anon-readable for the customer page; new pause/venue columns inherit that — Section 16).

- Discovery map plotting verified (DONE V6.1; re-verified after the V6.5 venue-matcher rebuild). **V6.6:** confirm scraped events still plot on Village Foodie (the `isHG ? []` stopgap fires ONLY on HatchGrab) and that operator events carry the stamped venue_id.

- **Operator-events visibility verified (V6.5)** — `/trucks/test-kitchen` resolves on hatchgrab.com with its schedule and order buttons, and 404s/hides on villagefoodie.co.uk. Confirm no `hg_only` truck leaks onto the public Village Foodie map (the dedicated unfiltered visibility fetch is the guard — Section 15). **V6.6:** confirm the HatchGrab profile shows only operator/approved events (the stale-scraped-rows fix) — and remember it's the temporary host stopgap, not the durable model.

- Apps Script scraper confirmed working end-to-end after the key recovery (DONE V6.1).

- Production deploy to Vercel with production Supabase; real device testing with simulated connectivity drops (offline auto-pause is the path to exercise — it's server-side, so a dropped device tab is enough, no native build needed).

- Wake lock confirmed working under iOS 16.4+ and Chrome Android (post-trial native concern; for the web trial the browser tab staying open is the requirement).

- QR code and dashboard order link resolve to /trucks/[slug]/order (slug populated for every truck; dashboard_token fallback removed in V6).

- Scraper bridge verified: a linked, auto-preference truck's inbound event creates an unconfirmed truck_events row (now with stamped venue_id — V6.6) and shows in its Schedule tab; an unlinked or manual truck stays discovery-only (Section 15).

- Scraper GitHub Actions workflow passes on Node 24. Diagnose the ~23-minute run failure (Section 24) before relying on the cron.

- Migrations run in Supabase (filename order, `notify pgrst, 'reload schema';` after each, in chunks): through 20260608 (capacity/lock), the V6.5 stock migrations, and the three V6.6 migrations **20260612_truck_events_venue_id.sql**, **20260612_event_item_stock_no_item_cap.sql**, **20260612_event_scoped_pause_extrawait.sql**. Reconcile the applied-vs-file list — upsell_events and whatsapp_logs were never applied (Section 16). Admin operator account set (operators.is_admin = true).

## Contextual reminders

- orders has TWO ids: order_key (uuid, identity, every WHERE/key/URL/FK/dedupe) and id (text, per-event display number, restarts at 1, NEVER a lookup key). Never conflate them (Section 18a). orders.event_id is ON DELETE SET NULL — delete orders before truck_events when wiping a test truck (Section 18a / Section 27).

- Order display numbers are bare integers ("5"), generated only by nextOrderId via the atomic event/truck counter (Section 18a).

- **Stock is per-event via sparse override: read `event_item_stock.stock_count ?? menu_items_db.default_stock`; the override exists only when the dashboard edited that event; un-edited events read live Settings. Ceiling and sold count must share the SAME event_id, and a missing override falls back to default_stock — never accidental-unlimited, never 0 (Section 30).** A `no_item_cap=true` row resolves the item ceiling to null = follows the category pool, distinct from `stock_count=null` = "use default" (V6.6).

- **Pause and extra-wait are EVENT-scoped on truck_events (V6.6); the van/truck columns are vestigial. Manual pause writes the selected event; offline auto-pause stamps the LIVE-NOW event on the stale van; readers read the event's own columns. A future event is never paused for a currently-offline van (Section 5).**

- **The two schedulers run on pg_cron and read service_role_key from Supabase Vault; a deleted Vault secret silently 401s every invocation (auto-close + offline auto-pause die). heartbeat-monitor = 30s, auto-event-scheduler = 1-min. Redeploy the edge function after logic changes (Section 11).**

- **An override can only RESTRICT availability, never re-enable a Settings-disabled item. Item names are always read live from `menu_items_db.name` (Section 30).**

- **The venue matcher (`findVenue`, lib/venue-matcher.ts) is best-effort, not bail: token-overlap candidates → village-rank → deterministic best-pick, returning {venue, confidence}. The bridge stamps truck_events.venue_id once per row. Never resolve a venue with two different matchers (Section 25).**

- **The scraper's inline `hgPrompt` is SEPARATE from `lib/schedule-extract.ts` — a known divergence. It must always emit a `town` and split an embedded place-name out of the venue name (Section 24).**

- **There is NO `trucks.is_test` column. Test trucks are kept off the public map via the discovery row `visibility` enum (`hg_only`). Phantom `is_test` references in admin/manage code likely error — backlog (Section 16 / Section 27).**

- **Operator events are gated by the LINKED discovery truck's `visibility`, fetched via a DEDICATED UNFILTERED `hatchgrab_truck_id → visibility` map — never via the visibility-filtered `trData`. On HatchGrab, scraped discovery events are additionally suppressed by a TEMPORARY `isHG ? []` stopgap (Section 15 / Section 7).**

- **Host gating is a substring `.includes('hatchgrab')` check on the Host header (server) and `window.location.hostname` (client); no middleware, no exact-match. `hatchgrab.localhost:3000` renders localhost as HatchGrab (Section 2 / Section 26).**

- Both order insert paths must write event_id; never setState from a failed fetch (Section 5).

- calcQueuePushSecs is shared by client and server ASAP — never fork it (Section 6).

- kitchen_capacity counts ITEMS, not batches; the ceiling reddens but does not slow per-category drain (independent-equipment assumption) (Section 6). Global-ceiling roll-forward for an over-capacity single order is a known UX-only gap (Section 6 / Section 27).

- Future-dated events never show red "prep now" urgency; age blends in only under 60 minutes (Section 9). Every "is this event today" floor uses a LOCAL Y-M-D, never toISOString (Section 6).

- The slot traffic-light is operator-only; the customer picker shows only clean slots (Section 10 / 7).

- WhatsApp runs on the Meta Cloud API; the Twilio handler is dormant, do not overwrite (Section 20).

- UI text contrast floor on white: slate-700 body, slate-500 secondary, slate-400 decorative only; orange reserved for current-plan/active highlights.

- Watch for new Date('YYYY-MM-DD') UTC bugs and for next/image shadowing the global Image constructor.

- Always strip seconds via formatTime — never inline t.slice(0,5).

- ASAP base time is max(now + prep, eventStart) — never add prep on top of a future event start (Section 6).

- Customer order URL is /trucks/[slug]/order; the cancel link is /order/{order_key}/manage; the profile/chooser is /trucks/[slug]. Never use dashboard_token in a customer-facing URL or public API response (Section 12 / Section 2 / Section 7).

- New operator pages reuse AppHeader and slate-900 tabs (lib/brand.ts) — no inline page headers (Section 3).

- A null batch_size means "no limit" — render blank with an ∞ placeholder, never a sentinel like 999 (Section 6).

- trucks.id is text, not uuid — any new FK to trucks(id) must be text. truck_events(id), orders.event_id, and truck_events.venue_id are uuid (Section 16).

- Schedule extraction goes through lib/schedule-extract.ts in-repo — never re-implement the Gemini prompt/retry/parse (the scraper's hgPrompt is the one known divergence) (Section 3 / Section 22).

- venues uniqueness is (name, village) — upsert with onConflict 'name,village' (Section 25).

- Cross-talking tabs and in-progress-input panels are always-mounted with an isActive prop; modals render outside the isActive gate (Section 22).

- Run large SQL migrations in chunks, not a single full-file paste, and keep an applied-vs-file reconciliation (Section 16 / Section 22).

- "tsc-clean / simulated-pass" ≠ "works": verify the END STATE on a live run, and confirm DEPLOYED before judging a prod-endpoint result (the local scraper POSTs to the PROD bridge) (Section 22).


# 27. Open backlog (June 2026)

## Logged this session (V7.8)

- **HIGH — ownership-transfer / `operator_id`-separation feature.** Handover is currently done via account-rename (the verified email-change flow on a single-truck account). Build a proper transfer if multi-truck / multi-owner scaling needs it.
- **HIGH — `remove_team_member` leaves ORPHANS.** It deletes only the `truck_users` row, NOT the `operators` row / auth user / `truck_user_vans` / `password_reset_tokens` the invite created. Didn't bite this session (data was clean) but WILL on real invite/remove cycles. Fix BEFORE onboarding the real Gusto owners. Related smells: the invite creates an `operators` row for a non-owner invitee (model smell), and `/dashboard`'s `truck_users` resolution would mis-handle a user in 2+ trucks (now first-picks; a proper PICKER is the real fix).
- **HIGH — DRY: consolidate the three header components** (order `Hdr`, `TruckClient`, AppHeader) into one shared, parameterised header. The same overlap bug class was fixed separately in each this session (V7.8 §4) — proof of the duplication debt.
- **MED — multi-owner feature**: owner-invitable role + server guard + display + billing-access model. Manager is currently NOT elevated to billing access (left as-is).
- **MED — `/api/manage` auth-consistency**: token-possession defaults to owner-level (looser than `/api/dashboard`). Decide whether to tighten.
- **MED — proper distinct `'admin'` role/view** vs the current owner-equivalent bypass (`/api/dashboard` authorizes admins as `userRole='owner'` interim).
- **LOW** — ASAP-moved note in the confirmation email (V7.8 §2 backlog: server must pass the resolved ASAP target into email params). KDS back-link `?pin=` pass-through decision (avoid re-prompt). Dead-code cleanup (`upsellSuggestions`, `calculateDealOriginalPrice`, `HOURS`, `applyCode`, + the ~18/10 unused-locals Cursor flagged across `order/page.tsx`).
- **RESOLVED** — `whatsapp_logs` migration applied to prod earlier this session.

## Logged this session (V7.0)

- **LIVE-REDEFINITION (status-driven "live") — ✅ BUILT this session (Section 15).** "live" = `status='open'` (operator-started), not the clock window, across the monitor AND customer surfaces; the over-pause fix is preserved (future events are `confirmed`, never selected) and the future-event offline gap is closed (protected from when STARTED). Cron health GREEN-LIT it (`heartbeat-monitor` 30s + `auto-event-scheduler` 60s both succeeding in `cron.job_run_details`; Vault-secret regression NOT recurred). NEEDS DEPLOY: REDEPLOY heartbeat-monitor (gate + logging inert until then).
- **OFFLINE-PROTECTION future-event gap (now addressed BY the live-redefinition)**: a future open event accepted pre-orders but was never offline-paused because the monitor's live-now gate only paused today+within-window events. Confirmed root via audit. The status-driven redefinition closes this.
- **CROSS-VAN heartbeat leak (multi-van trucks only)**: the no-vanId operator-dashboard heartbeat (Path A, `app/api/heartbeat`) stamps `last_heartbeat_at` AND clears `online_paused_until` for ALL the truck's active vans, not just the heartbeating one. So van A's dashboard keeps van B looking online and a reconnect on A clears B's offline pause. KDS (`kds_token`) and van-pinned dashboards (`?van_id=`) are correctly isolated. Monitor read/pause side is fully per-van isolated. Fix: scope Path A to the present van, or have the operator dashboard always carry a `van_id`. Not first-trial-blocking (one van).
- **PHONE-BACKGROUNDING false pause**: a backgrounded/locked phone stops heartbeating and looks offline → monitor may pause when the operator just glanced at another app. No full software fix (a locked phone can't ping); answer is visibility-detection tuning + operator EDUCATION (let them knowingly disable protection with a clear notice). Design + UX, post-trial.
- **OPERATOR FAQ/HELP section**: draft once the trial feature set is frozen and behaviours are live-verified (the manual is the raw material; needs translating to operator-facing plain English). Near-end task.
- **STRAY FILE**: delete `app/manage/[token]/page 2.tsx` — a duplicate copy of the live `page.tsx` (with its own `ScheduleTab`); a footgun where a future edit could land in the dead file. Delete separately.
- (carried) WhatsApp grounded-allergen answers (gated on allergen-data restructure: persist structured extraction + required per-item entry + "confirmed none" ≠ NULL); ~~WhatsApp greeting follow-up detection~~ RESOLVED V7.7 (migration applied + detection wired, Section 20); per-item spice level (nullable, NULL=absent not mild).
- **DEALS in WhatsApp (scoped, build later)**: the bot is deal-blind (no fetch / payload field / classifier trigger). Deals live in `bundles_db` (the deal: name, bundle_price, slot_N_category, start_time/end_time window, apply_to_new_events) + `event_deals` (per-event `active` join). EVENT-SCOPED — active per event, NOT standing offers. MUST be event-aware: resolve deals against the next confirmed/open event, REUSING the menu API's resolution (`/api/menu` ~:114-178 — effectiveEventId → `event_deals.active` → `apply_to_new_events` fallback → stock → per-deal time-window; do NOT re-implement, or WhatsApp and the order page diverge). Scope a deal to its event ("at Friday's event: 2 pizzas for £15"); if no event resolves, say "no deals right now" — NEVER list all bundles (the menu API's no-event branch over-promises). Add deal/offer to the MENU_QUERY triggers + a `deals` array to the payload.
- **WhatsApp ATTENTION notifications (scoped, decide mechanism later)**: notify the truck when a message NEEDS A HUMAN. TRIGGER (narrow to start): genuine can't-answer (unbucketed/fallback) + explicit human-wanted ("call me", complaints, order changes); widen later. MECHANISM (operator's choice, deferred): a dashboard "needs attention" inbox (reads `whatsapp_logs` — `message_in`/`classification`/`possible_miss` already logged) AND an external channel (email/SMS/WhatsApp-to-operator), operator-selectable. External channel = new infra (operator contact + send mechanism + opt-in). The notification should carry the message + customer number + a way to reply, not just an alert.
- **LIVE-REDEFINITION follow-up**: the "closed/past" DISPLAY filters (order page ~:305 etc.) were left CLOCK-based as a backstop — decide later whether they should also be status-driven (mirror of the live fix).

> **NEEDS DEPLOY before testable (V7.0).** (i) REDEPLOY the `heartbeat-monitor` edge function — for BOTH the live-redefinition status-gate + diagnostic logging AND the offline-pause marker; (ii) apply migration `20260613_offline_pause_marker.sql` + `notify pgrst`. Vercel-deployed on push: `/api/events`, customer pages, dashboard, conflict detection, WhatsApp classifier.

> **LIVE-VERIFICATION PENDING (V7.0 — testing backlog, Section 26).** tsc-clean, NOT live-verified. PRIORITY: (1) slot-usage BUG 1 — first order of a FRESH event → `{pizza:1}` not 2 [deploy first]; (2) BUG 2 reconcile — backfill a drifted event → recompute + refreshed `updated_at` OR a surfaced error (if stale + no error → event_date-mismatch data condition); (3) capacity submit-bypass over-cap order PENDS at submit [silent-oversell guard, STILL UNWATCHED]; (4) operator capacity 6→17:00 / 7→17:05 + dots colour for instant; (5) instant tone — 2-pizza+11-anchovy → 17:05 dot RED, 17:10 RED; (6) offline — AFTER redeploy: close all screens → `[heartbeat-monitor]` logs show open event found + paused → customer submit 423s; ack popup fires once; manual pause doesn't trigger it; (7) live-redefinition — event set `status='open'` early → customer shows Live + Order now + green tag, equal-width; `confirmed` future event → Pre-order, not paused (logs confirm); (8) close lifecycle — early-finish styled modal; already-loaded customer blocks within 30s; submit-403 shows "event ended" banner; (9) event-conflict — FOUR cases (scraper duplicate "The Star"/"The Star Pub" flags despite name; Tier 2 review; Check B overlap; operator-added duplicate); (10) WhatsApp dietary/allergen — "does BBQ chicken have dairy" (tagged) → confirms + caveat; "which vegetarian/vegan" → lists, no caveat; "safe for nut allergy" / "gluten-free" → redirect; not-tagged allergen → defers, never denies. Confirmed working live earlier: time-select ASAP-equal, WhatsApp menu + tier-3 base, mobile schedule + event-card layout.

## Logged this session (V6.9)

- **Choose Time ASAP-equal selection — FIXED V6.9.** Picking the time equal to ASAP reverted to "Choose time" due to a `selectedSlot !== asapTime` conjunct in `hasChosenTime`; removed so the equal pick sticks (ASAP deselects, explicit slot submitted). Live-pending.
- **Capacity instant dot label — FIXED V6.8** (display-only `byCat` tally; see Section 6).
- **Capacity first-window pre-open lead — FIXED V6.8** (`placeInstantPoints` off-front allowance; see Section 6).
- **Grounded allergen answers — POST-TRIAL, gated on a data restructure.** Letting the WhatsApp LLM answer allergen questions is UNSAFE today and stays on refuse-and-redirect. Audit findings: per-item `menu_items_db.allergens` (string[]) exists but is optional/unvalidated and defaults to `[]` — so empty is AMBIGUOUS ("confirmed none" vs "never entered"), which forbids absence answers ("no nuts listed" ≠ "nut-free"). The truck-level allergen upload (`trucks.allergen_info_url` + `allergen_info_text`, migration `20260526`) stores an opaque PDF/image + one free-text blob — NOT machine-readable per-item; and `process-allergens` DOES extract structured `contains[]`/`may_contain[]`/`free_from[]` but DISCARDS them at save (only flattened text persists). PREREQUISITES before any grounded allergen answer: (1) persist the structured extraction to columns instead of flattening; (2) make per-item allergen entry required + add an explicit "confirmed none" state distinct from NULL; (3) only then feed confirmed data to the LLM (reading back the operator's legal declaration, not guessing). LESSON (recurring this session): absence of data is not data.

> **LIVE-VERIFICATION PENDING (V6.9, pre-trial click-through — Section 26).** SIX customer-facing changes built tsc-clean, ZERO live-verified — next session should be live-testing, not building. Priority order: (1) capacity submit-bypass — an over-cap order PENDS at submit, not booked at start [silent-oversell path]; (2) capacity instant lead table 1→17:00, 7→17:05 [7 must NOT collapse to 17:00]; (3) instant dot label "Other N" incl. an Other-only window; (4) Choose Time ASAP-equal sticks; (5) WhatsApp menu summary returns (not the bare link); (6) WhatsApp tier-3 ADVERSARIAL set: "do you have pepperoni" → answers, "do you have a kebab" → "we don't have that", "is the pepperoni pizza gluten free" → allergen redirect (must NOT reach the LLM), forced error → degrades to summary. Test on hatchgrab.com (or hatchgrab.localhost). tsc-clean ≠ done.

## Logged this session (V6.8)

- **Choose Time can't select the ASAP-equal time** — at a slot where ASAP resolves to e.g. 13:30, picking 13:30 from the Choose Time dropdown reverts to "Choose time" (no selection sticks); other times select fine. Likely the dropdown filters strictly-after ASAP (`>`) rather than at-or-after (`>=`), excluding the ASAP slot itself, or a selection-handler collision with ASAP-already-selected state. Diagnose-first. UX-only (order still placeable via ASAP).
- **WhatsApp MENU_QUERY bare-link fallback — RESOLVED (V6.8)** (Section 20). Root was a non-existent `category` column in the menu query (real column `category_id`), whose `42703` error was swallowed (only `data` destructured) → looked like "no rows" → `menuFallback`. Fixed by selecting `category_id` + the `menu_categories!category_id(name)` join and by destructuring/logging `error`. STILL OPEN (post-trial): per-item name matching ("pepperoni" → "Pepperoni Pizza") does not exist — MENU_QUERY returns a category summary only, no fuzzy item-name match; and the truck-resolution-by-customer-sender-number model is unreviewed. Open question for item matching: desired response shape for a partial item-name query (e.g. "Yes — Pepperoni Pizza, £X, order here: [link]").
- **Capacity first-window lead — RESOLVED this session** (Section 6 "Instant first-window pre-open lead"), was: 1 instant item bumped the start slot.

> **LIVE-VERIFICATION PENDING (V6.7/V6.8 capacity engine)** — tsc-clean + trace-verified but NOT live-verified. Priority checks on hatchgrab.com: (a) over-cap instant-only order PENDS/bumps at SUBMIT, doesn't book the start slot (the `!hasOven`→`!hasCounted` bypass flip — silent-oversell path if wrong); (b) instant lead table 1→17:00, 7→17:05 (7 must NOT collapse to 17:00 — proves the window still caps at 6); (c) dots show "Other N" incl. an Other-only window; (d) van window 10 + 8 pizzas reads over-capacity in the 10-min span; (e) "4 pizzas + 2 other / 3 other → 3 pizzas" holds; (f) unproducible-by-end order pends under the lock. tsc-clean ≠ done.

## Critical — before trial

- **LIVE web/tablet click-through of the entire order flow on a real device** — the single most important pre-trial task. Every order-flow change (per-event numbering, urgency, slots, basket persistence, email venue/contact, the V6.4 oven-occupancy engine / event-keyed usage / per-event lock / ASAP-selection state machine / date-aware floors, the V6.5 per-event stock model, and the V6.6 event-scoped pause + customer pause handling) stacks on this one path. Highest-value live checks: (a) place a customer order on ASAP WITHOUT touching the picker → confirms → shows #1 → right venue in the email; (b) the slot traffic light reads correctly; (c) a full slot bumps, not rejects; (d) a paused event blocks ordering and "Check again" keeps the basket; (e) Resume on the offline banner clears the pause.

- **Per-event stock two-device oversell e2e (V6.5/V6.6) — DONE (V7.8) [LIVE-VERIFIED].** Run on hatchgrab.com with two same-date events: Test 2 (sell-through on A leaves B untouched) and Test 3 (concurrent oversell race — exactly ONE of two simultaneous last-item orders succeeds) — both operator-confirmed this session (Section 30). STILL TO DO: live-verify the V6.6 `no_item_cap` follow-category on a real event (BBQ repro + sold-out → re-enable).

- **Two-event-one-van pause repro + scheduler behavioural test (V6.6)** — with two events sharing a van: (a) the live event offline-pauses while the future event stays orderable; (b) the dashboard/KDS reconnect clears the event pause; (c) auto-close fires at end_time; (d) the DEPLOYED `heartbeat-monitor` runs the NEW event-scoped logic (REDEPLOY the function — pg_cron calls the deployed version). Confirm both cron jobs keep succeeding in `cron.job_run_details`.

- **Availability auto-reset on order-cancel (V6.5)** — Phase 4 left the per-event `available=false` flip MANUAL-only. A cancellation frees stock but leaves the item stuck sold-out, and cancellations mid-service are normal. Add an auto-reset (recompute the per-event availability from live sold count) on the cancel path, mirroring `rebuildProductionSlotUsage` on cancel for capacity (Section 30).

- **Auth-attempt rate limiting** (public-data anti-scraping rate limiting is done — Section 28).

- ~~**Run the whatsapp_logs migration in prod (V6.3)**~~ — RESOLVED V7.7 (20260605_whatsapp_logs.sql applied; logging inserts now succeed, Section 16). The WhatsApp four-bucket smoke tests + the V7.7 allergen-routing/greeting on-device live tests are still outstanding (Section 20).
- **whatsapp_logs index (V7.7, post-trial)** — add a `(truck_id, customer_number, created_at)` (or `(customer_number, created_at)`) index if WhatsApp volume grows; the once-per-day greeting read is unindexed (fine at trial volume) (Section 20).
- **Allergen untagged-defer is prompt-strength, not deterministic (V7.7)** — the floor (redirect) and caveat-append ARE code-guaranteed, but "an untagged item never says no/free of" is a DEFER-never-DENY prompt rule; if live testing shows an untagged item ever returns "no/free of", tighten the prompt (Section 20).
- **Customer item-row photos are post-trial (V7.7)** — the row reserves a `w-16 h-16` left thumbnail only when `item.photo_url` is set; trial launches photo-free. Before enabling photos, verify on-device rendering (aspect-ratio / object-cover / non-square handling) (Section 7).

- **Applied-migrations reconciliation (V6.3)** — upsell_events (20260529_checkout_upsells) and whatsapp_logs were never applied to prod; audit the full applied-vs-file list.

- **Rotate the Upstash Redis REST token (V6.3)** — exposed in chat during setup (Section 28).

- **Phantom `trucks.is_test` references in admin + manage (V6.5)** — `is_test` does not exist as a column (Section 16). The discovery/events operator branch was fixed in V6.5, but admin and manage paths still select/reference it and therefore likely error on those queries. Diagnose-first which queries break; remove the references (the public-map exclusion is the discovery `visibility` enum).

- **orders.event_id delete semantics (V6.6)** — currently ON DELETE SET NULL, which nulls a deleted event's orders' event_id → they fall into the no-event display-id bucket and can collide (23505 family). Workaround today: delete `orders` before `truck_events` when wiping a test truck. Diagnose-first the proper fix (likely ON DELETE RESTRICT, or detach-then-archive) (Section 18a).

- Google Sheets → DB migration (scraper currently dual-writes; Sheets still config store). Also the home for the Gemini-extraction DRY consolidation — once done, the two Apps Script paths AND the scraper's inline hgPrompt can move in-repo behind lib/schedule-extract.ts (Section 3 / Section 24 / Section 25).

- Reports tab data verification across multiple events.

- Diagnose the ~23-minute scraper run failure (Section 24) — add per-site navigation and per-Gemini-call timeouts; confirm on the next Node 24 cron run.

- Apps Script screenshot processor 6-minute timeout — confirm the ~280s guard exits cleanly on a large batch.

- GitHub Actions GEMINI_API_KEY secret — verify the repository-secret copy matches the current Script Properties key.

- Link each trial truck's discovery_trucks row to its HatchGrab truck (hatchgrab_truck_id) via the admin console.

- orders.source column migration — replaces the customer_email IS NULL heuristic for order type in Reports.

- truck_events.customer_note surfacing on the customer order page below event details.

- Add "Edwardstone White Horse" to the Google Sheets Venues tab alias columns N/O/P.

## Parked for fresh chats (full briefs)

### Per-truck customer-mode state machine (PARKED — fresh chat; unwinds the V6.6 host stopgap)

> **The durable replacement for the V6.6 `isHG ? []` event-display stopgap (Section 7 / Section 15).** It subsumes three threads: "HatchGrab shows only approved events", "protect the order link before trial", and "Village Foodie flips to orderable when a truck converts". The model is **PER-TRUCK**, not per-host:
> - **Discovery** — scraped events on Village Foodie, no order buttons (the truck hasn't signed up).
> - **Preview / demo** — the truck's pages are fully viewable with a WORKING order walkthrough that places a CLEARLY-MARKED TEST ORDER (Dominic's chosen option — no password; password friction kills cold-email conversion and is deferred to post-conversion).
> - **Live** — operator/approved events with order buttons on BOTH Village Foodie AND HatchGrab for that truck; scraped events suppressed everywhere for that truck. KEY: when a truck converts, Village Foodie ALSO flips to operator-events-with-buttons for that truck (VF is where their customers already are).
> EXPOSURE (audit-confirmed): a stranger with the URL can place a REAL order on any `trucks.active=true` truck with a confirmed event — only `active` + event status + pause gate it, and `active` doesn't even gate the menu load; there is NO `published`/`accepting_online_orders` flag. Order buttons are gated `isHatchGrab() && source==='operator'` and must become TRUCK-STATE-driven. Plumbing: `/api/discovery/events` merges status-gated operator truck_events + visibility-only discovery_events (~:284-291), host gate ~:76-79; all consumers go via `useVillageData` (homepage map, venue page, trucks list, profile TruckClient); `allTrucks` comes from `discovery_trucks` independent of events. The `isHG ? []` stopgap must be UNWOUND as part of this. Re-prime a fresh chat with the V6.6 manual + this brief + one line: pre-trial, web-only, two gates outstanding (oversell e2e + live click-through).

### Capacity global-ceiling roll-forward (DONE V6.7 — superseded by the concurrency rebuild)

> **RESOLVED (V6.7).** Not via the spilling cascade proposed below — that interim `cascadeGlobalCeiling` helper was built then REMOVED. The ceiling is now an EXACT sweep-line concurrency check with its own cadence (`capacity_window_mins`); see Section 6 "Kitchen capacity = EXACT concurrency ceiling." Live-verification pending (Section 26). The original brief is kept below for history.

> **The fix for the Section 6 known gap.** BUG: the global `kitchen_capacity` ceiling HARD-FAILS (`fits:false` everywhere → empty slot picker, frozen ASAP) when a single order exceeds one window's ceiling (e.g. 7 counted items vs capacity 6), instead of spilling across collection windows. Per-category batch capacity DOES spill correctly (5 pizzas/batch 4 → ASAP rolls forward). DECISION: the customer NEVER splits; the system computes prep time and offers the earliest slot the WHOLE order is ready = tail-completion = spill. Diagnosed: per-category spills because items are distributed across `ceil(M/batch)` windows during load construction; the global ceiling only does a post-hoc red check with no redistribution → `fitOrderBackward` red at every T → `earliestBackwardFitSlot` returns null. PROPOSED (Cursor-reviewed, NOT applied): in `fitOrderBackward` order-load construction (~:539-611) add a global-ceiling spread so the order occupies `max(per-category ceil(M/batch), ceil(totalCounted/kitchenCapacity))` windows, each ≤ ceiling; `earliestBackwardFitSlot` control flow unchanged. CRITICAL: `fitOrderBackward` (placement) and `projectBackwardOccupancy` (existing-occupancy spread) MUST spill by ONE shared rule or placement/recorded-occupancy diverge (oversell). MUST-NOT-BREAK: (a) the 5-pizza per-category spill (verify `max()` never below per-category nw); (b) ambient operator dot tones (thresholds ~:493-500 untouched); (c) oversell at submit (addOrderToProductionSlot untouched — read-time math only); (d) amber/red thresholds. Callers: customer page (~:667/674/690), submit (~:267), dashboard slots, AddOrderPanel (~:247), slot-display.ts. SEVERITY: UX-only today — the server pends an over-ceiling order under the booking lock, never overfills. Re-prime a fresh chat with the V6.6 manual + this brief + the same one-line status.

## Important — before public launch

- **WhatsApp recipient-routing for go-live (V7.6)** — replace sender-match with recipient-match (`phone_number_id` → truck), and provision per-truck WhatsApp Business numbers. Sender-routing works only with one shared test number (Section 20).
- **whatsapp_replies plan-gate discrepancy (V7.6)** — `plan-features.ts` markets it as Pro+Max; `features.ts` grants Max/trial/tester/override only; the webhook obeys `features.ts` → silent no-reply on Pro. Reconcile (Section 20).
- **Standardise all price inputs on the string-buffer pattern (V7.6)** — the menu/deal/original price inputs still use the milder `|| ''` pattern; move them onto the dedicated-string-state pattern used for the Extras price adjustment (Section 23).
- **Customer basket-peek remove affordance (V7.6)** — the inline menu-card stepper now restores removal-to-zero, but the footer basket PEEK is display-only; decide whether the peek itself needs a remove control (Section 7).
- **Nested sticky subcategory headers (V7.6, post-trial)** — a Deliveroo-style swap of subcategory headers within a sticky category band; lower value at truck menu scale and a third sticky layer is fragile. The simple per-subcategory sticky header WAS built (Section 7); this is the richer nested version only.

- **Venue matcher enhancements — `venue_id` is now in place (V6.6); two enhancements remain** — (1) a **confidence flag SURFACED in the approval queue** so a `venue_match_confidence='low'` guess is flagged to the truck at approval; (2) a **history-prior tie-breaker** — rank candidates by the truck's prior CONFIRMED venues (village wins → history → best-pick), with a ≥2-visit floor and anti-reinforcement (confirmed = event-approved, NOT venue-validated; only `venue_id_source IN (operator,manual)` should count as validated). `venue_id` also unlocks trusted-anchor reuse and rename-safety. The single highest-leverage matcher follow-up (Section 25).

- **Venue dedup on venue_id (V6.6)** — the bridge still dedups on the venue_name STRING, so an operator editing venue_name post-confirm can spawn a near-duplicate. Move to dedup on `(truck_id, event_date, venue_id)` with a name fallback (Section 25).

- **venue_match_confidence='none' stores venue_id_source=NULL** — confirm the intended write when no candidate is found (Section 16).

- **Extractor convergence (V6.5)** — route the scraper's inline `hgPrompt` through the shared `buildScheduleExtractionPrompt` (the manage "Import" path already does), so there is one prompt with truth-based `findVenue` rather than two. The manage prompt trusts the LLM for postcode (hallucination risk); the scraper has truth-based findVenue — converge on the stronger combination (Section 3 / Section 24).

- **Systemic logo fallback — order-page half DONE (V7.5), profile half STILL OPEN.** The order page (`/api/menu`) now falls back to `discovery_trucks.logo_url` when `trucks.logo_storage_path` is null (null-gated, via the shared `lib/image-utils.ts` `formatImageUrl`), so it matches the profile — DONE this session (Section 14). The reverse is still open: the public **profile** reads `discovery_trucks.logo_url` ONLY and does NOT fall back to `logo_storage_path` when that is null, so a truck that uploaded a logo in Settings but has a null discovery `logo_url` still shows blank on its profile. Make the discovery/profile mapping fall back to `logo_storage_path` when `logo_url` is null (Section 14). No other surface currently needs the order-page fallback — flag here if one appears.

- **"Old School" + "Platform One Café" venue cleanup (V6.5)** — EYEBALL flags from the reresolve run: confirm "The Old School" resolves to the Great Cornard centre, and merge the duplicate "Platform One Café" venue rows (canonical row, variant as an alias in BOTH Supabase and the Sheet) (Section 25).

- **Rename-safety for stock (V6.5)** — per-event stock keys on `item_name` because orders carry no item id. Renaming an item propagates the display name but orphans a per-event OVERRIDE row keyed on the old name. The proper fix carries `item_id` on order lines so ceiling and sold count key on id; deferred (Section 30).

- **Cron-health alert (V6.6)** — a check (home: the daily scraper or a tiny scheduled function) that `cron.job_run_details` shows a recent SUCCESSFUL `heartbeat-monitor` and `auto-event-scheduler` run, emailing Dominic via Brevo if a scheduler has gone silent — so the next dead-Vault-secret (Section 11) surfaces instead of failing silently.

- **Merge Business contact + Customer contact into one "what the customer sees" box (V6.4)** — Settings shows a Business contact box and a separate Customer contact box that doesn't display the resolved detail. Combine into one section showing the resolved contact as the customer sees it, driven by `preferred_contact_method` (Section 18).

- **Per-category "apply kitchen capacity limit" tickbox (V6.4)** — replace the inferred "instant items don't count" rule with an explicit per-category opt-in (Section 6 / Section 14).

- **Per-event operating overrides (V6.6, deferred; extended V6.7)** — make kitchen_capacity, capacity_window_mins, time_selection_enabled, slot cadence, and auto_accept optionally per-event-overridable (festival vs quiet pub). These are set-once operating modes, NOT cross-event contamination, so they remain truck/van-scoped (V6.7 added `capacity_window_mins` to this same van-global set). Busy-night flexibility is served by the EXISTING dashboard mid-event capacity edit (change the items number live) — do NOT fork a window-only per-event path; this stays the single parked override item (Section 5 / Section 6).

- **Shared-equipment capacity model (V6.4)** — the oven-occupancy projection assumes INDEPENDENT equipment; for a truck sharing one oven/fryer it runs optimistic. Flag when a multi-category shared-equipment truck onboards (Section 6).

- **Order-copy vs notification email format (V6.4)** — an order reportedly went to the truck in the wrong email format; diagnose which path sent which template before changing.

- **KDS pause badge event-sourcing (V6.6)** — the KDS pause badge reads `truck.paused_until` (now null after the move to truck_events); event-source it like the dashboard badge (Section 9 / Section 5).

- **Remove dead slot code (V6.4)** — `getSlotIndicator` / `lib/slot-indicator.ts` and the vestigial `slot_capacity` cache no longer drive the operator dots or placement. Slim once the trial baseline is committed — do NOT remove mid-stack. Likewise the legacy `item_overrides` / `category_stock` tables (Section 30) and the vestigial van/truck pause columns (`trucks.paused_until`, `truck_vans.paused_until`/`online_paused_until`, `trucks.extra_wait_*` — Section 5) are unused by live paths but kept for rollback — remove together post-trial.

- **Retire the dormant Twilio WhatsApp handler and delete formatWhatsAppOrder dead code (V6.3)** — Meta Cloud API is canonical (Section 20).

- **Messenger + Instagram per-truck OAuth (parked, V6.3)** — page-id / account-id / encrypted-token columns, OAuth callback routes, ENCRYPTION_KEY (AES-256, lib/crypto.ts), send API, classifier wiring, then Meta app review (needs privacy policy + terms first).

- Stripe Connect integration (upgrade buttons currently email support).

- Refunds process — event cancellation cancels orders and emails customers but does not yet refund.

- Multi-device session enforcement (kds_sessions exists, logic pending).

- Stage B offline; proper post-trial login. Native Capacitor wrapper + Stage A offline cache + offline detection banner + background sound + screen wake (all POST-TRIAL as of V6.6 — Section 11).

- Operator UI pause-state reload — superseded by the V6.6 event-scoping; confirm all reload paths read the event's pause, not truck_vans/trucks.

- orders.ready_time column — store the calculated collection time at submit for tighter ASAP cancellation control post-trial.

- Basket persistence across a manual browser refresh (V6.6 keeps the basket through pause "Check again" but it's still in-memory only; localStorage/session persistence deferred — Section 7).

- Schedule tab map panel — latitude/longitude are already stored on truck_events; show event locations on a desktop map alongside the schedule list.

- FAQ / help page; HatchGrab logo asset at public/logos/hatchgrab-logo.png.

- QR-with-logo scan test.

- Allergen onboarding flow: prompt operator per-category allow_notes toggle at signup.

- Loyalty stamp cards V1 build (Max only) — when instructed.

- Branded QR code implementation.

- password_reset_tokens cleanup job.

- slot_capacity.max_orders → max_batches rename.

- is_instant boolean on menu_categories — to make zero-prep items explicit rather than inferred from prep_secs.

- Per-item spice level (LOGGED, post-trial enhancement): optional 1-3 scale (mild/medium/hot) per menu item, for trucks that want it. SCHEMA: nullable spice_level column on menu_items_db (smallint 1-3, NULL = not set / not applicable). CRITICAL modelling rule (the allergen lesson, lower stakes): NULL means ABSENT, never 'mild/level 0' — a drink/salad with no spice level shows no chilli indicator and the AI says nothing about spice; an unset item likewise. Do not let NULL collapse to a value. UI: optional field in the menu editor, off by default; a chilli indicator on the customer menu only when set; invisible for trucks that don't use it. AI BENEFIT: once it's a field, the tier-3 WhatsApp answerer's payload gains spice, so 'is the X spicy?' becomes a GROUNDED answer instead of the current redirect — this is the first use of the answerer's generic-field upgrade path (payload reads menu fields generically, so adding the column flows through with no answerer rework). Build: column + menu-editor input + customer-menu display + add to the menu API select + add to the tier-3 payload + update the prompt's 'ungroundable attribute → redirect' rule to ALLOW spice when present. Not a fix, not trial-blocking.

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

- iPad printer model (Star Micronics vs Epson) — affects Capacitor native module (post-trial).

- Truck-level vs operator-level billing in Phase 2.

- Loyalty redemption UX.

## Resolved this session (V6.6)

- **Pause / extra-wait cross-event bleed** — DONE: moved onto truck_events (event-scoped), van/truck columns vestigial (Section 5).

- **Schedulers dead (auto-close + offline auto-pause never firing)** — DONE: the deleted Vault `service_role_key` secret restored; both pg_cron jobs succeeding; heartbeat-monitor on 30s (Section 11).

- **Customer basket wiped by pause "Check again"** — DONE: refetch-in-place instead of `window.location.reload()`; basket kept read-only while paused (Section 7).

- **venue_id missing on truck_events** — DONE: column + source + confidence added; shared matcher stamps it; live-verified 8/8 (Section 25 / Section 16).

- **Stale scraped events on HatchGrab profiles** — DONE (TEMPORARY): `isHG ? []` suppression; durable per-truck state machine parked (Section 7 / Section 15).

- **Per-event stock UI rough edges + no follow-category** — DONE: input-revert draft, mobile/16px/numeric, per-event keyed maps (kills flash), `no_item_cap` follow-category, chrome removal (Section 30).

## Resolved earlier (V6.5)

- **Items-based slot capacity display + kitchen_capacity = items** — DONE V6.4 (Sections 6 and 10).

- **Village-aware venue matching in inbound-schedule** — DONE V6.5: the `findVenue` rebuild (token-overlap + village-rank + best-effort); V6.6 extracted it to lib/venue-matcher.ts and added venue_id (Section 25).

- **Cross-event sold-out bug** — DONE V6.5: per-event sparse-override stock (Section 30).

- **Operator events dormant on both domains** — DONE V6.5: phantom `is_test` removed from the discovery/events branch, branch revived and visibility-gated (Section 15).

- **Orphaned `event_id: NULL` order** — DONE V6.4: cancelled by `order_key`.

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
- **EXEMPT (no limit)** — /api/dashboard/action, /api/orders/submit, /api/webhooks, /api/admin, /api/events/manage, /api/events/action, /api/events/affected-orders, /api/inbound-schedule, /api/heartbeat.

> **RULE** — Any new route handling authenticated operator actions or order placement is EXEMPT by default. Only add a route to STRICT if it serves public bulk-scrapeable data and nothing else.

> **NOTE (V6.5)** — the discovery/events route is on the STRICT tier and is the same route whose operator branch was revived (Section 15) and whose HatchGrab scraped-suppression was added (V6.6, Section 7). The behavioural changes change what the route returns, not its rate-limit tier — STRICT still applies and ordering stays exempt.

> **SECURITY NOTE** — the Upstash REST token was pasted in chat during setup; rotate it before trial (Section 27).


# 30. Per-event stock — the sparse-override model (V6.5, extended V6.6)

> **CRITICAL ARCHITECTURE — do not undo.** Stock is now scoped to the EVENT, held as a SPARSE override over the live Settings default. Conflating stock back to truck-level (the pre-V6.5 model) reintroduces the cross-event sold-out bug that this section exists to prevent.

## The bug this replaced

Before V6.5, stock was **truck-level** and **date-level** while only the SOLD count was event-scoped — a structural mismatch:

- `item_overrides` was keyed `truck_id + item_name` (NO event scope). A manual sold-out toggle or a manual stock-ceiling edit wrote a truck-wide row.
- `category_stock` was date-scoped.
- `enforceStockLimits` (organic sell-through) wrote a truck-wide `available = false` when an item sold through.

So three independent leak vectors — manual toggle, manual ceiling edit, and auto sell-through — all made an item that was sold out (or sold through) on ONE event show sold out on EVERY event. Observed as "BBQ Chicken Pizza sold-out on two different events".

## The model

Two additive tables hold a per-event **override** that exists ONLY when the dashboard has edited stock for that specific event:

- **`event_item_stock`** — PK `(event_id, item_name)`. Columns: `event_id` (uuid, FK `truck_events(id)` on delete cascade), `item_name` (text), `stock_count` (int nullable — the per-event ceiling override), `available` (boolean nullable — the per-event sold-out override), `no_item_cap` (boolean default false — V6.6).
- **`event_category_stock`** — PK `(event_id, category)`. Columns: `event_id` (uuid, FK), `category` (text), `stock_count` (int nullable).

Both are RLS service-role only.

### The read formula (the core invariant)

> **FORMULA** — effective ceiling = `event_item_stock.stock_count` **(if an override row exists for this `event_id` + `item_name`)** `?? menu_items_db.default_stock` **(live from Settings)**. A row with **`no_item_cap = true` (V6.6)** resolves the ceiling to **null** — "no individual cap this event, follow the category pool" — regardless of stock_count/default.

- An un-edited event has NO override row, so it reads the **live Settings default** — which means a Settings>Menu change to `default_stock` (or an item rename) **PROPAGATES to every future event** (confirmed AND unconfirmed). This propagation requirement is exactly why the model is sparse-override and NOT eager-snapshot (a snapshot at event-creation freezes the default and breaks propagation — an eager-snapshot first attempt was built and then unwound; see below).
- A per-event edit writes an override row, isolating that event from Settings and from every other event.
- A **missing override row falls back to `default_stock`** — never to accidental-unlimited, and never to 0.

### no_item_cap — follow the category pool (V6.6)

> **RULE (V6.6)** — `stock_count = null` and `no_item_cap = true` are DISTINCT, disambiguating an overloaded null:
> - `stock_count = null`, `no_item_cap = false` → "use the live Settings default" (the un-edited / reset state).
> - `no_item_cap = true` → "this item has NO individual cap THIS event → its ceiling resolves to null → it follows the CATEGORY pool" (`event_category_stock` / the category default), exactly as an item with no per-item stock configured does.
> Honoured in ALL THREE ceiling readers (lib/stock-guard.ts, lib/stock-availability.ts `enforceStockLimits`, and the menu-API / `get_stock` dashboard read). `get_stock` MUST surface `no_item_cap = true` rows even though they carry `stock_count = null` (they would otherwise be filtered as "no override"). `set_stock` accepts a `noItemCap` flag. Ceiling parity was verified: `{stock_count:null}` → 25 (default) vs `{no_item_cap:true}` → null (follow category) — no collision. UI: an empty box = follow category, a number = cap, retype the default to reset.

### Availability is an AND-composition

> **FORMULA** — available = `(menu_items_db.is_available !== false)` `&& (override ? override.available !== false : true)` `&& (stockRemaining === null || stockRemaining > 0)`.

The override can only **RESTRICT** — it can never re-enable an item the Settings base has disabled. This preserves "Settings unavailable = unavailable everywhere". The item **NAME** is always read live from `menu_items_db.name`.

### The oversell invariant — same key for ceiling and sold count

> **RULE** — The effective ceiling and the sold count MUST be read by the SAME `event_id`. The sold count (`getLiveItemCounts`) is name-keyed off the FROZEN order-line names (orders carry no item id — Section 18a / the rename-safety backlog), so the override is also name-keyed (`item_name`), keeping ceiling and sold on the same key. The menu-API ceiling read (`/api/menu/[truckId]`) and the stock-guard ceiling read (`stock-guard.ts`) both read `event_item_stock` by the same `event_id` as the sold count. Proven on real data: White Lion event ceiling 25, The Oak event 25 − 20 sold = 5 — cross-event isolation holds.

## The phases (all built, tsc-clean, e2e pending)

- **Phase 1 — migrations.** `20260611_event_item_stock.sql` + `20260611_event_category_stock.sql`; plus `20260612_event_item_stock_no_item_cap.sql` (V6.6). Applied in chunks, verified, schema reloaded.

- **Phase 2 — UNWOUND.** The first attempt was an **eager snapshot** (143 item + 55 category rows backfilled at event creation). It was deleted because it freezes the Settings default and breaks propagation. The unwind: DELETE all eager rows; migrate BBQ's truck-level `item_overrides = 25` into `menu_items_db.default_stock = 25` and delete the `item_overrides` row; strip the `snapshotEventStock` calls from the bridge and manual-create; delete `lib/event-stock-snapshot.ts` and `scripts/backfill-event-stock.ts`.

- **Phase 3 — oversell-critical reads.** The menu-API ceiling and the stock-guard ceiling read `event_item_stock` by the same `event_id` as the sold count (the invariant above).

- **Phase 4 — enforceStockLimits event-scoped.** `enforceStockLimits` (lib/stock-availability.ts) reads sold by `event_id` and writes `event_item_stock.available = false` per-event, never clobbering `stock_count` and never writing a truck-wide flag. The enforce ceiling equals the guard ceiling.

- **Phase 5 — dashboard writes the override.** `set_stock` / the sold-out toggle / `set_category_stock` write a per-event override into `event_item_stock` / `event_category_stock`, using the dashboard's existing `selectedEventId` / `selectedEventRef`. `set_stock` re-enables an item on a stock raise and accepts `noItemCap` (V6.6); the toggle preserves the ceiling. Display reads (`get_stock`) are event-scoped and surface `no_item_cap` rows.

## UI completion (V6.6)

> **RULE (V6.6) — four stock-UI fixes (all client-side on the dashboard Menu & Stock tab):**
> 1. **Input-revert draft pattern** — each stock input holds a LOCAL draft from focus; commits on blur/Enter; reverts on Escape. Kills the "type a digit, it reverts" bug (the input was bound straight to server state, and a realtime tick clobbered mid-type).
> 2. **Mobile sizing** — inputs widened, `inputMode="numeric"`, 16px on mobile (iOS auto-zoom rule, Section 23).
> 3. **Per-event keyed maps + stale-while-revalidate** — stock state is re-shaped to maps keyed by event, so switching events shows skeletons then the correct event's numbers, never a flash of the previous event's stock (a structural fix, not a guard).
> 4. **Chrome removal** — the blue "default" label and the "reset to default" link were removed (chrome only — behaviour unchanged: empty box = follow category, a number = cap, retype the default to reset). `isDefault` is kept (it drives the input border/tooltip); the orphaned `showReset` was removed.

## What is NOT built

- **Two-device oversell e2e — DONE (V7.8) [LIVE-VERIFIED] (Section 26 / Section 27)** — Test 2 (sell-through isolation) and Test 3 (concurrent oversell race, exactly one succeeds) on hatchgrab.com with two same-date events were operator-confirmed this session. STILL PENDING: a live `no_item_cap` follow-category check.

- **Availability auto-reset on cancel (PENDING — Section 27)** — Phase 4 left the `available = false` flip manual-only; a cancellation frees stock but leaves the item stuck sold-out. Mirror the capacity path (`rebuildProductionSlotUsage` on cancel) for availability.

- **Rename-safety (PENDING — Section 27)** — keying on `item_name` orphans an override row when the item is renamed; the proper fix carries `item_id` on order lines so ceiling and sold count can key on id.

## Legacy tables

`item_overrides` and `category_stock` are now UNUSED by live read/write paths but are LEFT IN PLACE for rollback safety. Remove them post-trial together with the other dead slot code (Section 27).

## Deal stock interaction

A deal hides on the customer page when its slot's only item is sold out — and as of V6.5 that resolves **per-event** through the sparse-override read, not truck-wide (Section 8 / Section 17).

# 31. Slot & Capacity Engine — CANONICAL MODEL (AUTHORITATIVE — read before touching)

<!-- ============================================================ -->
<!-- SLOT & CAPACITY ENGINE — CANONICAL SPEC                       -->
<!-- Added after the 16-17 Jun 2026 capacity saga.                -->
<!-- READ THIS BEFORE TOUCHING: slot-bookings, slot-availability,  -->
<!-- slot-display, slot-generation, collection_times,             -->
<!-- production_slot_usage, ASAP, traffic-lights, or ready-time.   -->
<!-- This section is AUTHORITATIVE. If code contradicts it, the    -->
<!-- code is wrong. If a prior chat's reasoning contradicts it,    -->
<!-- the reasoning is wrong.                                       -->
<!-- ============================================================ -->

## THE SLOT & CAPACITY ENGINE — canonical model (do not reinterpret)

### The one-paragraph model
5-minute **collection slots are a SELECTION CONVENIENCE ONLY** — easy times for the customer/operator to pick. They are NOT cooking units. **Cooking capacity is the ENGINE's job**, handled by a rolling backward-fit/sweep-line over prep-length windows, constrained by two ceilings (batch + kitchen capacity). **There are NO fixed production windows.** A collection slot of 17:05 does not mean "cook in the 17:00–17:10 box"; it means "the customer collects at 17:05, and the engine ensures the food can be cooked to be ready by then."

### The two ceilings (this is the whole capacity model)
Every rolling cooking window (length = prep time, e.g. 5 min) is constrained by BOTH, independently:
1. **Batch (per-category):** max of ONE category per window. E.g. pizza batch 2 = max 2 pizzas cooking at once.
2. **Kitchen capacity (cross-category total):** max TOTAL items of any kind per window. E.g. kitchen capacity 4 = max 4 items total, any mix.

A window is FULL when EITHER ceiling is hit. Both always apply.

**Worked example** (pizza batch 2, dessert batch 3, kitchen capacity 4, prep 5):
- 2 pizzas + 2 desserts = 4 total ✓ (pizza at batch 2; total at capacity 4) — full.
- 1 pizza + 3 desserts = 4 total ✓ (total at capacity 4; dessert at batch 3) — full.
- 2 pizzas + 3 desserts = 5 total ✗ — REJECTED by kitchen capacity (4), even though NEITHER category exceeds its own batch. The cross-category total is what catches this.
- 3 pizzas = ✗ — REJECTED by pizza batch (2), even though 3 < capacity 4. The per-category batch catches this.

### Backward cooking-spread (how an order occupies the oven)
An order's items spread BACKWARD across cooking windows from its collection time, at batch cadence. The engine (`projectBackwardOccupancy`, slot-availability.ts) computes this; it's the authoritative occupancy.

**Worked example** — 3 pizzas, batch 2, prep 5, collected at 17:05:
- numWindows = ceil(3/2) = 2.
- Window ending 17:05 holds the remainder (1 pizza); window ending 17:00 holds a full batch (2 pizzas).
- So: cooking window ending 17:00 = 2 pizzas, window ending 17:05 = 1 pizza.
- The food for all 3 is ready by the 17:05 collection time. The 2 cooked "early" (by 17:00) wait; the engine just ensures throughput.

### STORAGE: production_slot_usage is COLLECTION-SLOT keyed (single times, never ranges)
`buildUnitsFromOrders` (slot-bookings.ts) writes each order's FULL load at its OWN collection_time: `productionSlot = timeMap[ct] || ct`. With `collection_times` empty/identity, the key = the collection_time itself (a single HH:MM like "17:05").
- Correct keys: `17:00`, `17:05`, `17:10` — single times. Each slot's row is independent.
- The backward cooking-spread is a DISPLAY/ENGINE concern computed at READ time from this storage — it is NOT stored. Storage holds "this order, N items, at collection_time T." The engine spreads it backward when computing occupancy/availability.

### collection_times MUST be empty or identity (NEVER range-pooled)
- Correct: `collection_times` EMPTY (like Test Kitchen) → timeMap empty → single-time keys. OR identity (production_slot = collection_time).
- **WRONG (the bug that caused the 16-17 Jun saga):** `collection_times.production_slot` holding RANGE strings like `"17:00-17:10"` that POOL two collection times (17:00 and 17:05) into one row. This pooling is NOT part of the model and must never exist. It made the write produce pooled range keys, breaking ASAP and traffic-lights.
- No in-repo code writes `collection_times` (verified by six audits, 16-17 Jun). It is externally/manually managed. The original Gusto range data (2026-05-06, event_id null, 48 rows) was a one-off stale seed, NOT produced by the scrape OR verify path (both proven to leave collection_times empty). If range data ever reappears, something external seeded it — DELETE it, do not write code to accommodate it.

### TRAFFIC-LIGHT DOTS: read the engine's occupancy, do NOT re-derive
The day-load / slot dots (`buildSlotIndicators`, slot-display.ts) MUST read the engine's backward occupancy — `back.byStart.get(slotMins - step)` where back = projectBackwardOccupancy(...) and step = backwardWindowStepMins(catConfigs). This is the SAME source `buildSlotAvailability` uses, so dots, ASAP, capacity veto, and availability all AGREE.
- Dot tone: category at/over batch ⇒ RED; partial ⇒ AMBER; empty ⇒ GREEN; kitchen-capacity ceiling hit ⇒ RED.
- **Worked example** — 3 pizzas collected at 17:05 (batch 2): dots show 17:00 = 2 (RED, batch ceiling), 17:05 = 1 (AMBER, room for 1), 17:10 = 0 (GREEN). NOT 17:05 = 3.
- **WRONG:** showing raw collection load (17:05 = 3) — that's collection-load, not cooking-load. The dots show what's IN THE OVEN per window, not what's collected per slot.

### ASAP: the engine's load+ceiling-aware earliest slot
ASAP (`earliestBackwardFitSlot` → `fitOrderBackward`) finds the earliest collection slot where the order fits given ALL existing load AND both ceilings. It judges the pre-open lead on COMBINED load (`nwCombined = ceil((existing+new)/batch)`), not the new order alone.
- It accounts for the full queue + both ceilings — so the ASAP slot is the truthful earliest-ready time.

### READY-TIME ("Ready around"): must AGREE with the ASAP slot
"Ready around" is a DISPLAY readout of the actual ready time. It MUST be ≈ the ASAP slot, NEVER later, NEVER contradicting it. Rule (AddOrderPanel.tsx):
- readyTime is anchored to the engine slot (`fitReadyTime` = adjustedAsapSlot.collection_time).
- Show the honest-early ungridded estimate (`queueAware`) ONLY when `queueAwareGridSlot === fitReadyTime` — i.e. the slot is later than the honest estimate purely by GRIDDING (food genuinely done before the gridded mark).
- When load/ceiling pushed the slot later (queueAwareGridSlot ≠ fitReadyTime), ready FOLLOWS the slot.
- **Worked examples:**
  - Empty kitchen, 2 pizzas at 17:08, prep 5 → food done ~17:13, slot gridded to 17:15 → "Ready around 17:13" (honest-early, gridding gap). ✓
  - 17:00 & 17:05 full, add 2 pizzas + 7 desserts → 7th dessert trips kitchen capacity, slot pushes to 17:15 → "Ready around 17:15" (follows slot, NOT the load-blind 17:10). ✓
- **WRONG:** `queueAware` is BLIND to the kitchen-capacity ceiling (it models per-category batch only). Never let "Ready around" show queueAware's value when the engine slot was pushed by load/ceiling — it under-estimates and contradicts the slot.

### THE RECURRING STRUCTURAL LESSON (why this kept breaking)
Every break in this saga was the SAME mistake: a PARALLEL model maintained alongside the engine, which drifted and contradicted it.
- Dots had their own distribution → drifted → wrong dots.
- collection_times pooling was a parallel "production window" model → wrong storage keys.
- queueAware has its own queue model missing the kitchen-capacity ceiling → wrong ready-time.
**THE RULE: the engine (projectBackwardOccupancy / fitOrderBackward) is the SINGLE SOURCE OF TRUTH for capacity, occupancy, and timing. Displays must READ the engine, never re-derive or maintain a parallel calculation.** Any time you find display logic computing capacity/occupancy/timing independently of the engine, that's a bug waiting to happen — make it read the engine instead.

### EXPLICIT "DO NOT" LIST (the exact wrong turns a prior chat took)
- Do NOT introduce "production windows" / range keys / pooling of collection times. There are no fixed production windows.
- Do NOT make traffic-light dots show raw collection load — they show cooking occupancy (engine-derived, backward-spread).
- Do NOT let "Ready around" use queueAware when the slot was pushed by load/ceiling — it's ceiling-blind.
- Do NOT add a parallel capacity/occupancy calculation in display code — read the engine.
- Do NOT write code to "handle" range collection_times data — if it appears, it's bad data; delete it.
- Do NOT pass the submit fit-read's `excludeOrderKey` anywhere but the submit fit-read (V7.8). The placing order excludes ITSELF (by `order_key`, the UUID PK) ONLY on the fit-read path (`placeOrderInSlotLocked` → `getProductionSlotUnits` → `readProductionSlotUnits` → `buildUnitsFromOrders`, adding `.neq('order_key', excludeOrderKey)`), to stop the first-order-into-empty-cache SELF-COUNT (the order, inserted pending/null-slot before the fit, lazily reseeds and counts itself → over-yields one slot). The authoritative write (`addOrderToProductionSlot`, `persistReseed=true`), the full rebuild (`rebuildProductionSlotUsage`), and ALL readers (dashboard/slots/batch) must NEVER pass it — excluding there would UNDERCOUNT and risk an OVERSELL. The param defaults `undefined` (no exclusion = full occupancy). Exclude by `order_key`, never the per-event display id. Orthogonal to the BUG-1 read-only-reseed fix (which stays).
- Do NOT trust "tsc-clean" as done — capacity behaviour must be live-verified with real orders against the worked examples above.

### FILES (the engine vs the displays that read it)
- ENGINE (source of truth): `lib/slot-availability.ts` — projectBackwardOccupancy, fitOrderBackward, earliestBackwardFitSlot, the sweep-line (concurrencyAt/maxConcurrentCount) enforcing kitchen_capacity.
- WRITE: `lib/slot-bookings.ts` — buildUnitsFromOrders (timeMap[ct]||ct, single-time keys), rebuildProductionSlotUsage.
- DISPLAYS (must read the engine): `lib/slot-display.ts` buildSlotIndicators (dots), AddOrderPanel.tsx (ASAP label + ready-time).
- GRID GEN (display-only, never persisted): `lib/slot-generation.ts` generateCollectionTimes.
<!-- ============================================================ -->
<!-- END SLOT & CAPACITY ENGINE SPEC -->
<!-- ============================================================ -->

# 32. Closing note

This manual is living documentation. Update it whenever a new rule is established, a feature behaviour is decided, a DRY violation is identified and fixed, a plan tier feature changes, or a coding convention shifts.

When in doubt about how something should work: check here first. If the answer is not here, work out the right answer, document it here, then implement.

The cost of writing things down is a few minutes. The cost of not writing them down is rebuilding the same decision next week.

HatchGrab Engineering Reference Manual · V7.8
