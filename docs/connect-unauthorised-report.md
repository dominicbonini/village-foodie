# "Card payments aren't configured yet — Unauthorised": the per-truck cause

Date: 13 August 2026
Status: READ-ONLY DIAGNOSIS. **No file was changed.** This report is the only file created.
No `next dev`, no `next build`, no commit, no deploy. No fix proposed or applied.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 0. 🔴 YOU WERE RIGHT, AND MY PREVIOUS REPORT WAS WRONG

`docs/connect-gate-report.md` concluded *"the button is ENABLED for both"* and *"there is no per-truck
gate"*. **Both statements are wrong**, and the error is specific rather than general: I evaluated
`configError` on the assumption that the `status` POST **succeeds**, checked the database columns it
reads, and stopped there. I did name the mechanism — that report says *"the realistic causes are
`Unauthorised` (403 — the token is not an owner's)"* — but I did not chase it, because I had verified
the truck rows and not the **session**. The gate is not in a column. It is in who is logged in.

**There is a per-truck condition, it is ownership, and it has nothing to do with Stripe.**

Your leading suspicion was right in substance and off by one detail: **the route returns 403, not 401.**

---

## 1. THE ROUTE'S AUTH, AND EVERY NON-200 IT CAN RETURN

### The gate — QUOTED in full, `app/api/stripe/connect/route.ts:38-67`

```ts
async function requireOwner(token: string): Promise<Ctx | null> {
  // ⚠️ `country` is read here ONLY because Accounts v2 requires it at creation — see the note on
  // createConnectedAccount. The account belongs to the OPERATOR, so the authenticating truck's country
  // is the only country signal available at this point; every truck row is 'GB' today.
  const { data: truck } = await supabase
    .from('trucks')
    .select('id, operator_id, country')
    .eq('dashboard_token', token)
    .single()
  if (!truck) return null
  if (!truck.operator_id) return null

  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return null

  const { data: sessionOperator } = await supabase
    .from('operators')
    .select('id, email')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  // 🔴 OWNERSHIP, not membership. `truck_users` role is deliberately NOT consulted: a 'manager' row
  // would satisfy a membership test and must not reach account creation.
  if (!sessionOperator || sessionOperator.id !== truck.operator_id) return null
  return {
    operatorId: sessionOperator.id,
    email: sessionOperator.email ?? null,
    country: truck.country ?? null,
  }
}
```

**QUOTED**, its call site, `:86-87`:

```ts
const ctx = await requireOwner(token)
if (!ctx) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
```

### 🔴 FOUR ways `requireOwner` returns null — all of them produce the identical message

| # | Condition | Line | Meaning |
|---|---|---|---|
| 1 | `!truck` | `:45` | no truck carries that `dashboard_token` |
| 2 | `!truck.operator_id` | `:46` | the truck has no owning operator (every `demo-…` truck is in this state) |
| 3 | `!user` | `:50` | **no logged-in Supabase session in this browser** |
| 4 | `!sessionOperator \|\| sessionOperator.id !== truck.operator_id` | `:57` | 🔴 **you are signed in, but as a DIFFERENT operator than the one that owns this truck** |

**All four collapse into one response — `403 {"error":"Unauthorised"}`.** There is no way to tell them
apart from the client, and nothing is logged server-side on this path. That is why the screen can only
say "Unauthorised".

### Every non-200 the route can return — QUOTED

| Status | Message | Line | When |
|---|---|---|---|
| 400 | `Bad JSON` | `:80` | body is not JSON |
| 400 | `Missing token or action` | `:84` | either field absent |
| **403** | **`Unauthorised`** | **`:87`** | **any of the four conditions above** |
| 500 | `Account created but not saved — contact support` | `:211` | account made at Stripe, DB write failed |
| 409 | `No connected account yet` | `:299` | `account_session` with no account |
| 400 | `Unknown action: …` | `:305` | dispatch fell through |
| 500 | *(the caught exception's own message)* | `:311` | anything thrown inside the try — **this is the only path that can carry a Stripe message** |

**There is no 401 anywhere in this route.** QUOTED — `grep -n "status: [0-9]"` returns exactly the seven
rows above.

---

## 2. WHAT IT AUTHENTICATES AGAINST

**QUOTED.** Three things, ANDed:

1. **A manage token** — `trucks.dashboard_token` must resolve to a truck (`:44`).
2. **A logged-in Supabase session** — `createSupabaseServerClient().auth.getUser()` must return a user
   (`:49-51`). Cookie-based; the token alone is not enough.
3. 🔴 **Operator-level ownership of that specific truck** — the session user's `operators` row (matched
   on `auth_user_id`) must have an `id` **equal to that truck's `operator_id`** (`:57`).

**What it explicitly does NOT accept**, per the code's own comment at `:55-56`:

> `🔴 OWNERSHIP, not membership. `truck_users` role is deliberately NOT consulted: a 'manager' row would satisfy a membership test and must not reach account creation.`

So a `truck_users` role of `owner`, `manager` or `staff` is **irrelevant** — the table is never queried.

### 🔴 AND HERE IS WHY THE REST OF MANAGE WORKS FOR EVERY TRUCK

**QUOTED**, `app/api/manage/route.ts:34-71` — the route that loads the whole console:

```ts
const token = req.nextUrl.searchParams.get('token')
if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 })
const truck = await getTruck(token)
if (!truck) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

let userRole: 'owner' | 'manager' | 'staff' = 'owner'
…
try {
  … session lookup …
} catch { /* if auth check fails, default to owner */ }
```

**Manage authenticates on the `dashboard_token` ALONE**, defaults `userRole` to `'owner'`, and swallows
any session failure. So holding a truck's URL gets you the entire console as an owner — menu, schedule,
billing, the Payments **tab** included, because the tab filter is `roles: ['owner']` and the role
defaulted to owner.

**Only `/api/stripe/connect` additionally demands that you BE that truck's operator.** That asymmetry is
the whole phenomenon: every tab loads for every truck, and exactly one tab's data call 403s.

⚠️ The connect route's header claims it re-derives the role *"using the SAME cascade
`app/api/manage/route.ts` uses"*. **That comment is inaccurate** — manage's cascade falls back to
`truck_users` and defaults to owner, connect's does neither. The behaviour is stricter than its own
documentation says.

---

## 3. 🔴 THE LIVE ROWS — THIS IS THE COMPARISON

**QUOTED from the database, read just now.** Every truck has a **different** operator, and every operator
has a **different** `auth_user_id`:

| Truck | `trucks.operator_id` | Owning operator's email | `operators.auth_user_id` |
|---|---|---|---|
| **test-kitchen** | `d926161e-33b9-4031-b2a6-21253418538f` | **dbonini82@gmail.com** | `0610eb33-26db-462f-b191-2afac931ec53` |
| **real-thai-food** | `f150ec81-1bbc-4991-ac80-f07077d3b824` | **realthaifood@villagefoodie.co.uk** | `3b8096ae-1f72-44ed-8fd3-cb67cc9f9535` |
| **pizzeria-gusto** | `814efb07-97e4-448d-a028-5a8acad8c57d` | **contact@pizzeriagusto.co.uk** | `a7b2827f-910d-49b4-bf69-7ad96671bd07` |

For completeness, the whole estate — **no two trucks share an operator**, and every `demo-…` truck has
`operator_id = null` (condition 2 above):

```
  demo-8ggyz7vrhe6sbf54c8chvkp90q  operator_id= null
  demo-jt7xn1b47121by1n0d1yjrrv3k  operator_id= null
  demo-qbkqsaayxa87nb9cahhj2ngzpk  operator_id= null
  demo-rv9ydvqe4e1pj24x63940f4vhe  operator_id= null
  demo-wks3nf2q7dp2tef0hp01n74e8c  operator_id= null
  pizzeria-gusto   operator_id= 814efb07-…
  real-thai-food   operator_id= f150ec81-…
  test-kitchen     operator_id= d926161e-…
  test-truck-2     operator_id= 9f4c2d4d-…
  test-truck-3     operator_id= 7c7d40de-…
  test-truck-3-2   operator_id= 1e4308fc-…
  tt3              operator_id= 570ec276-…
  village-spice    operator_id= 8e41a930-…
```

The eight operator rows, each with its own auth user:

```
  contact@pizzeriagusto.co.uk       id= 814efb07-…  auth_user_id= a7b2827f-…
  dbonini82@gmail.com               id= d926161e-…  auth_user_id= 0610eb33-…
  dominicbonini@hotmail.com         id= 1e4308fc-…  auth_user_id= 8591144a-…
  hello@villagefoodie.co.uk         id= 9f4c2d4d-…  auth_user_id= 28a5fa3a-…
  hello1@villagefoodie.co.uk        id= 7c7d40de-…  auth_user_id= 4490b40f-…
  realthaifood@villagefoodie.co.uk  id= f150ec81-…  auth_user_id= 3b8096ae-…
  testtruck@villagefoodie.co.uk     id= 570ec276-…  auth_user_id= 0514761e-…
  tt4@villagefoodie.co.uk           id= 8e41a930-…  auth_user_id= d02e1d78-…
```

### What condition 4 evaluates to

**INFERRED from the QUOTED code and the QUOTED rows** — the rule is a single equality:

> `requireOwner` succeeds **only** on the truck whose `operator_id` equals the operator row belonging to
> the account you are currently signed in as. **For every other truck it returns null → 403 →
> "Unauthorised".**

Because no two trucks share an operator, **exactly one truck's Payments tab can work in any one browser
session**, and it is whichever one you are signed in as:

| Signed in as | test-kitchen | real-thai-food | pizzeria-gusto |
|---|---|---|---|
| `dbonini82@gmail.com` (operator `d926161e`) | ✅ **200** | ❌ 403 Unauthorised | ❌ 403 Unauthorised |
| `realthaifood@villagefoodie.co.uk` (`f150ec81`) | ❌ 403 | ✅ **200** | ❌ 403 |
| `contact@pizzeriagusto.co.uk` (`814efb07`) | ❌ 403 | ❌ 403 | ✅ **200** |
| `dominicbonini@hotmail.com` (`1e4308fc`) | ❌ 403 | ❌ 403 | ❌ 403 — that account owns **test-truck-3-2** |
| not signed in at all | ❌ 403 (condition 3) | ❌ 403 | ❌ 403 |

**That is exactly the behaviour you describe**: one truck's Connect control has always worked and the
others have always been greyed. `test-kitchen` is owned by `dbonini82@gmail.com`, so it works in the
browser session signed in as that account and nowhere else.

**Not established:** which Supabase account your browser is actually signed in as right now — that lives
in a session cookie I cannot read. The table above covers every possibility, and the observed symptom
identifies it: the truck that works names the account.

---

## 4. DOES THE OPERATOR RECORD DIFFER? YES — IN THE ONLY WAY THAT MATTERS

**QUOTED:**

- **A different owner for every truck.** Not a missing `operator_id`, not a malformed row — three
  well-formed operators, three different people, three different `auth_user_id`s. All three trucks have
  a non-null `operator_id`, so condition 2 does not fire for any of them.
- **`truck_users` holds ZERO rows for all of these trucks.** Queried directly: `0` rows across
  test-kitchen, real-thai-food, pizzeria-gusto and test-truck-3-2. So there is no membership of any kind
  — and per `:55-56` a membership would not have helped, because the table is never consulted.
- **Nothing about how the accounts were created differs in a way this route reads.** It reads exactly
  two fields: `trucks.operator_id` and `operators.auth_user_id`. Both are well-formed for all three.

**Not established:** whether the operator rows were created by different routes (self-serve signup vs
`lib/provision-truck.ts` vs by hand). Nothing in the auth path reads any provenance field, so it cannot
be the cause either way.

⚠️ **The `demo-…` trucks are a genuinely different case**: `operator_id` is `null`, so they fail at
condition **2** rather than condition 4. Same message, different reason.

---

## 5. WHEN IT STARTED — QUOTED, AND IT PREDATES TODAY BY THREE DAYS

```
$ git log --oneline -S"requireOwner" -- app/api/stripe/connect/route.ts
4f0f2c5 online payments

$ git log -1 --format="%H%n%ad%n%s" --date=iso 4f0f2c5
4f0f2c5f5bcef5554ffd6002688a1479e62d6a65
2026-08-10 16:28:14 +0100
online payments
```

**The ownership check was present in the route's very first commit** — `4f0f2c5`, **10 August 2026,
16:28**. `git show 4f0f2c5:app/api/stripe/connect/route.ts` contains the identical condition:

```ts
if (!sessionOperator || sessionOperator.id !== truck.operator_id) return null
```

with the identical "OWNERSHIP, not membership" comment. **It was never added later and never tightened.**

The block has been touched once since, by `6fd4b97 payment changes`, which added `country` to the
`trucks` select and to the returned `Ctx` — **it did not change the ownership condition**.

**So the behaviour has existed since the feature shipped, three days before today's live-key swap.**
That matches your account exactly, and it rules the key change out as the cause. QUOTED.

---

## 6. "UNAUTHORISED" IS OURS, NOT STRIPE'S

**QUOTED**, produced in exactly one place — `app/api/stripe/connect/route.ts:87`:

```ts
if (!ctx) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
```

`grep -rn "'Unauthorised'"` finds this as the only producer on this path. **Stripe is not involved: the
403 is returned before any Stripe module function is called**, and for a truck whose
`stripe_account_id` is `null` the `status` branch would not call Stripe even if auth passed
(`:98-104` returns early).

### How it reaches the screen — the full chain, QUOTED

1. `route.ts:87` → `403 {"error":"Unauthorised"}`
2. `components/manage/PaymentsTab.tsx:142-143`:
   ```ts
   const data = await res.json().catch(() => ({}))
   if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
   ```
   → throws `Error("Unauthorised")` — **the route's own string, passed through verbatim**.
3. `:158` → `setFetchError(e instanceof Error ? e.message : 'Could not reach Stripe')` → `fetchError = "Unauthorised"`
4. `:191` → `configError = fetchError` → truthy
5. `:264-269` → the amber card renders, with `{configError}` as its second line:
   > **Card payments aren't configured yet**
   > Unauthorised
6. `:338` → `disabled={creating || !!configError}` → **the button greys**

🔴 **The headline "Card payments aren't configured yet" is misleading here** — it is the component's
fixed string for *any* `configError`, and nothing about configuration is wrong. The true statement is
"you are not signed in as this truck's owner". The word that carries the meaning is the one below it,
and it is ours.

---

## 7. ARE THE LIVE KEYS OR THE PLATFORM'S ACTIVATION STATE CONTRIBUTING?

**No. Both are irrelevant to this particular error.** Three independent reasons, all QUOTED:

1. **Ordering.** `requireOwner` runs at `:86`, before the `try` block at `:94` and before any function
   from `lib/stripe/connect.ts` is reached. The 403 returns without a single Stripe call.
2. **No Stripe call would happen anyway.** With `operators.stripe_account_id` null for both
   real-thai-food and pizzeria-gusto, the `status` branch returns at `:99-104` without contacting Stripe.
3. **Timing.** The condition has been in place since 10 August (section 5); the keys changed today.
   A cause cannot postdate its effect.

**And the message would look different if they were involved.** A Stripe failure surfaces through the
catch at `:311` carrying **Stripe's own message** — the "permissions-shaped" error described in
`docs/live-key-guard-report.md` §5b — not the string `Unauthorised`.

⚠️ **They are not irrelevant to what happens NEXT, only to this error.** Once you are signed in as the
right owner and the 403 clears, everything in `docs/connect-gate-report.md` §5 applies unchanged:
`STRIPE_SECRET_KEY` is `sk_live_`, the sandbox guard is gone from `HEAD`, and pressing the button creates
a **real, undeletable live connected account** with no confirmation step. **Fixing the auth removes the
last thing standing between that button and a live account.**

**Not established:** whether the platform's live Connect profile is configured at Stripe. If it is not,
`createConnectedAccount` would fail at the API and nothing would be created — a safety net, but not one I
tested, because testing it means attempting a live account creation.

---

## 8. SUMMARY OF WHAT IS AND IS NOT ESTABLISHED

**Established (QUOTED):** the four null-return conditions and their single shared 403; that the status
code is 403 and no 401 exists in the route; that `truck_users` is never consulted; that `/api/manage`
authenticates on the token alone and defaults to owner; the operator and `auth_user_id` for all three
trucks; that `truck_users` has zero rows for them; that the ownership condition dates from `4f0f2c5`,
10 August 2026 16:28, unchanged since; that `Unauthorised` is produced only at `route.ts:87` and reaches
the screen verbatim.

**Established by inference:** that exactly one truck's Payments tab can work per browser session, and
which one that is for each possible signed-in account.

**Not established:** which account the browser is currently signed in as; whether the operator rows were
created by different routes; whether a live platform Connect profile exists at Stripe.
