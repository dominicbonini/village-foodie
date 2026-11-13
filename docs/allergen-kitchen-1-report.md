# allergen-kitchen-1: "Contains" per dish + one "kitchen handles" list

*13 November 2026. Built as approved. Not deployed. One migration run (`20261101`); no data backfill, and no data written to any truck by hand. Pizzeria Gusto and Le Roi du Churrasco were not used or changed.*

## Summary

- **The model:**
  - A dish keeps ONE allergen list, "contains" (`menu_items_db.allergens`).
  - A truck has ONE kitchen list = confirmed active dishes ∪ available extras ∪ the allergens the truck adds. Only the added part is stored (`trucks.allergen_kitchen_extra`), and the rest is computed live.
  - One definition: `lib/allergen-kitchen.ts`. The customer pop-up, the wizard's last page and the Menu tab line all use it.
- **Built:**
  - the 10+ warning (wizard list, table, item editor);
  - the wizard's new last page, "your kitchen", with its confirmation (`trucks.allergens_confirmed_at`);
  - the card page's info line, which replaces the "may be present" checkbox. **A card's blanket never reaches a dish any more**, and its blanket and may_contain go to the kitchen list;
  - the AI menu reader's menu-level `may_contain`;
  - the fixed 390 px footers;
  - the Menu tab's "Kitchen also handles: … · Edit";
  - the customer pop-up's kitchen list and new note, the new severe-allergy line in every locale, and an extra's allergens in the dish pop-up;
  - the reference manual (V16.22, with the deals-order-1 entry).
- **Proof:**
  - `scripts/allergen-kitchen-1.cjs` (swept): **30/30**.
  - `scripts/allergen-kitchen-1-live.cjs` (browser; mounted Manage + localhost App Tester): **76/76**.
  - Full sweep: **214 pass, 5 fail** (other sessions' ru-KZ legal files and pricing-copy-4's planTable; §6).
  - 44 screenshots in `docs/allergen-kitchen-1/`.

## 0 · Flags

- **No span of the prompt arrived garbled.** I found no contradiction that needed a stop. Four judgement calls, all in line with the brief:
  1. **Apostrophes.** The approved en-GB and fr-FR wording uses a straight `'`. Both message files use the typographic `’` throughout, and `scripts/france-1.cjs` forbids a straight apostrophe in French (ICU can read it as an escape). So the new strings are stored with `’`: "Only what’s in this dish’s recipe.", "d’autres", "l’absence"… The words are exactly the approved ones.
  2. **The count in Slavic and Baltic languages.** The translations first used ICU plural forms for `{count}`. The repo's translation check rejects plural syntax where English has a plain `{count}`. So pl, cs, sk, ro, hr, sl, sr, lv, lt, is, ru-KZ and uk use a count-neutral form ("Zaznaczone alergeny: {count}. …"). It reads correctly for any number.
  3. **"Active dish"** = `menu_items_db.is_active` (Manage and `/api/menu` already load only active dishes). **"Available extra"** = `modifier_options.available !== false` (its base setting, not a per-event sell-out).
  4. **Import skipped or card-only:** a card's blanket and may_contain and the menu's "may contain" are still ADDED to the kitchen list at commit (unconfirmed), as §5 says ("goes into the kitchen extra list at import commit"). When the operator reaches the last page, exactly what they leave ticked is saved, with the confirmation.
- **Standalone wizard:** the card's blanket and may_contain are staged and pre-ticked on the last page, and saved only from there ("Done"). Closing the wizard earlier ("Save & finish later" / "Skip") keeps the dish confirmations but not the staged kitchen allergens.
- **The demo's server-side menu carry-over** (`lib/demo-menu-carry.ts`) doesn't add the menu's "may contain" to the kitchen list; only the import commit does, as specified. A claimed demo that goes through the import wizard does.
- **The extras check** (§6.2) uses an extra added in the BROWSER's copy of App Tester's menu: App Tester has no extras (read-only query below). Nothing was written.
- **Sweep failures that are not this work** (§6): another session's unfinished `ru-KZ` legal files; `contact-1`'s pin on the `planTable` message files changed by the earlier pricing-copy-4 commit, not reached before because the check stopped on ru-KZ; and `event-types-render`'s known intermittent font measurement.

## 1 · Database

**Migration `supabase/migrations/20261101_allergen_kitchen.sql`**, run with `scripts/db-migrate.cjs --approved-by-dominic` (committed at `0ff41a35`, applied in one transaction, no error):
```sql
begin;

alter table public.trucks add column if not exists allergen_kitchen_extra text[] not null default '{}';
alter table public.trucks add column if not exists allergens_confirmed_at timestamptz null;

alter table public.allergen_audit_log drop constraint if exists allergen_audit_log_field_check;
alter table public.allergen_audit_log add constraint allergen_audit_log_field_check
  check (field = any (array['allergens', 'dietary', 'allergens_verified', 'card', 'kitchen']));

commit;
```
`change_type` has no CHECK; `lib/allergen-audit.ts` gains `'kitchen_edit' | 'kitchen_confirm'`.

**Read-only queries:**
```sql
select table_name, column_name, data_type, column_default, is_nullable from information_schema.columns
where table_schema='public' and table_name='trucks' and column_name in ('allergen_kitchen_extra','allergens_confirmed_at');
-- → allergen_kitchen_extra text[] NOT NULL default '{}' · allergens_confirmed_at timestamptz NULL

select pg_get_constraintdef(oid) from pg_constraint where conname = 'allergen_audit_log_field_check';
-- → CHECK (field = ANY (ARRAY['allergens','dietary','allergens_verified','card','kitchen']))

select table_name, column_name, data_type, column_default from information_schema.columns
where table_schema='public' and table_name in ('menu_items_db','modifier_options','modifier_groups')
  and column_name in ('is_active','is_available','available','deleted_at','archived','active') order by table_name, column_name;
-- → menu_items_db.is_active / is_available (default true); modifier_options.available / is_active (default true)

select g.id as group_id, g.name as group_name, o.id, o.name, o.available, o.allergens,
  (select count(*) from item_modifier_groups img where img.group_id = g.id) as dishes_linked
from modifier_groups g left join modifier_options o on o.group_id = g.id
where g.truck_id = 'test-truck-3-2' order by g.name, o.sort_order limit 30;
-- → no rows: App Tester has no extras
```

**Writes (`app/api/manage/route.ts` `update_settings`):**
- the two columns are allowlisted;
- `allergen_kitchen_extra` keeps only the country list's labels (`onlyListed`);
- `allergens_confirmed_at` is stamped with the server's clock (the body only says yes);
- owner/admin only (the allergen gate) when the list changes or the confirmation is sent;
- audit rows: field `kitchen`, `kitchen_edit` (old → new list) and `kitchen_confirm`.

## 2 · What changed, by the brief's numbers

| # | Where | Change |
|---|---|---|
| 2 | `AllergenWizardModal` list + table; item editor | "Only what’s in this dish’s recipe." under "Allergens" (the table: under the ALLERGENS column group). **10+** of the country's allergens on one dish → an amber box under the chips (table: under the dish name), wizard wording / item editor wording. Never blocks Confirm or saving. The item editor's save and verified behaviour is unchanged. |
| 3 | `AllergenWizardModal` mode **4** | "Last step: your kitchen" / "Which allergens does your kitchen handle?"; chips in list order. **Locked** (amber ✓) = confirmed dishes' and available extras' allergens; **added** (orange outline ✓, tappable) = the truck's list (stored ∪ staged); others unticked. Legend; "Customers will see:" quoting the pop-up's own words with the live list; the confirmation checkbox (unticked each time); ← Back \| Done (import: Next →), disabled until ticked. Staff: read-only with Close. **Standalone:** "Done" on the review opens it (Save & finish later / Skip still close); its Done saves `allergen_kitchen_extra` + `allergens_confirmed_at`, then the display mode, then closes. **Import:** the review's Next opens it; its Next stages the list and goes on to ③ Kitchen setup; written after the commit. Card-only mode and "Skip allergen setup for now" never show it. |
| 4 | `CardUploadPage` (import 1.6, standalone 2.4) | The checkbox is gone (`cardBlanketOptIn`, the dead `stdBlanket`, the props). **The blanket merge into every dish at commit is deleted.** An info line when the card has a blanket list, the names translated (`allergenLabel`). blanket + may_contain → the kitchen list (import: staged to commit; standalone: staged, pre-ticked on the last page). They still appear in the saved card text. **Footers at 390 px:** the import's Allergens step and the wizard review have Back + Next (or Save & finish later / Done) on one row and Skip as a centred link underneath. |
| 5 | `lib/menu-extract.ts` | "MAY CONTAIN" IS NEVER A DISH ALLERGEN: a "may contain" / traces / "prepared in a kitchen that…" / "made in an environment with…" note goes into one top-level `may_contain` list, never a dish. The import keeps it (`importMenuMayContain`) and adds it to the kitchen list at commit. |
| 6 | Order page + `/api/menu` | `/api/menu` returns `truck.kitchen_allergens` (per-dish mode; `[]` in card mode), computed by `lib/allergen-kitchen.ts`. Extras' allergens were already sent. **Pop-up (per-dish):** "Allergens handled in this kitchen" + the list (translated, sorted as before) + "Each dish shows the allergens in its recipe. We can’t guarantee any dish is free from traces."; empty → "Allergen info not provided — please confirm directly with the truck." **Severe line, every locale:** "If you have a food allergy, please contact the truck before ordering." **Dish pop-up:** an extra's allergens under its name, small orange, translated, comma-separated — only when it has any and only per dish. Dish tags unchanged; card mode unchanged but for the severe line. |
| 7 | Manage › Menu › Allergens | Per-dish mode: "Kitchen also handles: {list} · Edit" under "Display mode…"; Edit (owner/admin) opens the wizard on the last page; Done saves and closes. Staff see the line without Edit. |
| 8 | messages | 17 keys (16 new + the severe line) in en-GB and fr-FR as approved (house apostrophe), and in every other language base. Regional overrides for es-AR / es-PY / es-UY (voseo) and pt-AO, and de-CH (Swiss "ss"). Removed everywhere: `manageAllergens.cardUpload.blanket`, `order.allergensUsed`, `order.allergensSeeEach`. Back-translations added (`docs/i18n/back/`). |
| 10 | `docs/reference-manual.md` | V16.22: the allergen model, the deals-order-1 entry, a one-line order-page-2 note; ⛔ corrections on the old card-matching section and the formules backlog item. |

**Files:**
- **New:** `lib/allergen-kitchen.ts`, `scripts/allergen-kitchen-1.cjs`, `scripts/allergen-kitchen-1-live.cjs`, `scripts/_named-allergen-kitchen-1.cjs`.
- **Changed code:** `app/(app)/manage/[token]/page.tsx`, `app/(app)/trucks/[slug]/order/page.tsx`, `app/api/manage/route.ts`, `app/api/menu/[truckId]/route.ts`, `lib/menu-extract.ts`, `lib/allergen-audit.ts`, `lib/i18n/namespaces.ts` (Manage reads the `order` words).
- **Messages:** `messages/*.json` and their generated `messages/ns/**` / catalog.

## 3 · Languages needing a native-speaker check

Translated faithfully (the approved English and French as the source, each language's existing terms and register):
- **The 47 other language bases:** de-DE, es-ES, it-IT, pt-PT, nl-NL, sv-SE, da-DK, nb-NO, pl-PL, cs-CZ, hu-HU, sk-SK, ro-RO, hr-HR, sl-SI, fi-FI, et-EE, lv-LV, lt-LT, el-GR, bg-BG, pt-BR, ms-MY, ja-JP, zh-HK, th-TH, ar-AE, id-ID, vi-VN, is-IS, sr-RS, tr-TR, ko-KR, zh-TW, he-IL, ru-KZ, uk-UA, kk-KZ, uz-UZ, az-AZ, ka-GE, hy-AM, mn-MN, hi-IN, bn-BD, ur-PK, ne-NP.
- **The regional overrides:** es-AR, es-PY, es-UY, pt-AO, de-CH.

**Worth a native eye:**
- the count-neutral "{count}" sentences (pl, cs, sk, ro, hr, sl, sr, lv, lt, is, ru-KZ, uk);
- lv-LV and lt-LT "truck" ("food truck" / "furgone");
- he-IL, hi-IN and ur-PK phrase the confirmation without a gendered "I confirm";
- ja-JP's helper line is a full polite instruction.

## 4 · Checks: `scripts/allergen-kitchen-1.cjs` (swept) ✅ 30/30

- **§1 lib:**
  - fromMenu = confirmed active dishes ∪ available extras, list labels only (Lactose, Nuts, Vegan, an inactive or unconfirmed dish, an unavailable extra: all dropped);
  - added = the truck's list, list labels only;
  - all = the union;
  - a US truck counts Milk/Wheat, not "Dairy";
  - English names keep the stored A→Z order; French sort by the shown name.
- **§2 a card's blanket never reaches a dish:**
  - no blanket merge in the commit;
  - the checkbox state is gone;
  - the info line uses `allergenLabel`;
  - `mergeAllergensUnion` is only used for a card's per-dish entries;
  - blanket + may_contain are staged for the kitchen list (standalone and import) and written after the commit.
- **§3 the AI reader:** the old rule is gone, `may_contain` is returned and carried.
- **§4 the server:**
  - `update_settings`: the allowlist, the filter, the server clock, the gate, the audit;
  - `/api/menu`'s `kitchen_allergens` (per dish only);
  - the migration has no backfill.
- **§5 the words:**
  - every new key in every one of the 48 bases with its placeholders;
  - the removed keys gone from all 103 locale files;
  - **the severe line is the new sentence in all 103 locales** (no locale resolves to its old one).

## 5 · Checks: `scripts/allergen-kitchen-1-live.cjs` (browser)

**✅ 76/76**, on the final build (`next start`, localhost). Run: `npx next start -p 3100 &` then `node scripts/allergen-kitchen-1-live.cjs --live`.

- **§A, the 10+ warning** (en-GB and fr-FR):
  - **List:** "Kitchen Sink" (10 ticked) shows the wizard wording; "Nine Lives" (9) doesn't; ticking a 10th brings it up.
  - **Never blocks:** Confirm stays enabled and confirms (`allergens_verified` true, the 10 kept).
  - **Table (1280 and 390):** the warning sits under the dish name; the helper line is under the ALLERGENS group.
  - **Item editor:** none at 9, the editor wording at 10, and the tap still saves at once with `allergens_verified` true.
- **§B, the last page:**
  - "Done" on the review opens it (not close): 10 locked chips (the confirmed dishes' and the extra's Eggs), 1 added (Sesame, stored), 3 others.
  - "Customers will see:" quotes the pop-up (heading, the 11 names, the note).
  - **Done is disabled until the confirmation is ticked.** Done saves `{ allergen_kitchen_extra, allergens_confirmed_at: true }`, then the display mode, and closes.
  - Staff see it read-only with Close.
- **§B, the card page:** the info line is translated ("Votre fiche indique que Sésame peut être présent…"), with no checkbox. The blanket is pre-ticked on the last page and **no dish write carries it**.
- **§B, the import end to end:** the menu's "may contain" (Mustard) and the card's blanket (Sesame) and may_contain (Tree nuts) go through to commit.
  - The intercepted commit body: **no dish carries Sesame, Mustard or Tree nuts**.
  - `update_settings` gets all three with the confirmation.
  - On the last page, Mustard and Tree nuts show locked (they're in the truck's existing dishes) and Sesame added.
- **§B, footers at 390 px:**
  - the import's Next is fully on screen, with Skip a centred link under it;
  - the import review's Next is on screen;
  - the wizard's "Save & finish later" is on screen (en-GB and fr-FR).
- **§B, the Menu tab:**
  - "Kitchen also handles: Celery, … Sesame … · Edit"; Edit opens the wizard on the last page;
  - staff see the line without Edit.
- **§C, the customer page (App Tester, localhost):**
  - the pop-up's "Allergens handled in this kitchen" equals the server's `kitchen_allergens` (Dairy, Fish, Gluten, Tree nuts; fr: Fruits à coque, Gluten, Lait, Poissons), with the new note;
  - the new severe line in per-dish and card mode;
  - card mode shows no kitchen list;
  - the dish pop-up: "Pesto drizzle" shows "Tree nuts, Dairy" / "Fruits à coque, Lait", and "Fresh basil" (no allergens) shows nothing;
  - card mode: no extra shows allergens.

## 6 · The sweep

**Final full sweep** (`node scripts/run-harnesses.cjs`, 219 listed files): **214 pass, 5 fail. None of the five is this work:**
- **paperwork-1, legal-languages-1, world-countries-3, tidy-1:** `content/legal/ru-KZ/*.md` is missing (another session's unfinished ru-KZ legal work).
- **contact-1:** its pin finds the `planTable` message files changed since 3d6228b7. They were last changed by pricing-copy-4 (`f3a77387`), and no allergen file is in its list. Before this work the harness stopped earlier, on ru-KZ.

`event-types-render` (the intermittent font measurement) passed in this sweep.

**Re-pinned for this work**, each as a precise named change, rebuilt from BEFORE's own data:
- **`scripts/_named-allergen-kitchen-1.cjs`** holds:
  - `undoMenuPrompt` / `undoMenuExtractSource` (the AI prompt edit);
  - `undoFile` (exact NOW→BEFORE pairs for the order page and `/api/menu`, round-trip proven to `0ff41a35`);
  - `manageView` (the kitchen line, the footers, the recipe lines, the card info line);
  - `orderPageView` (the pop-up's kitchen list and note, an extra's name wrapper).
- **The harnesses that use it:**
  - **language-phase-1d / 1d2:** entry `allergen-kitchen-1-manage`; 488/488 and 692/692;
  - **language-phase-1a / 2:** entry `allergen-kitchen-1-order-page`, plus the 1a fixture's truck gaining `kitchen_allergens: ['Gluten','Dairy']` — what `/api/menu` now computes from that fixture's dishes; 1048/1048 and 2010/2010;
  - **language-phase-1e:** the severe-line rewording recorded exactly in `_lp1e-words.cjs`;
  - **messages-parity:** the new keys named in `_messages-parity-1e.cjs`, and the reworded and removed keys in `fixtures/language-phase-1e-gb-named.json`;
  - **money-sweep-parity (+usd):** prompt, `may_contain`, kitchen line, helper line;
  - **schedule-graphics-places:** a counted list of the page lines this work removed, held only while the new forms are in the page;
  - **cwv-2, costs-accounts-1:** the file undo, chained before the earlier ones;
  - **audit-fixes, phase3-screens:** `kitchen_allergens` checked, then left out of the byte compare;
  - **us-readiness, canada-1:** the prompt undo;
  - **allergen-card-country:** its revert patches follow the wizard's mode 4 and the kitchen lines.
- **Words:** france-1 (back-translations, apostrophes), europe-languages-1 (de-CH "ss"), and the translation checks (count-neutral sentences).

## 7 · Screenshots (`docs/allergen-kitchen-1/`, en-GB and fr-FR, 390 px + 1280 where the layout differs)

| # | Screen |
|---|---|
| 01 | The review list, 10+ warning (`01-review-list-10plus-{en-GB,fr-FR}-390`) |
| 02 | The review table, warning under the dish (`02-review-table-10plus-{…}-{390,1280}`) |
| 03 | Item editor, warning at 10 (`03-item-editor-10plus-{…}-390`) |
| 04 | The kitchen page — top, bottom ("Customers will see:", the confirmation), ticked (`04-kitchen-page[-bottom]-{…}-{390,1280}`, `04b-…-ticked-…-1280`) |
| 05 | Standalone card page, the info line (`05-card-page-info-line-{…}-390`) |
| 06–07 | Import Allergens step with the fixed footer, and its card page's info line (`06-import-footer-fixed-…`, `07-import-card-info-line-footer-…`) |
| 08 | Import: the kitchen page (`08-import-kitchen-page[-bottom]-{…}-390`) |
| 09 | Wizard review footer fixed (`09-review-footer-fixed-{…}-390`) |
| 10 | Menu tab: "Kitchen also handles: … · Edit" (`10-menu-kitchen-line-{…}-390`) |
| 11–12 | Customer pop-up, per dish (kitchen list) and card mode (`11-customer-popup-per_dish-…`, `12-customer-popup-card-…`) |
| 13–14 | Dish pop-up with an extra's allergens (per dish) and none in card mode (`13-dish-popup-extras-per_dish-…`, `14-…-card-…`) |

## 8 · Not done here

- **Not deployed.** The migration is live (additive columns; the current site ignores them). The code changes need a deploy.
- **Le Roi du Churrasco** fixes its own dishes by hand, as the brief says. Nothing of theirs was changed.
