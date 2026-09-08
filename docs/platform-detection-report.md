# Determining the ordering platform for the 40 unknown prospects

**GARBLED SPANS: none. No instruction contradicted another.**

⚠️ **DIAGNOSIS ONLY. No file changed, no data written, no platform tag set, nothing deployed.** Every DB
touch was a read (service-role SELECT); the 36 website fetches were GET-only, landing-page-only, no forms,
no followed links. The only write is this report.

🟢 **My own count matches the manual's OBSERVED figures** (not re-derived — pulled the list to act on it):
**40** reachable trucks (not excluded, has `contact_email`, `order_url` IS NULL), **36** of them with a
`website`.

## The short answer

🔴 **The platform for the 40 cannot be determined from what already exists, and fetching their websites
resolves only 3 — none of them Hatches Up.** The blocker is the data itself: **23 of the 36 "websites" are
Facebook pages**, which block a plain fetch and would not carry an ordering link in any case. One tentative
lead survives in a retained on-disk snapshot (La Piazza). The realistic conclusion is that for the great
majority the platform is genuinely unknown, and the "website" field is a social page, not an ordering site.

---

## 1. Why `order_url` is NULL for two-thirds of the list

**Three writers, all in `scripts/`. The app never writes it** — `app/api/admin/route.ts:87` allow-lists
only `show_on_vf`/`show_on_hg`/`excluded`/`visibility`, so no admin action can set it.

| Writer | Source | Condition it writes | Leaves NULL when |
|---|---|---|---|
| `scripts/import-hatchesup-schedule.js:682` | Scrapes **hatchesup.co.uk** (the Hatches Up directory) | `if (menuInfo?.url)` — sets `order_url = menu_url` for a truck found on Hatches Up, once a working hatchesup/own-domain `order.` URL is found (`findWorkingUrl`, :118) | The truck is **not on Hatches Up**, or no URL resolved |
| `scripts/process-next-truck.js:116` | Reads `data/hatchesup-trucks.json` (a Hatches Up list) | `upsert({ order_url: basketUrl })` — a hatchesup basket URL | The truck is not in that Hatches Up JSON |
| `scripts/migrate-from-sheets.cjs:56` | One-time Google Sheet import | `order_url: r[3] || null` — copies sheet column 3 | That cell was blank |

🔴 **NULL MEANS "NOTHING HAS LOOKED", NOT "TAKES NO ONLINE ORDERS" — and the code cannot distinguish the
two.** Every writer is a **Hatches Up path** (two scrapers of the Hatches Up directory) or a **verbatim
copy of a hand-typed sheet cell**. There is **no writer that inspects a non-Hatches-Up truck's own site**,
and **no field that records "checked, found none"**. A null is pure absence of information: the truck was
never seen on Hatches Up and had no URL in the sheet. **The schema has no way to represent "confirmed no
online ordering", so the code genuinely cannot tell it apart from "unexamined".** This is confirmed below:
none of the 40 have any event sourced from Hatches Up — their events came from venue scrapers and manual
entry.

---

## 2. What the scraper already holds

**Columns read first, so a null result is absence-of-match, not absence-of-column.**

### `scraper_run_log` — counts only, no content, and it is the OPERATOR scraper
Columns (read from a live row): `id, truck_id, run_at, day_of_week, events_found, events_changed,
rule_used, notes`. **No HTML, no fetched page, no extracted links, no error text with URLs.**
**373 rows, 2026-06-11 → 2026-09-03** (it ran until today). `truck_id` references **`trucks`** (operator
trucks), not discovery — so it logs the operator schedule scraper, not the discovery/Hatches Up side.
🔎 Searched `notes` and `rule_used` for `hatchesup`: **0 matches.**

### Where `hatchesup` IS retained in the database — but not for the 40
Searched every free-text discovery column (ilike `%hatchesup%`):
`discovery_trucks.order_url` **58**, `.menu_url` **57**, `.schedule_url` **5**; `discovery_events.source`
many. 🔴 **But for the 40 unknowns specifically: `menu_url` 0, `schedule_url` 0, and 0 of their events are
sourced from hatchesup** (their 30 that have events came from `offthebeatentruck.co.uk`,
`nethergate.co.uk`, "Drive Screenshot", "Manual Entry"). **The retained hatchesup signal covers only the
trucks that already have `order_url`, never the unknowns.**

### 🔴 On-disk retained scrape output — `data/hatchesup-trucks.json` (the one real lead)
A committed snapshot, **generated 2026-06-05, processed 6–9 June**, of the Hatches Up directory
(`hatchesup.co.uk/find-food`): **36 trucks, every one with a `hatchesup.app` orderUrl.** This IS retained
scrape output with the signal in it. Cross-checked against the 40 unknown names: **exactly one matches** —
the unknown **"La Piazza"** against snapshot **"La Piazza Street Food"**,
`orderUrl: https://lapiazzastreetfood.hatchesup.app` (that entry errored `empty_page`, `menuChars:0`,
which is likely why `order_url` was never written to the DB).
⚠️ **This is a tentative NAME match, not a confirmed link** — the names differ and La Piazza's live site
(Facebook) was blocked, so I could not confirm it. **One possible Hatches Up truck hiding in the 40, to
verify by hand.**

**Finding, stated as instructed:** for 39 of the 40 this is **absence of any retained signal**, not
absence of Hatches Up membership; for the 40th (La Piazza) the retained June snapshot holds a tentative
lead. Nothing in the database resolves any of them.

---

## 3. Whether the signal is reachable from the stored website (before fetching)

**The only ordering-link extraction in the codebase is `scripts/import-hatchesup-schedule.js:465-482`.**
It runs `document.querySelectorAll('a[href]')` and **keeps only** hrefs containing `/basket`,
`.hatchesup.app`, or matching `//order.` — i.e. it looks for ordering links, but a **narrow, Hatches-Up-
shaped** set, and it runs against the **Hatches Up directory page, not a truck's own website.**
`lib/menu-extract.ts` extracts a **menu** (via Gemini) from supplied text/image; it does **not** look for
ordering links. **No existing module scans an arbitrary truck website for ordering-platform links.**

🟢 **An existing module COULD be pointed at these sites read-only:** `scripts/run-scraper.js` (Puppeteer,
JS-rendering, already used for the venue schedule scrapers with `scroll_lazy` strategies) is the read-only
fetcher, and the link-filter at `import-hatchesup-schedule.js:465` is the reusable extraction — but
nothing today combines "fetch a truck's own site" with "list all ordering hosts". Item 4 is that
combination, done once as a read.

---

## 4 & 5. The read: 36 websites fetched, and the result

Fetched each once, browser user-agent, **3.5s polite delay**, 15s timeout, landing page only, no forms, no
followed links. Ordering/booking hosts are reported **verbatim**; asset/social/CDN hosts (facebook, the
Squarespace CDN, fonts, analytics) are excluded as non-ordering but noted where a page was a Facebook page.

### Action counts
| Bucket | Count |
|---|---|
| 🔴 **Found Hatches Up** | **0** |
| **Found another platform** | **3** |
| **Reachable, no ordering link in landing HTML** | **9** |
| **Site unreachable / blocked** | **24** (23 Facebook pages → HTTP 400; 1 URL stored without a scheme → parse error) |
| Total | 36 |

🔴 **Zero of the 40 unknowns are on Hatches Up** by their live sites — consistent with §1/§2 (they were
never in the Hatches Up path). The 3 platforms found are all **non-Hatches-Up**:

| Truck | Ordering host found (verbatim) | What it is |
|---|---|---|
| Camp Out Takeaway | `www.anytimebooking.co.uk` | a booking platform |
| Papas Locas | `papas-locas-uk.square.site` | Square Online |
| Pig-Casso's | `order.pigcassoscatering.co.uk` | own-domain ordering |

### 🔴 The dominant finding: the website field is mostly Facebook
**23 of the 36 stored "websites" are `facebook.com` pages.** Facebook returns **HTTP 400 to a plain
fetch** (all 23 did), and a Facebook page does not expose an ordering link in static HTML regardless. So
for these 23 the method cannot determine a platform — **and neither would a hand visit, because there is no
site there, only a social page.** One more (Shika Shack) stored its URL as `shikashack.co.uk` **without a
scheme**, which failed to parse — a data-quality issue, not a dead site.

### Per-truck table
| Truck | Website | HTTP | Ordering-platform host(s) in links (verbatim) |
|---|---|---|---|
| A Taste of Jamrock | https://www.facebook.com/profile.php?id=6158 | 400 | — (blocked) |
| Aroy D Thai | https://www.facebook.com/AroyDThaiLtd | 400 | — (blocked) |
| Camp Out Takeaway | https://www.churchviewcampsite.co.uk/project | 200 | www.anytimebooking.co.uk |
| Curry Leaf Catering | https://www.facebook.com/Grandfeast2021 | 400 | — (blocked) |
| Dolly's Pizza Van | https://www.facebook.com/profile.php?id=1000 | 400 | — (blocked) |
| Drina Bakes | https://www.facebook.com/profile.php?id=1000 | 400 | — (blocked) |
| Gourmet Geezer | https://www.facebook.com/gourmetgeezer | 400 | — (blocked) |
| Greys Coffee | https://www.facebook.com/profile.php?id=6158 | 400 | — (blocked) |
| HKHitwrap | https://www.hitwrap.co.uk/ | 200 | — none |
| Hotaco | https://www.facebook.com/profile.php?id=6157 | 400 | — (blocked) |
| Jez Guyanese Cuisine | https://www.facebook.com/jezguyanesecuisine | 400 | — (blocked) |
| Kerief | https://www.facebook.com/keriefcateringmobil | 400 | — (blocked) |
| Kezmet Turkish Kitchen | https://www.facebook.com/profile.php?id=1000 | 400 | — (blocked) |
| La Piazza | https://www.facebook.com/Lapiazzacambridge | 400 | — (blocked) |
| Little Red | https://www.facebook.com/littleredeventcater | 400 | — (blocked) |
| Mac Street Kitchen | http://macstreetkitchen.com | 200 | — none |
| Manna Seoul | https://www.facebook.com/profile.php?id=6155 | 400 | — (blocked) |
| Marky D's | https://markyds.co.uk | 200 | — none |
| Marleys Pie & Mash | https://www.facebook.com/p/Marleys-Pie-Mash- | 400 | — (blocked) |
| My Kitchen Your Place | https://www.mykitchenyourplace.co.uk/foodtru | 200 | — none |
| No. 35 Cambridge | https://www.facebook.com/profile.php?id=1000 | 400 | — (blocked) |
| Papas Locas | https://www.papaslocas.co.uk/ | 200 | papas-locas-uk.square.site |
| Peck | https://whatthepeck.co.uk/ | 200 | — none |
| Pig-Casso's | https://www.pigcassoscatering.co.uk | 200 | order.pigcassoscatering.co.uk |
| PIzza on the Green | https://www.facebook.com/pizzaonthegreen/ | 400 | — (blocked) |
| Shika Shack | shikashack.co.uk | ERR (Failed to parse URL fr) | — (blocked) |
| Spud & Slice | https://www.facebook.com/profile.php?id=6158 | 400 | — (blocked) |
| Suffolk Pizza | https://suffolkpizzacompany.co.uk | 200 | — none |
| Suffolk Spice Fusion | https://www.facebook.com/profile.php?id=1000 | 400 | — (blocked) |
| Taqueria La Gringa | https://www.facebook.com/profile.php?id=6155 | 400 | — (blocked) |
| The Mobile Pizza Co | https://themobilepizzaco.co.uk/ | 200 | — none |
| The Noodle & Dumpling Bar | https://streetnoodlesanddumplings.co.uk/ | 200 | — none |
| The Tapas Truck | https://thetapastruck.co.uk | 200 | — none |
| Tibet Flavour | https://www.facebook.com/profile.php?id=1000 | 400 | — (blocked) |
| Wagyu Burgers | https://www.facebook.com/wagyuburgersandstre | 400 | — (blocked) |
| Wrapunzel | https://www.facebook.com/profile.php?id=1000 | 400 | — (blocked) |

⚠️ **Limits of this read, stated plainly:**
- **Landing page only, static HTML.** An ordering link behind JavaScript, in a menu sub-page, or in a
  cookie-walled region would not be seen. The 9 "no ordering link" are "none found in the landing HTML",
  not "confirmed no online ordering".
- **Facebook (23) is unreadable this way.** A JS-rendering fetch (`run-scraper.js`) might load them, but
  Facebook login walls and the absence of ordering links there make it low-yield.
- **An empty result is not proof of absence** — for the blocked 24 and the no-link 9, this read found no
  platform; it did not establish that none exists.

---

## Recommendation (you decide; nothing was written)

1. **Do not bulk-visit 40 sites by hand — visit ~12.** The 23 Facebook pages and the 1 unparseable URL
   won't yield a platform; the realistic hand-check set is the 12 non-Facebook sites, of which this read
   already resolved 3 and found no landing-page ordering link on 9.
2. **Confirm the one retained lead:** La Piazza ↔ "La Piazza Street Food" on Hatches Up (§2). If it is the
   same truck, that is a Hatches Up prospect currently mis-classified as unknown.
3. **The 3 found platforms** (AnyTimeBooking, Square Online, own-domain order) are yours to write or not —
   I wrote nothing.
4. 🔴 **The real fix is a schema one:** there is no field distinguishing "checked, no online ordering" from
   "never looked". Until there is, every null re-invites this same 40-site question. A "platform_checked_at"
   or an explicit `platform = 'none'` value would let a hand-check be recorded once.

**No file changed. No data written. No platform tag set. Nothing deployed.**
