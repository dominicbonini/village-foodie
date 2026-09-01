'use client'
// ══════════════════════════════════════════════════════════════
// Shared manage-surface UI primitives.
// Extracted VERBATIM from app/manage/[token]/page.tsx so the manage page AND the extracted
// <ExtrasEditor> render byte-identical chrome from ONE definition (no drift). page.tsx imports
// these by name; its JSX usages are unchanged. Do not fork the styling here — these are the
// single source for Card / Btn / Input / Badge / EmptyState / allergen+dietary toggles.
// ══════════════════════════════════════════════════════════════
import { type ReactNode, type HTMLAttributes } from 'react'
import { GREEN_SOLID } from '@/lib/ui-tokens'

export function Spinner() { return <div className="w-5 h-5 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" /> }

export function Badge({ label, colour }: { label: string; colour: 'green' | 'slate' | 'orange' | 'red' }) {
  const c = { green: 'bg-green-100 text-green-700', slate: 'bg-slate-100 text-slate-500', orange: 'bg-orange-100 text-orange-700', red: 'bg-red-100 text-red-600' }[colour]
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c}`}>{label}</span>
}

export function Btn({ label, colour = 'orange', size = 'md', loading = false, disabled = false, onClick, icon }: { label: string; colour?: string; size?: 'sm' | 'md'; loading?: boolean; disabled?: boolean; onClick?: () => void; icon?: string }) {
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
      className={`${colours[colour] || colours.orange} ${sizes[size]} font-bold rounded-xl transition-colors active:scale-95 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap`}>
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
export function Input({ label, value, onChange, onBlur, type = 'text', inputMode, placeholder, required, hint, error, autoCapitalize, autoCorrect, spellCheck }: { label: string; value: string | number; onChange: (v: string) => void; onBlur?: () => void; type?: string; inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']; placeholder?: string; required?: boolean; hint?: string; error?: string; autoCapitalize?: string; autoCorrect?: string; spellCheck?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <input type={type} inputMode={inputMode} autoCapitalize={autoCapitalize} autoCorrect={autoCorrect} spellCheck={spellCheck} value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder}
        className={`w-full border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white ${error ? 'border-red-400 bg-red-50' : 'border-slate-200'}`} />
      {hint && <p className="text-slate-400 text-xs mt-0.5">{hint}</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
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
