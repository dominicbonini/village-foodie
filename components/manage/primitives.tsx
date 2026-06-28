'use client'
// ══════════════════════════════════════════════════════════════
// Shared manage-surface UI primitives.
// Extracted VERBATIM from app/manage/[token]/page.tsx so the manage page AND the extracted
// <ExtrasEditor> render byte-identical chrome from ONE definition (no drift). page.tsx imports
// these by name; its JSX usages are unchanged. Do not fork the styling here — these are the
// single source for Card / Btn / Input / Badge / EmptyState / allergen+dietary toggles.
// ══════════════════════════════════════════════════════════════
import { type ReactNode, type HTMLAttributes } from 'react'

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
    green:  'bg-green-600 hover:bg-green-700 text-white',
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

export function Input({ label, value, onChange, onBlur, type = 'text', inputMode, placeholder, required, hint, error }: { label: string; value: string | number; onChange: (v: string) => void; onBlur?: () => void; type?: string; inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']; placeholder?: string; required?: boolean; hint?: string; error?: string }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <input type={type} inputMode={inputMode} value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder}
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
export const ALLERGEN_VOCAB = ['Dairy', 'Lactose', 'Gluten', 'Eggs', 'Nuts', 'Soy', 'Fish', 'Shellfish', 'Celery', 'Mustard'] as const
export const DIETARY_VOCAB = ['Vegetarian', 'Vegan', 'Halal', 'Kosher', 'Gluten Free', 'Dairy Free'] as const

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
