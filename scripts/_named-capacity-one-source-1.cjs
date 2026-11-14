// scripts/_named-capacity-one-source-1.cjs (capacity-one-source-1, 13 November 2026, docs/capacity-one-source-1-report.md): the
// named changes this work makes to what the language-phase harnesses record.
//   proveManageGet(exp, f)   GET /api/manage answers `capacityView` ({ firstVanId, vanCount, vansDiffer }) right after
//                            `categories`, and `categories` are resolved for the first van (identical in these fixtures: no
//                            per-van rows). STRUCTURAL: with exactly that key taken out, F equals the expected answer byte for
//                            byte, the key sits right after `categories`, and its shape is right.
//   menuProp(props)          Manage hands MenuTab `capacityView` and `onCategoriesPatch` right after `categories`.
//   capacityProp(props)      Manage hands KitchenCapacitySection `onFirstVanCategoryChange` after `showToast`.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path')
const LANDED = (() => { try { return fs.readFileSync(path.join(__dirname, '..', 'app/api/manage/route.ts'), 'utf8').includes('capacityView: { firstVanId') } catch { return false } })()
const NO_VIEW = { firstVanId: null, vanCount: 0, vansDiffer: [] }

function proveManageGet(exp, f) {
  const problems = []
  try {
    if (!f || typeof f.body !== 'string' || !exp || typeof exp.body !== 'string') return { ok: false, problems: ['not an API view'] }
    const body = JSON.parse(f.body)
    // A refusal (no token, bad token, no user, another truck's) has no categories, so nothing is added: it must be unchanged.
    if (!('categories' in JSON.parse(exp.body))) return JSON.stringify(f) === JSON.stringify(exp) ? { ok: true, problems: [] } : { ok: false, problems: ['a refusal changed'] }
    const keys = Object.keys(body)
    const i = keys.indexOf('capacityView')
    if (i < 0) problems.push('no capacityView')
    else {
      if (keys[i - 1] !== 'categories') problems.push(`capacityView is not right after categories (after ${keys[i - 1]})`)
      const v = body.capacityView
      if (!v || !('firstVanId' in v) || typeof v.vanCount !== 'number' || !Array.isArray(v.vansDiffer)) problems.push('capacityView has the wrong shape: ' + JSON.stringify(v))
      delete body.capacityView
    }
    const rest = { ...f, body: JSON.stringify(body) }
    if (JSON.stringify(rest) !== JSON.stringify(exp)) problems.push('with capacityView taken out, the answer differs from the expected one')
  } catch (e) { problems.push('threw: ' + e.message) }
  return { ok: problems.length === 0, problems }
}
const insertAfter = (o, after, add) => {
  const out = {}
  for (const [k, v] of Object.entries(o)) { out[k] = v; if (k === after) Object.assign(out, add) }
  return out
}
const menuProp = p => ('categories' in p && 'onVerifySuccess' in p && !('capacityView' in p) ? insertAfter(p, 'categories', { capacityView: NO_VIEW, onCategoriesPatch: '[fn]' }) : p)
const capacityProp = p => ('showToast' in p && !('onFirstVanCategoryChange' in p) ? insertAfter(p, 'showToast', { onFirstVanCategoryChange: '[fn]' }) : p)

// ── THE DASHBOARD ACTION ROUTE (an order-path file other harnesses pin byte for byte) ────────────────────────────────────────
// This work's only edits there: its import, and the two category handlers (`save_prep_configs`, `update_category`) now write prep /
// items per batch / counts through the ONE writer. [before, after], exact. `undoCode` puts them back; null unless each `after` is
// there exactly once, so the file then reads as changed and every other byte is still compared.
const CODE_FILES = ['app/api/dashboard/action/route.ts']
const DASH_ACTION_PAIRS = [
  ["import { logAction, logActionOrThrow } from '@/lib/audit/actionAudit'\n",
   "import { logAction, logActionOrThrow } from '@/lib/audit/actionAudit'\nimport { writeCategoryCapacityForTruck, capacityPatchOf } from '@/lib/category-capacity-write'\n"],
  ["        await supabase.from('menu_categories').update({\n          prep_secs: cfg.secs,\n          batch_size: cfg.batch,\n        }).eq('id', cat.id)\n",
   "        // 🔴 capacity-one-source-1: through the ONE writer (first van + followers + menu_categories mirror).\n        await writeCategoryCapacityForTruck(supabase, truck.id, cat.id, { prep_secs: cfg.secs, batch_size: cfg.batch })\n"],
  ["      await supabase.from('menu_categories')\n        // counts_toward_capacity only set when explicitly provided (the capacity tickbox) — a\n        // prep/batch save omits it and must NOT reset it. undefined fields are dropped by the PATCH.\n        .update({ name, prep_secs, batch_size, allow_notes, ...(counts_toward_capacity !== undefined ? { counts_toward_capacity: !!counts_toward_capacity } : {}) })\n        .eq('id', categoryId)\n        .eq('truck_id', truck.id)\n      return NextResponse.json({ success: true })\n",
   "      // 🔴 capacity-one-source-1: only the menu fields here; prep / items per batch / counts go through\n      // the ONE writer (lib/category-capacity-write.ts), never straight into menu_categories.\n      await supabase.from('menu_categories')\n        .update({ name, allow_notes })\n        .eq('id', categoryId)\n        .eq('truck_id', truck.id)\n      const cap = capacityPatchOf({ prep_secs, batch_size, counts_toward_capacity })\n      if (Object.keys(cap).length) await writeCategoryCapacityForTruck(supabase, truck.id, categoryId, cap)\n      return NextResponse.json({ success: true })\n"],
]
function undoCode(file, src) {
  if (!CODE_FILES.includes(file)) return src
  let out = src
  for (const [before, after] of DASH_ACTION_PAIRS) {
    if (out.split(after).length !== 2) return null
    out = out.split(after).join(before)
  }
  return out
}

module.exports = { LANDED, NO_VIEW, proveManageGet, menuProp, capacityProp, CODE_FILES, undoCode }
