import { MousePointerClick } from "lucide-react";
import { PART_ROLE_LABELS } from "@/engine/core/part";
import { getMaterial } from "@/engine/catalog/materials";
import { useDerived, useSelectedPart } from "../store/derived";
import { useStudio } from "../store/useStudio";
import { Button } from "../ui";

/**
 * Bottom-left readout: what is under the cursor, or what is selected. It replaces a
 * separate properties palette — at this size the only questions are which panel is this
 * and how big is it.
 */
export function ViewportLegend() {
  const { model } = useDerived();
  const selected = useSelectedPart();
  const hoveredId = useStudio((state) => state.hoveredPartId);
  const openPanelFor = useStudio((state) => state.openPanelFor);
  const hovered = hoveredId ? model.partsById.get(hoveredId) : undefined;
  const part = hovered ?? selected;

  if (!part) {
    return (
      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md border border-line bg-surface/70 px-2.5 py-1.5 text-[11.5px] text-faint backdrop-blur">
        <MousePointerClick className="size-3.5" />
        Click a panel to select it, double-click for its drilling drawing
      </div>
    );
  }

  const holes = part.ops.filter((op) => op.kind === "hole" || op.kind === "edge-hole").length;
  const material = getMaterial(part.materialId);

  return (
    <div className="absolute bottom-3 left-3 max-w-[300px] rounded-lg border border-line bg-surface/90 p-2.5 shadow-lg shadow-black/30 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-medium text-ink">{part.label}</p>
          <p className="text-[11px] text-faint">{PART_ROLE_LABELS[part.role]}</p>
        </div>
        <span
          className="mt-0.5 size-3.5 shrink-0 rounded-sm ring-1 ring-line"
          style={{ background: material.color }}
          aria-hidden
        />
      </div>
      <dl className="tabular mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
        <Row label="Size" value={`${part.length} × ${part.width} × ${part.thickness}`} />
        <Row label="Material" value={material.shortName} />
        <Row label="Grain" value={part.grain === "none" ? "any" : part.grain} />
        <Row label="Holes" value={String(holes)} />
      </dl>
      {selected?.id === part.id ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-full"
          onClick={() => openPanelFor(part.id)}
        >
          Open drilling drawing
        </Button>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="col-span-2 flex justify-between gap-3">
      <dt className="text-faint">{label}</dt>
      <dd className="truncate text-muted">{value}</dd>
    </div>
  );
}
