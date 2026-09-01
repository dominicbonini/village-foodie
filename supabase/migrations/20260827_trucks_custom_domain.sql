-- Custom domain Stage 4: host → truck resolution for an operator's own subdomain.
--
-- 🔴 NOT RUN. Deploys are frozen and this file is written, not applied. Pizzeria Gusto is a live
-- trading truck on this database; nothing here is executed by anyone but Dominic, by hand.
--
-- CLASSIFICATION: ADDITIVE. Both nullable, no default. Applying it alone changes nothing — every
-- existing row gets NULL, which reads as "no custom domain", the correct state for every truck today.
--
-- ── 🔴 THESE ARE NOT `embed_enabled`, AND THE SEPARATION IS THE POINT ───────────────────────────
-- `trucks.embed_enabled` means "the iframe embed is on". A custom domain is a DIFFERENT product: a
-- truck may reasonably want their own address and no iframe, or an iframe and no address of their
-- own. Reusing one flag for both is how a truck ends up with the one it did not ask for, and the
-- damage is asymmetric — an unwanted iframe is invisible, an unwanted public domain is not.
--
-- ── UNIQUE, BECAUSE THE COLUMN IS A ROUTING KEY AND NOT A PROFILE FIELD ─────────────────────────
-- A hostname resolves to exactly one truck or the request is refused. Two rows carrying the same
-- host would make "which truck does this domain serve" a question with two answers, decided by
-- whichever row the planner returned first. The constraint makes that unrepresentable rather than
-- unlikely. NULLs do not collide under a UNIQUE constraint in Postgres, so every truck without a
-- domain is unaffected.
--
-- ── WHY `custom_domain_verified_at` IS A TIMESTAMP AND NOT A BOOLEAN ────────────────────────────
-- 🔴 IT IS THE SERVING GATE, NOT A RECORD: the route refuses any host whose row has NULL here. A
-- boolean would answer "is it verified"; a timestamp also answers "since when", which is what a
-- support conversation about a domain that stopped working actually needs. The same reasoning as
-- `embed_last_seen_at` — the cheap extra fact is the one you want at 7pm on a Friday.
-- ⚠️ NOTHING IN THIS STAGE WRITES EITHER COLUMN. Provisioning is a later stage, deliberately: routing
-- has to be right before any domain points here. Until then both stay NULL and the serving path is
-- unreachable in production, which is the intended state.
ALTER TABLE trucks
  ADD COLUMN IF NOT EXISTS custom_domain             text,
  ADD COLUMN IF NOT EXISTS custom_domain_verified_at timestamptz;

-- Named explicitly rather than relying on the inline shorthand, so a later migration can drop it by
-- name without looking it up.
ALTER TABLE trucks
  ADD CONSTRAINT trucks_custom_domain_key UNIQUE (custom_domain);

COMMENT ON COLUMN trucks.custom_domain IS
  'The operator''s own subdomain (e.g. schedule.theirtruck.co.uk), lower-cased, no scheme, no port. Routing key: a request on an unknown host resolves to the truck matching this exactly, or is refused. UNIQUE. NOT the same thing as embed_enabled.';
COMMENT ON COLUMN trucks.custom_domain_verified_at IS
  'When the custom domain was confirmed to be serving. NULL = not verified, and the serving path refuses the host. Written by the later provisioning stage; nothing writes it today.';
