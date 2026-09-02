# Checkout — parsing a response before checking it

**Fixed. NOT deployed, NOT committed. One file: `app/trucks/[slug]/order/page.tsx` (+25 −1).**

---

## VERIFICATION

**EXECUTION.** The old and new branches were run in Node against a **real `Response`** carrying a
platform 504's HTML body, and against each non-ok JSON branch the page relies on. **8 assertions, 0
failing**, and the old branch is shown leaking the parser text — so the case is demonstrated failing
before it is shown fixed.

**`npx tsc --noEmit` is clean — SANITY ONLY, not verification.**

🔴 **NOT MEASURED: the rendered checkout.** The customer page is client-rendered and I did not drive a
real order through it.

**No span of the prompt arrived garbled.**

---

## 1 · The fix

**`app/trucks/[slug]/order/page.tsx`, the submit handler:**

```diff
-      const data = await res.json()
+      const data = await res.json().catch(() => null)
+      if (data === null) throw new Error(SUBMIT_UNCONFIRMED)
```

🔴 **`null` ONLY WHEN THE BODY IS NOT JSON — deliberately not "on every non-ok".** The 423 (paused), 403
(event ended) and 503 (card unavailable) branches below it are **non-ok responses that DO carry JSON**
and must keep working byte-for-byte. **This changes only the case where our route never answered at all.**

### Measured

```
BEFORE the customer sees: "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"
AFTER  the customer sees: "We couldn’t confirm your order went through. It may already be
                           on the truck’s screen — please check with them before ordering again."
```

| Assertion | Result |
|---|---|
| No parser text in the new message | ✅ PASS |
| No status code in the new message | ✅ PASS |
| **The old branch did leak the parser text** | ✅ **PASS — the defect reproduced** |
| 423 paused still parses | ✅ PASS |
| 403 event-ended still parses | ✅ PASS |
| 503 cardUnavailable still parses | ✅ PASS |
| 200 success still parses | ✅ PASS |

---

## 2 · 🔴 The wording — proposed, for your approval

> **We couldn't confirm your order went through. It may already be on the truck's screen — please check
> with them before ordering again.**

**Why this and not "your order failed", established from `app/api/orders/submit/route.ts`:**

| Branch | What a timeout leaves behind |
|---|---|
| **Pay at the truck** | 🔴 **The order row is INSERTED by this route.** A timeout after that point leaves **a real order on the operator's board** while the customer was told nothing. **"Your order failed" would send them to re-order something the kitchen is already making** |
| **Card** | `:846` — *"THE ONLY SUCCESSFUL EXIT ON THIS BRANCH, AND IT CREATES NO ORDER. The browser mounts a Payment Element from `clientSecret`; Stripe authorises; the webhook promotes the draft."* The customer **never reaches the Payment Element**, so nothing is confirmed |

> **We cannot tell which happened from the browser, so the copy admits it and gives the one action that
> is right either way.**

**What it deliberately does not say:**

- ❌ **"Your order failed"** — false on the pay-at-truck branch.
- ❌ **"Your order was placed"** — false on the card branch.
- ❌ **"You may have been charged"** — ⚠️ **I considered and rejected this.** On the card branch the
  intent is created but **never confirmed**, so no money moves; on pay-at-truck they pay at the hatch.
  **Warning about a charge that the code says cannot have happened would be its own false alarm.**
- ❌ Any status code, any parser text, the word "error".

⚠️ **It is in the code as working text so the path is not left broken. Treat it as proposed — say the
word and I will change it.**

---

## 3 · Every other parse-before-check on this path

**All 11 `.json()` call sites on `app/trucks/[slug]/order/page.tsx`, audited individually.**

| Line | What | Guarded before? | Action |
|---|---|---|---|
| **733** | `/api/slots` | 🔴 **NO** | ✅ **FIXED** — `if (!res.ok) throw` before the parse |
| 849 | Order confirmation lookup | ✅ Yes — `if (!r.ok)` at `:841` → *"We couldn't find that order."* | none |
| 915 | Events list | ✅ Yes — `if (!res.ok) throw` at `:914` | none |
| 982 | Menu, error body | ✅ Yes — `.json().catch(() => ({}))` | none |
| 985 | Menu, success body | ✅ Yes — behind `if (!r.ok)` at `:981` | none |
| 1030 | Menu poll | ✅ Yes — inside `if (r.ok)` | none |
| 1034 | Menu poll, error body | ✅ Yes — `.catch(() => ({}))` | none |
| 1833 | — | ✅ Yes — `r.ok ? await r.json() : null` | none |
| 1870 | — | ✅ Yes — `r.ok ? r.json() : null` | none |
| **1987** | 🔴 **`/api/orders/submit`** | 🔴 **NO** | ✅ **FIXED** |
| 2051 | — | ✅ Yes — `r.ok ? r.json() : null` | none |

> **Two unguarded, both fixed. Nine already correct.**

⚠️ **:733 was never customer-visible** — its throw lands in `catch { setAvailableSlots([]) }` (`:741`),
which degrades to "no slots". **Fixed anyway: an explicit guard is what stops that being luck rather than
design.**

⚠️ **:915 throws `HTTP ${res.status}` — a status code — but it lands in a bare `catch {}` (`:939`) and
never reaches the customer.** Left alone; changing it would be churn.

---

## 4 · What the operator sees, and what there is to reconcile

**It depends entirely on which branch the customer was on, and they are not the same problem.**

| | **Pay at the truck** | **Card** |
|---|---|---|
| **Does the order exist?** | 🔴 **YES, if the timeout came after the insert.** The row is written by this route | ❌ **No.** `:846` — this branch creates no order; the webhook does, after the customer completes payment |
| **Is it visible to the operator?** | ✅ **Yes — a completely ordinary order on the board.** Nothing marks it as having had a failed response | n/a |
| **Money?** | None yet — they pay at the hatch | 🔴 **None.** The Payment Element never mounts, so the intent is never confirmed |
| **To reconcile** | ⚠️ **A possible duplicate** if the customer re-orders. **This is exactly what the copy is trying to prevent** | An **orphaned draft** and an **unconfirmed PaymentIntent**. No money, no order, nothing the operator sees |

> 🔴 **THE OPERATOR HAS NO SIGNAL THAT THIS HAPPENED.** On the pay-at-truck branch the order looks normal;
> on the card branch nothing appears at all. **If a customer says "I'm not sure it went through", the
> operator's board is the only place to check — which is precisely what the copy tells them to do.**

⚠️ **A duplicate is not prevented by anything here.** `order_key` is client-minted per attempt, so a
customer who re-orders creates a genuinely separate order. **The copy is the only mitigation, and it is a
mitigation rather than a fix.**

---

## 5 · Scope

| | |
|---|---|
| **Files changed** | 🔴 **`app/trucks/[slug]/order/page.tsx` ONLY** (+25 −1) |
| `maxDuration` | ✅ **Untouched by this task** (`orders/submit/route.ts`'s diff is the prior task's explicit 300) |
| The Stripe client | ✅ **UNTOUCHED** — `lib/payments/authorize.ts` clean |
| Order submission logic | ✅ **Untouched** — the request, the body, every branch and the success path are unchanged; only the failure classification moved |

---

## What I could not establish

1. 🔴 **That a Vercel 504 body is HTML in every case.** I used a representative HTML error page. ⚠️ **The
   fix does not depend on it** — it triggers on *any* non-JSON body, whatever the platform sends.
2. 🔴 **That the rendered checkout shows this message correctly.** **Not driven end-to-end.** The message
   goes to `setError`, which the page's own comment calls "page-replacing" — **I have not seen that screen
   with this text in it.**
3. **Whether a card-branch timeout can ever leave a confirmed intent.** **Read from `:846` that the
   Element never mounts**; I did not test a race where the customer had already begun payment on a retry.
4. **How often this actually fires.** Nothing logs it — a customer hitting it is invisible to us, which is
   the same blind spot the failure-mode review recorded.
