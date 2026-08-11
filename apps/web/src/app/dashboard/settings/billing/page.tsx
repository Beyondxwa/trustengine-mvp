'use client'

import { useState, useEffect } from 'react'
import { supabaseBrowserClient } from '@/lib/supabase/client'

type Plan = {
  id: string
  name: string
  price: string
  description: string
  features: string[]
  cta: string
  priceIdEnv: string
}

const PLANS: Plan[] = [
  {
    id: 'hook',
    name: 'Hook',
    price: 'Free',
    description: 'For solo operators just getting started.',
    features: ['5 QR codes/hour', 'Basic feedback inbox', 'Email support'],
    cta: 'Current Plan',
    priceIdEnv: '',
  },
  {
    id: 'solo',
    name: 'Solo',
    price: '$19/mo',
    description: 'For individual business owners.',
    features: ['20 QR codes/hour', 'AI coaching', 'All review platforms', 'Priority support'],
    cta: 'Upgrade to Solo',
    priceIdEnv: 'STRIPE_PRICE_SOLO',
  },
  {
    id: 'team',
    name: 'Team',
    price: '$49/mo',
    description: 'For small teams up to 5 members.',
    features: ['50 QR codes/hour', 'Team management', 'Advanced analytics', 'API access'],
    cta: 'Upgrade to Team',
    priceIdEnv: 'STRIPE_PRICE_TEAM',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$149/mo',
    description: 'For multi-location businesses.',
    features: ['200 QR codes/hour', 'Unlimited staff', 'White-label options', 'Dedicated support'],
    cta: 'Contact Sales',
    priceIdEnv: 'STRIPE_PRICE_ENTERPRISE',
  },
]

export default function BillingPage() {
  const [currentPlan, setCurrentPlan] = useState('hook')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const supabase = supabaseBrowserClient

  useEffect(() => {
    async function getPlan() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('user_tenants')
        .select('tenants(plan_type)')
        .eq('user_id', user.id)
        .single()
      const tenants = data?.tenants as { plan_type?: string } | { plan_type?: string }[] | null
      const planType = Array.isArray(tenants) ? tenants[0]?.plan_type : tenants?.plan_type
      if (planType) {
        setCurrentPlan(planType)
      }
    }
    getPlan()
  }, [])

  async function handleUpgrade(planId: string) {
    if (planId === 'hook') return
    setLoading(planId)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const origin = window.location.origin
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            plan_type: planId,
            success_url: `${origin}/dashboard/settings/billing?success=true`,
            cancel_url: `${origin}/dashboard/settings/billing?canceled=true`,
          }),
        }
      )

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Checkout failed')
      }

      window.location.href = result.data.checkout_url
    } catch (err: any) {
      setError(err.message)
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing & Plans</h1>
        <p className="text-gray-600 mt-1">Manage your subscription and upgrade anytime.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id
          const isLoading = loading === plan.id

          return (
            <div
              key={plan.id}
              className={`rounded-xl border p-6 flex flex-col ${
                isCurrent
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
              <p className="text-2xl font-bold text-gray-900 mt-2">{plan.price}</p>
              <p className="text-sm text-gray-600 mt-1">{plan.description}</p>

              <ul className="mt-4 space-y-2 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-green-500 mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={isCurrent || isLoading || !plan.priceIdEnv}
                className={`mt-6 w-full py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                  isCurrent
                    ? 'bg-blue-600 text-white cursor-default'
                    : 'bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                {isLoading ? 'Redirecting...' : isCurrent ? 'Current Plan' : plan.cta}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
