# order-page-1: the customer order page — event box, formules in the menu, "Change event"

*13 November 2026.*
- *Committed on main (only this work's files), not pushed and not deployed.*
- *No database change.*
- *Pizzeria Gusto and Le Roi du Churrasco were not touched or tested against.*
- *No `outreach_templates` rows, no landing-page or allergen changes, no `.env` file opened.*
- *No new wording.*

## Summary

1. **Event box: three lines.**
   - Line 1: the date, the time range and the existing status label (same logic, same word: "● Live" / "● En cours").
   - Line 2: a location pin, then the full venue name and area/postcode, wrapping onto as many lines as needed. Never truncated, never overlapping.
   - Line 3: "Change event →" (fr "Changer d’événement →").
   - The event's notes stay below, as before.
2. **Formules are the menu's first category.**
   - They get their own tab and section heading, using the language's existing word without its emoji (FORMULES, MENÜS, ATERIAT…).
   - They appear only when the truck has formules available for the event. Otherwise the menu starts with its first category, as today.
   - Each formule is laid out like a dish: name, "Save" pill, description, price, and the dish's own Add button ("Ajouter"), which opens the existing formule choice.
   - The separate cards above the menu are gone.
   - The tabs stay pinned under the header, and the active tab follows the scroll.
   - On phones the menu is full width with no box. On wider screens it keeps today's width and card.
   - "Allergen info" stays at the top.
3. **"Change event" fixed.**
   - **Cause:** it linked to `/trucks/<slug>`. That is the Village Foodie *discovery* profile, built from the discovery sheet, and it answers "Truck not found" for any truck not in the sheet.
   - **Fix:** it now goes to `/trucks/<slug>/order`, the truck's own events page (the chooser).
   - Only the order page shows this link. `/trucks/*` has no language or country prefix on this site, so there was none to keep.

**Checks:**
- **Screenshots:** WebKit and Chromium, at 320, 390 and 1440 px.
- **Live on localhost** with the test truck App Tester: the box, the link and the sticky tabs.
- **Harnesses:** the related harnesses pass, after re-pinning the identity harnesses for the intended changes.
- **Full sweep:** its only remaining failures are another session's unfinished locale work (§5).

## 0 · Flags

- **No span of the prompt arrived garbled, and no two instructions contradict each other.**
- **The prompt says "Food truck not found";** the page actually reads "🤷‍♂️ Truck not found". Same page.
- **No test or demo truck has formules.** Adding some would mean writing database rows. So formules were tested on the real order page rendered with fixture data (§4). The App Tester run covers the link and the sticky tabs live.
- **I couldn't watch the active tab follow the scroll *across formules* live,** because no test truck has formules. The scroll-tracking reads one list (`navCategories`) with formules first, and the fixture shots show the bar pinned with FORMULES and PIZZAS lit.
- **A fix to an earlier session's guard.** My offline-protection commit `e499b335` had left the costs-accounts-1 guard failing (it pins `supabase/functions/heartbeat-monitor/index.ts`). That work ran no full sweep, so this run's sweep was the first to catch it. Re-pinned here (§5).

## 1 · The event box

**Where:** `components/TruckListCard.tsx` has a new `stacked` layout with a `footerAction` slot. Only the order page's selected-event header uses it; every other caller renders byte-for-byte as before.

| Line | Content | Never overlaps because… |
|---|---|---|
| 1 | date · range · status label (`LiveBadge`, same `status === 'open'` rule, same word) | `flex-wrap`: a long date or 12-hour range pushes the status to the next line |
| 2 | 📍 pin (inline SVG, no words) + venue name + area/postcode | `break-words`, no `line-clamp`, no `truncate`, no corner space reserved |
| 3 | "Change event →" (the existing `order.changeEvent`; the → is a decorative glyph, `aria-hidden`) | its own line |
| — | the event's notes (one shared block, identical to the other layouts) | below the three lines |

**Long names, measured in both engines:**
- German: "Wochenmarkt auf dem Rathausplatz der Gemeinde Garmisch-Partenkirchen (Haupteingang Nord, neben der Tourist-Information)".
- Finnish: "Kauppatori, Pohjoisesplanadin ja Eteläesplanadin välinen ruokarekkapaikka (Kolera-altaan puoleinen pää)".
- Result at 320 and 390 px: the lines are in order and not overlapping, nothing is clipped, and there is no sideways scroll.

## 2 · Formules in the menu

All in `app/(app)/trucks/[slug]/order/page.tsx`.

- **One list.** `navCategories` is `[FORMULES_KEY, ...menuCategories]` when formules are available for the event, otherwise exactly `menuCategories`. The chips, the sections, the scroll-tracking and the chip bar's on/off rule all read it. `FORMULES_KEY` starts with a NUL character, so it can never collide with a category name.
- **Label.** `order.mealDeals` without its leading emoji:
  - en-GB "Meal deals", en-US "Combos", fr "Formules", de "Menüs", fi "Ateriat", ja "お得なセット";
  - checked in all 59 message files: none is left empty.
- **The row.** Like a dish:
  - name, plus the existing "Save £x" pill when there is a saving;
  - description;
  - price on the left, and on the right the dish's Add button (`order.add`; "N · Add" via `order.addMore` once added; the dish's words when ordering is closed, paused or not set up).
  - Add calls `addDeal`, the existing formule choice flow (the deal modal).
  - Formules already added are listed under their row like a dish's added lines, with the existing "Your formule" / "Formule N" label, saving and Remove.
- **Removed:** the "🎁 Meal deals" cards above the menu.
- **Sticky tabs:** unchanged mechanics (`chipBarTop`, `pinnedTop`, the same scroll-tracking). A truck with formules and one category now gets two chips.
- **Full width on phones:**
  - Below `sm:` the menu card is `-mx-4`, with no radius, side borders or shadow. A top and bottom rule (`border-y`) is the only edge between it and the page and the basket bar. `px-4` puts the text back on the page gutter.
  - From `sm:` up it is today's card, and `main` is still `max-w-lg`, so the maximum width is unchanged.
  - The tab bar's and sticky sub-heading's negative margins follow it (`-mx-4 px-4`).

## 3 · "Change event"

- **The old link** (`/trucks/<slug>`) is `app/(app)/trucks/[slug]/page.tsx`, the Village Foodie discovery profile. It looks the truck up in the discovery sheet (`TRUCKS_CSV_URL`) and shows "Truck not found" when the truck isn't there. On localhost, App Tester's old target shows exactly that (screenshot `live-app-tester-390-old-target.png`).
- **The new link** (`/trucks/<slug>/order`): with no `event_id` and more than one event, the order page shows the event chooser; the link only appears when there is more than one event. It's a client navigation, so the page re-derives "no event selected" from the URL.
- **On localhost** it opened the App Tester chooser with 10 events to pick.
- **Every page that shows it:** only the order page's event box (`grep changeEvent`). Manage's "Change event" (`EventActionsModal`) is a different action, not a link.

## 4 · Tests

**Screenshots:** `scripts/order-page-1-screens.cjs` (run by hand after `next build`), `docs/order-page-1/`.
- **Method:** the real page rendered with fixture state (a made-up French truck "Camion Test": two formules, three categories, two events), painted with the build's CSS in WebKit and Chromium. 20 shots, all measured clean.

| Shot | What it shows |
|---|---|
| `*-fr-formules-390-top.png` | phone, top: the three-line box, CARTE + Infos allergènes, tabs FORMULES · PIZZAS · DESSERTS · B…, the formules section (one added: "1 · Ajouter", "Votre formule … Retirer") |
| `*-fr-formules-390-scrolled.png`, `*-fr-formules-pizzas-390-scrolled.png` | phone, scrolled: tabs pinned at 60 px, PIZZAS lit |
| `*-fr-formules-1440-top.png` | desktop: the same at today's 512 px card |
| `*-fr-no-formules-*` | no formules: tabs PIZZAS · DESSERTS · BOISSONS, no formules section |
| `*-de-long-320/390-top.png`, `*-fi-long-320/390-top.png` | the long German and Finnish venues wrapping cleanly |
| `*-fr-chooser-390-top.png` | `/trucks/<slug>/order` with no event: the chooser "Change event" opens |

**Measured on every shot:**
- no sideways scroll;
- event-box lines in order and not overlapping;
- location not clipped;
- link href `/trucks/camion-test/order`;
- formules the first section (or absent);
- no deal card above the menu;
- the menu exactly full width at 390 and 320, and ≤ 512 px at 1440.

**Live, localhost:** `scripts/order-page-1-live.cjs`, against `next start` and the **test truck App Tester** (read only, no order placed). ✅ All passed:
- three lines ("Sat 14 Nov 09:00 – 17:00" / "Test Event 34" / "Change event →"), not overlapping, no sideways scroll;
- the href is `/trucks/app-tester/order`, and clicking it opens the chooser (10 events);
- the old target shows "Truck not found";
- through 60 wheel-scroll steps the tabs stay pinned at 60 px, and the active tab goes PIZZA → DRINKS → DESSERTS.

**Harnesses:** each re-pin names the intended change precisely, and anything else still fails.

| Harness | Result | Re-pin |
|---|---|---|
| `language-phase-1a` | ✅ 1048 | `scripts/_named-order-page-1.cjs` (see the note below) |
| `language-phase-2` | ✅ 2010 | same; `scripts/fixtures/language-phase-2-us-changed.txt` regenerated (names order-page-1) |
| `money-sweep-parity` (GBP and USD) | ✅ | its text leaves: line 1 reads "<date> <range> Live", and the deal text moves inside the menu (`snapshotText`) |
| `cwv-2` | ✅ 44 | `scripts/_longer-intervals-order-page.cjs` regenerated to cover this edit (undo exactly these hunks → the `ae7ff8b4` file) |
| `costs-accounts-1` | ✅ 78 | same, plus the heartbeat monitor excused only as `e499b335`'s exact file |
| `midnight-events`, `time-dates-parity`, `language-phase-1b/1c/1d/1d2`, `canada-1`, `anz-1`, `france-1`, `europe-settings`, `allergen-card-country`, `event-types`, `event-types-render` | ✅ | — |

**How `_named-order-page-1.cjs` re-pins language-phase-1a/-2:** it rebuilds the new markup from the old markup's own data — the box's date, range, Live, venue, area, notes and link; the deals' names, pills, descriptions, prices and added lines. It takes the words from the message files, picking the set the view was rendered with by reading its own deals heading.

`tsc --noEmit` is clean.

## 5 · The full sweep

`node scripts/run-harnesses.cjs` (218 harnesses): **8 failed**, and none remains from this work.
- **5 are another session's unfinished locale work:** `content/legal/ru-KZ/*.md` is missing (paperwork-1, legal-languages-1, world-countries-3, contact-1, tidy-1).
- **event-types-render** failed on its known, unstable font-size measurement at 820 px. It passed on re-run (exit 0).
- **cwv-2 and costs-accounts-1** were mine. Both are re-pinned and pass (§4).

## 6 · SQL

None written or run against the schema. Read-only checks:

```sql
-- test/demo trucks with upcoming events and formules (to choose a test truck; none has formules)
select t.name, t.slug, t.country, t.mode, t.active,
       (select count(*) from truck_events e where e.truck_id = t.id and e.event_date >= current_date and e.status in ('confirmed','open')) as upcoming,
       (select count(*) from bundles_db b where b.truck_id = t.id) as bundles,
       (select count(*) from event_deals d join truck_events e on e.id = d.event_id where e.truck_id = t.id and e.event_date >= current_date) as upcoming_event_deals
from trucks t
where t.slug not in ('pizzeria-gusto','le-roi-du-churrasco') and (t.name ilike any (array['%test%','%demo%','%tester%','%kitchen%']))
order by upcoming desc, bundles desc limit 15;

-- App Tester's upcoming events and menu size (the live localhost check)
select e.id, e.event_date, to_char(e.start_time,'HH24:MI') st, e.status, e.venue_name,
       (select count(distinct c.id) from menu_categories c where c.truck_id = t.id and c.is_active) as categories,
       (select count(*) from menu_items_db i where i.truck_id = t.id) as items
from trucks t join truck_events e on e.truck_id = t.id
where t.slug = 'app-tester' and e.event_date >= current_date and e.status in ('confirmed','open')
order by e.event_date, e.start_time limit 4;
```

## 7 · Files

**Code:**
- `components/TruckListCard.tsx` (the `stacked` layout; notes as one shared block)
- `app/(app)/trucks/[slug]/order/page.tsx`

**Harnesses and scripts:**
- `scripts/_named-order-page-1.cjs` (new)
- `scripts/_lp2-named.cjs`
- `scripts/money-sweep-parity.cjs`
- `scripts/_longer-intervals-order-page.cjs`
- `scripts/costs-accounts-1.cjs`
- `scripts/harnesses.json` (the new helper and the two by-hand scripts registered)
- `scripts/fixtures/language-phase-2-us-changed.txt`
- `scripts/order-page-1-screens.cjs` (new)
- `scripts/order-page-1-live.cjs` (new)

**Screenshots:** `docs/order-page-1/` (34 PNGs + `measurements.json`).

**Report:** `docs/order-page-1-report.md`.

The other sessions' working-tree changes were left out of the commit.
