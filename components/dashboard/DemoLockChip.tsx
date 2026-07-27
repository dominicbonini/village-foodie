// components/dashboard/DemoLockChip.tsx
// THE "Not available in demo" chip — one treatment, reused wherever a demo control is shown-but-locked.
//
// Extracted from the dashboard page's local `demoLockChip` so the Settings locks, the event-actions lock,
// and AddOrderPanel's event controls all read identically instead of drifting into three near-copies (the
// exact failure the DEMO MODE banner already had). Colour is deliberately the DEMO MODE banner's amber
// (amber-100 ground / amber-900 text / amber-300 border): ONE visual language for demo CONSTRAINTS, and it
// keeps orange meaning exactly one thing on a conversion surface — the action to take, never "you can't".
//
// Sits beside a control's TITLE (not under it): the reader meets the constraint while still working out
// what the thing is. The caller decides WHEN to render it (demo only) — this is pure presentation.

export function DemoLockChip({ className = '' }: { className?: string }) {
  return (
    <span className={`align-middle text-[11px] font-bold text-amber-900 bg-amber-100 border border-amber-300 rounded-md px-1.5 py-0.5 whitespace-nowrap ${className}`}>
      Not available in demo
    </span>
  )
}
