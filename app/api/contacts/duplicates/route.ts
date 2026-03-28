import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { sanitizePostgrestValue } from "@/lib/utils";

function normalize(s: string | null): string {
  return (s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

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

function nameSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  const wa = new Set(na.split(" "));
  const wb = new Set(nb.split(" "));
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  const wordScore = shared / Math.max(wa.size, wb.size);
  const maxLen = Math.max(na.length, nb.length);
  const levScore = maxLen > 0 ? 1 - levenshtein(na, nb) / maxLen : 0;
  const aWords = na.split(" ").sort().join(" ");
  const bWords = nb.split(" ").sort().join(" ");
  const sortedLevScore = maxLen > 0 ? 1 - levenshtein(aWords, bWords) / Math.max(aWords.length, bWords.length) : 0;
  return Math.max(wordScore, levScore, sortedLevScore);
}

type ScoredDuplicate = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  telegram_username: string | null;
  phone: string | null;
  title: string | null;
  confidence: number;
  signals: string[];
};

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  const email = searchParams.get("email");
  const telegram = searchParams.get("telegram");
  const phone = searchParams.get("phone");
  const excludeId = searchParams.get("exclude");

  if (!name && !email && !telegram && !phone) {
    return NextResponse.json({ duplicates: [] });
  }

  // Build OR conditions for candidate matches
  const conditions: string[] = [];
  if (name && name.length >= 2) {
    const s = sanitizePostgrestValue(name);
    if (s) conditions.push(`name.ilike.%${s}%`);
  }
  if (email) {
    const s = sanitizePostgrestValue(email);
    if (s) conditions.push(`email.ilike.%${s}%`);
  }
  if (telegram) {
    const s = sanitizePostgrestValue(telegram);
    if (s) conditions.push(`telegram_username.ilike.%${s}%`);
  }
  if (phone) {
    const s = sanitizePostgrestValue(phone);
    if (s) conditions.push(`phone.ilike.%${s}%`);
  }

  if (conditions.length === 0) {
    return NextResponse.json({ duplicates: [] });
  }

  let query = supabase
    .from("crm_contacts")
    .select("id, name, email, company, telegram_username, phone, title")
    .or(conditions.join(","))
    .limit(20);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data: candidates, error } = await query;

  if (error) {
    console.error("[duplicates] error:", error);
    return NextResponse.json({ duplicates: [] });
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ duplicates: [] });
  }

  // Score each candidate
  const scored: ScoredDuplicate[] = candidates.map((c) => {
    let confidence = 0;
    const signals: string[] = [];

    // Email match
    if (email && c.email && normalize(email) === normalize(c.email)) {
      confidence += 50;
      signals.push("email_exact");
    } else if (email && c.email) {
      const inputLocal = email.toLowerCase().split("@")[0];
      const cLocal = c.email.toLowerCase().split("@")[0];
      if (inputLocal && cLocal && inputLocal === cLocal) {
        confidence += 20;
        signals.push("email_local");
      }
    }

    // Telegram match
    if (telegram && c.telegram_username && normalize(telegram) === normalize(c.telegram_username)) {
      confidence += 50;
      signals.push("tg_exact");
    }

    // Phone match
    if (phone && c.phone) {
      const np = phone.replace(/[\s\-\(\)\+\.]/g, "");
      const cp = c.phone.replace(/[\s\-\(\)\+\.]/g, "");
      if (np.length >= 7 && (np === cp || np.endsWith(cp) || cp.endsWith(np))) {
        confidence += 40;
        signals.push("phone_match");
      }
    }

    // Name match
    if (name && c.name) {
      const ns = nameSimilarity(name, c.name);
      if (ns >= 0.9) {
        confidence += 35;
        signals.push("name_exact");
      } else if (ns >= 0.75) {
        confidence += 25;
        signals.push("name_similar");
      } else if (ns >= 0.5) {
        confidence += 12;
        signals.push("name_partial");
      }
    }

    return { ...c, confidence: Math.min(confidence, 100), signals };
  });

  // Filter to only meaningful matches and sort by confidence
  const duplicates = scored
    .filter((d) => d.confidence >= 25)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);

  return NextResponse.json({ duplicates });
}
