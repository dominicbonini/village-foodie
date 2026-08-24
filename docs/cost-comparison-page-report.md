# Cost comparison page — STOPPED. THE REFERENCE PROTOTYPE DOES NOT EXIST.

**Date:** 23 August 2026
**Status:** 🔴 **NOT BUILT. NO FILE WAS CREATED OR MODIFIED.** Nothing deployed, nothing committed,
`next dev` not run.

🔴 **`~/Downloads/cost-comparison-v11.jsx` IS NOT ON THIS MACHINE.** The brief says *"Read it first …
the layout, the maths, the input order and the copy are all settled and should be followed closely."*
Without it, "followed closely" would mean **inventing** the layout, the input order, and — the part that
matters — **the arithmetic of a page that compares our costs to a competitor's.** That is a commercial
claim, and guessing it is the single worst thing I could do here.

**Searched, and this is exhaustive rather than a first look:**

```
find /Users/dominicbonini -maxdepth 4 -iname "*cost*comparison*"   -> nothing
find ~/Downloads ~/Desktop ~/Documents /tmp -maxdepth 2 -name "*.jsx"  -> nothing (no .jsx anywhere)
find ~/Downloads ~/Desktop -maxdepth 1 -newermt "2026-08-21"        -> nothing but an empty Screenshots dir
```

**The newest file in `~/Downloads` is `manual-delta-simulator-autoreplies.md`, 20 August 23:45** — three
days old. **Nothing has landed there since.**

⚠️ **Tasks 2, 3 and 4 are diff-shaped against text I do not have.** They tell me to replace *"Four quick
questions…"*, to change question 3's allowance line, to delete an *"Adjust plan prices"* toggle, and to
keep a hero `fontSize` computed from digit count. **I cannot apply an edit to a string I have never
seen**, and reconstructing the prototype from the instructions that describe changes to it would produce
something that merely does not contradict them.

**Please re-send the file.** When it arrives the build is mechanical, because everything it does NOT
contain is settled below.

---

# WHAT I SETTLED ANYWAY, SO THE RE-RUN IS SHORT

None of the four questions below needed the prototype. **All are read from source, not from memory.**

---

# §1 — TASK 1: WHERE EVERY PRICE COMES FROM. 🔴 THIS IS THE FINDING THAT MATTERS.

You suspected the allowances and the 0.99% had no home. **It is worse than that, and better documented
than you would expect.**

## 1.a Every value the calculator needs is a DISPLAY STRING. None is a number.

| Value | Where it lives | Usable as a number? |
|---|---|---|
| Pro £29 / Max £49 | `PLAN_META` in **`lib/features.ts`**, as `price: '£29/mo'` | 🔴 **NO** — a string. `PLAN_PRICES` in `lib/plan-features.ts` derives from it and is also strings. |
| £1,500 / £2,000 allowance | `PLAN_ALLOWANCES` in **`lib/plan-features.ts`** | 🔴 **NO** — `'First £1,500 of online orders included, then 0.99%'` |
| 0.99% service fee | 🔴 **NOWHERE OF ITS OWN.** Only inside those two allowance strings, one `FEATURE_SECTIONS` cell (`'0.99%'`), and one footnote sentence | 🔴 **NO** |
| Card processing 1.5% + 20p | `CARD_FEES.online` in **`lib/plan-features.ts`** | ✅ **YES** — `{ pct: 1.5, pence: 20 }`, structured |

🔴 **SO THE ONLY VALUE ALREADY STRUCTURED IS THE ONE YOU SAID COULD BE A LOCAL CONSTANT.** Everything
that must come from the source of truth is a string; the one thing that need not be, is a number.

## 1.b 🔴 AND THE CODEBASE ALREADY KNOWS. IT SAYS SO, AT LENGTH, IN THE FILE.

`CARD_FEES` carries this comment — written *because* of the allowances:

> *"⚠️ STRUCTURED VALUES, NOT DISPLAY STRINGS, AND THAT IS THE WHOLE POINT. **The £1,500 / £2,000
> allowances were defined only INSIDE display strings, so lib/payments cannot read a number and therefore
> cannot apply an allowance at all.** Do not repeat that here: when Stripe Connect and Terminal are built,
> the payments code needs `pct` and `pence` as numbers. Every display string below is DERIVED — add a new
> surface by calling feeLabel(), never by writing "1.4% + 10p" again."*

**The payments code is already blocked by this. A calculator is the second consumer to hit the same wall,
and the first that cannot work around it at all** — its entire output is arithmetic on those numbers.

## 1.c ⚠️ WHERE I WOULD PUT THEM — AND WHY I DID NOT

**In `lib/plan-features.ts`, beside `CARD_FEES`, following the pattern that file already establishes and
tells you to follow:** structured numbers, with the display strings **derived** from them.

```
PLAN_ALLOWANCES stays as the RENDERED string, but is BUILT from something like:
  PLAN_ONLINE_ALLOWANCE = { starter: null, pro: 1500, max: 2000 }   // £, numeric
  PLATFORM_FEE_PCT      = 0.99                                       // % above the allowance
  PLAN_MONTHLY_PENCE    = { starter: 0, pro: 2900, max: 4900 }       // or a numeric field on PLAN_META
```

🔴 **I DID NOT MAKE THAT CHANGE, AND THE INSTRUCTION NOT TO IS THE RIGHT ONE** — `lib/plan-features.ts`
is explicitly out of scope. **But note the consequence: Task 1 as written cannot be satisfied while that
module is out of scope.** *"Source every one of them from the existing single source of truth"* has no
numeric source to read, and the only way to build the page without touching that module is to **parse
`'£29/mo'` and `'First £1,500 of online orders included, then 0.99%'` at runtime** — which is a second
source of truth wearing a regex, and would break the day someone writes `'£29'` or reorders the sentence.

**This is the "report rather than invent" case your brief anticipated. It needs a decision from you before
the page can be built correctly, and it is a bigger prize than the page** — it also unblocks the
allowance logic in `lib/payments`.

## 1.d 🔴 A SECOND BLOCKER ON THE SAME AXIS: PRICES ARE MASKED PRE-LAUNCH

`lib/pricing.ts` gates every commercially-sensitive price behind `NEXT_PUBLIC_PRICING_PUBLISHED`, and
renders `'TBC'` until it flips. Its own comment is explicit:

> *"**The two allowance amounts and the 0.99% rate are deliberately NOT here and are still masked until
> pricing is published.**"*

⚠️ **So a calculator sourced correctly would, in production today, compute against "TBC".** The page has
to decide whether it bypasses the mask, respects it (and is therefore useless until launch), or is
moot because the gate in §2 means only admins reach it anyway. **My reading is that the gate makes it
moot — the mask exists to stop TEST TRUCKS seeing real pricing, and an admin-only page has no test
trucks on it — but that is a commercial call and I am not taking it for you.**

---

# §2 — WHERE IT LIVES, AND THE GATE

## 2.a Route

**Recommendation: `app/landing/cost/page.tsx`** — i.e. `/landing/cost`.

**Why a child of `/landing` rather than a sibling:** it inherits the landing's gate **by construction**,
because `app/landing/layout.tsx` wraps every descendant route. **No second gate to write, and none to
forget.** The alternative — a top-level `/cost` — needs its own layout copy, which is the drift this
whole session has been about.

**The existing route shape** (`app/{landing,contact,hire,signup,login,trucks}/page.tsx`) is flat, so
`/landing/cost` is the only nested marketing route — **a deviation worth your sign-off, and the reason
for it is the gate.**

## 2.b ✅ THE GATE, AND IT IS INHERITED RATHER THAN COPIED

`app/landing/layout.tsx`:

```tsx
export const dynamic = 'force-dynamic'

export default async function LandingLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production' && !(await verifyAdmin())) {
    redirect('/contact')
  }
  return <>{children}</>
}
```

**Production-only, server-side, `operators.is_admin` via the canonical `verifyAdmin`, `force-dynamic` so
it evaluates per request, dev deliberately left open.**

🔴 **IF YOU PREFER A TOP-LEVEL ROUTE, THE COPY MUST REDIRECT TO `/contact` AND NOT TO `/`.** The layout's
own comment records that `'/'` produced an **infinite redirect loop on hatchgrab.com**, because `proxy.ts`
rewrites `/` to the landing — on the domain given to Apple as the Marketing URL. **That is the single
easiest thing to get wrong when copying this gate.**

---

# §3 — TASK 4: THE LANDING'S PRIMARY CTA IS NOT A ROUTE

🔴 **THERE IS NO SIGNUP ROUTE TO REUSE, BECAUSE THE LANDING'S CTAs DO NOT NAVIGATE.**

Every primary CTA on the landing — *"Upload my menu →"*, *"Try Free"*, the nav CTA — is `<DemoCta>`:

```tsx
export function DemoCta({ className, children }: { className?: string; children: React.ReactNode }) {
  const { setOpen } = useDemoModal()
  return <button type="button" className={className} onClick={() => setOpen(true)}>{children}</button>
}
```

**A client button that opens the demo-upload modal through a React context**, not a link. The landing
wires it with `DemoModalProvider` + `DemoModal` from `components/landing/DemoUpload.tsx`.

**So Task 4 has two readings and I will not pick for you:**

| Option | What it means |
|---|---|
| **(a) Match the landing exactly** | Wrap the page in `DemoModalProvider`, use `<DemoCta>` for both CTAs, render `<DemoModal>`. **Identical behaviour to the landing**, at the cost of pulling the whole demo-upload flow onto a calculator page. |
| **(b) Link to `/signup`** | A real route, ungated at the layout level (no `app/signup/layout.tsx`). ⚠️ **But it is NOT what the landing's primary CTA does**, so "use whatever route the landing page's primary CTA uses" would not be satisfied. |

✅ **The zero-or-negative fallback is unaffected either way** — *"Try it with your menu →"* is a label
swap, and I will exercise that branch explicitly rather than assume it, as instructed, once the prototype
is back.

---

# §4 — WHAT I DID NOT DO

- ✅ **No file was created.** No route, no component, no report-adjacent scaffolding.
- ✅ **`lib/plan-features.ts`, the parity guard, the landing page and the pricing table are untouched.**
- ✅ **Nothing was rendered.** `next dev` was not run.

---

# §5 — WHAT REMAINS UNOBSERVED

**Everything about the page itself**, because it does not exist. Specifically, and these carry forward to
the re-run:

1. 🔴 **The prototype's maths, layout, input order and copy** — unseen.
2. ⚠️ **Whether `/landing/cost` renders correctly under the landing layout** — the gate is inherited by
   construction, which is a structural claim, **not an observation**.
3. ⚠️ **375px behaviour of the four truck buttons and the two fee inputs** — your Task 5 quality floor.
   As with the last several tasks, **I will not be able to establish that without rendering**, and will
   say so rather than assert it.
4. ⚠️ **Keyboard focus on range inputs** — the default focus ring is often invisible on
   `input[type=range]`, so this is likely to need explicit styling. Cannot be confirmed without a browser.

## 🔴 THREE DECISIONS WAITING ON YOU

1. **Structuring the price numbers** (§1.c) — **the page cannot be built correctly without it**, and it
   also unblocks the allowance logic in `lib/payments`. Out of scope for me to make.
2. **Whether the page bypasses the pre-launch pricing mask** (§1.d).
3. **Which CTA the page uses** (§3) — the demo modal, or `/signup`.

**And the file. Everything else is ready.**
