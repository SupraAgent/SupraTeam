/**
 * POST /api/contacts/enrich-from-ai — Enrich contact + company from AI qualification data.
 *
 * Called after the AI agent extracts structured qualification fields
 * (protocol_name, tvl_range, chain_deployments, token_status, etc.)
 * from a conversation. Upserts crypto-native fields into the contact
 * and their linked company.
 *
 * Body: {
 *   contact_id: string,
 *   qualification: {
 *     protocol_name?: string,
 *     tvl_range?: string,           // e.g. "$1M-$10M" — parsed to numeric
 *     chain_deployments?: string[],
 *     token_status?: "pre_tge" | "post_tge" | "no_token",
 *     partnership_type?: string,
 *     decision_maker?: string,       // mapped to decision_maker_level
 *     integration_timeline?: string,
 *     funding_stage?: string,
 *   }
 * }
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

const TVL_PATTERNS: [RegExp, number][] = [
  [/\$?(\d+(?:\.\d+)?)\s*[bB]/i, 1e9],
  [/\$?(\d+(?:\.\d+)?)\s*[mM]/i, 1e6],
  [/\$?(\d+(?:\.\d+)?)\s*[kK]/i, 1e3],
];

function parseTvl(raw: string): number | null {
  for (const [pattern, multiplier] of TVL_PATTERNS) {
    const match = raw.match(pattern);
    if (match) return parseFloat(match[1]) * multiplier;
  }
  // Try range like "$500K-$2M" — parse each number's suffix independently
  const rangeMatch = raw.match(/\$?(\d+(?:\.\d+)?)\s*([mMbBkK])?\s*[-–]\s*\$?(\d+(?:\.\d+)?)\s*([mMbBkK])?/i);
  if (rangeMatch) {
    const suffixToMult = (s: string | undefined) => {
      if (!s) return 1e6; // default to millions
      const lower = s.toLowerCase();
      return lower === "b" ? 1e9 : lower === "k" ? 1e3 : 1e6;
    };
    const lo = parseFloat(rangeMatch[1]) * suffixToMult(rangeMatch[2]);
    const hi = parseFloat(rangeMatch[3]) * suffixToMult(rangeMatch[4]);
    return (lo + hi) / 2;
  }
  return null;
}

function mapDecisionMaker(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (lower.includes("founder") || lower.includes("co-founder")) return "founder";
  if (lower.includes("ceo") || lower.includes("cto") || lower.includes("coo") || lower.includes("c-level") || lower.includes("chief")) return "c_level";
  if (lower.includes("vp") || lower.includes("vice president")) return "vp";
  if (lower.includes("director")) return "director";
  if (lower.includes("manager") || lower.includes("lead")) return "manager";
  return "ic";
}

const VALID_TOKEN_STATUSES = new Set(["pre_tge", "post_tge", "no_token"]);
const VALID_FUNDING_STAGES = new Set(["pre_seed", "seed", "series_a", "series_b", "series_c", "public", "bootstrapped"]);
const VALID_PARTNERSHIP_TYPES = new Set(["integration", "listing", "co_marketing", "investment", "advisory", "node_operator"]);
const VALID_PROTOCOL_TYPES = new Set(["defi", "infrastructure", "gaming", "nft", "dao", "social", "bridge", "oracle", "wallet", "other"]);

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const contactId = body.contact_id as string;
  const qualification = body.qualification as Record<string, unknown> | undefined;

  if (!contactId || !qualification) {
    return NextResponse.json({ error: "contact_id and qualification required" }, { status: 400 });
  }

  // Fetch the contact to get company_id
  const { data: contact } = await admin
    .from("crm_contacts")
    .select("id, company_id, wallets")
    .eq("id", contactId)
    .single();

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // Build contact update
  const contactUpdate: Record<string, unknown> = {};

  if (qualification.decision_maker && typeof qualification.decision_maker === "string") {
    const level = mapDecisionMaker(qualification.decision_maker);
    if (level) contactUpdate.decision_maker_level = level;
  }

  if (qualification.partnership_type && typeof qualification.partnership_type === "string") {
    const pt = qualification.partnership_type.toLowerCase().replace(/[\s-]/g, "_");
    if (VALID_PARTNERSHIP_TYPES.has(pt)) contactUpdate.partnership_type = pt;
  }

  if (Object.keys(contactUpdate).length > 0) {
    await admin.from("crm_contacts").update(contactUpdate).eq("id", contactId);
  }

  // Build company update (if contact has a linked company)
  const companyUpdate: Record<string, unknown> = {};
  if (contact.company_id) {

    if (qualification.tvl_range && typeof qualification.tvl_range === "string") {
      const tvl = parseTvl(qualification.tvl_range);
      if (tvl !== null) companyUpdate.tvl = tvl;
    }

    if (Array.isArray(qualification.chain_deployments) && qualification.chain_deployments.length > 0) {
      companyUpdate.chain_deployments = qualification.chain_deployments;
    }

    if (qualification.token_status && typeof qualification.token_status === "string") {
      const ts = qualification.token_status.toLowerCase().replace(/[\s-]/g, "_");
      if (VALID_TOKEN_STATUSES.has(ts)) companyUpdate.token_status = ts;
    }

    if (qualification.funding_stage && typeof qualification.funding_stage === "string") {
      const fs = qualification.funding_stage.toLowerCase().replace(/[\s-]/g, "_");
      if (VALID_FUNDING_STAGES.has(fs)) companyUpdate.funding_stage = fs;
    }

    if (qualification.protocol_name && typeof qualification.protocol_name === "string") {
      // Try to infer protocol_type from name if not explicitly provided
      const name = qualification.protocol_name.toLowerCase();
      for (const pt of VALID_PROTOCOL_TYPES) {
        if (name.includes(pt)) {
          companyUpdate.protocol_type = pt;
          break;
        }
      }
    }

    if (Object.keys(companyUpdate).length > 0) {
      await admin.from("crm_companies").update(companyUpdate).eq("id", contact.company_id);
    }
  }

  return NextResponse.json({
    ok: true,
    enriched: {
      contact_fields: Object.keys(contactUpdate),
      company_fields: contact.company_id ? Object.keys(companyUpdate) : [],
    },
  });
}
