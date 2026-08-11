// ============================================
// TrustEngine Database Types
// Auto-generated from schema: 00000000000000_initial_schema.sql
// ============================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ============================================
// ENUM TYPES
// ============================================

export type PlanType = 'hook' | 'solo' | 'team' | 'enterprise';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';
export type UserRole = 'owner' | 'manager' | 'staff' | 'admin';
export type QRStatus = 'active' | 'used' | 'expired' | 'revoked';
export type ResolutionType = 'ai_coached' | 'staff_fixed' | 'refunded' | 'escalated' | 'none';
export type ReviewPlatform = 'google' | 'yelp' | 'facebook' | 'none';
export type NotificationType = 'new_feedback' | 'negative_alert' | 'weekly_pulse' | 'system';
export type InviteStatus = 'pending' | 'accepted' | 'expired';
export type Sentiment = 'positive' | 'neutral' | 'negative';
export type DevicePlatform = 'ios' | 'android';
export type WebhookProvider = 'stripe' | 'twilio' | 'revenuecat' | 'anthropic';
export type WebhookStatus = 'pending' | 'processed' | 'failed';
export type SubscriptionEventType = 'created' | 'updated' | 'canceled' | 'payment_failed' | 'payment_succeeded';

// ============================================
// TABLE ROW TYPES
// ============================================

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  plan_type: PlanType;
  subscription_status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  google_review_url: string | null;
  review_count_monthly: number;
  review_limit_monthly: number;
  max_devices: number;
  settings: Json;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  notification_prefs: {
    push: boolean;
    sms: boolean;
    email: boolean;
  };
  created_at: string;
  updated_at: string;
}

export interface UserTenant {
  id: string;
  user_id: string;
  tenant_id: string;
  role: UserRole;
  invited_by: string | null;
  invited_at: string;
  accepted_at: string | null;
}

export interface ReviewPlatformRow {
  id: string;
  tenant_id: string;
  platform: 'google' | 'yelp' | 'facebook';
  url: string;
  is_primary: boolean;
  created_at: string;
}

export interface QRSession {
  id: string;
  tenant_id: string;
  token: string;
  session_id: string;
  expires_at: string;
  is_used: boolean;
  used_at: string | null;
  status: string | null;
  created_at: string;
}

export interface FeedbackSubmission {
  id: string;
  tenant_id: string;
  qr_session_id: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  rating: number;
  selected_tags: string[];
  comment: string | null;
  nps_score: number | null;
  is_resolved: boolean;
  resolution_type: ResolutionType | null;
  review_platform: ReviewPlatform | null;
  review_url: string | null;
  ai_analysis: Json | null;
  staff_notes: string | null;
  on_site_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface AIAnalysis {
  id: string;
  feedback_id: string;
  tenant_id: string;
  sentiment: Sentiment | null;
  coaching_advice: string | null;
  suggested_response: string | null;
  tags: Json;
  cost_usd: number | null;
  model_used: string | null;
  created_at: string;
}

export interface StaffInvite {
  id: string;
  tenant_id: string;
  invited_by: string;
  email: string;
  role: 'staff' | 'manager';
  token: string;
  status: InviteStatus;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  tenant_id: string;
  user_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  data: Json;
  is_read: boolean;
  sent_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_data: Json | null;
  new_data: Json | null;
  ip_address: string | null;
  created_at: string;
}

export interface SuppressionEntry {
  id: string;
  phone_hash: string;
  phone_last4: string | null;
  reason: string;
  created_at: string;
}

export interface FeatureFlag {
  id: string;
  tenant_id: string;
  flag_name: string;
  is_enabled: boolean;
  config: Json;
}

export interface DeviceRegistration {
  id: string;
  user_id: string;
  tenant_id: string;
  platform: DevicePlatform;
  push_token: string;
  device_id: string | null;
  is_active: boolean;
  last_used_at: string;
  created_at: string;
}

export interface WeeklyPulse {
  id: string;
  tenant_id: string;
  week_start: string;
  week_end: string;
  total_feedback: number;
  avg_rating: number | null;
  positive_count: number;
  negative_count: number;
  nps_score: number | null;
  top_tags: Json;
  ai_summary: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface WebhookEvent {
  id: string;
  provider: WebhookProvider;
  event_type: string;
  payload: Json;
  status: WebhookStatus;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface SubscriptionHistory {
  id: string;
  tenant_id: string;
  event_type: SubscriptionEventType;
  plan_type: PlanType | null;
  amount_usd: number | null;
  stripe_event_id: string | null;
  metadata: Json;
  created_at: string;
}

// ============================================
// INSERT TYPES (for creating new rows)
// ============================================

export type TenantInsert = Omit<Tenant, 'id' | 'created_at' | 'updated_at'>;
export type UserProfileInsert = Omit<UserProfile, 'created_at' | 'updated_at'>;
export type UserTenantInsert = Omit<UserTenant, 'id' | 'invited_at'>;
export type ReviewPlatformInsert = Omit<ReviewPlatformRow, 'id' | 'created_at'>;
export type QRSessionInsert = Omit<QRSession, 'id' | 'created_at' | 'used_at'>;
export type FeedbackSubmissionInsert = Omit<FeedbackSubmission, 'id' | 'created_at' | 'updated_at'>;
export type AIAnalysisInsert = Omit<AIAnalysis, 'id' | 'created_at'>;
export type StaffInviteInsert = Omit<StaffInvite, 'id' | 'token' | 'created_at'>;
export type NotificationInsert = Omit<Notification, 'id' | 'created_at' | 'sent_at'>;
export type AuditLogInsert = Omit<AuditLog, 'id' | 'created_at'>;
export type SuppressionEntryInsert = Omit<SuppressionEntry, 'id' | 'created_at'>;
export type FeatureFlagInsert = Omit<FeatureFlag, 'id'>;
export type DeviceRegistrationInsert = Omit<DeviceRegistration, 'id' | 'last_used_at' | 'created_at'>;
export type WeeklyPulseInsert = Omit<WeeklyPulse, 'id' | 'created_at' | 'sent_at'>;
export type WebhookEventInsert = Omit<WebhookEvent, 'id' | 'processed_at' | 'created_at'>;
export type SubscriptionHistoryInsert = Omit<SubscriptionHistory, 'id' | 'created_at'>;

// ============================================
// UPDATE TYPES (for partial updates)
// ============================================

export type TenantUpdate = Partial<Omit<Tenant, 'id' | 'created_at'>>;
export type FeedbackSubmissionUpdate = Partial<Omit<FeedbackSubmission, 'id' | 'created_at'>>;
export type UserProfileUpdate = Partial<Omit<UserProfile, 'user_id' | 'created_at'>>;

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ============================================
// HELPER TYPES FOR EDGE FUNCTIONS
// ============================================

export interface QRTokenPayload {
  session_id: string;
  tenant_id: string;
  iat: number;
  exp: number;
}

export interface FeedbackWithAnalysis extends FeedbackSubmission {
  ai_analysis?: AIAnalysis | null;
}

export interface DashboardStats {
  totalFeedback: number;
  avgRating: number;
  positiveCount: number;
  negativeCount: number;
  unresolvedCount: number;
  npsScore: number | null;
}

export interface TeamMember extends UserTenant {
  profile: UserProfile | null;
}

// Re-export everything from index.ts
// File: packages/shared/src/index.ts should re-export these
