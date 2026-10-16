# Language Phase 1d Part 2 — Manage: the rest, with their US words

**Status:** built and proven. Not pushed or deployed. Everything after the Step 0 commit is uncommitted.

## Step 0
1. **Full sweep on the Part 1 tree, before any edit:** 124 run, **124 passed**, 0 failed. This is the re-run Part 1 owed after its one-line `seed-demo-grid` re-pin.
2. **Commit `826471a`** "Language phase 1d part 1: Manage menu, schedule, settings (checkpoint)", parent **`756ca09`**. Local only. BEFORE was captured on it.
   - `.mcp.json` is included. I didn't print it; a search for token-like words (token, secret, password, bearer, sbp_, eyJ, apikey, api_key, authorization) found none.
   - Left out: `docs/reference-manual.md`, `docs/reference-manual-v15-9-report.md` and `supabase/.temp/cli-latest`.

**SQL:** none to run.

**Supabase MCP:** **available** (read-only, project `ffphgwonshgxamtvefcv`). I ran four read-only queries:

| Query | Result |
|---|---|
| `select count(*) as trucks from public.trucks;` | **11** |
| `select country, count(*) from public.trucks group by country;` | GB 11 (no US trucks) |
| `select country_code, enabled, locale, time_format, date_order, week_start, currency from public.country_settings;` | GB: enabled, en-GB, 24h, dmy, monday, GBP · US: **enabled = false**, en-US, 12h, mdy, sunday, USD |
| `select truck_id, kind, layout::text ilike '%no trading today%', … '%week commencing%', … '%cancelled%' from public.truck_post_designs;` | 2 rows, both test-truck. **The 'week' layout stores "Week commencing" and "cancelled"**; the 'event' layout stores neither. Stored values stay as stored (§3). |

**Garbled spans:** none found.

**Contradictions:** none. One point to know: "Sept" → "Sep" in SchedulePlaces was already done in Part 1, so here it applies only to SocialPosts.

---

## Summary

| | Result |
|---|---|
| Words moved | **1,334 en-GB messages in 21 new namespaces, plus 137 new `errorsManage` codes.** |
| Inline strings | `app/manage/[token]/page.tsx` goes from 208 to **5**, all brand names (WhatsApp ×3, Instagram, Messenger). Every other in-scope file is at **0**. |
| US words | **107 US overrides added or changed, 4 moved.** |
| US behaviour | Poster defaults "Week of {start}" and "Closed today", "CANCELED" on posters and captions; "Sunday to Saturday"; US dates in WhatsApp billing and the weekly post; a US font sample; US sample places; Reports CSV header "Pickup time". |
| Named difference 1 | Every remaining Manage refusal is `{ error, …, code, params }` via `manageErrorBody`. That covers the Payments, Billing, Reports, Team, Social, WhatsApp, domain and embed actions, the GET's own refusals, the places-merge actions, `/api/weekly-post`, whatsapp-preview and whatsapp-signup. |
| GB fixes | **105 keys**, named and shown in both countries, plus 7 keys moved unchanged (Appendix A1). There are also 5 named GB code changes. |
| Proof | `language-phase-1d2` **485 passed, 0 failed**, deterministic. GB Reports CSV bytes and GB poster render source are identical (apart from 2 caption fixes). Part 1's tabs and the dashboard are unchanged (1,455 smoke views). |
| Other checks | All pass: final full sweep **125/125**; messages-parity 23,345; messages-split 135; ui-literals; language-phase-0 · 1a · 1b · 1c · 2 · 1d; tsc clean; next build exit 0. |
| Legal | 4 keys moved byte-identical with **no US version**, listed for your decision (§4). |

---

## 1 · What moved

| Namespace | GB | US | Surface |
|---|---:|---:|---|
| `manageShell` | 62 | 5 | ManagePage: tab bar, header, banners, notices, toasts, loading/error, trial popup, `?verify=` toast |
| `manageBilling` | 32 | 2 | BillingTab |
| `manageTeam` | 59 | 4 | TeamTab and the team invite email (`inviteEmail.*`) |
| `manageReports` | 71 | 2 | ReportsTab and its CSV export |
| `managePayments` | 56 | 6 | PaymentsTab |
| `manageCharges` | 16 | 0 | ChargesCard (US trucks only) |
| `takingPayment` | 4 | 0 | TakingPaymentPanel |
| `completionSettings` | 7 | 4 | **Moved** from `dashboard.settings.*`: the presses and completion sentences, now one small namespace read by both the dashboard and TakingPaymentPanel |
| `socialPosts` | 318 | 17 | SocialPosts and every sentence of `lib/copy/socialPosts.ts` |
| `eventPost` / `postShare` | 52 / 8 | 0 | EventPost / PostShareBar |
| `designEditor` | 96 | 17 | DesignEditor and DesignEditorBits |
| `fontPicker` | 36 | 1 | FontPicker |
| `weeklyPost` | 57 | 4 | WeeklyPost and `lib/copy/weeklyPost.ts` |
| `posterWords` | 18 | 17 | the words **drawn on posters**: default heading, days-off, CANCELLED, sample places, busy-week preview |
| `captions` | 24 | 1 | caption defaults, filled values, chip labels |
| `weeklyPostApi` | 39 | 1 | `/api/weekly-post` labels, warnings and status lines |
| `manageWhatsApp` | 83 | 8 | Settings' Auto-replies section, WhatsAppReplyPreview, WhatsAppSetupControl, the whatsapp-signup outcomes |
| `customDomain` | 125 | 11 | CustomDomainSetup, provider steps (`lib/custom-domain/dns.ts`), apex checks, the instructions and "live" emails |
| `deleteAccount` | 26 | 1 | DeleteAccountSection and Settings' Account deletion section |
| `copyButton` | 8 | 0 | CopyButton, kept separate because DemoWelcome and admin also use it |
| `errorsManage` | +137 codes | +6 | `charges_*`, team and GET codes, `wp_*` (weekly-post), `sg_*` (places-merge), `wa_*`, `domain_*`, `embed_*` |

**How it's built** (Part 1's conventions):
- `useT` on the client, `translatorFor` in the truck's locale on the server, and a catalog import per reader (messages-split 135/135).
- Whole sentences, with rich-text tags where needed: the socialPosts bold-split blurbs, the Reports date range with its pickers inside, the Stripe key-mismatch paragraph.
- ICU plurals.
- Effects hold codes: SocialPosts, EventPost and WeeklyPost errors, the PaymentsTab state, the setup-machine notice, the `?verify=` toast.
- Copy modules (`socialPosts`, `weeklyPost`, `charge-settings`, `custom-domain/copy`, `dns`, `apex`, `whatsapp/copy`) keep their exports for other callers; those exports read the en-GB message, so there is one source. Every screen in scope reads `useT` in the truck's locale.
- **Deleted, because nothing used them any more:** `CHARGE_ERRORS`, `CONNECTING_STRIPE_NOT_A_COMMITMENT`, `DEFAULT_HEADING`, `DEFAULT_DAYS_OFF_TEXT`, the custom-domain `TIMING_LINE` / `CONFIRM_COPY` / `TURN_OFF_COPY` / `CONFIRMED_COPY` and `setupButtonLabel`.

---

## 2 · Named difference 1 — the remaining Manage refusals gain `code` and `params`

**Through the one helper** (`manageErrorBody` → `errorBody`):
- `update_charges`;
- the team actions;
- get_report / get_recent_events;
- the GET's own refusals;
- the demo-domain and Social-plan gates;
- `domain_*`, save_embed_setup, get_embed_status, disconnect_whatsapp, the WhatsApp reply-limit refusal;
- sg_place_usual_type and sg_merge_place;
- every refusal of `/api/weekly-post` (70 `wp_*` codes plus reused codes; its plan gate uses `errorsManage.social_media_plan`, the same code as the manage route's gate);
- `/api/manage/whatsapp-preview` and `whatsapp-signup`.

**Shared checks:** all these actions are now in `MANAGE_TAB_ACTIONS`, so their shared token, sign-in and staff refusals carry codes too. Before the truck is known, refusals are en-GB.

**Other refusal shapes:**
- `{ok:false, kind, error}` and `{ok:false, reason, message}` keep their fields first and gain `code` and `params` last.
- The custom-domain address checks (`checkSubdomain`) carry `code` = the reason and `params` (`{host}` / `{domain}`); their words are `customDomain.apex.<reason>`.

**Lib refusals** (`lib/charge-settings.ts`, `lib/weekly-post/*`) return `{ error, code, params }`, so screens can word them by code.

**Proof:** 209 refusal views per country add only `code` and `params`, last.
- By route: manage 93, manage GET 4, weekly-post 89, weekly-post GET 6, whatsapp-preview 5, whatsapp-signup 12.
- For each: the BEFORE body is the exact prefix; every field is unchanged and in place; the message rendered with its params equals `error`; DB writes are identical.

**Passed through with no code** (not our sentence): Supabase `error.message`, `/api/stripe/connect`'s errors, Stripe's own words, AI output.

---

## 3 · US words and US behaviour

### Words (Appendix A2)
**Approved table and earlier choices:**
- colour → color, centre → center, grey → gray, licence → license;
- takings → sales, till → cash register, contactless → tap to pay, card machine → card reader, hatch → window, 💷 → 💵;
- canceled / Canceling;
- "Mark paid & picked up" (through the shared keys);
- "Customizations"; TBC → TBD;
- "drop us a message" → "send us a message";
- "Have a look" → "Take a look"; "move it across" → "move it over";
- "needs registering / renewing / fulfilling" → "needs to be registered / renewed / fulfilled";
- "Do you do pepperoni?" → "Do you have pepperoni?"; "Working out the reply…" → "Writing the reply…";
- full stop → period;
- pub and UK place examples → Austin-area examples (Main Street Brewery, Round Rock, Georgetown…), keeping each example's shape.

**Choices beyond the glossary (recorded):**
- "afterwards" → "afterward"; Zettle → Clover as a card-terminal example;
- "Correct at" → "Correct as of"; "carries on" → "continues";
- "Outline round" → "Outline around"; "the other way round" → "the other way around";
- "Type straight in" → "Type right in"; "on a day with no trading" → "on a day you’re closed"; "w/c {date}" → "Week of {date}";
- "@buresmusicfest" → "@austinmusicfest"; the US phone example "+1 312 555 0100" (fictional 555-01xx range).

### Posters and captions (US only; GB render source byte-identical)
**What changes for a US truck:**
- the default heading is **"Week of {start}"**. The approved table drops `{end}`; messages-parity allows only this one argument difference.
- the default days-off text is **"Closed today"**;
- **CANCELED** is drawn, and captions read "— CANCELED, sorry";
- sample places and the busy-week preview use US names.

**Stored values are never changed:**
- A **stored** heading or days-off text is drawn exactly as stored. Only a blank or missing one uses the country default. So the live test-truck 'week' layout, which stores "Week commencing", still draws "Week commencing" (proven, including for a US truck).
- Caption seeds are computed on read and never written; a saved template always wins.
- CANCELLED is never stored; it is drawn per country.

**Fonts:** all 37 bundled poster font files carry every character of the US words. No font change is needed.

### Other US behaviour (GB proven identical)
- **"Monday to Sunday"** → `{first} to {last}` from `weekdayName` for the truck's week start: US "Sunday to Saturday".
- **The font sample** uses the country's own long date: US "Wednesday, October 14th".
- **WhatsApp:** "resets November 1"; the billing dates are "October 1, 2026" and "September 16, 2026".
- **Reports:** the scope chip reads "All trucks"; the US CSV header is "Pickup time".
- **The team invite email, custom-domain instructions email and "live" email** are written in the truck's language. The custom-domain cron (`app/api/cron/custom-domain-check`) now passes the truck's locale; its select gained `country`, read only.

**Reports CSV header rows:**
- GB orders: `"Order ID","Date","Event","Time placed","Collection time","Customer name","Order type","Items","Deals","Modifiers","Notes","Total"`
- US orders: `…,"Pickup time",…,"Notes","Subtotal","Sales tax","Tip","Service fee","Total"`. The tax header is the country's own tax label.
- The items CSVs follow the same pattern.

---

## 4 · GB named changes

### Word fixes (105 keys, Appendix A1; shown in both countries)
| Kind | Examples |
|---|---|
| Straight ' → ’, and "x" → “x” | the shell, Billing, Team, Payments (15), WhatsApp (9), custom domain (the two emails' subjects and intros, and 26 provider-step lines with quoted labels such as “DNS only”), `captions.cancelledSorry` / `cancelledApology`, `errorsManage.sg_merge_*` (4), the team invite email, the upgrade mail body, the Reports customer note “{note}” |
| "..." → "…" | "Loading management console…", Sending…, Saving…, Cancelling…, "Working out the reply…" |
| Missing full stops | 11 Social error sentences ("Could not load." …) |
| Wrong plurals → ICU | "We found 1 event … before it goes live"; "All 1 of your locations have an image" → "Your location has an image"; "1 of your 3 locations has no image yet"; `designEditor.settings.ownStyleNote` "have their own style, so they aren’t changed" |
| Stale or wrong wording | `fontPicker.noOwn` "Use the button below" → "Use the “↑ Upload your font” button above" (the button is above); `designEditor.settings.lastToggle` names the real item ("Place" on weekly, "Venue" on event, not "Location"); "Added “X” as its Bold." → "…as its bold version."; "free trial - until" → "free trial — until" |
| Moved unchanged (7) | `dashboard.settings.{paidStepTitle, completionTitle, completionHelp, pressesOne, pressesOneHelp, pressesTwo, pressesTwoHelp}` → `completionSettings.*`. The dashboard's text is unchanged. |

### Code-level changes (in the harness's NAMED table, each proven precisely)
1. **SocialPosts date:** "Sat 26 Sept" → "Sat 26 Sep" (`formatYmdShortMonth`, September only).
2. **WeeklyPost event list** showed a raw ISO date: "2026-10-14 · cancelled" → "Wed 14 Oct · cancelled".
3. **Billing comparison column header:** the DOM text is now the plan name ("Trial"/"Starter"/"Pro"/"Max") instead of the raw id. It is shown in capitals through CSS, so the screen looks the same.
4. **TakingPaymentPanel's cash help** now reads `manageSettings.vans.takesCashHelp`, so Part 1's “Cash”/“Card” curly-quote fix shows on GB Payments too.
5. **`domain_preflight` success body (wire format):** the provider `steps[]` and `caveat` are now message keys that the screen words (rule 7). The GB screen is byte-identical.

**Effect only, same text:** the `?verify=` toast now fires after the first load.

### Legal — moved byte-identical, NO US version, for your decision
| Key | Text (GB, unchanged) |
|---|---|
| `deleteAccount.whatAccounting` | "Anonymous accounting records are <b>kept for six years</b>, as UK law requires. See our <link>privacy policy</link>." |
| `deleteAccount.copyFirst` | the right to a copy of your data |
| `deleteAccount.whatPersonal` | "Your personal details and your team's are deleted, and your logins are removed." (straight apostrophe kept) |
| `deleteAccount.whatCustomers` | "Your customers' names, emails and phone numbers are deleted from your orders." (straight apostrophe kept) |

`deleteAccount.deletedAfter` and `stopsImmediately` (the 30-day policy) are policy rather than law, but worth a look too. Both language-phase-1d2 and messages-parity assert that these four legal keys have no en-US override.

---

## 5 · Proof

### The method (Part 1's, extended)
- **BEFORE:** `826471a`, captured from a clean worktree twice, byte-identical (3,148 views).
- **F** = current code with 826471a's words (en-GB and en-US) plus both as-moved overlays (Part 1's and Part 2's) **and a key-move map** (`scripts/fixtures/language-phase-1d2-key-moves.json`). The map gives a moved key its frozen text at its new path, so F(US) keeps the 826471a US words on the dashboard and Payments views.
- **A** = current code with current words.
- **The overlays apply in every harness's frozen mode**, so the older harnesses keep proving exactly what they proved.

### `scripts/language-phase-1d2.cjs` — 485 passed, 0 failed (≈16 s; two runs identical, including the F/A captures and the US-changed list)
**Views:** GB 1,575, US 1,573.

| Area | GB | US |
|---|---:|---:|
| shell (shell, Billing, Team) | 126 | 126 |
| reports (tab, CSV) | 44 | 44 |
| payments | 67 | 66 |
| social | 93 | 93 |
| poster (render source) | 80 | 80 |
| WhatsApp / domain / account | 105 | 105 |
| api | 332 | 332 |
| smoke (Part 1's tabs, copy and API, the dashboard) | 728 | 727 |

**GB · F vs BEFORE:**
- 614 views byte-identical;
- 209 refusals add only code/params (per field);
- 24 equal BEFORE plus a named change.

**GB · A vs F:**
- 105 en-GB keys changed text; every changed word is explained by a key.
- 85 keys reach a rendered view; 20 reach none (click-time toasts, covered by messages-parity).
- The changed set equals `scripts/fixtures/language-phase-1d2-gb-named.json` (112 entries: 105 fixes and 7 moves).

**GB Reports CSV:** 15 GB CSVs, captured through the real ⬇ click handlers. F is byte-identical to BEFORE on all 15, and A equals F.

**GB poster render source:** 80 views of satori element trees, warnings, fonts, drawn strings, captions and the QR poster's `fillText`.
- F is byte-identical on all 80.
- In A, only 3 caption views differ, by the two named caption fixes.
- The Poster agent's own render-source proof also passes, 166/0: 120 weekly and 8 event trees compared as JSON.

**US · F vs BEFORE:** 584 identical, 209 refusals with only code/params added, 19 precise named changes, 34 listed under named US behaviours.

**US · A vs BEFORE:** **525 of 846 in-scope US views change**, each with its cause, in `scripts/fixtures/language-phase-1d2-us-changed.txt`.

| Area | Changed / views |
|---|---|
| api | 223/332 |
| shell | 94/126 |
| WhatsApp / domain / account | 56/105 |
| social | 55/93 |
| poster | 41/80 |
| reports | 29/44 |
| payments | 27/66 |

**US-words check:**
- **The word list:**
  - Phase 2's and Part 1's lists;
  - plus: "no trading today", enquiry, "fancy some", "Monday to Sunday", analyse, "sort it", "drop us a", "come back to you", "move it across", fortnight, "needs X adding", whilst.
- **Result:** 448 hits, **all allowed, 0 to fix.** Each allowed hit, with its reason:

  | Allowed | Hits | Reason |
  |---|---:|---|
  | Billing plan-comparison rows and the "TBC" price placeholder | 257 | from `lib/plan-features.ts`, `lib/features.ts` and `lib/pricing.ts`, shared with marketing (**Phase 1e**); scoped to Billing views |
  | "Starter" | 46 | plan name |
  | Stored venue and van names | 91 | "Lavenham Village Hall", "Van 1", "Big van", "Pasta Van" |
  | Stored poster design | 29 | "Week commencing" 5, "No trading today" 12 + 12 |
  | an uncalled `weekCaption()` | 1 | the real caption path says CANCELED |
  | Email and web addresses | 19 | including 123 Reg's own `.co.uk` help URL |
  | Operator-typed preview questions | 3 | |
  | The harness's canned AI reply | 2 | rule 10 |

**Out of scope:** 1,455 smoke views (Part 1's Menu, Schedule and Settings tabs, copy and API, plus 433 dashboard views). BEFORE = F = A, apart from 2 views of one named shared change: Part 1's copy view of the deleted `CONNECTING_STRIPE_NOT_A_COMMITMENT` now reads `managePayments.trialNote`, which has a ’ fix.

### Client JS per page (gz KB, before = the 826471a build, after = this build)
| Page | Before | After | Change |
|---|---:|---:|---:|
| **/manage/[token]** | 488.1 | 512.5 | **+24.4** |
| /dashboard/[token] | 391.8 | 394.0 | +2.2 |
| /dashboard/[token]/kds, /kds/[kds_token] | 246.8 | 246.6 | −0.2 |
| /trucks/[slug]/order | 245.1 | 244.9 | −0.2 |
| /setup | 179.7 | 179.6 | −0.1 |
| every other page | | | 0.0 |

**Why Manage grew:**
- Part 2's 21 new namespaces in both languages come to 23.2 KB gz;
- `errorsManage` grew to 5.0 KB gz with its new codes;
- the inline literals they replaced came off.
- Payments' first approach would have pulled the whole `dashboard` catalogue into Manage (about 8.5 KB) for 7 sentences. Those sentences were moved to the small shared `completionSettings` (0.7 KB) instead.

**The other pages:** the dashboard gained `copyButton` and `completionSettings`.

### Other checks
- **messages-parity 23,345** (AREAS before: 1a, 1b, 1c, 2, 1d; after: **+1d2**). The new `_messages-parity-1d2` checks:
  - moved-as text equals the BEFORE source or render;
  - en-US keys exist in en-GB and differ, with the same ICU arguments, except `posterWords.heading` (approved);
  - gb-named matches;
  - legal keys have no en-US override.
- **messages-split 135; ui-literals.** The baseline is lowered in 14 files:
  - page.tsx 208 → 5;
  - CustomDomainSetup 35 → 0, DeleteAccountSection 37 → 0, DesignEditor 49 → 0, WeeklyPost 33 → 0, PaymentsTab 32 → 0, EventPost 28 → 0, FontPicker 17 → 0, ChargesCard 12 → 0, SocialPosts 10 → 0, TakingPaymentPanel 8 → 0, CopyButton 2 → 0, DesignEditorBits 2 → 0, PostShareBar 2 → 0.
- **language-phase-0** 168 · **1a** 1,050 · **1b** 3,522 · **1c** 4,498 · **2** 1,124 · **1d** 282.
- **`npx tsc --noEmit`:** clean. **`next build`:** exit 0.
- **ESLint** per rule against 826471a: **no rule count grew in any product file.** The 20 harness `.cjs` files grew only in `@typescript-eslint/no-require-imports`, as every CommonJS harness does. One new `no-unused-vars` in a new harness module was fixed.
- **Final full sweep** (`node scripts/run-harnesses.cjs`), re-run at the end on the final tree: **125 run, 125 passed, 0 failed**, exit 0.

### Re-pins (each marked "⚠️ RE-PINNED (Language Phase 1d Part 2)" in its file)
**Language harnesses:**
- `_lp2-frozen.cjs`: both overlays and the key-move map.
- `language-phase-1d.cjs` / `_lp1d-words.cjs`: A runs on 826471a's words.
- `_messages-parity-1d.cjs`: reads only the files Part 1 changed.
- `_lp1d-copy.cjs`: adapter for the deleted constant.
- `language-phase-0.cjs`: its browser bundle now reads the same frozen catalogue as the server.
- `_messages-parity-2/1d2`: the `posterWords.heading` argument exception.

**Product harnesses:**
- phase3-screens / `_phase3-screens-us`;
- country-settings-parity;
- audit-fixes (stronger: positional);
- event-types (follows the key moves);
- social-posts, places-tab, places-posts-gating;
- weekly-post, design-editor, design-fonts, place-pictures. Their file lists gain `words.ts`, the i18n modules and catalogs; claims move to `t()` keys plus en-GB words; mutation variants are re-anchored.
- schedule-graphics-places: Part 2's 31 code edits are added as explicit named claims.

**⚠️ Checks that are weaker than before (stated):**
1. Part 1's smoke now asserts F === A for Part 2's surfaces instead of BEFORE(756ca09) === F. language-phase-1d2 proves those surfaces against 826471a instead.
2. phase3-screens' TakingPaymentPanel byte check proves the bytes at 826471a plus a fully listed word-only diff since.
3. Four checks in social-posts and places-posts-gating used to hold the Social-plan sentence as one shared symbol. They now hold the two keys together by equal GB value and no differing US override.
4. schedule-graphics-places inherits Part 1's "hunk that adds a message read" excuse, which now also covers Part 2's hunks.
5. The helper that re-pinned weekly-post, design-editor, design-fonts and place-pictures hit a rate limit before writing its own report. The harness agent reviewed every Part 2 comment it left and found no stated weakening, but did not audit every line.

**Pre-existing, not hidden:** `social-tab-render` already failed at 826471a ("no event picker found"; `data-pick-list` is absent at baseline). It is unchanged.

---

## 6 · Decisions recorded
1. **`completionSettings`** holds the shared presses sentences, read by both the dashboard and Payments, so Manage doesn't carry the whole dashboard catalogue.
2. **Posters:** a stored heading or days-off text wins; only a blank or missing one gets the country default. The language follows the truck's country, like the poster dates.
3. **One code for the Social-plan sentence** (`errorsManage.social_media_plan`), used by the manage route's gate and `/api/weekly-post`.
4. **Custom-domain provider steps travel as keys** and are worded by the screen (rule 7). The emails are worded on the server in the truck's language.
5. **`copyButton`** is its own namespace, because CopyButton is shared with DemoWelcome and admin.
6. **Straight quotes in Part 2's own messages were curled**, including the team invite, custom-domain emails and provider steps. The 4 legal keys and earlier phases' keys were left alone.
7. **Billing plan-comparison rows stay shared marketing copy**, until Phase 1e.

## 7 · Listed for later
1. **Billing's plan-comparison rows** (`lib/plan-features.ts`, `lib/features.ts`, `lib/pricing.ts`, shared with marketing) still say "at the hatch", "collection time slot", "help centre", "TBC" etc. on US Billing. This is Phase 1e. Row names are also lookup keys (rule 6).
2. **The legal wording** in §4 is waiting for your decision.
3. **Duplicates to join:**
   - `errorsManage.social_media_plan` = `weeklyPost.planRefusal`;
   - `errorsManage.wp_private_no_single_post` = `privateEvents.noSinglePost`;
   - `fontPicker.face.*` = `faceLower.*`;
   - `errorsManage.wp_last_toggle` vs `designEditor.settings.lastToggle`, which now differ: the editor names Place or Venue.
4. **Not rendered by the harness** (effect- or click-only), so covered by messages-parity only:
   - `?verify=` toasts;
   - WhatsApp/domain handler errors;
   - DeleteAccountSection toasts.

   API paths the fixtures can't reach:
   - production-only rate limits;
   - the GET's country-settings 500;
   - two font refusals that need a crafted TTF.
5. **`captionHtml` in SocialPosts** is called without the truck's country. The chip labels have no US override today, so US output is the same; it should pass `country` once they differ.
6. **Still GB on US screens, from routes outside this phase:**
   - `/api/stripe/connect` refusals;
   - auth routes' errors in TeamTab (`errorsOnboarding`, en-GB);
   - `/api/account/request-deletion`'s `error`.
7. **Content, not wording:** the Starter upsell on Reports promises "hourly sales patterns, and event ROI comparison", which Reports doesn't have.
8. **Unused code still present:**
   - `TRIAL_NOT_STARTED_HEADING` / `TRIAL_NOT_STARTED_BILLING` in `lib/settings-copy.ts`;
   - `weekCaption()` (no caller);
   - the `MENU_SECTIONS` / `SOCIAL_SECTIONS` labels, no longer rendered.
9. **Number grouping:** messages with `{n}`/`#` in Social now group thousands ("1,000"). This can't be reached at today's counts.

## 8 · Files
**Product code:**
- **Manage page:** `app/manage/[token]/page.tsx` (shell, Billing, Reports, Team, the Settings Auto-replies and Account deletion sections, WhatsApp previews).
- **Components:**
  - `components/manage/{PaymentsTab,ChargesCard,TakingPaymentPanel,SocialPosts,EventPost,PostShareBar,WeeklyPost,DesignEditor,DesignEditorBits,FontPicker,DeleteAccountSection}.tsx`;
  - `components/dashboard/{CustomDomainSetup,CopyButton}.tsx`.
- **Dashboard:** `app/dashboard/[token]/page.tsx` (the completionSettings reads only).
- **Copy modules:** `lib/copy/{socialPosts,weeklyPost}.ts`, `lib/charge-settings.ts`, `lib/settings-copy.ts`.
- **Weekly post:**
  - `lib/weekly-post/{words (new),format,lines,draw,layout,week-data,locale,caption,caption-template,caption-chips,image-info,backgrounds,social-tag,font-refs,place-pictures}.ts`.
- **Custom domain and WhatsApp:**
  - `lib/custom-domain/{copy,dns,apex}.ts`;
  - `lib/whatsapp/{copy,setup-machine,embedded-signup}.ts`.
- **i18n:** `lib/i18n/namespaces.ts`.
- **Routes:**
  - `app/api/manage/route.ts` and `app/api/manage/{whatsapp-preview,whatsapp-signup}/route.ts`;
  - `app/api/weekly-post/route.ts`;
  - `app/api/cron/custom-domain-check/route.ts`.

**Messages:** `messages/en-GB.json`, `messages/en-US.json`; generated `messages/ns/**` and `lib/i18n/catalog/*`.

**Harnesses:**
- **New:**
  - `scripts/language-phase-1d2.cjs`;
  - `scripts/_lp1d2-{fixtures,shell,reports,payments,social,poster,wada,api,smoke,words,named,checks}.cjs`;
  - `scripts/_messages-parity-1d2.cjs`;
  - `scripts/fixtures/language-phase-1d2-{messages-before.en-GB,messages-before.en-US,gb-moved,gb-named,key-moves}.json`;
  - `scripts/fixtures/language-phase-1d2-us-changed.txt`;
  - `scripts/fixtures/language-phase-1d2-before/`.
- **Changed:** `scripts/harnesses.json`, `scripts/messages-parity.cjs`, `scripts/fixtures/ui-literals-baseline.json`, and the re-pins in §5.

---

## Appendix — generated from the message files, so it matches them exactly

### A1 · GB named changes (112 keys; both countries)

| key | before | after |
|---|---|---|
| `captions.cancelledApology` | Apologies to everyone who was planning to come. We'll be back soon. | Apologies to everyone who was planning to come. We’ll be back soon. |
| `captions.cancelledSorry` | Sorry — we're not able to make {where} {when}. | Sorry — we’re not able to make {where} {when}. |
| `customDomain.confirm.no` | No, there's a problem | No, there’s a problem |
| `customDomain.instructionsEmail.introAt` | We are putting {truckName}'s live schedule on {address}, and it needs one record adding to our domain at {provider}. | We are putting {truckName}’s live schedule on {address}, and it needs one record adding to our domain at {provider}. |
| `customDomain.instructionsEmail.introHolder` | We are putting {truckName}'s live schedule on {address}, and it needs one record adding to our domain with whoever holds our domain. | We are putting {truckName}’s live schedule on {address}, and it needs one record adding to our domain with whoever holds our domain. |
| `customDomain.instructionsEmail.subject` | One record to add for {truckName}'s schedule page | One record to add for {truckName}’s schedule page |
| `customDomain.providers.123reg.dns` | Select "DNS", then "Add New Record". | Select “DNS”, then “Add New Record”. |
| `customDomain.providers.123reg.manage` | Beside "Domains", select "Manage All", then choose your web address. | Beside “Domains”, select “Manage All”, then choose your web address. |
| `customDomain.providers.123reg.name` | Put the first value below in "Name". | Put the first value below in “Name”. |
| `customDomain.providers.123reg.save` | Leave "TTL" as "Default" and click "Save". | Leave “TTL” as “Default” and click “Save”. |
| `customDomain.providers.123reg.signIn` | Sign in to your "123 Reg Control Panel". | Sign in to your “123 Reg Control Panel”. |
| `customDomain.providers.123reg.type` | Pick "CNAME" from the "Type" list. | Pick “CNAME” from the “Type” list. |
| `customDomain.providers.123reg.value` | Put the second value below in "Value", and add a full stop to the end of it. | Put the second value below in “Value”, and add a full stop to the end of it. |
| `customDomain.providers.cloudflare.add` | Select "Add record", then pick "CNAME" as the "Type". | Select “Add record”, then pick “CNAME” as the “Type”. |
| `customDomain.providers.cloudflare.name` | Put the first value below in "Name". | Put the first value below in “Name”. |
| `customDomain.providers.cloudflare.open` | Open your web address, then "DNS" and "Records". | Open your web address, then “DNS” and “Records”. |
| `customDomain.providers.cloudflare.proxy` | Set "Proxy status" to "DNS only" — the cloud beside it must be grey, not orange. | Set “Proxy status” to “DNS only” — the cloud beside it must be grey, not orange. |
| `customDomain.providers.cloudflare.save` | Leave "TTL" as "Auto" and select "Save". | Leave “TTL” as “Auto” and select “Save”. |
| `customDomain.providers.cloudflare.value` | Put the second value below in "Target". | Put the second value below in “Target”. |
| `customDomain.providers.godaddy.add` | Select "Add New Record", then pick "CNAME" from the "Type" menu. | Select “Add New Record”, then pick “CNAME” from the “Type” menu. |
| `customDomain.providers.godaddy.caveat` | If you added more than one at once, the button says "Save All Records". | If you added more than one at once, the button says “Save All Records”. |
| `customDomain.providers.godaddy.dns` | On "Domain Settings", select "DNS". | On “Domain Settings”, select “DNS”. |
| `customDomain.providers.godaddy.name` | Put the first value below in "Name". | Put the first value below in “Name”. |
| `customDomain.providers.godaddy.open` | Open your "Domain Portfolio" and choose your web address. | Open your “Domain Portfolio” and choose your web address. |
| `customDomain.providers.godaddy.save` | Leave "TTL" as it is and select "Save". | Leave “TTL” as it is and select “Save”. |
| `customDomain.providers.godaddy.value` | Put the second value below in "Value". | Put the second value below in “Value”. |
| `customDomain.providers.wix.add` | In the "CNAME (Aliases)" section, click "+ Add Record", then click "Got it". | In the “CNAME (Aliases)” section, click “+ Add Record”, then click “Got it”. |
| `customDomain.providers.wix.manage` | Choose "Manage DNS Records". | Choose “Manage DNS Records”. |
| `customDomain.providers.wix.name` | Put the first value below in "Host Name". | Put the first value below in “Host Name”. |
| `customDomain.providers.wix.open` | Open "Domains", then click the "Domain Actions" icon beside your web address. | Open “Domains”, then click the “Domain Actions” icon beside your web address. |
| `customDomain.providers.wix.save` | Click "Save", then click "Save Changes" in the pop-up. | Click “Save”, then click “Save Changes” in the pop-up. |
| `customDomain.providers.wix.value` | Put the second value below in "Value". | Put the second value below in “Value”. |
| `customDomain.record.guide` | {provider}'s own guide to this | {provider}’s own guide to this |
| `designEditor.picture.allHaveImage` | All {total} of your locations have an image. | {total, plural, =0 {You don’t have any locations yet.} one {Your location has an image.} other {All # of your locations have an image.}} |
| `designEditor.picture.someWithout` | {without} of your {total} locations have no image yet | {without} of your {total, plural, one {# location} other {# locations}} {without, plural, one {has} other {have}} no image yet |
| `designEditor.settings.lastToggle` | {kind, select, weekly {Keep either Location or Time switched on. A cancelled event shows its place crossed out and the word CANCELLED, so with both off there would be nothing to say it is cancelled.} other {Keep either Location or Time switched on. A cancelled event shows its place crossed out and the word CANCELLED, so with both off there would be nothing to say it is cancelled.}} | {kind, select, weekly {Keep either Place or Time switched on. A cancelled event shows its place crossed out and the word CANCELLED, so with both off there would be nothing to say it is cancelled.} other {Keep either Venue or Time switched on. A cancelled event shows its place crossed out and the word CANCELLED, so with both off there would be nothing to say it is cancelled.}} |
| `designEditor.settings.ownStyleNote` | {count, plural, one {{names} has its own style, so it isn’t changed.} other {{names} have its own style, so it isn’t changed.}} | {count, plural, one {{names} has its own style, so it isn’t changed.} other {{names} have their own style, so they aren’t changed.}} |
| `errorsManage.sg_merge_impossible` | Those places can't be merged. | Those places can’t be merged. |
| `errorsManage.sg_merge_read_failed` | Couldn't read your places. | Couldn’t read your places. |
| `errorsManage.sg_merge_self` | A place can't be merged into itself. | A place can’t be merged into itself. |
| `errorsManage.sg_merge_write_failed` | Couldn't merge those places. | Couldn’t merge those places. |
| `eventPost.error.couldNotBuild` | Could not build the picture | Could not build the picture. |
| `eventPost.error.couldNotChange` | Could not change that | Could not change that. |
| `eventPost.error.couldNotLoad` | Could not load | Could not load. |
| `eventPost.error.couldNotRemove` | Could not remove | Could not remove. |
| `eventPost.error.couldNotSave` | Could not save | Could not save. |
| `eventPost.error.previewFailed` | The preview could not be made | The preview could not be made. |
| `eventPost.error.somethingWrong` | Something went wrong | Something went wrong. |
| `eventPost.error.uploadFailed` | The upload failed | The upload failed. |
| `eventPost.error.uploadIncomplete` | The upload did not complete | The upload did not complete. |
| `fontPicker.added` | Added “{name}” as its {face}. | Added “{name}” as its {face} version. |
| `fontPicker.face.bold` | Bold | bold |
| `fontPicker.face.italic` | Italic | italic |
| `fontPicker.face.regular` | Regular | regular |
| `fontPicker.noOwn` | You haven’t uploaded a font yet. Use the button below. | You haven’t uploaded a font yet. Use the “↑ Upload your font” button above. |
| `manageBilling.noCharge` | 🔒 You won't be charged anything during your trial, which runs until {date}. Billing only ever starts when you choose a plan and enter your payment details. Until then there's nothing to cancel and nothing to pay. | 🔒 You won’t be charged anything during your trial, which runs until {date}. Billing only ever starts when you choose a plan and enter your payment details. Until then there’s nothing to cancel and nothing to pay. |
| `manageBilling.notStarted.body` | You have every Max feature while you set up. You choose which event starts your free trial - until then, nothing is counting down. | You have every Max feature while you set up. You choose which event starts your free trial — until then, nothing is counting down. |
| `manageBilling.onMax` | You're on Max features. Choose a plan before your trial ends to keep access. | You’re on Max features. Choose a plan before your trial ends to keep access. |
| `manageBilling.onMaxNoCta` | You're on Max features. | You’re on Max features. |
| `manageBilling.upgradeModal.body` | We're setting up automated billing. To upgrade now, drop us a message and we'll get you set up within 24 hours. | We’re setting up automated billing. To upgrade now, drop us a message and we’ll get you set up within 24 hours. |
| `manageBilling.upgradeModal.mailBody` | Hi, I'd like to upgrade {truck} to the {plan} ({price}) plan. | Hi, I’d like to upgrade {truck} to the {plan} ({price}) plan. |
| `manageCharges.fee.hatchgrab` | HatchGrab adds a {fee} service fee to your customers' online orders. You don't pay it and can't change it. | HatchGrab adds a {fee} service fee to your customers’ online orders. You don’t pay it and can’t change it. |
| `managePayments.config.fetchTitle` | We couldn't check this truck's Stripe account | We couldn’t check this truck’s Stripe account |
| `managePayments.config.keyMissingTitle` | Card payments aren't configured yet | Card payments aren’t configured yet |
| `managePayments.keyMismatch.body` | This site's server is using its <b>{server, select, live {live} other {test}}</b> Stripe key while the browser was built with the <b>{browser, select, live {live} other {test}}</b> one. Card payments would fail at the moment a customer tries to pay, so setting up Stripe is blocked until they agree. | This site’s server is using its <b>{server, select, live {live} other {test}}</b> Stripe key while the browser was built with the <b>{browser, select, live {live} other {test}}</b> one. Card payments would fail at the moment a customer tries to pay, so setting up Stripe is blocked until they agree. |
| `managePayments.onboarding.firstRun` | Stripe takes it from here — you'll sign in to Stripe, then give your business and bank details. | Stripe takes it from here — you’ll sign in to Stripe, then give your business and bank details. |
| `managePayments.onboarding.restricted` | Stripe takes it from here — you'll sign in to Stripe and update the details it needs. | Stripe takes it from here — you’ll sign in to Stripe and update the details it needs. |
| `managePayments.online.feeLine` | Stripe charges {fee} per payment on standard {region}. Other cards may cost more. HatchGrab's own fee on online orders depends on your plan — see Billing. | Stripe charges {fee} per payment on standard {region}. Other cards may cost more. HatchGrab’s own fee on online orders depends on your plan — see Billing. |
| `managePayments.permission.title` | Only the truck's owner can set up payments | Only the truck’s owner can set up payments |
| `managePayments.state.not_connected.body` | Takes about 10 minutes. You'll need your bank details and ID. | Takes about 10 minutes. You’ll need your bank details and ID. |
| `managePayments.state.pending.body` | Nothing for you to do. Stripe is reviewing what you sent, and this page updates when they're done. | Nothing for you to do. Stripe is reviewing what you sent, and this page updates when they’re done. |
| `managePayments.state.requirements.body` | Card payments won't work until Stripe has your business and bank details. | Card payments won’t work until Stripe has your business and bank details. |
| `managePayments.state.unsupported.title` | Card payments aren't available on this account | Card payments aren’t available on this account |
| `managePayments.trialNote` | Setting this up doesn't start your subscription or charge you anything today. It's how your customers pay you — your plan is separate. | Setting this up doesn’t start your subscription or charge you anything today. It’s how your customers pay you — your plan is separate. |
| `managePayments.walkUp.ownTerminalHelp` | Zettle, Square, or whatever you already use. Nothing to set up — only your provider's own fees apply. | Zettle, Square, or whatever you already use. Nothing to set up — only your provider’s own fees apply. |
| `manageReports.custom.note` | "{note}" | “{note}” |
| `manageShell.loading` | Loading management console... | Loading management console… |
| `manageShell.noCountrySettings` | Couldn't load this truck's country settings. Please refresh. | Couldn’t load this truck’s country settings. Please refresh. |
| `manageShell.notices.allergens` | <b>Allergens not set</b> — customers can't see allergen info until you verify it. Review each dish's allergens on the Menu tab. | <b>Allergens not set</b> — customers can’t see allergen info until you verify it. Review each dish’s allergens on the Menu tab. |
| `manageShell.notices.approval` | {count, plural, one {We found <b>{count}</b> event for you — review and approve before they go live.} other {We found <b>{count}</b> events for you — review and approve before they go live.}} | {count, plural, one {We found <b>{count}</b> event for you — review and approve before it goes live.} other {We found <b>{count}</b> events for you — review and approve before they go live.}} |
| `manageShell.notices.stripe` | <b>Stripe needs something from you</b> — card payments can stop until it's sorted. | <b>Stripe needs something from you</b> — card payments can stop until it’s sorted. |
| `manageShell.profile.saving` | Saving... | Saving… |
| `manageShell.stale` | {hasTime, select, yes {Couldn't refresh. Showing what was saved at {time}. Changes you make are still saved.} other {Couldn't refresh. Showing what was saved. Changes you make are still saved.}} | {hasTime, select, yes {Couldn’t refresh. Showing what was saved at {time}. Changes you make are still saved.} other {Couldn’t refresh. Showing what was saved. Changes you make are still saved.}} |
| `manageShell.trialPopup.body` | {hasDate, select, yes {You won't be charged anything during your trial, which runs until <b>{date}</b>. Billing only ever starts when you choose a plan and enter your payment details. Until then there's nothing to cancel and nothing to pay. Choose your plan before then — if you don't, access will revert to the free Starter tier and some features will stop working.} other {You won't be charged anything while you're on trial. Billing only ever starts when you choose a plan and enter your payment details. Until then there's nothing to cancel and nothing to pay. Choose your plan before then — if you don't, access will revert to the free Starter tier and some features will stop working.}} | {hasDate, select, yes {You won’t be charged anything during your trial, which runs until <b>{date}</b>. Billing only ever starts when you choose a plan and enter your payment details. Until then there’s nothing to cancel and nothing to pay. Choose your plan before then — if you don’t, access will revert to the free Starter tier and some features will stop working.} other {You won’t be charged anything while you’re on trial. Billing only ever starts when you choose a plan and enter your payment details. Until then there’s nothing to cancel and nothing to pay. Choose your plan before then — if you don’t, access will revert to the free Starter tier and some features will stop working.}} |
| `manageShell.trialPopup.title` | You're on a free trial | You’re on a free trial |
| `manageTeam.cancelling` | Cancelling... | Cancelling… |
| `manageTeam.inviteEmail.ignore` | If you weren't expecting this invitation, you can safely ignore this email. | If you weren’t expecting this invitation, you can safely ignore this email. |
| `manageTeam.inviteEmail.subject` | You've been invited to join {truck} on HatchGrab | You’ve been invited to join {truck} on HatchGrab |
| `manageTeam.privacy` | Your personal details are private and never shown to customers. They're used for account management and billing verification. | Your personal details are private and never shown to customers. They’re used for account management and billing verification. |
| `manageTeam.saving` | Saving... | Saving… |
| `manageTeam.sending` | Sending... | Sending… |
| `manageWhatsApp.billing.aboveGeneral` | Your limit is above Meta's {free, number} free replies. Replies beyond that need a payment method on your WhatsApp account; without one, Meta stops all replies once the free ones are used. | Your limit is above Meta’s {free, number} free replies. Replies beyond that need a payment method on your WhatsApp account; without one, Meta stops all replies once the free ones are used. |
| `manageWhatsApp.billing.aboveMissing` | Your limit is above Meta's {free, number} free replies. Without a payment method, Meta will stop all replies once those are used. | Your limit is above Meta’s {free, number} free replies. Without a payment method, Meta will stop all replies once those are used. |
| `manageWhatsApp.billing.chargesBody` | Each reply HatchGrab sends for you is billed by Meta to your WhatsApp Business account. From {from}, Meta includes {free, number} free replies a month per number; after that, each reply is charged at Meta's rate. Replies you send yourself from the WhatsApp Business app aren't charged. Meta sets these prices and may change them. <link>See Meta's pricing</link> | Each reply HatchGrab sends for you is billed by Meta to your WhatsApp Business account. From {from}, Meta includes {free, number} free replies a month per number; after that, each reply is charged at Meta’s rate. Replies you send yourself from the WhatsApp Business app aren’t charged. Meta sets these prices and may change them. <link>See Meta’s pricing</link> |
| `manageWhatsApp.billing.summary` | Meta, not HatchGrab, bills your WhatsApp account for replies. From {from} the first {free, number} a month are free. Correct at {checked}; check <link>Meta's pricing</link> for changes. | Meta, not HatchGrab, bills your WhatsApp account for replies. From {from} the first {free, number} a month are free. Correct at {checked}; check <link>Meta’s pricing</link> for changes. |
| `manageWhatsApp.limit.emailAt` | Replies pause at your limit. We'll email you at 80% and 100%. | Replies pause at your limit. We’ll email you at 80% and 100%. |
| `manageWhatsApp.limit.perCustomer` | Up to {n} replies per customer in 24 hours, then one message saying you'll reply personally. | Up to {n} replies per customer in 24 hours, then one message saying you’ll reply personally. |
| `manageWhatsApp.preview.examples.menu` | What's on the menu? | What’s on the menu? |
| `manageWhatsApp.preview.intro` | Type a question like a customer would ask, and see exactly what they'd get back. Nothing is sent to anyone. | Type a question like a customer would ask, and see exactly what they’d get back. Nothing is sent to anyone. |
| `manageWhatsApp.preview.working` | Working out the reply... | Working out the reply… |
| `socialPosts.screen.couldNotLoad` | Could not load | Could not load. |
| `socialPosts.screen.uploadIncomplete` | The upload did not complete | The upload did not complete. |
| `takingPayment.paidStepNote` | This only affects orders you add. It doesn't affect online orders. | This only affects orders you add. It doesn’t affect online orders. |
| `weeklyPostApi.noPicturesAll` | All {total} of your locations have an image. | {total, plural, one {Your location has an image.} other {All {total} of your locations have an image.}} |
| `weeklyPostApi.noPicturesSome` | {without} of your {total} locations have no image yet | {without, plural, one {{without} of your {total} locations has no image yet} other {{without} of your {total} locations have no image yet}} |
| `dashboard.settings.completionHelp` | What happens when an unpaid order is ready to hand over. | (removed) |
| `dashboard.settings.completionTitle` | Completing an unpaid order | (removed) |
| `dashboard.settings.paidStepTitle` | Take orders without payment | (removed) |
| `dashboard.settings.pressesOne` | One press (“Mark paid & collected”) | (removed) |
| `dashboard.settings.pressesOneHelp` | Best when you take the money as you hand the food over. You get a single button, “Mark paid & collected”, which records the payment and clears the order together. | (removed) |
| `dashboard.settings.pressesTwo` | Two presses (“Mark paid” & “Collected”) | (removed) |
| `dashboard.settings.pressesTwoHelp` | Best when payment and handover happen at different moments — someone pays at the hatch, then collects when it’s ready. You get two buttons: “Mark paid” first, then “Collected” when they take the food. | (removed) |

### A2 · US overrides added or changed (107) and removed or moved (4)

| key | en-GB | en-US |
|---|---|---|
| `errorsManage.select_one_van` | Please select at least one van | Please select at least one truck |
| `errorsManage.wa_unrecognised_outcome` | Unrecognised signup outcome. | Unrecognized signup outcome. |
| `errorsManage.domain_send_unavailable` | We could not send that just now. Try again shortly — or copy the details on this screen and email them across yourself, which works just as well. | We could not send that just now. Try again shortly — or copy the details on this screen and email them over yourself, which works just as well. |
| `errorsManage.wp_licence_required` | Please tick to confirm you own or have a licence to use this font. | Please check the box to confirm you own or have a license to use this font. |
| `errorsManage.wp_last_toggle` | Keep either Location or Time switched on. A cancelled event shows its place crossed out and the word CANCELLED, so with both off there would be nothing to say it is cancelled. | Keep either Location or Time switched on. A canceled event shows its place crossed out and the word CANCELED, so with both off there would be nothing to say it is canceled. |
| `errorsManage.sg_merge_cycle` | Those two are already merged the other way round. | Those two are already merged the other way around. |
| `manageReports.custom.title` | Customisations | Customizations |
| `manageReports.csv.collectionTime` | Collection time | Pickup time |
| `socialPosts.placePicturesBlurb` | Save images for a location — a pub’s logo, a photo, a festival’s poster. Your designs decide where they appear: in an image box on your weekly or single event post, or as the whole background. | Save images for a location — a bar’s logo, a photo, a festival’s poster. Your designs decide where they appear: in an image box on your weekly or single event post, or as the whole background. |
| `socialPosts.allTextSample` | Font, colour and effects for everything | Font, color and effects for everything |
| `socialPosts.followNote` | Same font, colour and effects as All text | Same font, color and effects as All text |
| `socialPosts.lookSameHint` | Font, colour and effects come from All text. Pick “Its own style” to change them for this box only. | Font, color and effects come from All text. Pick “Its own style” to change them for this box only. |
| `socialPosts.lookOwnHint` | This box has its own font, colour and effects. Pick “Same as All text” to match the others again. | This box has its own font, color and effects. Pick “Same as All text” to match the others again. |
| `socialPosts.styleMatchHint` | Font, colour and effects come from All text, so everything matches. | Font, color and effects come from All text, so everything matches. |
| `socialPosts.styleOwnHint` | Font, colour and effects are set just for this. | Font, color and effects are set just for this. |
| `socialPosts.effectBand` | Coloured strip behind the words | Colored strip behind the words |
| `socialPosts.effectAutoHint` | If the words are hard to read on your picture, we add a soft shadow. Your colours never change. | If the words are hard to read on your picture, we add a soft shadow. Your colors never change. |
| `socialPosts.editorMoreSummary` | Spacing, tilt, words before, line spacing, darken the picture, centre the box | Spacing, tilt, words before, line spacing, darken the picture, center the box |
| `socialPosts.editorMoreSummaryBox` | Words before, line spacing, tilt, long names, centre the box | Words before, line spacing, tilt, long names, center the box |
| `socialPosts.alignCentre` | ≡ Centre | ≡ Center |
| `socialPosts.labelCentreOn` | Centre on the picture | Center on the picture |
| `socialPosts.nameFromScheduleNote` | Name and area come from your schedule. Edit them in Schedule › Events › Add event › Tidy up places. | Name and area come from your schedule. Edit them in Schedule › Events › Add event › Clean up places. |
| `socialPosts.socialTagPlaceholder` | @buresmusicfest | @austinmusicfest |
| `socialPosts.captionThisPostNote` | Type straight in the box to change it for this post only. Your template stays as it is. | Type right in the box to change it for this post only. Your template stays as it is. |
| `socialPosts.effectOutline` | Outline round the letters | Outline around the letters |
| `managePayments.state.unsupported.body` | Stripe cannot enable card payments here. Get in touch and we will sort it out with you. | Stripe cannot enable card payments here. Get in touch and we will fix it with you. |
| `managePayments.keyMismatch.fix` | Both keys must be set for the same environment, and the site rebuilt afterwards — the publishable key is baked in at build time, the secret key is read on every request. | Both keys must be set for the same environment, and the site rebuilt afterward — the publishable key is baked in at build time, the secret key is read on every request. |
| `managePayments.walkUp.body` | How you take money at the hatch. HatchGrab charges no platform fee on walk-ups, whichever you choose. | How you take money at the window. HatchGrab charges no platform fee on walk-ups, whichever you choose. |
| `managePayments.walkUp.ownTerminalHelp` | Zettle, Square, or whatever you already use. Nothing to set up — only your provider’s own fees apply. | Square, Clover, or whatever you already use. Nothing to set up — only your provider’s own fees apply. |
| `managePayments.walkUp.hatchgrabHelp` | Uses the same Stripe connection as your online payments — a card reader, or contactless straight from your phone or tablet. | Uses the same Stripe connection as your online payments — a card reader, or tap to pay straight from your phone or tablet. |
| `managePayments.walkUp.hatchgrabFees` | {fee} per payment on {region}, plus {surcharge} for contactless taken on a phone or tablet. Other cards may cost more. | {fee} per payment on {region}, plus {surcharge} for tap to pay on a phone or tablet. Other cards may cost more. |
| `manageShell.verify.expired` | That confirmation link has expired. Get in touch and we’ll sort it before you go live. | That confirmation link has expired. Get in touch and we’ll fix it before you go live. |
| `manageShell.verify.invalid` | That confirmation link didn’t work. Get in touch and we’ll sort it before you go live. | That confirmation link didn’t work. Get in touch and we’ll fix it before you go live. |
| `manageShell.tabs.paymentsIcon` | 💷 | 💵 |
| `manageShell.notices.domainLive` | <link>{domain}</link> is live. Have a look at it, then tell us it is right in Settings. | <link>{domain}</link> is live. Take a look at it, then tell us it is right in Settings. |
| `manageShell.notices.stripe` | <b>Stripe needs something from you</b> — card payments can stop until it’s sorted. | <b>Stripe needs something from you</b> — card payments can stop until it’s fixed. |
| `manageBilling.footnote2Masked` | Online payments are powered by Stripe Connect. Platform and card processing fees are TBC and will be confirmed at launch. | Online payments are powered by Stripe Connect. Platform and card processing fees are TBD and will be confirmed at launch. |
| `manageBilling.upgradeModal.body` | We’re setting up automated billing. To upgrade now, drop us a message and we’ll get you set up within 24 hours. | We’re setting up automated billing. To upgrade now, send us a message and we’ll get you set up within 24 hours. |
| `manageTeam.toast.emailChangeCancelled` | Email change cancelled | Email change canceled |
| `manageTeam.ownerLine` | Owner · All vans | Owner · All trucks |
| `manageTeam.cancelling` | Cancelling… | Canceling… |
| `manageTeam.phonePlaceholder` | +44 7700 900000 | +1 312 555 0100 |
| `manageWhatsApp.preview.examples.doYouDo` | Do you do pepperoni? | Do you have pepperoni? |
| `manageWhatsApp.preview.placeholder` | What desserts do you do? | What desserts do you have? |
| `manageWhatsApp.preview.working` | Working out the reply… | Writing the reply… |
| `manageWhatsApp.card.expiring` | Your WhatsApp connection needs renewing soon. Press Reconnect to keep auto-replies running. | Your WhatsApp connection needs to be renewed soon. Press Reconnect to keep auto-replies running. |
| `manageWhatsApp.billing.summary` | Meta, not HatchGrab, bills your WhatsApp account for replies. From {from} the first {free, number} a month are free. Correct at {checked}; check <link>Meta’s pricing</link> for changes. | Meta, not HatchGrab, bills your WhatsApp account for replies. From {from} the first {free, number} a month are free. Correct as of {checked}; check <link>Meta’s pricing</link> for changes. |
| `manageWhatsApp.disconnect.body` | Auto-replies stop straight away and HatchGrab loses access to your WhatsApp account. Your number keeps working in the WhatsApp Business app. To remove HatchGrab completely, also open WhatsApp Business → Settings → Account → Business Platform. | Auto-replies stop right away and HatchGrab loses access to your WhatsApp account. Your number keeps working in the WhatsApp Business app. To remove HatchGrab completely, also open WhatsApp Business → Settings → Account → Business Platform. |
| `manageWhatsApp.signup.needsRegistering` | Your account is linked, but this number needs registering by us before replies can start. Please contact support — your setup is saved, do not run it again. | Your account is linked, but this number needs to be registered by us before replies can start. Please contact support — your setup is saved, do not run it again. |
| `manageWhatsApp.signup.numberTaken` | That WhatsApp number is already connected to another HatchGrab account. A number can only answer for one truck. Contact support and we will move it across. | That WhatsApp number is already connected to another HatchGrab account. A number can only answer for one truck. Contact support and we will move it over. |
| `customDomain.card.justLive` | <b>{address}</b> is working. Have a look at it, then tell us it is right below. | <b>{address}</b> is working. Take a look at it, then tell us it is right below. |
| `customDomain.ready.body` | Have a look at it, then tell us it is right in your settings. | Take a look at it, then tell us it is right in your settings. |
| `customDomain.confirm.heading` | Have a look, then tell us it is right | Take a look, then tell us it is right |
| `customDomain.turnOff.carriesOn` | This carries on exactly as it is, and is where your QR code sends people: | This continues exactly as it is, and is where your QR code sends people: |
| `customDomain.providers.cloudflare.proxy` | Set “Proxy status” to “DNS only” — the cloud beside it must be grey, not orange. | Set “Proxy status” to “DNS only” — the cloud beside it must be gray, not orange. |
| `customDomain.providers.123reg.value` | Put the second value below in “Value”, and add a full stop to the end of it. | Put the second value below in “Value”, and add a period to the end of it. |
| `customDomain.providers.123reg.caveat` | 123 Reg needs a full stop at the end of the second value or it will not work. | 123 Reg needs a period at the end of the second value or it will not work. |
| `customDomain.instructionsEmail.introAt` | We are putting {truckName}’s live schedule on {address}, and it needs one record adding to our domain at {provider}. | We are putting {truckName}’s live schedule on {address}, and it needs one record added to our domain at {provider}. |
| `customDomain.instructionsEmail.introHolder` | We are putting {truckName}’s live schedule on {address}, and it needs one record adding to our domain with whoever holds our domain. | We are putting {truckName}’s live schedule on {address}, and it needs one record added to our domain with whoever holds our domain. |
| `customDomain.instructionsEmail.pointsAt` | The page it points at shows where we are trading next and keeps itself up to date. | The page it points at shows where we are serving next and keeps itself up to date. |
| `customDomain.liveEmail.body` | Your schedule is now showing at your own address. Have a look at it and check it is right: open {address}, make sure the events are yours and the dates look correct. | Your schedule is now showing at your own address. Take a look at it and check it is right: open {address}, make sure the events are yours and the dates look correct. |
| `deleteAccount.upcoming` | <b>You have {count, plural, one {# upcoming order} other {# upcoming orders}}.</b> These will still need fulfilling. | <b>You have {count, plural, one {# upcoming order} other {# upcoming orders}}.</b> These will still need to be fulfilled. |
| `posterWords.heading` | Week commencing {start} to {end} | Week of {start} |
| `posterWords.daysOff` | No trading today | Closed today |
| `posterWords.cancelled` | CANCELLED | CANCELED |
| `posterWords.placeSample.nameTownBelow` | The Kings Arms\nLavenham | Main Street Brewery\nAustin |
| `posterWords.placeSample.nameTown` | The Kings Arms, Lavenham | Main Street Brewery, Austin |
| `posterWords.placeSample.nameOnly` | The Kings Arms | Main Street Brewery |
| `posterWords.busyWeek.venue1` | Lavenham Village Hall | Austin Community Center |
| `posterWords.busyWeek.town1` | Lavenham | Austin |
| `posterWords.busyWeek.venue2` | Great Waldingfield Recreation Ground and Playing Field | Round Rock Memorial Park Recreation Center and Ballfields |
| `posterWords.busyWeek.town2` | Great Waldingfield | Round Rock |
| `posterWords.busyWeek.venue3` | Market Square | Town Square |
| `posterWords.busyWeek.town3` | Sudbury | Georgetown |
| `posterWords.busyWeek.town4` | Bury St Edmunds | San Marcos |
| `posterWords.busyWeek.venue5` | The Bull Inn | Main Street Brewery |
| `posterWords.busyWeek.town5` | Cavendish | Pflugerville |
| `posterWords.busyWeek.venue6` | Church Green | Riverside Park |
| `posterWords.busyWeek.town6` | Long Melford | Cedar Park |
| `captions.dayLineCancelled` | {day} — {where} — CANCELLED, sorry | {day} — {where} — CANCELED, sorry |
| `weeklyPostApi.licenceTick` | I own this font or have a licence to use it | I own this font or have a license to use it |
| `designEditor.item.weekHeadingSample` | Week commencing … | Week of … |
| `designEditor.sample.venue` | The Kings Arms | Main Street Brewery |
| `designEditor.sample.area` | Lavenham | Austin |
| `designEditor.rows.showCancelled` | Show cancelled events | Show canceled events |
| `designEditor.rows.showCancelledHint` | A cancelled event shows its place crossed out and the word CANCELLED. Switched off, the day reads as a day off. | A canceled event shows its place crossed out and the word CANCELED. Switched off, the day reads as a day off. |
| `designEditor.picture.drawBorderHint` | A line around the picture, in your own colour. | A line around the picture, in your own color. |
| `designEditor.settings.colour` | Colour | Color |
| `designEditor.settings.textColour` | Text colour | Text color |
| `designEditor.settings.lastToggle` | {kind, select, weekly {Keep either Place or Time switched on. A cancelled event shows its place crossed out and the word CANCELLED, so with both off there would be nothing to say it is cancelled.} other {Keep either Venue or Time switched on. A cancelled event shows its place crossed out and the word CANCELLED, so with both off there would be nothing to say it is cancelled.}} | {kind, select, weekly {Keep either Place or Time switched on. A canceled event shows its place crossed out and the word CANCELED, so with both off there would be nothing to say it is canceled.} other {Keep either Venue or Time switched on. A canceled event shows its place crossed out and the word CANCELED, so with both off there would be nothing to say it is canceled.}} |
| `designEditor.align.centre` | Centre | Center |
| `designEditor.effects.outlineColour` | Outline colour | Outline color |
| `designEditor.effects.bandColour` | Band colour | Band color |
| `designEditor.effects.bandCancelled` | Band when the event is cancelled | Band when the event is canceled |
| `designEditor.effects.bandDaysOffHint` | Used instead of the band above on a day with no trading. | Used instead of the band above on a day you’re closed. |
| `designEditor.effects.bandCancelledHint` | Used instead of the band above when the event is cancelled. | Used instead of the band above when the event is canceled. |
| `designEditor.bits.chooseColourFor` | {label} — choose any colour | {label} — choose any color |
| `designEditor.bits.chooseColour` | Choose any colour | Choose any color |
| `fontPicker.licenceTick` | I own this font or have a licence to use it | I own this font or have a license to use it |
| `weeklyPost.post.weekOf` | w/c {date} | Week of {date} |
| `weeklyPost.post.eventDateCancelled` | {date} · cancelled | {date} · canceled |
| `weeklyPost.post.showCancelled` | Show cancelled events | Show canceled events |
| `weeklyPost.post.notePlaceholder` | e.g. Pre-order for collection | e.g. Pre-order for pickup |
| `completionSettings.pressesOne` | One press (“Mark paid & collected”) | One press (“Mark paid & picked up”) |
| `completionSettings.pressesOneHelp` | Best when you take the money as you hand the food over. You get a single button, “Mark paid & collected”, which records the payment and clears the order together. | Best when you take the money as you hand the food over. You get a single button, “Mark paid & picked up”, which records the payment and clears the order together. |
| `completionSettings.pressesTwo` | Two presses (“Mark paid” & “Collected”) | Two presses (“Mark paid” & “Picked up”) |
| `completionSettings.pressesTwoHelp` | Best when payment and handover happen at different moments — someone pays at the hatch, then collects when it’s ready. You get two buttons: “Mark paid” first, then “Collected” when they take the food. | Best when payment and handover happen at different moments — someone pays at the window, then picks up when it’s ready. You get two buttons: “Mark paid” first, then “Picked up” when they take the food. |

Removed or moved: `dashboard.settings.pressesOne`, `dashboard.settings.pressesOneHelp`, `dashboard.settings.pressesTwo`, `dashboard.settings.pressesTwoHelp`
