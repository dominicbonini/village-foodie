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
    'demoGetStarted', 'cuisinePicker', 'whereBased', 'tradeArea'],
  // The status / manage page.
  confirmation: ['orderStatus', 'errorsCustomer'],
  // Language Phase 1b: the kitchen surfaces and every shared piece they render (scripts/messages-split.cjs walks each
  // page's import graph and fails if an entry leaves out a namespace its components read).
  dashboard: ['dashboard', 'orderCard', 'addOrder', 'paymentActions', 'kitchenModals', 'buzzer', 'dashboardBanners', 'demo', 'userMenu',
    'orderLine', 'deals', 'menuBadges', 'printing', 'nativeShell',
    // Language Phase 1c: the demo sign-up flow with its pieces.
    'demoGetStarted', 'cuisinePicker', 'whereBased', 'tradeArea',
    // Language Phase 1d (Schedule B): the private link & QR panel (components/manage/PrivateLinkPanel.tsx).
    'privateEvents',
    // Language Phase 1d Part 2: the shared copy button (components/dashboard/CopyButton.tsx, via DemoWelcome).
    'copyButton',
    // Language Phase 1d (Settings): the kitchen-capacity explainer and <BatchSizeSelect>, one namespace for both surfaces.
    'kitchenCapacity',
    // …and the two copy modules whose en-GB exports the dashboard still renders (lib/copy/offlineProtection, serviceSettings).
    'offlineProtection', 'serviceSettings',
    // Language Phase 1d Part 2 (Payments): the settings card's completion rows, shared with Manage › Payments.
    'completionSettings'],
  kds: ['kds', 'orderCard', 'paymentActions', 'kitchenModals', 'buzzer', 'dashboardBanners', 'demo', 'nativeShell',
    'demoGetStarted', 'cuisinePicker', 'whereBased', 'tradeArea',   // Language Phase 1c
    // Language Phase 1d (Settings): copy modules the KDS imports, whose en-GB exports read these namespaces.
    'offlineProtection', 'serviceSettings'],
  manage: ['eventCard', 'menuBadges', 'orderCard', 'paymentActions', 'kitchenModals', 'userMenu', 'nativeShell',
    // Language Phase 1c: the cuisine and price controls, the walkthrough, and the where-based step.
    'cuisinePicker', 'priceControls', 'walkthrough', 'whereBased', 'tradeArea',
    // Language Phase 1d (Menu A): the allergen wizard and card, Upsells, Custom extras, Deals.
    'manageAllergens', 'manageUpsells', 'manageExtras', 'manageDeals',
    // Language Phase 1d (Menu B): the menu editor and its import wizard.
    'manageMenu', 'manageMenuImport',
    // Language Phase 1d (Schedule A): the events list, Add/Edit event, the importer, the verify messages, the places.
    'manageSchedule', 'manageScheduleEvent', 'manageScheduleImport', 'manageScheduleVerify', 'schedulePlaces',
    // Language Phase 1d (Schedule B): the Event types grid and picker, the private-event words and link panel, the van filter.
    'eventTypes', 'privateEvents', 'vanFilter',
    // Language Phase 1d (Settings): the Settings tab, the copy modules it reads, Kitchen capacity, Where you trade.
    'manageSettings', 'serviceSettings', 'offlineProtection', 'kitchenCapacity', 'settingsCopy', 'whereYouTrade',
    'stockCopy', 'managePrimitives',
    // Language Phase 1d Part 2 (Reports): the Reports tab and its CSV headers.
    'manageReports',
    // Language Phase 1d Part 2 (Social posts A): the Social media tab and lib/copy/socialPosts.ts, the single event
    // post screens (EventPost), and the share bar under a made post.
    'socialPosts', 'eventPost', 'postShare',
    // Language Phase 1d Part 2 (Social posts B): the design editor and its controls, the font picker, the weekly post.
    'designEditor', 'fontPicker', 'weeklyPost',
    // Language Phase 1d Part 2 (Payments): the tab, Tax/tips/fees (+ its refusal codes and the customer's charge-line
    // label it quotes), Taking payment — whose completion and button words are `completionSettings`, shared with the
    // dashboard's Settings sheet.
    'managePayments', 'manageCharges', 'takingPayment', 'errorsManage', 'charges', 'completionSettings',
    // Language Phase 1d Part 2 (WhatsApp, custom domain, account): Settings' Auto-replies, the custom-domain setup,
    // account deletion, and the shared copy button.
    'manageWhatsApp', 'customDomain', 'deleteAccount', 'copyButton',
    // Language Phase 1d Part 2 (shell): the page's own words (tab bar, header, banners, toasts, trial popup), Billing, Team.
    'manageShell', 'manageBilling', 'manageTeam'],
  // Language Phase 1c: the setup wizard.
  setup: ['setup', 'whereBased', 'tradeArea'],
} as const satisfies Record<string, readonly AppNamespace[]>
