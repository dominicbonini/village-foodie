# allergen-screens-1: every allergen screen as it is today

*13 November 2026. Review only: no code, migration or data change, nothing saved. The only files written are this report and the screenshots in `docs/allergen-screens-1/` (76 PNGs). Line numbers are at `43f4415b`.*

## Summary

- **One allergen list per dish, and it means "contains".** `menu_items_db.allergens` (and `modifier_options.allergens`) holds a single list. No column anywhere records "may contain" / traces, for a dish or for the truck (§DB).
- **"May contain" is read today, but it lands in the same list or in free text:**
  - **The AI menu reader** is told to take an allergen from a "may contain" note into the dish's `allergens` (`lib/menu-extract.ts:143-147`).
  - **The allergen-card reader** returns `contains`, `may_contain`, `blanket` and `cross_contamination` separately (`app/api/manage/process-allergens/route.ts:55-96`). Of those, only `blanket` can reach dishes, and only through the opt-in "may be present across all dishes" box in the **import**. It is merged into `allergens` as if contained (`page.tsx:4181-4186`). `may_contain` only ever reaches customers as a line of the saved card text (`page.tsx:4212`).
- **The same box in the standalone wizard does nothing.** `stdBlanket` (`page.tsx:2197`) is set by the checkbox (`:2779-2780`) and read nowhere.
- **Every screen documented, in the order a truck meets them:** import → standalone wizard → per-dish confirm (list and table) → item editor → the Menu tab's Allergens section → the customer order page → everything else. Each has a screenshot (en-GB, key screens also fr-FR; 390 px, plus 1280 where the layout differs) or is marked "from code".

## 0 · Flags and method

- **No span of the prompt arrived garbled. No instructions contradict each other.**
- **The brief's line numbers have moved:**
  - `mergeAllergensUnion` is at **4184-4186** (brief: ~4176);
  - `stdBlanket` is declared at **2197** and wired at **2779-2780** (brief: ~2190, ~2772).
- **How the screens were captured:**
  - **Customer screens (§7):** the real order page on **localhost** (`next start`) against the test truck **App Tester** (`test-truck-3-2`), with read-only GETs.
    - For **fr-FR**, the browser's copy of `/api/events` and `/api/menu` gets `time.locale = fr-FR`, which is where the page takes its language from.
    - For **card mode**, the browser's copy of `/api/menu` gets `allergen_display_mode = 'card'` and the saved card text of the test truck `test-kitchen` ("Test allergens", read by SELECT). That truck has no upcoming event, so its own order page has no menu to show.
    - Nothing was written.
  - **Manage screens (§1–6):** Manage refuses anyone not signed in as the truck's owner, and there is no session for App Tester's owner. So, as the repo's own `scripts/costs-accounts-1-screens.cjs` and `allergen-card-country-screens.cjs` do:
    - the **real** `MenuTab` and `AllergenWizardModal` were bundled with esbuild and mounted in Chromium;
    - the fixtures are **App Tester's real categories and 30 dishes** (read by SELECT);
    - every `api()` call went to an in-memory stand-in, so **nothing reached the database**;
    - the two AI calls (`process-menu`, `process-allergens`) were answered with **example responses** (a five-dish menu, and a card with two matching dishes, one unmatched dish, a blanket line and a kitchen note) so every branch renders;
    - dish states were **staged in memory**: five dishes unconfirmed and one carrying the legacy generic "Nuts".
  - **No Confirm / Save / Finish / Commit reached a server.** The import was taken only as far as its Allergens step's review. The Kitchen step, where the import commits, was never opened.
  - The helper scripts live in the session scratchpad, not the repo; Playwright was already a dev dependency.
- **Pizzeria Gusto and Le Roi du Churrasco were not used for anything.**

## Facts worth knowing before the mockup

1. **Nowhere to store "may contain."** See the database section.
2. **AI menu reading folds "may contain" into contains** (`lib/menu-extract.ts:143-147`): *"extract an allergen ONLY when the source menu STATES it — … or an allergen / 'contains' / 'may contain' note."*
3. **The allergen-card reader separates them, then the screens mostly drop the separation:**
   - `entries[]`: dish → allergens. Matched dishes get them unioned into `allergens`, unverified.
   - `blanket[]`: offered as the opt-in "may be present across all dishes" box. In the import it is unioned into **every** dish's `allergens`; in the standalone wizard it does nothing.
   - `cross_contamination[]`: shown as "Kitchen notes (saved to your allergen info)". In the import it is written into `trucks.allergen_info_text`.
   - `contains[]` and `may_contain[]`: only used to build the saved card text (`manageMenuImport.allergenCardText.contains` / `.mayContain`) when the card has no `formatted_text`.
4. **An older card screen with separate "Contains / May contain / Free from" lists exists but cannot be reached.** It is at `page.tsx:5127-5262` and saves only the card text. Its only opener is the wizard's `cardPanel` (`:2690-2716`), which is built but never rendered (§6d).
5. **Footer overflow at 390 px:**
   - the import's Allergens step: the French "Passer la configuration des allergènes pour l'instant" pushes **"Suivant →" off-screen** (`03b-…`), and on the English card page "Next" is clipped (`06-…-en-GB-390`);
   - the standalone wizard's review footer also clips "Save & finish later" (`17-…`).
6. **On a French page, the "may be present" box lists the stored English names** ("Tree nuts, Sesame"): `parsed.blanket.join(', ')` at `:2046` does not translate them.
7. **The item editor marks a dish confirmed on every allergen tap.** It saves at once with `allergens_verified: true` (`:5539`), although the comment above it (`:5520-5525`) says editing flips the dish back to needs-review.
8. **Data quirk on the test truck:** App Tester stores **"Lactose"** in `allergens` (it isn't in the UK 14; it's a dietary tag here) and "Dairy free" with a lower-case f (the vocabulary has "Dairy Free"). The wizard and editor hide what isn't in the vocabulary but keep it on save. The customer page shows "Lactose" as an allergen tag.
9. **Not shown anywhere:**
   - **Import review step 1 shows no allergens**, despite the comment at `:5813`.
   - **Option (extra) allergens** are not shown to customers or the kitchen.
   - **Allergens are not printed on tickets**, by recorded decision (`lib/printing/ticket.ts:30-33`).
   - **The go-live allergen checks have no callers** (`lib/go-live-checks.ts:1-6`).

---

## Database: every allergen column

```sql
select table_name, column_name, data_type, udt_name, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (column_name ilike '%allergen%' or column_name in ('dietary_info', 'spiciness') or table_name = 'allergen_audit_log')
order by table_name, ordinal_position;

select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.trucks'::regclass, 'public.menu_items_db'::regclass, 'public.modifier_options'::regclass,
                   'public.country_settings'::regclass, 'public.allergen_audit_log'::regclass)
  and pg_get_constraintdef(oid) ilike '%allergen%';
```

| Table | Column | Type | Default | Null | Notes |
|---|---|---|---|---|---|
| `menu_items_db` | `allergens` | `text[]` | `'{}'` | yes | Stored as the **English labels of the country's list** (UK 14: Gluten, Crustaceans, Eggs, Fish, Peanuts, Soy, Dairy, Tree nuts, Celery, Mustard, Sesame, Sulphites, Lupin, Molluscs). Shown translated (`lib/allergen-label.ts`). |
| `menu_items_db` | `dietary_info` | `text[]` | `'{}'` | yes | `DIETARY_VOCAB`: Vegetarian, Vegan, Halal, Kosher, Gluten Free, Dairy Free, Lactose (`components/manage/primitives.tsx:183`) |
| `menu_items_db` | `allergens_verified` | `boolean` | `true` | **no** | `false` hides the dish from customers in per-dish mode (`app/api/menu/[truckId]/route.ts:648-650`) and blanks its tags (`:764-765`). |
| `menu_items_db` | `spiciness` | `smallint` | — | yes | (shown beside the tags) |
| `modifier_options` | `allergens` | `text[]` | — | yes | per extra; **no** verified column |
| `modifier_options` | `dietary_info` | `text[]` | — | yes | |
| `trucks` | `allergen_display_mode` | `text` | — | yes | CHECK: null, `per_dish`, `card`, `both`. Null and `both` are read as per-dish. |
| `trucks` | `allergen_info_text` | `text` | — | yes | the allergen card's text, shown verbatim |
| `trucks` | `allergen_info_url` | `text` | — | yes | an uploaded card file (legacy upload path only, §6d) |
| `country_settings` | `allergen_set` | `text` | — | no | CHECK: `uk14`, `us9`, `anz`, `ca`, `jp`, `br`, `codex` |
| `country_settings` | `allergen_card_only_allowed` | `boolean` | `true` | no | `false` (Ireland) → no card-only mode; a stored `card` is read as per-dish |
| `allergen_audit_log` | `id`, `truck_id`, `item_id`, `change_type`, `field`, `old_value`, `new_value`, `actor_user_id`, `actor_role`, `auth_method`, `created_at` | uuid / text / uuid / text ×4 / uuid / text / text / timestamptz | `gen_random_uuid()`; `now()` | | `field` CHECK: `allergens`, `dietary`, `allergens_verified`, `card`. `change_type` (code, `lib/allergen-audit.ts:10`): `confirm`, `edit`, `card_save`, `import`, `card_match`. Written by `upsert_item` / `upsert_modifier_option` / `update_settings` (`app/api/manage/route.ts:798-833, 903-935, 2068-2081`). |

Also holding allergens, but not columns of their own:
- `demo_sessions.extraction` (jsonb): the AI's per-dish `allergens`;
- `orders.items` (jsonb): an extra's `allergens`, carried on the selection (`lib/modifier-rules.ts:44-53`).

**Writes, in short:**
- per-dish data goes through `upsert_item` (`route.ts:798-833`), owner/admin only when allergen fields change;
- truck-level data goes through `update_settings` (`route.ts:2055-2081`). `card` mode is refused where the country does not allow it.

---

## 1 · Menu import flow

The entry point is Manage › Menu › "✨ Import menu". Code: `MenuTab`, `page.tsx:2845-6770`. The stepper is Menu · (Extras) · Allergens · Kitchen setup (`:3639-3642`).

| # | Screen | Screenshot | Code | What it does |
|---|---|---|---|---|
| 1.1 | Upload (photo / PDF / text) | `01-import-upload-en-GB-390.png` | `:5720-5775` | No allergen UI. "Process menu" → `/api/manage/process-menu`. The AI returns each dish's **stated** allergens (`lib/menu-extract.ts:140-147`), including any "may contain" note, as one list. |
| 1.2 | Review step 1, menu items | `02-import-review-step1-en-GB-390.png` | `:5810-6110` | **No allergens shown.** The comment at `:5813` says "DETECTED allergens as read-only tags only", but nothing renders them. `:6111-6112`: "The allergen step (former step 3) was removed." |
| 1.3 | Allergens step, **chooser** | `03-import-allergens-chooser-{en-GB,fr-FR}-390.png`, `03b-import-allergens-footer-next-offscreen-fr-FR-390.png` | `:6176-6202`, `AllergenModeChooser` `primitives.tsx:190-214` | An amber notice (only if any dish has detected allergens) and "How do you want to show allergens…?". Two option cards: **"Show allergens against each dish" (Recommended)** and **"Show an allergen card"**. Select, then Next (disabled until one is picked). Footer: Back · "Skip allergen setup for now" · Next. Sets `pendingDisplayMode`; nothing is written until commit. Where `allergen_card_only_allowed` is false, this page is skipped (`:3662-3666`). |
| 1.4 | Card question (per-dish branch) | `04-import-card-question-{en-GB,fr-FR}-390.png` | `CardUploadPage :1940-2060` via `:6216-6236` | "Do you have an allergen card to upload?", then Yes / No (neither selected). No → "No problem — you don’t need one. Continue with the button below." |
| 1.5 | Card: Yes expanded | `05-import-card-yes-en-GB-390.png` | `:1993-2006` | Drop zone (image/PDF) **or** paste box, then "Process card" → `/api/manage/process-allergens`. |
| 1.6 | Card read: matches, unmatched, **"may be present" box**, kitchen notes | `06-import-card-read-blanket-checkbox-{en-GB,fr-FR}-{390,1280}.png` | `:2009-2056`; handler `:4084-4107` | See below. |
| 1.7 | Per-dish review on the **staged** dishes (opens as the table) | `07-import-review-table-{en-GB,fr-FR}-{390,1280}.png` | `AllergenWizardModal` with `initialMode=1`, `initialReviewView="table"` `:6153-6175` | Same screen as §3/§4. Confirm writes to the staged item only (`_allergensChecked`, `:3686-3688`). **Next is greyed until every dish is confirmed**, and "Skip allergen setup for now" is always available. |
| 1.8 | The same review as a list | `08-import-review-list-en-GB-390.png` | as above | Layout toggle only. |
| 1.9 | Card-only branch: the card editor | `09-import-card-only-editor-{en-GB,fr-FR}-390.png` | `CardOnlyEditor :1897-1934` via `:6206-6212` | A free-text box, stored **verbatim**; "📷 Upload image / PDF" transcribes it into the box (`mode=transcribe`, `:4109-4119`). No chips, no extraction. |
| 1.10 | Commit (Kitchen step "Save") | **from code, not screenshotted** | `handleCommitMenu :4170-4230` | See below. |
| 1.11 | Done screen: "allergens not set" notice | **from code, not screenshotted** (reached only after saving) | notice `:3894-3900`, shown at `:6694` when `!allergensComplete` (`:6644`) | Strings in appendix S1c. |

**1.6 in detail: the card-read page:**
- "Card read ✓" + "{matched} matched to a dish. {n} needs your assignment."
- **Exact name matches are auto-applied:** `mergeAllergensUnion` into the staged dish, which stays unconfirmed (`:4078-4080`, `:4101`).
- **"Couldn't auto-match these — assign or dismiss":** each entry shows the card's name, its allergen chips, an "Assign to dish…" select and Dismiss. Ambiguous entries add "Ambiguous — matches several dishes; pick the right one."
- **The "may be present" box** (`:2042-2049`) appears only when the card had a `blanket` list. It is unticked by default (`cardBlanketOptIn`, `:3025`).
  - Wording, en-GB: *"The card says **{list}** may be present across **all** dishes. Add to every dish? (you'll still confirm each) — off by default"* (`manageAllergens.cardUpload.blanket`).
  - fr-FR: *"La fiche indique que **{list}** peut être présent dans **tous** les plats. L'ajouter à chaque plat ? (vous confirmerez quand même chacun) — désactivé par défaut"*.
  - `{list}` is the raw stored English names, so **"Tree nuts, Sesame" appears in English on a French page.**
  - **What it writes:** nothing on the screen. At **commit**, if ticked, every dish's `allergens = mergeAllergensUnion(existing, blanket)` and `_allergensChecked = false` (`:4181-4186`), i.e. **saved as contained** and **unconfirmed**. That puts every dish into "needs review" and hides it from customers until confirmed.
- **"Kitchen notes (saved to your allergen info)"** lists `cross_contamination` (`:2050-2055`). At commit they are joined into the card text.

**1.10, what commit writes** (`/api/manage/commit-menu`, then `update_settings`):
- Each dish: `allergens`, `dietary_info`, and `allergens_verified` = whether it was confirmed in 1.7. Unreviewed dishes commit as `false`.
- **`trucks.allergen_info_text`:**
  - per-dish with a card read: the card's `formatted_text`, or else a built text of summary · "Contains: …" · "May contain: …" · kitchen notes · additional notes (`:4205-4217`);
  - card-only: the verbatim editor text (`:4220-4222`).
- **`trucks.allergen_display_mode`** = the chooser's choice, unless the step was skipped (`:4225`).

**What the customer ends up seeing:**
- In per-dish mode, confirmed dishes show their tags. Unconfirmed dishes are **hidden from the menu**.
- In card mode, every dish is visible, there are no allergen tags, and the card text appears in the pop-up (§7).

## 2 · Standalone allergen wizard

The entry points are Manage › Menu › Allergens section › "🛡️ Set up / review allergens" (`:5099-5108`), and the red "not visible" notice's "Confirm allergens →" link (`:4636-4639`). Code: `AllergenWizardModal`, `page.tsx:2144-2843`. Props are wired at `:5009-5040`.
- **Modes:** 0 chooser · 3 card upload (per-dish) · 1 review · 2 card-only editor.
- **Where it opens:** on mode 1 if the truck's mode is already `per_dish` / `both`, otherwise on mode 0 (`:5106`). Where card-only isn't allowed, it opens on mode 3 with no Back (`:2185`, `:2785`).

| # | Screen | Screenshot | Code | Reads / writes |
|---|---|---|---|---|
| 2.1 | Chooser (mode 0) | `10-wizard-chooser-{en-GB,fr-FR}-{390,1280}.png` | `:2743-2754` | The same `AllergenModeChooser` as 1.3. Next → card goes to mode 2, per-dish goes to mode 3. Nothing is written. |
| 2.2 | Card question (mode 3) | `11-wizard-card-question-{en-GB,fr-FR}-390.png` | `:2758-2790` | The same `CardUploadPage` as 1.4. |
| 2.3 | Card: Yes | `12-wizard-card-yes-en-GB-390.png` | as 1.5 | |
| 2.4 | Card read + **"may be present" box** | `13-wizard-card-read-blanket-checkbox-{en-GB,fr-FR}-390.png`, `14-wizard-blanket-ticked-en-GB-390.png` | `handleStandaloneCardProcess :2206-2222`, `applyCardToCommitted :2200-2205` | **Exact matches are written to the database straight away** through `onCardMerge`: `writeItemAllergens(item, union, …, verified=false, 'card')` → `upsert_item`, with audit `card_match` (`:5031`). It only writes when the union differs (`setEqual`). Assigning an unmatched entry writes the same way. |
| 2.5 | Card-only editor (mode 2) | `15-wizard-card-only-editor-{en-GB,fr-FR}-390.png` | `:2819-2838`, `finishCard :2476-2487` | "Finish" writes `trucks.allergen_info_text` (verbatim) and then `allergen_display_mode='card'`. |
| 2.6 | Review (mode 1) | see §3, §4 | `:2793-2816` | Footer (owner/admin): Back · "Skip for now" (closes, writes nothing) · **"Save & finish later" / "Done"**, which writes `allergen_display_mode='per_dish'` (`finishWith :2454-2464`). Others see Close. |

**The `stdBlanket` box's dead state:**
- `const [stdBlanket, setStdBlanket] = useState(false)` (`:2197`) is passed as `blanketOptIn={stdBlanket}` / `onBlanketToggle={setStdBlanket}` (`:2779-2780`).
- **Nothing reads `stdBlanket`:** not `applyCardToCommitted`, not `handleStandaloneCardProcess`, not any finish handler.
- The box renders and ticks (screenshot 14) with the same "Add to every dish?" wording, **but ticking it changes no dish and writes nothing.** `parsed.blanket` is used only for the box's text.

**Unused card panel:** `cardPanel` (`:2690-2716`, "Allergen card saved" / Replace / Add) is defined but never rendered.

## 3 · The per-dish confirm screen

Shared by import 1.7–1.8 and wizard mode 1. Code: `page.tsx:2228-2685`.

**Layout:**
- **Header:** "{confirmed} of {total} confirmed" · "✓ All confirmed" when done · the List | Table toggle · a progress bar.
- **Amber line:** "**Detected from your menu — check these.** Allergens stay hidden from customers until you confirm each dish." (`:2510-2512`)
- **View-only note** for staff (`:2513-2515`).

**Dishes:** in menu order, grouped by category (uncategorised last, `:2441-2448`).

**Allergen order:**
- the **country's list in its stored order** (`allergenVocab(allergenSet)`; UK 14 as in the table above);
- then the **dietary** tags: Vegetarian, Vegan, Halal, Kosher, Gluten Free, Dairy Free, Lactose.

**The AI suggestion:**
- Each dish's draft is **pre-seeded** with its stored allergens that are in the list (`seed`, `:2255-2258`). Those are the AI's detections after an import, or a card's merge.
- Selected tags show as the customer's own chips beside the name (`selectedPills`, `:2387-2393`).
- Stored values that aren't in the list are not shown, but are **kept** on confirm unless they're a known generic (`writtenAllergens`, `:2269-2272`).

**Warnings (WARN-NOT-BLOCK):**
- A detected generic with no precise pick (UK: **Nuts** → Tree nuts / Peanuts; **Shellfish** → Crustaceans / Molluscs, `lib/allergens.ts:121-123`) shows an amber line in the list, `⚠ "Nuts" was detected but isn't specific. Pick Tree nuts and/or Peanuts if this dish contains nuts — or leave them unselected if it doesn't.` (`:2378-2398`).
- The table shows a red "!" with the same text as a tooltip (`WarnMarker :1873-1889`, `:2434-2439`).
- **Confirm is never blocked** (`canConfirm: true`, `:2371`). The generic is dropped on confirm.
- Screenshot: `17-review-list-generic-warning-{en-GB,fr-FR}-390.png`.

**Buttons:**
- **Confirm** (green; "Confirming…" while busy) / **Confirmed ✓** (grey, disabled). Status badges: "✓ Confirmed" (green, confirmed in this session) / "Confirmed" (grey) / "Needs review" (amber).
- **Confirm writes** `upsert_item {allergens, dietary_info, allergens_verified: true}` (`writeItemAllergens :4421-4428`), or the staged item in the import.
- A toast "{name} confirmed" with **Undo** (6 s), which restores the previous allergens, dietary and verified state (`:2274-2307`).
- Screenshot: `18-review-list-just-confirmed-toast-{en-GB,fr-FR}-390.png`.

**Re-confirm on edit** (`handleToggle :2334-2357`):
- Ticking any tag on a **confirmed** dish so it differs from what was confirmed sets `allergens_verified=false` in the database (`onEditUnverify`, data unchanged). The dish leaves the customer menu.
- The button returns to **Confirm** with "· changed" underneath. In the table, the changed cell turns amber and the status cell is tinted (`20-review-table-changed-after-confirm-en-GB-1280.png`).
- Ticking back to exactly the confirmed set **re-confirms on its own**, through the same write as Confirm.

## 4 · Review views: list and matrix

- **List** (`:2527-2554`), screenshots `16-review-list-needs-review-{en-GB,fr-FR}-{390,1280}.png`:
  - one card per dish: name and selected chips · status badge · generic warning · **Allergens** toggles (`AllergenToggles`, amber when on) · **Dietary** toggles (green) · Confirm, bottom right.
- **Matrix / Table** (`:2561-2682`), screenshots `19-review-table-{en-GB,fr-FR}-{390,1280}.png`, `07-…` (import):
  - a fixed-layout table: frozen **Dish** column (name, red "!", chips) and **Status** column (Confirm; frozen from `sm:` up);
  - an **ALLERGENS** column group (amber header, alternate shading) and a **DIETARY** group (green, divided by a thick left border);
  - one ✓ toggle per cell, 56 px wide;
  - a sticky header and category rows; the modal widens to `max-w-6xl`; scrolls both ways.
- Both views read and write exactly the same data and logic. The toggle is layout only.

## 5 · Manage › Menu: the item editor's allergen field

Screenshots: `22-item-editor-allergens-{en-GB,fr-FR}-390.png` (a confirmed dish), `23-item-editor-gate-unconfirmed-{en-GB,fr-FR}-390.png` (an unconfirmed one). Code: `page.tsx:5520-5554`; save `saveItemPatch :4401-4410`.

- **Unconfirmed dish** (`allergens_verified === false`): the pickers are hidden behind an amber box, **"Set up allergens for this dish in the allergen review."** + "Open the “Set up / review allergens” box on the Menu tab — the wizard walks each dish through confirmation." (`manageMenu.item.allergenGateTitle` / `allergenGateBody`).
- **Confirmed dish, or a new dish:**
  - **"ALLERGENS"** + "Select all that apply", then the country list as toggle chips;
  - **"DIETARY"** toggles below.
- **Each tap saves immediately:**
  - for an existing dish: `upsert_item` with `allergens: next, allergens_verified: true`;
  - for a new dish: held until "Add item", then inserted.
  - The comment at `:5520-5525` says editing flips the dish back to needs-review, but the code sets it **confirmed**. The audit records `edit`.
- **Customer result:** the new tags show at once (the dish stays visible).
- **Dish list chips** (`:4848-4870`, `21-menu-dish-list-chips-{en-GB,fr-FR}-390.png`): confirmed dishes show amber allergen and green dietary chips under the name. Unconfirmed dishes show none.

## 6 · Manage › Menu: the permanent Allergens section

| # | Screen | Screenshot | Code | What it shows / does |
|---|---|---|---|---|
| 6a | **"🚫 N items are not visible to customers"** notice (top of the Menu tab) | `24-menu-hidden-notice-{en-GB,fr-FR}-{390,1280}.png` | `:4623-4644` | Shown when the mode isn't `card` and any dish has `allergens_verified=false`. "Confirm allergens →" opens the wizard. Derived, never stored. |
| 6b | **ALLERGENS** section box | `25-…-needs-review-{en-GB,fr-FR}-{390,1280}.png` (amber), `26-…-confirmed-card-{en-GB,fr-FR}-390.png` (all confirmed + saved card), `27-…-card-mode-{en-GB,fr-FR}-390.png`, `28-…-not-set-{en-GB,fr-FR}-390.png` | `:5042-5125` | Title "Allergens not set" / "Allergens". "Display mode: **Per dish / Allergen card / Not set**" · "N dishes need review — customers can’t see allergen info until confirmed" / "all dishes confirmed" / "allergen card saved" / "add an allergen card so customers can see allergen info". Where card-only isn't allowed: "An allergen card on its own can’t be used where your truck trades, so customers see allergens against each dish. Please confirm each dish’s allergens." Button **"🛡️ Set up / review allergens"** (owner/admin; disabled with no menu); staff see "View only — only the owner can edit allergens". Reads `trucks.allergen_display_mode`, `allergen_info_text`, `allergen_info_url` and the dishes' verified flags. |
| 6c | Saved card panel (inside 6b) | in `26-`, `27-` | `SavedAllergenCard :2083-2142` | `allergen_info_text` clamped to 3 lines with Show more / Show less. "View original" when `allergen_info_url` exists. Read-only. |
| 6d | **Legacy** card upload modal + "Allergen info extracted" review (**Contains / May contain / Free from / Dietary options**, "Try again", "Save allergen info") | **from code, not screenshotted: unreachable** | modal `:5205-5262`, review `:5134-5203`, handlers `:4318-4371` | Opened only by `onAddCard`, which only the unrendered `cardPanel` calls (§2). If it were reachable: an upload writes `trucks.allergen_info_url`; Save writes `allergen_info_text` (formatted text, or summary + "Contains: …" + "May contain: …" + dietary + notes). It writes no dish. |

There is no other allergen setting. `allergen_info_text` and `allergen_info_url` have no direct form fields. The text is written only by the wizard's or import's card editor and the commit; the URL only by the unreachable upload in 6d.

## 7 · Customer order page

Code: `app/(app)/trucks/[slug]/order/page.tsx`. Data: `/api/menu/[truckId]`.

| # | Screen | Screenshot | Code | Behaviour |
|---|---|---|---|---|
| 7a | Dish tags, **per-dish mode** | `29-order-page-dishes-per_dish-{en-GB 390+1280, fr-FR 390}.png` | `:3278-3292` (chips `components/MenuAllergenChips.tsx`) | Amber `AllergenChip` per allergen, in the page's language (`allergenLabel`), then green dietary tags and 🌶. Unconfirmed dishes are **not on the menu at all** (`route.ts:648-650`). Stored values outside the list show as stored (App Tester's "Lactose"). |
| 7b | Dish tags, **card mode** | `31-order-page-dishes-card-{en-GB 390+1280, fr-FR 390}.png` | `:3281`, `:3287` | **No allergen tags** (`allergen_display_mode !== 'card'` gate); dietary tags and 🌶 still show. Every dish is visible. |
| 7c | "ⓘ Allergen info" link (menu header, always present) | in every `29`–`32` | `:2940-2950` | Opens the pop-up. |
| 7d | Allergen info pop-up, per-dish | `30-order-page-allergen-info-per_dish-{…}.png` | `:4329-4390` | "Allergen information" · **"Allergens used in this menu"** = the union of every shown dish's allergens, translated (order-page-2; non-English pages sort them by the shown name, English keeps the stored order) · "See each dish for its specific allergens." · **severe-allergy line**. |
| 7e | Allergen info pop-up, card mode | `32-order-page-allergen-info-card-{…}.png` | `:4357-4367` | "📎 View allergen card (PDF/image)" link (only when `allergen_info_url`) · `allergen_info_text` verbatim · severe-allergy line. |
| 7f | Nothing confirmed / no card | **from code** | `:4350-4356` | "Allergen info not provided — please confirm directly with the truck." |

The severe-allergy line (`order.allergenSevere`):
- en-GB: *"If you have a severe allergy, please contact the vendor directly before ordering."*
- fr-FR: *"En cas d'allergie sévère, veuillez contacter directement le commerçant avant de commander."*

Removed earlier: the "allergens not verified — ask staff" banner (`:2911-2914`) and the allergen chip on an extra in the dish pop-up (`:4250-4251`).

## 8 · Everywhere else

| Place | Allergens shown? | Code |
|---|---|---|
| **Manage › Menu › Extras: an option's editor** | **Yes, for editing:** "Allergens" + help text + the same `AllergenToggles`, and Dietary. Saved by the option's Save (`upsert_modifier_option`, audit `edit`, owner/admin). Not gated by any verified flag. (from code) | `components/manage/ExtrasEditor.tsx:549-566`; `route.ts:903-935` |
| Customer: choosing an extra | No (chip removed) | order page `:4250-4251` |
| Basket, order confirmation, receipt, customer emails | No | `components/dashboard/OrderLineItem.tsx:88-90`; `lib/email.ts` has the type only |
| Dashboard Add order / deals pop-up / order cards, the kitchen screen (KDS) | No (operator selection chips removed) | `AddOrderPanel.tsx:2952`, `DealsModal.tsx:425` |
| Printed tickets | **No, by decision**: "ALLERGENS ARE NOT PRINTED, AND THAT IS A DECISION" | `lib/printing/ticket.ts:30-33` |
| **WhatsApp** | **Yes (text):** (1) an allergen or safety question gets a fixed reply pointing to the menu, `whatsappCustomer.allergenRedirect`; (2) when the AI states a dish's allergens (from `menu_items_db.allergens`), it must append `whatsappCustomer.allergenCaveat`. The trigger words are in `lib/allergen-guard/<lang>.json`. | `lib/whatsapp-classifier.ts:140-141, 228, 297, 327, 355-362`; `lib/allergen-guard.ts` |
| iPad / Android app | **Same screens.** A Capacitor shell loading the web app (`capacitor.config.ts` `server.url`); no native allergen code. | |
| Go-live / nomination checklist | **Nowhere.** `checkGoLive` has no callers; its allergen rules (`allergensUnanswered`, `allergensCardMissing`, `allergensItemsUnverified`) are a specification only. | `lib/go-live-checks.ts:1-6` |
| Setup / demo flow | The demo stepper names an "allergens" step (`components/DemoGetStarted.tsx:805`); a claimed demo's menu runs through the same import (§1). | |

**WhatsApp strings:**

| Key | en-GB | fr-FR |
|---|---|---|
| `whatsappCustomer.allergenRedirect` | {opener}You can see our full menu and allergen information here: {url} — {truck} {emoji} | {opener}Retrouvez notre carte complète et les informations sur les allergènes ici : {url} — {truck} {emoji} |
| `whatsappCustomer.allergenCaveat` | Please double-check the full menu for allergen info — this is an automated reply. | Merci de vérifier la carte complète pour les allergènes — ceci est une réponse automatique. |

---

## Where a "May contain" question would naturally fit

Existing screens and steps that already ask about, or show, allergens, where such a question could sit without adding a step. Facts only.

1. **The card-read page (§1.6 / §2.4):** it already shows the card's `blanket` list as a "may be present across all dishes" box and the `cross_contamination` lines as "Kitchen notes". The card reader already returns `may_contain` separately; this page doesn't show it.
2. **The per-dish confirm screen (§3), list view:** each dish card already holds an "Allergens" block and a "Dietary" block, one under the other, with one Confirm per dish.
3. **The matrix (§4):** already split into column groups (ALLERGENS amber, DIETARY green, with a divider) on the same rows.
4. **The item editor (§5):** an "Allergens" block followed by a "Dietary" block, auto-saving.
5. **The Extras option editor (§8):** the same two blocks for an extra.
6. **The Allergens section on the Menu tab (§6b):** the truck-level summary line ("Display mode … · …") and the saved card panel. It's the only permanent truck-level allergen place.
7. **The card-only editor (§1.9 / §2.5):** free text stored verbatim and shown in the pop-up.
8. **The customer's Allergen info pop-up (§7d/e):** it already has a "used in this menu" list, a "see each dish" line and the severe-allergy line.
9. **The customer dish tags (§7a):** amber allergen tags, then dietary tags, on one row.
10. **The unreachable legacy review (§6d)** already lays out Contains / May contain / Free from as separate groups and has messages for them (`manageMenu.allergens.contains` / `.mayContain` / `.freeFrom`). So do `manageMenuImport.allergenCardText.contains` / `.mayContain`.

---

## Appendix A · Every visible string, by screen (en-GB and fr-FR, with keys)

Generated from the code: every literal `t(…)` / `ti(…)` / `tOrder(…)` call in each line range, looked up in `messages/en-GB.json` and `messages/fr-FR.json`. All 164 keys have both languages. ICU plural/rich-text syntax is shown as written; ⏎ marks a line break.

**S1a · Import › Allergens step (shell, chooser heading, notice, footer)** — `app/(app)/manage/[token]/page.tsx` lines 6137–6252

| Key | en-GB | fr-FR |
|---|---|---|
| `manageMenuImport.allergens.title` | Allergens | Allergènes |
| `manageMenuImport.closeImport` | Close import | Fermer l’import |
| `manageMenuImport.allergens.detected` | We detected allergens from your menu. Choose how to show them below. | Nous avons détecté des allergènes dans votre carte. Choisissez ci-dessous comment les afficher. |
| `manageMenuImport.allergens.howShow` | How do you want to show allergens to customers? | Comment voulez-vous afficher les allergènes à vos clients ? |
| `manageMenuImport.back` | ← Back | ← Retour |
| `manageMenuImport.allergens.skip` | Skip allergen setup for now | Passer la configuration des allergènes pour l’instant |
| `manageMenuImport.next` | Next → | Suivant → |

**S1b · Import › card read toasts + commit (card text written to the truck)** — `app/(app)/manage/[token]/page.tsx` lines 4084–4222

| Key | en-GB | fr-FR |
|---|---|---|
| `manageMenuImport.toast.cardReadFailed` | Couldn’t read the allergen card — try again | Impossible de lire la fiche allergènes — réessayez |
| `manageMenuImport.toast.cardRead` | Card read — {matched} matched, {pending, plural, one {# needs} other {# need}} your assignment | Fiche lue — reconnus : {matched}, {pending, plural, one {# reste} other {# restent}} à attribuer par vous |
| `manageMenuImport.toast.imageReadFailed` | Couldn’t read that image — type or paste your card instead | Impossible de lire cette image — saisissez ou collez plutôt votre carte |
| `manageMenuImport.allergenCardText.contains` | Contains: {list} | Contient : {list} |
| `manageMenuImport.allergenCardText.mayContain` | May contain: {list} | Peut contenir : {list} |

**S1c · Import › done screen "allergens not set" notice** — `app/(app)/manage/[token]/page.tsx` lines 3894–3900

| Key | en-GB | fr-FR |
|---|---|---|
| `manageMenuImport.allergensNotSet.title` | ⚠ Allergens & dietary aren’t set yet | ⚠ Allergènes et régimes alimentaires à renseigner |
| `manageMenuImport.allergensNotSet.bodySetup` | Review them before going live. Items are flagged “allergens not set” until you do. | Vérifiez-les avant la mise en ligne. D’ici là, les articles sont signalés « allergènes non renseignés ». |
| `manageMenuImport.allergensNotSet.body` | Review them in Settings before going live. Items are flagged “allergens not set” until you do. | Vérifiez-les dans Paramètres avant la mise en ligne. D’ici là, les articles sont signalés « allergènes non renseignés ». |

**S1d · Shared: AllergenModeChooser (components/manage/primitives.tsx)** — `components/manage/primitives.tsx` lines 190–214

| Key | en-GB | fr-FR |
|---|---|---|
| `managePrimitives.allergenMode.perDishTitle` | Show allergens against each dish | Afficher les allergènes pour chaque plat |
| `managePrimitives.allergenMode.recommended` | Recommended | Recommandé |
| `managePrimitives.allergenMode.perDishBody` | Review every dish and confirm its allergens. Customers see per-dish tags plus an allergen summary card derived from them. | Vérifiez chaque plat et confirmez ses allergènes. Les clients voient les étiquettes par plat ainsi qu’une fiche récapitulative des allergènes générée à partir de celles-ci. |
| `managePrimitives.allergenMode.cardTitle` | Show an allergen card | Afficher une fiche allergènes |
| `managePrimitives.allergenMode.cardBody` | Upload or paste a single allergen card (PDF, image, or text), shown as-is. Per-dish tags stay hidden. | Importez ou collez une fiche allergènes unique (PDF, image ou texte), affichée telle quelle. Les étiquettes par plat restent masquées. |

**S1e · Shared: CardOnlyEditor** — `app/(app)/manage/[token]/page.tsx` lines 1897–1934

| Key | en-GB | fr-FR |
|---|---|---|
| `manageAllergens.cardEditor.title` | Your allergen card | Votre fiche allergènes |
| `manageAllergens.cardEditor.intro` | Customers see this <b>exactly as you write it</b> — nothing is rewritten. Type or paste below, or upload a photo/PDF and we’ll read the text in for you to check. | Vos clients la voient <b>exactement telle que vous l’écrivez</b> — rien n’est réécrit. Saisissez ou collez le texte ci-dessous, ou importez une photo/un PDF et nous en lirons le texte pour que vous le vérifiiez. |
| `manageAllergens.cardEditor.empty` | No allergen card yet. | Pas encore de fiche allergènes. |
| `manageAllergens.cardEditor.placeholder` | e.g. All our fish & chips contain wheat and milk. Fryer is shared with items containing gluten and nuts. Vegan options available — ask staff. | ex. : Tous nos fish & chips contiennent du blé et du lait. La friteuse est partagée avec des produits contenant du gluten et des fruits à coque. Options véganes disponibles — demandez à l’équipe. |
| `manageAllergens.cardEditor.reading` | Reading image… | Lecture de l’image… |
| `manageAllergens.cardEditor.upload` | 📷 Upload image / PDF | 📷 Importer une image / un PDF |
| `manageAllergens.cardEditor.uploadNote` | We read the text off your image so you can review it — the image isn’t stored. | Nous lisons le texte de votre image pour que vous puissiez le vérifier — l’image n’est pas conservée. |

**S1f · Shared: CardUploadPage (card question, upload, card read, unmatched, blanket checkbox, kitchen notes)** — `app/(app)/manage/[token]/page.tsx` lines 1940–2060

| Key | en-GB | fr-FR |
|---|---|---|
| `manageAllergens.cardUpload.dishFallback` | Dish | Plat |
| `manageAllergens.cardUpload.question` | Do you have an allergen card to upload? | Avez-vous une fiche allergènes à importer ? |
| `manageAllergens.cardUpload.perDish` | {detected, select, yes {Upload one and we’ll use it to build your dish allergens. Detected allergens will be visible on the next page where you confirm each dish.} other {Upload one and we’ll use it to build your dish allergens.}} | {detected, select, yes {Importez-la et nous l’utiliserons pour renseigner les allergènes de vos plats. Les allergènes détectés seront visibles à la page suivante, où vous confirmerez chaque plat.} other {Importez-la et nous l’utiliserons pour renseigner les allergènes de vos plats.}} |
| `manageAllergens.cardUpload.cardOnly` | Upload the allergen card customers will see. | Importez la fiche allergènes que vos clients verront. |
| `manageAllergens.cardUpload.yes` | Yes | Oui |
| `manageAllergens.cardUpload.no` | No | Non |
| `manageAllergens.cardUpload.noProblem` | No problem — you don’t need one. Continue with the button below. | Pas de souci — ce n’est pas obligatoire. Continuez avec le bouton ci-dessous. |
| `manageAllergens.cardUpload.analysing` | Analysing card… | Analyse de la fiche… |
| `manageAllergens.cardUpload.dropzone` | Drag and drop or tap to choose | Glissez-déposez ou touchez pour choisir |
| `manageAllergens.cardUpload.imageOrPdf` | Image or PDF | Image ou PDF |
| `manageAllergens.cardUpload.or` | or | ou |
| `manageAllergens.cardUpload.pastePlaceholder` | Paste your allergen card text here… | Collez ici le texte de votre fiche allergènes… |
| `manageAllergens.cardUpload.process` | Process card | Analyser la fiche |
| `manageAllergens.cardUpload.cardRead` | Card read ✓ | Fiche lue ✓ |
| `manageAllergens.cardUpload.matchSummary` | {n, plural, =0 {{matched} matched to a dish.} one {{matched} matched to a dish. {count} needs your assignment.} other {{matched} matched to a dish. {count} need your assignment.}} | {n, plural, =0 {Associés à un plat : {matched}.} one {Associés à un plat : {matched}. {count} est à attribuer.} other {Associés à un plat : {matched}. {count} sont à attribuer.}} |
| `manageAllergens.cardUpload.unmatchedHeading` | Couldn’t auto-match these — assign or dismiss | Association automatique impossible — attribuez ou ignorez |
| `manageAllergens.cardUpload.quotedName` | “{name}” | « {name} » |
| `manageAllergens.cardUpload.ambiguous` | Ambiguous — matches several dishes; pick the right one. | Ambigu — correspond à plusieurs plats ; choisissez le bon. |
| `manageAllergens.cardUpload.assignTo` | Assign to dish… | Attribuer à un plat… |
| `manageAllergens.cardUpload.dismiss` | Dismiss | Ignorer |
| `manageAllergens.cardUpload.blanket` | The card says <b>{list}</b> may be present across <b>all</b> dishes. Add to every dish? (you’ll still confirm each) <muted>— off by default</muted> | La fiche indique que <b>{list}</b> peut être présent dans <b>tous</b> les plats. L’ajouter à chaque plat ? (vous confirmerez quand même chacun) <muted>— désactivé par défaut</muted> |
| `manageAllergens.cardUpload.kitchenNotes` | Kitchen notes (saved to your allergen info) | Remarques de la cuisine (enregistrées dans vos infos allergènes) |

**S2 · AllergenWizardModal (all modes, review list + table, nav, toasts)** — `app/(app)/manage/[token]/page.tsx` lines 2144–2843

| Key | en-GB | fr-FR |
|---|---|---|
| `manageAllergens.wizard.toast.readFailed` | Couldn’t read the allergen card — try again | Impossible de lire la fiche allergènes — réessayez |
| `manageAllergens.wizard.toast.cardRead` | {n, plural, one {Card read — {matched} matched, {count} needs assignment} other {Card read — {matched} matched, {count} need assignment}} | {n, plural, one {Fiche lue — associés : {matched}, à attribuer : {count}} other {Fiche lue — associés : {matched}, à attribuer : {count}}} |
| `manageAllergens.wizard.toast.confirmed` | {name} confirmed | Confirmé : {name} |
| `manageAllergens.wizard.toast.undo` | Undo | Annuler |
| `manageAllergens.wizard.genericWarn.andOr` | {a} and/or {b} | {a} et/ou {b} |
| `manageAllergens.wizard.genericWarn.text` | “{generic}” was detected but isn’t specific. Pick {picks} if this dish contains {family} — or leave them unselected if it doesn’t. | « {generic} » a été détecté mais n’est pas assez précis. Choisissez {picks} si ce plat en contient ({family}) — sinon, laissez-les non sélectionnés. |
| `manageAllergens.wizard.badge.justConfirmed` | ✓ Confirmed | ✓ Confirmé |
| `manageAllergens.wizard.badge.confirmed` | Confirmed | Confirmé |
| `manageAllergens.wizard.badge.needsReview` | Needs review | À vérifier |
| `manageAllergens.wizard.confirm.confirming` | Confirming… | Confirmation… |
| `manageAllergens.wizard.confirm.confirmed` | Confirmed ✓ | Confirmé ✓ |
| `manageAllergens.wizard.confirm.confirm` | Confirm | Confirmer |
| `manageAllergens.wizard.confirm.changedTitle` | Edited since you last confirmed — confirm again | Modifié depuis votre dernière confirmation — confirmez à nouveau |
| `manageAllergens.wizard.confirm.changed` | · changed | · modifié |
| `manageAllergens.wizard.allergens` | Allergens | Allergènes |
| `manageAllergens.wizard.dietary` | Dietary | Régimes |
| `manageAllergens.wizard.uncategorised` | Uncategorised | Sans catégorie |
| `manageAllergens.wizard.toast.saveFailed` | Couldn’t save — please try again | Échec de l’enregistrement — veuillez réessayer |
| `manageAllergens.wizard.toast.imageFailed` | Couldn’t read that image — type or paste your card instead | Impossible de lire cette image — saisissez ou collez plutôt votre fiche |
| `manageAllergens.wizard.review.progress` | {confirmed} of {total} confirmed | Confirmés : {confirmed} sur {total} |
| `manageAllergens.wizard.review.allConfirmed` | ✓ All confirmed | ✓ Tous confirmés |
| `manageAllergens.wizard.review.list` | List | Liste |
| `manageAllergens.wizard.review.table` | Table | Tableau |
| `manageAllergens.wizard.review.detected` | Detected from your menu — <b>check these</b>. Allergens stay hidden from customers until you confirm each dish. | Détectés à partir de votre carte — <b>vérifiez-les</b>. Les allergènes restent masqués pour les clients tant que vous n’avez pas confirmé chaque plat. |
| `manageAllergens.wizard.review.viewOnly` | 👁 View only — only the owner can confirm or change allergens. | 👁 Lecture seule — seul le propriétaire peut confirmer ou modifier les allergènes. |
| `manageAllergens.wizard.review.emptyTitle` | No menu items | Aucun article |
| `manageAllergens.wizard.review.emptyBody` | Add menu items first, then set their allergens here. | Ajoutez d’abord des articles à la carte, puis définissez leurs allergènes ici. |
| `manageAllergens.wizard.review.dish` | Dish | Plat |
| `manageAllergens.wizard.review.status` | Status | Statut |
| `manageAllergens.wizard.cardPanel.intro` | Customers will see this card as the menu’s allergen reference. Per-dish allergens stay hidden in card-only mode (your dish data is kept for if you switch to per-dish later). | Vos clients verront cette fiche comme référence des allergènes de la carte. Les allergènes par plat restent masqués en mode fiche uniquement (les données de vos plats sont conservées si vous passez plus tard au mode par plat). |
| `manageAllergens.wizard.cardPanel.reading` | Reading allergen information… | Lecture des informations sur les allergènes… |
| `manageAllergens.wizard.cardPanel.saved` | 🛡️ Allergen card saved | 🛡️ Fiche allergènes enregistrée |
| `manageAllergens.wizard.cardPanel.viewOriginal` | View original card | Voir la fiche d’origine |
| `manageAllergens.wizard.cardPanel.replace` | Replace card | Remplacer la fiche |
| `manageAllergens.wizard.cardPanel.uploadHelp` | Upload your allergen card (photo/PDF) or paste your allergen info — our AI structures it for customers. | Importez votre fiche allergènes (photo/PDF) ou collez vos informations sur les allergènes — notre IA les structure pour vos clients. |
| `manageAllergens.wizard.cardPanel.add` | Add allergen card | Ajouter une fiche allergènes |
| `manageAllergens.wizard.cardPanel.viewOnly` | 👁 View only — only the owner can add the allergen card. | 👁 Lecture seule — seul le propriétaire peut ajouter la fiche allergènes. |
| `manageAllergens.wizard.subtitle.choose` | Choose how customers see allergen info | Choisissez comment vos clients voient les informations sur les allergènes |
| `manageAllergens.wizard.subtitle.card` | Add your allergen card | Ajoutez votre fiche allergènes |
| `manageAllergens.wizard.subtitle.cardOptional` | Add an allergen card (optional) | Ajoutez une fiche allergènes (facultatif) |
| `manageAllergens.wizard.subtitle.review` | Check & confirm each dish | Vérifiez et confirmez chaque plat |
| `manageAllergens.wizard.heading.import` | Allergens | Allergènes |
| `manageAllergens.wizard.heading.standalone` | Allergen setup | Réglage des allergènes |
| `manageAllergens.wizard.nav.next` | Next → | Suivant → |
| `manageAllergens.wizard.nav.back` | ← Back | ← Retour |
| `manageAllergens.wizard.nav.skipImport` | Skip allergen setup for now | Passer la configuration des allergènes pour l’instant |
| `manageAllergens.wizard.nav.skip` | Skip for now | Passer pour l’instant |
| `manageAllergens.wizard.nav.saving` | Saving… | Enregistrement… |
| `manageAllergens.wizard.nav.done` | Done | Terminé |
| `manageAllergens.wizard.nav.saveLater` | Save & finish later | Enregistrer et finir plus tard |
| `manageAllergens.wizard.nav.close` | Close | Fermer |
| `manageAllergens.wizard.hint.importIncomplete` | Confirm every dish to continue — or “Skip allergen setup for now”. | Confirmez chaque plat pour continuer — ou « Passer la configuration des allergènes pour l’instant ». |
| `manageAllergens.wizard.hint.skipDefers` | Skip defers — dishes you haven’t confirmed stay hidden from customers until their allergens are confirmed. | Passer, c’est reporter — les plats que vous n’avez pas confirmés restent masqués pour les clients jusqu’à ce que leurs allergènes soient confirmés. |
| `manageAllergens.wizard.nav.finish` | Finish | Terminer |

**S5 · Manage › Menu › item editor — allergen field** — `app/(app)/manage/[token]/page.tsx` lines 5520–5554

| Key | en-GB | fr-FR |
|---|---|---|
| `manageMenu.item.allergenGateTitle` | Set up allergens for this dish in the allergen review. | Renseignez les allergènes de ce plat dans la vérification des allergènes. |
| `manageMenu.item.allergenGateBody` | Open the “Set up / review allergens” box on the Menu tab — the wizard walks each dish through confirmation. | Ouvrez l’encadré « Renseigner / vérifier les allergènes » dans l’onglet Carte : l’assistant vous fait confirmer chaque plat. |
| `manageMenu.item.allergens` | Allergens | Allergènes |
| `manageMenu.item.selectAll` | Select all that apply | Sélectionnez tout ce qui s’applique |
| `manageMenu.item.dietary` | Dietary | Régimes alimentaires |

**S6a · Manage › Menu — "not visible to customers" notice** — `app/(app)/manage/[token]/page.tsx` lines 4623–4644

| Key | en-GB | fr-FR |
|---|---|---|
| `manageMenu.hiddenNotice.title` | {count, plural, one {# item is} other {# items are}} not visible to customers | {count, plural, one {# article n’est pas visible} other {# articles ne sont pas visibles}} par les clients |
| `manageMenu.hiddenNotice.body` | {count, plural, one {It won’t appear on your ordering page until its allergens are confirmed — showing a dish with unchecked allergen info would read as “allergen-free”. You can still see it here.} other {They won’t appear on your ordering page until their allergens are confirmed — showing a dish with unchecked allergen info would read as “allergen-free”. You can still see them here.}} <link>Confirm allergens →</link> | {count, plural, one {Il n’apparaîtra pas sur votre page de commande tant que ses allergènes ne seront pas confirmés : afficher un plat dont les allergènes n’ont pas été vérifiés laisserait croire qu’il est « sans allergènes ». Vous pouvez toujours le voir ici.} other {Ils n’apparaîtront pas sur votre page de commande tant que leurs allergènes ne seront pas confirmés : afficher un plat dont les allergènes n’ont pas été vérifiés laisserait croire qu’il est « sans allergènes ». Vous pouvez toujours les voir ici.}} <link>Confirmer les allergènes →</link> |

**S6b · Manage › Menu — Allergens section** — `app/(app)/manage/[token]/page.tsx` lines 5042–5125

| Key | en-GB | fr-FR |
|---|---|---|
| `manageMenu.allergens.heading` | Allergens | Allergènes |
| `manageMenu.allergens.modeCard` | Allergen card | Fiche allergènes |
| `manageMenu.allergens.modePerDish` | Per dish | Par plat |
| `manageMenu.allergens.modeNotSet` | Not set | Non défini |
| `manageMenu.allergens.titleNotSet` | Allergens not set | Allergènes non renseignés |
| `manageMenu.allergens.titleSet` | Allergens | Allergènes |
| `manageMenu.allergens.buildFirst` | Build your menu first — add dishes, then set up their allergens | Créez d’abord votre carte : ajoutez des plats, puis renseignez leurs allergènes |
| `manageMenu.allergens.displayMode` | Display mode: <b>{mode}</b> | Mode d’affichage : <b>{mode}</b> |
| `manageMenu.allergens.cardSaved` | allergen card saved | fiche allergènes enregistrée |
| `manageMenu.allergens.addCard` | add an allergen card so customers can see allergen info | ajoutez une fiche allergènes pour que les clients voient les informations sur les allergènes |
| `manageMenu.allergens.needReview` | {count, plural, one {# dish needs} other {# dishes need}} review — customers can’t see allergen info until confirmed | {count, plural, one {# plat doit être vérifié} other {# plats doivent être vérifiés}} : les clients ne voient pas les infos allergènes avant confirmation |
| `manageMenu.allergens.allConfirmed` | all dishes confirmed | tous les plats confirmés |
| `manageMenu.allergens.cardNotAllowed` | An allergen card on its own can’t be used where your truck trades, so customers see allergens against each dish. Please confirm each dish’s allergens. | Une fiche allergènes seule n’est pas autorisée là où votre food truck exerce : les clients voient donc les allergènes de chaque plat. Merci de confirmer les allergènes de chaque plat. |
| `manageMenu.allergens.setUpReview` | Set up / review allergens | Renseigner / vérifier les allergènes |
| `manageMenu.allergens.viewOnly` | View only — only the owner can edit allergens | Lecture seule : seul le propriétaire peut modifier les allergènes |

**S6c · Shared: SavedAllergenCard** — `app/(app)/manage/[token]/page.tsx` lines 2083–2142

| Key | en-GB | fr-FR |
|---|---|---|
| `manageAllergens.savedCard.showLess` | Show less | Voir moins |
| `manageAllergens.savedCard.showMore` | Show more | Voir plus |
| `manageAllergens.savedCard.fileOnly` | A card file is saved for this truck, but no summary text was stored. Open the original to read it. | Un fichier de fiche est enregistré pour ce food truck, mais aucun texte de résumé n’a été conservé. Ouvrez l’original pour le lire. |
| `manageAllergens.savedCard.viewOriginal` | View original card | Voir la fiche d’origine |

**S6d · Manage › Menu — legacy card modal + extracted review (unreachable)** — `app/(app)/manage/[token]/page.tsx` lines 5126–5262

| Key | en-GB | fr-FR |
|---|---|---|
| `manageMenu.allergens.reading` | Reading allergen information… | Lecture des informations sur les allergènes… |
| `manageMenu.allergens.extractedTitle` | Extracted allergen information | Informations sur les allergènes extraites |
| `manageMenu.allergens.contains` | Contains | Contient |
| `manageMenu.allergens.mayContain` | May contain | Peut contenir |
| `manageMenu.allergens.freeFrom` | Free from | Sans |
| `manageMenu.allergens.dietaryOptions` | Dietary options | Régimes alimentaires |
| `manageMenu.allergens.tryAgain` | Try again | Réessayer |
| `manageMenu.allergens.saveInfo` | Save allergen info | Enregistrer les infos allergènes |
| `manageMenu.allergens.update` | Update allergen info | Mettre à jour les infos allergènes |
| `manageMenu.allergens.add` | Add allergen info | Ajouter les infos allergènes |
| `manageMenu.allergens.uploadIntro` | Upload your allergen card or paste your allergen information. Our AI will extract and structure it clearly for customers. | Importez votre fiche allergènes ou collez vos informations sur les allergènes. Notre IA les extrait et les structure clairement pour les clients. |
| `manageMenu.allergens.dropHere` | Drop your allergen card here | Déposez votre fiche allergènes ici |
| `manageMenu.allergens.dragOrTap` | Drag and drop or tap to upload | Glissez-déposez ou touchez pour importer |
| `manageMenu.allergens.imageOrPdf` | Image or PDF | Image ou PDF |
| `manageMenu.allergens.orTypePaste` | or type / paste | ou saisissez / collez |
| `manageMenu.allergens.pastePlaceholder` | Paste your allergen information here… | Collez vos informations sur les allergènes ici… |
| `manageMenu.cancel` | Cancel | Annuler |
| `manageMenu.allergens.extract` | Extract with AI | Extraire avec l’IA |

**S7a · Order page — "Allergen info" link** — `app/(app)/trucks/[slug]/order/page.tsx` lines 2936–2952

| Key | en-GB | fr-FR |
|---|---|---|
| `order.menu` | Menu | Carte |
| `order.allergenInfo` | ⓘ Allergen info | ⓘ Infos allergènes |

**S7b · Order page — Allergen info pop-up** — `app/(app)/trucks/[slug]/order/page.tsx` lines 4328–4392

| Key | en-GB | fr-FR |
|---|---|---|
| `order.allergenTitle` | Allergen information | Informations sur les allergènes |
| `order.allergenNotProvided` | Allergen info not provided — please confirm directly with the truck. | Informations sur les allergènes non fournies — veuillez vérifier directement auprès du food truck. |
| `order.allergenCard` | 📎 View allergen card (PDF/image) | 📎 Voir la fiche allergènes (PDF/image) |
| `order.allergensUsed` | Allergens used in this menu | Allergènes présents dans cette carte |
| `order.allergensSeeEach` | See each dish for its specific allergens. | Consultez chaque plat pour connaître ses allergènes. |
| `order.allergenSevere` | If you have a severe allergy, please contact the vendor directly before ordering. | En cas d’allergie sévère, veuillez contacter directement le commerçant avant de commander. |

**S8a · Manage › Menu › Extras — option allergens (components/manage/ExtrasEditor.tsx)** — `components/manage/ExtrasEditor.tsx` lines 549–566

| Key | en-GB | fr-FR |
|---|---|---|
| `manageExtras.option.allergens` | Allergens | Allergènes |
| `manageExtras.option.allergensHelp` | This option’s own allergens (separate from the dish) | Allergènes propres à cette option (distincts de ceux du plat) |
| `manageExtras.option.dietary` | Dietary | Régimes alimentaires |

**Other keys** (reached indirectly)

| Key | en-GB | fr-FR |
|---|---|---|
| `manageMenuImport.allergenCardText.contains` | Contains: {list} | Contient : {list} |
| `manageMenuImport.allergenCardText.mayContain` | May contain: {list} | Peut contenir : {list} |
| `whatsappCustomer.allergenRedirect` | {opener}You can see our full menu and allergen information here: {url} — {truck} {emoji} | {opener}Retrouvez notre carte complète et les informations sur les allergènes ici : {url} — {truck} {emoji} |
| `whatsappCustomer.allergenCaveat` | Please double-check the full menu for allergen info — this is an automated reply. | Merci de vérifier la carte complète pour les allergènes — ceci est une réponse automatique. |
| `manageMenu.allergens.heading` | Allergens | Allergènes |
| `manageMenuImport.steps.allergens` | Allergens | Allergènes |

## Appendix B · Data used and how to reproduce

**Read-only SELECTs** (besides the information_schema / pg_constraint queries above):
```sql
select t.id, t.slug, t.country, t.allergen_display_mode, t.allergen_info_text is not null as has_card_text, t.allergen_info_url is not null as has_card_url,
  (select count(*) from menu_items_db i where i.truck_id = t.id) as items,
  (select count(*) from menu_items_db i where i.truck_id = t.id and i.allergens_verified = false) as unverified,
  (select count(*) from menu_items_db i where i.truck_id = t.id and cardinality(i.allergens) > 0) as with_allergens,
  (select count(*) from modifier_options o join modifier_groups g on g.id = o.group_id where g.truck_id = t.id and cardinality(o.allergens) > 0) as options_with_allergens
from trucks t where t.slug in ('app-tester', 'test-truck', 'test-truck-us') or t.id like 'test-truck%';
-- → app-tester: per_dish, 30 dishes, 0 unconfirmed, 22 with allergens; test-kitchen: card, card text saved; test-truck-3: 27 unconfirmed

select json_build_object(
  'categories', (select json_agg(json_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'sort_order', c.sort_order) order by c.sort_order) from menu_categories c where c.truck_id = 'test-truck-3-2'),
  'items', (select json_agg(json_build_object('id', i.id, 'name', i.name, 'description', i.description, 'price', i.price, 'category_id', i.category_id, 'allergens', i.allergens, 'dietary_info', i.dietary_info, 'allergens_verified', i.allergens_verified, 'sort_order', i.sort_order, 'is_available', i.is_available, 'spiciness', i.spiciness) order by i.sort_order, i.name) from menu_items_db i where i.truck_id = 'test-truck-3-2')
) as data;

select id, slug, allergen_display_mode, allergen_info_text from trucks where id = 'test-truck';
-- → card, "Test allergens"
```

**Screenshots:**
- 76 PNGs in `docs/allergen-screens-1/`, named `NN-<screen>-<lang>-<width>.png`; 01–28 are Manage (mounted), 29–32 the customer order page (localhost).
- `03b-import-allergens-footer-next-offscreen-fr-FR-390.png` records the footer overflow.
- The capture scripts were run from the session scratchpad and are not in the repo. They use the repo's existing mounting method (`scripts/costs-accounts-1-screens.cjs`) and Playwright.
