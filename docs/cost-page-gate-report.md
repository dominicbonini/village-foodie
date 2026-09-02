# /landing/cost — is it reachable, and what would it take?

**READ-ONLY. No file was changed and nothing was deployed.** The only write is this report.

**VERIFICATION.** Repository reads, plus **three live HTTP probes against production**
(`https://www.hatchgrab.com`) with a browser user-agent, logged out. Where I could not read a value I
say so and mark it **UNKNOWN** rather than inferring it.

**GARBLED SPANS: none.** No instruction contradicted another. ⚠️ **One premise in the brief is false —
item 6.** The cost page is not a renderer of the feature matrix, so this week's "coming soon" moves
cannot have touched it. §6 shows what it actually imports.

## The short answer

**No, it is not reachable — and it is further from reachable than the gate suggests.** It is gated
**twice**, and even if both gates opened tomorrow **nothing anywhere links to it**, so no visitor could
navigate to it. It also carries **no `noindex`**, which means the day it opens it is the one page in this
area a search engine may index.

---

## 1. The gate on /landing/cost

**File: `app/landing/cost/page.tsx:59`** — READ verbatim:

```ts
if (!PRICING_PUBLISHED && !(await verifyAdmin())) {
  redirect('/contact')
}
```

It is an **OR**: the page renders if pricing is published **or** the visitor is an admin.

**The two values it depends on:**

| Value | Defined | Set by |
|---|---|---|
| `PRICING_PUBLISHED` | `lib/pricing.ts:7` — `process.env.NEXT_PUBLIC_PRICING_PUBLISHED === 'true'` | An **environment variable**, not code |
| `verifyAdmin()` | `lib/auth/admin` | `operators.is_admin` — the same check `app/landing/layout.tsx` uses |

### 🔴 What `PRICING_PUBLISHED` evaluates to in production RIGHT NOW — **UNKNOWN, and I will not guess**

- **Not set anywhere in this repository.** `NEXT_PUBLIC_PRICING_PUBLISHED` does not appear in
  `.env.local`, `vercel.json` or `next.config.*`. With the variable unset the expression is `false`, so
  **locally it is false**.
- **In production it is set in the Vercel project's environment variables**, which this repository cannot
  read. **Check Vercel → Project → Settings → Environment Variables.**
- 🔴 **The live probe cannot disambiguate it either, and the reason is structural:** the layout gate (§3)
  runs *before* this page's gate and is stricter, so an anonymous visitor gets the same redirect whether
  the flag is `true` or `false`. The observable behaviour is identical either way.
- ⚠️ **It is also not leaking**, which is worth stating as a positive: although `NEXT_PUBLIC_` variables
  are inlined into client bundles, every consumer of the mask (`usePriceMask`, `FeatureGate`, Manage →
  Billing, Admin) sits behind authentication, so the value is not exposed on any public page.

**🟢 The practical answer regardless of that flag: this gate is not what is stopping anyone today.**
§3 is.

---

## 2. What "when pricing publishes" means concretely

**One environment variable: `NEXT_PUBLIC_PRICING_PUBLISHED` set to the exact string `'true'`.**

`lib/pricing.ts:3-7`, READ:

> *"Until `NEXT_PUBLIC_PRICING_PUBLISHED === 'true'`, concrete monetary prices render as 'TBC' so test
> trucks don't see/share real pricing before launch. … Flips on at launch via env, no code change."*

**Is the condition met today?** **Not locally** — unset, therefore `false`. **In production, UNKNOWN**
for the reasons in §1.

⚠️ **But "pricing publishes" opening this page is only half true**, and the file itself says so.
`app/landing/cost/page.tsx:20-24`, READ:

> *"It is NOT the page's only protection today: `app/landing/layout.tsx` wraps this route and already
> admits admins only. This gate exists so the page is safe WITHOUT that one… **THE LAYOUT RUNS FIRST AND
> IS STRICTER, so while the landing stays gated a non-admin is stopped there even with the flag set.**"*

**So flipping the flag alone changes nothing for a non-admin.** The manual's "a gate that opens by
itself when pricing publishes" describes *this* gate accurately and **the page inaccurately**.

---

## 3. Does it inherit the landing admin gate as well? — **Yes. Gated twice.**

**Confirmed by file layout, not assumption:** `find app/landing -name layout.tsx` returns **exactly one**
file, `app/landing/layout.tsx`. There is no intervening layout between it and `app/landing/cost/page.tsx`,
so Next.js nests the route inside it.

`app/landing/layout.tsx:44-46`, READ:

```ts
if (process.env.NODE_ENV === 'production' && !(await verifyAdmin())) {
  redirect('/contact')
}
```

**The two gates are not equivalent, and the layout is the binding one:**

| | Landing layout | Cost page |
|---|---|---|
| Condition | `production && !admin` → redirect | `!PRICING_PUBLISHED && !admin` → redirect |
| Opens for | **admins only** | admins **or** anyone once pricing publishes |
| Runs | **first** | second |

**A non-admin never reaches the cost page's own gate.** `CostComparison.tsx:7-12` records this as
deliberate: *"Being a CHILD of that route inherits the gate BY CONSTRUCTION — there is no second gate to
write and none to forget."*

---

## 4. What a non-admin gets in production today

**From the code path:** `app/landing/layout.tsx` runs first, `NODE_ENV === 'production'` is true,
`verifyAdmin()` is false → `redirect('/contact')`. The page component never executes.

**And observed live** — anonymous, browser UA, following redirects:

```
https://www.hatchgrab.com/landing/cost   307 → https://www.hatchgrab.com/contact   → 200
https://www.hatchgrab.com/landing        308 → /  → 307 → /contact                 → 200
https://www.hatchgrab.com/               307 → https://www.hatchgrab.com/contact    → 200
```

**A non-admin gets a 307 to `/contact` and never sees a byte of the calculator.** The redirect target is
deliberate — `page.tsx:57-58` records that redirecting to `/` would loop forever, because `proxy.ts`
rewrites `/` to the landing on hatchgrab.com.

---

## 5. How is it reachable? — 🔴 **It isn't. Nothing links to it.**

**Searched every `.ts`, `.tsx` and `.json` under `app/`, `components/`, `lib/` and `proxy.ts` for
`/landing/cost`. Three hits, and none is a link:**

| Hit | What it is |
|---|---|
| `app/landing/cost/page.tsx:1` | the file's own path comment |
| `app/landing/page.tsx:23` | a comment about shared chrome |
| `components/landing/LandingNav.tsx:61` | a comment in an explanatory table |

**Not in the nav. Not in the footer. Not in the pricing section. Not in the landing body. Nowhere.**

🔴 **This is the finding that matters most, and it is independent of both gates.** Opening the gates
would make the URL *resolve*; it would not make the page *reachable*. Someone would still have to be
handed the link. **A page nobody can navigate to is not live regardless of its gate** — exactly as the
brief puts it.

### ⚠️ A second finding on reachability, in the opposite direction: it has no `noindex`

- `app/landing/cost/page.tsx` exports **no `metadata` and no `generateMetadata`** — confirmed by reading
  the whole file.
- The landing's `robots: { index: false, follow: false }` is `app/landing/page.tsx:48`'s **own metadata
  export**. Metadata does not cascade from a sibling page to a child route.
- `vercel.json`'s `X-Robots-Tag: noindex` headers are scoped to `/api/(.*)`, `/trucks/(.*)`, `/o/(.*)`
  and `/embed/(.*)` — **none matches `/landing/cost`**.

**So the day the gates open, `/landing/cost` is indexable while the landing page itself is not.** The
page carrying the most commercially sensitive content on the site would be the only one search engines
are invited to keep. **If this page is ever ungated, give it a `robots` export in the same change.**

---

## 6. What the page renders from — 🔴 **the manual's claim is misleading, and item 6's premise is false**

**`app/landing/cost/CostComparison.tsx:29-36`, the complete import list, READ:**

```ts
import { PLAN_MONTHLY_PENCE } from '@/lib/features'
import {
  PLAN_ONLINE_ALLOWANCE,
  PLATFORM_FEE_OVER_ALLOWANCE,
  allowanceAmountLabel,
  allowancePenceFor,
  CARD_FEES,
} from '@/lib/plan-features'
```

**It imports prices, allowances and card fees. It does NOT import `FEATURE_SECTIONS`, and it renders no
feature matrix at all.** A grep of the whole 75KB file for `FEATURE_SECTIONS`, `WhatsApp`, `Android`,
`auto-replies` and `coming soon` returns **only two comment lines** and no rendered content.

**The actual renderers of `FEATURE_SECTIONS` are three, and this is not one of them:**

| Renderer | Line |
|---|---|
| Landing compare table | `app/landing/page.tsx:476` |
| Admin | `app/admin/page.tsx:896` |
| Manage → Billing | `app/manage/[token]/page.tsx:11394` (and `:8447`) |

### So: what does the cost page now show for WhatsApp auto-replies and the Android app?

**Nothing. It has never shown either, and cannot.** It is a cost calculator: it converts an operator's
current spend into a HatchGrab estimate. It has no feature rows to mark "coming soon".

**Is that correct?** ✅ **Yes, and correct by construction rather than by luck.** Those rows are plan
*capabilities*; this page prices plan *usage*. The shared-source changes could not reach it and did not.

⚠️ **The manual's phrasing — "the third renderer of `lib/plan-features.ts`" — is true only in the weak
sense that it imports from that module.** Read as "it renders the feature matrix", it is wrong, and it
is the kind of claim that makes someone check the wrong page after a matrix change. **Worth correcting
in the manual**: it is the third *consumer of the pricing constants*, not a third renderer of the matrix.

---

## 7. Stale, unfinished or aspirational content

**Clean, and better disciplined than most of the surface. What I checked and found:**

| Check | Result |
|---|---|
| `TODO` / `FIXME` / `Lorem` / `TBC` / placeholder copy | **None.** The single `placeholder=` hit is a legitimate `"4+"` input attribute |
| Hardcoded prices | **None rendered.** Every `£` match is inside a comment. `:372` records: *"NO £29, £49, £1,500 OR £2,000 IS WRITTEN IN THIS FILE"* — all seven figures derive from the constants |
| Named competitors / comparative claims | **None.** No Deliveroo, Just Eat, Square, Zettle, SumUp, Toast or similar |
| Dead CTAs | **None.** Both targets exist: `/signup` (`app/signup/page.tsx`) and `/contact?topic=Cost%20Comparison` |
| "Pro does not include separate logins" | ✅ **Consistent** with the matrix — `Multi-user access` is `pro: false, max: true` (`lib/plan-features.ts:257`) |
| Free-months default (`'1'`) | ✅ **Consistent** with the landing's "First month 100% free". It is a user-editable input (0–12), not a claim |

**Three things to know, none of them defects:**

1. ⚠️ **`AOV = 15` is the one unsourced number on the page** (`CostComparison.tsx:88`). Its own comment
   admits it: *"THE ONE FIGURE ON THIS PAGE THAT IS OURS RATHER THAN SOURCED."* **It is disclosed** in
   the small print — *"Estimates based on the figures you enter, assuming an average order of £15"*
   (`:905`). Honest, but it is an assumption that materially moves the per-order fee, so it is worth
   revisiting against real order data before this goes public.
2. 🔴 **Every price on this page is REAL and UNMASKED.** `CostComparison.tsx` does not import
   `maskPrice` or `usePriceMask` — so unlike Billing, nothing here renders "TBC". **This is the entire
   reason the gate exists**, and it is why "just link to it" is not a safe shortcut before the flag flips.
3. **The calculator covers Pro and Max only** (`PLANS`, `:67-80`) — **Starter is absent**. Deliberate for
   a "what would you save" tool, but it means an operator whose answer is Starter gets no path here.

---

## What it would take to make it reachable

In the order the obstacles actually bind:

1. 🔴 **Open the landing admin gate** (`app/landing/layout.tsx:44`). Until then nothing else matters —
   and that gate's own comment ties it to two non-code conditions: Pizzeria Gusto's **written consent**
   to publish their words, and *"are the screenshots real"*.
2. **Set `NEXT_PUBLIC_PRICING_PUBLISHED=true`** in Vercel. **First confirm its current value** — §1 could
   not read it. On its own this changes nothing for a non-admin.
3. 🔴 **Link to it.** Nothing does. The natural home is the pricing section of the landing page
   (`app/landing/page.tsx`, `<section id="pricing">`), where a reader is already thinking about cost.
4. 🔴 **Add a `robots` export** in the same change, or decide deliberately that it should be indexed.
   Right now it would be the only page in this area that is.
5. **Revisit `AOV = 15`** against real order data before the numbers are public.

**Nothing was changed. Nothing was deployed.**
