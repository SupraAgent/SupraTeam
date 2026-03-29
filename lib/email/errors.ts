/**
 * Sanitize Gmail/email API errors into user-friendly messages.
 * Raw Google API errors contain verbose JSON that should never reach the UI.
 */

interface GmailErrorPattern {
  pattern: RegExp;
  message: string;
  /** HTTP status to return (overrides default 500) */
  status?: number;
}

const GMAIL_ERROR_PATTERNS: GmailErrorPattern[] = [
  {
    pattern: /Gmail API has not been used in project .* before or it is disabled/i,
    message: "Gmail API is not enabled for this project. Please contact your administrator to enable it in Google Cloud Console.",
    status: 403,
  },
  {
    pattern: /accessNotConfigured/i,
    message: "Gmail API is not enabled for this project. Please contact your administrator to enable it in Google Cloud Console.",
    status: 403,
  },
  {
    pattern: /invalid_grant|Token has been expired or revoked/i,
    message: "Your Gmail connection has expired. Please reconnect your account in Settings.",
    status: 401,
  },
  {
    pattern: /insufficient.*permission|PERMISSION_DENIED/i,
    message: "Insufficient permissions to access Gmail. Please reconnect your account with the required permissions.",
    status: 403,
  },
  {
    pattern: /quota.*exceeded|rateLimitExceeded|userRateLimitExceeded/i,
    message: "Gmail rate limit reached. Please wait a moment and try again.",
    status: 429,
  },
  {
    pattern: /not found|Requested entity was not found/i,
    message: "Email thread not found. It may have been deleted.",
    status: 404,
  },
  {
    pattern: /SERVICE_DISABLED/i,
    message: "Gmail API is disabled for this project. Please contact your administrator.",
    status: 403,
  },
  {
    pattern: /invalid.*credentials|unauthenticated/i,
    message: "Gmail authentication failed. Please reconnect your account in Settings.",
    status: 401,
  },
  {
    pattern: /backend.*error|internal.*error/i,
    message: "Gmail is temporarily unavailable. Please try again in a moment.",
    status: 502,
  },
];

export interface SanitizedError {
  message: string;
  status: number;
  /** Whether the user should reconnect their account */
  reconnect: boolean;
}

export function sanitizeEmailError(err: unknown, fallback = "Something went wrong"): SanitizedError {
  const raw = err instanceof Error ? err.message : String(err);

  for (const { pattern, message, status } of GMAIL_ERROR_PATTERNS) {
    if (pattern.test(raw)) {
      return {
        message,
        status: status ?? 500,
        reconnect: (status === 401 || status === 403),
      };
    }
  }

  // Don't expose raw error details — they may contain project IDs, tokens, etc.
  return {
    message: fallback,
    status: 500,
    reconnect: false,
  };
}
