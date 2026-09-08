# Hatches Up ↔ discovery_trucks reconciliation — PART A (report only, nothing written)

**Source list read:** `docs/hatchesup-online-ordering.csv` — **92 truck rows** (94 lines incl. header; 19 `uses`, 68 `listed_only`, 5 `unknown`). This is the Cursor-produced list, chosen because it is the widest capture and the only one carrying the per-truck online-ordering status. Companion files from the same capture: `docs/hatchesup-online-ordering.md`, `docs/trucklist.txt` (82 map names), `docs/hatchesup-events.csv` (326 events).

**Live DB read read-only via the service-role key. NO row was written, in either table.**

---

## 0. The two facts are genuinely different, and the DB confirms the manual's numbers

The live counts reconcile **exactly** with the V12.1 manual:

| discovery_trucks | live | manual V12.1 |
|---|---|---|
| rows | 176 | 176 |
| with `order_url` | 62 | 62 |
| `*.hatchesup.app` order_url | **58** | 58 |
| own-domain order_url | 4 | 4 |
| excluded | 56 | 56 |
| linked (`hatchgrab_truck_id`) | 4 | 4 |
| outreach_prospects rows | 176 | (one per truck) |
| prospects with `platform` set | 62 | (= the 62 order_urls) |
| prospects `platform` NULL | 114 | (114 null order_url) |

So `outreach_prospects.platform` is currently **exactly the order_url-derived tag** — 62 set (58 "Hatches Up" + 4 own-domain), 114 NULL. It carries the *map/ordering-page* fact, not the website's ✓ badge.

---

## 🔴 THE CONFLICT — what the 58 represent (evidence, not a decision)

**Headline:** the 58 `*.hatchesup.app` order_urls and the 19 ✓ "uses ordering" trucks are **not the same population and neither contains the other.** They are two different captures of two different facts, taken at different times and scopes.

**Overlap, measured three ways:**
- Of the **58** HU order_url rows: **29 appear on the new list, 29 do not.**
- Of the **19** ✓ ordering trucks: only **12** have any `order_url` in discovery (**10** of them `*.hatchesup.app`, 2 own-domain); **3** are matched discovery rows with **no order_url** (Perky Beans, Pigcassos, TIKKA TONIC); **4** are **not in discovery at all** (Barista Boy Coffee Co, Kerbside Kitchen, Saffron Fish Co, Spice & Rice).
- Of the **92** list rows: **37 match** a discovery row, **55 do not.**

**Does order_url mean map presence rather than ordering? — Strong yes.**
My capture established (separately) that **every truck plotted on the Hatches Up *map* carries a `/basket/new` order link**, whereas the website's **list view** shows a per-event **✓ / ✗ "Online orders"** badge, and only 19 trucks ever show ✓ in the 7-day window. `order_url` was backfilled from the map-style basket link, so it records **"a Hatches Up ordering page exists for this truck"** — i.e. platform/map presence — **not** "the truck is currently shown as taking online orders." A truck can have an order_url and still show ✗ every day this week.

**Do the 58 look stale? — Partly, but my list is not clean evidence of it.**
- The order_url **host form differs** from today's map links. Discovery holds the canonical `azahar.hatchesup.app`, `buffalojoes.hatchesup.app`, `nomadough.hatchesup.app`, `steakandhonour.hatchesup.app`; today's map serves white-label hosts for the same trucks (`order.azaharartisanspanishfood.com`, `vans.buffalojoes.co.uk`, `order.nomadough.co.uk`, `order.steakandhonour.co.uk`). Same trucks, **different URL scheme** → the order_url was captured in an **earlier, differently-shaped scrape.**
- **21 of the 29** HU-order_url rows absent from the new list are `excluded=True` — a wider/older catchment than my capture (many are clearly other regions).
- ⚠️ **Counter-caveat:** my list is a **partial capture** — one map viewport region, zoomed out ~4×, `when=7days` only. Absence from it is therefore **weak** evidence of staleness by itself; some of the 29 are simply outside the area/window I captured, not dead.

**Is the list a subset? — No; it is a partially-overlapping, differently-scoped capture.**
55 of 92 list rows are **new** (not in discovery) while 29 of 58 HU rows are **absent** from the list. Each side contains trucks the other lacks. It is an overlap of two snapshots, not a subset relationship.

**Net (for your decision, not resolved here):** `order_url`/`platform` = "has a Hatches Up ordering page — map/platform presence, from an earlier scrape." The list's 19 = "shows ✓ online-orders in this 7-day window — live ordering." Treating these as **two independent facts** is what Part B item 3's "HU map" vs "HU ordering" split would encode.

---

## a. List entries that MATCH an existing discovery_trucks row — **37**
(matched on normalised name OR `aliases`; split: 15 `uses`, 20 `listed_only`, 2 `unknown`)

| List truck | discovery_trucks.name | ordering | outreach_prospects.platform | excluded |
|---|---|---|---|:---:|
| Al Chile | Al Chile | listed_only | Hatches Up | yes |
| All Fired Up Pizza | All Fired Up Pizza | listed_only | Hatches Up | yes |
| Askers Pizza | Askers Pizza | listed_only | Hatches Up | yes |
| Azahar | Azahar | uses | Hatches Up | no |
| Between Buns Royston | Between Buns Royston | uses | Hatches Up | no |
| Bonnefirebox | Bonnefirebox | uses | Hatches Up | no |
| Buffalo Joe's | Buffalo Joe's | uses | Hatches Up | no |
| Charlie's Chippy | Charlie's Chippy | listed_only | Hatches Up | yes |
| Dirty Fryer Boys | Dirty Fryer Boys | listed_only | Hatches Up | yes |
| East Coast Pizza Company | East Coast Pizza Company | listed_only | Hatches Up | yes |
| Fully Loaded Fries | Fully Loaded Fries | listed_only | Hatches Up | yes |
| Gurkha Street Food | Gurkha Street Food | unknown | Hatches Up | yes |
| Kerief Catering Ltd | Kerief Catering Ltd | uses | Hatches Up | no |
| La Biga Pizzeria | La Biga Pizzeria | listed_only | Hatches Up | yes |
| Ling Ling's Steam Kitchen | Ling Ling's Steam Kitchen | listed_only | Hatches Up | yes |
| Maya Street Food | Maya Street Food | listed_only | Hatches Up | yes |
| My Thai Chef | My Thai Chef | listed_only | — (NULL) | no |
| Nomadough | Nomadough | uses | Hatches Up | no |
| Optio Pizza | Optio Pizza | uses | Hatches Up | yes |
| Ovencraft Pizza | Ovencraft Pizza | listed_only | Hatches Up | yes |
| Pecoro On The Road | Pecoro On The Road | unknown | Hatches Up | yes |
| Perky Beans | Perky Beans | uses | — (NULL) | no |
| Phil's Pizza | Phil's Pizza | listed_only | Hatches Up | yes |
| Pigcassos | Pig-Casso's | uses | — (NULL) | no |
| Pimp My Fish | Pimp My Fish | uses | order.pimp-my-fish.co.uk | no |
| Pizza Mondo | Pizza Mondo | uses | pizza-mondo.co.uk | no |
| Pizzeria Gusto | Pizzeria Gusto | listed_only | — (NULL) | yes |
| Savannah Smoke & Grill | Savannah Smoke Grill | listed_only | — (NULL) | no |
| Smother Spudders | Smother Spudders | listed_only | Hatches Up | no |
| Steak & Honour | Steak & Honour | uses | Hatches Up | no |
| Taste of Cambridge | Taste of Cambridge | listed_only | Hatches Up | yes |
| The Angry Seagull Fish + Chips | The Angry Seagull Fish + Chips | uses | Hatches Up | yes |
| The Pizza Pod | The Pizza Pod | listed_only | Hatches Up | yes |
| The Purple Pepper | The Purple Pepper | uses | Hatches Up | no |
| The Rub BBQ | The Rub BBQ | listed_only | Hatches Up | yes |
| TIKKA TONIC | Tikka Tonic | uses | — (NULL) | yes |
| Zaket Potato | Zaket Potato | listed_only | Hatches Up | no |

## b. List entries with NO match — would be NEW discovery rows — **55**
(4 `uses`, 48 `listed_only`, 3 `unknown`. The 4 `uses` are the ordering trucks entirely absent from discovery.)

| List truck | ordering |
|---|---|
| Barista Boy Coffee Co | uses |
| Kerbside Kitchen | uses |
| Saffron Fish Co | uses |
| Spice & Rice | uses |
| 3Bros Burgers | listed_only |
| A Good Egg | listed_only |
| Amen Catering | listed_only |
| BabTooma Express | listed_only |
| Beardus Burger | listed_only |
| Bien Manger Cornwall | listed_only |
| Broadside Pizza | listed_only |
| Build A Burga | listed_only |
| Cairo Van | listed_only |
| Carne Street Food | listed_only |
| Clumsies | listed_only |
| Crumbelievable | listed_only |
| Cult of Curry | unknown |
| Doodle Donuts | listed_only |
| Eat Is Greek | listed_only |
| El Dorado Taqueria | listed_only |
| Goldee's Bagels | listed_only |
| Green Choy | listed_only |
| Hot Bird | listed_only |
| India Express | listed_only |
| Kaya Thai Street Food | listed_only |
| Kushi London | listed_only |
| Mama Cook Truck | listed_only |
| Meat Point | listed_only |
| Miam Miam Bakes | listed_only |
| Monster Munchies | listed_only |
| Morty's Focacceria | listed_only |
| Pizza Lola | unknown |
| Prad Thai | listed_only |
| Redhead's Mac 'N' Cheese | listed_only |
| Rice Kitchen | listed_only |
| Saf's Kitchen | listed_only |
| Skipper's Scran Van | listed_only |
| Smoked Tamago | listed_only |
| Snackwallah | listed_only |
| Sole Luna | listed_only |
| Spudalicious | listed_only |
| TEXBBQZ | listed_only |
| The Big Blu | listed_only |
| The Bucket List | listed_only |
| The Funky Pickle Co | listed_only |
| The House of Dough | listed_only |
| The Koalaty Bakery Co. | listed_only |
| The Pizza Rocket | listed_only |
| The Shack Street Food | listed_only |
| The Tuskers | listed_only |
| The Yeerologist | listed_only |
| Toni's Souvlaki & Gyros | listed_only |
| Warwick Bridge Corn Mill | listed_only |
| Well Nice Food | unknown |
| Yum & Bass | listed_only |

## c. Existing rows with a Hatches Up `order_url` that are NOT on the list — **29**
(21 excluded, 8 not excluded. `Between Buns` here vs `Between Buns Royston` on the list are **different HU subdomains** — a likely alias/dup worth noting.)

| discovery_trucks.name | order_url host | excluded |
|---|---|:---:|
| Bad Boi Burritos | badboiburritos.hatchesup.app | yes |
| Boomting Pizza | boomtingpizza.hatchesup.app | yes |
| Cambridge Crepes | cambridgecrepes.hatchesup.app | yes |
| Chim Chim Thai | chimchimthai.hatchesup.app | yes |
| Churros Bar | churrosbar.hatchesup.app | yes |
| Hyderabadi Dhaba | hyderabadidhaba.hatchesup.app | yes |
| Il Peperone Piccante | ilpeperonepiccante.hatchesup.app | yes |
| Peaky Pizzas | peakypizzas.hatchesup.app | yes |
| Power Crust Pizza | powercrustpizza.hatchesup.app | yes |
| Rotisseroll | rotisseroll.hatchesup.app | yes |
| Saffron Hill Food | saffronhillfood.hatchesup.app | yes |
| Santinas Pizza | santinaspizza.hatchesup.app | yes |
| Smash and Grab | smashandgrab.hatchesup.app | yes |
| So Solid Sando | sosolidsando.hatchesup.app | yes |
| Taco Banditos | tacobanditos.hatchesup.app | yes |
| Tamashi Asian Soul Food | tamashiasiansoulfood.hatchesup.app | yes |
| The Bagel Queen | thebagelqueen.hatchesup.app | yes |
| The Kentucky Cookout | thekentuckycookout.hatchesup.app | yes |
| The Loaded Mac Shack | theloadedmacshack.hatchesup.app | yes |
| The Wood Oven | thewoodoven.hatchesup.app | yes |
| Yellow Door Eats | yellowdooreats.hatchesup.app | yes |
| BB Pizza | bbpizza.hatchesup.app | no |
| Between Buns | betweenbuns.hatchesup.app | no |
| Burger Art | burgerart.hatchesup.app | no |
| Elder Street Food | elderstreetfood.hatchesup.app | no |
| Holy Loaded | holyloaded.hatchesup.app | no |
| La Piazza Street Food | lapiazzastreetfood.hatchesup.app | no |
| MumTas | mumtas.hatchesup.app | no |
| Your Burger Zone | yourburgerzone.hatchesup.app | no |

## d. For every match, is outreach_prospects.platform set? — **31 set / 6 NULL** (0 missing prospect rows)
All 37 matched trucks already have a prospect row. Platform is set on 31 and NULL on 6:

- **Platform NULL, but list says `uses` (3):** Perky Beans, Pigcassos, TIKKA TONIC — matched discovery rows with **no order_url**, so the backfill left platform NULL, yet the website shows them taking online orders. These are the clearest cases where the order_url-derived platform tag **understates** reality.
- **Platform NULL, list says `listed_only` (3):** My Thai Chef, Pizzeria Gusto, Savannah Smoke & Grill. (Pizzeria Gusto is the owner's own truck.)

---

## Flags
- **No garbled text in the prompt.** No internal contradiction found in Part A's instructions, so nothing to stop on for Part A.
- **Part B not started** (per instruction). Note for when it begins: item 3's "HU map" vs "HU ordering" split maps directly onto the two facts separated above — order_url/platform = HU map presence; the list's ✓ badge = HU ordering. The migration-vs-alternative question in item 3, and the hide-vs-remove check in item 2, are held for your go-ahead.
- **Name-matching caveat:** matching is normalised-name + `aliases` only; a truck trading under a different name than its discovery `name`/alias would read as "no match" (potential false-new). The 55 "new" set should be eyeballed before any row is created in Part B.

*Written by the reconciliation pass, 2026-09-03. Read-only — no INSERT/UPDATE/DELETE ran.*
