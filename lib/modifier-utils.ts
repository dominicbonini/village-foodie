/** Returns true if a modifier option is available to order.
 *  Treats undefined/null (unset) as available — defensive against old rows. */
export const isModifierAvailable = (opt: { available?: boolean }) => opt.available !== false
