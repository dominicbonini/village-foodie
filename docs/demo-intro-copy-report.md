# The demo introduction's copy: a shorter body, a new heading, and a bullet that names the real button

**Date** 19 September 2026 · **Scope** localhost only, nothing deployed · **Trucks written to: none.**
No page, route or API was called with any truck's token. Pizzeria Gusto was never touched.

**What changed.** `DemoWelcome`'s heading, both body variants, and the first "two things to try" bullet.
The bullet no longer carries a hard-coded label: it is derived from the same settings the order card reads,
because the string it carried — "Mark paid & done" — is one **no demo has ever rendered**.

---

## git status — before

**HEAD `ff28aa6` "demo intro fix" · 0 staged · 0 modified · 0 untracked.** A clean tree.

---

# Every string, before and after

## The heading — `DemoWelcome`

| variant | before | after |
|---|---|---|
| branded | `Here’s your menu` | **`Here’s your demo`** |
| sample truck | `Here’s a sample truck` | **`Here’s a sample demo`** |

**The sample variant does have its own heading**, and §1 asked for the equivalent change. I made it
`Here’s a sample demo` rather than `Here’s your demo`: the file carries a §11 rule that *"a sample truck
must be NAMED as a sample, never 'here's your menu'"*, and a heading that says only "your demo" over a
menu nobody uploaded would break it. `Here’s a sample demo` mirrors the branded heading's new noun while
keeping the word the rule exists to protect. **Flagging it as my reading** — if you want both variants to
read `Here’s your demo`, it is one string.

## The body

**Branded, after — exactly:**

> This is your own menu and branding, on a real board. The orders already on it are examples, so you can
> see a busy service.

**Sample, after — exactly:**

> This is a **stand-in menu** so you can see how it all works — upload your own any time to make it yours.
> The orders already on it are examples, so you can see a busy service.

Before, both ended `… so you can see a busy service. Nothing here is a real customer.` **That sentence is
removed from both.** The sample variant also loses the word "menu" from "upload your own menu any time",
matching the text you gave.

⚠️ **`stand-in menu` keeps its `<strong>`.** §5 forbids layout changes, and the emphasis was already there;
removing it would restyle the sentence. The visible text is exactly as specified.

## The bullet

| | |
|---|---|
| before | Hit **Mark paid & done** on an order |
| after | Hit **Mark paid & collected** on an order *(on a demo as provisioned)* |

---

# §4 · What that button is actually called

`OrderCard`'s `completionBtn` chooses the label, and its disabled twin `completionBtnDisabled` repeats the
same branch — with a comment saying so: *"IT DUPLICATES completionBtn's BRANCH AND WILL DRIFT IF ONLY ONE
IS CHANGED."* The branch:

```
paid or a held authorisation → 'Collected'
one press, takes cash        → '💷 Cash & collected' / '💳 Card & collected'   (a PAIR, live button only)
one press                    → 'Mark paid & collected'
part paid                    → 'Mark £X.XX paid'
otherwise                    → 'Mark paid'
```

**The demo's settings**, from `lib/provision-truck.ts`'s `demo` profile:

| setting | value |
|---|---|
| `completionPresses` | **`'one'`** |
| `takesCash` | `false` |
| `showPaidStep` | `false` |

A seeded demo order is `payment_status: 'unpaid'` with no held authorisation, so the first branch does not
apply and the setting decides: **"Mark paid & collected"**. Your screenshots are right, and the
introduction was naming a button that does not exist anywhere in the product.

## The bullet is now DERIVED, not fixed

A demo viewer can change the completion setting in the demo's own Settings tab, so a hard-coded string
would go stale the moment they did. New `lib/order-completion-label.ts` holds the expression once:

```ts
export function completionLabel(a: { paid; heldAuthorisation; completionPresses; partPaid; balanceLabel? }): string
```

- `OrderCard`'s **two** existing sites now call it — closing the drift the file warned about rather than
  adding a third copy of the branch in a file nobody editing `OrderCard` would think to open.
- `DemoWelcome` takes `completionPresses` and `takesCash` as props, resolved by the page from
  `resolvePaidStep(truck, activeEvent)` — the same call `OrderCard` makes — and derives the bullet.

⚠️ **The cash split is deliberately NOT in the helper.** The live button becomes a pair when `takes_cash`
is on and the disabled placeholder does not; the two sites genuinely differ there. Folding cash in would
change what the placeholder renders, which is a behaviour change. `DemoWelcome` resolves cash above the
call, exactly as `OrderCard` does.

**On §5.** I read *"nothing else changes"* as no behavioural change, which is what the list enumerates —
layout, trigger, sessionStorage, other panels. The shared helper changes no rendered output on any path;
the harness asserts the demo's label, the two-press label and the cash label all come out as before. It is
here because §4 asks the bullet to follow the setting rather than be hard-coded, and the honest way to do
that is one expression, not a fourth copy of it.

---

# PROOF

## `scripts/demo-welcome-open.cjs` — extended

**Failure mode:** an introduction that describes a demo the visitor is not looking at — the wrong words, or
a button named that is not on screen.

**All five broken variants ran FIRST and FAILED as required** (V1 and V2 are the previous round's, kept):

```
  ✓ FAILED as required  V1 the flag in localStorage: a new tab on a rebuilt demo shows NO introduction
  ✓ FAILED as required  V2 deferral and self-heal removed: the signup prompt is on screen (true) over an unread introduction (true)
  ✓ FAILED as required  V3 the removed sentence restored: it is on screen again
  ✓ FAILED as required  V4 the old heading: the panel reads "Here’s your menu" again
  ✓ FAILED as required  V5 the bullet hard-coded: it names "Mark paid & done" while the card renders "Mark paid & collected"
```

**The real tree — the new sections:**

```
── THE INTRODUCTION'S COPY ──────────────────────────────────────────────────────────────
  ✓ the branded heading reads "Here’s your demo"
  ✓ the branded body is exactly the new sentence pair: "This is your own menu and branding, on a real board. The orders already on it are examples, so you can see a busy service."
  ✓ and the "Nothing here is a real customer." sentence is gone
  ✓ the sample heading reads "Here’s a sample demo" — still NAMED as a sample (§11)
  ✓ the sample body is exactly the new sentence pair: "This is a stand-in menu so you can see how it all works — upload your own any time to make it yours. The orders already on it are examples, so you can see a busy service."
  ✓ and the removed sentence is gone from this variant too

── THE BULLET NAMES THE BUTTON THAT IS ACTUALLY THERE ───────────────────────────────────
  ✓ a demo is provisioned one-press, and one press reads "Mark paid & collected"
  ✓ the bullet names it: "Hit Mark paid & collected on an order"
  ✓ and no longer says "Mark paid & done", which no demo has ever rendered
  ✓ switching the demo to two presses moves the bullet with it: "Hit Mark paid on an order"
  ✓ and with the cash split on it names the pair's first button, which is what renders then
```

The expected label is **`completionLabel`'s own output**, not a string typed twice — so the assertion is
agreement between the bullet and the card, not a restatement of a guess. The previous round's fourteen
assertions (the flag, the stale flag, the rebuild, the signup prompt, both URLs) all still pass unchanged.

---

# VERIFICATION — true exit codes

| command | exit |
|---|---|
| `node scripts/demo-welcome-open.cjs` | **0** (28 assertions; V1–V5 failed first) |
| `node scripts/run-harnesses.cjs` | **0** — 57 run · 57 passed · 0 failed |
| `npx tsc --noEmit` | **0** |
| `npx next build` | **0** |

**Goldens — unchanged, byte for byte. No generator was run.**

| golden | sha256 |
|---|---|
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` |

## eslint, per rule, against a clean HEAD worktree (`ff28aa6`)

| rule | HEAD | working tree | delta |
|---|---|---|---|
| `@next/next/no-img-element` (warn) | 1 | 1 | 0 |
| `@typescript-eslint/no-explicit-any` (error) | 57 | 57 | 0 |
| `@typescript-eslint/no-require-imports` (error) | 8 | 8 | 0 |
| `@typescript-eslint/no-unused-vars` (warn) | 28 | 28 | 0 |
| `react-hooks/exhaustive-deps` (warn) | 2 | 2 | 0 |
| `react-hooks/immutability` (error) | 1 | 1 | 0 |
| `react-hooks/preserve-manual-memoization` (error) | 3 | 3 | 0 |
| `react-hooks/purity` (error) | 5 | 5 | 0 |
| `react-hooks/refs` (error) | 5 | 5 | 0 |
| `react-hooks/set-state-in-effect` (error) | 9 | 9 | 0 |
| `react/no-unescaped-entities` (error) | 7 | 7 | 0 |

**Zero delta, every rule.** `lib/order-completion-label.ts` lints clean.

---

# Anything I could not establish

- **I did not open a demo in a browser.** The copy is asserted by mounting the real `DemoWelcome` and
  reading its rendered text, which is where the strings live. What a browser would add is the typography,
  not the words.
- **The sample heading is my reading**, not your instruction: you specified the branded heading and asked
  me to report the sample equivalent. `Here’s a sample demo` is what I chose and why is above; say the word
  if you want it to match the branded one exactly.
- **I did not verify the setting on a live demo truck.** `completionPresses: 'one'` is what
  `lib/provision-truck.ts` writes for every demo, and the demo dashboard resolves it through
  `resolvePaidStep`; reading a specific demo truck's row was outside this task's scope, and the bullet now
  follows whatever that row says rather than assuming it.

---

# git status — after

**0 staged · 4 modified · 1 untracked.**

```
 M app/dashboard/[token]/page.tsx        passes the resolved completionPresses/takesCash to DemoWelcome
 M components/dashboard/DemoWelcome.tsx  the heading, both bodies, and a derived bullet
 M components/dashboard/OrderCard.tsx    its two label sites call the shared expression
 M scripts/demo-welcome-open.cjs         the exact new strings, the label agreement, V3–V5
?? lib/order-completion-label.ts         the completion button's words, in one place
```

Plus `docs/demo-intro-copy-report.md`, this report.

Nothing was staged, committed, stashed, reset or restored. The temporary HEAD worktree used for the lint
delta was removed. **No truck row and no demo was written to by this task.**
