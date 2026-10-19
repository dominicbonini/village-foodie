# US polish batch — report

19 October 2026. Brief: "US POLISH BATCH — HatchGrab link previews for truck pages, state on emailed schedules, thousands
separators, US allergen wording in Manage, revokes migration file, refusal words from codes". It started from commit
`8a5c4b5a` (everything before it is committed and deployed). Nothing was committed, pushed or deployed. No `.env*` file was
opened, and no environment value was read or printed. No stored data was changed and no email was sent. Pizzeria Gusto was
not tested against; its row was read once, read-only, to state its preview change exactly.

**Result.** All six items are built and proved.
- **Checks:** `tsc` is clean; ESLint is unchanged on the 20 touched code files (510 → 510); `next build` exits 0; the full
  sweep runs 136 · passes 136 · fails 0, with only the named re-pins listed below.
- **Item 5 stopped twice, as the brief requires.** Live did not match the record. Dominic re-ran the revokes on 19 October.
  One more "run now" revoke, for eight more functions, is in the chat reply and below.
- **One new standing rule:** undo/rollback SQL never goes in a chat reply. It lives only here, under
  "Undo (only if Dominic asks)".

## Summary

| # | What | Status | GB |
|---|---|---|---|
| 1 | Truck-page link previews on HatchGrab come from the truck itself | Built; fixture before/after; preview cards drawn; live checked | **Named:** HatchGrab previews (Gusto's listed below). Village Foodie byte-identical |
| 2 | State on emailed schedules (`/api/inbound-schedule`) | Built; fixtures | Byte-identical (GB batch proved) |
| 3 | Thousands separators on displayed money | Built; CSVs, inputs and API numbers unchanged; tickets fit | **Named:** every displayed amount ≥ 1,000, both countries |
| 4 | US allergen wording in Manage | The app was already right; the harness was stale. Re-pinned; `--usd` now in the sweep | Byte-identical |
| 5 | Revokes migration file | Live was open; Dominic re-revoked; file written; creating migrations fixed; new guard harness; 8 more functions to close (run now) | n/a (database) |
| 6 | Refusal words from codes | Onboarding fully, kitchen fully | Byte-identical. US: one named change ("Unauthorized") |

---

## 1 · Link previews for truck pages (HatchGrab host)

### Diagnosis

**`/trucks/[slug]` (`app/trucks/[slug]/page.tsx` `generateMetadata`)** did the same on both hosts:
- **Data:** name and logo came from the Village Foodie **Google Sheets CSV** (`getTruckMeta`, column J). It did not read
  the trucks row or the discovery row.
- **`siteName` and `og:url`:** both hard-coded to Village Foodie. `siteName: 'Village Foodie'`; `og:url`
  `https://villagefoodie.co.uk/trucks/<slug>`.
- **Title:** "`{truck} | Village Foodie`", through the root template, so on HatchGrab it read
  "X | Village Foodie | HatchGrab".
- **Image:** the sheet's logo, made absolute on villagefoodie.co.uk. No width or height. None when the sheet had none.
- **Truck missing from the sheet** (any signed-up truck): only `{ title: "Food Truck | Village Foodie" }`; the rest came
  from the root layout.
- **Language:** `og:locale` came from the truck's country (by slug).

**`/trucks/[slug]/order`** is a client page and its layout exported no metadata. So it showed the root layout alone:
"HatchGrab", the site root's URL, and nothing about the truck.

### Fix

- **`lib/truck-share-meta.ts` (new, server).** On HatchGrab the preview's source is:
  1. the truck's own HatchGrab row (by `trucks.slug`), when it is public there (`active`, not `excluded`, `show_on_hg`).
     For the **order** page the test is "trades" (`active`, not `excluded`), because the order page itself serves such a
     truck;
  2. otherwise the discovery row the page itself draws (public on HatchGrab, its name slugging to the URL);
  3. otherwise nothing truck-specific: title "Food truck", everything else the root layout's.
- **What the preview contains:**
  - **Image:** the truck's own cover, else its logo, else the root layout's HatchGrab share card (1200×630).
  - **Brand and URL:** `og:site_name` "HatchGrab"; `og:url` is the page's own `https://www.hatchgrab.com/trucks/<slug>`
    (+ `/order`).
  - **Language:** the truck's (its country's locale), including `og:locale`.
  - **Twitter card:** `summary` for a square logo, `summary_large_image` for a cover or the HatchGrab card.
  - **No Google Sheets read on HatchGrab.**
- **Page title:** the truck's name (root template → "Pizzeria Gusto | HatchGrab"). `og:title` is "{truck} Schedule" and
  the description is the existing share sentence.
- **Order page title:** "Order from {truck}", with "Order ahead from {truck} and collect it at the truck." (en-US: "…pick
  it up at the truck."). These are new messages `truckPage.meta.orderTitle`, `meta.orderDescription` (en-US override)
  and `meta.hgFallbackTitle`.
- **Wiring:** `app/trucks/[slug]/page.tsx` returns `hatchGrabTruckMetadata(slug,'page')` on the HatchGrab host; the
  Village Foodie path below it is the old code, untouched. `app/trucks/[slug]/order/layout.tsx` gains `generateMetadata`:
  HatchGrab → `hatchGrabTruckMetadata(slug,'order')`; Village Foodie (or no request) → `{}`, which adds nothing.

### BEFORE → AFTER (HatchGrab host, fixtures; `scripts/us-polish-batch.cjs` §1, merged with the root layout's own `generateMetadata`)

| Fixture | Field | BEFORE | AFTER |
|---|---|---|---|
| **Gusto-shaped** (public truck + discovery row + sheet row; own logo, no cover — the live Gusto's shape, read-only check below) | title | Pizzeria Gusto \| Village Foodie \| HatchGrab | Pizzeria Gusto \| HatchGrab |
| | og:site_name | Village Foodie | HatchGrab |
| | og:url | https://villagefoodie.co.uk/trucks/pizzeria-gusto | https://www.hatchgrab.com/trucks/pizzeria-gusto |
| | og:image | the sheet's logo on villagefoodie.co.uk | its own truck-media logo |
| | twitter:card | summary_large_image | summary |
| | og:title / description / og:locale | "Pizzeria Gusto Schedule" / "Check out where Pizzeria Gusto is pitching up next! 🚚" / en_GB | same |
| Gusto-shaped, **order page** | title / og:url / image | HatchGrab / site root / HatchGrab card | Order from Pizzeria Gusto \| HatchGrab / …/pizzeria-gusto/order / its logo |
| **Signed-up GB truck, no discovery row, no logo** | title | Food Truck \| Village Foodie \| HatchGrab | Fenland Fryer \| HatchGrab |
| | description / og:title / og:url | the root's / HatchGrab / site root | its share sentence / "Fenland Fryer Schedule" / …/trucks/fenland-fryer |
| | og:image | HatchGrab card | HatchGrab card (it has no logo) |
| **US truck** (twin-shaped, public in the fixture, has a cover) | title | Food Truck \| Village Foodie \| HatchGrab | Pizza Kitchen US \| HatchGrab |
| | description / og:locale | the root's / en_GB | "Check out where Pizza Kitchen US is popping up next! 🚚" / en_US |
| | og:image / card | HatchGrab card | its cover / summary_large_image |
| US truck, order page | description | the root's | "Order ahead from Pizza Kitchen US and pick it up at the truck." |
| **Hidden GB truck** | title | Food Truck \| Village Foodie \| HatchGrab | Food truck \| HatchGrab (nothing else about it) |
| Pizza Kitchen-shaped by discovery name | og:site_name / og:url / og:image | Village Foodie / villagefoodie.co.uk / VF logo URL | HatchGrab / www.hatchgrab.com / www.hatchgrab.com/logos/… |

- **Village Foodie host:** the page's metadata is BEFORE's byte for byte for all five fixtures, page and order (10 checks).
- **Preview cards** (WhatsApp-style and Facebook-style, BEFORE beside AFTER), in `docs/us-polish/` (gitignored):
  `preview-gusto-whatsapp.png`, `preview-gusto-facebook.png`, `preview-us-whatsapp.png`, `preview-us-facebook.png`.
  The full field table is `docs/us-polish/previews.json`.

**Gusto's own HatchGrab preview — the named change, exactly** (live row, read-only: public on HatchGrab, own logo, no cover):

| Field | Change |
|---|---|
| `<title>` | "Pizzeria Gusto \| Village Foodie \| HatchGrab" → "Pizzeria Gusto \| HatchGrab" |
| `og:site_name` | "Village Foodie" → "HatchGrab" |
| `og:url` | villagefoodie.co.uk/trucks/pizzeria-gusto → www.hatchgrab.com/trucks/pizzeria-gusto |
| `og:image` | the sheet's logo → its own uploaded logo (truck-media) |
| `twitter:card` | summary_large_image → summary |
| `og:image:alt` | "Pizzeria Gusto Logo" (same words) |

- **Unchanged:** `og:title` "Pizzeria Gusto Schedule", the description, `og:locale` en_GB.
- **Gusto's order link** (`/trucks/pizzeria-gusto/order`) gains a truck preview: "Order from Pizzeria Gusto | HatchGrab",
  its logo, its own URL.
- **Gusto's Village Foodie preview** (villagefoodie.co.uk) is unchanged.

**Live (read-only, Dominic's dev server, `hatchgrab.localhost:3000`):**
- `/trucks/test-kitchen-us` (the hidden twin) → "Food truck | HatchGrab" with the HatchGrab card.
- `/trucks/test-kitchen-us/order` → "Order from Pizza Kitchen US | HatchGrab", "…pick it up at the truck.", `og:locale`
  en_US, the HatchGrab card (the twin has no logo or cover).
- `/trucks/test-kitchen/order` (Pizza Kitchen) → "Order from Pizza Kitchen | HatchGrab", en_GB.
- `/trucks/pizza-kitchen` → generic. Live has no discovery row named "Pizza Kitchen" (its discovery row carries another
  name), so the page itself also reads "Truck not found".

## 2 · State on emailed schedules

- **Diagnosis:** `/api/inbound-schedule` already read each row's `region` and passed it to the discovery gate (`venues.region`)
  only. The screenshot model's `state` is sent as `region` (`lib/admin/screenshot-events.ts`). The bridge's `truck_events`
  insert never wrote it.
- **Fix** (`app/api/inbound-schedule/route.ts`):
  - the insert spreads `region` exactly as Manage's importer saves it: only when the batch's country uses the
    `zip_state` address style (the US, read from `country_settings`), only as a two-letter code (`normaliseRegion`), and
    never inferred;
  - every other row, every GB row included, inserts exactly the columns it always did (the key is absent, not null).
- **Proof** (`scripts/us-polish-batch.cjs` §2; BEFORE = the route at `8a5c4b5a`, bundled side by side):
  - US batch: "NJ" and " nj " are saved as "NJ". A row with no state, and a row whose state is "New Jersey", save no
    region. Every other row, column, write, email and response is BEFORE's exactly.
  - GB batch (no country): byte-identical to BEFORE, with no region key. That includes a county and even a two-letter
    "CB".
- **Named re-pin:** `scripts/screenshot-truck-details.cjs` pins this route's lines. The sixth tolerated build lists exactly
  the added lines.

## 3 · Thousands separators on money (both countries)

### Diagnosis
- **One switch:** `useGrouping: opts.grouping === true` in `lib/money-format.ts` `formatMajor` and `formatMajorNumber`.
  `formatMinor`, `formatMajorOrBare` and `formatMinorOrBare` go through it. Their no-currency fallback was hand-built
  (`toFixed`).
- **Already grouped:** plan prices, allowances, the landing page, the plans PDF and /compare.
- **Must stay raw:**
  - the two Reports **CSVs**, which shared `fmtMoney` with the on-screen report;
  - price **inputs** (`editableAmount` / `editableMinor`, and `type="number"` boxes), which never used the display
    formatter;
  - stored values and API payload numbers, which are numbers, not strings.
- **The WhatsApp menu reply's price check** (`lib/whatsapp-classifier.ts`) would read "£1,250.00" as "£1" and reject the
  reply.
- **Printed tickets:** `padBetween` never truncates. Item, modifier and deal rows have a fit test and fall back to wrapping
  (a modifier or deal price is dropped). Adjustments, TOTAL and TO PAY have no fit test.

### Fix
- **`lib/money-format.ts`:**
  - grouping is ON by default (`grouping !== false`): "£1,234.56", "$1,345.09";
  - `grouping: false` keeps the raw figure;
  - the no-format fallback groups too ("1,234.56"), and is raw with `grouping: false`;
  - below 1,000 every figure is byte-identical, proved for every penny 0.00–999.99 in both currencies.
- **Reports CSVs** (`app/manage/[token]/page.tsx`): a new `csvMoney` with `{ grouping: false }` is used for every CSV
  amount (orders CSV: modifiers, charges, total; items CSV: unit, item and order totals). The on-screen report keeps
  `fmtMoney`, which is now grouped.
- **WhatsApp price check:** the regex reads `1,250.00` as one figure and drops the separators before comparing.
- **Printed ticket** (`lib/printing/ticket.ts` `fitted`):
  - an amount sits beside its label with its separators when the pair fits the line;
  - when only the separator would push the row over (so it would wrap, or a modifier's price be dropped), that one row
    prints the figure ungrouped, as every ticket did before.
  - Proved at 32 and 48 columns with 4- and 5-figure amounts, GB and US: item, modifier, deal, Subtotal,
    "Sales tax 6.625%", TOTAL and TO PAY all fit. The fallback was proved on a constructed tight row.
  - **The only row kept ungrouped is the one that would otherwise wrap.**

### Named change, both countries: where an amount ≥ 1,000 now shows a separator

- **Customer surfaces:**
  - the order page (menu prices, item sheet, basket and checkout totals, deals, confirmation);
  - the manage-my-order (status) page;
  - every customer email (confirmation, ready, cancellation, refund, edited order).
- **Operator emails:** the new-order email and its subject.
- **The dashboard:** order cards, totals and day figures, the edit modal and reprice, refund messages and the payment
  actions, the Add order panel and the deals modal.
- **The KDS:** ticket totals.
- **Printed tickets:** item, modifier, deal, adjustment, TOTAL and TO PAY rows, with the fallback above.
- **Manage:** menu, deal and extras price labels, event-pricing rule labels, the charges card, and the Reports tab on screen
  (revenue, breakdowns).
- **WhatsApp:** menu replies and the operator order text.
- **Refusal and validation text** that names an amount (a refund refusal, a charges validation message).
- **Not changed:** the Reports CSVs, price inputs, stored values, API payload numbers. The plans PDF, landing and /compare
  were already grouped.

### Re-pins (named)
- **`scripts/money-sweep-parity.cjs`** (`us-polish-thousands-separators`):
  - BEFORE's amounts ≥ 1,000 gain their separators;
  - a ticket line gives one space per comma back from its gap, and a row with no room stays ungrouped;
  - the formatter loop's expectation is the grouped old figure;
  - **the CSV leaves are not transformed and still match BEFORE byte for byte**, which proves the CSVs stayed raw;
  - both GB (3,057 leaves, 1,728,586 formatter values) and `--usd` pass.
- **`scripts/_lp2-named.cjs` and `scripts/_lp1d2-named.cjs`:** the same named entry, through the shared
  `scripts/_us-polish-grouping.cjs` (CSV views excluded). language-phase-1a, 1b, 1c, 1d2 and 2 pass with it.

## 4 · US allergen wording in Manage

- **Diagnosis:** `node scripts/money-sweep-parity.cjs --usd` reported `manage.menu|editItem.text` and
  `manage.extras|editOption.text`. Its "before" was the **GB snapshot** (UK 14, taken 10 October, before commit 234b6a20
  made Manage's allergen toggles follow the country). Its "after" was the live US render, which **already lists the US 9**
  (Milk, Eggs, Fish, Crustacean shellfish, Tree nuts, Peanuts, Wheat, Soybeans, Sesame), through `useAllergenVocab` →
  `allergenVocab(country.allergenSet)`.
- **So a US truck already sees the US 9 there, and the app is not changed.** GB is unchanged.
- **Fix (harness):** a named allowance `us-readiness-allergen-set` in the `--usd` comparison. On the BEFORE side of those
  two leaves only, the UK 14 run (found exactly once) is read as the US 9; every other byte is still compared.
- **`--usd` passes** in about 1.2 s, and gave the same result on every run.
- **Added to the sweep** as `scripts/money-sweep-parity-usd.cjs` (the runner passes no arguments, so a two-line wrapper adds
  `--usd`).

## 5 · Revokes migration file, and what undid the revokes

### What live showed (read-only)
1. **At the start of item 5:**
   - `place_order_atomic`, `find_stranded_authorisations` and `purge_order_drafts` were all executable by **PUBLIC, anon
     and authenticated**;
   - the two SECURITY DEFINER ones were therefore callable with the public key: `find_stranded_authorisations` returns
     order keys and payment-intent ids, and `purge_order_drafts` deletes;
   - I stopped and reported this. Dominic re-ran the revoke.
2. **After the re-run:**
   - all three, and `place_order_atomic_v2`, show PUBLIC / anon / authenticated **false** and service_role / postgres
     true;
   - ACL `{postgres=X/postgres,service_role=X/postgres}`;
   - the sweep of SECURITY DEFINER functions in `public` executable by anon returns **0 rows**.

### How the 12 Oct revokes were undone: a hand-run GRANT, most likely the reports' own rollback lines
- **No migration** after 12 October creates, replaces or alters these functions or the default privileges. The last files
  that touch them are dated 4, 14 and 16 August.
- **The ACL order shows the sequence.**
  - A freshly created function here gets `{=X,postgres,anon,authenticated,service_role}`, with PUBLIC first.
  - The reopened three had `{postgres,service_role,=X,anon,authenticated}`.
  - So the revoke **did** happen, and PUBLIC, anon and authenticated were then *appended* by a later
    `grant execute … to public, anon, authenticated`. That is word for word the "Rollback" block in both reports.
- **The date can't be recovered.** The project's logs keep 24 hours, and the Postgres log holds no GRANT or REVOKE in that
  window.
- **API logs, 18 Oct 09:21 → 19 Oct 09:21 UTC (all that exists):**
  - 95 calls to `rpc/find_stranded_authorisations`, all **service_role**, every 15 minutes (the cron);
  - 279 to `claim_order_for_auto_reject`, 5 to `place_order_atomic_v2` and 3 to `increment_event_order_counter`, all
    service_role;
  - **no call by anon or authenticated**, and no call to `purge_order_drafts` or the old `place_order_atomic`.

### The file — `supabase/migrations/20261012_revoke_public_functions.sql`
- Marked **"already applied — file only, do not run"**.
- It reproduces exactly the live state read on 19 October: revoke from public, anon and authenticated, grant to
  service_role, for the three functions. It is idempotent.
- **Differences from the two reports (live wins):**
  - `definer-functions-report.md` also granted to `postgres`. Live shows `postgres=X/postgres`, which is the *owner's*
    own entry, present either way. It is not repeated, because it would change nothing.
  - Both reports' rollback blocks are what reopened them. They are kept, with a "⛔ DO NOT RUN" line directly above each
    (`docs/definer-functions-report.md`, `docs/place-order-grant-report.md`).
  - `revoke execute` (the reports) and `revoke all` (other migrations) are the same for a function, since EXECUTE is its
    only privilege.

### A fresh database now ends revoked: same-file revokes in every creating migration
- 15 migration files gained a "NOT CALLABLE WITH THE PUBLIC KEY" block after their `create function`:
  - `20260529_order_counter`
  - `20260607_order_key_per_event` (×2)
  - `20260619_modifier_option_stock_rpc` (×2)
  - `20260624_place_order_atomic` (the 8-argument version)
  - `20260703_orders_updated_at_trigger` (trigger: revoke only)
  - `20260715_place_order_atomic_drop_drawlist`
  - `20260728_orders_total_minor_deal_savings`
  - `20260804_assign_buzzer_atomic`
  - `20260804_place_order_atomic_placed_at`
  - `20260812_order_drafts`
  - `20260813_order_drafts_authorization`
  - `20260814_purge_order_drafts_display_note`
  - `20260815_find_stranded_authorisations`
  - `20260816_find_stranded_authorisations_settled`
  - `20260819_claim_order_for_auto_reject`
- Non-trigger functions also get `grant … to service_role`. The `v2` files and `orders_fill_currency_country` already
  revoked.

### The guard — `scripts/migration-function-grants.cjs` (in the sweep)
- **Two rules, over every file in `supabase/migrations`, after stripping comments and dollar-quoted bodies:**
  - every `create [or replace] function` must be followed **in the same file** by a revoke of EXECUTE (or ALL) on the
    exact signature from public, anon **and** authenticated;
  - no statement may grant a function to public, anon or authenticated.
  - A short named allow-list, each entry with its reason, can excuse either. It is empty today.
- **Result:** 190 files, 20 creates in 18 files: all pass.
- **No file "reopened" these, so it is proved on what did instead.** It **fails**:
  - on the creating files as they stood at `8a5c4b5a`;
  - on a file holding either report's rollback line;
  - on a revoke with the wrong signature, without authenticated, or placed before the create.
- 14 checks.

### Eight more functions were anon-callable: "run now" (Dominic's decision A)
- **The functions** (all SECURITY INVOKER, by default grant):
  - `update_updated_at()` — a trigger function, used by no trigger;
  - `set_orders_updated_at()` — a trigger on `orders`;
  - `increment_order_counter(text)`, `increment_event_order_counter(uuid)`;
  - `populate_event_slots(text, date, time, time)`, `decrement_stock(text, jsonb)` — no caller anywhere;
  - `assign_buzzer_atomic(…)`, `claim_order_for_auto_reject(uuid[])`.
- **Every caller checked:**
  - browser code makes **no** `.rpc(...)` call at all;
  - server routes use the service role: `lib/order-utils.ts` and `lib/buzzer.ts` via `lib/supabase` (service role), the
    auto-reject cron, and the demo routes;
  - inside the database, `place_order_atomic(_v2)` call the two counters as their caller (service role);
  - edge functions (auto-event-scheduler, heartbeat-monitor): none;
  - the scraper scripts and the repo copy of the Apps Script: none;
  - no `cron.job`, RLS policy, column default or view references any of them;
  - the last 24h of API logs show only service_role.
- **So all eight are revoked from public, anon and authenticated, with no `authenticated` exception and no allow-list
  entry.**
- Triggers fire without EXECUTE, so the two trigger functions are revoked from all three and granted nothing.
- `update_updated_at`, `populate_event_slots` and `decrement_stock` predate `supabase/migrations`, so no creating file
  exists for them. The other five's creating migrations already carry the revoke (above).
- The block is in "SQL for Dominic" below. EXPLAIN cannot take GRANT/REVOKE, so its dry run is the read-only verify that
  follows it.

### Reference manual §35
Corrected: the revokes were undone by a hand-run grant (most likely the reports' rollback lines), re-applied on 19 October,
recorded in `20261012_revoke_public_functions.sql` and every creating migration, and now guarded by
`scripts/migration-function-grants.cjs`. The eight INVOKER functions are listed as open until the run-now block is run.

## 6 · Refusal words from codes

All of it is done, onboarding and kitchen. `errorText(t, body, fallback)` words a refusal from its code + params in the
route's namespace, with the English `error` as fallback. A new `errorTextIn([…])` tries several namespaces, because
`/api/setup` sends errorsOnboarding and tradeArea codes.

**Onboarding**
- `app/signup/page.tsx`
- `app/reset-password/page.tsx`
- `app/setup/page.tsx` (errorsOnboarding, then tradeArea)
- `components/setup/WhereBasedStep.tsx`: holds the body and words it at render; an old string state still reads as before
- `components/DemoGetStarted.tsx`: the save-email, sign-up and truck-create steps, following the wizard's language
- `components/landing/DemoUpload.tsx`: upload and build-request
- the dashboard's demo restart

**Kitchen**
- **Dashboard** (`app/dashboard/[token]/page.tsx`):
  - errorsKitchen: the intervals toast, refund message, edit busy and edit failure;
  - errorsManage: five event-menu actions;
  - errorsOnboarding: the demo restart.
- **KDS** (`app/dashboard/[token]/kds/page.tsx`): the link check (errorsKitchen) and five event-menu actions
  (errorsManage).
- **Shared:** `lib/native/useGatedActionResult.tsx`, the gated order actions on both screens (errorsKitchen).
- **Add order:** `components/dashboard/AddOrderPanel.tsx` (errorsKitchen).
- **Custom domain:** `components/dashboard/CustomDomainSetup.tsx` (errorsManage).
- **Left as they are:** two dashboard throws whose `catch` swallows them, so they are never shown (the buzzer and the
  profile sync).
- **Provider lists:** `lib/i18n/namespaces.ts` gains the error namespaces those screens now read (messages-split proves
  each list).

**Proof** (`scripts/us-polish-batch.cjs` §6):
- **GB:** every one of the 341 codes in errorsOnboarding, errorsKitchen, errorsManage and tradeArea, with its params, is
  worded **exactly** as the `error` the route sends. So every GB screen is byte-identical.
- **US:** an en-GB-worded refusal reads differently on a US screen for exactly the 27 en-US overrides, and no other code.
  Which of those reach a switched screen was read from the source (each route's `DEFAULT_LOCALE` refusals; every other
  refusal is already worded in the truck's language).
- **Named US change — the only one:** "Unauthorised" → "**Unauthorized**", when `/api/dashboard/action` refuses a session
  (401, worded in en-GB). A US kitchen screen shows it: the dashboard toasts, the edit, refund and intervals messages, the
  KDS order actions, and Add order. (`/api/dashboard`'s own "unauthorised" is a 403, which the KDS does not show.)
- The existing GB/US screen harnesses (1a, 1b, 1c, 1d2, 2) pass unchanged, since their mocked refusals fall back to `error`.

## Proof

- **GB is byte-identical except the named changes:**
  1. the HatchGrab truck-page previews (item 1);
  2. thousands separators on displayed amounts ≥ 1,000 (item 3).
  - Item 6's GB words are proved identical. Items 2 and 4 are proved byte-identical.
- **US named change:** "Unauthorized" (item 6).
- `tsc --noEmit`: clean.
- **ESLint** on the 20 touched code files: 510 → 510, with no rule growing. BEFORE is each file at `8a5c4b5a`. Two
  `react-hooks/preserve-manual-memoization` warnings from a first draft were removed.
- `next build`: exit 0.
- **Full sweep** (`node scripts/run-harnesses.cjs`): **136 run · 136 passed · 0 failed**.
- **New harnesses:**
  - `scripts/us-polish-batch.cjs`: 46 checks (items 1, 2, 3, 6), BEFORE pinned to `8a5c4b5a`;
  - `scripts/migration-function-grants.cjs`: 14 checks;
  - `scripts/money-sweep-parity-usd.cjs`: the `--usd` mode;
  - shared module `scripts/_us-polish-grouping.cjs`.

**Named re-pins** (each marked "⚠️ RE-PINNED … 19 October 2026" in place):
- `money-sweep-parity.cjs`: `us-polish-thousands-separators` (GB and `--usd`), plus the `--usd` allergen allowance.
- `_lp2-named.cjs` and `_lp1d2-named.cjs`: `us-polish-thousands-separators`.
- `_lp1e-named.cjs` and `language-phase-1e-tidy.cjs`: `us-polish-hg-truck-preview`. The fixture truck is not public on
  HatchGrab, so it previews generically.
- `batch-reservation-edit-lock.cjs`: the busy toast is worded from its code.
- `event-types.cjs`: the dashboard's seven refusal lines are accounted edits, each replacement asserted.
- `screenshot-truck-details.cjs`: the inbound route's sixth tolerated build (the state), and `lib/truck-share-meta.ts` as a
  named discovery reader.
- `us-rehearsal-fixes.cjs`: its BEFORE was "HEAD", which now contains those fixes (committed in `8a5c4b5a`). It is pinned to
  `978f6f67`.

## Localhost check (Dominic, `http://hatchgrab.localhost:3000`)

⛔ Don't press Connect or any Stripe button, take no card payments, and don't touch Pizzeria Gusto.

1. **Separator:**
   - in Manage › Reports for Pizza Kitchen, pick a range over £1,000: the revenue reads "£1,234.56"-style;
   - **Export CSV**: the same amounts read "£1234.56", with no separators;
   - or add a £1,000+ item to a Pizza Kitchen test basket: the basket, the dashboard card and the printed ticket show
     "£1,0xx.xx".
2. **Twin previews:** view source of `/trucks/test-kitchen-us/order` and look for:
   - `<title>Order from Pizza Kitchen US | HatchGrab</title>`;
   - `og:locale` "en_US";
   - `og:url` "…/trucks/test-kitchen-us/order".
   - `/trucks/test-kitchen-us` (hidden) reads "Food truck | HatchGrab".
   - A link-preview tool needs a public URL, so check these after deploy.
3. **Emailed-schedule fixture:** `node scripts/us-polish-batch.cjs`, section 2. US "NJ" is saved, "New Jersey" saves
   nothing, and GB is byte-identical.
4. **After running the "run now" block:** `node scripts/migration-function-grants.cjs` passes, and the verify query shows
   anon / authenticated false on all eight.

## SQL for Dominic

**Close the eight remaining anon-callable functions — NOT RUN, "run now".** Every caller is server code on the service role.
Nothing in the browser, no policy, default, view or cron job calls them.

```sql
begin;
revoke execute on function public.update_updated_at() from public, anon, authenticated;
revoke execute on function public.set_orders_updated_at() from public, anon, authenticated;
revoke execute on function public.increment_order_counter(text) from public, anon, authenticated;
grant  execute on function public.increment_order_counter(text) to service_role;
revoke execute on function public.increment_event_order_counter(uuid) from public, anon, authenticated;
grant  execute on function public.increment_event_order_counter(uuid) to service_role;
revoke execute on function public.populate_event_slots(text, date, time without time zone, time without time zone) from public, anon, authenticated;
grant  execute on function public.populate_event_slots(text, date, time without time zone, time without time zone) to service_role;
revoke execute on function public.decrement_stock(text, jsonb) from public, anon, authenticated;
grant  execute on function public.decrement_stock(text, jsonb) to service_role;
revoke execute on function public.assign_buzzer_atomic(text, uuid, uuid, smallint, boolean) from public, anon, authenticated;
grant  execute on function public.assign_buzzer_atomic(text, uuid, uuid, smallint, boolean) to service_role;
revoke execute on function public.claim_order_for_auto_reject(uuid[]) from public, anon, authenticated;
grant  execute on function public.claim_order_for_auto_reject(uuid[]) to service_role;
commit;
notify pgrst, 'reload schema';

-- verify (read-only): expect anon = false and authenticated = false on all eight; service_role true
select p.oid::regprocedure as fn,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role', p.oid, 'execute') as service_role
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('update_updated_at','set_orders_updated_at','increment_order_counter','increment_event_order_counter',
                     'populate_event_slots','decrement_stock','assign_buzzer_atomic','claim_order_for_auto_reject')
 order by 1;
-- and: expect zero rows (no non-extension function in public callable by anon)
select p.oid::regprocedure from pg_proc p
 where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
```

**`supabase/migrations/20261012_revoke_public_functions.sql` — already applied, file only, do not run** (its SQL, as
written in the file):

```sql
set lock_timeout = '3s';
begin;
revoke execute on function public.place_order_atomic(jsonb, text, text, uuid, text, date, jsonb) from public, anon, authenticated;
grant  execute on function public.place_order_atomic(jsonb, text, text, uuid, text, date, jsonb) to service_role;
revoke execute on function public.find_stranded_authorisations(integer, integer) from public, anon, authenticated;
grant  execute on function public.find_stranded_authorisations(integer, integer) to service_role;
revoke execute on function public.purge_order_drafts() from public, anon, authenticated;
grant  execute on function public.purge_order_drafts() to service_role;
commit;
notify pgrst, 'reload schema';
```

## Read-only queries (Supabase MCP)

All read-only, with results as reported in chat:
- **The three functions' grants:** first all open, then closed after Dominic's re-run.
- **The SECURITY DEFINER sweep:** 2 rows at first, then 0.
- `place_order_atomic_v2` and `orders_fill_currency_country`: closed.
- **Every function ACL:** 8 in fresh-create order, 5 closed.
- **`pg_default_acl` for functions:** new functions in `public` get anon and authenticated EXECUTE by default.
- **Every non-extension function anon can execute:** the 8 above.
- **Each one's exact signature.**
- **Their trigger, function and cron references:** two counters called by `place_order_atomic(_v2)`; `set_orders_updated_at`
  is the `orders_set_updated_at` trigger; no cron job.
- **Policy, column-default and view references:** none.
- **API and Postgres logs** (the 24h available): service_role only; no GRANT or REVOKE logged.
- **`list_migrations`:** only `20260518 production_slot_usage` (migrations are run by hand, not tracked).
- **Gusto's preview fields** (public on HatchGrab, logo, no cover, discovery row with logo and photo).
- **"Pizza Kitchen" discovery rows by name:** none.

## Undo (only if Dominic asks)

⛔ The function revokes have **no undo here on purpose**: reopening them to the public key is what this batch closed.
- **Item 1:** remove the HatchGrab branch in `generateMetadata` and the order layout's `generateMetadata`.
- **Item 3:** set `useGrouping: opts.grouping === true` again.
- Every other item is code only and is reverted by reverting the files.

## Not done / notes

- **Not given separators:** the Reports CSVs, price input boxes, stored values and API numbers (by design).
- **The order page's preview names a hidden-but-trading truck** (for example Pizza Kitchen or the twin), because the order
  page itself serves that truck. The truck page itself still previews such a truck generically.
- **Link previews are proved on fixtures and the dev server.** A real WhatsApp or Facebook crawl needs the deployed
  `www.hatchgrab.com` URL.
- **`update_updated_at()` is used by no trigger.** It is revoked here and otherwise left alone, not dropped.
