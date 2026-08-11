'use client'

import { useState, useEffect } from 'react'
import { supabaseBrowserClient } from '@/lib/supabase/client'

type Member = {
  user_id: string
  role: string
}

export default function TeamPage() {
  const supabase = supabaseBrowserClient
  const [members, setMembers] = useState<Member[]>([])
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteNotice, setInviteNotice] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setError('Not authenticated')
          setLoading(false)
          return
        }

        setUserEmail(user.email ?? null)
        setUserId(user.id)

        const { data: membership, error: membershipError } = await supabase
          .from('user_tenants')
          .select('tenant_id, role')
          .eq('user_id', user.id)
          .maybeSingle()

        if (membershipError) throw membershipError
        if (!membership) {
          setError('No business tenant found. Please complete onboarding.')
          setLoading(false)
          return
        }

        setTenantId(membership.tenant_id)
        setUserRole(membership.role)

        const { data: teamMembers, error: membersError } = await supabase
          .from('user_tenants')
          .select('user_id, role')
          .eq('tenant_id', membership.tenant_id)

        if (membersError) throw membersError
        setMembers(teamMembers || [])
      } catch (err: any) {
        setError(err.message || 'Failed to load team')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  function handleInvitePlaceholder() {
    setInviteNotice('Invite staff is available under Settings → Team. Full invite flow coming soon on this page.')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-gray-600 mt-1">View team members and manage staff access.</p>
        </div>
        <button
          type="button"
          onClick={handleInvitePlaceholder}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-medium"
        >
          Invite Staff
        </button>
      </div>

      {inviteNotice && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          {inviteNotice}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Current User</h2>
        <div className="space-y-2 text-sm">
          <p><span className="text-gray-600">Email:</span> <span className="font-medium text-gray-900">{userEmail || '—'}</span></p>
          <p><span className="text-gray-600">User ID:</span> <span className="font-mono text-gray-900">{userId || '—'}</span></p>
          <p><span className="text-gray-600">Role:</span> <span className="capitalize font-medium text-gray-900">{userRole || '—'}</span></p>
          <p><span className="text-gray-600">Tenant:</span> <span className="font-mono text-gray-900">{tenantId || '—'}</span></p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
        </div>
        {members.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 italic">No team members found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">User ID</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">You</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {members.map((member) => (
                  <tr key={member.user_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-mono text-sm text-gray-900">{member.user_id}</td>
                    <td className="px-6 py-4 text-sm text-gray-700 capitalize">{member.role}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {member.user_id === userId ? (
                        <span className="inline-flex px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium">You</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
