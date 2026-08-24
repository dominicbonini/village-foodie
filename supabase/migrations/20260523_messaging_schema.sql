-- Add whatsapp_sender to trucks
-- This is the WhatsApp Business API sender number that customers message and
-- auto-replies come from.
-- Different from trucks.whatsapp which is where order notifications go.
--
-- COMMENT CORRECTED 20 August 2026 (comment text only -- no column, constraint or
-- data was altered by that edit). Two claims in this file were wrong:
--   1. "Twilio-registered". The provider has been the Meta Cloud API since V6.3;
--      the Twilio handler at /api/webhooks/whatsapp is dormant, not live.
--   2. "Format: +447700900000". The column is FREE TEXT with no constraint and no
--      normalisation on write, and the stored values do not follow that format.
-- See docs/whatsapp-readiness-report.md, Q1.
alter table trucks
  add column if not exists whatsapp_sender text,
  add column if not exists messenger_page_id text,
  add column if not exists messenger_page_token text;

comment on column trucks.whatsapp_sender is
  'WhatsApp Business API sender number for this truck, on the Meta Cloud API
   (the provider has been Meta since V6.3; this column was created for Twilio).
   Customers message this number. Auto-replies are sent from it.
   FREE TEXT. There is no constraint, no check and no normalisation on write, so
   there is no guaranteed format -- as of 20 August 2026 the one populated row is
   UK-national (07380736226), not E.164. The Meta webhook does not normalise this
   column: it normalises the INBOUND display_phone_number into three candidate
   shapes (+CCNNN, CCNNN and, for 44, 0NNN) and compares each against this value
   raw. That is what tolerates the drift, and it is why changing a stored value
   without checking that webhook can silently stop routing a truck.
   Distinct from trucks.whatsapp which receives order notifications.';

comment on column trucks.messenger_page_id is
  'Facebook Page ID for Messenger auto-replies. Set during OAuth flow.';

comment on column trucks.messenger_page_token is
  'Facebook Page Access Token for Messenger API. Set during OAuth flow.
   Treat as secret — do not expose to client.';

-- Add truck_id and inbound_message to messages
alter table messages
  add column if not exists truck_id text references trucks(id) on delete set null,
  add column if not exists inbound_message text;

comment on column messages.truck_id is
  'Which truck this message belongs to. Nullable for legacy rows.';

comment on column messages.inbound_message is
  'The original customer message that triggered this auto-reply.
   Null for outbound order notifications.';

-- Index for fast truck message lookup
create index if not exists idx_messages_truck_id
  on messages(truck_id)
  where truck_id is not null;
