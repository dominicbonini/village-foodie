import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import VerifyEmailSuccess from './VerifyEmailSuccess'
import { translatorFor } from '@/lib/i18n/translator'
import { localeForTruck } from '@/lib/i18n/server-locale'
import { DEFAULT_LOCALE, type AppLocale } from '@/lib/i18n/locales'
import { wordsFor } from '@/lib/i18n/server-words'
import { NAMESPACES } from '@/lib/i18n/namespaces'
import '@/lib/i18n/catalog/auth'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Language Phase 1c: the words on this page are the operator's truck's language (its country's locale) once the
 *  link has named the operator — their oldest truck's country. Before that (no such link), or
 *  with no truck or any failure reading it, en-GB (DEFAULT_LOCALE). Words only: it never decides anything else. */
async function operatorLocale(operatorId: string): Promise<AppLocale> {
  try {
    const { data } = await supabase
      .from('trucks')
      .select('country')
      .eq('operator_id', operatorId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    return await localeForTruck(data)
  } catch {
    return DEFAULT_LOCALE
  }
}

function ErrorUI({ title, message, login }: { title: string; message: string; login: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="text-center bg-white rounded-2xl p-8 shadow-sm max-w-sm w-full">
        <div className="text-4xl mb-4">❌</div>
        <p className="text-lg font-semibold text-slate-900">{title}</p>
        <p className="text-sm text-slate-500 mt-2">{message}</p>
        <a href="/login" className="mt-4 inline-block text-orange-600 underline text-sm">{login}</a>
      </div>
    </div>
  )
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) redirect('/login')

  const { data: change } = await supabase
    .from('operator_email_changes')
    .select('id, operator_id, old_email, new_email, expired_at, verified_at')
    .eq('token', token)
    .maybeSingle()

  if (!change) {
    const t = translatorFor(DEFAULT_LOCALE, 'auth.verifyEmail')
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <div className="text-center bg-white rounded-2xl p-8 shadow-sm max-w-sm w-full">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-lg font-semibold text-slate-900">{t('invalidTitle')}</p>
          <p className="text-sm text-slate-500 mt-2">{t('invalidBody')}</p>
          <a href="/login" className="mt-4 inline-block text-orange-600 underline text-sm">{t('goToLogin')}</a>
        </div>
      </div>
    )
  }

  const locale = await operatorLocale(change.operator_id)
  const t = translatorFor(locale, 'auth.verifyEmail')
  const fail = (message: string) => <ErrorUI title={t('failedTitle')} message={message} login={t('goToLogin')} />

  if (change.verified_at) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <div className="text-center bg-white rounded-2xl p-8 shadow-sm max-w-sm w-full">
          <div className="text-4xl mb-4">✅</div>
          <p className="text-lg font-semibold text-slate-900">{t('verifiedTitle')}</p>
          <p className="text-sm text-slate-500 mt-2">{t('verifiedBody')}</p>
          <a href="/login" className="mt-4 inline-block text-orange-600 underline text-sm">{t('goToLogin')}</a>
        </div>
      </div>
    )
  }

  if (new Date(change.expired_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <div className="text-center bg-white rounded-2xl p-8 shadow-sm max-w-sm w-full">
          <div className="text-4xl mb-4">⏰</div>
          <p className="text-lg font-semibold text-slate-900">{t('expiredTitle')}</p>
          <p className="text-sm text-slate-500 mt-2">{t('expiredBody')}</p>
          <a href="/login" className="mt-4 inline-block text-orange-600 underline text-sm">{t('goToLogin')}</a>
        </div>
      </div>
    )
  }

  const { data: operator } = await supabase
    .from('operators')
    .select('auth_user_id')
    .eq('id', change.operator_id)
    .single()

  if (!operator?.auth_user_id) {
    return fail(t('accountNotFound'))
  }

  // Pre-flight: block if another auth user already owns the new email
  const { data: { users } } = await supabase.auth.admin.listUsers()
  const conflict = users?.find(
    u => u.email === change.new_email && u.id !== operator.auth_user_id
  )
  if (conflict) {
    return fail(t('emailTaken'))
  }

  // 1. Update operators.email
  const { error: opError } = await supabase
    .from('operators')
    .update({ email: change.new_email })
    .eq('id', change.operator_id)

  if (opError) {
    console.error('[verify-email] operators update failed:', opError)
    return fail(t('updateFailed'))
  }

  // 2. Update auth.users.email
  const { error: authError } = await supabase.auth.admin.updateUserById(
    operator.auth_user_id,
    { email: change.new_email }
  )

  if (authError) {
    console.error('[verify-email] auth update failed:', authError)
    await supabase
      .from('operators')
      .update({ email: change.old_email })
      .eq('id', change.operator_id)
    return fail(t('loginUpdateFailed'))
  }

  // 3. Update truck_users.email (non-critical)
  const { error: tuError } = await supabase
    .from('truck_users')
    .update({ email: change.new_email })
    .eq('auth_user_id', operator.auth_user_id)
  if (tuError) {
    console.error('[verify-email] truck_users update failed:', tuError)
  }

  // 4. Mark verified_at
  await supabase
    .from('operator_email_changes')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', change.id)

  return <VerifyEmailSuccess newEmail={change.new_email} locale={locale} words={wordsFor(locale, NAMESPACES.verifyEmail)} />
}
