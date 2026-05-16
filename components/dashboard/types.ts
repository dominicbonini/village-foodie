// components/dashboard/types.ts
// Shared types for the truck dashboard

export interface Order {
  id: string
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  slot: string | null
  status: string
  items: { name: string; quantity: number; unit_price: number }[]
  deals: { name: string; slots: Record<string, string> }[] | null
  total: number
  notes: string | null
  created_at: string
}

export interface Slot {
  collection_time: string
  production_slot: string
  current_orders: number
  max_orders: number
  available: boolean
}

export interface TruckData {
  id: string
  name: string
  mode: string
  venue_name: string | null
  logo: string | null
}

export interface MenuItem {
  name: string
  description?: string
  price: number
  category: string
  available?: boolean
  stock_remaining?: number | null
  image?: string | null
}

export interface TruckMenu {
  categories?: Array<{ name: string; prep_secs?: number; batch_size?: number }>
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
}

export interface AppliedDeal {
  bundle: Bundle
  slots: Record<string, string>
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
  orders_count: number
}

export interface CatConfig {
  secs: number
  batch: number
}

export const STATUS: Record<string, { label: string; bg: string; text: string }> = {
  pending:   { label: 'New',       bg: 'bg-orange-100', text: 'text-orange-700' },
  confirmed: { label: 'Confirmed', bg: 'bg-green-100',  text: 'text-green-700'  },
  rejected:  { label: 'Rejected',  bg: 'bg-red-100',    text: 'text-red-600'    },
  ready:     { label: 'Ready',     bg: 'bg-blue-100',   text: 'text-blue-700'   },
  collected: { label: 'Collected', bg: 'bg-slate-100',  text: 'text-slate-500'  },
  modified:  { label: 'Modified',  bg: 'bg-yellow-100', text: 'text-yellow-700' },
}

export const DEFAULT_CAT_CONFIG: Record<string, CatConfig> = {
  pizzas: { secs: 480, batch: 3 }, pizza: { secs: 480, batch: 3 },
  burgers: { secs: 360, batch: 2 }, burger: { secs: 360, batch: 2 }, mains: { secs: 360, batch: 2 },
  drinks: { secs: 0, batch: 99 }, drink: { secs: 0, batch: 99 },
  dips: { secs: 0, batch: 99 }, dip: { secs: 0, batch: 99 },
  sides: { secs: 60, batch: 5 }, side: { secs: 60, batch: 5 },
  desserts: { secs: 180, batch: 3 }, extras: { secs: 0, batch: 99 },
}