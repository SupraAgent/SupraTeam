/**
 * Sanitize Gmail/email API errors into user-friendly messages.
 * Raw Google API errors contain verbose JSON that should never reach the UI.
 */

import { emailLog } from "./logger";

interface GmailErrorPattern {
  pattern: RegExp;
  message: string;
  /** HTTP status to return (overrides default 500) */
  status?: number;
  /** Whether reconnecting the account would fix this */
  reconnect: boolean;
}

const GMAIL_ERROR_PATTERNS: GmailErrorPattern[] = [
  {
    pattern: /Gmail API has not been used in project .* before or it is disabled/i,
    message: "Gmail API is not enabled for this project. Please contact your administrator to enable it in Google Cloud Console.",
    status: 403,
    reconnect: false,
  },
  {
    pattern: /accessNotConfigured/i,
    message: "Gmail API is not enabled for this project. Please contact your administrator to enable it in Google Cloud Console.",
    status: 403,
    reconnect: false,
  },
  {
    pattern: /SERVICE_DISABLED/i,
    message: "Gmail API is disabled for this project. Please contact your administrator.",
    status: 403,
    reconnect: false,
  },
  {
    pattern: /invalid_grant|Token has been expired or revoked/i,
    message: "Your Gmail connection has expired. Please reconnect your account in Settings.",
    status: 401,
    reconnect: true,
  },
  {
    pattern: /insufficient.*permission/i,
    message: "Insufficient permissions to access Gmail. Please reconnect your account with the required permissions.",
    status: 403,
    reconnect: true,
  },
  {
    pattern: /invalid.*credentials|unauthenticated/i,
    message: "Gmail authentication failed. Please reconnect your account in Settings.",
    status: 401,
    reconnect: true,
  },
  {
    pattern: /quota.*exceeded|rateLimitExceeded|userRateLimitExceeded/i,
    message: "Gmail rate limit reached. Please wait a moment and try again.",
    status: 429,
    reconnect: false,
  },
  {
    pattern: /Requested entity was not found|thread.*not found|message.*not found/i,
    message: "Email thread not found. It may have been deleted.",
    status: 404,
    reconnect: false,
  },
  {
    pattern: /PERMISSION_DENIED.*gmail/i,
    message: "Permission denied for Gmail. Please reconnect your account in Settings.",
    status: 403,
    reconnect: true,
  },
  {
    pattern: /backendError|googleapi.*5\d\d/i,
    message: "Gmail is temporarily unavailable. Please try again in a moment.",
    status: 502,
    reconnect: false,
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

  // Always log the raw error server-side for diagnostics
  emailLog.error("api", fallback, { error: raw });

  for (const { pattern, message, status, reconnect } of GMAIL_ERROR_PATTERNS) {
    if (pattern.test(raw)) {
      return {
        message,
        status: status ?? 500,
        reconnect,
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
