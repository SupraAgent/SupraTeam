import { encryptToken, decryptToken } from "@/lib/crypto";
import { createSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";

const FIREFLIES_API = "https://api.fireflies.ai/graphql";

interface FirefliesConnection {
  id: string;
  user_id: string;
  api_key_encrypted: string;
  fireflies_email: string;
  webhook_secret: string | null;
  last_sync_cursor: string | null;
  is_active: boolean;
}

export interface FirefliesTranscriptSummary {
  id: string;
  title: string;
  date: string;
  duration: number;
  organizer_email: string;
  meeting_attendees: Array<{ displayName: string; email: string }>;
}

export interface FirefliesTranscript extends FirefliesTranscriptSummary {
  sentences: Array<{
    index: number;
    speaker_id: number;
    speaker_name: string;
    text: string;
    start_time: number;
    end_time: number;
  }>;
  summary: {
    action_items: string[];
    keywords: string[];
    outline: string[];
    overview: string;
    bullet_gist: string[];
    short_summary: string;
  } | null;
  transcript_url: string;
  cal_id: string | null;
}

export interface FirefliesUser {
  email: string;
  name: string;
  user_id: string;
}

/**
 * Get the decrypted Fireflies API key for a user.
 */
export async function getFirefliesConnection(userId: string): Promise<{
  apiKey: string;
  connection: FirefliesConnection;
}> {
  const admin = createSupabaseAdmin();
  if (!admin) throw new Error("Supabase not configured");

  const { data: conn } = await admin
    .from("crm_fireflies_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  if (!conn) throw new Error("Fireflies not connected");

  const connection = conn as FirefliesConnection;
  return {
    apiKey: decryptToken(connection.api_key_encrypted),
    connection,
  };
}

/**
 * Make an authenticated GraphQL request to the Fireflies API.
 */
export async function firefliesGraphQL<T = Record<string, unknown>>(
  userId: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const rl = rateLimit(`fireflies-api:${userId}`, { max: 80, windowSec: 60 });
  if (rl) throw new Error("Fireflies API rate limit exceeded");

  const { apiKey } = await getFirefliesConnection(userId);

  const res = await fetch(FIREFLIES_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Fireflies API error: ${res.status}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Fireflies GraphQL error: ${json.errors[0].message}`);
  }

  return json.data as T;
}

/**
 * Validate an API key by fetching the user profile.
 */
export async function validateFirefliesApiKey(apiKey: string): Promise<FirefliesUser> {
  const res = await fetch(FIREFLIES_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: "query { user { email name user_id } }" }),
  });

  if (!res.ok) {
    throw new Error("Invalid Fireflies API key");
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Fireflies API error: ${json.errors[0].message}`);
  }

  return json.data.user as FirefliesUser;
}

/**
 * Fetch a full transcript by ID.
 */
export async function fetchTranscript(
  userId: string,
  transcriptId: string
): Promise<FirefliesTranscript> {
  const data = await firefliesGraphQL<{ transcript: FirefliesTranscript }>(
    userId,
    `query Transcript($id: String!) {
      transcript(id: $id) {
        id title date duration organizer_email
        meeting_attendees { displayName email }
        sentences { index speaker_id speaker_name text start_time end_time }
        summary { action_items keywords outline overview bullet_gist short_summary }
        transcript_url
        cal_id
      }
    }`,
    { id: transcriptId }
  );

  return data.transcript;
}

/**
 * Fetch recent transcripts since a date (for reconciliation polling).
 */
export async function fetchRecentTranscripts(
  userId: string,
  since: Date,
  limit = 50
): Promise<FirefliesTranscriptSummary[]> {
  const data = await firefliesGraphQL<{ transcripts: FirefliesTranscriptSummary[] }>(
    userId,
    `query RecentTranscripts($fromDate: DateTime, $limit: Int) {
      transcripts(fromDate: $fromDate, limit: $limit) {
        id title date duration organizer_email
        meeting_attendees { displayName email }
      }
    }`,
    { fromDate: since.toISOString(), limit }
  );

  return data.transcripts ?? [];
}

/**
 * Encrypt and store a Fireflies API key for a user.
 */
export async function storeFirefliesConnection(
  userId: string,
  apiKey: string,
  user: FirefliesUser,
  webhookSecret: string
): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) throw new Error("Supabase not configured");

  await admin
    .from("crm_fireflies_connections")
    .upsert(
      {
        user_id: userId,
        api_key_encrypted: encryptToken(apiKey),
        fireflies_email: user.email,
        webhook_secret: webhookSecret,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
}
