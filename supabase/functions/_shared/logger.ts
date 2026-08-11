// File: functions/_shared/logger.ts
// Purpose: Structured JSON logger for Supabase Edge Functions
// Depends on: None

interface LogContext {
  [key: string]: unknown;
}

export const logger = {
  info: (message: string, context?: LogContext) => {
    console.log(JSON.stringify({
      level: 'info',
      message,
      timestamp: new Date().toISOString(),
      ...context,
    }));
  },

  warn: (message: string, context?: LogContext) => {
    console.log(JSON.stringify({
      level: 'warn',
      message,
      timestamp: new Date().toISOString(),
      ...context,
    }));
  },

  error: (message: string, error?: Error, context?: LogContext) => {
    console.log(JSON.stringify({
      level: 'error',
      message,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
      timestamp: new Date().toISOString(),
      ...context,
    }));
  },

  debug: (message: string, context?: LogContext) => {
    if (Deno.env.get('DEBUG') === 'true') {
      console.log(JSON.stringify({
        level: 'debug',
        message,
        timestamp: new Date().toISOString(),
        ...context,
      }));
    }
  },
};
