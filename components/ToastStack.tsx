import type { Toast } from '@/lib/useToasts'

// Presentational stacked-toast render (extracted verbatim from the dashboard). Driven by props from
// useToasts. Each toast with an action renders an undo button that dismisses its OWN toast first (so it
// can't be double-tapped) then runs the action. Newest toast renders at the bottom (nearest the thumb).
export function ToastStack({ toasts, dismissToast }: { toasts: Toast[]; dismissToast: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-6 left-4 right-4 max-w-sm mx-auto z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id} className={`rounded-xl px-4 py-3 text-sm font-bold shadow-xl flex items-center gap-3 ${t.action?'justify-between':'justify-center text-center'} ${t.type==='success'?'bg-green-600 text-white':'bg-red-600 text-white'}`}>
          <span className="min-w-0">{t.msg}</span>
          {t.action&&(
            <button onClick={()=>{dismissToast(t.id);t.action!.run()}}
              className="flex-shrink-0 bg-white/20 hover:bg-white/30 rounded-lg px-4 py-2 font-black transition-colors active:scale-95">
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
