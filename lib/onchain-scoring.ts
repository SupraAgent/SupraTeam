const DEFAULT_RPC_URL = "https://rpc-mainnet.supra.com";

interface OnChainScoreResult {
  score: number;
  balance: string;
  txCount: number;
}

/**
 * Compute an on-chain score (0-100) for a wallet address by querying balance and tx count.
 * Returns score 0 on any failure.
 */
export async function computeOnChainScore(
  walletAddress: string,
  rpcUrl?: string
): Promise<OnChainScoreResult> {
  const url = rpcUrl || process.env.SUPRA_RPC_URL || DEFAULT_RPC_URL;

  try {
    const [balanceRes, txCountRes] = await Promise.all([
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getBalance",
          params: [walletAddress, "latest"],
          id: 1,
        }),
      }),
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getTransactionCount",
          params: [walletAddress, "latest"],
          id: 2,
        }),
      }),
    ]);

    if (!balanceRes.ok || !txCountRes.ok) {
      throw new Error(`RPC returned ${balanceRes.status}/${txCountRes.status}`);
    }

    const balanceData = await balanceRes.json();
    const txCountData = await txCountRes.json();

    // Check for JSON-RPC level errors (distinct from HTTP errors)
    if (balanceData.error || txCountData.error) {
      throw new Error(`RPC error: ${balanceData.error?.message ?? txCountData.error?.message}`);
    }

    const balanceHex: string = balanceData.result ?? "0x0";
    const txCountHex: string = txCountData.result ?? "0x0";

    const balanceWei = BigInt(balanceHex);
    // Convert from wei (18 decimals) to SUPRA tokens
    // Two-step division to avoid BigInt-to-Number precision loss for large balances
    const balanceSupra = Number(balanceWei / BigInt(1e9)) / 1e9;
    const txCount = parseInt(txCountHex, 16) || 0;

    let score = 0;
    if (balanceSupra > 0) score += 30;
    if (balanceSupra > 1000) score += 20;
    if (txCount > 0) score += 20;
    if (txCount > 10) score += 15;
    if (txCount > 100) score += 15;

    return {
      score,
      balance: balanceSupra.toFixed(4),
      txCount,
    };
  } catch (err) {
    console.error("[onchain-scoring] RPC error:", err);
    return { score: 0, balance: "0", txCount: 0 };
  }
}
