# Language Phase 1d Part 1 — Manage: Menu, Schedule and Settings tabs into the message files, with their US words

**Status:** built and proven. Not pushed or deployed; everything after the Step 0 commit is uncommitted.

**Step 0:** commit **`756ca09`** "Language phase 2: US English for customer, kitchen, onboarding (checkpoint)", parent **`460ba55`**. Local only. BEFORE was captured on it.
- `.cursor/mcp.json` is included, as you asked. I did not print it; a search for token-like words (token, secret, key, password, bearer, sbp_, eyJ) found none.
- Left out: `docs/reference-manual.md` and `docs/reference-manual-v15-9-report.md` (the V15.9 manual work, not Phase 2) and `supabase/.temp/cli-latest`.

**SQL:** none. **Supabase MCP:** not available in this session, so no queries were run; nothing needed one.

**Garbled spans:** none found. **Contradictions:** none. Two points worth knowing:
1. **A few GB code-level changes.** Your proof line says GB F equals BEFORE except named difference 1. Moving the words forced a few small code-level GB changes. Each is named and proven in the harness's NAMED table (§4):
   - one "Sept" → "Sep" left over from Phase 2 §6;
   - the setup wizard's cancellation row, rebuilt as one whole sentence (rule 2).
2. **No "Monday to Sunday" wording in these three tabs.** It lives only in the Social posts design editor (Part 2), so there was nothing to change.

---

## Summary

| | Result |
|---|---|
| Words moved | **1,253 en-GB messages in 25 new namespaces.** The Manage page's inline strings go from 894 to 208; what remains belongs to the out-of-scope tabs and the shell. 9 more files are now at 0. |
| US words | **106 US overrides added or changed, 4 removed** because they now equal GB. US behaviour: 12-hour hour pickers, ZIP codes with no upper-casing, US address and paste examples, and US dates and times. |
| Named difference 1 | Every in-scope Manage, events and event-types refusal is `{ error, …, code, params }` via the new `manageErrorBody`. `lib/trade-area.ts` now returns codes (`tradeAreaErrorBody`). |
| GB fixes | **130 keys, named, shown in both countries** (Appendix A1). |
| Proof | `language-phase-1d` **282 passed, 0 failed**, deterministic. |
| Other checks | **All pass:** full sweep 124/124 (after one re-pin, §5); tsc clean; next build exit 0; messages-parity 16,384; messages-split 115; ui-literals; language-phase-0 168 · 1a 1,050 · 1b 3,522 · 1c 4,498 · 2 1,124. |
| Out of scope | Payments, Billing, Reports, Team, Social posts, WhatsApp, custom domain and account deletion are proven unchanged: 148 smoke views, GB and US, identical in BEFORE, F and A. |

---

## 1 · What moved

| Namespace | GB messages | US overrides | Surface |
|---|---:|---:|---|
| `manageMenu` | 156 | 1 | MenuTab: editor, categories, items, sub-categories, item modal, allergen section |
| `manageMenuImport` | 150 | 8 | the import and setup wizard (upload → review → extras → allergens → kitchen → schedule → settings → done) |
| `manageAllergens` | 87 | 3 | the allergen wizard, card upload, card-only editor |
| `manageExtras` | 73 | 3 | ExtrasEditor and ModifiersTab |
| `manageDeals` | 40 | 0 | DealsTab |
| `manageUpsells` | 15 | 0 | UpsellRulesSection |
| `manageSchedule` | 77 | 4 | ScheduleTab: list, cards, approvals, conflicts, toasts, Link & QR |
| `manageScheduleEvent` | 54 | 7 | add/edit event, the place picker, address fields, hour pickers |
| `manageScheduleImport` | 49 | 4 | schedule import, paste and review |
| `manageScheduleVerify` | 7 | 1 | the schedule-URL check (`lib/copy/scheduleVerify.ts`) |
| `schedulePlaces` | 34 | 6 | SchedulePlaces |
| `eventTypes` | 69 | 9 | EventTypes (chips, grid, pricing, per-type settings) |
| `privateEvents` | 33 | 3 | PrivateLinkPanel and the operator side of `lib/private-events/copy.ts` |
| `vanFilter` | 4 | 3 | VanFilter |
| `manageSettings` | 184 | 21 | SettingsTab: truck details, contact, order settings, truck settings, schedule settings, QR code |
| `serviceSettings` | 49 | 7 | `lib/copy/serviceSettings.ts` |
| `kitchenCapacity` | 46 | 11 | KitchenCapacitySection / Edit / CategoryRow, `lib/kitchen-capacity.ts`, prep-time units; **one explainer shared by the dashboard and Manage** |
| `offlineProtection` | 15 | 1 | `lib/copy/offlineProtection.ts` |
| `settingsCopy` | 9 | 1 | `lib/settings-copy.ts` |
| `whereYouTrade` | 11 | 1 | WhereYouTrade |
| `managePrimitives` | 5 | 0 | `components/manage/primitives.tsx` |
| `stockCopy` | 1 | 0 | `lib/copy/stock.ts` |
| `errorsManage` | 74 | 11 | Manage, events and event-types refusals (§2) |
| `tradeArea` | 5 | 0 | `lib/trade-area.ts` refusals (§2) |
| `manageApi` | 6 | 2 | other words the routes send (stock warning, events feed, van fallback) |

**How the words are read:** `useT` on the client and `translatorFor` on the server, both in the truck's locale.
- Each reading file imports its catalog (messages-split 115/115).
- All 25 namespaces are in `NAMESPACES.manage`. The dashboard and KDS lists gained those their shared pieces read (`kitchenCapacity`, `offlineProtection`, `serviceSettings`, `privateEvents`, `tradeArea`).

**The rules followed:**
- Whole sentences, with rich-text tags where needed. Examples: the cancellation sentence with its `<select>` inside, the van-billing body, the guessed-venue note.
- ICU plurals, no hand-written ones.
- Dates and times through `lib/time-utils.ts`.
- State set in an effect holds a code: the EventTypes load error, the import modal title, the places load error.

**Copy modules** (`serviceSettings`, `offlineProtection`, `kitchen-capacity`, `settings-copy`, `stock`, `scheduleVerify`, `private-events/copy`): their words are messages now.
- Exports still used by other callers read the en-GB message (`gb(key)`), so there is one source and no second copy.
- Every screen in scope reads them with `useT` in the truck's locale. That includes EventTypes, PriceControls, PrepTimeSelect, ExtrasEditor, and the dashboard's offline-protection and prices cards.
- **Dead constants removed:**
  - `PRIVATE_CHIP`, `LINK_QR_BUTTON`, `PRIVATE_NEEDS_TIMES`, `PRIVATE_PREVIEW_NOTE`;
  - `SETTING_COPY.allowCancellation.cancelPrefix/cancelSuffix`;
  - the scheduleVerify English constants;
  - the old `addressPlaceholders()` / `pastePlaceholder()`.

  Nothing imported any of them any more.

---

## 2 · Named difference 1 — Manage refusals gain `code` and `params`

**The helper:** `lib/i18n/manage-errors.ts` adds `manageErrorBody` and `tradeAreaErrorBody`.
- Both are thin wrappers over the one `errorBody` (`lib/i18n/error-body.ts`, which only gained `'tradeArea'` in its namespace type). There is no copy.
- Rule 1 of `.cursor/rules/language.mdc` now names all four wrappers.

**In scope** (the `MANAGE_TAB_ACTIONS` set in `app/api/manage/route.ts`):
- **Menu:** categories, sub-categories, items, modifiers, upsells, deals, pre-order bulk and the other menu actions.
- **Schedule:** events, private links, exclusion terms, places.
- **Settings:** trade area, settings, truck, vans, van settings, kitchen capacity.
- **Also:** `app/api/manage/{commit-menu,process-allergens,process-menu,process-schedule,verify-schedule-url}`, `app/api/events/*` and `app/api/event-types`.

**Left byte for byte** (Part 2's actions):
- update_charges, the domain_* actions, embed, disconnect_whatsapp, team, get_report, get_recent_events;
- the places-merge actions;
- the WhatsApp reply-limit refusal inside update_truck;
- the GET's own refusals.

**`lib/trade-area.ts` returns codes** (`{ ok:false, code, params }`), and every caller words them with `tradeArea` in the right locale:
- the setup route and `WhereBasedStep`;
- `provisionTruck`;
- the manage route's `update_trade_area`.

Setup's refusals therefore also gain `code` / `params` (named in the Phase 2 harness as `1d-setup-trade-area-codes`), with `error` unchanged.

**Proof:**
- 128 refusal views per country.
- For each one: the BEFORE body is the exact prefix; every field is unchanged and in place; only `code` and `params` are added, last; the message rendered with its params equals `error`; DB writes are identical.
- Codes per route:

  | Route | Codes | Route | Codes |
  |---|---:|---|---:|
  | manage | 65 | event-types | 27 |
  | events/action | 11 | process-allergens | 4 |
  | process-menu | 4 | commit-menu | 3 |
  | process-schedule | 3 | verify-schedule-url | 3 |
  | trade-area | 3 | events/manage | 2 |
  | affected-orders | 2 | events | 1 |

- The API agent's own scratch proof (137 cases × GB and US) gave 2,068 checks with 0 failed.

**Passed through with no code** (not our sentence):
- Supabase and database `error.message`;
- the storage error;
- an exception's text (commit-menu `{reason}`);
- AI output (allergen transcription);
- `lib/private-events/write.ts`'s own errors.

**Refused before the truck is known** (no or bad token, no user): en-GB, as in every earlier phase.

**Two shared actions:** `sg_upsert_place` and `update_truck` / `get_vans` are also called by out-of-scope screens. Their refusals there gain `code` / `params` too, which is purely additive.

---

## 3 · US words and US behaviour

### Words (Appendix A2)
These follow your table and the Phase 2 choices:
- van → truck ("Your trucks", "Same settings for all trucks", "Copy Truck 1’s settings…", "Upgrade to add more trucks"); "That truck isn’t part of this account";
- postcode → ZIP code; "Area (village, town or city)" → "City or town";
- collection times → pickup times; tick → check;
- starters/mains → appetizers/entrées; car park → parking lot;
- the event-type chips Pub → **Bar**, Private hire → **Catering**, "e.g. School fete" → "e.g. School fair";
- TBC → TBD; straight away → right away; "Where are you trading?" → "Where are you serving?"; "Where you trade" → "Where you serve";
- -ize spellings (analyzing, categorizing, customizable, customization, recognized, uncategorized); favorite(s); gray;
- "Tidy up places" → "Clean up places";
- yourtruck.co.uk → yourtruck.com; "fish & chips" → "tacos" in the allergen-card example;
- takings and till → sales and cash register; hatch → window.

**Removed from en-US** because they now equal GB: `goLive.noVan.where`, `nativeShell.setup.goToVans` (GB was fixed to "Settings → Your trucks"), and the two moved dashboard capacity keys.

**Choices beyond the glossary (recorded):**
- **Address words follow the country's address style, not the locale.** They are ICU selects on `{style}` (`zip_state` = US words), so a future country picks its words by address style. That covers "ZIP code"/"Postcode", "e.g. 78701"/"e.g. CB8 8PD", "e.g. 123 Main St, Austin, TX 78701", "e.g. Main Street Brewery" and the paste venue "Zilker Park, Austin". Austin matches the existing US examples.
- "worked out" → "figured out"; "sorted" → "fixed"; "carry on" → "continue".
- "Fruit & veg" → "Fruits & vegetables" (emoji group).
- "pick pickup times" → "choose pickup times".
- "Van not found" → "That truck isn’t part of this account" (as in Phase 2).
- "switched off" kept, as 1a did.

**Stored values are not changed:**
- A saved event type named "Pub" shows as "Pub". Only a **new** US truck is offered "Bar". `TYPE_NAME_CHIPS` are now ids, and a chip only fills the name field.
- `PRIVATE_TYPE_NAME = 'Private'`, the lookup key behind the ilike match and the unique index, is untouched; lookups stay by kind and id.
- Category names, cuisines and van names are shown as stored.

### Behaviour (US only; GB proven identical)
- **Hour pickers:** 12-hour labels "12 AM … 11 PM" when the truck's time format is 12h. Stored values stay "00"–"23".
- **ZIP codes are not upper-cased** in the US (no `uppercase` class, `autoCapitalize="none"`); GB postcodes still are.
- **The paste example** uses the truck's date and clock: US "Saturday, June 14, Zilker Park, Austin, 5:00 PM – 9:00 PM"; GB unchanged.
- **Dates and times through time-utils:**
  - the excluded-imports list (US MM/DD/YYYY);
  - the wizard's schedule read-back (US "06/14/2026", "5:00 PM–9:00 PM");
  - DealsTab times ("11:00 AM – 2:00 PM");
  - the collection-time examples ("6:00 PM, 6:15 PM…");
  - the pre-order rule's cutoff.
- **`summariseType`** says "pickup every N min"; **`vanFilterLabel`** says "All trucks".

---

## 4 · GB named changes (both countries) — 130 keys, Appendix A1

| Kind | Examples |
|---|---|
| Straight ' → ’ and straight " → curly | `serviceSettings.sameSettingsConfirm` (‘Same as Van 1’), `offlineProtection.purpose`, `manageSettings.schedule.manual` "I’ll add events myself", `manageMenu.confirmDelete.*` “{name}”, `errorsManage.*` "Couldn’t…", `tradeArea.country_off` / `zone_unknown`, `manageApi.stockWarning` “{category}” |
| "..." → "…" | Saving…, Checking…, Analysing…, "Tell customers about your food…", "Paste your allergen information here…" |
| Wrong plurals → ICU | "1 items" → "1 item" (menu summary, import offer and review); "1 need(s) your assignment"; "1 dish needs review"; "Up to 1 item suggested"; "1 hidden place matches"; "We found 1 event for you — … before it goes live"; "{name} takes 1 minute to cook" |
| Title case → sentence case | "Contact Details" → "Contact details"; "Customer/Your Collection Times" → "…collection times"; "Offline Order Protection" → "Offline order protection"; "Pause Online Ordering" → "Pause online ordering"; "Custom Extras" → "Custom extras"; "Skip Allergen setup for now" → "…allergen…"; "Extras & Upsells" / "Add Order panel" pointers → the real names |
| Raw ids or field names on screen | 11 refusals ("eventId required", "vanId is required", "trigger_category and suggest_category required", "Missing params", …) → "Something went wrong — refresh the page and try again."; "No order URL — slug not set" → "No order link yet — your truck’s page address isn’t set." |
| Grammar | "Pre-orders requires the Pro plan" → "Pre-orders are part of the Pro plan." |
| "Settings → Vans" → the real heading | `goLive.noVan.where` "Settings → Your trucks"; `nativeShell.setup.goToVans` "Go to Settings → Your trucks"; `nativeShell.setup.noVanBody` "…<b>Settings → Your trucks</b>…" |
| One kitchen-capacity explainer | `kitchenCapacity.desc` / `example` are now read by **both** the dashboard and Manage; the old `dashboard.settings.capacityDesc` / `capacityExample` are removed. Manage's text gains the curly ’ the dashboard already had. `example` also fixes "set Total Capacity … and select Starters and Mains tickbox" → "set Total capacity … and tick the Starters and Mains boxes" on both screens. |
| Spelling consistency (GB) | "Uncategorized" → "Uncategorised" in ExtrasEditor and the event-types pricing grid, matching the allergen wizard; the US keeps "Uncategorized". |

**Named GB code-level changes** (in the harness's NAMED table, each proven precisely):
- **SchedulePlaces date: "Tue 1 Sept" → "Tue 1 Sep"** (September only, 14 views). It now goes through `formatShortDate`, the item Phase 2 §6 left.
- **The setup wizard's cancellation row is one sentence** (`settingsCopy.allowCancellation.sentence`, with the select as a rich tag) instead of prefix + select + suffix in three flex items.
  - Same words, one inline line (2 views).
  - The select's aria-label "Allow customers to cancel orders — Customers can cancel up to" → "How long before pickup customers can cancel".
  - The Settings tab's own cancellation row is byte-identical in GB.

**Where the shared fixes show:** the copy modules are shared, so their fixes also appear on the dashboard (offline card, capacity warning and explainer) and the Event types grid. Those surfaces' harnesses (1b, Phase 2) run on frozen words plus the as-moved overlay, so they still prove the move itself was invisible.

---

## 5 · Proof

### The method: Phase 2's, extended
- **BEFORE:** captured on 756ca09 in a clean worktree, twice, byte-identical (1,154 views: GB 577, US 577).
- **F** = current code with the **756ca09 words**: en-GB **and** en-US (Phase 2's 213 overrides), plus an **as-moved overlay** (`scripts/fixtures/language-phase-1d-gb-moved.json`).
  - Every GB fix was written through a helper that records the words **as moved**, so F shows today's words and proves the move invisible.
  - **A** = current code with current words.
- **The overlay applies in every harness's frozen mode** (0, 1a, 1b, 1c, 2, money-sweep and the rest), so the older harnesses keep proving exactly what they proved.

### `scripts/language-phase-1d.cjs` — 282 passed, 0 failed (≈2 s warm, ≈20 s cold; two runs identical)
**Areas:** menu 152, schedule 184, settings 170, copy 304, api 296, smoke 48.

**GB · F vs BEFORE:**
- 360 views byte-identical;
- 128 refusals differ only by `code` / `params`, proven per field;
- 15 equal BEFORE plus a named change.

**GB · A vs F:**
- 128 en-GB keys changed text; 111 reach a rendered view.
- Every changed word is explained by a changed key.
- The changed-key set equals `scripts/fixtures/language-phase-1d-gb-named.json` (130 keys, including the 2 removed dashboard keys); any unlisted change fails.

**US · F vs BEFORE:** 285 identical, 128 refusals with only code/params added, 1 precise named change, and 89 views listed under the named US behaviours.

**US · A vs BEFORE:** **316 of 503 in-scope US views change**, each with its cause in `scripts/fixtures/language-phase-1d-us-changed.txt`:

| Area | Changed / US views |
|---|---|
| api | 127/149 |
| menu | 62/76 |
| schedule | 71/92 |
| settings | 28/37 |
| copy | 28/152 |

By cause: 128 code/params, 98 words only, 90 named US code changes.

**US-words check** on 371 US views:
- Phase 2's list, plus: postcode, "village, town or city", car park, pub, private hire, fete, tick, TBC, straight away, trade/trading, "do you do", -ise words, colour / centre / favourite / grey / licence, co.uk, 💷, starters/mains, fish & chips / jacket potato / pie & mash, "week commencing".
- **0 to fix.** The allowed hits, each with its reason:

  | Word | Hits | Reason |
  |---|---:|---|
  | van | 266 | van names stored in fixtures or typed ("Van 1", "Big van") |
  | pub | 76 | a saved event type named "Pub" (stored; new US trucks are offered "Bar") |
  | UK foods | 69 | the cuisine list: stored values, outside this phase |
  | Mains | 26 | a category read from the operator's own menu |
  | Unauthorised | 14 | refused before the truck is known, so there is no country |
  | other stored or brand values | 4 | "Village Hall" venue, the "Village Foodie" brand, the "Starter" plan, a saved "Meal deal" |

**Out of scope:** 148 smoke views (GB and US) are identical in BEFORE, F and A. They cover:
- Payments, Billing, Reports, Team, Social, WhatsApp, custom domain and account deletion;
- Settings' Auto-replies and Account deletion sections;
- four out-of-scope refusals.

### Client JS per page (gz KB, built before and after)

| Page | Before | After | Change |
|---|---:|---:|---:|
| **/manage/[token]** | 473.8 | 488.1 | **+14.3** |
| /dashboard/[token] | 389.4 | 391.8 | +2.4 |
| /dashboard/[token]/kds, /kds/[kds_token] | 246.0 | 246.8 | +0.8 |
| /admin | 401.0 | 401.8 | +0.8 |
| /trucks/[slug]/order | 244.5 | 245.1 | +0.6 |
| /setup | 179.2 | 179.7 | +0.5 |
| every other page | | | +0.1 to +0.2 |

**Why Manage grew:** its 25 new namespaces in both languages come to 22.8 KB gz of precompiled messages, against the inline literals they replaced.

**Why the others grew:**
- **Dashboard and KDS:** they now carry the shared kitchen-capacity, offline-protection and service-settings words in both languages.
- **The rest (+0.1–0.2):** the `tradeArea` namespace and the small growth of shared i18n modules.

### Other checks
- **Full sweep:** 124 run, 123 passed; `seed-demo-grid` failed to compile in its first broken variant. Its temp copy of `lib/` needed `messages/` (the other four variants already copied it). I re-pinned that line and the harness passes. The full sweep was **not** re-run after that one-line harness fix.
- **messages-parity 16,384** (AREAS before: 1a, 1b, 1c, 2; after: 1a, 1b, 1c, 2, **1d**). The new `_messages-parity-1d` checks:
  - moved messages (as moved) equal what BEFORE rendered;
  - en-US keys exist in en-GB and differ, with the same ICU arguments;
  - the GB named list matches.

  Its checker unescapes `\n`, `\'` and JSX entities.
- **messages-split 115**, **ui-literals** (baseline lowered in 9 files):
  - `app/manage/[token]/page.tsx` 894 → 208;
  - EventTypes 48 → 0, ExtrasEditor 44 → 0;
  - KitchenCapacitySection 20 → 0, KitchenCapacityEdit 9 → 0;
  - SchedulePlaces 15 → 0, primitives 5 → 0;
  - VanFilter 3 → 0, PrivateLinkPanel 2 → 0.
- **language-phase-0** 168 · **1a** 1,050 · **1b** 3,522 · **1c** 4,498 · **2** 1,124 (A now runs on the 756ca09 words, its own end state).
- **`npx tsc --noEmit`:** clean. **`next build`:** exit 0.
- **ESLint** per rule against 756ca09:
  - **no rule count grew in any product source file**;
  - harness `.cjs` files grew only in `@typescript-eslint/no-require-imports`, as every CommonJS harness does;
  - one new `no-unused-expressions` warning in `private-events.cjs` was fixed.
- **One real fault the sweep caught and I fixed:** a comment in the new `lib/i18n/manage-errors.ts` ended in `app/api/events/*`, which opens a block comment for `design-fonts`'s code reader. It is now `app/api/events/…`, and design-fonts passes 87/87.

### Re-pins (each named in its file with "⚠️ RE-PINNED (Language Phase 1d)")
- **Frozen-words switch and older language harnesses:**
  - `_lp2-frozen.cjs`: pair mode (en-GB + en-US) and the as-moved overlay in every frozen mode.
  - `language-phase-2.cjs`: A on the 756ca09 words.
  - `_lp2-named.cjs`: three entries — setup's trade-area codes, the setup-step fixture now taking real refusals, and Phase 2's US schedule card "Add a ZIP code".
  - `_lp1c-setup.cjs`: refusal fixtures.
- **Copy and source pins:**
  - `messages-parity` (new 1d area);
  - `demo-seed-parameters` and `seed-demo-grid` (their temp copy needs `messages/`).
- **Signup, phone and readiness:**
  - `signup-country`: trade-area codes plus their rendered words; `whereYouTrade.countryLocked`.
  - `phone-parity`: Manage now passes the truck's locale.
  - `_phase3-screens-us`: three bounded checks replace one byte comparison.
  - `_us-readiness-us`: the address helpers now live in messages; the US paste example is named.
- **Collection times and kitchen capacity:**
  - `slot-interval-settings`, `slot-interval-van-list-tolerance`, `slot-interval-event-override`, `collection-times-hint`: the Manage sentence is now a message; equality with the dashboard's line is proven by rendering 2–120 minutes.
  - `van-category-settings`, `capacity-move-identity`.
- **Schedule, places, private events and event types:**
  - `weekly-post`;
  - `schedule-graphics-places`, `places-tab`, `places-posts-gating`;
  - `private-events`;
  - `event-types`, `event-types-render`.
- ⚠️ **Three checks are weaker than before** (stated by the agent that re-pinned them):
  1. `schedule-graphics-places` "NO LINE…LOST" now excuses a line 1d removed in a hunk that adds a message read. A real code loss inside such a hunk would be missed; the words themselves are proven by language-phase-1d.
  2. Its variant W32 can count as caught without its mutation. That was already true at 756ca09.
  3. `places-posts-gating` used to prove one shared "Private event" symbol. It now proves two equal strings and no US override.
- **Side effect:** running `event-types-render` rewrites the PNGs in `docs/screenshots/event-types/` (12 files now show as modified). They show the current render, including the curly-quote footer.

---

## 6 · Decisions recorded
1. **US address words chosen by the country's address style** (`{style}` select), not by en-US overrides (§3).
2. **Copy-module exports** read the en-GB message (one source). Screens read `useT` in the truck's locale.
3. **One kitchen-capacity explainer** in `kitchenCapacity`, read by both the dashboard and Manage.
4. **Whole sentences around a control.** The wizard's cancellation row became one sentence: a small GB layout change, named.
5. **Event-type chips are ids.** New US trucks are offered Bar / Catering; saved names are untouched.
6. **Fixed two trade-area sentences' straight apostrophes** (`country_off`, `zone_unknown`) as GB fixes for consistency. They show in setup too, named in the Phase 2 harness.
7. **The ManagePage shell** (tab bar, shell toasts and notices) is left for Part 2 with the other tabs.

## 7 · Listed for later
1. **Part 2:** Payments (TakingPaymentPanel's "takings… till", "Mark paid & collected"), Billing, Reports (its `vanFilterLabel` call and CSV stay GB), Team, Social posts / design editor ("Monday to Sunday", colour, centre, "Sept"), WhatsApp, custom domain, account deletion, and the shell.
2. **Still inline on in-scope screens** (stored data or no US difference):
   - default modifier-group names written by the import ('Protein', 'Size');
   - the "Contains: / May contain:" lines saved into `allergen_info_text`;
   - `formatPrepSecs` on the Manage window select passes no locale (same units in the US);
   - `.toUpperCase()` on schedule card day and month (rule 4);
   - `localeCompare(…, 'en-GB')` for sorting places.
3. **Rule 6:**
   - the dashboard compares a display name with `PRIVATE_PUBLIC_NAME`;
   - the reject and event-cancel reasons still use the label as the select value (separate fix, as you said).
4. **Duplicates to join:**
   - `manageMenuImport.schedule.blockedDomain` = `manageScheduleVerify.blockedDomain`;
   - `errorsManage.private_needs_times` = `privateEvents.form.needsTimes`.
5. **Unused copy:** `lib/event-conflicts.ts` `CONFLICT_MESSAGES` (Manage now reads `manageSchedule.conflict.*`); `PRIVATE_TICK_LABEL`, `PRIVATE_TYPE_PICKER_LOCKED`, `SCRAPED_PRIVATE_HINT`; `SCHEDULE_SECTIONS.label`.
6. **Click-time toasts and handler messages** are moved and checked as messages, but the harness renders states, copy outputs and API bodies, not every click.
7. **AI-read menus** still use UK standard categories ("Starters", "Mains") for a US truck (rule 10).

## 8 · Files
**Product code:**
- **Manage page:** `app/manage/[token]/page.tsx` (Menu, Schedule and Settings functions and imports only).
- **Components:**
  - `components/manage/{EventTypes,ExtrasEditor,KitchenCapacitySection,KitchenCapacityEdit,KitchenCapacityCategoryRow,PrivateLinkPanel,SchedulePlaces,VanFilter,WhereYouTrade,primitives}.tsx`;
  - `components/shared/PriceControls.tsx`, `components/PrepTimeSelect.tsx`, `components/setup/WhereBasedStep.tsx`.
- **Dashboard:** `app/dashboard/[token]/page.tsx` (shared explainer, offline and prices cards).
- **Copy modules:**
  - `lib/copy/{serviceSettings,offlineProtection,stock,addressPlaceholders,scheduleVerify}.ts`;
  - `lib/settings-copy.ts`, `lib/kitchen-capacity.ts`, `lib/private-events/copy.ts`.
- **Event types and schedule graphics:**
  - `lib/event-types/{resolve,types}.ts`;
  - `lib/schedule-graphics/{event-preview,places}.ts`.
- **Other lib:**
  - `lib/trade-area.ts`, `lib/menu-extract.ts`, `lib/provision-truck.ts`;
  - `lib/i18n/{manage-errors.ts (new), error-body.ts, namespaces.ts}`.
- **Routes:**
  - `app/api/manage/route.ts` and `app/api/manage/{commit-menu,process-allergens,process-menu,process-schedule,verify-schedule-url}`;
  - `app/api/events/route.ts` and `app/api/events/{action,affected-orders,manage}`;
  - `app/api/event-types/route.ts`, `app/api/setup/route.ts`.
- **Rules:** `.cursor/rules/language.mdc`.

**Messages:** `messages/en-GB.json`, `messages/en-US.json`; generated `messages/ns/**` and `lib/i18n/catalog/*`.

**Harnesses:**
- **New:**
  - `scripts/language-phase-1d.cjs`;
  - `scripts/_lp1d-{fixtures,menu,schedule,settings,copy,api,smoke,words,named,checks}.cjs`;
  - `scripts/_messages-parity-1d.cjs`;
  - `scripts/fixtures/language-phase-1d-{messages-before.en-GB,messages-before.en-US,gb-moved,gb-named}.json`;
  - `scripts/fixtures/language-phase-1d-us-changed.txt`;
  - `scripts/fixtures/language-phase-1d-before/`.
- **Changed:** `scripts/harnesses.json`, `scripts/fixtures/ui-literals-baseline.json`, and the re-pins in §5.

---

## Appendix — generated from the message files, so it matches them exactly

### A1 · GB named changes (130 keys; both countries)

| key | before | after |
|---|---|---|
| `errorsManage.auto_open_close_required` | auto_open and auto_close are required | Something went wrong — refresh the page and try again. |
| `errorsManage.capacity_copy_failed` | The first van's capacity could not be copied right now. | The first van’s capacity could not be copied right now. |
| `errorsManage.category_copy_failed` | The first van's category settings could not be copied right now. | The first van’s category settings could not be copied right now. |
| `errorsManage.clear_first_setup_only` | clearFirst is only permitted on a truck still in setup. | Something went wrong — refresh the page and try again. |
| `errorsManage.event_id_required` | eventId required | Something went wrong — refresh the page and try again. |
| `errorsManage.first_van_copy_failed` | The first van's settings could not be copied right now. | The first van’s settings could not be copied right now. |
| `errorsManage.id_and_item_required` | id and itemId required | Something went wrong — refresh the page and try again. |
| `errorsManage.id_required` | id required | Something went wrong — refresh the page and try again. |
| `errorsManage.ids_required` | ids required | Something went wrong — refresh the page and try again. |
| `errorsManage.missing_params` | Missing params | Something went wrong — refresh the page and try again. |
| `errorsManage.place_add_failed` | Couldn't add that place. | Couldn’t add that place. |
| `errorsManage.place_save_failed` | Couldn't save that place. | Couldn’t save that place. |
| `errorsManage.places_load_failed` | Couldn't load places. | Couldn’t load places. |
| `errorsManage.places_load_failed_migration` | Couldn't load places. If this is new, the schedule-places migration may not be applied yet. | Couldn’t load places. If this is new, the schedule-places migration may not be applied yet. |
| `errorsManage.preorders_pro` | Pre-orders requires the Pro plan | Pre-orders are part of the Pro plan. |
| `errorsManage.schedule_read_failed` | Couldn't read your schedule, so places could not be worked out. | Couldn’t read your schedule, so places could not be worked out. |
| `errorsManage.settings_save_failed` | Couldn't save settings — please try again. | Couldn’t save settings — please try again. |
| `errorsManage.truck_param_required` | truck param required | Something went wrong — refresh the page and try again. |
| `errorsManage.upsell_categories_required` | trigger_category and suggest_category required | Something went wrong — refresh the page and try again. |
| `errorsManage.van_capacity_save_failed` | That van's capacity settings could not be saved right now. | That van’s capacity settings could not be saved right now. |
| `errorsManage.van_category_ids_required` | vanId and categoryId are required | Something went wrong — refresh the page and try again. |
| `errorsManage.van_id_required` | vanId is required | Something went wrong — refresh the page and try again. |
| `eventTypes.phone.vanSetup` | This van's usual setup — used at every event with no type. | This van’s usual setup — used at every event with no type. |
| `goLive.noVan.where` | Settings → Vans | Settings → Your trucks |
| `kitchenCapacity.desc` | The most items your kitchen can turn out at once, across all the categories you've ticked. Each category's own batch size still applies on top. | The most items your kitchen can turn out at once, across all the categories you’ve ticked. Each category’s own batch size still applies on top. |
| `kitchenCapacity.example` | Example: if you can cook 4 mains in 5 minutes, then set it to 4 items every 5 minutes. The total capacity limits orders across all selected categories so if you want to only sell a maximum of 10 starters and mains every 5 minutes, then set Total Capacity to 10 items every 5 minutes and select Starters and Mains tickbox. This will still keep your mains restricted to 4 items every 5 minutes. | Example: if you can cook 4 mains in 5 minutes, then set it to 4 items every 5 minutes. The total capacity limits orders across all selected categories so if you want to only sell a maximum of 10 starters and mains every 5 minutes, then set Total capacity to 10 items every 5 minutes and tick the Starters and Mains boxes. This will still keep your mains restricted to 4 items every 5 minutes. |
| `kitchenCapacity.instantNote` | Instant items don't count towards kitchen capacity — customers receive them immediately. | Instant items don’t count towards kitchen capacity — customers receive them immediately. |
| `kitchenCapacity.warning` | ⚠️ For kitchen capacity to work properly, set a prep time and batch size on your menu categories (Menu & Stock). Without them, capacity can't tell how long items take to cook. | ⚠️ For kitchen capacity to work properly, set a prep time and batch size on your menu categories (Menu & Stock). Without them, capacity can’t tell how long items take to cook. |
| `manageAllergens.cardUpload.matchSummary` | {n, plural, =0 {{matched} matched to a dish.} other {{matched} matched to a dish. {count} need your assignment.}} | {n, plural, =0 {{matched} matched to a dish.} one {{matched} matched to a dish. {count} needs your assignment.} other {{matched} matched to a dish. {count} need your assignment.}} |
| `manageAllergens.wizard.cardPanel.intro` | Customers will see this card as the menu's allergen reference. Per-dish allergens stay hidden in card-only mode (your dish data is kept for if you switch to per-dish later). | Customers will see this card as the menu’s allergen reference. Per-dish allergens stay hidden in card-only mode (your dish data is kept for if you switch to per-dish later). |
| `manageAllergens.wizard.hint.importIncomplete` | Confirm every dish to continue — or “Skip Allergen setup for now”. | Confirm every dish to continue — or “Skip allergen setup for now”. |
| `manageAllergens.wizard.nav.skipImport` | Skip Allergen setup for now | Skip allergen setup for now |
| `manageAllergens.wizard.toast.cardRead` | {n, plural, other {Card read — {matched} matched, {count} need assignment}} | {n, plural, one {Card read — {matched} matched, {count} needs assignment} other {Card read — {matched} matched, {count} need assignment}} |
| `manageApi.stockWarning` | No available items in "{category}" | No available items in “{category}” |
| `manageApi.uncategorised` | Uncategorized | Uncategorised |
| `manageDeals.emptyBody` | Create a bundle deal like "Lunch Deal — any pizza + drink + dip for {price}" | Create a bundle deal like “Lunch Deal — any pizza + drink + dip for {price}” |
| `manageDeals.manualHelp` | This deal won't appear on events unless you enable it in the Schedule tab. | This deal won’t appear on events unless you enable it in the Schedule tab. |
| `manageDeals.saving` | Saving... | Saving… |
| `manageExtras.confirmDeleteGroup` | Delete "{name}"? All options will be removed and it will be unassigned from all categories. | Delete “{name}”? All options will be removed and it will be unassigned from all categories. |
| `manageExtras.emptyBody` | Create a group like "Pizza extras" and add options like "Extra Cheese +{price}" | Create a group like “Pizza extras” and add options like “Extra Cheese +{price}” |
| `manageExtras.matrix.help` | Tick "Include" to add the group to a dish, then tick which options it shows. Saves instantly. | Tick “Include” to add the group to a dish, then tick which options it shows. Saves instantly. |
| `manageExtras.option.allergensHelp` | This option's own allergens (separate from the dish) | This option’s own allergens (separate from the dish) |
| `manageExtras.saving` | Saving... | Saving… |
| `manageExtras.title` | Custom Extras | Custom extras |
| `manageExtras.uncategorized` | Uncategorized | Uncategorised |
| `manageMenu.allergens.needReview` | {count, plural, one {# dish} other {# dishes}} need review — customers can't see allergen info until confirmed | {count, plural, one {# dish needs} other {# dishes need}} review — customers can’t see allergen info until confirmed |
| `manageMenu.allergens.pastePlaceholder` | Paste your allergen information here... | Paste your allergen information here… |
| `manageMenu.allergens.reading` | Reading allergen information... | Reading allergen information… |
| `manageMenu.category.prepHelp` | Set to Instant for items like drinks or dips. These won't count toward kitchen capacity. | Set to Instant for items like drinks or dips. These won’t count toward kitchen capacity. |
| `manageMenu.confirmDelete.empty` | Delete "{name}"? This cannot be undone. | Delete “{name}”? This cannot be undone. |
| `manageMenu.confirmDelete.withItems` | Delete "{name}"? This will also delete {count, plural, one {# item} other {# items}} in this category. This cannot be undone. | Delete “{name}”? This will also delete {count, plural, one {# item} other {# items}} in this category. This cannot be undone. |
| `manageMenu.deleteItem.body` | This item will be hidden from your menu immediately. It won't appear on the customer order page or in the Add Order panel. | This item will be hidden from your menu immediately. It won’t appear on the customer order page or in the Add order panel. |
| `manageMenu.empty.note` | Works with photos, screenshots, PDFs and plain text. You can review and edit everything before it's saved. | Works with photos, screenshots, PDFs and plain text. You can review and edit everything before it’s saved. |
| `manageMenu.item.noGroups` | No option groups yet — create them in Extras & Upsells. | No option groups yet — create them in Extras & upsells. |
| `manageMenu.newCategory.notesHelp` | Lets customers add a note to each item (e.g. "no onion"). The truck can always add item notes regardless. All orders also have an order-level notes field. | Lets customers add a note to each item (e.g. “no onion”). The truck can always add item notes regardless. All orders also have an order-level notes field. |
| `manageMenu.saving` | Saving... | Saving… |
| `manageMenu.summary` | {categories, plural, one {# category} other {# categories}} · {items} items | {categories, plural, one {# category} other {# categories}} · {items, plural, one {# item} other {# items}} |
| `manageMenuImport.allergens.skip` | Skip Allergen setup for now | Skip allergen setup for now |
| `manageMenuImport.allergensNotSet.title` | ⚠ Allergens & dietary aren't set yet | ⚠ Allergens & dietary aren’t set yet |
| `manageMenuImport.catError.clash` | There's already a category called "{name}". | There’s already a category called “{name}”. |
| `manageMenuImport.discard.body` | Your changes won't be saved — the imported items, prep times and kitchen capacity won't be added. | Your changes won’t be saved — the imported items, prep times and kitchen capacity won’t be added. |
| `manageMenuImport.done.allSet` | You're all set! | You’re all set! |
| `manageMenuImport.done.explore` | I'll explore myself | I’ll explore myself |
| `manageMenuImport.offer.body` | We saved the menu you uploaded — {count} items. Use it as your starting point, or upload a different one. | We saved the menu you uploaded — {count, plural, one {# item} other {# items}}. Use it as your starting point, or upload a different one. |
| `manageMenuImport.review.incomplete` | Enter a name to add this item — empty rows aren't imported. | Enter a name to add this item — empty rows aren’t imported. |
| `manageMenuImport.review.noPriceBody` | Set a price for each, or mark it free — otherwise it would go live at {zero}. You can't continue until these are sorted. | Set a price for each, or mark it free — otherwise it would go live at {zero}. You can’t continue until these are sorted. |
| `manageMenuImport.review.ready` | {count} items ready to add. Uncheck any you don't want. | {count, plural, one {# item} other {# items}} ready to add. Uncheck any you don’t want. |
| `manageMenuImport.schedule.blockedDomain` | Please use your website URL — Facebook and Instagram pages can't be scraped automatically. | Please use your website URL — Facebook and Instagram pages can’t be scraped automatically. |
| `manageMenuImport.schedule.keepChecking` | We'll keep checking this page and send any new dates for your approval. | We’ll keep checking this page and send any new dates for your approval. |
| `manageMenuImport.schedule.manualTitle` | I'll add my dates myself | I’ll add my dates myself |
| `manageMenuImport.schedule.noneFound` | We couldn't find any dates in that — try a clearer photo, or add a date yourself. | We couldn’t find any dates in that — try a clearer photo, or add a date yourself. |
| `manageMenuImport.schedule.photoDesc` | Snap or paste your dates — we'll read them in for you to check. | Snap or paste your dates — we’ll read them in for you to check. |
| `manageMenuImport.schedule.saveFailed` | We read your schedule, but couldn't save it just now — try again. | We read your schedule, but couldn’t save it just now — try again. |
| `manageMenuImport.schedule.websiteDesc` | We'll check it regularly and send new dates for your approval. | We’ll check it regularly and send new dates for your approval. |
| `manageMenuImport.settingsReview.anchorContact` | Settings → Contact Details | Settings → Contact details |
| `manageMenuImport.settingsReview.intro` | We've set you up with some common settings. Worth a quick look — you can change any of these later in Settings. | We’ve set you up with some common settings. Worth a quick look — you can change any of these later in Settings. |
| `manageMenuImport.settingsReview.saveFailed` | Couldn't save that — you can change it in Settings. | Couldn’t save that — you can change it in Settings. |
| `manageMenuImport.toast.cardRead` | Card read — {matched} matched, {pending} need your assignment | Card read — {matched} matched, {pending, plural, one {# needs} other {# need}} your assignment |
| `manageMenuImport.toast.finishFailed` | Couldn't mark setup complete — you can still continue. | Couldn’t mark setup complete — you can still continue. |
| `manageMenuImport.toast.scheduleReadFailed` | Couldn't read that schedule — try a clearer photo or type your dates in. | Couldn’t read that schedule — try a clearer photo or type your dates in. |
| `manageMenuImport.upload.later` | I'll do this later | I’ll do this later |
| `manageMenuImport.welcome.body` | {name} is set up. Next we'll add your menu, then your first event. | {name} is set up. Next we’ll add your menu, then your first event. |
| `manageMenuImport.welcome.go` | Let's go | Let’s go |
| `manageSchedule.conflict.overlap` | This event's time overlaps another event on the same day — a single van can't be in two places at once. Check before approving. | This event’s time overlaps another event on the same day — a single van can’t be in two places at once. Check before approving. |
| `manageSchedule.header.scraperManual` | You're managing your schedule manually | You’re managing your schedule manually |
| `manageSchedule.list.found` | We found {count, plural, one {# event} other {# events}} for you — review and approve before they go live. | We found {count, plural, one {# event for you — review and approve before it goes live.} other {# events for you — review and approve before they go live.}} |
| `manageScheduleEvent.hiddenMatch` | {count, plural, one {# hidden place} other {# hidden places}} match · Show hidden | {count, plural, one {# hidden place matches} other {# hidden places match}} · Show hidden |
| `manageScheduleEvent.saving` | Saving... | Saving… |
| `manageScheduleImport.analysing` | Analysing... | Analysing… |
| `manageScheduleImport.review.saving` | Saving... | Saving… |
| `manageScheduleVerify.blocked` | We couldn't access this site — it may be blocking automated checks. Try the page that lists your schedule, or add events manually. | We couldn’t access this site — it may be blocking automated checks. Try the page that lists your schedule, or add events manually. |
| `manageScheduleVerify.blockedDomain` | Please use your website URL — Facebook and Instagram pages can't be scraped automatically. | Please use your website URL — Facebook and Instagram pages can’t be scraped automatically. |
| `manageScheduleVerify.malformed` | That doesn't look like a web address. Try something like yourtruck.co.uk/events | That doesn’t look like a web address. Try something like yourtruck.co.uk/events |
| `manageScheduleVerify.no_content` | We reached this page but couldn't read anything on it. Check it's publicly accessible. | We reached this page but couldn’t read anything on it. Check it’s publicly accessible. |
| `manageScheduleVerify.no_events` | We couldn't find any upcoming events on this page. Make sure the URL points directly to where your schedule is listed. | We couldn’t find any upcoming events on this page. Make sure the URL points directly to where your schedule is listed. |
| `manageScheduleVerify.unreachable` | We couldn't reach this website. It may be down, or the address may be wrong. | We couldn’t reach this website. It may be down, or the address may be wrong. |
| `manageSettings.collection.customerTimes` | Customer Collection Times | Customer collection times |
| `manageSettings.collection.help` | How far apart collection times are. This doesn't change kitchen capacity or prep times. | How far apart collection times are. This doesn’t change kitchen capacity or prep times. |
| `manageSettings.collection.misaligned` | {name} takes {mins} minutes to cook, so some times between batches will show as full. | {name} takes {mins, plural, one {# minute} other {# minutes}} to cook, so some times between batches will show as full. |
| `manageSettings.collection.yourTimes` | Your Collection Times | Your collection times |
| `manageSettings.contact.title` | Contact Details | Contact details |
| `manageSettings.details.descriptionPlaceholder` | Tell customers about your food... | Tell customers about your food… |
| `manageSettings.orders.emailNotificationsHelp` | {hasEmail, select, yes {When on, an email is sent to {email} for every new order. Customer order emails are sent either way.} other {When on, an email is sent to the truck's contact email for every new order. Customer order emails are sent either way.}} | {hasEmail, select, yes {When on, an email is sent to {email} for every new order. Customer order emails are sent either way.} other {When on, an email is sent to the truck’s contact email for every new order. Customer order emails are sent either way.}} |
| `manageSettings.preorders.approvalHelp` | Customers can still order, but the order needs your approval (won't auto-accept). | Customers can still order, but the order needs your approval (won’t auto-accept). |
| `manageSettings.preorders.soldOutHelp` | Customers can't order it after the deadline. | Customers can’t order it after the deadline. |
| `manageSettings.qr.noUrl` | No order URL — slug not set | No order link yet — your truck’s page address isn’t set. |
| `manageSettings.removeVan.removedLink` | <b>✕ Removed:</b> The van's kitchen screen link and settings will be deactivated. | <b>✕ Removed:</b> The van’s kitchen screen link and settings will be deactivated. |
| `manageSettings.schedule.autoDesc` | Tell us where you post your schedule and we'll check it for you, sending any events we find for your approval. This needs to be your own website — not a Facebook or Instagram page. | Tell us where you post your schedule and we’ll check it for you, sending any events we find for your approval. This needs to be your own website — not a Facebook or Instagram page. |
| `manageSettings.schedule.checking` | Checking... | Checking… |
| `manageSettings.schedule.checkingHelp` | This can take up to 2 minutes — please keep this page open and don't close the tab. | This can take up to 2 minutes — please keep this page open and don’t close the tab. |
| `manageSettings.schedule.checkingWebsite` | Checking your website... | Checking your website… |
| `manageSettings.schedule.eitherWay` | Either way, if we find your events listed elsewhere, we'll still send these to you for approval. Nothing goes live until you confirm it. | Either way, if we find your events listed elsewhere, we’ll still send these to you for approval. Nothing goes live until you confirm it. |
| `manageSettings.schedule.manual` | I'll add events myself | I’ll add events myself |
| `manageSettings.vans.takesCashHelp` | Splits the payment button into "Cash" and "Card" so your takings reconcile against the till. You can turn this on for a single event from the dashboard. | Splits the payment button into “Cash” and “Card” so your takings reconcile against the till. You can turn this on for a single event from the dashboard. |
| `manageUpsells.confirmRemove` | Remove upsell rule "{trigger} → {suggest}"? | Remove upsell rule “{trigger} → {suggest}”? |
| `manageUpsells.upTo` | {n, plural, other {Up to {count} items suggested}} | {n, plural, one {Up to {count} item suggested} other {Up to {count} items suggested}} |
| `nativeShell.setup.goToVans` | Go to Settings → Vans | Go to Settings → Your trucks |
| `nativeShell.setup.noVanBody` | This truck has no active van yet. Activate one in <b>Settings → Vans</b>, then this device sets up automatically — no further steps here. | This truck has no active van yet. Activate one in <b>Settings → Your trucks</b>, then this device sets up automatically — no further steps here. |
| `offlineProtection.modes.no_auto_accept.help` | Auto-accept is turned off, so customers can still order but nothing is confirmed automatically. You'll confirm each one when you're back online — and anything still waiting is rejected automatically after your selected time, with the customer emailed to let them know. | Auto-accept is turned off, so customers can still order but nothing is confirmed automatically. You’ll confirm each one when you’re back online — and anything still waiting is rejected automatically after your selected time, with the customer emailed to let them know. |
| `offlineProtection.modes.pause.help` | Customers can't order until you're back online. | Customers can’t order until you’re back online. |
| `offlineProtection.modes.pause.label` | Pause Online Ordering | Pause online ordering |
| `offlineProtection.purpose` | If your device loses its connection, this stops orders arriving while you can't see them. | If your device loses its connection, this stops orders arriving while you can’t see them. |
| `offlineProtection.switchLabel` | Offline Order Protection | Offline order protection |
| `serviceSettings.eventTypesFooterOneEvent` | To change a setting for one event only, use that event's dashboard. | To change a setting for one event only, use that event’s dashboard. |
| `serviceSettings.sameSettingsConfirm` | Copy Van 1's settings to every van? This copies all of Van 1's van settings, the same as 'Same as Van 1' in Settings. Kitchen capacity has its own switch. | Copy Van 1’s settings to every van? This copies all of Van 1’s van settings, the same as ‘Same as Van 1’ in Settings. Kitchen capacity has its own switch. |
| `serviceSettings.typeFollowsVanTitle` | Follows each van's usual setting | Follows each van’s usual setting |
| `tradeArea.country_off` | Trucks can't sign up in {country} yet. Choose another country. | Trucks can’t sign up in {country} yet. Choose another country. |
| `tradeArea.zone_unknown` | That time zone isn't one we offer in {country}. Choose one from the list. | That time zone isn’t one we offer in {country}. Choose one from the list. |
| `dashboard.settings.capacityDesc` | The most items your kitchen can turn out at once, across all the categories you’ve ticked. Each category’s own batch size still applies on top. | (deleted) |
| `dashboard.settings.capacityExample` | Example: if you can cook 4 mains in 5 minutes, then set it to 4 items every 5 minutes. The total capacity limits orders across all selected categories so if you want to only sell a maximum of 10 starters and mains every 5 minutes, then set Total Capacity to 10 items every 5 minutes and select Starters and Mains tickbox. This will still keep your mains restricted to 4 items every 5 minutes. | (deleted) |

### A2 · US overrides added or changed (106) and removed (4)

| key | en-GB | en-US |
|---|---|---|
| `manageAllergens.cardEditor.placeholder` | e.g. All our fish & chips contain wheat and milk. Fryer is shared with items containing gluten and nuts. Vegan options available — ask staff. | e.g. All our tacos contain wheat and milk. Fryer is shared with items containing gluten and nuts. Vegan options available — ask staff. |
| `manageAllergens.cardUpload.analysing` | Analysing card… | Analyzing card… |
| `manageAllergens.wizard.uncategorised` | Uncategorised | Uncategorized |
| `manageExtras.addLabel` | + Add customisation | + Add customization |
| `manageExtras.uncategorized` | Uncategorised | Uncategorized |
| `manageExtras.matrix.help` | Tick “Include” to add the group to a dish, then tick which options it shows. Saves instantly. | Check “Include” to add the group to a dish, then check which options it shows. Saves instantly. |
| `eventTypes.vanGone` | That van has gone. | That truck has gone. |
| `eventTypes.sections.vans` | VANS | TRUCKS |
| `eventTypes.copyVanOne` | Copy Van 1’s settings | Copy Truck 1’s settings |
| `eventTypes.phone.vanSetup` | This van’s usual setup — used at every event with no type. | This truck’s usual setup — used at every event with no type. |
| `eventTypes.newType.namePlaceholder` | e.g. School fete | e.g. School fair |
| `eventTypes.newType.chips.pub` | Pub | Bar |
| `eventTypes.newType.chips.privateHire` | Private hire | Catering |
| `eventTypes.summary.collectionEvery` | collection every {mins} min | pickup every {mins} min |
| `eventTypes.errors.noVans` | This truck has no vans to change. | This account has no trucks to change. |
| `privateEvents.form.previewNote` | How it shows on your schedule — no venue, town or postcode. | How it shows on your schedule — no venue, town or ZIP code. |
| `privateEvents.link.newLinkConfirm` | Make a new link? The current link stops working straight away, and any QR codes you have already printed will stop working too. | Make a new link? The current link stops working right away, and any QR codes you have already printed will stop working too. |
| `privateEvents.link.newLinkHelp` | Use this if the link has gone somewhere it shouldn’t. The current link stops working straight away, and printed QR codes stop working too. | Use this if the link has gone somewhere it shouldn’t. The current link stops working right away, and printed QR codes stop working too. |
| `vanFilter.ariaLabel` | Filter by van | Filter by truck |
| `vanFilter.all` | All vans | All trucks |
| `vanFilter.unknown` | Unknown van | Unknown truck |
| `manageMenu.item.optionsHelp` | Tick a group to offer it on this dish, then choose which of its options to show. | Check a group to offer it on this dish, then choose which of its options to show. |
| `manageMenuImport.toast.demoGone` | Your demo menu is no longer available — please upload it again to carry on. | Your demo menu is no longer available — please upload it again to continue. |
| `manageMenuImport.processing.title` | Analysing your menu | Analyzing your menu |
| `manageMenuImport.processing.body` | AI is reading and categorising your items… | AI is reading and categorizing your items… |
| `manageMenuImport.review.noPriceBody` | Set a price for each, or mark it free — otherwise it would go live at {zero}. You can’t continue until these are sorted. | Set a price for each, or mark it free — otherwise it would go live at {zero}. You can’t continue until these are fixed. |
| `manageMenuImport.extras.introSetup` | Some dishes can be set up as <b>one customisable item</b> or kept as <b>separate dishes</b>. Choose how each should appear. You can change this later. | Some dishes can be set up as <b>one customizable item</b> or kept as <b>separate dishes</b>. Choose how each should appear. You can change this later. |
| `manageMenuImport.extras.intro` | Some dishes can be set up as <b>one customisable item</b> or kept as <b>separate dishes</b>. Choose how each should appear. You can change this later in Settings. | Some dishes can be set up as <b>one customizable item</b> or kept as <b>separate dishes</b>. Choose how each should appear. You can change this later in Settings. |
| `manageMenuImport.schedule.urlPlaceholder` | https://yourtruck.co.uk/events | https://yourtruck.com/events |
| `manageMenuImport.schedule.dateTbc` | Date TBC | Date TBD |
| `errorsManage.unauthorised` | Unauthorised | Unauthorized |
| `errorsManage.collection_interval_choices` | Collection times must be every {choices} minutes. | Pickup times must be every {choices} minutes. |
| `errorsManage.collection_intervals_save_failed` | Collection times could not be saved right now. | Pickup times could not be saved right now. |
| `errorsManage.van_not_found` | Van not found | That truck isn’t part of this account |
| `errorsManage.first_van_self` | The first van cannot follow itself. | The first truck cannot follow itself. |
| `errorsManage.no_first_van` | There is no first van to follow. | There is no first truck to follow. |
| `errorsManage.last_van` | Cannot remove the last van | Cannot remove the last truck |
| `errorsManage.van_capacity_save_failed` | That van’s capacity settings could not be saved right now. | That truck’s capacity settings could not be saved right now. |
| `errorsManage.first_van_copy_failed` | The first van’s settings could not be copied right now. | The first truck’s settings could not be copied right now. |
| `errorsManage.capacity_copy_failed` | The first van’s capacity could not be copied right now. | The first truck’s capacity could not be copied right now. |
| `errorsManage.category_copy_failed` | The first van’s category settings could not be copied right now. | The first truck’s category settings could not be copied right now. |
| `errorsManage.schedule_read_failed` | Couldn’t read your schedule, so places could not be worked out. | Couldn’t read your schedule, so places could not be figured out. |
| `manageApi.vanFallback` | Van | Truck |
| `manageApi.uncategorised` | Uncategorised | Uncategorized |
| `manageSchedule.status.cancelled` | Cancelled | Canceled |
| `manageSchedule.toast.eventCancelled` | Event cancelled | Event canceled |
| `manageSchedule.toast.eventCancelledOrders` | Event cancelled · {count, plural, one {# order} other {# orders}} cancelled | Event canceled · {count, plural, one {# order} other {# orders}} canceled |
| `manageSchedule.conflict.overlap` | This event’s time overlaps another event on the same day — a single van can’t be in two places at once. Check before approving. | This event’s time overlaps another event on the same day — a single truck can’t be in two places at once. Check before approving. |
| `manageScheduleEvent.titleTidy` | Tidy up places | Clean up places |
| `manageScheduleEvent.tidyUp` | Tidy up places | Clean up places |
| `manageScheduleEvent.whereTrading` | Where are you trading? | Where are you serving? |
| `manageScheduleEvent.area` | Area (village, town or city) | City or town |
| `manageScheduleEvent.van` | Van | Truck |
| `manageScheduleEvent.selectVan` | Select a van | Select a truck |
| `manageScheduleEvent.notesPlaceholder` | e.g. Park in the main car park | e.g. Park in the main parking lot |
| `manageScheduleImport.analysing` | Analysing… | Analyzing… |
| `manageScheduleImport.pastePlaceholder` | Paste your schedule here e.g. {date}, {style, select, zip_state {Zilker Park, Austin} other {The Crown, Wickhambrook}}, {start}-{end} | Paste your schedule here e.g. {date}, {style, select, zip_state {Zilker Park, Austin} other {The Crown, Wickhambrook}}, {start} – {end} |
| `manageScheduleImport.review.van` | Van | Truck |
| `manageScheduleImport.review.selectVan` | Select a van | Select a truck |
| `manageScheduleVerify.malformed` | That doesn’t look like a web address. Try something like yourtruck.co.uk/events | That doesn’t look like a web address. Try something like yourtruck.com/events |
| `schedulePlaces.favRemoveAria` | Remove {name} from favourites | Remove {name} from favorites |
| `schedulePlaces.favAddAria` | Add {name} to favourites | Add {name} to favorites |
| `schedulePlaces.favourites` | Favourites | Favorites |
| `schedulePlaces.favAddFailed` | Couldn’t add that favourite. | Couldn’t add that favorite. |
| `schedulePlaces.favRemoveFailed` | Couldn’t remove that favourite. | Couldn’t remove that favorite. |
| `schedulePlaces.pickPlace` | Pick a place to tidy up. | Pick a place to clean up. |
| `serviceSettings.labels.collection_interval_mins` | Collection times | Pickup times |
| `serviceSettings.typeFollowsVanTitle` | Follows each van’s usual setting | Follows each truck’s usual setting |
| `serviceSettings.sameSettingsAllVansLabel` | Same settings for all vans | Same settings for all trucks |
| `serviceSettings.sameSettingsAllVansHeader` | All vans | All trucks |
| `serviceSettings.sameSettingsConfirm` | Copy Van 1’s settings to every van? This copies all of Van 1’s van settings, the same as ‘Same as Van 1’ in Settings. Kitchen capacity has its own switch. | Copy Truck 1’s settings to every truck? This copies all of Truck 1’s truck settings, the same as ‘Same as Truck 1’ in Settings. Kitchen capacity has its own switch. |
| `serviceSettings.pricesTruckWideTitle` | Your prices are the same for every van | Your prices are the same for every truck |
| `offlineProtection.switchHelp` | What happens when this van loses its connection. | What happens when this truck loses its connection. |
| `kitchenCapacity.desc` | The most items your kitchen can turn out at once, across all the categories you’ve ticked. Each category’s own batch size still applies on top. | The most items your kitchen can turn out at once, across all the categories you’ve checked. Each category’s own batch size still applies on top. |
| `kitchenCapacity.example` | Example: if you can cook 4 mains in 5 minutes, then set it to 4 items every 5 minutes. The total capacity limits orders across all selected categories so if you want to only sell a maximum of 10 starters and mains every 5 minutes, then set Total capacity to 10 items every 5 minutes and tick the Starters and Mains boxes. This will still keep your mains restricted to 4 items every 5 minutes. | Example: if you can cook 4 entrées in 5 minutes, then set it to 4 items every 5 minutes. The total capacity limits orders across all selected categories so if you want to only sell a maximum of 10 appetizers and entrées every 5 minutes, then set Total capacity to 10 items every 5 minutes and check the Appetizers and Entrées boxes. This will still keep your entrées restricted to 4 items every 5 minutes. |
| `kitchenCapacity.loadVansFailed` | Could not load your vans | Could not load your trucks |
| `kitchenCapacity.noVan` | Add a van in Settings › Truck settings to set your kitchen capacity. | Add a truck in Settings › Truck settings to set your kitchen capacity. |
| `kitchenCapacity.boxTitleAll` | All vans · Kitchen capacity | All trucks · Kitchen capacity |
| `kitchenCapacity.lead` | How many items your kitchen can make, so customers can only pick collection times you can meet. | How many items your kitchen can make, so customers can only choose pickup times you can meet. |
| `kitchenCapacity.sameForAll` | Same kitchen capacity for all vans? | Same kitchen capacity for all trucks? |
| `kitchenCapacity.confirmBody` | All vans will use {van}’s kitchen capacity. Each van’s own numbers will be replaced. | All trucks will use {van}’s kitchen capacity. Each truck’s own numbers will be replaced. |
| `kitchenCapacity.colCountsTitle` | Which categories count toward the total capacity. Cooked categories always count; tick instant ones (sides, dips, drinks) to include them. | Which categories count toward the total capacity. Cooked categories always count; check instant ones (sides, dips, drinks) to include them. |
| `kitchenCapacity.countsTick` | Tick to include this instant category (sides, dips, drinks) in the shared per-window limit | Check to include this instant category (sides, dips, drinks) in the shared per-window limit |
| `settingsCopy.buzzers.label` | Do you hand out buzzers for collection? | Do you hand out buzzers for pickup? |
| `whereYouTrade.settingsHeading` | Where you trade | Where you serve |
| `manageSettings.emojiPicker.categories.fruitVeg` | Fruit & veg | Fruits & vegetables |
| `manageSettings.contact.tickWhatsApp` | ⚠️ Tick “This number is on WhatsApp” on the Phone field to use WhatsApp. | ⚠️ Check “This number is on WhatsApp” on the Phone field to use WhatsApp. |
| `manageSettings.preorders.modalHelp` | Tick which items are pre-order. They all use the global rule ({rule}). | Check which items are pre-order. They all use the global rule ({rule}). |
| `manageSettings.vans.sameAs` | {hasName, select, yes {Same as {name}} other {Same as the first van}} | {hasName, select, yes {Same as {name}} other {Same as the first truck}} |
| `manageSettings.vans.sameOn` | This van uses the same settings, except kitchen capacity. | This truck uses the same settings, except kitchen capacity. |
| `manageSettings.vans.sameOff` | Copy the first van’s settings — everything except kitchen capacity — and keep them in step. | Copy the first truck’s settings — everything except kitchen capacity — and keep them in step. |
| `manageSettings.vans.takesCashHelp` | Splits the payment button into “Cash” and “Card” so your takings reconcile against the till. You can turn this on for a single event from the dashboard. | Splits the payment button into “Cash” and “Card” so your sales reconcile against the cash register. You can turn this on for a single event from the dashboard. |
| `manageSettings.vans.newPlaceholder` | e.g. Van 2, Festival Van | e.g. Truck 2, Festival Truck |
| `manageSettings.collection.help` | How far apart collection times are. This doesn’t change kitchen capacity or prep times. | How far apart pickup times are. This doesn’t change kitchen capacity or prep times. |
| `manageSettings.collection.unavailable` | Collection times are unavailable right now. | Pickup times are unavailable right now. |
| `manageSettings.collection.customerTimes` | Customer collection times | Customer pickup times |
| `manageSettings.collection.yourTimes` | Your collection times | Your pickup times |
| `manageSettings.removeVan.body` | This van will be removed from your account and will no longer appear on your dashboard or in future events. | This truck will be removed from your account and will no longer appear on your dashboard or in future events. |
| `manageSettings.removeVan.preservedEvents` | <b>✓ Preserved:</b> Past event records linked to this van are unaffected. | <b>✓ Preserved:</b> Past event records linked to this truck are unaffected. |
| `manageSettings.removeVan.removedLink` | <b>✕ Removed:</b> The van’s kitchen screen link and settings will be deactivated. | <b>✕ Removed:</b> The truck’s kitchen screen link and settings will be deactivated. |
| `manageSettings.removeVan.keep` | Keep van | Keep truck |
| `manageSettings.removeVan.remove` | Remove van | Remove truck |
| `manageSettings.vanUpgrade.title` | Upgrade to add more vans | Upgrade to add more trucks |
| `manageSettings.vanUpgrade.body` | The Starter plan includes 1 van. Upgrade to Pro or Max to add additional vans. | The Starter plan includes 1 truck. Upgrade to Pro or Max to add additional trucks. |
| `manageSettings.schedule.urlPlaceholder` | https://yourtruck.co.uk/events | https://yourtruck.com/events |
| `manageSettings.qr.printHelp` | Print or display this code so customers can scan and pre-order. Place it at your hatch, on your van, or share it online. | Print or display this code so customers can scan and pre-order. Place it at your window, on your truck, or share it online. |

Removed (now equal to GB or the key moved): `goLive.noVan.where`, `dashboard.settings.capacityDesc`, `dashboard.settings.capacityExample`, `nativeShell.setup.goToVans`
