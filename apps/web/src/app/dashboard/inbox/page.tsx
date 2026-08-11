'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FeedbackDetail } from '@/components/dashboard/feedback-detail'

type AIData = {
  sentiment: 'positive' | 'neutral' | 'negative'
  coaching_advice: string
  suggested_response: string
  tags: string[]
  cost_usd: number
  model_used: string
  created_at: string
}

type FeedbackItem = {
  id: string
  tenant_id: string
  rating: number
  comment: string | null
  selected_tags: string[] | null
  is_resolved: boolean
  created_at: string
  customer_email: string | null
  customer_phone: string | null
  ai_analysis: AIData | null
}

type Filters = {
  rating: string
  is_resolved: string
  search: string
  sort_by: string
  sort_order: 'asc' | 'desc'
}

export default function InboxPage() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false,
  })
  const [filters, setFilters] = useState<Filters>({
    rating: '',
    is_resolved: '',
    search: '',
    sort_by: 'created_at',
    sort_order: 'desc',
  })

  const supabase = createClient()

  // Fetch user's first tenant on mount
  useEffect(() => {
    async function getTenant() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: membership } = await supabase
        .from('user_tenants')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single()

      if (membership) {
        setTenantId(membership.tenant_id)
      } else {
        setError('No business tenant found. Please complete onboarding.')
        setLoading(false)
      }
    }
    getTenant()
  }, [])

  // Fetch feedback when tenant or refreshKey changes
  useEffect(() => {
    if (!tenantId) return

    async function fetchFeedback() {
      setLoading(true)
      setError(null)

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('Not authenticated')

        const body: Record<string, string | number> = {
          limit: pagination.limit,
          offset: pagination.offset,
          sort_by: filters.sort_by,
          sort_order: filters.sort_order,
        }
        if (filters.rating) body.rating = filters.rating
        if (filters.is_resolved === 'true') body.status = 'resolved'
        if (filters.is_resolved === 'false') body.status = 'unresolved'
        if (filters.search.trim()) body.search = filters.search.trim()

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-feedback`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          }
        )

        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err.error || `Failed to fetch feedback (${response.status})`)
        }

        const result = await response.json()
        if (!result.success) throw new Error(result.error || 'Failed to fetch feedback')

        setFeedback(result.data || [])
        setPagination((prev) => ({
          ...prev,
          total: result.total ?? 0,
          hasMore: result.hasMore ?? false,
        }))
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchFeedback()
  }, [tenantId, refreshKey])

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const applyFilters = () => {
    setPagination((prev) => ({ ...prev, offset: 0 }))
    setRefreshKey((k) => k + 1)
  }

  const goToPage = (newOffset: number) => {
    setPagination((prev) => ({ ...prev, offset: Math.max(0, newOffset) }))
    setRefreshKey((k) => k + 1)
  }

  const renderStars = (rating: number) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-4 h-4 ${star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )

  const sentimentBadge = (sentiment?: string) => {
    const styles = {
      positive: 'bg-green-100 text-green-800',
      negative: 'bg-red-100 text-red-800',
      neutral: 'bg-yellow-100 text-yellow-800',
    }
    return (
      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${styles[sentiment as keyof typeof styles] || 'bg-gray-100 text-gray-600'}`}>
        {sentiment || '—'}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Feedback Inbox</h1>
          <p className="text-gray-600 mt-1">View, filter, and analyze customer feedback.</p>
        </div>
        <a
          href="/dashboard/qr"
          className="hidden sm:inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors text-sm font-medium"
        >
          Generate QR Code
        </a>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
            <select
              value={filters.rating}
              onChange={(e) => handleFilterChange('rating', e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">All ratings</option>
              <option value="5">5 stars</option>
              <option value="4">4 stars</option>
              <option value="3">3 stars</option>
              <option value="2">2 stars</option>
              <option value="1">1 star</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.is_resolved}
              onChange={(e) => handleFilterChange('is_resolved', e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">All</option>
              <option value="false">Open</option>
              <option value="true">Resolved</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              value={filters.sort_by}
              onChange={(e) => handleFilterChange('sort_by', e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="created_at">Date</option>
              <option value="rating">Rating</option>
              <option value="nps_score">NPS</option>
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              placeholder="Search comments, email, phone..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <button
            onClick={applyFilters}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors text-sm font-medium"
          >
            Apply Filters
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="mt-3 text-gray-500 text-sm">Loading feedback...</p>
          </div>
        ) : feedback.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <h3 className="text-gray-900 font-medium">No feedback yet</h3>
            <p className="text-gray-500 text-sm mt-1">Generate a QR code and share it with customers to start collecting reviews.</p>
            <a href="/dashboard/qr" className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors text-sm font-medium">
              Create Your First QR Code
            </a>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 font-semibold text-gray-700">Rating</th>
                    <th className="px-6 py-3 font-semibold text-gray-700">Comment</th>
                    <th className="px-6 py-3 font-semibold text-gray-700">Sentiment</th>
                    <th className="px-6 py-3 font-semibold text-gray-700">Tags</th>
                    <th className="px-6 py-3 font-semibold text-gray-700">Date</th>
                    <th className="px-6 py-3 font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {feedback.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedFeedback(item)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">{renderStars(item.rating)}</td>
                      <td className="px-6 py-4">
                        <p className="text-gray-900 line-clamp-2 max-w-xs">
                          {item.comment || <span className="text-gray-400 italic">No comment</span>}
                        </p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {sentimentBadge(item.ai_analysis?.sentiment)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {(item.selected_tags || []).slice(0, 3).map((tag) => (
                            <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                              {tag}
                            </span>
                          ))}
                          {(item.selected_tags?.length || 0) > 3 && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
                              +{(item.selected_tags!.length - 3)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                        {new Date(item.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {item.is_resolved ? (
                          <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Resolved
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            Open
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Showing <span className="font-medium">{pagination.total > 0 ? pagination.offset + 1 : 0}</span> -{' '}
                <span className="font-medium">{Math.min(pagination.offset + feedback.length, pagination.total)}</span> of{' '}
                <span className="font-medium">{pagination.total}</span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => goToPage(pagination.offset - pagination.limit)}
                  disabled={pagination.offset === 0}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => goToPage(pagination.offset + pagination.limit)}
                  disabled={!pagination.hasMore}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Detail Drawer */}
      {selectedFeedback && (
        <FeedbackDetail
          feedback={selectedFeedback}
          onClose={() => setSelectedFeedback(null)}
        />
      )}
    </div>
  )
}
