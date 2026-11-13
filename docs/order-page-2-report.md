# order-page-2: the event box as one link, and allergen names in the customer's language

*13 November 2026. Not deployed. No database writes; three read-only queries (§5). No new wording in any language.*

## Summary

1. **The event box (option A).** It is now two lines:
   - **Line 1:** the date, the time range and the existing status label, wrapping only when a language needs it.
   - **Line 2:** the full venue name, then " · " and the postcode, on one line that wraps for a long address. It is never cut off, and there is no pin icon.

   The separate "Change event" line is gone. **The whole box is now the link** to the truck's events page (`/trucks/<slug>/order`, as order-page-1 fixed it). It has a chevron on the right, vertically centred, and the existing "Change event" words as its accessible name. Left and right padding are the same (16 px inside a 1 px border, measured at 17.0 / 17.0 on every shot).
2. **The allergen pop-up** now lists names in the page's language, using exactly what the dish chips use (`allergenLabel(…, pageLocale)`). Before, it showed the stored English label, such as "Celery" on a French page. Which allergens are listed is unchanged; only the names changed. No other customer-facing place showed English allergen names (§2).
3. **Proof:**
   - The live localhost check on **App Tester** passes all 24 checks (Chromium and WebKit, 390 and 320 px, English, German and Finnish, short and long addresses; the allergen pop-up in French, German, Japanese and English).
   - A coverage run confirms all **59 allergen names from the 7 allergen sets** have a translation in **all 97 non-English locales**.
   - The four harnesses this change moved are re-pinned with exact named changes. The final sweep's only failures are the five that need another session's missing `content/legal/ru-KZ/*.md` (§4).

## 0 · Flags and how I read the brief

- **No span of the prompt arrived garbled. No instructions contradict each other.**
- **"The postcode" is the box's existing area line** (`eventAreaLine`). That is the postcode, with the town in front only when the venue name doesn't already include it (e.g. "The Green · Comberton · CB23 7ED"), and the state for a US event. That is what the old second line showed. If you want the bare postcode only, it's a one-word change.
- **A truck with only ONE event:** the box is not a link and has no chevron, as before, when "Change event" was hidden because there was nothing to change to. In that case the venue name keeps its old link to its venue page. With more than one event the venue can't have its own link, because an `<a>` inside the box's `<a>` is invalid.
- **How the whole box is one link:** an empty link stretched over the whole box. The box isn't wrapped in a link because event notes can contain their own links, and links can't nest. Notes links are lifted above it, so they still work.
- **Something I noticed and did not change:** Finnish dates read "pe 13.marras." with no space after the day. That's the existing date formatter, not part of this work. Worth a look.
- **Test data:** App Tester's events have no postcode and the truck is in English. So the script edits **the browser's own copy** of two responses in flight (Playwright `route`): it gives the chosen event a venue, town and postcode, and sets the truck's `time.locale`, which is what the page takes its language from. **Nothing is written anywhere.** Everything else (the menu, the allergens, the events list, "Change event"'s target) is App Tester's real data through the real server.

## 1 · What changed

| File | Change |
|---|---|
| `components/TruckListCard.tsx` | `stacked` now renders two lines: `when` (date · range · status) and `where` (venue + ` · ` + area, `break-words`). The pin is gone. A new prop `boxLink?: { href, label }` replaces `footerAction`. When given, there's a chevron and an absolutely-positioned `<Link aria-label title data-change-event>` covering the box. Notes sit below, and their own links are raised (`[&_a]:relative [&_a]:z-10`). Padding is `px-4 py-3`. Only the order page uses `stacked`. |
| `app/(app)/trucks/[slug]/order/page.tsx` | It passes `boxLink={events.length > 1 ? { href: /trucks/<slug>/order, label: tOrder('changeEvent') } : undefined}`. The allergen pop-up maps each name through `allergenLabel(a, pageLocale)`. It sorts by the shown name with `localeCompare` in that language; **English keeps exactly the old order** (a no-op stable sort). The element is otherwise byte-identical. |

The no-break space keeps the "·" attached to the venue name, so a wrapped line never starts with it.

## 2 · Every customer-facing place that shows allergen names

| Place | Before | Now |
|---|---|---|
| Order page, the dish chips | translated (`allergenLabel`, france-1) | unchanged |
| Order page, **the "Allergen info" pop-up** | 🔴 **stored English label** | ✅ translated, the same call as the chips |
| Item pop-up and basket (option allergens) | not shown to customers (removed in V7.8 §31; still carried on the order) | — |
| Order confirmation and receipt (`OrderConfirmation`) | no allergen names | — |
| Customer emails (`lib/email.ts`) | allergens are only in the type, never rendered | — |
| WhatsApp allergen guard | sends fixed per-language replies (`lib/allergen-guard/<lang>.json`), not a list of stored names | — |

Operator screens (Manage) aren't customer-facing and weren't changed.

**Coverage, all languages × all sets:** every label of `UK_14`, `US_9`, `ANZ`, `CA`, `JP`, `BR` and `CODEX` (59 distinct), in every non-English locale in `LOCALES` (97, with their parent fallbacks), has a key in `menuBadges.allergen`. The real `translatorFor` reports **0 missing**. 10,030 label × locale pairs went through `allergenLabel`. The 186 that come back unchanged are words that are the same in that language (e.g. "Gluten" in French, German and Dutch; "Lupin" in French), not missing translations.

## 3 · Localhost proof (`scripts/order-page-2-live.cjs`, App Tester, `next start`)

Run by hand: `npx next start -p 3100 &` then `node scripts/order-page-2-live.cjs`. It's listed in `scripts/harnesses.json` under `needs_a_browser`. Result: **✅ 24/24.**

**The event box:** 20 shots (Chromium and WebKit × {390 px: en-GB, de-DE, fi-FI × short, long} + {320 px: the three, long}). Each is checked for:
- **The two lines:** line 1 sits above line 2. Line 2's text is exactly `<venue> · <town> · <postcode>`, not clipped (no ellipsis, no line clamp, `scrollWidth ≤ clientWidth`). The long address wraps onto 4 lines at 390 px and 5 at 320 px.
- **Gone:** no pin, and no "Change event" text in the box.
- **The link:** it covers the whole box inside its border, goes to `/trucks/app-tester/order`, and its `aria-label` is the language's existing words ("Change event", "Event wechseln", "Vaihda tapahtumaa"). Six points tapped across the box (corners, middle, over the text) all land on the link.
- **Layout:** the chevron's centre is the row's centre (0 px apart), padding is 17.0 / 17.0, and there's no sideways scroll.
- **A real tap:** at the box's bottom-left corner, it opens `/trucks/app-tester/order` (the events page).

Finnish at 320 px: line 1 wraps "Käynnissä" (Live) onto its own line, as intended; nothing overlaps.

**The allergen pop-up:** fr-FR, de-DE, ja-JP and en-GB. Each check takes the stored labels from App Tester's real `/api/menu` response and the expected words from `messages/<locale>.json`. In every language the pop-up shows exactly those words, and every dish chip on the page is one of them:
- **French:** Fruits à coque, Gluten, Lactose, Lait, Poissons.
- **German:** Fisch, Gluten, Laktose, Milch, Schalenfrüchte.
- **Japanese:** グルテン, ナッツ類, 魚類, 乳製品, 乳糖.
- **English:** unchanged (Dairy, Fish, Gluten, Lactose, Tree nuts).

**Screenshots** are in `docs/order-page-2/` (28 PNGs and `measurements.json`):
- `box-<engine>-<width>-<locale>-<short|long>.png`: the box alone;
- `page-<locale>-<short|long>-390.png`: the top of the page;
- `allergens-<locale>-390.png`: the pop-up open.

## 4 · Harnesses and the sweep

**Re-pinned (exact named changes, rebuilt from BEFORE's own data):**
- `scripts/_named-order-page-1.cjs`:
  - `eventBox` now builds the order-page-2 box from the old box's date, range, status, venue, area, notes and link, with the chevron and the stretched link when there's a target, and the venue link when there isn't. This covers language-phase-1a/-1b/-1c/-2 through `_lp2-named.cjs`.
  - A new `venueDot(text, venue, area)` turns " venue area " into " venue · area " only when it appears exactly once.
- `scripts/money-sweep-parity.cjs`: the order page's text leaves also go through `venueDot` with the fixture's own venue and town.
- `scripts/time-dates-parity.cjs`: a new allowance **OP2**, matching exactly the BEFORE text with " The Green · Harnessville ".
- `scripts/_longer-intervals-order-page.cjs`: the two order-page hunks are updated and three are added (the import and the pop-up). The round trip `undo(page) == ae7ff8b4's page` is still exact. costs-accounts-1 and cwv-2 read this file.
- `scripts/order-page-1-live.cjs` and `order-page-1-screens.cjs` (by hand) now carry a note at the top: their event-box checks describe order-page-1's three-line box and now fail by design. The other checks still hold.

**Results:**
- language-phase-1a: 1048/1048.
- money-sweep-parity: ✅ all 3037 strings.
- money-sweep-parity-usd: ✅.
- time-dates-parity: ✅.
- **Final full sweep** (`node scripts/run-harnesses.cjs`, 218 listed files): 212 pass and 6 fail, none of them from this work:
  - **paperwork-1, legal-languages-1, world-countries-3, contact-1, tidy-1:** each stops on `ENOENT content/legal/ru-KZ/privacy-policy.md` (or `country-specific-terms.md`). `ru-KZ` is in `LOCALES`, but its legal files don't exist yet; that's another session's unfinished work.
  - **event-types-render:** the known intermittent font-measurement failure. It passes when run on its own straight after (rc=0).
- A first sweep, before the re-pins, failed money-sweep-parity, money-sweep-parity-usd, time-dates-parity and language-phase-1a on exactly the expected differences: the " · ", and a `data-allergen-name` attribute I then removed. All four pass now.

## 5 · SQL (read only)

```sql
select e.id, e.event_date, e.start_time, e.end_time, e.status, e.venue_name, e.town, e.postcode, e.notes is not null as has_notes, e.is_private
from truck_events e join trucks t on t.id = e.truck_id
where t.slug = 'app-tester' and e.event_date >= current_date order by e.event_date, e.start_time limit 20;
-- → Test Event 33 (13 Nov, open) … Test Event 42; no town, no postcode, no notes

select t.id, t.name, t.allergen_display_mode, count(m.*) as dishes,
       count(m.*) filter (where cardinality(m.allergens) > 0) as dishes_with_allergens,
       count(m.*) filter (where m.allergens_verified is not false and cardinality(m.allergens) > 0) as shown
from trucks t left join menu_items_db m on m.truck_id = t.id
where t.slug = 'app-tester' group by t.id;
-- → test-truck-3-2 · App Tester · per_dish · 30 dishes · 22 with allergens · 22 shown

select column_name from information_schema.columns where table_name = 'truck_events' order by ordinal_position;
```

## 6 · Files

- `components/TruckListCard.tsx` and `app/(app)/trucks/[slug]/order/page.tsx`;
- `scripts/order-page-2-live.cjs` (new), `scripts/harnesses.json`, `scripts/_named-order-page-1.cjs`, `scripts/_longer-intervals-order-page.cjs`, `scripts/money-sweep-parity.cjs`, `scripts/time-dates-parity.cjs`, `scripts/order-page-1-live.cjs`, `scripts/order-page-1-screens.cjs`;
- `docs/order-page-2/` (28 PNGs and `measurements.json`) and this report.

The reference manual isn't updated in this commit; ask for a manual update when you want one.
