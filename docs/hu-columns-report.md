# Hatches Up columns — Part B (schema proposal + page changes)

**Inputs (not re-derived):** `docs/reference-manual.md` V12.1 and `docs/hu-reconciliation-report.md` Part A.
**Verification honesty up front:** no admin session was obtainable (as on the four previous attempts), so **the page was NOT run against live data**. The page changes below are verified by code inspection and a clean project `tsc --noEmit` only — and per your standing rule, **tsc is not verification of behaviour**. Nothing on the live outreach page has been observed.

---

## ITEM 3 — SCHEMA PROPOSAL (proposed, **NOT run** — awaiting your approval)

Two independent, tri-state facts. Proposed as **two nullable boolean columns on `outreach_prospects`**:

| column | true | false | NULL |
|---|---|---|---|
| `hu_map` | on the HU map / holds an HU ordering page | checked, absent | **not checked** |
| `hu_ordering` | seen using HU online ordering (list ✓) | checked, not seen | **not checked** |

**Why nullable boolean:** a nullable boolean *is* a three-state — TRUE / FALSE / NULL — so **NULL stays distinct from false** (nobody looked ≠ looked and absent), which is the distinction you rely on. No CHECK needed (a boolean is already constrained, and PostgREST could not expose a CHECK to the UI per the V12.1 no-CHECK rule).

**Why this does NOT break "store the platform as text, not a boolean" (V12.1):** that rule governs the **`platform` identity** column — *which* platform, a multi-valued fact where a boolean cannot represent a third platform and collapses unknown into false. `platform` is **kept as text and untouched — no column dropped, no value deleted.** These two new columns encode a *different* fact: presence/use of **one named platform** (Hatches Up), which is genuinely binary, with unknown carried by NULL. They are the two orthogonal questions `platform` (one column) cannot hold — the same "one column, two questions" trap the manual warns against, avoided by giving each its own column.

**Where:** on `outreach_prospects` (RLS on, anon/authenticated/public revoked), **not** `discovery_trucks` — this is outreach-derived intel and the V12.1 "outreach data must not hang off the public-read discovery table" rule applies.

**Proposed migration file (written, unapplied):** `supabase/migrations/20260903_hu_presence_flags.sql` — adds the two columns + column comments; **contains no backfill** (all rows start NULL = nobody looked). Full SQL is in that file. **I have not run it. STOP here for your approval before it is applied.**

---

## BACKFILL PLAN (pending your approval — **NOT run**, and nothing set to false)

After the columns exist and you approve, the backfill would write (rules taken verbatim from your brief):

| write | rows | source |
|---|---|---|
| `hu_map = true` | **66** | the 37 matched list entries **∪** the 29 existing HU `order_url` rows not on the list (disjoint sets: 37 + 29) |
| `hu_ordering = true` | **15** | the `uses` trucks that have a prospect row (15 of 19 matched; the other 4 have no discovery row yet — see below) |
| `hu_ordering = NULL` | — | all `listed_only` — *not seen using ordering in a 7-day window* is **not** false (a fortnightly trader reads as listed_only). Left at the column default NULL. |
| everything else | — | stays NULL |

🔴 **Nothing is set to false.** Nothing in the source supports a negative: the list is one map viewport, zoomed out, 7-day — not a census, so absence is never evidence against. The 29 HU-`order_url` rows absent from the list still get `hu_map = true` (an ordering page is stronger evidence of presence than absence from one viewport is against it).

⚠️ **The 4 `uses` trucks with no discovery row** (Barista Boy Coffee Co, Kerbside Kitchen, Saffron Fish Co, Spice & Rice) cannot receive `hu_ordering = true` until a row exists — they are in the "create on your say-so" set below. They would take `hu_map = true` **and** `hu_ordering = true` when created.

---

## THE 55 NEW TRUCKS — listed for your eyeball, **none created**

No `discovery_trucks` row was created. Matching was normalised-name + `aliases`; the column below shows the nearest row that fell **below** that threshold (fuzzy dice + shared words) so a truck trading under a different name is not silently treated as new.

🔴 **Only one looks like a genuine same-truck near-miss:** **Eat Is Greek** ↔ existing **Eat Greek** (dice 0.75, shares *eat*/*greek*) — likely the same trader under a name variant; worth an alias rather than a new row. Every other flagged row is a **coincidental shared generic word** (burger / pizza / kitchen / catering / street food / bakes / thai / taqueria) between clearly different trucks — not the same business. Rows marked *(excluded)* are excluded discovery rows.

| List truck | Ordering | Nearest discovery_trucks row (below match threshold) |
|---|---|---|
| Barista Boy Coffee Co | uses | Rural Coffee Caravan (dice 0.44, word: coffee) *(excluded)* |
| Kerbside Kitchen | uses | The Forge Kitchen (dice 0.52, word: kitchen) |
| Saffron Fish Co | uses | Saffron Hill Food (dice 0.46, word: saffron) *(excluded)* |
| Spice & Rice | uses | Spud & Slice (dice 0.43) |
| Cult of Curry | unknown | Curry Leaf Catering (dice 0.40, word: curry) |
| Pizza Lola | unknown | La Piazza (dice 0.71, word: pizza) |
| Well Nice Food | unknown | — |
| 3Bros Burgers | listed_only | Anto Burgers (dice 0.73, word: burgers) |
| A Good Egg | listed_only | — |
| Amen Catering | listed_only | Kerief Catering Ltd (dice 0.56, word: catering) |
| BabTooma Express | listed_only | — |
| Beardus Burger | listed_only | Burger Art (dice 0.60, word: burger) |
| Bien Manger Cornwall | listed_only | — |
| Broadside Pizza | listed_only | The Pizza Pod (dice 0.43, word: pizza) *(excluded)* |
| Build A Burga | listed_only | Grab a Burger (dice 0.44) |
| Cairo Van | listed_only | — |
| Carne Street Food | listed_only | Maya Street Food (dice 0.67, word: street/food) *(excluded)* |
| Clumsies | listed_only | — |
| Crumbelievable | listed_only | — |
| Doodle Donuts | listed_only | — |
| Eat Is Greek | listed_only | Eat Greek (dice 0.75, word: eat/greek) **← check** |
| El Dorado Taqueria | listed_only | Taqueria La Gringa (dice 0.50, word: taqueria) |
| Goldee's Bagels | listed_only | Mrs Bean's Bagels (dice 0.50, word: bagels) |
| Green Choy | listed_only | Eat Greek (dice 0.40) |
| Hot Bird | listed_only | — |
| India Express | listed_only | — |
| Kaya Thai Street Food | listed_only | Maya Street Food (dice 0.73, word: street/food) *(excluded)* |
| Kushi London | listed_only | — |
| Mama Cook Truck | listed_only | Smoke Truck (dice 0.50, word: truck) |
| Meat Point | listed_only | Meated (dice 0.46) |
| Miam Miam Bakes | listed_only | Cambs Luxury Bakes (dice 0.50, word: bakes) *(excluded)* |
| Monster Munchies | listed_only | — |
| Morty's Focacceria | listed_only | — |
| Prad Thai | listed_only | Aroy D Thai (dice 0.53, word: thai) |
| Redhead's Mac 'N' Cheese | listed_only | Mac Street Kitchen (dice 0.39, word: mac) |
| Rice Kitchen | listed_only | The Forge Kitchen (dice 0.61, word: kitchen) |
| Saf's Kitchen | listed_only | Sanjeev's Kitchen (dice 0.67, word: kitchen) |
| Skipper's Scran Van | listed_only | — |
| Smoked Tamago | listed_only | Smoke Truck (dice 0.40) |
| Snackwallah | listed_only | Black Wagon Bagels (dice 0.42) |
| Sole Luna | listed_only | — |
| Spudalicious | listed_only | Spud & Slice (dice 0.53) |
| TEXBBQZ | listed_only | Meated (dice 0.43) |
| The Big Blu | listed_only | Big Bite Kebab (dice 0.44, word: big) |
| The Bucket List | listed_only | The Tapas Truck (dice 0.50, word: the) |
| The Funky Pickle Co | listed_only | — |
| The House of Dough | listed_only | — |
| The Koalaty Bakery Co. | listed_only | The Kentucky Cookout (dice 0.41, word: the) *(excluded)* |
| The Pizza Rocket | listed_only | The Pizza Pod (dice 0.61, word: the/pizza) *(excluded)* |
| The Shack Street Food | listed_only | The Foodie Shack (dice 0.67, word: the/shack) |
| The Tuskers | listed_only | Askers Pizza (dice 0.42) *(excluded)* |
| The Yeerologist | listed_only | — |
| Toni's Souvlaki & Gyros | listed_only | Gyros Square (dice 0.37, word: gyros) *(excluded)* |
| Warwick Bridge Corn Mill | listed_only | — |
| Yum & Bass | listed_only | — |

Tell me which to create (and which are aliases of existing rows, e.g. Eat Is Greek). **I will create none until you do.**

---

## PAGE CHANGES DONE NOW (items 1, 2, 5) — `app/admin/outreach/page.tsx`

1. **"WA (scraped)" → "WhatsApp".** Header renamed; the cell now shows a green **✓ only when the scraped hint is `advertises`**, blank otherwise (the former `mobile, not advertised` amber pill no longer renders). Its sort is now binary — ticked first, everything blank pinned last (nulls-last, both directions) — matching what the eye sees. Read-only; the derivation still comes from the shared `lib/whatsapp-hint.ts`, unchanged.
2. **"WA (I confirmed)" column hidden.** Removed from the column list and the row. **`whatsapp_number` and `whatsapp_confirmed` are untouched** — the type field, the inline editor in the row detail (input, "use phone", the "WhatsApp confirmed" checkbox) and every stored value remain. Only the top-level column is gone.
3. **Excluded filter + toggle removed (item 5).** The `showExcluded` state, its checkbox, and the client-side `filter` are gone; **all 176 rows always show.** Excluded status is now a **plain read-only "excluded" chip** on the row (with a title explaining it gates the public site and is read-only here); the whole-row dimming was dropped so excluded rows read normally. **`discovery_trucks.excluded` is not written** anywhere on this page.
4. `colSpan` on the empty-state and detail rows updated (9 → 10) to match the new column count.

The POST/GET route (`app/api/admin/outreach/route.ts`) needed **no change** — it already returns all 176 rows (no server-side excluded filter) and already supplies `whatsappHint`.

---

## DEFERRED — the two HU columns on the page (with the schema)

The brief's "two Hatches Up columns replacing the single tickbox … both sortable, nulls last" **depends on the migration + backfill**, which are approval-gated. So in this pass the existing single **"Hatches Up"** checkbox column is **left as-is**; I did **not** build the `hu_map`/`hu_ordering` columns, because the data does not exist yet. On your approval of the migration and backfill, they'll be added as two independent, sortable (nulls-last, per the existing `sortValue`/`compareBySort`) columns and the single tickbox retired. Flagging this as sequencing, not a contradiction — the schema is explicitly gated, so the columns must follow it.

---

## FLAGS
- **No garbled text** in the prompt.
- **No instruction-vs-instruction contradiction** requiring a stop. The only tension — "do the HU columns now" vs "the schema is approval-gated" — resolves by sequence (columns follow the approved schema), noted above rather than chosen silently.
- **The migration and the backfill were NOT run. No `discovery_trucks` row was created. No row in either table was written in this pass.**
- **Verification limit restated:** no admin session (four prior failures still hold); the page is **not** confirmed working against live data — only that it compiles and the code reads correctly.

*Part B, 2026-09-03. Schema + backfill proposed and awaiting approval; page items 1/2/5 applied to code only.*
