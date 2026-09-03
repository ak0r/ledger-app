"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Settings2, X } from "lucide-react";
import { CONFIGURABLE_PANEL_KEYS, PANEL_DIMENSIONS_BY_KEY, PANEL_NAME_BY_KEY, isPanelKey, type PanelKey } from "@/domain";
import type { DashboardPanelRow } from "@/server/repositories/dashboardPanels";
import { movePanelAction, removePanelAction } from "@/server/actions/dashboards";
import { GRID_COLUMNS, resolveDrop, type GridPanel } from "@/lib/dashboard-grid-layout";
import { Button } from "@/components/ui/button";
import { PanelCatalogueSheet } from "@/components/panel-catalogue-sheet";
import { PanelConfigDialog } from "@/components/panel-config-dialog";

const CELL_ID_PREFIX = "cell:";

function cellId(x: number, y: number): string {
  return `${CELL_ID_PREFIX}${x}:${y}`;
}

function parseCellId(id: string): { x: number; y: number } | null {
  if (!id.startsWith(CELL_ID_PREFIX)) return null;
  const [x, y] = id.slice(CELL_ID_PREFIX.length).split(":").map(Number);
  return { x, y };
}

// Bento grid with drag-and-drop (spec §15) — fixed-size, non-resizable
// cells (spec §13/§14) positioned via CSS grid from each Panel's own
// persisted (x, y) and the registry's fixed dimensions
// (domain/dashboard.ts's PANEL_DIMENSIONS_BY_KEY). An invisible layer of
// 1x1 droppable cells covers the whole grid; dnd-kit's own rectangle
// collision detection picks which cell the dragged panel is over, and
// src/lib/dashboard-grid-layout.ts's resolveDrop decides whether that's a
// move, a swap, or a rejected drop (snaps back — no action call at all).
// No separate Save Layout step: drop -> one movePanelAction call per
// affected panel (spec §15). Panels stay visually clean until hover, which
// reveals a name + drag handle + Configure/Remove header (spec §17) —
// Configure only appears for CONFIGURABLE_PANEL_KEYS (Cards and Budgets
// Needing Review need none, spec §10/§20). Remove is immediate, no
// confirmation (spec §18).
export function DashboardGrid({
  dashboardId,
  panels,
  accounts,
}: {
  dashboardId: string;
  panels: { panel: DashboardPanelRow; content: React.ReactNode }[];
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [configuringPanelId, setConfiguringPanelId] = useState<string | null>(null);
  const [removingPanelId, setRemovingPanelId] = useState<string | null>(null);
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const configuringPanel = panels.find(({ panel }) => panel.id === configuringPanelId)?.panel;
  const activePanel = panels.find(({ panel }) => panel.id === activePanelId)?.panel;

  const validPanels = panels.filter(({ panel }) => isPanelKey(panel.key));
  const gridPanels: GridPanel[] = validPanels.map(({ panel }) => ({ id: panel.id, key: panel.key as PanelKey, x: panel.x, y: panel.y }));
  const gridRows = Math.max(0, ...gridPanels.map((p) => p.y + PANEL_DIMENSIONS_BY_KEY[p.key].height)) + 2;

  async function remove(panelId: string) {
    setRemovingPanelId(panelId);
    const result = await removePanelAction({ panelId });
    setRemovingPanelId(null);
    if (result.success) router.refresh();
  }

  function handleDragStart(event: DragStartEvent) {
    setActivePanelId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActivePanelId(null);
    const target = event.over ? parseCellId(String(event.over.id)) : null;
    if (!target) return;

    const updates = resolveDrop(gridPanels, String(event.active.id), target.x, target.y);
    if (!updates || updates.length === 0) return;

    setPendingMove(true);
    await Promise.all(updates.map(({ id, x, y }) => movePanelAction({ panelId: id, x, y })));
    setPendingMove(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <PanelCatalogueSheet dashboardId={dashboardId} />
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="relative grid grid-cols-4 gap-3" aria-busy={pendingMove}>
          {Array.from({ length: GRID_COLUMNS }, (_, x) =>
            Array.from({ length: gridRows }, (_, y) => <DroppableCell key={cellId(x, y)} x={x} y={y} />),
          )}

          {validPanels.map(({ panel, content }) => {
            const key = panel.key as PanelKey;
            const dimensions = PANEL_DIMENSIONS_BY_KEY[key];
            const configurable = CONFIGURABLE_PANEL_KEYS.includes(key);

            return (
              <DraggablePanel
                key={panel.id}
                id={panel.id}
                x={panel.x}
                y={panel.y}
                width={dimensions.width}
                height={dimensions.height}
                name={PANEL_NAME_BY_KEY[key]}
                controls={
                  <div className="flex items-center gap-1">
                    {configurable && (
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Configure panel" onClick={() => setConfiguringPanelId(panel.id)}>
                        <Settings2 className="size-3.5" aria-hidden="true" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove panel"
                      disabled={removingPanelId === panel.id}
                      onClick={() => remove(panel.id)}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                }
              >
                {content}
              </DraggablePanel>
            );
          })}
        </div>

        <DragOverlay>
          {activePanel && isPanelKey(activePanel.key) ? (
            <div className="rounded-xl bg-card p-3 text-sm font-medium ring-1 ring-foreground/20 shadow-lg">{PANEL_NAME_BY_KEY[activePanel.key]}</div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {configuringPanel && (
        <PanelConfigDialog
          panel={configuringPanel}
          accounts={accounts}
          open={configuringPanelId !== null}
          onOpenChange={(open) => !open && setConfiguringPanelId(null)}
        />
      )}
    </div>
  );
}

function DroppableCell({ x, y }: { x: number; y: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId(x, y) });
  return (
    <div
      ref={setNodeRef}
      className={isOver ? "rounded-xl bg-primary/10 ring-1 ring-primary/30" : undefined}
      style={{ gridColumn: `${x + 1} / span 1`, gridRow: `${y + 1} / span 1` }}
    />
  );
}

// useDraggable is called exactly once here — its `attributes`/`listeners`
// are applied only to the grip handle button, not the outer container, so
// Configure/Remove clicks and content links (e.g. Recent Transactions)
// stay normally clickable instead of every pointer-down starting a drag.
function DraggablePanel({
  id,
  x,
  y,
  width,
  height,
  name,
  controls,
  children,
}: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  controls: React.ReactNode;
  children: React.ReactNode;
}) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id });

  return (
    <div
      ref={setNodeRef}
      className="group relative flex flex-col gap-2 overflow-hidden rounded-xl bg-card p-3 ring-1 ring-foreground/10"
      style={{
        gridColumn: `${x + 1} / span ${width}`,
        gridRow: `${y + 1} / span ${height}`,
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        {/* Name always visible (spec revision — the plain hover-only header
            was hard to scan); only the drag handle + Configure/Remove
            controls stay hover-only, so the frame itself stays quiet. */}
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <button
            type="button"
            className="cursor-grab touch-none opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100"
            aria-label="Drag to move panel"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3.5" aria-hidden="true" />
          </button>
          {name}
        </span>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">{controls}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
