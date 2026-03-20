import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  telegram_username: string | null;
  company: string | null;
};

type DuplicateGroup = {
  contacts: Contact[];
  reason: string;
  confidence: number; // 0-100
};

function normalize(s: string | null): string {
  return (s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizePhone(p: string | null): string {
  return (p ?? "").replace(/[\s\-\(\)\+\.]/g, "");
}

// Simple similarity: shared word ratio
function nameSimilarity(a: string, b: string): number {
  const wa = new Set(normalize(a).split(" "));
  const wb = new Set(normalize(b).split(" "));
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.max(wa.size, wb.size);
}

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data: contacts } = await supabase
    .from("crm_contacts")
    .select("id, name, email, phone, telegram_username, company")
    .order("name");

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ groups: [] });
  }

  const groups: DuplicateGroup[] = [];
  const paired = new Set<string>();

  for (let i = 0; i < contacts.length; i++) {
    for (let j = i + 1; j < contacts.length; j++) {
      const a = contacts[i];
      const b = contacts[j];
      const key = [a.id, b.id].sort().join(":");
      if (paired.has(key)) continue;

      let confidence = 0;
      const reasons: string[] = [];

      // Exact email match
      if (a.email && b.email && normalize(a.email) === normalize(b.email)) {
        confidence += 50;
        reasons.push("same email");
      }

      // Exact telegram match
      if (a.telegram_username && b.telegram_username && normalize(a.telegram_username) === normalize(b.telegram_username)) {
        confidence += 50;
        reasons.push("same telegram");
      }

      // Phone match (normalized)
      const pa = normalizePhone(a.phone);
      const pb = normalizePhone(b.phone);
      if (pa && pb && pa.length >= 7 && (pa === pb || pa.endsWith(pb) || pb.endsWith(pa))) {
        confidence += 40;
        reasons.push("same phone");
      }

      // Name similarity
      const ns = nameSimilarity(a.name, b.name);
      if (ns >= 0.8) {
        confidence += 30;
        reasons.push("similar name");
      } else if (ns >= 0.5) {
        confidence += 15;
        reasons.push("partial name match");
      }

      // Same company + similar name boost
      if (a.company && b.company && normalize(a.company) === normalize(b.company) && ns >= 0.3) {
        confidence += 20;
        reasons.push("same company");
      }

      if (confidence >= 40) {
        paired.add(key);
        // Check if either contact is already in a group
        const existingGroup = groups.find((g) =>
          g.contacts.some((c) => c.id === a.id || c.id === b.id)
        );
        if (existingGroup) {
          if (!existingGroup.contacts.some((c) => c.id === a.id)) existingGroup.contacts.push(a);
          if (!existingGroup.contacts.some((c) => c.id === b.id)) existingGroup.contacts.push(b);
          existingGroup.confidence = Math.max(existingGroup.confidence, Math.min(confidence, 100));
        } else {
          groups.push({
            contacts: [a, b],
            reason: reasons.join(", "),
            confidence: Math.min(confidence, 100),
          });
        }
      }
    }
  }

  // Sort by confidence descending
  groups.sort((a, b) => b.confidence - a.confidence);

  return NextResponse.json({ groups: groups.slice(0, 50) });
}
