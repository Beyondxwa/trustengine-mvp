'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { QRCodeSVG } from 'qrcode.react'

type QRSessionData = {
  token: string
  session_id: string
  expires_at: string
  qr_url: string
}

export default function QRPage() {
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [session, setSession] = useState<QRSessionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const [copied, setCopied] = useState(false)

  const supabase = createClient()

  // Fetch tenant
  useEffect(() => {
    async function getTenant() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Not logged in')
        return
      }
      const { data } = await supabase
        .from('user_tenants')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single()
      if (data?.tenant_id) setTenantId(data.tenant_id)
      else setError('No business tenant found')
    }
    getTenant()
  }, [])

  // Countdown timer
  useEffect(() => {
    if (!session) return
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000))
      setTimeLeft(diff)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [session])

  const generateQR = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setError(null)
    setSession(null)

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      if (!authSession) throw new Error('Not authenticated')

      // 10-second timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-qr-session`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authSession.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        }
      )
      clearTimeout(timeoutId)

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Server error ${res.status}`)
      }
      const result = await res.json()
      if (!result.success) throw new Error(result.error || 'Failed')
      setSession(result.data)
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Request timed out. Click Retry.')
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  const copyUrl = () => {
    if (!session) return
    navigator.clipboard.writeText(session.qr_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">QR Codes</h1>
        <p className="text-gray-600 mt-1">Generate one-time scannable QR codes for your customers.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm font-medium">{error}</p>
          {error.includes('timed out') && (
            <button onClick={generateQR} className="mt-2 text-red-700 text-sm font-semibold underline">
              Retry Now
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Generate New QR Code</h2>
          <p className="text-sm text-gray-600 mb-6">Creates a secure code that expires in 15 minutes.</p>
          <button
            onClick={generateQR}
            disabled={loading || !tenantId}
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-medium disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Generating...
              </>
            ) : (
              'Generate QR Code'
            )}
          </button>
        </div>

        {session && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Active QR Code</h2>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${timeLeft > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {timeLeft > 0 ? `Expires in ${fmt(timeLeft)}` : 'Expired'}
              </span>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex justify-center">
                <div className="flex items-center justify-center bg-white p-4 rounded-xl border-2 border-gray-100 shadow-inner max-w-[250px] max-h-[250px] w-full">
                  <QRCodeSVG value={session.qr_url} size={220} level="M" className="max-w-[250px] max-h-[250px] w-full h-auto" />
                </div>
              </div>
              <div className="mt-6 w-full space-y-3">
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-4 py-3">
                  <code className="text-xs text-gray-600 truncate flex-1 font-mono">{session.qr_url}</code>
                  <button onClick={copyUrl} className="shrink-0 px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50">
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!session && !loading && (
          <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 p-6 flex flex-col items-center justify-center text-center">
            <h3 className="text-gray-900 font-medium">No active QR code</h3>
            <p className="text-gray-500 text-sm mt-1">Click Generate to create one.</p>
          </div>
        )}
      </div>
    </div>
  )
}

