# Read-only diagnostic — buzzers, demo arrival, phone, wizard re-entry, stepper, discount codes

**Date:** 4 August 2026
**Nothing was changed.** No migration written, no SQL run, `next dev` / `next build` not run.
Every SQL block below is for you to run by hand.

---

## PREMISES THAT ARE WRONG — flagged, not repaired

Four, one of them structural.

1. **🔴 R2's premise. The QR banner is not on the customer order page.** It is
   [components/dashboard/DemoWelcome.tsx](components/dashboard/DemoWelcome.tsx), a full-screen modal
   mounted on the **operator's demo dashboard**
   ([app/dashboard/[token]/page.tsx:2313](app/dashboard/[token]/page.tsx#L2313)). The customer order
   page (`app/trucks/[slug]/order/page.tsx`) contains **no QR code and no welcome banner of any kind** —
   `grep` for `QR|qrcode|generateQR|welcome` across `app/trucks/` returns nothing. R2 is answered below
   about the component that actually exists.

2. **🔴 R6a's premise ("I expect none").** Refuted twice. A **customer order** discount system is
   fully live (`discount_codes_db`, `orders.discount_code`, `orders.discount_amt`), and a
   **subscription** discount already exists on trucks (`lifetime_discount_pct`,
   `lifetime_discount_note`). Neither is a *signup* code, so the underlying intent survives — but the
   concept, the vocabulary and a per-truck code table are all already here. Detail in R6a.

3. **R5's premise.** A step indicator already exists, and it is already data-driven from a single
   array. R5c's "how hard would it be" is answered by "it is already done".

4. **The context paragraph.** The gate that makes "no real operator can reach any of it" true is the
   **server-side** `SIGNUP_PUBLIC` ([app/api/signup/route.ts:54](app/api/signup/route.ts#L54)), not
   `NEXT_PUBLIC_SIGNUP_PUBLIC`. The `NEXT_PUBLIC_` variant exists
   ([components/DemoGetStarted.tsx:308](components/DemoGetStarted.tsx#L308)) but only decides which
   client path renders. Also note `canSetup` is `(NEXT_PUBLIC_SIGNUP_PUBLIC === 'true' || isAdmin)` —
   **an admin session opens the path with the flag unset**, which is exactly how you have been testing.
   The conclusion holds; the named variable does not.

No garbled spans in the prompt.

---

## R1. BUZZERS

### (a) The two settings, named precisely

They are different columns on different tables with different scopes.

| | **The pool** | **The prompt** |
|---|---|---|
| Column | `truck_vans.buzzer_count` | `truck_events.buzzer_prompt` |
| Type | `smallint null` | `boolean null` |
| Scope | **per van** | **per event** |
| Meaning | `null` = this van hands out no buzzers; the whole feature is hidden. `1..30` = numbered `1..buzzer_count`. | Whether the operator is **prompted** after placing an order. `null` = inherit. |
| Migration | [supabase/migrations/20260803_buzzer_settings.sql:39](supabase/migrations/20260803_buzzer_settings.sql#L39) | [supabase/migrations/20260803_buzzer_settings.sql:63](supabase/migrations/20260803_buzzer_settings.sql#L63) |
| Written by | Manage → van settings, `update_van_settings` ([app/api/manage/route.ts:989](app/api/manage/route.ts#L989)); UI at [app/manage/[token]/page.tsx:8363](app/manage/[token]/page.tsx#L8363) | Dashboard only, `set_buzzer_prompt_override` ([app/api/dashboard/action/route.ts:1568](app/api/dashboard/action/route.ts#L1568)) |
| Read into the app | `get_vans` + `/api/dashboard` named selects ([app/api/dashboard/route.ts:401](app/api/dashboard/route.ts#L401)) | `/api/dashboard` events select ([app/api/dashboard/route.ts:133](app/api/dashboard/route.ts#L133)) |

**Resolution is one function and only one** — `resolveBuzzerPrompt`,
[lib/buzzer.ts:83-90](lib/buzzer.ts#L83-L90):

```
buzzerCount = van.buzzer_count ?? null
if (buzzerCount == null) → { buzzerCount: null, buzzerPrompt: false }
else                     → { buzzerCount,       buzzerPrompt: event.buzzer_prompt ?? true }
```

So the pool column is the master switch: with `buzzer_count` null the prompt cannot be on whatever the
event says. Called server-side at [app/api/dashboard/route.ts:423](app/api/dashboard/route.ts#L423);
the result ships to the client as `effectiveBuzzerPrompt` and reaches `AddOrderPanel` as
`buzzerPromptEnabled` ([app/dashboard/[token]/page.tsx:2986](app/dashboard/[token]/page.tsx#L2986)).

**The prompt fires** at [components/dashboard/AddOrderPanel.tsx:1059](components/dashboard/AddOrderPanel.tsx#L1059):
`buzzerCount != null && buzzerPromptEnabled && manualBuzzer == null && data?.orderId`.

**Manual assignment is deliberately NOT gated on the prompt** —
[AddOrderPanel.tsx:1164](components/dashboard/AddOrderPanel.tsx#L1164) gates the in-panel picker on
`buzzerCount` alone. Turning the prompt off never removes the ability to assign a buzzer.

Related columns, not settings: `orders.buzzer_number`, `orders.placed_at`, `orders.buzzer_lost_at`.

### (b) What `lib/provision-truck.ts` writes for each — on the demo profile, today

**Neither. Both are left unwritten, so both are NULL.**

* `truck_vans.buzzer_count` — the van insert
  ([lib/provision-truck.ts:346-361](lib/provision-truck.ts#L346-L361)) writes `truck_id`, `name`,
  `active`, `kitchen_capacity` and optionally `capacity_window_mins`. **`buzzer_count` does not appear**,
  and `ProvisionVanOptions` ([lib/provision-truck.ts:124](lib/provision-truck.ts#L124)) has no field for
  it. The column is nullable with no default → **NULL**.
* `truck_events.buzzer_prompt` — provisioning creates no events, and the migration comment records the
  column as "Never seeded, never bulk-written". → **NULL**, i.e. inherit.

**Consequence: a demo truck has buzzers switched off entirely.** `buzzer_count` NULL means
`resolveBuzzerPrompt` short-circuits to `{ null, false }`: no grid, no card chip, no prompt, no
mention of the feature anywhere in the demo. This is identical to the `operator` profile — neither
profile writes it, so it is not a demo-specific decision, just an absent one.

Confirm against production:

```sql
select v.truck_id, t.name, t.plan, v.name as van, v.buzzer_count
from truck_vans v join trucks t on t.id = v.truck_id
where t.id like 'demo-%'
order by t.created_at desc
limit 20;
```

### (c) Is prompt suppression per-truck, per-device or per-event?

**Per-event, with a per-van default. Neither per-truck nor per-device.**

* The override column is on `truck_events`, and `set_buzzer_prompt_override` writes exactly one row:
  `.eq('id', eventId).eq('truck_id', truck.id)`
  ([app/api/dashboard/action/route.ts:1574](app/api/dashboard/action/route.ts#L1574)).
* The dashboard's own comment states the rule
  ([app/dashboard/[token]/page.tsx:1262](app/dashboard/[token]/page.tsx#L1262)): *"PER-EVENT ONLY …
  must NEVER write truck_vans.buzzer_count"*.
* **There is no truck-level column.** The nearest thing to a truck-wide setting is the van default,
  and a truck with several vans can differ van to van.
* **There is no device dimension.** No `localStorage`, no Capacitor `Preferences`, no session key
  anywhere near the buzzer code — grepped. The resolution is computed **server-side** in
  `/api/dashboard`, so every device on the same event agrees by construction.
* Because a new event's `buzzer_prompt` is NULL and inherits, **an override expires by itself** when
  the event ends. There is no persistence beyond the event it was set on.

---

## R2. THE DEMO QR MODAL

Answered about `DemoWelcome`, which is what exists — see premise 1.

### (a) Component, file:line, and the exact render conditions

[components/dashboard/DemoWelcome.tsx](components/dashboard/DemoWelcome.tsx), mounted at
[app/dashboard/[token]/page.tsx:2313](app/dashboard/[token]/page.tsx#L2313):

```
{isDemo && <DemoWelcome token={token} orderUrl={customerOrderUrl} isSample={demoSession?.extraction_source==='template'} />}
```

Four conditions, all of which must hold for the QR image to appear:

1. **`isDemo`** — [app/dashboard/[token]/page.tsx:140](app/dashboard/[token]/page.tsx#L140):
   `token.startsWith('demo-')`. The component is not even mounted otherwise.
2. **Not yet dismissed** — [DemoWelcome.tsx:40-43](components/dashboard/DemoWelcome.tsx#L40-L43): a
   lazy `useState` initialiser reading `localStorage['hg_demo_welcome_<token>'] !== 'seen'`. Per-token,
   per-device, decided before first paint so a dismissed modal never flashes.
3. **`orderUrl` is non-null** — [DemoWelcome.tsx:80](components/dashboard/DemoWelcome.tsx#L80):
   `showQr = !!orderUrl && !qrFailed`. `customerOrderUrl` is
   [app/dashboard/[token]/page.tsx:1058](app/dashboard/[token]/page.tsx#L1058):
   `truck?.slug ? \`${customerUrlBase}/trucks/${truck.slug}/order\` : null`. **No slug ⇒ no QR.**
4. **Generation succeeded** — an effect ([:50-64](components/dashboard/DemoWelcome.tsx#L50-L64))
   dynamically imports `@/lib/generateQRCode` and calls
   `generateQRWithLogo(orderUrl, null, 320, 'Your logo here')` **on open, not on mount**. On throw it
   sets `qrFailed`, which flips condition 3 false. While in flight, a pulsing 160px placeholder renders.

The `isSample` prop only switches the heading between *"Here's a sample truck"* and *"Here's your
menu"*, sourced from `demo_sessions.extraction_source === 'template'`.

### (b) Is the order LINK itself rendered on the banner?

**No — not on the normal path.** The URL appears **only in the fallback branch**,
[DemoWelcome.tsx:144-161](components/dashboard/DemoWelcome.tsx#L144-L161), which renders **only when
`!showQr`** — i.e. no slug, or QR generation failed. That fallback is an orange panel headed *"Your
customer order link"* with the URL in a `truncate`d `<code>` and a Copy button; with no `orderUrl` at
all it degrades further to the text *"Your ordering page link is in the menu, top right."*

So in the ordinary case the visitor sees a 160px QR image and **the URL is nowhere on screen**. The
file header records this as deliberate ([:25-34](components/dashboard/DemoWelcome.tsx#L25-L34)): the
copy-the-link box *"was replaced entirely"* because *"copying a URL and retyping it into a phone
mid-demo is friction nobody actually goes through"*, and the box *"survives ONLY as a fallback"*.

Prominence of what does show: the QR is the third of four blocks in a scrollable body (heading → sample
line → two bullets → **QR** → reassurance line), `w-40 h-40`, centred, no caption, no label, no link.

### (c) 🔴 Demo-only, or shared with a live truck?

**Demo-only, and structurally so. Pizzeria Gusto cannot reach this component under any input.**

Three independent reasons, each sufficient:

1. **It is not rendered.** The mount is guarded by `isDemo && …`
   ([app/dashboard/[token]/page.tsx:2313](app/dashboard/[token]/page.tsx#L2313)).
2. **It is operator-facing, not customer-facing.** It is a modal on `/dashboard/[token]`, behind the
   dashboard session gate. It is not on any customer surface at all.
3. **`isDemo` cannot be true for a live truck.** `isDemoIdentifier` keys on the `demo-` prefix, and
   [lib/demo.ts:14-19](lib/demo.ts#L14-L19) records that `provisionTruck`'s `demoIdentity` puts that
   prefix on **id, slug and dashboard_token together**, with `assertReservedPrefix()` guaranteeing no
   operator truck can carry it on any of the three. The header calls the prefix *"load-bearing security,
   not a naming convention"* — it is what waives the `/dashboard` session gate in `proxy.ts`.

**The gate you asked for, if you later want to change the customer order page for demos only:**
`isDemoIdentifier(slug)` is **already computed on that page, twice** —
[app/trucks/[slug]/order/page.tsx:158](app/trucks/[slug]/order/page.tsx#L158) (the page component) and
[:2555](app/trucks/[slug]/order/page.tsx#L2555) (inside `Hdr`). The existing demo banner uses it, and
its comment names the pattern to follow: put it **in `Hdr`**, because *"`<Hdr>` is the one component
every state of this page goes through (loading, error, no-event, ended, and the live menu), so one
insertion covers all five and a future sixth can't miss it."* Gusto's slug has no `demo-` prefix, so
every such branch is dead code for it — no new column, no new fetch, no new prop.

---

## R3. PHONE

### (a) Where `contact_phone` is collected, and whether it is required

**It is not collected in `/setup` at all** — grep for `phone` in
[app/setup/page.tsx](app/setup/page.tsx) returns nothing. Two collection points exist:

**1. The demo → signup modal**, [components/DemoGetStarted.tsx:899-903](components/DemoGetStarted.tsx#L899-L903).

* **Client-side: OPTIONAL, and labelled so** — the `<label>` literally renders
  `Phone <span>(optional)</span>`.
* `validateTruckStep()` ([:397-407](components/DemoGetStarted.tsx#L397-L407)) checks operator name,
  truck name and cuisine. **Phone is not checked.** `validateDetailsStep()` checks email, password,
  terms. Phone is not checked there either.
* No format validation of any kind on this path — `isValidUKPhone` is **not imported** by
  `DemoGetStarted.tsx`.
* Submitted at [:541-543](components/DemoGetStarted.tsx#L541-L543) as
  `contact_phone: contactPhone.trim()` via `update_settings`, alongside a derived `whatsapp` and
  `phone_is_whatsapp`.

**2. Manage → Settings**, [app/manage/[token]/page.tsx:7479](app/manage/[token]/page.tsx#L7479).

* Carries `required`, but **`required` on this component is decorative**: `Input`
  ([components/manage/primitives.tsx:37-47](components/manage/primitives.tsx#L37-L47)) uses it to
  render a red `*` beside the label and nothing else — it does not set the HTML `required` attribute
  and there is no form submit to block. Saving is `onBlur` autosave.
* The error is `contactPhoneErr` ([:7281](app/manage/[token]/page.tsx#L7281)) =
  `trim() !== '' && !isValidUKPhone(...)`. **An empty phone is explicitly not an error** and saves
  silently.
* A separate advisory exists: the "Complete your profile" amber banner
  ([app/manage/[token]/page.tsx:489-505](app/manage/[token]/page.tsx#L489-L505)) lists `contact phone`
  among four missing "mandatory fields" and links to Settings. **It blocks nothing** — it is a nag.

**Server-side: no requirement and no validation anywhere.** `update_settings`
([app/api/manage/route.ts:796](app/api/manage/route.ts#L796)) puts `contact_phone` in an allowlist and
writes whatever string arrives ([:815](app/api/manage/route.ts#L815)). There is no length check, no
format check, no non-empty check. `/api/setup create_truck` never touches it, and `provisionTruck`
never writes it.

**Net: optional on every path, client and server. Nothing anywhere rejects a blank or malformed phone.**

### (b) Every place `contact_phone` is READ

| Where | Kind | Detail |
|---|---|---|
| [app/api/orders/submit/route.ts:1039](app/api/orders/submit/route.ts#L1039) | **customer-facing** | `contactPhone` into the order-confirmation email payload |
| [app/api/dashboard/action/route.ts:159](app/api/dashboard/action/route.ts#L159), [:242](app/api/dashboard/action/route.ts#L242), [:1185](app/api/dashboard/action/route.ts#L1185), [:1508](app/api/dashboard/action/route.ts#L1508) | **customer-facing** | four email/notification payloads (confirm, modify, cancel, slot change) |
| [lib/email.ts:161](lib/email.ts#L161) | **customer-facing** | rendered **visibly in the email body**; the comment notes *"Gusto's number lives in `contact_phone`, not `whatsapp_sender`"* |
| [app/api/discovery/events/route.ts:210](app/api/discovery/events/route.ts#L210), [:264](app/api/discovery/events/route.ts#L264) | **public-facing** | `opPhone` on the discovery/events feed |
| [app/manage/[token]/page.tsx:494](app/manage/[token]/page.tsx#L494) | operational | the "Complete your profile" nag |
| [app/manage/[token]/page.tsx:7291](app/manage/[token]/page.tsx#L7291), [:7296](app/manage/[token]/page.tsx#L7296), [:7306](app/manage/[token]/page.tsx#L7306) | operational | source for the derived `whatsapp` value and the `whatsappUsable` gate |
| [app/manage/[token]/page.tsx:7300](app/manage/[token]/page.tsx#L7300), [:7505](app/manage/[token]/page.tsx#L7505) | operational | whether "Phone" is offered as `preferred_contact_method` |

**So yes, it is genuinely used** — it reaches customers in every transactional email and on the public
discovery feed, and it gates the WhatsApp and preferred-contact features. A blank one degrades all of
those silently.

### (c) Format validation, and the three UK forms

One validator, [lib/contact-validation.ts:16-19](lib/contact-validation.ts#L16-L19):

```ts
const digits = (phone || '').replace(/[^\d+]/g, '')
return /^(\+?44|0)\d{9,11}$/.test(digits)
```

It strips everything except digits and `+` **before** testing, so spacing and punctuation are
irrelevant.

| Input | After strip | Result |
|---|---|---|
| `07123456789` | `07123456789` | **accepted** — `0` + 10 digits |
| `+447123456789` | `+447123456789` | **accepted** — `+44` + 10 digits |
| `07123 456789` / `+44 7123 456789` / `(07123) 456-789` | spaces & punctuation removed | **accepted** |
| `447123456789` | unchanged | **accepted** — the `44` branch |

**All three named forms pass, with or without spaces.** It is a loose check: `0000000000` also passes,
and it never normalises — whatever the operator typed, spaces and all, is what is stored and what
appears in customer emails.

⚠️ **It is applied on only one of the two collection paths.** Manage Settings validates;
`DemoGetStarted` does not import it at all. A phone entered during signup is unvalidated.

### (d) `contact_phone` vs `whatsapp_sender` vs `phone_is_whatsapp`

Three different things:

* **`contact_phone`** — the truck's public contact number. Operator-entered, customer-visible in
  emails and on discovery. Written by `update_settings`.
* **`phone_is_whatsapp`** — a boolean tick meaning *"the number in `contact_phone` also takes
  WhatsApp"*. Its only job is to derive `trucks.whatsapp`:
  `waFromPhone = (phone, isWa) => (isWa && phone.trim() ? phone : '')`
  ([app/manage/[token]/page.tsx:7287](app/manage/[token]/page.tsx#L7287), replicated verbatim at
  [DemoGetStarted.tsx:249](components/DemoGetStarted.tsx#L249)). Written by `update_settings`.
* **`whatsapp_sender`** — provider-linked WhatsApp Business Platform config, **not a contact detail**.
  It is the number the *webhooks* route inbound messages by:
  [app/api/webhooks/whatsapp/route.ts:39](app/api/webhooks/whatsapp/route.ts#L39) does
  `.eq('whatsapp_sender', toNumber)`, and the Meta webhook matches `+447…`/`447…`/`07…` variants
  ([app/api/webhooks/meta/whatsapp/route.ts:62](app/api/webhooks/meta/whatsapp/route.ts#L62)). It is
  written by a **different action** — `update_truck`
  ([app/api/manage/route.ts:854](app/api/manage/route.ts#L854)) — from the Auto-replies/Connect screen,
  and `update_settings`'s allowlist deliberately excludes it, with the comment *"SEPARATE from
  `whatsapp_sender` (Auto-replies/Connect) — not written here"*
  ([app/api/manage/route.ts:800](app/api/manage/route.ts#L800)).

**Would making `contact_phone` mandatory populate any of the others?**

* **`whatsapp_sender`: no.** Different action, different allowlist, different screen. Nothing derives it
  from `contact_phone`. `lib/email.ts:161` explicitly notes the two hold different numbers for Gusto.
* **`phone_is_whatsapp`: no.** It is an independent tick, defaulting `false`
  ([DemoGetStarted.tsx:219](components/DemoGetStarted.tsx#L219)).
* **`trucks.whatsapp`: only conditionally.** `waFromPhone` copies `contact_phone` into `whatsapp`
  **only when `phone_is_whatsapp` is already ticked**. With the tick off, a mandatory phone leaves
  `whatsapp` empty.

---

## R4. WIZARD RE-ENTRY

**Re-entry exists today, and it works.** Traced:

1. Both "✨ Import menu" buttons — the header one
   ([app/manage/[token]/page.tsx:3068](app/manage/[token]/page.tsx#L3068)) and the empty-state one
   ([:3092](app/manage/[token]/page.tsx#L3092)) — call `setImportStep('upload')` and nothing else.
2. `inSetup` is **derived from the truck row on every render**, not from how the wizard was opened:
   `const inSetup = truck.setup_step != null && truck.setup_step !== 'done'`
   ([:2355](app/manage/[token]/page.tsx#L2355)).
3. `setup_step` is set to `'menu'` when the truck is created
   ([app/api/setup/route.ts:80](app/api/setup/route.ts#L80)) and is only cleared by `finishSetup()`
   writing `'done'` ([app/manage/[token]/page.tsx:2466](app/manage/[token]/page.tsx#L2466)).
4. So with `setup_step = 'menu'` and no menu committed, **everything gated on `inSetup` is live on
   re-entry**:
   * `wizardSteps` appends `{ key: 'schedule', label: 'Schedule' }` ([:2367](app/manage/[token]/page.tsx#L2367));
   * the stepper prepends the completed "Your details" pill ([:2420](app/manage/[token]/page.tsx#L2420));
   * the Kitchen button reads `Next →` rather than `Save & add to menu` ([:4591](app/manage/[token]/page.tsx#L4591));
   * on commit, `if (inSetup) setImportStep('schedule')` ([:2762](app/manage/[token]/page.tsx#L2762)) —
     otherwise `'done'`;
   * the Schedule step is gated `importStep === 'schedule' && inSetup` ([:4610](app/manage/[token]/page.tsx#L4610));
   * `'done'` does not auto-dismiss in setup mode ([:2471](app/manage/[token]/page.tsx#L2471)).

**It is not a plain import.** The exit copy already promises exactly this
([:4817](app/manage/[token]/page.tsx#L4817)): *"sign in and tap Import menu on your menu screen to pick
up right here."*

**Two precise differences from first arrival**, both from the `?import=demo` bootstrap effect
([:2262-2325](app/manage/[token]/page.tsx#L2262-L2325)), which is guarded by
`new URLSearchParams(window.location.search).get('import') !== 'demo'` **and** a one-shot
`demoImportTried` ref:

* **The 'offer' step is skipped.** First arrival with a real (non-template) demo extraction lands on
  `'offer'` ([:2318](app/manage/[token]/page.tsx#L2318)) — "use this menu / upload a different one".
  Re-entry lands on `'upload'`, the file picker.
* **`showSetupIntro` stays false**, so the intro line above the wizard is absent — recorded as
  deliberate at [:1882](app/manage/[token]/page.tsx#L1882): *"a later reopen from '✨ Import menu' never
  shows it."*

Also: the demo extraction is **not re-offered** on re-entry. `demoImportMode` stays `false`, so a
re-entry commit does not clear-first.

⚠️ One structural caveat, not a bug in re-entry: **the entire wizard lives inside `MenuTab`**
(`function MenuTab` at [:1568](app/manage/[token]/page.tsx#L1568), the wizard overlay at
[:4184-4620](app/manage/[token]/page.tsx#L4184-L4620)), so `importStep` and all staged state are
destroyed if `MenuTab` unmounts. While the wizard is open the tab bar is unreachable (wizard `z-50`
over tab bar `z-40`), so this is not currently reachable by clicking — but any future change that lets
a tab switch happen mid-wizard loses the whole staged import.

---

## R5. STEPPER

### (a) Is a step indicator rendered, and where?

**Yes.** `renderWizardStepper(currentKey)` —
[app/manage/[token]/page.tsx:2415-2446](app/manage/[token]/page.tsx#L2415-L2446). It renders numbered
pills joined by `›` chevrons; the current step is `bg-slate-900 text-white`, others are clickable
(`goToStep`), and completed prefix steps render as a green ✓ and are **not** clickable.

Called from **five** sites, covering four wizard steps:

| Line | Argument |
|---|---|
| [:4184](app/manage/[token]/page.tsx#L4184) | `reviewStep === 2 ? 'extras' : 'menu'` |
| [:4404](app/manage/[token]/page.tsx#L4404) | `'allergens'` — passed **into** `AllergenWizardModal` as the `importStepper` prop |
| [:4417](app/manage/[token]/page.tsx#L4417) | `'allergens'` |
| [:4502](app/manage/[token]/page.tsx#L4502) | `'kitchen'` |
| [:4620](app/manage/[token]/page.tsx#L4620) | `'schedule'` |

**Not rendered on:** `idle`, `upload`, `processing`, `offer`, `saving`, `done`. So the operator sees no
progress indicator on the arrival screens — the offer step and the upload step — and none on the
terminal screen.

### (b) The full ordered list a setup operator passes through

`ImportStep` ([:644](app/manage/[token]/page.tsx#L644)) is the *machine* state; `WizKey`
([:2361](app/manage/[token]/page.tsx#L2361)) is the *displayed* step. They are not the same set.

| # | `ImportStep` | Stepper pill (`WizKey`) | inSetup-only? |
|---|---|---|---|
| — | `idle` | — | no (closed) |
| 1 | `offer` | *(none)* | **yes** — reached only from the `?import=demo` bootstrap |
| 2 | `upload` | *(none)* | no |
| 3 | `processing` | *(none)* | no |
| 4 | `review` (`reviewStep 1`) | **Menu** | no |
| 5 | `review` (`reviewStep 2`) | **Extras** | no — but **conditional**: only when `hasExtras` (`groupingRows.length > 0`) |
| 6 | `allergens` | **Allergens** | no |
| 7 | `prep` | **Kitchen setup** | no |
| 8 | `saving` | *(none)* | no |
| 9 | `schedule` | **Schedule** | **yes** ([:2367](app/manage/[token]/page.tsx#L2367), [:4610](app/manage/[token]/page.tsx#L4610)) |
| 10 | `done` | *(none)* | no — but its behaviour differs (no auto-dismiss when inSetup) |

Plus one **display-only** pill with no `ImportStep` at all: **"Your details"**, prepended and rendered
as complete, **inSetup-only** ([:2420](app/manage/[token]/page.tsx#L2420)).

So a setup operator's pill sequence is:
**Your details ✓ › Menu › [Extras] › Allergens › Kitchen setup › Schedule**
(6 pills with extras, 5 without). A non-setup operator sees **Menu › [Extras] › Allergens › Kitchen
setup** — the header comment at [:2418](app/manage/[token]/page.tsx#L2418) records that this is
byte-for-byte the pre-setup rendering.

Two notes on `schedule`: `goToStep` early-returns for it
([:2409](app/manage/[token]/page.tsx#L2409)) — *"its pill is display-only"* — because it is post-commit
and unreachable from an uncommitted earlier step. And `done` is not in `wizardSteps` at all, so the
numbering never shows a final step.

### (c) Data-driven or hardcoded?

**Already data-driven, from one definition.** The chain is:

```
baseWizardSteps  (:2362)  ← conditional on hasExtras
  → wizardSteps  (:2367)  ← appends Schedule when inSetup
    → renderWizardStepper (:2415) ← prepends "Your details" when inSetup, maps to pills, numbers i+1
      → goToStep   (:2406)        ← the ONE place a pill click maps back to state
```

Every pill's label, order, number and click target comes from that array. Adding a step means one
entry in `baseWizardSteps` plus one branch in `goToStep`.

**So R5c's "how hard would it be to render a progress header from one definition" is: it is already
that.** What is *not* driven by the array is **which `ImportStep`s render the stepper at all** — that
is five hardcoded call sites (R5a). A progress header on `offer`, `upload` or `processing` needs those
call sites added, not the model changed. The array has no entry for those steps, so they would need
either a new `WizKey` or a `currentKey` that matches nothing (which renders every pill inactive —
`currentKey === s.key` is simply false for all).

---

## R6. DISCOUNT CODE

### (a) Does any discount / promo / coupon / referral concept exist?

**Your premise is wrong — two separate systems already exist.** Neither is a signup code.

**1. Customer order discount codes — fully live.** Table `discount_codes_db`, keyed per truck.

* Redeemed at checkout: [app/api/orders/submit/route.ts:489-495](app/api/orders/submit/route.ts#L489-L495)
  — `.eq('truck_id', …).eq('code', code.toUpperCase()).eq('is_active', true)`.
* Priced by `calculateOrderTotal`, which takes `discountCode?: DiscountCode | null` and returns
  `discountAmt` ([lib/order-calculations.ts:32-44](lib/order-calculations.ts#L32-L44)). The type is
  `{ code: string; type: 'pct' | 'fixed'; value: number }`.
* Re-resolved on order edit ([app/api/dashboard/action/route.ts:568-582](app/api/dashboard/action/route.ts#L568-L582)),
  deliberately **not** filtered on `is_active` there.
* Also read by [app/api/menu/[truckId]/route.ts:98](app/api/menu/[truckId]/route.ts#L98) and
  [app/api/manage/route.ts:100](app/api/manage/route.ts#L100).
* Persisted on the order as `orders.discount_code` and `orders.discount_amt` (referenced throughout
  `place_order_atomic`).
* Cascade-deleted with a truck ([lib/delete-truck.ts:49](lib/delete-truck.ts#L49)).

⚠️ **`discount_codes_db` has no migration file** — grep across `supabase/migrations/` returns nothing.
It predates the migration convention or was created directly in Supabase. Its exact shape is not
knowable from the repo; the query below reads it.

**2. Subscription discount — admin-only, on the truck.**
`trucks.lifetime_discount_pct integer null` and `trucks.lifetime_discount_note text null`
([supabase/migrations/20260602_tester_plan_discount.sql](supabase/migrations/20260602_tester_plan_discount.sql)),
described as *"Set for pre-launch testers"*. Set from the admin console only
([app/admin/page.tsx:1030-1056](app/admin/page.tsx#L1030-L1056)), shown as a green `💚 50%` chip
([:877](app/admin/page.tsx#L877)), and read into the admin payload
([app/api/admin/route.ts:54](app/api/admin/route.ts#L54)). **This is the closest existing analogue to a
signup discount** — same domain (subscription price), same table you asked about, just admin-granted
instead of self-claimed.

**What does NOT exist:** any *referral* concept, any *signup*/promo code, and any code redeemed against
a plan or trial. `grep -i "referral|coupon|voucher"` returns nothing outside the two systems above.

Confirm the customer-code table's shape before designing anything:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'discount_codes_db'
order by ordinal_position;
```

Confirm no signup-code column exists anywhere:

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (column_name ilike '%signup%code%'
    or column_name ilike '%promo%'
    or column_name ilike '%referral%'
    or column_name ilike '%coupon%')
order by table_name, column_name;
```

### (b) Where a nullable signup code column belongs, and the smallest additive migration

The constraint is a timing one, and it is real: **`/api/signup` creates the `operators` row and
explicitly creates no truck** ([app/api/signup/route.ts:2-9](app/api/signup/route.ts#L2-L9) sets out
why — `trucks.id` is the name-slug and is referenced by ~26 tables). The truck is minted later, by
`/api/setup create_truck`. So the two candidate homes answer different questions:

* **`operators`** — the only row that exists at the moment a code would be typed. Also the right grain
  if a code should apply to the *person*, who may later own several trucks.
* **`trucks`** — where `plan`, `trial_expires_at`, `feature_overrides`, `lifetime_discount_pct` and
  `lifetime_discount_note` already live, i.e. where anything that *acts on* the code will be read.

Both are one-line additive `alter table … add column if not exists`, nullable, no default, no
backfill, no constraint — nothing existing reads or writes them, so neither can affect Gusto or RTF.

Operator-grain (captured at the moment it is typed):

```sql
alter table operators
  add column if not exists signup_code text;

comment on column operators.signup_code is
  'Nullable. Code the operator entered at self-serve signup, captured by /api/signup before any truck exists. Never validated or acted on by anything yet.';
```

Truck-grain (sits beside plan / trial / lifetime_discount):

```sql
alter table trucks
  add column if not exists signup_code text;

comment on column trucks.signup_code is
  'Nullable. Signup code that provisioned this truck, copied forward from operators.signup_code at create_truck. Sits beside plan/trial_expires_at/lifetime_discount_pct, which is what would act on it.';
```

Note `provisionTruck` writes its column set explicitly, so a new `trucks` column stays NULL for every
existing and future truck until something is written to it — no code change is required for the
migration to be safe on its own.

### (c) Every point in the signup chain where the value could be captured and persisted

Traced end to end. Each row is a place the value can exist, with what is in scope there.

| # | Point | File | In scope | Notes |
|---|---|---|---|---|
| 1 | Signup page form | [app/signup/page.tsx:27-32](app/signup/page.tsx#L27-L32) | `email`, `password`, `marketing` | It already reads a query param and forwards it: `const demo = params.get('demo')` ([:25](app/signup/page.tsx#L25)) → `body: {…, demo}` ([:41](app/signup/page.tsx#L41)). A code could arrive the same way (`?code=…`) or as a fourth field. |
| 2 | Demo → signup modal, step 1 | [components/DemoGetStarted.tsx:397-407](components/DemoGetStarted.tsx#L397-L407) | operator name, truck name, cuisine, **phone** | The truck-details step. `validateTruckStep` is where a code would be validated client-side. |
| 3 | Demo → signup modal, step 2 | [components/DemoGetStarted.tsx:411-415](components/DemoGetStarted.tsx#L411-L415) | email, password, terms | The step that calls `/api/signup`. |
| 4 | **`POST /api/signup`** | [app/api/signup/route.ts:41-44](app/api/signup/route.ts#L41-L44) | `body.email`, `body.password`, `body.marketing_opt_in`, `body.demo` | **The first server-side point.** The `operators` insert is at [:115-124](app/api/signup/route.ts#L115-L124) — a `signup_code` field drops straight in beside `marketing_opt_in`. **No truck exists here.** |
| 5 | **`POST /api/setup` `create_truck`** | [app/api/setup/route.ts:46-90](app/api/setup/route.ts#L46-L90) | `body.name`, `body.contact_email`, **and `operator` already resolved** | Where the truck is minted. Because `operator` is in scope, a code stored at step 4 can be copied forward here with no extra fetch. Note the idempotence guard at [:55-60](app/api/setup/route.ts#L55-L60) returns early on a resumed truck — a copy-forward placed after `provisionTruck` would be skipped on that path. |
| 6 | `provisionTruck` | [lib/provision-truck.ts:75-121](lib/provision-truck.ts#L75-L121) | `ProvisionProfile` + `ProvisionTruckOptions` | The truck insert itself. `ProvisionTruckOptions` ([:134](lib/provision-truck.ts#L134)) is the type that would carry it. `ProvisionProfile` requires each new field on **both** profiles by design (the `preordersEnabled` precedent, [:88-94](lib/provision-truck.ts#L88-L94)), which would force an explicit demo decision. |
| 7 | `update_settings` | [app/api/manage/route.ts:796-802](app/api/manage/route.ts#L796-L802) | allowlisted truck fields | Reachable later from `DemoGetStarted`'s step (d) call, but this is a *settings* write, not a signup capture — a code arriving here would have to be added to `ALLOWED`. |
| 8 | `demo_sessions` | [app/api/signup/route.ts:179-186](app/api/signup/route.ts#L179-L186) | `claimed_by_operator_id` | Exists only when the signup came from a demo, so it cannot be the primary home. |

**The shortest chain that persists it against the truck** is 1 → 4 (`operators.signup_code`) → 5
(copy forward to `trucks.signup_code` using the already-resolved `operator`), which needs no change to
`provisionTruck` at all.
