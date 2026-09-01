# Custom domain — Stage 5, provisioning and the record screen

**WHICH OF THE THREE I DID: A TYPECHECK AND FIFTEEN EXECUTIONS. No standalone parse — `tsc --noEmit`
subsumes it.** `npx tsc --noEmit` exits 0. Fifteen harnesses run the **real** transpiled modules in a
`vm`: three new ones for this stage and twelve from the embed and serving workstreams re-run.

🔴 **Nothing was deployed. No migration was run. NO DOMAIN WAS ADDED TO VERCEL** — §4 below shows the
interception that proves it. Five migration files now exist and are unapplied; **no SQL of any kind
was executed.** Pizzeria Gusto is untouched.

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

---

## 0. Scope

| File | Change |
|---|---|
| `lib/custom-domain/apex.ts` | **NEW** — the apex guard, built first |
| `lib/custom-domain/dns.ts` | **NEW** — DoH pre-flight, provider records |
| `lib/custom-domain/vercel.ts` | **NEW** — the hosting API client |
| `lib/custom-domain/copy.ts` | **NEW** — the record rows, the timing line, the email |
| `components/dashboard/CustomDomainSetup.tsx` | **NEW** — the screen |
| `supabase/migrations/20260827_trucks_custom_domain_setup.sql` | **NEW — written, NOT run** |
| `app/api/manage/route.ts` | four actions added, two of them staff-blocked |
| `components/dashboard/types.ts` | three optional fields |
| `app/dashboard/[token]/page.tsx` | one import, one mount — **insertion only** |
| `package.json` / `package-lock.json` | **`psl` + `@types/psl`** — see the flag below |

🔴 **I ADDED A DEPENDENCY, AND YOU SHOULD KNOW BEFORE YOU READ FURTHER.** The brief says *"Use the
public suffix list"*, and this repo had no implementation of it — not directly, not transitively. The
alternatives were a hand-written list (a snapshot with **no** update path, i.e. exactly the stale-claim
shape §4 of this brief warns about) or a package that vendors the list and updates through npm. I
installed `psl@1.15.0` and `@types/psl`. **It lands in the already-large uncommitted batch**, which is
the cost. Two lines in `package.json`, no native build step.

**Insertion-only on the dashboard, asserted:** all three anchors the edit was placed against survive
byte-for-byte.

---

## 1. 🔴 THE APEX GUARD — built first, and it bites

`lib/custom-domain/apex.ts`, using `psl.parse()`. **`subdomain === null` is the apex, and that is the
whole test** — because how many labels a registrable domain has is a property of the registry, not of
the string.

**Twelve cases across several suffix shapes. The pass condition on every apex line is refusal, and the
harness prints what a naive label count would have done:**

```
  PASS  .com             theirtruck.com          → REFUSED as apex   naive labels=2 would refuse
  PASS  .co.uk           theirtruck.co.uk        → REFUSED as apex   naive labels=3 would PASS 🔴
  PASS  .org.uk          thecharity.org.uk       → REFUSED as apex   naive labels=3 would PASS 🔴
  PASS  .me.uk           someone.me.uk           → REFUSED as apex   naive labels=3 would PASS 🔴
  PASS  .ac.uk           auniversity.ac.uk       → REFUSED as apex   naive labels=3 would PASS 🔴
  PASS  .gov.uk          acouncil.gov.uk         → REFUSED as apex   naive labels=3 would PASS 🔴
  PASS  .net             theirtruck.net          → REFUSED as apex   naive labels=2 would refuse
  PASS  .io              theirtruck.io           → REFUSED as apex   naive labels=2 would refuse
  PASS  .com.au          theirtruck.com.au       → REFUSED as apex   naive labels=3 would PASS 🔴
  PASS  with a scheme    https://theirtruck.co.uk → REFUSED as apex  naive labels=3 would PASS 🔴
  PASS  with a path      theirtruck.co.uk/menu   → REFUSED as apex   naive labels=3 would PASS 🔴
  PASS  with www?        www.theirtruck.co.uk    → ACCEPTED (www is a subdomain)
```

🔴 **Seven of the twelve would have passed a label count.** That is the finding, not a formality.

**The message an operator sees, verbatim:**

> theirtruck.co.uk is your whole website address. If you point that at us, your website is replaced by
> this page. Put a word in front of it instead — for example schedule.theirtruck.co.uk.

⚠️ **It explains the CONSEQUENCE, deliberately.** An operator who is refused without being told why
tries again with the same thing.

**Both halves now exist.** Stage 4's resolution-side guard (a host resolving to no verified truck gets
`notFound()`) is still proven by its own harness; this is the entry-side half Stage 4 recorded as
missing. **It runs client-side for the message and again server-side before the hosting call** —
proven: an apex sent to `domain_preflight` is refused *and no hosting call is made*.

---

## 2. THE ADDRESS AND THE MIGRATION

`suggestFromWebsite(trucks.website)` prefills `schedule.<their registrable domain>`, editable.

```
  PASS  suggestFromWebsite("https://www.theirtruck.co.uk/menu") = schedule.theirtruck.co.uk
  PASS  suggestFromWebsite("theirtruck.com")                    = schedule.theirtruck.com
  PASS  suggestFromWebsite(null)                                = null
```

**The migration — written, not run.** Two columns, exactly what resume needs:

```sql
ALTER TABLE trucks
  ADD COLUMN IF NOT EXISTS custom_domain_setup_state      text
    CHECK (custom_domain_setup_state IN ('choosing', 'registered', 'awaiting_dns')),
  ADD COLUMN IF NOT EXISTS custom_domain_setup_started_at timestamptz;
```

🔴 **`'registered'` exists because the hosting call has a side effect OUTSIDE this database.** A truck
that abandons setup after registering leaves a domain attached to the project with no DNS pointing at
it — **without a column saying so, that orphan is invisible until someone reads the Vercel dashboard by
hand.** ⚠️ **No `'done'` state**: `custom_domain_verified_at` says a domain is serving, and inventing a
second answer to that question is how two columns start disagreeing. **No Stage 6 columns.**

---

## 3. PRE-FLIGHT

DNS-over-HTTPS — a plain HTTPS GET returning JSON, **which is the only shape available in a runtime
with no UDP socket**. Two resolvers, tried in order, sharing one response schema
(`{ Status, Answer?: [{ name, type, TTL, data }] }`): Cloudflare with `accept: application/dns-json`,
then Google's `/resolve`.

**Timeout: 4 seconds.** Both lookups run concurrently, so the screen waits four seconds at worst.

### 🔴 Every lookup targets the PARENT, never the new subdomain

```
    https://cloudflare-dns.com/dns-query?name=realthai.co.uk&type=CAA
    https://cloudflare-dns.com/dns-query?name=realthai.co.uk&type=NS
  PASS  every DNS lookup names the PARENT
  PASS  🔴 NO lookup names the new subdomain
  PASS  both a CAA and an NS lookup were made
```

The subdomain does not exist yet, so asking about it returns NXDOMAIN — **and resolvers cache that
negative answer for the zone's negative-TTL window, so checking early would poison every later check
and make setup look slow for a reason we created.** CAA is inherited down the tree and nameservers are
a property of the zone, so the parent is also the *correct* place to ask; this is not a workaround.

### (a) CAA — the one that fails silently

```
  PASS  🔴 a CAA record naming someone else → "restricted"   {"state":"restricted","issuers":["digicert.com"]}
  PASS  a CAA record naming our authority   → clear
```

Left unchecked, the certificate simply never appears: nothing errors, the padlock never arrives, and
nothing anywhere says why. The screen names it in plain language and points at the escape hatch.

### (b) The provider, from the nameservers

```
  PASS  the DNS provider is named from the NAMESERVERS   GoDaddy
  PASS  …and its own field labels come with it           value label = "Points to"
```

🔴 **This is authoritative registry data, not page content, which makes it a far stronger signal than
the website-builder detection.** A nameserver is what the registry says answers for the zone; it cannot
be an agency's portfolio page or a plugin's asset host. Where builder detection needed two body hits
before it trusted anything, this needs one match. ⚠️ It **names** a provider, it does not prove one — a
registrar can white-label another's nameservers, and `null` is an ordinary outcome.

### (c) Already registered elsewhere

Reported from a read-only `GET /v6/domains/{domain}/config` → `configuredBy`. ⚠️ **THIS IS A SIGNAL,
NOT A PROOF, AND IT IS LABELLED AS ONE IN THE CODE.** The definitive answer is the `409` from the add
call, which has a side effect and so is not run during pre-flight. The 409 path is handled and tested
separately.

### Fail open

```
  PASS  DNS outage → still ok:true, operator continues
  PASS  …with unknown rather than a guess
```

**These checks exist to make setup smoother, not to gate it** — refusing to let an operator proceed
because Cloudflare was slow would be a worse failure than the one being prevented.

---

## 4. PROVISIONING

### Where the token lives

🔴 **`VERCEL_API_TOKEN`, a SERVER-ONLY environment variable**, read in `lib/custom-domain/vercel.ts`
and nowhere else, alongside `VERCEL_PROJECT_ID` and `VERCEL_TEAM_ID`. **It is not `NEXT_PUBLIC_*` and
must never become one.** A token that can attach domains to this project can also point domains at it
and read its configuration; the blast radius is the deployment serving both brands, and it is exercised
by an operator-triggered action. ⚠️ **It also cannot live in `proxy.ts`** — edge middleware runs on
every request and has no business holding a project-administration credential.

### 🔴 Proof that no live API call was made

**Every outbound `fetch` in the harness is intercepted and recorded**, and the stub throws on any URL
it does not recognise, so a call to anything real would fail loudly rather than pass quietly. The run
prints every URL:

```
    POST  https://api.vercel.com/v10/projects/prj_TEST/domains?teamId=team_TEST
    GET   https://api.vercel.com/v6/domains/schedule.realthai.co.uk/config?projectIdOrName=prj_TEST&teamId=team_TEST
    GET   https://cloudflare-dns.com/dns-query?name=realthai.co.uk&type=CAA
    GET   https://cloudflare-dns.com/dns-query?name=realthai.co.uk&type=NS
  PASS  every call went to the stub — none left this process
  PASS  the hosting calls used the TEST project id, not a real one
```

`VERCEL_PROJECT_ID` is `prj_TEST` and the token is `tok_TEST`. **Nothing reached the real project.**

### 🔴 The record value comes from the response

```
  The stubbed API returns this record value, generated per run: harness-1qqesu5u.vercel-dns-999.com
  PASS  the value is the one the API returned
  PASS  …and rank 1 was chosen over rank 2
```

**The target is generated randomly per run, so it cannot match any literal in the tree** — which is how
"read from the response" is proven rather than asserted. And a tree-wide scan for anything shaped like
a hosting DNS target:

```
  493 source files scanned for anything shaped like a hosting DNS target.
    lib/custom-domain/vercel.ts: d1d4fc829fe7bc7c.vercel-dns-017.com
  PASS  no hosting DNS target appears in CODE anywhere
  PASS  the only occurrence is the documentation example, inside a comment
  PASS  🔴 and there is NO fallback constant — the code has one source for it, the API
```

The single occurrence is Vercel's own documented example, quoted **inside a comment** to explain why it
must not be used: *"Each project has a unique CNAME record"* — the word doing the work is **unique**.
⚠️ **There is deliberately no fallback constant**, because a fallback is a hardcoded target that only
appears when something has already gone wrong, which is the worst moment for it to be stale.

### The failure modes, and what each leaves behind

| Case | Result | Left behind |
|---|---|---|
| **Domain already taken (409)** | `ok:false, reason:'taken'` | **Nothing written.** A retry is a retry, not a resume into a state that never happened. |
| **The call fails or times out** | `ok:false`, no throw | **Nothing written.** |
| **Operator abandons after registering** | — | 🔴 **A domain attached to the project with no DNS pointing at it.** `custom_domain_setup_state = 'registered'` is the only trace, which is why the column exists. **Nothing cleans it up — that is Stage 6's problem and it is named here so it is not forgotten.** |

```
  PASS  already taken → ok:false, reason "taken"      PASS  …and NOTHING was written
  PASS  hosting call fails → ok:false, no throw       PASS  …and NOTHING was written
```

---

## 5. THE RECORD SCREEN

Their provider is already known, so it is named and linked. Then **three fields, labelled as that
provider labels them**, each with a copy button, then "and save".

```
    Cloudflare   Type · Name · Target
    GoDaddy      Type · Name · Points to
    Namecheap    Type · Host · Value
  PASS  unknown provider → neutral labels that are true everywhere
  PASS  exactly three rows
```

⚠️ **THE LABELS MATTER MORE THAN THEY LOOK.** An operator hunting a GoDaddy screen for "Value" will not
find it, will decide they are in the wrong place, and will stop.

### Plain English — the checker extended

```
  "code" "snippet" "embed" "iframe" "widget" "element" "html"
  "dns" "cname" "subdomain" "apex" "record type"      — all absent from our own words ✓

  EXCLUDED, AND PRINTED SO THE EXCEPTION STAYS AUDITABLE:
    values the operator types : ["CNAME","schedule","x.vercel-dns-017.com"]
    provider field labels     : ["Type","Name","Target","Points to","Host","Data","Host name",
                                 "Hostname","Destination","Value"]
```

🔴 **The record screen needed one distinction the embed wizard did not: the three VALUES are things the
operator types, not prose.** "CNAME" goes in the box; it is not a word we explain with. The checker
excludes the values, the quoted provider labels and URLs, then searches the sentences — and **five more
words were added to the banned list** for this screen (`dns`, `cname`, `subdomain`, `apex`,
`record type`), all of which our prose passes.

### Timing

> "It usually starts working within an hour, though it can take longer. You do not need to keep this
> page open."

```
  PASS  says "within an hour"
  PASS  🔴 does NOT say instant
  PASS  🔴 does NOT quote 24-48 hours (that is a nameserver figure)
  PASS  admits it can take longer
```

The 24–48 figure is for a **nameserver** change, where a whole zone moves. Quoting it for a single
added record would have an operator give up on something that had already worked.

### The escape hatch — on this screen, not after failure

```
  PASS  sent via the existing Brevo helper
  PASS  carries the provider name
  PASS  carries all three values
  PASS  carries the REASON, not just values
  PASS  sender is the TRUCK
```

🔴 **Many operators do not hold their own domain login** — it sits with whoever built the site,
sometimes years ago. Offering this only after they fail assumes they could try at all, **and the ones
who cannot are exactly the ones who would have been stuck longest.**

### Resume

```
  PASS  returns where they were
  PASS  🔴 and RE-READS the record value rather than storing it
  PASS  …plus the suggestion, for a truck that never started
```

The value is a property of the project and the domain, not a fact about this truck; **a copy in our
database would be a hardcoded target with extra steps.**

---

## 6. WHAT THIS STAGE DOES NOT DO

No daily check. No notification. No admin table. **No confirm step** — `custom_domain_verified_at` is
never written here, asserted below. **If the domain goes live, nothing tells anyone.** That is Stage 6.

---

## 7. Verification summary

**Which of the three: a typecheck and fifteen executions.** No standalone parse.

**The columns written, across every path:**

```
    {"custom_domain":"schedule.realthai.co.uk","custom_domain_setup_state":"awaiting_dns","custom_domain_setup_started_at":"…"}
    UNION: ["custom_domain","custom_domain_setup_started_at","custom_domain_setup_state"]
  PASS  exactly the three setup columns
  PASS  schedule_url never written
  PASS  scraper_preference never written
  PASS  scraper_rule never written
  PASS  custom_domain_verified_at never written by this stage
```

The harness seeds the truck row with recognisable scraper values, so a write to any of them would
appear rather than being invisible.

**All fifteen harnesses:**

```
  embed-gate PASS   embed-api PASS   posthog PASS   proxy-embed PASS   card-parity-1b PASS
  stamp-throttle PASS   embed-actions PASS   detect PASS   wizard-2b PASS   single-source PASS
  custom-host-deny PASS   domain-route PASS   apex-guard PASS   provisioning PASS   domain-copy PASS
```

Stage 4's serving side, the embed route and both existing hosts are covered by `custom-host-deny`,
`domain-route` and `embed-gate`, all unchanged and all passing.

⚠️ **Two harness defects found and recorded rather than smoothed over.** A module loader with no cache
overflowed the stack inside the transpiler (two transitive modules import each other) — narrowed and
cached. And the embed workstream's single-source checker failed on the words "Squarespace" and "Wix"
appearing in the new DNS-provider records: **those are website builders AND domain providers, so one
word legitimately names records in two unrelated feature sets.** The checker now keeps the long-form
copy strict and tree-wide and **reports label collisions with the file that holds them** instead of
failing on a word two products share.

---

## 8. What remains unverified

1. **Nothing was rendered in a browser and no domain exists.** No DNS record was created, no
   certificate issued, no request has ever arrived on a custom host, no email sent.
2. **No live hosting API call was made** — by design, and §4 shows the interception. **So the request
   and response shapes are from Vercel's documentation, not from a call.** A field named differently in
   practice would not have been caught here.
3. **The DoH responses were stubbed.** The parsers were exercised against constructed answers with
   realistic rdata; **no real resolver was queried.**
4. **The provider nameserver patterns and field labels come from published interfaces and were not
   verified against live dashboards today** — the same standing caveat as the website-builder menu
   names, and recorded in the module.
5. **Five migrations are unapplied.** Apply all five before deploying, outside a trading truck's
   service hours with a short `lock_timeout`.
6. **An abandoned registration is not cleaned up by anything** — §4. Named, not built.
7. **`next build` was not run.** `tsc --noEmit` is a typecheck, not a build.
