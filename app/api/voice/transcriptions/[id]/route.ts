import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  const { data: transcription, error } = await supabase
    .from("crm_voice_transcriptions")
    .select(
      `
      *,
      deal:crm_deals(id, deal_name, board_type, stage:pipeline_stages(name, color)),
      contact:crm_contacts(id, name, telegram_username, email)
    `
    )
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: "Transcription not found" }, { status: 404 });
  }

  return NextResponse.json({ data: transcription, source: "supabase" });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Allow linking to a deal
  if ("linked_deal_id" in body) {
    updates.linked_deal_id = body.linked_deal_id || null;
  }
  // Allow linking to a contact
  if ("linked_contact_id" in body) {
    updates.linked_contact_id = body.linked_contact_id || null;
  }
  // Allow editing action items (e.g., marking items as done)
  if ("action_items" in body && Array.isArray(body.action_items)) {
    updates.action_items = body.action_items;
  }

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data: transcription, error } = await supabase
    .from("crm_voice_transcriptions")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[api/voice/transcriptions] update error:", error);
    return NextResponse.json({ error: "Failed to update transcription" }, { status: 500 });
  }

  return NextResponse.json({ data: transcription, source: "supabase" });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, admin } = auth;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action !== "retranscribe") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  // Fetch the existing record (use admin to ensure we can read it for retranscription)
  const { data: existing, error: fetchError } = await supabase
    .from("crm_voice_transcriptions")
    .select("id, telegram_file_id, chat_id, linked_deal_id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Transcription not found" }, { status: 404 });
  }

  // Reset status to pending
  const { error: updateError } = await supabase
    .from("crm_voice_transcriptions")
    .update({
      transcription_status: "processing",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    console.error("[api/voice/transcriptions] retranscribe error:", updateError);
    return NextResponse.json({ error: "Failed to trigger retranscription" }, { status: 500 });
  }

  // Perform retranscription server-side
  retranscribeAsync(admin, existing.id, existing.telegram_file_id, existing.linked_deal_id).catch(
    (err) => console.error("[api/voice/retranscribe] async error:", err)
  );

  return NextResponse.json({ data: { id, status: "processing" }, source: "supabase" });
}

/**
 * Re-download and re-transcribe a voice message.
 * Uses the Bot API token from env to download the file.
 */
async function retranscribeAsync(
  admin: NonNullable<ReturnType<typeof import("@/lib/supabase").createSupabaseAdmin>>,
  transcriptionId: string,
  fileId: string,
  linkedDealId: string | null
): Promise<void> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");

    // Get file path from Telegram
    const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const fileJson = await fileRes.json() as { ok: boolean; result?: { file_path: string } };
    if (!fileJson.ok || !fileJson.result?.file_path) {
      throw new Error("Could not get file from Telegram (file may have expired)");
    }

    // Download file
    const downloadUrl = `https://api.telegram.org/file/bot${token}/${fileJson.result.file_path}`;
    const dlRes = await fetch(downloadUrl);
    if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`);
    const arrayBuffer = await dlRes.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const {
      transcribeVoiceMessage,
      extractActionItems,
      analyzeSentiment,
      generateSummary,
    } = await import("@/lib/voice-transcription");

    const result = await transcribeVoiceMessage(fileBuffer);

    if (!result.text) {
      await admin
        .from("crm_voice_transcriptions")
        .update({
          transcription_status: "failed",
          error_message: "No speech detected in audio",
          updated_at: new Date().toISOString(),
        })
        .eq("id", transcriptionId);
      return;
    }

    const [actionItems, sentimentResult, summary] = await Promise.all([
      extractActionItems(result.text),
      analyzeSentiment(result.text),
      generateSummary(result.text),
    ]);

    await admin
      .from("crm_voice_transcriptions")
      .update({
        transcription_text: result.text,
        transcription_status: "completed",
        language: result.language,
        confidence_score: result.confidence,
        action_items: actionItems,
        sentiment: sentimentResult.sentiment,
        summary,
        error_message: null,
        transcribed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", transcriptionId);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Retranscription failed";
    console.error("[api/voice/retranscribe] error:", errorMessage);
    await admin
      .from("crm_voice_transcriptions")
      .update({
        transcription_status: "failed",
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transcriptionId);
  }
}
