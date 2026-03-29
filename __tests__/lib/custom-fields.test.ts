/**
 * custom-fields.ts — SKIPPED
 *
 * All exported functions (listFields, listFieldValues, bulkUpdateFields,
 * saveFieldValues) require a SupabaseClient instance and perform direct
 * database operations. There are no pure/testable utility functions to
 * unit test without mocking Supabase, which would make the tests brittle
 * and low-value.
 *
 * These functions are better covered by integration tests that run against
 * a real Supabase instance or by end-to-end tests.
 */
import { describe, it } from "vitest";

describe("custom-fields", () => {
  it.skip("all exports require SupabaseClient — no pure functions to test", () => {
    // Intentionally empty. See comment above.
  });
});
