// File: src/app/(auth)/register/page.tsx
// Purpose: Registration page placeholder
// Depends on: lib/supabase/client.ts

'use client';

import { useState } from 'react';
import { supabaseBrowserClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = supabaseBrowserClient;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          business_name: businessName,
        },
      },
    });

    if (error) {
      setError(error.message);
    } else {
      // TODO: Create tenant after registration
      window.location.href = '/dashboard';
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-6 p-6">
        <h1 className="text-2xl font-bold text-center">Create Your TrustEngine Account</h1>
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Business Name</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
              required
              minLength={8}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Get Started'}
          </button>
        </form>
      </div>
    </div>
  );
}
