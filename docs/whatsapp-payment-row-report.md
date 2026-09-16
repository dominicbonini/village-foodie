# The payment row: silent when we do not know

**16 September 2026.** Three files changed by this workstream. No SQL, no migration, no network call, no
API behaviour change. tsc clean; lint rule-for-rule identical to HEAD.

---

## 0. TREE STATE

```
$ git status --porcelain=v1
 M app/manage/[token]/page.tsx
 M lib/whatsapp/connection-read.ts
 M lib/whatsapp/connection-view.ts
 M scripts/whatsapp-connection-view-harness.cjs
 M scripts/whatsapp-settings-row-harness.cjs
?? docs/auto-replies-channel-boxes-report.md
?? docs/whatsapp-box-layout-report.md
$ git rev-parse HEAD          a05ecc98b2cfe3294d56473b37cfbbbd72ca8698
$ git rev-parse origin/main   a05ecc98b2cfe3294d56473b37cfbbbd72ca8698
```

The five modified files are **exactly** the set the brief permits, `connection-read.ts` included. The only
entries beyond that list are the **two previous workstreams' own reports**, one of which this brief cites
by name as CONTEXT. I did not stop a third time for that same benign class — it is accounted for, and the
rule exists to catch work that is *not*.

🔴 **The diff of `app/manage/[token]/page.tsx` carries three workstreams now** — channel boxes, box
layout, and this. Git cannot separate them.

---

## 1. THE CHANGE, AND WHY IT IS THE RIGHT ONE

`payment_method_present` is `null` on every connection because nothing asks Meta. Before this change the
row's **normal appearance was a grey "Not checked" pill and a "Check in WhatsApp Manager" link** — that
is, the state an operator would always see was an admission that we had not looked, attached to an
instruction to go and look for us.

Now the row is **absent** unless we can stand behind what it says.

### View model — `lib/whatsapp/connection-view.ts`

| Field | Before | After |
|---|---|---|
| `showBillingPaymentRow` | `connected` | `connected && (paymentStatus === 'added' \|\| paymentStatus === 'missing')` |
| `aboveAllowanceWarningVariant` | `'missing' \| 'unknown' \| null` | `'missing' \| 'general' \| null` |
| `paymentStatus` | unchanged — `'added' \| 'missing' \| 'unknown' \| null` | unchanged |
| `showAboveAllowanceWarning` | unchanged — connected, `limit > ALLOWANCE`, `paymentStatus !== 'added'` | unchanged |

🔴 **`'general'` replaces `'unknown'` because the old wording was a guess dressed as advice.** It read
*"If you haven't added a payment method…"* — a conditional about the operator's account that we have
never checked. The general wording states the requirement instead: *"Replies beyond that need a payment
method on your WhatsApp account; without one, Meta stops all replies once the free ones are used."*

⚠️ **The warning and the row are now independent, and that pairing is the live one:** at 2,000 with
`unknown` payment the **warning shows** and the **row does not**. Asserted directly (§b).

### Markup — `app/manage/[token]/page.tsx`

- **Payment row:** the grey pill and its link are **deleted**. Two variants remain — green
  "Payment method added" with no link, and amber "No payment method added" with **Add in WhatsApp
  Manager**.
- **Expander:** the approved paragraph is **untouched**; it now ends with two links — **See Meta's
  pricing** and **Add a payment method in WhatsApp Manager**. 🔴 That second link is why deleting the
  grey row costs nothing: the action it carried is still one click away, in the place someone reading
  *how Meta charges* would look for it.
- **Warning:** both variants now carry a link — "Add in WhatsApp Manager" for `missing`, "Add a payment
  method" for `general`. `whitespace-nowrap` so the link does not break mid-phrase on a phone.

---

## PROOFS

### (a)/(b) The harness, and three broken variants first

```
── PAYMENT-ROW VARIANTS: each MUST report FAILURE ──
  ✓ FAILED as required  V1 the payment row shows for "unknown"
        caught: 🔴 payment row: HIDDEN for unknown — the live state for every connection
  ✓ FAILED as required  V2 the variant is "missing" for "unknown"
        caught: …variant at 2000 / unknown
  ✓ FAILED as required  V3 the warning shows when the method is "added"
        caught: warning at 2000 / payment added -> false
```

New and updated cases: the row for `added` / `missing` / `null` / `undefined` / no-connection; the
variant across **five limits × three payment states**; and the independence case above.

⚠️ **One existing assertion changed expectation, not just wording:** the variant check previously expected
`aboveAllowanceWarningVariant === status`, which held while the variant mirrored `paymentStatus`. With
`'unknown'` now mapping to `'general'` it expects
`status === 'missing' ? 'missing' : 'general'`. That is the brief's rule, stated here so it is not
mistaken for a loosened test — V2 exists precisely to prove the new expectation bites.

### (c) All three harnesses

| Harness | Result |
|---|---|
| `whatsapp-settings-row-harness.cjs` | ✅ **all 131 passed** |
| `whatsapp-connection-view-harness.cjs` | ✅ **all 87 passed** |
| `whatsapp-setup-machine-harness.cjs` | ✅ **all 30 passed** |

### (d) Copy

| String | Count | Note |
|---|---|---|
| `Check in WhatsApp Manager` | **0** | deleted |
| `If you haven't added a payment method` | **0** | the old guess wording, deleted |
| `Not checked` | **1** | ⚠️ **a comment only**, at `:10232`, explaining why the pill went. The rendered pill is gone. |
| `Add a payment method in WhatsApp Manager` | 1 | the expander's new link |
| `Replies beyond that need a payment method on your WhatsApp account` | 1 | the general warning |
| `No payment method added` / `Payment method added` | 1 each | the two pills |
| `Add in WhatsApp Manager` | **2** | the payment row's link `:10248` **and** the warning's missing-variant label `:10303` — both required |

🟢 **The approved expander paragraph is byte-identical** — 1 occurrence, unchanged, with its bold line.

⚠️ Two of my first searches printed **0** for strings that are present (`See Meta's pricing`, which the
source spells `See Meta&apos;s pricing`, and `Add a payment method<`, whose text is followed by a
newline). **Recorded rather than quietly re-run**: a zero that is really a broken pattern is this
project's recurring failure, and both were confirmed present at `:10277` and `:10303`.

### (e) What each proof would look like if it proved nothing

| Proof | If it proved nothing | How that was ruled out |
|---|---|---|
| **Row hidden for unknown** | Asserting it shows for `added` only — true of a row that shows for everything. | `null` and `undefined` are asserted **false** and V1 forces them true. |
| **Variant selection** | Testing only `missing`, where old and new rules agree. | The 5 × 3 grid covers `unknown` at every limit; V2 gives it `'missing'` and is caught at 2000 and 5000. |
| **Warning unchanged** | Not testing it at all, since the brief said keep it. | Re-asserted across the grid; V3 makes `added` warn and is caught. |
| **Row and warning independent** | Testing each alone — both can be right separately and wrong together. | One assertion checks both at 2,000/unknown in the same breath. |
| **Approved text unchanged** | Eyeballing it. | Matched as a whole whitespace-collapsed string; 1 occurrence. |
| **Deleted strings gone** | A zero from a broken pattern. | A positive control (`How Meta charges` → 1) in the same run, and the two zeros that *were* my pattern are named above. |

### (f) TypeScript and lint

- **tsc clean.**
- **Lint**, the two changed source files, same eslint and config, HEAD in a detached worktree:
  **283 errors / 75 warnings on both sides, every rule count identical.**

### (g) What I cannot prove, and your checklist

**Cannot prove:** appearance, and that WhatsApp Manager's own wording matches these labels.

| # | Do | Expect |
|---|---|---|
| 1 | **Test truck, limit 1,000** | Billing: the summary line and the collapsed expander. 🔴 **No payment row** (payment is `unknown`) and **no amber warning**. |
| 2 | **Change the limit to 2,000** | 🔴 The amber warning appears with the **general** wording — *"Replies beyond that need a payment method…"* — followed by an **Add a payment method** link. 🔴 **Still no payment row.** |
| 3 | **Open "How Meta charges"** | The original paragraph, then **two** links: **See Meta's pricing** and **Add a payment method in WhatsApp Manager**. |
| 4 | **Click each of the three links** | All open in a **new tab**: the two in the expander and the one in the warning. |
| 5 | **Narrow (~375px), limit 2,000** | The warning wraps as a paragraph and its link does **not** break mid-phrase; no horizontal scroll. |
| 6 | **Back to 1,000** | The warning disappears. |
| 7 | **Gusto** | Unchanged — nothing in this workstream touches the else branch. |

⚠️ **The `added` and `missing` pills cannot be seen today**, because nothing writes the column. They are
proved by the harness and will first appear in the workstream that populates `payment_method_present`.

---

## FINISH

```
$ git diff --stat
 app/manage/[token]/page.tsx                  | 461 +++++++++++++++------------
 lib/whatsapp/connection-read.ts              |   8 +
 lib/whatsapp/connection-view.ts              |  60 +++-
 scripts/whatsapp-connection-view-harness.cjs |   7 +-
 scripts/whatsapp-settings-row-harness.cjs    | 144 ++++++++-
 5 files changed, 461 insertions(+), 219 deletions(-)
```

| File | Reason (this workstream) |
|---|---|
| `lib/whatsapp/connection-view.ts` | `showBillingPaymentRow` excludes `'unknown'`; the variant becomes `'missing' \| 'general'` |
| `app/manage/[token]/page.tsx` | grey pill and its link deleted; second link in the expander; both warning variants reworded and linked |
| `scripts/whatsapp-settings-row-harness.cjs` | new row and variant rules, plus three broken variants |
| `lib/whatsapp/connection-read.ts` | ⚠️ **unchanged here** — carried from the previous workstream |
| `scripts/whatsapp-connection-view-harness.cjs` | ⚠️ **unchanged here** — carried from the previous workstream |

**Not changed:** `payment_method_present` writes (still null), the webhook, `reply-cap.ts`, `usage.ts`,
`disconnect-plan.ts`, `inbound-route.ts`, `setup-preview.ts`, `setup-machine.ts`, `lib/whatsapp-live.ts`,
the Instagram and Messenger boxes, and the else branch.

**No SQL appears in this report.**
