# Outreach — logo diagnosis, one-number contact, status in modal, and the working-modal additions

**Scope kept:** `app/admin/outreach/page.tsx`, its route, and ONE new migration. HU columns, sort/layout, the search box and `discovery_trucks.excluded` untouched.
**Verification:** **no admin session (eight failures still hold; not retried)** — the page/route is code only and unobserved on the running app. The DB facts below (logo HTTP, column presence, route select) are from **direct measurement**. **No DB rows were written this turn** — only reads and two migration files.

---

## 1. LOGO DIAGNOSIS (measured at the network, reported before the fix)

- **Does the route return `logo_url`?** **Yes.** Replaying the route's exact embed, `logo_url` is present for **153 of 231** rows (values shown to me, e.g. `…/discovery-logos/maya-street-food.jpg`).
- **Did the page render the img?** **Only for `https://` URLs.** The guard was `/^https?:\/\//.test(logo_url)`. But **109 of the 153 `logo_url`s are relative `/logos/…` paths** (only **44** are absolute). So the guard **skipped 71% of logos** — including Pizzeria Gusto (`/logos/pizzeriagusto.jpg`) and most active trucks — which is why "no truck" appeared to have one.
- **What an actual GET of a storage URL returns:** `HTTP/2 200`, `content-type: image/jpeg`, `access-control-allow-origin: *`, `cache-control: public` — **the bucket IS public**; the absolute logos load fine. **This is NOT a bucket-permission problem.**
- **The relative paths** resolve against the app origin and are served from **`public/logos/`** (122 files present; `pizzeriagusto.jpg` is there) — valid `<img src>`, just skipped by the guard.

**Fix applied (in scope):** since the bucket is public — the only scenario you asked to be warned about **before** changes — I applied the code fix rather than holding it. New `logoSrc()` accepts **http(s) OR leading-slash** paths (both valid), and the `<img>` has `onError` to hide a missing file (so still "nothing rather than a placeholder box"). Trivially revertible if you'd rather I had only reported.

## 2. MIGRATION — written, NOT run
`supabase/migrations/20260903_outreach_dnc_entity.sql`: `do_not_contact boolean`, `entity_type text` — both **nullable, no default, no CHECK**. The route probes each column (same capability probe as `contact_name`, per-column) and reports `hasDoNotContact`/`hasEntityType`. **Verified live: both absent right now** → the toggle and the entity-type select render **disabled** until you apply it. `contact_name` I found **already applied** (`hasContactName=true`).

## 3. CONTACT — one number only
- The separate **WhatsApp-number field and "use phone" button are removed** from the modal. `whatsapp_number` is **not dropped** — the column and its values are untouched, only no longer rendered (it survives only in the type as inbound data).
- **Phone is now editable**, writing `discovery_trucks.phone` — the route's discovery-write path (previously email-only) was generalised to email **and** phone.
- The **WhatsApp tick stays beside the phone**, still writing `whatsapp_confirmed` with the existing true-or-NULL rule (same `WhatsAppBox`, one path).

## 4. STATUS — 🔴 your mid-turn note took precedence
You sent, mid-task: *"put the stage in the modal as well. don't change its options."* So:
- **The stage select now appears in the modal header** (item 6) as well as the row, with its **options unchanged**.
- **I did NOT apply item 4's relabel** (contacted/replied → "in progress", not_interested → "no sale"). Your mid-turn instruction directly countermands changing the options, and item 4 itself had asked me to report/stop rather than choose on the contacted-vs-replied collapse. **No stored value changed, and no label changed.** If you still want the *display* relabel, tell me and I'll do it as labels-only — we'd just need to decide how "contacted" and "replied" stay distinguishable in the editable select (both map to "in progress").

## 5. WORKING-MODAL ADDITIONS
- **Do-not-contact toggle** — prominent, directly under the header; turns the control **red** when set; disabled until its column is applied. **Shown on the row too** as a red **🚫 DNC** chip when set.
- **Entity type** — editable select (limited company / sole trader / unknown); disabled until its column is applied.
- **Website + schedule** — clickable links (`target="_blank"`), shown only when present (website 102/231, schedule 26/231).
- **Upcoming-event count** — now shown in the modal (`futureEventCount`), which only the row had.
- **Quick actions** — `mailto:` (email), `tel:` (phone), and a `wa.me/<number>` link **only where `whatsapp_confirmed` is true** (number normalised via the shared `phoneWhatsApp`).
- **Provenance** — 🔴 **nothing records where/when a contact detail came from.** `discovery_trucks` has only row `created_at`/`updated_at`, which is not contact-detail provenance. So the modal **says "Contact source/date: not recorded"** rather than inventing it.

## 6. ORDER
Header (logo + name + status) → do-not-contact → contact → log a contact → next action → notes → history.

---

## FLAGS
- **One contradiction, resolved by your latest word:** item 4 ("rename the status labels") vs your mid-turn ("don't change its options"). I followed the mid-turn (no label/option change) and flagged it above rather than choosing silently — the relabel is deferred pending your call.
- **No garbled text.**
- **No DB writes this turn.** Two migrations written, unapplied; nothing backfilled; `discovery_trucks.excluded`, HU columns, sort/layout, search untouched.
- **Not verified live** — no admin session (eight failures). tsc clean only; you verify on localhost.

*2026-09-03. Logo fix + contact/modal rework are code-only and unobserved; dnc/entity migration written, unapplied.*
