"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { getUserNodeById, type UserNodeDefinition } from "../../lib/user-nodes";

/**
 * Generic renderer for user-created custom nodes.
 * Reads field definitions from the stored UserNodeDefinition and renders
 * configured data values.
 */

type UserNodeData = Record<string, unknown> & {
  _userNodeId: string;
  _userNodeDef?: UserNodeDefinition;
  label?: string;
};

export function UserNode({ data }: NodeProps) {
  const d = data as UserNodeData;
  // Resolve definition: prefer embedded, fall back to storage lookup by ID
  const def = d._userNodeDef ?? (d._userNodeId ? getUserNodeById(d._userNodeId) : undefined);
  const color = def?.color ?? "#818cf8";
  const emoji = def?.emoji ?? "🔧";
  const label = (d.label as string) ?? def?.label ?? "Custom Node";
  const inputs = def?.inputs ?? 1;
  const outputs = def?.outputs ?? 1;

  // Render visible fields (skip label since it's in the header, skip internal keys)
  const visibleFields = (def?.fields ?? []).filter(
    (f) => f.key !== "label" && f.key !== "_userNodeId" && f.key !== "_userNodeDef"
  );

  return (
    <div
      className="rounded-xl border-2 px-4 py-3 min-w-[160px] max-w-[240px]"
      style={{
        borderColor: `${color}50`,
        backgroundColor: `${color}0d`,
      }}
    >
      {/* Input handles */}
      {Array.from({ length: inputs }).map((_, i) => (
        <Handle
          key={`in-${i}`}
          type="target"
          position={Position.Left}
          id={`in-${i}`}
          className="!bg-white/40 !w-2 !h-2"
          style={
            inputs > 1
              ? { top: `${((i + 1) / (inputs + 1)) * 100}%` }
              : undefined
          }
        />
      ))}

      {/* Output handles */}
      {Array.from({ length: outputs }).map((_, i) => (
        <Handle
          key={`out-${i}`}
          type="source"
          position={Position.Right}
          id={`out-${i}`}
          className="!bg-white/40 !w-2 !h-2"
          style={
            outputs > 1
              ? { top: `${((i + 1) / (outputs + 1)) * 100}%` }
              : undefined
          }
        />
      ))}

      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{emoji}</span>
        <span className="font-semibold text-sm text-foreground truncate">
          {label}
        </span>
        <span
          className="ml-auto text-[8px] font-medium uppercase tracking-wider opacity-50 shrink-0"
          style={{ color }}
        >
          User
        </span>
      </div>

      {/* Field values */}
      {visibleFields.length > 0 && (
        <div className="space-y-0.5 mt-1">
          {visibleFields.slice(0, 4).map((field) => {
            const value = d[field.key];
            const displayValue = value !== undefined && value !== "" ? String(value) : (field.placeholder || String(field.defaultValue));
            const isPlaceholder = value === undefined || value === "" || value === field.defaultValue;
            return (
              <div key={field.key} className="flex items-center gap-1.5 text-[10px]">
                <span className="text-muted-foreground/60 shrink-0">
                  {field.label}:
                </span>
                <span className={`truncate ${isPlaceholder ? "text-muted-foreground/30 italic" : "text-muted-foreground"}`}>
                  {displayValue}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Description line */}
      {def?.description && visibleFields.length === 0 && (
        <p className="text-[10px] text-muted-foreground/60 truncate">
          {def.description}
        </p>
      )}
    </div>
  );
}
