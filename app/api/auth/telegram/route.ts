import { NextResponse } from "next/server";
import { createHmac, createHash } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase";

const MAX_AUTH_AGE_SECONDS = 300; // 5 minutes

type TelegramLoginData = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

function verifyTelegramHash(data: TelegramLoginData, botToken: string): boolean {
  const { hash, ...rest } = data;

  // Build data-check-string: sorted key=value pairs joined by \n
  const checkString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key as keyof typeof rest]}`)
    .filter((line) => !line.endsWith("=undefined"))
    .join("\n");

  // secret_key = SHA256(bot_token)
  const secretKey = createHash("sha256").update(botToken).digest();

  // HMAC-SHA256(secret_key, data_check_string)
  const hmac = createHmac("sha256", secretKey).update(checkString).digest("hex");

  return hmac === hash;
}

export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Telegram bot not configured" }, { status: 503 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  let data: TelegramLoginData;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Verify required fields
  if (!data.id || !data.first_name || !data.auth_date || !data.hash) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Verify hash
  if (!verifyTelegramHash(data, botToken)) {
    return NextResponse.json({ error: "Invalid authentication data" }, { status: 401 });
  }

  // Check auth_date is recent (replay protection)
  const now = Math.floor(Date.now() / 1000);
  if (now - data.auth_date > MAX_AUTH_AGE_SECONDS) {
    return NextResponse.json({ error: "Authentication expired. Please try again." }, { status: 401 });
  }

  // Synthetic email for Supabase (never used for actual email)
  const email = `tg_${data.id}@supracrm.tg`;
  const password = createHmac("sha256", process.env.TOKEN_ENCRYPTION_KEY || "")
    .update(`tg_user_${data.id}`)
    .digest("hex");
  const displayName = [data.first_name, data.last_name].filter(Boolean).join(" ");

  const userMetadata = {
    telegram_id: data.id,
    telegram_username: data.username ?? null,
    display_name: displayName,
    avatar_url: data.photo_url ?? null,
  };

  // Try to sign in existing user first
  const { data: signInResult, error: signInError } = await admin.auth.signInWithPassword({
    email,
    password,
  });

  let session = signInResult?.session;

  if (signInError) {
    // User doesn't exist -- create them
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    });

    if (createError) {
      console.error("[auth/telegram] create user error:", createError);
      return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
    }

    // Sign in the newly created user
    const { data: newSignIn, error: newSignInError } = await admin.auth.signInWithPassword({
      email,
      password,
    });

    if (newSignInError || !newSignIn.session) {
      console.error("[auth/telegram] sign in after create error:", newSignInError);
      return NextResponse.json({ error: "Failed to sign in" }, { status: 500 });
    }

    session = newSignIn.session;

    // Create profile
    await admin.from("profiles").upsert(
      {
        id: newUser.user.id,
        display_name: displayName,
        avatar_url: data.photo_url ?? null,
        telegram_id: data.id,
      },
      { onConflict: "id" }
    );
  } else {
    // Update existing user metadata and profile
    if (signInResult.user) {
      await admin.auth.admin.updateUserById(signInResult.user.id, {
        user_metadata: userMetadata,
      });

      await admin.from("profiles").upsert(
        {
          id: signInResult.user.id,
          display_name: displayName,
          avatar_url: data.photo_url ?? null,
          telegram_id: data.id,
        },
        { onConflict: "id" }
      );
    }
  }

  if (!session) {
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }

  // Return session tokens -- client will set them via supabase.auth.setSession()
  return NextResponse.json({
    ok: true,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}
