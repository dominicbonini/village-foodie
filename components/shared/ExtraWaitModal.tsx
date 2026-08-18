'use client'

// ── THE EXTRA-WAIT PICKER — ONE MODAL, BOTH SURFACES ───────────────────────────────────────────────
// 🔴 IT EXISTS SO "Add extra wait" CAN BE A BUTTON. In EventActionsModal every other row is a filled
// button and this one was a bare <select> — the only control in that menu that opened a native picker
// wheel instead of a menu row, and it read as a form field dropped into a set of actions.
//
// 🔴 IT CHANGES NOTHING BUT THE PRESENTATION. The three options and their values are the ones both
// surfaces already offered — 10, 20, 30 — and this component does not write anything: it hands the
// chosen number back and the CALLER performs the exact fetch it always performed. Do not add a fourth
// option, a free-text minutes field, or a write, here.
//
// ⚠️ NO "clear" ARM. Clearing is a different control on both surfaces (the active-state button in the
// menu, and the KDS's amber banner), and both already existed. This picker is only the ADD direction.
export function ExtraWaitModal({ onPick, onClose }: {
  /** Called with 10, 20 or 30. The caller owns the write. */
  onPick: (mins: number) => void
  onClose: () => void
}) {
  return (
    // z-[70]: it opens FROM EventActionsModal (z-50) on both surfaces, so it has to sit over it — the
    // same relationship the finish-time confirm already has with the finish-time picker.
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-black text-slate-900">Add extra wait</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center">×</button>
        </div>
        {/* ⚠️ THE SENTENCE THE <select> COULD NOT CARRY. Its only text was the placeholder option, so
            nothing on either surface said what extra wait actually does. Same fact both callers'
            banners state — it moves the QUOTE on new orders, not the event's finish time. */}
        <p className="text-xs text-slate-500 mb-3">Adds to the collection time quoted on new orders. It does not change the event finish time.</p>
        <div className="space-y-2">
          {[10, 20, 30].map(m => (
            <button key={m} onClick={() => onPick(m)}
              className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">
              ⏱ +{m} min
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
