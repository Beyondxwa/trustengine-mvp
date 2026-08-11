-- ============================================
-- increment_review_count RPC
-- Atomically bumps a tenant's monthly review counter.
-- Called from the submit-feedback Edge Function after
-- a feedback submission is successfully recorded.
-- ============================================
CREATE OR REPLACE FUNCTION increment_review_count(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE tenants
  SET review_count_monthly = review_count_monthly + 1
  WHERE id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_review_count(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION increment_review_count(UUID) TO authenticated;
