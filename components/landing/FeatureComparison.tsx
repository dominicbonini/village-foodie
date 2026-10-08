// components/landing/FeatureComparison.tsx — the "Every feature, side by side" section.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 MOVED OUT OF THE LANDING PAGE, NOT REWRITTEN (6 October 2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// The landing page was too long and this was the longest thing on it — 31 rows across four columns
// plus five footnotes, below the plan cards that most visitors came for. It now lives on /features,
// and the landing carries a text link to it.
//
// ⛔ THE JSX BELOW IS THE LANDING'S OWN MARKUP, MOVED VERBATIM. Same heading, same subline, same
// classes, same row order, same footnotes, same data source (lib/plan-features.ts +
// lib/landing-table.ts). Nothing about WHAT it renders changed in the move — which is the one thing a
// "move this section" task can quietly get wrong, and the reason it is a component rather than a
// retyped copy on the new page.
//
// ⚠️ IT MUST RENDER INSIDE A `.hg-landing` WRAPPER. Every class here — `band`, `wrap`, `cmp2`, `fn` —
// is scoped under `.hg-landing` in app/landing/landing.css. Rendered outside that wrapper it is an
// unstyled stack of divs, which is exactly how it would fail: visible, complete and wrong.
//
// 🔴 A SERVER COMPONENT, AND IT SHOULD STAY ONE. It has no state and no handlers; it reads two pure
// modules at render. Marking it `'use client'` would ship FEATURE_SECTIONS and every footnote to the
// browser for no gain.

import {
  FEATURE_SECTIONS, FOOTNOTES, TRANSACTION_ROWS, CARD_FEE_ONLINE_LABEL,
  type FeatureValue,
} from '@/lib/plan-features'
import { PLAN_META } from '@/lib/features'
import {
  TABLE_PLANS, PLAN_SUB, PLAN_PRICE_LABEL, trialFeatureValue,
  visibleRows, rowName, rowDetail, cellLabel,
} from '@/lib/landing-table'

// RENDER-ONLY footnote text overrides for this table. The shared FOOTNOTES (lib/plan-features.ts) are
// NOT modified — Billing/Admin keep the original wording; only this table shows this text.
// ⚠️ MOVED WITH THE SECTION. It was a module constant in app/landing/page.tsx and had exactly one
// reader, which is this table; leaving it behind would have left the landing holding an override for
// a table it no longer renders.
const FOOTNOTE_TEXT_OVERRIDES: Record<string, string> = {
  '2': `Standard card processing fees apply to all online orders (currently ${CARD_FEE_ONLINE_LABEL} on standard UK cards), including those within your allowance.`,
}

// One shared cell renderer. 🔴 THE GLYPHS THEMSELVES ARE IN lib/landing-table.ts so the PDF prints
// exactly what the page prints — including the protected em-dash '—' for a not-included cell.
// ⚠️ MOVED WITH THE SECTION, same reason as the overrides above: the landing page no longer has a
// table to put a cell in.
function Cell({ value }: { value: FeatureValue }) {
  const label = cellLabel(value)
  if (label === '✓') return <span className="yes">{label}</span>
  if (label === 'Coming soon') return <span className="soon">{label}</span>
  return <span className="no">{label}</span>
}

/** The whole section: eyebrow, heading, subline, table and footnotes 1–5. */
export function FeatureComparison() {
  return (
    <section className="band">
      <div className="wrap">
        <p className="eyebrow">Compare</p>
        <h2>Every feature, side by side.</h2>
        <p className="lede">Your free month includes everything — try the lot before you pick.</p>

        <div className="cmp2">
          {/* Sticky priced header — pins below the nav (top: --nav-h), opaque bg hides rows scrolling under.
              Same technique as Manage → Billing. */}
          <div className="cmp2-head">
            <div className="cmp2-feat" />
            {TABLE_PLANS.map(p => (
              <div key={p} className="cmp2-col">
                <span className="th-plan">{PLAN_META[p].name}</span>
                <span className="th-price">{PLAN_PRICE_LABEL[p]}</span>
                {PLAN_SUB[p] && <span className="th-sub">{PLAN_SUB[p]}</span>}
              </div>
            ))}
          </div>

          {/* Fees group — TRANSACTION_ROWS from lib/plan-features.ts, one fact per cell. THE SAME
              CONSTANT Manage → Billing renders, so the two cannot state different fees again.
              ══ 🔴 THE WRAPPER IS NOT COSMETIC — IT IS THIS HEADING'S STICKY CONTAINER (7 Oct 2026) ═══
              `.cmp2-grp` became `position: sticky` so the tier a reader is looking at stays on screen.
              ⛔ A STICKY ELEMENT PINS UNTIL ITS **PARENT'S** BOX SCROLLS PAST. The four feature sections
              each have a `<div key={section.title}>` of their own, so each heading releases at the end of
              its own rows — but "Fees" was a LOOSE CHILD of `.cmp2`, whose box is the whole table, so it
              pinned on the first scroll and **never let go**: it sat under the priced header for all 33
              rows with Starter/Pro/Max stacking on top of it. Caught by a check that asserted which
              heading was pinned, not merely that one was.
              🟢 THE FIX IS THE SAME SHAPE THE SECTIONS ALREADY HAD. Wrapping it scopes its sticky
              container to the fees block, so exactly one heading is ever pinned. */}
          <div>
            <div className="cmp2-grp">Fees</div>
            {TRANSACTION_ROWS.map(row => (
              <div key={row.name} className="cmp2-row">
                <div className="cmp2-label">
                  <span className="f-name">{row.name}{row.footnote && <sup className="f-note">{row.footnote}</sup>}</span>
                </div>
                {TABLE_PLANS.map(p => (
                  <div key={p} className="cmp2-cell"><span className="val">{row.cells[p]}</span></div>
                ))}
              </div>
            ))}
          </div>

          {/* Feature sections — from FEATURE_SECTIONS (name + detail + per-tier value; Trial = Max + pay-at-hatch) */}
          {FEATURE_SECTIONS.map(section => (
            <div key={section.title}>
              <div className="cmp2-grp">{section.title}</div>
              {visibleRows(section).map(row => (
                <div key={row.name} className="cmp2-row">
                  <div className="cmp2-label">
                    {/* NAME_OVERRIDES and DETAIL_OVERRIDES are landing-only, exactly as the detail
                        override already was. `row.footnote` is deliberately NOT overridden: both
                        merged rows carried footnote 4, so it is already the right one. */}
                    <span className="f-name">{rowName(row)}{row.footnote && <sup className="f-note">{row.footnote}</sup>}</span>
                    {rowDetail(row) && <span className="f-desc">{rowDetail(row)}</span>}
                  </div>
                  {TABLE_PLANS.map(p => (
                    <div key={p} className="cmp2-cell">
                      <Cell value={p === 'trial' ? trialFeatureValue(row) : row[p as 'starter' | 'pro' | 'max']} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="fn">
          {FOOTNOTES.map(f => (
            <p key={f.number}><sup>{f.number}</sup> {FOOTNOTE_TEXT_OVERRIDES[f.number] ?? f.text}</p>
          ))}
        </div>
      </div>
    </section>
  )
}
