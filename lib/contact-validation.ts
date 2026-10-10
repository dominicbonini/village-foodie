// lib/contact-validation.ts
// SINGLE SOURCE for customer-contact email/phone format checks — shared by the customer order
// page and Manage > Settings > Contact Details so the two never diverge (DRY).

/** Plausible email (x@y.z) — permissive, not strict. Empty ⇒ false (callers gate "required" themselves). */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim())
}

// ⛔ isValidUKPhone IS GONE (Phase 2C, 10 October 2026). Phone numbers are checked by lib/phone.ts
// `isPlausiblePhone(number, truck's country)` — one rule for every country — on every surface that used it.
