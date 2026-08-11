// File: src/app/(review)/[tenantSlug]/review/page.tsx
// Purpose: Customer review flow page — star-first routing to Google or inbox
// Depends on: components/review/review-form.tsx, lib/supabase/server.ts

import { ReviewForm } from '@/components/review/review-form';
import { createClient } from '@/lib/supabase/server';

const PLACEHOLDER_GOOGLE_URL =
  'https://search.google.com/local/writereview?placeid=YOUR_PLACE_ID';

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { tenantSlug } = await params;
  const { token } = await searchParams;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .rpc('get_tenant_review_profile', { p_slug: tenantSlug })
    .maybeSingle();

  const googleReviewUrl =
    (profile as { google_review_url?: string | null } | null)?.google_review_url ||
    PLACEHOLDER_GOOGLE_URL;
  const tenantName = (profile as { name?: string | null } | null)?.name || undefined;

  return (
    <ReviewForm
      tenantSlug={tenantSlug}
      token={token}
      googleReviewUrl={googleReviewUrl}
      tenantName={tenantName}
    />
  );
}
