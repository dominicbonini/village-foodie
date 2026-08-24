# WhatsApp — three small fixes: app-secret name, swallowed lookup errors, stale column comment

**Date:** 20 August 2026
**Scope:** the three fixes named in the brief. **Nothing else was changed. No migration was written.
No deploy was run. `next dev` was not run.** This joins the existing undeployed batch and is not to be
pushed.

**Prompt integrity:** no span arrived garbled. No instruction contradicted another. One **scope tension**
was found and is reported rather than resolved unilaterally — see 1.d.

**Files changed (2):**

- `app/api/webhooks/meta/whatsapp/route.ts` — Fix 1 and Fix 2
- `supabase/migrations/20260523_messaging_schema.sql` — Fix 3 (comment text only)

---

# FIX 1 — the app-secret variable name

## 1.a 🔴 THE MANDATED PRE-CHECK, ANSWERED BEFORE ANYTHING WAS EDITED

**Q: Does the route read a single env var, or a fallback chain of names?**

🔴 **A SINGLE VAR. THERE IS NO CHAIN.** The pre-change line, quoted whole:

```ts
  const secrets = parseMetaAppSecrets(process.env.META_APP_SECRET)
```

No `??`, no `||`, no array, no second name anywhere on the line or near it. Confirmed by regex over the
whole file: **zero occurrences** of `parseMetaAppSecrets(` followed by `??` or `||`.

**Q: Does `parseMetaAppSecrets` read `process.env` itself, or take a passed value?**

🔴 **IT TAKES A PASSED VALUE AND READS NOTHING.** Its signature in `lib/meta/webhook-signature.ts`:

```ts
export function parseMetaAppSecrets(raw: string | undefined | null): string[] {
  if (!raw) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}
```

✅ **The entire module contains ZERO `process.env` references.** It is a pure, dependency-free parser —
so there is no hidden second name inside the helper either. The only name in play is the one the route
passes.

## 1.b 🔴 CONCLUSION OF THE PRE-CHECK: THE GATE IS BROKEN, THE FIX IS NECESSARY, I PROCEEDED

Nothing accepts `META_WHATSAPP_APP_SECRET` today. Against a production environment that defines only
that name, `process.env.META_APP_SECRET` resolves to `undefined`, `parseMetaAppSecrets(undefined)`
returns `[]`, and `verifyMetaSignature` returns `no_secret_configured` on its first branch — **so every
genuine Meta delivery is refused 401 before the truck lookup is ever reached.**

**The stop-condition in the brief did not fire.** Had a chain already accepted the production name, I
would have stopped and said the fix was unnecessary. It does not, so I made it.

## 1.c The change

**BEFORE:**

```ts
  const signatureHeader = req.headers.get('x-hub-signature-256')
  const secrets = parseMetaAppSecrets(process.env.META_APP_SECRET)
  const verification = verifyMetaSignature({ rawBody, signatureHeader, secrets })
```

**AFTER:**

```ts
  const signatureHeader = req.headers.get('x-hub-signature-256')
  const secrets = parseMetaAppSecrets(process.env.META_WHATSAPP_APP_SECRET)
  const verification = verifyMetaSignature({ rawBody, signatureHeader, secrets })
```

✅ **ONE NAME. NO CHAIN**, as instructed — and the comment block added above the read records *why* a
chain was refused, so the next reader does not "helpfully" add one:

> *"A chain reading `META_WHATSAPP_APP_SECRET ?? META_APP_SECRET` would have worked and is REFUSED ON
> PURPOSE: accepting either name is what hides this exact drift the next time it happens."*

✅ **THE COMMA-SEPARATED MULTI-SECRET FEATURE IS UNAFFECTED.** It lives in the parser's `split(',')`,
not in the variable name, so a multi-app deployment still works exactly as before.

✅ **The added comment introduced no new characters.** This file carries an explicit rule against
widening its codepoint vocabulary; the census in §4.d confirms the non-ASCII inventory is byte-identical
before and after.

## 1.d 🔴 A SCOPE CONSEQUENCE I DID NOT ACT ON, AND YOU NEED TO DECIDE IT

**The brief named one file and said change nothing else. I obeyed that.** The consequence:

```
app/api/webhooks/meta/whatsapp/route.ts:102   process.env.META_WHATSAPP_APP_SECRET   <- changed
app/api/webhooks/messenger/route.ts:43        process.env.META_APP_SECRET            <- UNCHANGED
app/api/webhooks/instagram/route.ts:43        process.env.META_APP_SECRET            <- UNCHANGED
```

🔴 **THE MESSENGER AND INSTAGRAM GATES REMAIN ON A NAME PRODUCTION DOES NOT DEFINE**, so both stay
fail-closed and will 401 every genuine delivery. **Nothing functional is lost today** — §20 records both
as verify-handshake + `console.log` stubs that do nothing with a message — **but Meta sees sustained
non-2xx on two live subscriptions and can flag them.**

**This is a decision, not an oversight.** Either they move to `META_WHATSAPP_APP_SECRET` too (wrong — the
helper's own header explains the three products need not share a Meta app, and the name would then lie
about which product it belongs to), or production gains a `META_APP_SECRET` for them, or they stay
refusing until Messenger/Instagram are actually built. **I did not choose.**

⚠️ **A SECOND, SMALLER CONSEQUENCE — A STALE COMMENT IS NOW A SECOND CLAIM.**
`lib/meta/webhook-signature.ts` documents the refusal reason as:

```
 *   no_secret_configured       → META_APP_SECRET is missing in this environment. THE LOUD ONE.
```

That is now **wrong for the WhatsApp surface and still right for the other two.** §35's P26 — *a stale
comment is a second claim* — applies. **Named, not changed:** the helper is shared by all three routes
and is outside the named scope, and how it should read depends on how you decide 1.d.

---

# FIX 2 — the swallowed Supabase errors at both truck lookups

## 2.a The primary lookup

**BEFORE:**

```ts
      const { data } = await supabase
        .from('trucks')
        .select(TRUCK_FIELDS)
        .eq('phone_number_id', phoneNumberId)
        .eq('active', true)
        .maybeSingle()
      truck = (data as TruckRow | null) ?? null
```

**AFTER:**

```ts
      const { data, error } = await supabase
        .from('trucks')
        .select(TRUCK_FIELDS)
        .eq('phone_number_id', phoneNumberId)
        .eq('active', true)
        .maybeSingle()
      // A QUERY THAT ERRORED IS NOT A QUERY THAT FOUND NOTHING, AND `const { data }` COULD NOT TELL THEM
      // APART. A failed lookup arrived here as `data: null` and was indistinguishable from an honest
      // no-match, so the message was dropped with the log line for the wrong cause. maybeSingle() returns
      // an ERROR rather than a row when MORE THAN ONE row matches; the partial unique index on
      // phone_number_id makes that unreachable for THIS lookup, but the fallback below has no such index
      // and the two sites must not diverge in how they read a result.
      // console.error and the word FAILED, so this is greppable apart from the NO TRUCK warn below.
      if (error) {
        console.error(
          `[webhook/meta-whatsapp] LOOKUP FAILED (primary, phone_number_id) code=${error.code} ` +
          `message=${error.message} -> treated as no match; falling through to the fallback.`,
        )
      }
      truck = (data as TruckRow | null) ?? null
```

## 2.b The fallback lookup — the site this actually guards

**BEFORE:**

```ts
      const { data } = await supabase
        .from('trucks')
        .select(TRUCK_FIELDS)
        .or(toVariants.map(v => `whatsapp_sender.eq.${v}`).join(','))
        .eq('active', true)
        .maybeSingle()
      truck = (data as TruckRow | null) ?? null
```

**AFTER:**

```ts
      const { data, error } = await supabase
        .from('trucks')
        .select(TRUCK_FIELDS)
        .or(toVariants.map(v => `whatsapp_sender.eq.${v}`).join(','))
        .eq('active', true)
        .maybeSingle()
      // THIS IS THE SITE THE ERROR CHECK EXISTS FOR. whatsapp_sender carries NO unique index, so the
      // moment a SECOND truck is populated with a value matching any of the three variants, maybeSingle()
      // returns an error and no row. Discarding it made that arrive as a silent drop that looked exactly
      // like "no truck is set up on WhatsApp" -- the failure would have been diagnosed as configuration.
      // Logged distinctly, then fallen through: a lookup we could not complete is NOT a match.
      if (error) {
        console.error(
          `[webhook/meta-whatsapp] LOOKUP FAILED (fallback, display_phone_number) code=${error.code} ` +
          `message=${error.message} variants=${toVariants.length} -> treated as no match. ` +
          `A "more than one row" error here means two trucks share a whatsapp_sender variant.`,
        )
      }
      truck = (data as TruckRow | null) ?? null
```

## 2.c ✅ THE ROUTE STILL RETURNS 200. NO NON-200 EXIT WAS INTRODUCED.

**Neither `if (error)` block returns.** Both log and fall through, leaving `truck` null (supabase-js
returns `data: null` alongside an error), so control reaches the pre-existing no-truck branch unchanged:

```ts
    if (!truck) {
      console.warn(`[webhook/meta-whatsapp] NO TRUCK for phone_number_id=${E} — message dropped, nothing sent.`)
      return NextResponse.json({ ok: true })   // 200, untouched
    }
```

**Proven mechanically, not asserted** — see §4.b: the set of `{ status: N }` exits is **identical before
and after** ({200, 400, 401, 403}, all pre-existing), and the count of `NextResponse.json({ ok: true })`
is **8 before and 8 after**. §20's rule that a non-200 lets Meta disable the subscription for every truck
is respected.

## 2.d ✅ "QUERY ERRORED" vs "NO TRUCK MATCHED" — distinguishable at a glance

| | Severity | String |
|---|---|---|
| **Query errored** | `console.error` | `LOOKUP FAILED (primary, phone_number_id)` / `LOOKUP FAILED (fallback, display_phone_number)` |
| **No truck matched** | `console.warn` | `NO TRUCK for phone_number_id=… display=…` |

Different log level, different verb, different noun, and **`LOOKUP FAILED` is a single greppable token**
that cannot collide with the no-match line. The fallback's line also names the likely cause outright, so
the reader does not have to reason from a Postgres code.

⚠️ **ONE HONEST CONSEQUENCE.** On a fallback error, **both lines are emitted** — `LOOKUP FAILED` and then
`NO TRUCK`. That is deliberate: the `NO TRUCK` line carries the two identifiers needed to fix a genuine
no-match, and suppressing it would remove them. **But it means `NO TRUCK` on its own is no longer proof of
a clean no-match** — the presence or absence of a `LOOKUP FAILED` line immediately above it is what
disambiguates. **Read the pair, not the warn.**

---

# FIX 3 — the stale column comment

## 3.a ✅ NO NEW MIGRATION WAS NEEDED, SO I DID NOT STOP

The brief's stop-condition was *"if the comment cannot be corrected without a new migration file"*. It
can: the text is editable in place in `supabase/migrations/20260523_messaging_schema.sql`. **No new file
was created. No column, constraint, index or data was touched.**

🔴 **BUT READ 3.d BEFORE TREATING THIS AS DONE.** Editing the file corrects the repository's record; it
does **not** correct the live database.

## 3.b Both stale sites were corrected, not one

The two wrong claims — *"Twilio-registered"* and *"Format: `+447700900000`"* — appear **twice** in this
file: in the `--` header block and in the `comment on column` string. **Correcting only the one you named
would have left the other adjacent**, which §1's rule forbids in as many words: *a correction sitting next
to the claim it corrects is not a correction, it is two claims, and a reader takes whichever they meet
first.* Both are comment text; neither edit touches the column.

**BEFORE (header):**

```sql
-- Add whatsapp_sender to trucks
-- This is the Twilio-registered WhatsApp Business API number
-- that customers message and auto-replies come from.
-- Different from trucks.whatsapp which is where order notifications go.
```

**AFTER (header):**

```sql
-- Add whatsapp_sender to trucks
-- This is the WhatsApp Business API sender number that customers message and
-- auto-replies come from.
-- Different from trucks.whatsapp which is where order notifications go.
--
-- COMMENT CORRECTED 20 August 2026 (comment text only -- no column, constraint or
-- data was altered by that edit). Two claims in this file were wrong:
--   1. "Twilio-registered". The provider has been the Meta Cloud API since V6.3;
--      the Twilio handler at /api/webhooks/whatsapp is dormant, not live.
--   2. "Format: +447700900000". The column is FREE TEXT with no constraint and no
--      normalisation on write, and the stored values do not follow that format.
-- See docs/whatsapp-readiness-report.md, Q1.
```

**BEFORE (column comment):**

```sql
comment on column trucks.whatsapp_sender is
  'Twilio-registered WhatsApp Business API number for this truck.
   Customers message this number. Auto-replies sent from this number.
   Format: +447700900000. Distinct from trucks.whatsapp which receives
   order notifications.';
```

**AFTER (column comment):**

```sql
comment on column trucks.whatsapp_sender is
  'WhatsApp Business API sender number for this truck, on the Meta Cloud API
   (the provider has been Meta since V6.3; this column was created for Twilio).
   Customers message this number. Auto-replies are sent from it.
   FREE TEXT. There is no constraint, no check and no normalisation on write, so
   there is no guaranteed format -- as of 20 August 2026 the one populated row is
   UK-national (07380736226), not E.164. The Meta webhook does not normalise this
   column: it normalises the INBOUND display_phone_number into three candidate
   shapes (+CCNNN, CCNNN and, for 44, 0NNN) and compares each against this value
   raw. That is what tolerates the drift, and it is why changing a stored value
   without checking that webhook can silently stop routing a truck.
   Distinct from trucks.whatsapp which receives order notifications.';
```

## 3.c ✅ THE DDL IS PROVABLY UNTOUCHED

Every non-`--` line of the file was diffed before against after. **The only difference outside the `--`
comment lines is the `comment on column trucks.whatsapp_sender` string itself** — which is the comment
text. The `alter table trucks / add column if not exists …` block, both other `comment on column`
statements, the `messages` alterations and the index are **byte-identical.**

## 3.d 🔴 THE FILE AND THE LIVE DATABASE NOW DISAGREE, DELIBERATELY. THIS IS YOUR DECISION.

`comment on column` ran once, in May 2026. **The live `trucks.whatsapp_sender` comment in Postgres still
carries the old, wrong text** — editing an already-applied migration file changes the repository's record
and nothing else. Anyone reading the comment **in Supabase** still reads *"Twilio-registered … Format:
+447700900000"*.

**Three ways to close that, none of which I took:**

1. Run the corrected `comment on column` statement by hand against production. **Comment-only, no data,
   no lock of consequence** — but it is a production write and the brief forbids deploys.
2. A new migration carrying only the comment. **Explicitly forbidden by the brief.**
3. Accept the divergence and treat the repo as the record.

⚠️ **I have not assumed which you want.** Stated here because *"the comment is fixed"* would otherwise be
read as fixed everywhere, and it is not.

---

# §4 — VERIFICATION

**`tsc` was not run, and nothing here is offered as tsc-clean.** What follows is what was actually
executed against the files.

## 4.a ✅ RECONSTRUCTION PROOF — the file is the pre-change copy plus exactly four named edits

A copy was taken before the first keystroke. The four edits were then re-applied to that copy
programmatically and the result byte-compared with what is on disk:

```
edits applied to the pre-change copy: 4
   - 1: env var name
   - 2: gate comment
   - 3: primary lookup error check
   - 4: fallback lookup error check
BYTE-EQUAL to what is on disk: YES
```

✅ **This is the strongest available statement that nothing else changed.** A stray character anywhere in
the 300-line file — a reflowed line, an autocompleted import, a trailing space — breaks the equality.

## 4.b ✅ BEHAVIOURAL ASSERTIONS ON THE FILE AS IT STANDS

```
META_APP_SECRET still read in this file          : False
reads META_WHATSAPP_APP_SECRET (count)           : 1
no fallback chain (?? or || in the secret read)  : True
lookups destructuring error                      : 2      (was 0)
lookups still discarding error                   : 0      (was 2)
LOOKUP FAILED log sites                          : 2
NO TRUCK warn still present                      : True
all { status: N } exits                          : 200, 403, 400, 401   (identical set before and after)
NextResponse.json({ ok: true })                  : 8 before, 8 after
```

## 4.c ✅ THE ERROR TYPE WAS CHECKED, NOT ASSUMED

`error.code` and `error.message` are read inside an `if (error)` narrowing. From the installed package
(`@supabase/postgrest-js`, `dist/index.d.mts`):

```ts
declare class PostgrestError extends Error {
  details: string;
  hint: string;
  code: string;
```

`code` is a **non-optional `string`**; `message` is inherited from `Error`. Both accesses are valid.

## 4.d ✅ CHARACTER CENSUS — zero new codepoints in either file

This file carries an explicit rule against widening its non-ASCII vocabulary. The census was run before
and after on both changed files:

```
route.ts   [BEFORE]  NUL=0  otherC0=0  orphanVS=0  bare carriers: none   non-ASCII: U+2014(—)x19 U+2192(→)x3
route.ts   [AFTER]   NUL=0  otherC0=0  orphanVS=0  bare carriers: none   non-ASCII: U+2014(—)x19 U+2192(→)x3
migration  [BEFORE]  NUL=0  otherC0=0  orphanVS=0  bare carriers: none   non-ASCII: U+2014(—)x1
migration  [AFTER]   NUL=0  otherC0=0  orphanVS=0  bare carriers: none   non-ASCII: U+2014(—)x1
```

✅ **The inventories are byte-identical.** Every line added uses ASCII `--` and `->` rather than an em
dash or arrow, matching the style of this file's own signature-era additions. Carrier-aware per-base
check (the §35 P13 form): no variation selectors in either file, so no bare-glyph question arises.

---

# §5 — WHAT REMAINS UNOBSERVED

Stated plainly, because none of this is demonstrated by the change.

1. 🔴 **NO REQUEST HAS BEEN MADE THROUGH THE CHANGED GATE.** The signature path has **never** received a
   genuine signed Meta delivery — the helper's own header says the algorithm is *"INFERRED from Meta's
   documented behaviour … unproven against real traffic"* — and it certainly has not since this edit.
2. 🔴 **THAT THE VALUE OF `META_WHATSAPP_APP_SECRET` IS THE CORRECT SECRET IS UNVERIFIED.** Its
   *presence* in Vercel was read by hand; its correctness has not been tested. **A present-but-wrong
   secret now produces `reason=signature_mismatch` instead of `reason=no_secret_configured`** — a
   different log line, still a 401, still every message dropped. **This fix moves the failure mode; it
   does not prove the gate works.**
3. ⚠️ **NEITHER ERROR BRANCH HAS EVER EXECUTED, AND NEITHER IS REACHABLE TODAY.** The primary lookup is
   protected by the partial unique index; the fallback needs two trucks sharing a `whatsapp_sender`
   variant when **only one row is populated at all**. The guard is correct-by-reading, not by observation.
4. ⚠️ **THE LIVE DATABASE COMMENT IS UNCHANGED** (3.d).
5. 🔴 **WHETHER ANY INBOUND TRAFFIC IS ARRIVING AT ALL REMAINS UNKNOWN.** Q1.e of the readiness report
   stands: an unmatched message and a refused message both write **no `whatsapp_logs` row**, so the
   table's silence since 18 June still proves nothing.

## ✅ WHAT WOULD SETTLE ALL OF IT — one look at the production logs after this batch deploys

Three strings already in the code, and each answers a different question:

| Log line | Means |
|---|---|
| `REFUSED reason=no_secret_configured secretsConfigured=0` **disappears for meta-whatsapp** | Fix 1 worked. |
| `REFUSED reason=signature_mismatch` **appears instead** | The name is right and the **value** is wrong. |
| `NO TRUCK for phone_number_id=… display=…` **appears** | The gate now passes and **routing is the next blocker** — and that line's `display=` value is the string that answers Q1.c of the readiness report. |
| `LOOKUP FAILED …` **appears** | Fix 2 earned its keep, and two trucks share a `whatsapp_sender` variant. |
| **None of them appears** | No inbound traffic is reaching the endpoint at all. |

⚠️ **`REFUSED reason=no_secret_configured` will still appear for `messenger` and `instagram`** — that is
1.d, unresolved by design, not a regression.

---

# §6 — EXPLICITLY NOT TOUCHED

Confirmed by inspection of the working tree, which contains **exactly two changed source files**:

- ✅ The Graph API version pin. **Still `v19.0`.** `lib/meta-whatsapp.ts` was not opened for edit.
- ✅ `trucks.phone_number_id` and anything that would write it. **No new writer exists.**
- ✅ The `whatsapp_logs` insert position and `response_sent` semantics. **Untouched** — 6.d of the
  readiness report still needs your design decision.
- ✅ The template tool, the admin route, the admin page.
- ✅ Everything else in the undeployed batch.

⚠️ **Also present in `git status`, from earlier work today and NOT part of this change:**
`docs/reference-manual.md`, `docs/website-embed-read.md`, `docs/hatchgrab-root-landing.md` (the V11.35
manual task) and `docs/whatsapp-readiness-report.md` (this morning's diagnosis).
