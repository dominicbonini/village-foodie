# The WhatsApp Settings row: a monthly limit the operator owns, and a real disconnect

**16 September 2026.** Six files changed, four added. No migration. `WHATSAPP_LIVE` stays false.
tsc clean; lint rule-for-rule identical to HEAD. Nothing staged or committed.

🔴 **Two things changed that were not on the list and needed to be** — the reply/handoff logging order
(§2a) and the `awaiting_payment_method` send gate (§2b). Both are explained where they occur.

---

## 0. TREE STATE BEFORE EDITING

```
$ git status --porcelain=v1   (empty — clean)
$ git rev-parse HEAD          b149f47b822b7c1e4bbd6dfdbae13d61dc1b4276
$ git rev-parse origin/main   b149f47b822b7c1e4bbd6dfdbae13d61dc1b4276
```

---

## 1. WHAT I READ BEFORE EDITING

### 1a. The cap, its windows, and what actually counted

`lib/whatsapp/reply-cap.ts` had **three** windows and two module-scope ceilings:

```ts
export const MAX_REPLIES_PER_TRUCK_MONTH = 2000
export const MAX_REPLIES_PER_TRUCK_DAY = Math.ceil(MAX_REPLIES_PER_TRUCK_MONTH / 10)
```

`decideReplyCap` tested month, then day, then customer. The counting lived in the webhook as three
queries; the month one was:

```ts
        supabase.from('whatsapp_logs')
          .select('*', { count: 'exact', head: true })
          .eq('truck_id', truck.id)
          .not('response_sent', 'is', null)
          .gte('created_at', monthStart)
          .or(`classification.is.null,classification.not.in.(${CAP_CLASSIFICATIONS.join(',')})`),
```

- **What counted:** rows with `response_sent IS NOT NULL`.
- 🔴 **Was the handoff counted? NO.** The `.or(...)` excluded every cap classification, and the handoff
  is logged as `CAP_CUSTOMER_24H`. Meta billed for it; the ceiling could not see it.
- **Boundary:** a calendar month in `truckTz`, which was the **bare literal `'Europe/London'`** — not
  `trucks.timezone`. The day window was a 26-hour fetch filtered to a local date in JS.

🔴 **Logged before or after Meta accepted? Both wrong, in opposite ways.**

| | Order | Effect |
|---|---|---|
| **Handoff** | send, `catch` and swallow, **then** insert `response_sent: capMessage` | a refused send counted |
| **Reply** | insert **first**, fire-and-forget, **then** send | a refused send counted |

**So the existing logging could not distinguish "sent" from "attempted".** The brief asked me to say so
and propose the smallest fix before making it — §2a.

### 1b. Where the two messages are logged

Both in `app/api/webhooks/meta/whatsapp/route.ts`: the handoff with `CLASSIFICATION_CUSTOMER_CAP`, the
reply with the classifier's own value. The silent branches insert with `response_sent: null` and a cap
classification (`CAP_TRUCK_MONTH`, `CAP_TRUCK_DAY`, `CAP_CUSTOMER_NOTIFIED`).

### 1c. How `payment_method_present` affected sending

`deriveWhatsAppConnectionState`: `if (input.paymentMethodPresent === false) return 'awaiting_payment_method'`,
and `canSendWhatsApp` was `state === 'ready'`. So **a false blocked every send**, and because the webhook's
routing readiness is that same function, it also stopped the truck being routed to at all.

### 1d. `update_truck` — no value validation existed

The handler filtered keys against `allowed` and wrote whatever value arrived:
`Object.entries(body.data || {}).filter(([key]) => allowed.includes(key))`. **There was no field with
server-side value validation to copy** — this is the first.

### 1e. The Channels section and the row

The intro paragraph rendered `Each customer gets up to {DEFAULT_MAX_REPLIES_PER_CUSTOMER_24H} replies…`
above the channel rows. The live branch rendered the read-only facts from `whatsAppRowView`, then
`WhatsAppSetupControl` (button + pop-up instruction), then the `expiringSoon` banner and the notice panel.

### 1f. How writes are scoped

`getTruck(token)` resolves the truck from `dashboard_token` alone, and every write is
`.eq('id', truck.id)` / `.eq('truck_id', truck.id)`. The disconnect action uses exactly this.

**Nothing read contradicted the decisions.**

---

## 2. THE CHANGES

### 2a. The cap: monthly only, per truck, handoff counted

- `MAX_REPLIES_PER_TRUCK_DAY` and `MAX_REPLIES_PER_TRUCK_MONTH` are **gone**. The limit is now
  `input.monthlyReplyLimit`, passed in from `trucks.whatsapp_monthly_reply_limit`.
- `SILENT_TRUCK_DAY_CAP` is gone from the decision union. ⚠️ The **string** `'CAP_TRUCK_DAY'` is retained
  in `CAP_CLASSIFICATIONS` so historic rows are still recognised as cap rows and not miscounted.
- The month query's `.or(...)` exclusion is **removed**: every row with `response_sent` set now counts,
  **handoffs included**.
- The boundary moved into `lib/whatsapp/usage.ts` — `monthStartIso(tz, now)` — and reads the **truck's**
  timezone via `truckTimezone(truck.timezone)`, still defaulting to Europe/London.

🔴 **THE SMALLEST FIX FOR "ONLY WHAT WE SENT COUNTS", PROPOSED AND THEN MADE.** No new column. The
`response_sent IS NOT NULL` test already *meant* "we sent this"; the data did not match the meaning.

- **Handoff:** a `handoffSent` flag; the row stores `response_sent: handoffSent ? capMessage : null`.
- **Reply:** the send now happens **before** the insert, and the row stores `response_sent: replySent ? reply : null`.
  ⚠️ The IGNORE bucket is still logged (`reply` null → `response_sent` null), and the insert is **still
  fire-and-forget**, so the 200 is not held behind it.

🔴 **The counting lives in one injectable function** — `readMonthlyUsage` — used by the Settings usage
line. The webhook shares its `monthStartIso` and its "what counts" rule. If the display computed its own
window, an operator could read "120 of 250" while the webhook had already gone silent.

### 2b. `payment_method_present` no longer blocks sending — exactly what changed

**One line**, in `canSendWhatsApp`:

```ts
  return state === 'ready' || state === 'awaiting_payment_method'
```

The **state is kept** — `deriveWhatsAppConnectionState` still produces it and `needsOperatorAction` still
surfaces it — because the Settings copy still tells an operator who raises their limit above the free
allowance to add a payment method. ⚠️ It is still a **closed list**, not a "not these": a state added
later is unsendable until someone writes it in on purpose.

### 2c. `update_truck` validation

`whatsapp_monthly_reply_limit` added to `allowed`, plus the route's **first value validation**:

```ts
    if ('whatsapp_monthly_reply_limit' in safeData && !isMonthlyReplyLimit(safeData.whatsapp_monthly_reply_limit)) {
      return NextResponse.json({ error: `Monthly reply limit must be one of ${MONTHLY_REPLY_LIMIT_CHOICES.join(', ')}.` }, { status: 400 })
    }
```

`isMonthlyReplyLimit` requires `Number.isInteger` **and** membership. The **database CHECK stays as the
backstop** — this is the layer that can say something useful; the constraint is the one that cannot be
bypassed.

### 2d. Usage in the manage API

`whatsappUsage: { used, limit, resetsOn, atLimit }` in the GET payload, from `readMonthlyUsage` with the
same `response_sent IS NOT NULL` count. ⚠️ **Non-fatal** — a failed count logs and returns null rather
than taking Settings down.

### 2e. Disconnect

Action `disconnect_whatsapp` on the manage route, scoped by `dashboard_token` like every other write and
gated by `WHATSAPP_LIVE || hasWhatsAppSetupPreview(...)` exactly as the signup route is.

The sequence is decided by the pure `planDisconnect` (`lib/whatsapp/disconnect-plan.ts`):

| Input | Plan |
|---|---|
| no connection | `[]` — idempotent success |
| waba + usable token | `unsubscribe_app` → `delete_connection_row` |
| waba, token expired/revoked/undecryptable | `delete_connection_row` (reason `no_usable_token`) |
| no waba | `delete_connection_row` (reason `no_waba`) |

🔴 **There is no deregister, and the operation type has no member for it.** A coexistence number is the
operator's own working phone; deregistering it would break what they answer customers on to tidy up our
side. 🔴 **The row is deleted even when Meta refuses** — the operator asked us to stop, and keeping it
would keep replies going out on a connection they have disowned. Deleting the row removes the stored key
with it. **`trucks.phone_number_id` and `trucks.whatsapp_sender` are never touched.** The log line
carries the truck id and an outcome word only.

### 2f/2g. Copy and the view model

`lib/whatsapp/copy.ts` holds `META_PRICING_URL`, `WHATSAPP_MANAGER_URL`, `formatLimit` and
`formatResetDate`; `META_FREE_REPLIES_PER_MONTH = 1000` lives beside the limit choices in `reply-cap.ts`.
All the founder's wording is used verbatim. Every display decision is in `whatsAppRowView`:
`showConnectedLabel`, `showPopupInstruction`, `showDisconnect`, `showMonthlyLimit`,
`showAboveAllowanceNote`, and `showSetupControl` which is now **false on a working connection**.

⚠️ `formatResetDate` builds the date from its parts rather than `new Date(iso)`, which parses as UTC and
can render the previous day.

### 2h. The emails are not built

🔴 **"We'll email you at 80% and 100%" is a promise this workstream does not keep.** The copy is the
founder's and is rendered verbatim, and **no email code was written**. Until the next workstream ships
it, that sentence is inaccurate on screen. Flagged, not hidden.

---

## 3. PROOFS

### 3a/3b. `scripts/whatsapp-settings-row-harness.cjs` — seven variants first

```
── BROKEN VARIANTS: each MUST report FAILURE ──
  ✓ FAILED as required  V1 the cap uses a fixed 2000 instead of the truck's limit
  ✓ FAILED as required  V2 the handoff is not counted (month total one short)
  ✓ FAILED as required  V3 the month boundary uses UTC
  ✓ FAILED as required  V4 validation accepts 1500
  ✓ FAILED as required  V5 payment_method_present false still blocks sending
  ✓ FAILED as required  V6 the plan deregisters, or skips deleting the row
  ✓ FAILED as required  V7 the view shows Set up for a ready connection

── THE REAL CODE ──
✅ all 75 passed
```

Covers: per-truck ceilings at 250/1000/5000 including the discriminating cases (a truck on 250 with 300
used is silent; a truck on 5000 with 2100 used still replies); no daily window; the per-customer 3-in-24h
rule unchanged, including that the month cap beats it so no handoff is paid for out of budget; the
2026-09-30T23:30:00Z boundary; twelve rejected validator inputs; `payment_method_present` false/null/true
all sendable while `revoked` and `not_connected` stay unsendable; every state through the view model; the
above-allowance note at each of the five limits; and all four disconnect plans.

⚠️ The harness compiles through a **temp tsconfig with `paths`** — bare tsc flags cannot resolve the
`@/lib/...` imports and fail with TS2307 before emitting.

### 3c. What each proof would look like if it proved nothing

| Proof | If it proved nothing | How that was ruled out |
|---|---|---|
| **Per-truck limit** | Testing only 1000, which is both the default and the old-ish fixed value. | 250 and 5000 are tested at, under and over, and V1 forces 2000 and is caught. |
| **Handoff counted** | Asserting a count — the reducer takes the number, it does not compute it. | V2 passes a total one short and is caught at three boundary cases; the query's removed `.or(...)` is quoted in §2a. |
| **Month boundary** | Testing mid-month, where UTC and London agree. | The one instant where they disagree (30 Sep 23:30Z) is the test; V3 uses UTC and is caught. |
| **Validation** | Testing only the five valid values. | Twelve invalid inputs including `1500`, `250.5` and `"250"`; V4 accepts a range and is caught. |
| **Payment method** | Testing only `true`/`null`, which were already sendable. | `false` is the case; V5 restores the old equality and is caught. |
| **No deregister** | Grepping the source for the word. | Every returned plan is serialised and searched, for all four inputs; V6 adds one and is caught. |
| **Connected UI** | Asserting the label appears — true even if the button also did. | Label **and** the button's absence are asserted; V7 shows both and is caught. |

### 3d. A truck with no connection — evaluated

```
  Gusto: whatsAppSetupVisible = false → ELSE branch (untouched); none of the new UI is reachable
  live branch, no connection: showNumberInput          = false
                              showConnectedLabel       = false
                              showSetupControl         = true
                              showPopupInstruction     = true
                              showDisconnect           = false
                              showMonthlyLimit         = false
                              showAboveAllowanceNote   = false
```

**Before and after are the same for Gusto**: the predicate is false, so it renders the else branch, whose
markup is untouched. Every new control lives inside the live branch. A *preview* truck with no connection
sees Set up and the instruction exactly as before, plus the billing note.

### 3e. TypeScript and lint

- **tsc clean.**
- **Lint**, six changed files that exist at HEAD, HEAD in a detached worktree: **305 errors / 81 warnings
  on both sides after the fix, every rule count identical.** ⚠️ An intermediate pass showed
  `no-unused-vars` at **56 → 58**; both were mine (`CAP_CLASSIFICATIONS` and `since26h`, orphaned by the
  deleted daily window) and were **removed, not declared**.
- `usage.ts`, `disconnect-plan.ts` and `copy.ts` lint **0 / 0**.

### 3f. What the harnesses cannot prove, and your manual steps

**Cannot prove:** that Meta accepts `DELETE /{waba_id}/subscribed_apps` or what it returns; that Meta's
free allowance is still 1000; that the database CHECK rejects what the validator rejects (I did not run
SQL); how any of it looks; that a real inbound message is actually silenced at the ceiling.

| # | Do | Expect |
|---|---|---|
| 1 | Test truck → Settings. | **Connected** in green, the number and business name, **no Set up button**, no pop-up instruction, a **Disconnect** link, the limit select, the usage line and the billing note. |
| 2 | Change the limit to **2,000**. Reload. | Toast; the value persists; the amber "Above 1,000…" note **appears** with the **Add a payment method** link. |
| 3 | Change it to **1,000**. | The amber note **disappears** (at exactly the allowance you are still inside it). |
| 4 | Read the usage line. | "This month: N of 1,000 used · resets 1 October". N should match `whatsapp_logs` rows for this truck with `response_sent` not null since 1 September, **handoffs included**. |
| 5 | Set the limit to **250** while the month's count is above 250, then message the truck. | **No auto-reply**, and a `SILENT_TRUCK_MONTH_CAP` log line. Put the limit back afterwards. |
| 6 | Press **Disconnect**, read the confirmation, press **Cancel**. | Nothing happens; the row is unchanged. |
| 7 | Press **Disconnect** → **Disconnect**. | The row returns to **Set up** with the instruction back. The `whatsapp_connections` row for test-truck is **gone**. `trucks.phone_number_id` on test-truck is **unchanged** — check it. |
| 8 | Message the truck now. | **No auto-reply** (no connection, and the sender fallback does not match this number). |
| 9 | Check the WhatsApp Business app on that number. | It **still works** — nothing was deregistered. |
| 10 | Press **Set up** and reconnect. | The flow runs as before and the number and name come back. |
| 11 | Gusto → Settings. | Label, disabled box, no button, **none** of the new copy. Unchanged. |

---

## 4. FINISH

```
$ git status --porcelain=v1
 M app/api/manage/route.ts
 M app/api/webhooks/meta/whatsapp/route.ts
 M app/manage/[token]/page.tsx
 M lib/whatsapp/connection-state.ts
 M lib/whatsapp/connection-view.ts
 M lib/whatsapp/reply-cap.ts
?? lib/whatsapp/copy.ts
?? lib/whatsapp/disconnect-plan.ts
?? lib/whatsapp/usage.ts
?? scripts/whatsapp-settings-row-harness.cjs
```

| File | Reason |
|---|---|
| `lib/whatsapp/usage.ts` **(new)** | the month boundary and the one injectable counting function both enforcement and display use |
| `lib/whatsapp/disconnect-plan.ts` **(new)** | the pure ordered operation list; no deregister member exists |
| `lib/whatsapp/copy.ts` **(new)** | the two links and the two formatters, in one place |
| `scripts/whatsapp-settings-row-harness.cjs` **(new)** | the proofs, rerunnable with plain `node` |
| `lib/whatsapp/reply-cap.ts` | monthly-only, per-truck limit, day window removed, allowance and choices |
| `lib/whatsapp/connection-state.ts` | `awaiting_payment_method` is sendable |
| `lib/whatsapp/connection-view.ts` | connected label, disconnect, limit and above-allowance decisions |
| `app/api/webhooks/meta/whatsapp/route.ts` | per-truck monthly cap, shared boundary, cap rows counted, send-then-log |
| `app/api/manage/route.ts` | limit validation, usage in the payload, the disconnect action |
| `app/manage/[token]/page.tsx` | the row: connected label, disconnect + confirmation, limit select, usage, billing note, new intro |

**Not changed:** `lib/whatsapp-live.ts`, `lib/whatsapp/setup-preview.ts`, the routing order in
`lib/whatsapp/inbound-route.ts`, `lib/whatsapp/setup-machine.ts`, `lib/whatsapp/phone-profile.ts`, plan
lists, landing, the else-branch markup, and `trucks.phone_number_id` / `trucks.whatsapp_sender` handling.

**No SQL appears in this report.** No migration was written or needed.
