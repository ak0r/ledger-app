import { describe, expect, it } from "vitest";
import { resolveDrop, type GridPanel } from "./dashboard-grid-layout";

// Starter-dashboard-shaped layout: 3 Cards (1x1) across the top row, 3
// Lists (2x2) below, matching use-cases/dashboards.ts's own STARTER_PANEL_LAYOUT.
const panels: GridPanel[] = [
  { id: "net-worth", key: "NET_WORTH", x: 0, y: 0 },
  { id: "assets", key: "ASSETS", x: 1, y: 0 },
  { id: "liabilities", key: "LIABILITIES", x: 2, y: 0 },
  { id: "balances", key: "BALANCES", x: 0, y: 1 },
  { id: "recent-expenses", key: "RECENT_EXPENSES", x: 2, y: 1 },
  { id: "recent-transactions", key: "RECENT_TRANSACTIONS", x: 0, y: 3 },
];

describe("resolveDrop", () => {
  it("moves a panel into empty space", () => {
    expect(resolveDrop(panels, "net-worth", 3, 0)).toEqual([{ id: "net-worth", x: 3, y: 0 }]);
  });

  it("is a no-op when dropped back on its own cell", () => {
    expect(resolveDrop(panels, "net-worth", 0, 0)).toEqual([]);
  });

  it("clamps x so a wide panel never runs off the right edge", () => {
    // Balances is 2 wide; column 3 alone would overflow a 4-column grid.
    expect(resolveDrop(panels, "balances", 3, 5)).toEqual([{ id: "balances", x: 2, y: 5 }]);
  });

  it("never produces a negative coordinate", () => {
    // Assets already sits elsewhere, so clamping (-5,-5) to (0,0) is a real move, not a no-op.
    expect(resolveDrop(panels, "assets", -5, -5)).toEqual([
      { id: "assets", x: 0, y: 0 },
      { id: "net-worth", x: 1, y: 0 },
    ]);
  });

  it("swaps two same-dimension panels that fully overlap", () => {
    expect(resolveDrop(panels, "assets", 2, 0)).toEqual([
      { id: "assets", x: 2, y: 0 },
      { id: "liabilities", x: 1, y: 0 },
    ]);
  });

  it("swaps two same-dimension List panels", () => {
    expect(resolveDrop(panels, "balances", 2, 1)).toEqual([
      { id: "balances", x: 2, y: 1 },
      { id: "recent-expenses", x: 0, y: 1 },
    ]);
  });

  it("rejects a drop that partially overlaps a differently-sized panel", () => {
    // Dropping a 1x1 Card onto part of a 2x2 List — not a clean swap.
    expect(resolveDrop(panels, "net-worth", 0, 1)).toBeNull();
  });

  it("rejects a drop that would overlap two panels at once", () => {
    // A 2x2 List dropped straddling two 1x1 Cards.
    expect(resolveDrop(panels, "balances", 1, 0)).toBeNull();
  });

  it("returns null for an unknown dragged id", () => {
    expect(resolveDrop(panels, "ghost", 0, 0)).toBeNull();
  });
});
