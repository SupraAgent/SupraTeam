"use client";

import * as React from "react";
import type { GraphNode, GraphEdge, RelationshipType } from "@/lib/types";

interface RelationshipDetailPanelProps {
  edge: GraphEdge;
  nodes: GraphNode[];
  onClose: () => void;
  onAddRelationship?: (contactAId: string, contactBId: string, type: RelationshipType) => void;
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  colleague: "Colleague",
  reports_to: "Reports To",
  manages: "Manages",
  introduced_by: "Introduced By",
  partner: "Partner",
  advisor: "Advisor",
  investor: "Investor",
  custom: "Custom",
};

export function RelationshipDetailPanel({
  edge,
  nodes,
  onClose,
  onAddRelationship,
}: RelationshipDetailPanelProps) {
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [relType, setRelType] = React.useState<RelationshipType>("colleague");

  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);

  if (!sourceNode || !targetNode) return null;

  const strength = edge.strength ?? 0;
  const strengthPct = Math.min(100, Math.max(0, strength));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Relationship
        </h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          &times;
        </button>
      </div>

      {/* Contact pair */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#60a5fa] shrink-0" />
          <span className="text-xs text-foreground font-medium truncate">{sourceNode.label}</span>
        </div>
        <div className="text-center text-[10px] text-muted-foreground/40">&darr;</div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#60a5fa] shrink-0" />
          <span className="text-xs text-foreground font-medium truncate">{targetNode.label}</span>
        </div>
      </div>

      {/* Strength bar */}
      <div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>Strength</span>
          <span>{`${strength}`}</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${strengthPct}%`,
              backgroundColor:
                strength > 60 ? "#34d399" : strength > 30 ? "#fbbf24" : "#f87171",
            }}
          />
        </div>
      </div>

      {/* Relationship type */}
      {edge.label && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Type</span>
          <span className="text-foreground">{RELATIONSHIP_LABELS[edge.label] ?? edge.label}</span>
        </div>
      )}

      {/* Shared context */}
      {Boolean(sourceNode.meta.company || targetNode.meta.company) && (
        <div className="text-xs text-muted-foreground/60">
          {sourceNode.meta.company === targetNode.meta.company && sourceNode.meta.company
            ? `Same company: ${String(sourceNode.meta.company)}`
            : [sourceNode.meta.company, targetNode.meta.company].filter(Boolean).map(String).join(" / ")}
        </div>
      )}

      {/* Add explicit relationship */}
      {!edge.label && onAddRelationship && (
        <>
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full rounded-lg border border-white/10 text-xs text-muted-foreground py-1.5 hover:bg-white/[0.03] transition"
            >
              Add Relationship Type
            </button>
          ) : (
            <div className="space-y-2">
              <select
                value={relType}
                onChange={(e) => setRelType(e.target.value as RelationshipType)}
                className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-xs text-foreground focus:outline-none"
              >
                {Object.entries(RELATIONSHIP_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    onAddRelationship(edge.source, edge.target, relType);
                    setShowAddForm(false);
                  }}
                  className="flex-1 rounded-lg bg-primary/20 text-primary text-xs font-medium py-1.5 hover:bg-primary/30 transition"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="rounded-lg border border-white/10 text-muted-foreground text-xs px-2.5 py-1.5 hover:bg-white/[0.03] transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
