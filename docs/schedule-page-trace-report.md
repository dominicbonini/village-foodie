# Which page is the schedule?

**WHICH OF THE THREE I PERFORMED: A PARSE AND AN EXECUTION.** No typecheck — **nothing was changed, so
there was nothing to typecheck.** Every claim below is either quoted from a file with its line number,
or observed by **loading the page in a real browser** (Puppeteer, 420 × 900, against the running dev
server on the hatchgrab host) and reading what rendered.

🔴 **NOTHING WAS CHANGED. This report is the only file written.**
**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

---

## 1. `/trucks/<slug>` — the discovery profile

**The whole implementation is `app/trucks/[slug]/page.tsx` (79 lines, metadata only) plus
`app/trucks/[slug]/TruckClient.tsx` (346 lines).**

### It is fed by DISCOVERY data, not by the operator's own events

```
hooks/useVillageData.ts:34        fetch(`/api/discovery/events?t=${Date.now()}`, …)
TruckClient.tsx:45               const truck = allTrucks.find(t => t.cleanKey === slug);
TruckClient.tsx:60               return mapEvents.filter(event => createSlug(event.truckName) === slug);
TruckClient.tsx:301              <TruckListCard key={event.id} event={event} slug={slug} />
```

**So yes — when it has data, it is a schedule**: a list of `TruckListCard`s, one per upcoming event,
plus a `MapView` (`:326`). But the data comes from `/api/discovery/events`, and the truck is matched by
**`cleanKey`** while its events are matched by **`createSlug(event.truckName)`**.

### 🔴 THE NINE CHROME ELEMENTS — THE MANUAL'S CLAIM STILL HOLDS, OBSERVED

Loaded on `hatchgrab.localhost` and inspected in the DOM:

| Chrome element | Guarded by `isHatchGrab()`? | Present on HatchGrab? |
|---|---|---|
| Village Foodie logo, `TruckClient.tsx:122-128` | **no** | 🔴 **yes** |
| `<Footer>`, `TruckClient.tsx:344` | **no** | 🔴 **yes** |
| Inline newsletter capture ("Get Weekly Schedule 🍕") | **no** | 🔴 **yes** |
| Footer newsletter ("…sent to your inbox every week") | **no** | 🔴 **yes** |
| `/hire` link | **no** | 🔴 **yes** |
| `/contact?topic=General Enquiry` · `Add Business` · `Report Issue` | **no** | 🔴 **yes (3–5 links)** |
| `/trucks` truck-directory link | **no** | 🔴 **yes** |
| Vendor disclaimer (`components/Footer.tsx:55`) | **no** | 🔴 **yes** |

**Observed body text, verbatim:** *"…Get Weekly Schedule 🍕 Never miss a slice 🍕 Get the village food
schedule sent to your inbox every week. Get the Schedule No Spam (but maybe Pepperoni). Unsubscribe
Anytime. CONTACT US & SERVICES Hire a Food Truck | General Enquiry | Add my Business | Report Issue |
Truck D…"*

⚠️ **ONE CORRECTION TO THE MANUAL.** It records `isHatchGrab()` at **three** sites in the render path.
**There are two** — `TruckClient.tsx:67` and `:236`; the third mention at `:64` is a comment, and `:14`
is the import. The substance is unaffected: both remaining sites only *remove* Village Foodie
affordances. **The nine-of-twelve claim is confirmed; the count of three is now two.**

### 🔴 AND FOR THIS TRUCK IT SHOWED NO SCHEDULE AT ALL

```
/trucks/thai-kitchen   → 🤷 "Truck not found"
/trucks/test-kitchen   → "Test Kitchen … 😔 No upcoming events found"
```

**Both return HTTP 200** — the not-found states are client-rendered inside a 200, so status codes tell
you nothing here.

**Why:** the truck is linked in `discovery_trucks` (as *"Test Kitchen"*, `show_on_hg: true`), so the
profile finds it by `cleanKey`. But its events carry `truckName` = **"Thai Kitchen"**, and the event
filter is `createSlug(event.truckName) === slug` → `thai-kitchen !== test-kitchen` → **zero events.**
🔴 **The truck was renamed and its own profile page stopped showing its events.** The page still finds
the truck; it just cannot find its schedule.

⚠️ **Also observed:** the tab title is `Food Truck | Village Foodie | HatchGrab`, and the manual records
`generateMetadata` as hardcoded to Village Foodie with a `villagefoodie.co.uk` canonical.

---

## 2. `/trucks/<slug>/order` — the menu, the ordering flow, **and a schedule**

`app/trucks/[slug]/order/page.tsx`, 4,182 lines. **It is both, and which one you get depends on the
query string.**

**With `?event_id=…`** — scoped to one event: a single `TruckListCard` header with the CTA hidden, then
deals, then the menu, then the basket (`:2481-2494`).

**With NO `event_id`** — 🔴 **it renders an event chooser, and the code calls it a schedule:**

```
:2497   // No event selected → the ORDER-ENTRY SCHEDULE: pick a confirmed event. The SAME
:2498   // TruckListCard as the truck profile; its Pre-order / Order now CTA deep-links to
:2499   // ?event_id=<truck_events.id>. Only confirmed/open events are returned by /api/events.
:2501   <p …>Choose which event to order for</p>
:2508   <TruckListCard event={eventToVillage(e, truckName)} slug={slug} forceOrderButton />
```

**Its data is the operator's own**, not discovery: `:900  fetch(\`/api/events?truck=${slug}\`)`, which
resolves `.from('trucks').eq('slug', truckSlug)` and reads `truck_events`
(`app/api/events/route.ts:41,43,70`).

### Chrome: almost none

Observed in the DOM: **the Village Foodie logo only** (`:4116`, comment *"Left — Village Foodie logo,
always visible"*). **No footer, no newsletter, no `/hire`, no `/trucks` link, no contact links, no
vendor disclaimer.**

**Observed body text:** *"Thai Kitchen ← Back Order from Thai Kitchen Mon 31 Aug 12:00 – 17:30
Nethergate Brewery & Distillery CO10 9HN MENU ⓘ Allergen Info STARTERS MAINS SIDES DESSERTS…"* — 🔴
**the truck's real name, a real event with date, time and venue, and the live menu.**

---

## 3. WHAT THE QR CODE ENCODES

```
app/manage/[token]/page.tsx:8830-8831   const orderUrl = truck.slug ? orderPageUrl(truck.slug) : …
                             :8847      🔴 THE URL IS `orderUrl` IN EVERY CASE
                             :8856      generateQRCodePNG({ url: orderUrl, … })
```

**`https://www.hatchgrab.com/trucks/<trucks.slug>/order`** — **the order page, with no `event_id`.**

**After the redirect:** `app/trucks/[slug]/order/layout.tsx:96` sends the customer to
`https://<their custom domain>/` when all five conditions hold; otherwise no redirect and the order
page serves. ⚠️ **The known cycle applies** — the custom-domain page's Order button points back at this
same guarded path, so a scan on a live confirmed domain returns to the schedule it came from. Recorded
in §46 of the manual; unchanged and out of scope here.

**So a scan lands on the order-entry schedule** — "Choose which event to order for" — not on a menu,
because the QR carries no `event_id`.

---

## 4. FROM THE PROFILE TO ORDERING — the link, quoted

`components/TruckListCard.tsx:192-194`:

```tsx
{!hideOrderButton && (forceOrderButton || ((assumeHatchGrab || isHatchGrab()) ? event.orderLinkHg : event.orderLinkVf)) && event.source === 'operator' && (
    <a
        href={`${orderOrigin ?? ''}/trucks/${slug}/order?event_id=${event.id}`}
```

**Per event, deep-linked with `event_id`.** It renders only when the event is `source === 'operator'`
and the order flag is on — so on a discovery-only event there is **no route from the profile to
ordering at all.**

⚠️ **And it goes the other way too:** the order page's *"Change event"* (`:2491`) links back to
`/trucks/${slug}`, treating the profile as the chooser — which is why the empty profile in §1 matters.

---

## 5. 🔴 THE ONE URL TO GIVE AN OPERATOR

# `https://www.hatchgrab.com/trucks/<trucks.slug>/order`

**Not the profile. Four reasons, all from what the pages actually render:**

1. 🔴 **IT SHOWS THEIR REAL EVENTS.** It reads `/api/events?truck=<slug>` → `trucks.slug` →
   `truck_events`. **The profile reads discovery data and, for this truck, showed "No upcoming events
   found" while the order page showed the event.** A page that can silently show nothing is not the one
   to name.
2. 🔴 **THE PROFILE MATCHES EVENTS BY THE NAME-DERIVED SLUG**, so a rename detaches a truck from its own
   schedule — observed. The order page matches by the `trucks.slug` **column**, which does not move.
3. **IT IS ALREADY THE ADDRESS ON THEIR QR CODE**, so naming it means one address everywhere rather than
   two.
4. **IT CARRIES ALMOST NO VILLAGE FOODIE CHROME** — one logo, versus a competitor-truck directory link,
   two newsletter captures, four contact links and a vendor disclaimer on the profile. **Sending an
   operator's customers to a page that advertises other trucks is a poor answer to "where can they see
   my schedule?"**

⚠️ **THE HONEST CAVEAT, AND IT IS THE ONE THING TO WEIGH:** the order page's schedule is framed as
*"Choose which event to order for"* — **it is an ordering funnel that happens to list the dates**, not a
page titled "our schedule". If the wording needs a page that *reads* as a schedule, **nothing on
hatchgrab.com is that today** — the chrome-free schedule the custom domain serves is the closest, and
it only exists once an operator has set one up. 🔴 **Which is, for the turn-off confirmation, exactly
the point: the order page is what carries on working, and it does list their dates.**

⚠️ **AND USE THE `trucks.slug` COLUMN, NOT THE NAME.** `/trucks/thai-kitchen/order` and
`/trucks/test-kitchen/order` both returned 200, but the two slug spaces are different and only the
column value is what `/api/events` matches. The manage page already builds it correctly from
`truck.slug`.

---

## 6. WHAT REMAINS UNOBSERVED

1. ⚠️ **ONE TRUCK, ON A DEV DATABASE.** The empty profile in §1 is a real observation of a real
   mismatch, **but I have not checked whether Pizzeria Gusto's profile shows its schedule.** All four
   trucks are linked in `discovery_trucks`; whether their names still agree with their discovery names
   I did not check, and that is the thing that decides it.
2. ⚠️ **THE REDIRECT WAS NOT EXERCISED.** The test truck's `custom_domain_last_ok_at` is null, so the
   five conditions do not hold and no redirect fired during these loads. §3's redirect behaviour is
   read from source.
3. ⚠️ **Village Foodie's own host was not loaded.** Everything above is `hatchgrab.localhost`.
4. ⚠️ **`generateMetadata`'s Google-Sheets source was not exercised** — the tab title was observed, its
   data path was not.
5. **The `isHatchGrab()` server/client asymmetry** — it returns false on the server, so the first
   painted frame shows the Village Foodie branch — **was read from source, not watched in a browser.**
