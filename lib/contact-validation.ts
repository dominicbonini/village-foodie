// lib/contact-validation.ts
// SINGLE SOURCE for customer-contact email/phone format checks — shared by the customer order
// page and Manage > Settings > Contact Details so the two never diverge (DRY).

/** Plausible email (x@y.z) — permissive, not strict. Empty ⇒ false (callers gate "required" themselves). */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim())
}

/**
 * Plausible UK phone — permissive (matches the customer order screen). Strips spaces/dashes/brackets,
 * then accepts a 0 / +44 / 44 prefix followed by 9–11 digits. Empty ⇒ false.
 * NOTE: this is the customer-screen rule (permissive, 9–11 digits incl. +44 forms), NOT a strict
 * "exactly 11 digits" rule — kept identical on both surfaces on purpose. See the Settings flag.
 */
export function isValidUKPhone(phone: string): boolean {
  const digits = (phone || '').replace(/[^\d+]/g, '')
  return /^(\+?44|0)\d{9,11}$/.test(digits)
}
