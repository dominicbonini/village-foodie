# Cost comparison page — the server/client split (Fix 2)

**Date:** 23 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` NOT run** — you said you would run it.
**Prompt integrity:** no span arrived garbled. No instruction contradicted another. **Task 2's stop
condition did not fire, but it came close enough to need a straight answer — see §3.b.**

@G@ **TWO FILES, AS APPROVED:** `app/landing/cost/page.tsx` (server, the gate) and
`app/landing/cost/CostComparison.tsx` (client, the calculator). Nothing else was touched —
`lib/pricing.ts`, `lib/plan-features.ts`, `lib/features.ts`, `lib/auth/admin.ts`, the landing page and
`app/landing/layout.tsx` are all unchanged.

@R@ **READ §5 BEFORE YOU RUN IT.** In dev, with the flag unset, this page gates where the landing does
not — you can be bounced off a page the landing lets you onto.

---

# §1 — TASK 1: THE MOVE, PROVEN BYTE-IDENTICAL

```
  diff: IDENTICAL — 0 differing lines
  sha256 original : 201b748c023133901a77cf08ada5a9d8183d565c80bddff99f325061a9a18bf5
  sha256 moved    : 201b748c023133901a77cf08ada5a9d8183d565c80bddff99f325061a9a18bf5
```

@G@ **NOT ONE CHARACTER CHANGED — not even the export name.** Your brief allowed for the export line and
import paths to move; **neither needed to.**

- **Import paths:** every import in the body is either a package (`react`) or an absolute alias
  (`@/components/landing/DemoUpload`, `@/lib/features`, `@/lib/plan-features`). **There are no relative
  imports**, so moving the file one name sideways changed nothing.
- **Export name:** the default export is still `CostComparisonPage`. A default export's local name is
  invisible to the importer, so `page.tsx` names it `CostComparison` on its own side. **Renaming it
  would have been a diff line for no behavioural gain.**

⚠️ **ONE OBSERVATION, NOT A CHANGE.** Because the move was absolute, `CostComparison.tsx` still carries
the original header comment explaining why the route lives under `/landing` and how the gate works.
**That rationale now belongs in `page.tsx`, which has its own fuller version.** I did not touch it —
trimming it is a body edit you did not ask for. **Say the word and it is a one-line follow-up;** left
alone it is two descriptions of one gate in two files, which is the shape §1 of the manual warns about.

---

# §2 — TASK 2: THE GATE

```tsx
export default async function CostPage() {
  if (!PRICING_PUBLISHED && !(await verifyAdmin())) {
    redirect('/contact')
  }

  return <CostComparison />
}
```

## 2.a The flag accessor used

@G@ **`PRICING_PUBLISHED`, imported from `lib/pricing.ts`.** That module's own accessor
(`process.env.NEXT_PUBLIC_PRICING_PUBLISHED === 'true'`), which the Billing page, `FeatureGate` and the
per-van add-on already read. **No new accessor was written and `process.env` is not read directly here.**

⚠️ **It is a `NEXT_PUBLIC_` variable, so it is inlined at BUILD time.** The flag half of this gate cannot
change without a redeploy. That is not a defect — it is the same property every other consumer of
`lib/pricing.ts` has — but it means "publishing pricing" is a deploy, not a toggle.

## 2.b The admin check

@G@ **`verifyAdmin` from `lib/auth/admin`** — the same function `app/landing/layout.tsx` and the admin
API use. **No second mechanism.** It is short-circuited by `&&`, so **once pricing publishes this costs
no cookie read at all.**

@G@ **Redirect target is `/contact`.** Never `/` — `proxy.ts` rewrites `/` to the landing on
hatchgrab.com, so refusing someone to `/` loops forever on the domain given to Apple as the Marketing
URL. **It is also the destination the landing layout already uses**, so the two gates refuse people to
the same place rather than each inventing a behaviour.

---

# §3 — TASK 2: HOW THE TWO GATES INTERACT

## 3.a The matrix

```
   env        viewer    flag   landing layout              cost page gate                    outcome
   ---------- --------- ------ --------------------------- --------------------------------- -------------------------
   production admin     set    layout: pass (admin)        page: pass (flag short-circuits)  SEES THE PAGE
   production admin     unset  layout: pass (admin)        page: pass (admin)                SEES THE PAGE
   production non-admin set    layout: REDIRECT /contact   page: would pass (flag)           STOPPED BY THE LAYOUT
   production non-admin unset  layout: REDIRECT /contact   page: would also redirect         STOPPED (both agree)
   dev        admin     unset  layout: pass (dev exempt)   page: pass (admin)                SEES THE PAGE
   dev        non-admin unset  layout: pass (dev exempt)   page: REDIRECT /contact           STOPPED BY THIS PAGE ONLY
   dev        non-admin set    layout: pass (dev exempt)   page: pass (flag)                 SEES THE PAGE
```

**Which runs first:** the layout wraps the page, and in the App Router a layout and its page may render
concurrently. @G@ **The order does not change the outcome, because both gates redirect to the same
place** — whichever refuses first, a refused visitor lands on `/contact`. **I am not asserting an
ordering I have not observed; I am saying the outcome is order-independent.**

## 3.b @R@ YOUR DIRECT QUESTION: A NON-ADMIN WITH THE FLAG SET DOES **NOT** REACH THE PAGE

**The layout stops them.** `app/landing/layout.tsx` gates on admin alone — **it knows nothing about
`PRICING_PUBLISHED`** — so in production a non-admin is redirected whatever the flag says.

**I did not stop, and here is the reasoning, because it is a judgement rather than an obvious call.**
The split had two purposes:

| Purpose | Achieved? |
|---|---|
| **(a) Impossible to leak before pricing publishes**, even if the landing ungates | @G@ **YES.** Remove the layout's gate tomorrow and this page still refuses non-admins while the flag is unset. **This was the 🔴 rationale in your Fix 2 brief and it is delivered.** |
| **(b) Opens by itself at launch** | @R@ **NO — not from this route.** While the landing is gated, setting the flag changes nothing for a non-admin. |

@G@ **The load-bearing half works**, which is why building was right. ⚠️ **But (b) is genuinely blocked,
and it needs one of two decisions from you:**

1. **Move the route out from under the landing** (e.g. `/cost`), where its own gate is the only one — at
   which point the redirect-to-`/contact` reasoning has to be copied into it, **which is the duplication
   the `/landing/cost` choice existed to avoid.**
2. **Leave it, and accept that this page opens when the LANDING opens**, not when pricing publishes.

**Neither is a code change I can make on my own authority, and (b) was never the safety property — it
was the convenience one.**

---

# §4 — TASK 3, AND THE BUNDLE QUESTION

## 4.a The comment is at the gate

`page.tsx` opens by naming the "simplification" and why it is wrong, in the words the next person will
be tempted by:

> *"The obvious 'simplification' is to delete this file and write, inside the client component:
> `{PRICING_PUBLISHED || isAdmin ? <Calculator/> : null}` … 🔴 THAT WOULD NOT PROTECT THE PRICES, AND IT
> WOULD LOOK LIKE IT DID … A client-side conditional hides the MARKUP; the module is still in the
> JavaScript bundle sent to the browser … 🔴 SO: IF THIS FILE IS COLLAPSED INTO THE CLIENT COMPONENT, THE
> GATE IS GONE AND NOTHING WILL SAY SO. The build will pass, the page will look identical, and the
> prices will be public."*

## 4.b Where the constants live now

@G@ **The client module still imports all four:** `PLAN_MONTHLY_PENCE`, `PLAN_ONLINE_ALLOWANCE`,
`PLATFORM_FEE_OVER_ALLOWANCE`, `CARD_FEES`. **It has to — it does the arithmetic.**

@G@ **The server module imports none of them.** Its only imports are `redirect`, `verifyAdmin`,
`PRICING_PUBLISHED` and the client component. A scan with comments stripped finds **0 price-constant
references in its code** (4 in comments, describing what it is protecting).

## 4.c ⚠️ "NOT SHIPPED, NOT MERELY HIDDEN" — TRUE, WITH ONE HONEST QUALIFICATION

**When the gate fails, `redirect()` aborts the render and `return <CostComparison />` is never reached.**
Nothing the refused visitor receives references the client component, so **the browser never requests its
chunk, and no price data appears in any payload they are sent.** That is the real difference from the
client-side conditional, which ships the module to **everyone who loads the URL**, guaranteed, in the
initial payload.

@W@ **THE QUALIFICATION, BECAUSE OVERCLAIMING THIS WOULD BE THE WRONG KIND OF CONFIDENCE:** the compiled
chunk still exists as a static asset under `/_next/static/chunks/…` and is fetchable by anyone who knows
its hash-named URL — as is every code-split chunk in any Next app. **The split changes "served to every
visitor" into "referenced by nothing a refused visitor receives". It does not make the bytes
unreachable to someone who has already seen the URL.** If unpublished pricing must be unreachable in the
strong sense, the numbers cannot live in a client module at all — they would have to be computed
server-side. **That is a different build and I am not proposing it here.**

---

# §5 — @R@ READ THIS BEFORE YOU RUN `next dev`

**`NEXT_PUBLIC_PRICING_PUBLISHED` is not declared in `.env.local`**, so `PRICING_PUBLISHED === false`
locally.

@R@ **THIS PAGE GATES IN DEV. THE LANDING DOES NOT.** `app/landing/layout.tsx` guards its check with
`process.env.NODE_ENV === 'production'` — deliberately, so local iteration is not blocked. **The gate you
specified has no such clause**, so in dev it is the stricter of the two.

**What that means when you open `/landing/cost`:**

- **Logged in locally with an admin session → you see the page.** `verifyAdmin()` returns true.
- **Not logged in, or not an admin → you are redirected to `/contact`**, on a page the landing itself
  would have let you onto.

@G@ **I implemented the gate exactly as you specified and did NOT add a `NODE_ENV` exemption** — that
would have been deviating from an explicit instruction. ⚠️ **But it is a foreseeable surprise and you
are about to run it, so:** if you want dev parity with the landing, it is one clause —
`process.env.NODE_ENV === 'production' && !PRICING_PUBLISHED && !(await verifyAdmin())` — or set
`NEXT_PUBLIC_PRICING_PUBLISHED=true` in `.env.local`. **Your call; I have not made it.**

---

# §6 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| Body moved unchanged | `diff` + SHA-256 of both files | @G@ **identical, 0 lines, same hash** |
| No relative imports needed rewriting | import scan of the moved body | @G@ **all package or `@/` absolute** |
| Flag accessor | import list of the server module | @G@ **`PRICING_PUBLISHED` from `lib/pricing.ts`** |
| Admin check | import list | @G@ **`verifyAdmin` from `lib/auth/admin`, no second mechanism** |
| Redirect target | source | @G@ **`/contact`**, matching the layout |
| Client module keeps the constants | grep | @G@ **all four still imported** |
| Server module has no price code | comment-stripped grep | @G@ **0 in code, 4 in comments** |
| Server/client roles | first line of each file | @G@ **`page.tsx` has no `'use client'`; `CostComparison.tsx` does** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not offered as verification** |
| Scope | mtimes + `git status` | @G@ **only the two files in `app/landing/cost/`** |

---

# §7 — WHAT REMAINS UNOBSERVED

1. @R@ **NOTHING HAS BEEN RENDERED, AND THE GATE HAS NEVER FIRED.** `next dev` was not run. **No
   redirect has been observed, by either gate, in either environment.** Everything in §3's matrix is
   derived from the two conditionals, not watched.
2. @R@ **THE BUNDLE CLAIM IN 4.c IS ARCHITECTURAL, NOT MEASURED.** I have not built the app and inspected
   the chunks to confirm the client module is absent from a refused response. **The reasoning is sound
   and standard for the App Router; it is not an observation.** A `next build` plus a look at the
   generated payload would settle it.
3. @W@ **The render order of layout vs page is unverified**, which is why §3.a claims only that the
   outcome is order-independent — both redirect to the same place.
4. @W@ **`redirect()` inside an async server component has not been exercised here.** It is the standard
   Next control-flow throw and the landing layout already relies on it.
5. @W@ **Everything unobserved from the build report still is** — the page has never been displayed at
   any width, and the range focus ring remains the first thing to look at in a browser.

## @R@ THREE THINGS FOR YOU

- **Dev behaviour (§5)** — you are about to hit this.
- **Purpose (b) is still blocked (§3.b)** — move the route, or accept that it opens when the landing does.
- **The duplicated header comment (§1)** — one line to say and I will trim it.
