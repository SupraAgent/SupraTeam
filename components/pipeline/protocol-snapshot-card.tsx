"use client";

import { cn } from "@/lib/utils";
import type { Company } from "@/lib/types";
import { Layers, Coins, Rocket, Tag, Globe } from "lucide-react";

interface ProtocolSnapshotCardProps {
  company: Company;
}

const FUNDING_LABELS: Record<string, string> = {
  pre_seed: "Pre-Seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c: "Series C",
  public: "Public",
  bootstrapped: "Bootstrapped",
};

const TOKEN_LABELS: Record<string, string> = {
  pre_tge: "Pre-TGE",
  post_tge: "Post-TGE",
  no_token: "No Token",
};

const PROTOCOL_LABELS: Record<string, string> = {
  defi: "DeFi",
  infrastructure: "Infra",
  gaming: "Gaming",
  nft: "NFT",
  dao: "DAO",
  social: "Social",
  bridge: "Bridge",
  oracle: "Oracle",
  wallet: "Wallet",
  other: "Other",
};

function formatTVL(tvl: number): string {
  if (tvl >= 1_000_000_000) return `$${(tvl / 1_000_000_000).toFixed(1)}B`;
  if (tvl >= 1_000_000) return `$${(tvl / 1_000_000).toFixed(1)}M`;
  if (tvl >= 1_000) return `$${(tvl / 1_000).toFixed(1)}K`;
  return `$${tvl.toLocaleString()}`;
}

export function ProtocolSnapshotCard({ company }: ProtocolSnapshotCardProps) {
  const hasData =
    company.tvl !== null ||
    (company.chain_deployments && company.chain_deployments.length > 0) ||
    company.token_status !== null ||
    company.funding_stage !== null ||
    company.protocol_type !== null;

  if (!hasData) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
      <div className="flex items-center gap-4 flex-wrap text-[11px]">
        {/* TVL */}
        {company.tvl !== null && (
          <div className="flex items-center gap-1.5">
            <Layers className="h-3 w-3 text-emerald-400 shrink-0" />
            <span className="text-muted-foreground">TVL</span>
            <span className="font-medium text-emerald-300">{formatTVL(company.tvl)}</span>
          </div>
        )}

        {/* Protocol type */}
        {company.protocol_type && (
          <div className="flex items-center gap-1.5">
            <Globe className="h-3 w-3 text-blue-400 shrink-0" />
            <span className="rounded bg-blue-500/10 border border-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-300">
              {PROTOCOL_LABELS[company.protocol_type] ?? company.protocol_type}
            </span>
          </div>
        )}

        {/* Token status */}
        {company.token_status && (
          <div className="flex items-center gap-1.5">
            <Coins className="h-3 w-3 text-amber-400 shrink-0" />
            <span className={cn(
              "rounded px-1.5 py-0.5 text-[10px] border",
              company.token_status === "post_tge"
                ? "bg-amber-500/10 border-amber-500/15 text-amber-300"
                : company.token_status === "pre_tge"
                  ? "bg-orange-500/10 border-orange-500/15 text-orange-300"
                  : "bg-white/5 border-white/10 text-muted-foreground"
            )}>
              {TOKEN_LABELS[company.token_status] ?? company.token_status}
            </span>
          </div>
        )}

        {/* Funding stage */}
        {company.funding_stage && (
          <div className="flex items-center gap-1.5">
            <Rocket className="h-3 w-3 text-purple-400 shrink-0" />
            <span className="rounded bg-purple-500/10 border border-purple-500/15 px-1.5 py-0.5 text-[10px] text-purple-300">
              {FUNDING_LABELS[company.funding_stage] ?? company.funding_stage}
            </span>
          </div>
        )}

        {/* Chain deployments */}
        {company.chain_deployments && company.chain_deployments.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Tag className="h-3 w-3 text-cyan-400 shrink-0" />
            <div className="flex items-center gap-1 flex-wrap">
              {company.chain_deployments.map((chain) => (
                <span
                  key={chain}
                  className="rounded bg-cyan-500/10 border border-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-300"
                >
                  {chain}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
