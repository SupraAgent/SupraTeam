/**
 * Slack API helper.
 * Uses native fetch() against the Slack Web API — no external packages.
 */
import { createSupabaseAdmin } from "@/lib/supabase";
import { decryptToken } from "@/lib/crypto";

const SLACK_API = "https://slack.com/api";

/**
 * Fetch and decrypt the Slack Bot Token from user_tokens.
 */
export async function getSlackToken(): Promise<string | null> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return null;

  const { data } = await supabase
    .from("user_tokens")
    .select("encrypted_token")
    .eq("provider", "slack_bot")
    .limit(1)
    .single();

  if (!data?.encrypted_token) return null;

  try {
    return decryptToken(data.encrypted_token);
  } catch {
    return null;
  }
}

/**
 * Verify a Slack Bot Token and return workspace info.
 */
export async function verifySlackToken(token: string): Promise<{
  ok: boolean;
  team?: string;
  bot_user?: string;
  error?: string;
}> {
  const res = await fetch(`${SLACK_API}/auth.test`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  if (!data.ok) return { ok: false, error: data.error };

  return {
    ok: true,
    team: data.team,
    bot_user: data.user,
  };
}

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  num_members: number;
}

/**
 * List Slack channels the bot can post to.
 */
export async function getSlackChannels(token: string): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor: string | undefined;

  // Paginate through all channels (max 3 pages to avoid runaway)
  for (let page = 0; page < 3; page++) {
    const params = new URLSearchParams({
      types: "public_channel,private_channel",
      exclude_archived: "true",
      limit: "200",
    });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`${SLACK_API}/conversations.list?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!data.ok) break;

    for (const ch of data.channels ?? []) {
      channels.push({
        id: ch.id,
        name: ch.name,
        is_private: ch.is_private ?? false,
        num_members: ch.num_members ?? 0,
      });
    }

    cursor = data.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  return channels;
}

export interface SlackUser {
  id: string;
  name: string;
  real_name: string;
  display_name: string;
  is_bot: boolean;
}

/**
 * List Slack workspace members (non-bot, non-deleted).
 */
export async function getSlackUsers(token: string): Promise<SlackUser[]> {
  const users: SlackUser[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 3; page++) {
    const params = new URLSearchParams({ limit: "200" });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`${SLACK_API}/users.list?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!data.ok) break;

    for (const u of data.members ?? []) {
      if (u.deleted || u.is_bot || u.id === "USLACKBOT") continue;
      users.push({
        id: u.id,
        name: u.name,
        real_name: u.real_name ?? u.name,
        display_name: u.profile?.display_name ?? u.real_name ?? u.name,
        is_bot: false,
      });
    }

    cursor = data.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  return users;
}

/**
 * Send a message to a Slack channel.
 */
export async function sendSlackMessage(
  token: string,
  channel: string,
  text: string
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const res = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text, unfurl_links: false }),
  });

  const data = await res.json();
  return { ok: data.ok, ts: data.ts, error: data.error };
}
