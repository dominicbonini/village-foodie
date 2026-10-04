'use client'
// ══════════════════════════════════════════════════════════════
// Shared manage-surface UI primitives.
// Extracted VERBATIM from app/manage/[token]/page.tsx so the manage page AND the extracted
// <ExtrasEditor> render byte-identical chrome from ONE definition (no drift). page.tsx imports
// these by name; its JSX usages are unchanged. Do not fork the styling here — these are the
// single source for Card / Btn / Input / Badge / EmptyState / allergen+dietary toggles.
// ══════════════════════════════════════════════════════════════
import { type ReactNode, type HTMLAttributes, type RefObject } from 'react'
import { GREEN_SOLID, CONTROL_BOX } from '@/lib/ui-tokens'

export function Spinner() { return <div className="w-5 h-5 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" /> }

export function Badge({ label, colour }: { label: string; colour: 'green' | 'slate' | 'orange' | 'red' }) {
  const c = { green: 'bg-green-100 text-green-700', slate: 'bg-slate-100 text-slate-500', orange: 'bg-orange-100 text-orange-700', red: 'bg-red-100 text-red-600' }[colour]
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c}`}>{label}</span>
}

/* ⚠️ `className` ADDED (4 October 2026), OPTIONAL AND EMPTY BY DEFAULT, so every existing call site
 * renders byte-identically. The Schedule › Events card needs its button full-width on a phone and
 * auto-width above it, which is a LAYOUT decision belonging to the caller — the alternative was a
 * second button component with the same palette, which is how two secondary styles come to exist. */
export function Btn({ label, colour = 'orange', size = 'md', loading = false, disabled = false, onClick, icon, className = '' }: { label: string; colour?: string; size?: 'sm' | 'md'; loading?: boolean; disabled?: boolean; onClick?: () => void; icon?: string; className?: string }) {
  const colours: Record<string, string> = {
    orange: 'bg-orange-600 hover:bg-orange-700 text-white',
    red:    'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200',
    slate:  'bg-slate-100 hover:bg-slate-200 text-slate-700',
    green:  GREEN_SOLID,   // shared — see lib/ui-tokens.ts. Was a second copy at green-600 (3.30:1).
    ghost:  'hover:bg-slate-100 text-slate-600 border border-slate-200',
  }
  const sizes = { sm: 'text-xs px-2.5 py-1.5', md: 'text-sm px-4 py-2' }
  return (
    <button onClick={onClick} disabled={disabled || loading}
      className={`${colours[colour] || colours.orange} ${sizes[size]} font-bold rounded-xl transition-colors active:scale-95 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      {loading ? <Spinner /> : icon ? <span>{icon}</span> : null}
      {label}
    </button>
  )
}

// ── 🔴 THREE OPT-IN PROPS THAT SUPPRESS THE PHONE KEYBOARD'S HELPFULNESS (V11.50) ──────────────────
// A field holding a web address, an email or anything else that is NOT prose must switch them off, or
// the operating system rewrites what the operator typed: `pizzeriagusto` was being autocapitalised and
// autocorrected into `Pizzeria Gusto` on iOS.
// ⚠️ ALL THREE DEFAULT TO undefined, SO EVERY EXISTING CALL SITE RENDERS BYTE-IDENTICALLY. React omits
// an attribute whose value is undefined; `spellCheck={false}` must be an explicit false, which is why
// it is `boolean | undefined` rather than defaulted.
/* ⚠️ `maxLength` ADDED (4 October 2026). Event types' name boxes cap at MAX_TYPE_NAME, and the
 * server TRUNCATES rather than rejecting — so without a cap on the input an operator can type 80
 * characters and watch 40 of them vanish on save. It is optional, so no existing caller changes. */
export function Input({ label, value, onChange, onBlur, type = 'text', inputMode, placeholder, required, hint, error, autoCapitalize, autoCorrect, spellCheck, maxLength, inputRef, autoFocus }: { label: string; value: string | number; onChange: (v: string) => void; onBlur?: () => void; type?: string; inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']; placeholder?: string; required?: boolean; hint?: string; error?: string; autoCapitalize?: string; autoCorrect?: string; spellCheck?: boolean; maxLength?: number; inputRef?: RefObject<HTMLInputElement | null>; autoFocus?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <input ref={inputRef} autoFocus={autoFocus} maxLength={maxLength} type={type} inputMode={inputMode} autoCapitalize={autoCapitalize} autoCorrect={autoCorrect} spellCheck={spellCheck} value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder}
        className={`w-full border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white ${error ? 'border-red-400 bg-red-50' : 'border-slate-200'}`} />
      {hint && <p className="text-slate-400 text-xs mt-0.5">{hint}</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

/**
 * ══ THE MANAGE SWITCH ══════════════════════════════════════════════════════════════════════════
 *
 * 🔴 MOVED HERE VERBATIM FROM app/manage/[token]/page.tsx (4 October 2026), FOR THE REASON THIS FILE
 * EXISTS. There were THREE switch definitions in the product: this one (Manage), one in
 * components/dashboard/OrderCard.tsx (the dashboard, a different look on purpose) and a third that
 * components/manage/EventTypes.tsx had written for itself — and the third had copied the DASHBOARD's
 * geometry and colour into a MANAGE screen. So the Event types modal's switches were orange where
 * every switch behind it was green, and 42px where every switch behind it was 44px.
 *
 * Dominic, 4 October 2026: "use the app's existing components and styles: the same switch component".
 * This is now that component, and both callers import it. `lib/ui-tokens.ts` makes the argument for
 * colours; it is the same argument for a control.
 *
 * ⚠️ THE PROPS AND THE RENDERED MARKUP ARE UNCHANGED, so page.tsx's fifteen usages did not have to be
 * touched. The only addition is `faded`, which Event types needs and nothing else passes.
 * ⛔ THE DASHBOARD'S SWITCH IS DELIBERATELY NOT MERGED INTO THIS ONE. It is a different surface with
 * its own palette; forcing one component on both would be a visual change to the dashboard that
 * nobody asked for.
 *
 * @param faded the control is showing a value it INHERITS rather than one of its own. Event types
 *              uses it for a type that follows Standard; it is the only signal of that state, so it
 *              must stay a visible difference and not a hover-only one.
 */
export function Toggle({ on, onToggle, label, disabled, faded = false, ariaLabel, title }: {
  on: boolean; onToggle: () => void; label?: string; disabled?: boolean
  faded?: boolean
  /** For a switch with no visible text beside it — a table cell, where there is no room for one. */
  ariaLabel?: string
  /** Hover text. In a grid cell this is where a nuance the cell has no room for has to live. */
  title?: string
}) {
  return (
    <button onClick={onToggle} disabled={disabled} type="button" role="switch" aria-checked={on}
      aria-label={ariaLabel} title={title}
      className={`flex items-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed ${faded ? 'opacity-50' : ''}`}>
      <div className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-green-500' : 'bg-slate-300'}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </div>
      {label && <span className="text-sm text-slate-600 font-medium group-hover:text-slate-900">{label}</span>}
    </button>
  )
}

/**
 * ══ THE MANAGE DROPDOWN ════════════════════════════════════════════════════════════════════════
 *
 * 🔴 WHY THIS IS NEW RATHER THAN LIFTED, WHICH IS A FINDING AND NOT A FREE CHOICE. Dominic asked for
 * "the same select/dropdown component and styling as Settings (not native browser selects with the
 * system arrows)". Settings has no such component: every `<select>` on the Manage page is a NATIVE
 * one with the platform's own arrow, repeating the same class string inline. The only non-native
 * select in the repository is in components/dashboard/AddOrderPanel.tsx, whose comment explains the
 * trick — `appearance-none` is what lets `rounded-xl` actually take effect, because a native select
 * paints its own chrome over it.
 *
 * So this is the two halves of that instruction reconciled: the BORDER, RADIUS, TEXT SIZE, COLOUR and
 * FOCUS RING are Settings' own (the class string eight of its selects already share, now named here
 * once), and `appearance-none` plus an inline chevron replaces the system arrow, following the
 * AddOrderPanel precedent rather than inventing a style.
 *
 * ⚠️ SETTINGS ITSELF STILL RENDERS NATIVE SELECTS. Converting all of them is a Manage-wide visual
 * change and was not asked for, so it is named in the report as a follow-up rather than done here. The
 * two therefore differ in their ARROW and in nothing else.
 * ⚠️ `h-9` IS THE ONE VALUE THAT IS NOT SETTINGS'. Settings sizes its selects with `py-1`, which in a
 * table row gives cells of different heights depending on their content. A fixed height is what keeps
 * a grid's rows aligned, and it matches the 36px the switch beside it occupies.
 */
/* ⚠️ RE-EXPORTED FROM lib/ui-tokens.ts, NOT DEFINED HERE. The dashboard uses the same box and must
 * not import from the manage primitives to get it — so the string lives in the tokens file both
 * surfaces already share, and this name is kept for the callers that had it. */
export { CONTROL_BOX as MANAGE_CONTROL_CLASS } from '@/lib/ui-tokens'

export function Select({ value, onChange, options, ariaLabel, disabled, faded = false, title, className = '' }: {
  value: string | number
  onChange: (v: string) => void
  options: readonly { value: string | number; label: string }[]
  ariaLabel: string
  disabled?: boolean
  /** Showing an inherited value — see <Toggle>'s `faded`. */
  faded?: boolean
  /** The full text, for an option the 200px column truncates. */
  title?: string
  className?: string
}) {
  return (
    /* ── 🔴 `text-sm` ON THE WRAPPER, AND THIS IS NOT BELT AND BRACES ────────────────────────────────
      * app/globals.css carries an iOS zoom guard:
      *     select, input[type=text], … { font-size: 16px !important }          (below 640px)
      *     @media (min-width: 640px) { … { font-size: inherit !important } }   (640px and up)
      * `!important` beats `.text-sm` on the <select> itself, so from `sm` up the control takes
      * `inherit` — which means ITS PARENT'S size. The parent is this span; with no size on it the
      * chain ran to <body> and every dropdown rendered at 16px while the labels beside them were 14px.
      * That is what Dominic saw: "the size of text eg every 15 min is much larger than elsewhere".
      *
      * 🔴 PUTTING THE SIZE HERE FIXES IT WITHOUT TOUCHING THE GUARD. Below 640px the select is still
      * forced to 16px and iOS still does not zoom on focus — which is the right behaviour on the one
      * device this is used on at the hatch, and must not be "fixed" to match the labels.
      * ⚠️ `text-sm` STAYS ON THE SELECT TOO (via CONTROL_BOX): it is what applies if that global rule
      * is ever narrowed, and it costs nothing. */
    <span className={`relative inline-flex min-w-0 items-stretch text-sm ${className}`}>
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        aria-label={ariaLabel} title={title}
        /* ── 🔴 THE BOX IS SETTINGS' BOX, AND THE CHEVRON IS ON THE RIGHT ──────────────────────────
          * `CONTROL_BOX` carries Settings' own `px-2 py-1 text-sm rounded-lg` — the same padding, text
          * size and radius. The only additions are layout:
          *   • `appearance-none` drops the platform arrow so `rounded-lg` actually takes effect (the
          *     trick AddOrderPanel's comment explains), and the chevron below replaces it ON THE RIGHT.
          *   • `pr-7` is the room that chevron sits in. NOTHING is added on the left, so the text
          *     starts at Settings' own `px-2` — Dominic: "normal left padding before the text. Nothing
          *     appears before the text."
          * ⚠️ NO FIXED HEIGHT. A fixed 36px box made this half again as tall as every other dropdown in
          * Manage, which reads as bigger text although the font was always the same 14px. */
        className={`w-full min-w-0 truncate appearance-none pr-7 disabled:opacity-50 disabled:cursor-not-allowed ${faded ? 'opacity-50' : ''} ${CONTROL_BOX}`}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {/* ⚠️ `aria-hidden` AND `pointer-events-none`: it is decoration over a real <select>, and a click
        * on it must reach the control underneath. */}
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400">
        <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>{children}</div>
}

export function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-4xl mb-3">{icon}</p>
      <p className="font-bold text-slate-700 mb-1">{title}</p>
      <p className="text-slate-400 text-sm">{body}</p>
    </div>
  )
}

// ── Allergen / dietary vocabulary + toggle chips ──────────────────────────────
// ONE source for the vocabulary + styling so the manage editor, the option editor, and the
// import wizard can't drift.
// The 14 UK statutory allergens, each named distinctly (FSA list): Nuts is split into
// 'Peanuts' + 'Tree nuts'; Shellfish is split into 'Crustaceans' + 'Molluscs'. 'Dairy' is the
// UK "Milk" allergen. 'Lactose' is NOT one of the 14 (non-regulated) but is kept as an extra
// per product decision. Order follows the FSA 14 + Lactose appended.
// EXACTLY the 14 UK regulated allergens — nothing more. (Milk = our "Dairy".) Lactose is NOT one of the
// 14, so it lives in DIETARY_VOCAB, not here.
export const ALLERGEN_VOCAB = ['Gluten', 'Crustaceans', 'Eggs', 'Fish', 'Peanuts', 'Soy', 'Dairy', 'Tree nuts', 'Celery', 'Mustard', 'Sesame', 'Sulphites', 'Lupin', 'Molluscs'] as const
export const DIETARY_VOCAB = ['Vegetarian', 'Vegan', 'Halal', 'Kosher', 'Gluten Free', 'Dairy Free', 'Lactose'] as const

// ── Allergen DISPLAY-MODE chooser (per-dish vs card) ──────────────────────────
// ONE source for the "how do you want to show allergens?" option cards — consumed by BOTH the standalone
// AllergenWizardModal (mode 0) AND the import wizard's Allergens step, so the icons/copy/layout can't drift.
// CONTROLLED: the operator SELECTS a mode (highlighted), then a separate "Next" advances — no auto-advance
// on click (so they can change their mind before proceeding). Both wizards render their own Next/Skip below.
export function AllergenModeChooser({ value, onChange }: { value: 'per_dish' | 'card' | null; onChange: (mode: 'per_dish' | 'card') => void }) {
  const card = (mode: 'per_dish' | 'card', selectedBorder: string) =>
    `text-left border-2 rounded-xl p-4 transition-colors ${value === mode ? `${selectedBorder} bg-orange-50/40 ring-2 ring-orange-300` : 'border-slate-200 hover:border-orange-300'}`
  return (
    <div className="grid gap-3">
      <button type="button" aria-pressed={value === 'per_dish'} onClick={() => onChange('per_dish')} className={card('per_dish', 'border-orange-400')}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🍽️</span>
          <span className="font-bold text-slate-900 text-sm">Show allergens against each dish</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Recommended</span>
        </div>
        <p className="text-xs text-slate-500">Review every dish and confirm its allergens. Customers see per-dish tags plus an allergen summary card derived from them.</p>
      </button>
      <button type="button" aria-pressed={value === 'card'} onClick={() => onChange('card')} className={card('card', 'border-orange-400')}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🛡️</span>
          <span className="font-bold text-slate-900 text-sm">Show an allergen card</span>
        </div>
        <p className="text-xs text-slate-500">Upload or paste a single allergen card (PDF, image, or text), shown as-is. Per-dish tags stay hidden.</p>
      </button>
    </div>
  )
}

// ── Generic OPTION-CARD chooser (radio semantics — one selected at a time) ─────
// The class strings below are LIFTED VERBATIM from AllergenModeChooser above, so any wizard step that
// asks "which of these routes?" renders the same card treatment. AllergenModeChooser itself is NOT yet
// routed through this — its rendering is deliberately untouched by the diff that added this — so the two
// are identical BY COPY today. Pointing it here (see the retrofit note in the changelog) is what makes
// them identical BY CONSTRUCTION; until then, any styling change must be made in BOTH places.
//
// EMOJI IS OPT-IN. `showEmoji` defaults to FALSE: a plain radio chooser is the default and the emoji
// variant is the exception. An option may carry an `emoji` that simply doesn't render until a caller
// asks for it — so the allergen retrofit is a one-prop change, and dropping allergens' emoji later is
// deleting that one prop.
//
// STRUCTURAL NOTE vs AllergenModeChooser: it puts the border on the <button> itself. Here the border
// moves one level up to a wrapping <div> so `body` (the accordion content) can sit INSIDE the same card
// and hold its own interactive elements — a button can never nest a button. Same border, padding, radius
// and hover target either way; the button still fills the card.
export interface OptionCard<K extends string> {
  key: K
  title: string
  desc: string
  emoji?: string        // rendered ONLY when the caller passes showEmoji
  badge?: string        // e.g. "Recommended"
  disabled?: boolean    // locked row (dimmed, not clickable)
  body?: ReactNode      // present → the card becomes an ACCORDION row, expanded while selected
}

export function OptionCardChooser<K extends string>({ options, value, onChange, showEmoji = false, chevron = false }: {
  options: OptionCard<K>[]
  value: K | null
  onChange: (key: K) => void
  showEmoji?: boolean
  chevron?: boolean
}) {
  return (
    <div className="grid gap-3">
      {options.map(opt => {
        const selected = value === opt.key
        return (
          <div key={opt.key}
            className={`border-2 rounded-xl transition-colors ${selected ? 'border-orange-400 bg-orange-50/40 ring-2 ring-orange-300' : 'border-slate-200 hover:border-orange-300'} ${opt.disabled ? 'opacity-40' : ''}`}>
            <button type="button" aria-pressed={selected} {...(opt.body ? { 'aria-expanded': selected } : {})}
              onClick={() => onChange(opt.key)} disabled={opt.disabled}
              className={`w-full text-left p-4 ${opt.disabled ? 'cursor-not-allowed' : ''}`}>
              <div className="flex items-center gap-2 mb-1">
                {showEmoji && opt.emoji && <span className="text-lg">{opt.emoji}</span>}
                <span className="font-bold text-slate-900 text-sm">{opt.title}</span>
                {opt.badge && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{opt.badge}</span>}
                {chevron && <span className={`ml-auto text-slate-400 text-xs shrink-0 transition-transform ${selected ? 'rotate-180' : ''}`}>▾</span>}
              </div>
              <p className="text-xs text-slate-500">{opt.desc}</p>
            </button>
            {selected && opt.body && <div className="px-4 pb-4">{opt.body}</div>}
          </div>
        )
      })}
    </div>
  )
}

export function AllergenToggles({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ALLERGEN_VOCAB.map(allergen => {
        const active = (value || []).includes(allergen)
        return (
          <button key={allergen} type="button"
            onClick={() => onChange(active ? (value || []).filter(a => a !== allergen) : [...(value || []), allergen])}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${active ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
            {allergen}
          </button>
        )
      })}
    </div>
  )
}

export function DietaryToggles({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {DIETARY_VOCAB.map(diet => {
        const active = (value || []).includes(diet)
        return (
          <button key={diet} type="button"
            onClick={() => onChange(active ? (value || []).filter(d => d !== diet) : [...(value || []), diet])}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${active ? 'bg-green-50 border-green-300 text-green-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
            {diet}
          </button>
        )
      })}
    </div>
  )
}
