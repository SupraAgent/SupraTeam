import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  telegram_username: string | null;
  telegram_user_id: number | null;
  company: string | null;
  title: string | null;
};

type DuplicateGroup = {
  contacts: Contact[];
  reason: string;
  confidence: number; // 0-100
  signals: string[];
};

function normalize(s: string | null): string {
  return (s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizePhone(p: string | null): string {
  return (p ?? "").replace(/[\s\-\(\)\+\.]/g, "");
}

// Levenshtein distance for fuzzy name matching
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

// Combined name similarity: best of word overlap and Levenshtein
function nameSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;

  // Word overlap score
  const wa = new Set(na.split(" "));
  const wb = new Set(nb.split(" "));
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  const wordScore = shared / Math.max(wa.size, wb.size);

  // Levenshtein score (normalized to 0-1)
  const maxLen = Math.max(na.length, nb.length);
  const levScore = maxLen > 0 ? 1 - levenshtein(na, nb) / maxLen : 0;

  // Reversed name check (e.g. "John Smith" vs "Smith John")
  const aWords = na.split(" ").sort().join(" ");
  const bWords = nb.split(" ").sort().join(" ");
  const sortedLevScore = maxLen > 0 ? 1 - levenshtein(aWords, bWords) / Math.max(aWords.length, bWords.length) : 0;

  return Math.max(wordScore, levScore, sortedLevScore);
}

// Email domain extraction
function emailDomain(email: string | null): string {
  if (!email) return "";
  const parts = email.toLowerCase().trim().split("@");
  return parts.length === 2 ? parts[1] : "";
}

function emailLocal(email: string | null): string {
  if (!email) return "";
  const parts = email.toLowerCase().trim().split("@");
  return parts.length === 2 ? parts[0] : "";
}

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  // Limit to 1000 contacts to prevent O(n^2) blowup on large datasets
  const { data: contacts } = await supabase
    .from("crm_contacts")
    .select("id, name, email, phone, telegram_username, telegram_user_id, company, title")
    .order("name")
    .limit(1000);

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
      const signals: string[] = [];

      // Exact email match
      if (a.email && b.email && normalize(a.email) === normalize(b.email)) {
        confidence += 50;
        reasons.push("same email");
        signals.push("email_exact");
      } else if (a.email && b.email) {
        // Same email local part + similar name = likely same person
        const la = emailLocal(a.email), lb = emailLocal(b.email);
        const da = emailDomain(a.email), db = emailDomain(b.email);
        if (la && lb && la === lb && da !== db) {
          confidence += 20;
          reasons.push("same email username");
          signals.push("email_local");
        }
      }

      // Telegram user ID match (strongest signal)
      if (a.telegram_user_id && b.telegram_user_id && a.telegram_user_id === b.telegram_user_id) {
        confidence += 55;
        reasons.push("same telegram ID");
        signals.push("tg_id_exact");
      }
      // Exact telegram username match
      else if (a.telegram_username && b.telegram_username && normalize(a.telegram_username) === normalize(b.telegram_username)) {
        confidence += 50;
        reasons.push("same telegram");
        signals.push("tg_username_exact");
      }

      // Phone match (normalized)
      const pa = normalizePhone(a.phone);
      const pb = normalizePhone(b.phone);
      if (pa && pb && pa.length >= 7 && (pa === pb || pa.endsWith(pb) || pb.endsWith(pa))) {
        confidence += 40;
        reasons.push("same phone");
        signals.push("phone_match");
      }

      // Name similarity (enhanced with Levenshtein)
      const ns = nameSimilarity(a.name, b.name);
      if (ns >= 0.9) {
        confidence += 35;
        reasons.push("near-identical name");
        signals.push("name_exact");
      } else if (ns >= 0.75) {
        confidence += 25;
        reasons.push("similar name");
        signals.push("name_similar");
      } else if (ns >= 0.5) {
        confidence += 12;
        reasons.push("partial name match");
        signals.push("name_partial");
      }

      // Same company + similar name boost
      if (a.company && b.company && normalize(a.company) === normalize(b.company)) {
        if (ns >= 0.3) {
          confidence += 20;
          reasons.push("same company");
          signals.push("company_match");
        }
      }

      // Same company + same title (likely same person at same org)
      if (a.company && b.company && a.title && b.title &&
          normalize(a.company) === normalize(b.company) &&
          normalize(a.title) === normalize(b.title)) {
        confidence += 10;
        signals.push("title_company_match");
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
          existingGroup.signals = [...new Set([...existingGroup.signals, ...signals])];
        } else {
          groups.push({
            contacts: [a, b],
            reason: reasons.join(", "),
            confidence: Math.min(confidence, 100),
            signals,
          });
        }
      }
    }
  }

  // Sort by confidence descending
  groups.sort((a, b) => b.confidence - a.confidence);

  return NextResponse.json({ groups: groups.slice(0, 50) });
}
