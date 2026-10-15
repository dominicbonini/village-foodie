// lib/i18n/namespaces.ts — which message namespaces each surface's provider sends to the browser (Language Phase 0).
// ⚠️ ONLY WHAT EACH NEEDS: a layout sends these and nothing else, so a page never downloads another surface's copy.
// Phases 1a–1e add a namespace here when they move a surface's text into messages/.
import type { AppNamespace } from './translator'

// Language Phase 1a: the customer surfaces' namespaces. A SHARED control (the deals picker, the stock and spice
// badges, an order line) is named by every surface that renders it — and `useT` still falls back to the full
// catalogue for one that is not, so a missing entry here can never print keys (lib/i18n/client.tsx).
export const NAMESPACES = {
  // The order page: its own words, the refusals it shows, and every shared piece it renders.
  order: ['order', 'errorsCustomer', 'eventCard', 'orderLine', 'deals', 'menuBadges'],
  // The status / manage page.
  confirmation: ['orderStatus', 'errorsCustomer'],
  dashboard: ['dashboard', 'orderLine', 'deals', 'menuBadges'],
  kds: [],
  manage: ['eventCard', 'menuBadges'],
  setup: [],
} as const satisfies Record<string, readonly AppNamespace[]>
