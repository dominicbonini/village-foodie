# The untrusted-URL sweep — Part A, census only

**Nothing was changed.** No code, no schema, no migration, no database write. This is the sweep §35 and
§53.8 record as OUTSTANDING, run for the first time. **It stops at the census, as instructed.**

Data re-derived against the live database on **12 September 2026**. No SQL was produced by this task, so
there is none to post.

---

## 🔴 THE HEADLINE, BEFORE THE DETAIL

**Ten navigation sinks are fed by scraper-written, anon-readable URL columns. Two go through the hardened
`safeHref`. Five have no guard at all, and four of those five are on PUBLIC pages.**

But the risk is not the one §35 describes, and the difference matters:

- 🧪 **React 19.2.3 blocks `javascript:` URLs itself**, at every sink, guarded or not — proven by
  execution, including case, leading-space and embedded-tab obfuscations. **The `javascript:` hole §35
  was written about is currently closed by the framework, not by the code.**
- 🧪 **`data:` and `vbscript:` are NOT blocked** by React and pass through verbatim.
- 🧪 **The live, present-tense defect is the scheme-less relative link**, and there is exactly **one**
  such value in any column that reaches an `href`.

**A defence that comes from a dependency version is not a fixed bug.** A React downgrade, or any render
path that is not React, restores it — and I checked for the second case: there is none today.

---

## A1 · THE CENSUS — every column-to-sink path

**The chain, for all the public hits:** `discovery_trucks` / `venues`
→ `app/api/discovery/events/route.ts` (maps `order_url` → `orderUrl`, `menu_url` → `menuUrl`,
`website` → `websiteUrl`, `venues.website` → `venueWebsite`, in both the event mapper and the
`allTrucks` mapper) → `hooks/useVillageData.ts` (browser `fetch('/api/discovery/events')`, no auth)
→ the public pages below.

| # | file · symbol | column | surface | guard |
|---|---|---|---|---|
| 1 | `components/EventListCard.tsx` — the "Website"/order button | `discovery_trucks.order_url` | 🔴 **PUBLIC** | ❌ **none** |
| 2 | `components/EventListCard.tsx` — the "Menu" button | `discovery_trucks.menu_url` | 🔴 **PUBLIC** | ❌ **none** |
| 3 | `app/trucks/[slug]/TruckClient.tsx` — the order CTA | `discovery_trucks.order_url` | 🔴 **PUBLIC** | ❌ **none** |
| 4 | `app/trucks/[slug]/TruckClient.tsx` — the menu button | `discovery_trucks.menu_url` | 🔴 **PUBLIC** | ❌ **none** |
| 5 | `app/admin/page.tsx` — the truck editor's schedule link | `discovery_trucks.schedule_url` | admin | ❌ **none** |
| 6 | `components/EventListCard.tsx` — the truck-name website link | `discovery_trucks.website` | 🔴 **PUBLIC** | ⚠️ inline `startsWith('http')` prefix |
| 7 | `app/trucks/[slug]/TruckClient.tsx` — the website link | `discovery_trucks.website` | 🔴 **PUBLIC** | ⚠️ `hrefFromStoredUrl` |
| 8 | `app/venues/[slug]/VenueClient.tsx` — the venue website button | `venues.website` | 🔴 **PUBLIC** | ⚠️ `hrefFromStoredUrl` |
| 9 | `components/admin/OutreachPanel.tsx` — the prospect modal's Website link | `discovery_trucks.website` | admin | ✅ **`safeHref`** |
| 10 | `components/admin/OutreachPanel.tsx` — the prospect modal's Schedule link | `discovery_trucks.schedule_url` | admin | ✅ **`safeHref`** |

**7 of the 10 are public.** §35 anticipated this correctly: an admin `javascript:` link is a self-inflicted
click, and the same value on the Village Foodie map is a different problem.

### What the census did NOT find, stated so the absence is not mistaken for an unrun check

- 🧪 **`logo_url` and `photo_url` never reach a navigation sink** — grep exit **1**. They reach
  `<img src>` only, through `formatImageUrl` (`lib/image-utils.ts`), which passes an `http`-prefixed or
  `/`-prefixed value through unchanged and otherwise prefixes a folder. **This is why the 185
  root-relative values in A3 are not findings.**
- 🧪 **`discovery_run_log.url` is never rendered as a link** — grep exit **1**, despite holding the
  worst-looking values in the database.
- 🧪 **No non-React HTML path embeds any of these columns in an `href`** — grep exit **1**, with a
  control pattern through the identical pipeline returning exit **0** and 2 lines. So no email template,
  no Apps Script string and no server-built markup bypasses React's protection.
- `components/dashboard/DemoWelcome.tsx` takes an `orderUrl` prop, which is **not** one of these columns:
  it is `customerOrderUrl`, built internally from the truck's slug in `app/dashboard/[token]/page.tsx`.
  Checked and excluded.

## A2 · WHICH GO THROUGH THE HARDENED GUARD

**2 of 10.** The count is the claim; "all call sites are guarded" would have been false.

| guard | sinks | what it actually does |
|---|---|---|
| ✅ `safeHref` (`components/admin/OutreachPanel.tsx`) | 2 | **An http(s)-only allow-list.** Refuses a leading `/` outright, parses the value, and returns it **only** if the protocol is `http:` or `https:`; otherwise retries it once with an `https://` prefix under the same test. Hardened as §35 describes. **It is not exported and is used by no other file.** |
| ⚠️ `hrefFromStoredUrl` (`lib/url-normalise.ts`) | 2 | `value.startsWith('http') ? value : 'https://' + value`. 🔴 **This is not a security guard and its own source says so** — it is documented as deliberately byte-identical to two older inline copies, with a stricter regex explicitly considered and rejected because changing it would alter a customer-facing link. |
| ⚠️ inline prefix (`EventListCard`) | 1 | The same expression again, written out by hand — a third copy of the thing `hrefFromStoredUrl` was created to replace. |
| ❌ none | 5 | The stored string reaches `href` unchanged. |

**What the weak guard does and does not do.** Prefixing `https://` onto `javascript:alert(1)` yields
`https://javascript:alert(1)`, which fails to parse as a URL and is inert — so those three sinks are
accidentally non-exploitable rather than defended. They still produce a **broken link** where the
hardened guard would render **no link**, and they pass any value beginning `http` through untouched.

## A3 · THE LIVE DATA

🧪 **1,446 populated values across the 10 URL columns. 195 are not a plain absolute http(s) URL.** The
breakdown is the point, because 185 of the 195 are by design:

| table.column | populated | not plain http(s) | what they are |
|---|---|---|---|
| `discovery_trucks.order_url` | 62 | **0** | — |
| `discovery_trucks.menu_url` | 103 | **0** | — |
| `discovery_trucks.schedule_url` | 26 | **0** | — |
| `discovery_trucks.website` | 102 | **1** | 🔴 `shikashack.co.uk` — **Shika Shack**, scheme-less |
| `discovery_trucks.logo_url` | 154 | 109 | `/logos/…` root-relative — **by design, `<img src>` only** |
| `discovery_trucks.photo_url` | 88 | 76 | `/photos/…` root-relative — **by design, `<img src>` only** |
| `venues.website` | 258 | **0** | — |
| `venues.schedule_url` | 7 | **0** | — |
| `venues.photo_url` | 298 | **0** | — |
| `discovery_run_log.url` | 348 | 9 | 3 × `shikashack.co.uk`, **6 × `about:blank`** — never linked |

🔴 **In every column that actually reaches an `href`, exactly ONE value is not a plain absolute http(s)
URL:** `discovery_trucks.website = "shikashack.co.uk"`, on **Shika Shack**. This confirms §35's "1 of
102" exactly, and it is the one that renders as a relative link — on the admin page it is now caught by
`safeHref`, but the **same value reaches the public truck page and the public event card**, where the
guard is the weak prefix rather than the allow-list. There it produces a working link, by accident of the
prefix rather than by design.

**`about:blank` is in the database.** Six run-log rows record it as the scraped URL. Nothing links it
today, which is the only reason it is not on the list above.

**Free-text carriers:** `discovery_events.source` and `ai_notes` hold an http(s) URL on **518 of 933
rows** and a non-http scheme on **0**. Neither is rendered as a link today.

**No malicious value exists in the database right now.** The exposure is that nothing stops one being
written: every one of these columns is populated by the scraper from pages we do not control.

## A4 · RANKED BY EXPOSURE

| rank | sink | why here |
|---|---|---|
| **1** | `EventListCard` — order button ← `order_url` | **Public, unguarded, and the most-rendered component in the product** — the home map, the map popups and every venue page. A value here is seen by customers, not staff. |
| **2** | `EventListCard` — menu button ← `menu_url` | Public, unguarded, same component. 103 populated values, the largest unguarded-and-public column. |
| **3** | `TruckClient` — order CTA ← `order_url` | Public, unguarded, and it is the page's primary call to action. |
| **4** | `TruckClient` — menu button ← `menu_url` | Public, unguarded. |
| **5** | `EventListCard` — website link ← `website` | Public, weak guard. 🔴 **Holds the one live non-conforming value.** |
| **6** | `TruckClient` — website link ← `website` | Public, weak guard, same value. |
| **7** | `VenueClient` — venue website ← `venues.website` | Public, weak guard. 258 values, all clean today. |
| **8** | `app/admin/page.tsx` — schedule link ← `schedule_url` | **Admin, unguarded.** A self-inflicted click, and the same column is guarded two components away — the inconsistency is the finding. |
| 9–10 | `OutreachPanel` — website, schedule ← both columns | ✅ Already hardened. Listed for completeness. |

---

## PROOF THAT THE SWEEP CAN FAIL

A grep that errors and a grep that finds nothing print the same nothing, so both directions were run:

| control | expected | actual |
|---|---|---|
| `safeHref` across `app lib components scripts supabase` | must match | **exit 0** |
| `zzz_no_such_symbol_zzz`, same paths | must not match | **exit 1** |
| non-React `href` + these columns | claim is "none" | **exit 1, 0 lines** |
| same pipeline, pattern `hatchgrab` | must match | **exit 0, 2 lines** |

⚠️ One of these caught a real error mid-sweep: a `grep … | grep … | head` reported exit 0 while the
search had matched nothing, because the status came from `head`. It was re-run writing to a file so the
status was grep's own. **That is the failure mode this section exists to prevent, and it happened.**

**The React behaviour was executed, not recalled** — `react-dom/server` 19.2.3 rendering an `<a>` for
each input:

```
"javascript:alert(1)"        → href="javascript:throw new Error('React has blocked a javascript: URL…')"
"JaVaScRiPt:alert(1)"        → blocked
" javascript:alert(1)"       → blocked
"java\tscript:alert(1)"      → blocked
"data:text/html,<script>…"   → PASSED THROUGH VERBATIM
"vbscript:msgbox(1)"         → PASSED THROUGH VERBATIM
"shikashack.co.uk"           → PASSED THROUGH (relative link)
```

---

## TWO MANUAL CLAIMS CHECKED AGAINST THE CODE

1. **§35: "The hardened form is an http(s)-only allow-list that rejects every other scheme and refuses
   relative paths outright."** ✅ **True**, and `safeHref` does exactly that. ⚠️ **But §35 reads as
   though the class were half-fixed; it is fixed at 2 sites of 10**, and the other 8 were never touched.
2. **§53.8 item 10: "Two days of work are UNCOMMITTED."** ❌ **No longer true.** 🧪 `git log` shows the
   gate and the landing work committed in `7a9b823`, and `main` is level with `origin/main` — so the
   ingest route and the gate **are deployed**. That raises the exposure of everything above rather than
   lowering it, because the scraper now writes these columns through a live path.

## WHAT I DID NOT DO

No fix, no code change, no data change. **The sweep stops here, as instructed.** The fix is not uniform
across the ten sinks — the four unguarded public ones want the allow-list, while the three weak-guarded
ones sit behind a helper whose own source forbids tightening it without a deliberate decision about
customer-facing links — and that decision is yours to make before anything is edited.
