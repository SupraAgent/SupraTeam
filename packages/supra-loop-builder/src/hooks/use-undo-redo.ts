import * as React from "react";
import type { Node, Edge } from "@xyflow/react";

type Snapshot = { nodes: Node[]; edges: Edge[] };

const MAX_HISTORY = 50;
const DEBOUNCE_MS = 300;

export function useUndoRedo(
  nodes: Node[],
  edges: Edge[],
  setNodes: (nodes: Node[]) => void,
  setEdges: (edges: Edge[]) => void
) {
  const past = React.useRef<Snapshot[]>([]);
  const future = React.useRef<Snapshot[]>([]);
  const skipRecord = React.useRef(0);
  const lastSnapshot = React.useRef<string>("");
  const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setVersion] = React.useState(0);

  React.useEffect(() => {
    if (skipRecord.current > 0) {
      skipRecord.current--;
      return;
    }

    // Debounce snapshot capture to avoid stutter during drags
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      const snap = JSON.stringify({ nodes, edges });
      if (snap === lastSnapshot.current) return;

      if (lastSnapshot.current !== "") {
        past.current = [
          ...past.current.slice(-(MAX_HISTORY - 1)),
          JSON.parse(lastSnapshot.current) as Snapshot,
        ];
        future.current = [];
        setVersion((v) => v + 1);
      }
      lastSnapshot.current = snap;
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        // Flush: push the pending snapshot so the last change isn't lost on unmount
        const snap = JSON.stringify({ nodes, edges });
        if (snap !== lastSnapshot.current && lastSnapshot.current !== "") {
          past.current = [
            ...past.current.slice(-(MAX_HISTORY - 1)),
            JSON.parse(lastSnapshot.current) as Snapshot,
          ];
          future.current = [];
          lastSnapshot.current = snap;
        }
      }
    };
  }, [nodes, edges]);

  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;

  const undo = React.useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(JSON.parse(lastSnapshot.current) as Snapshot);
    lastSnapshot.current = JSON.stringify(prev);
    skipRecord.current++;
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setVersion((v) => v + 1);
  }, [setNodes, setEdges]);

  const redo = React.useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(JSON.parse(lastSnapshot.current) as Snapshot);
    lastSnapshot.current = JSON.stringify(next);
    skipRecord.current++;
    setNodes(next.nodes);
    setEdges(next.edges);
    setVersion((v) => v + 1);
  }, [setNodes, setEdges]);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  return { undo, redo, canUndo, canRedo };
}
