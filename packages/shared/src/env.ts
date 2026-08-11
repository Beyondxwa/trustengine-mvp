import { z } from 'zod';

// Environment variable validation schema
// This crashes the app on startup if required vars are missing

const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  
  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MAX_TOKENS: z.string().default('512'),
  ANTHROPIC_TEMPERATURE: z.string().default('0.3'),
  ANTHROPIC_COST_CAP_USD: z.string().default('500'),
  
  // Stripe
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  STRIPE_IDENTITY_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  
  // RevenueCat
  REVENUECAT_API_KEY: z.string().min(1),
  REVENUECAT_WEBHOOK_SECRET: z.string().min(1),
  
  // Twilio
  TWILIO_ACCOUNT_SID: z.string().startsWith('AC'),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_MESSAGING_SERVICE_SID: z.string().startsWith('MG'),
  TWILIO_PHONE_NUMBER: z.string().min(1),
  
  // Expo
  EXPO_ACCESS_TOKEN: z.string().min(1),
  
  // App
  APP_URL: z.string().url().default('https://trustengine-mvp-8vxb.vercel.app'),
  ADMIN_URL: z.string().url().default('https://trustengine-mvp-8vxb.vercel.app'),
  JWT_SECRET: z.string().min(32),
  
  // Monitoring
  SENTRY_DSN: z.string().url().optional(),
  POSTHOG_API_KEY: z.string().optional(),
  BETTER_UPTIME_URL: z.string().url().optional()
});

// Parse and validate
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  parsed.error.issues.forEach((issue) => {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  });
  throw new Error('Environment validation failed. Check your .env file.');
}

export const env = parsed.data;
