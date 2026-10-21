# directions-link-fix — the Google Maps directions link

**Date:** 21 October 2026 · **Branch:** `main`, uncommitted, on top of `fcde8b09` · nothing pushed or deployed · no
database changes.

**The prompt** arrived intact; nothing was garbled and nothing contradicted.

## Summary

- **The bug:** the event card's 📍 Directions link (on non-Apple devices) read
  `https://www.google.com/maps/dir/?api=1&destination=$?q=<address>`. Google read the destination as the text
  "$?q=Red Lion - Wickhambrook, CB8 8PD", so the stray "$?q=" went into the search.
- **The fix:** the card now builds Google's documented link, `https://www.google.com/maps/dir/?api=1&destination=<url-encoded>`:
  - **with coordinates:** the event's `lat,lng`, which drops the pin exactly where the truck is;
  - **without:** today's address text (venue, area, postcode), plus the country's short name ("UK", "US", "Ireland"),
    so a foreign town resolves;
  - **with neither:** "Event Location", the card's old fallback. The country alone is never sent, because that would
    route to the middle of the country.
- **The country:** the discovery feed now carries each event's country short name (`countryName`, from
  `country_settings.short_name`), so the card can append it.
- **No visible change:** the card's text, layout and the Apple Maps link are unchanged. A harness proves the card's
  HTML is identical apart from that one `href`.
- **Other links:** the only other maps link in the code is the Village Foodie venue page's `https://maps.google.com/?q=…`.
  It is a different, working search link, not the broken shape, so it's listed below and left alone.
- **Proof:**
  - new harness `directions-link` **23/23**;
  - tsc clean;
  - build passes;
  - **no new lint findings** (same counts as HEAD; the new file is clean);
  - full sweep 151/151;
  - two harnesses **re-pinned by name** for the feed's one new key.

## 1 · The change

| File | What |
|---|---|
| `lib/maps-links.ts` (new) | `directionsDestination()` and `googleDirectionsUrl()`: coordinates, else "address, country", else "Event Location". Coordinates of 0,0 count as missing (the card's own distance test treats them the same way) |
| `components/EventListCard.tsx:258` | The Google branch calls `googleDirectionsUrl({ lat: ev.venueLat, lng: ev.venueLong, query: addressQuery, countryName: ev.countryName })`. `addressQuery` is built exactly as before ("Venue - Village, Postcode"). The Apple branch is unchanged |
| `app/api/discovery/events/route.ts` | One cached read of the country rows (`listCountrySettingsCached`, 60 s cache, already used site-wide). Each event gains `countryName`: scraped rows take Village Foodie's country (they are read for GB only); operator events take their truck's country. If the read fails, the key is left out and the link still works |
| `types.ts` | `VillageEvent.countryName?: string` |

**Before → after** (the destination Google receives):

| Event | Before | After |
|---|---|---|
| GB, with coordinates (The Green, Wickhambrook) | `$?q=The Green - Wickhambrook, CB8 8XX` | `52.1801,0.5512` |
| GB scraped row, venue coordinates (Red Lion) | `$?q=Red Lion - Wickhambrook, CB8 8PD` | `52.18,0.55` |
| GB, no coordinates | `$?q=Red Lion - Wickhambrook, CB8 8PD` | `Red Lion - Wickhambrook, CB8 8PD, UK` |
| US, no coordinates | `$?q=Pier A Park - Hoboken, 07030` | `Pier A Park - Hoboken, 07030, US` |
| IE, no coordinates | `$?q=People's Park - Limerick, V94 X2Y3` | `People's Park - Limerick, V94 X2Y3, Ireland` |

**Full URL example:** `https://www.google.com/maps/dir/?api=1&destination=Pier%20A%20Park%20-%20Hoboken%2C%2007030%2C%20US`.

## 2 · Other maps and directions links in the code

All of `app/`, `components/`, `lib/`, `hooks/`, `scripts/` and `messages/` were searched for `google.com/maps`,
`maps.google`, `maps.apple.com`, `maps/dir`, `maps/search` and `goo.gl/maps`.

| Where | Link | Status |
|---|---|---|
| `components/EventListCard.tsx:258`, Google | `…/maps/dir/?api=1&destination=$?q=…` | **Fixed** (this report) |
| `components/EventListCard.tsx:258`, Apple | `http://maps.apple.com/?daddr=<address>&dirflg=d` | Works; **unchanged** as the brief asked. It could use the same coordinates rule later |
| `app/venues/[slug]/VenueClient.tsx:49` | `https://maps.google.com/?q=<venue, village, postcode>` | **A different shape, and it works** (Google's search link, not the broken one). Venue pages are Village Foodie's, so GB only. Left alone |
| `app/venues/[slug]/VenueClient.tsx:53` | `https://maps.apple.com/?daddr=…&dirflg=d` | Works; unchanged |
| `app/venues/[slug]/VenueClient.tsx:95`, `page.tsx:80` | `maps.googleapis.com` | Photo URLs, not links |

The harness also checks that no `destination=$?q=` exists in any of 775 source files, and that `lib/maps-links.ts` is
the only Google directions builder.

## 3 · Does the link open the right place?

**What a live check shows:** Google answers automated requests with its cookie-consent redirect
(`consent.google.com/ml?continue=…`, curl, 21 Oct), so I couldn't watch the map render. The redirect does carry each
URL's destination unchanged:
- new: `destination%3D52.1801%252C0.5512`;
- old: `destination%3D$?q%3DRed…`.

**What each link does, per Google's documented Maps URLs API**
(https://developers.google.com/maps/documentation/urls/get-started#directions-action):
- **`destination=52.1801,0.5512`:** opens directions to a pin at those exact coordinates, from the user's location
  (or a start box on desktop). On a phone it opens the Google Maps app if installed.
- **`destination=Pier A Park - Hoboken, 07030, US`:** Google searches that text with the country attached and routes
  to the first match, Pier A Park in Hoboken. Without "US" a GB user could get a UK "Hoboken" guess. The same goes for
  "…, Ireland".
- **The old link:** sent the literal text "$?q=Red Lion…", which Google tries to match as a place name. In practice
  that's a search for the right words with junk in front, not a reliable route.

**For you to try (10 seconds):** on your phone, open
`https://www.google.com/maps/dir/?api=1&destination=52.1801%2C0.5512`. It should show directions to a pin in
Wickhambrook.

## 4 · Proof

- **`scripts/directions-link.cjs`** (new, registered; 151 harnesses): **23/23**. It runs on fixtures: an in-memory
  database, no network.
  - **§1 the URL:**
    - GB with coordinates;
    - GB without;
    - US with and without;
    - IE;
    - no country;
    - no address;
    - 0,0.

    Each is parsed with `URL`: path `/maps/dir/`, `api=1`, and the `destination` exactly as expected.
  - **§2 the feed:** HatchGrab operator events GB "UK", US "US", IE "Ireland"; the Village Foodie feed (operator and
    scraped rows) all "UK", with no US or IE rows; coordinates still numbers; with no readable country rows, the feed
    still answers and leaves the key out.
  - **§3 the card:** `EventListCard` rendered for GB (operator and scraped), US and IE events:
    - the `href` is the new URL;
    - the same card built from the old line has the `$?q=` link;
    - **the rest of the HTML is identical**;
    - the Apple branch is unchanged.
  - **§4:** no other copy of the malformed link exists.
- **Re-pins**, each marked `⚠️ RE-PINNED (directions-link-fix, 21 October 2026)`. The feed's new `countryName` key is
  the only named difference, set aside in the comparison and required by its own check:
  - **`schedules-country-parity`:** "Village Foodie feed on {host}: identical" → identical apart from `countryName`,
    which must be "UK" on every event. 73/73.
  - **`us-rehearsal-fixes`:**
    - the VF byte-identity and the HatchGrab "BEFORE plus only truckSlug/region" checks also set aside `countryName`;
    - a new check requires VF events "UK", the US event "US" and GB events "UK";
    - 63/63.
- **tsc:** `npx tsc --noEmit` exit 0.
- **Lint** (ESLint error/warning counts, against the same files at HEAD):
  - `components/EventListCard.tsx`: 3/4, the same as HEAD;
  - `app/api/discovery/events/route.ts`: 18/0, the same;
  - `types.ts`: 0/0;
  - `lib/maps-links.ts`: 0/0 (new);
  - `scripts/directions-link.cjs`: only the `no-require-imports` rule every CommonJS harness trips.
- **Build:** `next build` exit 0, no errors.
- **Full sweep:** `node scripts/run-harnesses.cjs` → **151 run · 151 passed · 0 failed** (after the two re-pins; the run
  before them had exactly those two failing, on the new key only).

## 5 · Files

- **New:** `lib/maps-links.ts`, `scripts/directions-link.cjs`.
- **Changed:**
  - `components/EventListCard.tsx`
  - `app/api/discovery/events/route.ts`
  - `types.ts`
  - `scripts/harnesses.json` (+1)
  - `scripts/schedules-country-parity.cjs` and `scripts/us-rehearsal-fixes.cjs` (named re-pins)
- **Read-only SQL run** (to confirm the short names):
  ```sql
  select country_code, short_name, name from public.country_settings order by country_code;
  ```
  It returned AU "Australia", GB "UK", IE "Ireland", NZ "New Zealand", US "US".

## Undo (only if Dominic asks)

- `git checkout -- components/EventListCard.tsx types.ts app/api/discovery/events/route.ts
  scripts/schedules-country-parity.cjs scripts/us-rehearsal-fixes.cjs`. None of these had other uncommitted changes
  (checked with `git diff --stat`).
- Delete `lib/maps-links.ts` and `scripts/directions-link.cjs`.
- In `scripts/harnesses.json`, remove the `"directions-link.cjs"` line. Other workstreams' uncommitted lines are in
  that file, so don't check it out.
