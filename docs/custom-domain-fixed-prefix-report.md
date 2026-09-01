# The fixed prefix — `events.<their domain>`, no choice

**WHICH OF THE THREE I PERFORMED: A TYPECHECK AND ONE EXECUTION.** No standalone parse — `npx tsc
--noEmit` subsumes it and **exits 0**. One harness renders the **real** component with the **real**
`checkSubdomain` and `domainFromWebsite`: **23/23**. The committed checker ran over 23 strings:
**22/23 pass, 1 known violation**. Six further checks in §7 are labelled **PARSE**.

🔴 **Nothing was deployed, no migration was written, and provisioning, the plan gate, the limiters, the
apex and www guards, the DNS checks and the record screen are all untouched.** Pizzeria Gusto is
untouched.

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

**One file modified: `components/dashboard/CustomDomainSetup.tsx`** (451 → 432 lines), plus a corpus
update to `scripts/check-plain-english.mjs`.

---

## 1. THE PREFIX IS FIXED

```ts
const PREFIX = 'events'
```

**Removed:** the editable prefix input, its `useState`, the `schedule` prefill, `prefixError` (all four
rules and all four messages — empty, `www`, leading/trailing hyphen, illegal characters), the
`prefixProblem` render, the `splitAddress` helper, and the `!!prefixProblem` term on the Continue
button.

🔴 **THERE IS NOTHING LEFT TO TYPE, SO THERE IS NOTHING LEFT TO GET WRONG.** Every rule that existed
policed a decision no operator needed to make.

### The guards stay, and their job changed rather than went

✅ **`checkSubdomain` still runs client-side before pre-flight** (`const v = checkSubdomain(address)`),
still runs server-side in `domain_preflight` and `domain_provision`, and the server's `www` refusal is
untouched.

🔴 **THEY NOW DEFEND A PATH THE INTERFACE CANNOT REACH, AND THAT IS CORRECT.** With the word fixed to
`events`, no screen can produce an apex or a `www` — but the guards are the last line before a side
effect that takes over a website, and **anything that can POST reaches the action with no screen in the
way.** Proved in §4.

---

## 2. THE STEP IS NOW A CONFIRMATION

**Has a website** (`trucks.website = https://www.yourtruck.com/menu`), rendered:

```
   Add your schedule to your website
   Show where you are trading next, on your own website.

   You get a new web address for your schedule. It is your own address with a word in front.

   Your website today
   www.yourtruck.com
   Your new schedule address
   events.yourtruck.com

   Your website does not change at all. It carries on exactly as it is, and you add a link to
   the new address from it. We keep the schedule page up to date for you.

   We will set up events.yourtruck.com for you. Your website keeps working exactly as it does now.
```

**Zero inputs on the step.** The two addresses stay side by side — that contrast is what makes the shape
unmistakable without the word "subdomain", and it is now the *whole* explanation rather than a preamble
to a form.

**Copy removed** because it offered a choice that no longer exists: *"What would you like it to be
called?"*, *"Most trucks use "schedule". You can use anything you like — "whatson", "wherearewe""*, and
every prefix error message. Asserted absent in both states.

---

## 3. THE EMPTY-WEBSITE PATH

**Empty website** (`trucks.website` null), rendered:

```
   … (the same two-address block, with the example domain) …

   What is your web address?
   The one people already use to find you. We do not have it on file.

   events.  [                    ]

   Your schedule will be at  events.…
```

**One input, and `events.` sits fixed beside it as text.** The operator types only their own address;
they never type the prefix on either path. ⚠️ **The apex guards do the work the fixed half does
elsewhere** — which is exactly why keeping them mattered.

---

## 4. 🔴 THE COLLISION CASE — REPORTED, NOT BUILT

**The question: an operator already using `events.theirdomain.com` for something else.**

### What pre-flight actually checks

`domain_preflight` (`app/api/manage/route.ts:973-1027`) makes three checks:

| Check | Target | Detects a collision? |
|---|---|---|
| `checkCaa(verdict.host)` | 🔴 **the PARENT domain** | **No** — it asks about certificate rules on `theirdomain.com` |
| `detectDnsProvider(verdict.host)` | 🔴 **the PARENT domain** | **No** — it reads nameservers to name the provider |
| `getDomainConfig(verdict.host)` | ✅ the **exact** new name | **Only partially** — see below |

The parent-only targeting is deliberate and documented at `:1004-1005`: *"BOTH LOOKUPS TARGET THE
PARENT, NEVER THE NEW SUBDOMAIN — asking about a name that does not exist yet poisons every later
answer"* by caching an NXDOMAIN for the zone's negative window.

### 🔴 SO AN EXISTING RECORD ON THAT EXACT NAME IS **NOT** RELIABLY DETECTED

The only check on the exact name is `already_elsewhere`:

```ts
      const cfg = await getDomainConfig(verdict.host)
      alreadyElsewhere = cfg.ok ? cfg.configuredBy !== null : null
```

`configuredBy` is **Vercel's** field, and it reports how the name is configured **for Vercel** —
non-null when it already points at Vercel in a way Vercel recognises. 🔴 **An `events.theirdomain.com`
already pointing at Squarespace, Wix, their own server or anywhere else is not "configured by" Vercel,
so `configuredBy` is null and `already_elsewhere` is false.** Vercel would report `misconfigured: true`
— and **`domain_preflight` reads that field into `DomainConfig` and then never returns it**
(`lib/custom-domain/vercel.ts:104`; it is absent from the response at `:1018-1026`).

**No DNS lookup is ever made against the new name**, on any path, before or during provisioning.

### What the operator would actually see

1. **Pre-flight: nothing.** No warning. The CAA and provider lines appear as normal; the collision
   notice does not, because `already_elsewhere` is false.
2. **Provisioning succeeds.** `addDomain` attaches the name to our hosting project; that call fails only
   if the name is on *another Vercel project* (409), which is not this case.
3. **The record screen tells them to add a CNAME** for `events` on their domain.
4. 🔴 **The failure lands on them or their web person, at their DNS provider, with no context from us.**
   Either the provider refuses the record as a duplicate, or they overwrite the existing one — **and
   overwriting is the bad outcome, because whatever `events.theirdomain.com` used to serve stops
   working, silently, and nothing on our side knows it existed.**
5. If they do nothing, the daily check reports "not resolving" with `custom_domain_last_seen_value`
   showing **where it actually points** — which is the one place the collision becomes visible, *after*
   the fact.

⚠️ **AND THE OLD ADVICE IS NOW IMPOSSIBLE, SO I REWROTE IT** (item 2 required it). The collision notice
read *"That address already points somewhere. If it is in use, pick a different word in front of your
domain."* With a fixed prefix there is no different word. It now reads:

> Something already answers on that address. Whoever looks after your web address will need to point it
> at us — send them the message on the next screen and they will know what to do.

⚠️ **That line still only appears when `already_elsewhere` is true**, i.e. the narrow Vercel case. **The
common collision remains undetected.** Not built, as instructed.

---

## 5. THE PLAIN-ENGLISH CHECKER

Ran the **committed** script, `scripts/check-plain-english.mjs`. Corpus updated: eight strings removed
(the field question, its help, and all four error messages), five added. **22/23 pass, 1 known
violation** — the pre-existing `QR: print or display` line, unchanged.

🔴 **IT CAUGHT ONE OF MINE.** My first draft of the collision notice read *"Whoever looks after your
**domain**"* — `domain` is on the banned list. Reworded to *"your web address"*.

⚠️ **AND IT EXPOSED A LIMIT OF THE CHECKER ITSELF, WORTH RECORDING.** The corpus is explicit, so strings
nobody added are never checked. **Seven lines in this component say "your domain" and none is in the
corpus** — the CAA warnings (`:334`, `:336`, `:342`), the provider line (`:356`), the record-screen
button (`:376`) and the escape-hatch line (`:410`). They are pre-existing and out of this brief's scope;
**they would fail if added.** The checker is only as good as what has been fed to it.

---

## 6. VERIFICATION

```
  npx tsc --noEmit                                    exit 0
  fixedprefix.cjs (real component, real apex module)  23/23 PASS
  scripts/check-plain-english.mjs                     22/23 pass, 1 known
```

### The address is always `events.<registrable domain>`

Using the normalisation cases from the earlier report, and checking each result against the real apex
guard:

```
  https://www.yourtruck.com/menu     → events.yourtruck.com      subdomain ✅
  https://www.yourtruck.com          → events.yourtruck.com      subdomain ✅
  http://yourtruck.com/a/b?c=1#d     → events.yourtruck.com      subdomain ✅
  www.yourtruck.co.uk                → events.yourtruck.co.uk    subdomain ✅
  https://shop.yourtruck.co.uk/x     → events.yourtruck.co.uk    subdomain ✅
  YOURTRUCK.COM:8080                 → events.yourtruck.com      subdomain ✅
```

🔴 **`shop.yourtruck.co.uk` yields `events.yourtruck.co.uk`, not `events.shop.yourtruck.co.uk`** — the
registrable domain, because `domainFromWebsite` reduces through the public suffix list. That is the
address an operator thinks of as theirs.

---

## 7. SCOPE PROOFS (PARSE)

**7.1 The apex and www guards are byte-identical.** `checkSubdomain`, `parentOf`, `suggestFromWebsite`
and `domainFromWebsite` all extracted and compared: **IDENTICAL**. `lib/custom-domain/apex.ts` was not
opened this workstream (mtime 14:06); the server's `www` refusal lives in `app/api/manage/route.ts`,
also not opened (mtime 14:57, from the earlier www workstream).

**7.2 `provision()`, `runPreflight()` and the plan gate are IDENTICAL**, extracted and compared.

**7.3 🔴 Zero changed regions at or after the record screen** (old line 391).

**7.4 The component: 17 regions, 371 unchanged lines carried through byte-identically.** Every region is
in the prefix machinery, the address step's JSX, the collision copy, or the Continue button's disabled
term.

**7.5 The limiters and DNS checks were not opened** — `lib/ratelimit.ts` (mtime 27 Aug 23:14),
`lib/custom-domain/dns.ts` (27 Aug 19:04).

**7.6 No orphaned imports.** `checkSubdomain` ×5, `domainFromWebsite` ×2, `recordRows` ×3,
`TIMING_LINE` ×2, `CONFIRM_COPY` ×6 — all still used.

---

## 8. WHAT REMAINS UNVERIFIED

1. 🔴 **NOTHING WAS RENDERED IN A BROWSER.** `renderToStaticMarkup` gives text and markup, not layout.
   **The empty-website row — `events.` beside an input — was not seen at any width.**
2. **The open state was forced by wrapping `useState`**, not by clicking; typing in the empty-website
   field was not simulated.
3. 🔴 **§4 IS A TRACE, NOT A TEST.** No collision was constructed: no domain with an existing `events`
   record was provisioned, and **what Vercel's `configuredBy` returns for a name pointing at a
   non-Vercel host is read from the field's meaning, not observed.** If it is non-null more often than I
   describe, the collision would be caught more often than §4 says.
4. **No request was made.** Pre-flight and provisioning were not exercised here; §7 shows only that
   their code is unchanged.
5. **`next build` was not run.** `tsc --noEmit` is a typecheck, not a build.
6. **Six migrations remain unapplied.**
