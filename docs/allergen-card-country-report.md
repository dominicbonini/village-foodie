# allergen-card-country — "allergen card on its own" can be switched off per country (Ireland only, for now)

**Date:** 21 October 2026 · **Branch:** `main` (uncommitted, on top of `fcde8b09`) · nothing pushed or deployed · no
database change run (the SQL in §5 is **NOT RUN**).

**The prompt** arrived intact; nothing was garbled and nothing contradicted. On your note about setting up from the
landing page: that path is the **menu import flow**. Its Allergens step uses the same chooser component as the
wizard, so it follows the same rule (§2, row 3).

## Summary

- **The setting.** A new `country_settings.allergen_card_only_allowed` column (not null, default true, IE false).
  - It is read by the loader and the types, and edited in Admin › Countries as one toggle row: "Allergen card on its
    own", with the hint "Off where the law needs allergens shown against each dish".
  - The form accepts only true or false.
  - No code checks for a country code anywhere: everything reads the setting.
- **Where it applies when OFF (Ireland):**
  - **The allergen wizard** (Manage › Menu › Allergens) skips page 1 and opens on page 2, "Do you have an allergen card
    to upload?".
    - Page 2 has no Back.
    - Without the card page, it opens straight on the per-dish review, also with no way back to page 1.
    - An uploaded card still builds the per-dish allergens, as today.
  - **The menu import's Allergens step** (setup from the landing page / signup) skips its chooser and opens on the
    card page, per dish. Its Back leaves the step.
  - **The API.** `/api/manage` `update_settings` refuses a **change** to `card`: 400, `allergen_card_not_allowed`,
    "Allergens must be shown against each dish where your truck trades, so an allergen card on its own can't be
    chosen."
  - **A truck already saved as card:**
    - its order page shows it **per dish**;
    - Manage reads "Per dish" and shows a notice asking it to confirm its dishes;
    - its other settings still save.
- **Trucks affected: 0.** There are no Irish trucks (read-only, 21 Oct: GB 11, US 1).
- **GB, US, AU and NZ are byte-identical.** The setting is ON for them, and a harness renders the wizard (every page),
  the Menu tab and the import's Allergens step for GB and US with today's code and with this workstream's edits
  reverted: identical. `/api/menu` too.
- **Proof:**
  - new harness `allergen-card-country`: **30/30**;
  - tsc clean;
  - build passes;
  - **no new lint findings**;
  - full sweep **153/153**;
  - 7 harness files re-pinned by name (§6);
  - screenshots in `docs/allergen-card-country/`.

## 1 · Map: where the display mode is chosen, saved, shown or read

**What the stored values mean** (`trucks.allergen_display_mode`):

| Value | Meaning | Where |
|---|---|---|
| `per_dish` | Allergens against each dish. Only confirmed dishes show; an unconfirmed dish is hidden from customers. Customers also see a derived summary (the union of confirmed allergens) | Wizard "Show allergens against each dish (Recommended)" |
| `card` | One allergen card (text or a PDF/image), shown as is. Per-dish tags hidden; unconfirmed dishes still listed | Wizard "Show an allergen card" |
| `both` | **Legacy.** The chooser no longer offers it. Read as per dish everywhere (Manage labels it "Per dish") | — |
| `null` | Not chosen yet. The order page treats it as per dish ("show whatever exists"); Manage says "not set" | New trucks (`lib/provision-truck.ts:187`) |

**Where each place is, and what this workstream did:**

| Where | file:line | Does | This workstream |
|---|---|---|---|
| Wizard page 1 (the chooser) | `app/manage/[token]/page.tsx:2704` (`AllergenModeChooser`, `components/manage/primitives.tsx:188`) | per dish / card | Skipped when OFF (`:2136`, `:2142`) |
| Wizard page 2 (card upload, per dish) | `:2715-2745` | "Do you have an allergen card to upload?" | Back hidden when OFF (`:2742`) |
| Wizard review | `:2755` | per-dish confirm table; its finish saves `per_dish` (`:2763-2764`) | Back hidden only when OFF and there's no page 2 (`:2755`) |
| Wizard card editor (mode 2) | `:2437` | saves `card` | Unreachable when OFF |
| Wizard save | `:5206` | `update_settings { allergen_display_mode }` | — |
| Manage › Menu "Allergens · Display mode" card | `:5236-5280` | the label, the review count, "Set up / review" | A stored `card` is read as per dish when OFF, with the notice (`:5240`, `:5278`) |
| Menu tab "N dishes hidden" notice | `:4768` | hidden-dish count (per dish only) | Counts a stored `card` as per dish when OFF |
| Cross-tab allergen banner / badge | `:781` | quiet in card mode | A stored `card` counts as per dish when OFF |
| Import flow's Allergens step (setup) | chooser `:6374`, entry `:3823`, Back `:6413`, commit save `:4394` | per dish / card, then the card page | Skips the chooser when OFF (`:2964`, `:3823`); Back leaves the step |
| Signup / provisioning | `lib/provision-truck.ts:187` (operator: `null`), `:237` (**demo: `card`**), `:558` | the initial value | Unchanged. See §7, note 2 |
| API save | `app/api/manage/route.ts:2046`, `:2061`, `:2069` | the allowlist and owner gate | Refuses a change to `card` when OFF (`:2069`) |
| Customer API | `app/api/menu/[truckId]/route.ts:95-99`, `:642`, `:890`, `:904` | the hide rule, the payload mode, the verified flag | A stored `card` served as `per_dish` when OFF |
| Order page | `app/trucks/[slug]/order/page.tsx:3261`, `:3267` (per-item chips), `:4322` (card vs derived summary) | renders by mode | Unchanged: it gets `per_dish` from the API |
| Go-live checks | `lib/go-live-checks.ts:96` | card with no card | Unchanged (no live caller) |
| AI prompts | — | none read the display mode | — |

## 2 · Enforcement, by the setting

| # | Where | ON (GB, US, AU, NZ) | OFF (IE) |
|---|---|---|---|
| 1 | Wizard (Manage › Menu › Allergens) | page 1, as before | opens on page 2 (no Back); with no card page, opens on the review (no Back); the review's Back goes to page 2 |
| 2 | Any other chooser | as before | the only other is the import's (row 3) |
| 3 | Import flow's Allergens step | chooser, then card page | `pendingDisplayMode = 'per_dish'`, opens on the card page; Back returns to the menu review |
| 4 | API save | as before | a **change** to `card` → 400 `allergen_card_not_allowed`, nothing written. A truck already on `card` saving its other settings (the form sends the whole truck) is not refused |
| 5 | Order page | as stored | stored `card` → `per_dish`: confirmed dishes show their allergens, unconfirmed are hidden, and the derived summary replaces the card |
| 6 | Manage | as stored | stored `card` → reads "Per dish", the review count drives the amber state, and the notice "An allergen card on its own can't be used where your truck trades, so customers see allergens against each dish. Please confirm each dish's allergens." shows |

**Files:**
- `lib/country-settings.ts` (column list, `mapCountryRow`), `lib/country-settings-types.ts`;
- `lib/admin/country-form.ts` (type, label, round trip, the boolean check), `lib/admin/country-actions.ts` (column);
- `components/admin/CountriesTab.tsx` (the row);
- `app/manage/[token]/page.tsx`;
- `app/api/manage/route.ts`, `app/api/menu/[truckId]/route.ts`;
- `messages/en-GB.json` (`errorsManage.allergen_card_not_allowed`, `manageMenu.allergens.cardNotAllowed`; generated
  `messages/ns/en-GB/*.json`).

## 3 · Proof

- **`scripts/allergen-card-country.cjs`** (registered; 153 harnesses): **30/30**. It runs on fixtures: the
  language-phase-1d render kit and the in-memory database; nothing live.
  - **§1 the data:**
    - the migration's column, default and IE-only `false`;
    - the seed default;
    - the loader selects the column, reads `true`/`false`, and refuses missing, `null` or `"false"`;
    - the Admin form round trip, Ireland column, both values;
    - a non-boolean form is refused;
    - one toggle row with its hint;
    - no `'IE'` in the code that reads the setting.
  - **§2 the wizard:**
    - ON: page 1 ("Show allergens against each dish", "Show an allergen card");
    - OFF: page 2 first, with no card option, no per-dish chooser and no Back;
    - OFF with no card page: the review, no Back;
    - the review keeps its Back to page 2.
  - **§3 the import flow:** the entry and Back rules (source), and the IE card page rendered with no card option.
  - **§4 the API:**
    - IE → card refused (400, the code and sentence, nothing written);
    - IE → per dish saved;
    - GB → card saved;
    - an IE truck already on card still saves its other settings.
  - **§5 /api/menu:**
    - an IE card truck is served `per_dish`, with the unconfirmed dish hidden;
    - GB card / per dish / unset are byte-identical to the code without this workstream.
  - **§6 Manage:** an IE card truck's Allergens card reads "Per dish" with the notice.
  - **§7 GB and US byte-identical:** 12 views each (six wizard states; the Menu tab list and card mode with and without
    a card; the import's chooser, card and review), today's code against the code with this workstream's edits reverted
    by exact patches.
    - The revert is proved effective: for Ireland the reverted code still shows page 1 and serves `card`.
- **GB/US are also pinned by the sweep's own BEFORE captures** (`language-phase-1d` / `-1d2` render the wizard, the
  Menu tab and the import steps for GB and US).
- **AU and NZ** take the same code path with the setting ON (the default), so they render exactly as GB/US do.
- **tsc:** exit 0.
- **Build:** `next build` exit 0, no errors.
- **Lint:** every changed product file has HEAD's counts:
  - `lib/country-settings.ts`, `lib/country-settings-types.ts`, `lib/admin/country-form.ts`,
    `lib/admin/country-actions.ts`, `components/admin/CountriesTab.tsx`: 0/0;
  - `app/manage/[token]/page.tsx`: 261/81;
  - `app/api/manage/route.ts`: 20/6;
  - `app/api/menu/[truckId]/route.ts`: 32/0.
- **Full sweep:** `node scripts/run-harnesses.cjs` → **153 run · 153 passed · 0 failed** on the final tree. The first run, before the re-pins, had exactly the 7 named in §6 failing.
- **Screenshots** (`docs/allergen-card-country/`, from `scripts/allergen-card-country-screens.cjs`: the real
  components, bundled for a browser, with fixtures, in WebKit and Chromium, and no page errors):
  - `ie-wizard-page2-390.png`, `ie-wizard-page2-1280.png` (+ `-chromium`): Ireland's wizard opens on "Do you have an
    allergen card to upload?" with Yes/No and Next, and no Back;
  - `gb-wizard-page1-390.png`, `gb-wizard-page1-1280.png` (+ `-chromium`): the UK's page 1, unchanged, for comparison;
  - `admin-row-1440.png` (+ `-chromium`): Admin › Countries' new row, GB on, IE off, US on (the toggles' labels
    confirm the order).

## 4 · Read-only SQL run

```sql
select country, coalesce(allergen_display_mode, '(null)') as mode, count(*) as trucks from public.trucks group by 1, 2 order by 1, 2;
```
It returned:
- GB: `(null)` 2, `card` 5, `per_dish` 4;
- US: `card` 1;
- **no IE trucks, so 0 trucks would be shown per dish instead of card.**

```sql
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'country_settings' and column_name = 'allergen_card_only_allowed';
```
It returned no rows: the column doesn't exist yet.

## 5 · NOT RUN SQL — "run now" (before the deploy)

**Why before:** the loader names its columns and will select this one. It must exist before the new code runs. The
current code never selects it, so adding it first changes nothing. (`supabase/migrations/20261029_allergen_card_only.sql`)

```sql
-- 20261029_allergen_card_only.sql — allergen-card-country (21 October 2026; docs/allergen-card-country-report.md).
begin;

alter table public.country_settings add column if not exists allergen_card_only_allowed boolean not null default true;
comment on column public.country_settings.allergen_card_only_allowed is
  'Whether trucks in this country may show allergens as one allergen card for the whole menu (allergen_display_mode = card). False where the law requires allergen information per dish (Ireland, FSAI). Admin › Countries.';

update public.country_settings set allergen_card_only_allowed = false, updated_at = now(), updated_by = 'allergen-card-country'
  where country_code = 'IE';

commit;

-- verify — after the commit
select country_code, enabled, allergen_card_only_allowed from public.country_settings order by country_code;
```

**Expected after it runs:** AU, GB, NZ and US `true`; IE `false`.

**Deploy order:** this SQL first, then the deploy. If the address-formats-1 SQL is also pending, its order is unchanged:
its optional "run now" block, then the deploy, then its "run after deploy" block.

## 6 · Re-pins

Each is marked `⚠️ RE-PINNED (allergen-card-country, 21 October 2026)` and covers only this approved change.

- **`scripts/_country-settings-gb.cjs`** (the shared seed helper): fixture rows take the new column's default, read
  from the migration (like `phone_check`).
- **`countries-api`:** its column map gains `allergen_card_only_allowed`.
- **`us-readiness`** (`_us-readiness-us.cjs`): the wizard's first lines may now include the commented
  `cardOnlyAllowed` line between the set and `t`, named exactly.
- **`event-pricing`:** the three `/api/menu` lines that now read the effective mode are excused by count. A companion
  check requires the new forms.
- **`language-phase-1d` / `-1d2`** (`_lp1d-named.cjs`, `_lp1d2-named.cjs`): GET `/api/manage`'s `countrySettings`
  gains `allergenCardOnlyAllowed: true` after `allergenSet` (`allergen-card-country-field`, `-field-2`, via the new
  `scripts/_lp-allergen-card-country.cjs`).
- **`messages-parity`** (`_messages-parity-1e.cjs`): the two new messages are named. Their text is held by this
  workstream's harness.
- **`schedule-graphics-places`:** the four Manage lines that now carry the rule are in the "lost line" allowlist.

## 7 · Notes

1. **Only a change to card is refused.** Manage's settings save sends the whole truck form, so refusing any `card`
   value would block every save for a truck already on `card`. Such a truck is shown per dish instead.
2. **Demo trucks are created as `card`** (`lib/provision-truck.ts:237`). An Irish demo isn't possible while Ireland is
   off, because demos need a switched-on country. Once Ireland is on, an Irish demo would start as `card` and so be
   shown per dish with the notice. **I didn't change provisioning,** because a demo's dishes may not be confirmed and
   that's a design call. A one-line change makes provisioning write `per_dish` where the setting is off; say if you
   want it.
3. **A country that can't be read changes nothing.** The API and `/api/menu` then behave exactly as before (allowed).
   The wizard and the import read the setting from the page's country settings; with none, it counts as allowed.

## 8 · Files

- **New:**
  - `supabase/migrations/20261029_allergen_card_only.sql`
  - `scripts/allergen-card-country.cjs`, `scripts/allergen-card-country-screens.cjs`
  - `scripts/_lp-allergen-card-country.cjs`
  - `docs/allergen-card-country/*.png`
- **Changed (product):**
  - `lib/country-settings.ts`, `lib/country-settings-types.ts`
  - `lib/admin/country-form.ts`, `lib/admin/country-actions.ts`, `components/admin/CountriesTab.tsx`
  - `app/manage/[token]/page.tsx`
  - `app/api/manage/route.ts`, `app/api/menu/[truckId]/route.ts`
  - `messages/en-GB.json` and its generated `messages/ns/en-GB/*`
- **Changed (harnesses):** `scripts/harnesses.json` (+1) and the re-pins in §6.

## Undo (only if Dominic asks)

- **Code:** revert this workstream's hunks, each marked `allergen-card-country`. Several of these files also carry
  other uncommitted workstreams, so don't check them out. Delete the new files.
- **The SQL, if it has run:**

  ```sql
  begin;
  alter table public.country_settings drop column if exists allergen_card_only_allowed;
  commit;
  ```

  ⚠️ Only after reverting the code: the new loader selects the column.
