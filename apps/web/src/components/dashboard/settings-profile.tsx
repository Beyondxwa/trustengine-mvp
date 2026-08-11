'use client'

import { useState, useEffect } from 'react'
import { supabaseBrowserClient } from '@/lib/supabase/client'

export function ProfileSettings() {
  const supabase = supabaseBrowserClient
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [updating, setUpdating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setEmail(user.email)
    })
  }, [])

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!password || password.length < 8) {
      setMessage('Password must be at least 8 characters')
      return
    }
    setUpdating(true)
    const { error } = await supabase.auth.updateUser({ password })
    setUpdating(false)
    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Password updated successfully!')
      setPassword('')
    }
    setTimeout(() => setMessage(null), 4000)
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Profile</h3>
        
        {message && (
          <div className={`p-3 rounded-lg text-sm mb-4 ${message.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              disabled
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 bg-gray-100 text-gray-600 cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">Contact support to change your email address.</p>
          </div>

          <form onSubmit={updatePassword} className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Change Password</h4>
            <div>
              <label className="block text-sm font-medium text-gray-700">New Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                minLength={8}
                placeholder="••••••••"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={updating}
              className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-medium disabled:opacity-50"
            >
              {updating ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
