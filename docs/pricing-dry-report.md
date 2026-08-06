# Landing pricing lede — the walk-up qualifier (one-string change)

**Date:** 6 August 2026. **One file changed: `app/landing/page.tsx`.** Nothing else touched. No `cap sync` / `next dev` / `next build`. No garbled spans in the brief.

---

# THE CHANGE

**Before** — `app/landing/page.tsx:277`
> …including those within your allowance. **Walk-ups carry no HatchGrab platform fee on any plan.**

**After** — `app/landing/page.tsx:283`
> …including those within your allowance. **Walk-ups carry no HatchGrab platform fee on any plan — your card terminal's own fees still apply.**

**The final sentence is 17 words.** One sentence changed; the rest of the lede is untouched.

## The final lede, verbatim (as a reader meets it, with `{CARD_FEE_ONLINE_LABEL}` resolved)

> Pro is £29 a month with £1,500 of online orders included. Max is £49 with £2,000. Anything above that is 0.99%. Standard card processing fees apply to all online orders (currently **1.5% + 20p** on standard UK cards), including those within your allowance. Walk-ups carry no HatchGrab platform fee on any plan — your card terminal's own fees still apply.

**Word count: 60** (was 52).

⚠️ **That is 5 words above the 55-word target set in the previous task, and it is by instruction, not drift.** This brief mandates the clause; the target predates it. Flagged so the two numbers are not read as a regression.

## Source form
```jsx
Walk-ups carry no HatchGrab platform fee on any plan — your card terminal&apos;s own fees still apply.
```
- **Apostrophe escaped as `&apos;`** — required, or `react/no-unescaped-entities` fires. ✅ Lint confirms clean.
- ⚠️ **The em dash is a LITERAL `—`, not `&mdash;`.** I wrote `&mdash;` first and corrected it: every other em dash in this file's JSX text is literal, and one entity among them would be a house-style inconsistency for no benefit. `grep -c "&mdash;"` now returns **0**.

## The reasoning, recorded in the file so it is not "simplified" later
The existing standing comment above the lede was extended:

> 🔴 **THE TRAILING CLAUSE IS LOAD-BEARING AND IS NOT PADDING.** Without it, "no platform fee" reads as "free", which is untrue for anyone taking cards. And it is worded as "your card terminal's own fees" **deliberately**: "card processing still applies" would read as a second, **new** charge, when in fact most trucks already pay their own terminal provider and nothing about that changes. It says whose fee it is and that nothing changes. **Do not shorten it to "fees still apply", and do not add a figure — there is deliberately no number here.**

---

# VERIFY

## 🔴 The four claims still appear EXACTLY ONCE, all in footnote 1

Checked by executing the compiled module against every rendered site (`FOOTNOTES[1]`, `FOOTNOTES[2]`, the landing table override, the lede, the asterisk):

| Claim | Occurrences | Where |
|---|---:|---|
| **EEA qualifier** (*"on UK and EEA cards"*) | ✅ **1** | **FOOTNOTES[1]** |
| **Tap surcharge** (*"…per authorisation…"*) | ✅ **1** | **FOOTNOTES[1]** |
| **In-person rate `1.4% + 10p`** | ✅ **1** | **FOOTNOTES[1]** |
| **"coming soon"** | ✅ **1** | **FOOTNOTES[1]** |

```
✅ ALL FOUR: exactly once, all in footnote 1
```

**Stated explicitly, as asked: the EEA qualifier, the tap surcharge, the in-person rate and "coming soon" each appear exactly once, and all four are in footnote 1.**

## No figure added
✅ **The lede contains no fee literal and no new figure.** Verified: the in-person label and the tap surcharge do not appear in it. The only figure in the lede is the pre-existing `{CARD_FEE_ONLINE_LABEL}`, resolved from `CARD_FEES` — unchanged by this task.

## Landing pricing section
| | Words |
|---|---:|
| `31247ce` | 84 |
| `32921c6` | 329 |
| After the cut-back | 146 |
| **NOW** | **154** |

(+8: the 17-word clause replaces a 9-word sentence ending.)

## Build

```
$ npx tsc --noEmit
TSC EXIT: 0
```

| File | Baseline (`HEAD` = `aaf3fca`) | Now | |
|---|---|---|---|
| `app/landing/page.tsx` | clean | **clean** | ✅ |
| `lib/plan-features.ts` | clean | **clean** | ✅ **not touched by this task** |

Baselines taken from `HEAD` via stash and compared **rule by rule** — clean before and after, so no rule could have drifted.

⚠️ **HEAD moved during this session.** The previous cut-back was committed as **`aaf3fca "landing"`**, so `git status` now shows `lib/plan-features.ts` as unmodified — that is the previous task's work being *committed*, not lost. Verified by reading `FOOTNOTES[1]` on disk: it is the 72-word cut-back version. `git diff --stat HEAD` confirms **`app/landing/page.tsx` is the only file this task changed.**

⚠️ **One grep that looks alarming and is not:** `grep "Stripe's fees are Stripe's, not ours"` returns a hit in `lib/plan-features.ts:165`. It is **inside the explanatory comment** listing what was deliberately cut — **not rendered copy**. The rendered footnote does not contain it.

### Constraints honoured
One sentence changed · no figure, EEA qualifier, tap surcharge or "coming soon" added to the lede · no fee literal reintroduced · nothing outside `app/landing/page.tsx` modified · no price, allowance or the 0.99% platform fee altered.
