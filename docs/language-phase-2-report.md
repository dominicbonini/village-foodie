# Language Phase 2 — US English for the customer, kitchen and onboarding surfaces, plus the wrong-English fixes

**Status:** built and proven. Not pushed or deployed. Everything after the Step 0 commit is uncommitted.

## Step 0
**Commit `460ba55`** ("Language phase 1c: onboarding text (checkpoint)"); its parent is `accbb61`. It is local only, not pushed, and BEFORE was captured on it.

Left out of the commit, on purpose:
- `docs/reference-manual.md` and `docs/reference-manual-v15-9-report.md`: the V15.9 manual work, which is not Phase 1c.
- `.cursor/mcp.json`: a new untracked file. I did not open it, because it may hold a token.
- `supabase/.temp/cli-latest`.

## SQL and the database
**SQL:** none.

**Supabase MCP:** not available in this session, so no read-only queries were run. Nothing needed one: the country settings used in proofs come from the seed fixtures.

## Garbled spans and contradictions
**Garbled spans:** none found.

**Contradictions:** none that needed a stop. I checked one pair before starting. "Ticket messages stay plain ASCII" and "curly ’ and … everywhere" never meet: the `ticket` namespace has no apostrophe, ellipsis or dash, and it stays ASCII in both files.

## ⚠️ One decision you should check — US clock "5:00 PM" (§2.1)
Your brief and the approved table ask for "5:00 PM". The product had one 12-hour style, "6:30pm", chosen in the time-and-dates phase to match the weekly poster. GB posters default to that style.
- **What I did:** the one clock function now takes the locale. en-US gives "6:30 PM", "6:00 PM", "12:00 AM". Everything else (en-GB, and posters, which pass no locale) is unchanged, proven for every minute of the day.
- **The other option** is to keep "6:30pm" for the US. That would revert one rule table in `lib/time-utils.ts` and its harness pins.

---

## Summary

| Part | What changed | GB | US |
|---|---|---|---|
| 1 · US words | 213 overrides in `messages/en-US.json`, plus 12 inline labels moved into messages so the US can override them | byte-identical | 1,350 of 2,149 US views change |
| 2 · US behaviour | Dates and times follow the truck's country settings; pre-order labels; demo built in the visitor's country; "Truck 1"; save-email and deletion dates; "Sept" → "Sep" | **named changes:** "Sep" (Sept), the deletion email's date, "Off since" | US date order and clock, US demo words |
| 3 · Wrong English | 196 en-GB messages (150 typography, 46 other fixes) and 4 small code fixes | **named changes**, all listed in Appendix A1–A2 | same fixes |

**Proof:** `scripts/language-phase-2.cjs` passes **1,110 checks, 0 failed**. It covers 4,532 views (2,383 GB, 2,149 US) captured on `460ba55` and compared with the current code.

**Every other check passes:**
- full sweep 123/123;
- `tsc --noEmit` clean;
- `next build` exit 0;
- language-phase-0 168, 1a 1,050, 1b 3,522, 1c 4,498;
- messages-parity 9,812;
- messages-split 93;
- ui-literals.

---

## 1 · Part 1 — US English (messages/en-US.json, overrides only)

**213 US messages.** Each one differs from en-GB, has a matching en-GB key, and keeps the same placeholders, tags and plural/select structure; `_messages-parity-2` checks all four.

| From phase | Namespaces | US overrides |
|---|---|---:|
| 1a customer | order, errorsCustomer, deals, orderStatus, privateLink, emailCustomer, phone | 75 |
| 1b kitchen | dashboard, errorsKitchen, kitchenModals, ticket, printing, kds, nativeShell, demo, paymentActions, orderCard, addOrder, emailOperator, alertsOperator | 98 (11 on keys new in this phase) |
| 1c onboarding | setup, goLive, walkthrough, auth, emailSignup, errorsOnboarding, emailAccount, demoSaveEmail, demoGetStarted, demoUpload | 32 |
| 2 provisioning | provisionContent (stored demo and van words, §2.3) | 8 |

Every override is listed in **Appendix A4** with its en-GB and en-US text. The rest of the 1a/1b/1c namespaces needed no US words.

### Applied exactly as your table says
**Customer words:**
- cart; pickup / pick up / picked up;
- "Pay at the truck at pickup"; "ready for pickup — come pick it up";
- at the window / "See you at the window!" ("Pay at Hatch" unchanged);
- combos; organizer; Partially paid / still due; "you have not been charged";
- "Calculated on the food"; "Setup pending";
- canceled / canceling (cancellation unchanged); authorized / authorizing; Unauthorized;
- yourtruck.com.

**Kitchen and onboarding words:**
- ticket "PICKUP {time}" / "PICKUP ASAP" / "DO NOT CHARGE";
- "Nothing to charge", "Extra to charge", "Card authorized — do not charge";
- truck / trucks / "Truck 1"; card reader; 💵;
- check / uncheck / checkbox; appetizers / entrées; gray;
- right away; continue; "we’ll fix it"; "Where and when you’re serving".

**Spelling:** -ize words (customizations, recognized).

### Wording choices the table did not cover (plainest US words; each recorded)
1. **"have not taken any money" → "you have not been charged"** (`errorsCustomer.sold_out_paying`): the same phrase as the table's row.
2. **"…held, not charged — no money has been taken" → "…nothing has been charged"** (`dashboard.cancelModal.held`). The operator is reading about the customer's card, and "you have not been charged" would be wrong here.
3. **fulfil → fulfill** (rejection email).
4. **"have a play (around)" → "try it out" / "try them out"**, the latter when it refers to several features.
5. **"seeing {truck} trading" → "seeing {truck} serving customers"; "a fresh day’s trading" → "a fresh day of service".**
6. **"Haven’t got … to hand?" → "Don’t have … handy?"; "look round" → "look around"; "straight back / over" → "right back / over".**
7. **"Settings → Vans" → "Settings → Your trucks"**, the real heading in Manage. GB still says "Settings → Vans", which names no section (§6).
8. **"van" where "truck" is also the business:**
   - "Van not found for this truck" → "That truck isn’t part of this account";
   - the native device panel's two rows "Truck" / "Van" → "Business" / "Truck";
   - "Which van is this device?" → "Which truck is this device for?"
9. **"Part" refund type → "Partial"; "PART REFUNDED" → "PARTIALLY REFUNDED"** (ticket, still ASCII and fits); "partly refunded" → "partially refunded".
10. **"Park in the main car park, look for the orange gazebo" → "…main parking lot, look for the orange tent"** (a US gazebo is a fixed structure).
11. **"Customer Collection Times" → "Customer pickup times"**, sentence case in US. GB keeps its title case (§6).
12. **Kept, because they are fine in US English:** "queued" for orders and actions, "Queue clear" (the order queue), "deal" (only the "Meal deals" heading becomes "Combos"), "Hi there", "Menu & Stock", walk-up, buzzer.

### Inline text moved into messages so the US can override it (GB text byte-identical, proven)
- **`lib/order-completion-label.ts`** reads `orderCard` (new key `markPaidAndCollected`) in the given locale; OrderCard and DemoWelcome pass the locale. "Mark paid & picked up", "Picked up".
- **💷 → `cashIcon`** in OrderCard, AddOrderPanel, DemoWelcome and the KDS header (💵 in the US).
- **Status labels on the dashboard and KDS:**
  - the done-list chip → `dashboard.orders.status`;
  - the event bar → `dashboard.eventBar.status` / `kds.banner.eventStatus`;
  - the kitchen event picker → `kitchenModals.picker.status`.

  The US gets "Canceled" and "Picked up".
- **The dashboard's kitchen-capacity explainer** → `dashboard.settings.capacityDesc` / `capacityExample`. The US gets "checked", "entrées", "appetizers". Manage's copy of the same text stays inline until Phase 1d.

### Where US words do not show yet (not wording)
- **Signup, login, forgot and reset pages:** they know no country, so they render en-GB. `auth.signup.emailPlaceholder` (US "you@yourtruck.com") appears once signup learns the visitor's country.
- **The auth routes' own emails** (reset, change email) are en-GB, as recorded in 1c.
- **A refusal before the truck is known** ("Unauthorised") is en-GB by design.

---

## 2 · Part 2 — US behaviour

### 2.1 Dates and times follow the truck's country settings
**New in `lib/time-utils.ts`:**
- `formatShortDate`: GB "Sat 10 Oct", US "Sat, Oct 10".
- `formatLongDate`: GB "27 October 2026", US "October 27, 2026".
- `formatYmdShortMonth`: Intl's parts, with the short month from `monthName`.

**The 12-hour clock follows the locale's convention** (decision above). `clockOf(t, style, locale?)` uses a rule table keyed by exact locale.
- **en-US 12h:** "5:00 PM", "6:30 PM", "12:00 AM", "12:00 PM".
- **No locale, or any other locale:** exactly as before, with the posters' formatter untouched.
- **Why a rule table rather than Intl:** newer Intl data puts a narrow no-break space before "PM", and the ticket printer prints that as "?".
- **Who passes the locale:** `formatTime`, `formatSlot`, `formatInstantClock` and `formatTimeRange`. A US range reads "5:00 PM – 9:30 PM".
- **Proof:** GB 24h, the default style and the poster path are identical for every minute of the day (2,888/2,888 per function; poster ranges 18,432/18,432).

**Pre-order labels** (`lib/preorder.ts`, the menu route, the order page) take the truck's TimeSettings.
- **GB:** "Pre-order by 16:30, Sat 10 Oct" — unchanged; 8,031/8,031 deadlines and 2,920/2,920 open labels over 2026.
- **US:** "Pre-order by 4:30 PM, Sat, Oct 10"; "Pre-orders open Sat, Oct 10".

**AddOrderPanel's "Can’t be ready by…" popup** now writes the truck's clock: US "6:45 PM", GB unchanged.

### 2.2 Dates on emails and screens

| Where | GB | US |
|---|---|---|
| Demo save-email (email, response, DemoGetStarted) | "27 October 2026" unchanged | "October 27, 2026" |
| Account-deletion email to the owners | **NAMED VISIBLE CHANGE** "2026-11-08" → "8 November 2026" | "November 8, 2026" |
| Dashboard "Off since" (card payments paused) | **NAMED VISIBLE CHANGE** "Off since 2026-10-08" → "Off since 8 October 2026" | "Off since October 8, 2026" |

- **Off since:** this was a raw ISO date shown on a kitchen screen (1b §6 item 7). I gave it the same treatment as the deletion email.
- **HatchGrab's own [ACTION] deletion email keeps its ISO date.** It is staff-only.
- **⚠️ Edge, GB:** these three dates are now the date on the **truck's** clock, not the server's UTC.
  - Between 23:00 and 24:00 UTC during British Summer Time, GB now shows the London date, one day later than before.
  - For save-email that is 210 of the 8,760 hours in 2026. It is correct under rule 5; I am naming it rather than calling it identical.

### 2.3 Demo and new truck in the right country
**Where the country comes from:**
- `/api/demo` resolves the visitor's country with the new `visitorCountryCodeOf(req)`: `?country`, then the cookie, then the IP country, switched-on countries only, else GB.
- It passes `country` to `provisionDemo`, which checks again (`demoCountry`): absent, unknown or switched-off codes all give GB.
- **While the US is switched off, every demo is GB, exactly as today.**
- Outreach demos (`app/api/admin/provision-demo`) pass the prospect's `discovery_trucks.country` the same way.

**Stored words (new `provisionContent` namespace, keyed by id):**
- `lib/demo-templates.ts` now holds ids and prices; the words come from messages in the demo truck's locale.
- A **US demo stores:**
  - van "Truck 1";
  - "Arugula & Parmesan" and "Garden Veggie" (pizza);
  - "Pulao Rice" and the category "Entrées" (curries);
  - USD, a US zone and US allergens.

  These names also appear in its seeded orders and saved sample menu.
- **A new US truck's first van is "Truck 1"; GB stays "Van 1".**

**English used as a key:** `lib/demo-assumptions.ts` picked cooking times by the English category name "Mains". It now uses the category id for the sample menus, so "Entrées" cooks exactly as "Mains" does: same prep, batch, warnings and order count.

**Proof:**
- GB demo and new-truck rows are byte-identical (`language-phase-1c` demo and setup areas). That includes GB demos asked for as US-while-off, "ZZ" and "usa".
- The US rows are proven on fixtures with the US switched on.

### 2.4 "Sept" → "Sep" (NAMED VISIBLE CHANGE for GB, September only)
Every listed formatter now goes through `formatYmdShortMonth`, which takes the month from `monthName` ("Sep"). The places it reaches:
- the public **TruckListCard** (order page, profile, embed, Manage), e.g. "Tue 1 Sept" → "Tue 1 Sep";
- the **inbound-schedule email**;
- **Manage:** schedule cards ("SEPT" → "SEP"), the duplicate notice, the Reports header and both pickers (6 lines in `app/manage/[token]/page.tsx`);
- the **kitchen event picker**, compact style (`lib/event-display.ts`);
- **EventCancelModal**;
- **AddOrderPanel**'s event and day labels.

**Proof:** GB differs in exactly the 30 September days of 2026 and in nothing else; US is 365/365 unchanged (en-US already wrote "Sep").

**"Sept" left elsewhere** (Manage SocialPosts and SchedulePlaces, outreach, admin) is listed in §6.

### 2.5 One ticket fix the US clock needed
`lib/printing/ticket.ts` `padBetween` no longer adds a separating space when there is no left label.
- A US 58 mm header such as "COLLECT 12:00 AM" fills all 16 double-width columns, and the old code printed it one column over the edge.
- GB is unchanged at every realistic length (every GB ticket view is byte-identical). Only a right-aligned value as long as the whole line would differ, e.g. a 43-character phone number on 58 mm.

---

## 3 · Part 3 — wrong English fixed for both countries (NAMED VISIBLE CHANGES)

**196 en-GB messages changed** (Appendix A1–A2 lists every key with its before and after text). On top of them:
- one moved message, `dashboard.settings.capacityDesc`: its old inline text "you've ticked … category's" now reads "you’ve ticked … category’s";
- four code fixes.

### Typography (150 keys, Appendix A1)
- **125 straight apostrophes → ’**, placeholders included (`{truck}’s`). Every message in both files is now straight-apostrophe-free except the ASCII `ticket` namespace.
- **22 "..." → "…"**: "Confirming…", "Saving…", "Signing in…", "Sending…", "Scanning…", "Connecting…", "Printing…", "Loading…", "Cancelling…".
- **3 " - " → " — "**: `dashboard.toast.notOnBoard`, `dashboard.settings.layoutScrollHelp`, and the edited-order email subject `emailCustomer.updated.subjectTotalMoved`.

### Every other fix (46 keys, Appendix A2; the main ones)

| key | before | after |
|---|---|---|
| `order.confirmMissing` | We couldn&amp;apos;t find that order. | We couldn’t find that order. |
| `orderStatus.cutoffNote`, `errorsCustomer.cancel_window_passed`, `emailCustomer.confirmation.cancelLine` | "…up to 1 minutes…" (no `one` branch) | real plural: "…1 minute…" |
| `dashboard.settings.everyMinutes` | Every 1 minutes | Every minute |
| `goLive.allergensItemsUnverified.detail` | "1 of your 1 dishes are hidden…" | one dish: "Your dish is hidden…"; "1 of your 5 dishes is hidden…" (code passes `u`) |
| `demoSaveEmail.deletion`, `emailAccount.deletionScheduled.readable` | (1 days) | (1 day) |
| `dashboard.buzzer.removeFailed`, `kds.toast.buzzerRemoveFailed` | Could not remove buzzer null — … | Could not remove the buzzer from … (code passes a flag) |
| queued buzzer removal (code, dashboard and KDS) | Buzzer&nbsp;&nbsp;removed (double space) | Buzzer removed |
| `nativeShell.banner.offline` | 1 change saved … They’ll be sent… | 1 change saved … It’ll be sent… |
| `nativeShell.banner.stillQueued` | 1 change … Still trying to send them. | … send it. |
| `buzzer.allTaken` | All 1 buzzers are out. Tap one… | The buzzer is out. Tap it… (code passes `n`) |
| `nativeShell.gate.status` | Order #12 {raw action id} | Order #12 updated |
| `addOrder.staleCheck` | …downloaded -- you're offline… | …downloaded — you’re offline… |
| `dashboard.prep.startBy` | {mins}min | {mins} min |
| `auth.reset.tooShort`, `errorsOnboarding.new_password_too_short` | Password must be at least 8 characters | Password must be at least 8 characters. |
| `goLive.kitchenCapacityUnset.unnamedVan` | unnamed van | Unnamed van |
| `goLive.emailUnknown.detail` | …not wired up yet (Phase 4 Step 2), so… | …not wired up yet, so… |
| `errorsOnboarding.change_id_required` | changeId required | Something went wrong — refresh the page and try again. |
| `demoGetStarted.error.truckUnreachable` | …but we couldn’t reach us to create your truck. Try again. | …but we couldn’t create your truck just now. Try again. |
| `kds.banner.startEvent`, `kitchenModals.actions.startEvent`, `addOrder.startEvent` | Start Event / Restart Event | Start event / Restart event |
| `dashboard.edit.title` | Edit Order #{id} | Edit order #{id} |
| `order.allergenInfo` | ⓘ Allergen Info | ⓘ Allergen info |
| 13 `errorsKitchen` raw-field refusals ("itemName required", "event_id required", "value must be true or false", …) | field names | Something went wrong — refresh the page and try again. |
| `errorsKitchen.conflict` | conflict | This order has changed — check it and try again. |
| `errorsKitchen.van_not_for_truck` / `van_not_for_target` / `not_truck_member` | lower-case fragments | sentence case ("Van not found for this truck", …) |

**Code fixes** (GB otherwise byte-identical):
- `app/dashboard/[token]/page.tsx` and `kds/page.tsx`: the buzzer double space and "null";
- `components/dashboard/BuzzerGrid.tsx`: passes `n`;
- `lib/go-live-text.ts`: passes `u`.

**Checked, not broken:**
- No code compares a translated sentence. `RejectOrderModal` maps its label back to an id from the same catalogue, so it still works; see §6 on rule 6.
- Stored reject reasons written from now on carry ’. Old rows keep ', and nothing reads them back.

---

## 4 · Proof

### The method: "this code with the old words"
`scripts/_render-kit.cjs` has a switch, `HG_MESSAGES_FROZEN`:
- **With it on,** every bundle loads the current code with the **460ba55 words**: current keys set back to their 460ba55 text, new keys kept, en-US `{}`. That is run **F**.
- **The normal run is A:** the current code with the current words.

That separates what the **code** changed from what the **words** changed.
- **BEFORE** was captured from a clean `git worktree` of `460ba55`, with only the harness scripts copied in.
- It covers every view of the 1a, 1b and 1c harnesses (pages, emails with subject, HTML and text, tickets as bytes, API bodies, provisioned rows) plus Phase-2-only views (`_lp2-extra.cjs`):
  - pre-order labels;
  - TruckListCard, the inbound-schedule email, and Manage's real `ScheduleTab` / `ReportsTab` for a September and an October date;
  - GB and US demos and new trucks.
- **Determinism:**
  - BEFORE was captured twice: 14 files, byte-identical.
  - The whole harness was run twice: identical output, and identical F and A captures by sha.

US views render inside the US locale context, as the app does once the page learns the truck's country. This is byte-identical under the old words, so BEFORE is unaffected.

### `scripts/language-phase-2.cjs` — 1,110 passed, 0 failed (~15 s)

| Section | Result |
|---|---|
| **GB · F vs BEFORE (code changes)** | 2,374 views byte-identical. 9 equal BEFORE plus their named change. |
| **GB · A vs F (word changes)** | 197 en-GB keys changed text; 187 reach a view, 10 reach no fixture. Every changed word in every view is explained by a changed key. The per-key list of views is written by `--per-key`. |
| **GB keys** | `scripts/fixtures/language-phase-2-gb-named.json` (246 keys) equals the real en-GB diff: 196 changed, 1 moved and reworded (`capacityDesc`), 49 new keys with unchanged GB text. The harness fails if any other en-GB key changes. |
| **US · F vs BEFORE** | 1,231 identical, 774 equal BEFORE plus a named change, 144 listed (US ticket bytes and the US demo). |
| **US · A vs BEFORE** | 1,350 of 2,149 US views change, every one listed with its cause (code or words) in `scripts/fixtures/language-phase-2-us-changed.txt`. |
| **US words** | 0 hits to fix; 152 hits allowed, each with a reason (below). |
| **US tickets** | 159 US tickets, 4,456 printed lines read back from their bytes, double width counted. Widest: 32/32 columns at 58 mm, 48/48 at 80 mm. Every byte is ASCII or a known ESC/POS command. A self-test shows the reader catches an over-long line, an over-long double-width line and a "£". |

US changed views by area:

| Area | Changed / US views |
|---|---|
| 1a api | 16/31 |
| 1a emails | 52/88 |
| 1a order page | 57/69 |
| 1a shared pieces | 6/8 |
| 1a status page | 14/18 |
| 1a WhatsApp | 1/8 |
| 1b api | 40/71 |
| 1b components | 482/560 |
| 1b dashboard | 125/216 |
| 1b KDS | 59/101 |
| 1b native | 33/54 |
| 1b operator mail | 43/56 |
| 1b printing | 160/165 |
| 1c api | 17/153 |
| 1c auth | 32/84 |
| 1c demo | 114/183 |
| 1c goLive | 21/44 |
| 1c setup | 24/148 |
| Phase 2 extra views | 54/92 |

**The NAMED table** (`scripts/_lp2-named.cjs`) drives this harness and the 1a/1b/1c harnesses. "Precise" means BEFORE with the transform applied must equal AFTER byte for byte.

| Entry | Country | Kind | Views |
|---|---|---|---:|
| P2-deletion-email-date (ISO → long date) | GB, US | precise | 4 |
| P2-save-email-date-US | US | precise | 6 |
| P2-dashboard-off-since | GB, US | precise | 2 |
| P2-sept-sep ("Sept"/"SEPT" → "Sep"/"SEP") | GB | precise | 6 |
| P2-preorder-US | US | precise | 43 |
| P2-us-clock ("6:30pm" → "6:30 PM") | US | precise | 723 |
| P2-us-clock-tickets (padding moves; covered by the fit check) | US | listed | 140 |
| P2-demo-US | US | listed | 4 |
| P3-buzzer-removed | GB, US | precise | 0 (no fixture reaches the path; kept so one would be proven) |

**The US words check** reads what a person sees:
- text and value/placeholder/aria-label/title/alt;
- email subject, text and HTML text;
- decoded ticket bytes;
- API bodies' human strings.

It fails on every word in your list. **Allow-list (each scoped to its views and surrounding text):**

| Word | Hits | Reason |
|---|---:|---|
| co.uk | 25 | the sender / reply-to address `hello@villagefoodie.co.uk` (infrastructure, not wording) |
| van | 95 | van names the operator stored ("Van 1", "Big van", "Van A") in fixtures built before this phase, and a cancel note the operator typed ("the van broke down") |
| van | 1 | a `provisionTruck` developer warning that no screen shows |
| £ | 10 | the reject-modal fixture passes a literal " · £43.90" prop |
| Unauthorised | 9 | a refusal before the truck is known (no or bad token); the screen shows the code in its own locale |
| collect | 5 | the ticket's "no truck" robustness variant: with no truck there is no country |
| cancelled / collect | 6 | stubbed server-reply strings in fixtures; an owner with no truck (deletion email, default locale) |
| postcode | 1 | Manage's schedule card (Phase 1d), included only for its date |

### The other harnesses
- **language-phase-0** 168 · **1a** 1,050 · **1b** 3,522 · **1c** 4,498.
  - Each runs on the 460ba55 words by default, so each still asserts exactly what it asserted: moving the words was invisible.
  - Part 2's code changes are applied as named transforms.
  - 1b's count fell from 3,687 because its 165 US ticket, test-ticket and preview views are now proven by the fit check in language-phase-2.
- **messages-parity 9,812.**
  - **AREAS BEFORE:** Phase 0, 1a, 1b, 1c. **AFTER:** Phase 0, 1a, 1b, 1c, Phase 2.
  - The 1a/1b/1c areas read the 460ba55 en-GB (counts 411 / 982 / 379, as at 460ba55).
  - **New `_messages-parity-2`:**
    - every en-US key exists in en-GB and differs from it;
    - same ICU arguments;
    - `ticket` en-US is ASCII;
    - the GB named list equals the diff;
    - `capacityDesc`'s old text equals 460ba55's inline text.
- **messages-split 93; split-messages --check; ui-literals** (baseline unchanged at 1,684).
- **tsc --noEmit:** clean. **next build:** exit 0. **Full sweep:** 123 run, 123 passed.
- **ESLint**, per rule, against `460ba55`, for all 61 touched or new source and harness files:
  - **No rule count grew in any of the 30 product source files.**
  - The harness `.cjs` files gained only `@typescript-eslint/no-require-imports`, as every CommonJS harness has (12 existing harnesses +1 to +3; 6 new files).

### Re-pins (each minimal; the reason is written in the file)
- **language-phase-0 / 1a / 1b / 1c:**
  - They default to the frozen 460ba55 words (except in capture mode).
  - Named Part 2 changes are applied to BEFORE.
  - 1b's US ticket views are listed and proven in language-phase-2.
  - Their "en-US is still {}" checks now assert it for the catalogue the run renders with.
  - Node-side message reads (`_language-phase-1a-after`, `_lp1b-api`, `_lp1c-api`, `_language-phase-0-after`) use the frozen catalogue.
  - `_language-phase-0-after` also allows `'mains'` in `lib/demo-templates.ts`, where it is the standard category id.
- **The 1b components fixture:** the reject and event-cancel `<select>` states now hold the label as the run's catalogue renders it. A hard-coded label silently dropped "Too busy" once its apostrophe changed.
- **`_lp1b-dashboard`:** the US `finishConfirm.endTime` input "9:00pm" → "9:00 PM", the form `formatTime` now hands it.
- **printing-copy, printing-network-guard, printing-transport-contract:** Part 3's ’, and `device_id_required`'s new words.
- **money-sweep-parity, order-charges, phone-parity, phase3-screens, time-dates-parity:**
  - All default to the frozen words. money-sweep has its own bundler, so it gained the same hook.
  - time-dates-parity's US expectations follow the new clock ("6:30 PM", "5:00 PM – 9:30 PM", "8:00 PM").
- **event-types:** its "where did the dashboard's words go" proof reads the frozen catalogue. The three Phase 2 moves (capacity text, `orders.status`, `eventBar.status`) are allowed, and their replacements asserted.
- **event-pricing:** the three pre-order label calls gained `truckTime`. They are excused by count, and their replacements asserted.
- **add-order-fit-message:** the pinned call now matches the call with the truck's clock.
- **screenshot-truck-details:** the inbound-schedule allow-list now accepts the two changed date lines.

---

## 5 · Decisions recorded
1. **US clock "5:00 PM"**, chosen by locale in one function (top of report).
2. **The US demo's words live in messages** (`provisionContent`, keyed by id), so all US wording is in `en-US.json`. The demo templates keep only ids and prices.
3. **The visitor's country** is read from the request (`?country`, cookie, IP), switched-on countries only, by `visitorCountryCodeOf`. It doesn't use `resolveVisitorCountry`, because that needs `next/headers`, which the route harnesses can't provide.
4. **Dates use the truck's clock.** Save-email, deletion and "Off since" take the date on the truck's clock, not UTC (the §2.2 edge).
5. **"Off since"'s raw ISO date** gets the locale's long date for both countries, like the deletion email, so there is one design.
6. **Part 3 moved raw field names in kitchen refusals into plain words.** Each was a code fragment that could only reach a screen on a bad request.
7. **Signup, login and password pages stay en-GB** until they know the visitor's country (plumbing, not wording).

---

## 6 · Listed for later
1. **US layout risks** (measured; US is off):
   - **The dashboard's DayLoadStrip** time column (`w-10`): "12:30 PM" runs into the dot. GB "18:30" fits. The fix (`min-w-10`) would change the GB HTML class string, so I left it.
   - **TruckListCard** (`w-[112px]`): US ranges with "● Live" wrap (GB "17:00 – 21:00 ● Live" already does).
   - **OrderCard and KDS headers:** longer US times truncate the order number sooner on narrow tiles.
2. **GB words still wrong or stale, not in your list:**
   - "Settings → Vans" (`goLive.noVan.where`, `nativeShell.setup.*`) names a section whose real heading is "Your trucks";
   - the title-case "Menu & Stock" and "Customer / Your Collection Times" (GB);
   - "Only 1 pizzas left!" (the noun is the truck's own category name);
   - straight double quotes in "contains none" and "Start a new service".
3. **Rule 6:** `RejectOrderModal` and `EventCancelModal` still use the display label as the `<select>` value and store the label as the reason. Store the id instead (1b §6 item 3).
4. **UK words outside these surfaces:**
   - Manage (Phase 1d): `lib/copy/serviceSettings.ts` vans and "Collection times", `lib/settings-copy.ts`, `lib/private-events/copy.ts` ("straight away", "Untick", "postcode"), `lib/copy/socialPosts.ts` (colour, centre), TakingPaymentPanel (takings, till), KitchenCapacitySection, and much of `app/manage/[token]/page.tsx`;
   - the kitchen-capacity explainer's Manage copy (now duplicated with the dashboard's message until 1d);
   - the operator WhatsApp "Collection:" line (`orders/submit`);
   - the public truck page ("pitching up", "Drop us a message");
   - `whatsapp-classifier` feeds "TBC" into the AI reply prompt (rule 10).
5. **AI-read menus for a US truck still use UK standard categories** ("Starters", "Mains"). That needs the menu-reading prompt's vocabulary (rule 10).
6. **Admin "create truck"** always sends "Van 1".
7. **"Sept" outside these surfaces:**
   - Manage `SocialPosts.tsx:286` and `SchedulePlaces.tsx:115`;
   - outreach `lib/outreach-sequence.ts:174` (may reach prospects) and `lib/outreach-workspace.ts`;
   - admin screens.
8. **Stale "6:30pm" comments** in seven files (order page, dashboard-read, mapOrderToTicket, testTicket, usePrinting, schedule-graphics places, OrderCard).
9. **Unused copy** still in code: `OFFLINE_PROTECTION_SWITCH_HELP`, the `paymentWarning` sentences (checked only as a flag), `types.ts` STATUS labels and `eventStatusDisplay().label` (no kitchen screen reads them now).
10. **Leftover git worktrees:** `slot-head-escpos-*` and `slot-head-et-*` are other harnesses' own worktrees, some marked prunable. They were not made by this phase and are untouched.

---

## 7 · Files

### Product code
- **i18n and dates:**
  - `lib/time-utils.ts` (`formatShortDate`, `formatLongDate`, `formatYmdShortMonth`, the locale clock rule);
  - `lib/preorder.ts`; `lib/slot-fit-message.ts`; `lib/event-display.ts`.
- **Provisioning:**
  - `lib/demo-templates.ts`, `lib/demo-assumptions.ts`, `lib/provision-demo.ts`, `lib/provision-truck.ts`, `lib/visitor-country.ts`;
  - `app/api/demo/route.ts`, `app/api/admin/provision-demo/route.ts`.
- **Routes:**
  - `app/api/menu/[truckId]/route.ts`, `app/api/demo/save-email/route.ts`, `app/api/account/request-deletion/route.ts`, `app/api/inbound-schedule/route.ts`.
- **Pages:**
  - `app/trucks/[slug]/order/page.tsx`;
  - `app/dashboard/[token]/page.tsx` and `kds/page.tsx`;
  - `app/manage/[token]/page.tsx` (the six date lines).
- **Components:**
  - `components/TruckListCard.tsx`;
  - `components/dashboard/{AddOrderPanel,BuzzerGrid,DemoWelcome,OrderCard}.tsx`;
  - `components/shared/{EventCancelModal,EventPickerPanel}.tsx`.
- **Other lib:**
  - `lib/order-completion-label.ts`, `lib/go-live-text.ts`, `lib/printing/ticket.ts` (`padBetween`), `lib/native/useGatedActionResult.tsx` (comment).

### Messages
- `messages/en-GB.json` (196 changed, 50 new keys) and `messages/en-US.json` (213).
- Generated: `messages/ns/**` and `lib/i18n/catalog/*`, including the new `provisionContent`.

### Harnesses
**New:**
- `scripts/language-phase-2.cjs`;
- `scripts/_lp2-{frozen,extra,text,named,checks}.cjs`;
- `scripts/_messages-parity-2.cjs`;
- `scripts/fixtures/language-phase-2-messages-before.json`;
- `scripts/fixtures/language-phase-2-before/` (14 files, gz);
- `scripts/fixtures/language-phase-2-gb-named.json`;
- `scripts/fixtures/language-phase-2-us-changed.txt`.

**Changed:**
- `scripts/_render-kit.cjs`, `scripts/messages-parity.cjs`, `scripts/harnesses.json`;
- the re-pins in §4.

---

## Appendix — every message changed (generated from the files, so it matches them exactly)

### A1 · GB typography only (150 keys: straight apostrophe → ’, "..." → "…", " - " → " — ")

| key | before | after |
|---|---|---|
| `order.taxNotice` | Menu prices don't include {tax}. It's added below. | Menu prices don’t include {tax}. It’s added below. |
| `order.loadingOrder` | Loading your order... | Loading your order… |
| `order.loadingMenu` | Loading menu... | Loading menu… |
| `order.eventsLoadFailed` | We couldn't load this truck's events. | We couldn’t load this truck’s events. |
| `order.pausedOfflineBody` | We're having a connection issue but you can still order at the window. Check back soon! | We’re having a connection issue but you can still order at the window. Check back soon! |
| `order.notOpenBody` | {truck} hasn't confirmed this event yet. Check back closer to the date or follow them on social media for updates. | {truck} hasn’t confirmed this event yet. Check back closer to the date or follow them on social media for updates. |
| `order.loadingEvents` | Loading events... | Loading events… |
| `order.loadingTimes` | Loading available times... | Loading available times… |
| `order.stockNotice` | Sorry — {detail} now. We've updated your order — please review and confirm. | Sorry — {detail} now. We’ve updated your order — please review and confirm. |
| `order.placingOrder` | Placing order... | Placing order… |
| `order.thanksReady` | Thanks! We've received your order and it'll be ready soon. | Thanks! We’ve received your order and it’ll be ready soon. |
| `order.cardFallback` | We couldn't start the card payment, so your order is set to pay at the truck instead. Your order is placed — nothing has been charged. | We couldn’t start the card payment, so your order is set to pay at the truck instead. Your order is placed — nothing has been charged. |
| `dashboard.toast.notOnBoard` | That order is not on this board - check the event | That order is not on this board — check the event |
| `dashboard.gate.loading` | Loading dashboard... | Loading dashboard… |
| `dashboard.gate.cantTakeOrders` | Can't take orders on this device right now | Can’t take orders on this device right now |
| `dashboard.gate.noOrdersSaved` | We couldn't reach your orders, and there's nothing saved on this device yet. | We couldn’t reach your orders, and there’s nothing saved on this device yet. |
| `dashboard.gate.openOnceOnline` | Open the app once while you're connected and it will work offline after that. | Open the app once while you’re connected and it will work offline after that. |
| `dashboard.demo.endedBody` | Start a new one and we'll set up a fresh service for right now — your menu stays as it is. | Start a new one and we’ll set up a fresh service for right now — your menu stays as it is. |
| `dashboard.demo.lockWhy` | We keep one event running in the demo so there's always something to play with. You get full control when you sign up. | We keep one event running in the demo so there’s always something to play with. You get full control when you sign up. |
| `dashboard.pin.unreachable` | Can't reach the server right now. Your PIN is fine — try again in a moment. | Can’t reach the server right now. Your PIN is fine — try again in a moment. |
| `dashboard.refund.settled` | {amount} has been refunded to the customer's card. | {amount} has been refunded to the customer’s card. |
| `dashboard.cancelModal.refundQuestion` | Cancel this order and refund {amount} to the customer's card? | Cancel this order and refund {amount} to the customer’s card? |
| `dashboard.cancelModal.noRefund` | The order will be cancelled and the {amount} will stay with you. Nothing goes back to the customer's card. | The order will be cancelled and the {amount} will stay with you. Nothing goes back to the customer’s card. |
| `dashboard.cancelModal.notePlaceholder` | Add more detail for the customer... | Add more detail for the customer… |
| `dashboard.switchEventConfirm` | You're currently serving at {current}. Switch to {next}? Tap the current event to switch back. | You’re currently serving at {current}. Switch to {next}? Tap the current event to switch back. |
| `dashboard.banner.boardUnavailable` | Couldn't load today's orders. You can still take new orders on this device. | Couldn’t load today’s orders. You can still take new orders on this device. |
| `dashboard.orders.prepBannerBody` | Your menu is using default prep times. Update them in Manage so your kitchen doesn't get overwhelmed with orders. | Your menu is using default prep times. Update them in Manage so your kitchen doesn’t get overwhelmed with orders. |
| `dashboard.prep.buttonTitle` | Today's prep list | Today’s prep list |
| `dashboard.addTab.noMenuSaved` | Your menu isn't saved on this device, so there's nothing to build an order from. | Your menu isn’t saved on this device, so there’s nothing to build an order from. |
| `dashboard.settings.layoutScrollHelp` | Show every item in one scrolling list, with a heading for each category. There are no category buttons - you scroll to move around. Best for shorter menus, where you can see most of it at once. | Show every item in one scrolling list, with a heading for each category. There are no category buttons — you scroll to move around. Best for shorter menus, where you can see most of it at once. |
| `dashboard.settings.intervalsHelp` | How far apart collection times are. This doesn't change kitchen capacity or prep times. | How far apart collection times are. This doesn’t change kitchen capacity or prep times. |
| `dashboard.common.savingDots` | Saving... | Saving… |
| `dashboard.stock.loadingMenu` | Loading menu... | Loading menu… |
| `dashboard.stock.optionsHelp` | Shared across all dishes that use them. This count does <b>not</b> reset per event — it's a running total for the whole service. | Shared across all dishes that use them. This count does <b>not</b> reset per event — it’s a running total for the whole service. |
| `dashboard.stock.howFirst` | Whichever runs out first applies — the category pool or the item's own limit. | Whichever runs out first applies — the category pool or the item’s own limit. |
| `dashboard.finish.early` | This event isn't scheduled to finish until {time}. No more orders will be allowed. Confirm to end event? | This event isn’t scheduled to finish until {time}. No more orders will be allowed. Confirm to end event? |
| `dashboard.pause.body` | Customers can still browse the menu but won't be able to order. | Customers can still browse the menu but won’t be able to order. |
| `dashboard.kds.body` | Choose which van's kitchen screen to open: | Choose which van’s kitchen screen to open: |
| `dashboard.edit.repriceBody` | These are new to this order and aren't on the menu, so the price couldn't be checked. Everything already on the order keeps its original price. Nothing has been saved yet. | These are new to this order and aren’t on the menu, so the price couldn’t be checked. Everything already on the order keeps its original price. Nothing has been saved yet. |
| `errorsCustomer.sold_out_paying` | {names} sold out while you were paying. We've removed {count, plural, one {it} other {them}} and have not taken any money — please check your order before placing it again. | {names} sold out while you were paying. We’ve removed {count, plural, one {it} other {them}} and have not taken any money — please check your order before placing it again. |
| `errorsCustomer.sold_out_ordering` | {names} sold out while you were ordering. We've removed {count, plural, one {it} other {them}} — please check your order before placing it again. | {names} sold out while you were ordering. We’ve removed {count, plural, one {it} other {them}} — please check your order before placing it again. |
| `whatsappCustomer.menuSummary` | {opener}We've got {summary}. Check out the full menu and order ahead here: {url} — {truck} {emoji} | {opener}We’ve got {summary}. Check out the full menu and order ahead here: {url} — {truck} {emoji} |
| `orderStatus.loading` | Loading your order... | Loading your order… |
| `orderStatus.cancelling` | Cancelling... | Cancelling… |
| `emailCustomer.payNote.unknownTitle` | We're still confirming your payment | We’re still confirming your payment |
| `emailCustomer.payNote.unknownText` | We're still confirming your payment. Your card was authorised, so please do not pay again — {truck} will confirm at the hatch. | We’re still confirming your payment. Your card was authorised, so please do not pay again — {truck} will confirm at the hatch. |
| `emailCustomer.payNote.unknownReady` | We're still confirming your payment — please do not pay again. | We’re still confirming your payment — please do not pay again. |
| `emailCustomer.confirmation.weWillConfirm` | We'll confirm your collection time when we accept your order. | We’ll confirm your collection time when we accept your order. |
| `emailCustomer.confirmation.leadConfirmed` | Thanks! We've received your order and we're getting it ready. | Thanks! We’ve received your order and we’re getting it ready. |
| `emailCustomer.confirmation.leadReceived` | Thanks! We've received your order — we'll let you know once it's confirmed. | Thanks! We’ve received your order — we’ll let you know once it’s confirmed. |
| `emailCustomer.confirmation.textPreferred` | Preferred collection: {time} — we'll confirm when we accept your order. | Preferred collection: {time} — we’ll confirm when we accept your order. |
| `emailCustomer.common.sorry` | We're sorry for any inconvenience. | We’re sorry for any inconvenience. |
| `emailCustomer.eventCancellation.body` | Unfortunately <b>{truck}</b>'s event{withLocation, select, yes { at {location}} other {}}{withDate, select, yes { on {date}} other {}} has been cancelled. | Unfortunately <b>{truck}</b>’s event{withLocation, select, yes { at {location}} other {}}{withDate, select, yes { on {date}} other {}} has been cancelled. |
| `emailCustomer.eventCancellation.textLead` | Hi {withName, select, yes {{name}} other {there}}, unfortunately {truck}'s event{withLocation, select, yes { at {location}} other {}}{withDate, select, yes { on {date}} other {}} has been cancelled. Your order #{id} has been cancelled. | Hi {withName, select, yes {{name}} other {there}}, unfortunately {truck}’s event{withLocation, select, yes { at {location}} other {}}{withDate, select, yes { on {date}} other {}} has been cancelled. Your order #{id} has been cancelled. |
| `emailCustomer.updated.subjectTotalMoved` | Order #{id} updated - now {total} (was {previous}) | Order #{id} updated — now {total} (was {previous}) |
| `errorsKitchen.no_van_for_device` | This device isn't set to a van yet, so wired printing isn't available. | This device isn’t set to a van yet, so wired printing isn’t available. |
| `errorsKitchen.net_address_invalid` | Enter the printer's address as 192.168.1.50 or 192.168.1.50:9100. | Enter the printer’s address as 192.168.1.50 or 192.168.1.50:9100. |
| `kitchenModals.reject.reason` | {reason, select, sold_out {Sold out of an item} too_busy {Too busy — can't make it in time} closing_soon {Closing soon} other {Other}} | {reason, select, sold_out {Sold out of an item} too_busy {Too busy — can’t make it in time} closing_soon {Closing soon} other {Other}} |
| `kitchenModals.reject.notePlaceholder` | Add more detail for the customer... | Add more detail for the customer… |
| `kitchenModals.eventCancel.messagePlaceholder` | e.g. Sorry, our trailer broke down on the way to the venue... | e.g. Sorry, our trailer broke down on the way to the venue… |
| `kitchenModals.finish.saving` | Saving... | Saving… |
| `printing.say.addressHelp` | Enter the printer's address as 192.168.1.50 or 192.168.1.50:9100. | Enter the printer’s address as 192.168.1.50 or 192.168.1.50:9100. |
| `printing.say.netRefused` | Can't reach the printer at {address} — it isn't accepting connections. | Can’t reach the printer at {address} — it isn’t accepting connections. |
| `printing.say.netTimeout` | Can't reach the printer at {address} — it didn't answer in time. | Can’t reach the printer at {address} — it didn’t answer in time. |
| `printing.say.netUnreachable` | Can't reach the printer at {address} — check it's on the same network. | Can’t reach the printer at {address} — check it’s on the same network. |
| `printing.say.netCantReach` | Can't reach the printer at {address} | Can’t reach the printer at {address} |
| `printing.say.guard.unknown` | Can't check which device is printing right now. | Can’t check which device is printing right now. |
| `printing.say.guard.unbound` | This device isn't set to a van yet, so wired printing isn't available. | This device isn’t set to a van yet, so wired printing isn’t available. |
| `printing.say.guard.pin` | Wired printing isn't available on dashboards with a PIN yet. | Wired printing isn’t available on dashboards with a PIN yet. |
| `printing.card.description` | Automatically print a kitchen ticket for each order when it's due. | Automatically print a kitchen ticket for each order when it’s due. |
| `printing.card.scanning` | Scanning... | Scanning… |
| `printing.card.connecting` | Connecting... | Connecting… |
| `printing.card.wiredUnavailable` | Wired printing isn't available right now. | Wired printing isn’t available right now. |
| `printing.card.addressHint` | Print the printer's settings page to find its address. Ask whoever set up your router to keep this address fixed. | Print the printer’s settings page to find its address. Ask whoever set up your router to keep this address fixed. |
| `printing.card.printing` | Printing... | Printing… |
| `kds.loading` | Loading kitchen... | Loading kitchen… |
| `kds.pin.unreachable` | Can't reach the server right now. Your PIN is fine — try again in a moment. | Can’t reach the server right now. Your PIN is fine — try again in a moment. |
| `kds.degraded.at` | ⚠️ Can't reach the server. Showing tickets from {time}. NEW ORDERS MAY BE MISSING. | ⚠️ Can’t reach the server. Showing tickets from {time}. NEW ORDERS MAY BE MISSING. |
| `kds.degraded.earlier` | ⚠️ Can't reach the server. Showing tickets from earlier. NEW ORDERS MAY BE MISSING. | ⚠️ Can’t reach the server. Showing tickets from earlier. NEW ORDERS MAY BE MISSING. |
| `kds.event.endEarly` | This event isn't scheduled to finish until {time}. No more orders will be allowed. Confirm to end event? | This event isn’t scheduled to finish until {time}. No more orders will be allowed. Confirm to end event? |
| `kds.intro.p1` | It's the cook's view — the orders you need to make, in the order to make them. The screen by the grill shows this while the counter uses the orders dashboard. | It’s the cook’s view — the orders you need to make, in the order to make them. The screen by the grill shows this while the counter uses the orders dashboard. |
| `kds.intro.p2` | Cards move across as you tap them, so whoever's cooking always knows what's next and nobody has to shout. Everything here is your demo data — have a play. | Cards move across as you tap them, so whoever’s cooking always knows what’s next and nobody has to shout. Everything here is your demo data — have a play. |
| `nativeShell.banner.paymentBody` | {orders} — marked paid on this device only. It hasn't gone through. | {orders} — marked paid on this device only. It hasn’t gone through. |
| `nativeShell.banner.iveChecked` | I've checked {orders} | I’ve checked {orders} |
| `nativeShell.banner.statusBody` | ⚠ {orders} — this change didn't go through. Check the order. | ⚠ {orders} — this change didn’t go through. Check the order. |
| `nativeShell.lock.cantUseBiometric` | Can't use Face / Touch ID? | Can’t use Face / Touch ID? |
| `nativeShell.lock.forgot` | Forgot your PIN? You'll need to reinstall the app. | Forgot your PIN? You’ll need to reinstall the app. |
| `nativeShell.van.loadRetry` | Couldn't load · Retry | Couldn’t load · Retry |
| `nativeShell.setup.fetchErrorTitle` | Couldn't load device setup | Couldn’t load device setup |
| `nativeShell.setup.fetchErrorBody` | We couldn't reach the server to set up <b>this device</b>. Check the connection and try again — your orders and settings are unaffected. | We couldn’t reach the server to set up <b>this device</b>. Check the connection and try again — your orders and settings are unaffected. |
| `nativeShell.device.viewing` | You're viewing: <b>{truck}</b> | You’re viewing: <b>{truck}</b> |
| `nativeShell.device.viewingVan` | You're viewing: <b>{truck}</b> — <b>{van}</b> | You’re viewing: <b>{truck}</b> — <b>{van}</b> |
| `nativeShell.device.pinHelp` | Your way in if fingerprint or face unlock won't work — it's the only fallback, so don't forget it (a forgotten PIN means reinstalling the app). Works offline. | Your way in if fingerprint or face unlock won’t work — it’s the only fallback, so don’t forget it (a forgotten PIN means reinstalling the app). Works offline. |
| `nativeShell.offlineAlert.pausedBody` | You're offline — customer ordering is paused. | You’re offline — customer ordering is paused. |
| `nativeShell.offlineAlert.offlineTitle` | You're offline | You’re offline |
| `buzzer.lostTitle` | Order #{id} doesn't have a buzzer | Order #{id} doesn’t have a buzzer |
| `dashboardBanners.wakeUnsupported` | This device can't keep the screen on. | This device can’t keep the screen on. |
| `dashboardBanners.wakeInsecure` | The screen can't be kept on from this address. | The screen can’t be kept on from this address. |
| `demo.loopLands` | That's exactly how a real order lands | That’s exactly how a real order lands |
| `paymentActions.offlineBody` | Payment changes can't be made while offline. Refunds and removing a recorded payment both have to reach the payment provider, so they can't be saved on this device and sent later. | Payment changes can’t be made while offline. Refunds and removing a recorded payment both have to reach the payment provider, so they can’t be saved on this device and sent later. |
| `paymentActions.paidByCardBody` | Order <b>#{orderId}</b> was paid by card, so there is no payment record to remove here — the money is already on the customer's card. | Order <b>#{orderId}</b> was paid by card, so there is no payment record to remove here — the money is already on the customer’s card. |
| `paymentActions.footer` | This sends the money back to the customer's card. It cannot be undone from here. | This sends the money back to the customer’s card. It cannot be undone from here. |
| `orderCard.conflictStatus` | Last update didn't sync | Last update didn’t sync |
| `addOrder.catClosed` | {cat} is closed for online orders this event — hidden from customers. You can still add for the hatch; you'll be asked to confirm. | {cat} is closed for online orders this event — hidden from customers. You can still add for the hatch; you’ll be asked to confirm. |
| `addOrder.optionOversellConfirm` | Only a limited amount of "{option}" left — and it's shared across ALL dishes that use it.\n\nProceed anyway (oversell)?\n\nOK = proceed anyway   ·   Cancel = edit the order | Only a limited amount of "{option}" left — and it’s shared across ALL dishes that use it.\n\nProceed anyway (oversell)?\n\nOK = proceed anyway   ·   Cancel = edit the order |
| `addOrder.offlineNotSent` | Couldn't reach the server — you appear to be offline. The order was NOT sent. Keep this panel open and retry when you reconnect. | Couldn’t reach the server — you appear to be offline. The order was NOT sent. Keep this panel open and retry when you reconnect. |
| `addOrder.confirmingDots` | Confirming... | Confirming… |
| `addOrder.todayNotOpen` | Today's event — not yet open for orders. Orders will be queued and visible when you open the event. | Today’s event — not yet open for orders. Orders will be queued and visible when you open the event. |
| `addOrder.eventEnded` | This event has ended — you're adding an order after close. Make sure you've selected the right event. | This event has ended — you’re adding an order after close. Make sure you’ve selected the right event. |
| `alertsOperator.limit80.subject` | You've used 80% of this month's WhatsApp replies | You’ve used 80% of this month’s WhatsApp replies |
| `alertsOperator.limit80.nothingStopped` | Nothing has stopped. When you reach {limit}, automatic replies pause until your allowance resets on <b>{reset}</b> — customers can still message you, and you'll still see everything they send. | Nothing has stopped. When you reach {limit}, automatic replies pause until your allowance resets on <b>{reset}</b> — customers can still message you, and you’ll still see everything they send. |
| `alertsOperator.limit100.usedAll` | You've used all {limit} of this month's automatic WhatsApp replies, so they've paused. | You’ve used all {limit} of this month’s automatic WhatsApp replies, so they’ve paused. |
| `alertsOperator.limit100.stillReach` | <b>Customers can still message you as normal, and every message still reaches you.</b> The only thing that's stopped is the automatic reply going back out. | <b>Customers can still message you as normal, and every message still reaches you.</b> The only thing that’s stopped is the automatic reply going back out. |
| `alertsOperator.limit100.startAgain` | They'll start again on <b>{reset}</b>, or straight away if you raise your monthly limit in Settings. | They’ll start again on <b>{reset}</b>, or straight away if you raise your monthly limit in Settings. |
| `alertsOperator.limit100.startAgainLink` | They'll start again on {reset}, or straight away if you raise your monthly limit in Settings: | They’ll start again on {reset}, or straight away if you raise your monthly limit in Settings: |
| `alertsOperator.paymentBlocked.stopped` | WhatsApp has stopped your automatic replies going out because there's no working payment method on your WhatsApp Business account. | WhatsApp has stopped your automatic replies going out because there’s no working payment method on your WhatsApp Business account. |
| `alertsOperator.paymentBlocked.stillMessage` | <b>Customers can still message you, and you'll still see everything they send</b> — but the replies aren't reaching them. | <b>Customers can still message you, and you’ll still see everything they send</b> — but the replies aren’t reaching them. |
| `setup.verify.expired` | That confirmation link has expired. Get in touch and we'll sort it before you go live. | That confirmation link has expired. Get in touch and we’ll sort it before you go live. |
| `setup.verify.invalid` | That confirmation link didn't work. Get in touch and we'll sort it before you go live. | That confirmation link didn’t work. Get in touch and we’ll sort it before you go live. |
| `setup.identity.heading` | What's your truck called? | What’s your truck called? |
| `setup.identity.namePlaceholder` | Bob's Burgers | Bob’s Burgers |
| `walkthrough.intro` | Manage is where you set your truck up and see how it's doing. The Dashboard is where you take orders and run each event as it happens. | Manage is where you set your truck up and see how it’s doing. The Dashboard is where you take orders and run each event as it happens. |
| `walkthrough.stops.menu.body` | Your dishes, prices and allergens. Change anything here and it's live straight away. | Your dishes, prices and allergens. Change anything here and it’s live straight away. |
| `walkthrough.stops.schedule.body` | Where and when you're trading. Add an event here and customers can order for it. | Where and when you’re trading. Add an event here and customers can order for it. |
| `walkthrough.stops.settings.body` | Your truck's details and how customers pay. | Your truck’s details and how customers pay. |
| `auth.signup.subtitle` | Your free month doesn't start until you go live. | Your free month doesn’t start until you go live. |
| `auth.login.submitting` | Signing in... | Signing in… |
| `auth.forgot.sentBody` | If an account exists with that email address, you'll receive a reset link shortly. Check your spam folder if it doesn't arrive within a few minutes. | If an account exists with that email address, you’ll receive a reset link shortly. Check your spam folder if it doesn’t arrive within a few minutes. |
| `auth.forgot.subtitle` | Enter your email and we'll send a reset link | Enter your email and we’ll send a reset link |
| `auth.forgot.sending` | Sending... | Sending… |
| `auth.reset.saving` | Saving... | Saving… |
| `emailSignup.verify.why` | This is the address you'll log in with, and where order alerts go — so it's worth doing now. | This is the address you’ll log in with, and where order alerts go — so it’s worth doing now. |
| `emailSignup.verify.next` | Once it's confirmed I'll send you everything you need to get going. | Once it’s confirmed I’ll send you everything you need to get going. |
| `emailSignup.verify.fallbackLink` | If the button doesn't work, paste this in: {url} | If the button doesn’t work, paste this in: {url} |
| `emailSignup.welcome.intro` | {hasTruck, select, yes {I'm really pleased to welcome {truck} to HatchGrab.} other {I'm really pleased to welcome your truck to HatchGrab.}} | {hasTruck, select, yes {I’m really pleased to welcome {truck} to HatchGrab.} other {I’m really pleased to welcome your truck to HatchGrab.}} |
| `emailSignup.welcome.setup` | If you haven't already, setting up is straightforward and takes about fifteen minutes. | If you haven’t already, setting up is straightforward and takes about fifteen minutes. |
| `emailAccount.changeEmail.ignore` | If you didn't request this change, you can safely ignore this email. | If you didn’t request this change, you can safely ignore this email. |
| `emailAccount.resendVerification.ignore` | If you didn't request this, ignore this email. | If you didn’t request this, ignore this email. |
| `emailAccount.passwordReset.ignore` | If you didn't request this, you can safely ignore this email. | If you didn’t request this, you can safely ignore this email. |
| `emailAccount.passwordReset.unchanged` | Your password won't change until you click the link above. | Your password won’t change until you click the link above. |
| `emailAccount.deletionScheduled.kept` | When the account is deleted we remove your personal details and your customers' details. We keep\n    anonymous accounting records, which we are legally required to retain. | When the account is deleted we remove your personal details and your customers’ details. We keep\n    anonymous accounting records, which we are legally required to retain. |
| `demoGetStarted.upload.privacy` | We'll only use this to set up your truck and send your demo link — see our <link>privacy policy</link>. | We’ll only use this to set up your truck and send your demo link — see our <link>privacy policy</link>. |
| `demoGetStarted.sample.privacy` | We'll only use this to set up your truck and send your demo link — see our <link>privacy policy</link>. | We’ll only use this to set up your truck and send your demo link — see our <link>privacy policy</link>. |
| `demoGetStarted.saveOnly.privacy` | We'll only use this to send your demo link — see our <link>privacy policy</link>. | We’ll only use this to send your demo link — see our <link>privacy policy</link>. |
| `demoGetStarted.confirmEmailed` | We've emailed you a link straight back to this demo — no login needed. | We’ve emailed you a link straight back to this demo — no login needed. |
| `demoGetStarted.confirmKeepUntil` | We'll keep it until <b>{date}</b>. Your menu comes with you when you set up properly. | We’ll keep it until <b>{date}</b>. Your menu comes with you when you set up properly. |
| `demoGetStarted.readyTitle` | Your account's ready | Your account’s ready |
| `demoGetStarted.readyBody` | Now let's finish setting up your truck — your menu, allergens and kitchen. | Now let’s finish setting up your truck — your menu, allergens and kitchen. |
| `demoGetStarted.freeMonth` | Setting up won't start your free month. That begins when you pick your first live event — whenever you're ready. | Setting up won’t start your free month. That begins when you pick your first live event — whenever you’re ready. |
| `demoUpload.noPhoto` | Haven't got a menu photo to hand? | Haven’t got a menu photo to hand? |

### A2 · GB other wording fixes (46 keys)

| key | before | after |
|---|---|---|
| `order.confirmMissing` | We couldn&apos;t find that order. | We couldn’t find that order. |
| `order.allergenInfo` | ⓘ Allergen Info | ⓘ Allergen info |
| `dashboard.buzzer.removeFailed` | {target, select, order {Could not remove buzzer {prior} — it is still on order #{id}} other {Could not remove buzzer {prior} — it is still on this order}} | {has, select, no {{target, select, order {Could not remove the buzzer from order #{id}} other {Could not remove the buzzer from this order}}} other {{target, select, order {Could not remove buzzer {prior} — it is still on order #{id}} other {Could not remove buzzer {prior} — it is still on this order}}}} |
| `dashboard.prep.startBy` | Start by {time} · {far, select, yes {in {hours}h} other {{mins}min}} | Start by {time} · {far, select, yes {in {hours}h} other {{mins} min}} |
| `dashboard.settings.everyMinutes` | {n, plural, other {Every {count} minutes}} | {n, plural, one {Every minute} other {Every {count} minutes}} |
| `dashboard.edit.title` | Edit Order #{id} | Edit order #{id} |
| `errorsCustomer.cancel_window_passed` | {n, plural, other {Orders can no longer be cancelled within {count} minutes of collection}} | {n, plural, one {Orders can no longer be cancelled within {count} minute of collection} other {Orders can no longer be cancelled within {count} minutes of collection}} |
| `orderStatus.cutoffNote` | {n, plural, other {Cancellations accepted up to {count} minutes before pickup}} | {n, plural, one {Cancellations accepted up to {count} minute before pickup} other {Cancellations accepted up to {count} minutes before pickup}} |
| `emailCustomer.confirmation.cancelLine` | {n, plural, other {Need to cancel?<link>Cancel your order</link>(up to {count} minutes before your pickup time)}} | {n, plural, one {Need to cancel?<link>Cancel your order</link>(up to {count} minute before your pickup time)} other {Need to cancel?<link>Cancel your order</link>(up to {count} minutes before your pickup time)}} |
| `errorsKitchen.conflict` | conflict | This order has changed — check it and try again. |
| `errorsKitchen.item_name_required` | itemName required | Something went wrong — refresh the page and try again. |
| `errorsKitchen.event_id_required` | event_id required | Something went wrong — refresh the page and try again. |
| `errorsKitchen.option_id_required` | optionId required | Something went wrong — refresh the page and try again. |
| `errorsKitchen.category_required` | category required | Something went wrong — refresh the page and try again. |
| `errorsKitchen.missing_event_id` | Missing eventId | Something went wrong — refresh the page and try again. |
| `errorsKitchen.value_bool_or_clear` | value must be true, false, or null to clear | Something went wrong — refresh the page and try again. |
| `errorsKitchen.value_presses_or_clear` | value must be 'one', 'two', or null to clear | Something went wrong — refresh the page and try again. |
| `errorsKitchen.missing_order_key` | Missing order_key | Something went wrong — refresh the page and try again. |
| `errorsKitchen.value_bool` | value must be true or false | Something went wrong — refresh the page and try again. |
| `errorsKitchen.eventid_required` | eventId required | Something went wrong — refresh the page and try again. |
| `errorsKitchen.value_bool_or_null` | value must be true, false, or null | Something went wrong — refresh the page and try again. |
| `errorsKitchen.category_id_required` | categoryId required | Something went wrong — refresh the page and try again. |
| `errorsKitchen.device_id_required` | device_id required | Something went wrong — refresh the page and try again. |
| `errorsKitchen.van_not_for_truck` | van not found for this truck | Van not found for this truck |
| `errorsKitchen.invalid_default_screen` | invalid default_screen | Something went wrong — refresh the page and try again. |
| `errorsKitchen.device_and_truck_required` | device_id and target_truck_id required | Something went wrong — refresh the page and try again. |
| `errorsKitchen.not_truck_member` | not a member of that truck | Not a member of that truck |
| `errorsKitchen.van_not_for_target` | van not found for target truck | Van not found for the target truck |
| `kitchenModals.actions.startEvent` | {restart, select, yes {Restart Event} other {Start Event}} | {restart, select, yes {Restart event} other {Start event}} |
| `kds.banner.startEvent` | Start Event | Start event |
| `kds.toast.buzzerRemoveFailed` | Could not remove buzzer {n} — it is still on {target, select, order {order #{id}} other {this order}} | {had, select, no {Could not remove the buzzer from {target, select, order {order #{id}} other {this order}}} other {Could not remove buzzer {n} — it is still on {target, select, order {order #{id}} other {this order}}}} |
| `nativeShell.gate.status` | Order #{id} {action, select, confirm {confirmed} reject {rejected} ready {ready} collected {collected} undo_collected {restored} cancel {cancelled} other {{action}}} | Order #{id} {action, select, confirm {confirmed} reject {rejected} ready {ready} collected {collected} undo_collected {restored} cancel {cancelled} other {updated}} |
| `nativeShell.banner.offline` | 📴 No connection — {n, plural, one {{count} change} other {{count} changes}} saved on this device. They'll be sent when you're back online. Settings are locked. | 📴 No connection — {n, plural, one {{count} change saved on this device. It’ll be sent when you’re back online.} other {{count} changes saved on this device. They’ll be sent when you’re back online.}} Settings are locked. |
| `nativeShell.banner.stillQueued` | {n, plural, one {{count} change} other {{count} changes}} saved on this device. Still trying to send them. | {n, plural, one {{count} change saved on this device. Still trying to send it.} other {{count} changes saved on this device. Still trying to send them.}} |
| `buzzer.allTaken` | All {count} buzzers are out. Tap one to take it from another order. | {n, plural, one {The buzzer is out. Tap it to take it from another order.} other {All {count} buzzers are out. Tap one to take it from another order.}} |
| `addOrder.startEvent` | {restart, select, yes {Restart Event} other {Start Event}} | {restart, select, yes {Restart event} other {Start event}} |
| `addOrder.staleCheck` | Checked against the last data this device downloaded -- you're offline, so a newer order may not be counted. | Checked against the last data this device downloaded — you’re offline, so a newer order may not be counted. |
| `goLive.allergensItemsUnverified.detail` | {n, plural, other {{unverified} of your {total} dishes are hidden from customers until you confirm their allergens. A dish shown without confirmed allergens reads as "contains none", so the menu hides it rather than risk that.}} | {n, plural, one {Your dish is hidden from customers until you confirm its allergens.} other {{u, plural, one {{unverified} of your {total} dishes is hidden from customers until you confirm its allergens.} other {{unverified} of your {total} dishes are hidden from customers until you confirm their allergens.}}}} A dish shown without confirmed allergens reads as "contains none", so the menu hides it rather than risk that. |
| `goLive.kitchenCapacityUnset.unnamedVan` | unnamed van | Unnamed van |
| `goLive.emailUnknown.detail` | Email verification is not wired up yet (Phase 4 Step 2), so this cannot be evaluated. It blocks by design rather than passing silently. | Email verification is not wired up yet, so this cannot be evaluated. It blocks by design rather than passing silently. |
| `auth.reset.tooShort` | Password must be at least 8 characters | Password must be at least 8 characters. |
| `errorsOnboarding.change_id_required` | changeId required | Something went wrong — refresh the page and try again. |
| `errorsOnboarding.new_password_too_short` | Password must be at least {min, plural, one {# character} other {# characters}} | Password must be at least {min, plural, one {# character} other {# characters}}. |
| `emailAccount.deletionScheduled.readable` | Your dashboard stays\n    available to read for the next {days, plural, other {# days}}. | Your dashboard stays\n    available to read for the next {days, plural, one {# day} other {# days}}. |
| `demoSaveEmail.deletion` | This is a demo, so we don’t keep it forever — we’ll delete it and the menu on\n                <b>{date}</b> ({days, plural, other {# days}}). If you sign up before\n                then, your menu comes with you. | This is a demo, so we don’t keep it forever — we’ll delete it and the menu on\n                <b>{date}</b> ({days, plural, one {# day} other {# days}}). If you sign up before\n                then, your menu comes with you. |
| `demoGetStarted.error.truckUnreachable` | Your account’s ready, but we couldn’t reach us to create your truck. Try again. | Your account’s ready, but we couldn’t create your truck just now. Try again. |

### A3 · New en-GB keys (50; GB text = the words they replaced, except where named)

`dashboard.eventBar.status`, `dashboard.orders.status`, `dashboard.settings.capacityDesc`, `dashboard.settings.capacityExample`, `kitchenModals.picker.status`, `kds.header.cashIcon`, `kds.banner.eventStatus`, `demo.cashIcon`, `orderCard.markPaidAndCollected`, `orderCard.cashIcon`, `addOrder.cashIcon`, `provisionContent.firstVanName`, `provisionContent.demoCategories.pizza`, `provisionContent.demoCategories.burgers`, `provisionContent.demoCategories.mains`, `provisionContent.demoCategories.sides`, `provisionContent.demoCategories.drinks`, `provisionContent.demoTemplates.pizza.label`, `provisionContent.demoTemplates.pizza.items.margherita`, `provisionContent.demoTemplates.pizza.items.pepperoni`, `provisionContent.demoTemplates.pizza.items.ndujaHoney`, `provisionContent.demoTemplates.pizza.items.fourCheese`, `provisionContent.demoTemplates.pizza.items.gardenVeg`, `provisionContent.demoTemplates.pizza.items.garlicBread`, `provisionContent.demoTemplates.pizza.items.rocketParmesan`, `provisionContent.demoTemplates.pizza.items.olives`, `provisionContent.demoTemplates.pizza.items.sanPellegrino`, `provisionContent.demoTemplates.pizza.items.coke`, `provisionContent.demoTemplates.burgers.label`, `provisionContent.demoTemplates.burgers.items.classicCheeseburger`, `provisionContent.demoTemplates.burgers.items.doubleBacon`, `provisionContent.demoTemplates.burgers.items.buttermilkChicken`, `provisionContent.demoTemplates.burgers.items.halloumiStack`, `provisionContent.demoTemplates.burgers.items.smashBurger`, `provisionContent.demoTemplates.burgers.items.skinOnFries`, `provisionContent.demoTemplates.burgers.items.loadedCheeseFries`, `provisionContent.demoTemplates.burgers.items.onionRings`, `provisionContent.demoTemplates.burgers.items.craftLemonade`, `provisionContent.demoTemplates.burgers.items.coke`, `provisionContent.demoTemplates.curries.label`, `provisionContent.demoTemplates.curries.items.chickenTikkaMasala`, `provisionContent.demoTemplates.curries.items.lambRoganJosh`, `provisionContent.demoTemplates.curries.items.chanaMasala`, `provisionContent.demoTemplates.curries.items.butterChicken`, `provisionContent.demoTemplates.curries.items.saagPaneer`, `provisionContent.demoTemplates.curries.items.pilauRice`, `provisionContent.demoTemplates.curries.items.garlicNaan`, `provisionContent.demoTemplates.curries.items.onionBhaji`, `provisionContent.demoTemplates.curries.items.mangoLassi`, `provisionContent.demoTemplates.curries.items.coke`

### A4 · US overrides in messages/en-US.json (213 keys)

| key | en-GB | en-US |
|---|---|---|
| `provisionContent.firstVanName` | Van 1 | Truck 1 |
| `provisionContent.demoCategories.mains` | Mains | Entrées |
| `provisionContent.demoTemplates.pizza.label` | 🍕 Pizza van | 🍕 Pizza truck |
| `provisionContent.demoTemplates.pizza.items.gardenVeg` | Garden Veg | Garden Veggie |
| `provisionContent.demoTemplates.pizza.items.rocketParmesan` | Rocket & Parmesan | Arugula & Parmesan |
| `provisionContent.demoTemplates.burgers.label` | 🍔 Burger van | 🍔 Burger truck |
| `provisionContent.demoTemplates.curries.label` | 🍛 Curry van | 🍛 Curry truck |
| `provisionContent.demoTemplates.curries.items.pilauRice` | Pilau Rice | Pulao Rice |
| `order.state.confirmCancelled` | This order has been cancelled. | This order has been canceled. |
| `order.state.cardFormLoadFailed` | We could not load the card form — check your connection and try again. Your basket is saved, and you have not been charged. | We could not load the card form — check your connection and try again. Your cart is saved, and you have not been charged. |
| `order.tipNote` | 100% of your tip goes to the truck. Worked out on the food, before tax. | 100% of your tip goes to the truck. Calculated on the food, before tax. |
| `order.authFailed` | That payment could not be authorised. No money has been taken — please try another card, or choose Pay at the truck. | That payment could not be authorized. You have not been charged — please try another card, or choose Pay at the truck. |
| `order.couldNotPlace` | We could not place your order. No money has been taken. | We could not place your order. You have not been charged. |
| `order.paymentThrew` | Something went wrong taking that payment. No money has been taken — please try again, or choose Pay at the truck. | Something went wrong taking that payment. You have not been charged — please try again, or choose Pay at the truck. |
| `order.walkUpOnly` | This truck takes walk-up orders at the hatch. | This truck takes walk-up orders at the window. |
| `order.mealDeals` | 🎁 Meal deals | 🎁 Combos |
| `order.setupPending` | Set-up pending | Setup pending |
| `order.authorising` | Authorising… | Authorizing… |
| `order.collectionTimeTitle` | Collection time | Pickup time |
| `order.collectionTimeChosen` | ✓ Collection time: {time} | ✓ Pickup time: {time} |
| `order.payAtTruckLine` | Pay at the truck on collection · No card details needed | Pay at the truck at pickup · No card details needed |
| `order.modalAdd` | Add to basket · {amount} | Add to cart · {amount} |
| `order.collectionTime` | Collection time: {time} | Pickup time: {time} |
| `order.seeYou` | See you at the hatch! | See you at the window! |
| `order.preferredCollection` | Preferred collection: {time} | Preferred pickup: {time} |
| `order.willConfirmTime` | {truck} will confirm your collection time when they accept your order. | {truck} will confirm your pickup time when they accept your order. |
| `phone.invalidMobile` | {withName, select, yes {Please enter a valid {name} mobile} other {Please enter a valid mobile}}{withExample, select, yes { (e.g. {example})} other {}} | {withName, select, yes {Please enter a valid {name} phone number} other {Please enter a valid phone number}}{withExample, select, yes { (e.g. {example})} other {}} |
| `errorsCustomer.sold_out_paying` | {names} sold out while you were paying. We’ve removed {count, plural, one {it} other {them}} and have not taken any money — please check your order before placing it again. | {names} sold out while you were paying. We’ve removed {count, plural, one {it} other {them}} and you have not been charged — please check your order before placing it again. |
| `errorsCustomer.private_link_only` | This event takes orders by private link only. Please use the organiser’s link or QR code. | This event takes orders by private link only. Please use the organizer’s link or QR code. |
| `errorsCustomer.card_unavailable` | We could not set up card payment just now, so your order has not been placed and you have not been charged. Your basket is saved — please try again, or choose Pay at the truck. | We could not set up card payment just now, so your order has not been placed and you have not been charged. Your cart is saved — please try again, or choose Pay at the truck. |
| `errorsCustomer.cannot_cancel` | This order can no longer be cancelled | This order can no longer be canceled |
| `errorsCustomer.cancel_window_passed` | {n, plural, one {Orders can no longer be cancelled within {count} minute of collection} other {Orders can no longer be cancelled within {count} minutes of collection}} | {n, plural, one {Orders can no longer be canceled within {count} minute of pickup} other {Orders can no longer be canceled within {count} minutes of pickup}} |
| `errorsCustomer.order_not_placed` | Sorry — we could not place your order. No money has been taken. | Sorry — we could not place your order. You have not been charged. |
| `errorsCustomer.truck_not_taking_orders` | This truck is no longer taking orders. No money has been taken. | This truck is no longer taking orders. You have not been charged. |
| `errorsCustomer.category_closed_paying` | Sorry — {category} closed while you were paying, so we could not place your order. No money has been taken. | Sorry — {category} closed while you were paying, so we could not place your order. You have not been charged. |
| `deals.inYourBasket` | ── In your basket ── | ── In your cart ── |
| `deals.basketUnit` | {name}{withMods, select, yes { (+ {mods})} other {}} (in basket){state, select, used { — already in a deal} taken { — selected in another slot} other {}} | {name}{withMods, select, yes { (+ {mods})} other {}} (in cart){state, select, used { — already in a deal} taken { — selected in another slot} other {}} |
| `orderStatus.cancelledTitle` | Order cancelled | Order canceled |
| `orderStatus.cancelledBody` | Your order has been cancelled. If you paid by card, any refund is handled by {withTruck, select, yes {{truck}} other {the truck}} directly — please contact them about it. | Your order has been canceled. If you paid by card, any refund is handled by {withTruck, select, yes {{truck}} other {the truck}} directly — please contact them about it. |
| `orderStatus.statusCancelled` | This order has already been cancelled. | This order has already been canceled. |
| `orderStatus.statusTooLate` | This order can no longer be cancelled. | This order can no longer be canceled. |
| `orderStatus.statusName.collected` | collected | picked up |
| `orderStatus.statusName.cancelled` | cancelled | canceled |
| `orderStatus.cancelling` | Cancelling… | Canceling… |
| `privateLink.orderingOffBody` | This event isn’t taking orders online. Please order at the hatch. | This event isn’t taking orders online. Please order at the window. |
| `privateLink.replacedBody` | This link no longer works — {truck} has replaced it. Ask the organiser for the new link or QR code. | This link no longer works — {truck} has replaced it. Ask the organizer for the new link or QR code. |
| `privateLink.unknownBody` | This link doesn’t work. Check it with the organiser, or scan the QR code again. | This link doesn’t work. Check it with the organizer, or scan the QR code again. |
| `emailCustomer.payNote.partPaidTitle` | Part paid | Partially paid |
| `emailCustomer.payNote.partPaidTitleOwing` | Part paid — {balance} still to pay | Partially paid — {balance} still due |
| `emailCustomer.payNote.partPaidBody` | The rest is due when you collect. | The rest is due when you pick up. |
| `emailCustomer.payNote.partPaidBodyFigures` | {paid} of this order is paid. The remaining {balance} is due when you collect. | {paid} of this order is paid. The remaining {balance} is due when you pick up. |
| `emailCustomer.payNote.partPaidText` | Part paid. Some of this order is still to pay when you collect. | Partially paid. Some of this order is still due when you pick up. |
| `emailCustomer.payNote.partPaidTextFigures` | Part paid: {paid} received, {balance} still to pay when you collect. | Partially paid: {paid} received, {balance} still due when you pick up. |
| `emailCustomer.payNote.partPaidShortFigures` | {paid} paid, {balance} still to pay | {paid} paid, {balance} still due |
| `emailCustomer.payNote.stillToPay` | {amount} still to pay. | {amount} still due. |
| `emailCustomer.payNote.partStillToPay` | Part of this order is still to pay. | Part of this order is still due. |
| `emailCustomer.payNote.heldShortTitleOwing` | Your card is held for part of this order — {owing} still to pay | Your card is held for part of this order — {owing} still due |
| `emailCustomer.payNote.heldShortBody` | {truck} takes the amount held when they confirm your order. The rest is due when you collect. | {truck} takes the amount held when they confirm your order. The rest is due when you pick up. |
| `emailCustomer.payNote.heldShortBodyFigures` | {truck} takes the {held} held when they confirm your order. The remaining {owing} is due when you collect. | {truck} takes the {held} held when they confirm your order. The remaining {owing} is due when you pick up. |
| `emailCustomer.payNote.heldShortText` | Your card is held for part of this order. {truck} takes the amount held when they confirm your order, and the rest is due when you collect. | Your card is held for part of this order. {truck} takes the amount held when they confirm your order, and the rest is due when you pick up. |
| `emailCustomer.payNote.heldShortTextFigures` | Your card is held for {held}, which {truck} takes when they confirm your order. {owing} of this order is still to pay when you collect. | Your card is held for {held}, which {truck} takes when they confirm your order. {owing} of this order is still due when you pick up. |
| `emailCustomer.payNote.heldShortShortOwing` | Card held for part of this order, {owing} still to pay | Card held for part of this order, {owing} still due |
| `emailCustomer.payNote.unknownBody` | Your card was authorised, so please do not pay again — {truck} will confirm at the hatch. | Your card was authorized, so please do not pay again — {truck} will confirm at the window. |
| `emailCustomer.payNote.unknownText` | We’re still confirming your payment. Your card was authorised, so please do not pay again — {truck} will confirm at the hatch. | We’re still confirming your payment. Your card was authorized, so please do not pay again — {truck} will confirm at the window. |
| `emailCustomer.payNote.hatchTitle` | Pay at the truck on collection | Pay at the truck at pickup |
| `emailCustomer.payNote.hatchText` | Pay at the truck on collection. | Pay at the truck at pickup. |
| `emailCustomer.confirmation.slotUpdated` | Your collection time has been updated | Your pickup time has been updated |
| `emailCustomer.confirmation.collectionTime` | Collection time: {time} | Pickup time: {time} |
| `emailCustomer.confirmation.seeYou` | See you at the hatch! | See you at the window! |
| `emailCustomer.confirmation.preferredTime` | Preferred collection time: {time} | Preferred pickup time: {time} |
| `emailCustomer.confirmation.weWillConfirm` | We’ll confirm your collection time when we accept your order. | We’ll confirm your pickup time when we accept your order. |
| `emailCustomer.confirmation.leadReady` | Your order is ready for collection — come and collect from {truck}. | Your order is ready for pickup — come pick it up from {truck}. |
| `emailCustomer.confirmation.textTitleReady` | Order #{id} is ready to collect — {truck} | Order #{id} is ready to pick up — {truck} |
| `emailCustomer.confirmation.textReady` | Your order is ready for collection — come and collect. | Your order is ready for pickup — come pick it up. |
| `emailCustomer.confirmation.textSlotUpdated` | Collection time updated to {time} (was {previous}). | Pickup time updated to {time} (was {previous}). |
| `emailCustomer.confirmation.textCollection` | Collection time: {time}. See you at the hatch! | Pickup time: {time}. See you at the window! |
| `emailCustomer.confirmation.textPreferred` | Preferred collection: {time} — we’ll confirm when we accept your order. | Preferred pickup: {time} — we’ll confirm when we accept your order. |
| `emailCustomer.cancelSentence.heldReleased` | Your card was held for this order, not charged. That hold has been released and no money has been taken. | Your card was held for this order, not charged. That hold has been released and you have not been charged. |
| `emailCustomer.cancellation.subject` | Your order has been cancelled — {truck} | Your order has been canceled — {truck} |
| `emailCustomer.cancellation.body` | Your order <b>#{id}</b> from <b>{truck}</b> has been cancelled. | Your order <b>#{id}</b> from <b>{truck}</b> has been canceled. |
| `emailCustomer.cancellation.textLead` | Hi {withName, select, yes {{name}} other {there}}, your order #{id} from {truck} has been cancelled. | Hi {withName, select, yes {{name}} other {there}}, your order #{id} from {truck} has been canceled. |
| `emailCustomer.eventCancellation.subject` | {truck} at {withLocation, select, yes {{location}} other {your event}} — cancelled | {truck} at {withLocation, select, yes {{location}} other {your event}} — canceled |
| `emailCustomer.eventCancellation.body` | Unfortunately <b>{truck}</b>’s event{withLocation, select, yes { at {location}} other {}}{withDate, select, yes { on {date}} other {}} has been cancelled. | Unfortunately <b>{truck}</b>’s event{withLocation, select, yes { at {location}} other {}}{withDate, select, yes { on {date}} other {}} has been canceled. |
| `emailCustomer.eventCancellation.orderCancelled` | Your order <b>#{id}</b> has been cancelled. | Your order <b>#{id}</b> has been canceled. |
| `emailCustomer.eventCancellation.textLead` | Hi {withName, select, yes {{name}} other {there}}, unfortunately {truck}’s event{withLocation, select, yes { at {location}} other {}}{withDate, select, yes { on {date}} other {}} has been cancelled. Your order #{id} has been cancelled. | Hi {withName, select, yes {{name}} other {there}}, unfortunately {truck}’s event{withLocation, select, yes { at {location}} other {}}{withDate, select, yes { on {date}} other {}} has been canceled. Your order #{id} has been canceled. |
| `emailCustomer.rejection.body` | Unfortunately <b>{truck}</b> is unable to fulfil order #{id}. | Unfortunately <b>{truck}</b> is unable to fulfill order #{id}. |
| `emailCustomer.rejection.textLead` | Unfortunately {truck} is unable to fulfil order #{id}. | Unfortunately {truck} is unable to fulfill order #{id}. |
| `setup.verify.expired` | That confirmation link has expired. Get in touch and we’ll sort it before you go live. | That confirmation link has expired. Get in touch and we’ll fix it before you go live. |
| `setup.verify.invalid` | That confirmation link didn’t work. Get in touch and we’ll sort it before you go live. | That confirmation link didn’t work. Get in touch and we’ll fix it before you go live. |
| `setup.identity.phoneHelp` | Customers see this on their order confirmation so they can ask about an order. The tick decides whether that reads “Call us” or “WhatsApp us”. You can change both in Settings. | Customers see this on their order confirmation so they can ask about an order. The checkbox decides whether that reads “Call us” or “WhatsApp us”. You can change both in Settings. |
| `goLive.noVan.title` | Add a van | Add a truck |
| `goLive.noVan.detail` | Events run against a van — without one there is nothing to take orders through. | Events run against a truck — without one there is nothing to take orders through. |
| `goLive.noVan.where` | Settings → Vans | Settings → Your trucks |
| `goLive.kitchenCapacityUnset.detail` | No capacity is set for {vans}. Without it we will keep promising customers collection times your kitchen has no way to hit. | No capacity is set for {vans}. Without it we will keep promising customers pickup times your kitchen has no way to hit. |
| `goLive.kitchenCapacityUnset.unnamedVan` | Unnamed van | Unnamed truck |
| `goLive.noPrepBearingCategory.detail` | {categories, select, none {You have no menu categories yet, so we have no way to work out how long an order takes.} other {None of your categories has a cooking time set, so every order looks instant to us. We would keep giving customers collection times your kitchen has no chance of hitting, and the busier you get the further out they would be.}} | {categories, select, none {You have no menu categories yet, so we have no way to work out how long an order takes.} other {None of your categories has a cooking time set, so every order looks instant to us. We would keep giving customers pickup times your kitchen has no chance of hitting, and the busier you get the further out they would be.}} |
| `walkthrough.stops.menu.body` | Your dishes, prices and allergens. Change anything here and it’s live straight away. | Your dishes, prices and allergens. Change anything here and it’s live right away. |
| `walkthrough.stops.schedule.body` | Where and when you’re trading. Add an event here and customers can order for it. | Where and when you’re serving. Add an event here and customers can order for it. |
| `walkthrough.stops.build.body` | Deals, upsells, customisations and your kitchen capacity live under Menu — have a play around. | Deals, upsells, customizations and your kitchen capacity live under Menu — try them out. |
| `auth.signup.emailPlaceholder` | you@yourtruck.co.uk | you@yourtruck.com |
| `emailSignup.verify.next` | Once it’s confirmed I’ll send you everything you need to get going. | Once it’s confirmed I’ll send you everything you need to get started. |
| `emailSignup.verify.carryOn` | You can carry on setting up in the meantime. | You can continue setting up in the meantime. |
| `emailSignup.welcome.lookingForward` | {hasTruck, select, yes {Looking forward to seeing {truck} trading.} other {Looking forward to seeing your truck trading.}} | {hasTruck, select, yes {Looking forward to seeing {truck} serving customers.} other {Looking forward to seeing your truck serving customers.}} |
| `errorsOnboarding.unauthorised` | Unauthorised | Unauthorized |
| `emailAccount.deletionScheduled.cannotCancel` | <b>This cannot be cancelled from inside the app.</b> If this was not you, or you have\n    changed your mind, reply to this email as soon as possible. | <b>This cannot be canceled from inside the app.</b> If this was not you, or you have\n    changed your mind, reply to this email as soon as possible. |
| `demoSaveEmail.freshDay` | Each time you come back we’ll set up a fresh day’s trading so there’s something to play with. | Each time you come back we’ll set up a fresh day of service so there’s something to play with. |
| `demoGetStarted.upload.sub` | Your menu carries straight over. | Your menu carries right over. |
| `demoGetStarted.saveOnly.sub` | We’ll keep it for 14 days and email you a link straight back. | We’ll keep it for 14 days and email you a link right back. |
| `demoGetStarted.confirmEmailed` | We’ve emailed you a link straight back to this demo — no login needed. | We’ve emailed you a link right back to this demo — no login needed. |
| `demoGetStarted.emailPlaceholder` | you@yourtruck.co.uk | you@yourtruck.com |
| `demoUpload.emailPlaceholder` | you@yourtruck.co.uk | you@yourtruck.com |
| `demoUpload.sampleWhileYouWait` | Or look round with a sample menu while you wait | Or look around with a sample menu while you wait |
| `demoUpload.orSample` | Or look round with a sample menu | Or look around with a sample menu |
| `demoUpload.noPhoto` | Haven’t got a menu photo to hand? | Don’t have a menu photo handy? |
| `demoUpload.noPhotoBody` | Look round with a sample truck instead — you can upload yours any time. | Look around with a sample truck instead — you can upload yours any time. |
| `orderCard.markPaidAndCollected` | Mark paid & collected | Mark paid & picked up |
| `orderCard.collected` | Collected | Picked up |
| `orderCard.cashAndCollected` | Cash & collected | Cash & picked up |
| `orderCard.cardAndCollected` | Card & collected | Card & picked up |
| `orderCard.refundedTitle` | Refunded in full. Nothing to collect. | Refunded in full. Nothing to charge. |
| `orderCard.partRefundedTitle` | Charged in full, then partly refunded. Nothing to collect. | Charged in full, then partially refunded. Nothing to charge. |
| `orderCard.cardHeldTitle` | Card authorised — do not collect. Payment is taken when you confirm. | Card authorized — do not charge. Payment is taken when you confirm. |
| `orderCard.status` | {status, select, pending {New} confirmed {Confirmed} rejected {Rejected} modified {Modified} cancelled {Cancelled} cooking {Cooking} ready {Ready} collected {Collected} other {New}} | {status, select, pending {New} confirmed {Confirmed} rejected {Rejected} modified {Modified} cancelled {Canceled} cooking {Cooking} ready {Ready} collected {Picked up} other {New}} |
| `orderCard.cashIcon` | 💷 | 💵 |
| `dashboard.toast.intervalsSaved` | Collection times saved for this event | Pickup times saved for this event |
| `dashboard.toast.printMode` | {mode, select, onConfirmed {Tickets will print when you accept an order} other {Tickets will print shortly before collection}} | {mode, select, onConfirmed {Tickets will print when you accept an order} other {Tickets will print shortly before pickup}} |
| `dashboard.toast.cardPayments` | {state, select, off {Card payments off — customers pay at the hatch} other {Card payments back on}} | {state, select, off {Card payments off — customers pay at the window} other {Card payments back on}} |
| `dashboard.toast.intervalsFailed` | Collection times could not be saved right now. | Pickup times could not be saved right now. |
| `dashboard.toast.eventCancelled` | Event cancelled | Event canceled |
| `dashboard.demo.lockBody` | This is where you start and close a service, pause orders when the queue gets long, or switch to a different event. | This is where you start and close a service, pause orders when the line gets long, or switch to a different event. |
| `dashboard.cancelReasons.customer_cancelled` | Customer cancelled | Customer canceled |
| `dashboard.cancelReasons.not_collected` | Order not collected | Order not picked up |
| `dashboard.cancelModal.noRefund` | The order will be cancelled and the {amount} will stay with you. Nothing goes back to the customer’s card. | The order will be canceled and the {amount} will stay with you. Nothing goes back to the customer’s card. |
| `dashboard.cancelModal.held` | Their card is <b>held, not charged</b> — no money has been taken, so there is nothing to refund. Cancelling releases the hold straight away. | Their card is <b>held, not charged</b> — nothing has been charged, so there is nothing to refund. Canceling releases the hold right away. |
| `dashboard.banner.cardPaymentsOff` | Card payments are off — customers are paying at the hatch. This stays off, on every event, until you turn it back on. | Card payments are off — customers are paying at the window. This stays off, on every event, until you turn it back on. |
| `dashboard.orders.completedSection` | Completed & cancelled ({count}) | Completed & canceled ({count}) |
| `dashboard.orders.doneSummary` | {done} done{hasCancelled, select, yes { · {cancelled} cancelled} other {}} | {done} done{hasCancelled, select, yes { · {cancelled} canceled} other {}} |
| `dashboard.orders.status` | {status, select, pending {New} confirmed {Confirmed} rejected {Rejected} modified {Modified} cancelled {Cancelled} cooking {Cooking} ready {Ready} collected {Collected} other {{status}}} | {status, select, pending {New} confirmed {Confirmed} rejected {Rejected} modified {Modified} cancelled {Canceled} cooking {Cooking} ready {Ready} collected {Picked up} other {{status}}} |
| `dashboard.settings.pressesOne` | One press (“Mark paid & collected”) | One press (“Mark paid & picked up”) |
| `dashboard.settings.pressesOneHelp` | Best when you take the money as you hand the food over. You get a single button, “Mark paid & collected”, which records the payment and clears the order together. | Best when you take the money as you hand the food over. You get a single button, “Mark paid & picked up”, which records the payment and clears the order together. |
| `dashboard.settings.pressesTwo` | Two presses (“Mark paid” & “Collected”) | Two presses (“Mark paid” & “Picked up”) |
| `dashboard.settings.pressesTwoHelp` | Best when payment and handover happen at different moments — someone pays at the hatch, then collects when it’s ready. You get two buttons: “Mark paid” first, then “Collected” when they take the food. | Best when payment and handover happen at different moments — someone pays at the window, then picks up when it’s ready. You get two buttons: “Mark paid” first, then “Picked up” when they take the food. |
| `dashboard.settings.cardsHelp` | Turn this off during a card problem and customers will place orders as normal and pay at the hatch instead. Orders keep coming; only the card step stops. | Turn this off during a card problem and customers will place orders as normal and pay at the window instead. Orders keep coming; only the card step stops. |
| `dashboard.settings.intervalsTitle` | Collection times | Pickup times |
| `dashboard.settings.intervalsHelp` | How far apart collection times are. This doesn’t change kitchen capacity or prep times. | How far apart pickup times are. This doesn’t change kitchen capacity or prep times. |
| `dashboard.settings.intervalsUnavailable` | Collection times are unavailable right now. | Pickup times are unavailable right now. |
| `dashboard.settings.customerTimes` | Customer Collection Times | Customer pickup times |
| `dashboard.settings.yourTimes` | Your Collection Times | Your pickup times |
| `dashboard.settings.colCountsTitle` | Which categories count toward the total capacity. Cooked categories always count; tick instant ones (sides, dips, drinks) to include them. | Which categories count toward the total capacity. Cooked categories always count; check instant ones (sides, dips, drinks) to include them. |
| `dashboard.settings.countsTick` | Tick to include this instant category (sides, dips, drinks) in the shared per-window limit | Check to include this instant category (sides, dips, drinks) in the shared per-window limit |
| `dashboard.settings.capacityDesc` | The most items your kitchen can turn out at once, across all the categories you’ve ticked. Each category’s own batch size still applies on top. | The most items your kitchen can turn out at once, across all the categories you’ve checked. Each category’s own batch size still applies on top. |
| `dashboard.settings.capacityExample` | Example: if you can cook 4 mains in 5 minutes, then set it to 4 items every 5 minutes. The total capacity limits orders across all selected categories so if you want to only sell a maximum of 10 starters and mains every 5 minutes, then set Total Capacity to 10 items every 5 minutes and select Starters and Mains tickbox. This will still keep your mains restricted to 4 items every 5 minutes. | Example: if you can cook 4 entrées in 5 minutes, then set it to 4 items every 5 minutes. The total capacity limits orders across all selected categories so if you want to only sell a maximum of 10 appetizers and entrées every 5 minutes, then set Total Capacity to 10 items every 5 minutes and check the Appetizers and Entrées boxes. This will still keep your entrées restricted to 4 items every 5 minutes. |
| `dashboard.stock.howCategory` | <b>Category total</b> is a shared pool across every item in that category (e.g. 30 starters tonight). | <b>Category total</b> is a shared pool across every item in that category (e.g. 30 appetizers tonight). |
| `dashboard.stock.howAvailable` | <b>Available</b>: green = on sale, grey = sold out (hidden from customers). | <b>Available</b>: green = on sale, gray = sold out (hidden from customers). |
| `dashboard.kds.body` | Choose which van’s kitchen screen to open: | Choose which truck’s kitchen screen to open: |
| `dashboard.edit.extraToCollect` | Extra to collect | Extra to charge |
| `dashboard.edit.collectionTime` | Collection time | Pickup time |
| `dashboard.eventBar.status` | {tone, select, paused {⏸ Paused} live {● Live} finished {● Finished} cancelled {Cancelled} other {Not started}} | {tone, select, paused {⏸ Paused} live {● Live} finished {● Finished} cancelled {Canceled} other {Not started}} |
| `errorsKitchen.unauthorised` | Unauthorised | Unauthorized |
| `errorsKitchen.already_paid_by_card` | This customer has already paid by card. Their card is authorised for this order and is charged automatically when you confirm it, so taking payment here would charge them twice. Nothing has been recorded. | This customer has already paid by card. Their card is authorized for this order and is charged automatically when you confirm it, so taking payment here would charge them twice. Nothing has been recorded. |
| `errorsKitchen.intervals_choices` | Collection times must be every {choices} minutes. | Pickup times must be every {choices} minutes. |
| `errorsKitchen.intervals_customer_first` | Set the customer collection times before setting your own. | Set the customer pickup times before setting your own. |
| `errorsKitchen.intervals_save_failed` | Collection times could not be saved right now. | Pickup times could not be saved right now. |
| `errorsKitchen.no_van_for_device` | This device isn’t set to a van yet, so wired printing isn’t available. | This device isn’t set to a truck yet, so wired printing isn’t available. |
| `errorsKitchen.van_not_for_truck` | Van not found for this truck | That truck isn’t part of this account |
| `errorsKitchen.van_not_for_target` | Van not found for the target truck | That truck isn’t part of the account you’re switching to |
| `kitchenModals.eventCancel.affected` | {n, plural, one {{count} order} other {{count} orders}} will be cancelled and customers notified. | {n, plural, one {{count} order} other {{count} orders}} will be canceled and customers notified. |
| `kitchenModals.eventCancel.cancelling` | Cancelling… | Canceling… |
| `kitchenModals.actions.notePlaceholder` | e.g. Park in the main car park, look for the orange gazebo | e.g. Park in the main parking lot, look for the orange tent |
| `kitchenModals.extraWait.hint` | Adds to the collection time quoted on new orders. It does not change the event finish time. | Adds to the pickup time quoted on new orders. It does not change the event finish time. |
| `kitchenModals.picker.status` | {tone, select, paused {⏸ Paused} live {● Live} finished {● Finished} cancelled {Cancelled} other {Not started}} | {tone, select, paused {⏸ Paused} live {● Live} finished {● Finished} cancelled {Canceled} other {Not started}} |
| `ticket.collect` | COLLECT {time} | PICKUP {time} |
| `ticket.collectAsap` | COLLECT ASAP | PICKUP ASAP |
| `ticket.doNotCollect` | DO NOT COLLECT | DO NOT CHARGE |
| `ticket.paymentStatus` | {status, select, refunded {REFUNDED} part_refunded {PART REFUNDED} refund_due {REFUND DUE} failed {FAILED} other {{status}}} | {status, select, refunded {REFUNDED} part_refunded {PARTIALLY REFUNDED} refund_due {REFUND DUE} failed {FAILED} other {{status}}} |
| `printing.say.guard.unbound` | This device isn’t set to a van yet, so wired printing isn’t available. | This device isn’t set to a truck yet, so wired printing isn’t available. |
| `printing.card.noneRecognised` | No printers recognised yet. Everything nearby is listed below — if your printer is there, tap it and HatchGrab will check whether it can print. | No printers recognized yet. Everything nearby is listed below — if your printer is there, tap it and HatchGrab will check whether it can print. |
| `printing.card.summaryLead` | Print <b>{lead} min</b> before collection · {paper}mm paper | Print <b>{lead} min</b> before pickup · {paper}mm paper |
| `printing.card.modeLead` | A set time before collection | A set time before pickup |
| `printing.card.leadLabel` | Minutes before the collection time | Minutes before the pickup time |
| `printing.card.modeOnConfirmedHint` | An advance pre-order prints when you accept it, which may be hours before the collection time. Orders you have not accepted yet never print. | An advance pre-order prints when you accept it, which may be hours before the pickup time. Orders you have not accepted yet never print. |
| `kds.header.fullTitle` | Full cards — prices and payment details, as the hatch sees them. | Full cards — prices and payment details, as the window sees them. |
| `kds.header.cashIcon` | 💷 | 💵 |
| `kds.event.cancelled` | Event cancelled | Event canceled |
| `kds.intro.p2` | Cards move across as you tap them, so whoever’s cooking always knows what’s next and nobody has to shout. Everything here is your demo data — have a play. | Cards move across as you tap them, so whoever’s cooking always knows what’s next and nobody has to shout. Everything here is your demo data — try it out. |
| `kds.banner.eventStatus` | {tone, select, paused {⏸ Paused} live {● Live} finished {● Finished} cancelled {Cancelled} other {Not started}} | {tone, select, paused {⏸ Paused} live {● Live} finished {● Finished} cancelled {Canceled} other {Not started}} |
| `nativeShell.gate.undoneCollected` | Undone — order not collected | Undone — order not picked up |
| `nativeShell.gate.collected` | Order #{id} {paidToo, select, yes {paid and collected} other {collected}} | Order #{id} {paidToo, select, yes {paid and picked up} other {picked up}} |
| `nativeShell.gate.status` | Order #{id} {action, select, confirm {confirmed} reject {rejected} ready {ready} collected {collected} undo_collected {restored} cancel {cancelled} other {updated}} | Order #{id} {action, select, confirm {confirmed} reject {rejected} ready {ready} collected {picked up} undo_collected {restored} cancel {canceled} other {updated}} |
| `nativeShell.van.label` | Van | Truck |
| `nativeShell.setup.noVanTitle` | No active van | No active truck |
| `nativeShell.setup.noVanBody` | This truck has no active van yet. Activate one in <b>Settings → Vans</b>, then this device sets up automatically — no further steps here. | This account has no active truck yet. Activate one in <b>Settings → Your trucks</b>, then this device sets up automatically — no further steps here. |
| `nativeShell.setup.goToVans` | Go to Settings → Vans | Go to Settings → Your trucks |
| `nativeShell.setup.body` | One-time setup for <b>this device</b>: the screen it opens to and which van it runs. Applies to this device only — other devices are set separately, and you can change these later from the profile menu → “This device”. | One-time setup for <b>this device</b>: the screen it opens to and which truck it’s for. Applies to this device only — other devices are set separately, and you can change these later from the profile menu → “This device”. |
| `nativeShell.setup.whichVan` | Which van is this device? | Which truck is this device for? |
| `nativeShell.setup.selectVan` | Select a van… | Select a truck… |
| `nativeShell.device.truck` | Truck | Business |
| `nativeShell.device.van` | Van | Truck |
| `nativeShell.device.patchFailed` | {setting, select, van {Van} defaultScreen {Default screen} other {Order notifications}} didn’t save. {reason} | {setting, select, van {Truck} defaultScreen {Default screen} other {Order notifications}} didn’t save. {reason} |
| `demo.cashAndCollected` | Cash & collected | Cash & picked up |
| `demo.cashIcon` | 💷 | 💵 |
| `paymentActions.reason` | {reason, select, item_unavailable {Item unavailable} not_collected {Order not collected} wrong_or_missing_item {Wrong or missing item} quality_issue {Quality issue} duplicate_payment {Duplicate payment} customer_cancelled {Customer cancelled} other {Other}} | {reason, select, item_unavailable {Item unavailable} not_collected {Order not picked up} wrong_or_missing_item {Wrong or missing item} quality_issue {Quality issue} duplicate_payment {Duplicate payment} customer_cancelled {Customer canceled} other {Other}} |
| `paymentActions.paidCardMachine` | Paid on your card machine{mixed, select, yes { — {amount}} other {}} | Paid on your card reader{mixed, select, yes { — {amount}} other {}} |
| `paymentActions.inPersonHint` | Cash or your card machine — not recorded | Cash or your card reader — not recorded |
| `paymentActions.part` | Part | Partial |
| `addOrder.catClosed` | {cat} is closed for online orders this event — hidden from customers. You can still add for the hatch; you’ll be asked to confirm. | {cat} is closed for online orders this event — hidden from customers. You can still add orders at the window; you’ll be asked to confirm. |
| `addOrder.savedToast` | Order {id} saved{paid, select, cash { — paid in cash} card { — paid on your card machine} other {}} | Order {id} saved{paid, select, cash { — paid in cash} card { — paid on your card reader} other {}} |
| `addOrder.confirmedToast` | Order #{id} confirmed{paid, select, cash { — paid in cash} card { — paid on your card machine} other {}} | Order #{id} confirmed{paid, select, cash { — paid in cash} card { — paid on your card reader} other {}} |
| `addOrder.addAnywayConfirm` | {detail}\n\nAdd anyway (for the hatch)?\n\nOK = add anyway   ·   Cancel = edit the order | {detail}\n\nAdd anyway (at the window)?\n\nOK = add anyway   ·   Cancel = edit the order |
| `addOrder.cashIcon` | 💷 | 💵 |
| `emailOperator.newOrder.collection` | Collection: {time} | Pickup: {time} |
| `alertsOperator.limit100.startAgain` | They’ll start again on <b>{reset}</b>, or straight away if you raise your monthly limit in Settings. | They’ll start again on <b>{reset}</b>, or right away if you raise your monthly limit in Settings. |
| `alertsOperator.limit100.startAgainLink` | They’ll start again on {reset}, or straight away if you raise your monthly limit in Settings: | They’ll start again on {reset}, or right away if you raise your monthly limit in Settings: |
