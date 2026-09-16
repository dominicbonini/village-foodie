# Reference manual V13.3 — fold report

**Workstream:** `manual-v13-3` · **Date:** 16 September 2026 · **Documentation only.**
**HEAD:** `88f1dff` ("whatsapp live") · `origin/main` identical.

**No span of the prompt arrived garbled. No span of the delta arrived garbled** — all 114 lines read cleanly and the block is internally consistent. **No instruction contradicted another. No code changed. No SQL.**

---

## 0. Pre-flight

`git status --porcelain=v1` **before editing**:

```
 M app/manage/[token]/page.tsx
```

⚠️ **That file was already modified when this workstream began** — it is the "Try it before you connect" box from the previous turn, not yet staged. **This workstream did not touch it.** Everything else from the WhatsApp releases had been committed by Dominic as `88f1dff`.

---

## 1. The delta

`~/Downloads/reference-manual-delta-v13.3.md`, 114 lines, 21,425 bytes. Read in full. Its front matter (lines 1–8) is folding instructions and was **not** carried into the manual; the `## V13.3 …` heading at line 10 through the end became the changelog entry.

---

## 2. The fold

- **V13.3 inserted as the newest changelog entry**, immediately after `# Changelog`, above V13.2. 105 lines.
- **Style matched.** The delta uses `##` for the entry and `###` for its eight subheadings. ✅ That is the manual's existing style — **142 `###` headings already exist inside the changelog** in older entries, so nothing was flattened or reshaped.
- **No historical entry deleted.** 118 entries before, 119 after; V13.2, V13.1, V13.0 … all present, V13.3 first.

### 🔴 One addition to the delta's own text, made deliberately

Open item 10 ended *"Record the commit hash once it lands, and confirm the deployed state matches this entry."* It **has** landed. Leaving that unrecorded would have shipped a manual entry claiming the code was uncommitted when it is not — exactly the class of staleness this manual is built to prevent. Appended, clearly marked:

> **[OBSERVED, added when folding this delta] It landed as `88f1dff` ("whatsapp live") on 16 September, with `origin/main` at the same hash.** The deployed state has not been re-checked against this entry.

⚠️ **The second half is left open honestly** — I verified the hash from `git log`; I did **not** verify the deployed Vercel build against the entry.

---

## 3. Version bump — both places

| | Before | After |
|---|---|---|
| Running header, line 1 | `HatchGrab Engineering Reference Manual · V13.2` | `… · V13.3` |
| Front matter, line 9 | `**Version 13.2**` | `**Version 13.3**` |

Required grep, run:

```
$ grep -nE "V13\.|Version 13\." docs/reference-manual.md | head
1:HatchGrab Engineering Reference Manual · V13.3
9:**Version 13.3**
29:## V13.3 — 16 September 2026 — WHATSAPP AUTO-REPLIES WENT LIVE: …
135:## V13.2 — 15 September 2026 — …
```

✅ **Header and front matter both read 13.3.**

---

## 4. Body sweep — 13 corrections, in place

Every correction **preserves the superseded text** (struck through or left standing with a dated note beside it), because the manual's value is partly in recording what was believed and why it was wrong.

### 4.1 `WHATSAPP_LIVE` — where it lives, and its value *(two corrections, §20 "Platform compliance and tone")*

| | |
|---|---|
| **Before** | "A **module-level boolean in `app/manage/[token]/page.tsx`** decides whether the operator's WhatsApp control renders live…" |
| **After** | Records that it is `export const WHATSAPP_LIVE` in **`lib/whatsapp-live.ts`**, moved out of the page on 8 September because the landing page and `lib/plan-features.ts` both need it and a flag defined in the page and read by the lib is a **cycle**. The page imports it. |

| | |
|---|---|
| **Before** | "**Both are `true`/live as of 4 September 2026.**" |
| **After** | Struck, and corrected: the flag had **never been committed as `true`** before 16 September — all 790 commits checked, in both files it has lived in. The 4 September go-live existed only in an unstaged working tree, and the "whatsapp-landing-revert" was an **investigation** whose outcome was a decision not to stage — **there is no revert commit.** Now `true` from 16 September, with `findPlanParityViolations` enforcing the flag/matrix agreement in both directions rather than a comment. |

### 4.2 Routing order *(§20, V11.34)*

| | |
|---|---|
| **Before** | "RECEIVING is already per-truck and **correct**: the webhook routes on `value.metadata.phone_number_id` against `trucks.phone_number_id`… **that column has NO WRITER**." |
| **After** | Kept, with a note that **the gap described is exactly what would have broken go-live**: Embedded Signup writes `whatsapp_connections.phone_number_id`, not `trucks.phone_number_id`, so an onboarded truck **would have received nothing**. New order in `resolveWhatsAppRoute`: **ready connection row → `trucks.phone_number_id` → `whatsapp_sender` fallback**; different trucks in the first two ⇒ log a conflict, send nothing, return 200. |

### 4.3 Which token sends *(§20, V11.34 — two corrections)*

| | |
|---|---|
| **Before** | "🔴 **SENDING IS ONE PLATFORM CREDENTIAL** … authorises every send with a single `META_WHATSAPP_ACCESS_TOKEN`." |
| **After** | Marked superseded, with the sharper finding: `decryptToken` had **zero callers**, so every send — including from trucks that onboarded specifically to pay Meta directly — went out on the platform token. **"Trucks pay Meta directly" was not true of the code.** `chooseSendCredential` now picks by the **receiving** number; the connection path **never** falls back to the platform token and sends nothing rather than sending on the wrong key. |

### 4.4 Graph API versions *(§20 — three corrections)*

| | |
|---|---|
| **Before** | "THE SENDER IS PINNED TO GRAPH API `v19.0`" · "`v19.0` IS STILL SERVED … `v20.0` was scheduled for 24 September 2026, so a one-notch bump buys nothing" · "**DECISION TAKEN — the version pin stays on `v19.0`** through the app-review recording" |
| **After** | Pin moved to **`v21.0`**, shared via `lib/whatsapp/graph-version.ts`; the **browser SDK stays on `v26.0`** and is a separate number. The deprecation note now records that the bump went **to `v21.0`, not one notch**, for the reason that note gives. The decision heading is marked **expired** — the reasoning is kept because *why* a known-stale version was deliberately held is the reusable part, not the number. |

### 4.5 The reply cap's windows and limits *(§20, V11.41)*

| | |
|---|---|
| **Before** | "**Three limits, three windows** … Per truck local calendar **day**. Per truck local calendar month." and "**The daily ceiling is DERIVED as one tenth of the monthly**, rounded up." |
| **After** | Superseded: **two limits, not three — the daily window is gone**, so the argument for keeping one did not survive the decision. Records: per customer rolling 24h = 3 then one handoff then silence; per truck per calendar month = `trucks.whatsapp_monthly_reply_limit` (default 1000, CHECK in 250/500/1000/2000/5000, same on every plan); 🔴 **the handoff counts**; 🔴 **only messages Meta accepted count** — send before the log insert, `response_sent` only on success, and **the insert awaited** because an un-awaited insert can be dropped when the function ends and silently under-count the ceiling; month boundary in the **truck's** timezone, one function shared by enforcement and display. |

### 4.6 `payment_method_present` / a payment method blocking sends *(§20 app-review section — two corrections)*

| | |
|---|---|
| **Before** | "**Onboarded trucks must add a payment method to their own WhatsApp Business account** — a friction step in the wizard **that cannot be removed**." (twice, once as a checklist item "(Unchanged; re-confirmed.)") |
| **After** | Struck in both places: in the coexistence onboarding proven on 16 September **the payment-method step was skipped** and the connection worked. A missing payment method **no longer blocks sending** in our own state machine either (`awaiting_payment_method` is sendable). [CLAIM] Meta allows sends **within the free allowance** with no card; beyond it `131042` blocks every send — which is why the code detects that code rather than pre-judging the account. |

### 4.7 Gusto's trial end date *(three corrections)*

| | |
|---|---|
| **Before** | "**Pizzeria Gusto's trial expires 17 October 2026**" (§20 V11.42, the WhatsApp outage entry) · "**Gusto's expiry is 17 October 2026**" (§4, the three trial states) · "Gusto's expiry is **17 October 2026**" (open items) |
| **After** | All three struck and corrected to **31 December 2026**, read from the database 16 September 2026, with `real-thai-food` 30 September 2026 and `village-spice` null noted at the §4 site. **The cliff itself is unchanged and still unhandled** — only the date moved. |

### 4.8 Footnote 6 *(§4 pricing footnotes)*

Not a contradiction — the existing V6.5 note ("footnote 6 … was REMOVED. Footnotes 1–5 are unchanged") **is accurate again** after the merge. A note was added because a reader would otherwise have no record of the second footnote 6: between 4 and 16 September the number was reused for a WhatsApp-only billing footnote; that was resolved by making **footnote 4's text conditional on `WHATSAPP_LIVE`**, and **both auto-reply rows now point at footnote 4**. 🔴 **Numbering stops at 5; append, never insert** — the manage page masks the pricing footnote by the literal `'2'`, so renumbering silently unmasks a hidden price with no error and no test.

---

## 5. Checked and found **absent** — nothing to correct

The brief named these; I looked and the body does not make the contradicted claim, so **no edit was invented**:

| Claim to check | Finding |
|---|---|
| **The 60-day token origin** | The body contains **no statement** about the 60-day lifetime or where it came from. The delta's correction ("Meta's default template choice, not inherited from a deleted configuration") therefore had no body target. It is recorded in the new V13.3 entry. |
| **Whether the first Login for Business config was deleted** | **No such claim in the body.** The only body references to the config screen are V11-era items saying the configuration *does not exist yet* and that its token-expiration setting is *still unread*. The "first config was deleted" claim lives only in an earlier **changelog** entry, which this workstream must not alter — the V13.3 entry now corrects it in the changelog record. |
| **`payment_method_present` being written** | Never mentioned in the body by that name. Recorded in V13.3. |

⚠️ **Deliberately left: four dated historical readings of Gusto's expiry** — §27 "Live dates (verified by Dominic, 4 August 2026)", the same list in the V11 backlog, and two further repetitions in history sections. Each carries its own verification date, so it is an honest record of what was read then, and the standing rule is not to delete history. The three sites that stated the date as a **current fact** are corrected (§4.7).

---

## 6. Checks

### (a) Byte-level integrity — measured on bytes, not with `grep`

🔴 `grep -P` is unavailable on macOS BSD grep, and a text-mode read can normalise the very thing being tested, so the file was read as **raw bytes** and compared against a pre-edit copy.

```
✓ NUL bytes: after=0, before=0
✓ decodes as valid UTF-8 (strict)
✓ every emoji/variation selector still present at >= its previous count
✓ U+FE0F variation selectors: before 1872, after 1878
✓ U+200D zero-width joiners:  before 0,    after 0
✓ total emoji code points:    before 7371, after 7398
✓ bytes: before 2,659,158, after 2,687,860 (+28,702)
```

Counts only rose, and the per-character census confirms **no individual emoji or variation selector lost a single occurrence**.

### (b) Markdown balance

```
V13.3 block:  ✓ ** balanced (186, even)   ✓ backticks balanced (404, even)
              ✓ 9 headings — 1 × h2, 8 × h3, no unexpected levels
              ✓ not truncated
Paragraph level (the unit markdown actually resolves at):
              ✓ all 32 paragraphs in the block: ** and ` balanced
              ✓ all 14 paragraphs touched by the in-place corrections: balanced
```

⚠️ **The whole-file `**` count is odd (32,391) — and it was odd before this workstream (32,095).** My delta is **+296, an even number**, so the parity is unchanged and this is **pre-existing, not introduced**. The cause is legitimate: the manual quotes markup as literal text (for example the standing rule that names the `**Version N.NN**` line), which makes a raw whole-file count meaningless. That is precisely why the check above is done **per paragraph**.

### (c) Tree state

```
$ git status --porcelain=v1
 M app/manage/[token]/page.tsx     ← pre-existing, untouched by this workstream
 M docs/reference-manual.md        ← this workstream
?? docs/manual-v13-3-report.md     ← this report
```

✅ **The only file this workstream modified is `docs/reference-manual.md`.** `git diff --stat`: **207 insertions, 16 deletions.**

Nothing staged, committed, stashed, checked out, reset or restored; `git add` was not run in any form.

---

## 7. What the new entry leaves open

Carried from the delta, and worth surfacing because two are unswept classes:

1. 🔴 **Sweep other `if not exists` migrations against live columns** — status **OPEN, not swept**. The `whatsapp_alerts` table had been created earlier by hand with a different shape; `create table if not exists` reported success and left it, so every alert claim would have failed silently.
2. 🔴 **Prove token refresh and switch `WHATSAPP_TOKEN_AUTO_REFRESH=on`.** Until then nothing refreshes and nobody is warned. Pizza Kitchen's token expires **15 November 2026**.
3. `primary_funding_id` is unproven as a payment signal; the payment row stays hidden until the admin check is shown to report correctly.
4. Limit alerts do not re-arm if an operator raises their limit mid-month.
5. The features PDF has not been checked against the longer footnote 4.
