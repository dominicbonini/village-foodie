# email-sender-1: every HatchGrab email sent from hatchgrab.com

9 November 2026. This work is on main locally. It is committed by path only. It is **not pushed and not deployed**.

## Status

| Step | Status |
|---|---|
| 1. Inventory | Done (§1). Recorded before any code changed. |
| 2. Operator and demo emails → hello@hatchgrab.com (From and Reply-To) | Done in code (§2) |
| 3. Customer-facing truck emails → donotreply@hatchgrab.com; the villagefoodie fallbacks in lib/email.ts replaced | Done in code (§2) |
| 4. Village Foodie consumer emails listed | Done (§3). **None are sent today.** |
| 5. Stale TODO removed; static guard in the sweep | Done (§4). scripts/email-sender-1.cjs passes 43/43, and fails 25 checks on the old code. |
| 6. Brevo account check over its API | Done (§5). Option A, approved by Dominic. hatchgrab.com is **authenticated and verified**, and all four records are green. |
| 7. One test send of each type to dominicbonini@hotmail.com | Done (§6). **9/9 accepted by Brevo (201) and delivered.** |

**Safe to deploy from the email side.** hatchgrab.com is authenticated in Brevo, and Brevo accepted and delivered both hello@hatchgrab.com and donotreply@hatchgrab.com.

**Two things worth doing in Brevo (optional; neither blocks anything):**

- **Senders, Domains & Dedicated IPs → Senders → Add a sender.** Add "HatchGrab" with hello@hatchgrab.com, and "HatchGrab" with donotreply@hatchgrab.com. Today the Senders list has only the five villagefoodie.co.uk addresses. Brevo still accepts any address on an authenticated domain over the API, as the tests prove. Listing them just makes them choosable in Brevo's own UI.
- **NEXT_PUBLIC_SUPPORT_EMAIL is set to a villagefoodie.co.uk address in the local environment**, and probably in Vercel too. It no longer sets any sender. It still decides two things:
  - where contact-form messages are delivered (lib/contact-server.ts supportInbox);
  - the support address the Manage dashboard shows (app/(app)/manage/[token]/page.tsx:14645).

  Change it to hello@hatchgrab.com in Vercel if you want both on the new domain. I did not change or open it.

## §1 Inventory (before any change, read from HEAD 64ac2eb7)

Brevo transactional API (`api.brevo.com/v3/smtp/email`) is the only email provider in the app. No Supabase-auth email is triggered:

- the three `auth.admin.createUser` calls pass `email_confirm: true`;
- `auth.admin.updateUserById` sends nothing;
- the client-side `auth.updateUser` call (reset-password) changes a password only;
- neither Supabase function sends mail.

The outreach mailbox (SMTP via Namecheap, dominic@hatchgrab.com) is out of scope, as the brief said.

"HG" below means `HATCHGRAB_SENDER`, which was `HatchGrab <hello@villagefoodie.co.uk>` with Reply-To `hello@villagefoodie.co.uk`. "EFA" means `process.env.EMAIL_FROM_ADDRESS`. I cannot see its production value, and it is now not read at all (§2).

### HatchGrab-branded: operator, demo, account, admin

| # | Email | Code that sets the sender | From before | Reply-To before |
|---|---|---|---|---|
| 1 | Signup verification | lib/email-signup.ts `sendSignupVerificationEmail` (app/api/signup) | HatchGrab <EFA \|\| hello@hatchgrab.com> | hello@hatchgrab.com |
| 2 | Operator welcome (after verification) | lib/email-signup.ts `sendOperatorWelcomeEmail` (app/api/auth/verify-signup) | HatchGrab <EFA \|\| hello@hatchgrab.com> | hello@hatchgrab.com |
| 3 | Admin-created operator welcome | app/api/admin/create-operator | HG: hello@villagefoodie.co.uk | hello@villagefoodie.co.uk |
| 4 | Forgot password | app/api/auth/forgot-password | HG: hello@villagefoodie.co.uk | hello@villagefoodie.co.uk |
| 5 | Change email: verify new address | app/api/auth/change-email | HatchGrab <NEXT_PUBLIC_SUPPORT_EMAIL ?? hello@villagefoodie.co.uk> | none |
| 6 | Resend email-change verification | app/api/auth/resend-verification | same as 5 | none |
| 7 | Team invite | app/api/manage/route.ts (invite_team_member) | HG: hello@villagefoodie.co.uk | hello@villagefoodie.co.uk |
| 8 | Demo "save my demo" return link | app/api/demo/save-email | HG: hello@villagefoodie.co.uk | hello@villagefoodie.co.uk |
| 9 | Demo link email | lib/demo-link-email.ts (app/api/demo) | HG: hello@villagefoodie.co.uk | hello@villagefoodie.co.uk |
| 10 | Account deletion request: confirmation to the requester, plus a copy to HG.replyTo | app/api/account/request-deletion | HG: hello@villagefoodie.co.uk | none |
| 11 | Deletion-due digest (to HG.replyTo) | app/api/cron/account-deletion-due | HG: hello@villagefoodie.co.uk | none |
| 12 | Demo-cleanup digest (to HG.replyTo) | app/api/cron/demo-cleanup | HG: hello@villagefoodie.co.uk | none |
| 13 | Demo build request (to HG.replyTo) | app/api/demo/build-request | HG: hello@villagefoodie.co.uk | none |
| 14 | Paperwork renewal reminder (to the truck) | lib/paperwork/email.ts `sendReminderEmail` (cron) | HG: hello@villagefoodie.co.uk | hello@villagefoodie.co.uk |
| 15 | Contact form → support | lib/contact-server.ts `brevoSend` | HatchGrab <hello@hatchgrab.com> | the visitor's address |
| 16 | Scraper "no upcoming events" nudge | scripts/run-scraper.js | HatchGrab <hello@hatchgrab.com> | none |
| 17 | Operator copies and admin alerts through lib/email.ts `sendConfirmationEmail` with senderName "HatchGrab": new-order copy to the truck (orders/submit, payments/promote-draft, dashboard/action manual order), new events found (inbound-schedule), custom domain live (manage, cron/custom-domain-check), admin domain alert (lib/custom-domain/alert.ts), screenshot outage alert, comparison summary cron, competitor-check summary (GitHub Actions), WhatsApp alert emails (lib/whatsapp/alerts.ts) | lib/email.ts | HatchGrab <EFA \|\| donotreply@villagefoodie.co.uk> | none |

### Customer-facing, under the truck's name

| # | Email | Code that sets the sender | From before | Reply-To before |
|---|---|---|---|---|
| 18 | Order confirmation, confirmed/edited, ready, slot moved, refund, cancellation by customer, event cancellation | lib/email.ts `sendConfirmationEmail` (truckName or senderName = the truck), called from orders/submit, payments/promote-draft, dashboard/action, orders/cancel, events/action; also `sendRefundEmail`, `sendCancellationEmail`, `sendEventCancellationEmail` | <truck> <EFA \|\| donotreply@villagefoodie.co.uk> | none |
| 19 | Reject notice, operator-cancel notice | lib/email.ts `notifyCustomer` (lib/orders/reject-order.ts, dashboard/action) | <truck> <EFA \|\| donotreply@villagefoodie.co.uk> | none |
| 20 | Custom-domain DNS instructions (sent to whoever the operator names) | lib/email.ts via app/api/manage (senderName = the truck) | <truck> <EFA \|\| donotreply@villagefoodie.co.uk> | none |
| 21 | Review request (not sent today: platform switch off) | lib/reviews/email.ts `sendReviewEmail` | "<truck> via HatchGrab" <hello@villagefoodie.co.uk> | the truck's contact email, else none (so replies went to the From) |
| 22 | Paperwork share to an organiser | lib/paperwork/email.ts `sendShareEmail` | "<truck> via HatchGrab" <hello@villagefoodie.co.uk> | the truck's contact email, else none |

Unused: `truckSender()` (donotreply@ and hello@villagefoodie.co.uk) had no caller. `VILLAGE_FOODIE_SENDER` is covered in §3.

**The French prospect.** Rows 8 and 9 (demo) and rows 3 and 4 sent from hello@villagefoodie.co.uk for certain. Rows 1 and 2 (signup) did so only if EMAIL_FROM_ADDRESS is set to that address in Vercel. Their report suggests it is, and the Brevo From-address count I tried to run would have settled it. Either way, EFA is no longer read.

## §2 What changed

| File | Change |
|---|---|
| lib/email-config.ts | `HATCHGRAB_HELLO` = hello@hatchgrab.com and `HATCHGRAB_NOREPLY` = donotreply@hatchgrab.com. `HATCHGRAB_SENDER` is now hello@ for both email and replyTo. `truckSender` is now donotreply@, Reply-To hello@. New `brevoFrom(name)`: "HatchGrab" gives hello@ with Reply-To hello@; any other name gives donotreply@ with no Reply-To. The stale TODO is replaced by the rule and its reason. `VILLAGE_FOODIE_SENDER` is unchanged. |
| lib/email.ts | `sendConfirmationEmail` and `notifyCustomer` take their From from `brevoFrom`. EFA and both villagefoodie fallbacks are gone. Operator copies and admin alerts now get Reply-To hello@hatchgrab.com. Customer mail stays as before: no Reply-To. |
| lib/email-signup.ts | The From is `HATCHGRAB_SENDER` and no longer `EMAIL_FROM_ADDRESS \|\| …`. `HATCHGRAB_REPLY_TO` is now an alias of `HATCHGRAB_SENDER.replyTo` (lib/contact-server.ts imports it). The "NOT LIVE YET" note is removed. |
| app/api/auth/change-email, app/api/auth/resend-verification | The sender is `HATCHGRAB_SENDER` (it was `NEXT_PUBLIC_SUPPORT_EMAIL ?? hello@villagefoodie.co.uk`). Reply-To hello@ added. |
| app/api/account/request-deletion | Reply-To hello@ added to its sends. |
| lib/reviews/email.ts, lib/paperwork/email.ts (share) | The From is donotreply@hatchgrab.com under "<truck> via HatchGrab". Reply-To keeps its purpose: the truck's own address where held, otherwise hello@hatchgrab.com, which is where the old From took replies. |
| scripts/email-sender-1.cjs (new), scripts/harnesses.json | The guard (§4), added to the sweep. |

Every other row in §1 moved automatically, because it reads `HATCHGRAB_SENDER`.

| Email type | From after | Reply-To after |
|---|---|---|
| Rows 1–14, 17 (HatchGrab's own) | HatchGrab <hello@hatchgrab.com> | hello@hatchgrab.com. Rows 11–13 set none, but their From is hello@. |
| Rows 15, 16 | unchanged (already hello@hatchgrab.com) | unchanged |
| Rows 18–20 (truck to customer) | <truck> <donotreply@hatchgrab.com> | none (as before) |
| Rows 21, 22 | "<truck> via HatchGrab" <donotreply@hatchgrab.com> | the truck's address, else hello@hatchgrab.com |

**Side effects, on purpose:**

- **Admin notices move inbox.** The internal notices that are addressed *to* `HATCHGRAB_SENDER.replyTo` now arrive at **hello@hatchgrab.com** instead of hello@villagefoodie.co.uk. These are the deletion-request copy, the deletion-due digest, the demo-cleanup digest and demo build requests. hello@hatchgrab.com is the real Namecheap mailbox (the outreach login), and the contact form already goes there.
- **The deletion screen changes.** The support address shown on the account-deletion screen (components/manage/DeleteAccountSection.tsx reads `HATCHGRAB_SENDER.replyTo`) now reads hello@hatchgrab.com.
- **EMAIL_FROM_ADDRESS is no longer read by any code.** You can delete it from Vercel and from the competitor-check GitHub secret whenever you like. Leaving it does nothing.

**Not changed (not an email sender, flagged for you):** app/(app)/manage/[token]/page.tsx:14645 still shows `NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hello@villagefoodie.co.uk'` as the dashboard's support address. lib/utils.ts uses `@villagefoodie.co.uk` as the calendar-invite UID domain. Neither is a From or Reply-To. Say if you want the dashboard address moved too.

## §3 Village Foodie consumer emails (VILLAGE_FOODIE_SENDER)

**None.** `VILLAGE_FOODIE_SENDER` (Village Foodie <donotreply@villagefoodie.co.uk>, Reply-To hello@villagefoodie.co.uk) is defined in lib/email-config.ts and imported by no file. No discovery or newsletter email is sent by this codebase today. The constant is unchanged and stays on villagefoodie.co.uk. The guard requires that it stays unused by HatchGrab paths: any future Village Foodie email has to be added to the guard on purpose.

## §4 The guard: scripts/email-sender-1.cjs (in the sweep)

- **§1** finds every tracked file that posts to Brevo (app, lib, components, supabase/functions, the scraper, competitor-check) and checks that the 17 inventoried files are among them.
- **§2** strips comments from each file, then fails on any `@villagefoodie.co.uk` address, `EMAIL_FROM_ADDRESS`, `NEXT_PUBLIC_SUPPORT_EMAIL` as a sender, or `VILLAGE_FOODIE_SENDER`. Every `sender` and `replyTo` value must name an allowed address: HatchGrab's constants, or the person the mail is about (the truck's own address, the contact-form visitor). Both lib/email.ts calls must use `brevoFrom`.
- **§3** checks that lib/email-config.ts's HatchGrab addresses are on hatchgrab.com, that villagefoodie.co.uk appears only inside `VILLAGE_FOODIE_SENDER`, and that the TODO is gone.
- **§4** checks behaviour. Each lib sender is called through the real code, bundled with the render kit, with `fetch` replaced by a recorder and a dummy key. Nothing reaches the network. EMAIL_FROM_ADDRESS and NEXT_PUBLIC_SUPPORT_EMAIL are deliberately set to villagefoodie.co.uk values, and the checks assert the exact From and Reply-To for 14 email types.

Result: **43/43** on the new tree. Run against a worktree at HEAD 64ac2eb7, it **fails 25 checks** (every villagefoodie sender), then crashes on the missing `brevoFrom`. So it detects the old state.

### Re-pins (older harnesses that compare emails or the deletion screen with a capture from before)

scripts/_lp-email-sender-1.cjs names exactly what changed, and every transform leaves its input untouched where the old values are absent:

- **email-sender-1-hatchgrab-sender** (1c API views, through scripts/_lp2-named.cjs; used by language-phase-1c and language-phase-2). From is hello@hatchgrab.com. A Reply-To on the old domain becomes hello@hatchgrab.com. The email-change and deletion emails gain Reply-To hello@hatchgrab.com. Admin copies go to hello@hatchgrab.com.
- **email-sender-1-deletion-address** (1d2 wada views, through scripts/_lp1d2-named.cjs). The deletion screen's support address is now hello@hatchgrab.com.
- **brevoBody**: us-rehearsal-fixes' GB event-cancellation check. A truck's From changes from donotreply@villagefoodie.co.uk to donotreply@hatchgrab.com.
- **paperwork-1**: two checks re-pinned. The organiser share is now From HATCHGRAB_NOREPLY; it was HATCHGRAB_SENDER.
- The generated lists scripts/fixtures/language-phase-1d2-us-changed.txt and language-phase-2-us-changed.txt now name the email-sender-1 entries.

### Sweep

**Main tree** (shared with other sessions' uncommitted work): 199/207 passed. Of the 8 failures, 5 were mine and are now re-pinned. The other 3 were:
- perf-1 and cwv-2: app/(app)/manage/[token]/page.tsx changed, which is another session's uncommitted edit;
- event-types-render: the main checkout's stale `.next`.

**Clean worktree** (HEAD e3108076 plus only this work): **204/207 passed**, and each re-pinned harness passes on its own:

| Harness | Result |
|---|---|
| us-rehearsal-fixes | 64/64 |
| paperwork-1 | 114/114 |
| language-phase-1c | 4402/4402 |
| language-phase-1d2 | 692/692 |
| language-phase-2 | 2000/2000 |
| perf-1 | 50/50 |
| cwv-2 | 43/43 |
| email-sender-1 | 43/43 |

The 3 clean-tree failures (event-types-render, pending-card-render, pending-card-buttons) stop at "no .next/static — run `npx next build` first", because a fresh worktree has no build. The two pending-card ones passed in the main-tree sweep.

tsc is clean, and eslint is clean on every changed file.

## §5 Brevo and DNS (step 6)

**Brevo API** (read-only GETs; key loaded by the app's own env loader, never printed):

| Check | Result |
|---|---|
| GET /senders/domains | villagefoodie.co.uk: authenticated, verified. **hatchgrab.com: authenticated, verified.** |
| GET /senders/domains/hatchgrab.com | DKIM 1 (brevo1._domainkey CNAME) ✓ · DKIM 2 (brevo2._domainkey CNAME) ✓ · Brevo code (TXT @) ✓ · DMARC (TXT _dmarc) ✓ |
| GET /senders | 5 senders, all villagefoodie.co.uk: dominic@, hello@, schedule@, orders@, donotreply@. **No hatchgrab.com sender is listed.** It isn't needed: Brevo accepted every hatchgrab.com From in §6. The optional tidy-up is under Status. |
| From addresses Brevo sent from, last 30 days (94 requests) | donotreply@villagefoodie.co.uk 83 · hello@villagefoodie.co.uk 8 · hello@hatchgrab.com 3 |

The 30-day counts confirm the problem. Almost everything went out on the old domain:
- 83 from donotreply@villagefoodie.co.uk: the order mail and operator copies through lib/email.ts;
- 8 from hello@villagefoodie.co.uk: the HATCHGRAB_SENDER paths, including the demo emails the French prospect got;
- 3 from hello@hatchgrab.com: the contact form and the scraper.

EMAIL_FROM_ADDRESS is unset locally. Its Vercel value is unknown, but it is no longer read.

**Public DNS for hatchgrab.com** (`dig @1.1.1.1`, read-only):

| Record | Value | Verdict |
|---|---|---|
| TXT hatchgrab.com | `brevo-code:8ee2038486608494adab274131f6e560` | Brevo ownership code present (the same account code as villagefoodie.co.uk) |
| CNAME brevo1._domainkey | b1.hatchgrab-com.dkim.brevo.com → publishes an RSA key | DKIM 1 OK |
| CNAME brevo2._domainkey | b2.hatchgrab-com.dkim.brevo.com → publishes an RSA key | DKIM 2 OK |
| TXT _dmarc | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` | DMARC present (Brevo's suggested record) |
| TXT SPF | `v=spf1 include:spf.privateemail.com ~all` | No Brevo include. Brevo's current setup authenticates with DKIM plus DMARC and its own return-path, and villagefoodie.co.uk (which has sent fine) has the identical SPF. Not a blocker. |
| MX | mx1/mx2.privateemail.com | hello@hatchgrab.com receives replies |

This is exactly the record set villagefoodie.co.uk has. So the DNS side of "authenticated in Brevo" is in place. The account-side ticks and the sender list still need step 6.

## §6 Test sends (step 7)

**How they were sent:** at 22:20 UTC on 9 November 2026, through the real modules, bundled with the harness render kit. The database stand-in throws on any use, so nothing read or wrote Supabase.

**Data:** test-truck "Pizza Kitchen" (GB, a read-only lookup) and a fictional order #7. Links in the emails are deliberately invalid test links.

**Safety guard:** the script forwarded a Brevo request only if its single recipient was dominicbonini@hotmail.com, with no cc or bcc. Nothing went to a customer, a live truck or hello@hatchgrab.com.

**Brevo's events after 3 minutes:** every message is *delivered* (accepted by Outlook's servers). #8 was also *opened*. Brevo cannot see whether Outlook filed each one in the Inbox or in Junk.

| # | Email type | From | Reply-To | Brevo | Subject to look for |
|---|---|---|---|---|---|
| 1 | Signup verification (fr-FR) | HatchGrab <hello@hatchgrab.com> | hello@hatchgrab.com | 201, delivered | "Confirmez votre adresse e-mail" |
| 2 | Operator welcome | HatchGrab <hello@hatchgrab.com> | hello@hatchgrab.com | 201, delivered | "Welcome to HatchGrab, Dominic" |
| 3 | Demo link | HatchGrab <hello@hatchgrab.com> | hello@hatchgrab.com | 201, delivered | "Your HatchGrab demo — here's your link" |
| 4 | New-order copy to the operator | HatchGrab <hello@hatchgrab.com> | hello@hatchgrab.com | 201, delivered | "[TEST email-sender-1] 🔔 New order #7 — Dominic (test) · 12:30" |
| 5 | Order confirmation to a customer | Pizza Kitchen <donotreply@hatchgrab.com> | (none, as before) | 201, delivered | "[TEST email-sender-1] Order #7 confirmed" |
| 6 | Reject / cancel notice to a customer | Pizza Kitchen <donotreply@hatchgrab.com> | (none, as before) | 201, delivered | "[TEST email-sender-1] Your order #7 could not be accepted" |
| 7 | Review request | Pizza Kitchen via HatchGrab <donotreply@hatchgrab.com> | hello@hatchgrab.com (no truck address given) | 201, delivered | "[TEST email-sender-1] How was your order from Pizza Kitchen?" |
| 8 | Paperwork share | Pizza Kitchen via HatchGrab <donotreply@hatchgrab.com> | hello@hatchgrab.com (no truck address given) | 201, delivered, opened | "Pizza Kitchen has sent you their documents" |
| 9 | Paperwork reminder | HatchGrab <hello@hatchgrab.com> | hello@hatchgrab.com | 201, delivered | "A document needs renewing" |

**Not sent separately:**
- The inline route emails (forgot password, team invite, email change, admin-created welcome, demo save-email, deletion request and the admin digests) build their From and Reply-To from the same HATCHGRAB_SENDER constant as #9. scripts/email-sender-1.cjs §2 and §3 prove that statically.
- Sending them for real would mean running those routes against the database.

**What to check in Outlook:**
- Look in the **Inbox and the Junk Email folder** for the 9 subjects above.
- Open one HatchGrab email (#2) and one truck email (#5). Under *View message details* (or the headers), check:
  - `From: …@hatchgrab.com`;
  - `dkim=pass header.d=hatchgrab.com`;
  - `dmarc=pass`.

  That is the alignment Outlook is strict about.
- If any landed in Junk, mark it *Not junk*, and tell me which numbers.

## SQL

One read-only query (the test truck's name for §6):

```sql
select id, name, slug, country from trucks where id = 'test-truck';
```

## Commits

- **1d97ffc4** has the code, the guard and the re-pins. It was staged by path. In scripts/_lp2-named.cjs and scripts/harnesses.json only my lines were staged; demo-claim-2's uncommitted lines in those files were left alone.
- This report is committed separately; the step 6 and 7 results were added in a second report commit.
- Not pushed and not deployed.
