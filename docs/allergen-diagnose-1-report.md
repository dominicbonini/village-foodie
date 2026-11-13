# allergen-diagnose-1 — how Le Roi du Churrasco's dishes got all 14 allergens

Read only. No code, data or settings were changed. The only file written is this report.

## The answer in short

**The owner's account ticked all 14 allergens by hand on every dish, one dish at a time, in the allergen wizard, and confirmed each one.** The AI did not do it, and neither did the import's "may be present" box. The AI found one allergen on the whole menu: Fish on the cod fritters, which is correct. The menu was saved with that one allergen and no others, and every dish not yet confirmed. Over the next 90 seconds to 8 minutes the owner's login opened the wizard and confirmed the dishes about 40 seconds apart. Each confirm changed the dish from `[]` (or `[Fish]`) to all 14. Half an hour later the same login added "Coca-cola original 33cl" through the add-dish form, also with all 14 ticked.

The most likely reason is that our screens only offer "contains". The wizard and the add-dish form have nowhere to record "may contain traces of…", which a French kitchen often says about all 14 at once. That reason is my inference, not something the data records.

## 1. Each dish

Truck `le-roi-du-churrasco` (FR, trial plan). The truck was created 9 Nov 2026 20:13 UTC. The owner account is operator "Jenny & Ludo DA SILVA", and every allergen write below was made by that account's login (`actor_role = owner`, `auth_method = authenticated`).

| Dish | Saved allergens | Verified | After import (before the confirm) | Confirmed at (UTC, 9 Nov) | How |
|---|---|---|---|---|---|
| Poulet Portugais Demi-Poulet | all 14 | ✅ | `[]` | 21:35:24 | wizard, per-dish confirm |
| Poulet Portugais Poulet Entier | all 14 | ✅ | `[]` | 21:36:07 | wizard |
| Batatinhas do Rei | all 14 | ✅ | `[]` | 21:36:41 | wizard |
| Arroz Soltinho | all 14 | ✅ | `[]` | 21:37:19 | wizard |
| Beignets de Viande | all 14 | ✅ | `[]` | 21:37:56 | wizard |
| Beignets de Morue | all 14 | ✅ | `["Fish"]` (AI) | 21:38:39 | wizard |
| Boissons 33cl | all 14 | ✅ | `[]` | 21:39:16 | wizard |
| Vins 75cl | all 14 | ✅ | `[]` | 21:40:02 | wizard |
| Pastel de nata | all 14 | ✅ | `[]` | 21:40:42 | wizard |
| Bolo brigadeiro | all 14 | ✅ | `[]` | 21:41:19 | wizard |
| Pudim do Rei | all 14 | ✅ | `[]` | 21:41:53 | wizard |
| Coca-cola original 33cl | all 14 | ✅ | did not exist (created) | 22:08:59 | add-dish form, created with 14 ticked |

The extras (Super Bock, Soft, Blanc, Rosé, Rouge) have **no** allergens.

**Timeline**
- 20:04: demo created from an uploaded menu. Le Roi claimed it later. The demo carry-over did **not** run (`menu_carry_status` is null).
- 21:33:56: menu import committed, 11 items. The audit row says `{"items_imported":11,"allergens_verified":false}`.
- 21:35:24 → 21:41:53: 11 per-dish confirms, roughly 35–46 seconds apart.
- 22:08:59: Coca-Cola added.

## 2. A truck-wide "may be present" / cross-contamination setting

**There isn't one.** The database has no truck-level or dish-level "may contain" column. The only truck-level allergen fields are these, and for Le Roi:
- `allergen_display_mode`: **null**. The customer page treats null as per-dish, so the 14 chips **are shown to customers**.
- `allergen_info_text`: **null**.
- `allergen_info_url`: **null**.

So no allergen card was saved. If a card had been read during the import, its text would have been stored in `allergen_info_text` (see the code at page.tsx around line 4196).

## 3. Was it the "may be present" merge, or the AI?

**Neither.**

**The import's "may be present" box (`mergeAllergensUnion`).** This is now at [page.tsx:4181-4186](app/(app)/manage/[token]/page.tsx#L4181-L4186). The brief's 4176–4179 has shifted by a few lines, and that file has uncommitted changes. The box only applies when an allergen card was read during the import **and** the operator ticked the box, which is off by default (`cardBlanketOptIn`, line 3025). If it had fired, the import would have saved the merged list on every dish. Instead, the audit log records the value **just before** each confirm, read from the database by the server ([route.ts:815-816](app/api/manage/route.ts#L815-L816)). That value was `[]` on ten dishes and `["Fish"]` on the cod fritters. On top of that, no card text was saved, so no card was read. The merge did not run.

**The AI extraction.** The demo session stores what the AI returned (`demo_sessions.extraction`) for the same menu:

| Dish (as the AI named it) | AI allergens |
|---|---|
| Poulet Portugais, Batatinhas do Rei, Arroz Soltinho, Beignets de Viande, Drinks, Wine, Pastel de nata, Bolo brigadeiro, Pudim do Rei | `[]` |
| Beignets de Morue | `["Fish"]` |

What the import committed at 21:33 matches this exactly. The AI result of the 21:33 import itself is not logged, but the committed values are recorded in the confirm rows' "before" values. The AI followed its "stated only, don't guess" rule ([menu-extract.ts:143-147](lib/menu-extract.ts#L143-L147)).

**The import's own allergen step was skipped.** Every item was committed unverified, and the display mode was left null. That is what happens when the operator presses "Skip allergen setup for now": `chosenDisplayMode` is null, so the display mode isn't set.

## 4. The wizard: one dish at a time, or all at once?

**One dish at a time, with no "confirm all".**
- The wizard pre-fills each dish's tick boxes from what is stored ([page.tsx `seed`, ~line 2254](app/(app)/manage/[token]/page.tsx)). Here that was nothing, or Fish.
- Each dish has its own Confirm button, and each confirm is a separate `upsert_item` write with `allergens_verified=true` (`handleConfirm` → `writeItemAllergens`).
- The header comment says it outright: "no auto-write, no bulk 'confirm all'".
- Neither the wizard's list view nor its table view has a "tick all" control.

**What Le Roi actually did.** These points show the owner's login clicked every box by hand:
1. **One write per dish, about 40 seconds apart.** That is the pace of clicking 14 boxes and pressing Confirm, eleven times.
2. **It wasn't the dish edit form.** That form hides the allergen boxes on an unverified dish and sends the operator to the wizard instead ([page.tsx:5520-5530](app/(app)/manage/[token]/page.tsx#L5520-L5530)). It also saves on every click, which would have left many audit rows per dish. There is exactly one per dish.
3. **The saved order is click order.** A click adds the allergen to the end of the list (`[...draft, a]`, [page.tsx:2586](app/(app)/manage/[token]/page.tsx#L2586) and [primitives.tsx:283](components/manage/primitives.tsx#L283)). Nine of the eleven wizard dishes are saved in exactly the on-screen order, Gluten → Molluscs: someone clicking left to right. The other two leave clear traces:
   - **Demi-Poulet** (the first dish): the last six were clicked right to left (Molluscs, Lupin, Sulphites, Sesame, Mustard, Celery).
   - **Beignets de Morue**: Fish was already ticked by the AI. The saved order is Gluten, Crustaceans, Eggs, **Peanuts, Fish**, …. That only comes out if Fish was clicked off while going along the row and then clicked back on after Peanuts.
   - **Coca-Cola**: saved in a scattered order (Gluten, Crustaceans, Eggs, Fish, Peanuts, Mustard, Molluscs, Celery, …), so those were clicked individually too.
4. **Coca-Cola was a new dish.** Its "before" value is `null`, so it came through the add-dish form, which saves a new dish as verified by default.

## 5. Proposals (not built)

### (1) Keep "may be present" separate from "contains"

- **Data**
  - New `menu_items_db.may_contain text[]` and `modifier_options.may_contain text[]`, both defaulting to empty.
  - A truck-wide `trucks.may_contain text[]` plus an optional cross-contamination note. This holds the "everything may contain…" statement once, instead of copying it onto every dish.
  - The same verified gate as `allergens`: hidden until the dish is confirmed.
- **Import**
  - The import's "may be present" box ([page.tsx:4181-4186](app/(app)/manage/[token]/page.tsx#L4181-L4186)) writes the truck-wide list instead of adding to each dish's "contains".
  - The card-to-dish matcher puts a card's "may contain" entries into `may_contain`.
  - The AI prompt currently says to turn "May Contain Peanuts" into "Peanuts" ([lib/allergens.ts:140-188](lib/allergens.ts#L140)). It would return a separate `may_contain` list instead.
- **Wizard and dish form.** Each allergen box has three states: none / contains / may contain ("Traces possibles" in French). The wizard also gets a truck-wide "Our kitchen may contain…" line that is set once.
- **Safety.** Wherever "contains" is shown, "may contain" must be shown too, so we never under-warn. Existing data stays as it is: today's "contains" lists don't move until an operator reclassifies them.
- **Customer screens it changes**
  - Order page, dish row chips ([order/page.tsx:3281-3290](app/(app)/trucks/[slug]/order/page.tsx#L3281-L3290)): "contains" chips as now, plus a lighter "may contain" line or chip style.
  - Dish pop-up option allergens (~line 4251).
  - The allergen pop-up "Allergens used on this menu" (~lines 4333-4386): gains a "may be present" section and the truck-wide statement.
  - The order email and receipt, wherever they repeat the allergens that travel on the order.
  - Card-only mode doesn't change.

### (2) Stricter AI allergen tagging (only what is stated or obvious)

The AI was not at fault here. Its one tag, Fish on "Beignets de Morue / Cod fritters", is the obvious kind.

- **Ask for evidence.** Have the AI return each allergen with its source, either `stated` (an explicit label or note) or `ingredient` (a named ingredient that is itself the allergen, e.g. cod → Fish). Drop anything without one.
- **Remove the "may contain → contains" rewrite**, which goes together with (1).
- **Mark doubtful results.** If the AI returns more than about 8 allergens for one dish, or the identical set on every dish, flag it "AI result looks unusual — check" in the import review.

**Customer screens it changes: none directly.** AI results are always unverified, so customers never see them until a dish is confirmed. It only changes what is pre-filled in the import review and the wizard.

### (3) A wizard warning when a dish has an unusual number of allergens

- **When it shows.** A draft has all of the country's list, or 10 or more, or the operator is about to confirm the same large set they confirmed on the previous dish. It also shows when a drink has allergens a drink rarely has (e.g. Fish on Coca-Cola).
- **What it says.** An amber note before Confirm: "You've ticked all 14. 'Contains' means it's an ingredient of this dish. If you mean possible traces, use 'may contain' or the truck-wide statement." Confirm then needs a second tap, but is never blocked.
- **Where.** In the wizard's list and table views, and in the add/edit dish form. Le Roi's Coca-Cola came through that form.

**Customer screens it changes: none.** It is operator-only. Combined with (1), it is the moment we steer "traces of everything" into the right field.

## Current customer impact (for awareness — nothing changed)

All 12 dishes are visible on Le Roi's customer page, each with 14 allergen chips, including the drinks and wines. The allergen pop-up lists all 14. Correcting this needs a decision from Dominic: for example, contacting Le Roi so they reclassify through the wizard. Their data was not touched.

## Prompt check

- Nothing in the brief arrived garbled.
- No contradiction was found. "Show every SQL inline in chat" sits alongside the two-line chat summary, as in the standing report convention.
- The cited lines 4176–4179 are now 4181–4186 (the file has moved slightly). Noted, not garbled.

## SQL run (all read-only)

```sql
select id, name, slug, created_at, allergen_display_mode, left(allergen_info_text,400) as allergen_info_text from trucks where name ilike '%churrasco%';
```
```sql
select table_name, column_name, data_type from information_schema.columns where table_schema='public' and (column_name ilike '%allergen%' or column_name ilike '%cross%' or column_name ilike '%may_contain%') order by 1,2;
```
```sql
select column_name, data_type from information_schema.columns where table_schema='public' and table_name='menu_items_db' order by ordinal_position;
```
```sql
select left(id::text,8) id, name, is_active, allergens, cardinality(allergens) n, allergens_verified, dietary_info, created_at, updated_at, left(description,80) descr from menu_items_db where truck_id='le-roi-du-churrasco' order by created_at, sort_order;
```
```sql
select column_name, data_type from information_schema.columns where table_schema='public' and table_name in ('allergen_audit_log','action_audit_log') order by table_name, ordinal_position;
```
```sql
select a.created_at, m.name, a.change_type, a.field, left(a.old_value,200) old_value, left(a.new_value,300) new_value, a.actor_user_id, a.actor_role, a.auth_method from allergen_audit_log a left join menu_items_db m on m.id=a.item_id where a.truck_id='le-roi-du-churrasco' order by a.created_at;
```
```sql
select created_at, action, actor_kind, actor_label, source, left(before_state::text,200) before_s, left(after_state::text,300) after_s from action_audit_log where truck_id='le-roi-du-churrasco' order by created_at limit 80;
```
```sql
select o.id, o.name, o.created_at, o.auth_user_id = '92e8c180-e5e0-4b27-8b3b-b6f88a2bba60' as is_actor, t.operator_id from trucks t left join operators o on o.id=t.operator_id where t.id='le-roi-du-churrasco';
```
```sql
select g.name grp, o.name opt, o.allergens, o.created_at from modifier_options o join modifier_groups g on g.id=o.group_id where g.truck_id='le-roi-du-churrasco' order by g.name, o.sort_order;
```
```sql
select country, plan, created_at, allergen_info_url from trucks where id='le-roi-du-churrasco';
```
```sql
select column_name from information_schema.columns where table_schema='public' and table_name='demo_sessions' order by ordinal_position;
```
```sql
select count(*) total, count(*) filter (where cardinality(allergens)=14) all14, count(*) filter (where allergens_verified) verified from menu_items_db where truck_id='le-roi-du-churrasco';
```
```sql
select truck_id, created_at, extraction_source, claimed_by_operator_id = '7dcbf755-5370-4656-85be-074687109ea7' as claimed_by_le_roi, menu_carry_status, menu_carry_at, menu_carry_truck_id, menu_review_status, (select jsonb_agg(jsonb_build_object('name', it->>'name', 'allergens', it->'allergens')) from jsonb_array_elements(extraction->'items') it) as extracted_allergens from demo_sessions where claimed_by_operator_id = '7dcbf755-5370-4656-85be-074687109ea7' or menu_carry_truck_id = 'le-roi-du-churrasco';
```

Two first attempts failed on wrong column names: `category` on menu_items_db, and `updated_at` on modifier_options and trucks. They were rerun as the versions above. The action audit log had no rows for this truck.
