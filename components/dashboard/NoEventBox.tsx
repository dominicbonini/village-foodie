'use client'
// components/dashboard/NoEventBox.tsx — the amber "no event" box on the dashboard's Orders tab and Add order
// (events-create-2, 17 November 2026). One component so both read the same: the message ("No event selected" /
// "Approve an event to take orders") and "Select event".
// events-create-4 (18 November 2026): "Create event now" is no longer here — it lives only inside the Select event list
// (components/shared/EventPickerPanel.tsx `createAction`), so this box is "Select event" only, as before events-create-2.
// ⚠️ IT WRAPS RATHER THAN SQUEEZES: on a 320px phone the button drops under the message instead of shrinking it.

export function NoEventBox({ message, selectLabel, onSelect }: {
  message: string
  selectLabel: string
  onSelect: () => void
}) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3" data-no-event-box>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-amber-500" aria-hidden>⚠️</span>
          <p className="text-sm font-medium text-amber-800">{message}</p>
        </div>
        <button onClick={onSelect}
          className="text-sm font-semibold text-amber-700 border border-amber-300 bg-white rounded-lg px-3 py-1.5 hover:bg-amber-50 whitespace-nowrap">
          {selectLabel}
        </button>
      </div>
    </div>
  )
}
