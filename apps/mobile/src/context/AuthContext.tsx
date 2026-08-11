import React, { createContext, useContext, useEffect, useState } from 'react'
import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('[TRUSTENGINE] [AuthContext] [ERROR] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY')
}

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

function maskId(id: string): string {
  if (!id || id.length < 8) return '***'
  return `${id.slice(0, 4)}***${id.slice(-4)}`
}

function logAuth(
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

async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries = 3,
  baseDelayMs = 800
): Promise<T> {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation()
      if (attempt > 1) {
        logAuth('AuthRetry', 'INFO', `${operationName} recovered on attempt ${attempt}`)
      }
      return result
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      logAuth('AuthRetry', 'WARN', `${operationName} attempt ${attempt} failed`, {
        error: lastError.message,
        code: 'ERR_NETWORK_RETRY_EXHAUSTED',
      })
      if (attempt < maxRetries) {
        const delay = baseDelayMs * attempt
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  throw lastError ?? new Error(`${operationName} failed after ${maxRetries} attempts`)
}

type AuthContextType = {
  user: User | null
  session: Session | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<{ error: string | null; code?: string }>
  signUp: (email: string, password: string, metadata?: object) => Promise<{ error: string | null; code?: string }>
  signOut: () => Promise<void>
  supabase: SupabaseClient
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    logAuth('AuthContext', 'INFO', 'Initializing session recovery')
    supabase.auth.getSession().then(({ data: { session }, error: err }) => {
      if (err) {
        logAuth('AuthContext', 'ERROR', 'Session recovery failed', {
          error: err.message,
          code: 'ERR_AUTH_EXPIRED',
        })
        setError('Your session could not be restored. Please sign in again.')
      } else {
        logAuth('AuthContext', 'INFO', 'Session recovered', {
          userId: session?.user ? maskId(session.user.id) : null,
        })
      }
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      logAuth('AuthContext', 'INFO', `Auth state changed`, {
        event,
        userId: session?.user ? maskId(session.user.id) : null,
      })
      setSession(session)
      setUser(session?.user ?? null)
      if (event === 'SIGNED_OUT') setError(null)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    setError(null)
    logAuth('AuthContext', 'INFO', 'Sign-in attempt', { email: email.split('@')[0] + '***' })
    try {
      const { error } = await withRetry(
        () => supabase.auth.signInWithPassword({ email, password }),
        'signIn'
      )
      if (error) {
        logAuth('AuthContext', 'WARN', 'Sign-in rejected', { message: error.message })
        return {
          error: 'The email or password you entered is incorrect. Please try again.',
          code: 'ERR_AUTH_EXPIRED',
        }
      }
      logAuth('AuthContext', 'INFO', 'Sign-in successful')
      return { error: null }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      logAuth('AuthContext', 'ERROR', 'Sign-in network failure after retries', { message: msg })
      return {
        error: "We can't reach TrustEngine right now. Please check your connection and try again.",
        code: 'ERR_EDGE_TIMEOUT',
      }
    }
  }

  const signUp = async (email: string, password: string, metadata?: object) => {
    setError(null)
    logAuth('AuthContext', 'INFO', 'Sign-up attempt', { email: email.split('@')[0] + '***' })
    try {
      const { error } = await withRetry(
        () => supabase.auth.signUp({ email, password, options: { data: metadata } }),
        'signUp'
      )
      if (error) {
        logAuth('AuthContext', 'WARN', 'Sign-up rejected', { message: error.message })
        return { error: error.message, code: 'ERR_AUTH_EXPIRED' }
      }
      logAuth('AuthContext', 'INFO', 'Sign-up initiated — confirmation email sent')
      return { error: null }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      logAuth('AuthContext', 'ERROR', 'Sign-up network failure after retries', { message: msg })
      return {
        error: "We're having trouble connecting. Please check your network and try again.",
        code: 'ERR_EDGE_TIMEOUT',
      }
    }
  }

  const signOut = async () => {
    logAuth('AuthContext', 'INFO', 'Signing out')
    await supabase.auth.signOut()
    logAuth('AuthContext', 'INFO', 'Sign-out complete')
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, error, signIn, signUp, signOut, supabase }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
