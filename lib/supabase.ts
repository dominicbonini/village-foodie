import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'modified'
  | 'cancelled'
  | 'collected'
  | 'ready'

export type ModifyType = 'slot' | 'item_sub' | 'item_remove'

export interface OrderItem {
  name: string
  quantity: number
  unit_price: number
  upsells?: { name: string; price: number }[]
}

export interface Order {
  id: string
  truck_id: string
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  slot: string | null
  order_type: 'collection' | 'table'
  table_ref: string | null
  event_date: string
  items: OrderItem[]
  extras: { name: string; price: number }[] | null
  bundle: string | null
  discount_code: string | null
  subtotal: number
  discount_amt: number
  total: number
  notes: string | null
  status: OrderStatus
  modify_type: ModifyType | null
  modify_data: any | null
  payment_status: 'unpaid' | 'paid' | 'refunded' | 'failed'
  amount_paid: number | null
  created_at: string
  updated_at: string
}

export interface Truck {
  id: string
  name: string
  whatsapp: string
  sheet_id: string
  active: boolean
  mode: 'village' | 'pub'
  venue_name: string | null
  items_per_minute: number | null
  walkin_buffer_pct: number
  slot_duration_mins: number
  collection_interval_mins: number
}