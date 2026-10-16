// scripts/_lp1d-smoke.cjs — Language Phase 1d, area `smoke`: the OUT-OF-SCOPE parts of Manage (Part 2's), a few views
// each, which must NOT change at all — A === F === BEFORE, GB and US: Payments, Billing, Reports, Team, Social media
// (posts / designs / places panes), WhatsApp (reply preview, setup control), custom domain, account deletion.
// (Settings' own out-of-scope sections — Auto-replies, Account deletion — are cut from the Settings page and compared
// the same way, as `settings/…|oos|…` views.)
const M_FILE = 'app/manage/[token]/page.tsx'

async function views(ctx) {
  const { kit, h, html, states, GB, US, inManage, PROVIDERS } = ctx
  const out = {}
  const ST = states(M_FILE, ['filterMode', 'recentEvents', 'reportEventId', 'teamMembers', 'invitingMember', 'editingOwnProfile', 'message', 'result', 'error'])
  const DEL = 'components/manage/DeleteAccountSection.tsx', PAY = 'components/manage/PaymentsTab.tsx'
  let M
  try {
    M = await kit.bundle('lp1d-smoke', [
      `export { BillingTab, ReportsTab, TeamTab, WhatsAppReplyPreview, WhatsAppSetupControl } from '@/${M_FILE}'`,
      "export * as PAY from '@/components/manage/PaymentsTab'",
      "export * as SOC from '@/components/manage/SocialPosts'",
      "export * as DEL from '@/components/manage/DeleteAccountSection'",
      "export { default as CustomDomainSetup } from '@/components/dashboard/CustomDomainSetup'",
      PROVIDERS,
    ].join('\n'), {
      patches: [
        { file: M_FILE, append: 'export { BillingTab, ReportsTab, TeamTab, WhatsAppReplyPreview, WhatsAppSetupControl }' },
        { file: M_FILE, from: "import { createPortal } from 'react-dom'", to: 'const createPortal = (el: any) => el' },
        { file: M_FILE, states: ST },
        { file: DEL, states: states(DEL, ['summary', 'open', 'typed']) },
        { file: PAY, states: states(PAY, ['loading', 'fetchError', 'permissionError']) },
      ],
    })
  } catch (e) { for (const cc of ['GB', 'US']) out[`${cc}|bundle`] = 'ERROR ' + String(e.message).slice(0, 300); return out }
  const noop = () => {}
  const api = async () => ({})
  for (const C of [GB, US]) {
    const cc = C.cc
    const W = el => inManage(M, C, el)
    const truck = { ...C.truck }
    const safe = (k, fn) => { try { out[`${cc}|${k}`] = fn() } catch (e) { out[`${cc}|${k}`] = 'ERROR ' + String(e.message).slice(0, 200) } }
    safe('billing|max', () => html({}, W(h(M.BillingTab, { truck }))))
    safe('billing|starter', () => html({}, W(h(M.BillingTab, { truck: { ...truck, plan: 'starter' } }))))
    safe('billing|trial', () => html({}, W(h(M.BillingTab, { truck: { ...truck, plan: 'pro', trial_expires_at: '2026-10-20T00:00:00Z' } }))))
    const recent = [{ id: 'e-sep', event_date: '2026-09-05', venue_name: 'The Green' }, { id: 'e-oct', event_date: '2026-10-10', venue_name: 'The Market' }]
    safe('reports|picker', () => html({ filterMode: 'event', recentEvents: recent, reportEventId: '' }, W(h(M.ReportsTab, { truck, api }))))
    safe('reports|default', () => html({}, W(h(M.ReportsTab, { truck, api }))))
    const team = { truck, token: 'harness', api, showToast: noop, currentUserEmail: 'owner@example.test', currentUserFirstName: 'Olive', currentUserLastName: 'Owner', currentUserPhone: null,
      currentUserId: 'u-1', ownerEmail: 'owner@example.test', ownerAuthUserId: 'u-1', userRole: 'owner', initialPendingEmailChange: null, onProfileSaved: noop }
    safe('team|owner', () => html({}, W(h(M.TeamTab, team))))
    safe('team|members', () => html({ teamMembers: [{ id: 'm1', email: 'staff@example.test', name: 'Stan Staff', role: 'staff', accepted_at: '2026-09-01T00:00:00Z', auth_user_id: 'u-staff', van_names: ['Van 1'] }] }, W(h(M.TeamTab, team))))
    safe('team|inviting', () => html({ invitingMember: true }, W(h(M.TeamTab, team))))
    safe('team|profile', () => html({ editingOwnProfile: true }, W(h(M.TeamTab, team))))
    safe('whatsapp|preview', () => html({}, W(h(M.WhatsAppReplyPreview, { token: 'harness' }))))
    safe('whatsapp|previewResult', () => html({ message: 'Are you at the green tonight?', result: { reply: 'Yes — 5pm to 9pm.', classification: 'schedule' } }, W(h(M.WhatsAppReplyPreview, { token: 'harness' }))))
    safe('whatsapp|setup', () => html({}, W(h(M.WhatsAppSetupControl, { token: 'harness', offerReauthorise: false, showButton: true, onNotice: noop, onConnectionUpdate: noop }))))
    if (M.PAY && M.PAY.PaymentsTab) {
      safe('payments|max', () => html({}, W(h(M.PAY.PaymentsTab, { token: 'harness', plan: 'max', showToast: noop }))))
      safe('payments|starter', () => html({}, W(h(M.PAY.PaymentsTab, { token: 'harness', plan: 'starter', showToast: noop }))))
      safe('payments|error', () => html({ loading: false, fetchError: 'Could not load payments' }, W(h(M.PAY.PaymentsTab, { token: 'harness', plan: 'max', showToast: noop }))))
      safe('payments|notPermitted', () => html({ loading: false, permissionError: 'not_permitted' }, W(h(M.PAY.PaymentsTab, { token: 'harness', plan: 'max', showToast: noop }))))
    }
    if (M.SOC && M.SOC.SocialPostsPane) for (const area of ['create', 'designs', 'locations'])
      safe(`social|${area}`, () => html({}, W(h(M.SOC.SocialPostsPane, { truck, token: 'harness', area, onArea: noop, manageApi: api, openEventId: null, onOpenedEvent: noop, onRequestArea: noop, onFullWidth: noop }))))
    if (M.DEL && M.DEL.DeleteAccountSection) {
      const summary = { ownerEmail: 'owner@example.test', trucks: [{ id: 'test-truck', name: 'Pizza Kitchen' }], upcomingOrders: 2, pending: false, requestedAt: null, dueAt: null }
      safe('accountDeletion', () => html({ summary }, W(h(M.DEL.DeleteAccountSection, { truckName: 'Pizza Kitchen', showToast: noop }))))
      safe('accountDeletion|open', () => html({ summary, open: true, typed: 'Pizza' }, W(h(M.DEL.DeleteAccountSection, { truckName: 'Pizza Kitchen', showToast: noop }))))
      safe('accountDeletion|pending', () => html({ summary: { ...summary, pending: true, requestedAt: '2026-10-08T10:00:00Z', dueAt: '2026-11-08' } }, W(h(M.DEL.DeleteAccountSection, { truckName: 'Pizza Kitchen', showToast: noop }))))
    }
    safe('customDomain|max', () => html({}, W(h(M.CustomDomainSetup, { token: 'harness', plan: 'max', featureOverrides: {}, trialExpiresAt: null, truckName: 'Pizza Kitchen', slug: 'test-kitchen', website: 'https://pizzakitchen.example' }))))
    safe('customDomain|starter', () => html({}, W(h(M.CustomDomainSetup, { token: 'harness', plan: 'starter', featureOverrides: {}, trialExpiresAt: null, truckName: 'Pizza Kitchen', slug: 'test-kitchen', website: null }))))
  }
  return out
}

module.exports = { views }
