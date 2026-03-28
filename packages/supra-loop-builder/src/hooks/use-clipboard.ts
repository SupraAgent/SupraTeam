import * as React from "react";
import type { Node, Edge } from "@xyflow/react";
import { deepCloneNodeData, uid } from "../lib/utils";

export function useClipboard(
  nodes: Node[],
  edges: Edge[],
  setNodes: (updater: (nds: Node[]) => Node[]) => void,
  setEdges: (updater: (eds: Edge[]) => Edge[]) => void
) {
  const clipboard = React.useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const nodesRef = React.useRef(nodes);
  const edgesRef = React.useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === "c") {
        const selected = nodesRef.current.filter((n) => n.selected);
        if (selected.length === 0) return;
        e.preventDefault();
        const selectedIds = new Set(selected.map((n) => n.id));
        const selectedEdges = edgesRef.current.filter(
          (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target)
        );
        clipboard.current = {
          nodes: selected.map((n) => ({
            ...n,
            data: deepCloneNodeData(n.data),
            position: { ...n.position },
          })),
          edges: selectedEdges.map((e) => ({ ...e })),
        };
      }

      if (mod && e.key === "v") {
        if (!clipboard.current || clipboard.current.nodes.length === 0) return;
        e.preventDefault();

        const pasteId = uid("paste");
        const idMap: Record<string, string> = {};
        const oldGroupIds = new Set<string>();
        for (const n of clipboard.current.nodes) {
          if (n.data?.groupId) oldGroupIds.add(n.data.groupId as string);
        }
        const groupRemap: Record<string, string> = {};
        for (const gid of oldGroupIds) {
          groupRemap[gid] = uid("group");
        }

        const newNodes = clipboard.current.nodes.map((n, i) => {
          const newId = `${n.type}-${pasteId}-${i}`;
          idMap[n.id] = newId;
          const newGroupId = n.data?.groupId
            ? groupRemap[n.data.groupId as string]
            : undefined;
          return {
            ...n,
            id: newId,
            position: { x: n.position.x + 40, y: n.position.y + 40 },
            data: { ...deepCloneNodeData(n.data), groupId: newGroupId },
            selected: true,
            className: newGroupId ? "locked-group" : undefined,
          };
        });

        const newEdges = clipboard.current.edges.map((edge, i) => ({
          ...edge,
          id: `e-${pasteId}-${i}`,
          source: idMap[edge.source] ?? edge.source,
          target: idMap[edge.target] ?? edge.target,
        }));

        setNodes((nds) => [
          ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
          ...newNodes,
        ]);
        setEdges((eds) => [...eds, ...newEdges]);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setNodes, setEdges]);
}
