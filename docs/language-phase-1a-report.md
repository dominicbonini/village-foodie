# Language Phase 1a — customer-facing text into the message files (no visible change)

**Status:** built, proven, not committed (as instructed — no commit in this phase).
**Base:** `ed1d4c2` (HEAD = origin/main). Step 0 skipped (answer 1, option A); BEFORE captured on `ed1d4c2` as it stands.
**SQL:** none. Nothing to run now or after deploy.

---

## 1 · What moved

Every customer-facing word in scope now lives in `messages/en-GB.json` — **411 new messages in 15 namespaces** (414 in the file with Phase 0's three). `messages/en-US.json` is still `{}`, so US output is en-GB's, byte for byte.

| Namespace | Messages | Surface |
|---|---:|---|
| `order` | 167 (+1 from Phase 0) | the order page, its sheet, item and allergen modals, the in-page confirmation and the `?confirm=` receipt |
| `orderStatus` | 32 | the status / cancel page (`app/order/[id]/manage`) |
| `privateLink` | 10 | the private-link page (`app/p/[token]`) |
| `errorsCustomer` | 35 | every customer-facing API refusal, the payment-return refusals, the sold-out sentences |
| `emailCustomer` | 114 | every customer email — subject, HTML and text — and the payment-note boxes |
| `whatsappCustomer` | 11 | the fixed WhatsApp replies (greeting, allergen redirect, menu fallback and summary, caveat, schedule fallback) |
| `deals` | 15 | the deals picker (`components/dashboard/DealsModal.tsx`) |
| `charges` | 9 | `lib/order-charge-lines.ts` / `ChargeRows` |
| `eventCard` | 4 | `components/TruckListCard.tsx` (the order page's event chooser) |
| `preorder` | 4 | `lib/preorder.ts` labels |
| `phone` | 3 | `lib/phone.ts` refusals |
| `menuBadges` | 3 | `OptionStockBadge`, `SpiceLevel` |
| `modifierRules` | 2 | `lib/modifier-rules.ts` `groupRuleLabel` (customer and operator audiences — one function) |
| `soldOut` | 1 | the name list in the sold-out sentence |
| `orderLine` | 1 | `components/dashboard/OrderLineItem.tsx` |

`lib/phone-copy.ts` carries no customer sentence (only a console line), so nothing moved from it. `app/order/[id]/page.tsx` — "the confirmation page" — is the QR redirector and renders no text; the confirmation customers see is the order page's `?confirm=` receipt, which is covered. `components/MenuAllergenChips.tsx` has no words of ours (the chips print the truck's allergen data).

### How each surface reads its words
- **Client components** use `useT(namespace)`. **Server code** (routes, emails, promote-draft, WhatsApp, the private-link server component) uses `translatorFor(locale, namespace)` with the truck's locale, from the new `lib/i18n/server-locale.ts` `localeForTruck` (the truck's country's `country_settings.locale`; en-GB when the truck is not known yet).
- **Shared library functions** (`chargeLinesFor`, `chargeLineText`, `soldOutRefusalMessage`, `phoneErrorMessage`, `groupRuleLabel`, `formatPreorderLabel`, `formatPreorderOpenLabel`, `rejectionPaymentSentence`) take an optional `locale` and default to en-GB; in-scope callers pass the truck's.
- **Whole sentences.** Each sentence is one ICU message with placeholders; values arrive formatted by `lib/money-format.ts` / `lib/time-utils.ts` as strings. Bold words and links are rich-text tags (`<b>`, `<link>`, `<brand>`, `<muted>`) — in emails via `t.markup`, on pages via `t.rich`. The cancel link's tag function supplies the exact line breaks the HTML always had around it.
- **Plurals** are ICU plurals (`order.itemCount`, `errorsCustomer.too_many_options`, the sold-out "it"/"them"). Where today's UK text is wrong, the output is kept and listed (§6).
- **No new case changes.** Existing `toLowerCase` calls and CSS `uppercase`/`capitalize` stay and are listed.

### Providers (`lib/i18n/namespaces.ts`)
- `order`: `order`, `errorsCustomer`, `eventCard`, `orderLine`, `deals`, `menuBadges`
- `confirmation` (status page): `orderStatus`, `errorsCustomer`
- `dashboard`: `dashboard`, `orderLine`, `deals`, `menuBadges` (the shared controls it renders)
- `manage`: `eventCard`, `menuBadges` (TruckListCard and SpiceLevel appear there)

**A gap found and closed:** `pickNamespaces` limits only what a provider passes; a shared control calling `useT(ns)` under a provider that did not send `ns` would have printed raw keys. `useT` now falls back to the full catalogue for the provider's locale when its namespace is absent (both message files are already in every client bundle, so this costs nothing). Proven: the deals picker renders the same words under no namespace, the dashboard's set and the order page's set.

### Effects hold codes, not sentences
Three states on the order page (`confirmError`, `error`, `payError`) and one on the status page (`error`) were set *inside effects*. Translating there would have made the translator an effect dependency — and the effects (menu load, confirmation polling, Stripe mount) would have re-run when the truck's language arrived. They now store a **code** (`order.state.*`, `orderStatus.loadFailed`), and the render looks the words up. Anything else in those states (a server's sentence, Stripe's own message) is shown as it is.

---

## 2 · The two named differences

### Named difference 1 — `?payment_failed=` carries a code
`/api/payments/return` used to redirect with the sentence in the URL. It now sends `payment_failed=<code>` (a key of `errorsCustomer`) and, when the sentence has values, `payment_failed_params=<JSON>` (e.g. `{"names":"Fish Cake and Chicken Satay","count":2}`). The order page renders the message for the code — exactly today's words. A link that still carries a sentence (issued before deploy, or bookmarked) is shown as it always was.

Proven per refusal case (13 redirect cases: four from promoteDraft's own refusals, seven "already refused" reasons, plus the non-refusal outcomes):
- same address, same other parameters in the same order — only `payment_failed` changed and `payment_failed_params` was added;
- the code's words equal the sentence the URL carried, character for character;
- **the order page renders the code URL exactly as it rendered the sentence URL** (full HTML, byte for byte);
- every non-refusal redirect (`?confirm=`) is byte-identical.

### Named difference 2 — customer-facing API refusals gain `"code"` and `"params"`
Every refusal from `app/api/orders/submit`, `app/api/orders/cancel`, `app/api/orders/[id]`, `app/api/menu/[truckId]`, `app/api/slots/[truckId]` and the `/api/payments/return` JSON reply is built by `customerErrorBody` (`lib/i18n/customer-errors.ts`):
`{ error: <today's English>, …every field it already carried, in its place…, code, params }`.
The screens read `code` + `params` through `errorText` (order page: menu-changed notice, card-unavailable, failed submit, in-page refusal; status page: load and cancel errors) and so show exactly today's words. The one route that already sent `code: 'account_closing'` keeps it in place and gains `params` after it.

Proven field by field, for every case the harness drives (31 API cases × GB and US, 13 JSON payment replies):
- status unchanged; no redirect, or the same one; **every email the request sends is byte-identical**;
- **the BEFORE body is the exact text prefix of the AFTER body** (`AFTER.startsWith(BEFORE minus its closing brace + ",")`);
- every BEFORE field unchanged and in its place; the only fields added are `code` and `params`, last;
- `code` is a message in `errorsCustomer`; `params` is an object of strings and numbers;
- the message for the code, with its params, **equals today's `error` text in en-GB and en-US**.

Refusal sites no fixture reaches (unmet required options, too many options, an option sold out, card unavailable ×3, lock contention, a closed category, a stock shortfall, the save failures, the catch-all) go through the same `customerErrorBody`; their message text is proven to come from `ed1d4c2`'s source (§3, provenance), and `tsc` checks each call's code against the message file.

Codes: `missing_fields`, `truck_not_found`, `account_closing`, `event_not_available`, `orders_paused`, `menu_changed`, `menu_changed_item`, `menu_changed_option`, `private_link_only`, `preorder_not_open`, `tip_invalid`, `item_sold_out`, `too_many_options`, `choose_group`, `choose_option`, `option_sold_out`, `card_unavailable`, `busy_retry`, `category_closed`, `items_sold_out`, `save_failed`, `try_again`, `order_key_required`, `order_not_found`, `cancellations_not_accepted`, `cannot_cancel`, `cancel_window_passed`, `cancel_failed`, `something_went_wrong`, `event_not_confirmed`, `order_not_placed`, `truck_not_taking_orders`, `category_closed_paying`, `sold_out_paying`, `sold_out_ordering`.

`lib/payments/promote-draft.ts` refusals now return `customerCode` and `customerParams` beside the unchanged `customerMessage` (`GENERIC_REFUSAL` became the `order_not_placed` code). `/api/payments/return` rebuilds an "already refused" sentence from the stored reason as a code too, and reads the truck's country by its slug for the reply's language.

**Locale of a refusal:** the truck's, once known; en-GB before the truck is found. `app/api/orders/[id]`'s two 404s are both en-GB **on purpose** — the route already gives "wrong truck" the same body as "not found" so a prober learns nothing, and a translated body on one of them would undo that.

---

## 3 · Proof

### `scripts/language-phase-1a.cjs` — 1,050 checks, 0 failed
BEFORE (`scripts/fixtures/language-phase-1a-before.json.gz`) was captured on the clean `ed1d4c2` tree. As fixtures were added during the phase, BEFORE was re-captured from a **clean `git worktree` of `ed1d4c2`** with the current harness copied in — never from edited code. Captured twice and compared: **deterministic**. GB and US fixtures throughout.

| Section | Answers | What |
|---|---:|---|
| order page | 138 | ~70 states × GB/US, full HTML: loading, errors, no events, events error, the menu (allergens, paused ×3 reasons, unavailable, time not set, closed, unconfirmed, ended, ended-at-time, demo ended, private named/unnamed, multi-event chooser), basket, discount, item modal (empty, edit, upsell), deal modal, the sheet (card / hatch / tip presets / other tip over the cap / no card / slots / slots loading / chosen time / no time selection / phone and email errors / every notice), payment (ready, authorising, processing, failed, card-form failure), submitting, the in-page confirmation (plain, auto-accepted, slot changed, ASAP, preferred, card fallback), the `?confirm=` receipt (loading, every error, missing, paid, pending, ASAP, cancelled), and the `payment_failed` URL |
| status page | 34 | every order status, paid, part-paid, no cancellations, cutoff 0, cancelling, cancelled, cancel error, ASAP, loading, load error and load failure |
| private-link page | 6 | ok-without-slug, ordering off, replaced, made public, unknown, unavailable |
| shared pieces | 116 | charge lines ×6 sources ×3 audiences, sold-out sentences, pre-order labels, phone sentences and placeholders, modifier rule labels, stock and spice badges, chips, ChargeRows, the deals picker (list, two deals, from basket, five slot states: unmet, met, all filled but unmet, basket units used/taken, savings) |
| emails | 159 | the confirmation in 30 variants per country (every payment state, ready variant ×6, slot changes, contact methods, socials, no notes, no venue, no cancel, no base URL…), payment notes ×18, cancellation and rejection sentences, and every sender captured from a stubbed Brevo (refund full/partial, cancellation ×4, event cancellation ×3) |
| WhatsApp | 16 | ignore, allergen (first / follow-up), deterministic menu summary (with an un-categorised item), LLM reply with and without the allergen caveat, schedule fallback (first / follow-up) |
| API | 62 | the refusals above, a placed order, a successful cancel — and the operator routes' customer emails: confirm, reject (with/without reason), cancel (reason / refunded / declined), ready, edit (total moved / same), slot moved |
| payment return | 26 | 13 outcomes × redirect and JSON |

- **§1 byte-identical** — every section except the two named differences, view by view.
- **States set by an effect** carry a code AFTER; each has a fixture whose BEFORE holds the sentence and whose AFTER (`__after`) holds the code — the renders are byte-identical.
- **§2 / §3** — the named differences, as in §2 above.
- **§4** — providers and namespaces: the deals picker under no namespace / the dashboard's / the order page's shows its words, byte-identical; `NAMESPACES.order` and `.confirmation` send every namespace their components read; `en-US.json` is `{}`.

### messages-parity — 2,126 passed, 0 failed
New area `scripts/_messages-parity-1a.cjs` (registered in `AREAS`): BEFORE (`ed1d4c2`) against AFTER for all 411 messages.
- every literal run of every message, **each select and plural branch on its own**, is text `ed1d4c2`'s source already carried;
- 14 messages are sentences `ed1d4c2` *built from pieces* (a ternary word, a joined string, an added `s`, `&mdash;` in HTML) and are whole sentences now — matched word by word and listed: `order.modalSave`, `order.modalAdd`, `modifierRules.operator`, `deals.ruleHint`, `emailCustomer.payNote.partPaidTitleOwing`, `…partPaidBodyFigures`, `…heldShortTitleOwing`, `…heldShortBody`, `…heldShortBodyFigures`, `emailCustomer.confirmation.textTitleReceived`, `errorsCustomer.sold_out_paying`, `…sold_out_ordering`, `…menu_changed_option`, `…too_many_options` (their renders are compared byte for byte by language-phase-1a);
- 216 plain messages are strings `ed1d4c2`'s surfaces rendered; the 39 plain ones on paths no fixture reaches are found verbatim in its source;
- plus the Phase 0 checks: valid ICU, no apostrophe next to a brace, every message renders in en-GB and en-US with every plural and select variant.

### ui-literals
In-scope files went down and the baseline was lowered to match (2,635 → 2,502 in scope): order page 106 → **2**, status page 12 → 0, private-link page 4 → 0, DealsModal 9 → 0, OptionStockBadge 2 → 0, TruckListCard 1 → 0, OrderLineItem 1 → 0. The order page's two remaining are the header logos' `alt` texts, **"Village Foodie" and "HatchGrab" — brand names**, which stay as they are. No new file carries inline text.

### Precompile — tried
**Kept.** `next.config.ts` now passes next-intl's plugin `experimental.messages = { path: "./messages", format: "json", locales: "infer", precompile: true }`. The build compiles every message once and the browser (and the server) carry next-intl's format-only formatter instead of the ICU parser.

- **Byte-identical, proven.** A proof script formats every message both ways — today's formatter on the raw strings, and `icu-minify/compile` + use-intl's `format-only` (bundled with exactly the alias the plugin sets) — for every plural and select branch (plurals at 0, 1, 2 and 1,234), with markup tags as strings and as React rich text, in en-GB and en-US: **1,038 renders, 0 different**. The aliased bundle contains no `IntlMessageFormat` (69 KB against 134 KB).
- **The build ships compiled messages.** `.next` carries `orderFrom":["Order from ",…` (compiled), no raw `{truck}` string, and no `IntlMessageFormat` in any client or server chunk.
- **It runs.** The precompiled build was started locally (`next start`, port 3457, stopped by PID afterwards) and asked three things that answer before any database read: `POST /api/orders/submit {}` → `{"error":"Missing required fields","code":"missing_fields","params":{}}`; `/api/payments/return?truck=x` → 303 to the menu; `/p/not-a-token` → "PRIVATE EVENT" / "This link doesn’t work" / its body. No truck was touched.
- **Build clean:** `next build` exits 0.
- One guard added for it: `lib/i18n/messages.ts` `deepMerge` treats an array as a leaf — a compiled message can be an array, and the first en-US override would otherwise have merged two of them index by index. Nothing changes today (`en-US.json` is `{}`).
- `scripts/_language-phase-0-after.cjs` checked the plugin line's exact text; it now also accepts this object form (same request config, and only the precompile added).

### Bundle size per page (client JS, from each page's client-reference manifest)
Measured from `.next` after three builds: BEFORE (`ed1d4c2`, untouched tree), AFTER without precompile, and AFTER with precompile (kept). Raw KB / gzip KB; the change in brackets is gzip against BEFORE.

| Page | BEFORE | AFTER, no precompile | AFTER, precompile (kept) |
|---|---|---|---|
| /trucks/[slug]/order | 840.6 / 245.1 | 866.7 / 252.6 (+7.5) | 837.8 / 244.2 (**−0.9**) |
| /order/[id] | 513.6 / 151.1 | 540.8 / 159.5 (+8.4) | 511.9 / 151.2 (+0.1) |
| /order/[id]/manage | 529.6 / 156.6 | 557.5 / 165.2 (+8.6) | 528.6 / 156.8 (+0.2) |
| /dashboard/[token] | 1319.7 / 383.2 | 1347.3 / 391.8 (+8.6) | 1318.4 / 383.4 (+0.2) |
| /dashboard/[token]/kds | 846.0 / 244.9 | 873.6 / 253.5 (+8.6) | 844.7 / 245.2 (+0.3) |
| /kds/[kds_token] | 846.0 / 244.9 | 873.6 / 253.5 (+8.6) | 844.7 / 245.2 (+0.3) |
| /manage/[token] | 1702.0 / 475.0 | 1729.7 / 483.7 (+8.7) | 1700.8 / 475.4 (+0.4) |
| /setup | 650.5 / 186.0 | 678.1 / 194.6 (+8.6) | 649.1 / 186.2 (+0.2) |
| / | 667.8 / 192.9 | 731.4 / 212.1 (+19.2) | 702.6 / 204.2 (**+11.3**) |
| /trucks/[slug] | 541.8 / 161.8 | 606.9 / 181.5 (+19.7) | 578.1 / 173.8 (**+12.0**) |
| /venues/[slug] | 647.7 / 185.8 | 711.3 / 205.1 (+19.3) | 682.5 / 197.2 (**+11.4**) |
| /domain | 500.9 / 149.2 | 565.9 / 168.9 (+19.7) | 537.0 / 160.5 (+11.3) |
| /admin | 1015.2 / 288.0 | 1078.9 / 307.3 (+19.3) | 1050.1 / 299.3 (+11.3) |
| /admin/outreach/p/[prospectId] | 1108.0 / 322.8 | 1171.6 / 342.0 (+19.2) | 1142.8 / 334.0 (+11.2) |
| /dev/ticket-preview | 513.0 / 153.0 | 576.7 / 172.2 (+19.2) | 547.9 / 164.2 (+11.2) |
| /landing, /features, /p/[token], /trucks, /login, /signup and the other 18 pages | — | unchanged | unchanged |

**⚠️ A finding for the next phase.** The pages that already had a provider grow by nothing once precompiled. The pages in bold had **no** next-intl at all before, and now load it with the whole catalogue (~11 KB gzip): they render a shared piece this phase gave words to — `TruckListCard` on the public truck, venue and home pages, or a library such as `lib/order-charge-lines.ts` that now reads its labels through `translatorFor`. The cause is Phase 0's design, which this phase inherits: `lib/i18n/messages.ts` imports BOTH message files statically, so any client bundle that reads one message carries every message. Splitting the catalogue per namespace (or per surface) would take this back to near zero; it is a structural change to the Phase 0 plumbing, so it was measured and left for Phase 1b rather than made here.

### Checks
- **`tsc --noEmit`** — clean.
- **eslint** — compared rule by rule, per file, against `ed1d4c2` for all 33 changed or new TypeScript files (`next.config.ts` among them): **no rule count grew in any file**. (One did mid-phase — the status page's load effect read the translator, `react-hooks/exhaustive-deps` +1 — and was fixed by the effect-holds-a-code pattern in §1.)
- **`next build`** — exits 0, both without precompile and with it (kept).
- **Full sweep** — `node scripts/run-harnesses.cjs`: **116 of 116 harnesses pass**, exit 0, after the last change (all 116 also pass the runner's source screen). Among them `language-phase-1a` (1,050), `messages-parity` (2,126), `ui-literals`, `language-phase-0` (168), `money-sweep-parity` (GB: all 3,057 rendered strings and byte streams identical to its fixture), `phase3-screens`, `order-charges`, `us-readiness`, `marketing-country-parity` (121/121), `phone-parity`, `event-pricing` (135), `private-events` (206).
- The temporary clean worktree of `ed1d4c2` used for the BEFORE captures was removed afterwards; nothing else was left behind.

---

## 4 · Existing harnesses re-pinned (named edits)

- `scripts/_slot-interval-compile.cjs` (shared by ~70 harnesses) and `scripts/whatsapp-background-jobs-harness.cjs` — `resolveJsonModule: true`, because a component that reads its words imports `lib/i18n/messages.ts`, which imports `messages/*.json`.
- Eight harnesses that copy `lib`/`components`/`app` into a temp tree for a "broken variant" compile now copy `messages` too: `add-order-render`, `add-order-refresh`, `add-order-refresh-inputs`, `breach-banner-dismiss`, `demo-welcome-open`, `dot-overlap-labels`, `ready-press-one-press`, `sixteen-pizza-admission`.
- `scripts/event-pricing.cjs` — its line-by-line diff of the menu API excuses, by count, the four lines Phase 1a replaced (the two refusals), with a companion check that both replacements are there. Nothing on the price leg moved.
- `scripts/phone-parity.cjs` — the order page's phone box now passes its language and wraps the same example in `order.phonePlaceholder`; the two source patterns follow, and every rendered GB/US phone check is unchanged.
- `scripts/schedule-graphics-places.cjs` — **failing on `ed1d4c2` itself, not caused by this phase**: its `truck_events` write-payload tripwire counted 4 unreadable payloads where it expected 3. The fourth is `lib/demo-restart.ts`'s `.update(s.columns)` from the demo "Reset for sending" work. Re-pinned to 4 with a hand check (4): those columns come from the fixed `EVENT_SETTING_COLUMNS` list and `truck_place_id` is not one of them.

---

## 5 · What remains inline in the in-scope files, and why

- **Brand names** — the header logos' `alt` ("Village Foodie", "HatchGrab"); "Powered by HatchGrab · hatchgrab.com" lives in messages, the brand inside it is a name.
- **Formats with no words** — `2× Margherita`, `+ Extra cheese`, `🎁 Lunch deal: …`, `↳ + …`, `📝 note`, `✓`, `−`, `+`, `×`, `▾`, the `·` separators, `{amount} → {amount}` savings, `⏳ {label}`, `0.00` (the tip box placeholder), and the text email's `2x Margherita — £21.50` lines (the one letter there is the multiplication `x`).
- **The operator's "🔔 New order" email** (`formatNewOrderEmail`) — operator-facing, out of scope; it shares `renderOrderLinesHtml` and the charge rows, whose words did move.
- **WhatsApp prompts** — instructions to the model, out of scope (rule 10's phase). The greeting the prompt asks for is now read from the same message as the fixed replies, so the two cannot drift.
- **`getBundleAvailabilityMessage`** in the order page had no caller; it was deleted rather than translated.

---

## 6 · Listed for later (each would be a visible change, so none was made)

1. **Wrong plurals kept** — "up to 1 minutes before pickup" (`orderStatus.cutoffNote`), "within 1 minutes of collection" (`errorsCustomer.cancel_window_passed`), the confirmation email's "(up to 1 minutes before your pickup time)" (`emailCustomer.confirmation.cancelLine`). All three are ICU plurals now whose branches print today's text; fixing them is editing one message each.
2. **Pre-order labels ignore the truck's country** — `formatPreorderLabel` writes a 24-hour `HH:MM` and an en-GB day for every truck, and the menu route calls it without a locale. Passing the US truck's locale would change the US date to "Sat, Oct 10" — a visible US change, so it was not done.
3. **List joining written by hand** — `", "` in the sold-out names, the stock notice's item list, the deal summaries (`" + "`), modifier lists and email venue lines; WhatsApp's Oxford ", and". The final "and" moved to messages; the comma did not. `Intl.ListFormat` was deliberately **not** used: en-US would add an Oxford comma to the sold-out sentence.
4. **Percentages written by hand** — `{rate}%` (`charges.rate`) and the tip buttons' `15%`.
5. **Case changes kept** — `cap()` on category and sub-category names (the order page's chips and headings), `taxLabel.toLowerCase()` in the tax notice, `category.toLowerCase()` in the "3 drinks left" badge, CSS `capitalize` on the status page's status names (now messages, lower-case as before), CSS `uppercase` on headings, and the literal "PRIVATE EVENT" (`privateLink.guestLabel`).
6. **"We couldn&apos;t find that order."** — the `?confirm=` fallback has always printed the entity literally (a JSX entity inside a JS string). Kept byte for byte as `order.confirmMissing`; the fix is one message.
7. **"Private event"** for an unnamed private event comes from the server (`privateDisplayName` / `PRIVATE_PUBLIC_NAME`), which also redacts the public schedule — a later phase's surface.
8. **Sentences that are a fragment inside a sentence** — the stock notice wraps a list of "only {count} {name} left" phrases; the sold-out sentence takes "your {name} deal" among its names. Whole sentences around a list, but a language with case endings may want them restructured.
9. **`modifierRules.operator`** (the operator's "Customer can choose up to N") moved with the customer label because it is the same function; the operator surfaces are a later phase.

---

## 7 · Files

**New:** `lib/i18n/customer-errors.ts`, `lib/i18n/server-locale.ts`, `scripts/language-phase-1a.cjs`, `scripts/_language-phase-1a-after.cjs`, `scripts/_messages-parity-1a.cjs`, `scripts/fixtures/language-phase-1a-before.json.gz`.

**Changed — code:** `app/trucks/[slug]/order/page.tsx`, `app/order/[id]/manage/page.tsx`, `app/p/[token]/page.tsx`, `app/api/orders/submit/route.ts`, `app/api/orders/cancel/route.ts`, `app/api/orders/[id]/route.ts`, `app/api/menu/[truckId]/route.ts`, `app/api/slots/[truckId]/route.ts`, `app/api/payments/return/route.ts`, `app/api/dashboard/action/route.ts` (the three customer emails it builds), `components/ChargeRows.tsx`, `components/OptionStockBadge.tsx`, `components/SpiceLevel.tsx`, `components/TruckListCard.tsx`, `components/dashboard/DealsModal.tsx`, `components/dashboard/OrderLineItem.tsx`, `lib/email.ts`, `lib/orders/reject-order.ts`, `lib/payments/promote-draft.ts`, `lib/payments/sold-out-copy.ts`, `lib/order-charge-lines.ts`, `lib/preorder.ts`, `lib/phone.ts`, `lib/modifier-rules.ts`, `lib/whatsapp-classifier.ts`, `lib/private-events/copy.ts` (the guest strings moved out), `lib/private-events/read.ts` (selects the truck's `country`; the "The food truck" fallback moved to the page), `lib/i18n/client.tsx` (`useT` fallback, `useAppLocale`), `lib/i18n/messages.ts` (`deepMerge` treats an array as a leaf), `lib/i18n/namespaces.ts`, `messages/en-GB.json`, `next.config.ts` (message precompile).

**Changed — harnesses:** `scripts/messages-parity.cjs` (AREAS), `scripts/fixtures/ui-literals-baseline.json` (lowered), `scripts/harnesses.json` (registered `language-phase-1a.cjs`; `_language-phase-1a-after.cjs` and `_messages-parity-1a.cjs` as shared modules), `scripts/_language-phase-0-after.cjs` (the plugin line, §3), and the re-pins in §4.

`supabase/.temp/cli-latest` was already modified by the Supabase CLI and is untouched.
