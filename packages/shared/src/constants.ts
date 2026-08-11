// TrustEngine Constants
// Shared across web, mobile, and backend

export const APP_NAME = 'TrustEngine';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://trustengine-mvp-8vxb.vercel.app';
export const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://trustengine-mvp-8vxb.vercel.app';

// Plan Limits
export const PLAN_LIMITS = {
  hook: {
    name: 'Hook',
    priceMonthly: 0,
    priceAnnual: 0,
    maxDevices: 1,
    reviewLimitMonthly: 3,
    features: ['basic_qr', 'basic_emojis', 'web_dashboard']
  },
  solo: {
    name: 'Solo',
    priceMonthly: 14.99,
    priceAnnual: 149.99,
    maxDevices: 1,
    reviewLimitMonthly: Infinity,
    features: ['ai_coach', 'sms_safety_net', 'premium_themes', 'unlimited_reviews']
  },
  team: {
    name: 'Team',
    priceMonthly: 49,
    priceAnnual: 499,
    maxDevices: 11, // 1 owner + 10 staff
    reviewLimitMonthly: Infinity,
    features: ['employee_leaderboard', 'team_analytics', 'auto_reactivation', 'all_solo_features']
  },
  enterprise: {
    name: 'Enterprise',
    priceMonthly: 299,
    priceAnnual: null,
    maxDevices: 500,
    reviewLimitMonthly: Infinity,
    features: ['white_label', 'api_access', 'dedicated_am', 'all_team_features']
  }
} as const;

// QR Code Settings
export const QR_EXPIRY_MINUTES = 15;
export const QR_MAX_GENERATIONS_PER_HOUR = 100;

// Rate Limits
export const RATE_LIMITS = {
  qrGeneration: { windowMs: 60 * 60 * 1000, max: 100 }, // per tenant per hour
  inviteStaff: { windowMs: 24 * 60 * 60 * 1000, max: 20 }, // per tenant per day
  feedbackSubmission: { windowMs: 60 * 1000, max: 10 }, // per IP per minute
  aiProcessing: { windowMs: 60 * 1000, max: 10 } // per tenant per minute
} as const;

// AI Settings
export const AI_CONFIG = {
  model: 'claude-3-5-sonnet-20241022',
  maxTokens: 512,
  temperature: 0.3,
  costCapMonthly: 500,
  costAlertThreshold: 400,
  costHardStop: 600,
  queueBatchSize: 10,
  queueIntervalMinutes: 2
} as const;

// SMS Settings
export const SMS_CONFIG = {
  quietHoursStart: 21, // 9 PM
  quietHoursEnd: 9,    // 9 AM
  maxPerTenantPerDay: 50,
  maxPerFeedback: 1,
  followUpDelayHours: 24,
  maxFollowUpAgeDays: 7
} as const;

// Feature Flags
export const FEATURE_FLAGS = {
  enableWeeklyPulse: true,
  enableAutoReactivation: false, // P3
  enableGeoFencing: false,       // P2
  enableNFCPucks: false,         // P4
  enableWhiteLabel: false,       // Enterprise only
  enableAPIAccess: false         // Enterprise only
} as const;
