# Welcome email — brand orange, and removing the dashboard token

**Date:** 4 August 2026. Follows the previous tidy pass.
**Migrations:** none. **SQL:** none. **`next dev` / `next build`:** not run.

No garbled spans. One instruction turned out to need less building than expected — the logged-out return
path already exists — and that is reported under E2(d) rather than built.

---

## E1. BUTTON COLOUR — the HatchGrab wordmark orange

### 🔴 The value is authoritative, and it matches

`#EF8B2C` is **not** a fallback. It is the literal `fill` on the wordmark's "GRAB" letterforms in
[public/logos/hatchgrab-wordmark.svg](public/logos/hatchgrab-wordmark.svg), and the identical value
appears in `hatchgrab-wordmark-white.svg`:

```
fill="#EF8B2C" d="M725.69 316.83 …"      ← the orange letterforms
fill="#16314F" …                          ← the companion navy, "HATCH"
```

**Dominic's screenshot read was exactly right** — it matches the artwork character for character, so
there is nothing to correct. `lib/brand.ts` held no colour hex before this change (only the Tailwind
class strings `HEADER_BG` / `TABS_BG` / `PAGE_BG`), so the SVG was the only source available, and it is
the better one anyway: it is the artwork itself rather than a value copied from it.

### The named constant, and where it lives

```ts
// lib/brand.ts
export const HATCHGRAB_ORANGE_HEX = '#EF8B2C'
export const HATCHGRAB_NAVY_HEX   = '#16314F'
```

**Decision: `lib/brand.ts`, and the reasoning matters more than the location.** That file already owns
the wordmark asset paths — `HATCHGRAB_WORDMARK_SVG` and friends — and this hex is read off exactly that
asset, so the colour and the file it comes from now sit together. Its header comment already exists
because *"two call sites hardcoded two different paths for the same logo"*; a second anonymous orange
literal would be the same failure in a different medium.

**On the class-string objection you raised:** it is real and is handled by naming rather than by
exclusion. Everything else in that file's colour section is a Tailwind class string, kept as
documentation because Tailwind purges dynamic values. This is consumed where Tailwind cannot reach at
all — an inline `style` in an email template. The **`_HEX` suffix** marks the difference so nobody drops
it into a `className` and gets a silent no-op, and the comment says so explicitly.

`HATCHGRAB_NAVY_HEX` is defined alongside it for completeness. **Nothing uses it** — it is there so the
next person needing the brand navy finds it instead of re-reading the SVG.

### Contrast — recorded, not acted on

| | White text contrast | AA normal text (4.5:1) |
|---|---|---|
| `#EF8B2C` — wordmark orange, **new** | **2.50:1** | ❌ |
| `#ea580c` — orange-600, old | 3.56:1 | ❌ |
| `#16314F` — wordmark navy, for reference | 13.24:1 | ✅ |

So this is a **step down**, from 3.56:1 to 2.50:1. Not changed on those grounds, per your instruction —
it is a deliberate brand decision scoped to email. Both facts are recorded in the comment above
`button()` **and** at the constant's definition, including the explicit line that **the app-wide button
token is a separate decision that must not inherit from here** — adopting a lower-contrast value across
the product because an email uses it would make the existing orange-600 backlog item worse, not better.

### ⚠️ Confirmed: this moves email 1's button too

`button()` is shared, so **the verification email's "Confirm my email address" button changes colour as
well**. That is intended and is stated in the comment: the two operator emails must not arrive in
different oranges. **Email 1's copy, spacing and fine print are otherwise untouched** — only the shared
button's `background` value changed.

---

## E2. REMOVING THE DASHBOARD TOKEN FROM THE EMAIL BODY

### (a) What the email now links to

Both the button `href` and the plain-text URL are now the bare **`https://www.hatchgrab.com/manage`**.

The change is at the source, not in the template: `verify-signup` used to compute

```ts
manageUrl: truck?.dashboard_token ? `${base}/manage/${enc(truck.dashboard_token)}` : `${base}/setup`
```

and now passes `manageUrl: \`${base}/manage\`` unconditionally. The template already renders whatever it
is handed in both formats, so **(f) is satisfied structurally** — there is one value, used twice, and
the HTML and plain-text alternatives cannot diverge because neither builds a URL of its own.

The branch on `truck` is gone, and that is a small improvement rather than a loss: `/manage` sends an
operator with no truck to `/setup` itself, so the destination is decided **at click time against live
state** rather than baked into an email that may be days old.

### (b) 🔴 Which resolution path I reused, and why

**Neither, exactly — I extracted the one both were already duplicating, and pointed all three at it.**

The two existing copies were byte-equivalent, and `/api/setup`'s own comment admitted it:
*"Same truck-selection rule as verify-signup."* Reusing "one of them" as an endpoint was not possible —
`/api/setup?check=truck` returns **JSON**, and an email link needs a GET that **redirects** — so calling
it would have meant a third hand-written copy of the rule regardless. Instead:

**New:** [lib/resolve-operator-truck.ts](lib/resolve-operator-truck.ts) — `resolveOperatorTruck(supabase, operatorId)`.

**Now called by all three**, with no behaviour change to any of them:

| Caller | Was | Now |
|---|---|---|
| [app/api/auth/verify-signup/route.ts](app/api/auth/verify-signup/route.ts) | inline copy | `resolveOperatorTruck(...)` |
| [app/api/setup/route.ts](app/api/setup/route.ts) `?check=truck` | inline copy (the acknowledged duplicate) | `resolveOperatorTruck(...)` |
| [app/manage/page.tsx](app/manage/page.tsx) | — (new) | `resolveOperatorTruck(...)` |

**Net effect: two copies became one, and the third caller added none.** The selection rule is unchanged —
prefer a truck still in setup, else the oldest — and `/api/setup?check=truck`'s response shape is
identical.

### (c) 🔴 Determinism

`.order('created_at', { ascending: true })` lives **inside the helper**, so it cannot be forgotten by a
caller. Its comment states why in terms of the failure it prevents: without it PostgREST returns rows in
planner order, so "the first one" could be a different truck on two consecutive requests — an operator
with two trucks would follow the same emailed link twice and land in two different places. That was
previously true of the *new* route by omission; now it is structurally impossible for any caller.

### (d) The two edge cases — and 🔴 the login return path already exists

| Case | Behaviour |
|---|---|
| **No session** | proxy.ts treats `pathname.startsWith('/manage')` as protected and redirects to **`/login?next=/manage`** ([proxy.ts:163-168](proxy.ts#L163-L168)). `app/manage/page.tsx` repeats it as a belt-and-braces fallback for the native shell, which proxy deliberately defers rather than gating. |
| **Session, no operator row** | → `/setup` |
| **Session, operator, no truck** | → `/setup` |
| **Session, operator, truck** | → `/manage/<dashboard_token>` |

> 🔴 **Yes — the login flow CAN return them to where they were heading, and I built nothing for it.**
> proxy sets `?next=<pathname>` on the bounce, and `app/login/page.tsx:13` reads
> `searchParams.get('next')` and pushes to it after a successful sign-in
> ([:73](app/login/page.tsx#L73)). An explicit `next` is honoured verbatim — the special-case handling
> at :56-67 applies only when `next` is the default `/dashboard`. So a logged-out operator following the
> emailed link is asked for email and password and is then forwarded back to `/manage`, which resolves
> and forwards again. **That is entirely pre-existing behaviour.**

The route mirrors [app/dashboard/page.tsx](app/dashboard/page.tsx), which has done exactly this job for
`/dashboard` since long before this change — so `/manage` is now the sibling it always should have had.

### (e) "Worth bookmarking. It works on any device."

**Unchanged, and now more accurate than it was.** The bookmarked URL is `/manage` — stable, tokenless,
and correct on any device the operator signs in on. Previously it was a token URL that would have been
wrong the moment they were sent to a different truck.

### (f) HTML and plain text

Both changed together because both read the same `params.manageUrl`. Verified below.

### 🔴 What was NOT changed

* **`/api/manage`'s authentication is untouched.** It still authenticates on `dashboard_token` alone.
* **The dashboard token itself is untouched** — not rotated, not shortened, not expired.
* **Existing `/manage/<token>` links still work exactly as before.** `app/manage/page.tsx` is a sibling
  index route, not a replacement for `app/manage/[token]/page.tsx`.

---

## VERIFICATION

```
$ npx tsc --noEmit
TSC EXIT CODE: 0

$ npx eslint lib/email-signup.ts lib/brand.ts lib/resolve-operator-truck.ts \
             app/manage/page.tsx app/api/auth/verify-signup/route.ts app/api/setup/route.ts
(no output — clean)
```

### 🔴 No dashboard token appears in either signup email — verified by grep, not inspection

```
$ grep -nE "dashboard_token|/manage/\$|manage/\$\{" lib/email-signup.ts
   NONE

$ grep -rn "manageUrl:|verifyUrl:" app/api/auth/verify-signup/route.ts app/api/signup/route.ts
   verify-signup:113   manageUrl: `${base}/manage`
   signup:213          verifyUrl: link
```

The email module can only render what it is handed, and the two call sites hand it:

* **Email 2 (welcome):** `${base}/manage` — **no token of any kind.**
* **Email 1 (verification):** `${origin}/api/auth/verify-signup?token=<token>` — this is the
  **verification** token, which is a different thing and is meant to be there: single-purpose,
  256-bit, stored in `operator_email_verifications` with a 30-day expiry and a `verified_at` marker
  that retires it on first use. It is **not** a dashboard token and grants no access to `/api/manage`.

**Stated plainly: after this change, no dashboard token appears in either signup email.**

### Files touched

| File | Reason |
|---|---|
| [lib/brand.ts](lib/brand.ts) | E1 — `HATCHGRAB_ORANGE_HEX` (+ navy for reference), with provenance and the contrast/scope note. |
| [lib/email-signup.ts](lib/email-signup.ts) | E1 — imports the constant and uses it in `button()`; comment rewritten to record the contrast step-down and the do-not-inherit rule. |
| [lib/resolve-operator-truck.ts](lib/resolve-operator-truck.ts) | **NEW.** E2(b) — the one truck-selection rule, with the deterministic ordering held inside it. |
| [app/manage/page.tsx](app/manage/page.tsx) | **NEW.** E2(a) — the tokenless `/manage` entry point: session → operator → truck → redirect. |
| [app/api/auth/verify-signup/route.ts](app/api/auth/verify-signup/route.ts) | E2 — passes the tokenless URL to the welcome email; uses the shared resolver. |
| [app/api/setup/route.ts](app/api/setup/route.ts) | E2(b) — `?check=truck` now calls the shared resolver instead of its duplicate copy. |

Nothing else. No migration, no SQL.

### Confirmations

* **The admin create-operator email is untouched** — `app/api/admin/create-operator/route.ts` does not
  appear in the diff. Verified mechanically. (It links to `/login` and has never carried a token.)
* **Email 1's copy is unchanged** — its greeting, body, fine print and the
  `color:#64748b;font-size:13px;margin-top:28px;` on *"If the button doesn't work, paste this in:"* are
  all exactly as they were. The only thing that reaches email 1 is the shared button's `background`
  value, which E1 intends.
* **Gusto and Real Thai Food are unaffected.** They receive **neither** email — `/api/signup` and
  `/api/auth/verify-signup` run only for a new self-serve account, never for an existing operator. Their
  existing `/manage/<token>` links, their dashboard tokens and `/api/manage`'s authentication are all
  untouched; `app/manage/page.tsx` is a new sibling route that changes nothing about the token route
  beside it. The only code they share with this change is `resolveOperatorTruck`, which is called by no
  path they reach.
