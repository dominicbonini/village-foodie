# Manual integration — V11.14 and onboarding-flow v7.2

Date: 13 August 2026
Status: BOTH DELTAS INTEGRATED. **Two documentation files changed, no code.**

No `next dev`, no `next build`, no commit, no deploy, no migration. 🔴 **Nothing here touches Pizzeria
Gusto, its rows, or its behaviour** — the only Gusto-related edit is a documentation correction saying its
van's capacity is 2 rather than 5, which corrects the *record of* a value, not the value.

| File | Version | Lines | Non-ASCII classes |
|---|---|---|---|
| `docs/reference-manual.md` | V11.13 → **V11.14** | 8159 → **8577** (+418) | 71 → **72** (+1, named below) |
| `docs/onboarding-flow.md` | v7.1 → **v7.2** | 913 → **961** (+48) | 31 → **31** (none gained, none lost) |

**Nothing in the prompt arrived garbled. No instruction contradicted another.** One thing is flagged for
your decision in section 4 — a consequential correction that goes one line beyond the delta's literal
instruction.

---

## 0. ⚠️ TWO PROCESS NOTES BEFORE THE CONTENT

**(a) The delta files were not in the repo root.** Your brief says *"on disk in the repo root"*; both are
in `~/Downloads`. I read them from there. `manual-delta-V11.14.md` and `onboarding-flow-delta-v7.2.md`
do not exist in the repo and were not created — the repo is unchanged apart from the two `docs/` targets.

**(b) The chat-attachment copies were mojibake, as usual, and were not used.** Both deltas rendered in
this conversation as UTF-8-read-as-Latin-1 (`â€"` for `—`, `ðŸ"´` for `🔴`). **Every block was extracted
byte-for-byte from the on-disk files**, never retyped from the chat rendering. This is the failure the
manual's own §22 warns about, and it is why the census matters.

---

## PART A — `docs/reference-manual.md`

### A1. Where each block landed

Placement was by section **name**, per RULE 1. **No section number appears anywhere in the inserted
text**, and no cross-reference was invented. Every insertion used an assert-unique anchor: the script
refused to write unless the anchor string occurred **exactly once** in the file.

| # | Block (first line) | Landed in | Line |
|---|---|---|---|
| 1 | `## V11.14 — 13 August 2026 (night)` | **Changelog**, immediately above the V11.13 entry | `:19` |
| 2 | `## 🔴 THREE ACCOUNT ROUTES, AND ONLY ONE CREATES A TRUCK` | **13. Operator and multi-truck model**, above *Self-serve signup and setup (V11)* | `:3721` |
| 3 | `## 🔴 PROMOTE FROM DISCOVERY — BUILT` | end of **32. Discovery shadow ↔ operator linking architecture** | `:6443` |
| 4 | `⚠️ **The `.select('id')` is what makes the row count observable**…` | same section, continuing block 3 | `:6466` |
| 5 | `### 🔴 `trucks.excluded` CLOSES A TRUCK FOR ORDERS` | **33. Discovery / Visibility**, in the deploy-coupling landmines | `:6535` |
| 6 | `**Above all event, menu, stock and payment logic.**…` | same section, continuing block 5 | `:6544` |
| 7 | `### 🔴 THREE COLUMNS THAT LOOK LIVE AND ARE NOT` | end of **16. Database schema essentials** | `:4557` |
| 8 | `### 🔴 CORRECTION — GUSTO'S VAN CAPACITY IS 2, NOT 5` | **14. Vehicles**, after *Truck logo (V6.5)* | `:3873` |
| 9 | `### Cuisine, and the emoji derived from it` | **13. Operator and multi-truck model** | `:3782` |
| 10 | `### 🔴 ONE LOGO RESOLVER, FIVE BYPASSES` | **14. Vehicles**, after *Truck logo (V6.5)* | `:3907` |
| 11 | `### 🔴 `canAccess` AND `hasFeature` ANSWER…` | **35. Cross-cutting engineering invariants** | `:6941` |
| 12 | `### The saved allergen card — what actually exists` | end of **17. Menu API behaviour** | `:4622` |
| 13 | `## 🔴 V11.14 — added 13 August 2026 (night)` | **27. Open backlog**, above the V11.13 batch | `:5278` |
| 14 | `### 🔴 A SUMMARY OF CODE IS NOT THE CODE` | **35. Cross-cutting engineering invariants** | `:6957` |
| 15 | `### Tikka Tonic — promoted 13 August 2026` | **22. Development process** → *Standing rules (V11.3)*, immediately after the "PIZZERIA GUSTO IS THE ONLY REAL CUSTOMER" bullet | `:4891` |

**Verified after writing:** all 15 blocks occur **exactly once** in the file, byte-identical to the delta.
Per RULE 4, **not one word of delta content was reworded**; only heading levels were honoured as the delta
wrote them, and blank-line spacing normalised around each insertion.

⚠️ **Block 15's placement is the one judgement call.** The delta gives it no home, but it is a
truck-specific record and the only place the manual keeps live per-truck standing facts is that
Standing rules list — where the Gusto bullet already sits. Placing it beside that bullet keeps the
"which trucks are real" question answerable from one place.

### A2. The two in-place corrections — old text and new

Per RULE 2 these **replaced** the wrong statements. Nothing was appended alongside them.

**(i) Gusto's van capacity** — in the V11.13 record of the capacity-engine work:

*Old:*
```
- **Van created:** `truck_vans` row — Van1, `kitchen_capacity=5`, `capacity_window_mins=5`, active
  (mirrors Test Kitchen; Gusto had NO van → the capacity engine had nothing to enforce). Grid config 10/5 …
```

*New:*
```
- **Van created:** `truck_vans` row — Van1, ~~`kitchen_capacity=5`~~ **`kitchen_capacity=2` (CORRECTED
  V11.14 — live-verified 13 August; this line asserted 5 from memory)**, `capacity_window_mins=5`, active …
```

The wrong figure is struck through rather than deleted, so a reader who remembers "5" can see it was
considered and replaced rather than wondering whether they misread.

**(ii) The `whatsapp` `DROP NOT NULL` migration** — it was listed as pending:

*Old:*
```
3. `ALTER TABLE trucks ALTER COLUMN whatsapp DROP NOT NULL; NOTIFY pgrst, 'reload schema';` (#8 — pending)
```

*New:*
```
3. ~~`ALTER TABLE trucks ALTER COLUMN whatsapp DROP NOT NULL; NOTIFY pgrst, 'reload schema';` (#8 —
   pending)~~ — ✅ **HAS RUN (CORRECTED V11.14).** Live-verified `is_nullable = YES`. It was recorded as
   pending here while another entry already recorded it as applied; this line was the stale one.
```

🔴 **This one resolved the manual disagreeing with itself.** §16 already stated *"the V7.5 `DROP NOT
NULL` was applied"*, so the document held both facts at once. The delta identifies which is stale; the
other entry needed no edit and got none.

### A3. Version bump

**The title block was four releases behind.** It read `HatchGrab Engineering Reference Manual · V11.10`
and `**Version 11.10**` — V11.11, V11.12 and V11.13 each added a changelog entry without touching it.
Both now read **V11.14**. Block 1 is the changelog entry and sits at the top of the Changelog, above
V11.13, in the same pass per RULE 3.

⚠️ **Flagged rather than assumed:** taking the title straight to V11.14 is what "bump to V11.14" means,
but it silently absorbs three missed bumps. Say so if you would rather it had gone to V11.11.

### A4. Census — one class gained, named

```
before: 71 classes    after: 72 classes    LOST: none
GAINED: U+1F37D  🍽
```

🔴 **`🍽` is legitimate and comes from block 9** (*Cuisine, and the emoji derived from it*), which quotes
the fallback emoji that `emojiForCuisine` returns for `CUISINE_OTHER` — *"would have stamped every
self-serve and demo truck with `'🍽️'`"*. **The character cannot be removed without misquoting the
code.** It is the only new class; the other emoji the delta uses (`🍕` U+1F355, `❌` U+274C, `↔` U+2194)
were already present.

**Nothing was lost**, which is the check that matters more — a lost class means a character was silently
substituted somewhere in 8577 lines.

---

## PART B — `docs/onboarding-flow.md`

### B1. Where each block landed

| # | Block | Landed in | Line |
|---|---|---|---|
| 1 | `**Mitigation 2 IS BUILT (verified 13 August 2026).**…` | **4. Visibility rules (critical)** — **replacing** the "Two mitigations, both required" block | `:254` |
| 2 | `⚠️ **The admin create-truck route violated this until 13 August 2026**…` | **15A. The setup wizard as it stands** — appended to step **6. Kitchen setup** | `:912` |
| 3 | `**5. 🔴 `EMAIL_FROM_ADDRESS` IS UNSET…**` | **15. What still blocks self-serve launch** — as item 5, above the "Also owed before launch" paragraph | `:874` |
| 4 | `### Added v7.2 (13 August 2026)` | end of **15B. Decisions this session made — do not silently reverse** | `:945` |

All four present exactly once, byte-identical.

### B2. The corrections — old text and new

**(i) CORRECTION 1 — the "two mitigations" block, replaced in place:**

*Old (deleted, and it is the only deletion in this file):*
```
Two mitigations, both required:

1. **`id`, `slug` and `dashboard_token` must be cryptographically unguessable.** A *security property of
   the create path*, not a cosmetic detail.
2. **Add `excluded !== true` to the truck check in `/api/orders/submit`.** One condition; closes the hole;
   also protects the pre-trial state. **In Phase 1.**
```

*New:* the delta's 15-line block, beginning *"**Mitigation 2 IS BUILT (verified 13 August 2026).**"* —
the condition exists, so the hole recorded as open is closed, and mitigation 1 does not apply to an
operator truck whose slug is readable by design.

**(ii) The visibility table's `excluded` row**, which the delta names explicitly:

| | Old | New |
|---|---|---|
| `:237` | `| \`excluded\` | \`true\` | — | master hide |` | `| \`excluded\` | \`true\` | — | master hide — **and the order gate** |` |

**(iii) CORRECTION 2 — the wizard's kitchen-capacity step.** Nothing was replaced; the delta's paragraph
was **appended** to the existing step, which remains verbatim:

> **6. Kitchen setup.** … Left blank by provisioning **on purpose** — a ceiling nobody chose would quietly
> promise collection times the kitchen cannot hit. …

followed by the delta's *"⚠️ The admin create-truck route violated this until 13 August 2026, defaulting
to 5 …"*. The original states the rule; the new paragraph records that a route broke it. Neither
contradicts the other, so nothing needed striking through.

### B3. Version bump

*Old:* `**v7.1** — revised 5 August after the plan-model session.`
*New:* `**v7.2** — revised 13 August after the promote-from-discovery session.`

A `> **v7.2 changes (13 August):**` entry was added directly above the v7.1 entry, in the same pass —
summarising the two corrections and the new blocker, and citing **Manual V11.14**. ⚠️ **That changelog
entry is the only prose I wrote in either file**; the delta supplies no changelog text of its own for
this document, and RULE 3 requires one. Everything else is the delta's words.

### B4. Census

```
before: 31 classes    after: 31 classes    GAINED: none    LOST: none
```

The onboarding delta's classes (`—`, `→`, `⚠️`, `🔴`) were all long-standing in the target.

---

## 4. 🔴 ONE CHANGE THAT GOES BEYOND THE DELTA'S LITERAL INSTRUCTION — YOUR CALL

The delta does not name this line, and I changed it anyway. **Stated in full so it can be reverted in one
edit.**

**`docs/onboarding-flow.md:248`**, in the surfaces table, asserted the *pre-correction* fact:

*Old:*
```
| `/api/orders/submit` | `active === true` only — does **not** check `excluded` or `show_on_*` |
```

*New:*
```
| `/api/orders/submit` | ~~`active === true` only — does **not** check `excluded` or `show_on_*`~~
**CORRECTED v7.2: `active === true` in the lookup, then `excluded !== true` fourteen lines below it —
see 4.2. `show_on_*` is still not checked and governs the MAP only.** |
```

**Why I did it.** Correction 1 states that `/api/orders/submit` *does* refuse `excluded === true`. Line
248 says it does not. Leaving both would have left the document flatly contradicting itself eleven lines
apart — which is the exact failure RULE 2 exists to prevent, even though RULE 2's letter only covers the
blocks the delta names.

⚠️ **Note the half I did not change.** The old line was wrong about `excluded` and **right about
`show_on_*`**, so the replacement preserves that clause rather than striking the whole row. This is the
only place in either file where I inserted a section reference (*"see 4.2"*) — a table cell has no room
for the explanation, and RULE 1's prohibition on inventing cross-references is about the *delta content*,
which this is not. **If you want RULE 1 read strictly, drop those three words.**

**To revert:** restore the old row text above. Nothing else depends on it.

---

## 5. VERIFICATION

| Check | Result |
|---|---|
| All 19 delta blocks present, byte-identical, exactly once | ✅ 15 / 15 manual, 4 / 4 onboarding |
| Every insertion anchored on a string occurring exactly once | ✅ script asserted before each write; no fuzzy matching |
| No delta content reworded | ✅ compared byte-for-byte against the on-disk deltas after writing |
| No section number invented in delta content | ✅ placement by heading name only; one exception disclosed in §4 |
| Mojibake sequences in either target (`â`, `Ã`, `ð`) | ✅ **0 in both files** |
| Non-ASCII census, `docs/reference-manual.md` | ✅ 71 → 72, gained `🍽` (named, §A4), lost none |
| Non-ASCII census, `docs/onboarding-flow.md` | ✅ 31 → 31, gained none, lost none |
| Files changed | ✅ **2**, both under `docs/` — `git diff --stat`: 476 insertions, 10 deletions |
| Code files touched | ✅ **none** |
| Migrations written or run | ✅ **none** |

### 🔴 WHAT I HAVE NOT VERIFIED

1. **I did not re-verify any factual claim in either delta.** Gusto's van capacity being 2, the
   `whatsapp` column being nullable, `EMAIL_FROM_ADDRESS` being unset, the `excluded` check existing in
   `submit/route.ts` — **all are taken from the deltas as given.** No database was queried and no code
   was read this turn. If a delta is wrong, the manual is now confidently wrong in the same way.
2. **Nothing was rendered.** Markdown structure is correct by inspection — heading levels honoured as
   written, tables well-formed, fences balanced — but no preview was opened. The two struck-through
   table cells are the likeliest place for a rendering surprise.
3. **The 10 deleted lines are the two manual corrections plus the onboarding mitigations block and the
   version lines.** I did not audit the whole diff line by line for accidental deletion beyond that;
   the +476 / −10 shape is consistent with insert-only work, but that is a shape argument.
4. **Section numbering was not re-derived.** Inserted `##` headings sit inside existing numbered sections
   and do not renumber anything, but I did not check whether any *existing* cross-reference elsewhere in
   the manual now points somewhere slightly different.
