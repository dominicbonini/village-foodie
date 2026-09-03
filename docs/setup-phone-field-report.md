# /setup — the contact phone field

**GARBLED SPANS: none. No instruction contradicted another.**

One file changed: `app/setup/page.tsx`.
**Nothing committed, nothing deployed. No SQL, no migrations, no credentials.**
No redirect changed, the demo modal untouched, neither route removed — item 9.

---

## 1. The field

Added `contact_phone`, sent with `create_truck`. **The server is untouched** — it already required the
field (`app/api/setup/route.ts:70-72`), already validated UK format (`:74`) and already wrote it.
The only thing missing was somewhere to type it.

The body the page now posts, **captured from the live outgoing request**, not read from source:

```json
{"action":"create_truck","name":"Test Truck","contact_phone":"07700 900123","phone_is_whatsapp":true}
```

🟢 **That is key-for-key identical to what the demo modal posts** (`DemoGetStarted.tsx:536-541`:
`action`, `name`, `contact_phone`, `phone_is_whatsapp`). The two paths now hand the server the same
shape — which matters more than any argument I could make, because the demo path is the one known to
complete in production.

`contact_email` is still deliberately omitted so the server's fallback to `operator.email` keeps working.

---

## 2. `phone_is_whatsapp` — what I used

**A checkbox with the demo modal's exact wording: `This number is on WhatsApp`.**

Copied rather than invented, along with the rest of the control: `type="tel"`, `autoComplete="tel"`,
placeholder `07700 900123`, red border on error, tick directly beneath the input.

⚠️ **Sent because the truck is wrong without it, not for completeness.** `provisionTruck` derives
**both** `whatsapp` and `preferred_contact_method` during the insert
(`lib/provision-truck.ts:430-436`):

```
whatsapp: contactPhone ?? ''
preferred_contact_method: contactPhone ? (phoneIsWhatsapp ? 'whatsapp' : 'phone') : null
```

Omit the tick and a `/setup` truck would still get a method — `'phone'` — but never `'whatsapp'`, so a
WhatsApp-first operator arriving this way could not be reached the way they asked.

### 🔴 A correction I had to make to my own copy, recorded because it was nearly shipped

My first draft of the helper line under the field read *"It isn't shown to customers unless you choose
to share it in Settings."* **That is false, and I only found out by checking.**

`preferred_contact_method` is non-null from creation, and `lib/email.ts:328-360` renders a
**"Questions about your order?"** block on the **customer's** order email:

- method `'phone'` → `Call us: 07700 900123`
- method `'whatsapp'` → `WhatsApp us: 07700 900123 →`, linked to `wa.me/447700900123`

**The number is customer-facing from the first order.** The shipped copy now says so:

> Customers see this on their order confirmation so they can ask about an order. The tick decides
> whether that reads "Call us" or "WhatsApp us". You can change both in Settings.

⚠️ **The demo modal's phone field carries no helper text at all**, so that path collects the same
customer-facing number while saying nothing about it. Not changed — item 9 — but worth knowing the
two now differ in the operator's favour on `/setup`.

---

## 3. 🔴 First and last name — what it costs to leave them out

**Not added, as instructed. Here is the actual cost, which is worse than "no personalisation".**

### What the emails say today on this path — and it is not "Hi there,"

The brief assumed a null `first_name` means the greeting falls back. **It does not.** The chain is:

1. `/api/signup:132` — `const operatorName = [firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0]`
   → with no names sent, `operators.name` becomes **the email's local part**.
2. `/api/signup:225` — `firstName: firstName ?? firstNameFrom(operatorName)`
   → `firstNameFrom` returns the first whitespace-separated word, so it returns **the local part**.
3. `GREETING_FALLBACK = 'there'` is therefore **never reached** — it is only used when `name` is empty too.

So for `dominicbonini@hotmail.com`, the two operator emails currently read:

| | Rendered today on the /setup path |
|---|---|
| **Verification email** — body (`email-signup.ts:139`) | **`Hi dominicbonini,`** |
| **Welcome email** — body (`:205`) | **`Hi dominicbonini,`** |
| **Welcome email** — subject (`:186`) | **`Welcome to HatchGrab, dominicbonini`** |

An address like `info@`, `sales@` or `bookings@` — common for a trading business — produces
**"Hi info,"** and **"Welcome to HatchGrab, info"**.

### The cost, stated plainly

| | |
|---|---|
| 🔴 **Two emails address the operator by their email prefix** | Not neutral — it reads like a mail-merge that failed, in the first two messages they get from us |
| ⚠️ `operators.name` is the local part, permanently | Read by `/api/auth/me`, the admin console, the Team tab and `truck_users` (`/api/signup:127-131`). So the admin console lists them as `dominicbonini`, not a person |
| ⚠️ `first_name` / `last_name` stay null | Any later personalisation has nothing to read; a backfill would need them to be asked again |
| 🟢 **Nothing is blocked** | No route, gate or email fails. This is quality, not function |
| 🟢 **Recoverable** | `/api/auth/update-profile` accepts all three and Manage can set them |

**My read: two fields on this form would close it, and the demo path already asks for them.** But it is
your call and I have not added them.

---

## 4. Validation — matched, with one difference reported

The two checks are **copied verbatim** from `DemoGetStarted.tsx:432-433`, in the same order:

```
if (!contactPhone.trim()) → 'Add a phone number — customers and we both use it to reach you.'
else if (!isValidUKPhone(contactPhone)) → 'Enter a valid UK phone number (e.g. 07700 900123).'
```

🟢 **The second string is also the server's, word for word** (`api/setup/route.ts:75`).
🟢 **One rule, three callers** — `lib/contact-validation.ts` `isValidUKPhone` is imported by this page,
the demo modal (`:53`) and the server (`:13`). **The form cannot accept a number the server refuses.**

### What each accepts — executed against the shared function, not inferred

| Input | Accepted |
|---|---|
| `07700 900123` | ✅ |
| `+447700900123` | ✅ |
| `447700900123` | ✅ |
| `07700-900-123` | ✅ |
| `(07700) 900123` | ✅ |
| `07700 900123 ext 4` | ✅ (digits are stripped before testing — deliberately permissive) |
| `0770090012` | ✅ |
| `12345` · `abc` · `''` · `077009001234567` | ❌ |

**Identical on both paths, because it is literally the same function.**

### Exercised in a browser

| Case | Result |
|---|---|
| Empty phone → Continue | `Add a phone number — customers and we both use it to reach you.`, red border, **0 requests sent** |
| `12345` → Continue | `Enter a valid UK phone number (e.g. 07700 900123).`, red border, **0 requests sent** |
| Valid + tick → Continue | correct body posted; server error rendered verbatim (`Not signed in`, anonymous) |

🟢 **Validation runs before any state flip or write**, exactly as `runSetup()` does — the button never
spins on a request already known to be refused.

### ⚠️ The one remaining difference

**`/setup` disables Continue until the truck name is ≥ 2 characters; the demo modal disables nothing and
validates everything on click.** That disable is pre-existing behaviour on this page and I did not
remove it — outside what was asked. The consequence: someone who fills in the phone but not the name
sees a dead button with no explanation, where the demo would tell them. **One line to align if you want
it; say so.**

Also, `required` is deliberately **not** set on the phone input: the native browser bubble would fire
first and show *the browser's* wording instead of ours, so the two paths would say different things
about the same empty field.

---

## 5. 🔴 The 409 copy, verbatim

**Server** — `app/api/signup/route.ts:113-114`:

> **There's already an account with that email — sign in instead.**

(curly apostrophe U+2019, em dash U+2014, `existing: true`, HTTP 409)

**Rendered**, at both sites (`DemoGetStarted.tsx:915` and `:1057`), as that sentence followed by a
space and an underlined bold link reading **`Sign in`** → `/login`. In full, as the operator sees it:

> **There's already an account with that email — sign in instead. Sign in**

### Does it read as an error or a recognition?

**The words are a RECOGNITION and they are the right shape.** It names what happened ("you already have
an account"), it is specific, and it says what to do next ("sign in instead") with a working link. It is
not "something went wrong". The server's own comment defends the choice deliberately — leaking that the
address is registered, because *"the alternative punishes the far commoner case of someone who forgot
they already have an account."* **I would not rewrite the sentence.**

🔴 **But the PRESENTATION contradicts the words, and at one of the two sites it contradicts them
loudly.** At `:915` the message renders inside the progress list, under a **red ✕** marked
`aria-label="failed"`, with the row label styled `text-red-600 font-semibold`, and the message itself in
`text-red-600`. **A recognition is being presented as a failed step.** At `:1057` it is red body text —
milder, but still an error colour.

⚠️ **There is also a small redundancy**: the sentence ends "…sign in instead." and is immediately
followed by a separate link reading "Sign in", so it reads "sign in instead. Sign in".

### Proposed changes, for your approval — I have changed nothing

| | Proposal |
|---|---|
| **Copy** | Keep the sentence as it is; it is already right. Optionally drop the trailing clause so the link is not doubled: **"There's already an account with that email."** followed by the **`Sign in`** link |
| **Presentation** (the substantive fix) | Render the `existing` case in the **neutral/informational** style rather than the error style — no red ✕, no `aria-label="failed"`, no `text-red-600`. A person who already has an account has not failed at anything |
| **Optional** | Make the link carry them onward: `/login?next=/setup`. ⚠️ This only helps **now that `/setup` works** — before today it would have been a link into a dead end |

---

## 6. 🔴 Does the loop close? Partly verified, and I am saying exactly where the line is

**The honest answer: the client half of the loop is verified by execution; the authenticated half is
verified by reading, and I could not execute it.**

⚠️ **Why not.** The dev server is pointed at a **hosted Supabase project**, not a local one (checked the
env host; no secret printed). Walking the whole path needs a real account, which means writing a real
auth user and `operators` row into your live database, sending a real verification email, and
permanently consuming an email address. **The brief did not authorise creating accounts and I did not
create one.** No test data was written anywhere.

| Step | Verified how |
|---|---|
| 1. Demo modal → 409 on an existing email | 📖 **Read.** Requires provisioning a real demo truck to reach the claim form. Copy quoted verbatim in §5 from all three sites |
| 2. Click **Sign in** → `/login` | 📖 Read — a plain `<a href="/login">` at `:915`/`:1057` |
| 3. Log in, no truck → `/setup` | 📖 Read — `post-login:90` returns `{redirect:'/setup'}`, consumed at `login/page.tsx:66` |
| 4. `/setup` renders the form | ✅ **EXECUTED.** Loaded in a browser; heading, both inputs, the tick and the helper line all render; no page errors |
| 5. Fill name + phone, validation | ✅ **EXECUTED.** Both messages, both error borders, 0 premature requests, all five accepted formats |
| 6. Submit → correct body | ✅ **EXECUTED.** Body captured off the wire, key-for-key identical to the demo modal's |
| 7. Server creates the truck | 📖 **Read** — `route.ts:87-117`. Anonymously it returns 401 and writes nothing, which is what I exercised |
| 8. → `/manage/<token>?import=demo` | ✅ **EXECUTED** via the pass-through test (§7) — the same `router` navigation to the same URL shape |

### What this does and does not let me claim

🟢 **What I can say with confidence:** the step that was broken is fixed. The form now collects the one
field the server required, validates it with the server's own function, and posts a body **identical to
the one the working demo path posts**. Every failure mode I could reach, I reached.

🔴 **What I will not claim:** that I watched a real operator get a real truck through this form. **I did
not.** Step 7 is read, not run. If you want that link executed, it needs a throwaway account against
this database and your say-so.

---

## 7. 🟢 The pass-through still works — an operator with a truck never sees the form

**Verified by execution.** The mount effect's only input is `/api/setup?check=truck`, so I stubbed that
response to return a truck — reproducing exactly the state `post-login:98` creates — and sampled the DOM
every 50ms through the first second:

```
form (name or phone input) EVER rendered: false
spinner shown while checking:            true
navigations: ["/setup", "/setup", "/manage/tok_passthrough_test?import=demo"]
final url path: /manage/tok_passthrough_test
```

🟢 **The form never rendered — not for a frame.** Adding the field did not disturb it, and structurally
it cannot: both new inputs sit inside the same `if (checking) return <spinner/>` guard that already
protected the name field, and `checking` stays `true` through the redirect (`page.tsx:70`, *"stay in
`checking` — the redirect is in flight, never show the form"*).

---

## 8. What the seven redirect sites now do

| # | Site | Trigger | Before | Now |
|---|---|---|---|---|
| 1 | `signup/page.tsx:57` | account just created | 🔴 dead form | 🟢 **completable** |
| 2 | `post-login:90` | login, zero trucks | 🔴 dead form | 🟢 **completable** |
| 3 | `post-login:98` | login, mid-wizard | 🟢 pass-through | 🟢 **pass-through, unchanged (§7)** |
| 4 | `login/page.tsx:66` | consumes 2 and 3 | — | unchanged |
| 5 | `manage/page.tsx:50` | no `operators` row | 🔴 dead form | 🟢 **completable** |
| 6 | `manage/page.tsx:56` | operator, no truck | 🔴 dead form | 🟢 **completable** |
| 7 | `verify-signup:43` | verification email | 🔴 dead form | 🟢 **completable** |
| — | welcome email → `/manage` | `verify-signup:116` | 🔴 → site 6 → dead | 🟢 → site 6 → **completable** |
| — | password reset → `/login` | `reset-password:76` | 🔴 → site 2 → dead | 🟢 → site 2 → **completable** |

**Not one redirect was changed.** All nine became correct because the destination did.

### Arriving fresh — 🟢 closed

Anyone reaching `/setup` from any of the nine routes above can now name their truck, give a phone number
and get a truck. **The state cannot be newly entered.**

### Already stranded — 🟢 closed, with one caveat I cannot verify

Someone with an account and no truck logs in, is sent to `/setup` by site 2 or 6, and **now finds a form
they can complete**. They do not need the demo modal, do not hit the 409, and do not need their email
freed. **The loop that was closed in every direction is open**, at the same URL they were bounced to
all along.

⚠️ **Caveat, stated rather than glossed:** this rests on step 7 of §6, which I read but could not run.
The reasoning is that `create_truck` is unchanged and now receives the same body as the demo path — but
**"identical to a path that works" is an argument, not an observation.** The first real operator through
this form is the proof.

⚠️ **How many people this is, I still do not know.** One query would say — operators with a row and no
truck — and I ran none.

---

## 9. Constraints

| | |
|---|---|
| Redirects changed | 🟢 **none** |
| Demo modal changed | 🟢 **none** — §5 is a proposal only |
| `/setup`, `/signup` removed | 🟢 **no** |
| Server / `/api/setup` changed | 🟢 **no** |
| First / last name added | 🟢 **no** — §3 is a report only |
| SQL, migrations, credentials | 🟢 none |
| Test data written | 🟢 **none** — every exercised call was anonymous or stubbed |
| Protected strings, price mask, `lib/features.ts`, landing gate | 🟢 untouched |

**Nothing committed. Nothing deployed.**

---

## Awaiting your decision

1. **First and last name on this form** (§3) — the emails currently say "Hi dominicbonini,".
2. **The 409 presentation** (§5) — the words are right, the red ✕ is not.
3. **The Continue-button difference** (§4) — one line to align with the demo.
4. **Whether to execute step 7** against a throwaway account on the live database.
