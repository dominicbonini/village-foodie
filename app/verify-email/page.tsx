import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import VerifyEmailSuccess from './VerifyEmailSuccess'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function ErrorUI({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="text-center bg-white rounded-2xl p-8 shadow-sm max-w-sm w-full">
        <div className="text-4xl mb-4">❌</div>
        <p className="text-lg font-semibold text-slate-900">Verification failed</p>
        <p className="text-sm text-slate-500 mt-2">{message}</p>
        <a href="/login" className="mt-4 inline-block text-orange-600 underline text-sm">Go to login</a>
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
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <div className="text-center bg-white rounded-2xl p-8 shadow-sm max-w-sm w-full">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-lg font-semibold text-slate-900">Invalid or expired link</p>
          <p className="text-sm text-slate-500 mt-2">This verification link is invalid or has already expired.</p>
          <a href="/login" className="mt-4 inline-block text-orange-600 underline text-sm">Go to login</a>
        </div>
      </div>
    )
  }

  if (change.verified_at) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <div className="text-center bg-white rounded-2xl p-8 shadow-sm max-w-sm w-full">
          <div className="text-4xl mb-4">✅</div>
          <p className="text-lg font-semibold text-slate-900">Already verified</p>
          <p className="text-sm text-slate-500 mt-2">This email address has already been verified.</p>
          <a href="/login" className="mt-4 inline-block text-orange-600 underline text-sm">Go to login</a>
        </div>
      </div>
    )
  }

  if (new Date(change.expired_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <div className="text-center bg-white rounded-2xl p-8 shadow-sm max-w-sm w-full">
          <div className="text-4xl mb-4">⏰</div>
          <p className="text-lg font-semibold text-slate-900">Link expired</p>
          <p className="text-sm text-slate-500 mt-2">This verification link has expired. Request a new one from your profile settings.</p>
          <a href="/login" className="mt-4 inline-block text-orange-600 underline text-sm">Go to login</a>
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
    return <ErrorUI message="Account not found. Please contact support." />
  }

  // Pre-flight: block if another auth user already owns the new email
  const { data: { users } } = await supabase.auth.admin.listUsers()
  const conflict = users?.find(
    u => u.email === change.new_email && u.id !== operator.auth_user_id
  )
  if (conflict) {
    return (
      <ErrorUI message="This email address is already associated with another account. Please use a different email address." />
    )
  }

  // 1. Update operators.email
  const { error: opError } = await supabase
    .from('operators')
    .update({ email: change.new_email })
    .eq('id', change.operator_id)

  if (opError) {
    console.error('[verify-email] operators update failed:', opError)
    return <ErrorUI message="Failed to update email. Please try again." />
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
    return <ErrorUI message="Failed to update login credentials. Your email has not been changed." />
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

  return <VerifyEmailSuccess newEmail={change.new_email} />
}
