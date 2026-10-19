# US layout fixes — a proposal for approval (nothing merged)

17 October 2026. Built in a separate worktree from the audit (`docs/us-layout-audit-report.md`). Every fix in the brief is built and measured.

- **Approval sheets:** BEFORE vs AFTER, GB and US, from the audit's Pizza Kitchen fixtures. Ten sheets in `docs/us-layout-proposal/`, each under 1 MB.
- **Nothing is merged, pushed or deployed.**
- **The main working tree has no product changes.** `git diff` on `app components lib hooks messages proxy.ts next.config.ts public supabase scripts` is empty. The only files written there are this report and `docs/us-layout-proposal/`.
- No SQL was run or needed. Pizzeria Gusto was never rendered, tested or touched.

## Decisions for you

1. **The open question (asked mid-run, not yet answered).** Fixes 3, 4 (the Import review heading), 9 and 11 are "US and GB". But in GB they would visibly change layouts that aren't named GB bugs, which conflicts with "GB must look the same".
   - I didn't choose. Each fix sits behind one switch, and its "GB too" layout is on the sheets.
   - Every switch is `false` (GB unchanged), so only 12-hour (US) trucks get these layouts:
     - fix 3: `SCHEDULE_CARD_STACK_GB` in `components/manage/layout-choices.ts`;
     - fix 4: `IMPORT_HEADING_STACK_GB` in the same file;
     - fix 9: `DAYLOAD_SIDEBAR_WIDE_TIME_GB` in `components/dashboard/DayLoadStrip.tsx`;
     - fix 11: `MANAGE_PICKUP_STACK_GB` in `lib/customer-layout.ts`.
2. **Fix 5 (phone time picker):** 5A or 5B. The switch is `PHONE_TIME_PICKER: 'select' | 'toggle'` in `components/manage/layout-choices.ts`, set to 'select' (5A). Sheet 09.
3. **Fix 10 (KDS):** 10(i) one line or 10(ii) no money lines. The switch is `KDS_MONEY_LINES: 'one' | 'none'` in `components/dashboard/OrderCard.tsx`, set to 'one'. Sheet 07.
4. **Wording.** The basket says "Tax & fees" (your wording, and it includes the tip); the dashboard and KDS say "Tax, fees & tip". You may want them aligned.
5. **🔴 Fixing a named GB bug costs GB KDS screen space.** The Full ticket's "Ready" badge used to be drawn over a 4-digit number. Now the badge, total and PAID drop below the number on those tickets. That adds 10 px.
   - On the GB 800×1280 KDS grid, this pushes the second row of tickets 5 px past the screen edge.
   - Tickets fully on screen go from **6 to 3**.
   - If you'd rather keep 6, the overlap needs a different fix, such as a smaller badge.
6. **Smaller GB side effects** (all on the sheets):
   - **Order header, live event at 360:** the area line ("Kingston · KT1 1LF") is now cut by 4–8 px. The compact column grows to fit the range (fix 2). The venue name was already cut there before.
   - **KDS Cook, long GB names:** at some sizes they now push the time to a second line (+20 px), e.g. "Christopher Montgomery" at 810. This comes from the Cook layout (fix 6) plus the 16-character name rule, applied to every truck there.
   - **Import review phone cards, 5A only:** GB's hour + minute boxes become one "11:30" select, because 5A swaps the shared component. With 5B, GB Import review is pixel-identical.

## Step 0 — checkpoint and worktree

- **Checkpoint commit:** `4d72838` "Overnight events and follow-ups (checkpoint)", parent `692adb4`. 89 files, local only, not pushed.
  - It holds the overnight-events work and follow-ups: code, harness re-pins, `scripts/midnight-*`, `scripts/_midnight-*`, `scripts/fixtures/midnight-events-before/` and the two `docs/midnight-*-report.md`.
  - **Left out, as instructed:** `docs/reference-manual.md` and `docs/reference-manual-update-report.md`. `supabase/.temp/cli-latest` doesn't exist in this tree.
  - **Also left out (my call):** the US layout audit's own files: `docs/us-layout-audit-report.md`, `docs/us-layout-audit/` (41 MB of PNGs) and `scripts/us-layout-audit/`. They are a separate piece of work, not overnight work, and committing 41 MB of PNGs is your call. They remain untracked in the main tree, unchanged.
- **Proposal worktree:** `/Users/dominicbonini/dev/village-foodie-us-layout-proposal`, on local branch **`us-layout-proposal`**, not pushed.
  - Its commits on top of `4d72838`:

    | Commit | What |
    |---|---|
    | `6910127` | fix 1 (shared formatter) |
    | `1901afe` | group C: Manage, fixes 3, 4, 5, 12, plus fix 1 on Manage |
    | `efb6b1c` | group A: customer and landing, fixes 2, 10 (customer), 11, 12, 13 |
    | `978f6f6` | group B: dashboard and KDS, fixes 6, 7, 8, 9, 10 |

  - Product files changed (16): `lib/time-utils.ts`, `lib/printing/ticket.ts`, `components/TruckListCard.tsx`, `components/ChargeRows.tsx`, `components/dashboard/OrderCard.tsx`, `components/dashboard/DayLoadStrip.tsx`, `components/manage/layout-choices.ts` (new), `lib/customer-layout.ts` (new), `app/trucks/[slug]/order/page.tsx`, `app/order/[id]/manage/page.tsx`, `app/landing/page.tsx`, `app/manage/[token]/page.tsx`, `messages/en-GB.json` and three generated `messages/ns/en-GB/*.json`.
  - The render and sheet scripts are committed under `scripts/us-layout-proposal/{A,B,C}/`.
- **How it was built:**
  - Fix 1 was done first, on the branch.
  - Three agents then built groups A (customer and landing), B (dashboard and KDS) and C (Manage) in parallel. Each used its own temporary worktree from `6910127`, built and rendered there, and made one commit.
  - Those commits were cherry-picked onto `us-layout-proposal` with no conflicts. The temporary worktrees are removed.
- **BEFORE tree, kept for the follow-up:** `/Users/dominicbonini/dev/village-foodie-usl-before`, detached at `4d72838`, with a current `.next/` build.
- **Builds:** both worktrees need `.env.local` for `next build`. Each has a **symlink** to the main tree's file; nothing was printed or copied.
- **Renders and measurements:** in `/Users/dominicbonini/dev/usl-out/` (outside every repo): `<A|B|C>/before`, `after` and `after-merged`, `final/` (sweep logs, compare files) and `BRIEF.md` (the agents' brief).
- ⚠️ **One slip during the run.** Group C's cleanup deleted the whole `scripts/us-layout-proposal/` folder in the BEFORE tree, groups A and B's copies included. It restored them at once from their worktrees. A and B then recopied and re-rendered BEFORE before finishing. No product file in the BEFORE tree was touched.

## The fixes (BEFORE → AFTER, measured)

**Sizes:**
- customer: 360, 390 and 768;
- dashboard and KDS: 810×1080, 1180×820, 800×1280 and 1280×800;
- Manage: 390×844, 360 for fix 5, and 800, 810, 1180 and 1280;
- landing: 390 and 1280.

US means 12-hour, en-US, America/New_York, with tax, a 20% tip and the service fee. GB means 24-hour, en-GB.

### 1. Keep each time whole (A-02, C-01, C-02, C-04, C-05) — sheets 01, 08, 10
- **What changed:** `lib/time-utils.ts`.
  - en-US times now carry a no-break space before AM/PM.
  - A 12-hour `formatTimeRange` puts a no-break space before the dash, so a range can only break after it.
  - GB 24-hour output is byte-identical.
- **Hand-built ranges:** "a–b" with no spaces can only break after the en dash already. One `' – '` join on Manage (a deal's slot range) now breaks only after the dash for 12-hour trucks.
- **Printed tickets:** `lib/printing/ticket.ts` folds the no-break space back to a plain space, so ticket bytes are unchanged.
- **Effect:** "5:00 PM – 9:00 / PM" no longer leaves PM alone; the US order header range is whole.
- **On its own,** fix 1 also puts the capacity sidebar's time on one line, but it then draws over the dot (fix 9 finishes that).

### 2. Range on its own line, "● Live" on the date line (A-01 also GB, A-02, A-03, A-07) — sheet 01
- **What changed:** `components/TruckListCard.tsx`. The compact column was a fixed 112 px; it now has a 112 px minimum and grows to its content. From `sm:` up, Live sits on the date line. On phones the full card keeps its one row.
- Order header, live 11:30–22:45, at 360 and 390:
  - GB: range 2 lines → 1; card 59 → 51 px.
  - US: range 2 lines → 1; card 59 → 51 px (54 px at 768).
- Order header, not live (17:00–21:00, and midnight):
  - US: 2 lines → 1; card 59 → 51 px.
  - GB: unchanged.
- Chooser, live row at 768: US 76 → 70 px, 1 line. GB keeps the same height, with Live on the date line.
- Public truck page and embed at 768: US 76 → 70 px. GB keeps the same height, with Live moved. Both are unchanged at 360 and 390.
- **Manage editor Preview card (C-04),** which is the same card: US "11:30 AM – 10:45 PM" goes from 2 lines to **1** at 800, 810, 1180 and 1280 (card 60 → 54 px). GB is unchanged (82 px wide, 1 line).

### 3. Manage › Schedule phone cards (C-01, C-02) — sheet 08
**What changed:** `app/manage/[token]/page.tsx`. Below 640 px:
- the details sit beside the date;
- the icons go in a row beneath the details;
- the time line is full width;
- the van has its own line.

From 640 px up, nothing changes.

Time-line lines / card height at 390:

| Card | US before | US after | GB, switch false | GB, "GB too" |
|---|---|---|---|---|
| Market Square (4 icons) | 3 / 164 | 1 / 142 | 2 / 144 | 1 / 142 |
| Private event | 3 / 245 | 1 / 184 | 2 / 225 | 1 / 184 |
| "Needs confirmation" (5 icons) | 4 / 204 | 1 / 142 | 3 / 184 | 1 / 142 |

- **Single-van truck:** US Market Square 2 / 144 → 1 / 124.
- **Pending ("Needs your approval") cards:** +10 px, because the van also gets its own line there. The overnight one is +28 px (240 → 268), because its "Ends the next day" chip no longer splits. Limiting the van line to cards with icons is a one-word change.
- 800 / 810 / 1180 / 1280: identical to BEFORE, GB and US.

### 4. Import review heading (C-05) and the editor Preview (C-04) — sheet 10
- **Import heading at 390 (below 640 only):**
  - US: the date and the time get a line each. Before, "PM" was alone on line 2.
  - GB, switch false: unchanged (1 line).
  - GB too: 2 lines (+20 px).
  - At 800 it stays one line.
- **Preview:** solved by fix 2's card (above). No separate change was needed.

### 5. Phone time picker (C-03 and the GB minute boxes) — sheet 09
**What changed:** `EventTimeSelect` in `app/manage/[token]/page.tsx`. Below 640 px it shows a phone control; from 640 px up the old hour + minute pair is unchanged.
- **5A:** one select per time, every 5 minutes, showing "10:45 PM" / "22:45".
- **5B:** hour + minute selects. A US truck also gets an AM/PM toggle, and start and end take a row each. GB keeps the two columns.

**The guards still hold in both:**
- the end can't equal the start;
- an off-grid stored value is shown as-is;
- an end earlier than the start is allowed (overnight).

Label px shown vs needed:

| Case | BEFORE | 5A | 5B |
|---|---|---|---|
| 390 US | hours 16 of 43–45 (AM/PM cut); minutes cut 3–4 | 133 of 66–69 | 86 of 14–20, toggle fits |
| 390 GB | minutes 16 of 19–20 (cut 3–4) | 133 of 38–43 | 42 of 14–20 |
| 360 US | 8 of 43–45 | 118 of 66–69 | 71 of 14–20 |
| 360 GB | 8 of 19–20 | 118 of 38–43 | 34 of 14–20 |
| 390 US, midnight | "12 AM" 16 of 45 | "12:30 AM" 133 of 69 | 86 of 16 |
| 800 / 810 | unchanged | unchanged | unchanged |

- Nothing is clipped in either option, in either country, at 360 or 390.
- **Field heights:** the times row is 71 → 62 px in 5A and in GB 5B; US 5B is 132 px, because the times are stacked.

### 6. KDS Cook ticket number, the GB "#1…" and the Full "Ready" badge (B-06) — sheet 06
**What changed:** `components/dashboard/OrderCard.tsx`.
- **Cook:**
  - row 1 holds the number (never shrinks) and the badge;
  - the time and countdown move to row 2 beside the name, as on Full.
- **Full:** when the badge, total and PAID can't sit beside the number, they drop below it, right-aligned.

**Cook, Ready #1235, BEFORE:**

| Size | GB | US |
|---|---|---|
| 810 | "#1…" | 2 characters |
| 800 | 3 characters | 1 character |
| 1280 | 2 characters | "#…" |

- **Cook, late #1234 at 1280:** US "#12…" before.
- **AFTER:** 5 of 5 characters at every size, in both countries, on Ready, late and normal tickets. With 2-digit numbers, 3 of 3.
- **Full, Ready badge over the number:** it overlapped by 23–35 px (GB and US); now 0. Those tickets are 10 px taller (see decision 5).

### 7. KDS Full row 2 — the name keeps at least 16 characters (B-05) — sheet 06
- **What changed:** on a 12-hour truck, row 2 keeps room for 16 characters of the name. If they can't fit beside the time, the time and countdown drop to a second line, right-aligned.
  - GB Full row 2 is untouched, pixel-identical.
  - Smaller changes, such as dropping the space or the "·", gain about 10 px, and about 20–30 px is needed.
- **US, BEFORE → AFTER:**
  - "Daniel Fitzgerald": 810 12/17 → 17/17; 800 11/17 → 17/17; 1280 10/17 → 17/17.
  - "Christopher Montgomery": 810 10/22 → 22/22; 1280 8/22 → 22/22.
- Tickets whose row 2 wraps are about 20 px taller.

### 8. Dashboard order card row 1 (B-01, B-02) — sheet 05
- **What changed:** row 1 wraps. The late or countdown pill drops under the number and time, right-aligned, when it doesn't fit.
- US #1234 "15m late": at 810, overflow 28 px and pill clipped 10.7 px → 0 / 0, on two lines; at 800, 31 / 14.1 → 0 / 0.
- On-time cards spilled 3–10 px into the padding; now 0.
- GB: 0 before and after, with no wrap.

### 9. Kitchen-capacity sidebar time column (B-03) — sheet 05
- **What changed:** for 12-hour trucks the column goes from 40 to 64 px ("11:50 AM" needs 59 px).
- US at 1180 / 1280: rows 40 → 24 px, 2 lines → 1, rows visible 13 → 22 / 21 (as GB). The time no longer runs over the dot.
- GB, switch false: unchanged.
- **GB too:** same row counts, but the 24 px comes out of the labels ("4 Pizza, 2…").
- The portrait strip (B-04) is untouched.

### 10. Extra US total lines (A-04, A-05, B-07) — sheets 02, 05, 07
- **Basket footer** (`components/ChargeRows.tsx` FoldedChargeRows, order page):
  - **What changed:** Subtotal, then one tappable "Tax & fees $325.34" row that opens to the tax, fee and tip rows. The item lines are capped at 30vh and scroll; Subtotal, Tax & fees and Total stay in view.
  - US expanded: 683 px (85% of 360×800) → 501 px (63%); 567 px (71%) with Tax & fees opened. At 390: 81% → 61%. At 768: 67% → 55%.
  - Collapsed: unchanged at 150 px.
  - GB: unchanged (125 / 570 px).
- **Checkout sheet:**
  - **What changed:** when the totals box shows, Total, "Place order" and the pay line sit in a sticky footer, and the basket summary starts collapsed.
  - US: content 1,556 → 1,242 px. Scroll to "Place order": 768 px → 0 (visible on opening) at 360; 746 → 0 at 390; 640 → 0 at 768.
  - GB: unchanged (1,254 px, summary expanded).
- **Dashboard card:**
  - **What changed:** one line, "Tax, fees & tip ▾ $x.xx", that opens on tap.
  - US #1231: 409 → 379 px at 810; 355 at 1180 / 1280.
- **KDS Full, #1234 at 810 / 1180:** 379 → 347 px with **10(i)** "Tax, fees & tip $x.xx"; 323 px with **10(ii)** no money lines.
- Tickets fully on screen, US, BEFORE → 10(i) / 10(ii):
  - KDS list 1180 and 1280: 1 → 2 / 2 (GB 2).
  - KDS list 800×1280: 2 → 3 / 3.
  - KDS grid 800×1280: 3 → 3 / 3. Fix 7's wraps give back the height saved.
  - Dashboard 810: 1 → 1.
- GB shows nothing new.

### 11. Manage my order › Pickup row (A-06) — sheet 03
- **What changed:** for a 12-hour order there's a gap after "Pickup"; the time and the venue each get a right-aligned line.
- US long venue at 360: 2 lines with no gap, left-aligned → gap 67 px, right-aligned, row 40 px.
- US short venues also go 20 → 40 px.
- GB, switch false: HTML identical.
- GB too: row 20 → 40 px, card +20 px.

### 12. Small GB clipping bugs — sheets 03, 10
- **"Choose time" at 360** (order page): it overran the ▾ by 2 px measured on pixels (the audit's box measure said 5 px); now 6 px clear, GB and US. Below 380 px only, so 390 and 768 are unchanged.
- **Pre-order deadline row at 390** (Manage › Settings): it ran 11 px over; now 0. The type select gets `min-w-0`, 173 → 162 px, and its label still fits. 800 and 1280 are unchanged.

### 13. US landing bands — sheet 04
- **What changed:** where the testimonial is hidden, pricing becomes white and the final "Try" section tinted, so the bands alternate.
  - US before: getting started tint · pricing tint · try white.
  - US after: getting started tint · pricing white · try tint.
- GB: the rendered HTML is byte-identical, and the pixels are identical at 390 and 1280.

## Every GB visual difference (pixel-compared BEFORE vs AFTER, switches as shipped)

**Named GB bug fixes:**

| Fix | GB difference |
|---|---|
| 2 (A-01) | Live order header: range on 1 line, Live on the date line, card 59 → 51 px (54 at 768) |
| 2 | Chooser, public page and embed at 768: Live on the date line, same height |
| 5 | Add/Edit event times at 360 / 390: 5A one select per time, or 5B a single-border hour + minute box; row 9 px shorter |
| 6 | KDS Cook: the badge moves right, the time moves to row 2, and Ready shows "#1235" instead of "#1…" |
| 6 | KDS Full: Ready tickets with a 4-digit number, and 2-digit at 1280, are 10 px taller; badge, total and PAID drop below the number |
| 12 | "Choose time" at 360: the words move 4 px left and the ▾ 4 px right |
| 12 | Deadline row at 390: the type select is 11 px narrower |

**Side effects of those fixes (not named GB bugs):**
- 🔴 GB KDS grid 800×1280: tickets fully on screen 6 → 3 (from fix 6; decision 5).
- GB live order header at 360: the area line is cut by 8 px (from fix 2).
- GB KDS Cook: long names push the time to a second line at some sizes, +20 px (from fix 6 and the 16-character rule).
- GB Import review phone cards, with 5A only: one "11:30" select instead of hour + minute.

**Identical in GB:**
- the dashboard (cards, sidebar, Add order) and the KDS list;
- Full row 2;
- the Schedule list at every size;
- the Import heading;
- the basket and the checkout sheet;
- Manage my order;
- the landing (byte-identical HTML).

**With the "GB too" switches on:** the differences listed under fixes 3, 4, 9 and 11, and nothing else.

## Checks (proposal worktree, after merging all three groups)

- `npx tsc --noEmit`: clean.
- `npm run build`: exit 0.
- **Messages:**
  - `split-messages`: up to date;
  - `messages-split`: 154 passed, 0 failed;
  - `messages-parity`: 25,478 passed, 0 failed;
  - `ui-literals`: no new inline text (still at the 110 baseline).
- **New words** (en-GB; the US wording is the same, so no en-US override):
  - `charges.taxAndFees` "Tax & fees";
  - `orderCard.chargesSummary` "Tax, fees & tip";
  - `manageScheduleEvent.time.time` "Time";
  - `time.meridiem` "AM or PM";
  - `time.meridiemOf` "{label}: AM or PM".
- **Merged AFTER renders = each group's own AFTER renders** (every measurement equal). The one difference is the Manage Preview card (C-04), which improves once group A's card change is in: US 2 lines → 1.

**Full sweep** (`node scripts/run-harnesses.cjs` in the proposal worktree): **131 run, 118 passed, 13 failed.** None was re-pinned. Each failure is a pin that captures a changed layout or string:

| Harness | Failed | Cause |
|---|---:|---|
| language-phase-2 | 1,173 | US strings now carry the no-break space (fix 1); HTML pins of changed markup |
| language-phase-1b | 1,004 | KDS / dashboard markup (fixes 6–8, 10); US no-break space |
| language-phase-1d2 | 300 | Manage markup (fixes 3, 5); US no-break space |
| language-phase-1a | 132 | Order page markup (fixes 2, 10); US email strings with the no-break space |
| language-phase-1d | 66 | Manage HTML: a new `data-card-actions` attribute, phone picker markup (GB views pixel-identical except fix 5) |
| midnight-events | 17 | Public and embed card extractor (a regex expecting the range in a bare `<span>`, changed by fix 2); the import 390 check expects hour + minute selects (5A has one); US no-break space |
| time-dates-parity | 16 | GB order text now reads "Live 12:00 – 23:59" (fix 2); US 12-hour strings (fix 1) |
| money-sweep-parity | 8 GB diffs | The same "Live" reordering in GB order-page text (fix 2) |
| phase3-screens | 2 | Dashboard / KDS money rows folded (fix 10) |
| language-phase-0 | 1 | US landing HTML (fix 13) |
| language-phase-1e-tidy | 2 | US landing HTML (fix 13) |
| us-readiness | 1 | A US paste-preview string with the no-break space (fix 1) |
| schedule-graphics-places | 1 | Its "no line of the page was lost" line-count guard on the Manage page (fix 3–5 edits) |

- **GB failures are HTML pins.** They fail on markup with no visual effect (e.g. `data-card-actions`, `min-w-[112px]`, flex-wrap wrappers) or on the named GB changes above. They were checked against the groups' pixel comparisons.
- I found no failure that points to a broken screen.

## Bringing it across (for the follow-up prompt)

- **Worktree:** `/Users/dominicbonini/dev/village-foodie-us-layout-proposal`.
- **Branch:** `us-layout-proposal` (local, not pushed).
- **Commits on `4d72838`:** `6910127`, `1901afe`, `efb6b1c`, `978f6f6`.
- **Before bringing it across:**
  - set or remove the switches you decide on;
  - delete the losing option of 5A/5B and of 10(i)/(ii);
  - then re-pin the 13 harnesses above, each change named.
- **To re-render:** run `node scripts/us-layout-proposal/<A|B|C>/render.cjs <outDir>` in a built tree (BEFORE: copy the folder into `/Users/dominicbonini/dev/village-foodie-usl-before`), then `sheets.cjs <before> <after> <sheetsDir>`.
- **Clean-up when done:**
  - `git worktree remove` the two worktrees (`village-foodie-us-layout-proposal`, `village-foodie-usl-before`);
  - delete `/Users/dominicbonini/dev/usl-out`.

## Contact sheets (`docs/us-layout-proposal/`)

| Sheet | Fixes | MB |
|---|---|---:|
| `sheet-01-order-header-public-embed.png` | 1, 2 | 0.64 |
| `sheet-02-basket-checkout.png` | 10 (customer) | 0.50 |
| `sheet-03-manage-my-order-choose-time.png` | 11 (GB both ways), 12 | 0.16 |
| `sheet-04-us-landing-bands.png` | 13 | 0.50 |
| `sheet-05-dashboard-card-capacity.png` | 8, 9 (GB both ways), 10 (dashboard) | 0.20 |
| `sheet-06-kds-cook-full.png` | 6, 7 | 0.24 |
| `sheet-07-kds-money-lines.png` | 10(i) and 10(ii) beside BEFORE | 0.26 |
| `sheet-08-schedule-cards.png` | 3 (GB both ways) | 0.46 |
| `sheet-09-phone-time-picker-5A-5B.png` | 5A and 5B at 360, 390 and 800 | 0.26 |
| `sheet-10-import-preview-deadline.png` | 4 (GB both ways), 12 | 0.17 |

Each sheet is BEFORE left / AFTER right, GB and US, each change labelled with its fix number and audit id. The AFTER side is rendered from the merged proposal tree.
