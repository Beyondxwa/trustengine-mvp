"use client";

import { useState } from "react";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const supabase = supabaseBrowserClient;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          business_name: businessName,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setMessage("Check your email for a confirmation link!");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg">
        <div style={{padding: '10px', background: '#fee', color: '#900', fontSize: '12px', wordBreak: 'break-all'}}>
          DEBUG SUPABASE URL: {typeof window !== 'undefined' ? 'https://glpemdsqzcawrlnryppn.supabase.co' : 'SSR'}
          <br/>
          DEBUG KEY LENGTH: {typeof window !== 'undefined' ? 200 : 0}
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">TrustEngine</h1>
          <p className="mt-2 text-gray-600">Create your account</p>
        </div>

        <form onSubmit={handleSignup} className="mt-8 space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
              {message}
            </div>
          )}

          <div>
            <label htmlFor="business" className="block text-sm font-medium text-gray-700">
              Business name
            </label>
            <input
              id="business"
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Mike's Auto Detail"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@business.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
            <p className="mt-1 text-xs text-gray-500">Must be at least 8 characters</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link href="/auth/login" className="font-medium text-blue-600 hover:text-blue-500">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
