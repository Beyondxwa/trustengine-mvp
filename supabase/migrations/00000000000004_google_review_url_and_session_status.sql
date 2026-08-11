-- Add Google review URL on tenants + redirected status on qr_sessions

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS google_review_url TEXT;

ALTER TABLE qr_sessions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

UPDATE tenants
SET google_review_url = 'https://search.google.com/local/writereview?placeid=YOUR_PLACE_ID'
WHERE slug = 'beyondx-llc'
  AND (google_review_url IS NULL OR google_review_url = '');

-- Public-safe lookup for review landing page (no billing fields)
CREATE OR REPLACE FUNCTION public.get_tenant_review_profile(p_slug text)
RETURNS TABLE (
  slug text,
  name text,
  logo_url text,
  primary_color text,
  secondary_color text,
  google_review_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.slug,
    t.name,
    t.logo_url,
    t.primary_color,
    t.secondary_color,
    t.google_review_url
  FROM tenants t
  WHERE t.slug = p_slug
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_review_profile(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
