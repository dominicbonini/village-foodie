# WhatsApp truck-lookup routing — FIXED, plus the `phone_number_id` column

Scope honoured: **one migration file and one webhook route.** No `next dev`, no `next build`, no
`cap sync`, no deploy, no commit, **no SQL was run**, no Meta call. 🔴 **The signature verification
added in the previous task, the classifier and the sender's payload are untouched.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

The Meta and Twilio webhooks are separate implementations and are reported **separately**. Every claim
is marked **READ** or **INFERRED**.

> ✅ `npx tsc --noEmit` exits 0. ⚠️ **Nothing here has received a real Meta delivery** — see Part G for
> how to prove it without waiting for a customer.

---

# PART A — BOTH WEBHOOKS, READ

## A1. The Meta lookup, before

**READ** — `app/api/webhooks/meta/whatsapp/route.ts:106-139` as it stood:

```ts
    const message       = messages[0]
    const from          = message.from as string  // digits only, no + prefix
    const text          = message.type === 'text' ? (message.text?.body as string) : null
    const phoneNumberId = value?.metadata?.phone_number_id as string

    if (!text || !phoneNumberId) {
      return NextResponse.json({ ok: true })
    }

    console.log('[webhook/meta-whatsapp] message from:', from, 'text:', text)

    // whatsapp_sender may be stored as +447..., 447..., or 07... (UK local).
    // Meta always sends digits only (e.g. 447941042253). Build all variants to match any format.
    const fromVariants = [
      `+${from}`,
      from,
      from.startsWith('44') ? `0${from.slice(2)}` : null,
    ].filter((v): v is string => v !== null)

    const { data: truck } = await supabase
      .from('trucks')
      .select(`
        id, name, slug, truck_emoji,
        whatsapp_sender, whatsapp,
        plan, feature_overrides, trial_expires_at
      `)
      .or(fromVariants.map(v => `whatsapp_sender.eq.${v}`).join(','))
      .eq('active', true)
      .single()

    if (!truck) {
      console.warn('[webhook/meta-whatsapp] no truck found for number:', from)
      return NextResponse.json({ ok: true })
    }
```

🔴 **`from` is the CUSTOMER. `whatsapp_sender` is the TRUCK.** The query asks *"which truck's own
WhatsApp number equals this customer's phone number?"* ⚠️ **And `phoneNumberId` was read at the line
above and then used only as the SEND identity** — the routing key was sitting in the handler, unused.

## A2. The Twilio lookup, beside it

**READ** — `app/api/webhooks/whatsapp/route.ts:16-41`, **unchanged by this task**:

```ts
    const from = formData.get('From') as string  // e.g. whatsapp:+447700900000
    const to   = formData.get('To')   as string  // e.g. whatsapp:+14155238886
    …
    const toNumber   = to.replace('whatsapp:', '')
    const fromNumber = from.replace('whatsapp:', '')
    …
    const { data: truck } = await supabase
      .from('trucks')
      …
      .eq('whatsapp_sender', toNumber)
      .eq('active', true)
      .single()
```

| | Field matched | Correct? |
|---|---|---|
| **Twilio** | `whatsapp_sender` = **`toNumber`** — the number the customer messaged **TO** | ✅ **Yes** |
| **Meta (before)** | `whatsapp_sender` = **`from`** — the number the customer messaged **FROM** | 🔴 **No** |

**Why Twilio's is correct:** `whatsapp_sender` holds the **truck's** number, and the number a customer
sends a message *to* **is** the truck's number. The two sides of the comparison describe the same thing.
Meta's compared a truck's number against a customer's, which describes two different things and is
equal only by coincidence.

⚠️ **That coincidence is exactly what happened:** the tester's own mobile was in `whatsapp_sender`, so
`from` and `whatsapp_sender` were the same value and the wrong field looked right.

## A3. Meta's inbound payload — 🔴 INFERRED, and no captured payload exists

🔴 **STATED PLAINLY: there is NO captured Meta payload anywhere in this repository.** Searching every
`.ts`, `.tsx`, `.json` and `.md` for `phone_number_id` returns only **our own source and our own
reports**; `display_phone_number` returns **nothing at all** before this task. **So the schema below is
INFERRED from Meta's documentation and from what the existing code already assumes — not read from a
real delivery.**

**INFERRED shape:**

```
entry[0].changes[0].value
  ├─ metadata
  │    ├─ display_phone_number   the business number in human form  <- the number messaged TO
  │    └─ phone_number_id        the opaque, stable identifier      <- the number messaged TO
  └─ messages[0]
       ├─ from                   the CUSTOMER's number, digits only
       ├─ type
       └─ text.body
```

| Question | Answer |
|---|---|
| **Which field carries the number the customer messaged TO?** | 🔴 **`value.metadata.display_phone_number`** (human form) **and `value.metadata.phone_number_id`** (the identifier). **Both are the business number.** |
| **Which carries `phone_number_id`?** | `value.metadata.phone_number_id` — **READ**, the existing code already reads exactly that path at `:133`. |
| **Which carries the customer?** | `messages[0].from`. |

✅ **The one part that is READ rather than inferred is the most important:** the existing code already
reads `value?.metadata?.phone_number_id` and passes it to `sendMetaWhatsApp` as the send identity. **The
codebase already treats it as "the business number for this conversation" — it simply never used it to
find the truck.**

---

# PART B — THE MIGRATION

## B1. The migration, in full

**NEW FILE: `supabase/migrations/20260816_trucks_phone_number_id.sql`.** 🔴 **NOT RUN.** Quoted here
once; **it exists in exactly one place and Dominic runs that file.**

```sql
ALTER TABLE trucks
ADD COLUMN IF NOT EXISTS phone_number_id text;

COMMENT ON COLUMN trucks.phone_number_id IS
  'Meta WhatsApp Business phone-number ID. Arrives on every inbound webhook as '
  'value.metadata.phone_number_id and is the send path segment. NULL = this truck is not set up on '
  'the WhatsApp Business API. Set by hand: there is no UI. See docs/whatsapp-routing-report.md.';

CREATE UNIQUE INDEX IF NOT EXISTS trucks_phone_number_id_key
  ON trucks (phone_number_id)
  WHERE phone_number_id IS NOT NULL;
```

**Nullable, no default, as specified.** The header comment carries the reasoning; three points from it
are worth surfacing:

🔴 **NULLABLE DELIBERATELY, and it is the opposite of the `add_order_layout` decision** — which is worth
knowing because that migration's header argues hard for NOT NULL. That column had a meaningful default
(the behaviour every truck already had). **This one has none: a truck not onboarded to the WhatsApp
Business API has no phone-number ID, and inventing one would make "not set up" indistinguishable from
"set up with a bad value".**

🔴 **UNIQUE, AND THAT IS THE POINT OF THE MIGRATION RATHER THAN A DETAIL OF IT.** The defect being fixed
is one truck's messages reaching another. **A partial unique index makes "two trucks claim the same Meta
number" unrepresentable in the database rather than merely unlikely in the application.**
`WHERE phone_number_id IS NOT NULL` keeps it partial so the many NULL rows do not collide.

⚠️ **No CHECK constraint** — the format is Meta's and opaque to us, and encoding a guess would put a
second definition somewhere the application cannot see.

## B2. 🔴 DEPLOY-COUPLED. RUN THE SQL **BEFORE** DEPLOYING.

**Classification: DEPLOY-COUPLED, and the ordering is not a preference.**

**READ** — the reason is in the route, and it is the distinction the sibling migration's header already
draws:

```ts
      const { data } = await supabase
        .from('trucks')
        .select(TRUCK_FIELDS)          // a NAMED select, and TRUCK_FIELDS includes phone_number_id
        .eq('phone_number_id', phoneNumberId)
```

🔴 **A named select for a column that does not exist raises PostgREST 42703 and the whole lookup
fails.** Deploying first would break the webhook for **every** truck until the SQL ran.

✅ **Running the SQL first is completely inert:** nothing reads the column yet, nothing enumerates the
`trucks` column list to validate it, and every existing row simply gets NULL.

> **ORDER: SQL first, deploy second. There is no window in which a running deployment sees a
> half-applied state** — the column either exists (old code ignores it) or it does not (old code never
> asks for it).

## B3. What happens if the column is absent

⚠️ **A 42703 — a hard failure, not a silent null and not a degraded path.**

**And the brief's distinction is exactly right and is the reason this is deploy-coupled:**

| Read style | Missing column behaves as |
|---|---|
| `select('*')` | ✅ **degrades safely** — the column is simply absent from the row and the code reads `undefined` |
| **`select('id, name, phone_number_id, …')`** | 🔴 **PostgREST 42703**, the query returns an error and `data` is null |

**READ** — this route uses the second style, before and after:

```ts
const TRUCK_FIELDS = `
  id, name, slug, truck_emoji,
  whatsapp_sender, whatsapp, phone_number_id,
  plan, feature_overrides, trial_expires_at
`
```

⚠️ **In practice the failure would present as "no truck found" rather than a 500** — the route reads
`{ data }` and ignores the error object, so a 42703 makes `truck` null and the handler drops the message
with the `NO TRUCK` warning at C2. **Loud in the log, invisible to Meta.** ✅ **That is a safe failure
direction — nothing is sent to the wrong truck — but it is still a broken webhook, which is why the
order matters.**

## B4. Not run, not retyped

✅ **No SQL was executed.** ✅ **The statements exist in exactly one file.** The block quoted at B1 is a
report quotation of that file — **do not run it from here; run the file.**

---

# PART C — THE ROUTING FIX

## C1. Before and after

**BEFORE** — quoted in full at A1. The operative line:

```ts
      .or(fromVariants.map(v => `whatsapp_sender.eq.${v}`).join(','))
```

**AFTER — READ, as committed:**

```ts
    // ---- THE TRUCK LOOKUP: MATCHED ON THE NUMBER THE CUSTOMER MESSAGED *TO* ----
    // WHAT WAS WRONG, AND IT IS WORTH SPELLING OUT BECAUSE IT PASSED A LIVE TEST. This matched
    // `whatsapp_sender` — the TRUCK's own number — against `from`, which is the CUSTOMER's number:
    //     .or(fromVariants.map(v => `whatsapp_sender.eq.${v}`).join(','))
    // For any real customer that finds nothing. It only ever appeared to work because the tester's own
    // mobile was sitting in `whatsapp_sender`, which made the two values identical and the wrong field
    // look right. With two trucks it does something worse than nothing: it can match the OTHER truck.
    // The Twilio webhook in this repo has always done it correctly — `.eq('whatsapp_sender', toNumber)`,
    // the number messaged TO — and this is that, using the identifier Meta actually addresses.
    //
    // PRIMARY: phone_number_id. Opaque and stable, so there is no format to normalise and no ambiguity.
    // The partial unique index added in 20260816_trucks_phone_number_id.sql makes it impossible for two
    // trucks to claim the same one, so this can never return a second row.
    let truck: TruckRow | null = null
    {
      const { data } = await supabase
        .from('trucks')
        .select(TRUCK_FIELDS)
        .eq('phone_number_id', phoneNumberId)
        .eq('active', true)
        .maybeSingle()
      truck = (data as TruckRow | null) ?? null
    }
```

**And the bridge, for the window in which no truck has the column set yet:**

```ts
    // FALLBACK: the DISPLAYED number against whatsapp_sender, still the number messaged TO and never
    // the customer's. This exists because phone_number_id has NO UI and must be set by hand, so until a
    // truck's row is populated the primary lookup finds nothing. It is a bridge, not a second routing
    // rule — delete it once every WhatsApp truck has a phone_number_id.
    // The variants are the same three shapes the old code built, because whatsapp_sender is free text
    // and Pizzeria Gusto's is stored UK-national ('07380736226') while the field's placeholder is E.164.
    if (!truck && displayPhoneNumber) {
      const digits = displayPhoneNumber.replace(/\D/g, '')
      const toVariants = [
        `+${digits}`,
        digits,
        digits.startsWith('44') ? `0${digits.slice(2)}` : null,
      ].filter((v): v is string => v !== null)
      const { data } = await supabase
        .from('trucks')
        .select(TRUCK_FIELDS)
        .or(toVariants.map(v => `whatsapp_sender.eq.${v}`).join(','))
        .eq('active', true)
        .maybeSingle()
      truck = (data as TruckRow | null) ?? null
      if (truck) {
        console.warn(
          `[webhook/meta-whatsapp] routed by whatsapp_sender FALLBACK, not phone_number_id — ` +
          `truck=${truck.id} phone_number_id=${phoneNumberId} is not stored. Set it to retire this path.`,
        )
      }
    }
```

🔴 **BOTH lookups match on the number the customer messaged TO. `from` is no longer used for routing at
all** — it survives only as the send recipient, which is what it always should have been.

⚠️ **The fallback is a deliberate addition and is not a second routing rule.** Without it, this change
would take a feature that "worked" in test and make it match nothing at all until Dominic hand-sets a
column that has no UI. **It is the same TO-based rule the Twilio webhook uses, and it announces itself
in the log every time it fires so it cannot become permanent by silence.**

⚠️ **Also changed: `.single()` → `.maybeSingle()`.** `.single()` raises an error on zero rows, which the
old code discarded; `maybeSingle()` returns null cleanly. **Behaviour on a match is identical.**

## C2. 🔴 When no truck matches

**BEFORE — READ:**

```ts
    if (!truck) {
      console.warn('[webhook/meta-whatsapp] no truck found for number:', from)
      return NextResponse.json({ ok: true })
    }
```

⚠️ **It logged the CUSTOMER's phone number** — a member of the public's number in a server log — **and
that number is useless for diagnosis**, because it is not the thing the lookup should have used.

**AFTER — READ, as committed:**

```ts
    if (!truck) {
      // NOT a silent discard. This names both identifiers, so the fix is a lookup rather than a guess:
      // set trucks.phone_number_id to the value below for whichever truck owns that display number.
      console.warn(
        `[webhook/meta-whatsapp] NO TRUCK for phone_number_id=${phoneNumberId} ` +
        `display=${displayPhoneNumber ?? 'absent'} — message dropped, nothing sent.`,
      )
      return NextResponse.json({ ok: true })
    }
```

✅ **It does NOT reply to the wrong truck** — `truck` is null, so the handler returns before the plan
gate, before the classifier and before `sendMetaWhatsApp`. **Nothing is sent.**
✅ **It does NOT silently discard** — the line names both identifiers **and the remedy**.
✅ **And the customer's number is no longer logged.** The `console.log` above it was also changed to
print `phone_number_id` instead of `from`.

## C3. Two trucks now route independently — the code that guarantees it

**Three independent guarantees, all READ:**

1. **The match key is the business number, not the customer's.** Two trucks with different Meta numbers
   produce different `phone_number_id` values on their deliveries, so `.eq('phone_number_id', …)`
   selects a different row for each. 🔴 **Under the old code both trucks' messages were matched against
   the same field using the customer's number — so which truck you got depended on which truck happened
   to have that customer's number stored, not on who was messaged.**
2. 🔴 **The database makes a collision unrepresentable:**
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS trucks_phone_number_id_key
     ON trucks (phone_number_id)
     WHERE phone_number_id IS NOT NULL;
   ```
   **Two trucks cannot hold the same identifier**, so the primary lookup can never return a second row.
3. **The fallback is equally TO-based** — `display_phone_number` is the business number, so it also
   distinguishes the two trucks. ⚠️ **It relies on `whatsapp_sender` being distinct**, which the
   database does not enforce; that is one reason it is a bridge to be deleted.

## C4. Gusto's `07380736226` — normalisation and the existing row

**Does the new lookup normalise? PARTLY, and only in the fallback.**

| Path | Normalisation |
|---|---|
| **Primary (`phone_number_id`)** | 🔴 **None needed.** The identifier is opaque and is compared exactly. **This is the main reason to route on it: there is no format to get wrong.** |
| **Fallback (`display_phone_number`)** | ✅ **Yes** — `replace(/\D/g, '')` then three variants: `+44…`, `44…`, `0…`. **The same three shapes the old code built.** |

**What happens to Gusto's existing row — READ, `trucks.whatsapp_sender = '07380736226'`:**

- ✅ **Nothing breaks.** The fallback's `0…` variant matches it exactly, so a delivery to that number
  would still find them.
- ⚠️ **But Gusto is not set up on WhatsApp**, so no delivery will arrive for that number at all.
- 🔴 **The value would be wrong the moment it mattered, and for a reason bigger than format:** it is a
  **UK mobile**, not a WhatsApp Business number, and `lib/email.ts:333` records that *"Gusto's number
  lives in contact_phone, not whatsapp_sender"* — so the column holds a number that is not the truck's
  contact number and is not a Business API sender either. **INFERRED: it is the tester's own mobile,
  which is precisely the configuration that hid this defect.**

**NO DATA MIGRATION WAS WRITTEN, as instructed. Reported:** ⚠️ **`trucks.whatsapp_sender` for
`pizzeria-gusto` should be reviewed by hand** — it is either wrong or a leftover test value, and once
`phone_number_id` is populated the column stops being a routing key entirely.

## C5. Everything else that reads `whatsapp_sender`

**READ — exhaustive, and the earlier report's five are all one thing:**

| Site | Purpose | Affected? |
|---|---|---|
| `dashboard/action/route.ts:195, 301, 965, 1654, 2010` | `whatsappSender:` param → `formatConfirmationEmail` | ❌ **No — display only** |
| `orders/submit/route.ts:1231` | same | ❌ **No** |
| `lib/payments/promote-draft.ts:452` | same | ❌ **No** |
| `api/dashboard/route.ts:47` | included in the dashboard payload | ❌ **No** |
| `api/manage/route.ts:861` | the `update_truck` **write** allow-list | ❌ **No — unchanged, see D2** |
| **`api/webhooks/whatsapp/route.ts:39`** | 🔴 **the Twilio webhook's ROUTING** | ⚠️ **Reads it for routing — and is UNCHANGED.** It was always correct. |
| **`api/webhooks/meta/whatsapp/route.ts`** | 🔴 **the Meta webhook's routing** | ✅ **THE ONE CHANGED** |

🔴 **So exactly two sites use it for routing, and only one was wrong.** Every other consumer prints it
in an email.

---

# PART D — THE OPERATOR SIDE

## D1. Is there any UI for `phone_number_id`? — **NOT FOUND**

**Stated plainly.** Searching `app/`, `components/` and `lib/` for `phone_number_id` returns **only the
Meta webhook route** — the reads I added and the comments explaining them. **No input, no label, no
save handler, and it is NOT in `update_truck`'s allow-list** (`api/manage/route.ts:861`, quoted at C5 —
unchanged and does not contain it).

🔴 **So the column can only be set by hand in Supabase.** ✅ **That is deliberate for this pass and no UI
was built.**

**What building one would need, reported not implemented:**

1. A field in Manage → Settings → Auto-replies, beside the existing WhatsApp one.
2. `'phone_number_id'` added to `update_truck`'s `allowed` array — **the write is blocked without it**.
3. ⚠️ **A decision about what the operator is actually being asked for.** It is a Meta console value with
   no meaning to a food-truck operator, so a bare text input invites a wrong paste. **This is really a
   symptom of self-serve onboarding not existing** — with Embedded Signup the value would arrive from
   Meta rather than be typed.
4. ⚠️ **The unique index means a duplicate paste fails at the database**, so the UI would need to render
   that error rather than swallow it.

## D2. The "Connect" field still saves `whatsapp_sender` exactly as before

✅ **Confirmed from the diff: neither `app/manage/[token]/page.tsx` nor `app/api/manage/route.ts` is in
it.** `saveWhatsappSender` → `api('update_truck', { data: { whatsapp_sender } })` → the allow-list at
`api/manage/route.ts:861` → the column. **Byte-identical.**

---

# PART E — BOUNDARIES

## E1. `git diff --stat`

```
 app/api/webhooks/instagram/route.ts     |  48 ++-
 app/api/webhooks/messenger/route.ts     |  48 ++-
 app/api/webhooks/meta/whatsapp/route.ts | 173 +++++++++--
 docs/reference-manual.md                | 519 +++++++++++++++++++++++++++++++-
```

⚠️ **THE TREE HAS BEEN DIRTY FOR SEVERAL DAYS, so this task's entries are named explicitly:**
`app/api/webhooks/meta/whatsapp/route.ts`, the new
`supabase/migrations/20260816_trucks_phone_number_id.sql` (untracked), and this report.
**`instagram/route.ts` and `messenger/route.ts` are the PREVIOUS task's signature verification;
`docs/reference-manual.md` is the V11.20 update before that.**

**Untouched, counted from the diff by path:**

| Path | Files in the diff |
|---|---|
| `lib/whatsapp-classifier.ts` | **0** |
| `lib/meta-whatsapp.ts` (the sender) | **0** |
| `lib/meta/webhook-signature.ts` (the new gate) | **0** |
| `lib/payments/` | **0** |
| `app/api/webhooks/whatsapp/route.ts` (Twilio) | **0** |

✅ **The signature verification is untouched** — the gate still runs before any of this, and the routing
change sits entirely inside the already-verified branch.

## E2. The Twilio webhook is unchanged

✅ **Confirmed: `app/api/webhooks/whatsapp/route.ts` is not in the diff.** It still routes on
`.eq('whatsapp_sender', toNumber)`, which was always correct. ⚠️ **It is now the only routing path still
keyed on a free-text phone number** — worth knowing, and out of scope.

## E3. What changes for Pizzeria Gusto

**Nothing.** They are **not set up on WhatsApp**, so no Meta delivery arrives for them and neither
lookup ever runs on their behalf. Their `whatsapp_sender` value is untouched, the "Connect" field saves
exactly as before, and the number still renders in confirmation emails through `formatConfirmationEmail`
as it always has. 🔴 **No money path, no order path, no operator screen and no customer surface is in
this diff.** ⚠️ **The one thing that is now true and was not: their `whatsapp_sender` holds a value that
is probably a tester's mobile — flagged at C4, not changed.**

---

# PART F — INTEGRITY

## F1 / F2. Non-ASCII census, side by side

| File | bytes | classes before → after | Gained | Lost |
|---|---|---|---|---|
| `app/api/webhooks/meta/whatsapp/route.ts` | 10,050 → 13,891 | **2 → 2** | **NONE** | **NONE** |
| `supabase/migrations/20260816_trucks_phone_number_id.sql` | — → 3,870 | **new file, 4** | n/a | n/a |

**Every difference explained:**

- **The route** — the only delta is **U+2014 EM DASH, 9 → 19 (+10)**. **U+2192 RIGHTWARDS ARROW is
  unchanged at 3.** No new class.
- **The migration** — a new file with no baseline; 4 classes (U+2014, U+26A0, U+FE0F, U+1F534), matching
  the house style of the other migrations in that directory.

### 🔴 THE BRIEF'S WARNING WAS EARNED, AND IT CAUGHT ME AGAIN

**F2 says "three tasks in a row have introduced glyph classes into files that had none — check before
asserting." It was four.** My first draft of the routing comment opened with a box-drawing section rule,
and the after-census reported **U+2500 gained, 0 → 27**, on the file the warning was about.
**I replaced it with an ASCII rule and re-ran the census.**

**READ, as committed:**

```
    // ---- THE TRUCK LOOKUP: MATCHED ON THE NUMBER THE CUSTOMER MESSAGED *TO* ----
```

⚠️ **The failure mode is always the same: the house comment style is muscle memory, and the files that
need protecting are exactly the ones where that style has never been used.** ✅ **The check caught it
both times, which is the argument for running it before asserting rather than after.**

## F3. Carrier-aware variation-selector check

🔴 Carriers read from **what actually precedes each U+FE0F**, never from a Unicode-category filter — a
`category == 'So'` filter silently misses bases such as U+2139 INFORMATION SOURCE (category `Ll`).

| File | U+26A0 (n / paired / bare) | sum(carriers) = total U+FE0F |
|---|---|---|
| `app/api/webhooks/meta/whatsapp/route.ts` | 0 / 0 / 0 | 0 = 0 ✅ |
| `supabase/migrations/20260816_trucks_phone_number_id.sql` | 3 / 3 / **0** | 3 = 3 ✅ |

✅ **Every warning sign in the migration is paired; the route contains none at all.**

**This report, measured after writing, not predicted:**

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+1F534 LARGE RED CIRCLE | 33 | 0 | 33 |
| U+26A0 WARNING SIGN | 28 | 28 | **0** |
| U+2705 WHITE HEAVY CHECK MARK | 25 | 0 | 25 |
| U+2500 / U+251C / U+2514 / U+2502 BOX DRAWINGS | 16 | 0 | 16 |
| U+274C CROSS MARK | 5 | 0 | 5 |

**Sum of per-base paired = 28 = total U+FE0F count = 28** — every selector has a named carrier, no
orphan, no double-count, **zero bare warning signs**. Bare is correct for the rest: three are
emoji-presentation-by-default, and ⚠️ **the sixteen box-drawing characters are the payload TREE drawn in
A3 and are not emoji at all** — flagging them as unpaired would be exactly the false positive this
method exists to prevent.

## F4. Byte scan of every edited file — byte-level, never grep

Both scanned for NUL, every control byte below 0x09, the 0x0B/0x0C pair, 0x0E-0x1F and 0x7F.
**Offending: 0 in both. CRLF: 0. Lone CR: 0.**

## F5. Byte scan of this report

Separate pass after writing: **30,651 bytes scanned, offending = 0** — no NUL, no control byte
below 0x09, no CRLF, no lone CR.

## F6. `git status` and `git diff --stat`

`git diff --stat` is at E1. **THIS TASK: `app/api/webhooks/meta/whatsapp/route.ts`, the new migration
file, and this report.** ⚠️ Everything else predates it. **Nothing staged, branch still `main`.**

---

# PART G — WHAT YOU MUST DO

## 1. 🔴 THE ORDER: SQL FIRST, THEN DEPLOY

**Not the reverse, and not simultaneously.**

1. **Run `supabase/migrations/20260816_trucks_phone_number_id.sql` in Supabase.** ✅ Inert against the
   currently-deployed code — nothing reads the column yet.
2. **Then deploy.**

🔴 **If you deploy first, the webhook's named select asks for a column that does not exist, PostgREST
raises 42703, and every delivery drops with `NO TRUCK` until the SQL runs.** ⚠️ **Safe in the sense that
nothing goes to the wrong truck — but the webhook is down.**

## 2. Where to find `phone_number_id` in Meta's dashboard

⚠️ **INFERRED — the console changes, so read the screen rather than this description (§35, P15):**

1. **developers.facebook.com** → **My Apps** → your app.
2. **WhatsApp → API Setup** (some accounts label it **Getting Started** or **Configuration**).
3. The **"From"** section lists the business phone number with a **`Phone number ID`** beneath it — a
   numeric string, distinct from the phone number itself.
4. Copy the **ID**, not the number.

**Then set it by hand — there is no UI (D1):**

```sql
update trucks set phone_number_id = '<the id you copied>' where slug = '<the truck slug>';
```

⚠️ **Paste the ID, not the display number.** If you paste the phone number, the primary lookup will
never match and every delivery will fall through to the fallback — which will still route correctly and
will say so in the log, so it fails visibly rather than silently.

## 3. 🔴 How to prove routing works with ONE truck

**This is the sharp part of the brief, and it is right: a single-truck test is exactly what hid the
defect.** ⚠️ **A message arriving and being answered proves nothing on its own.** Three tests, and the
second is the one that actually distinguishes the fix.

### Test 1 — the happy path (necessary, not sufficient)

Message the business number from a phone. **PASS:** a reply arrives, and the log reads
`inbound for phone_number_id: <id>` with **no** `FALLBACK` and **no** `NO TRUCK` line.
🔴 **This alone does NOT prove the fix** — it is what passed before.

### Test 2 — 🔴 THE DISCRIMINATING TEST: message from a number that is NOT in `whatsapp_sender`

**Use a phone whose number is nowhere in the `trucks` table** — a colleague's, a second SIM.

- ✅ **PASS: a reply still arrives.** 🔴 **THIS IS THE PROOF.** Under the old code this message would
  have found **no truck** and been dropped, because the customer's number was the lookup key. **A reply
  to a stranger's number is only possible if routing is now keyed on the business number.**
- 🔴 **FAIL: no reply, and `NO TRUCK for phone_number_id=…` in the log** → the column is not set, or the
  ID is wrong. **The log line names the value to fix.**

⚠️ **If the tester's own mobile is still sitting in `whatsapp_sender`, Test 1 and Test 2 are the same
test. Use a different phone — that is the entire point.**

### Test 3 — prove the fallback is retired

After setting `phone_number_id`, repeat Test 2 and check the log for
`routed by whatsapp_sender FALLBACK`.

- ✅ **PASS: the line is ABSENT** → the primary lookup matched and the bridge is unused.
- ⚠️ **Present** → routing works, but via `whatsapp_sender`. **The ID is missing or wrong; fix it, then
  the fallback can eventually be deleted.**

### A note on the two-truck case, which you cannot test with one truck

⚠️ **INFERRED, and it is why the unique index exists rather than a comment:** with two trucks the guard
is `trucks_phone_number_id_key`, which makes a collision a database error at write time rather than a
misrouted message at read time. **You cannot observe that with one truck — but you also cannot break it
with one truck, and the constraint will refuse the mistake whenever a second truck is onboarded.**

🔴 **FINALLY: none of this makes WhatsApp WORK for a truck.** Onboarding — the WABA, the number, the
display-name review, Embedded Signup — is still absent, and `docs/whatsapp-onboarding-report.md` Part F
is the list. **This task removes a defect that would have made onboarding fail for a reason unrelated to
onboarding.**
