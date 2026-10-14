// lib/i18n/namespaces.ts — which message namespaces each surface's provider sends to the browser (Language Phase 0).
// ⚠️ ONLY WHAT EACH NEEDS: a layout sends these and nothing else, so a page never downloads another surface's copy.
// Phases 1a–1e add a namespace here when they move a surface's text into messages/.
import type { AppNamespace } from './translator'

export const NAMESPACES = {
  order: ['order'],
  confirmation: ['order'],
  dashboard: ['dashboard'],
  kds: [],
  manage: [],
  setup: [],
} as const satisfies Record<string, readonly AppNamespace[]>
