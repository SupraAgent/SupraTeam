import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { sanitizeForPrompt } from "@/lib/claude-api";
import { getAnthropicKey } from "@/lib/ai-key";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const apiKey = await getAnthropicKey(auth.user.id);
  if (!apiKey) {
    return NextResponse.json({ error: "No API key configured. Add your Anthropic key in Settings > Integrations." }, { status: 503 });
  }

  // Gather deal context
  const [dealRes, notesRes, historyRes, notifsRes] = await Promise.all([
    supabase.from("crm_deals").select("*, contact:crm_contacts(name, company, telegram_username), stage:pipeline_stages(name)").eq("id", id).single(),
    supabase.from("crm_deal_notes").select("text, created_at").eq("deal_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.from("crm_deal_stage_history").select("changed_at, from_stage:pipeline_stages!crm_deal_stage_history_from_stage_id_fkey(name), to_stage:pipeline_stages!crm_deal_stage_history_to_stage_id_fkey(name)").eq("deal_id", id).order("changed_at", { ascending: false }).limit(10),
    supabase.from("crm_notifications").select("title, body, created_at").eq("deal_id", id).eq("type", "tg_message").order("created_at", { ascending: false }).limit(10),
  ]);

  const deal = dealRes.data;
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const contactName = (deal.contact as unknown as { name: string } | null)?.name ?? "Unknown";
  const stageName = (deal.stage as unknown as { name: string } | null)?.name ?? "Unknown";

  // Build context string (sanitize all user-generated content)
  let context = `Deal: ${sanitizeForPrompt(deal.deal_name)}\nBoard: ${deal.board_type}\nStage: ${stageName}\nValue: $${deal.value ?? 0}\nProbability: ${deal.probability ?? 50}%\nContact: ${sanitizeForPrompt(contactName)}\n`;

  if (notesRes.data && notesRes.data.length > 0) {
    context += "\nRecent notes:\n" + notesRes.data.map((n) => `- ${sanitizeForPrompt(n.text)}`).join("\n");
  }

  if (historyRes.data && historyRes.data.length > 0) {
    context += "\nStage history:\n" + historyRes.data.map((h) => {
      const from = (h.from_stage as unknown as { name: string } | null)?.name ?? "?";
      const to = (h.to_stage as unknown as { name: string } | null)?.name ?? "?";
      return `- ${from} -> ${to} (${new Date(h.changed_at).toLocaleDateString()})`;
    }).join("\n");
  }

  if (notifsRes.data && notifsRes.data.length > 0) {
    context += "\nRecent TG messages:\n" + notifsRes.data.map((n) => `- ${sanitizeForPrompt(n.title)}: ${sanitizeForPrompt(n.body ?? "")}`).join("\n");
  }

  // Call Claude
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `You are a CRM assistant. Analyze this deal and give a 2-3 sentence status summary. Be direct. Mention what's going well, what needs attention, and suggest one next action.\n\n${context}`,
        }],
      }),
    });

    const data = await res.json();
    const summary = data.content?.[0]?.text ?? "Unable to generate summary.";

    // Save summary to deal
    await supabase.from("crm_deals").update({
      ai_summary: summary,
      ai_summary_at: new Date().toISOString(),
    }).eq("id", id);

    return NextResponse.json({ summary, ok: true });
  } catch (err) {
    console.error("[ai-summary] error:", err);
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: deal } = await supabase
    .from("crm_deals")
    .select("ai_summary, ai_summary_at")
    .eq("id", id)
    .single();

  return NextResponse.json({ summary: deal?.ai_summary ?? null, generated_at: deal?.ai_summary_at ?? null });
}
