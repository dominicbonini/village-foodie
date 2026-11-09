# manual-jp-fix: §88.6 records the Japanese "ログイン" fix

*9 November 2026. Nothing deployed, no database write, no migration. No .env file was opened, read, listed, parsed or tested.*

## Summary

- `docs/reference-manual.md` §88.6: the open item about "ログイン" running under the Japanese nav button is struck through and marked **✅ Fixed 9 Nov (jp-nav-2, `71169cf6`)**.
- The V16.15 changelog entry gains one line about it.
- **Commit:** `d52fc43d` on main, by explicit path. This report is committed separately.

## 0 · Pre-check and flags

- The tree was clean at `71169cf6` (jp-nav-2), the commit being recorded.
- **No span of the brief arrived garbled. No instructions contradicted each other.**
- **No version bump.** The brief asks for a line in the existing V16.15 entry and to change nothing else, so the header and the front matter stay at V16.15.
- **"Logo gap" is the gap between the logo and the right-hand group** (`.nav-in`'s `gap`), recorded in the manual as "the gap beside the logo (`.nav-in`, .5rem)".

## 1 · The two edits

**§88.6, the Japanese bullet's open item.**
- The old text is kept and struck through, the manual's style for a resolved item.
- The new **✅ Fixed** text below it gives:
  - the commit (`71169cf6`) and that you approved it;
  - **the four ja-JP-only rules in `landing.css`:**
    - `:root:lang(ja) .hg-landing .nav-only-sm { flex-shrink: 0 }`, below 640px: Log in never shrinks below its text;
    - below 360px: `.nav-in` gap .5rem, `.nav-cta` padding-inline .35rem, `.nav-only-sm` padding-inline .25rem. Never the text size;
  - **the proof:** all 16 JP views (`/jp`, `/jp/features`, `/jp/faq` and the comparison page, at 320, 360, 375 and 390px) show "ログイン" whole, with the two-line button's label inside it and nothing scrolling sideways, in Chromium and WebKit. 516 other-language first screens are pixel-identical;
  - the guard (`scripts/jp-nav-1.cjs`) and the screenshots (`docs/jp-nav-2/`).

**The V16.15 changelog: one new bullet before "Live:".**

> **Japanese "ログイン" (jp-nav-2, `71169cf6`, 9 Nov):** four ja-JP-only rules in `landing.css` — Log in never shrinks below its text; below 360px the logo gap and button side padding tighten — so it shows in full beside the two-line button (§88.6).

## 2 · Checks

- **The diff:** 9 lines added, 2 removed. The two removed lines are the first and last lines of the open item, put back struck through, with `~~` added. Nothing else in the manual changed.
- The facts come from the jp-nav-2 commit and its measurements:
  - before, "ログイン" was clipped or under the button in 9 of the 16 views; after, in none;
  - the served CSS differs by exactly the 4 rules;
  - `jp-nav-1` passes 12/12;
  - the full sweep had 205 harnesses; its only failures were `site-chrome-1` and `cwv-1`, re-pinned in that commit.
- No code changed in this brief, so no sweep was run.

## 3 · Commits

- `d52fc43d` manual-jp-fix: §88.6 marks the Japanese ログイン overlap fixed (jp-nav-2); one line in the V16.15 changelog (`docs/reference-manual.md`).
- The commit adding this report (`docs/manual-jp-fix-report.md`).

Both are on main. Nothing is pushed or deployed.
