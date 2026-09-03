# Buzzer tracking — features comparison row

Brief: add a `Buzzer tracking` row to the features comparison table (Trial / Pro / Max included,
Starter excluded), after reading four gate questions first. Read-first items 1–4, build items 5–8.

Status: **built, not committed, not deployed.** No SQL, no migrations, no credentials touched.

---

## 1. Is buzzer tracking actually built?

**Yes — fully, on both operator surfaces, end to end.** This is not a stub.

| Piece | Where |
|---|---|
| Assign from the order board | `components/dashboard/OrderCard.tsx:724-732` — bell chip rendering `🔔 {order.buzzer_number}` |
| Assign from the kitchen screen | `components/dashboard/BuzzerGrid.tsx` — the rack grid |
| Shared client logic | `lib/buzzer.ts` — 110 buzzer references across the repo |
| Server write | `app/api/dashboard/action/route.ts:2227` — the `set_buzzer` handler |
| Atomic DB action | `supabase/migrations/20260804_assign_buzzer_atomic.sql` — `assign_buzzer_atomic` |
| Printed | `lib/printing/ticket.ts:250-254` — `BUZZER <n>` in large type on the thermal ticket |
| Conflict banner | `components/dashboard/BuzzerLostBanner.tsx` |

The whole loop works: hand out a buzzer, tap its number, it appears on the order card and on the
kitchen ticket, and it is released when the order closes. The row describes a real feature.

## 2. What `buzzer_lost_at` actually means — 🔴 not what the brief assumed

The brief supposed this column tracked buzzers physically lost by customers, and asked whether the
copy should mention that. **It does not.** From the column comment at
`supabase/migrations/20260804_assign_buzzer_atomic.sql:32`:

> Set by assign_buzzer_atomic when AUTOMATIC conflict resolution left this order without the buzzer
> it claimed (offline replay, later placed_at wins). Drives the operator banner. NEVER set by an
> operator-confirmed take.

So it is a **data-conflict marker**, not a hardware-loss marker. Two devices offline both claim
buzzer 7; on replay the later `placed_at` wins; the loser's order is stamped `buzzer_lost_at` and
`BuzzerLostBanner` tells the operator that order no longer holds a buzzer. An operator who
deliberately takes a buzzer from one order and gives it to another never sets it.

**Consequence for the copy: no change needed.** There is no lost-buzzer accounting to describe, so
the approved wording is not omitting anything. Nothing was invented to cover it.

## 3. Is the buzzer count configurable, or hard-coded?

**Configurable, in two places, and it is the van's rack size — not a plan limit.**

- `truck_vans.buzzer_count smallint` (`supabase/migrations/20260803_buzzer_settings.sql`) — nullable,
  no default. `null` means "this van does not hand out buzzers", which switches the feature off.
- Editable in Manage → settings; copy at `lib/settings-copy.ts:135-139`
  (`'Do you hand out buzzers for collection?'` / `'How many buzzers do you have?'`).
- Asked during onboarding as **Q5 of the setup review step**,
  `app/manage/[token]/page.tsx:3160-3191` ("Q5: BUZZERS — THE POOL ONLY"), written via `saveVanReview`.
- `truck_events.buzzer_prompt` gives a per-event override of the prompt.

Nothing is hard-coded and nothing is per-plan. The row therefore promises a capability, not a
quantity, which is what the approved wording says.

## 4. Does the customer ever see the buzzer number?

**No.** Grepped the customer order page, the order submit route, the email templates, the Twilio SMS
path and the WhatsApp path: **zero** references to `buzzer_number` in any of them. The number exists
only on the operator board, the kitchen screen and the printed ticket.

This is why the approved detail line — "…so you know which buzzer belongs to which order" — is
accurate as written: the audience really is the operator alone.

## 5. The row as inserted

`lib/plan-features.ts`, section **Online sales & automation**, line 284 — placed after
`Auto-accept online orders` and before `Branded QR code`:

    { name: 'Buzzer tracking', detail: 'Give an order a buzzer number when you hand one out, so you know which buzzer belongs to which order.', starter: false, pro: true, max: true },

Wording is byte-identical to the approved text, including the sentence-ending full stop. Trial is
derived (not stored on the row) by `trialFeatureValue` in `lib/landing-table.ts`, which resolves it
to included — matching the brief's Trial / Pro / Max.

A block comment above the row records items 1–4 and the gate gap below, so the next reader does not
have to re-derive them.

## 6. 🔴 The gate — there isn't one, and I did not invent one

There is **no** `Feature` key for buzzers in `lib/features.ts`, and **no** `canAccess` / `hasFeature`
call anywhere guards buzzer behaviour — `app/api/dashboard/action/route.ts`, which owns the
`set_buzzer` handler, contains **0** `canAccess(` calls in the entire file.

So the table now says Starter is excluded while the code lets a Starter truck use buzzers in full.

I deliberately did **not** add a key. An unenforced key would gate nothing while making the parity
checker pass vacuously — the failure mode the manual already records elsewhere. Declaring the gap
plainly is worth more than a green check that means nothing.

**Consequence:** with no `ROW_FEATURE_MAP` entry, `findPlanParityViolations()` hits
`if (!feature) continue` and **skips this row entirely**. 24 of 32 mapped rows are checked; this row
is not one of them.

## 7. Parity check

`findPlanParityViolations()` reports **no violations**. That result is **vacuous for this row** — see
item 6. It is reported here as "no violations, and this row was not among the rows examined", not as
"this row passed". Separately, the checker only inspects cells that are literally `true`, so a
`false` cell such as this row's Starter would be invisible to it even if the row were mapped.

## 8. Every surface the row appears on

`FEATURE_SECTIONS` is rendered by three surfaces plus the PDF. All four were checked after the edit.

| Surface | Result |
|---|---|
| Landing `/` plans table (`app/landing/page.tsx:476`) | **34 rows**; new row sits between "Auto-accept online orders" and "Branded QR code"; cells `["✓","—","✓","✓"]`; detail text exact |
| Admin plans table (`app/admin/page.tsx:984`) | same `FEATURE_SECTIONS` source, row present |
| Manage → Billing (`app/manage/[token]/page.tsx:11402`) | same source, row present |
| PDF (`app/landing/features-pdf/route.ts`) | regenerated: **2 pages, 166,885 bytes**; row cells `["tick","—","tick","tick"]`; row height 48px at y=986 |

**Nothing splits across pages.** The rasterised pages were opened and inspected: the Buzzer tracking
row renders whole on **page 2**, second row from the top, label and both wrapped detail lines
together inside one 48px band, with a clean rule above and below. No row in the document is cut by
the page boundary.

The tick glyph is the SVG tick added earlier this session (Open Sans, the only font
`@sparticuz/chromium` bundles, has no U+2713), and it renders correctly in the new row.

## 9. What I did not touch

- No protected string was edited: the `Online ordering — Pay at Hatch` label, the bare `—`
  not-included value, the Pizzeria Gusto testimonial, `lib/features.ts`, `lib/pricing.ts`,
  `app/landing/layout.tsx` and the `/compare` gates are all unchanged.
- No SQL, no migration, no credential.
- Nothing committed, nothing deployed.

## Open item for you to decide

The row now advertises a Starter exclusion that the code does not enforce (item 6). Two honest
options: build a real gate in the `set_buzzer` handler and add the matching `ROW_FEATURE_MAP` entry,
or leave the row unmapped and accept that Starter trucks can use buzzers today. I have not chosen —
say which and I will build it.
