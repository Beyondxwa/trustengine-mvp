// File: src/lib/theme.ts
// Purpose: Theme configuration for the mobile app
// Depends on: None

export const theme = {
  colors: {
    primary: '#3B82F6',
    primaryDark: '#2563EB',
    secondary: '#10B981',
    secondaryDark: '#059669',
    background: '#FFFFFF',
    surface: '#F8FAFC',
    border: '#E2E8F0',
    text: '#1E293B',
    textMuted: '#64748B',
    textInverse: '#FFFFFF',
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    star: '#FBBF24',
    starEmpty: '#D1D5DB',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
};

export type Theme = typeof theme;
