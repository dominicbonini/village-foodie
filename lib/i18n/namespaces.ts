// lib/i18n/namespaces.ts — which message namespaces each surface's provider sends to the browser (Language Phase 0).
// ⚠️ ONLY WHAT EACH NEEDS: a layout sends these and nothing else, so a page never downloads another surface's copy.
// Phases 1a–1e add a namespace here when they move a surface's text into messages/.
import type { AppNamespace } from './translator'

// Language Phase 1a: the customer surfaces' namespaces. A SHARED control (the deals picker, the stock and spice
// badges, an order line) is named by every surface that renders it — and `useT` still falls back to the full
// catalogue for one that is not, so a missing entry here can never print keys (lib/i18n/client.tsx).
export const NAMESPACES = {
  // The order page: its own words, the refusals it shows, and every shared piece it renders.
  order: ['order', 'errorsCustomer', 'eventCard', 'orderLine', 'deals', 'menuBadges', 'demo',
    // Language Phase 1c: the demo sign-up flow it can open (DemoGetStarted) and the pieces that flow renders.
    'demoGetStarted', 'cuisinePicker', 'whereBased'],
  // The status / manage page.
  confirmation: ['orderStatus', 'errorsCustomer'],
  // Language Phase 1b: the kitchen surfaces and every shared piece they render (scripts/messages-split.cjs walks each
  // page's import graph and fails if an entry leaves out a namespace its components read).
  dashboard: ['dashboard', 'orderCard', 'addOrder', 'paymentActions', 'kitchenModals', 'buzzer', 'dashboardBanners', 'demo', 'userMenu',
    'orderLine', 'deals', 'menuBadges', 'printing', 'nativeShell',
    // Language Phase 1c: the demo sign-up flow with its pieces.
    'demoGetStarted', 'cuisinePicker', 'whereBased'],
  kds: ['kds', 'orderCard', 'paymentActions', 'kitchenModals', 'buzzer', 'dashboardBanners', 'demo', 'nativeShell',
    'demoGetStarted', 'cuisinePicker', 'whereBased'],   // Language Phase 1c
  manage: ['eventCard', 'menuBadges', 'orderCard', 'paymentActions', 'kitchenModals', 'userMenu', 'nativeShell',
    // Language Phase 1c: the cuisine and price controls, the walkthrough, and the where-based step.
    'cuisinePicker', 'priceControls', 'walkthrough', 'whereBased'],
  // Language Phase 1c: the setup wizard.
  setup: ['setup', 'whereBased'],
} as const satisfies Record<string, readonly AppNamespace[]>
