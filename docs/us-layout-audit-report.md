# US layout audit: where longer US times, dates and extra tax/tip lines break the layout

16 October 2026. **Diagnosis only:** no product code was changed (`git diff --stat -- app components lib hooks messages proxy.ts next.config.ts public supabase` is empty). Everything was rendered from fixtures: Pizza Kitchen, GB and US versions of the same truck. There was no database, no network and no live truck, and Pizzeria Gusto was never rendered.

## Summary

**22 issues are caused by US formatting: 3 BROKEN, 19 UGLY.** Every other surface and size checked is FINE (about 70 entries, listed below).

| Group | BROKEN | UGLY | Contact sheets |
|---|---:|---:|---|
| A · Customer (order page, checkout, manage-my-order, public schedule, embed) | 0 | 7 | sheet-01 to sheet-04 |
| B · Truck ops (dashboard, KDS) | **2** | 5 | sheet-05, sheet-06 |
| C · Manage (Schedule, editor, settings, Payments, Billing) | **1** | 4 | sheet-07 to sheet-09 |
| D · Printed tickets, emails, social posts, plans PDF | 0 | 3 | sheet-10 to sheet-12 |

**The three BROKEN issues:**
- **C-03 · Manage › Add/Edit event on a phone (390).** The hour boxes cut off AM/PM entirely. "10:45 PM" shows as "10 : 45", and an event ending at 12:30 AM reads as **"12 : 30"**, i.e. noon. Every event a US truck adds or edits on a phone is affected.
- **B-06 · KDS Cook ticket.** The order number, the thing a cook calls out, is squeezed to **"#…"** or "#12…", because the wider time won't shrink.
- **B-01 · Dashboard order card on a portrait tablet.** The "15m late" pill is cut off on late orders once order numbers reach 4 digits.

**Most of the UGLY issues have three causes:**
1. **A time range breaks inside a time.** This leaves "PM" alone on a line, or splits "11:30 / AM–" (A-02, C-01, C-02, C-04, C-05).
2. **Fixed-width time columns sized for "11:50"** (B-03, B-04, B-05, D-20 to D-22).
3. **Four extra US total lines** (subtotal, sales tax, service fee, tip). Each fits on one line, but together they grow the basket, the checkout sheet, the dashboard cards and the KDS tickets (A-04, A-05, B-07).

**Seven bugs found along the way that aren't layout** (details under "Not layout"):
- the public truck page and the embed show **UK formats for a US truck**;
- the dashboard's Completed list and the finish-time modal show 24-hour times to US trucks;
- an event that runs past midnight is mishandled in 3 places, in both countries;
- the Import review time boxes are empty in both countries.

## How it was done

**Fixtures.** Pizza Kitchen's menu in two versions, at the same local moment, **Wednesday 30 September 2026, 11:50**:
- **GB:** GBP, en-GB, Europe/London, 24-hour, prices include VAT, no tips.
- **US:** USD, en-US, America/New_York, 12-hour, mdy dates, **sales tax 8.875% exclusive, tip 20%, online service fee 3% + $0.30**.

**Worst-case values:**
- pickup 12:45 / 12:45 PM;
- window 11:30–22:45 / 11:30 AM – 10:45 PM;
- an event spanning midnight, 20:00–00:30 / 8:00 PM – 12:30 AM;
- "Wednesday 30 September" / "Wednesday, September 30";
- 4-digit totals and order numbers;
- a 6-item basket with modifiers and instructions.

**Method.**
- **Screens:** the real pages and components, rendered by the repo's render kit (state-patched, Supabase stubbed) or bundled for the browser with fetch answered from fixtures. Painted in WebKit with the app's compiled CSS and fonts, and **measured** in the browser: overflow px, line counts, element heights GB vs US.
- **Tickets:** the real ESC/POS bytes, decoded and counted per printed row.
- **Social posts:** the real poster renderer, with its font-fitting recorded.
- **Emails:** the real template builders, called without sending, painted at 375 and 600.

**Sizes:**
- customer pages: 360, 390 and 768;
- dashboard and KDS: 810×1080, 1180×820, 800×1280 and 1280×800;
- Manage: those four plus 390×844;
- tickets: 32 and 48 columns;
- emails: 375 and 600;
- social posts: 1080×1080, 1080×1350 and 1080×1920;
- plans PDF: A4 and Letter.

**Files:**
- **Shared brief:** `scripts/us-layout-audit/BRIEF.md`.
- **Scripts and findings JSON:** `scripts/us-layout-audit/<group>/`. Re-runnable; not in the harness sweep.
- **Screenshot pairs:** `docs/us-layout-audit/<group>/`, 42 MB in all.
- **Contact sheets:** `docs/us-layout-audit/sheet-NN-*.png`, each under 1 MB.

## Issues, most severe first

**Severity key:**
- **BROKEN:** unreadable, hidden or overlapping;
- **UGLY:** wraps or misaligns but stays readable.

Each issue's GB/US pair is under `docs/us-layout-audit/<group>/`, and it is boxed and labelled on the sheet named.

### BROKEN

| # | Surface · size | What happens (measured) | How often | Fix direction | Sheet |
|---|---|---|---|---|---|
| **C-03** | Manage › Schedule › Add/Edit event (and Approve → Edit) › Start/End **hour boxes** · 390 | **Clipped.** Each box leaves 16 px for its label. "11 AM" needs 43 px, "10 PM" 45, "8 PM" 38, "12 AM" 45, so 22–29 px is cut and AM/PM disappears. 8:00 PM – 12:30 AM reads "8 \| : 00" – "12 : 30". GB loses 3 px. Fits from 800 up (43 px box). | Every event a US truck adds or edits on a phone | One 12-hour select per time ("10:45 PM"), or an AM/PM toggle beside the minutes, or stack Start and End on separate rows on phones | 08 |
| **B-06** | KDS › **Cook** ticket header (order number · status · time · countdown) · 1280, 810, 800 (1180 for Ready) | **Truncated order number.** The time group never shrinks, so the number pays: a Ready ticket reads **"#…"** (GB "#1…"). Shown/needed: 46/91 px at 1280 (GB 71), 58 at 810 (GB 84), 55 at 800 (GB 80). A late ticket at 1280 reads "#12…" (GB in full; 0.2 px short, so a sub-pixel case). With 2-digit numbers US still cuts "#35" at 800 and 1280; GB never does. | Every Cook-mode board: Ready tickets always | The order number never shrinks (the time does), or drop the space before AM/PM, or move the time to row 2 as Full mode does | 06 |
| **B-01** | Dashboard › Orders › order card row 1, **late** order · 810, 800 | **Clipped.** "#1234 · 11:35 AM [15m late]" is 28 px too wide at 810 (31 at 800), and the card cuts 12–15 px off the pill ("15m lat"). GB fits. Fits at 1180/1280. With 2-digit numbers it only spills 2–5 px into the padding. | Every late order on a portrait tablet once order numbers reach 4 digits (or 3 digits with ≥100m late) | Drop the space before AM/PM on the card, a one-size-smaller time on row 1, or move the late pill to row 2 | 05 |

### UGLY

| # | Surface · size | What happens (measured) | How often | Fix direction | Sheet |
|---|---|---|---|---|---|
| **B-07** | Dashboard order card and KDS Full ticket › tax / fee / tip lines · all four sizes | **Grows.** +78 px per order (+96 with a card fee): card 331 → 409 px, KDS Full ticket 301 → 379. Tickets fully on screen: KDS grid 800×1280 **6 → 3**; KDS list at 1180/1280 2 → 1; dashboard 810 4 → 1. Each line itself fits. Cook mode doesn't grow. | Every US order, every board | KDS: one line "Tax, fees & tip $x.xx" or none (the kitchen doesn't need the split); dashboard: a one-line summary that expands | 06 |
| **B-03** | Dashboard › Kitchen capacity **sidebar** · 1180, 1280 | **Wraps.** A fixed 40 px time column, so every "11:50 AM" takes 2 lines (16 → 32 px). Rows visible drop **22 → 13** (−41%). | Always, for every US truck on iPad landscape or a laptop | A wider time column (≈64 px), or drop the space before AM/PM | 05 |
| **B-05** | KDS › Full ticket row 2 (name · time · countdown) · all four sizes | **Truncates the customer name.** The wider time takes 18–25 px from the name: "Daniel Fitzgerald" → "Daniel Fitzg…" (810: 111 → 90 of 111 px). | Every ticket whose name is longer than ~10–12 characters | Drop the space before PM, give the name its own line, or move the time up to row 1 | 06 |
| **A-04** | Order page › **sticky basket footer** · 360 (also 390, 768) | **Grows, with no height cap.** Collapsed 125 → 150 px; expanded 570 → 683 px = **85% of a 360×800 screen** (GB 71%), leaving ~117 px of menu. It adds the "prices don't include sales tax" line plus Subtotal, Sales tax, Service fee and Tip. | Every US basket (expanded when opened) | Cap the expanded breakdown as the checkout sheet does, or fold tax, fee and tip into one expandable row | 02 |
| **A-05** | Order page › **checkout sheet** · 360 (also 390, 768) | **Grows.** Content 1,254 → 1,556 px. "Place order" moves from 372 to **768 px** of scrolling. Tip buttons are tight but not clipped ("$203.95" is 49 px in 46–48 px of space). | Every US card order | Start the sheet's basket summary collapsed when a totals box shows, or pin Total and "Place order" in a sticky sheet footer | 02 |
| **A-02** | Order page › event header (compact card), event **not yet live** · 360, 390, 768 | **Wraps.** Every realistic US range (115–126 px) is wider than the fixed 112 px column. GB is 82–87 px. "5:00 PM – 9:00 PM" leaves "PM" alone. The card grows 51 → 59 px. | Practically every US pre-order | Widen the column to ~130 px, or drop ":00" ("5 PM – 9 PM"), or keep each time whole (break only after the dash) | 01 |
| **C-01** | Manage › Schedule › event cards · 390 | **Wraps.** Four action icons leave the details 96–103 px. "11:30 AM–10:45 PM · Big van" takes 3 lines and leaves "van" alone (GB 2). Without a van, 2 lines vs GB 1. The card grows 144 → 164 px. One line from 800 up. | Every US event card, every time Schedule opens on a phone | Put the time range on its own full-width line (or the icons in a row under the card on phones), keep each time whole, and put the van on its own line | 07 |
| **C-02** | Manage › Schedule › "Needs confirmation" card (5 icons) · 390 | **Wraps inside a time.** A 68 px column: "11:30 / AM– / 10:45 PM / · Van 1" splits the start from its AM. 3 → 4 lines; card +20 px. | Every operator-added event waiting for confirmation, on a phone | A non-breaking space before AM/PM, plus the C-01 layout | 07 |
| **A-03** | Order page › event chooser · 768 | **Wraps.** A live event needs 169 px (range + "● Live") in a 140 px column; GB needs 125. The card grows 70 → 76 px. Phones are fine. | Whenever an event is live and the chooser is on a tablet or desktop | Put "Live" on the date line, or widen the column to ~175 px | 01 |
| **A-01** | Order page › event header, **live** event · 360, 390, 768 | **Wraps in both countries:** GB "11:30 – / 22:45", US "11:30 AM – / 10:45 PM", beside "● Live" in ~69 px. No extra US height (59 px both). | Every live event page, GB and US | Put "Live" on the date line, and keep the range on one line | 01 |
| **A-06** | Manage my order › Pickup row · 360 | **Wraps and misaligns.** "12:45 PM · Pier 13 Waterfront Market" takes 2 lines, with no gap after the label ("Pickup12:45 PM"), and is left-aligned while the other values are right-aligned. The row grows 20 → 40 px. GB fits. Fine at 390 and 768. | US orders at venues with names over ~22 characters, on 360 px phones | Add a gap and right-align the value, or put the venue on its own line | 03 |
| **A-07** | Public truck page and embed/custom-domain schedule · 768 · **projection** | **Wraps** like A-03 (card 70 → 76 px) *once these pages get US formats*. Today they print UK formats for a US truck (see "Not layout"). | Any live event at ≥640 px, once fixed | Same as A-03 | 04 |
| **B-04** | Dashboard › Kitchen capacity **strip** (portrait) · 810, 800 | **Grows.** Chips widen 52 → 73 px, so **15 → 10** show before the strip scrolls. Nothing is cut off. | Always, for every US truck on a portrait tablet | Drop the space before AM/PM, or a two-line chip (time over AM/PM) | 05 |
| **B-02** | Dashboard › order card row 1, on-time order ("in 55m") · 810, 800 | **Misaligned.** The countdown spills 4–10 px into the card padding and no longer lines up with the price. GB 0 px. | Every slotted order on a portrait tablet with 4-digit numbers | Same as B-01 | 05 |
| **C-04** | Manage › Add/Edit event › **Preview** card · 800, 810, 1180, 1280 | **Wraps.** "11:30 AM – 10:45 PM" leaves "PM" alone in the 112 px column (1 → 2 lines, +6 px). GB is one line. | Every add or edit on a tablet or laptop | Widen the column, or keep each time whole, or drop the spaces around the dash | 08 |
| **C-05** | Manage › Import schedule › review card heading · 390 | **Wraps.** "Wed, Sep 30th · 11:30 AM–10:45 PM" leaves "PM" alone (1 → 2 lines, +20 px). GB is one line. | Every imported or found event reviewed on a phone | Put the time on its own line under the date, or keep each time whole | 08 |
| **D-21** | Social posts › **weekly** post › Time column · 1080×1920 (story) | **Shrinks.** The Time box keeps its width on the taller canvas, so the US time stays ~34 px while dates (52) and places (41) grow. Oswald 48 → 34 px (−29%); Raleway 44 → 28 (−36%). All 21 bundled fonts shrink ≥15% ("All on one line"). No truncation, never at the minimum font size. | Every US weekly story post with a non-":00" time | A wider Time share for 12-hour designs, or "Use two lines" by default for 12-hour (start over end), or no spaces around the dash | 11 |
| **D-20** | Social posts › weekly post › Time column · 1080×1350 (portrait) | **Shrinks.** "11:30am – 10:45pm" is 318 px at 44 px in a 250 px box: Oswald 44 → 34 px (−23%); Montserrat 43 → 27 px, **smaller than the place name** (30). 19 of 21 fonts shrink ≥15%. | Every US weekly post with a non-":00" time. Also GB trucks on the poster's 12-hour clock, which is its default. | Same as D-21 | 11 |
| **D-22** | Social posts › weekly post › Time column · 1080×1080 (square) | **Shrinks with wide fonts only.** Oswald is fine (35 → 34); Archivo Black 35 → 23 px (−34%, below the place name at 27). 12 of 21 fonts shrink ≥15%. | US weekly square posts using a wide font | Same as D-21 | 11 |

### Fix directions that clear several issues at once (no code here)
1. **Keep each time whole.** Use a non-breaking space between the time and AM/PM, and break only after the dash. This turns the orphaned "PM" in A-02, C-01, C-02, C-04 and C-05 into a clean break before the end time.
2. **"11:30AM" or "5 PM" style on tight surfaces.** Dropping the space before AM/PM and dropping ":00" ("5 PM – 9 PM") recovers 8–20 px per time. That alone fixes B-01, B-02, B-03, B-04 and B-06 at most sizes, and A-02 for on-the-hour events.
3. **Time ranges on their own line** where a narrow column shares a row with icons or a "Live" badge (C-01, C-02, A-01, A-03, A-07).
4. **Collapse tax, fee and tip** into one expandable row on the customer basket, and one line, or none, on the KDS (A-04, A-05, B-07).
5. **Never shrink the order number;** shrink the time instead (B-06).
6. **Rebuild the phone time picker** as one 12-hour select or an AM/PM toggle (C-03; it also fixes the GB minute boxes, which clip by 3–4 px today).

## Found FINE (no US difference that matters)

**Customer (360 / 390 / 768):**
- the event chooser on phones;
- the chooser's not-live rows at 768;
- the event header date ("Wed, Sep 30"; the long "Wednesday, September 30" isn't used on customer screens);
- the **pickup-time picker** ("12:45 PM" 73 px in a 99–175 px select, 7–45 px clear of the ▾);
- the tip buttons (tight at 360, see A-05);
- **every totals row**, one line each: Subtotal $1019.75 · Sales tax 8.875% $90.50 · Online service fee $30.89 · Tip 20% $203.95 · Total $1345.09;
- the order confirmation ("Order #1234", "Pickup time: 12:45 PM");
- manage-my-order with a normal venue, and with a long venue at 390/768;
- the public page and embed as shipped (no difference, because both print UK formats);
- **no sideways page scroll** anywhere.

**Dashboard and KDS (810 / 1180 / 800 / 1280):**
- **Dashboard:**
  - the event bar and date line ("Wednesday, September 30th");
  - order cards at 1180/1280;
  - **Add order:** the time picker ("12:45 PM 🟢" in a 254–456 px select), "⚡ ASAP — 11:50 AM", the not-started midnight banner, the event picker rows;
  - the Manage-event menu header;
  - the prep list ("Start by 12:40 PM · 50 min").
- **KDS:**
  - the event bar, date line and Start Event banner ("Today · 8:00 PM – 12:30 AM");
  - list-layout ticket headers;
  - timers and late pills in Full view;
  - items, modifiers and instructions (they wrap the same as GB);
  - each charge line, including "$1669.82" beside the number.

**Manage (390 / 810 / 800 / 1180 / 1280):**
- **Schedule:**
  - event cards from 800 up;
  - **"Needs your approval" cards at every size**, including 8:00 PM – 12:30 AM;
  - the conflict box;
  - the date column (WED / 30 / SEP);
  - the editor's hour boxes from 800 up;
  - the Date field;
  - the Import desktop date column.
- **Settings:** the pre-order cut-off (12:45 PM in its 128 px box); the collection-times example sentence.
- **Payments › Tax, tips and fees:** 8.875%, tips 10/15/20 + Other, 3% + $0.30, "Most you can charge: 4% + 50¢", the example "$1.02", and the card-fee lines.
- **Billing:** trial dates ("September 30, 2026"), upgrade buttons, the comparison matrix ($39/$59/$99, $300 / $1,000 / 1.5%), the upgrade modal, the trial popup.
- **No sideways page scroll** anywhere.

**Printed tickets (58 mm / 32 cols and 80 mm / 48 cols):**
- **No row is wider than the paper in either country** in six scenarios: the worst case with the duplicate banner, card held, part refunded, a 00:30 slot, ASAP, and the test ticket.
- **Tightest row:** the 58 mm header "PICKUP 12:45 PM", 15 of 16 double-width columns (GB "COLLECT 12:45" 13/16).
- **80 mm header:** one row, 21/24 columns (GB 19/24).
- **The five US-only rows** fill 32/48 exactly with 4-digit amounts. The US ticket is 5 rows longer; that's content, not a fixed box growing.

**Emails (375 / 600):**
- **Templates checked:** order confirmed, slot taken, slot moved, preferred time, ready, edited with card held, operator new order, partial refund, cancellation, event cancelled ("Wednesday, September 30"), and new events found (midnight range).
- **No US element wraps more than its GB twin, and there is 0 px sideways overflow.** US emails are 108–125 px taller, only from the charge rows.

**Plans PDF (A4 / Letter):** it shows no times. Its only date is "Generated 2026-09-30", identical in both countries; 0 px overflow.

**Social posts:**
- **single-event post at all three sizes and in all 21 bundled fonts:** the time box (including the midnight span) is the same size as GB, and the date box is at most −2%;
- the weekly heading (US "Week of …" is shorter);
- the weekly date column (no difference with "Day on its own line");
- two-event rows in Oswald;
- "Day on top" (except one font);
- place names;
- the days-off and cancelled wording (US is shorter);
- captions (no fixed length).
- **Never truncated, and never at the minimum font size, anywhere.**

## Not checked, and why
- **Native pickers drawn by the OS:**
  - the customer pickup list (a native `<select>`; there is no row of slot buttons);
  - the iPad/Android popovers for slot, finish-time and date/time fields;
  - Manage's date and time wheels.

  Instead, the closed control and every option label were measured against their boxes.
- **Payment and modal flows:**
  - the Stripe card form (needs Stripe running);
  - the closed, paused and time-not-set banners (single full-width sentences);
  - the dashboard's Edit order, item, payment and buzzer modals;
  - Manage's venue-suggestion dropdown (opens on typing).
- **Out of this audit's sizes:** phone widths for the dashboard and KDS; desktop ≥1024 for customer pages; widths under 375 for emails.
- **Real devices:**
  - **fonts:** painted in desktop WebKit with the app's fonts. Android's Roboto and iOS Safari can shift widths by a few px. B-06's late-ticket case at 1280 is sub-pixel;
  - **printers:** none; the ticket bytes were decoded and painted in a monospace font;
  - **email clients:** Gmail, Outlook and Apple Mail CSS not checked.
- **Social posts:** the ~1,800 library fonts and uploaded fonts; non-default box settings ("Use two lines", spacing, notes); a week with a day off.
- **Card fee line on customer screens:** the product never shows one today, because the surcharge resolver returns none.

## Not layout, found while rendering (for a separate fix)
1. **The public truck page and embed/custom-domain schedule show UK formats for a US truck.** TruckListCard gets no time settings there and `/api/embed/events` sends none: "Wed 30 Sep 11:30 – 22:45". *(A-07 is what happens once that's fixed.)*
2. **Dashboard › Completed list prints the raw 24-hour slot** ("🕐 12:45") for a US truck: `app/dashboard/[token]/page.tsx` ~4835, `{o.slot}`.
3. **The Change finish time modal is 24-hour for US trucks** ("22:45 (current)"). The dashboard and the KDS share it (`components/shared/EventFinishTimeModal.tsx`).
4. **An event that runs past midnight is mishandled, in both countries:**
   - the order page would say "Ordering has closed" all day on the start date (from reading the code: `isEventClosed` compares 00:30 with the start date);
   - the dashboard shows a 00:15 order as "695m late" and sorts it first;
   - Add order says "This event has ended" and offers no slot after midnight;
   - Manage files the event under Past from 00:30 on its start date.
5. **Manage › Import schedule review:** every Start/End time box is **empty in both countries** (0 px for the label), and its desktop table scrolls sideways (258 px at 800/810).
6. **Problems that exist in GB too:**
   - **KDS Full ticket:** the "Ready" badge is drawn over the last digit of a 4-digit order number;
   - **Cook tickets:** already cut a Ready number in GB ("#1…");
   - **Add/Edit event minute boxes** clip 3–4 px at 390;
   - **pre-order deadline row** is 11 px too wide at 390;
   - **"Choose time"** overruns the ▾ by 5 px at 360.
7. **Formatting choices:**
   - **No thousands separators on totals** ("$1345.09", "£1234.56"); the money formatter has grouping off by default;
   - **the poster's own 12-hour style** "11:30am – 10:45pm" differs from the app's "11:30 AM – 10:45 PM";
   - **the ticket's "printed" stamp** shows only the time, though the code documents date and time.

## Contact sheets (for chat)
| Sheet | Surface | Issues |
|---|---|---|
| `docs/us-layout-audit/sheet-01-order-event-header.png` | Order page event header and chooser | A-01, A-02, A-03 |
| `docs/us-layout-audit/sheet-02-order-basket-checkout.png` | Basket footer, checkout sheet, totals | A-04, A-05 |
| `docs/us-layout-audit/sheet-03-manage-my-order.png` | Manage my order | A-06 |
| `docs/us-layout-audit/sheet-04-public-schedule-embed.png` | Public truck page and embed (projection) | A-07 |
| `docs/us-layout-audit/sheet-05-dashboard.png` | Dashboard order cards and kitchen capacity | B-01, B-02, B-03, B-04 |
| `docs/us-layout-audit/sheet-06-kds.png` | KDS tickets | B-05, B-06, B-07 |
| `docs/us-layout-audit/sheet-07-schedule-cards.png` | Manage › Schedule cards | C-01, C-02 |
| `docs/us-layout-audit/sheet-08-schedule-editor.png` | Add/Edit event and Import review | C-03, C-04, C-05 |
| `docs/us-layout-audit/sheet-09-settings-payments-billing.png` | Settings, Payments, Billing | FINE |
| `docs/us-layout-audit/sheet-10-printed-tickets.png` | Printed tickets, 58 / 80 mm | FINE |
| `docs/us-layout-audit/sheet-11-social-posts.png` | Social posts | D-20, D-21, D-22 |
| `docs/us-layout-audit/sheet-12-emails-plans-pdf.png` | Emails and the plans PDF | FINE |

Each sheet is GB left and US right, at the same scale, with each issue boxed and labelled. The largest is 0.85 MB.

## Files
- **`scripts/us-layout-audit/BRIEF.md`:** the shared brief (fixtures, worst-case values, method, output).
- **`scripts/us-layout-audit/A-customer/`:** `fixtures.cjs`, `render.cjs`, `shoot.cjs`, `sheets.cjs`, `stub-village-data.cjs`, `findings.json`.
- **`scripts/us-layout-audit/B-ops/`:** `fixtures.cjs`, `measure.cjs`, `render.cjs`, `compare.cjs`, `sheets.cjs`, `findings.json`. Run render → compare → sheets.
- **`scripts/us-layout-audit/C-manage/`:** `render.cjs`, `sheets.cjs`, `findings.json`.
- **`scripts/us-layout-audit/D-print/`:**
  - the scripts: `_fixtures.cjs`, `tickets.cjs`, `emails.cjs`, `plans-pdf.cjs`, `sheets.cjs`, `social/render-social.cjs`, `social/make-sheet-and-findings.cjs`;
  - `findings.json`, which now includes the social-posts findings;
  - the measurement JSON files `sheets.cjs` reads.
- **`docs/us-layout-audit/`:** the 12 sheets, plus `A-customer/` (4.5 MB), `B-ops/` (8.1 MB), `C-manage/` (18 MB) and `D-print/` (7.3 MB) GB/US pairs.
- **Re-running:** every script needs a current `next build` in `.next/` for the compiled CSS. None writes to `public/`, and none is in the harness sweep.
