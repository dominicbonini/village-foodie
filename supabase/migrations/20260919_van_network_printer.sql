-- 20260919_van_network_printer.sql
-- A WIRED (network) kitchen printer belongs to the VAN, and exactly one device may print to it.
--
-- ── WHY THE VAN ─────────────────────────────────────────────────────────────────────────────────────
-- A Bluetooth printer is physically paired to ONE iPad, so its pairing lives in that device's own
-- Preferences (hg_printer_id …) and no shared record is needed. A network printer is reachable by EVERY
-- device on the kitchen router — so its address is a property of the van's kitchen, and without a shared
-- "who prints" record two devices with printing on would each print every ticket (the dedupe record is
-- device-local: hg_printed_keys_<token>). These two columns are that shared record.
--
--   network_printer_address   the printer's address on the router, "host" or "host:port" (port 9100 if
--                             omitted). NULL ⇒ no wired printer set up for this van.
--   network_print_device_id   the van_devices.device_id currently allowed to print to it. NULL ⇒ nobody
--                             holds it; the first device with wired printing on claims it automatically.
--
-- 🔴 NEITHER COLUMN CHANGES BLUETOOTH PRINTING. Nothing about 'ble' reads them.
-- 🔴 A DEVICE THAT HAS NEVER CHOSEN A PRINTER TYPE NEVER READS THEM. hg_printer_kind absent ⇒ Bluetooth ⇒
-- today's transport and today's behaviour, byte for byte.
--
-- ── THE NAMED-SELECT RULE ───────────────────────────────────────────────────────────────────────────
-- Neither column may be added to get_vans' select, /api/dashboard's van select, or any other select a
-- surface depends on. They are read ONLY by app/api/printing (a separate capability-probed select, with
-- PGRST204 and 42703 logged distinguishably). On any failure the WIRED SETTING degrades; nothing else does.

set lock_timeout = '3s';

begin;

alter table public.truck_vans
  add column if not exists network_printer_address text;

alter table public.truck_vans
  add column if not exists network_print_device_id text;

comment on column public.truck_vans.network_printer_address is
  'Wired kitchen printer for this van: "host" or "host:port" on the kitchen router (port 9100 when omitted). NULL = none. Read only by app/api/printing.';
comment on column public.truck_vans.network_print_device_id is
  'van_devices.device_id of the ONE device currently allowed to print to network_printer_address. NULL = unclaimed. Read only by app/api/printing.';

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA AND BOTH COLUMNS READ AS ABSENT (PGRST204).
-- app/api/printing then reports the wired setting unavailable; Bluetooth and everything else are unaffected.
notify pgrst, 'reload schema';
