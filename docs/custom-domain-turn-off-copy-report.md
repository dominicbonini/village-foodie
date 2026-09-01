# The turn-off wording, and the live description

**WHICH OF THE THREE I PERFORMED: ALL THREE — a PARSE, a TYPECHECK, and an EXECUTION.**
- **Parse** — every string, guard and line quoted here is read from a file on disk.
- **Typecheck** — `npx tsc --noEmit`, clean.
- **Execution** — **`/trucks/<slug>` was loaded in a real browser on the HatchGrab host for two trucks**,
  including Pizzeria Gusto, and its DOM inspected; the **live discovery feed was fetched and parsed**;
  the card was rendered in **nine states**; and the description's address was compared against the
  wizard's own `address` across six shapes of `trucks.website`.

**NO DEPLOY. NO MIGRATION. NO SQL. NO DOMAIN REMOVED FROM VERCEL.**
**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

# 🔴 ITEM 2 — I STOPPED. THE PAGE YOU NAMED IS WORSE THAN THE ONE IT REPLACES.

**You asked me to read `/trucks/<slug>` first and stop if it carries Village Foodie chrome. It does —
and it is worse than that.**

## It carries every piece of chrome you named, observed in the DOM

Loaded on `hatchgrab.localhost`, two trucks:

| | `/trucks/test-kitchen` | `/trucks/pizzeria-gusto` |
|---|---|---|
| Village Foodie logo | 🔴 **present** | 🔴 **present** |
| Newsletter capture | 🔴 **2 of them** | 🔴 **2 of them** |
| **`/trucks` — the directory of other trucks** | 🔴 **1 link** | 🔴 **2 links** |
| `/hire` | 🔴 present | 🔴 present |
| `/contact` links | 🔴 5 | 🔴 3 |
| Vendor disclaimer | 🔴 present | 🔴 present |
| Tab title | `Food Truck \| Village Foodie \| HatchGrab` | `Pizzeria Gusto \| Village Foodie \| HatchGrab` |

## 🔴 AND IT DOES NOT SHOW THE SCHEDULE. FOR GUSTO IT SAYS "TRUCK NOT FOUND".

```
/trucks/test-kitchen    → 😔 "No upcoming events found"
/trucks/pizzeria-gusto  → 🤷 "Truck not found  We couldn't find any details for this food truck."
```

**Pizzeria Gusto is the live trading truck. Its own page, on our own host, says it does not exist.**

**And I established exactly why**, from the feed the page itself fetches:

```
  /api/discovery/events  →  { events: 2, trucks: 120 }
  events[]  : truckName="Pizzeria Gusto" 29/08/2026 source=operator
              truckName="Pizzeria Gusto" 30/08/2026 source=operator
  trucks[]  : 120 cleanKeys — "pizzeria-gusto" is NOT among them
```

`TruckClient.tsx:45` does `allTrucks.find(t => t.cleanKey === slug)`. **`trucks[]` is the Village Foodie
discovery directory; a HatchGrab operator is not in it.** So `truckInfo` is undefined and the page
renders "Truck not found" — **while the very same payload carries two of that truck's events.**

## So the change you asked for would, today

1. send an operator's customers to a page **branded Village Foodie**, with
2. **a link to a directory of 120 competing trucks**, two newsletter sign-ups and a vendor disclaimer,
   and
3. for the live truck, **a "Truck not found" message instead of a schedule.**

🔴 **I HAVE LEFT THE PANEL NAMING `/trucks/<slug>/order`, UNCHANGED.** That page renders the operator's
real events from their own `truck_events`, carries one logo and nothing else, and is what the QR
encodes. It is not a perfect answer — it is framed *"Choose which event to order for"* — but it is the
only page on hatchgrab.com that actually shows an operator's schedule.

⚠️ **Your premise "the schedule is `/trucks/<slug>`" is correct as a description of intent and wrong as
a description of what renders.** If you want that page to be the fallback, the fix is upstream —
`/trucks/<slug>` needs to resolve HatchGrab operators and shed the discovery chrome — and that is a
feature, not a copy change.

**The QR reassurance was also left as it is**, because splitting it into its own line only makes sense
once the block above it changes.

---

# WHAT I DID BUILD — ITEMS 1, 3, 4 AND 5

## 1. The description changes once live

**Branched on `props.verifiedAt`** — the same condition the `Live` badge uses, so the badge and the
sentence cannot disagree about what "live" means.

| State | Description |
|---|---|
| not set up | `We create a page at events.yourtruck.com showing your schedule.` |
| mid-setup | `We create a page at events.testtruck.test showing your schedule.` |
| waiting | `We create a page at events.testtruck.test showing your schedule.` |
| **live** (4–9) | 🔴 **`events.testtruck.test is showing your schedule.`** |

✅ **THE ADDRESS IS UNCHANGED AND THERE IS NO SECOND NORMALISATION.** `cardAddress` is the same
expression, `domainFromWebsite` call sites in code are `2 → 2`, and the address still matches the
wizard's own `address` on all six shapes of `trucks.website`:

```
  https://www.thaikitchen.co.uk        → events.thaikitchen.co.uk  ✅
  https://thaikitchen.co.uk/menu       → events.thaikitchen.co.uk  ✅
  www.thaikitchen.co.uk                → events.thaikitchen.co.uk  ✅
  http://shop.thaikitchen.co.uk/x?y=1  → events.thaikitchen.co.uk  ✅
  thaikitchen.co.uk                    → events.thaikitchen.co.uk  ✅
  https://www.bbc.co.uk                → events.bbc.co.uk          ✅
```

## 3. The CNAME advice is reversed

**Before:** *"You can set it up again later. The line you added at your web address company can stay
where it is."*

**After:** *"If you are setting it up again later, leave the line you added at your web address company.
If you are not, ask them to remove it."*

🔴 **It does not promise what the address will show.** We remove the name from our hosting; their CNAME
is theirs and we never touch it, so it goes on pointing at a host that no longer recognises the name.
**What appears then has never been observed** — my own read says most likely the hosting provider's
error page under their brand. **So the copy says what to do, not what they will see**, and it names
both cases because keeping the line is right if they are coming back.

## 4. "Turn this off" is held until they answer

```
  props.verifiedAt && props.customDomain && !turnedOff && (confirmed || saidNo)
```

| State | `Turn this off` |
|---|---|
| 4 · live, **unanswered** | 🔵 **ABSENT** |
| 5 · after "No" | ✅ present |
| 6 · just pressed "Yes" | ✅ present |
| 7 · confirmed in an earlier session | ✅ present |

**Rendered controls, state 4:** `["Yes, it looks right", "No, there's a problem"]` — **two controls for
one question.** Previously three.

⚠️ **`confirmed` is seeded from `props.confirmedAt`**, so an operator returning to an already-confirmed
truck sees it immediately. **The hold is on the unanswered card, not on returning operators.**

## 5. The checker

**`110/111 pass`** — the one is the pre-existing `QR: print or display`. Two entries updated: the live
description (now a different sentence, not the same one with a different address) and the `reAdd`
line, generated from `TURN_OFF_COPY` so the corpus cannot drift.

---

## THE TURN-OFF PANEL AS IT NOW STANDS, IN FULL

```
Turn off your own web address?

This will stop working:
events.testtruck.test

This carries on exactly as it is, and is where your QR code sends people:
https://www.hatchgrab.com/trucks/test-kitchen/order        ← 🔴 UNCHANGED, see the stop above

If you are setting it up again later, leave the line you added at your web address company.
If you are not, ask them to remove it.                      ← 🔴 NEW

[ Keep it on ]   [ Turn it off ]
```

**And after a failed release**, unchanged: *"We could not switch that off just now. Nothing has changed
— your address is still working. Try again shortly."*

---

## WHAT IS UNCHANGED

| | |
|---|---|
| 🔴 `app/api/manage/route.ts` | ✅ **`cmp -s` BYTE-IDENTICAL — not opened at all** |
| The release-first ordering | ✅ release at 244 · failure return at 274 · the **only** `UPDATE` at 768 |
| The eight-column clear | ✅ one statement, all eight columns, verified by name |
| The QR redirect (`order/layout.tsx`) | ✅ **not opened** |
| `vercel.ts`, `dns.ts`, `apex.ts`, the cron sweep | ✅ **not opened** |
| The confirm block's Yes/No handlers, the address link, the mailto | ✅ untouched |

**Two files changed:** `components/dashboard/CustomDomainSetup.tsx` and `lib/custom-domain/copy.ts`,
plus the checker's corpus.

---

## WHAT REMAINS UNOBSERVED

1. 🔴 **WHY GUSTO IS ABSENT FROM `trucks[]` I DID NOT CHASE FURTHER.** I proved the mechanism —
   `cleanKey` has no match while the events are present — but not whether that is a data gap, a
   deliberate exclusion, or a bug in the discovery feed. **It is the thing to look at before anyone
   points customers at that page.**
2. 🔴 **NO BUTTON WAS PRESSED.** All nine card states were rendered by driving `useState`; the
   transitions were not walked.
3. 🔴 **`releaseDomain` HAS STILL NEVER BEEN CALLED.** The credentials are unset, so the success path
   of turning off remains untested — unchanged from the previous report.
4. ⚠️ **What the operator's address serves after turn-off is still unobserved.** The new copy is
   written to survive either answer.
5. ⚠️ **Only two trucks were loaded** on `/trucks/<slug>`, both on the dev database. The chrome finding
   is structural and holds for any truck; the "Truck not found" finding is specific to trucks missing
   from `trucks[]`.
