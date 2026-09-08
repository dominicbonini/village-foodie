# Pricing suppression — read-only diagnosis

**Date:** 2026-09-08 · **Mode:** read-only. No file in the repository was created, edited, staged, committed or pushed. No `git add` in any form. No database write. The only executions were: reads of `trucks` (service-role, `select`), reads of the Vercel API (`GET`), unauthenticated `GET`s of the public production site, and two runs of the project's own modules under `tsx` from a scratchpad directory outside the repo.

**Tags:** 🔎 source-read (file:line quoted) · ▶ executed (output quoted) · ⚠ inference, labelled as such.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

## THE ANSWER FIRST

**The cause is `NEXT_PUBLIC_PRICING_PUBLISHED`. It exists on the production environment, it was inlined into the production build, and its value is not the exact string `true`.**

The reads settle it by elimination, and the elimination is complete because every other input is proven:

| Input to the masking decision | Proven value | Proof |
|---|---|---|
| `trucks.hide_pricing` for `pizzeria-gusto` | **`false`** (boolean, not null) | ▶ §2.1 |
| Provider present in the tree for the Billing tab | **yes** | 🔎 §2.4, §2b |
| Value the provider receives | `truck.hide_pricing ?? false` → **`false`** | 🔎 §2.3 |
| The expression | `PRICING_PUBLISHED && !hidePricing` | 🔎 `lib/pricing.ts:34` |
| ⇒ therefore rendered TBC entails | **`PRICING_PUBLISHED === false`** | ▶ §1.5 |

`false && !false` is `false`; there is nothing else in the expression. ▶ Executed against the real module: with `hidePricing = false`, `maskPriceFor('£29/mo', false)` returns `"TBC"` when the env var is unset and `"£29/mo"` when it is exactly `'true'` — the two runs differ in nothing but the variable.

**What I could not read, and why:** the literal value. It is stored on Vercel with **`type: "sensitive"`**, which is write-only — the API returns `value: ""` with `"decrypted": false`, and the dashboard will not display it either. **The empty string in the API response is a redaction, not the value.** Treating it as the value would be the exact error this report is required to avoid.

**What that leaves, and how the three candidate states were separated:** §1.

---

## 1. THE ENV FLAG

### 1.1 `.env.local` — the variable is not there at all

▶ `grep -c 'PRICING' .env.local` → **`0`**. The file exists (49 keys, listed by name only) and contains no key or value matching `PRICING`. So **locally `PRICING_PUBLISHED === false`**, and a local `npm run dev` masks every price for every truck.

*If this proved nothing:* a `grep` miss caused by odd quoting or a BOM would look identical to absence. Ruled out by enumerating **every** key in the file (`grep -o '^[A-Za-z_][A-Za-z0-9_]*'`, 49 results printed) — `NEXT_PUBLIC_PRICING_PUBLISHED` is not among them, and the sibling `NEXT_PUBLIC_*` keys were all found by the same expression.

### 1.2 Production Vercel — the variable **exists**, and is unreadable

▶ `GET https://api.vercel.com/v9/projects/prj_puKjCh…/env?decrypt=true`, project `village-foodie`, 52 variables:

```
key         : NEXT_PUBLIC_PRICING_PUBLISHED
target      : ["preview", "production"]     gitBranch: null
type        : "sensitive"                   decrypted: false
value       : ""            ← REDACTION, not the value
createdAt   : 1786007394441  = 2026-08-06T09:09:54Z
updatedAt   : 1786007394441  (identical)     updatedBy: null
lastEditedBy: dominicbonini
```

So: **created 6 August 2026 09:09:54Z and never edited since.** `updatedAt === createdAt` and `updatedBy` is null.

*If this proved nothing:* `value: ""` is exactly what a genuinely empty variable would also return, and I cannot tell those apart through this API. That is why the value is reported as **unread**, not as empty. `decrypted: false` is the field that marks it a redaction.

### 1.3 Build staleness — RULED OUT

`NEXT_PUBLIC_*` is inlined at **build** time, so a variable set after the last build would not be in the deployed bundle. That is not what happened here:

▶ latest **production** deployments —
```
2026-09-07T07:17:06Z  READY  08ac3689  "Analytics: stop sending visitor postcodes to PostHog"
2026-09-06T21:04:42Z  READY  864991bc
2026-09-03T14:03:28Z  READY  2ca66cd6
```
The variable was created **2026-08-06**; the current production build is **2026-09-07**, a month later. The build therefore saw whatever value is stored. **"Set correctly but never rebuilt" is not available as an explanation.**

### 1.4 "`sensitive` variables don't reach the browser" — RULED OUT BY CONTROL

The hypothesis that would explain everything without the value being wrong: that Vercel's `sensitive` type withholds the variable from the client bundle. **It does not.**

▶ Of the 52 variables, **36 are `sensitive`**, including `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` on production. I fetched the **public, unauthenticated** production page `https://www.hatchgrab.com/compare` (HTTP 200) and its 14 client chunks, and searched them for the Supabase project host:

```
c2.js:1   ← the sensitive-typed NEXT_PUBLIC_SUPABASE_URL value, inlined in the public bundle
c11.js    ← NEXT_PUBLIC_POSTHOG_KEY (type "encrypted"), also inlined — second control
```

**A `sensitive`-typed `NEXT_PUBLIC_` variable is inlined into the production client bundle.** So `NEXT_PUBLIC_PRICING_PUBLISHED` was inlined too, at the 7 September build, with its stored value.

*If this proved nothing:* finding the host string could mean it was hard-coded in source rather than injected. Ruled out — ▶ `grep -rIn` across the working tree (all extensions) shows the Supabase URL is only ever read as `process.env.NEXT_PUBLIC_SUPABASE_URL`, and the value in the chunk sits inside minified client code, not a source literal.

### 1.5 The three states, separated

| State | Status | Basis |
|---|---|---|
| **Variable absent from production** | ❌ ruled out | it exists, targets `production` (§1.2) |
| **Present but not read** | ❌ ruled out | 🔎 read at `lib/pricing.ts:7`; the read reaches the Billing tab through the chain in §2; ▶ the same module executed shows the read is the only determinant |
| **Present, read, and not the exact string `'true'`** | ✅ **the remaining state** | by elimination, given `hide_pricing = false` and the provider present |
| Present, correct, but the build predates it | ❌ ruled out | §1.3 |
| Present, correct, but `sensitive` blocks inlining | ❌ ruled out | §1.4 |

▶ Executed against the real `lib/pricing.ts`, one run per candidate literal:

```
NEXT_PUBLIC_PRICING_PUBLISHED = undefined  → PRICING_PUBLISHED = false
NEXT_PUBLIC_PRICING_PUBLISHED = "true"     → PRICING_PUBLISHED = true
NEXT_PUBLIC_PRICING_PUBLISHED = "TRUE"     → PRICING_PUBLISHED = false
NEXT_PUBLIC_PRICING_PUBLISHED = "true "    → PRICING_PUBLISHED = false
```

🔴 **`TRUE`, `"true"` with quotes stored as part of the value, and `true ` with a trailing space are all indistinguishable from the flag being off, at every surface.** 🔎 The comparison is `=== 'true'` at `lib/pricing.ts:7` — no trim, no case fold.

### 1.6 The one limit on this conclusion

The deduction consumes your observation ("prices render TBC on the manage page"). I could not observe the rendered page myself: ▶ `GET /manage/<a valid demo-truck token>` returns **307 → `/login`**, so `/manage` is session-gated at the edge and its client chunk is not reachable unauthenticated. If the surface you were looking at were something other than Manage → Billing, or a stale cached bundle, the deduction would not hold — §3 addresses that directly.

---

## 2. `hide_pricing` FROM ROW TO RENDERED PRICE

### 2.1 The row

▶ Service-role read of `trucks`:

```
pizzeria-gusto   hide_pricing = false  (typeof boolean)  plan=trial  active=true
```

▶ All 10 trucks: `true` = **1** (`tikka-tonic`), `false` = **9**, null/absent = **0**.

⚠️ **There is no truck with slug `test-truck`.** The nearest are `test-truck-2` ("Test Truck", demo), `test-truck-3`, `test-kitchen` and `tt3` — all `hide_pricing = false`. Whichever you meant, it is `false`.

*If this proved nothing:* a service-role read bypasses RLS, so it cannot be showing me a policy-filtered copy; and `typeof` is printed to distinguish `false` from `null`, which `?? false` would treat the same way downstream but which the admin toggle would not.

### 2.2 The query that selects it

🔎 `app/api/manage/route.ts:166-170`:
```ts
const { data } = await supabase
  .from('trucks')
  .select('*')
  .eq('dashboard_token', token)
  .single()
```
`select('*')` — the column is returned under its own name, `hide_pricing`. 🔎 The manual's §4 note that "`/api/manage` uses `select('*')` and was safe by luck" is **still accurate**.

### 2.3 The field, the provider, the expression

| Hop | Location | What happens |
|---|---|---|
| Emitted as | `hide_pricing` (from `select('*')`) | 🔎 `app/api/manage/route.ts:168` |
| Typed on the client | `app/manage/[token]/page.tsx:91` — `interface Truck { … hide_pricing … }` | 🔎 |
| Handed to the provider | `app/manage/[token]/page.tsx:659` — `<PricingPolicyProvider hidePricing={truck.hide_pricing ?? false}>` | 🔎 |
| Held in context | `components/PricingPolicy.tsx:27` — `createContext<boolean>(true)` | 🔎 |
| Consumed | `components/PricingPolicy.tsx:46` — `maskPriceFor(val, hidePricing)`; `:52` — `pricesVisibleFor(useContext(...))` | 🔎 |
| **Decided** | **`lib/pricing.ts:34` — `return PRICING_PUBLISHED && !hidePricing`** | 🔎 |
| Rendered | `lib/pricing.ts:38-41` — `NON_SECRET_PRICE.has(val) ? val : (visible ? val : 'TBC')` | 🔎 |

**The context default is `true` (hide), exactly as the manual states** — 🔎 `components/PricingPolicy.tsx:27`, `createContext<boolean>(true)`, with the comment at `:16-23` giving the asymmetry rationale. **The manual is correct here.**

**`hide_pricing` never sits on the permissive side of an OR** — 🔎 the only two expressions that consume it are `lib/pricing.ts:34` (`&&`) and `:39-40`. ▶ Executed: `pricesVisibleFor(true)` returns `false` under both env states, so a suppressed truck cannot be un-suppressed by the global flag. **The manual is correct here.**

*If this proved nothing:* a second, shadowing definition of `maskPriceFor` or a second `PricingPolicy` module would make the traced chain irrelevant. ▶ Ruled out — repo-wide `grep -rI` over every extension returns exactly one `lib/pricing.ts` and one `components/PricingPolicy.tsx`, and the counts in §5 show no duplicate declarations.

### 2.4 The provider's subtree

🔎 The provider opens at `:659` and closes at `:971`, wrapping the **entire** returned tree of the page component. The tab bodies render at `:824-:849` inside it. Every price consumer is inside one of those:

| Consumer | Line | Enclosing component | Rendered at | Inside provider? |
|---|---|---|---|---|
| `vanPx = usePriceMask()` | `:9178` | `SettingsTab` (`:8766`) | `:847` | ✅ |
| `<FeatureGate>` ×2 | `:10372`, `:10423` | `SettingsTab` | `:847` | ✅ |
| `px = usePriceMask()` | `:11523` | `BillingTab` (`:11517`) | `:849` | ✅ |
| `pricesVisible = usePricesVisible()` | `:11526` | `BillingTab` | `:849` | ✅ |

Context flows by tree position, not lexical position — these components are *defined* below `:971` but *rendered* inside it.

---

## 2b. SURFACES THAT RENDER A PRICE WITHOUT THE PROVIDER

**The manage page is NOT one of them.** 🔎 §2.4. Its provider is mounted and is passed the truck's value.

Every other price surface, and its status:

| Surface | File · line | Provider? | Masked? | Effect |
|---|---|---|---|---|
| **Manage → Billing** | `app/manage/[token]/page.tsx:11601, 11654, 11784, 11835, 11841, 11914, 11930, 11936, 11960, 11995, 11996` | ✅ mounted, value passed | ✅ `px()` | correct |
| **Manage → Settings, van add-on** | `:11356`, `:11377` | ✅ | ✅ `vanPx()` | correct |
| **`FeatureGate` upgrade CTA** | `components/FeatureGate.tsx:28` | ✅ (only rendered inside Manage → Settings) | ✅ | correct |
| **Admin console** | `app/admin/page.tsx:943` — `PLAN_PRICES[p]` raw | ❌ none | ❌ never calls any mask | **real prices, always**, for every truck including a suppressed one |
| **Landing page** | `app/landing/page.tsx:94` — `PLAN_PRICES[plan]` raw | ❌ none | ❌ | real prices |
| **`/compare`** | `app/compare/CostComparison.tsx` | ❌ none | ❌ by design | real prices — ▶ and the page is **publicly reachable, HTTP 200 unauthenticated**, with `£29`/`£49` present in its public chunk `c5.js` |
| **Features PDF** | `app/landing/features-pdf/route.ts:73` | ❌ (server route — context does not apply) | ⚠️ global `maskPrice` only | cannot honour `hide_pricing`; masks or not by the env flag alone |

🔴 **Nothing in this table masks a price where it should and fails to.** The three unmasked surfaces are unmasked deliberately or by a decision the manual already records as unrecorded (§4: *"Admin and the landing page render prices UNMASKED — neither has ever called `maskPrice`"* — **still true**). **None of them can produce the reported symptom**, which is the opposite: TBC where a price was expected.

⚠️ The only mask-carrying surface with no provider is the **PDF route**, which uses the global-only `maskPrice`. 🔎 `lib/pricing.ts:18-20` documents that it cannot honour `hide_pricing`. That is a real gap, but it is not the reported fault.

---

## 3. WHICH SURFACE — established before anything else

**The surface at fault is the one you reported: Manage → Billing, in `app/manage/[token]/page.tsx`, `BillingTab` (defined `:11517`, rendered `:849`).**

The prices an operator sees as TBC there, in render order:

| What they see | Line | Expression |
|---|---|---|
| The price under each plan column heading | `:11601` | `px(p === 'trial' ? 'Free' : PLAN_PRICES[p])` |
| Fee-table cells (allowances, 0.99%) | `:11654` | `px(row.cells[p])` |
| "Your plan" price | `:11784`, `:11914` | `px(PLAN_PRICES[currentPlan])` |
| Upgrade buttons | `:11835`, `:11841`, `:11930`, `:11936` | `px('£29/mo')`, `px('£49/mo')` |
| Renewal line | `:11960` | `px(plan === 'pro' ? '£29/mo' : '£49/mo')` |
| Upgrade modal body | `:11995`, `:11996` | `px('£49/month')`, `px('£29/month')` |
| Van add-on (Settings tab) | `:11356`, `:11377` | `vanPx(...)` |

**This is not a case where the fault could be in a neighbouring surface.** All 13 of those calls resolve through the same `usePriceMask()` → `maskPriceFor` → `PRICING_PUBLISHED && !hidePricing`. With `hidePricing` proven `false`, they are all functions of the env flag alone, and they will all flip together. Fixing a different file cannot change any of them, and the previously-recorded failure mode — a display fault reported on one surface fixed in another — is structurally unavailable here.

▶ What is **not** masked on that same tab, and is therefore the tell that distinguishes "flag off" from "something broken": `Free`, `Free trial`, `Lifetime`, `0%`, `Pay at Hatch`, `Unlimited` and `—` render as themselves under every combination. If the operator sees those rendering normally beside the TBCs, the masking path is working exactly as written.

---

## 4. THE FOOTNOTE DEFECT — CONFIRMED STILL OPEN (scope only, not changed)

🔎 **The magic string lives at `app/manage/[token]/page.tsx:11721`:**
```tsx
<sup>{f.number}</sup> {pricesVisible || f.number !== '2'
  ? f.text
  : 'Online payments are powered by Stripe Connect. Platform and card processing fees are TBC and will be confirmed at launch.'}
```
That is the only occurrence of the key. 🔎 The warning comment sits in the other file, `lib/plan-features.ts:529-531` (*"NUMBERING IS LOAD-BEARING — DO NOT RENUMBER OR REORDER THIS ARRAY"*) — **the guard and the thing it guards are in different files**, which is the coupling itself.

▶ **Executed against the real `FOOTNOTES` module** — 6 footnotes, numbers `1,2,3,4,5,6`, with the monetary figures each contains:

| # | Figures in the text | Masked when `hide_pricing` is set? |
|---|---|---|
| **1** | **`0%`, `1.4%`, `10p`** | 🔴 **NO** — renders in full |
| 2 | `0.99%`, `1.5%`, `20p` | ✅ yes, substituted |
| 3–6 | none | n/a |

🔴 **Confirmed true and open:** the mask covers footnote 2 only, and footnote 1's real card-processing figures — **1.4% on UK/EEA cards and 10p per tap-to-pay authorisation** — render unmasked on the Billing tab of a suppressed truck.

⚠️ **The manual names the wrong truck.** §44 (`docs/reference-manual.md:21843`) and §27 (`:13845`, `:3313`) all say *"Gusto sees footnote 1's real card figures unmasked"*. ▶ Gusto's `hide_pricing` is `false`. **The one truck this defect actually affects today is `tikka-tonic`** — the only row with `hide_pricing = true`. See §6.

*If this proved nothing:* reading `f.number !== '2'` from source would not prove footnote 1 carries figures — the text is built from template literals (`${CARD_FEE_IN_PERSON_LABEL}`, `${TAP_TO_PAY_SURCHARGE_LABEL}`), so its rendered content is not visible in the source line. That is why the module was **executed** and the resolved strings scanned for `£`/`%`/`p` patterns rather than read.

**Not changed. Not proposed.**

---

## 5. REMOVAL SCOPE — a plan, not a change

### 5.1 Occurrence counts, whole repository, every extension

Search: `grep -rI` over the entire working tree (tracked **and** untracked), excluding only `node_modules/`, `.next/` and `.git/`. **Extensions present in the searched tree:** `.md .ts .jpg .sql .tsx .png .xml .svg .json .js .gradle .gitignore .mjs .jpeg .webp .swift .yml .txt .java .cjs .storyboard .properties .plist .entitlements .css` — **no extension filter was applied at any point in this report.**

| Spelling | Occurrences (whole repo) | Occurrences (excluding `docs/`) | Files (excl. docs) | Files in `docs/` | Extensions carrying it (excl. docs) |
|---|---|---|---|---|---|
| `hide_pricing` | **55** | 20 | 7 | 8 | `.ts` ×3, `.tsx` ×3, `.sql` ×1 |
| `hidePricing` | **17** | 16 | 3 | 1 | `.ts` ×1, `.tsx` ×2 |
| `maskPrice` | **28** | 14 | 6 | 9 | `.ts` ×2, `.tsx` ×4 |
| `PRICING_PUBLISHED` | **78** | 18 | 8 | 18 | `.ts` ×2, `.tsx` ×5, `.sql` ×1 |
| `f.number` | **23** | 10 | 5 | 4 | `.ts` ×2, `.tsx` ×3 |

⚠️ `maskPrice` as counted includes `maskPriceFor` as a substring. ▶ Excluding it, the true `maskPrice` sites are **9**, of which **4 are comments** and **2 are its own declaration/doc-comment** — leaving **three real references**: the import and call in `app/landing/features-pdf/route.ts:40,73`, and the definition at `lib/pricing.ts:21`.

⚠️ No occurrence of any spelling exists in `.swift`, `.java`, `.gradle`, `.xml`, `.plist` or any other native-shell file — **removing this feature does not touch the iOS or Android projects.**

### 5.2 What would have to go, and what else reads each piece

| # | Thing | Where | What else reads it | Note |
|---|---|---|---|---|
| 1 | **Admin control** | `app/admin/page.tsx:1362-1370` (checkbox + comment) and the `hide_pricing: boolean` field on the truck type at `:38` | writes through `app/api/admin/route.ts:85` (`patch.excluded`-style patch path) and is read back through the **hand-maintained explicit select** at `app/api/admin/route.ts:54` | 🔴 the column must be removed from that named select **in the same change**, or the statement fails with 42703 and blanks the whole admin trucks table (`supabase/migrations/20260805_trucks_hide_pricing.sql:12` records exactly this) |
| 2 | **The column** `trucks.hide_pricing` | `supabase/migrations/20260805_trucks_hide_pricing.sql:29,31` | `app/api/admin/route.ts:54` (named select), `app/api/manage/route.ts:168` (`select('*')`, degrades safely), `app/manage/[token]/page.tsx:91,659` | dropping it is the **last** step, after every reader is gone; `select('*')` needs no edit |
| 3 | **The context** | `components/PricingPolicy.tsx` (whole file, 53 lines) | `app/manage/[token]/page.tsx:15,659,971,9178,11523,11526`; `components/FeatureGate.tsx:3,28` | removing it means each of the 13 price call sites either renders raw or calls the global `maskPrice` — **decide which before deleting**, because the two differ for a suppressed truck |
| 4 | **`maskPrice` / `maskPriceFor` / `pricesVisibleFor`** | `lib/pricing.ts:21,33,38` | `maskPrice`: `app/landing/features-pdf/route.ts:40,73`. `maskPriceFor`/`pricesVisibleFor`: `components/PricingPolicy.tsx:25` only | the PDF route is the only consumer outside the context — it would lose its `follow-flag` mode |
| 5 | **The env flag** | `lib/pricing.ts:7`; Vercel (production + preview) | `lib/pricing.ts:22,34`; `app/landing/features-pdf/route.ts:40,169` (`priceNote`). Referenced in **comments only** at `app/compare/page.tsx:9,94,99`, `app/landing/page.tsx:456`, `app/landing/layout.tsx:49`, `app/admin/page.tsx:1363` | ⚠️ **five of the eight non-docs files that mention it are comments describing behaviour that would no longer exist** — they go stale silently |
| 6 | **Footnote keying** | `app/manage/[token]/page.tsx:11721` (`f.number !== '2'`) + the substitute sentence | the `FOOTNOTES` array it keys into: `lib/plan-features.ts:451,476,481,514,518,548`, rendered also by `app/landing/page.tsx:534`, `app/admin/page.tsx:1018-1019`, `app/landing/features-pdf/route.ts:167` | removing the key removes the only reason `lib/plan-features.ts:529-531`'s "DO NOT RENUMBER" constraint exists — 🔴 **and that constraint is currently the only thing protecting three other render sites from a silent unmask** |

### 5.3 The order that does not break anything

⚠️ Stated as a constraint, not a recommendation to act: **1 → 6 → 3 → 4 → 5 → 2.** The admin select (1) and the column drop (2) must be at opposite ends; everything between them is code-only. Removing the column first fails the admin table; removing the context before the call sites leaves 13 unresolved identifiers.

---

## 6. WHERE THE MANUAL IS WRONG

| Manual line | Claim | Actual |
|---|---|---|
| `:21837` (§44) | *"`NEXT_PUBLIC_PRICING_PUBLISHED` is **TRUE in production**"* | 🔴 **Contradicted.** The variable exists on production but its inlined value is not the string `'true'` — §1.5. Whoever wrote this could not have read the value either: it has been `sensitive`, and therefore unreadable, since it was created on 6 Aug 2026. |
| `:21837`, `:21843` (§44); `:9648`, `:3313`, `:13845` (§27) | *"**Gusto has `hide_pricing = true`** and reads TBC, verified live"* | 🔴 **False today.** ▶ `pizzeria-gusto.hide_pricing = false`. The only truck with `true` is **`tikka-tonic`**. Gusto does read TBC — but for the global-flag reason, not the per-truck one. **The manual's explanation of the symptom you are seeing is the wrong one.** |
| `:21843` (§44), `:3313`, `:13845` (§27) | *"Gusto sees footnote 1's real card figures unmasked on their Billing tab"* | The **defect** is real and open (§4), but it applies to `tikka-tonic`. Gusto, being unsuppressed, has footnote 2 unmasked as well — it sees everything. |
| `:5757`, `:5769` (§4) | ANDed never overridden; column defaults false, context defaults true | ✅ **All correct** — 🔎 `lib/pricing.ts:34`, `components/PricingPolicy.tsx:27`, verified in source and ▶ by execution. |
| `:5761` (§4) | *"Seventeen call sites"* | ⚠️ **13** masked call sites in the manage page (11 in `BillingTab`, 2 in `SettingsTab`) plus 1 in `FeatureGate` = **14**. Minor, and the count is used nowhere. |
| `:5791` (§4) | *"Admin and the landing page render prices UNMASKED"* | ✅ **Still true** — 🔎 `app/admin/page.tsx:943`, `app/landing/page.tsx:94`. ⚠️ **And now also `/compare`**, which is publicly reachable and carries the real figures in a public chunk. |
| `:5747` (§4, deploy-order note) | `/api/manage` uses `select('*')` | ✅ **Still true** — 🔎 `app/api/manage/route.ts:168`. |

---

## 7. THE SINGLE FURTHER READ

The reads settle the **cause**. They do not settle **which wrong literal** is stored, and no read available to me can, because the variable is write-only by configuration.

**The one read that settles it:** open Manage → Billing in the browser you are already logged into, take the `<script src="/_next/static/chunks/….js">` list from the Network tab, and fetch the chunk containing `maskPriceFor`. The signature is unambiguous and needs no interpretation:

- **flag off** → `PRICING_PUBLISHED` folds to `false`, so `pricesVisibleFor` minifies to a constant and **the `hidePricing` argument disappears from the emitted code entirely**;
- **flag on** → the emitted `maskPriceFor` still branches on its second argument.

⚠️ There is no read that recovers the stored string itself. A `sensitive` Vercel variable cannot be displayed by the dashboard, returned by the API, or pulled by `vercel env pull` — **the only way to know its value is to overwrite it**, and that is a change, which this pass does not propose.

---

## 8. WHAT WAS NOT DONE

No file created, edited, staged, committed or pushed; `git add` not run in any form. No migration written or applied. No database write — every Supabase call was a `select`. No Vercel write — every API call was a `GET`. No production page altered; the three production fetches were unauthenticated `GET`s of `/compare`, `/login` and a `/manage` URL that returned 307. `git status --short` is unchanged from the start of this pass apart from this report file itself.
