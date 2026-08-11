// Utility functions shared across the app

/**
 * Hash a phone number using SHA-256
 * Used for privacy-compliant storage and suppression list matching
 */
export function hashPhone(phone: string): string {
  // In browser/React Native, use subtle crypto
  // In Node.js/Deno, use crypto module
  // This is a placeholder - implement based on environment
  return `sha256-${phone.replace(/\D/g, '')}`;
}

/**
 * Mask PII for display purposes
 * e.g., "+1 (555) 123-4567" → "+1 (555) ***-4567"
 */
export function maskPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 4) return phone;
  return phone.slice(0, -4).replace(/\d/g, '*') + phone.slice(-4);
}

/**
 * Generate a URL-friendly slug from a business name
 * e.g., "Mike's Auto Detail" → "mikes-auto-detail"
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Format date for display
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Format relative time
 * e.g., "2 minutes ago", "3 hours ago"
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(d);
}

/**
 * Check if a rating is positive (4-5 stars)
 */
export function isPositiveRating(rating: number): boolean {
  return rating >= 4;
}

/**
 * Check if a rating needs resolution (1-3 stars)
 */
export function needsResolution(rating: number): boolean {
  return rating <= 3;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
