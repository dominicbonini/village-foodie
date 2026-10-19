# US dress rehearsal, stage 2 — walking the hidden US twin (test-truck-us) on localhost

19 October 2026, against the running dev server at `http://hatchgrab.localhost:3000`, which Dominic started.

**The customer side of a US truck works end to end.** Every check I could drive passed:
- the order page, menu, basket, checkout and overnight event;
- five pay-at-truck orders with correct order rows;
- confirmation, manage-my-order and customer self-cancel;
- the KDS, the printed ticket and four rendered emails;
- the embed's data.

**Three issues, none US-only and none blocking the US.** These, plus a slightly mislabelled summary line (finding 4):
1. A newly signed-up truck in any country gets **"Truck not found"** on `/trucks/[slug]`.
2. A non-GB truck can never get a public truck page, even with a discovery row.
3. The KDS start banner says **"Today ·"** for an event on any date.

**No US-only wording or format bug was found**, so **no code was changed** this stage. tsc, the sweep and next build
weren't needed. The stage-1 work stands: tsc clean, sweep 132 / 132, next build still for Dominic to run.

**Rules held:**
- All orders were pay at the truck: no card, no Stripe call, and the Payments tab was never opened.
- Pizza Kitchen and Pizzeria Gusto were not opened.
- Nothing was deployed, pushed or committed. No `.env*` file was touched.
- Database: read-only queries only. Two SQL blocks are NOT RUN, for Dominic.

**The prompt.** It arrived intact apart from one unfilled placeholder, "[YOUR EMAIL]", which I flagged; Dominic
answered dominicbonini@hotmail.com. Nothing contradicted.

## What I drove (Playwright / WebKit)

| # | Check | Width | Result |
|---|---|---|---|
| 1 | Order page: event chooser | 390, 1280 | **PASS.** "Sun, Oct 25 · 11:30 AM – 8:00 PM · Pier A Park · Hoboken · 07030"; "Mon, Oct 26 · 8:00 PM – 12:30 AM"; "Pre-order"; no sideways scroll |
| 2 | Order page: menu | 390, 768 | **PASS.** Prices in $ ("$13.00"); "Vegetarian" / "Dairy free" tags; no errors |
| 3 | Order page: allergens | 390, 768 | **PASS (by configuration).** The twin is in **card** mode (copied from Pizza Kitchen), so "ⓘ Allergen info" shows the copied free text "Test allergens", not per-dish names. The stored US labels (Milk, Wheat, Fish, Tree nuts; stage-1 SQL) show only in per-dish mode, which Dominic can switch in Manage › Menu |
| 4 | Basket footer | 390, 768 | **PASS.** "Menu prices don't include sales tax. It's added below."; expanded: Subtotal $23.50, Sales tax 6.625% $1.56, Total $25.06; **no tip or service-fee line** (pay at truck) |
| 5 | Checkout sheet | 390, 768 | **PASS.** "PICKUP TIME", "⚡ ASAP — Around 11:30 AM", 12-hour times 11:30 AM …; Email required ("confirmation sent here"); phone example "(201) 555-0123"; Total + "Place order" in the sticky footer; "Pay at the truck at pickup · No card details needed" |
| 6 | Five pay-at-truck orders ("US Test", (201) 555-0142, dominicbonini@hotmail.com) | 390 | **PASS.** #1 12:45 PM (3 items, $25.06), #2 ASAP, #3 1:00 PM, #4 1:15 PM, #5 6:30 PM. All auto-accepted; exactly one POST each, no Stripe request (blocked in the run as a safeguard) |
| 7 | Confirmation page | 390 | **PASS.** "Order #1", "Pickup time: 12:45 PM", "See you at the window!", Subtotal / Sales tax 6.625% / Total, "Payment: Pay at the truck", "Confirmation sent to dominicbonini@hotmail.com" |
| 8 | Manage my order (#1) | 360, 390 | **PASS.** Pickup row: "12:45 PM" and "Pier A Park" on their own lines, right-aligned; Sales tax line; "Cancellations accepted up to 30 minutes before pickup"; no sideways scroll |
| 9 | Customer self-cancel (#2) | 390 | **PASS.** Confirm dialog "Are you sure you want to cancel this order?" → "Order canceled" (US spelling); `POST /api/orders/cancel` 200. See finding 5 for a small wording point |
| 10 | Order rows (MCP) | — | **PASS.** See the query below |
| 11 | Overnight event (visible side) | 390 | **PASS.** Header "Mon, Oct 26 · 8:00 PM – 12:30 AM"; ASAP "Around 8:00 PM"; 19 pickup times 8:00 PM … 11:45 PM, 12:00 AM, 12:15 AM, 12:30 AM. "Ends the next day" is a Manage pill shown only while an event is unconfirmed; the twin's events are confirmed, so it correctly doesn't show |
| 12 | KDS `/kds/<token>` (no sign-in needed) | 810, 1280 | **PASS on US formats.** "📍 Pier A Park — Hoboken · 11:30 AM–8:00 PM", "📅 Sunday, October 25th", "Not started", "Queue clear"; no errors. **Finding 3** (the "Today ·" banner). Opening it sends the KDS's normal heartbeat, which updates only the twin's van |
| 13 | Printed ticket, order #1 (real row → real builders) | 58 / 80 mm | **PASS.** "PICKUP 12:45 PM", $ rows, "Sales tax 6.625% $1.56", "TOTAL / TO PAY $25.06", "printed 10:00 AM"; **0 no-break-space and 0 non-ASCII bytes** (fix 1's fold holds on a real order) |
| 14 | Rendered emails, order #1 (not sent; recorder stands in for Brevo) | 600 | **PASS.** See the list after this table |
| 15 | Schedule embed | — | **PASS (data).** There is no `/embed/<slug>` page (404); the embed renders only behind a truck's custom domain (`app/domain/page.tsx`), which the twin doesn't have. Its data endpoint `/api/embed/events?slug=test-kitchen-us` returns both events with `time` = en-US / 12h / mdy / Sunday / America/New_York. The card that renders it is the one proven in rows 1 and 11 |
| 16 | Public truck page `/trucks/test-kitchen-us` | 390, 1280 | **"Truck not found."** Expected while hidden, but see findings 1–2. Re-check after the un-hide SQL: **pending** |

**Row 14 — the four rendered emails:**
- **Confirmation:** "Order #1 confirmed"; "Pickup time: 12:45 PM"; "See you at the window!"; $ totals with "Sales tax
  6.625%"; "Pay at the truck at pickup"; "Need to cancel? … up to 30 minutes".
- **Ready:** "Order #1 is ready — Pizza Kitchen US"; "ready for pickup … Pay at the truck".
- **Cancel:** "Your order has been canceled — Pizza Kitchen US".
- **Reject:** "Order #1 update"; "unable to fulfill order #1. You have not been charged …".
- All have no sideways scroll.

**Screenshots** are in `docs/us-dress-rehearsal/` (gitignored): `order-*`, `manage-my-order-*`, `kds-*`, `overnight-*`,
`email-o1-*` (PNG + HTML), `ticket-o1-*mm.txt`, `public-truck-page-*`, `embed-*`.

## Findings

| # | Severity | Surface | What | Countries | Proposed fix (not built) |
|---|---|---|---|---|---|
| 1 | **BROKEN** (latent) | `/trucks/[slug]` | A **newly signed-up truck gets "Truck not found"**, even once an admin makes it public. Signup creates no `discovery_trucks` row, and the page takes its truck only from the discovery list (`TruckClient.tsx:80`, `:332`). Today all 6 operator trucks without a discovery row are hidden, so nothing live is affected yet. It hits the first self-serve truck to go public | **every country** | When there is no discovery row, build `truckInfo` from the operator truck itself (name, logo, contact, cuisine; `page.tsx` already reads the `trucks` row by slug), or have go-live create the discovery row |
| 2 | **BROKEN** (US) | `/trucks/[slug]` | **A non-GB truck can never get a public truck page.** `/api/discovery/events` builds its `trucks` list with `.eq('country', 'GB')` on every host (`route.ts:155-159`), so even a US discovery row is dropped | every non-GB country | Apply the GB pin only on the Village Foodie host. On HatchGrab, list the operator's own truck (finding 1's fix covers it) |
| 3 | **WRONG** | KDS start banner | Says **"Today · {range}"** for the next event **whatever its date**. The twin's event is a week away and the banner reads "Today · 11:30 AM – 8:00 PM", with a "Start event" button that would open it early. `app/dashboard/[token]/kds/page.tsx:2728`, message `banner.today` | **GB and US** | Say "Today ·" only when `event_date` is the truck's today; otherwise "{date} · {range}" (e.g. "Sun, Oct 25 · 11:30 AM – 8:00 PM"), via a new message `banner.onDate` with en-GB words and an en-US override if it differs. Consider hiding or confirming "Start event" for a future date |
| 4 | UGLY | Dashboard order card (from code) | A pay-at-truck US order has only a tax line, so the card's summary button reads **"Tax & fees ▾ $1.56"** for tax alone (choice 6's rule is tip / no tip) | US | Name the parts present ("Sales tax", "Tax & fees", "Tax, fees & tip"), or show a single line plainly. **Dominic to see on the dashboard** |
| 5 | UGLY | Order canceled page (customer) | A pay-at-truck order's cancel page says "If you paid by card, any refund is handled by Pizza Kitchen US directly …". It doesn't apply | GB and US | Show that sentence only when the order was paid by card |
| 6 | note | Confirmation email | The address line reads "📍 Pier A Park, Hoboken, 07030". It has no state because the event row has no state field (the US style is "Hoboken, NJ 07030") | US | Data: add the state to the event's town or address; code: a `zip_state` address line when a region is known |

**Not bugs (configuration or data):**
- The allergen card mode (row 3).
- UK spellings inside Pizza Kitchen's own **menu descriptions** ("flavours", "favourite") are the truck's own data,
  correctly not translated.

## Database reads (Supabase MCP, read-only)

1. **Twin settings at start:** US / USD / America/New_York / tax 6625 / tips on / fee 300 bps + 30¢ (on) / hidden,
   not excluded / trial to 2026-12-31 / preorders off / auto-accept on. US caps 400 bps + 50¢ (3d run). Events Oct 25
   (11:30–20:00) and Oct 26 (20:00–00:30), confirmed, auto-open off. 30 items, 5 categories, 1 van, 0 orders. New
   York time 2026-10-18 16:44.
2. **The twin's KDS and dashboard tokens** were read to open the KDS. They are deliberately not repeated here.
3. **Signup slug and discovery data:** `pizza-kitchen-us` is free. Discovery rows are all GB (267). Operator trucks
   (not demo) with no discovery row: 6, of which public on HatchGrab: 0.
4. **The twin's state before and after the orders:** `slug` still `test-kitchen-us`, `show_on_hg` false,
   `is_customer` false, 0 discovery rows. The un-hide SQL had not been run when this was written.
5. **Order rows:**

   | # | status | slot | food | tax | total | checks |
   |---|---|---|---:|---:|---:|---|
   | 1 | confirmed | 12:45 | 2350 | 156 | 2506 | all pass |
   | 2 | **cancelled** | 11:30 (ASAP) | 700 | 46 | 746 | all pass |
   | 3 | confirmed | 13:00 | 2000 | 133 | 2133 | all pass |
   | 4 | confirmed | 13:15 | 1200 | 80 | 1280 | all pass |
   | 5 | confirmed | 18:30 | 1450 | 96 | 1546 | all pass |

   "All pass" for every row means:
   - USD, country US, `tax_label` "Sales tax", tax not inclusive, `tax_rate_milli` 6625;
   - tax rounded once (`round(food × 6625 / 100000) = tax`) and food + tax = total;
   - the slot stored as `HH:MM`;
   - tip 0 and service fee 0 (pay at truck), `payment_status` unpaid;
   - name "US Test", phone "(201) 555-0142", the email as given, an event attached.
6. **Order #1's full row and its event:** customer email and phone left out, the event's private token left out.
   Used to render the ticket and emails.
7. **Twin display flags:** mode village, `show_paid_step` true, `takes_cash` false, plan trial, cancellation 30 min,
   contact by email.

## SQL for Dominic (also given in chat during the run)

**Make the twin look like a real signed-up US truck made public.** NOT RUN, "run now". It sets the flags admin
go-live sets (`PUBLIC_VISIBILITY`) and the slug signup would choose, `createSlug("Pizza Kitchen US")`. It creates no
discovery row, because signup creates none.
- Expect `/trucks/pizza-kitchen-us` to show "Truck not found" (findings 1–2), and the order page to move to
  `/trucks/pizza-kitchen-us/order`.
- While un-hidden, the twin's NJ events are in production's HatchGrab feed.

```sql
begin;
do $$ begin
  if not exists (select 1 from public.trucks where id = 'test-truck-us' and country = 'US' and slug = 'test-kitchen-us') then
    raise exception 'the twin is not as expected — nothing done';
  end if;
  if exists (select 1 from public.trucks where slug = 'pizza-kitchen-us') then
    raise exception 'slug pizza-kitchen-us is taken — nothing done';
  end if;
end $$;
update public.trucks
   set slug = 'pizza-kitchen-us',
       show_on_vf = false, show_on_hg = true, order_link_vf = false, order_link_hg = true,
       is_customer = true, excluded = false
 where id = 'test-truck-us';
commit;
select id, slug, name, country, active, show_on_vf, show_on_hg, order_link_hg, is_customer, excluded,
       (select count(*) from public.discovery_trucks where hatchgrab_truck_id = 'test-truck-us') as discovery_rows
  from public.trucks where id = 'test-truck-us';
```

**Re-hide.** NOT RUN, "run after stage 2".

```sql
begin;
update public.trucks
   set slug = 'test-kitchen-us', show_on_vf = false, show_on_hg = false, order_link_vf = false, order_link_hg = true,
       is_customer = false, excluded = false
 where id = 'test-truck-us' and slug = 'pizza-kitchen-us';
commit;
select id, slug, show_on_vf, show_on_hg, order_link_hg, is_customer, excluded from public.trucks where id = 'test-truck-us';
```

The twin's five orders stay in place; the stage-1 clean-up block removes them later.

## Dominic's checklist (signed in, Safari, `http://hatchgrab.localhost:3000`)

Open the twin from the 3b verify links: Manage and Dashboard.

**⛔ Throughout:**
- Do NOT press "Connect" or any Stripe button.
- No card payments.
- Don't touch Pizza Kitchen or Pizzeria Gusto.

**Manage**
1. **Opens on Billing without crashing:**
   - every plan price reads **"TBD"**;
   - the trial reads "ends **December 31, 2026**";
   - no "$null", "£" or "NaN".
2. **Menu:**
   - prices in $;
   - allergen wizard on the US 9 list; items show **Milk / Wheat / Fish / Tree nuts**;
   - optional: switch allergen display to per-dish and see the names on the order page.
3. **Schedule:**
   - two NJ events, 12-hour times: "11:30 AM–8:00 PM"; "8:00 PM–12:30 AM", with the overnight shown in Upcoming;
   - ZIP 07030;
   - on a phone (or narrow window), Add/Edit event's Start and End are **one select each showing the whole time**
     ("10:45 PM");
   - Add event offers the US address style (ZIP / state).
4. **Settings:**
   - Where you trade: **Hoboken, New Jersey**;
   - Van **"Truck 1"**;
   - pre-order deadline time in 12-hour;
   - the deadline row fits at phone width.
5. **Payments:**
   - "Tax, tips and fees": **Sales tax 6.625%**; tips **10 / 15 / 20 %**; service fee allowed **up to 4% + 50¢**;
   - **save a 3% + 30¢ fee**; it should be accepted;
   - card-fee lines hedged ("2.9% + 30¢");
   - **do NOT press Connect.**
6. **Reports, Team, Social posts:**
   - Reports in $ with mdy dates; the CSV header "Pickup time";
   - Team shows you as owner;
   - weekly post: "**Week of …**", Sunday-first week, 12-hour times;
   - a cancelled event reads "**CANCELED**".

**Dashboard** (needs sign-in; moved here from my list)

7. **Open the Oct 25 event** (Manage event ▾ / the event picker). Orders #1, #3, #4 and #5 are there; #2 is canceled.
   - The order card's summary line reads "**Tax & fees ▾ $1.56**" for tax alone (finding 4).
   - Times are 12-hour; row 1 doesn't clip.
8. **Actions:**
   - **#1:** Ready → Collected;
   - **#4:** Reject (the customer email goes to you);
   - **#5:** operator Cancel (customer email to you);
   - **#3:** leave.
9. **Capacity sidebar** (laptop width): "11:30 AM" times each on one line.
10. **Add order:**
    - pay at truck, 12-hour slot picker, ASAP "Around …";
    - "US Test"-style test data;
    - this is the sixth order, the maximum.
11. **Finish-time modal on the overnight event** (Oct 26): open "Change finish time" **only to look**. Next-day
    options read "12:15 AM (next day)"; the times are 12-hour. Change nothing.
12. **KDS from the dashboard:**
    - Cook view: full order numbers, time beside the name;
    - Full view: a smaller "Ready" badge above the total, **no tax lines**;
    - the start banner shows finding 3.
13. **Printed ticket preview:** "PICKUP 12:45 PM", $ rows, Sales tax row, "printed …".

**Afterwards**

14. Run the re-hide SQL above.
15. Run the stage-1 clean-up (3c) when you're done with the twin.

## Files

- **Created this stage:** `docs/us-dress-rehearsal/` (screenshots, rendered emails, ticket text; gitignored) and this
  report.
- **`.gitignore`:** gained `docs/us-dress-rehearsal/`.
- **No product, harness or message file changed.**
- **Scripts used** (scratchpad, not in the repo): `walk1`–`walk5`, `place`, `manage`, `render-o1`.
