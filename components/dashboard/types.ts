// components/dashboard/types.ts
// Shared types for the truck dashboard

import type { Plan } from '@/lib/features'

export interface OrderItem {
  name: string
  quantity: number
  unit_price: number
  modifiers?: { name: string; price: number }[]
  specialInstructions?: string
}

export const ORDER_STATUS = {
  PENDING:   'pending',
  CONFIRMED: 'confirmed',
  REJECTED:  'rejected',
  MODIFIED:  'modified',
  CANCELLED: 'cancelled',
  COOKING:   'cooking',
  READY:     'ready',
  COLLECTED: 'collected',
} as const

export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS]

export interface Order {
  id: string
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  slot: string | null
  event_date: string | null
  event_id: string | null
  van_id: string | null
  status: OrderStatus
  items: OrderItem[]
  deals: { name: string; price?: number; slots: Record<string, string>; slotModifiers?: Record<string, { name: string; price: number }[]>; slotNotes?: Record<string, string> }[] | null
  total: number
  notes: string | null
  paid_at: string | null
  collected_at: string | null
  created_at: string
}

export interface Slot {
  collection_time: string
  production_slot: string
  current_orders: number
  max_orders: number
  available: boolean
  is_past?: boolean
  /** Below the queue-aware ready floor but not actually past — operator-overridable. */
  too_soon?: boolean
  is_grace?: boolean
  /** Soft-cap remaining (soft_max − current_orders) from /api/slots. Optional because
   *  the /api/dashboard slot shape omits it — getSlotIndicator derives a fallback. */
  remaining?: number
  soft_max?: number
}

export type CrewMode = 'solo' | 'full'

export interface TruckData {
  id: string
  name: string
  mode: string
  venue_name: string | null
  logo: string | null
  dashboard_token: string
  slug?: string | null
  paused?: boolean
  auto_accept?: boolean
  kds_mode: boolean
  crew_mode: CrewMode
  display_mode: 'list' | 'grid'
  keep_screen_on: boolean
  plan: Plan
  trial_expires_at: string | null
  feature_overrides: Record<string, boolean> | null
  is_test?: boolean
  qr_code_style?: 'standard' | 'branded'
  truck_emoji?: string
}

export interface MenuItem {
  name: string
  description?: string
  price: number
  category: string
  available?: boolean
  stock_remaining?: number | null
  default_stock?: number | null
  image?: string | null
}

export interface ModifierOption {
  id: string
  name: string
  price_adjustment: number
  available?: boolean
}

export interface ModifierGroup {
  id: string
  name: string
  options: ModifierOption[]
}

export interface TruckMenu {
  categories?: Array<{ id?: string; name: string; prep_secs?: number; batch_size?: number; allowNotes?: boolean; default_stock?: number | null; modifierGroups?: ModifierGroup[] }>
  items: MenuItem[]
  bundles?: Bundle[]
  upsell_rules?: any[]
}

export interface Bundle {
  name: string
  description: string
  original_price: number | null
  bundle_price: number
  available: boolean
  start_time: string | null
  end_time: string | null
  slot_1_category: string | null
  slot_2_category: string | null
  slot_3_category: string | null
  slot_4_category: string | null
  slot_5_category: string | null
  slot_6_category: string | null
}

export interface BasketItem {
  name: string
  quantity: number
  unit_price: number
  modifiers?: { name: string; price: number }[]
  specialInstructions?: string
  cartKey?: string
}

export interface AppliedDeal {
  bundle: Bundle
  slots: Record<string, string>
  itemsTakenFromBasket: string[]
  modifierExtra?: number
  slotModifiers?: Record<string, { name: string; price: number }[]>
  slotNotes?: Record<string, string>
}

export interface ItemStock {
  name: string
  available: boolean
  stock_count: number | null
  orders_count: number
  category: string | null
}

export interface CategoryStock {
  category: string
  stock_count: number | null
  default_stock: number | null
  orders_count: number
}

export const STATUS: Record<OrderStatus, { label: string; bg: string; text: string }> = {
  pending:   { label: 'New',       bg: 'bg-orange-100', text: 'text-orange-700' },
  confirmed: { label: 'Confirmed', bg: 'bg-green-100',  text: 'text-green-700'  },
  rejected:  { label: 'Rejected',  bg: 'bg-red-100',    text: 'text-red-600'    },
  modified:  { label: 'Modified',  bg: 'bg-yellow-100', text: 'text-yellow-700' },
  cancelled: { label: 'Cancelled', bg: 'bg-red-100',    text: 'text-red-600'    },
  cooking:   { label: 'Cooking',   bg: 'bg-amber-100',  text: 'text-amber-700'  },
  ready:     { label: 'Ready',     bg: 'bg-blue-100',   text: 'text-blue-700'   },
  collected: { label: 'Collected', bg: 'bg-slate-100',  text: 'text-slate-500'  },
}

// Moved to lib/prep-utils.ts — single source of truth
export type { CatConfig } from '@/lib/prep-utils'
export { DEFAULT_CAT_CONFIG } from '@/lib/prep-utils'

export interface TruckEvent {
  id: string
  truck_id: string
  event_date: string
  venue_name: string
  venue_address: string | null
  address: string | null
  town: string | null
  postcode: string | null
  start_time: string
  end_time: string
  status: 'unconfirmed' | 'confirmed' | 'open' | 'closed' | 'cancelled'
  auto_open: boolean
  auto_close: boolean
  opened_at: string | null
  closed_at: string | null
  confirmed_at: string | null
  customer_note: string | null
  notes: string | null
  source: string | null
  van_id: string | null
  event_deals?: { id?: string; bundle_id: string; active: boolean; overridden: boolean }[]
}