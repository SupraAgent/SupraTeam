import { createSupabaseAdmin } from "@/lib/supabase";

interface MatchResult {
  bookingLinkId: string;
  dealId: string | null;
  contactId: string | null;
  userId: string;
  matchTier: 1 | 2 | 3;
}

interface MatchParams {
  /** Tier 1: Direct reference to a booking link or deal */
  clientReferenceId?: string;
  /** Tier 2: Google Calendar event ID (deterministic) */
  googleCalendarEventId?: string;
  /** Tier 3: Fuzzy match params */
  scheduledAt?: Date;
  attendeeEmails?: string[];
  /** Scope to a specific user if known */
  userId?: string;
}

/**
 * 3-tier transcript-to-deal matching.
 *
 * Tier 1: clientReferenceId direct match (booking_link_id or deal_id)
 * Tier 2: google_calendar_event_id exact match (deterministic)
 * Tier 3: scheduled_at ±30min + attendee email overlap (fuzzy)
 */
export async function matchBookingLink(
  params: MatchParams
): Promise<MatchResult | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  // Tier 1: Direct reference match
  if (params.clientReferenceId) {
    const { data } = await admin
      .from("crm_booking_links")
      .select("id, deal_id, contact_id, user_id")
      .eq("id", params.clientReferenceId)
      .single();

    if (data) {
      return {
        bookingLinkId: data.id,
        dealId: data.deal_id,
        contactId: data.contact_id,
        userId: data.user_id,
        matchTier: 1,
      };
    }

    // Also try as deal_id
    const { data: byDeal } = await admin
      .from("crm_booking_links")
      .select("id, deal_id, contact_id, user_id")
      .eq("deal_id", params.clientReferenceId)
      .in("status", ["booked", "completed"])
      .order("booked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byDeal) {
      return {
        bookingLinkId: byDeal.id,
        dealId: byDeal.deal_id,
        contactId: byDeal.contact_id,
        userId: byDeal.user_id,
        matchTier: 1,
      };
    }
  }

  // Tier 2: Google Calendar event ID (deterministic)
  if (params.googleCalendarEventId) {
    // 2a: Check booking links
    const { data } = await admin
      .from("crm_booking_links")
      .select("id, deal_id, contact_id, user_id")
      .eq("google_calendar_event_id", params.googleCalendarEventId)
      .limit(1)
      .maybeSingle();

    if (data) {
      return {
        bookingLinkId: data.id,
        dealId: data.deal_id,
        contactId: data.contact_id,
        userId: data.user_id,
        matchTier: 2,
      };
    }

    // 2b: Check calendar event links (for non-Calendly meetings)
    const { data: calLink } = await admin
      .from("crm_deal_calendar_links")
      .select("deal_id, calendar_event_id")
      .eq("calendar_event_id", (
        await admin
          .from("crm_calendar_events")
          .select("id")
          .eq("google_event_id", params.googleCalendarEventId)
          .limit(1)
          .maybeSingle()
      ).data?.id ?? "00000000-0000-0000-0000-000000000000")
      .limit(1)
      .maybeSingle();

    if (calLink?.deal_id) {
      return {
        bookingLinkId: "",
        dealId: calLink.deal_id,
        contactId: null,
        userId: params.userId ?? "",
        matchTier: 2,
      };
    }
  }

  // Tier 3: Fuzzy match — scheduled_at ±30min + attendee email overlap
  // Widened from ±15min because prospects often join late (common in crypto BD)
  if (params.scheduledAt && params.attendeeEmails?.length) {
    const windowMin = new Date(params.scheduledAt.getTime() - 30 * 60 * 1000).toISOString();
    const windowMax = new Date(params.scheduledAt.getTime() + 30 * 60 * 1000).toISOString();

    const normalizedEmails = params.attendeeEmails.map((e) => e.toLowerCase().trim());

    let query = admin
      .from("crm_booking_links")
      .select("id, deal_id, contact_id, user_id, invitee_email")
      .gte("scheduled_at", windowMin)
      .lte("scheduled_at", windowMax)
      .in("status", ["booked", "completed"])
      .order("scheduled_at", { ascending: false })
      .limit(10);

    if (params.userId) {
      query = query.eq("user_id", params.userId);
    }

    const { data: candidates } = await query;

    if (candidates?.length) {
      // Find the one with the best email overlap
      const match = candidates.find(
        (c) => c.invitee_email && normalizedEmails.includes(c.invitee_email.toLowerCase().trim())
      );

      if (match) {
        return {
          bookingLinkId: match.id,
          dealId: match.deal_id,
          contactId: match.contact_id,
          userId: match.user_id,
          matchTier: 3,
        };
      }

      // If no email match but user is scoped and there's only one candidate, use it
      if (params.userId && candidates.length === 1) {
        return {
          bookingLinkId: candidates[0].id,
          dealId: candidates[0].deal_id,
          contactId: candidates[0].contact_id,
          userId: candidates[0].user_id,
          matchTier: 3,
        };
      }
    }
  }

  return null;
}
