import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * GET /api/plugins/outreach-queue
 * Returns today's pending outreach sequence steps for the current user.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  // Get active enrollments with next_send_at within the next 24 hours
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const { data: enrollments } = await supabase
    .from("crm_outreach_enrollments")
    .select(`
      id, current_step, status, next_send_at, enrolled_at,
      crm_outreach_sequences(id, name, description, status),
      crm_deals(id, deal_name, board_type),
      crm_contacts(id, name, email, company, telegram_username)
    `)
    .eq("enrolled_by", user.id)
    .eq("status", "active")
    .not("next_send_at", "is", null)
    .lte("next_send_at", endOfDay.toISOString())
    .order("next_send_at", { ascending: true })
    .limit(20);

  // Collect sequence IDs and current steps to bulk-fetch in one query
  const seqStepPairs: { seqId: string; stepNum: number }[] = [];
  const seqIds = new Set<string>();

  for (const enrollment of enrollments ?? []) {
    const seqRaw = enrollment.crm_outreach_sequences as unknown;
    const seq = (Array.isArray(seqRaw) ? seqRaw[0] : seqRaw) as {
      id: string; name: string; description: string | null; status: string;
    } | null;
    if (seq) {
      seqIds.add(seq.id);
      seqStepPairs.push({ seqId: seq.id, stepNum: enrollment.current_step });
    }
  }

  // Bulk fetch all steps for all relevant sequences (single query)
  const { data: allSteps } = seqIds.size > 0
    ? await supabase
        .from("crm_outreach_steps")
        .select("id, sequence_id, step_number, message_template, step_type, delay_hours")
        .in("sequence_id", Array.from(seqIds))
    : { data: [] };

  // Build lookup maps
  interface StepRecord { id: string; sequence_id: string; step_number: number; message_template: string | null; step_type: string; delay_hours: number; }
  const stepMap = new Map<string, StepRecord>();
  const stepCountMap = new Map<string, number>();
  for (const step of (allSteps ?? []) as StepRecord[]) {
    stepMap.set(`${step.sequence_id}:${step.step_number}`, step);
    stepCountMap.set(step.sequence_id, (stepCountMap.get(step.sequence_id) ?? 0) + 1);
  }

  const queueItems = [];

  for (const enrollment of enrollments ?? []) {
    const seqRaw = enrollment.crm_outreach_sequences as unknown;
    const seq = (Array.isArray(seqRaw) ? seqRaw[0] : seqRaw) as {
      id: string; name: string; description: string | null; status: string;
    } | null;

    const dealRaw = enrollment.crm_deals as unknown;
    const deal = (Array.isArray(dealRaw) ? dealRaw[0] : dealRaw) as {
      id: string; deal_name: string; board_type: string;
    } | null;

    const contactRaw = enrollment.crm_contacts as unknown;
    const contact = (Array.isArray(contactRaw) ? contactRaw[0] : contactRaw) as {
      id: string; name: string; email: string; company: string | null; telegram_username: string | null;
    } | null;

    if (!seq) continue;

    const step = stepMap.get(`${seq.id}:${enrollment.current_step}`);
    const totalSteps = stepCountMap.get(seq.id) ?? 0;
    const isPastDue = enrollment.next_send_at && new Date(enrollment.next_send_at) < now;

    queueItems.push({
      enrollmentId: enrollment.id,
      sequenceName: seq.name,
      sequenceId: seq.id,
      currentStep: enrollment.current_step,
      totalSteps,
      stepType: step?.step_type ?? "message",
      messagePreview: step?.message_template?.slice(0, 120) ?? "",
      nextSendAt: enrollment.next_send_at,
      isPastDue,
      contactName: contact?.name ?? null,
      contactEmail: contact?.email ?? null,
      contactTelegram: contact?.telegram_username ?? null,
      dealName: deal?.deal_name ?? null,
      dealId: deal?.id ?? null,
      boardType: deal?.board_type ?? null,
    });
  }

  return NextResponse.json({ data: queueItems });
}
