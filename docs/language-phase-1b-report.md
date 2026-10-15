# Language Phase 1b — kitchen and operator text into the message files, and the catalogue split (no visible change)

**Status:** built, proven, not committed. Everything after Step 0 is uncommitted, as instructed.
**Step 0:** the Phase 1a changes are committed as one local commit, **`0914760`** (`09147605d0d73d2e6cca44c7bc84323bc125f0b2`), "Language phase 1a: customer text (checkpoint)", with parent **`ed1d4c2`**. It was not pushed. The commit left out `supabase/.temp/cli-latest`, which the Supabase CLI writes and which is not ours. BEFORE was captured on `0914760`.
**SQL:** none. There is nothing to run now or after deploy.
**Garbled or contradictory instructions:** none found. Smaller choices were made as the brief asks (UK and US output identical, one design) and are recorded where they occur (§2, §6).

---

## 1 · Part 1: the catalogue split

### The design
- **Authored files are unchanged.** `messages/en-GB.json` is the only file anyone writes. `messages/en-US.json` stays `{}`.
- **The split is generated.** `scripts/split-messages.cjs` writes two things from the authored files, and both are marked "generated — do not edit":
  - `messages/ns/<locale>/<namespace>.json`: 33 namespaces × 2 locales. These still go through next-intl's precompile, because the loader compiles every JSON file under `messages/`.
  - `lib/i18n/catalog/<namespace>.ts`: each calls `registerNamespace('<ns>', base, { 'en-US': enUS })`.
- **The generator runs automatically.** `package.json` runs it from `predev` and `prebuild`, so `npm run dev` and `npm run build` always use a fresh split.
- **Registry** (`lib/i18n/registry.ts`):
  - `namespaceMessages(locale, ns)` merges en-US over en-GB per namespace. The deep merge is in `lib/i18n/merge.ts`, and an array counts as a leaf, as in 1a. The result is cached.
  - `messagesOf(locale, namespaces)` builds a provider's messages.
- **A file carries only the namespaces it reads.** Every file that reads a namespace imports its catalog module (`import '@/lib/i18n/catalog/<ns>'`), so the bundler includes exactly those namespaces.
- **Clients read words through a light module.** Client components take `useT`, `useTruckLocale` and `useAppLocale` from `lib/i18n/use-t.ts`, which pulls in no message file.
  - `lib/i18n/client.tsx` keeps `I18nProvider` (`messagesOf(locale, NAMESPACES[...])` → `NextIntlClientProvider`) and re-exports the hooks, so old imports still work.
  - `lib/i18n/translator.ts` (`translatorFor`) reads through the registry too.
  - Only server code and harnesses import the whole catalogue (`lib/i18n/messages.ts`): next-intl's `request.ts` and the parity scripts.

### What was kept
- **Precompile** (`next.config.ts`) is unchanged and still compiles every message file.
- **Typed keys** are unchanged. `lib/i18n/typecheck.ts` still types against the authored en-GB file.
- **The en-US-over-en-GB merge** is now done per namespace. The result is the same: en-US is `{}`, so every namespace equals en-GB.
- **useT works without a provider.** It then falls back to en-GB, because it reads the registry directly.
- **A shared control never shows a raw key** (the 1a fallback). This is now built in: `useT(ns)` reads its namespace from the registry, not from the provider. Any file that calls `useT(ns)` must import that namespace's catalog, and `messages-split` checks this.

### Guard: `scripts/messages-split.cjs` (new, 72 checks, passing)
1. Every generated file matches what the generator would write now.
2. Every file that reads a namespace imports its catalog. `--fix` adds a missing import.
3. No client-reachable file imports the whole catalogue. Type-only imports are allowed.
4. Each `NAMESPACES` entry in `lib/i18n/namespaces.ts` covers every namespace its page's import graph reads. `--list` prints them.

`.cursor/rules/language.mdc` rule 1 gained two sub-bullets: import the catalog and never edit the generated files; refusal bodies come from `customerErrorBody` / `kitchenErrorBody`.

### Two leaks found and closed
Measuring showed every page about +5.4 KB gz. The cause: two widely imported modules imported a catalog only for one helper.
- `lib/native/device.ts` (imported almost everywhere) imported the `nativeShell` catalog for `saveFailureMessage`. That function moved to `lib/native/deviceSaveText.ts`; `device.ts` keeps `saveFailureKey`.
- `lib/phone.ts` imported the `phone` catalog for `phoneErrorMessage`. That function moved to `lib/phone-message.ts`. Its callers (the order page, the setup page, Manage, `DemoGetStarted`, `api/setup`) now import it from there.

### Client JS per page (gzipped KB, from each page's client-reference manifest, after `next build`)

| Page | ed1d4c2 | Step 0 (0914760) | After 1b | vs Step 0 | vs ed1d4c2 |
|---|---:|---:|---:|---:|---:|
| / | 192.9 | 204.2 | 192.7 | −11.5 | −0.2 |
| /(legal)/privacy | 143.9 | 143.9 | 143.9 | +0.0 | +0.0 |
| /(legal)/terms | 143.9 | 143.9 | 143.9 | +0.0 | +0.0 |
| /1ng7n4p5omux2gdk9kqvwz | 151.3 | 151.3 | 151.3 | +0.0 | +0.0 |
| /_global-error | 7.5 | 7.5 | 7.5 | +0.0 | +0.0 |
| /_not-found | 139.4 | 139.4 | 139.4 | +0.0 | +0.0 |
| /admin | 288 | 299.3 | 294.6 | −4.7 | +6.6 |
| /admin/outreach | 139.5 | 139.5 | 139.5 | +0.0 | +0.0 |
| /admin/outreach/p/[prospectId] | 322.8 | 334 | 322.6 | −11.4 | −0.2 |
| /admin/whatsapp-connections | 141.5 | 141.5 | 141.5 | +0.0 | +0.0 |
| /admin/whatsapp-templates | 142.1 | 142.1 | 142.1 | +0.0 | +0.0 |
| /app | 140.6 | 140.6 | 140.5 | −0.1 | −0.1 |
| /compare | 160.4 | 160.4 | 160.3 | −0.1 | −0.1 |
| /contact | 144.7 | 144.7 | 144.7 | +0.0 | +0.0 |
| /dashboard | 139.9 | 139.9 | 139.8 | −0.1 | −0.1 |
| /dashboard/[token] | 383.2 | 383.4 | 386.7 | +3.3 | +3.5 |
| /dashboard/[token]/kds | 244.9 | 245.2 | 244.1 | −1.1 | −0.8 |
| /dev/ticket-preview | 153 | 164.2 | 156.8 | −7.4 | +3.8 |
| /domain | 149.2 | 160.5 | 152.5 | −8.0 | +3.3 |
| /features | 145.2 | 145.2 | 145.1 | −0.1 | −0.1 |
| /forgot-password | 140.5 | 140.5 | 140.5 | +0.0 | +0.0 |
| /hire | 143 | 143 | 143 | +0.0 | +0.0 |
| /kds/[kds_token] | 244.9 | 245.2 | 244.1 | −1.1 | −0.8 |
| /landing | 151.3 | 151.3 | 151.3 | +0.0 | +0.0 |
| /login | 141.1 | 141.1 | 141.1 | +0.0 | +0.0 |
| /manage | 139.5 | 139.5 | 139.5 | +0.0 | +0.0 |
| /manage/[token] | 475 | 475.4 | 472.5 | −2.9 | −2.5 |
| /o/[slug] | 139.5 | 139.5 | 139.5 | +0.0 | +0.0 |
| /order/[id] | 151.1 | 151.2 | 143.5 | −7.7 | −7.6 |
| /order/[id]/manage | 156.6 | 156.8 | 150.8 | −6.0 | −5.8 |
| /p/[token] | 139.5 | 139.5 | 139.5 | +0.0 | +0.0 |
| /reset-password | 141.2 | 141.2 | 141.1 | −0.1 | −0.1 |
| /setup | 186 | 186.2 | 178.8 | −7.4 | −7.2 |
| /signup | 141.5 | 141.5 | 141.5 | +0.0 | +0.0 |
| /trucks | 154 | 154 | 153.9 | −0.1 | −0.1 |
| /trucks/[slug] | 161.8 | 173.8 | 165.2 | −8.6 | +3.4 |
| /trucks/[slug]/order | 245.1 | 244.2 | 243 | −1.2 | −2.1 |
| /venues/[slug] | 185.8 | 197.2 | 185.7 | −11.5 | −0.1 |
| /verify-email | 140.1 | 140.1 | 140 | −0.1 | −0.1 |

**Goal pages: within 1 KB gz of ed1d4c2.**
- Met by `/` (−0.2), `/venues/[slug]` (−0.1) and `/admin/outreach/p/[prospectId]` (−0.2).
- Every page that renders no words of ours is back to its ed1d4c2 size (±0.1).

**Three goal pages remain above ed1d4c2, each because it now really renders our words:**
- **`/trucks/[slug]` (+3.4) and `/domain` (+3.3)** render `TruckListCard`. Its "Order from …" / "Coming soon" words have been the `eventCard` namespace since 1a.
- **`/dev/ticket-preview` (+3.8)** renders the ticket, so it carries `ticket` and `charges`.
- **`/admin` (+6.6)** renders the kitchen's shared components (order cards, the payment and event modals), so it carries their namespaces.

On those pages the remainder is three things:
1. **The next-intl `createTranslator` runtime, about 2.3 KB gz** (measured alone). Before, it reached these pages through `NextIntlClientProvider` only on pages that had one; `useT` now uses it directly. Importing from `use-intl/core` instead saved nothing.
2. **The hooks and the registry, about 0.5–1 KB.**
3. **The compiled JSON of the namespaces the page renders.**

None of the three can be dropped while the words come from the message files. The goal pages that render no words of ours lost the whole Step 0 growth.

**Kitchen pages.**
- `/dashboard/[token]` is +3.5 against ed1d4c2. About 1,000 messages moved into it in this phase, replacing inline strings of about the same weight. The extra is the same runtime and registry.
- KDS is −0.8. Manage is −2.5.
- The customer pages (`/order/[id]` −7.6, `/order/[id]/manage` −5.8, `/setup` −7.2, the order page −2.1) are now smaller than ed1d4c2. Under 1a they carried the whole catalogue; now each carries only its own namespaces.

---

## 2 · Part 2: what moved

**982 new messages in 17 namespaces.** `messages/en-GB.json` now holds 1,396 messages in 33 namespaces. `messages/en-US.json` is `{}`.

| Namespace | Messages | Surface |
|---|---:|---|
| `dashboard` | 313 | `app/dashboard/[token]/page.tsx`: header, event bar, settings, stock, intervals, toasts, demo states, errors |
| `kds` | 101 | `app/dashboard/[token]/kds/page.tsx` (also served at `/kds/[kds_token]`) |
| `nativeShell` | 99 | `components/native/*`; the biometric prompt (`lib/native/appLock.ts`); Android channel names (`lib/native/notifications.ts`, `push.ts`); the offline/outbox hooks; device setup |
| `addOrder` | 85 | `AddOrderPanel` |
| `printing` | 73 | `PrintingSettings`, `PrinterTypeChoice`, transport results (`lib/printing/printerText.ts`), the network guard, the address help |
| `errorsKitchen` | 63 | every refusal sent by `app/api/dashboard/*`, `app/api/printing` and `app/api/native/*` (§3) |
| `kitchenModals` | 53 | `components/shared/*`: the event actions, cancel, finish time, picker, extra wait and reject modals |
| `orderCard` | 41 | `OrderCard` |
| `paymentActions` | 33 | `PaymentActionsModal` |
| `ticket` | 23 | `lib/printing/ticket.ts`, `mapOrderToTicket.ts`, `testTicket.ts` |
| `demo` | 21 | `DemoWelcome`, `DemoLoopComplete`, `DemoLockChip`, `DemoModeBanner`, `KeepAwakePrompt` |
| `alertsOperator` | 20 | `lib/whatsapp/alert-copy.ts` (the operator's WhatsApp alert emails) |
| `userMenu` | 16 | `UserMenu` |
| `dashboardBanners` | 15 | `CapacityBreachBanner`, `BuzzerLostBanner`, `DayLoadStrip` |
| `buzzer` | 14 | `BuzzerGrid` |
| `emailOperator` | 10 | `formatNewOrderEmail` (the "🔔 New order" email) |
| `push` | 2 | the APNs/FCM "new order" title and body (`lib/apns.ts`, `lib/fcm.ts`) |

Out of scope and untouched: Manage (1d), onboarding (1c), marketing (1e), the WhatsApp AI prompts, the allergen safety floor, and native `Info.plist` / `strings.xml`.

### How each surface reads its words
- **Client components** use `useT(ns)` from `lib/i18n/use-t`. The dashboard and KDS layouts send the `dashboard` / `kds` provider sets (`lib/i18n/namespaces.ts`).
- **Server code** uses `translatorFor(locale, ns)` with the truck's locale (`localeForTruck`):
  - **Routes.** The route reads the locale only when it builds a refusal. Before the token has named a truck, the locale is en-GB.
  - **The operator email.** It uses the truck's time-settings locale, then the order's money locale, then en-GB.
  - **Alert emails** in the WhatsApp webhook.
  - **Push.** The submit route passes the locale to the push senders.
- **The ticket gets the truck's locale.** `TicketOrder.locale` comes from `truck.time.locale`, then the money locale, then en-GB.
  - Every ticket heading is written **in capitals in the message itself**: `MAY BE A DUPLICATE`, `REPRINT`, `COLLECT {time}`, `COLLECT ASAP`, `BUZZER {number}`, `TOTAL`, `PAYMENT`, `PAID`, `CARD HELD`, `DO NOT COLLECT`, `TO PAY`, `NOTE`, `TEST`.
  - The old `paymentStatus.replace('_',' ').toUpperCase()` is now a `ticket.paymentStatus` select whose branches print the same capitals.
  - All ticket messages are ASCII, so column widths at 58 and 80 mm are unchanged.
- **Optional trailing `locale` parameters**, defaulting to en-GB, were added to: `saveFailureMessage`, `verifyIdentity`, `registerForPush`, `notifyNewOrder`, `playNewOrderAlert`, `nameConflictOrders`, `sendOrderPendingPush`, `netAddressHelp`, `printerMessageText`, `formatNewOrderEmail` and the alert-copy builders.
- **Whole sentences, ICU plurals, values pre-formatted, tags for rich text**, as in 1a. 27 messages were built from pieces at `0914760` (a ternary word, a joined string, an added "s") and are whole sentences now. messages-parity lists each one, and their renders are compared byte for byte.

### States that are set in effects hold codes
As in 1a: a state set inside an effect or a `useCallback` holds a **code**, and the render looks up the words. Examples:
- the dashboard's `error` (`invalidAccessLink`);
- KDS `error.linkInvalid` / `error.couldNotLoad`;
- DeviceSetupGate `deviceSave.*`;
- the printing transport's `PrinterMessage`.

Callbacks that build a toast read the translator through a ref (`tRef` / `tDashRef`), written in a `useLayoutEffect`. This keeps the translator out of every dependency list, so no effect re-runs when the language arrives. **No `react-hooks/exhaustive-deps` count grew.**

### Display text is no longer a key
- **Reject reasons** compare ids: `['sold_out','too_busy','closing_soon','other']`.
- **Event-cancel reasons** compare ids: `['vehicle_breakdown','weather','venue_issue','personal_emergency','other']`.
- **The dashboard's cancel reasons** compare ids too.
- **The stored and emailed labels are unchanged.** The `<option value>` is still the label. On change, the code maps the value to its id through the rendered label, and only the id is compared. The words saved to the order or event and sent in the email are the same bytes as before; 22 `stored|…` views per country prove it.
- **ThisDeviceSettings** patches by id; it used to use the label. The gated-action labels are a select over the action id.
- **`USUAL_SETTING_TOAST`** became a message.

---

## 3 · Named difference 1: kitchen-facing refusals gain `"code"` and `"params"`

Every refusal *that we write* in `app/api/dashboard/route.ts`, `app/api/dashboard/action/route.ts`, `app/api/printing/route.ts` and `app/api/native/{bind-device,switch-truck,my-trucks}/route.ts` now comes from `kitchenErrorBody(locale, code, params, extra)` (`lib/i18n/kitchen-errors.ts`):

```
{ error: <today's English, byte for byte>, …every field it already carried…, code, params }
```

- `code` is a key of `errorsKitchen`, and `params` holds its values, already formatted (for example `{"amount":"£4.50"}` for `refund_only_left`).
- `code` and `params` come **last**, so each body as it was before is the unchanged prefix of the body now.
- **The status codes are unchanged.** So are `retry`, `reason` and every other existing field.
- **Locale.** A refusal sent before the token resolves is en-GB. After that, the truck's locale applies. Today both are en-GB in both countries.
- **Refunds** (`lib/payments/refund.ts`). Our own refusals carry `code`/`params`, with `detail` = the en-GB text, and the action route's refused/failed bodies use them. Stripe's own failure text passes through without a code.

**What has no code, on purpose: text we did not write.** It is passed through as it came:
- `err.message` / `error.message` from the database (e.g. bind-device's `upsert_failed`);
- switch-truck's `error?.message || 'switch failed'`;
- Stripe's `outcome.detail`.

**Proof** — `scripts/language-phase-1b.cjs`, area `api`: 142 views, GB and US, against BEFORE captured on `0914760`. For every refusal it checks:
- the same status;
- every BEFORE field is present with the same value, in the same order;
- the only added keys are `code` and `params`;
- `errorsKitchen[code]` rendered with `params` equals `error`, character for character.

Success bodies are compared whole and are byte-identical. A source check also proves two things: no literal refusal without a code is left in the kitchen routes, and `refund.ts` has no literal `detail`.

**Collisions and duplicates, listed:**
- **`optionStockWriteFailure`'s last-resort body** already had a field named `code`: the database's `err.code`. That body is a pass-through (the database's message) and keeps its `code` unchanged. It is the one kitchen body where `code` is not an `errorsKitchen` key.
- **`net_address_invalid`** has the same words as `printing.say.addressHelp`. The route and the screen each read their own message; a harness pins them as equal.

**Not yet done: kitchen screens do not read the code.** The server already sends `error` in the truck's language. Most dashboard and KDS call sites rethrow inside a callback and show `data.error`. Switching them to `errorText(t, body, fallback)` is listed for later (§6); it would not change any text today.

---

## 4 · Proof

### `scripts/language-phase-1b.cjs` — 3,687 checks, 0 failed
The harness is modular: one module per area (`scripts/_lp1b-<area>.cjs`), with shared fixtures in `_lp1b-fixtures.cjs` (GB and US countries, 14 order cases).
- **BEFORE** is stored as `scripts/fixtures/language-phase-1b-before/<area>.json.gz` (2,542 views). It was captured with `--recapture=<areas>` in a temporary clean `git worktree` of `0914760`, which was removed afterwards.
- **AFTER** renders the same views from the working tree and compares them byte for byte. The one exception is `api`, whose `compare` proves named difference 1 field by field.
- **Determinism.** Each area was recaptured twice and the two files were byte-compared (`cmp`): identical.

| Area | BEFORE views | What it renders, GB and US |
|---|---:|---|
| `api` | 142 | every kitchen refusal and success body (§3); 1,275 checks run alone, because each refusal is proven field by field |
| `components` | 1,120 | every `components/dashboard/*` and `components/shared/*` component in each state: empty, loading, error, offline, each order status, each payment state, each modal step, `stored\|…` values |
| `dashboard` | 433 | the dashboard page: header, event bar, settings sections, stock, intervals, demo, error, toasts; its child components stubbed (they are covered by `components`) |
| `kds` | 202 | the KDS: loading, error, empty, columns, every card state, conflicts, offline |
| `native` | 108 | device setup, app lock, notification settings, offline banner, van chooser, outbox conflicts, gated actions, push and channel strings |
| `operatorMail` | 124 | `formatNewOrderEmail` for 14 order cases (subject, HTML, text), every alert-copy email |
| `printing` | 413 | ticket **bytes** at 58 and 80 mm for 14 order cases plus the test ticket and reprint, GB and US, `PrintingSettings` in each state, every transport and guard sentence |

The 3,687 checks are the views compared, plus the field-by-field proofs, the source checks (no literal refusal or sentence left in the moved code) and the `__after` checks of the codes held in state.

**Ticket bytes are identical** for GB and US at both widths, and identical to BEFORE. `printing-escpos-identity` passes independently.

### messages-parity — 7,068 passed, 0 failed
New area `scripts/_messages-parity-1b.cjs`, registered in `AREAS`.
- **Rule 1.** For each of the 982 messages added since `0914760`, every literal run of every select and plural branch must be text that `0914760`'s source already carried.
- **Rule 2.** A run that was built from pieces is matched word by word, and listed (27 such messages).
- **Rule 3.** A message with no values must be a string the BEFORE fixtures rendered (696) or, on a path no fixture reaches, the exact string in the source (31).

**AREAS BEFORE / AFTER:**
- BEFORE: Phase 0 + Phase 1a.
- AFTER: Phase 0 + Phase 1a + Phase 1b.

The earlier areas assert exactly what they did.

### ui-literals
The baseline was lowered from **2,502 to 1,838**. What remains in the files this phase touched:
- **In scope:** `&times;` in the dashboard page (a close glyph, no words).
- **Out of scope, left in place:** `CustomDomainSetup` 35 and `CopyButton` 2 (Manage, 1d); `AppHeader` 1, `CuisinePicker` 3, `PriceControls` 1 (onboarding and marketing).

### The other language harnesses
These pass unchanged in what they assert:
- `language-phase-0` (168);
- `language-phase-1a` (1,050);
- `messages-split` (72, new);
- `phone-parity`.

`_language-phase-0-after.cjs` gained only an `import '@/lib/i18n/catalog/order'` line in two of its harness bundles. This is setup; the assertions are unchanged.

### Checks
- **`tsc --noEmit`:** clean.
- **eslint:** compared rule by rule, per file, against `0914760` for every changed or new TypeScript file, including the generated catalogs. **No rule count grew in any file.** `react/no-unescaped-entities` fell from 3 to 0 in the dashboard page.
- **`next build`:** exits 0.
- **Runtime smoke test.** `next start` on a spare port was stopped afterwards by its PID. The dashboard GET with no token returns `{"error":"Missing token","code":"missing_token","params":{}}`. The action with bad JSON returns `something_went_wrong`. Submit `{}` returns `missing_fields`. `/p/not-a-token` renders "PRIVATE EVENT" / "This link doesn’t work". The compiled messages are in the page chunks.
- **Full sweep:** `node scripts/run-harnesses.cjs`, run after the last change: **118 run, 118 passed, 0 failed, exit 0.** Among them:
  - `language-phase-1b` (3,687), `messages-parity` (7,068), `messages-split` (72), `language-phase-1a`, `language-phase-0`, `ui-literals`;
  - `money-sweep-parity` (GB: all 3,057 rendered strings and byte streams identical to its fixture);
  - `printing-escpos-identity` (`renderTicket` byte-identical on 18 fixtures);
  - `phase3-screens`, `order-charges`, the `add-order-*` harnesses, `event-types` and `event-types-render`, `private-events`.

  The BEFORE-capture worktree of `0914760` was removed, and every server I started was stopped by its PID. `printing-escpos-identity` leaves its own `slot-head-escpos-*` worktrees in the system temp folder on each run, as it did before this phase (`git worktree list` also shows older ones at `f4bd277` and `234b6a2`). I left them alone; `git worktree prune` clears the stale entries whenever wanted.

No test touched Pizzeria Gusto. Only fixtures and Pizza Kitchen (`test-truck`) were used, and the US only through fixtures. No stored data, `outreach_templates` row or image was touched, and no email was sent.

---

## 5 · Existing harnesses re-pinned (named edits; none weakened)

**Printing.** These moved because the words moved into message files and code types:
- **`printing-escpos-identity.cjs`.** Its broken-variant compile copies the whole `lib` and `messages` trees and links `node_modules`.
- **`printing-gating.cjs`.** It copies `messages` too.
- **`printing-transport-contract.cjs`.** It compiles `printerText.ts` and reads sentences through `printerMessageText('en-GB', m)`.
- **`printing-copy.cjs`.** It checks the `printing.card` keys and their exact text, including `printerType` / `typeBluetooth` / `typeWired`.
- **`printing-network-guard.cjs`.** It reads guard sentences from `messages.printing.say`, including the pin branch `say({ code: 'guard', state: 'pin' })`. It also pins `net_address_invalid` = `addressHelp`, and the `device_id_required` code.

**Dashboard and events.** These moved because the anchors they searched for are now message keys:
- **`event-types.cjs`** (192):
  - the type-picker confirm keys and the RESTORED lines are pinned to keys;
  - "exactly one copy" now counts key references;
  - the Manage event rows are read via `kitchenModals.actions`;
  - the price-column slice is re-anchored on `tDash.rich('stock.howAvailable'`;
  - a new rule, `phase1bWordsMoved`, lists 12 allowed lines and has a companion check.
- **`event-types-render.cjs`:** anchors on `{tDash('stock.itemsTitle')}` and reads the `eventBar.manageEvent` aria-label.
- **`slot-interval-event-override.cjs`:** pins `settings.useUsual` / `intervalsUnavailable`, the card title, and `kErr('intervals_customer_first')` / `kErr('intervals_save_failed')`.
- **`batch-reservation-edit-lock.cjs`:** pins `kErr('busy_retry_edit', {}, { retry: true })` with 409, `kErr('busy_retry', …)`, and the dashboard's `showToast(data?.error||tDash('toast.editBusy'),'error')`.
- **`add-order-render.cjs`:** `{tDash('settings.intervalsTitle')}` = "Collection times".
- **`private-events.cjs`:** `kitchenModals.actions.privateLink` = "Private link & QR code".
- **`demo-welcome-open.cjs`:** its variants patch `messages/ns/en-GB/demo.json` in their temp tree. The repo's split was verified unchanged afterwards.

**Leak fixes.** These moved with the functions moved in §1:
- **`language-phase-1a.cjs`** reads the phone functions from both modules: `const PH = {...m.PHB, ...(m.PHM||{})}`.
- **`phone-parity.cjs`** does the same (`PHN`). It was renamed to avoid clashing with its existing `LP`.
- **`_lp1b-native.cjs`** reads `saveFailureMessage` from `deviceSaveText`.

**`design-fonts`.** My comment in `kitchen-errors.ts` contained `/*`, which tripped its scan. I reworded the comment; the harness was not changed.

**`scripts/harnesses.json`.** Registered `messages-split.cjs` and `language-phase-1b.cjs`. The `_lp1b-*` modules and `_messages-parity-1b.cjs` are listed as shared modules, and `split-messages.cjs` as a fixture generator.

---

## 6 · Listed for later (each would be a visible change or a later phase's surface, so none was made)

1. **Wrong English kept byte for byte:**
   - "Every 1 minutes" (dashboard; unreachable today).
   - "Buzzer  removed" (double space) and "Could not remove buzzer null" / "buzzer null" (dashboard and KDS).
   - "1 change … They'll be sent" (outbox conflicts).
   - The raw action id shown by a gated action.
   - "All {count} buzzers are out".
   - "Confirming…" beside "Confirming...", and "Saving…" beside "Saving...".
   - "-- you're offline".
   - `{mins}min` with no space.
   - A hyphen in place of an em dash in two dashboard messages.
   - Title-case "Start Event" and "Edit Order #".

   Each is now one message, so each fix is one edit.
2. **Kitchen screens still show the server's `error`** instead of reading `code` + `params` (§3).
3. **Stored reason labels are in the truck's locale.** The reject, event-cancel and dashboard cancel reasons are stored and emailed as the label in the truck's language (en-GB today). Later, store the id and let the server choose the words.
4. **`CapacityBreachBanner` parses the server's English reason** to choose what it shows. That is English used as a key, but the English comes from the server's capacity engine, not from this phase. Later, the engine should send a code.
5. **Case changes kept:**
   - `cat.charAt(0).toUpperCase()` ×2 (dashboard category headings);
   - category capitalisation in the order card;
   - the `UserMenu` initial upper-cased;
   - CSS `uppercase` on short labels.

   No new case change was added. The ticket's and the banners' capitals are written in the messages: "NEW ORDERS MAY BE MISSING", "PAYMENT NOT RECORDED".
6. **Lists joined by hand:** van names, conflict labels, venue joins on the ticket and in the operator email, charge lines joined with `'. '`. `Intl.ListFormat` was not used, because it would change US text.
7. **Formats without words:**
   - the half-hour wait shown via `String()`;
   - `settings.cardsOffSince`, which shows a raw ISO date — already true before this phase, kept;
   - the dashboard page's `&times;`.
8. **Admin alert emails stay English.** They go to us, not to the truck. Printer diagnostics are inline technical lines. The BLE fallback printer name "Printer" is stored data.
9. **The WhatsApp webhook's `'there'` greeting fallback** in the operator alerts is still inline. It is an AI and WhatsApp surface (out of scope).
10. **`types.ts` STATUS labels** are still read by the dashboard page for one status chip. The words are the same as the `orderCard` status messages. Move them when the shared order types are next touched.
11. **A dead branch.** `demo.settingUp` has no path that sets it; its message was kept.
12. **Native `Info.plist` / `strings.xml`** are untouched (out of scope). Only the web-side words moved.

---

## 7 · Files

**New — code:**
- `lib/i18n/merge.ts`, `lib/i18n/registry.ts`, `lib/i18n/use-t.ts`, `lib/i18n/kitchen-errors.ts`;
- `lib/printing/printerText.ts`, `lib/native/deviceSaveText.ts`, `lib/phone-message.ts`;
- generated: `lib/i18n/catalog/*.ts` (33) and `messages/ns/{en-GB,en-US}/*.json` (66).

**New — harnesses:**
- `scripts/split-messages.cjs`, `scripts/messages-split.cjs`, `scripts/language-phase-1b.cjs`;
- `scripts/_lp1b-{api,components,dashboard,fixtures,kds,native,operatorMail,printing}.cjs`, `scripts/_messages-parity-1b.cjs`;
- `scripts/fixtures/language-phase-1b-before/*.json.gz` (7).

**Changed — in-scope code:**
- Pages: `app/dashboard/[token]/page.tsx`, `app/dashboard/[token]/kds/page.tsx`.
- Routes: `app/api/dashboard/route.ts`, `app/api/dashboard/action/route.ts`, `app/api/printing/route.ts`, `app/api/native/{bind-device,switch-truck,my-trucks}/route.ts`.
- Push and alerts:
  - `app/api/orders/submit/route.ts` passes the locale to push;
  - `app/api/webhooks/meta/whatsapp/route.ts` passes the locale to alert emails.
- `components/dashboard/`: `AddOrderPanel`, `BuzzerGrid`, `BuzzerLostBanner`, `CapacityBreachBanner`, `DayLoadStrip`, `DemoLockChip`, `DemoLoopComplete`, `DemoWelcome`, `KeepAwakePrompt`, `OrderCard`, `PaymentActionsModal`, `UserMenu`.
- `components/shared/`: `EventActionsModal`, `EventCancelModal`, `EventFinishTimeModal`, `EventPickerPanel`, `ExtraWaitModal`, `RejectOrderModal`.
- Other components: `components/DemoModeBanner.tsx`; `components/native/*` (`AppLockGate`, `NotificationSettings`, `OfflineBanner`, `OperatorDeviceConfig`, `VanMenuChooser`); `components/printing/{PrintingSettings,PrinterTypeChoice}.tsx`.
- `lib/printing/`: `ticket`, `mapOrderToTicket`, `testTicket`, `transport`, `bleTransport`, `netTransport`, `netAddress`, `networkGuard`, `usePrinting`.
- `lib/native/`: `appLock`, `device`, `notifications`, `push`, `useGatedActionResult`, `useOfflineAlert`, `useOutboxConflicts`.
- Other `lib/` files: `lib/apns.ts`, `lib/fcm.ts`, `lib/email.ts` (`formatNewOrderEmail`), `lib/whatsapp/alert-copy.ts`, `lib/payments/refund.ts`.
- i18n plumbing and messages: `lib/i18n/{client.tsx,messages.ts,namespaces.ts,translator.ts,customer-errors.ts}`, `messages/en-GB.json`.

**Changed — imports only** (`use-t` / catalog imports, or a moved function):
- `app/trucks/[slug]/order/page.tsx`, `app/order/[id]/manage/page.tsx`, `app/p/[token]/page.tsx`, `app/setup/page.tsx`, `app/manage/[token]/page.tsx`, `app/api/setup/route.ts`;
- `components/{ChargeRows,OptionStockBadge,SpiceLevel,TruckListCard,DemoGetStarted}.tsx`, `components/dashboard/{DealsModal,OrderLineItem}.tsx`;
- `lib/{modifier-rules,order-charge-lines,preorder,phone,plans-pdf,whatsapp-classifier}.ts`, `lib/orders/reject-order.ts`, `lib/payments/{promote-draft,sold-out-copy}.ts`.

**Changed — config and rules:** `package.json` (`predev` / `prebuild`), `.cursor/rules/language.mdc` (rule 1).

**Changed — harnesses:**
- `scripts/messages-parity.cjs` (AREAS);
- `scripts/fixtures/ui-literals-baseline.json` (lowered);
- `scripts/harnesses.json`;
- `scripts/_language-phase-0-after.cjs` (setup import);
- the re-pins in §5.

`supabase/.temp/cli-latest` was already modified by the Supabase CLI and is untouched.
