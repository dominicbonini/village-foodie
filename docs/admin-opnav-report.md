# `opNav` — the token is the credential, not the operator

Date: 13 August 2026
Status: APPLIED. **One executable line changed**, plus the comment you asked for. `tsc --noEmit` clean.
No non-ASCII character class gained.

No `next dev`, no `next build`, no commit, no deploy, no migration. Nothing outside
`app/admin/page.tsx:971` and its comment was touched.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 1. THE CHANGE

**Before** — `app/admin/page.tsx:958`:

```tsx
const opNav = isOp && r.op.operator_id && r.op.dashboard_token
```

**After** — `app/admin/page.tsx:971` (the comment above it is new, hence the line move):

```tsx
// ⚠️ THE TOKEN IS THE CREDENTIAL; AN OPERATOR IS NOT REQUIRED. This read
// `isOp && r.op.operator_id && r.op.dashboard_token`, which hid two working
// destinations: /manage/[token] and /dashboard/[token] both authenticate on the
// dashboard_token ALONE and never consult operators (see
// docs/tikka-tonic-account-report-2.md). The operator_id test therefore blanked the
// links on a truck that had a perfectly usable one — specifically a truck promoted
// from a discovery row, during the window BEFORE its operator is created, which is
// exactly when an admin needs to open Manage to finish setting it up.
// ⚠️ Demo trucks also carry a null operator_id, so they gain these links too. That is
// expected and accepted: their tokens work, and reaching a demo's console from here
// is useful rather than harmful.
const opNav = isOp && r.op.dashboard_token
```

The comment records the rationale you gave — the token is the credential, an operator is not required —
and names the report it came from, so the next reader does not have to re-derive it. It also states the
demo-truck consequence up front, since that is the surprising part of the diff.

**The link targets are untouched.** `app/admin/page.tsx:1047` and `:1051`:

```tsx
{opNav ? linkBtn(`/dashboard/${r.op.dashboard_token}`, '🖥') : na}
{opNav ? linkBtn(`/manage/${r.op.dashboard_token}`, '⚙️') : na}
```

Both still point where they always did. Only the condition guarding them changed.

---

## 2. VERIFICATION

### `tsc --noEmit` — clean

### Non-ASCII census

`app/admin/page.tsx`: **26 classes before, 26 after. GAINED: none.** The comment uses `⚠️` and `—`, both
long-standing in this file. ⚠️ Note this file has never contained `🔴`, so the new comment deliberately
does not introduce it.

### No other `operator_id` use changed — by grep, before and after

| Line | Use | Status |
|---|---|---|
| `:30` | `operator_id: string \| null` on `AdminTruck` | ✅ unchanged |
| `:101` | `Pick<AdminTruck, … 'operator_id' …>` for `DeleteTarget` | ✅ unchanged |
| `:207` | the J3 promo-code comment | ✅ unchanged |
| `:633` | patches `operator_id` into local state after create-operator succeeds | ✅ unchanged |
| `:999`, `:1002` | 🔴 the **promo-code badge**, still `isOp && r.op.operator_id && promoCodes[r.op.operator_id]` | ✅ **unchanged, and correctly so** — a signup promo code is keyed BY operator, so with no operator there is genuinely nothing to look up |
| `:1330`, `:1356` | the edit modal's "no operator yet" / "has an operator" branches | ✅ unchanged |
| `:972`, `:975`, `:979` | the new comment quoting the old expression | new, non-executable |

**Exactly one executable line moved from `operator_id &&` to not having it.**

⚠️ `git status` also lists `lib/provision-truck.ts`, and `git diff` on this file also shows the colgroup
widths and the `whitespace-nowrap` — **those are the two PREVIOUS tasks' uncommitted work**
(`docs/cuisine-emoji-report.md`, `docs/admin-table-layout-report.md`), not part of this change.

### The three row kinds after the change

**Pizzeria Gusto — unchanged in every cell.** It has `operator_id = 814efb07-…` and
`dashboard_token = gusto-3d87b5d15a6f`, so `opNav` evaluated to **truthy before** (`isOp && <id> &&
<token>`) and evaluates to **truthy after** (`isOp && <token>`). **The dropped conjunct was already
satisfied, so the boolean cannot have moved.** Every other cell in its row — Active, Plan, the four site
tickboxes, Exclude?, Edit, and the promo-code badge — is governed by code this change did not touch.

**`tikka-tonic` — gains the two links.** `operator_id` NULL, `dashboard_token` set → `opNav` was falsy,
is now truthy → 🖥 and ⚙️ render, pointing at `/dashboard/<token>` and `/manage/<token>`. This is the
case the change exists for.

**The five `demo-*` trucks — also gain them**, as you accepted. They carry `operator_id: NULL` and a
`demo-`-prefixed token.

**Unlinked discovery rows — unaffected.** `opNav` begins `isOp &&`, so a discovery row is falsy on the
first conjunct and still renders `na` in both cells.

⚠️ **A truck with a NULL `dashboard_token` still shows `—`.** `AdminTruck` types it
`string | null`, so the second conjunct is still load-bearing — the change narrowed the guard, it did not
remove it.

---

## 3. WHAT I HAVE NOT EXERCISED

1. **Nothing was rendered.** No browser, no page. The claim that Gusto's row is unchanged is a boolean
   argument over the two operands, not an observation.
2. **Neither link was followed.** I did not open `/manage/<token>` or `/dashboard/<token>` for
   `tikka-tonic` to confirm the destinations actually load for a truck with no operator. The reasoning
   rests on the earlier reading of both routes' auth (`docs/tikka-tonic-account-report-2.md` §2) — that
   `/manage/[token]` and `/dashboard/[token]` authenticate on the token — **not on a live request.**
   ⚠️ **Worth one click on `tikka-tonic` before you rely on it.**
3. **No data was re-read.** `tikka-tonic`'s NULL `operator_id` and Gusto's non-NULL one are taken from
   the earlier investigation and from your brief; I ran no query this turn.
4. **The demo trucks' links are untested.** They should work — the token is the credential and
   `proxy.ts` exempts `/dashboard/demo-*` from the session gate — but I did not open one.
