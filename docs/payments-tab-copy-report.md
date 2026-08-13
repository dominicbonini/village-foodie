# Payments tab copy — the live-mode sentence removed, the action renamed

Date: 13 August 2026
Status: BUILT. **Two files changed** — [components/manage/PaymentsTab.tsx](components/manage/PaymentsTab.tsx)
and [lib/settings-copy.ts](lib/settings-copy.ts). `tsc --noEmit` clean. **26 of 26 assertions pass.**
Neither file gained a non-ASCII character class.

No `next dev`, no `next build`, no commit, no deploy, no migration. **Values only — no action, route,
constant name or any other code identifier was renamed.** `requireOwner`, the admin read-only access,
the Connect flow and the three-way copy split are untouched.

⚠️ Your first message asked to rename *"Setup Stripe"* to *"Setup Online Payments"*; the follow-up
corrected it to **"Set up online payments"**. I built the follow-up's wording — it is the correct verb
form ("set up" is the action, "setup" the noun) and it matches the section heading. Flagging it only so
you know which of the two I acted on.

Nothing else in the prompt arrived garbled. No instruction contradicted another.

---

## 1. THE LIVE SENTENCE — REMOVED. THE TEST ONE — KEPT, AND HERE IS WHY

**Removed, verbatim:**

> Live mode. Connecting here creates a real Stripe account in your name, and customer payments will
> reach your own bank.

Along with its entire `{serverLivemode === true && (…)}` branch.

### 🔴 Recommendation on the test variant: KEEP IT. That is what I did.

They look symmetrical and they are not. The asymmetry is the whole argument:

- **Live is the state an operator is entitled to assume.** The product exists to take real payments; a
  sentence confirming that tells them nothing they had not already concluded from the section body
  ("money goes straight to your own Stripe account"), the card ("You'll need your bank details and ID")
  and the button. It restated its surroundings, which is exactly your reason for cutting it.
- **Test is the surprising state.** The onboarding is real, the form asks for real bank details and real
  photo ID, and at the end of it **no customer money can move**. Nothing else anywhere on the page says
  so. That is information, not restatement.

So removing one and keeping the other is not inconsistent — it is the same test applied twice and
answered differently.

⚠️ **One consequence worth stating: absence now means "not test", not "unknown".** A null mode (an
unrecognised key prefix, or a `status` response from before the field existed) renders nothing —
identically to live. So the only claim this line ever makes is the cautious one. A missing warning about
test mode is the failure worth having; a false one is not.

**After the change** (`PaymentsTab.tsx`):

```tsx
{serverLivemode === false && (
  <p className="text-[11px] text-slate-400 mt-3">Test mode. No real payments can be taken yet.</p>
)}
```

---

## 2. EVERY STRING THAT NAMES THIS ACTION — FOUND, AND WHAT EACH NOW SAYS

I swept `PaymentsTab.tsx`, `lib/settings-copy.ts`, `lib/email.ts` and the Manage shell.

### Changed — 6 strings across 2 files

| # | Where | Before | After |
|---|---|---|---|
| 1 | Button label | `Connect Stripe` | **`Set up online payments`** |
| 2 | Button, in flight | `Connecting…` | **`Setting up…`** |
| 3 | `HEADER.not_connected.title` — the card | `Not connected` | **`Not set up`** |
| 4 | `HEADER.not_connected.chip` — the status pill | `Not connected` | **`Not set up`** |
| 5 | Admin read-only note | `This truck has not connected Stripe. Only the owner can start it…` | **`This truck has not set up online payments. Only the owner can start it…`** |
| 6 | Trial reassurance (`lib/settings-copy.ts`) | `Connecting doesn't start your subscription or charge you anything today…` | **`Setting this up doesn't start your subscription or charge you anything today…`** |

⚠️ **#6 is the second file**, and it renders directly above the button on this tab (its only consumer —
`grep` confirms one import, one use). A reassurance naming a different verb from the control it is
reassuring about reads as being about something else. **Nothing else in that string moved:** still two
short sentences, still no numbers, still scoped to "today", plan still named as separate — every
documented invariant intact. **The constant's NAME is unchanged**, per your "identifiers, no".

### Found and deliberately NOT changed

| Where | Value | Why it stays |
|---|---|---|
| Section heading | `Online payments` | Already the phrase the button now matches. |
| `HEADER.requirements` | `Stripe needs your details` / `Action needed` | Describes **Stripe's** state, not this action — and its wording was settled by a documented 10 August correction. |
| `HEADER.pending` | `Connected — Stripe is checking your details` / `Checking` | Describes the **account's** condition. |
| `HEADER.ready` | `Connected` / `Ready` | Same. |
| `HEADER.restricted` / `unsupported` | `Card payments paused` / `Paused`, `Card payments aren't available…` / `Unavailable` | Same. |
| Toast on success | `Already set up — continuing` / `Now add your details for Stripe` | 🔴 **Already consistent** — "set up" was the verb here before this change. |
| 403 card | `Only the truck's owner can set up payments` | 🔴 **Protected by item 5** — and already reads compatibly. |
| Manage shell banner | `Stripe needs something from you` | The `requirements` state, not this action. |
| `lib/email.ts` | — | 🔴 **No email names this action at all.** Nothing to change. |

### ⚠️ ONE RESIDUAL INCONSISTENCY, REPORTED RATHER THAN SILENTLY FIXED

The status pills now read as a clean progression — **Not set up → Action needed → Checking → Ready** —
but two card *titles* still say **"Connected"** (`pending` and `ready`). Strictly, "Not set up" should
resolve to "Set up", not "Connected".

I left them because they describe the account rather than the act, and because rewriting four
deliberated states to match a button label is a larger copy decision than you asked for. **Say the word
and I will align them** — `ready.title` is the one that reads oddest against the new button.

### 🔴 THE RENAME REVERSES A DOCUMENTED DECISION — STATED, NOT BURIED

The code carried this, from 10 August 2026:

> **THE LABEL STAYS "Connect Stripe". DO NOT GENERICISE IT.** A generic "Connect payments" was
> considered and rejected. Pressing this hands the operator straight to STRIPE'S OWN embedded form
> asking for bank details and photo ID — and a button that did not name Stripe, opening a stranger's
> identity check, is MORE alarming than one that did.

I have done what that note forbids, on your instruction, and **rewritten the comment to record the
reversal and keep the old argument verbatim** rather than delete it. What blunts the original risk: the
provider is still named twice within a few lines — the section body says money "goes straight to your own
Stripe account", and the card body names the bank details and ID it will ask for. So the next screen is
still explained; the button is simply no longer the thing explaining it. **The invariant worth preserving
if this is ever revisited is that something within a glance of the button names Stripe** — that, not the
label, is what the original note was protecting. The comment now says so.

---

## 3. 🔴 THE MISMATCH GUARD — UNTOUCHED. QUOTED AFTER THE CHANGE

**The predicate:**

```tsx
const publishableLivemode: boolean | null =
  typeof publishableKey !== 'string' ? null
    : publishableKey.startsWith('pk_live_') ? true
    : publishableKey.startsWith('pk_test_') ? false
    : null
const serverLivemode = status?.livemode ?? null
const keyModeMismatch =
  typeof serverLivemode === 'boolean'
  && typeof publishableLivemode === 'boolean'
  && serverLivemode !== publishableLivemode
```

**The card:**

```tsx
{keyModeMismatch && (
  <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-4">
    <p className="text-sm font-semibold text-red-800">Stripe keys do not match</p>
    <p className="text-xs text-slate-600 mt-1">
      This site's server is using its <strong>{serverLivemode ? 'live' : 'test'}</strong> Stripe key
      while the browser was built with the <strong>{publishableLivemode ? 'live' : 'test'}</strong> one.
      Card payments would fail at the moment a customer tries to pay, so setting up Stripe is
      blocked until they agree.
    </p>
    …
  </div>
)}
```

**The disabled button:**

```tsx
disabled={creating || !!configError || keyModeMismatch}
```

✅ **Confirmed untouched** — predicate, card, copy, red styling and the disabler are byte-identical, and
it remains the only red card on the tab. All five asserted.

---

## 4. WHAT `platformKeyLivemode()` IS STILL FOR

**It is not dead, and the mismatch guard is precisely why.**

| Consumer | Still live? |
|---|---|
| `app/api/stripe/connect/route.ts` — both `status` returns send `livemode: platformKeyLivemode()` | ✅ yes, **2 call sites** |
| `lib/stripe/connect.ts:142` — `describeAccountModeMismatch` calls it internally | ✅ yes |
| Client — `const serverLivemode = status?.livemode ?? null` | ✅ yes |
| — the **test-mode line** (`serverLivemode === false`) | ✅ yes |
| — the **mismatch predicate** (`serverLivemode !== publishableLivemode`) | 🔴 **yes, and this is the load-bearing one** |
| — the **mismatch card's own copy** (`{serverLivemode ? 'live' : 'test'}`) | ✅ yes |

🔴 **The mismatch guard cannot work without it.** The browser holds only the publishable key; the server's
secret-key mode is unknowable client-side, so `status.livemode` is the *only* way one of the two values
in the comparison reaches the browser. Removing the live sentence took away one consumer of four.

---

## 5. THE THREE-WAY COPY SPLIT — UNAFFECTED

All three asserted present and unchanged:

| Case | Trigger | Headline |
|---|---|---|
| Permissions | HTTP 403 | `Only the truck's owner can set up payments` |
| Configuration | `keyMissing` | `Card payments aren't configured yet` |
| Reachability | any other failure | `We couldn't check this truck's Stripe account` |

The classifier is unchanged too: `if ((e as PostError)?.status === 403) setPermissionError(…)`.

---

## 6. VERIFICATION — THE RENDERED CARD IN EACH STATE

**Live key** (`sk_live_` server, `pk_live_` bundle), truck not connected:

```
  Online payments
  Customers pay by card when they order. Money goes straight to your own Stripe account — we never hold it.
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Not set up                                          [ Not set up ]   │
  │ Takes about 10 minutes. You'll need your bank details and ID.        │
  │ (trial only) Setting this up doesn't start your subscription…        │
  │ [ Set up online payments ]                                           │
  │ Stripe charges 1.5% + 20p per payment on standard UK cards…          │
  └──────────────────────────────────────────────────────────────────────┘
                        ↑ no mode line at all
```

**Test key** (`sk_test_` server, `pk_test_` bundle):

```
  … identical, plus, below the fee line:
      Test mode. No real payments can be taken yet.        (text-[11px] slate-400)
```

**Mismatch** (server and bundle in different modes):

```
  ┌── red ───────────────────────────────────────────────────────────────┐
  │ Stripe keys do not match                                             │
  │ This site's server is using its live Stripe key while the browser    │
  │ was built with the test one. Card payments would fail at the moment  │
  │ a customer tries to pay, so setting up Stripe is blocked until they  │
  │ agree.                                                               │
  └──────────────────────────────────────────────────────────────────────┘
  … then the card as above, with [ Set up online payments ] DISABLED
```

### Assertions — 26 of 26

Live sentence gone (3) · mismatch guard intact (5) · `platformKeyLivemode` consumers (3) · three-way
split (4) · renamed strings and what stayed (11). Plus: **no code identifier renamed** —
`CONNECTING_STRIPE_NOT_A_COMMITMENT`, `create_account` and `/api/stripe/connect` all verified present.

### ⚠️ TWO FALSE FAILURES, AND THE FIX WAS THE HARNESS ITSELF

The first run reported two failures; both were my comment-stripper, checked against the source before
being dismissed:

1. *"no executable live-mode sentence"* — the sentence survives **only inside the comment** recording
   what was removed (line 517). My filter keyed on how a line *starts* and that line starts with a digit
   (`2026): it read "Live mode…`), so it was treated as code.
2. *"trial reassurance"* — the filter stripped lines beginning with `"`, which is exactly how the
   constant's genuine code line begins.

🔴 **This is the fourth consecutive turn where an assertion matched documentation rather than code.** I
have stopped patching the symptom and replaced the line heuristic with a real block-aware stripper
(`/* … */` and `//`), which handles JSX comments and quote-leading code correctly. It should not recur.

---

## 7. NON-ASCII CENSUS

| File | Classes before | Classes after | Gained |
|---|---|---|---|
| `components/manage/PaymentsTab.tsx` | 10 | 10 | **none** |
| `lib/settings-copy.ts` | 8 | 8 | **none** |
| `app/api/stripe/connect/route.ts` | 8 | 8 | **none** (untouched this turn) |

---

## 8. WHAT WAS NOT TOUCHED

- **`requireOwner`**, the platform-admin read-only access (`requirePlatformAdmin`,
  `ADMIN_READABLE_ACTIONS`, the ADMIN_READ_ONLY refusal) — asserted unchanged.
- **The Connect flow** — `createAccount`, `create_account`, `createConnectedAccount`, the persist, the
  posture read, the domain registration: unchanged. Only the button's *label* moved.
- **Code identifiers** — no action name, route path, constant name, state name or prop renamed.
  `CONNECTING_STRIPE_NOT_A_COMMITMENT` keeps its name despite its value changing, deliberately.
- **The four other `HEADER` states**, the toasts, the section heading, the Manage shell banner, the
  walk-up section and the Billing tab.
- **`app/api/stripe/connect/route.ts`** — not edited this turn; it already sent `livemode` on both
  `status` returns and still does.
