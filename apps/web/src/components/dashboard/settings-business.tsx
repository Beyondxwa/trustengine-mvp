'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Tenant = {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string | null
  secondary_color: string | null
}

type ReviewPlatform = {
  id: string
  platform: string
  url: string
  is_primary: boolean
}

export function BusinessSettings({ tenantId }: { tenantId: string }) {
  const supabase = createClient()
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [platforms, setPlatforms] = useState<ReviewPlatform[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [newPlatform, setNewPlatform] = useState({ platform: 'google', url: '', is_primary: false })

  useEffect(() => {
    fetchData()
  }, [tenantId])

  async function fetchData() {
    const { data: t } = await supabase.from('tenants').select('*').eq('id', tenantId).single()
    const { data: p } = await supabase.from('review_platforms').select('*').eq('tenant_id', tenantId)
    if (t) setTenant(t)
    if (p) setPlatforms(p)
    setLoading(false)
  }

  async function saveTenant(e: React.FormEvent) {
    e.preventDefault()
    if (!tenant) return
    setSaving(true)
    const { error } = await supabase.from('tenants').update({
      name: tenant.name,
      slug: tenant.slug,
      logo_url: tenant.logo_url,
      primary_color: tenant.primary_color,
      secondary_color: tenant.secondary_color,
    }).eq('id', tenantId)
    setSaving(false)
    setMessage(error ? 'Failed to save' : 'Business info saved!')
    setTimeout(() => setMessage(null), 3000)
  }

  async function addPlatform(e: React.FormEvent) {
    e.preventDefault()
    if (!newPlatform.url.trim()) return
    const { data, error } = await supabase.from('review_platforms').insert({
      tenant_id: tenantId,
      platform: newPlatform.platform,
      url: newPlatform.url,
      is_primary: newPlatform.is_primary,
    }).select()
    if (!error && data) {
      setPlatforms([...platforms, data[0]])
      setNewPlatform({ platform: 'google', url: '', is_primary: false })
    }
  }

  async function deletePlatform(id: string) {
    await supabase.from('review_platforms').delete().eq('id', id)
    setPlatforms(platforms.filter(p => p.id !== id))
  }

  if (loading) return <div className="p-4 text-center text-gray-500">Loading...</div>

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Business Information</h3>
        <form onSubmit={saveTenant} className="space-y-4 max-w-xl">
          {message && (
            <div className={`p-3 rounded-lg text-sm ${message.includes('Failed') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {message}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700">Business Name</label>
            <input
              type="text"
              value={tenant?.name || ''}
              onChange={e => setTenant(t => t ? { ...t, name: e.target.value } : t)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Slug</label>
            <input
              type="text"
              value={tenant?.slug || ''}
              onChange={e => setTenant(t => t ? { ...t, slug: e.target.value } : t)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Primary Color</label>
              <input
                type="color"
                value={tenant?.primary_color || '#3b82f6'}
                onChange={e => setTenant(t => t ? { ...t, primary_color: e.target.value } : t)}
                className="mt-1 block w-full h-10 rounded-lg border border-gray-300 px-2 py-1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Secondary Color</label>
              <input
                type="color"
                value={tenant?.secondary_color || '#10b981'}
                onChange={e => setTenant(t => t ? { ...t, secondary_color: e.target.value } : t)}
                className="mt-1 block w-full h-10 rounded-lg border border-gray-300 px-2 py-1"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Logo URL</label>
            <input
              type="url"
              value={tenant?.logo_url || ''}
              onChange={e => setTenant(t => t ? { ...t, logo_url: e.target.value } : t)}
              placeholder="https://..."
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      <div className="border-t border-gray-200 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Review Platforms</h3>
        <p className="text-sm text-gray-600 mb-4">Add links to your Google, Yelp, and other review pages. Happy customers will be redirected here.</p>
        
        <div className="space-y-3 mb-6">
          {platforms.map(p => (
            <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-900 capitalize">{p.platform}</span>
                <span className="text-sm text-gray-600 truncate max-w-xs">{p.url}</span>
                {p.is_primary && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">Primary</span>}
              </div>
              <button
                onClick={() => deletePlatform(p.id)}
                className="text-red-600 hover:text-red-700 text-sm font-medium"
              >
                Remove
              </button>
            </div>
          ))}
          {platforms.length === 0 && (
            <p className="text-sm text-gray-500 italic">No review platforms configured yet.</p>
          )}
        </div>

        <form onSubmit={addPlatform} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Platform</label>
            <select
              value={newPlatform.platform}
              onChange={e => setNewPlatform({ ...newPlatform, platform: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 outline-none"
            >
              <option value="google">Google</option>
              <option value="yelp">Yelp</option>
              <option value="facebook">Facebook</option>
              <option value="tripadvisor">TripAdvisor</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-700 mb-1">URL</label>
            <input
              type="url"
              required
              value={newPlatform.url}
              onChange={e => setNewPlatform({ ...newPlatform, url: e.target.value })}
              placeholder="https://g.page/.../review"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={newPlatform.is_primary}
              onChange={e => setNewPlatform({ ...newPlatform, is_primary: e.target.checked })}
              className="rounded border-gray-300"
            />
            Primary
          </label>
          <button
            type="submit"
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
          >
            Add Platform
          </button>
        </form>
      </div>
    </div>
  )
}
