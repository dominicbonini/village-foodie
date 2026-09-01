# Correcting the stale field labels, and removing the second source

**WHICH OF THE THREE I PERFORMED: ALL THREE — a PARSE, a TYPECHECK, and an EXECUTION.**
- **Parse** — every label, reader and line quoted here is read from a file on disk.
- **Typecheck** — `npx tsc --noEmit`, clean. **And used as a proof**: a throwaway probe file confirmed
  the new type rejects authoring both fields and rejects authoring neither (§2), then was deleted.
- **Execution** — the real `dns.ts` and `copy.ts` were transpiled and run **at both the pre-edit and
  post-edit source**; `recordRows` was executed for all nine providers and the fallback,
  `instructionsEmail` for four, and the **record screen rendered for all ten cases** and compared byte
  for byte.

**NO DEPLOY. NO MIGRATION. NO SQL.** Pizzeria Gusto untouched.
🔴 **Nothing arrived garbled, but ONE PREMISE IN THE VERIFICATION LIST IS WRONG and it changes what can
be shown — §4.**

---

## 1. THE THREE CORRECTIONS

```
  GoDaddy  value:  "Points to"    → "Value"
  123 Reg  name:   "Hostname"     → "Name"
  123 Reg  value:  "Destination"  → "Value"
```

Cloudflare's `{ Type, Name, Target }` were already right and were not touched.

**Applied first, on their own, and then tested against the verified `fieldLabels`:**

| Provider | `recordLabels` after correction | Derived from `fieldLabels` | Agree? |
|---|---|---|---|
| Cloudflare | `{Type, Name, Target}` | `{Type, Name, Target}` | ✅ |
| GoDaddy | `{Type, Name, Value}` | `{Type, Name, Value}` | ✅ |
| 123 Reg | `{Type, Name, Value}` | `{Type, Name, Value}` | ✅ |
| **Wix** | `{Type, **Host name**, Value}` | `{Type, **Host Name**, Value}` | 🔴 **still differ** |

🔴 **A FOURTH STALENESS, FOUND BY DOING THIS.** Wix's `recordLabels.name` was `Host name`; their own
page — verified in the previous workstream — says **`Host Name`**. A capital letter, and it was the
last thing keeping the two records from agreeing.

---

## 2. THE READ, AND WHY THEY COULD BE REDUCED TO ONE

**Which surface reads which — grepped across `app/`, `components/`, `lib/` and `scripts/`:**

| Field | Read by | Which reaches |
|---|---|---|
| `recordLabels` | **one place**: `recordRows()` in `copy.ts` | the generic three-row table, on the record screen and in the email |
| `steps.fieldLabels` | **one place**: `providerFieldRows()` in `copy.ts` | the four-provider screen and the four-provider email |

🔴 **AND FOR THE FOUR WITH STEPS, `recordLabels` RENDERED NOWHERE AT ALL.** Both surfaces branch on
`provider.steps` and take `fieldLabels` when it exists. **Wix is the case that proves it**, because it
was the only one whose two records disagreed:

```
  "Host name" (recordLabels) on screen : ✅ NO      in the email : ✅ NO
  "Host Name" (fieldLabels)  on screen : ✅ YES     in the email : ✅ YES
```

**So the stale labels were invisible — which is exactly why they went stale.** The five providers
without steps do render theirs, and were correct.

### They can be reduced to one, and the reduction is enforced by the typechecker

`fieldLabels` → `recordLabels` is derivable; the reverse is not, because `fieldLabels.type` is
**nullable** (Wix has no type field) and `recordLabels.type` cannot express that. So the direction is
fixed. **The four with steps no longer author `recordLabels` at all:**

```ts
type DnsProviderBase = { id: string; label: string; dashboardUrl: string }
export type DnsProvider =
  | (DnsProviderBase & { recordLabels: RecordFieldLabels; steps?: never })
  | (DnsProviderBase & { recordLabels?: never; steps: ProviderSteps })
```

```ts
export function recordLabelsFor(provider: DnsProvider | null | undefined): RecordFieldLabels {
  if (!provider) return GENERIC_RECORD_LABELS
  if (provider.steps) {
    return {
      type: provider.steps.fieldLabels.type ?? GENERIC_RECORD_LABELS.type,
      name: provider.steps.fieldLabels.name,
      value: provider.steps.fieldLabels.value,
    }
  }
  return provider.recordLabels
}
```

✅ **THE TYPE MAKES THE DRIFT UNAUTHORABLE, AND I PROVED IT RATHER THAN ASSERTING IT.** A probe file
declaring one provider with both fields and one with neither produced two `TS2322` errors — quoted in
full below — and was then deleted:

```
  __probe.ts(2,7): error TS2322: Type '{ … recordLabels: {…}; steps: {…}; }' is not assignable to type 'DnsProvider'.
  __probe.ts(5,7): error TS2322: Type '{ id: string; label: string; dashboardUrl: string; }' is not assignable to type 'DnsProvider'.
```

⚠️ **`fieldLabels.type` being null ends inside this function, deliberately.** The generic table always
shows a type row and is the one surface a Wix operator never reaches, so falling back to the generic
word there keeps that table's shape exactly as it was. **The null still reaches the four-provider
screen, which is the only place it should change anything.**

⚠️ **A THIRD COPY WENT WITH IT.** `recordRows` wrote the generic default out inline —
`{ type: 'Type', name: 'Name', value: 'Value' }` — beside the `GENERIC_RECORD_LABELS` already exported
from `dns.ts` and **used by nothing**. Same values, so the output is unchanged; there is now one.

**`recordLabels` literals: 10 → 5.** One per provider that has no verified steps, and no more.

---

## 3. 🔴 THE GENERIC FALLBACK IS BYTE-IDENTICAL

```
  before: [{"label":"Type","value":"CNAME","hint":"Choose this from the list."},
           {"label":"Name","value":"events","hint":"Just this word, not the whole address."},
           {"label":"Value","value":"cname.vercel-dns.com","hint":"Copy this exactly."}]
  after : …identical…
  ✅ BYTE-IDENTICAL
```

**And every one of the five providers without steps is unchanged:**

```
  Squarespace Domains   ["Type","Host","Data"]              → ["Type","Host","Data"]              ✅
  IONOS                 ["Type","Host name","Points to"]    → ["Type","Host name","Points to"]    ✅
  Namecheap             ["Type","Host","Value"]             → ["Type","Host","Value"]             ✅
  Google Domains…       ["Type","Host name","Data"]         → ["Type","Host name","Data"]         ✅
  Vercel                ["Type","Name","Value"]             → ["Type","Name","Value"]             ✅
```

**The three that changed are exactly the three with corrected labels, all of which have steps:**

```
  GoDaddy      ["Type","Name","Points to"]        → ["Type","Name","Value"]       🔵
  123 Reg      ["Type","Hostname","Destination"]  → ["Type","Name","Value"]       🔵
  Wix          ["Type","Host name","Value"]       → ["Type","Host Name","Value"]  🔵
```

⚠️ **`recordRows` for those three is dead output** — §2 — so none of it reaches a screen or an email.

---

## 4. 🔴 A PREMISE IN THE VERIFICATION LIST IS WRONG

You asked me to *"render the email for a provider without verified steps, before and after, and show
the label change."* **There is no label change to show, and the reason is structural rather than a
failure to find one.**

**The two providers whose labels were stale — GoDaddy and 123 Reg — BOTH HAVE verified steps.** So
their emails already read `fieldLabels` and were already correct. And the providers *without* verified
steps had correct labels already, so nothing about their emails moves. **The two sets do not overlap.**

**Rendered anyway, both halves:**

```
  ── a provider WITHOUT verified steps (what you asked for) ──
  IONOS       ✅ email BYTE-IDENTICAL
    before:  Type: CNAME | Host name: events | Points to: cname.vercel-dns.com
    after :  Type: CNAME | Host name: events | Points to: cname.vercel-dns.com
  Namecheap   ✅ email BYTE-IDENTICAL

  ── the two whose labels were actually corrected ──
  GoDaddy     ✅ email BYTE-IDENTICAL (it already read fieldLabels)
  123 Reg     ✅ email BYTE-IDENTICAL (it already read fieldLabels)
```

🔴 **SO THE HONEST SUMMARY IS: THIS CHANGE ALTERS NO RENDERED OUTPUT ANYWHERE.** It corrects data that
was wrong, and removes the second place it could be wrong again. **That is the whole value of it, and
it is worth saying plainly rather than dressing a no-op as a fix.**

---

## 5. THE FOUR PROVIDER SCREENS ARE UNCHANGED — AND SO IS EVERY OTHER

The record screen rendered from both sources, for all ten cases:

```
  Wix (steps)          ✅ BYTE-IDENTICAL      Squarespace Domains  ✅ BYTE-IDENTICAL
  GoDaddy (steps)      ✅ BYTE-IDENTICAL      IONOS                ✅ BYTE-IDENTICAL
  Cloudflare (steps)   ✅ BYTE-IDENTICAL      Namecheap            ✅ BYTE-IDENTICAL
  123 Reg (steps)      ✅ BYTE-IDENTICAL      Google Domains…      ✅ BYTE-IDENTICAL
                                              Vercel               ✅ BYTE-IDENTICAL
                                              NOT DETECTED         ✅ BYTE-IDENTICAL
```

**They already read `fieldLabels`, which did not change.**

---

## 6. WHAT IS UNCHANGED

| | |
|---|---|
| `checkCaa`, `detectDnsProvider`, `checkApexViaSoa`, `resolveCname` | ✅ **BYTE-IDENTICAL**, sliced by brace-matching |
| `nsMatch`, `dashboardUrl`, `helpUrl`, `fieldLabels`, `caveat` — every provider | ✅ counts equal, values untouched |
| `components/dashboard/CustomDomainSetup.tsx` | ✅ **not opened** |
| `app/api/manage/route.ts` — provisioning, the plan gate, both limiters, the guards | ✅ **not opened** |
| `lib/custom-domain/apex.ts` — both apex guards | ✅ **not opened** |
| `lib/custom-domain/vercel.ts`, `lib/ratelimit.ts` | ✅ **not opened** |
| `scripts/check-plain-english.mjs` | ✅ **not opened** — `89/90 pass`, the one pre-existing `KNOWN` |

**Two files changed: `lib/custom-domain/dns.ts` (49 lines) and `lib/custom-domain/copy.ts` (5).**
`copy.ts`'s entire change:

```diff
+import { recordLabelsFor } from './dns'
-  const labels = args.provider?.recordLabels ?? { type: 'Type', name: 'Name', value: 'Value' }
+  const labels = recordLabelsFor(args.provider)
```

---

## 7. WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING WAS RENDERED IN A BROWSER, AND NOTHING NEEDED TO BE** — every rendered output is
   byte-identical, proven from both sources. **This change is invisible by construction.**
2. 🔴 **THE FIVE PROVIDERS WITHOUT VERIFIED STEPS STILL CARRY UNVERIFIED LABELS.** Squarespace Domains,
   IONOS, Namecheap, Google Domains and Vercel keep `recordLabels` written from published interfaces
   and **never checked against their current pages**. Two of the four that *were* checked turned out to
   be wrong, **so the base rate on the unchecked five is not reassuring.** They are the only remaining
   second-hand labels, and they are the ones that actually render.
3. ⚠️ **The union guards authoring, not intent.** Removing `steps` from a provider now also removes its
   labels, dropping it to the generic three rows rather than silently keeping a stale pair. **That is
   the safer failure, but it is a failure to be aware of** — restore `recordLabels` in the same change.
4. ⚠️ **`GENERIC_RECORD_LABELS` now has exactly one reader** (`recordLabelsFor`). It was exported and
   unused before; it is no longer dead, but it is also not load-bearing anywhere else.
