import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
} from 'react-native'
import { useAuth } from '../context/AuthContext'

type AIData = {
  sentiment: 'positive' | 'neutral' | 'negative'
  coaching_advice: string
  suggested_response: string
  tags: string[]
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

type PaginationInfo = {
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

function logInbox(
  component: string,
  level: 'INFO' | 'WARN' | 'ERROR',
  message: string,
  context?: Record<string, unknown>
) {
  const ts = new Date().toISOString()
  const ctx = context ? ` | Context: ${JSON.stringify(context)}` : ''
  const line = `[TRUSTENGINE] [${component}] [${level}] ${message}${ctx} | Timestamp: ${ts}`
  if (level === 'ERROR') console.error(line)
  else if (level === 'WARN') console.warn(line)
  else console.log(line)
}

function maskId(id: string): string {
  if (!id || id.length < 8) return '***'
  return `${id.slice(0, 4)}***${id.slice(-4)}`
}

function validateInboxResponse(data: unknown): {
  success: boolean
  data?: FeedbackItem[]
  total?: number
  hasMore?: boolean
  error?: string
} {
  if (typeof data !== 'object' || data === null) {
    return { success: false, error: 'Invalid response structure from server' }
  }
  const d = data as Record<string, unknown>
  if (d.success !== true) {
    return { success: false, error: typeof d.error === 'string' ? d.error : 'Unknown server error' }
  }
  if (!Array.isArray(d.data)) {
    return { success: false, error: 'Missing feedback array in response' }
  }
  return {
    success: true,
    data: d.data as FeedbackItem[],
    total: typeof d.total === 'number' ? d.total : 0,
    hasMore: typeof d.hasMore === 'boolean' ? d.hasMore : false,
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  operationName: string,
  maxRetries = 3,
  baseDelayMs = 1000,
  timeoutMs = 10000
): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      logInbox('InboxScreen', 'INFO', `${operationName} attempt ${attempt}/${maxRetries}`, {
        endpoint: url.split('?')[0],
      })
      const response = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timeoutId)
      if (!response.ok && response.status >= 500) {
        const body = await response.text().catch(() => 'unknown')
        throw new Error(`Server ${response.status}: ${body}`)
      }
      return response
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const isTimeout = lastError.name === 'AbortError'
      logInbox('InboxScreen', 'WARN', `${operationName} attempt ${attempt} failed`, {
        reason: isTimeout ? 'TIMEOUT' : lastError.message,
        code: isTimeout ? 'ERR_EDGE_TIMEOUT' : 'ERR_NETWORK_RETRY_EXHAUSTED',
      })
      if (attempt < maxRetries) {
        const delay = baseDelayMs * attempt
        logInbox('InboxScreen', 'INFO', `Backing off ${delay}ms`)
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  throw lastError ?? new Error(`${operationName} exhausted all retries`)
}

function classifyError(err: unknown): {
  title: string
  message: string
  code: string
  action: 'RETRY' | 'RELOGIN' | 'SUPPORT' | 'NONE'
} {
  const msg = err instanceof Error ? err.message : String(err)
  if (err instanceof Error && err.name === 'AbortError') {
    return {
      title: 'Connection Timed Out',
      message: "The server didn't respond in time. Please check your connection and try again.",
      code: 'ERR_EDGE_TIMEOUT',
      action: 'RETRY',
    }
  }
  if (msg.includes('Network') || msg.includes('fetch') || msg.includes('Failed to fetch')) {
    return {
      title: 'Connection Issue',
      message: "We can't reach TrustEngine right now. Please check your internet connection.",
      code: 'ERR_NETWORK_RETRY_EXHAUSTED',
      action: 'RETRY',
    }
  }
  if (msg.includes('401') || msg.includes('UNAUTHORIZED') || msg.includes('Invalid token')) {
    return {
      title: 'Session Expired',
      message: 'Your session has expired. Please sign in again.',
      code: 'ERR_AUTH_EXPIRED',
      action: 'RELOGIN',
    }
  }
  if (msg.includes('403') || msg.includes('FORBIDDEN') || msg.includes('TENANT')) {
    return {
      title: 'Access Denied',
      message: 'You do not have access to this business account.',
      code: 'ERR_TENANT_MISMATCH',
      action: 'SUPPORT',
    }
  }
  return {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again.',
    code: 'ERR_UNKNOWN',
    action: 'RETRY',
  }
}

function StarRating({ rating }: { rating: number }) {
  return (
    <View className="flex-row">
      {[1, 2, 3, 4, 5].map((star) => (
        <Text
          key={star}
          className={`text-base ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`}
        >
          ★
        </Text>
      ))}
    </View>
  )
}

function SentimentBadge({ sentiment }: { sentiment?: string }) {
  const styles: Record<string, string> = {
    positive: 'bg-green-100 text-green-800',
    negative: 'bg-red-100 text-red-800',
    neutral: 'bg-yellow-100 text-yellow-800',
  }
  return (
    <View className={`px-2 py-1 rounded-full ${styles[sentiment || ''] || 'bg-gray-100'}`}>
      <Text className={`text-xs font-semibold capitalize ${styles[sentiment || ''] ? '' : 'text-gray-600'}`}>
        {sentiment || '—'}
      </Text>
    </View>
  )
}

function FeedbackDetailModal({
  feedback,
  visible,
  onClose,
}: {
  feedback: FeedbackItem | null
  visible: boolean
  onClose: () => void
}) {
  if (!feedback) return null
  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-white">
        <View className="flex-row items-center justify-between px-6 pt-14 pb-4 border-b border-gray-200">
          <Text className="text-lg font-bold text-gray-900">Feedback Details</Text>
          <TouchableOpacity onPress={onClose} className="p-2">
            <Text className="text-gray-500 text-2xl">✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1 px-6 py-4">
          <View className="flex-row items-center justify-between mb-4">
            <StarRating rating={feedback.rating} />
            <Text className="text-sm text-gray-500">
              {new Date(feedback.created_at).toLocaleDateString()}
            </Text>
          </View>

          <View className="flex-row items-center gap-2 mb-4">
            <View className={`px-3 py-1 rounded-full ${feedback.is_resolved ? 'bg-blue-100' : 'bg-gray-100'}`}>
              <Text className={`text-sm font-medium ${feedback.is_resolved ? 'text-blue-800' : 'text-gray-700'}`}>
                {feedback.is_resolved ? 'Resolved' : 'Open'}
              </Text>
            </View>
            {feedback.ai_analysis && <SentimentBadge sentiment={feedback.ai_analysis.sentiment} />}
          </View>

          <View className="mb-6">
            <Text className="text-sm font-semibold text-gray-700 mb-2">Customer Comment</Text>
            <View className="bg-gray-50 rounded-lg p-4">
              <Text className="text-gray-900 leading-5">
                {feedback.comment || <Text className="text-gray-400 italic">No comment provided</Text>}
              </Text>
            </View>
          </View>

          {feedback.selected_tags && feedback.selected_tags.length > 0 && (
            <View className="mb-6">
              <Text className="text-sm font-semibold text-gray-700 mb-2">Tags</Text>
              <View className="flex-row flex-wrap gap-2">
                {feedback.selected_tags.map((tag) => (
                  <View key={tag} className="bg-blue-50 px-3 py-1 rounded-full">
                    <Text className="text-blue-700 text-sm font-medium">{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {feedback.ai_analysis && (
            <View className="border-t border-gray-200 pt-6 space-y-5">
              <View className="flex-row items-center gap-2 mb-2">
                <Text className="text-purple-600 text-lg">⚡</Text>
                <Text className="text-sm font-bold text-gray-900">AI Analysis</Text>
              </View>

              <View>
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Coaching Advice
                </Text>
                <View className="bg-amber-50 border border-amber-100 rounded-lg p-4">
                  <Text className="text-gray-900 text-sm leading-5">
                    {feedback.ai_analysis.coaching_advice}
                  </Text>
                </View>
              </View>

              <View>
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Suggested Response
                </Text>
                <View className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                  <Text className="text-gray-900 text-sm leading-5">
                    {feedback.ai_analysis.suggested_response}
                  </Text>
                </View>
              </View>

              {feedback.ai_analysis.tags && feedback.ai_analysis.tags.length > 0 && (
                <View>
                  <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    AI Tags
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {feedback.ai_analysis.tags.map((tag) => (
                      <View key={tag} className="bg-purple-50 px-2 py-1 rounded">
                        <Text className="text-purple-700 text-xs font-medium">{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

export function InboxScreen() {
  const { session } = useAuth()
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorState, setErrorState] = useState<{
    title: string
    message: string
    code: string
    action: 'RETRY' | 'RELOGIN' | 'SUPPORT' | 'NONE'
  } | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [pagination, setPagination] = useState<PaginationInfo>({
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false,
  })

  useEffect(() => {
    async function resolveTenant() {
      if (!session) return
      try {
        const response = await fetchWithRetry(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/user_tenants?select=tenant_id&user_id=eq.${session.user.id}&limit=1`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
            },
          },
          'resolveTenant',
          2,
          500,
          8000
        )
        const json = await response.json()
        if (Array.isArray(json) && json.length > 0) {
          setTenantId(json[0].tenant_id)
          logInbox('InboxScreen', 'INFO', 'Tenant resolved', { tenantId: maskId(json[0].tenant_id) })
        } else {
          throw new Error('No tenant membership found')
        }
      } catch (err: unknown) {
        const classified = classifyError(err)
        logInbox('InboxScreen', 'ERROR', 'Failed to resolve tenant', {
          code: classified.code,
          error: err instanceof Error ? err.message : String(err),
        })
        setErrorState(classified)
        setLoading(false)
      }
    }
    resolveTenant()
  }, [session])

  const fetchFeedback = useCallback(
    async (offset = 0, isRefresh = false) => {
      if (!tenantId || !session) return
      if (!isRefresh) setLoading(true)
      setErrorState(null)

      try {
        const params = new URLSearchParams({
          tenant_id: tenantId,
          limit: String(pagination.limit),
          offset: String(offset),
          sort_by: 'created_at',
          sort_order: 'desc',
        })

        const response = await fetchWithRetry(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/get-feedback?${params}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
            },
          },
          'get-feedback'
        )

        const raw = await response.json().catch(() => ({ success: false, error: 'Invalid JSON' }))
        const validated = validateInboxResponse(raw)

        if (!response.ok || !validated.success) {
          throw new Error(validated.error || `HTTP ${response.status}`)
        }

        const newItems = validated.data || []
        setFeedback(prev => (offset === 0 ? newItems : [...prev, ...newItems]))
        setPagination(prev => ({
          total: validated.total ?? 0,
          limit: prev.limit,
          offset,
          hasMore: validated.hasMore ?? false,
        }))

        logInbox('InboxScreen', 'INFO', 'Feedback loaded', {
          count: newItems.length,
          total: validated.total,
          offset,
        })
      } catch (err: unknown) {
        const classified = classifyError(err)
        logInbox('InboxScreen', 'ERROR', 'Failed to load feedback', {
          code: classified.code,
          error: err instanceof Error ? err.message : String(err),
        })
        setErrorState(classified)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [tenantId, session, pagination.limit]
  )

  useEffect(() => {
    if (tenantId) fetchFeedback(0)
  }, [tenantId, fetchFeedback])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchFeedback(0, true)
  }, [fetchFeedback])

  const loadMore = () => {
    if (!pagination.hasMore || loading) return
    fetchFeedback(pagination.offset + pagination.limit)
  }

  const openDetail = (item: FeedbackItem) => {
    setSelectedFeedback(item)
    setModalVisible(true)
    logInbox('InboxScreen', 'INFO', 'Opened feedback detail', { feedbackId: maskId(item.id) })
  }

  const renderItem = ({ item }: { item: FeedbackItem }) => (
    <TouchableOpacity
      onPress={() => openDetail(item)}
      className="bg-white border-b border-gray-100 px-4 py-4"
    >
      <View className="flex-row items-center justify-between mb-2">
        <StarRating rating={item.rating} />
        <Text className="text-xs text-gray-400">
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>

      <Text className="text-gray-900 text-sm leading-5 mb-2" numberOfLines={2}>
        {item.comment || <Text className="text-gray-400 italic">No comment</Text>}
      </Text>

      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          {item.ai_analysis && <SentimentBadge sentiment={item.ai_analysis.sentiment} />}
          {!item.is_resolved && (
            <View className="bg-gray-100 px-2 py-0.5 rounded-full">
              <Text className="text-gray-600 text-xs font-medium">Open</Text>
            </View>
          )}
        </View>
        <View className="flex-row gap-1">
          {(item.selected_tags || []).slice(0, 2).map((tag) => (
            <View key={tag} className="bg-gray-100 px-2 py-0.5 rounded">
              <Text className="text-gray-600 text-xs">{tag}</Text>
            </View>
          ))}
          {(item.selected_tags?.length || 0) > 2 && (
            <Text className="text-gray-400 text-xs self-center">+{item.selected_tags!.length - 2}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )

  if (errorState && feedback.length === 0) {
    return (
      <View className="flex-1 bg-gray-50 justify-center px-8">
        <View className="bg-white rounded-xl border border-red-200 p-6 shadow-sm">
          <Text className="text-red-800 font-bold text-lg text-center">{errorState.title}</Text>
          <Text className="text-red-700 text-sm text-center mt-2 leading-5">{errorState.message}</Text>
          {errorState.action === 'RETRY' && (
            <TouchableOpacity
              onPress={() => fetchFeedback(0)}
              className="mt-4 bg-red-600 rounded-lg py-3 items-center"
            >
              <Text className="text-white font-semibold">Retry</Text>
            </TouchableOpacity>
          )}
          <Text className="text-gray-400 text-xs text-center mt-4 font-mono">{errorState.code}</Text>
        </View>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-gray-900">Feedback Inbox</Text>
        <Text className="text-gray-600 text-sm mt-1">
          {pagination.total > 0 ? `${pagination.total} total reviews` : 'Pull down to refresh'}
        </Text>
      </View>

      <FlatList
        data={feedback}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loading && feedback.length > 0 ? (
            <View className="py-4 items-center">
              <ActivityIndicator color="#2563eb" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !loading && !errorState ? (
            <View className="items-center justify-center py-20 px-8">
              <View className="w-16 h-16 bg-gray-200 rounded-full items-center justify-center mb-4">
                <Text className="text-2xl">📭</Text>
              </View>
              <Text className="text-gray-900 font-semibold text-center">No feedback yet</Text>
              <Text className="text-gray-500 text-sm text-center mt-1 leading-5">
                Generate a QR code and share it with customers to start collecting reviews.
              </Text>
            </View>
          ) : null
        }
      />

      <FeedbackDetailModal
        feedback={selectedFeedback}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </View>
  )
}
