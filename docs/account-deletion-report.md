# Account deletion — the request UI — BUILD

**Date:** 6 August 2026. Supersedes the account-deletion build report of the same name.
**Two files changed, one new.** No `next dev` / `next build`. No garbled spans in the brief.

---

# 🔴 ESTABLISHED FIRST — TWO OF THE THREE GAPS DO NOT EXIST

**Premises 2 and 3 are wrong, and I believe I know why: the columns they describe are on `operators`, not on `trucks`.** Your live verification was of `trucks.deletion_requested_at`, and `trucks` indeed has neither of them.

## 1. MULTI-TRUCK ATOMICITY — ✅ **one operation. A half-pending account is not possible across trucks.**

[request-deletion/route.ts:103-105](app/api/account/request-deletion/route.ts#L103):

```ts
await supabase.from('trucks')
  .update({ deletion_requested_at: now.toISOString() })
  .in('id', truckIds)          // 🔴 ONE UPDATE covering every truck the operator owns
```

A single `UPDATE … WHERE id IN (…)` is atomic in Postgres. **Every truck stops together or none does** — the "one truck stopped, another still taking money" failure cannot occur between trucks.

⚠️ **There IS a two-statement seam, and it is the other way round.** The operator row is stamped *before* the trucks, deliberately: a failure between them leaves an account **pending but still trading** — visible, recoverable, and the cron still finds it — rather than trucks silently stopped with no record explaining why. That path returns `partial_stamp` and tells the operator ordering has **not** stopped, instead of reporting a clean success. Not fixed silently; it was designed that way and is stated here.

## 2. WHO REQUESTED IT — ✅ **captured. `operators.deletion_requested_by`.**

It is in the migration ([:31](supabase/migrations/20260807_account_deletion_pending_state.sql#L31)), written by the request endpoint, and the request email to you names the operator id and email so you can reply directly. **Not `action_audit_log`, and not nowhere.**

## 3. RE-NOTIFICATION STATE — ✅ **exists. `operators.deletion_last_notified_at`. It does NOT fire once.**

In the migration ([:33](supabase/migrations/20260807_account_deletion_pending_state.sql#L33)). The cron re-emails every `RENOTIFY_INTERVAL_HOURS` (24) while the account is still pending, reports how many days overdue, and 🔴 **stamps the column only on a successful send**, so a failed email is retried rather than marked delivered. **The safeguard is intact.**

## 🔴 ONE REAL UNCERTAINTY, AND IT IS BLOCKING

**I cannot confirm the `operators` half of the migration has been applied.** Both `ALTER`s live in one file, so running it runs both — but your verification named only `trucks.deletion_requested_at`, and the wording of gaps 2 and 3 is consistent with having checked `trucks` alone.

⚠️ **If `operators.deletion_requested_at` does not exist, the request endpoint 500s and this UI shows nothing** (it renders `null` when the summary call fails, so it fails closed rather than showing a broken control). **Please confirm before relying on it:**

```sql
select column_name from information_schema.columns
 where table_name = 'operators' and column_name like 'deletion%';   -- expect 4 rows
```

---

# PLACEMENT — 🔴 SETTINGS, NOT BILLING

| Candidate | Verdict |
|---|---|
| **Billing** | Already `roles: ['owner']`, so the gate would have been structural. 🔴 **Rejected:** the Billing tab is hidden when `truck.plan === 'tester'` ([page:498](app/manage/[token]/page.tsx#L498)) — those owners would have had **no in-app deletion path at all**, and 5.1.1(v) has no plan exemption |
| ✅ **Settings** | Visible to every owner regardless of plan, and the conventional home. Gated one step further to `userRole === 'owner'` |

**Bottom of the Settings tab**, after everything else — findable by scrolling (5.1.1(v) wants a reasonable path) without sitting near the settings an operator changes routinely. **No new tab.**

## The Danger Zone, and what I introduced

⚠️ **There is no `frontend-design` skill in this environment** — I checked `.claude/skills` and `~/.claude/skills`; neither exists, and `Skill(frontend-design)` returns *Unknown skill*. I followed the codebase's own vocabulary instead, which is the correct fallback:

| Element | Source |
|---|---|
| `border-2 border-red-300 bg-red-50` destructive panel | **Existing** — used at [page:3624](app/manage/[token]/page.tsx#L3624) and :4924 |
| `border-red-200 text-red-600 bg-white hover:bg-red-50` destructive button | **Existing** — the event-cancel and reject buttons |
| 🔴 **A "Danger zone" heading and a bordered section** | **NEW.** No equivalent existed |
| 🔴 **A focus-trapping `role="alertdialog"`** | **NEW.** The page had no `role="dialog"`, no `aria-modal` and no typed-confirmation pattern anywhere to copy |

---

# THE CONFIRMATION — everything stated before anyone can proceed

Ordered by how badly it would hurt to miss:

1. 🔴 **"Online ordering stops immediately — not in 30 days."** **First**, in a red panel, because it is the consequence an operator is most likely to misjudge.
2. 🔴 **Upcoming orders** — *"You have N upcoming orders. These will still need fulfilling."* **Warns, does not block.** Shown only when N > 0.
3. **All trucks named** when there is more than one.
4. **30 days, dashboard readable** during it.
5. 🔴 **"You cannot cancel this yourself"** — in a red panel, **before** the confirm action, with a `mailto:` link.
6. **What is deleted vs kept** — personal data and customer identifiers deleted; **anonymous accounting records kept for six years, as UK law requires**, linked to the privacy policy.
7. 🔴 **No export exists.** *"There is no download in the app. You have the right to a copy — email … **before** you confirm."* No feature is implied.

**The upcoming-order count** comes from a new `GET` on the same endpoint, so the dialog never computes it client-side. 🔴 **The Manage page holds ONE truck; the account may own several** — naming only the truck you happen to be looking at would understate what is being deleted, so the truck list and the count both come from the account query. "Upcoming" = status ∈ {pending, confirmed, modified, cooking, ready} **and** `event_date >= today`; deliberately generous at the boundary, because **under-counting an obligation is the harmful direction**.

---

# INTERACTION — every destructive convention

| Requirement | How |
|---|---|
| **Never a single tap** | Section → `Delete account…` **opens a dialog and requests nothing** → truck name typed **exactly** → the destructive button enables |
| **Button names the action** | **"Delete my account"** — never Confirm/OK/Yes |
| **Cancel dominant** | **"Cancel — keep my account"**, solid dark, full-width on mobile. The destructive button is an outline |
| 🔴 **Nothing destructive autofocused** | `cancelRef.current?.focus()` on open — focus lands on **Cancel** |
| 🔴 **No default-submit** | **There is no `<form>`.** Enter cannot reach the destructive button |
| **Escape dismisses** | `keydown` listener, closes and clears the typed value without acting |
| **Focus trap** | Tab/Shift-Tab cycle within the dialog |
| **Announced to AT** | `role="alertdialog"` + `aria-modal` + `aria-labelledby` + `aria-describedby`; the section uses `aria-labelledby="danger-zone-heading"` |
| **Backdrop click** | Closes — `onMouseDown` with an `e.target === e.currentTarget` check, so a drag that starts inside cannot dismiss it |

✅ **`lib/legal.ts` `PRIVACY_PATH`** for the policy link — no inline route.
✅ **`HATCHGRAB_SENDER.replyTo`** for the support address — **read, not hardcoded, and the constant is untouched.** Verified: `grep villagefoodie.co.uk` in the new component returns nothing.

---

# PENDING STATE

When `deletion_requested_at` is set, **the request control is replaced entirely** — there is no second request path, so an owner cannot request twice. It shows the request date, the due date, that ordering has stopped, that the dashboard stays readable, and 🔴 **repeats "You cannot cancel this yourself"** with the support `mailto:`.

⚠️ Belt and braces: the endpoint is idempotent anyway — a repeat POST returns `alreadyPending` and **does not restart the clock**.

---

# VERIFY

## The role walk

| Role | Sees |
|---|---|
| **Staff** | 🔴 **Nothing — never reaches Manage.** `if (userRole === 'staff') router.replace('/dashboard/…')` ([page:423](app/manage/[token]/page.tsx#L423)) |
| **Manager** | Settings tab yes, danger zone **no** — `{userRole === 'owner' && <DeleteAccountSection …>}`. **Nothing rendered, not a disabled control**, which would only advertise the action |
| **Owner** | The collapsed Danger Zone |

🔴 **Three independent gates, not one.** Even if the client gate were bypassed, both handlers resolve the session to an `operators` row and 403 otherwise — **staff and managers have an auth user but no operators row**, so they cannot read the summary or request deletion. The component also renders `null` if that call fails, so it fails closed.

## Ordering actually stops — the surface checked

**[app/api/orders/submit/route.ts:363](app/api/orders/submit/route.ts#L363)** — the order-submission path itself, not a UI state:

```ts
if (truck.deletion_requested_at) {
  return NextResponse.json({ error: '…no longer accepting online orders.', code: 'account_closing' }, { status: 423 })
}
```

Read off the truck row **already fetched** by that route, before the hidden-truck gate, so it costs no extra query. `/api/menu` sets `pauseReason: 'account_closing'` so the customer page shows closed rather than orderable. **Verified by reading the code path, not by assuming the flag is respected.**

## 🔴 GUSTO — a live trading operator with an owner login

| | |
|---|---|
| **What changes** | One new collapsed section at the **bottom of Manage → Settings**: a heading and one outline button reading `Delete account…`. Nothing else on the page moves |
| **Reachable by accident?** | 🔴 **No.** No default-open state — it renders collapsed. The button **opens a dialog and requests nothing**. The destructive button is **disabled** until their truck name is typed exactly. **Nothing destructive is autofocused** (focus goes to Cancel). **There is no form, so Enter cannot submit.** Escape and backdrop both dismiss without acting |
| **Accidental double-tap?** | Harmless — the first tap opens a dialog whose destructive button is disabled |
| **Their ordering** | **Unchanged.** `deletion_requested_at` is NULL for every truck (live-verified), so every new branch is a falsy check |
| **Managers/staff on their account** | See nothing |
| **Extra queries on hot paths** | **None.** The summary `GET` fires only when an owner opens the Settings tab |

## Build

```
$ npx tsc --noEmit
TSC EXIT: 0
```

| File | Baseline | Now | |
|---|---|---|---|
| `app/manage/[token]/page.tsx` | 293 err, 77 warn | **293, 77** | ✅ **rule-for-rule identical** (baseline from `HEAD` via stash; diff empty) |
| `app/api/account/request-deletion/route.ts` | clean | **clean** | ✅ |
| `components/manage/DeleteAccountSection.tsx` *(new)* | — | **clean** | ✅ |

⚠️ **The new component first came back with one `react-hooks/set-state-in-effect` error** — a rule the Manage page already carries 8×, so accepting it would have been defensible. I restructured instead: the fetch now resolves into a **promise callback** rather than calling an async function synchronously in the effect body, which is exactly what the rule asks for. **Clean, not excused.**

### Files changed

`app/manage/[token]/page.tsx` *(import, `userRole` prop, mount)* · `app/api/account/request-deletion/route.ts` *(GET summary + shared operator resolver)*
**New:** `components/manage/DeleteAccountSection.tsx`

### Out of scope — untouched

The execute path · the cron · the hard-delete guard · the discovery map · data export itself · `lib/email-config.ts` (the address and its fallback) · printing, commerce-policy, pricing, keep-awake, the native shell, the legal pages.

### ⚠️ Known gaps

- 🔴 **The `operators` migration half is unconfirmed** — see above. This UI fails closed if it is missing, but the feature will simply not work.
- ⚠️ **The confirmation string is the truck name**, and with multiple trucks it is the truck whose Manage page you are on. Unambiguous in the dialog (all trucks are listed and the target is shown in a code chip), but it is not the *account* name — no such field exists.
- ⚠️ **No dashboard banner** during the pending 30 days. The Manage → Settings panel is the only in-app indication; the operator also gets the email.
- ⚠️ **The focus trap is hand-rolled** (no library) and covers Tab/Shift-Tab within the dialog. It does not `inert` the background.
- ⚠️ **Not tested in a browser** — no `next dev` per instruction. Behaviour is argued from the code, not observed.
