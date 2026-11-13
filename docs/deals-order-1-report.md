# deals-order-1: reorder formules in Manage › Menu › Deals, the way categories reorder

*13 November 2026. Not deployed. Three migrations run (§2). No new wording.*

## Summary

- **Every formule card in Manage › Menu › Deals now has the six-dot handle and drag-to-reorder**, the category list's own.
  - The category list's drag code was **moved, unchanged**, into one shared piece (`components/manage/ReorderDrag.tsx`). The category list and the formules list both use it: same handle, same native drag, same lifted row and drop line, same saving (each row's `sort_order` 1, 2, 3, …, then reload and a toast).
  - There is no second mechanism.
- **The order is stored per truck** in `bundles_db.sort_order`. Every list of formules reads it:
  - Manage › Deals (and the Schedule tab's deal toggles, from the same list);
  - `/api/menu` (sorted now; it wasn't before), which feeds the order page's Formules tab and the dashboard's Add order and deals pop-up.

  **New formules go to the bottom.** Kitchen tickets and receipts don't list formules (they show the deals on an order, in the order added), so nothing changes there.
- **The column already existed but held 0 for every formule.** Migration 20261098 numbers each truck's formules in today's display order. Only Le Roi du Churrasco had any, and its three kept their order.
- **App Tester now has three test formules** (migration 20261099). That clears the backlog item "no test truck has formules"; I haven't edited the manual (§6).
- **Proof:** `scripts/deals-order-1-live.cjs` passes all 31 checks (§3), and the sweep's only failures are from other sessions' unfinished work (§5).
- ⚠️ **Two things I couldn't check by machine** (§0): a real **finger** drag on an iPad or phone, and Manage opened **signed in** as App Tester.

## 0 · Flags

- **No span of the prompt arrived garbled. No instructions contradict each other.**
- ⚠️ **Manage couldn't be opened on localhost for App Tester.** Manage refuses anyone not signed in as the truck's owner (deny by default). I have no sign-in for App Tester's owner, and minting a session from the service key would mean reading `.env.local` and acting as that user. So:
  - the **real Formules and category lists** (`DealsTab` and `MenuTab` from the Manage page) were bundled and mounted in real Chromium and WebKit, as `costs-accounts-1-screens.cjs` does. Their `api` calls went to a stand-in that saves exactly what the route saves and lists in the route's order, keeping its rows across a page reload;
  - **the real database and localhost** were used for the customer side (§3.3);
  - **the one save Manage would have made** after the drag was written by a committed migration on App Tester's test rows (20261100): `sort_order` 1, 2, 3 in the dragged order. It deliberately isn't the creation order, so the order page and dashboard visibly follow the stored order.

  To see it end to end yourself: open Manage › Menu › Deals for App Tester, drag a formule, reload, then open its order page.
- ⚠️ **A finger drag can't be automated on this Mac.** An HTML5 drag starts from a long press only inside a phone or tablet browser's own touch handling (Safari on iPad and iPhone since iOS 15, Chrome on Android). Neither Playwright's WebKit nor desktop Chromium turns emulated touch into a drag; I tried Chromium with `--enable-touch-drag-drop` and DevTools touch events. At iPad (820 px) and phone (390 px) widths with touch screens on, the script proves:
  - the handle is on screen and is what a finger lands on;
  - nothing scrolls sideways;
  - a drag reorders and saves.

  The finger itself behaves exactly as on the category list, which is the same code. **Worth one try on your iPad.**
- **"Deal updated"** is the confirmation after a reorder: the formule's existing word, since "Category order updated" would be wrong here. No new string.
- **One guard added to the moved code:** a drop whose dragged id isn't in the list (a file, or another list) is now ignored. Before, the category list would have spliced index −1 and moved its last category.
- **Before deploy:** the live site's Manage already sorts by `sort_order`, so it already shows the new numbering. The live `/api/menu` still returns formules unsorted until this code is deployed. Le Roi's numbering matches its creation order, so its customers see no change either way.

## 1 · What changed

| File | Change |
|---|---|
| `components/manage/ReorderDrag.tsx` (new) | `reorderRowProps(list, index, onReorder)`: the category list's `draggable` + `onDragStart/End/Over/Leave/Drop`, moved unchanged. `DragHandle`: its "⋮⋮" grip, unchanged markup. |
| `app/(app)/manage/[token]/page.tsx` | The category list spreads `reorderRowProps(categories, …)` and keeps its own saving (`update_category_order` ×N, reload, "Category order updated"). **DealsTab:** each card is wrapped the same way, with the handle first, saving `update_bundle_order` ×N, then reload and "Deal updated". |
| `app/api/manage/route.ts` | New action `update_bundle_order` (`{ id, sort_order }`, scoped to the truck), a twin of `update_category_order`. `upsert_bundle`: a **new** formule gets the truck's highest `sort_order` + 1; an edit never changes its place. The load lists `order by sort_order, created_at`. |
| `app/api/menu/[truckId]/route.ts` | Formules are read `order by sort_order, created_at`. Every filter after that (event deals, stock) keeps the order. |
| `scripts/deals-order-1-live.cjs` (new), `scripts/harnesses.json` | The checks (§3); by hand, listed under `needs_a_browser`. |

## 2 · SQL: three migrations, run with `scripts/db-migrate.cjs`

**20261098_bundles_sort_order_fill.sql:** number every truck's formules in today's display order.
```sql
begin;
update public.bundles_db b
   set sort_order = r.rn
  from (
    select id, row_number() over (partition by truck_id order by sort_order, created_at, id) as rn
      from public.bundles_db
  ) r
 where b.id = r.id
   and b.sort_order is distinct from r.rn;
commit;
```
"Today's display order" was the table's physical order, because every row held 0. For the only truck with formules (Le Roi), that was the same as creation order (read-only check below), so its three became 1, 2, 3 without moving.

**20261099_app_tester_test_formules.sql:** three test formules on App Tester only (approved).
```sql
begin;
insert into public.bundles_db (id, truck_id, name, description, bundle_price, original_price, is_available, apply_to_new_events,
                               slot_1_category, slot_2_category, sort_order)
select v.id::uuid, 'test-truck-3-2', v.name, v.description, v.price, v.original, true, true, v.s1, v.s2,
       coalesce((select max(sort_order) from public.bundles_db where truck_id = 'test-truck-3-2'), 0) + v.n
  from (values
    (1, 'd0000001-0000-4000-8000-00000000a001', 'Pizza + Drink',       'Any pizza and any drink',       14.50, 16.50, 'pizza',       'drinks'),
    (2, 'd0000001-0000-4000-8000-00000000a002', 'Dough Balls + Drink', 'Dough balls and any drink',      7.50,  8.50, 'dough-balls', 'drinks'),
    (3, 'd0000001-0000-4000-8000-00000000a003', 'Pizza + Dessert',     'Any pizza and any dessert',     16.00, 18.50, 'pizza',       'desserts')
  ) as v(n, id, name, description, price, original, s1, s2)
 where exists (select 1 from public.trucks where id = 'test-truck-3-2' and slug = 'app-tester')
on conflict (id) do nothing;
commit;
```

**20261100_app_tester_test_formules_order.sql:** what Manage saves after the drag check's move ("Pizza + Dessert" to the top), App Tester only.
```sql
begin;
update public.bundles_db b
   set sort_order = v.sort_order
  from (values
    ('d0000001-0000-4000-8000-00000000a003'::uuid, 1),
    ('d0000001-0000-4000-8000-00000000a001'::uuid, 2),
    ('d0000001-0000-4000-8000-00000000a002'::uuid, 3)
  ) as v(id, sort_order)
 where b.id = v.id
   and b.truck_id = 'test-truck-3-2';
commit;
```

**Read-only queries:**
```sql
select table_name from information_schema.columns where column_name = 'bundle_price' and table_schema = 'public';
select column_name, data_type, column_default, is_nullable from information_schema.columns where table_name = 'bundles_db' and table_schema = 'public' order by ordinal_position;
select truck_id, count(*) n, count(distinct sort_order) distinct_orders, min(sort_order), max(sort_order), count(*) filter (where sort_order is null) nulls from bundles_db group by truck_id order by n desc;
-- → le-roi-du-churrasco: 3 formules, all sort_order 0 (the only truck with any)
select id, name, sort_order, created_at, ctid, is_available from bundles_db where truck_id = 'le-roi-du-churrasco' order by ctid;
-- → MENU DU ROI (0,16), MENU DU PRINCE (0,17), MENU DU ROI (2) (0,18): physical order = creation order
select c.id, c.name, c.slug, c.sort_order, (select count(*) from menu_items_db i where i.category_id = c.id and i.is_available) as available_items
  from menu_categories c where c.truck_id = 'test-truck-3-2' order by c.sort_order;
select t.id, t.slug, t.operator_id is not null as has_operator, t.country, (select count(*) from bundles_db b where b.truck_id = t.id) as formules,
       (select count(*) from menu_categories c where c.truck_id = t.id) as categories from trucks t where t.slug = 'app-tester';
select o.id, o.is_admin, split_part(o.email, '@', 2) as email_domain, (select count(*) from trucks t2 where t2.operator_id = o.id) as trucks_owned
  from trucks t join operators o on o.id = t.operator_id where t.slug = 'app-tester';
select truck_id, name, sort_order from bundles_db order by truck_id, sort_order;
-- after all three: Le Roi 1 MENU DU ROI · 2 MENU DU PRINCE · 3 MENU DU ROI (2); App Tester 1 Pizza + Dessert · 2 Pizza + Drink · 3 Dough Balls + Drink
```

## 3 · Checks (`scripts/deals-order-1-live.cjs`): ✅ 31/31

Run: `npx next start -p 3100 &` then `node scripts/deals-order-1-live.cjs --live "Pizza + Dessert|Pizza + Drink|Dough Balls + Drink"`.

**3.1 Mouse, desktop, 1280 px (Chromium and WebKit):**
- Starting order = the stored one. A "⋮⋮" handle on all 3 formules (grab cursor, 20 px, as on the categories); the row is what drags.
- Mid-drag the row is lifted (opacity 0.5, dashed orange border).
- "Pizza + Dessert" dropped on the top row becomes first.
- Saved like the categories: 3 × `update_bundle_order` (1, 2, 3 in the new order), then "Deal updated".
- **After a page reload the order is still the new one.**
- **The category list still reorders and saves exactly as before** (Pizza · Drinks · Desserts → Desserts · Pizza · Drinks; `update_category_order` 1, 2, 3; "Category order updated").
- No page errors.

**3.2 iPad 820 px and phone 390 px, touch screens on (Chromium and WebKit):**
- Every handle is on screen and is what a finger lands on (`elementFromPoint` at its centre).
- Nothing scrolls sideways.
- A drag moves "Dough Balls + Drink" to the top, saves the same way, and survives a reload. (Real finger: see §0.)

**3.3 The real database, localhost, App Tester:**
- **The order page's Formules tab** (first tab, "Meal deals") lists **Pizza + Dessert · Pizza + Drink · Dough Balls + Drink**: the stored order, not the creation order.
- **The dashboard's deal list** (`/api/menu?dashboard=1`, which feeds Add order and the deals pop-up) lists the same.

**Screenshots** (`docs/deals-order-1/`):
- `manage-deals-{chromium,webkit}-1280-{before,after}.png` and `manage-deals-chromium-1280-dragging.png` (mid-drag);
- `manage-deals-{chromium,webkit}-{ipad-820,phone-390}-{before,after}.png`;
- `manage-categories-chromium-1280-after.png`;
- `order-page-app-tester-390.png`.

## 4 · Where formules are listed, and what reads the order now

| Place | Source | Order |
|---|---|---|
| Manage › Menu › Deals | `/api/manage` load | `sort_order, created_at` (was `sort_order` only, all ties) |
| Manage › Schedule (event deal toggles) | the same list | the same |
| Order page, Formules tab | `/api/menu` | **now** `sort_order, created_at` (was unsorted) |
| Dashboard: Add order, the deals pop-up | `/api/menu?dashboard=1` | the same |
| Kitchen ticket, receipt, emails | the order's own deals | the order they were added (not a formules list; unchanged) |

## 5 · Harnesses and the sweep

**Re-pinned.** Each change is exact and named, rebuilt from BEFORE's own data. The new module `scripts/_named-deals-order-1.cjs`:
- `dealsList`: wraps each formule card in the drag row with the handle, using the fixture's own deal ids and the existing "Drag to reorder";
- `dealsText`: puts "⋮⋮ " before each deal name, found exactly once;
- `undoMenu`: takes the menu route's four added lines out, found exactly once, and must give 391497fd's file.

| Harness | Why it moved | Re-pin |
|---|---|---|
| language-phase-1d | Manage › Deals views (list, new, edit) | `deals-order-1-drag-handle` in `_lp1d-named.cjs` → 411/411 |
| language-phase-1d2 | the same views in its smoke set | the same entry in `_lp1d2-named.cjs` → 692/692 |
| money-sweep-parity (+usd) | `manage.deals` text and attributes | BEFORE's `manage.deals` gains "⋮⋮ " per deal and one `title=Drag to reorder` per deal → ✅ 3038 strings; USD ✅ |
| schedule-graphics-places | the "no line of the page was lost" guard | `ReorderDrag.tsx` listed under `MOVED_INTO` (the drag code moved there verbatim); the 15 renamed lines named one by one in `movedEdits`, each with its new form, which is checked → 270/270 |
| cwv-2, costs-accounts-1 | the menu API is a pinned ordering path | `undoMenu` exception → 44/44, 78/78 |
| event-pricing | it counts lines removed from the menu API | not re-pinned: the sort was placed so no line is removed → 139/139 |

**Final full sweep** (218 listed files; code commit 1e3b6327): **212 pass and 6 fail.**
- **paperwork-1, legal-languages-1, world-countries-3, contact-1, tidy-1:** `ENOENT content/legal/ru-KZ/privacy-policy.md`, another session's unfinished `ru-KZ` work (same as order-page-2).
- **event-types-render:** six font-size and line-height measurements in its Event types fixture at 820 px (a dropdown measured 16 px against 14 px).
  - **This build passed it** in the sweep before the re-pins (sweep 3, the same `.next` build of 12:43). It now fails on three runs in a row.
  - Nothing it measures changed: `EventTypes.tsx`, `globals.css` and the harness are untouched; the built app stylesheet still has the select size rules; and it reads the Manage page only to lift class strings, which all matched.
  - It's the intermittent failure seen in order-page-2's sweep. I couldn't pin down the cause in this session; ⚠️ **worth a look** if it stays red after a fresh build.

## 6 · Not done here

- **The reference manual** isn't updated. Its backlog item "no test truck has formules" is now done (App Tester has three), ready for the next manual update.
- **Not deployed.**
