// lib/legal.ts
// ONE PLACE THAT KNOWS WHERE THE LEGAL DOCUMENTS LIVE.
//
// 🔴 NO ROUTE STRING FOR THESE DOCUMENTS MAY BE TYPED INLINE ANYWHERE. Import from here. Before this file
// there were SIX inline `"/privacy"` / `"/terms"` literals across four files, and a seventh would have been
// added by the next person to build a surface that needs one. A path that appears in six places is a path
// that gets renamed in five.
//
// ── 🔴 THE COMPLETE LIST OF PLACES THESE MUST BE LINKED FROM ────────────────────────────────────────────
// If you add a surface that collects an account, a payment, or personal data, add it to this list FIRST and
// then wire it. The list is the specification; the code is downstream of it.
//
// IN THIS CODEBASE:
//   1. ✅ Landing page footer — app/landing/page.tsx
//   2. ✅ Signup form, above the submit button — app/signup/page.tsx
//        🔴 Must be readable BEFORE the account is created. Consent by conduct is only defensible if the
//        documents were reachable at the moment of consent (§13 records terms_accepted_at + terms_version
//        as the evidence that it happened; these links are the evidence that it COULD have).
//   3. ✅ Demo → signup modal, same consent line — components/DemoGetStarted.tsx (two call sites: the
//        account step, and the marketing opt-in's privacy reference)
//   4. ✅ Operator account menu — components/dashboard/UserMenu.tsx
//        🔴 THIS ONE IS AN APP STORE REQUIREMENT, not a nicety. Guideline 5.1.1(i) requires the privacy
//        policy to be accessible WITHIN the app, not only in store metadata, and App Review may test
//        with ANY role. **This is the app's only in-app route** — do not remove it without providing
//        another one first.
//
//        ── 🔴 WHICH SURFACES ACTUALLY RENDER UserMenu — CORRECTED 10 August 2026 ────────────────────
//        THREE, and the KDS is NOT among them. Verified by `grep -rn "<UserMenu"`, which returns exactly:
//            app/dashboard/[token]/page.tsx:~2500   (the DASHBOARD)
//            app/manage/[token]/page.tsx:~530       (MANAGE)
//            app/admin/page.tsx:~655                (ADMIN)
//        ⚠️ THIS ENTRY PREVIOUSLY CLAIMED "dashboard, KDS, manage, admin". THAT WAS WRONG, AND THE
//        OVERSTATEMENT DID DAMAGE: it made moving the links out of this menu look cheap, because the KDS
//        appeared to be covered either way. It never was. The KDS renders no account menu at all — only a
//        native-only "This device" sheet.
//
//        ── 🔴 WHY THIS MENU IS THE RIGHT AND ONLY HOME: IT IS WHAT EVERY ROLE REACHES ────────────────
//        There are exactly TWO surfaces all three roles reach — the DASHBOARD and the KDS:
//          • `owner` / `manager` reach everything;
//          • `staff` are REDIRECTED OUT of Manage (`if (userRole === 'staff') router.replace(...)` in
//            app/manage/[token]/page.tsx) and appear in NO tab's `roles` array, so no part of Manage —
//            Settings included — is reachable by them.
//        This menu renders on the dashboard for EVERY role: its only wrapper there is a demo/breakpoint
//        condition, never a role gate. So one placement here serves owner, manager and staff by the SAME
//        route, which is what a single consistent location means.
//        🔴 THE KDS CARRIES NO LINK, DELIBERATELY. A staff member who spends a shift on the order screen
//        reaches these in ONE EXTRA TAP, via the KDS header's unconditional "← Dashboard" link — which
//        exists precisely because staff are auto-routed to that screen. Putting a legal link in the order
//        screen's own chrome was rejected: an order screen cannot carry a footer.
//
//        ⚠️ MOVED TO Manage → Settings ON 10 August 2026 AND MOVED BACK THE SAME DAY. That placement left
//        STAFF WITH NO IN-APP ROUTE AT ALL — a compliance failure, not a UX preference. Do not repeat it,
//        and do not add a second copy on Manage: one location, or the two drift.
//        ⚠️ NOT the marketing footer (components/Footer.tsx): it renders on landing, venues and truck
//        pages only, never on an operator surface, so it is not an option for this requirement.
//        ⚠️ RENDERED AS A QUIET BLOCK, NOT AS ACTION ITEMS — below an `<hr>`, at `text-xs text-slate-500`
//        against the actions' `text-sm text-slate-700`. That is load-bearing to the placement being
//        acceptable at all; promoting them to peers of Manage and Sign out is what the operator objected
//        to in the first place.
//   5. ✅ The legal pages themselves — each links the other, via the shared layout footer.
//
// OUTSIDE THIS CODEBASE — 🔴 EXTERNAL AND MANUAL. Nothing here can set or verify these; they are listed so
// the set is knowable, not because code touches them:
//   • App Store Connect → App Privacy → Privacy Policy URL. REQUIRED for submission (5.1.1(i)).
//   • Google Play Console → App content → Privacy Policy. REQUIRED for submission.
//   • Stripe Connect onboarding → the platform's terms/privacy URLs shown to connected accounts.
//   • Brevo (transactional email) sender/footer configuration, if a policy link is added to operator mail.
//   • The Google Play Data Safety form and Apple's App Privacy questionnaire must AGREE with the policy —
//     they are separate declarations, not a link, and an inconsistency is a rejection reason.
//
// ⚠️ LAST-UPDATED DATES ARE DATA, NOT DECORATION. They are rendered to the reader as the freshness signal
// and must move whenever the copy does. Update them HERE, never in the page.

/** Canonical route for the privacy policy. */
export const PRIVACY_PATH = '/privacy'

/** Canonical route for the terms. */
export const TERMS_PATH = '/terms'

/** Human-readable last-updated dates.
 *  🔴 THESE MIRROR THE `**Last updated:**` LINE INSIDE content/legal/*.md, WHICH IS THE SOURCE OF TRUTH.
 *  The pages render the document's own line; these exist for anywhere else that needs the date without
 *  parsing the file. ⚠️ If you amend a document, change BOTH — the .md line is what a reader sees. */
export const PRIVACY_UPDATED = '6 August 2026'
export const TERMS_UPDATED = '6 August 2026'

/** Both documents, for anywhere that renders the pair (footers, consent lines). */
export const LEGAL_LINKS = [
  { label: 'Privacy', href: PRIVACY_PATH },
  { label: 'Terms', href: TERMS_PATH },
] as const
