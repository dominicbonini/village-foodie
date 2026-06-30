-- ════════════════════════════════════════════════════════════════════════════════════
-- allergen_audit_log — append-only compliance RECORD of every allergen/dietary/card write.
-- Additive (new table only); apply by hand. The app only ever INSERTs here — never UPDATE/DELETE.
--
-- truck_id = trucks.id (TEXT — e.g. 'pizzeria-gusto', not a uuid). item_id = menu_items_db.id (uuid,
-- nullable: null for card-level / display-mode / modifier-option / import-summary rows). actor_user_id =
-- auth.users id when a real session is present (nullable for token-only). auth_method is the HONEST
-- identity-quality flag: 'authenticated' = a real logged-in user resolved; 'token' = token-only access
-- (which resolves to 'owner' in the role model — so the gate is only as strong as the token until real
-- auth; auth_method records that truthfully).
-- ════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS allergen_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id      text NOT NULL,
  item_id       uuid,
  change_type   text NOT NULL CHECK (change_type IN ('confirm','edit','card_save','import')),
  field         text NOT NULL CHECK (field IN ('allergens','dietary','allergens_verified','card')),
  old_value     text,
  new_value     text,
  actor_user_id uuid,
  actor_role    text,
  auth_method   text NOT NULL CHECK (auth_method IN ('token','authenticated')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS allergen_audit_log_truck_created_idx ON allergen_audit_log (truck_id, created_at DESC);
CREATE INDEX IF NOT EXISTS allergen_audit_log_item_idx          ON allergen_audit_log (item_id);
