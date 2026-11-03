// lib/slot-indicator.ts
// The slot traffic-light's tone, as a TYPE. The operator dots and ASAP placement read the tone the category-aware engine resolves
// (lib/slot-availability.ts buildSlotAvailability), shown through lib/slot-display.ts buildSlotIndicators.
// tidy-1 (3 November 2026): getSlotIndicator, the legacy batch-scalar fallback that lived here, had no caller (manual §27 "Remove dead
// slot code (V6.4)"); it is removed. This type is all that remains, imported by lib/slot-availability.ts and lib/slot-display.ts.

export type SlotTone = 'green' | 'amber' | 'red'
