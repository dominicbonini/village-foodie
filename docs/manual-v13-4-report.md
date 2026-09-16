# Reference manual V13.4 — fold report

**Workstream:** `manual-v13-4` · **Date:** 16 September 2026 · **Documentation only.**
**HEAD:** `8964845` ("whatsapp change") · tree was clean at start.

**No span of the prompt arrived garbled. No instruction contradicted another. No code changed. No SQL.**

---

## 0. Pre-flight

`git status --porcelain=v1` **before editing**: **empty** — you had committed everything, including the V13.3 fold and the "Try it" box change.

**Step 2 — V13.3 present?** ✅ Yes, at `docs/reference-manual.md:29`. No STOP.

### ⚠️ The delta was missing on the first look, and I stopped rather than improvise

`~/Downloads/reference-manual-delta-v13.4.md` **did not exist** when I first checked. I searched Downloads, Desktop and Documents for any variant name and found only the V13.3 delta (16 Sep 15:34). Since steps 3 and 4 both depend on its content, I stopped and asked rather than invent a changelog block or bump the manual against a source I had not read. You saved the file at **15:53**, I re-checked, and it was there.

🔴 **Recorded because it is the honest sequence**, and because "the file was not there" and "I did not look properly" are indistinguishable in a report that omits it.

---

## 1. The delta

`~/Downloads/reference-manual-delta-v13.4.md` — 27 lines, 2,881 bytes.

**Integrity checked before folding:** 0 NUL bytes, decodes as strict UTF-8, `**` balanced (26), backticks balanced (30).

⚠️ **One false alarm worth naming.** My first read used `cat -v`, which rendered every em-dash as `M-^@M-^T`. That is `cat -v` escaping multi-byte UTF-8, **not** a garbled span — confirmed by decoding the bytes as UTF-8, which succeeded cleanly. **No span of the delta arrived garbled.**

---

## 2. The fold

- **V13.4 inserted as the newest changelog entry**, immediately after `# Changelog`, above V13.3. 17 lines, folded verbatim from the `## V13.4 …` heading onward; the delta's own front matter (folding instructions) was not carried in.
- **Style matched** — `##` entry heading, bold lead-ins, `[OBSERVED]` / `[REASONED]` markers, exactly as V13.3 and V13.2.
- **No historical entry deleted:** 119 entries before, 120 after; newest is V13.4; every prior entry still present.

---

## 3. Version bump — both places

| | Before | After |
|---|---|---|
| Running header, line 1 | `HatchGrab Engineering Reference Manual · V13.3` | `… · V13.4` |
| Front matter, line 9 | `**Version 13.3**` | `**Version 13.4**` |

Required grep, run:

```
$ grep -nE "V13\.|Version 13\." docs/reference-manual.md | head
1:HatchGrab Engineering Reference Manual · V13.4
9:**Version 13.4**
29:## V13.4 — 16 September 2026 — TOKEN REFRESH PROVEN AND SWITCHED ON; META REFUSES OUR PAYMENT-STATUS CHECK…
```

✅ **Both read 13.4.**

---

## 4. Step 5 — the body

### 🔴 The four facts were not in the body at all, so this is an ADDITION, not an update

Step 5 said "update" these four. I searched the body (everything after the changelog, line 5645 onward) for `WHATSAPP_TOKEN_AUTO_REFRESH`, `readPaymentStatus`, `primary_funding_id`, `payment row`, `payment_method_present` and `token refresh` — **every one returned zero hits.**

The V13.3 background-jobs material was folded into the **changelog entry only** and never reached §20. So there was no body statement to correct, and I did not manufacture one to "update". Instead the four facts are now **stated in the body**, which is the surface a reader treats as current state:

**Added: `## V13.4 — ✅ TOKEN REFRESH IS PROVEN AND ON; ❌ PAYMENT STATUS IS UNREADABLE AND THE ROW IS GONE FOR GOOD`**, at the end of §20 (Social media and WhatsApp auto-replies), before §21 — matching the section's existing `## V11.xx — TITLE` chronological convention.

| # | Fact | Before | After |
|---|---|---|---|
| 5.1 | **Token refresh proven** | *absent from the body* | [OBSERVED] the admin "Refresh token now" on `test-truck` returned a new ~60-day token, reported valid, **and customer messages still got bot replies afterwards** — with a note that this last clause is the proof that matters, because a refresh that returns a token but breaks sending reports success at every point a human looks |
| 5.2 | **`WHATSAPP_TOKEN_AUTO_REFRESH`** | *absent* | `= on` (Production only), added and redeployed. ⚠️ **Only takes effect after a deploy**, and the comparison is exact (`=== 'on'`), so `true`/`1`/`ON`/a stray space all mean off. [REASONED] first automatic refresh ~mid-October. 🔴 **Evidence it is running: `token_checked_at` in `/admin/whatsapp-connections` updates daily after 03:00 UTC — if it stops moving, nothing else will say so** |
| 5.3 | **Payment status unreadable (Meta code 10)** | *absent* | [OBSERVED] "Check payment status" returned `Meta could not be asked (http, code 10)` — permission denied; the Embedded Signup business token cannot read `{waba}?fields=primary_funding_id`. **The Settings payment row is permanently hidden** (it renders only for a known status and none will ever be known); `payment_method_present` stays null; the amber warning keeps its **general** wording, with an explicit "do not improve it to name the operator's card state — we cannot see it"; and 🔴 **the real protection is unchanged** — `131042` sets `payment_blocked_at`, raises the red banner and emails the operator |
| 5.4 | **`readPaymentStatus` + admin button marked for removal** | *absent* | ⚠️ **Tidy later, deliberately not now:** the daily job still calls `readPaymentStatus` and on error **writes nothing**, so it is harmless. Marked so the next reader knows both it and the admin "Check payment status" button are **dead weight, not a feature to preserve** |

The entry closes by recording that **V13.3 open item 2 is closed as "not possible with our permissions" — not as "not done"**.

### ⚠️ One extra correction, found while editing five lines away

`## V11.42 — 🔴 DATES THAT ARE NOW FIXED`, a table in the same section, still read:

| Before | After |
|---|---|
| `**17 Oct 2026** \| 🔴 **Pizzeria Gusto's trial expires — a TRADING truck, silently**` | `~~**17 Oct 2026**~~ **31 Dec 2026**` with a note that the date was corrected V13.4, read from the database 16 September, **the cliff itself unchanged and still unhandled** |

🔴 **This is a miss from the V13.3 sweep.** I corrected Gusto's expiry in three places last workstream and did not catch this one because it is inside a markdown table, which my line-oriented search did not surface. Leaving a known-wrong date about a **trading truck** while editing the same section would have been negligent, so it is fixed and flagged here rather than deferred.

Three stale rows in the same table were also brought up to date: the App Review outer bound (**passed — approved, Tech Provider with Advanced access**), "the reply cap should ship before 1 Oct" (**shipped in V13.3**; the date is now also when Meta's 1,000-a-month free allowance starts), and "Embedded Signup v2 deprecated — build v4" (**v4 built and live**). One row added: **15 Nov 2026 — `test-truck`'s token expires**, with the `token_checked_at` verification pointer.

---

## 5. Step 6 — the Commit line

```
$ git log -1 --format="%H %s"
89648451b6d2621635e94cad85dcb97c721955bd whatsapp change

$ git show --stat --name-only --format="" HEAD | grep -c "^lib/whatsapp/"
0
```

🔴 **The latest commit does NOT contain 16 September's WhatsApp work**, so per step 6's own test **the Commit note was left exactly as the delta wrote it** (`docs/reference-manual.md:43`):

> **Commit.** All of 16 September's code was due to go out as one commit. ⚠️ Record the hash here when known.

**Telling you, as instructed** — and with the answer you probably want:

| Commit | Subject | `lib/whatsapp/` files |
|---|---|---|
| `8964845` **(HEAD)** | "whatsapp change" | **0** — the "Try it" box layout, the V13.3 fold, and its report |
| `88f1dff` | "whatsapp live" | **9** ← this is the one carrying 16 September's WhatsApp work |

⚠️ **`88f1dff` is already recorded in the manual**, in V13.3's open item 10, which I added last workstream. So the V13.4 Commit line is the only place still saying "when known". **Say the word and I will write `88f1dff` into it** — I did not do so unprompted because step 6 gave an explicit test and an explicit instruction for when it fails.

---

## 6. Checks

### (a) Byte-level integrity — measured on bytes, not with `grep`

🔴 `grep -P` is unavailable on macOS BSD grep and a text-mode read can normalise the very thing under test, so the file was read as **raw bytes** and compared against a pre-edit copy.

```
✓ NUL bytes: after=0, before=0
✓ decodes as valid UTF-8 (strict)
✓ every emoji/variation selector present at >= its previous count
✓ U+FE0F variation selectors: before 1878, after 1883
✓ total emoji code points:    before 7398, after 7421
✓ bytes: before 2,687,860, after 2,694,003 (+6,143)
```

Counts only rose, and the per-character census confirms **no individual emoji or variation selector lost a single occurrence**.

### (b) Markdown balance

```
V13.4 changelog block:  ✓ ** balanced (18)   ✓ backticks balanced (28)
                        ✓ all 7 paragraphs balanced
§20 body addition:      ✓ all 10 paragraphs balanced (** 0 bad, ` 0 bad)
whole-file ** delta:    ✓ +84 — EVEN, so parity is unchanged
changelog entries:      ✓ 119 → 120, newest V13.4, none deleted
```

⚠️ As recorded in the V13.3 report, the **whole-file `**` count is odd and has been since before either workstream** — the manual quotes markup as literal text (for example the standing rule naming the `**Version N.NN**` line), which makes a raw whole-file count meaningless. **The even delta is the meaningful measure**, and the real check is done **per paragraph**, which is the unit markdown resolves at.

### (c) Tree state

```
$ git status --porcelain=v1
 M docs/reference-manual.md
?? docs/manual-v13-4-report.md   ← this report
```

✅ **The only file this workstream modified is `docs/reference-manual.md`.**

Nothing staged, committed, stashed, checked out, reset or restored; `git add` was not run in any form.

---

## 7. What V13.4 leaves open

Carried forward in the new entry, unchanged:

1. Order emails should use the connected number rather than `trucks.whatsapp_sender`.
2. Retire the `whatsapp_sender` fallback route (nothing matches it any more).
3. Limit alerts do not re-arm when an operator raises their limit mid-month.
4. Check the features PDF still fits the longer footnote 4.
5. 🔴 **Sweep other `if not exists` migrations against live columns** — still **OPEN, not swept**.
6. Skipped manual tests: disconnect/reconnect, the 80%/100% emails, the payment-blocked banner, the starter view, narrow widths.

And two this workstream adds to watch:

7. ⚠️ **Confirm `WHATSAPP_TOKEN_AUTO_REFRESH` is actually present in Vercel Production** — the delta records it as instructed, not as verified by me.
8. 🔴 **Watch `token_checked_at` after 03:00 UTC tomorrow.** It is the only evidence the daily job runs at all, and `test-truck`'s token expires 15 November.
