import { NextResponse } from "next/server";

/**
 * Return a safe error response that does not leak internal details.
 * In production, only the `fallback` message is shown to the client.
 * The original error is always logged server-side for debugging.
 */
export function safeErrorResponse(
  error: unknown,
  fallback: string,
  status: number = 500,
  logPrefix?: string
): NextResponse {
  const message =
    error instanceof Error ? error.message : String(error);

  // Always log the real error server-side
  console.error(logPrefix ? `[${logPrefix}] ${message}` : message);

  // In production, never expose internal error details to clients
  const clientMessage =
    process.env.NODE_ENV === "production" ? fallback : message;

  return NextResponse.json({ error: clientMessage }, { status });
}
