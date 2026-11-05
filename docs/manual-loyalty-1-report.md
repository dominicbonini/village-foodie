# manual-loyalty-1 — loyalty-1's manual changes applied, then a clean check run (5 November 2026)

**In short.** I applied loyalty-1's manual delta to `docs/reference-manual.md`, plus your extra launch-decision item. The changelog line
went into site-chrome-1's V16.12, with no new version. The full check suite then passed **196 / 196**, and `tsc --noEmit` is clean.

- **Commit:** one, on `main`, by explicit paths (this report and the manual).
- **Not done:** no deploy, no database write, no migration.

---

## Flags

- **The message that restarted this read "reastart".** I took it as "restart" the manual-loyalty-1 brief. You had said you would
  re-send it once site-chrome-1 was committed, and the pre-check showed that it now was. If you meant something else, everything here
  is one commit and easy to revert.
- **One item from the delta was not applied, and I'm asking you about it.** `docs/loyalty-1-manual-delta.md` contains a fourth, small
  piece the brief did not name. It sits under "Also stale", in "Resolved this session (V6.6)":
  - the line `- **loyalty_cards (planned)** — V4 spec frozen. Do not build until instructed.`
  - would become a pointer to the new section.

  The brief says to apply the delta "exactly as written", and then lists three pieces and says "change nothing else". Applying the
  fourth piece or skipping it would each break one of those instructions. So, as your rule says, I didn't choose. **The line is
  unchanged.** Question below.
- **Nothing else in the brief arrived garbled**, and no other instruction contradicted another.

---

## 1 · Pre-check

- **Tree:** `git status` was clean (no modified or untracked files).
- **site-chrome-1 is committed:**
  - `8269100a` — one header and one footer;
  - `be5318cc` — screenshots;
  - `f1526922` — the report.
- **loyalty-1 is committed:** `f2a04af6`, `d152cb01`, `409c1c3e`, `687358b1`.

Earlier in this session the same pre-check failed (site-chrome-1 was entirely uncommitted). I stopped then and wrote nothing.

---

## 2 · The manual (`docs/reference-manual.md`: 84 lines added, 4 removed)

The text came straight from the delta file's fenced blocks, extracted by a script, so it matches the delta character for character.

1. **The "Loyalty stamp cards" section** (§4, between the `is_test` rule and "Branded QR code"):
   - **Replaced:** the old heading `## Loyalty stamp cards (~~Max,~~ coming soon) — V4` and its one paragraph.
   - **Now:** the delta's section. Its heading carries the required marker: "built, switched off (loyalty-1, 5 Nov 2026) — UI,
     checkout redemption, emails and launch decisions (backfill, plans, privacy wording) still to design".
   - **Added as the last item of its "Still to design" list, in your words:** "Launch decision: a card with no stamp for 12 months is
     deleted with any unused reward on it (retention job) — confirm, or give every reward an expiry date; the customer-facing terms
     must say whichever applies."
2. **The backlog line:** `- Loyalty stamp cards V1 build (Max only) — when instructed. …` was replaced with the delta's line. That line
   strikes through "build (Max only) — when instructed" and says what is built and what is still to design. The separate
   `- Loyalty redemption UX.` line stays, as the delta says.
3. **The changelog:** the delta's one line was added as the second bullet of **V16.12** (site-chrome-1's version), after its
   site-chrome-1 bullet. V16.12's title is unchanged, and there is no new version number.

**Nothing else in the manual changed.** The diff shows exactly 4 removed lines (the old heading, its blank line, its paragraph, and the
old backlog line) and the matching additions.

---

## 3 · The clean check run

**`node scripts/run-harnesses.cjs`** on `main` with the manual edit in place: **196 run · 196 passed · 0 failed. "✅ every listed
harness passed".**

- **What the 196 include:** `loyalty-1`, `perf-1`, `reviews-weather-1` and site-chrome-1's new `site-chrome-1.cjs`.
- **The earlier 22 failures (loyalty-1 report):** they all came from site-chrome-1's then-uncommitted work, and are gone now that it is
  committed.
- **Nothing needed fixing.**

**`npx tsc --noEmit -p .`:** exit 0, no errors.

**The runner's one warning (not a failure):** 14 scripts are in neither the harness list nor an excluded group.

- They are `_address-formats-1-after`, `_lp-address-formats-1`, `_lp-allergen-card-country`, `_lp-perf-1`, `_lp-site-chrome-1`,
  `_lp2-named-usl`, `_midnight-core`, `_midnight-customer`, `_midnight-dashboard`, `_midnight-engine`, `_midnight-fixtures`,
  `_midnight-manage`, `_midnight-public` and `allergen-card-country-screens`.
- **Whose they are:**
  - `_lp-site-chrome-1.cjs` is new, from site-chrome-1;
  - `_lp-perf-1.cjs` is from perf-1;
  - the rest predate both.
- **Not changed:** classifying them means editing `scripts/harnesses.json` for other workstreams, which is outside this brief.

---

## 4 · Files

- **Changed:** `docs/reference-manual.md`.
- **Created or overwritten:** `docs/manual-loyalty-1-report.md` (this file).

---

## Question

Q1: should the delta's "Also stale" pointer be applied too? That would turn the V6.6 line `- **loyalty_cards (planned)** — V4 spec
frozen. Do not build until instructed.` into `- **loyalty_cards** — ⛔ *Corrected loyalty-1 (5 Nov 2026): built to a new schema,
switched off; see "Loyalty stamp cards" (§4).*`

- **A** — yes, apply it (one line, in a follow-up commit).
- **B** — no, leave the V6.6 line as it is.
