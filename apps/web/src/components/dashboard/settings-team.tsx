'use client'

import { useState, useEffect } from 'react'
import { supabaseBrowserClient } from '@/lib/supabase/client'

type Member = {
  user_id: string
  role: string
}

type Invite = {
  id: string
  email: string
  role: string
  status: string
  expires_at: string
  token: string
}

export function TeamSettings({ tenantId }: { tenantId: string }) {
  const supabase = supabaseBrowserClient
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('staff')
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<{url?: string, error?: string} | null>(null)

  useEffect(() => {
    fetchData()
  }, [tenantId])

  async function fetchData() {
    const { data: m } = await supabase.from('user_tenants').select('user_id, role').eq('tenant_id', tenantId)
    const { data: i } = await supabase.from('staff_invites').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
    if (m) setMembers(m)
    if (i) setInvites(i)
    setLoading(false)
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    setInviteResult(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invite-staff`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tenant_id: tenantId, email, role }),
        }
      )

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to send invite')
      }

      setInviteResult({ url: result.data.invite_url })
      setEmail('')
      fetchData()
    } catch (err: any) {
      setInviteResult({ error: err.message })
    } finally {
      setInviting(false)
    }
  }

  async function cancelInvite(id: string) {
    await supabase.from('staff_invites').update({ status: 'revoked' }).eq('id', id)
    setInvites(invites.map(i => i.id === id ? { ...i, status: 'revoked' } : i))
  }

  if (loading) return <div className="p-4 text-center text-gray-500">Loading...</div>

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Invite Team Member</h3>
        <form onSubmit={sendInvite} className="flex flex-wrap gap-3 items-end max-w-xl">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="teammate@business.com"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 outline-none"
            >
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={inviting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-medium disabled:opacity-50"
          >
            {inviting ? 'Sending...' : 'Send Invite'}
          </button>
        </form>

        {inviteResult?.url && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800 font-medium mb-2">Invite created successfully!</p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-white border border-green-200 rounded px-2 py-1 flex-1 truncate font-mono text-green-900">
                {inviteResult.url}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(inviteResult.url!)}
                className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-500"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {inviteResult?.error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {inviteResult.error}
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Pending Invites</h3>
        {invites.filter(i => i.status === 'pending').length === 0 ? (
          <p className="text-sm text-gray-500 italic">No pending invites.</p>
        ) : (
          <div className="space-y-2">
            {invites.filter(i => i.status === 'pending').map(invite => (
              <div key={invite.id} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{invite.email}</p>
                  <p className="text-xs text-gray-600 capitalize">Role: {invite.role} • Expires: {new Date(invite.expires_at).toLocaleDateString()}</p>
                </div>
                <button
                  onClick={() => cancelInvite(invite.id)}
                  className="text-red-600 hover:text-red-700 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Members</h3>
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.user_id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                  {m.user_id.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-gray-900 font-mono text-sm">{m.user_id.slice(0, 12)}...</p>
                  <p className="text-xs text-gray-600 capitalize">{m.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
