# The custom-domain wizard — first screen and address field

**WHICH OF THE THREE I PERFORMED: A TYPECHECK AND THREE EXECUTIONS.** No standalone parse — `npx tsc
--noEmit` subsumes it and **exits 0**. Three harnesses run the **real** modules and render the **real**
component: **25/25** on the normaliser and the field rules, **12/12** on the rendered screen, and
**15/15** from the now-committed plain-English checker. Five further checks in §6 are labelled **PARSE**.

🔴 **Nothing was deployed, no migration was written and no column was touched** — 113 migrations on
disk, unchanged. Pizzeria Gusto is untouched.

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

**Files: 2 modified, 1 created.**

| File | Change |
|---|---|
| `components/dashboard/CustomDomainSetup.tsx` | the first screen and the address field |
| `lib/custom-domain/apex.ts` | **one new export**; every existing function byte-identical |
| `scripts/check-plain-english.mjs` | **NEW** — the checker, committed |

---

## 1. THE FIRST SCREEN

### ⚠️ First, a correction to the brief's premise — the line was conditionally false, not simply false

The brief says the copy *"claims an address is suggested from their website, and nothing is."* **The
suggestion machinery worked.** `suggestFromWebsite` (`lib/custom-domain/apex.ts:99`) really does derive
`schedule.<their registrable domain>` from `trucks.website`, and it seeded the field.

🔴 **The defect was that the SENTENCE WAS UNCONDITIONAL WHILE THE SUGGESTION WAS NOT.** With no website
on the row it returns `null`, the field seeded to `''`, and the operator was still told *"We have
suggested one from your website"* above an empty box. **So the line was true for some trucks and false
for others, which is worse than uniformly wrong** — it reads as correct right up until the case where it
misleads. It is gone either way, along with *"Most people keep it"*.

### What an operator now reads — RENDERED, not transcribed

The real component, forced open on the address step, with
`trucks.website = "https://www.pizzacompany.com/menu"`:

```
   Add your schedule to your website
   Show where you are trading next, on your own website.

   You get a new web address for your schedule. It is your own address with a word in front.

   Your website today
   pizzacompany.com
   Your new schedule address
   schedule.pizzacompany.com

   Your website does not change at all. It carries on exactly as it is, and you add a link to
   the new address from it. We keep the schedule page up to date for you.

   What would you like it to be called?
   Most trucks use “schedule”. You can use anything you like — “whatson”, “wherearewe”.

   [ schedule ] .pizzacompany.com

   Your schedule will be at  schedule.pizzacompany.com
```

🔴 **THE TWO ADDRESSES SIDE BY SIDE ARE THE EXPLANATION.** *Your website today* against *your new
schedule address*, both in monospace, both real, and the second visibly the first with a word in front.
That closes both misreadings at once — **it is not a page on their site, and it is not
`pizzacompany.com/schedule`** — without ever describing the shape, and without the word "subdomain".

⚠️ **The path misreading was the one worth designing against**, because it is the plausible one and it
is a **different product we cannot deliver**: a path lives inside their website and only their website
can serve it. Nothing on screen now suggests it.

---

## 2. THE ADDRESS FIELD

### The shape

```
  [ schedule ]  .pizzacompany.com          ← one input, then TEXT
```

The domain half renders as a `<span>`, **not a disabled input**. A greyed-out box invites an operator to
try to change it and then wonder why they cannot; plain text reads as *"this part is simply yours"*.
Proved: **exactly one `<input>` on this step when the domain is known.**

### Where the fixed half comes from

New export `domainFromWebsite` in `lib/custom-domain/apex.ts`, reading `trucks.website` — captured
further up the manage page — and normalising it. **EXECUTION, on the real module with the real `psl`:**

```
  "https://www.pizzacompany.com/menu"    → "pizzacompany.com"
  "https://www.pizzacompany.com"         → "pizzacompany.com"
  "http://pizzacompany.com/a/b?c=1#d"    → "pizzacompany.com"
  "www.pizzacompany.co.uk"               → "pizzacompany.co.uk"
  "https://shop.pizzacompany.co.uk/x"    → "pizzacompany.co.uk"
  "PIZZACOMPANY.COM:8080"                → "pizzacompany.com"
  null / "" / "   "                      → null
```

Scheme, `www.`, port, path, query and fragment removed, then reduced to the **registrable** domain — so
a truck whose website is `shop.pizzacompany.co.uk` gets the domain they actually think of as theirs.

### 🔴 THE FIXED HALF IS A GUARD, NOT A CONVENIENCE

With the domain uneditable, whatever the operator types can only ever become a name **in front of** it,
so **an apex and a mistyped domain are both unreachable from this screen.**

**EXECUTION — every accepted prefix, assembled against a fixed domain, put through the real
`checkSubdomain`:**

```
  prefix "schedule"  → schedule.pizzacompany.com   checkSubdomain: subdomain ✅
  prefix "a"         → a.pizzacompany.com          checkSubdomain: subdomain ✅
  prefix "xxxx…x"    → xxxx….pizzacompany.com      checkSubdomain: subdomain ✅

  PASS  🔴 no accepted prefix produces an apex against a fixed domain
  PASS  the bare domain itself is refused as a prefix
```

⚠️ **THIS SITS IN FRONT OF THE EXISTING GUARDS, NOT INSTEAD OF THEM.** `checkSubdomain` still runs
client-side before pre-flight and again server-side before the hosting call, and the SOA guard is
untouched. §6 proves all three byte-identical.

### What the editable half accepts

Prefilled `schedule`. The screen says plainly they can use anything: *"Most trucks use “schedule”. You
can use anything you like — “whatson”, “wherearewe”."*

**EXECUTION — the real `prefixError`, lifted from source and transpiled:**

| Entry | Result |
|---|---|
| `schedule`, `whatson`, `wherearewe`, `van-2`, `a1`, `SCHEDULE` | accepted |
| `www` | **“www” is your main website. Pick another word, like schedule.** |
| `-schedule`, `schedule-` | **It cannot start or end with a hyphen.** |
| `my schedule`, `sched.ule` | **Use only letters, numbers and hyphens — no spaces or dots.** |
| `` , `   ` | **Type a word to go at the front.** |

An invalid entry shows the message in red beneath the field **and disables Continue** — the button's
`disabled` now also tests `prefixProblem`, so a refusal cannot be walked past.

🔴 **`www` IS REFUSED SEPARATELY BECAUSE IT IS THE ONE VALID-LOOKING ANSWER THAT BREAKS THEIR SITE.** It
passes every character rule, and for most operators it is the address their existing website already
answers on — pointing it at us would take their homepage down. **Same harm as an apex, arriving through
a different door.**

⚠️ `SCHEDULE` is accepted and lower-cased on assembly, rather than refused. Host names are
case-insensitive, so rejecting it would be pedantry aimed at a caps-lock key.

### The empty-website path

When `trucks.website` is empty there is nothing to fix in place, so the operator types both halves —
**two inputs**, the second labelled *"Your own web address"*, with:

> We do not have your website on file, so type your own web address in the second box — the one people
> already use to find you.

⚠️ **THE GUARD IS WEAKER ON THIS PATH AND THAT IS WORTH KNOWING.** With the domain typed, an apex
becomes reachable through the field again — which is exactly why **the existing apex guards were kept
rather than replaced.** They are what protects this path, client-side and server-side.

---

## 3. THE PLAIN-ENGLISH CHECKER — NOW COMMITTED

`scripts/check-plain-english.mjs`, runnable as `node scripts/check-plain-english.mjs`.

🔴 **The previous report recorded that the checker was a session harness that existed only while one
chat was open, and that the rule had been re-derived from prose three times, differently each time.** A
rule with nothing running against it is a preference. It is now in the repository, with §35's
requirements built in: a banned-word list, an explicit corpus of **what an operator reads**, and — the
part §35 insists on — **every exclusion printed**, so the exception stays auditable rather than becoming
a loophole.

```
PLAIN-ENGLISH CHECK — 15 strings, 27 banned words
  PASS  card heading            PASS  field question        PASS  error: empty
  PASS  card description        PASS  field help            PASS  error: www
  PASS  first screen, line 1    PASS  field assembled       PASS  error: hyphen
  PASS  first screen, label a   PASS  no-website help       PASS  error: characters
  PASS  first screen, label b   PASS  first screen, line 2  PASS  QR settings copy

  EXCLUSIONS APPLIED (printed so the exception stays auditable — §35):
    field help    "“schedule”" / "“whatson”" / "“wherearewe”"   a quoted label is the platform's word, per §35
    error: www    "“www”"                                       same
    QR settings   "QR code"                                     the operator's own name for the printed thing

  15/15 pass
```

⚠️ **The corpus is explicit, not scraped.** Scanning whole files drowns in identifiers and comments;
what is checked is what an operator reads, and each new string must be added when it is written. That is
a maintenance cost, stated rather than hidden.

---

## 4. REPORT ONLY — THE "POWERED BY HATCHGRAB" LINE

🔴 **IT IS A LINK, NOT PLAIN TEXT.** `components/embed/EmbedParts.tsx:61-74`:

```tsx
export function PoweredBy() {
  return (
    <p className="mt-4 text-center text-[11px] text-slate-400">
      <a
        href="https://hatchgrab.com"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium transition-colors hover:text-slate-600"
      >
        Powered by HatchGrab
      </a>
    </p>
  )
}
```

It points at `https://hatchgrab.com`, opens in a new tab, and carries `rel="noopener noreferrer"`.
**Nothing was changed.**

⚠️ Two observations, recorded not acted on: the href is the **apex** `hatchgrab.com`, while the rest of
the codebase uses `www.hatchgrab.com` (§43 records that the apex 307-redirects to `www`, so this costs a
redirect hop); and `target="_blank"` on an operator's own domain sends their customer to us in a new tab
rather than away from their page, which may or may not be what you want.

---

## 5. VERIFICATION SUMMARY

```
  npx tsc --noEmit                                        exit 0
  wizcopy.js     (real apex module, real prefix rules)    25/25 PASS
  firstscreen.js (real component, rendered open)          12/12 PASS
  scripts/check-plain-english.mjs                         15/15 PASS
```

Every requirement:

1. ✅ **First screen rendered and quoted back** — §1.
2. ✅ **The fixed part is not editable** — a `<span>`, one `<input>` on the step — **and no accepted
   prefix produces an apex** against a fixed domain.
3. ✅ **Read from `trucks.website` and normalised** — `https://www.pizzacompany.com/menu` →
   `pizzacompany.com`, with eight other cases.
4. ✅ **The empty-website path works** — two inputs, its own explanation, tested.
5. ✅ **Invalid prefixes refused**, including `www` and a leading hyphen, each with its message.
6. ✅ **Provisioning, the gate, the limiters and the record screen unchanged** — §6.

---

## 6. SCOPE PROOFS (PARSE)

**6.1 In `lib/custom-domain/apex.ts`, one new export and nothing else.** `checkSubdomain`, `parentOf`
and `suggestFromWebsite` extracted from both versions and compared: **all three IDENTICAL.**

**6.2 In the component, nine changed regions and none of them after the address step.**

```
  whole component: 346 -> 443 lines, 9 changed region(s)
    replace old[5:6]      the import
    insert  old[45:45]    prefixError + splitAddress helpers
    replace old[51:52]    the address state, now assembled from two halves
    replace old[217:242]  the first screen and the field  (6 regions)
    replace old[277:278]  the Continue button also tests prefixProblem

  unchanged lines carried through identically: True (324 lines)
  the record screen starts at old line 286; changed regions at or after it: 0
```

🔴 **Zero changed regions at or after the record screen.** `provision()`, `runPreflight()` and the plan
gate were extracted separately and are each **IDENTICAL**.

**6.3 Untouched files**, by mtime, all predating this session's work: `app/api/manage/route.ts`,
`lib/ratelimit.ts`, `lib/custom-domain/{dns,vercel,copy}.ts`,
`app/api/cron/custom-domain-check/route.ts`, `app/trucks/[slug]/order/layout.tsx`.

**6.4 `suggestFromWebsite` is now unused by the component** and its import was removed — no orphan.
⚠️ **The function itself is kept**, exported and unreferenced; deleting it is a tidy-up outside this
brief's scope.

**6.5 No migration written, no column touched.** 113 migrations, unchanged.

---

## 7. WHAT REMAINS UNVERIFIED

1. 🔴 **NOTHING WAS RENDERED IN A BROWSER.** The screen was produced by `renderToStaticMarkup`, which
   gives the **text and the markup** but no layout. **The split field's behaviour at a phone width —
   whether the input and the fixed domain sit side by side or the domain wraps — is UNOBSERVED.** The
   classes intend `min-w-0 flex-1` on the input and `shrink-0` on the domain; that is a stated intent,
   not a measurement.
2. **The open state was forced by wrapping `useState`**, not by clicking. What rendered is the real
   component's real JSX for that step; the transition into it was not exercised.
3. **Typing was not simulated.** The assembled-address line and the error message were proved by
   rendering seeded states, not by keystrokes.
4. **`prefixError` was lifted from source and transpiled** rather than imported — it is not exported.
   The body is the shipping one; the mechanism of reaching it is not.
5. **No request was made.** Pre-flight, provisioning and the record screen were not exercised in this
   workstream; §6 shows only that their code is unchanged.
6. **The checker's banned-word list is my reading of §35.** A word the rule would catch but the list
   omits will pass.
7. **`next build` was not run.** `tsc --noEmit` is a typecheck, not a build.
