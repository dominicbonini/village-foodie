-- 20260723_signup_consent.sql
-- M2 (Phase 4 Step 2): consent + marketing state on the operator row.
--
-- ADDITIVE / RUN-ANYTIME — nothing reads these until /signup ships. But ORDER-REQUIRED: /signup WRITES
-- all three on every account it creates, so this must land before that deploy or signup 400s on an
-- unknown column. Every statement is `if not exists`; safe to run twice.
--
-- ── WHY RECORD CONSENT AT ALL ───────────────────────────────────────────────────────────────────────
-- Signup uses CONSENT BY CONDUCT ("by creating an account you agree to our Terms and Privacy Policy",
-- both linked under the submit button) rather than a tick-box — standard, and it avoids friction at the
-- single highest-intent moment in the funnel. But consent by conduct is only defensible if you can say
-- WHEN it happened and TO WHAT. Without these columns that claim is unprovable the moment it matters.
--
-- ── WHY A VERSION, NOT JUST A TIMESTAMP ─────────────────────────────────────────────────────────────
-- Terms change. A timestamp alone says someone agreed to "the terms, whatever they were that day", which
-- is not a record of anything. The version pins WHICH document. Today's value is 'holding-2026-07-23'
-- (app/terms/page.tsx is an honest interim, not the final terms) — deliberately named so it is obvious in
-- the data that these accounts agreed to a placeholder and will need re-consent when the real terms land.
alter table operators add column if not exists terms_accepted_at timestamptz;
alter table operators add column if not exists terms_version     text;

comment on column operators.terms_accepted_at is
  'When this operator accepted the Terms + Privacy Policy (consent by conduct at signup). Null for accounts created by admin before self-serve signup existed.';
comment on column operators.terms_version is
  'WHICH terms document was accepted. Terms change, so a timestamp alone records nothing. ''holding-*'' values were accepted against the interim holding page and need re-consent when the real terms ship.';

-- ── MARKETING: SEPARATE, UNTICKED, NOT NULL DEFAULT FALSE ───────────────────────────────────────────
-- 🔴 Under UK GDPR/PECR, marketing consent BUNDLED into terms acceptance is not consent, and a pre-ticked
-- box is not consent either. So this is a distinct column with a distinct opt-in on the form, unticked.
--
-- NOT NULL DEFAULT FALSE is the load-bearing part: a nullable column would make "never asked" and "said
-- no" indistinguishable, and the safe reading of an ambiguous marketing flag has to be NO. Defaulting
-- false also means every pre-existing operator is correctly opted OUT without a backfill.
--
-- Collecting this obliges us to honour it, so it is queryable state from day one rather than a note in an
-- inbox: any future send must filter on `marketing_opt_in = true`.
alter table operators add column if not exists marketing_opt_in boolean not null default false;

comment on column operators.marketing_opt_in is
  'Explicit, separately-given marketing consent (unticked by default at signup — bundling it with terms acceptance would not be valid consent under UK GDPR/PECR). NOT NULL so "never asked" and "declined" both read as false, which is the safe direction. Any marketing send MUST filter on this.';

create index if not exists operators_marketing_opt_in on operators(marketing_opt_in)
  where marketing_opt_in = true;
