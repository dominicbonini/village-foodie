# Reference manual — V11.12 to V11.13

Date: 13 August 2026
Status: APPLIED. `docs/reference-manual.md` is at **V11.13**. **No other file was changed.**

---

## 0. ⚠️ THE ENCODING — THE DOWNLOAD INSTRUCTION WORKED

The delta arrived through the chat attachment path **garbled again**, in the identical way as the last
three: `â` for em-dash, `â ï¸` for ⚠️, `ð´` for 🔴, `Â£` for £, `Â§` for §. UTF-8 read as Latin-1,
applied uniformly.

🔴 **But the on-disk copy is clean.** `~/Downloads/manual-delta-v11.13.md`:

```
$ file ~/Downloads/manual-delta-v11.13.md
Unicode text, UTF-8 text, with very long lines (367)

$ head -3
# Reference manual deltas — going live, 13 August 2026 (evening)
> **PROVENANCE.** Written against **V11.12** (7,682 → 7,863 lines).
```

Census of the on-disk file: `£ § · — … → ⚠️ ✅ 💳 💷 🔴` — every glyph correct.

**So the corruption is confined to the attachment upload path, exactly as your provenance note
predicted, and reading from the path avoided it entirely. No transcription was needed this time** — the
text was copied from the clean file rather than reconstructed. That is the first delta this session that
did not have to be re-typed.

---

## 1. WHAT ALREADY EXISTED — THE GREP, BEFORE ANY WRITE

| Marker the delta names | Hits in V11.12 | Verdict |
|---|---|---|
| `livemode !== false` | 0 | new |
| `ignored:livemode` | 0 | new |
| `sk_test_` | **1** — `:4991`, the go-live checklist | 🔴 **CORRECTION TARGET** |
| `assertSandboxKey` | 0 | new |
| payment method domain | 0 | new (registration named only obliquely) |
| `annotateTestAccountRows` | 0 | new |
| `requireOwner` | 0 | new |
| `truck_users` | 15 | context exists; the never-consulted rule is new |
| `is_admin` / `verifyAdmin` | 23 / 6 | context exists; the cron attribution correction is new |
| `Connect Stripe` / `Set up online payments` | 0 / 0 | new |
| `px-2 sm:px-4` / `previewGroups` | 0 / 0 | new |
| `Required · Choose one` | 0 | new |
| `collected_cash` | 0 | new |
| `acct_1U30w22fB4PPCw2D` | **2** — `:46`, `:4995` | 🔴 **UPDATE TARGET** |
| `165 of 166` / `method = NULL` | 3 / 2 | ⚠️ **already recorded (V11.12) — not repeated** |
| `checkStockShortfall` | 7 | ⚠️ **already recorded (V11.12) — not repeated** |
| `findPlanParityViolations` | 4 | context exists; the open question is new |
| cancel-only sweep | 2 | ⚠️ **already in backlog — not repeated** |

---

## 2. CORRECTIONS — APPLIED IN PLACE, NOT APPENDED

### 🔴 C1 — "two `sk_test_` guards" was wrong, and one of the two paths does not exist

**§27 go-live checklist, item 1.** Struck through and corrected in place:

> ~~Swap `STRIPE_SECRET_KEY` to live, and remove the `sk_test_` guards at `lib/stripe/connect.ts:88` and
> `checkout/route.ts:40-47`.~~ ✅ **DONE (V11.13) — AND THE COUNT WAS WRONG.** 🔴 **There were SIX guards,
> not two, and `checkout/route.ts` NO LONGER EXISTS** — hosted Checkout was deleted in V11.10 and its
> guard had been copied into `authorize.ts`, `capture.ts` and `refund.ts`, with a sixth, **silent** one
> inside `connectConfigured()`…

**Why in place:** a reader following the checklist would have removed two guards, deployed, and hit the
other four at the first authorisation. A second entry saying "actually six" leaves the wrong instruction
standing where it will be read first.

### C2 — the sandbox-only Stripe configuration note now has its live counterpart

**§27 item 3.** The V11.12 line ended *"All four must be repeated on the live account and the live
destination."* That sentence is now answered immediately beneath it (✅ two destinations, seven event
types, both secrets, Link blocked, Google Pay on, `mode=LIVE`), plus the 🔴 warning that
`STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are **not** comma-separated.

### C3 — item 4 annotated as the silent failure, and the script recorded as unblocked

### C4 — item 5 annotated: `requireOwner` means nobody can onboard on a truck's behalf

Including the live proof — `acct_1U425JKAf3umug8O` created, not completed, id cleared, and the account
permanently undeletable.

### ⚠️ C5 — a correction the delta makes to itself, carried through

The delta states `verifyAdmin` gates the admin console and `/landing` — **not** the cron routes, which
use `CRON_SECRET`. The manual's 6 existing `verifyAdmin` mentions carried no cron claim, so nothing
needed striking; the correct attribution is stated in the new §37 text.

---

## 3. NEW ENTRIES

| # | Where | What |
|---|---|---|
| A | **Changelog** | `## V11.13` — the live switch, the webhook discard, three corrections, deployment record |
| F | **§37 Payments** | `## 🔴 GOING LIVE (V11.13)` — nine subsections: the webhook discard (with the four-event cost table), which config items fail silently, the build-time/request-time mismatch guard, the stale-account-id fifth state, the Connect button never being gated, the admin read/press split, the three-way copy, and the button rename |
| G | **§5 Order management** | The customer menu on phones (`px-2 sm:px-4`, the 34-of-66px arithmetic, why the tab strip was left alone) · the required-choice label as form rather than words |
| H | **§16 Database schema** | Cash versus card machine — the `takes_cash = false` setting as dominant cause, the `completionPresses === 'one'` structural gap, why the two new actions must stay out of `PAYMENT_ACTIONS` |
| I | **§35 Invariants** | Six new invariants — silent discard + 200 · a guard copied is a guard multiplied · a cached column must not veto real money · build-time vs request-time · an unresolvable id is not a connection · the fourth consecutive assertion matching documentation |
| J | **§27 Backlog** | `## 🔴 V11.13` — six genuinely new items plus the **GO-LIVE STATE** block (done / proven / remaining, four numbered steps for Gusto) |

---

## 4. 🔴 FOUR BACKLOG ITEMS DELIBERATELY NOT ADDED

The delta's §27 list repeats four items that **already exist** under V11.12 at `:5069-5072`:

- **Refund reporting** (`get_report` sums `orders.total`) — already there, with the £544.50 / £471.50
  measurement the delta does not carry.
- **A notification when a customer cancels a paid order** — already there.
- **A third, cancel-only sweep** — already there, with its exact predicate.
- **The walk-up flow does not record cash versus card terminal** — already there.

**Adding them again would have produced four pairs of entries, one detailed and one loose** — and §35's
own invariant says *"A LOOSE RESTATEMENT WILL BE BELIEVED OVER THE AUTHORITATIVE ENTRY."*

Instead the V11.13 block opens with a pointer:

> ⚠️ **Four items raised by this session's work ALREADY EXIST below under V11.12** — refund reporting, the
> customer-cancels-a-paid-order notification, the third cancel-only sweep, and the walk-up cash/card gap.
> **They are not repeated here.**

Verified: `REFUND REPORTING` still resolves to **one** authoritative entry; the second hit is that
pointer. Same for the sweep.

### Two more the delta repeats from V11.12, also not duplicated

- **`method = NULL` on 165 of 166 rows** — already at three places. The §16 entry adds only what is
  genuinely new: the `takes_cash` cause and the one-press structural fix.
- **`checkStockShortfall` never checking availability** — already at seven places. The delta itself says
  *"Recorded in V11.12 and repeated here"*; it was not re-recorded.

---

## 5. LINE COUNT AND CENSUS

| | Before | After |
|---|---|---|
| **Lines** | **7,864** | **8,160** (+296) |

⚠️ The delta's provenance line says V11.12 was 7,863; the file measures 7,864. A one-line difference in
how a trailing newline is counted, not a content discrepancy.

### Non-ASCII census

**71 character classes before, 71 after. GAINED: none.** Every glyph used was already in the manual's
vocabulary. Counts moved only within existing classes — for example `🔴` 545, `⚠` 417, `✅` 69, `£` 168,
`§` 558.

🔴 **`grep -c "â\|Â\|ð"` returns 0** — no mojibake anywhere in the manual, confirming the on-disk read
carried clean bytes through.

---

## 6. VERIFICATION

- `V11.13` appears **17 times**; the two structural anchors are `:19` (changelog) and `:5026` (backlog).
- Section order preserved — the changelog stays newest-first, and the V11.13 backlog block sits **above**
  V11.12, matching the file's existing convention.
- All ten edits were applied by exact-string replacement with a uniqueness assertion (`count == 1`) on
  every anchor, so none could match in two places.
- No source file was touched. `docs/reference-manual.md` and this report are the only changes.

### Not done

No `next dev`, no `next build`, no commit, no deploy. The manual records the go-live state; it does not
perform any part of it.
