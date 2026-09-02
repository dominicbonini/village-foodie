# Checkout — splitting the "no answer" message by payment branch

**Built. NOT deployed, NOT committed. One file: `app/trucks/[slug]/order/page.tsx` (+45 −2).**

---

## VERIFICATION

**EXECUTION.** 15 assertions in Node against real `Response` objects — a non-JSON 504 on each branch,
the retry case, the copy constraints, and all four JSON branches. **0 failing.** **A mutant with the
retry guard removed fails 2**, so the softening is measured rather than asserted.

**`npx tsc --noEmit` clean — SANITY ONLY, not verification.**
🔴 **The rendered checkout was not driven end-to-end.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 1 · What the page knows at the response handler — ✅ THE GATE IS PASSED, with one correction

**The variable is `payByCard`** — `app/trucks/[slug]/order/page.tsx:425`,
`const [payByCard, setPayByCard] = useState(true)`. It is sent at **`:1994`** as
`payByCard: !!(payByCard && truck?.card_payments_ready)`.

### 🔴 But reading it AT the response handler would have been wrong

**`payByCard` is state, and the radio at `:3630` can move it while the request is in flight.** Reading it
in the failure branch could describe a branch the customer switched to *after* submitting.

> ✅ **Fixed by capturing at SEND time** — `const sentByCard = !!(payByCard && truck?.card_payments_ready)`
> immediately before the `fetch`, used for **both** the request body and the failure message. **The
> message now describes the branch that was actually sent.**

### And the server honours it — verified by walking the block, not by reading the comment

🔴 **`if (payByCard === true)` at `submit/route.ts:743` is a CLOSED BRANCH.** I walked it brace-by-brace:
lines **743-857**, containing **four `return`s** (`:769`, `:819`, `:840`, `:850`), with the terminal one
at **`:850` unconditional**, immediately before the closing brace.

> **No path leaves that block without returning, so a `payByCard: true` request can NEVER reach the
> order-creating code below it.**

⚠️ **THIS CONTRADICTS THE ROUTE'S OWN COMMENT, AND THE COMMENT IS WRONG.** `:739-742` says: *"it does NOT
refuse the order. It falls through to the pay-at-hatch path below."* **It does not fall through** — both
failure paths return a 503 `cardUnavailable` (`:819`, `:840`). **A stale comment, and the whole change
depended on not believing it.**

---

## 2 · 🔴 The two strings — proposed, for your approval

**A — pay at the truck, and any card retry (see §3):**

> **We couldn't confirm your order went through. It may already be on the truck's screen — please check
> with them before ordering again.**

**B — card, first attempt only:**

> **We couldn't place your order. You haven't been charged and no order was created — please try again.**

**Selection:** `sentByCard && !hadPriorPayment ? B : A`.

**What B rests on, and nothing more:**

| Claim | Evidence |
|---|---|
| *"no order was created"* | `:846` — *"THE ONLY SUCCESSFUL EXIT ON THIS BRANCH, AND IT CREATES NO ORDER"* — plus the closed-branch walk above |
| *"you haven't been charged"* | The response never arrived, so the browser **never mounted the Payment Element**; the intent is created but never confirmed. **An unconfirmed PaymentIntent moves no money and places no hold** |

⚠️ **Neither string contains a status code, parser text, or the word "error"** — asserted by the harness,
not by eye.
⚠️ **House precedent exists:** `:1877` already says *"No money has been taken."* on a failed card start.

⚠️ **In the code as working text so the path is not left broken. Treat both as proposed.**

---

## 3 · 🔴 What could make the card claim FALSE — one path found, and the copy softened

**I said last time I had not established the retry race. I have now, and it is real.**

**`payment` (`:375`) is set ONLY at `:2107`, inside the success handler of a PREVIOUS submit that returned
a `clientSecret`.** So when `payment` is non-null:

1. The customer **has already been shown a Payment Element**.
2. They **may have completed payment on it**.
3. 🔴 **The server explicitly contemplates this:** the supersede logic at `:758` guards on
   `!prior.promoted_at` — *"Skipped silently when the draft is already promoted"* (`:754-755`). **A
   promoted draft is a paid one.**

> 🔴 **SO ON A RETRY, "you haven't been charged" COULD BE FALSE. The strong claim is withheld:
> `!hadPriorPayment` gates it, and a card retry gets message A instead.** **Measured — and a mutant
> without that guard fails the case.**

**Other paths considered and ruled out:**

| Path | Verdict |
|---|---|
| The `:739-742` "falls through to pay-at-hatch" | ❌ **Not implemented** — the block always returns (§1) |
| A timeout after `authorizeDraft` succeeded | ✅ Intent exists, **unconfirmed** — no money, no order |
| The webhook promoting a draft | ✅ Fires only on payment success, which cannot have happened |
| Request never reached the server | ✅ Nothing happened at all |

⚠️ **STILL UNESTABLISHED: whether an unconfirmed manual-capture intent can ever surface as a pending
line on a customer's statement.** I reason not — there is no payment method attached until the Element
confirms — **but I have not tested it against a real card, and B's phrasing is "you haven't been charged",
not "nothing will appear on your statement".**

---

## 4 · The `.catch(() => null)` discrimination — unchanged

✅ **Kept exactly.** `const data = await res.json().catch(() => null)`, and the throw fires only on
`data === null` — **the body was not JSON at all**.

🔴 **NOT converted to a blanket `!res.ok` guard**, as instructed. **Measured: 423 paused, 403 event-ended
and 503 cardUnavailable are all non-ok responses carrying JSON, and all four (with 200) still parse
byte-for-byte into the existing branches.**

---

## 5 · What the operator sees — unchanged, and what to do differently

| | Pay at the truck | Card |
|---|---|---|
| **Order exists?** | 🔴 **Possibly yes** — this route inserts it | ❌ **No** |
| **Visible?** | ✅ **An ordinary order on the board.** Nothing marks it | Nothing appears |
| **Money** | None yet — paid at the hatch | 🔴 **None** — intent unconfirmed |
| **To reconcile** | ⚠️ A possible duplicate if the customer re-orders | An orphaned draft + unconfirmed intent. Invisible |

### Does the new copy change what an operator should do?

> ✅ **YES, and it narrows the job.**

- **Before:** every affected customer was told *"check with the truck"*, including card customers with
  **nothing to find** — the operator would search a board for an order that could not exist.
- **After:** only customers whose order **might genuinely be on the board** are sent to the hatch. A card
  customer on a first attempt is told to try again and does not approach the operator at all.
- ⚠️ **Unchanged: the operator still has no signal this happened**, and nothing prevents a duplicate —
  `order_key` is minted per attempt. **The copy is the only mitigation.**

---

## 6 · `/api/slots` at `:733` — untouched

✅ Left exactly as built last task: `if (!res.ok) throw new Error('slots unavailable')` (now at `:759`
after the insertions above it).

---

## 7 · The measurement

| # | Case | Result |
|---|---|---|
| 1 | Non-JSON 504, **pay at the truck** | ✅ message **A** |
| 2 | Non-JSON 504, **card, first attempt** | ✅ message **B** — 🔴 **and BEFORE is shown giving the wrong branch's message**, which is the defect |
| 3 | Non-JSON 504, **card, retry with a prior payment** | ✅ **A** — the no-charge claim withheld; asserted absent, not just different |
| 4 | Copy constraints ×6 | ✅ no parser text, no status code, no "error", both strings |
| 5 | 423 / 403 / 503 / 200 JSON | ✅ all four still parse into the same branches |
| | **TOTAL** | ✅ **15 assertions, 0 failing** |

**Mutation:** removing `!hadPriorPayment` → **case 3 fails both assertions.** ⚠️ **Without this, "0
failing" would prove nothing about the softening.**

---

## 8 · Scope

| | |
|---|---|
| **Files changed** | 🔴 **`app/trucks/[slug]/order/page.tsx` ONLY** (+45 −2) |
| `maxDuration` | ✅ **Untouched.** `submit/route.ts`'s diff is the prior task's comment + `export const maxDuration = 300`, **verified line by line as comment-only** |
| The Stripe client | ✅ **UNTOUCHED** — `lib/payments/authorize.ts` clean |
| Submission logic | ✅ **Untouched.** The request, its body, every branch and the success path are unchanged; only the failure classification and the `payByCard` value's *capture point* moved |

### ⚠️ One blemish I introduced in the PREVIOUS task, reported not fixed

**Four route files carry literal `\u{1F534}` / `\u{26A0}` escape text in the comments I added:**
`app/api/heartbeat/route.ts`, `app/api/menu/[truckId]/route.ts`, `app/api/dashboard/action/route.ts`,
`app/api/orders/submit/route.ts`.

**Cosmetic — comments only, no behaviour — but wrong.** 🔴 **NOT fixed here: "change nothing else" and
"do not touch maxDuration" put those lines out of this task's scope.** **One sed when you want it.**

---

## What I could not establish

1. 🔴 **That the rendered checkout shows either message.** **Not driven end-to-end.** They go to
   `setError`, which the page's own comment calls page-replacing — **I have not seen that screen.**
2. 🔴 **Whether an unconfirmed intent can appear on a statement** (§3). **The residual risk in B**, and
   the reason its wording is about being charged rather than about statements.
3. **Whether `payment` can be non-null from a source other than `:2107`.** I traced the one setter and
   the one clear (`:1861`); I did not audit every path that could revive it.
4. **How often either fires.** Nothing logs it — a customer hitting this is still invisible to us.
