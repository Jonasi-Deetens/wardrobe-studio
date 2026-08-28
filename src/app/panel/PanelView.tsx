import { ChevronLeft, ChevronRight, Download, Printer } from "lucide-react";
import { useMemo } from "react";
import { getMaterial } from "@/engine/catalog/materials";
import { OP_PURPOSE_LABELS, PART_ROLE_LABELS, toolList, type Part } from "@/engine/core/part";
import { renderPanelDrawing } from "@/engine/drawing/panel";
import { drawingToSvg, PRINT_THEME } from "@/engine/drawing/svg";
import { partToDxf } from "@/engine/export/dxf";
import { cn } from "@/lib/cn";
import { canPrintInPlace, revealFile, saveFile } from "../lib/platform";
import { useBelow } from "../lib/useMediaQuery";
import { DrawingCanvas } from "../drawing/DrawingCanvas";
import { UnitFilter } from "../shell/UnitFilter";
import { useProjectModel, useUnitScope } from "../store/derived";
import { useStudio } from "../store/useStudio";
import { Button, SegmentedControl, Select, Tooltip } from "../ui";

/**
 * The drilling drawing for one panel.
 *
 * A list of panels down the left, the drawing in the middle, and the machining broken out
 * on the right. Face A and Face B are separate views rather than one drawing with dashed
 * holes, because at the machine you turn the panel over and want to see only what you are
 * about to drill.
 */
export function PanelView() {
  const project = useProjectModel();
  const scope = useUnitScope();
  const selectedId = useStudio((state) => state.selectedPartId);
  const selectPart = useStudio((state) => state.selectPart);
  const face = useStudio((state) => state.selectedFace);
  const setFace = useStudio((state) => state.setFace);
  const hoverParts = useStudio((state) => state.hoverParts);
  const addNotices = useStudio((state) => state.addNotices);
  const stacked = useBelow("lg");

  const machined = useMemo(
    () => scope.parts.filter((part) => part.ops.length > 0),
    [scope.parts],
  );
  const list = machined.length > 0 ? machined : scope.parts;
  /* The selection is room-wide, so a panel selected in 3D can belong to a unit the filter
     has hidden. Falling back to the first panel in the list keeps the two in step. */
  const selected = selectedId ? project.partsById.get(selectedId) : undefined;
  const part = (selected && list.includes(selected) ? selected : undefined) ?? list[0];

  if (!part) {
    return (
      <div className="grid h-full place-items-center bg-bg text-[12.5px] text-faint">
        Nothing to draw yet.
      </div>
    );
  }

  const index = list.findIndex((entry) => entry.id === part.id);
  const step = (delta: number) => {
    const next = list[(index + delta + list.length) % list.length];
    if (next) selectPart(next.id);
  };

  const drawing = renderPanelDrawing(part, face);
  const hasFaceB = part.ops.some(
    (op) => (op.kind === "hole" || op.kind === "groove") && op.face === "B",
  );

  const saveDxf = () => {
    void (async () => {
      const outcome = await saveFile({
        suggestedName: `${slug(part.label)}-face-${face}.dxf`,
        kind: "dxf",
        contents: partToDxf(part, face),
      });
      if (outcome.kind === "failed") addNotices([`Could not save the DXF: ${outcome.reason}`]);
    })();
  };

  /**
   * Print, or the closest thing the webview can do.
   *
   * WKWebView has no `window.print()` and WebKitGTK's is unreliable, so on the desktop the
   * drawing is written out as a print-themed SVG — the same renderer the screen and the PDF
   * use — and the folder is opened so it can be printed from the OS viewer.
   */
  const printSheet = () => {
    if (canPrintInPlace()) {
      window.print();
      return;
    }
    void (async () => {
      const outcome = await saveFile({
        suggestedName: `${slug(part.label)}-face-${face}.svg`,
        kind: "svg",
        contents: drawingToSvg(drawing, { theme: PRINT_THEME }),
      });
      if (outcome.kind === "failed") {
        addNotices([`Could not write the print sheet: ${outcome.reason}`]);
        return;
      }
      if (outcome.kind === "saved" && outcome.path) {
        addNotices(["Print sheet saved. Opening the folder so you can print it."]);
        void revealFile(outcome.path);
      }
    })();
  };

  /* A 220px list next to a phone-width drawing leaves nothing for the drawing, and the
     drawing is the whole point of this view. The list collapses to a picker instead. */
  if (stacked) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-bg">
        <div className="shrink-0 space-y-2 border-b border-line bg-surface px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              onClick={() => step(-1)}
              aria-label="Previous panel"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Select
              value={part.id}
              onChange={selectPart}
              options={list.map((entry) => ({
                value: entry.id,
                label: `${entry.label} · ${entry.length}×${entry.width}`,
              }))}
              className="h-9 min-w-0 max-w-none flex-1 text-[13px]"
            />
            <Button
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              onClick={() => step(1)}
              aria-label="Next panel"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <UnitFilter className="h-9 min-w-0 max-w-[140px] text-[13px]" />
            <p className="tabular min-w-0 flex-1 truncate text-[11px] text-faint">
              {PART_ROLE_LABELS[part.role]} · {part.thickness} thk ·{" "}
              {getMaterial(part.materialId).name}
            </p>
            <SegmentedControl
              ariaLabel="Face"
              size="md"
              value={face}
              onChange={setFace}
              segments={[
                { value: "A", label: "A" },
                { value: "B", label: hasFaceB ? "B" : "B —" },
              ]}
            />
            <Button
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              aria-label="Save this panel as DXF"
              onClick={saveDxf}
            >
              <Download className="size-4" />
            </Button>
          </div>
        </div>

        <DrawingCanvas drawing={drawing} className="min-h-0 flex-1" />

        <details className="ws-scroll max-h-[45%] shrink-0 overflow-y-auto border-t border-line bg-surface">
          <summary className="sticky top-0 flex min-h-11 cursor-pointer list-none items-center bg-surface px-3 text-[11.5px] font-medium tracking-wide text-muted uppercase">
            Machining · {part.ops.length}
          </summary>
          <MachiningList part={part} />
        </details>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_280px]">
      {/* Panel list */}
      <aside className="ws-scroll min-h-0 overflow-y-auto border-r border-line bg-surface">
        <div className="sticky top-0 z-10 space-y-1.5 border-b border-line bg-surface/95 px-3 py-2 backdrop-blur">
          <h2 className="text-[11px] font-medium tracking-wide text-muted uppercase">
            Panels · {list.length}
          </h2>
          <UnitFilter className="w-full max-w-none" />
        </div>
        <ul>
          {list.map((entry) => {
            const holes = entry.ops.filter(
              (op) => op.kind === "hole" || op.kind === "edge-hole",
            ).length;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => selectPart(entry.id)}
                  onMouseEnter={() => hoverParts([entry.id])}
                  onMouseLeave={() => hoverParts([])}
                  className={cn(
                    "flex w-full items-center gap-2 border-b border-line/40 px-3 py-1.5 text-left transition-colors",
                    entry.id === part.id ? "bg-accent/[0.12]" : "hover:bg-hover",
                  )}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-sm ring-1 ring-line"
                    style={{ background: getMaterial(entry.materialId).color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[12px]",
                        entry.id === part.id ? "text-accent" : "text-ink",
                      )}
                    >
                      {entry.label}
                    </span>
                    <span className="tabular block text-[10.5px] text-faint">
                      {entry.length} × {entry.width}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-[10.5px] text-faint">{holes}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Drawing */}
      <div className="flex min-h-0 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
          <div className="flex items-center gap-0.5">
            <Tooltip content="Previous panel">
              <Button variant="ghost" size="icon-sm" onClick={() => step(-1)} aria-label="Previous panel">
                <ChevronLeft className="size-4" />
              </Button>
            </Tooltip>
            <Tooltip content="Next panel">
              <Button variant="ghost" size="icon-sm" onClick={() => step(1)} aria-label="Next panel">
                <ChevronRight className="size-4" />
              </Button>
            </Tooltip>
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[13px] font-semibold text-ink">{part.label}</h1>
            <p className="tabular text-[11px] text-faint">
              {PART_ROLE_LABELS[part.role]} · {part.length} × {part.width} × {part.thickness} ·{" "}
              {getMaterial(part.materialId).name}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <SegmentedControl
              ariaLabel="Face"
              value={face}
              onChange={setFace}
              segments={[
                { value: "A", label: "Face A", tooltip: "The face the drawing is dimensioned from" },
                {
                  value: "B",
                  label: "Face B",
                  tooltip: hasFaceB
                    ? "Mirrored, as the panel lies when turned over"
                    : "Nothing machined on this face",
                },
              ]}
            />
            <Tooltip content="Save this panel as DXF">
              <Button variant="outline" size="sm" onClick={saveDxf}>
                <Download className="size-3.5" />
                DXF
              </Button>
            </Tooltip>
            <Tooltip content={PRINT_HINT}>
              <Button variant="ghost" size="icon-sm" onClick={printSheet} aria-label="Print">
                <Printer className="size-3.5" />
              </Button>
            </Tooltip>
          </div>
        </div>

        <DrawingCanvas drawing={drawing} className="min-h-0 flex-1" />
      </div>

      {/* Machining breakdown */}
      <aside className="ws-scroll hidden min-h-0 overflow-y-auto border-l border-line bg-surface xl:block">
        <MachiningList part={part} />
      </aside>
    </div>
  );
}

function MachiningList({ part }: { readonly part: Part }) {
  const tools = toolList(part);

  const byPurpose = new Map<string, number>();
  for (const op of part.ops) {
    const key = op.kind === "hole" || op.kind === "edge-hole" ? op.purpose : op.kind;
    byPurpose.set(key, (byPurpose.get(key) ?? 0) + 1);
  }

  return (
    <>
      <section className="border-b border-line">
        <h2 className="px-3 py-2 text-[11px] font-medium tracking-wide text-muted uppercase">
          Tools
        </h2>
        {tools.length === 0 ? (
          <p className="px-3 pb-3 text-[11.5px] text-faint">No machining on this panel.</p>
        ) : (
          <ul className="pb-2">
            {tools.map((tool) => (
              <li key={tool.diameter} className="flex items-baseline gap-2 px-3 py-0.5">
                <span className="tabular w-12 shrink-0 text-[12px] text-ink">
                  Ø{tool.diameter}
                </span>
                <span className="tabular w-8 shrink-0 text-right text-[11.5px] text-muted">
                  ×{tool.count}
                </span>
                <span className="min-w-0 truncate text-[11px] text-faint">
                  {tool.purposes
                    .map((purpose) => OP_PURPOSE_LABELS[purpose as keyof typeof OP_PURPOSE_LABELS] ?? purpose)
                    .join(", ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-b border-line">
        <h2 className="px-3 py-2 text-[11px] font-medium tracking-wide text-muted uppercase">
          Operations
        </h2>
        <ul className="pb-2">
          {[...byPurpose.entries()].map(([key, count]) => (
            <li key={key} className="flex justify-between gap-2 px-3 py-0.5 text-[12px]">
              <span className="truncate text-muted">
                {OP_PURPOSE_LABELS[key as keyof typeof OP_PURPOSE_LABELS] ?? key}
              </span>
              <span className="tabular shrink-0 text-ink">{count}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-b border-line">
        <h2 className="px-3 py-2 text-[11px] font-medium tracking-wide text-muted uppercase">
          Datum
        </h2>
        <p className="px-3 pb-3 text-[11.5px] leading-snug text-faint">
          Every coordinate on this drawing is measured from the{" "}
          <span className="text-ink">{part.edgeLabels.l0.toLowerCase()}</span> /{" "}
          <span className="text-ink">{part.edgeLabels.w0.toLowerCase()}</span> corner. Mark that
          corner on the panel before you drill; it is the only thing keeping the two faces
          consistent.
        </p>
      </section>

      {part.notes && part.notes.length > 0 ? (
        <section>
          <h2 className="px-3 py-2 text-[11px] font-medium tracking-wide text-muted uppercase">
            Notes
          </h2>
          <ul className="space-y-1 px-3 pb-3">
            {part.notes.map((note) => (
              <li key={note} className="text-[11.5px] leading-snug text-muted">
                {note}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

const PRINT_HINT = canPrintInPlace()
  ? "Print this drawing"
  : "Save this drawing as a print-ready sheet and open the folder";

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
