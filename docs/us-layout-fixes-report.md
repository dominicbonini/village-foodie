# US layout fixes — brought into main with Dominic's choices

18 October 2026. The approved proposal (`docs/us-layout-proposal-report.md`) is on `main`, with your ten choices applied, the 13 failing harnesses re-pinned with named entries, and the full proof run.

**Results:**
- full sweep **131 / 131**;
- `tsc --noEmit` clean;
- `next build` exit 0;
- eslint on every touched file: 393 → 393 messages, no rule grew.

**Rules held:**
- nothing pushed or deployed, and no SQL run or needed;
- Pizzeria Gusto never rendered, tested or touched;
- everything rendered from the Pizza Kitchen GB and US fixtures.

**The prompt.** It arrived intact; nothing was garbled. No two instructions contradicted each other. Two readings to note:
- **"No ticket may grow taller than BEFORE in GB" (choice 3).** I read it as covering the Full-ticket "Ready" fix it sits in. Choice 8 explicitly accepts GB Cook tickets growing when a long name pushes the time down. Choice 3's own condition is met in full: no GB Full or list ticket changes height.
- **"The .md reports stay tracked" (choice 10).** `docs/us-layout-audit-report.md` and `docs/us-layout-proposal-report.md` were never committed (left out of the checkpoint on purpose). Nothing in the brief asked me to commit, so they are untracked but not ignored, and will go in with your next commit.

## Step 0

- **Starting state:** `main` was at `4d72838` with no product changes. The only uncommitted items were `docs/reference-manual.md` (the manual merge) and untracked docs/scripts.
- **Merge:** `git merge --ff-only us-layout-proposal` brought **`main` to `978f6f6`** (four commits: `6910127`, `1901afe`, `efb6b1c`, `978f6f6`). It was local only and not pushed.
- **Your choices** are applied on top as **uncommitted changes**, together with the re-pins, `.gitignore` and the new scripts. I made no commit for them.

## Your choices, as built

### 1. Fix 5: 5A only
- `EventTimeSelect` (`app/manage/[token]/page.tsx`): on a phone (below 640 px), one select per time, every 5 minutes, showing the whole time ("10:45 PM" / "22:45").
- The 5B branch, its AM/PM state and the `PHONE_TIME_PICKER` switch are deleted, along with the 5B stacking of the times grid.
- The 5B words `manageScheduleEvent.time.meridiem` and `time.meridiemOf` are removed from `messages/en-GB.json`. `time.time` ("Time") stays.

### 2. Fix 10 on the KDS: 10(ii)
- No tax, fee or tip line on a KDS ticket; the total and PAID stay in the header.
- `KDS_MONEY_LINES` and the 10(i) line are deleted (`components/dashboard/OrderCard.tsx`).
- ⚠️ **One case the brief didn't name:** the dashboard set to its **Cook** display draws the KDS ticket style, so it now shows no money lines either (BEFORE it showed the full list). The summary line is drawn only on the standard dashboard card. I treated the Cook display as a KDS ticket; say if you want the summary line there too.

### 3. Fix 6: the Full ticket's "Ready" badge, without costing GB space
**What I chose:** a smaller badge and a tighter row 1.
- The badge is one size down: 10 px text, a 12 px pill (was 12 px text, a 20 px pill).
- It is taken out of the row and pinned to row 1's top-right corner, above the total.
- The total, PAID chip and ✓ are exactly the BEFORE markup.
- The number never shrinks.

**Measured (WebKit, the iPad's engine):**
- Overlap on the number goes to 0 everywhere: GB 810 was 22.9 px, 800 was 26.3, 1280 was 35.3, and 2-digit at 1280 was 2.1.
- **No GB Full or list ticket changes height, header or row 1.**
- **GB 800×1280 grid: 6 tickets fully on screen, as BEFORE.**
- GB pixel diff: only the badge itself on the Ready ticket (about 1,540 px per screen). Every total, PAID chip, number and row is pixel-identical.

**Tried first and rejected, each measured:**
1. **The smaller badge alone** saves about 8 px against a need of up to 43 px.
2. **Lifting the badge only when it doesn't fit**, three ways:
   - a wrapping flex cluster aligned by last baseline: WebKit doesn't apply `align-self: last baseline` to flex items. It fell back to the bottom edge and moved every ticket's total down about 4 px.
   - `wrap-reverse`: WebKit takes the cluster's baseline from its top line, so the total dropped 16 px and row 1 grew 11–23 px.
   - a floated badge: WebKit takes the baseline from the empty line beside the float, with the same result.

**The cost:** on every Full or list ticket that shows a badge (Ready, Modified …), the badge is now smaller and sits above the total instead of beside it.

### 4. Fix 3: Schedule phone cards for every truck
- The phone grid is unconditional; the switch is gone.
- The van gets its own line **only on cards with action icons**.
- A "Needs your approval" card keeps "time · van" inline. Its divider no longer spans two grid rows: an empty second row was adding the 10 px row gap, and I found and fixed that during this work.
- **Measured at 390, GB and US:** every pending card is exactly its BEFORE height. That includes the overnight one (240 px); its time was already 2 lines before.
- Cards with icons: GB 144 → 142, "Needs confirmation" 184 → 142; US 164 → 142, 204 → 142.
- From 640 px up nothing changes.

### 5. Fixes 4, 9 and 11: decided by the truck's clock
- **Fix 4:** the Import review heading takes `ts.timeFormat === '12h'`.
- **Fix 9:** the capacity sidebar takes `ts.timeFormat === '12h'`.
- **Fix 11:** the Pickup row takes `ts.timeFormat === '12h'`.
- There is no country check and no switch.

### 6. Wording follows the tip
- One ICU message each, `charges.foldedCharges` (basket) and `orderCard.chargesSummary` (dashboard card):
  `{tip, select, yes {Tax, fees & tip} other {Tax & fees}}`.
- Each screen passes whether the order has a tip line.
- Checked through the real translator in en-GB and en-US:
  - with a tip: "Tax, fees & tip";
  - without: "Tax & fees".
- No en-US override is needed.
- **The checkout sheet has no folded row:** its totals box lists each line, as approved in the proposal. So the wording rule applies to the basket and the dashboard card. The KDS has none (choice 2).

### 7. The area line on the live order header at 360
- The compact card's 80 px reserve for the "Change event" corner link now applies to the venue name only (`pr-20` moved from the venue row to the `<h3>`).
- The link is a single line at the card's top; the area line sits below it.
- **Measured:**
  - GB "Kingston · KT1 1LF" needs 98.3 px and has 170–208 px;
  - US "Hoboken · 07030" has 164–175 px;
  - nothing is cut, and the card is 59 → 51 px in both countries.
- **Side effect:** BEFORE was already ellipsing the GB area line by 0.3 px at 360 (a sub-pixel cut, "KT1 1…" on screen). It is now shown in full on the non-live header too.
- The venue **name** was already truncated at 360 BEFORE and still is, in both countries (pre-existing, not US-caused).

### 8. Accepted as named
**GB KDS Cook:** the time moved to row 2 (fix 6), so a name that can't sit beside it pushes the time to a second line (+22 px).
- At 800/810 this is the long names (Ava Martinez-Lopez, Christopher Montgomery, Elizabeth Worthington).
- ⚠️ **At 1280×800 it is every Cook ticket,** short names included, because the 1280 Cook columns are narrow. The 1280 Cook grid shows 0 tickets fully on screen both BEFORE and AFTER.
- The GB 800×1280 Cook grid stays at 6 fully on screen.

**GB Import review phone cards:** they get the 5A single select.

### 9. Switch files deleted
`components/manage/layout-choices.ts` and `lib/customer-layout.ts` are deleted; nothing remained in them.

### 10. `.gitignore`
- It now ignores `docs/us-layout-audit/`, `docs/us-layout-proposal/` and `docs/us-layout-final/`. No PNG folder is tracked.
- `scripts/us-layout-audit/` and `scripts/us-layout-proposal/` are left to commit. They are not in `scripts/harnesses.json`, so they stay out of the sweep.

## Every GB visual difference (pixel-compared, BEFORE `4d72838` vs main)

Rendered with the proposal's scripts on both trees.

| What changed in GB | Cause |
|---|---|
| Order header, live: "● Live" on the date line, range on one line, card 59 → 51 px (60 → 54 at 768) | fix 2 (A-01, named GB) |
| Order chooser, public truck page and embed at 768: "● Live" on the date line, same height | fix 2 |
| Order header area line shown in full (BEFORE ellipsed by 0.3 px) | choice 7 |
| Basket crops: only the page strip behind the footer moves (header 8 px shorter); the footer is identical | fix 2 |
| "Choose time" at 360: words 4 px left, ▾ 4 px right, 6 px clear (also in the sheet's first screen) | fix 12 (named GB) |
| Add/Edit event times at 360 / 390: one select per time; times row 71 → 62 px; nothing clipped (was 3–12 px) | fix 5 / choice 1 (named GB) |
| Import review phone card: the 5A single select | choice 8 |
| Manage › Schedule phone cards with icons: the new phone layout | fix 3 / choice 4 |
| Settings › Pre-orders deadline row at 390: 11 px over → 0 | fix 12 (named GB) |
| KDS Cook: number never cut, badge right, time beside the name; long names push the time down | fix 6 (named GB) + choice 8 |
| KDS Full and list: the Ready badge smaller and above the total | fix 6 / choice 3 (named GB) |
| Dashboard (every view) | none; only the animated notification bell (22×20 px), which also differs between two BEFORE renders |

Everything else GB is pixel-identical:
- the dashboard cards, sidebar and Add order;
- KDS Full row 2 and every total;
- the basket and checkout sheet;
- Manage my order;
- the Schedule list from 640 px up;
- the editor from 640 px up and the Preview card;
- the landing (byte-identical HTML).

## US: every audit issue, BEFORE → AFTER (main)

| Issue | BEFORE | AFTER |
|---|---|---|
| **C-03** phone time boxes | AM/PM cut 22–37 px (360/390); "12:30 AM" read "12 : 30" | one select per time: "11:30 AM" 66 of 118–133 px, "12:30 AM" 69 of 118–133; 0 cut; unchanged from 800 |
| **B-06** KDS Cook number | Ready "#…"/"#1…" (1–3 of 5 characters) at 810/800/1280; late "#12…" at 1280 | 5 of 5 everywhere (3 of 3 for 2-digit) |
| **B-01** dashboard row 1, late | 28 px over and pill clipped 10.7 px at 810; 31 / 14.1 at 800 | 0 / 0: the pill wraps under, right-aligned |
| **B-07** money lines | +78 px per card or ticket | KDS: none (#1234 379 → 323 px at 810). Dashboard: one "Tax, fees & tip ▾" line (#1231 409 → 379). KDS list fully on screen 1 → 2 (1180/1280) and 2 → 3 (800×1280) |
| **B-03** capacity sidebar | rows 40 px, time on 2 lines, 13 rows visible | 24 px, 1 line, 22 / 21 rows (same as GB) |
| **B-05** KDS Full name | "Christopher Montgomery" 8–10 of 22 characters; "Daniel Fitzgerald" 10–12 of 17 | every name in full (≥ 16 characters at every size); the time drops to a second line when needed |
| **A-04** basket footer | expanded 683 px = 85 % of 360×800 | 501 px = 63 % (69–71 % with the fold opened); items scroll inside 240 px |
| **A-05** checkout sheet | "Place order" 768 px of scroll away at 360 (746 at 390, 640 at 768) | visible on opening (sticky footer 141 px); content 1,556 → 1,242 px |
| **A-02** order header, not live | range 2 lines, card 59 px | 1 line, card 51 px (54 at 768) |
| **C-01** Schedule cards at 390 | time on 3 lines, card 164 px | 1 line, 142 px; van on its own line |
| **C-02** "Needs confirmation" card at 390 | 4 lines, split inside a time, 204 px | 1 line, 142 px |
| **A-03** chooser at 768, live | range 2 lines, card 76 px | 1 line, 70 px |
| **A-01** order header, live | 2 lines in both countries | 1 line, Live on the date line |
| **A-06** Pickup row at 360 | no gap ("Pickup12:45 PM"), left-aligned, 2 lines | 67 px gap, right-aligned, time and venue a line each |
| **A-07** public page and embed at 768 | 2 lines, card 76 px | 1 line, 70 px |
| **B-04** capacity strip | not in scope | unchanged |
| **B-02** dashboard row 1, on time | countdown spilled 3–10 px into the padding | 0 |
| **C-04** editor Preview | "PM" alone on line 2 (800–1280) | 1 line at 800 / 810 / 1180 / 1280 |
| **C-05** Import heading at 390 | "PM" alone on line 2 | date line, then time line |
| D-20 – D-22 posters | not in scope | unchanged |

- **No horizontal page scroll** at any audit size; no measured overflow on any customer, Manage, dashboard or KDS surface.
- **Truncated before and after, in both countries (not US-caused):**
  - the venue name on the compact order header at 360;
  - GB KDS Full long names at 800 / 810 / 1280 (Full row 2 is unchanged for 24-hour trucks).

## Re-pins: 13 harnesses, named entries only

No BEFORE fixture was re-captured. No view was listed or skipped. No product code was edited by the re-pin work.

| Harness | Before → after | Where the named entries live |
|---|---|---|
| language-phase-1a | 132 failed → 1,050 / 0 | `scripts/_lp2-named-usl.cjs` (new; one line in `_lp2-named.cjs`) |
| language-phase-1b | 1,004 failed → 3,522 / 0 | same |
| language-phase-2 | 1,173 failed → 1,632 / 0 | same |
| language-phase-1d | 66 failed → 343 / 0 | `scripts/_lp1d-named.cjs` |
| language-phase-1d2 | 299 failed → 522 / 0 | `scripts/_lp1d2-named.cjs` |
| schedule-graphics-places | 1 failed → 270 / 0 | the line-multiset guard: named excused lines plus companion checks |
| language-phase-0 | 1 → 168 / 0 | `scripts/_lp1e-named.cjs` (`US_LAYOUT_FIX_13`) |
| language-phase-1e-tidy | 2 → 61 / 0 | same entry |
| money-sweep-parity | 8 GB differences → all 3,057 identical | exact allowances (fix 2, fix 6) |
| time-dates-parity | 16 → GB identical outside named windows | allowances L2 (fix 2), L6 (fix 6) and the US fix-1 strings |
| phase3-screens | 2 → 93 / 0 | the fix-10 checks rewritten (below) |
| us-readiness | 1 → 50 / 0 | the fix-1 paste preview |
| midnight-events | 17 → 372 / 0 | `named()` in `_midnight-{public,customer,dashboard,manage}.cjs` (BEFORE stays `692adb4`) |

The 1d, 1d2 and 2 harnesses also regenerated their own `scripts/fixtures/language-phase-*-us-changed.txt` lists; none has an UNNAMED line.

**Entry ids:**
- us-layout-fix-1-nbsp, fix-1-manage-join;
- fix-2-live-on-date-line;
- fix-3-schedule-phone-cards;
- fix-4-import-heading;
- fix-5a-phone-time-select;
- fix-6-kds-cook-header, fix-6-kds-full-badge;
- fix-7-kds-name-16;
- fix-8-card-row1-wrap;
- fix-9-sidebar-wide-time;
- fix-10-charges-fold (card, order footer, sheet footer);
- fix-11-pickup-row;
- fix-12-choose-time, fix-12-deadline-row;
- fix-13-us-landing-bands.

Each transform is exact. If it doesn't find exactly the BEFORE markup it expects, it leaves the view as it was and the view fails.

**Checks rewritten (old → new):**
- **phase3-screens:**
  - "dashboard card shows Subtotal / Sales tax / Service fee / Tip rows" → one "Tax, fees & tip ▾ $6.60" button. There is a new no-tip case reading "Tax & fees ▾ $3.00", and a tapped-open case showing all four rows.
  - "KDS card: the same rows" → no money lines, total and PAID kept. It is now rendered as the KDS renders it; the old check used the dashboard's card style.
- **midnight-events:**
  - "import 390: every hour/minute value fully visible" → six phone selects, each showing the whole time, none cut, no hour/minute pair visible. The old check stays from 800 up.
  - The public / embed card extractor reads the range by its line's classes, so it reads both markups. The pin itself is unchanged.
- **schedule-graphics-places:** the hour/minute aria and deal-join claims now name their new lines.

**Two fixture quirks, named rather than pinned as product:**
- the "end early?" confirm types "9:00 PM" into fixture state with a plain space (`_lp1b-dashboard.cjs` / `_lp1b-kds.cjs`);
- `language-phase-1c` also runs the new lp2 entries: 4,498 / 0.

**Not in the sweep, pre-existing:** `node scripts/money-sweep-parity.cjs --usd` reports 2 problems: the US allergen list shows in Manage's edit-item and edit-option text. The BEFORE tree (`4d72838`) reports the same two, so it predates this work. Not touched.

## Checks (main, final code)
- `npx tsc --noEmit`: exit 0.
- **eslint** on the 10 touched source files that still exist (both deleted switch files excluded): 393 messages BEFORE (`4d72838`) and 393 AFTER, no rule's count higher. The new `components/ChargeRows.tsx` has none.
- `npm run build`: exit 0.
- `node scripts/run-harnesses.cjs`: **131 run · 131 passed · 0 failed.**
- **Messages:**
  - split-messages up to date;
  - messages-split, messages-parity and ui-literals pass as part of the sweep;
  - new and changed keys: `charges.foldedCharges`, `orderCard.chargesSummary` (ICU select); `manageScheduleEvent.time.meridiem` and `.meridiemOf` removed.

## Contact sheets (`docs/us-layout-final/`, gitignored)

Each sheet is BEFORE vs AFTER, GB and US.

| Sheet | Shows | MB |
|---|---|---:|
| `final-1-phone-time-picker-5A.png` | choice 1: 360 / 390 / overnight / 800, and the Import review phone card (choice 8) | 0.09 |
| `final-2-kds-ready-badge.png` | choice 3: GB 810, the whole GB 800×1280 screen (6 fully on screen), 1280, US 810, the list | 0.12 |
| `final-3-money-lines.png` | choices 2 and 6: KDS without money lines, the dashboard summary line (closed and open), basket fold, checkout sheet | 0.30 |
| `final-4-schedule-phone-cards.png` | choice 4: 390 with and without vans, and 800 unchanged | 0.51 |
| `final-5-twelve-hour-only.png` | choice 5: Import heading, capacity sidebar, Pickup row (GB unchanged) | 0.11 |
| `final-6-header-clipping-cook.png` | choice 7, fix 12's two GB clipping fixes, choice 8 on the KDS Cook | 0.12 |

**Built by:** `scripts/us-layout-proposal/final-sheets.cjs` (new) from the A/B/C render scripts' output.
- The render outputs were in `/Users/dominicbonini/dev/usl-out`, now deleted as asked.
- To rebuild: run `scripts/us-layout-proposal/{A,B,C}/render.cjs <dir>` on a built BEFORE tree and on main, then `final-sheets.cjs`.
- A's script gained an `areaTrunc` measurement (the area line's real text width).

## Localhost check — Pizza Kitchen (GB), what you'll see change

1. **Manage › Schedule on a phone** (or devtools at 390):
   - a card with action buttons shows its time on one line, the buttons in a row underneath, and the van on its own line;
   - a "Needs your approval" card looks exactly as before.
2. **Add / Edit event on a phone:**
   - Start and End are each one dropdown with whole times ("11:30", "22:45");
   - an End earlier than the Start shows "Ends the next day";
   - the Start time itself is not offered for the End.
3. **KDS, Full view, a Ready order:** the "Ready" badge is smaller and sits top-right above the total, and nothing covers the order number.
4. **KDS, Cook view:**
   - the number is never cut;
   - the time sits beside the name;
   - a long name pushes the time to a second line.
5. **Order page, live event, at 360:**
   - "● Live" sits beside the date;
   - the time range is on one line;
   - "Kingston · KT1 1LF"-style area text shows in full.
6. **The two small clipping fixes:**
   - "Choose time" at 360 no longer runs into its ▾;
   - Manage › Settings › Pre-orders: the deadline row at 390 fits its box.
7. **Nothing else should look different on a GB truck:** no tax/fee lines, same dashboard, same KDS totals.

## Clean-up (done)
- `git worktree remove` of `/Users/dominicbonini/dev/village-foodie-us-layout-proposal` and `/Users/dominicbonini/dev/village-foodie-usl-before`. The only uncommitted files there were three harness output lists, superseded by main's.
- Local branch `us-layout-proposal` deleted (fully merged at `978f6f6`).
- `/Users/dominicbonini/dev/usl-out` deleted.

## State left for you
- **`main` = `978f6f6`** (fast-forwarded, not pushed).
- **Uncommitted on top:**
  - **product:** `app/manage/[token]/page.tsx`, `app/order/[id]/manage/page.tsx`, `components/ChargeRows.tsx`, `components/TruckListCard.tsx`, `components/dashboard/DayLoadStrip.tsx`, `components/dashboard/OrderCard.tsx`, `messages/en-GB.json` and three generated `messages/ns/en-GB/*.json`;
  - **deleted:** `components/manage/layout-choices.ts`, `lib/customer-layout.ts`;
  - **other:** `.gitignore`;
  - **scripts:** the re-pinned harness files listed above, plus new `scripts/_lp2-named-usl.cjs` and `scripts/us-layout-proposal/final-sheets.cjs`.
- **Untracked, not ignored:** `docs/us-layout-audit-report.md`, `docs/us-layout-proposal-report.md`, this report, `docs/reference-manual-update-report.md` and `scripts/us-layout-audit/`. The uncommitted `docs/reference-manual.md` manual merge is untouched.
- ⚠️ **The proposal's render scripts read the audit's** (`scripts/us-layout-audit/`). Commit the two folders together if you commit them.
- **Before pushing:** the overnight checkpoint is in this history, so the `auto-event-scheduler` edge function still needs deploying after the push. That is unchanged from the overnight report.
