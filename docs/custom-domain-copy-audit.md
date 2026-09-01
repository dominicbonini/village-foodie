# The custom-domain wizard — every screen, every word

**WHICH OF THE THREE I PERFORMED: A PARSE.** No typecheck, no execution. This is a read: every string
below is quoted from a file on disk, untidied. **Nothing was run, nothing was rendered, and no file was
changed except this report.**

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

⚠️ **ONE SCOPE NOTE.** You listed *"the waiting state"* among the states to include. **It is not a
wizard screen** — it is a banner on the Manage page, rendered from `notificationCopy()`. I have included
it in §7, marked as outside the wizard, rather than silently omit it or pretend it is a step.

**Total operator-visible words across the flow: 548.**

---

## THE STEP MACHINE

`type Step = 'idle' | 'address' | 'record' | 'email'` — `CustomDomainSetup.tsx:35`.

| Step | What puts the operator on it | Renders anything? |
|---|---|---|
| `idle` | Seeded on open when `props.customDomain` exists (`:242`), while the resume fetch runs | 🔴 **NO — see §6** |
| `address` | Seeded on open when there is **no** stored domain (`:242`) | Yes |
| `record` | `setStep('record')` after provisioning (`:159`) or after a successful resume (`:123`) | Yes, if `rows` is loaded |
| `email` | 🔴 **Declared in the type and never set.** No `setStep('email')` exists | Never |

The wizard also has two surfaces that are not steps: the **card** in Settings (always rendered when the
plan allows) and the **confirm block** on that card (`props.verifiedAt && !confirmed`).

---

## 1. THE CARD — always visible in Settings

**Condition:** `canAccess(plan,'embed_schedule',…)` and not a demo truck. **Words: 20.**

```
Add your schedule to your website
Show where you are trading next, on your own website.
[Live]                                    ← only when props.verifiedAt
[Set up]                                  ← when props.customDomain is null
[Continue]                                ← when props.customDomain is set
```

**Decision:** whether to start (or resume) setting this up. One button.

**Not serving that decision:** nothing. ⚠️ The `Live` badge is status rather than decision, but it is
the only thing telling an operator the feature is already done.

---

## 2. ADDRESS — the truck HAS a website on file

**Condition:** `step === 'address'` and `domainFromWebsite(props.website)` returns a domain.
**Words: 117.**

```
You get a new web address for your schedule. It is your own address with a word in front.

Your website today
www.yourtruck.com                          ← their real domain when we hold one

Your new schedule address
events.yourtruck.com

Your website does not change at all. It carries on exactly as it is, and you add a link to
the new address from it. We keep the schedule page up to date for you.

Your schedule sits at your own address. When a customer taps Order, we take them to
HatchGrab to pay — that part stays with us, so card details are always handled on our side.

We will set up events.yourtruck.com for you. Your website keeps working exactly as it does now.

[Checking…] / [Continue]                   ← label depends on `busy`
Not now
```

**Decision:** confirm the address and continue. There is nothing to type.

**Not serving that decision:**
- 🔴 **"Your website does not change at all…"** and **"Your website keeps working exactly as it does
  now"** are the same reassurance twice, 60 words apart, on a screen with one button.
- ⚠️ **The ordering paragraph is the only thing on the screen an operator could act on** — it might
  change their mind — but it is styled as the smallest text in the box.

---

## 3. ADDRESS — NO website on file

**Condition:** `step === 'address'` and `domainFromWebsite(props.website)` returns null. **Words: 129.**

Identical to §2 down to the ordering paragraph, then instead of the confirmation line:

```
What is your web address?
The one people already use to find you. We do not have it on file.

[events.] [ yourtruck.com            ]     ← "events." is fixed text; the box is the input
                                              placeholder: yourtruck.com
                                              aria-label: Your own web address

Your schedule will be at events.…          ← "events.…" until they type

[Checking…] / [Continue]
Not now
```

**Decision:** type their own web address, then continue. **Two decisions if you count confirming the
result** — see §9.

**Not serving that decision:** ⚠️ **The example block above still shows `www.yourtruck.com` and
`events.yourtruck.com`**, because `fixedDomain` is null and both fall back to the placeholder. **So the
screen shows the example address twice and the operator's own nowhere**, until they type.

---

## 4. ADDRESS — after pre-flight (the warning states)

**Condition:** `pre` is set — i.e. `runPreflight` returned `ok`. All four blocks are independent; **more
than one can show at once.** **Words: 126 with all four visible.**

```
                                           ← CAA restricted
Your domain has a rule that limits who can issue its security certificates, and we
are not on the list. Setting this up will still work, but the padlock will not
appear until whoever looks after your domain adds us. Send them the message below
and mention it.

                                           ← CAA blocked
Your domain currently blocks all security certificates. Whoever looks after it will
need to change that before this can work.

                                           ← already_elsewhere
Something already answers on that address. Whoever looks after your web address will need to
point it at us — send them the message on the next screen and they will know what to do.

                                           ← provider detected
Your domain is looked after by Cloudflare. We will show you exactly where to go.

[Setting up…] / [Set up this address]
Not now
```

**Decision:** go ahead, or stop. **The button changes from `Continue` to `Set up this address`.**

**Not serving that decision:**
- 🔴 **"Send them the message below and mention it"** — there is **no message below**. The email is on
  the *next* screen. The `already_elsewhere` block gets this right ("on the next screen"); the CAA one
  does not.
- ⚠️ The provider line is confirmation, not decision.

---

## 5. RECORD

**Condition:** `step === 'record' && rows`. **Words: 84.**

```
Go to Cloudflare                           ← when a provider was detected
Open Cloudflare                            ← a link, opens in a new tab
Go to whoever looks after your domain      ← when no provider was detected

Add this, and save.

TYPE     Choose this from the list.            CNAME                  [Copy] / [Copied ✓]
NAME     Just this word, not the whole address. events                [Copy] / [Copied ✓]
VALUE    Copy this exactly.                     cname.vercel-dns.com  [Copy] / [Copied ✓]
         ↑ labels come from the provider record and vary by provider

It usually starts working within an hour, though it can take longer. You do not need to
keep this page open.

Someone else looks after your domain? We will send them this, with the reason.
[ their email address        ] [Sending…] / [Send it]
Sent to <address>                          ← replaces the field once sent

[Done]
```

**Decision:** add the record — or hand it to someone who can.

**Not serving that decision:** ⚠️ **`Done` does not mean done.** It closes the wizard; nothing has been
verified at that point. It is the only button on the screen and it sits below an email form.

---

## 6. 🔴 IDLE — A STEP THAT RENDERS NOTHING

**Condition:** `step === 'idle'`, which is what the open button seeds whenever `props.customDomain`
exists (`:242`). The resume effect then moves it to `'record'` — **unless it returns early:**

```ts
        const d = await call('domain_status')
        if (cancelled || !d.address || !d.cname_target) return
```

🔴 **NO STEP MATCHES `'idle'`, SO THE MODAL RENDERS AN EMPTY PANEL. Words: 0.**

**Decision:** none available. **Everything on the screen — which is nothing — fails to serve it.**

⚠️ **This is reachable today**: `cname_target` comes from `getDomainConfig`, which needs the Vercel
credentials, and none is set. Recorded in `docs/custom-domain-modal-report.md` §1.

---

## 7. STATES OUTSIDE THE WIZARD

### 7a. The confirm block — on the card, not a step

**Condition:** `props.verifiedAt && !confirmed`. **Words: 72.**

```
Have a look, then tell us it is right
1. Open your address and let the page load.
2. Check the events shown are yours.
3. Check the dates and times look right.
This changes nothing on your page. It just tells us a person has looked.
[Yes, it looks right]
Something not right? Email hello@hatchgrab.com and tell us what you are seeing — it helps
to say what address you opened and what appeared.
```

**Decision:** confirm they have looked. **Not serving it:** nothing — this screen is tight.

### 7b. The waiting / live banner — Manage page, NOT the wizard

From `notificationCopy()`, `lib/custom-domain/copy.ts:99-116`:

```
WAITING title: events.yourtruck.com is not working yet
WAITING body (with a start date):
  You started setting this up on 14 August and it has not started working. If you added the
  line we gave you, it may still be on its way. If someone else was adding it for you, it is
  worth checking they did.
WAITING body (no start date):
  It has not started working yet. If you added the line we gave you, it may still be on its
  way. If someone else was adding it for you, it is worth checking they did.

READY title: events.yourtruck.com is live
READY body:  Have a look at it, then tell us it is right in your settings.
```

---

## 8. EVERY ERROR THE OPERATOR CAN BE SHOWN

All render identically: `<p className="mt-3 text-sm text-red-600">{error}</p>`, at the top of the modal.

**From the client-side apex guard** (`lib/custom-domain/apex.ts`) — ⚠️ **unreachable from the interface
now that the prefix is fixed, but still wired:**

```
Type the address you would like to use.
That does not look like a web address.
We could not read that as a web address. Check the spelling and try again.
{host} is your whole website address. If you point that at us, your website is replaced by
this page. Put a word in front of it instead — for example schedule.{host}.
That address has too many parts. Something like schedule.{domain} works best.
```

**From the server** (`app/api/manage/route.ts`):

```
{host} is usually where your existing website already lives. If you point that at us, your
website is replaced by this page. Use a different word in front, like schedule.
{host} is your whole website address. If you point that at us, your website is replaced by
this page. Put a word in front of it instead.
```

**From the hosting API** (`lib/custom-domain/vercel.ts`):

```
VERCEL_PROJECT_ID is not set                  ← 🔴 a variable name, on an operator's screen
VERCEL_API_TOKEN is not set                   ← 🔴 the same, via a thrown error
That address is already in use somewhere else.
We were not allowed to add that address.
The address could not be added just now.
```

**Component fallbacks, only reached when `message` is empty:**

```
That address will not work.
That address could not be set up.
Could not set that up
Could not copy — select the writing and copy it yourself.
Could not send
Could not save
```

🔴 **THREE OF THESE MENTION "schedule" AS THE EXAMPLE WORD, AND THE PREFIX IS NOW `events`.** The apex
message, the `too_deep` message and the server `www` message all suggest `schedule.…`.

---

## 9. ACROSS THE WHOLE FLOW

### Facts stated on more than one screen

| Fact | Where |
|---|---|
| **Their website is unaffected** | ADDRESS: *"Your website does not change at all…"* · ADDRESS: *"Your website keeps working exactly as it does now"* · ADDRESS: *"Your schedule sits at your own address"* — **three times on one screen** |
| **The new address** | ADDRESS example block · ADDRESS confirmation line · ADDRESS "Your schedule will be at" (no-website) · RECORD `NAME` row · WAITING banner title · READY banner title |
| **Someone else may look after the domain** | ADDRESS `already_elsewhere` warning · ADDRESS CAA warning · RECORD *"Go to whoever looks after your domain"* · RECORD *"Someone else looks after your domain?"* · WAITING banner body |
| **It takes about an hour** | RECORD `TIMING_LINE` · WAITING banner body (*"may still be on its way"*) |
| **Have a look and tell us it is right** | CONFIRM block heading and checklist · READY banner body · the go-live email |
| **The word in front is `events`** | ADDRESS example · ADDRESS confirmation · ADDRESS no-website prefix chip · ADDRESS "will be at" · RECORD `NAME` value |

### Screens carrying more than one decision

| Screen | Decisions |
|---|---|
| **ADDRESS, no website** | (1) type their web address (2) confirm the assembled result (3) continue or "Not now" |
| **ADDRESS, after pre-flight** | (1) read up to three warnings and judge whether to proceed (2) provision (3) "Not now" — 🔴 **and one warning tells them to act on the NEXT screen** |
| **RECORD** | (1) add the record themselves (2) email it to someone else (3) press Done — 🔴 **three, and "Done" is ambiguous against the other two** |

### Buttons whose label needs the body text to make sense

| Button | Why |
|---|---|
| 🔴 **`Continue`** (ADDRESS, before pre-flight) | Continue to *what*? Nothing on screen says a check runs next. It becomes `Checking…` only after the press |
| 🔴 **`Done`** (RECORD) | Nothing is done — the record may not be added, and verification has not happened. It reads as completion |
| ⚠️ **`Set up this address`** (ADDRESS, after pre-flight) | Self-contained, **but only if the warnings above have been read** — it is the same button position that said `Continue` a moment earlier |
| ⚠️ **`Send it`** (RECORD) | "It" is the record details, named only in the sentence above |
| ⚠️ **`Continue`** (CARD, resuming) | Continue *where*? The card gives no indication of how far they got |
| ✅ `Set up`, `Copy`, `Yes, it looks right`, `Not now` | Stand alone |

---

## 10. WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING WAS RENDERED.** Every screen above is assembled from source. **No page was loaded**, so
   what an operator actually sees — including which conditional blocks appear together in practice — is
   not observed.
2. **Word counts are of the strings as written**, with one representative value substituted for each
   variable (`events.yourtruck.com`, `Cloudflare`, `cname.vercel-dns.com`). Real values differ in
   length; the provider's own record labels replace `Type` / `Name` / `Value` and are not enumerated
   here for all ten providers.
3. **The `email` step is declared and never set** — I searched for `setStep('email')` and found none.
   If something reaches it by another route, I did not find it.
4. **I did not audit the two emails** (`instructionsEmail`, `liveEmail`) beyond the fragments quoted;
   they are operator- and third-party-facing copy in the same flow and would add to the totals.
5. **The provider-specific record labels and dashboard URLs** live in `DNS_PROVIDERS` and were not
   enumerated.
6. **No rewriting, no proposals** — as instructed.
