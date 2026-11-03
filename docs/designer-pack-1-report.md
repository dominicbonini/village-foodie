# designer-pack-1: what the landing-page designer needs from us

*3 November 2026. English only. **No code, data or page was changed.** The pack is in `~/Downloads/hatchgrab-designer-pack/` and `~/Downloads/hatchgrab-designer-pack.zip` (3.4 MB), and was opened in Finder. The only repo change is this report.*

| # | Item | Outcome |
|---|---|---|
| 1 | `copy-en-GB.md` | **Done.** Every visible string on `/uk` in page order, under section headings, with live values as `{placeholder} — e.g.`. Covers the header, the footer, the country switcher, both pricing layouts (3-card and 1-card), and an appendix with the "Upload my menu" dialog. |
| 2 | `screenshots/` | **Partly done.** The full-length `/uk` page, the test truck's order-status page, and its order page (honestly empty: no upcoming events), each at phone and laptop, 2×. **Not captured:** dashboard, kitchen screen, schedule and weekly social post. They need an operator login I don't have, and two need upcoming events the test truck doesn't have. Listed in `screenshots/MISSING.md`. |
| 3 | `notes.md` | **Done**, one page (≈ 500 words), with two facts corrected (see Flagged). |
| 4 | Finder | **Opened.** |

## Flagged

1. **The country switcher is in the footer only, not "in the header and footer".**
   - The code says so (`components/landing/LandingNav.tsx:148`: "the country menu is now in the FOOTER only"), and the render confirms it.
   - `notes.md` states that, and tells the designer a header switcher would be a new element.
2. **Not all of the listed pages share the header and footer.**
   - **Shared** (`LandingNav` + `LandingFooter`): the landing page, /features and /faq (through `MarketingFrame`), /compare, /about, and the comparison pages.
   - **Different:** **/contact** has its own header (wordmark and Log in) and footer (Privacy, Terms, About). The **legal pages** use `LegalChrome` (a navy header, and a white footer with Privacy, Terms, Country terms, Contact).
   - Neither has the country switcher or the app badges. `notes.md` says so.
3. **"Try free" opens the same Upload dialog as "Upload my menu"** (`DemoCta`, `app/landing/page.tsx:634`), not sign-up. Noted in both files.
4. **"The schedule page"** could mean the operator's Manage › Schedule or the customer-facing truck page. I tried both:
   - The operator one needs the login.
   - The public one, `/trucks/test-kitchen`, turned out to be **a separate directory listing called "Test Kitchen" that shows a real truck's logo (The Raclette Truck)**. Under "never a live truck" I left it out.

## How the screenshots were made, read-only

**Which server:**
- A second `next dev` wouldn't start, because your own dev server (port 3000, running 16 hours) holds the lock. I didn't stop it.
- I used it as it was, at `http://hatchgrab.localhost:3000` (the HatchGrab host), for **GET requests only**.

**Proved before use** that nothing those pages request writes to the database:
- every GET handler involved (`/api/menu/[truckId]`, `/api/orders/[id]`, `/api/dashboard`, `/api/manage`, `/api/events`, `/api/weekly-post`) has no insert, update, upsert, delete or rpc;
- neither do the helpers they await (`resolveActor`, `readWhatsAppConnection`, `readMonthlyUsage`, `readHeldAuthorisations`, `getProductionSlotUnits`, `readCookingReservations`, `resolveTruckLogo`, …).

**Enforced in the browser (Playwright):**
- **every request that isn't GET or HEAD was aborted**, except three `/api/weekly-post` POST actions proven read-only (`load`, `render`, `social_overview`), and every blocked request was logged;
- analytics (PostHog) was blocked;
- service workers were off.

**Logged:** on the pages captured, nothing but analytics was blocked. On the login-gated pages, the only POST was Next's own dev-overlay stack-frame request, also blocked.

**Data used:** the **test truck only** (`test-truck`, Pizza Kitchen, `is_customer` false). The order-status page is a real past test order (#1, 12 Oct 2026, The Five Bells · Cavendish, 2 items, £25, collected; customer "Dom"). The test truck's token was used locally and is written nowhere.

**Rendering:**
- 2× device scale, at 390 × 844 and 1440 × 900.
- The landing page is captured full length, scrolled first so lazy images load.
- The dev server's own "N" badge was hidden with CSS. Nothing else on the page was altered.

**Files** (`screenshots/`):

| File | Size (px, 2×) |
|---|---|
| `landing-uk-phone.png` / `-laptop.png` | 780 × 13804 / 2880 × 9366 |
| `order-page-no-upcoming-events-phone.png` / `-laptop.png` | 780 × 1688 / 2880 × 1800 |
| `order-status-phone.png` / `-laptop.png` | 780 × 1688 / 2880 × 1800 |

## What's missing from the test data (listed, not invented)

Read-only, Pizza Kitchen today:
- **No upcoming events.** The order page shows "No upcoming events in the next 2 weeks"; the schedule and the weekly post have nothing to show.
- **Menu photos on 4 of 30 dishes.**
- **No orders today or later.** The latest order day is 19 Oct (5 single-item walk-ups). The busiest day, 17 Sep, has 19 orders in 4 statuses, but the customer names read "Rolling test A–D", "Dom" and "Dominic", and the venue "Rolling batch test": not marketing-ready.
- **Operator screens need a login.** The dashboard, kitchen screen, Manage › Schedule and Manage › Social redirect to `/login`.

## The copy (`copy-en-GB.md`)

**Extracted from the live `/uk` render, not retyped:**
- the `innerText` of every section, at laptop and phone widths;
- the image alt text and screen-reader labels;
- the closed country dialog's text.

**Phone vs laptop:** the text is identical, except that the phone header shows only "Log in" until the hero's button scrolls away.

**Live values, marked from the message files' placeholders and the plans data** (read-only):
- the trial months (3 today);
- the plan names and taglines, prices, the included allowance and fee %, and the "Most trucks" tag;
- the plan-picker thresholds;
- the after-trial plan, and Pay at Hatch's name;
- the card-fee footnote's rate;
- the year, and the country name in the title.

**Also covered:**
- **The 1-card layout's** different banner sentence and bar line (BR, MX, MY, SG, TH: confirmed live that those five offer exactly one plan and the other 39 three).
- **The "Prices in … (code)" line**, which appears only for shared-symbol currencies.
- **The UK-only testimonial.**

## Undo (only if Dominic asks)

Nothing to undo: no code, data or page changed. Delete `~/Downloads/hatchgrab-designer-pack/` and its `.zip` to remove the pack.
