# Manual integration — V11.14 → V11.15

Date: 14 August 2026
Status: INTEGRATED. **One file changed: `docs/reference-manual.md`. Documentation only, no code.**

| | Before | After |
|---|---|---|
| Version | V11.14 | **V11.15** |
| Lines | 8,577 | **8,960** (+383) |
| Bytes | 1,377,128 | 1,401,347 |
| Non-ASCII classes | 72 | ✅ **72 — none gained, none lost** |
| NUL bytes | 0 | ✅ **0** |

No `next dev`, no `next build`, no commit, no deploy, no migration, no code change.
🔴 **Nothing here touches Pizzeria Gusto** — it is a documentation edit.

**Nothing in the prompt arrived garbled. No instruction contradicted another.**

---

## 0. ⚠️ THE ATTACHMENT WAS MOJIBAKE AGAIN — THE ON-DISK COPY WAS USED

The delta rendered in chat as UTF-8-read-as-Latin-1 (`â€"` for `—`, `ð´` for `🔴`, `â ï¸` for `⚠️`).
**Every block was extracted byte-for-byte from `~/Downloads/manual-delta-V11.15.md`**, which is clean
(`0` mojibake sequences, `Unicode text, UTF-8 text`). **Nothing was retyped from the chat rendering.**

This is the failure the manual's own §22 warns about, and it is why the census matters. **The integrated
manual contains 0 mojibake sequences**, verified after writing.

---

## 1. WHERE EACH BLOCK LANDED

Placed by section **NAME**, per the delta's own rule. **No section number appears in any inserted
block**, and none was invented. Every insertion used an **assert-unique anchor** — the script refused to
write unless the anchor string occurred exactly once.

| # | Block | Landed in | Line |
|---|---|---|---|
| 1 | Changelog entry | **Changelog**, immediately above the V11.14 entry | `:19` |
| 2 | Event start and end times — hour + minute | **15. Events and venues** | `:4219` |
| 3 | Starter fallback + trial billing copy | **4. Plan tiers and feature gating** | `:2445` |
| 4 | Menu layout — per-truck Add Order setting | **10. Add Order panel** | `:3484` |
| 5 | The customer order page is one continuous scroll | **17. Menu API behaviour** | `:4835` |
| 6 | Dead and near-dead columns | **16. Database schema essentials** | `:4750` |
| 7 | Live menu shape | **17. Menu API behaviour** | `:4922` |
| 8 | A NUL byte makes a file invisible to grep | **35. Cross-cutting engineering invariants** | `:7314` |
| 9 | Two more instances, and the cross-surface variant | **35. Cross-cutting engineering invariants** | `:7296` |
| 10 | Backlog additions | **27. Open backlog**, above the V11.14 batch | `:5575` |

**Verified after writing: all 10 blocks occur exactly once, byte-identical to the delta.** Not one word
was reworded; only blank-line spacing was normalised around each insertion.

### ⚠️ Three placements that were judgements, stated so you can move them

1. **B2 → §15 "Events and venues", not §14 "Vehicles".** The delta says *"belongs in 'Vehicles /
   events'"* — a slash, because the manual has **both** `# 14. Vehicles (trucks under a brand)` and
   `# 15. Events and venues`. Event start/end times are event data, and the section named "events" is
   §15. **One `#` heading either way; trivially moved.**
2. **B6 → appended directly after the `THREE COLUMNS THAT LOOK LIVE AND ARE NOT (V11.14)` block**, whose
   closing blockquote it extends, and **before** `### Live-verified column facts (V11.14)`. That block
   is in §16, not §35 — §35's dead-column *paragraph* is about the class in general, while B6 lists
   specific columns and restates the running list, which is what the §16 block does.
3. **B9 sits immediately BEFORE B8**, both at the end of §35. B9 is an append to the *"a summary of code
   is not the code"* block, so it had to abut that block's existing corollary rather than be pushed down
   the section by B8. **B8 (the new NUL invariant) follows it.**

---

## 2. THE VERSION BUMP — SAME PASS

| Location | Before | After |
|---|---|---|
| Title line `:1` | `HatchGrab Engineering Reference Manual · V11.14` | ✅ **`· V11.15`** |
| `:7` | `**Version 11.14**` | ✅ **`**Version 11.15**`** |
| Changelog `:19` | (V11.14 was first) | ✅ **`## V11.15 — 14 August 2026`** |

✅ **The delta's warning did not apply this time.** It cautioned that the title block *"was four releases
stale at the last integration"* — it was, and the V11.14 pass corrected it. **It read V11.14 going in**,
so this was a single-step bump with nothing to catch up.

---

## 3. NO CHARACTER CLASS COULD BE GAINED — CHECKED BEFORE, NOT ONLY AFTER

**The delta uses 9 non-ASCII classes; the manual already held all 9.** Computed as a set difference
before any edit:

```
classes the delta has that the manual does not:  none
```

So the integration was **structurally incapable of gaining a class**, and the after-census confirms it:
**72 → 72, GAINED none, LOST none.** ⚠️ **The "LOST none" half is the one that matters more** — a lost
class means a character was silently substituted somewhere in 8,960 lines.

---

## 4. VERIFICATION

| Check | Result |
|---|---|
| All 10 blocks present, byte-identical, exactly once | ✅ **10 / 10** |
| Every insertion anchored on a string occurring exactly once | ✅ script asserted before each write; no fuzzy matching |
| Delta content reworded | ✅ **none** — compared byte-for-byte against the on-disk delta after writing |
| Section numbers invented in delta content | ✅ **none** — placement by heading name only |
| Non-ASCII census | ✅ **72 → 72** |
| Mojibake sequences in the result | ✅ **0** |
| 🔴 NUL-byte scan, post-write, byte-level (not grep) | ✅ **0** in the manual |
| Files changed | ✅ **1**, under `docs/` |
| Code / migration | ✅ **none** |

**Post-write byte scan of this report: section 6.**

---

## 5. 🔴 WHAT I HAVE NOT VERIFIED

1. **I did not re-verify any factual claim in the delta.** The 81-of-81 event-time rows, the 97-row
   census, the menu-shape table, the four trial-expiry dates, the contrast figures, the live-verified
   column defaults — **all taken as given.** No database was queried and no code was read this turn.
   **If a delta claim is wrong, the manual is now confidently wrong in the same way.**
2. **Nothing was rendered.** Markdown structure is correct by inspection — heading levels honoured as
   written, tables well-formed, fences balanced, blockquotes closed — but **no preview was opened.** The
   two new tables (the chip-bar behaviour matrix in B5 and the blind-checks table in B8) are the
   likeliest place for a rendering surprise.
3. **Section numbering was not re-derived.** The inserted `##`/`###` headings sit inside existing
   numbered sections and renumber nothing, **but I did not check whether any existing cross-reference
   elsewhere in the manual now points somewhere slightly different.**
4. **The diff was not audited line by line.** The `+383` shape is consistent with insert-only work plus
   two single-line bumps, **but that is a shape argument** — I did not read every changed line.
5. **I did not reconcile the delta against the reports it summarises.** Where B5 and B4 restate this
   session's build reports, I trusted the delta's summary rather than re-reading each report to confirm
   it matches.
6. ⚠️ **One thing the delta asserts that I know to be stale in one detail:** B4 says the scroll-mode
   heading is `bg-white/95`. **It was changed to `bg-slate-50/95` after the delta was written**, to match
   the pane background — the white band read as a bright stripe on a grey pane. **The delta's own
   "unobserved and worth checking first" note about that band is therefore already answered and acted
   on.** I integrated the block verbatim as instructed rather than editing it; **flagging it so the next
   delta can correct it.**

---

## 6. POST-WRITE BYTE SCAN

Run after this report reached disk — a pre-write check cannot inspect a file that does not yet exist,
and this is the invariant B8 has just added to the manual.

| File | NUL bytes |
|---|---|
| `docs/reference-manual.md` | ✅ **0** |
| `docs/manual-update-report.md` (this file) | see the command output below |
| All files under `docs/` | see the command output below |
