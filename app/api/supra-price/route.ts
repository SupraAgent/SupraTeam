import { NextResponse } from "next/server";

let cachedPrice: { price: number; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  if (cachedPrice && Date.now() - cachedPrice.fetchedAt < CACHE_TTL) {
    return NextResponse.json({ price: cachedPrice.price, cached: true });
  }

  try {
    // Fallback: return a placeholder price if no external API is configured
    // In production, this would call CoinGecko/CoinMarketCap/DEX API
    const price = 0.01; // placeholder — replace with real API call
    cachedPrice = { price, fetchedAt: Date.now() };
    return NextResponse.json({ price, cached: false });
  } catch {
    return NextResponse.json({ price: cachedPrice?.price ?? 0.01, cached: true });
  }
}
