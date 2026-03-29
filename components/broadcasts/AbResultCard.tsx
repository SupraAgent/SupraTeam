"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Send, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AbResultCardProps {
  result: {
    broadcast_id: string;
    message_preview: string;
    variant_a: { sent: number; responded: number; rate: number };
    variant_b: { sent: number; responded: number; rate: number };
  };
}

export function AbResultCard({ result }: AbResultCardProps) {
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [winnerData, setWinnerData] = React.useState<{ winner: string | null; already_sent: boolean } | null>(null);

  React.useEffect(() => {
    fetch(`/api/broadcasts/ab-winner?broadcast_id=${result.broadcast_id}`)
      .then((r) => r.json())
      .then((d) => setWinnerData({ winner: d.winner, already_sent: d.already_sent }))
      .catch(() => {});
  }, [result.broadcast_id]);

  async function sendWinner(winner: string) {
    setSending(true);
    try {
      const res = await fetch("/api/broadcasts/ab-winner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broadcast_id: result.broadcast_id, winner }),
      });
      const data = await res.json();
      if (data.ok) {
        setSent(true);
        toast.success(`Winner variant ${winner} sent to ${data.sent} groups`);
      } else {
        toast.error(data.error ?? "Failed to send winner");
      }
    } finally {
      setSending(false);
    }
  }

  const aWins = result.variant_a.rate > result.variant_b.rate;
  const bWins = result.variant_b.rate > result.variant_a.rate;
  const winner = winnerData?.winner;
  const alreadySent = winnerData?.already_sent || sent;

  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-2">
      <p className="text-xs text-muted-foreground truncate">{result.message_preview || "Broadcast"}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className={cn("rounded-lg p-2 border", aWins ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/5")}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-foreground">Variant A</span>
            {aWins && <span className="text-[9px] text-emerald-400 font-medium">Winner</span>}
          </div>
          <p className={cn("text-lg font-bold", aWins ? "text-emerald-400" : "text-foreground")}>{result.variant_a.rate}%</p>
          <p className="text-[10px] text-muted-foreground">{result.variant_a.responded}/{result.variant_a.sent} responses</p>
        </div>
        <div className={cn("rounded-lg p-2 border", bWins ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/5")}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-foreground">Variant B</span>
            {bWins && <span className="text-[9px] text-emerald-400 font-medium">Winner</span>}
          </div>
          <p className={cn("text-lg font-bold", bWins ? "text-emerald-400" : "text-foreground")}>{result.variant_b.rate}%</p>
          <p className="text-[10px] text-muted-foreground">{result.variant_b.responded}/{result.variant_b.sent} responses</p>
        </div>
      </div>
      {winner && !alreadySent && (
        <Button
          size="sm"
          onClick={() => sendWinner(winner)}
          disabled={sending}
          className="w-full"
        >
          <Send className="mr-1.5 h-3.5 w-3.5" />
          {sending ? "Sending..." : `Send Variant ${winner} to remaining groups`}
        </Button>
      )}
      {alreadySent && (
        <p className="text-[10px] text-emerald-400/60 text-center flex items-center justify-center gap-1">
          <Check className="h-3 w-3" /> Winner sent to remaining groups
        </p>
      )}
      {!winner && !alreadySent && (
        <p className="text-[10px] text-muted-foreground/60 text-center">
          Need more data to determine winner (min 3 recipients + 2 responses per variant)
        </p>
      )}
    </div>
  );
}
