import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  Clipboard,
  ScrollView,
} from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { useAuth } from '../context/AuthContext'

// ── Structured Logger (Master Architecture Compliant) ──
function logQR(
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

// ── Response Shape Validator ──
// create-qr-session returns a flat shape: { session_id, token, expires_at, qr_url }
// on success, or { error } on failure — no success/data wrapper.
function validateQRResponse(data: unknown): { success: boolean; data?: QRSession; error?: string } {
  if (typeof data !== 'object' || data === null) {
    return { success: false, error: 'Invalid response shape from server' }
  }
  const d = data as Record<string, unknown>
  if (typeof d.error === 'string') {
    return { success: false, error: d.error }
  }
  if (
    typeof d.token !== 'string' ||
    typeof d.session_id !== 'string' ||
    typeof d.expires_at !== 'string' ||
    typeof d.qr_url !== 'string'
  ) {
    return { success: false, error: 'Malformed QR session data' }
  }
  return {
    success: true,
    data: {
      token: d.token,
      session_id: d.session_id,
      expires_at: d.expires_at,
      qr_url: d.qr_url,
    },
  }
}

// ── Enterprise Retry + 10s Circuit Breaker ──
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

      logQR('QRScreen', 'INFO', `${operationName} attempt ${attempt}/${maxRetries}`, {
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
      logQR('QRScreen', 'WARN', `${operationName} attempt ${attempt} failed`, {
        reason: isTimeout ? 'TIMEOUT' : lastError.message,
        code: isTimeout ? 'ERR_EDGE_TIMEOUT' : 'ERR_NETWORK_RETRY_EXHAUSTED',
      })

      if (attempt < maxRetries) {
        const delay = baseDelayMs * attempt
        logQR('QRScreen', 'INFO', `Backing off ${delay}ms`)
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }

  throw lastError ?? new Error(`${operationName} exhausted all retries`)
}

// ── Error Classifier (User-Friendly + Diagnostic Codes) ──
function classifyError(err: unknown): {
  title: string
  message: string
  code: string
  action: 'RETRY' | 'RELOGIN' | 'SUPPORT' | 'UPGRADE' | 'NONE'
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
  if (msg.includes('429') || msg.includes('RATE_LIMIT')) {
    return {
      title: 'Rate Limit Reached',
      message: "You've generated too many QR codes for your plan. Please wait or upgrade.",
      code: 'ERR_RATE_LIMIT',
      action: 'UPGRADE',
    }
  }
  if (msg.includes('401') || msg.includes('UNAUTHORIZED') || msg.includes('Invalid token')) {
    return {
      title: 'Session Expired',
      message: 'Your session has expired. Please sign in again to continue.',
      code: 'ERR_AUTH_EXPIRED',
      action: 'RELOGIN',
    }
  }
  if (msg.includes('403') || msg.includes('NO_TENANT') || msg.includes('FORBIDDEN')) {
    return {
      title: 'Account Access Denied',
      message: 'We could not verify your business account. Please contact support.',
      code: 'ERR_TENANT_MISMATCH',
      action: 'SUPPORT',
    }
  }
  return {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again. If this persists, contact support.',
    code: 'ERR_UNKNOWN',
    action: 'RETRY',
  }
}

type QRSession = {
  token: string
  session_id: string
  expires_at: string
  qr_url: string
}

export function QRScreen() {
  const { session } = useAuth()
  const [qrSession, setQrSession] = useState<QRSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [errorState, setErrorState] = useState<{
    title: string
    message: string
    code: string
    action: 'RETRY' | 'RELOGIN' | 'SUPPORT' | 'UPGRADE' | 'NONE'
  } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!qrSession) return
    const tick = () => {
      const expires = new Date(qrSession.expires_at).getTime()
      const diff = Math.max(0, Math.floor((expires - Date.now()) / 1000))
      setTimeLeft(diff)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [qrSession])

  const generateQR = useCallback(async () => {
    if (!session) {
      Alert.alert('Not Signed In', 'Please sign in to generate QR codes.')
      return
    }

    setLoading(true)
    setErrorState(null)
    setQrSession(null)

    logQR('QRScreen', 'INFO', 'Starting QR generation', {
      userId: maskId(session.user.id),
    })

    try {
      const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-qr-session`
      const response = await fetchWithRetry(
        url,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
            'Content-Type': 'application/json',
          },
        },
        'create-qr-session'
      )

      const raw = await response.json().catch(() => ({ success: false, error: 'Invalid JSON response' }))
      const validated = validateQRResponse(raw)

      if (!response.ok || !validated.success) {
        const serverMsg = validated.error || `HTTP ${response.status}`
        logQR('QRScreen', 'ERROR', 'Edge Function returned error', {
          status: response.status,
          message: serverMsg,
        })
        throw new Error(serverMsg)
      }

      logQR('QRScreen', 'INFO', 'QR session created', {
        sessionId: maskId(validated.data!.session_id),
      })
      setQrSession(validated.data!)
    } catch (err: unknown) {
      const classified = classifyError(err)
      logQR('QRScreen', 'ERROR', 'Final failure after retries', {
        originalError: err instanceof Error ? err.message : String(err),
        code: classified.code,
      })
      setErrorState(classified)
    } finally {
      setLoading(false)
    }
  }, [session])

  const shareQR = async () => {
    if (!qrSession) return
    try {
      await Share.share({ message: `Leave us a review: ${qrSession.qr_url}` })
      logQR('QRScreen', 'INFO', 'User shared QR URL')
    } catch {
      // User cancelled — no-op
    }
  }

  const copyToClipboard = () => {
    if (!qrSession) return
    Clipboard.setString(qrSession.qr_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    logQR('QRScreen', 'INFO', 'URL copied to clipboard')
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const isExpired = timeLeft === 0 && qrSession !== null

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="p-6 space-y-6">
        <View>
          <Text className="text-2xl font-bold text-gray-900">Generate QR Code</Text>
          <Text className="text-gray-600 mt-1">Create a scannable code for your customers.</Text>
        </View>

        {errorState && (
          <View className="bg-red-50 border border-red-200 rounded-xl p-4">
            <Text className="text-red-800 font-semibold">{errorState.title}</Text>
            <Text className="text-red-700 text-sm mt-1 leading-5">{errorState.message}</Text>
            {errorState.action === 'RETRY' && (
              <TouchableOpacity onPress={generateQR} className="mt-3 self-start">
                <Text className="text-red-700 font-semibold text-sm underline">Tap to retry</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <TouchableOpacity
          onPress={generateQR}
          disabled={loading}
          className={`w-full rounded-xl py-4 items-center ${loading ? 'bg-blue-400' : 'bg-blue-600'}`}
        >
          {loading ? (
            <View className="flex-row items-center">
              <ActivityIndicator color="white" />
              <Text className="text-white font-semibold text-base ml-2">Generating...</Text>
            </View>
          ) : (
            <Text className="text-white font-semibold text-base">Generate New QR Code</Text>
          )}
        </TouchableOpacity>

        {qrSession && !isExpired && (
          <View className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-semibold text-gray-900">Active QR Code</Text>
              <View className="bg-green-100 px-3 py-1 rounded-full">
                <Text className="text-green-800 text-xs font-semibold">
                  Expires in {formatTime(timeLeft)}
                </Text>
              </View>
            </View>

            <View className="items-center py-4">
              <View className="bg-white p-4 rounded-xl border-2 border-gray-100">
                <QRCode value={qrSession.qr_url} size={200} />
              </View>
            </View>

            <View className="space-y-3">
              <TouchableOpacity
                onPress={shareQR}
                className="w-full bg-gray-900 rounded-lg py-3 items-center"
              >
                <Text className="text-white font-semibold">Share Link</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={copyToClipboard}
                className="w-full bg-white border border-gray-300 rounded-lg py-3 items-center"
              >
                <Text className="text-gray-900 font-semibold">
                  {copied ? 'Copied!' : 'Copy URL'}
                </Text>
              </TouchableOpacity>
            </View>

            <View className="mt-4 pt-4 border-t border-gray-100">
              <Text className="text-xs text-gray-500 font-mono">
                Session: {maskId(qrSession.session_id)}
              </Text>
            </View>
          </View>
        )}

        {isExpired && (
          <View className="bg-amber-50 border border-amber-200 rounded-xl p-6 items-center">
            <Text className="text-amber-800 font-semibold text-lg">This QR code has expired</Text>
            <Text className="text-amber-700 text-sm mt-1 text-center">
              Generate a new one to continue collecting feedback.
            </Text>
            <TouchableOpacity onPress={generateQR} className="mt-4">
              <Text className="text-amber-800 font-semibold underline">Generate New Code</Text>
            </TouchableOpacity>
          </View>
        )}

        {!qrSession && !loading && !errorState && (
          <View className="bg-white rounded-xl border border-dashed border-gray-300 p-8 items-center">
            <View className="w-16 h-16 bg-gray-100 rounded-full items-center justify-center mb-3">
              <Text className="text-2xl">📷</Text>
            </View>
            <Text className="text-gray-900 font-semibold text-center">No Active QR Code</Text>
            <Text className="text-gray-500 text-sm text-center mt-1 leading-5">
              Tap the button above to create a secure, one-time QR code for your customers.
            </Text>
            <Text className="text-gray-400 text-xs text-center mt-4">
              Codes expire after 15 minutes for security.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  )
}
