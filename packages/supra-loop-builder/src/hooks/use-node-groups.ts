import * as React from "react";
import type { Node, NodeChange } from "@xyflow/react";

export function useNodeGroups(nodes: Node[]) {
  const { lockedGroups, nodeById } = React.useMemo(() => {
    const groups = new Map<string, Set<string>>();
    const byId = new Map<string, Node>();
    for (const n of nodes) {
      byId.set(n.id, n);
      const gid = n.data?.groupId as string | undefined;
      if (gid) {
        if (!groups.has(gid)) groups.set(gid, new Set());
        groups.get(gid)!.add(n.id);
      }
    }
    return { lockedGroups: groups, nodeById: byId };
  }, [nodes]);

  const isNodeInLockedGroup = React.useCallback(
    (nodeId: string): boolean => {
      const gid = nodeById.get(nodeId)?.data?.groupId as string | undefined;
      return !!gid && lockedGroups.has(gid);
    },
    [nodeById, lockedGroups]
  );

  const getGroupId = React.useCallback(
    (nodeId: string): string | null => {
      return (nodeById.get(nodeId)?.data?.groupId as string) ?? null;
    },
    [nodeById]
  );

  return { lockedGroups, isNodeInLockedGroup, getGroupId };
}

export function createGroupId(): string {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `group-${id}`;
}

export function applyGroupDragConstraints(
  changes: NodeChange[],
  nodes: Node[],
  lockedGroups: Map<string, Set<string>>
): NodeChange[] {
  if (lockedGroups.size === 0) return changes;

  const nodeById = new Map<string, Node>();
  for (const n of nodes) nodeById.set(n.id, n);

  const result: NodeChange[] = [];
  const handledGroupDrags = new Set<string>();
  const handledGroupSelects = new Set<string>();

  for (const change of changes) {
    if (
      change.type === "position" &&
      "position" in change &&
      change.position &&
      "dragging" in change &&
      change.dragging
    ) {
      const node = nodeById.get(change.id);
      const gid = node?.data?.groupId as string | undefined;

      if (gid && lockedGroups.has(gid) && !handledGroupDrags.has(gid)) {
        handledGroupDrags.add(gid);
        const dx = change.position.x - node!.position.x;
        const dy = change.position.y - node!.position.y;
        const members = lockedGroups.get(gid)!;
        for (const memberId of members) {
          const memberNode = nodeById.get(memberId);
          if (!memberNode) continue;
          result.push({
            id: memberId,
            type: "position",
            position: {
              x: memberNode.position.x + dx,
              y: memberNode.position.y + dy,
            },
            dragging: true,
          } as NodeChange);
        }
        continue;
      }
      if (gid && handledGroupDrags.has(gid)) continue;
    }

    if (change.type === "select" && "selected" in change && change.selected) {
      const node = nodeById.get(change.id);
      const gid = node?.data?.groupId as string | undefined;

      if (gid && lockedGroups.has(gid) && !handledGroupSelects.has(gid)) {
        handledGroupSelects.add(gid);
        const members = lockedGroups.get(gid)!;
        for (const memberId of members) {
          result.push({
            id: memberId,
            type: "select",
            selected: true,
          } as NodeChange);
        }
        continue;
      }
      if (gid && handledGroupSelects.has(gid)) continue;
    }

    if (change.type === "remove") {
      const node = nodeById.get(change.id);
      const gid = node?.data?.groupId as string | undefined;
      if (gid && lockedGroups.has(gid)) continue;
    }

    result.push(change);
  }

  return result;
}
