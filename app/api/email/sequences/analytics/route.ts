import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const sequenceId = searchParams.get("sequence_id");

  if (!sequenceId) {
    // Return overview of all sequences
    const { data: sequences } = await auth.admin
      .from("crm_email_sequences")
      .select("id, name, steps, is_active, created_at")
      .order("created_at", { ascending: false });

    const { data: enrollments } = await auth.admin
      .from("crm_email_sequence_enrollments")
      .select("sequence_id, status");

    // Aggregate per sequence
    const stats = (sequences ?? []).map((seq) => {
      const seqEnrollments = (enrollments ?? []).filter(
        (e) => e.sequence_id === seq.id
      );
      const total = seqEnrollments.length;
      const active = seqEnrollments.filter(
        (e) => e.status === "active"
      ).length;
      const completed = seqEnrollments.filter(
        (e) => e.status === "completed"
      ).length;
      const replied = seqEnrollments.filter(
        (e) => e.status === "replied"
      ).length;
      const bounced = seqEnrollments.filter(
        (e) => e.status === "bounced"
      ).length;

      return {
        id: seq.id,
        name: seq.name,
        stepCount: (seq.steps as unknown[])?.length ?? 0,
        isActive: seq.is_active,
        total,
        active,
        completed,
        replied,
        bounced,
        replyRate: total > 0 ? Math.round((replied / total) * 100) : 0,
        completionRate:
          total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    });

    return NextResponse.json({ data: stats, source: "supabase" });
  }

  // Detailed analytics for a specific sequence
  const [{ data: sequence }, { data: enrollments }, { data: auditLogs }] =
    await Promise.all([
      auth.admin
        .from("crm_email_sequences")
        .select("*")
        .eq("id", sequenceId)
        .single(),
      auth.admin
        .from("crm_email_sequence_enrollments")
        .select("*")
        .eq("sequence_id", sequenceId),
      auth.admin
        .from("crm_email_audit_log")
        .select("*")
        .eq("action", "sequence_step_sent")
        .order("created_at", { ascending: false }),
    ]);

  if (!sequence) {
    return NextResponse.json(
      { error: "Sequence not found" },
      { status: 404 }
    );
  }

  const steps =
    (sequence.steps as {
      delay_days: number;
      template_id: string;
      subject_override?: string;
    }[]) ?? [];
  const allEnrollments = enrollments ?? [];

  // Filter audit logs for this sequence
  const seqLogs = (auditLogs ?? []).filter(
    (log: { metadata: Record<string, unknown> }) =>
      log.metadata?.sequence_id === sequenceId
  );

  // Per-step metrics
  const stepStats = steps.map((step, index) => {
    const sent = seqLogs.filter(
      (log: { metadata: Record<string, unknown> }) =>
        log.metadata?.step === index
    ).length;

    const reached = allEnrollments.filter(
      (e) => e.current_step > index || e.status === "completed"
    ).length;

    return {
      index,
      delayDays: step.delay_days,
      templateId: step.template_id,
      subjectOverride: step.subject_override,
      sent,
      reached,
    };
  });

  // Status breakdown
  const statusCounts = {
    active: allEnrollments.filter((e) => e.status === "active").length,
    paused: allEnrollments.filter((e) => e.status === "paused").length,
    completed: allEnrollments.filter((e) => e.status === "completed").length,
    replied: allEnrollments.filter((e) => e.status === "replied").length,
    bounced: allEnrollments.filter((e) => e.status === "bounced").length,
  };

  const total = allEnrollments.length;

  return NextResponse.json({
    data: {
      sequence: {
        id: sequence.id,
        name: sequence.name,
        isActive: sequence.is_active,
      },
      total,
      statusCounts,
      replyRate:
        total > 0
          ? Math.round((statusCounts.replied / total) * 100)
          : 0,
      completionRate:
        total > 0
          ? Math.round((statusCounts.completed / total) * 100)
          : 0,
      stepStats,
    },
    source: "supabase",
  });
}
