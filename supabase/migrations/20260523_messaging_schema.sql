-- Add whatsapp_sender to trucks
-- This is the Twilio-registered WhatsApp Business API number
-- that customers message and auto-replies come from.
-- Different from trucks.whatsapp which is where order notifications go.
alter table trucks
  add column if not exists whatsapp_sender text,
  add column if not exists messenger_page_id text,
  add column if not exists messenger_page_token text;

comment on column trucks.whatsapp_sender is
  'Twilio-registered WhatsApp Business API number for this truck.
   Customers message this number. Auto-replies sent from this number.
   Format: +447700900000. Distinct from trucks.whatsapp which receives
   order notifications.';

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
