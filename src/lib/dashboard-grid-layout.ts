import { PANEL_DIMENSIONS_BY_KEY, type PanelKey } from "@/core";

// Pure drop-resolution for the Bento grid drag-and-drop (spec §15) — kept
// separate from dashboard-grid.tsx so it's testable without dnd-kit/DOM.
//
// ponytail: the collision rule is deliberately narrow — an empty target
// always succeeds; a target fully covered by exactly one same-dimensions
// panel swaps with it; anything else (partial overlap, multiple panels in
// the way, mismatched dimensions) is rejected outright rather than
// attempting a general reflow. Upgrade path if that ever feels too
// restrictive: a real bin-packing/push-aside algorithm.
export const GRID_COLUMNS = 4;

export interface GridPanel {
  id: string;
  key: PanelKey;
  x: number;
  y: number;
}

export interface GridPlacement {
  id: string;
  x: number;
  y: number;
}

function occupiedCells(x: number, y: number, width: number, height: number): Set<string> {
  const cells = new Set<string>();
  for (let dx = 0; dx < width; dx++) {
    for (let dy = 0; dy < height; dy++) {
      cells.add(`${x + dx},${y + dy}`);
    }
  }
  return cells;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((cell) => b.has(cell));
}

// Returns the placement updates to apply (1 entry for a move into empty
// space, 2 for a swap), an empty array for a no-op drop back onto its own
// cell, or null if the drop must be rejected (snap back, no state change).
export function resolveDrop(panels: readonly GridPanel[], draggedId: string, targetX: number, targetY: number): GridPlacement[] | null {
  const dragged = panels.find((p) => p.id === draggedId);
  if (!dragged) return null;

  const dims = PANEL_DIMENSIONS_BY_KEY[dragged.key];
  const x = Math.max(0, Math.min(targetX, GRID_COLUMNS - dims.width));
  const y = Math.max(0, targetY);
  if (x === dragged.x && y === dragged.y) return [];

  const proposedCells = occupiedCells(x, y, dims.width, dims.height);
  const overlapping = panels.filter((panel) => {
    if (panel.id === draggedId) return false;
    const panelDims = PANEL_DIMENSIONS_BY_KEY[panel.key];
    const panelCells = occupiedCells(panel.x, panel.y, panelDims.width, panelDims.height);
    return [...panelCells].some((cell) => proposedCells.has(cell));
  });

  if (overlapping.length === 0) return [{ id: draggedId, x, y }];

  if (overlapping.length === 1) {
    const other = overlapping[0];
    const otherDims = PANEL_DIMENSIONS_BY_KEY[other.key];
    if (otherDims.width === dims.width && otherDims.height === dims.height) {
      const otherCells = occupiedCells(other.x, other.y, otherDims.width, otherDims.height);
      if (setsEqual(otherCells, proposedCells)) {
        return [
          { id: draggedId, x, y },
          { id: other.id, x: dragged.x, y: dragged.y },
        ];
      }
    }
  }

  return null;
}
