# Why a live truck says "Truck not found"

**WHICH OF THE THREE I PERFORMED: A PARSE AND AN EXECUTION.** No typecheck — **nothing was changed, so
there was nothing to typecheck.** Every claim is quoted from a file with its line number, or measured
by **fetching the live `/api/discovery/events` payload on both hosts** and running the **real
`createSlug` from `lib/utils.ts`** over it, or by **read-only SQL**.

🔴 **NOTHING WAS CHANGED. This report is the only file written.**
**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

⚠️ **ONE CORRECTION TO MY OWN WORKING, MADE BEFORE IT REACHED YOU — §4.** A first pass reported **nine**
affected trucks. That was my own slug helper disagreeing with `createSlug`, not a real finding. **The
answer is one truck.**

---

## 1. HOW `trucks[]` IS BUILT

**Source: `discovery_trucks`, and nothing else.** `app/api/discovery/events/route.ts:96-100`:

```ts
supabase
  .from('discovery_trucks')
  .select(TR_SELECT)
  .eq(showCol, true)          // showCol = isHG ? 'show_on_hg' : 'show_on_vf'   (:76)
  .order('name'),
```

Then a second filter and the mapping, `:336-344`:

```ts
// ── Trucks list (discovery only) ─────────────────────────────
const trucks = trData
  .filter((t: any) =>
    !t.excluded &&
    t[showCol] === true
  )
  .map((t: any) => ({
    rawName: t.name,
    cleanKey: createSlug(t.name),
    …
```

**Two things exclude a row: `excluded === true`, or the per-site boolean being false.** The comment on
line 336 is the whole story — **"Trucks list (discovery only)"**. 🔴 **`trucks[]` never contains a
HatchGrab operator. It contains scraped discovery rows.**

Measured on the live feed:

```
  discovery_trucks where show_on_hg = true      : 136
  …and excluded = false                         : 120   ← what trucks[] contains
  …and excluded = true                          :  16   ← dropped by the filter
```

---

## 2. WHY GUSTO IS ABSENT WHILE ITS EVENTS ARE PRESENT

**The payload has two halves with two different sources.**

| Half | Source | Gusto? |
|---|---|---|
| `events[]` | `truck_events` joined to `trucks` (`:191`), merged at `:328` | ✅ **2 events, `source: 'operator'`** |
| `trucks[]` | `discovery_trucks` only (`:96`, `:336`) | 🔴 **absent** |

**Read-only SQL, `discovery_trucks`:**

```
  name              excluded  show_on_hg  show_on_vf
  Pizzeria Gusto    true      true        false        ← 🔴 excluded = true
  Real Thai Food    true      true        false
  Tikka Tonic       true      true        true
  Test Kitchen      false     true        false
```

🔴 **`excluded = true` IS WHY.** Line 339's `!t.excluded` drops it. **Its `show_on_hg` is true and its
name has not drifted — the row is suppressed on purpose.**

**And the code says why, `:113-114`:**

> *"Suppression is now AUTOMATIC via `excluded`: a graduated truck's scraped shadow is excluded=true, so
> the ordinary truck-level gate below drops all its events (no is_customer join, no hatchgrab_truck_id
> link)."*

**Gusto graduated from a scraped listing to a real customer.** Its scraped shadow was excluded so the
duplicate would stop appearing. **Its operator events then flow through the entirely separate path at
`:191-260`**, which gates on the *operator* row (`active`, `!excluded`, `show_on_hg`) — all of which
Gusto passes.

**So the two halves disagree by construction**, and `TruckClient.tsx:45` is where they meet:

```ts
const truck = allTrucks.find(t => t.cleanKey === slug);
```

No match → `truckInfo` undefined → `TruckClient.tsx:267-272` renders **"Truck not found"** — while
`truckEventsFlat` (`:60`) is holding that truck's two events from the same payload.

---

## 3. DATA GAP, DELIBERATE EXCLUSION, OR BUG?

🔴 **A BUG — and it is caused by a deliberate exclusion that is itself correct.**

- **The exclusion is deliberate and right.** Suppressing a graduated truck's scraped shadow is exactly
  what `:113` describes, and without it the truck would appear twice.
- **The bug is the profile page's assumption.** It takes truck IDENTITY from `trucks[]` — discovery
  only — while taking EVENTS from a merged array that includes operators. **An operator whose shadow is
  suppressed therefore has events but no identity.** Nothing anywhere reconstructs a `trucks[]` entry
  from `truck_events`.
- **It is not a data gap.** Every row is present and correctly flagged; the join is what is missing.

**What supports it:** the two sources at `:96` and `:191`, the "(discovery only)" comment at `:336`, the
suppression comment at `:113`, and the observed payload — 2 Gusto events beside 120 trucks, none of
them Gusto.

---

## 4. 🔴 WHICH TRUCKS ARE AFFECTED

**Computed by running the real `createSlug` over the live payload from both hosts.**

### "Truck not found" — has events, absent from `trucks[]`

| Host | Trucks | Which |
|---|---|---|
| **HatchGrab** | **1** | **Pizzeria Gusto** — 2 events, `source: operator` |
| **Village Foodie** | **1** | **Pizzeria Gusto** — the same 2 events |

**One truck, both hosts. Nobody else.**

⚠️ **MY FIRST PASS SAID NINE, AND IT WAS WRONG.** I had reimplemented the slug rule in the harness
instead of executing it. `createSlug` (`lib/utils.ts:177-186`) **strips apostrophes and expands `&` to
`and`** before hyphenating; mine hyphenated them. That produced eight false positives — Gino's Pizza,
Howe & Co, Louigi's Pizza, Marky D's, Marleys Pie & Mash, Pig-Casso's, Spud & Slice, The Noodle &
Dumpling Bar — **all of which resolve correctly.** Re-run against the real function, only Gusto remains.

### "No upcoming events found" — in `trucks[]`, no events under its slug

| Host | Trucks |
|---|---|
| **HatchGrab** | **120 — every single entry** |
| **Village Foodie** | **73 of 119** |

🔴 **ON THE HATCHGRAB HOST, `/trucks/<slug>` SHOWS A SCHEDULE FOR ZERO TRUCKS.** `:323`:

```ts
// TEMPORARY (trial): HatchGrab shows operator/approved events only; scraped discovery events are Village-Foodie-only.
const filteredDiscovery = isHG ? [] : (mappedDiscoveryEvents as any[]).filter(…)
```

**On HatchGrab every scraped event is dropped**, so `events[]` is operator events only — and the only
operator with events in the feed is Gusto, which is not in `trucks[]`. **Every one of the 120 profiles
is "No upcoming events found"; the one truck with events is "Truck not found".**

### Thai Kitchen — and it is **two** reasons, not the one you named

You attributed it to a name-derived slug that no longer equals the stored slug. **That is true and it is
the second reason. The first is that its events never reach the feed at all:**

```
  upcoming confirmed/open truck_events:
  truck             date        active  excluded  show_on_hg
  Pizzeria Gusto    2026-08-29  true    false     true         ← in the feed
  Thai Kitchen      2026-08-31  true    false     🔴 false      ← dropped at :256
  Apple Tester      ×6          true    🔴 true    false        ← dropped at :254
```

`:256` — `if (!truck[showCol]) return false`. **Thai Kitchen's `trucks.show_on_hg` is false**, so its
event is filtered out of `events[]` before any slug question arises.

**And even if it were true, the slug would still miss:** its discovery shadow is named *"Test Kitchen"*
→ `cleanKey = test-kitchen`, while its operator row is named *"Thai Kitchen"* → its events land under
`thai-kitchen`. **`/trucks/test-kitchen` finds the truck and no events; `/trucks/thai-kitchen` finds no
truck.** Both observed.

---

## 5. WHAT LINKS TO `/trucks/<slug>`

| Source | Line | Reaches Gusto? |
|---|---|---|
| **The `/trucks` directory** | `app/trucks/page.tsx:111` — `href={\`/trucks/${truck.cleanKey}\`}` | 🔴 **NO.** It renders from **the same `trucks[]`**, so Gusto is not listed. There is no link to click |
| **The order page's "Change event"** | `app/trucks/[slug]/order/page.tsx:2491` — `href={\`/trucks/${slug}\`}` | 🔴 **YES — and it lands on "Truck not found".** Shown when `events.length > 1`, which is exactly Gusto's case |
| 🔴 **The custom-domain lapsed-plan fallback** | `app/domain/page.tsx:161` — `href={\`${HATCHGRAB_URL}/trucks/${createSlug(truck.name)}\`}`, labelled **"View {truck.name}'s schedule"** | 🔴 **YES.** On the operator's **own domain**, if their plan lapses, the one link offered goes to a not-found page |
| The page's own OpenGraph `url` | `app/trucks/[slug]/page.tsx:61` | a canonical, not a click |
| Anything shared | a customer pasting the URL | 🔴 yes |

🔴 **THE `app/domain/page.tsx:161` ONE IS THE SHARPEST.** It is the lapsed-plan screen on the operator's
own custom domain — the moment their page stops serving its schedule, the single button we give their
customers points at "Truck not found". **And its own comment already flags the slug-space hazard**
(*"Two slug spaces, one URL shape"*) without knowing the identity half fails too.

⚠️ **A customer cannot reach this page by browsing.** Gusto is absent from `/trucks`, so the only routes
are "Change event", the lapsed-plan link, a shared URL, or a guess.

---

## 6. IS IT INDEXED?

**No.** `vercel.json:23-28`:

```json
{ "source": "/trucks/(.*)",
  "headers": [ { "key": "X-Robots-Tag", "value": "noindex, noarchive" } ] }
```

**Every `/trucks/*` URL is `noindex, noarchive` in production**, so search engines are not a route in
and the "Truck not found" page is not being cached by them.

⚠️ **Two caveats.** The header comes from `vercel.json`, which **does not apply under `next dev`** — I
could not observe it being served, only read the rule. And `generateMetadata` (`app/trucks/[slug]/page.tsx:55-66`)
sets **no** robots directive of its own and hardcodes `siteName: 'Village Foodie'` with a
`villagefoodie.co.uk` canonical — so the page-level metadata does not reinforce the header, and a
HatchGrab profile shared to WhatsApp still previews as Village Foodie.

---

## 7. WHAT REMAINS UNOBSERVED

1. ⚠️ **ONE DATABASE, ONE MOMENT.** The enumeration is today's live feed on a dev database. **Which
   trucks carry `excluded = true` is data, and it changes** — 16 rows do on HatchGrab today, and any of
   them becomes a "Truck not found" the moment it has an event in the feed.
2. ⚠️ **THE OTHER 15 EXCLUDED ROWS WERE NOT CHECKED INDIVIDUALLY.** They are invisible today only
   because they have no events reaching `events[]`. **Gusto is the first, not the only candidate.**
3. ⚠️ **`X-Robots-Tag` WAS NOT OBSERVED ON A RESPONSE** — read from `vercel.json`, which `next dev` does
   not apply. §6.
4. ⚠️ **I did not load `/trucks` in a browser** to confirm Gusto is absent from the rendered directory —
   that is inferred from it rendering `trucks[]`, which I did measure.
5. **Why Thai Kitchen's `show_on_hg` is false, and whether that is intended, I did not investigate** —
   it is a flag on the operator row, not something this trace explains.
6. **No fix is proposed here.** The obvious shapes — synthesising a `trucks[]` entry from the operator
   row, or having the profile fall back to the event's own truck fields — both have consequences for
   the Village Foodie side that this read did not examine.
