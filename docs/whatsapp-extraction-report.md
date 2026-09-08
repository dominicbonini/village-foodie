# WhatsApp derivation extraction + outreach phone/hint columns

**GARBLED SPANS: none. No instruction contradicted another.**

**Files changed:** `components/EventListCard.tsx` (extraction only), **new** `lib/whatsapp-hint.ts`,
`app/admin/outreach/page.tsx`, `app/api/admin/outreach/route.ts`. `lib/outreach.ts` was permitted but not
needed — untouched. Nothing deployed. No phone number or WhatsApp value written to any row.

---

## Consumers of EventListCard — the deploy's blast radius

Every consumer is a **public Village Foodie discovery surface. None is an operator surface or a native
shell.**

| Consumer | Surface |
|---|---|
| `app/page.tsx:342` | the public discovery homepage (map + list) |
| `app/venues/[slug]/VenueClient.tsx:203` | the public venue page |
| `components/MapView.tsx:222` | the public map popup |

Grepped for any operator/dashboard/manage/kds/admin/native use of these three — **none**. 🟢 **This deploy
touches only the public consumer site's Call/Message/Text buttons, plus the admin outreach page. No
operator or native surface renders EventListCard.**

---

## STEP 1 — characterisation before touching (the pass condition bites)

The inline logic lives inside a React component and cannot be imported, so the test declares a **byte-for-
byte copy of the pre-extraction lines as the reference** (the manual's "mirror" caveat — declared) and
pins its output, including the observable button config (`Call` / `WhatsApp` / `SMS`) the component
renders at `:180-191`.

**Input space — every ugly case named in the brief × every `accepted_methods` variant:**
- phones: `07770 642489` (spaced), `(07378) 276220` (brackets), `07123-456-789` (hyphens),
  `+447700900123`, `00447700900123`, `447700900123`, `7700900123` (bare 7), `+33612345678` (non-UK),
  `01223 555123` / `0208 555 1234` (landlines), `''`, `null`, `undefined`, `07abc123456` (letters),
  `07700900123 ext 4` (trailing text)
- methods: `null`, `''`, `whatsapp`, `WhatsApp`, `Whatsapp, cash`, `cash,card`, `CASH, WhatsApp, Card`,
  `website,whatsapp`, `notwhatsappish` (substring in a longer word — must still match, and does, matching
  the live `includes`), `wha tsapp` (broken — must NOT match)

**= 150 cases.** Distribution: `advertises` 42, `mobile_not_advertised` 28, `none` 80.

### 🔴 THE MUTATIONS — both make the test FAIL
| Mutation | First divergent case | Result |
|---|---|---|
| **`startsWith('447')` → `startsWith('448')`** | `07770 642489`, methods null: reference `isMobileNumber=true, smsBtn=true` → mutant `false, false` | ✅ **TEST FAILS** — behaviour diverged |
| **`includes('whatsapp')` → `includes('xwhatsapp')`** | `07770 642489`, methods `'whatsapp'`: reference `acceptsWhatsApp=true, whatsappBtn=true` → mutant `false`, `smsBtn=true` instead | ✅ **TEST FAILS** — behaviour diverged |

**A test that could not fail proves nothing; this one fails the moment either the prefix test or the
substring check is broken.**

---

## STEP 2 — the extraction, and its behaviour-neutrality

`lib/whatsapp-hint.ts` exports one pure function `phoneWhatsApp(phoneNumber, acceptedMethods)` returning
`{ cleanPhone, waPhone, hasPhone, isMobileNumber, acceptsWhatsApp, hint }`. Every field is the same
expression, in the same order, as the inline code.

🟢 **Run against the 150-case reference: extracted === reference on ALL fields AND the button config, 0
mismatches.** The extracted `hint` reproduces the reference **button configuration** exactly:
`advertises` ↔ WhatsApp button, `mobile_not_advertised` ↔ SMS button, `none` ↔ neither. This is the
proof that the three hint states and the three live buttons are the same thing.

⚠️ **One ambiguity in the brief's three states resolved by the data, not by me choosing:** a whatsapp-
tagged **landline** (`01223…` + `whatsapp`) → `hint: none`, `Call` only — because "not a mobile → nothing"
gates it, exactly as the live button already behaved (no WhatsApp button for a landline). The mobile gate
wins; the extraction did not change it.

**EventListCard now imports the function.** Diff confirmed to be **only** the extraction: the import, the
five derivation lines replaced by the destructured call, and the moved `acceptsWhatsApp` line. `methodsStr`
is kept (still used for `wantsWebsite`); the venue-phone logic is untouched. No other change to that file.

### 🔴 Verified on the LIVE PUBLIC SITE (no session needed, and this is where the risk is)
Rendered the public VF homepage in a browser (villagefoodie host, anonymous):
- **138 Call, 88 SMS, 38 WhatsApp buttons** render.
- **Churro Boyz** (`tel:07770642489`) and **Big Bite Kebab** (`tel:07378276220`) show **Call + Message
  (SMS)** — mobiles with no whatsapp tag, exactly as before.
- WhatsApp hrefs are `wa.me/447359408943`, `wa.me/447949993669`, … — correctly 447-normalised.
- **No page errors.**

🟢 **So EventListCard is verified properly, against the live public site, as the brief required for it** —
the equivalence proof (150 cases) plus a real anonymous render showing the buttons unchanged.

---

## STEP 3 — items 1-5 on the outreach page

1. 🟢 **`phone` read-only column** (its own column; `mobile` deliberately not shown). Route already
   fetched `phone`; the cell is plain text, not editable.
2. 🟢 **Scraped hint column, THREE states**, derived in the route from the **same** `phoneWhatsApp` on
   `(phone, accepted_methods)` (route now selects `accepted_methods`): `advertises WhatsApp` (green) ·
   `mobile, not advertised` (amber) · `—` for none. 🔴 **An absent tag renders as `—`, never "no
   WhatsApp"** — and a mobile with no tag is `mobile, not advertised`, kept distinct.
3. 🟢 **Two WhatsApp columns, labelled apart:** `WA (scraped)` — read-only hint, title *"what the live call
   button acts on"*; `WA (I confirmed)` — my `whatsapp_number`/`whatsapp_confirmed`, title *"MY
   confirmation … distinct from the scraped hint. Editable."* The edit field is labelled *"(my
   confirmation)"* too. They can't be read as one.
4. 🟢 **`whatsapp_number` placeholder defaults to the discovery phone** (`"07770 642489 (on file)"`), and a
   one-click **"use phone"** button fills it — so confirming an on-file number is one action. 🔴 **The
   stored value is NOT pre-populated:** an untouched field stays empty/unconfirmed; the value is written
   only on an explicit click or type, so a number never becomes "confirmed" by my not noticing.
5. 🟢 **Both new columns sortable, nulls last**, on the sort mechanism already built. `WA (scraped)` sorts
   `advertises` > `mobile, not advertised`, with `none` treated as null → **last in both directions**;
   `phone` sorts as a string, null last.

### Verified in a browser (STUBBED data — see the boundary)
Drove the real page component: headers show the two distinct WhatsApp labels + titles; the three hint
states render (`advertises WhatsApp` / `mobile, not advertised` / `—`); `WA (scraped)` sort put `none`
last both asc and desc; `phone` sort put the null-phone row last; the placeholder read
`"07770 642489 (on file)"` with an **empty value**, and "use phone" posted `whatsapp_number: "07770
642489"`. No console errors.

---

## 🔴 Verification boundary — stated plainly

- 🟢 **EventListCard IS verified against live data** — it renders on the public site with no session, and I
  loaded it anonymously and confirmed the buttons are unchanged. This is the file that matters for the
  trading truck, and it is properly checked.
- 🔴 **The outreach PAGE is NOT verified against the live tables.** For the **fourth** time, no admin
  session was obtainable (the sole admin is your own account; minting one was blocked on a prior task and
  I did not retry). The outreach checks above ran against the **real page component with STUBBED network
  data**, not the live 176 rows through the gate. **I am not describing the outreach page as working
  against live data.**
- **tsc is clean** (supplementary, not verification).

**To close the outreach gap:** open `/admin/outreach` as an admin and confirm the Phone column, the
three-state `WA (scraped)` hint (Churro Boyz / Big Bite Kebab should read *mobile, not advertised*), and
that "use phone" fills the confirmation field without pre-confirming it.

**Nothing deployed. No row changed. EventListCard changed only by the extraction.**
