'use client'
// components/manage/TakingPaymentPanel.tsx — Manage › Payments › "Taking payment" (Phase 3 screens, named
// difference 1 of docs/phase-3-screens-report.md). MOVED FROM Manage › Settings › Order settings, unchanged in
// content and behaviour; it lives in its own file so Payments can place it and the harness can render it.
import { useEffect, useState } from 'react'
import { Toggle } from './primitives'
import { SUBCARD_HEADING } from '@/lib/ui-tokens'
import { SERVICE_SETTING_LABELS } from '@/lib/copy/serviceSettings'

/** The truck columns this section reads (the page's `Truck` row carries them all). */
export interface TakingPaymentTruck {
  show_paid_step?: boolean
  completion_presses?: 'one' | 'two' | null
  takes_cash?: boolean
}

/**
 * 🔴 MANAGE › PAYMENTS › "TAKING PAYMENT" — MOVED FROM SETTINGS, UNCHANGED (Phase 3 screens, 13 October 2026).
 * Named difference 1 of docs/phase-3-screens-report.md. The JSX below is the Settings block VERBATIM except
 * its outer wrapper (`pt-3 border-t`, which separated it from the Settings row above it). Its three
 * controls, words and saves are unchanged:
 *   • `form` is a copy of the truck, exactly as SettingsTab seeds its own;
 *   • `saveSetting` is SettingsTab's: `update_truck` with `{ data: { [key]: value } }`, then the same
 *     `onTruckUpdate` merge into the page's truck;
 *   • `completionPresses` is the same derivation, and `vanCashAvailable` comes from the same `get_vans`.
 * ⚠️ All three keys stay on update_truck's `allowed` list — see the notes inside the block.
 */
export function TakingPaymentPanel({ truck, api, showToast, onTruckUpdate }: {
  truck: TakingPaymentTruck
  api: (action: string, extra?: Record<string, unknown>) => Promise<{ vanCashAvailable?: boolean } | null | undefined>
  showToast: (msg: string, type?: 'success' | 'error') => void
  onTruckUpdate: (partial: Partial<TakingPaymentTruck>) => void
}) {
  const [form, setForm] = useState({ ...truck })
  const saveSetting = async (key: string, value: string | boolean | number | null) => {
    try {
      await api('update_truck', { data: { [key]: value } })
      onTruckUpdate({ [key]: value } as Partial<TakingPaymentTruck>)
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error')
    }
  }
  const completionPresses: 'one' | 'two' =
    form.completion_presses ?? (form.show_paid_step === true ? 'two' : 'one')
  const [vanCashAvailable, setVanCashAvailable] = useState(true)
  useEffect(() => {
    api('get_vans').then(r => setVanCashAvailable(r?.vanCashAvailable !== false)).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4" data-taking-payment>
        {/* ── TAKING PAYMENT (V9.5) — one neutral sub-panel, same treatment as Sounds and the
            auto-accept group, so the two payment settings read as a grouped section rather than loose
            rows at the bottom of the card.
            ⚠️ SIBLINGS INSIDE A GROUP, NOT NESTED. They answer different questions — "WHEN do we take
            money" (show_paid_step, which the dashboard can override per event) and "HOW does it arrive"
            (takes_cash, truck-level, no override). The cash split was briefly rendered as a CHILD of the
            paid step; that implied a dependency which does not exist. Do not reintroduce the nesting.
            Both resolved only by lib/payments/paid-step.ts.
            ⚠️ Both keys must stay on update_truck's `allowed` list (app/api/manage/route.ts:854) — that
            list SILENTLY DROPS anything not on it, so a missing key means the toggle appears to save,
            returns {ok:true}, and writes nothing. This regrouping changes no key and no save path. */}
        <div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 divide-y divide-slate-200/70">
            <div className="pb-3">
              <p className={SUBCARD_HEADING}>Taking payment</p>
              <p className="text-xs text-slate-500 mt-0.5">How your team records money for each order.</p>
            </div>
            {/* ── SETTING 1 — trucks.show_paid_step, RELABELLED (10 August 2026) ─────────────────────
                Same column, same save path, same per-event override. Only the words changed, because
                the old ones ("Separate paid step — splits Paid & collected into Mark paid then
                Collected") described the COMPLETION behaviour, which is now its own setting below.
                What this column actually controls is the Add Order panel: on, it offers a Confirm
                button so an order can be placed unpaid; off, the panel only takes payment.
                ⚠️ THE NOTE IS DELIBERATELY NOT ELABORATED. "It doesn't affect online orders" is true
                whatever state online orders arrive in — and Stripe is being integrated, after which they
                will arrive PAID. A sentence describing what state they arrive in today would go stale at
                exactly the moment nobody remembers to come back and change it. Leave it as it is. */}
            <div className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Take orders without payment</p>
                <p className="text-xs text-slate-500 mt-0.5">Adds a Confirm button when you add an order yourself, so you can place it now and take payment later. Turn this on if you take phone or advance orders.</p>
                <p className="text-xs text-slate-400 mt-1">This only affects orders you add. It doesn&apos;t affect online orders.</p>
              </div>
              <Toggle
                on={(form as any).show_paid_step === true}
                onToggle={() => { const next = (form as any).show_paid_step !== true; setForm(p => ({...p, show_paid_step: next} as any)); saveSetting('show_paid_step', next) }}
              />
            </div>
            {/* ── SETTING 2 — trucks.completion_presses (NEW, 10 August 2026) ────────────────────────
                🔴 A SIBLING, NOT A CHILD, AND IT MUST NEVER BE DISABLED BY THE SETTING ABOVE.
                It looks like a dependency and is not. "Take orders without payment" decides whether the
                Add Order panel can place an order unpaid; this decides how an unpaid order is COMPLETED.
                Unpaid orders arrive from the CUSTOMER PATH regardless — every truck has them — so
                greying this out when the setting above is off would hide the control for a case that
                still happens every day. The cash row below IS a genuine dependency and is treated as
                one; this is not, and the two must not be made to look alike.
                ⚠️ It reads slightly oddly in this group, and that is worth knowing rather than papering
                over: the group now holds two independent top-level settings plus one nested dependent,
                so the indentation below no longer means "depends on the row directly above" but
                "depends on this group". Reported rather than resolved.
                RADIO, not a toggle: two named alternatives that each need their own explanation, which
                is the deals "Apply to events" pattern in this same file — the page's existing shape for
                exactly this. A toggle would need a single label that reads true in one direction only.
                ⚠️ `completion_presses` must stay on update_truck's `allowed` list
                (app/api/manage/route.ts) — that list SILENTLY DROPS unlisted keys, so a missing entry
                means this appears to save, returns {ok:true}, and writes nothing. */}
            <div className="py-3">
              <p className="text-sm font-semibold text-slate-800">Completing an unpaid order</p>
              <p className="text-xs text-slate-500 mt-0.5">What happens when an unpaid order is ready to hand over.</p>
              <div className="flex flex-col gap-2 mt-2">
                {([
                  // ── 🔴 THE BUTTON NAMES HERE ARE QUOTED FROM THE CODE, NOT DESCRIBED ────────────
                  // “Mark paid & collected”, “Mark paid” and “Collected” are the EXACT `label` strings
                  // OrderCard renders (components/dashboard/OrderCard.tsx — the one-press branch, the
                  // two-press unpaid branch and the effectivePaid branch). Copy that names a button an
                  // operator cannot find sends them looking for it, so **verify these against the code
                  // before editing either side**, and change the copy to match the button — never the
                  // button to match the copy.
                  // ⚠️ TWO RENDERED VARIANTS THIS COPY DELIBERATELY DOES NOT NAME, because they are
                  // conditional and naming them here would make the common case unreadable: a PART-PAID
                  // order reads “Mark £X.XX paid” instead of “Mark paid”, and with "Do you take cash?"
                  // on, the two-press money button splits into “💷 Cash” / “💳 Card”. The cash row below
                  // is where that second one is explained.
                  // ⚠️ CURLY QUOTES, matching how this file already names a button inline (the paid-step
                  // and cash rows both do it). Not a new convention.
                  ['one', 'One press (“Mark paid & collected”)',
                   'Best when you take the money as you hand the food over. You get a single button, “Mark paid & collected”, which records the payment and clears the order together.'],
                  ['two', 'Two presses (“Mark paid” & “Collected”)',
                   'Best when payment and handover happen at different moments — someone pays at the hatch, then collects when it’s ready. You get two buttons: “Mark paid” first, then “Collected” when they take the food.'],
                ] as const).map(([v, lbl, help]) => (
                  /* 🔴 SHAPE COPIED VERBATIM FROM "Past the deadline" IN THIS SAME FILE — the page's
                     EXISTING two-option-with-descriptions control (button + drawn radio + font-medium
                     label over a text-xs help line). It replaced a native <input type="radio">, which
                     was mine and was wrong: it rendered in the browser's own accent rather than this
                     page's, so it read as a foreign control in a card of matched ones.
                     ⚠️ ORANGE HERE IS NOT AN INTRODUCTION, IT IS THIS PAGE'S SELECTED STATE. On Manage,
                     orange is the selection/focus colour throughout — focus:ring-orange-400 on every
                     input, accent-orange-600 on checkboxes, and border-orange-500 / bg-orange-500 on
                     exactly this radio. The reserved-meaning rule for orange ("a MONEY action") belongs
                     to the ORDER CARD's vocabulary, a different surface with a different palette. */
                  <button type="button" key={v}
                    onClick={() => { setForm(p => ({...p, completion_presses: v})); saveSetting('completion_presses', v) }}
                    className="w-full text-left flex items-start gap-2 cursor-pointer">
                    {/* Absent ⇒ resolve from show_paid_step, the SAME fallback lib/payments/paid-step.ts
                        uses, so this shows what the cards are actually doing before the column has been
                        backfilled. Never `?? 'one'` — that would render two-press trucks as one-press
                        for the length of the deploy window. */}
                    <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${completionPresses === v ? 'border-orange-500' : 'border-slate-300'}`}>{completionPresses === v && <span className="w-2 h-2 rounded-full bg-orange-500" />}</span>
                    <span className="text-sm">
                      <span className="font-medium text-slate-700">{lbl}</span>
                      <span className="block text-xs text-slate-400">{help}</span>
                      {/* ⚠️ THE SEPARATE BUTTON-NAMES LINE WAS REMOVED, NOT LOST. It rendered
                          “Mark paid & collected” / “Mark paid” then “Collected” beneath the
                          description — and the description now names those buttons in its own
                          sentence, so the line repeated it verbatim on the row directly below.
                          One fact, one place. The names still have to match the code; see the note
                          on the options array above. */}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {/* ── 🔴 DE-NESTED AGAIN ON 10 AUGUST 2026, AND NOT BY REVERSING THE RULE BELOW ──────────
                READ THIS BEFORE RE-INDENTING IT. The V9.6 note that follows is KEPT because its rule is
                still right; what changed is that the rule now points the other way.
                THE RULE: "structure should show the DEPENDENCY, not the semantics." Correct, and it is
                what put `pl-4` here when the cash split had exactly ONE parent (the paid step).
                WHAT CHANGED: the cash split now has TWO parents. It renders in two places, and after the
                settings were split those places answer to different settings — the Add Order panel's
                "Take payment" button splits on show_paid_step, and the ORDER CARD's "Mark paid" button
                splits on completion_presses === 'two'. Indentation is a SINGLE-PARENT notation: it can
                only point at the row directly above it, which is now "Completing an unpaid order" —
                only one of the two ways to unlock this. So the indent had stopped showing the
                dependency and started asserting a WRONG one. Applying the rule removes the indent.
                WHAT CARRIES THE DEPENDENCY INSTEAD: the disabled state plus the inline note, which now
                NAMES BOTH PARENTS. That is the other half of the V9.6 instruction — "structure shows
                the relationship, the text explains it. Both, not either" — with the half that can no
                longer be true dropped rather than left to mislead.
                ⚠️ SO THE GROUP IS NOW FLAT: two independent settings and one dependent, all at the same
                level, with the dependent saying in words what it depends on. If the cash split ever goes
                back to a single parent, re-indent it and restore the note below.
                ── the V9.6 reasoning, retained ──────────────────────────────────────────────────────
                ⚠️ THESE TWO WERE DELIBERATELY DE-NESTED ONCE, AND THAT WAS REVERSED ON A LAYOUT ARGUMENT.
                The de-nesting rationale — "they answer different questions: WHEN do we take money vs HOW
                does it arrive" — is still true and is still in the git history, which is exactly why this
                note exists. It was the WRONG TEST. Two settings can answer different questions and still
                have one DEPEND on the other, and structure should show the DEPENDENCY, not the semantics.
                THE DEPENDENCY IS DRIVEN BY LAYOUT AS MUCH AS BY MEANING. With the paid step OFF, one tap
                means "paid AND collected" — which is why the button reads `Paid & collected`. Splitting
                that into Cash/Card would make each button ALSO collect, but "Cash" does not say so, and
                the honest label `Cash & collected` needs ~110px against a 72px label box at the 240px KDS
                column. **There is no honest way to render the split when the button also collects.** So a
                truck wanting the split turns the paid step on — that step is what creates the moment where
                "how did they pay" is a separate question from "have they got their food".
                INDENT + TYPE SCALE copied from the notes-review sub-option above (pl-4, same
                text-sm/text-xs pair), NOT invented — one nesting treatment per card.
                ⚠️ Unlike that sub-option, this one is NOT conditionally rendered. It stays visible and
                goes DISABLED with the reason inline: structure shows the relationship, the text explains
                it. Both, not either. An operator who cannot find this setting is why it exists on two
                surfaces at all. */}
            {/* ══ 🔴 THE TRUCK-LEVEL CASH SWITCH IS NOW A FALLBACK ONLY (5 October 2026) ═════════
                "Do you take cash?" became a PER-VAN setting — it is drawn on each van's own card in
                Your trucks, writing `truck_vans.takes_cash`. Dominic, on localhost: "Turning on 'Do
                you take cash?' for Van 1 also turned it on for Van 2", which it did, because this
                control is the only one there was and `trucks.takes_cash` is one column for the whole
                truck.
                🔴 IT STAYS HERE, GATED ON `!vanCashAvailable`, AND IS NOT DELETED. Two reasons:
                  • Before 20261012 is applied there IS no per-van column, so this is the only control
                    that can store anything. A screen with no cash switch at all would be worse than
                    one in the old place.
                  • `trucks.takes_cash` remains the LAST LINK of the resolver chain
                    (event ?? type ?? van ?? truck), so the value it holds still decides what a van
                    with NULL does. It is not dead data.
                ⚠️ AFTER THE MIGRATION THIS ROW DISAPPEARS and the per-van switches replace it. A van
                that has never been touched shows this value and says "Following your truck setting". */}
            {!vanCashAvailable && (
            <div className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{SERVICE_SETTING_LABELS.takes_cash}</p>
                <p className="text-xs text-slate-500 mt-0.5">Splits the payment button into "Cash" and "Card" so your takings reconcile against the till. You can turn this on for a single event from the dashboard.</p>
                {/* ── 🔴 THE GATE NOW HAS TWO PARENTS, AND IT HAD TO (10 August 2026) ─────────────
                    The cash split renders in two places, and after the settings were split those two
                    places answer to DIFFERENT settings:
                      • the Add Order panel's "Take payment" button splits when show_paid_step is on;
                      • the ORDER CARD's "Mark paid" button splits when completion_presses is 'two'.
                    Leaving this disabled on `show_paid_step !== true` alone would have been a real
                    defect introduced by this change: a truck with entry payment-only but a TWO-press
                    completion has a live "Mark paid" button that this control would refuse to split.
                    So the condition is the OR of the two, and the split is inert only when neither
                    surface can reach it — which is exactly the state it was inert in before.
                    ⚠️ The card's ONE-press button is still never split, and the reasoning above stands
                    unchanged: "Cash" that also collects cannot be labelled honestly at a 240px column.
                    ⚠️ DOES NOT auto-enable either parent. toggleOfflineProtection silently enabling
                    keep-screen-on is already recorded in the manual as a defect; one is enough.
                    ⚠️ DOES NOT write takes_cash=false when it becomes inert. The stored value is left
                    exactly as the operator set it and simply renders inert — never mutate what the
                    operator chose in order to tidy state. Re-enabling either parent restores it. */}
                {/* 🔴 THE GATE IS GONE — 10 August 2026. The cash split is now ALWAYS reachable, and
                    keeping a condition here would disable a toggle whose button is live on screen.
                    The Add Order confirm bar was rebuilt so that it ALWAYS offers a payment button:
                    with "Take orders without payment" OFF that is the single button, with it ON it is
                    the primary one. So the split has a live parent in every configuration, and the
                    previous OR condition ("paid step on, or completion set to two presses") is stale —
                    it would have disabled this for the nine trucks on OFF + one press, every one of
                    which now has a payment button in Add Order.
                    ⚠️ THE CARD'S ONE-PRESS BUTTON IS STILL NEVER SPLIT — `Cash & collected` cannot be
                    labelled honestly at a 240px KDS column. The split reaches the Add Order bar in all
                    states, and the card's `Mark paid` only under two presses. That asymmetry is
                    deliberate and unchanged. */}
              </div>
              <Toggle
                on={(form as any).takes_cash === true}
                onToggle={() => { const next = (form as any).takes_cash !== true; setForm(p => ({...p, takes_cash: next} as any)); saveSetting('takes_cash', next) }}
              />
            </div>
            )}
          </div>
        </div>
    </section>
  )
}
