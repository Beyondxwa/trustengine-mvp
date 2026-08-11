'use client'

import { useState, useEffect } from 'react'
import { supabaseBrowserClient } from '@/lib/supabase/client'
import { BusinessSettings } from '@/components/dashboard/settings-business'
import { TeamSettings } from '@/components/dashboard/settings-team'
import { ProfileSettings } from '@/components/dashboard/settings-profile'

type Tab = 'business' | 'team' | 'profile'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('business')
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = supabaseBrowserClient

  useEffect(() => {
    async function getTenant() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }
      const { data: membership } = await supabase
        .from('user_tenants')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single()
      if (membership) setTenantId(membership.tenant_id)
      setLoading(false)
    }
    getTenant()
  }, [])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'business', label: 'Business' },
    { id: 'team', label: 'Team' },
    { id: 'profile', label: 'Profile' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage your business, team, and account preferences.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="border-b border-gray-200">
          <nav className="flex gap-1 px-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'business' && tenantId && <BusinessSettings tenantId={tenantId} />}
          {activeTab === 'team' && tenantId && <TeamSettings tenantId={tenantId} />}
          {activeTab === 'profile' && <ProfileSettings />}
        </div>
      </div>
    </div>
  )
}
