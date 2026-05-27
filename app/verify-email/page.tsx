import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) redirect('/login')

  const { data: change } = await supabase
    .from('operator_email_changes')
    .select('id, operator_id, new_email, expires_at, verified_at')
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

  if (new Date(change.expires_at) < new Date()) {
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

  // Get auth_user_id before updating email
  const { data: operator } = await supabase
    .from('operators')
    .select('auth_user_id')
    .eq('id', change.operator_id)
    .single()

  // Update operator email
  await supabase
    .from('operators')
    .update({ email: change.new_email })
    .eq('id', change.operator_id)

  // Update Supabase Auth email
  if (operator?.auth_user_id) {
    await supabase.auth.admin.updateUserById(operator.auth_user_id, {
      email: change.new_email,
    })
  }

  // Mark verified (preserves audit trail)
  await supabase
    .from('operator_email_changes')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', change.id)

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="text-center bg-white rounded-2xl p-8 shadow-sm max-w-sm w-full">
        <div className="text-4xl mb-4">✅</div>
        <p className="text-lg font-semibold text-slate-900">Email address updated</p>
        <p className="text-sm text-slate-500 mt-2">Your email has been changed to {change.new_email}.</p>
        <a
          href="/login"
          className="mt-6 inline-block bg-orange-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm"
        >
          Go to login
        </a>
      </div>
    </div>
  )
}
