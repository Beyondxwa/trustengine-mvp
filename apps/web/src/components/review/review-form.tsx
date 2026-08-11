'use client';

// File: src/components/review/review-form.tsx
// Purpose: Star-first review routing — 4-5 → Google, 1-3 → internal feedback
// Depends on: lucide-react, Next.js search params via props

import { FormEvent, useState } from 'react';
import { Star } from 'lucide-react';

type ReviewFormProps = {
  tenantSlug: string;
  token?: string;
  googleReviewUrl: string;
  tenantName?: string;
};

const PLACEHOLDER_GOOGLE_URL =
  'https://search.google.com/local/writereview?placeid=YOUR_PLACE_ID';

export function ReviewForm({
  tenantSlug,
  token,
  googleReviewUrl,
  tenantName,
}: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const displayRating = hoverRating || rating;
  const displayName = tenantName || tenantSlug.replace(/-/g, ' ');
  const externalUrl = googleReviewUrl || PLACEHOLDER_GOOGLE_URL;

  async function markRedirected() {
    if (!token) return;
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-qr-session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          },
          body: JSON.stringify({ token, status: 'redirected' }),
        }
      );
    } catch {
      // Non-blocking: still send the customer to Google
    }
  }

  async function handleLeaveGoogleReview() {
    setRedirecting(true);
    setError(null);
    await markRedirected();
    window.location.href = externalUrl;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Missing review token. Please scan the QR code again.');
      return;
    }
    if (rating < 1 || rating > 3) {
      setError('Please select a star rating.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/submit-feedback`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          },
          body: JSON.stringify({
            token,
            rating,
            comment: comment.trim() || undefined,
            customer_email: customerEmail.trim() || undefined,
            customer_phone: customerPhone.trim() || undefined,
            customer_name: customerName.trim() || undefined,
          }),
        }
      );

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to submit feedback');
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-white p-6">
        <div className="w-full max-w-md text-center">
          <h1 className="text-3xl font-bold text-slate-900">
            Thank you, we&apos;ll improve.
          </h1>
          <p className="mt-2 text-slate-600">
            Your feedback for {displayName} has been received.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-white p-6">
      <div className="w-full max-w-md">
        <h1 className="text-center text-3xl font-bold text-slate-900">
          How was your experience?
        </h1>
        <p className="mt-2 text-center capitalize text-slate-500">{displayName}</p>

        <div
          className="mt-10 flex items-center justify-center gap-3"
          onMouseLeave={() => setHoverRating(0)}
          role="radiogroup"
          aria-label="Star rating"
        >
          {[1, 2, 3, 4, 5].map((star) => {
            const active = star <= displayRating;
            return (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={rating === star}
                aria-label={`${star} star${star === 1 ? '' : 's'}`}
                onClick={() => {
                  setRating(star);
                  setError(null);
                  setSubmitted(false);
                }}
                onMouseEnter={() => setHoverRating(star)}
                className="rounded p-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Star
                  className={`h-14 w-14 sm:h-16 sm:w-16 ${
                    active
                      ? 'fill-amber-400 text-amber-400'
                      : 'fill-transparent text-slate-300'
                  }`}
                />
              </button>
            );
          })}
        </div>

        {rating >= 4 && (
          <div className="mt-10 text-center">
            <p className="text-lg font-medium text-slate-900">
              Thank you! Leave us a public review.
            </p>
            <button
              type="button"
              onClick={handleLeaveGoogleReview}
              disabled={redirecting}
              className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {redirecting ? 'Redirecting...' : 'Leave Review on Google'}
            </button>
          </div>
        )}

        {rating >= 1 && rating <= 3 && (
          <form onSubmit={handleSubmit} className="mt-10 space-y-5" noValidate>
            <div>
              <label
                htmlFor="comment"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Comments
              </label>
              <textarea
                id="comment"
                name="comment"
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us what we can improve..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label
                htmlFor="customerName"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Name
              </label>
              <input
                id="customerName"
                name="customerName"
                type="text"
                autoComplete="name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label
                htmlFor="customerEmail"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Email
              </label>
              <input
                id="customerEmail"
                name="customerEmail"
                type="email"
                autoComplete="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label
                htmlFor="customerPhone"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Phone
              </label>
              <input
                id="customerPhone"
                name="customerPhone"
                type="tel"
                autoComplete="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {error && (
              <p
                className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                role="alert"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit feedback'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
