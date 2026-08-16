-- 20260816_trucks_phone_number_id.sql
-- The Meta WhatsApp Business phone-number ID for this truck: the opaque identifier Meta actually
-- addresses, delivered on every inbound webhook as `entry[].changes[].value.metadata.phone_number_id`
-- and used as the path segment when sending (`graph.facebook.com/v19.0/<phone_number_id>/messages`).
--
-- CLASSIFICATION: **DEPLOY-COUPLED. RUN THIS SQL *BEFORE* DEPLOYING THE WEBHOOK CHANGE.**
--
-- Why deploy-coupled, checked rather than assumed:
--   1. app/api/webhooks/meta/whatsapp/route.ts uses a NAMED select on `trucks`, not `select('*')`. A
--      named select for a column that does not exist raises PostgREST 42703 and the whole lookup fails
--      — so deploying the code first would break the webhook for every truck until this runs. Compare
--      20260814_trucks_add_order_layout.sql, which IS safe in either order precisely because its
--      readers use `select('*')` and never name the column.
--   2. Running this BEFORE the deploy is completely inert: nothing reads the column yet, nothing
--      enumerates the trucks column list to validate it, and every existing row simply gets NULL.
--   3. There is no window in which a running deployment sees a half-applied state: the column either
--      exists (old code ignores it) or it does not (old code never asks for it).
--
-- 🔴 NULLABLE, AND DELIBERATELY SO — the opposite of the add_order_layout decision, for a reason worth
-- stating. `add_order_layout` is NOT NULL DEFAULT 'tabs' because every truck has a meaningful default:
-- the behaviour it already had. THIS COLUMN HAS NO MEANINGFUL DEFAULT. A truck that has not been
-- onboarded to the WhatsApp Business API does not have a phone-number ID, and inventing one — an empty
-- string, a placeholder — would make "not set up" indistinguishable from "set up with a bad value".
-- NULL means exactly what it should here: this truck has no Meta WhatsApp number.
--
-- ⚠️ NO DEFAULT, for the same reason. A default would be a value nobody chose.
--
-- ⚠️ NO CHECK CONSTRAINT. The format is Meta's, it is opaque to us (a numeric string today, but that is
-- Meta's business and not a contract they publish), and encoding a guess about it here would put a
-- second definition of the value in a place the application cannot see. Matching this codebase's
-- existing convention for provider-owned identifiers.
--
-- 🔴 UNIQUE, AND THIS IS THE POINT OF THE MIGRATION RATHER THAN A DETAIL OF IT. The defect being fixed
-- is that one truck's messages could be routed to a different truck. A partial unique index makes
-- "two trucks claim the same Meta number" unrepresentable in the database rather than merely unlikely
-- in the application. WHERE phone_number_id IS NOT NULL keeps it partial, so the many trucks with NULL
-- do not collide with each other — a plain UNIQUE would treat NULLs as distinct in Postgres anyway, but
-- the partial index says the intent out loud and is cheaper.
--
-- ⚠️ THIS COLUMN HAS NO UI. Nothing in Manage or the dashboard writes it today, and `update_truck`'s
-- allow-list does not contain it, so it can only be set by hand in Supabase. That is deliberate for
-- this pass — self-serve WhatsApp onboarding does not exist — and it is recorded in
-- docs/whatsapp-routing-report.md Part D rather than solved here.

ALTER TABLE trucks
ADD COLUMN IF NOT EXISTS phone_number_id text;

COMMENT ON COLUMN trucks.phone_number_id IS
  'Meta WhatsApp Business phone-number ID. Arrives on every inbound webhook as '
  'value.metadata.phone_number_id and is the send path segment. NULL = this truck is not set up on '
  'the WhatsApp Business API. Set by hand: there is no UI. See docs/whatsapp-routing-report.md.';

CREATE UNIQUE INDEX IF NOT EXISTS trucks_phone_number_id_key
  ON trucks (phone_number_id)
  WHERE phone_number_id IS NOT NULL;
