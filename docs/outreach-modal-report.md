# Outreach — contact_name migration, search, modal rework

**Scope kept:** `app/admin/outreach/page.tsx`, `app/api/admin/outreach/route.ts`, and ONE new migration. `discovery_trucks.excluded`, the HU columns, and the sort/layout work were not touched.
**Verification:** no DB writes were made this turn (only a read-only capability probe). The **page/route is code only** — **no admin session (seven failures still hold; not retried)**, so it is not verified live; tsc is clean, which per your rule is not behavioural verification. You verify on localhost.

---

## THE MIGRATION — written, NOT run

`supabase/migrations/20260903_outreach_contact_name.sql` — `alter table public.outreach_prospects add column if not exists contact_name text;` **nullable, no default, no CHECK.** Apply by hand.

🔴 **I did NOT infer the applied state from row values.** I still cannot read `information_schema` from this environment (PostgREST blocks that schema; no direct DB connection). So the route **treats the column as absent until proven present by a capability probe**, not by data:
- GET selects **with** `contact_name`; if PostgREST rejects it as an undefined column, it falls back to selecting **without** it and returns `hasContactName: false`.
- **Verified live just now: the WITH-`contact_name` select errors → `hasContactName = false`** (column not applied yet, as expected). The page therefore renders the Contact-name field **disabled** with the placeholder "Apply the contact_name migration to enable" until you apply it. No claim that the column exists.

---

## THE PAGE

### 1. Search box
A `type="search"` input at the top filters the already-loaded 231 rows by truck name as you type (`name.includes(query)`), inside the existing `visible` memo — **no server round trip, no paging**. The count line shows `{shown} of {total} trucks` while a search is active.

### The modal — reordered a–f
- **a. Header:** truck **logo beside the name** when one exists. Logo source: **`discovery_trucks.logo_url`** — it is the populated one (**153 of 231** rows; full public storage URLs, e.g. `…/truck-media/discovery-logos/al-chile.jpg`), vs `photo_url` (78, relative `/photos/…`) and `trucks.logo_storage_path` (only the 4 linked trucks). Rendered only when `logo_url` is a real `http(s)` URL; **no logo → nothing shown** (no placeholder box).
- **b. Contact:** contact **name** (the new column, editable — disabled until the migration is applied), **email**, then the **phone with the WhatsApp tick on the same line**. The WhatsApp-number field is kept below it.
- **c. Log a contact.**
- **d. Next action** (below Log, since logging is what suggests the date).
- **e. Notes.**
- **f. Contact history.**

### 2. Labels removed
"(my confirmation)" and "(on file)" are gone. The **phone is still the placeholder** of the WhatsApp-number field.

### 3. "Park until February" removed
Gone; **Clear and the date picker kept**.

### 4. Double-submit on Log contact — both fixes
- **The actual fix:** a `logging` state disables the Log button from click until the write resolves (the button reads "Logging…" and is `disabled`), closing the click→response window. `submitLog` also early-returns if already logging.
- **Safety net — success toast with Undo:** `log_contact` now returns the inserted row's **id**; the toast's Undo calls a new `delete_contact` route action that deletes **that specific id** — never "the most recent contact", which is exactly what diverges when two writes land together.
- **Toast pattern:** the page had only a plain **string** toast (no shared toast-with-actions exists to reuse in scope). I extended that same bottom-centre toast **minimally** to carry an optional Undo action — **no library added**.

### WhatsApp — one path only
The modal's WhatsApp tick reuses the **same `WhatsAppBox`** the row uses (writes `whatsapp_confirmed`, tick → true / untick → NULL). The old standalone "WhatsApp confirmed" checkbox in the modal was **removed** so there is a single control/one path (honouring "do not create a second path"); the row tick and modal tick are the same component and rule.

---

## ROUTE CHANGES (same file, in scope)
- GET: resilient `contact_name` probe (above), `logo_url` added to the discovery embed, `hasContactName` returned.
- POST: `contact_name` added to the update allow-list (`'' → null`); `log_contact` returns the new `id`; new `delete_contact` action deletes one contact by id.

## FLAGS
- **No garbled text; no instruction contradiction.**
- **No DB writes this turn.** The migration is written, not run; no backfill; nothing in either table changed. The only DB call was a read-only probe.
- **contact_name is treated as absent** (capability-probed, not value-inferred); the field is disabled until you apply the migration and the next load re-probes `hasContactName`.
- **Not verified live** — no admin session (seven failures). tsc clean only.

*2026-09-03. Migration written (unapplied); page/route code-only and unobserved.*
