# Moving both wizards to Manage → Settings

**WHICH OF THE THREE I PERFORMED: A TYPECHECK AND ONE EXECUTION.** No standalone parse — `npx tsc
--noEmit` subsumes it and **exits 0**. One harness renders the **real** components through
`react-dom/server` against the **real** `canAccess`, and evaluates the **real** mount conditions lifted
from the manage page's source: **24/24 pass**. Four further checks in §5 are labelled **PARSE** — they
compare file text.

🔴 **Nothing was deployed. No migration was run and none was needed** — the two fields added are type
declarations for columns `/api/manage` GET already returns. **Neither wizard's internals, API actions,
gating logic or copy were altered.** Pizzeria Gusto is untouched.

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.** The move
was possible without changing anything outside its scope, so there was nothing to stop for.

**Files changed — two:**

| File | Change |
|---|---|
| `app/dashboard/[token]/page.tsx` | 2 imports removed; 2 mounts + their 8 comment lines removed, replaced by a 9-line note |
| `app/manage/[token]/page.tsx` | 2 imports + 1 helper import added; 2 fields added to the local `Truck`; 2 mounts added above the danger zone |

---

## 1. THE MOVE

Both now sit inside `SettingsTab`, immediately above the danger zone, following the
**self-contained-child pattern** the placement report identified — the same shape as
`{userRole === 'owner' && <DeleteAccountSection … />}`:

```tsx
      {/* Custom domain — the operator's own address (schedule.theirtruck.co.uk) serving their schedule.
          The Max gate lives INSIDE the component, mirroring PrintingSettings on the dashboard. */}
      {!isDemoIdentifier(token) && truck && <CustomDomainSetup token={token} plan={truck.plan} … />}

      {/* Website embed — the schedule box the operator pastes into their existing site. Same plan gate,
          same server-side staff block on its two write actions. */}
      {!isDemoIdentifier(token) && truck && <EmbedWizard token={token} plan={truck.plan} … />}
```

**Every prop is passed through unchanged**, value for value, from the same truck row — no prop was
added, removed or rewritten.

---

## 2. THE GATE — what happened to each of the four terms

The old condition was `!isDemo && truck && (userRole==='owner'||userRole==='manager')`. **Two terms are
now structurally redundant and one is not.** All four are accounted for in a comment at the mount rather
than dropped silently:

| Term | Outcome | Why |
|---|---|---|
| `(userRole==='owner'\|\|userRole==='manager')` | **Dropped — redundant** | The Settings tab is already `roles: ['owner','manager']` (`app/manage/[token]/page.tsx:556`), filtered at `:567`. The condition cannot be false where the component now renders. |
| `truck &&` | **KEPT** | Harmless, and it keeps the mount readable without depending on the reader knowing the parent's loading gate. |
| `!isDemo` | 🔴 **KEPT, as `!isDemoIdentifier(token)`** | See below — this one is **not** redundant. |
| The plan gate | **UNTOUCHED** | It was never in the mount; it lives inside each component as `canAccess(plan, 'embed_schedule', featureOverrides ?? {}, trialExpiresAt)` and was not edited. |

### 🔴 WHY THE DEMO TERM WAS KEPT RATHER THAN ARGUED AWAY

Two arguments say a demo can never reach these wizards on the manage page, and **both are true**:

1. `proxy.ts` session-gates `/manage` (`isProtected` covers `pathname.startsWith('/manage')`) with **no
   demo exemption**, while `/dashboard/demo-*` is explicitly exempted. A demo identity has no session.
2. The five `domain_*` actions refuse a demo identity server-side.

🔴 **BUT THE SECOND ARGUMENT DOES NOT COVER THE EMBED WIZARD, AND THAT IS THE REASON.** Read at
`app/api/manage/route.ts:359-361`:

```ts
  const demoBlockedActions = [
    'domain_preflight', 'domain_status', 'domain_provision', 'domain_confirm', 'domain_send_instructions',
  ]
```

**`save_embed_setup`, `get_embed_status`, `detect_platform` and `send_embed_instructions` are NOT on
that list.** So for the embed wizard the client-side `!isDemo` was the *only* demo protection there was.
**Dropping it would have removed a real guard on the strength of an argument about a different file** —
and it would have left the protection resting entirely on a proxy rule that a future routing change
could alter without anyone connecting the two.

It is implemented with the canonical rule, not a re-derived one — `isDemoIdentifier` from `lib/demo.ts`,
the same function `resolveTruckAccess` and `demo-cleanup` use. **One definition, four call sites.**

⚠️ **Recorded as an observation, not fixed here:** the four embed actions being absent from
`demoBlockedActions` is a real asymmetry. It was outside this brief's scope and I did not touch it.

---

## 3. THE TWO TYPE FIELDS

`app/manage/[token]/page.tsx:66`, the page's **local** `Truck` interface, gained exactly two entries:

```ts
custom_domain_setup_state?: 'choosing' | 'registered' | 'awaiting_dns' | null;
embed_enabled?: boolean;
```

✅ **A type fix, not a data change**, as the brief says. `/api/manage` GET returns `truck: { ...truck,
logo }` (`app/api/manage/route.ts:257`) over a `select('*')`, so both columns were already on the wire
and already reaching this component — the interface simply did not declare them. **No query, endpoint or
fetch was touched.** The union on `custom_domain_setup_state` matches `CustomDomainSetup`'s prop type
exactly, which is what makes the pass-through typecheck without a cast.

---

## 4. THE TWO COMMENTS

On the dashboard both comments were **stacked ahead of both mounts, in the opposite order to the
components they described**: the embed comment sat immediately above the *custom domain* card. The fix
is structural rather than a reorder — **each comment now sits with its own component**, so the pairing
cannot come apart again. The rendered order of the two cards is unchanged (custom domain, then embed).

---

## 5. VERIFICATION

### EXECUTION — the plan gate still bites, on the real components

`react-dom/server` rendering the **real** `CustomDomainSetup` and `EmbedWizard`, with the **real**
`lib/features.ts`, `lib/demo.ts`, `lib/embed-instructions.ts` and `lib/custom-domain/copy.ts` loaded
rather than stubbed:

```
  plan        custom domain            embed wizard
  ----------------------------------------------------------------------
  starter     null (nothing)           null (nothing)
  pro         null (nothing)           null (nothing)
  max         RENDERS (519 chars)      RENDERS (535 chars)
  trial       RENDERS (519 chars)      RENDERS (535 chars)
  tester      RENDERS (519 chars)      RENDERS (535 chars)
  demo        RENDERS (519 chars)      RENDERS (535 chars)
```

```
  PASS  starter: custom domain is refused        PASS  starter: embed is refused
  PASS  pro: custom domain is refused            PASS  pro: embed is refused
  PASS  🔴 an EXPIRED trial reaches neither
  PASS  a per-truck override still grants a starter (unchanged behaviour)
```

🔴 **Note the `demo` PLAN row renders.** `canAccess('demo','embed_schedule')` is true, so the plan gate
alone would admit it — **which is exactly why the demo term had to be kept at the mount.** The two
layers do different jobs, and the harness shows each doing its own.

### EXECUTION — a demo identity reaches neither

The mount conditions were **lifted from the manage page's source and evaluated**, not retyped:

```
  CustomDomainSetup:  !isDemoIdentifier(token) && truck
      real operator token → true   |   demo token → false   |   truck null → false
  EmbedWizard:  !isDemoIdentifier(token) && truck
      real operator token → true   |   demo token → false   |   truck null → false
```

```
  PASS  🔴 CustomDomainSetup does NOT mount for a demo token
  PASS  🔴 EmbedWizard does NOT mount for a demo token
  PASS  both conditions use the canonical isDemoIdentifier
  PASS  neither mounts before the truck has loaded
```

### EXECUTION — an owner on Max, end to end under manage → settings

```
  mount condition true: true   custom domain: 519 chars   embed: 535 chars
  domain card opens with : <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">…
  embed card opens with  : <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">…

  PASS  🔴 owner + Max: BOTH mount AND render under manage → settings
  PASS  🔴 owner + trial (null expiry, what self-serve signup writes): both render
```

**24/24 pass.**

### PARSE — the dashboard Settings tab is otherwise unchanged

The `activeTab==='settings'` block was extracted from the pre-change backup and from the current file
and compared with a sequence matcher:

```
  changed regions in the Settings tab: 1
    replace: old[604:614] (10 lines) -> new[604:613] (9 lines)

  everything BEFORE the changed region identical: True
  everything AFTER  the changed region identical: True
  → the ONLY change to the Settings tab is one contiguous region: True
```

🔴 **One contiguous region, 620 lines → 619.** Every other line of the tab — the whole of the
auto-accept, offline-protection, order-ready, kitchen-capacity, display and per-event groups — is
**byte-identical**. `PrintingSettings` and `NotificationSettings` still mount at `:4484` and `:4485`.

⚠️ **`PrintingSettings` drops from 3 textual hits to 1, and that is not a lost mount.** The other two
were the phrase *"mirroring PrintingSettings"* inside the two comments that moved. Its import (`:89`)
and its mount (`:4484`) both survive.

### PARSE — nothing orphaned

```
  grep -c "EmbedWizard\|CustomDomainSetup" app/dashboard/[token]/page.tsx   →  0
  imported in exactly one file now:
    app/manage/[token]/page.tsx:20  import CustomDomainSetup …
    app/manage/[token]/page.tsx:21  import EmbedWizard …
```

No dead import, no orphaned condition, no unreferenced variable — and `tsc --noEmit` exits 0, which
would have caught an unused import under this project's settings had one survived.

⚠️ **The comment left behind is deliberate**, not residue: it records that the cards were **relocated,
not deleted**, names where they went, and says why re-adding them here would be wrong.

---

## 6. What remains unverified

1. 🔴 **NOTHING WAS RENDERED IN A BROWSER.** `renderToStaticMarkup` proves the components return markup
   rather than null under each plan; **it does not prove they look right inside the manage Settings
   tab.** No page was loaded, no card was seen, and **the visual fit against the surrounding
   `SUBCARD_HEADING` panels is unobserved** — that was flagged as unchecked in the placement report and
   still is.
2. **Only the first render was exercised.** `useEffect` does not run under server rendering, so the
   mount-time `domain_status` / `get_embed_status` fetches — and everything they populate — were **not
   executed**. The interactive flow is untested here; it was proven in earlier stages against the API,
   not against this parent.
3. **The manage page itself was not rendered.** `SettingsTab` is 2,142 lines and was not executed; what
   was evaluated is the two mount conditions in isolation.
4. 🔴 **The dashboard was not rendered either.** The claim that the rest of its Settings tab still works
   rests on a **line-level comparison plus a typecheck**, not on the tab being loaded.
5. **The proxy claim in §2** (a demo cannot reach `/manage`) is read from `proxy.ts`. **No request was
   made** — which is part of why the demo guard was kept rather than relied upon.
6. ⚠️ **The four embed actions remain absent from `demoBlockedActions`.** Observed, reported, **not
   changed** — out of scope for this brief.
7. **`next build` was not run.** `tsc --noEmit` is a typecheck, not a build.
8. **Six migrations remain unapplied**, and this move needed none.
