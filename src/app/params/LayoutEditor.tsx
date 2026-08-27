import {
  Columns3,
  Plus,
  Rows3,
  Trash2,
} from "lucide-react";
import { Fragment, useMemo } from "react";
import { RAILS } from "@/engine/catalog/hardware";
import { materialsFor } from "@/engine/catalog/materials";
import { formatDim } from "@/engine/core/units";
import { DEFAULT_FITTINGS, makeBay, makeSplit } from "@/engine/spec/defaults";
import {
  FITTING_LABELS,
  type BayNode,
  type Fitting,
  type FittingKind,
  type LayoutNode,
  type SplitNode,
} from "@/engine/spec/types";
import { cn } from "@/lib/cn";
import { useDerived } from "../store/derived";
import { useStudio } from "../store/useStudio";
import { Button, Field, NumberInput, Select, Switch, Tooltip } from "../ui";

/**
 * The layout tree.
 *
 * The wardrobe interior is a recursive set of splits, and pretending otherwise — a flat
 * list of "columns" with "rows" inside — falls apart the moment you want shelves over a
 * drawer bank inside one half of a bay. Editing the tree directly is honest about that,
 * and the indentation makes the nesting legible.
 */
export function LayoutEditor() {
  const layout = useStudio((state) => state.spec.layout);
  return (
    <div className="px-2 pt-1 pb-2">
      <NodeEditor node={layout} depth={0} parentAxis={null} size={null} isRoot />
    </div>
  );
}

type NodeEditorProps = {
  readonly node: LayoutNode;
  readonly depth: number;
  readonly parentAxis: "vertical" | "horizontal" | null;
  readonly size: number | null;
  readonly isRoot?: boolean;
};

function NodeEditor({ node, depth, parentAxis, size, isRoot = false }: NodeEditorProps) {
  return node.kind === "bay" ? (
    <BayEditor bay={node} depth={depth} parentAxis={parentAxis} size={size} isRoot={isRoot} />
  ) : (
    <SplitEditor split={node} depth={depth} parentAxis={parentAxis} size={size} isRoot={isRoot} />
  );
}

type SplitEditorProps = Omit<NodeEditorProps, "node"> & { readonly split: SplitNode };
type BayEditorProps = Omit<NodeEditorProps, "node"> & { readonly bay: BayNode };

function SplitEditor({ split, depth, parentAxis, size, isRoot }: SplitEditorProps) {
  const replaceLayoutNode = useStudio((state) => state.replaceLayoutNode);
  const removeLayoutNode = useStudio((state) => state.removeLayoutNode);

  const addChild = () => {
    const label = split.axis === "vertical" ? `Bay ${split.children.length + 1}` : "Shelves";
    replaceLayoutNode(split.id, {
      ...split,
      children: [...split.children, { size: null, node: makeBay(DEFAULT_FITTINGS.shelves, label) }],
    });
  };

  return (
    <div className={cn("rounded-md", depth > 0 && "border border-line/70 bg-bg/25")}>
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {split.axis === "vertical" ? (
            <Columns3 className="size-3.5 shrink-0 text-accent/80" />
          ) : (
            <Rows3 className="size-3.5 shrink-0 text-info/80" />
          )}
          <span className="truncate text-[11.5px] font-medium tracking-wide text-muted uppercase">
            {split.axis === "vertical" ? "Side by side" : "Stacked"}
          </span>
          <span className="text-[11px] text-faint">{split.children.length}</span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {parentAxis ? <SizeControl nodeId={split.id} axis={parentAxis} size={size} /> : null}
          <Tooltip content={split.axis === "vertical" ? "Add a bay" : "Add a section"}>
            <Button variant="ghost" size="icon-sm" onClick={addChild} aria-label="Add">
              <Plus className="size-3.5" />
            </Button>
          </Tooltip>
          {!isRoot ? (
            <Tooltip content="Remove this group">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeLayoutNode(split.id)}
                aria-label="Remove group"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </Tooltip>
          ) : null}
        </div>
      </div>

      <div className="space-y-1 pb-1.5 pl-2">
        {split.children.map((child) => (
          <Fragment key={child.node.id}>
            <NodeEditor
              node={child.node}
              depth={depth + 1}
              parentAxis={split.axis}
              size={child.size}
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function BayEditor({ bay, depth, parentAxis, size }: BayEditorProps) {
  const selectedBayId = useStudio((state) => state.selectedBayId);
  const selectBay = useStudio((state) => state.selectBay);
  const setFitting = useStudio((state) => state.setFitting);
  const replaceLayoutNode = useStudio((state) => state.replaceLayoutNode);
  const removeLayoutNode = useStudio((state) => state.removeLayoutNode);
  const { model, findings } = useDerived();

  const resolved = model.bays.find((entry) => entry.id === bay.id);
  const bayFindings = findings.filter((finding) => finding.bayId === bay.id);
  const open = selectedBayId === bay.id;

  /* Wrapping a bay in a split is how you subdivide it: the bay becomes the first child
     so nothing the user set up is lost. */
  const wrap = (axis: "vertical" | "horizontal") => {
    replaceLayoutNode(
      bay.id,
      makeSplit(axis, [
        { size: null, node: bay },
        { size: null, node: makeBay(DEFAULT_FITTINGS.shelves, "New") },
      ]),
    );
  };

  return (
    <div
      className={cn(
        "rounded-md border transition-colors",
        open ? "border-accent/50 bg-accent/[0.06]" : "border-line/70 bg-surface/40 hover:border-line-strong",
      )}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          onClick={() => selectBay(open ? null : bay.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="truncate text-[12.5px] text-ink">{bay.label}</span>
          <span className="shrink-0 rounded bg-bg/60 px-1.5 py-px text-[10.5px] text-muted">
            {FITTING_LABELS[bay.fitting.kind]}
          </span>
          {bayFindings.length > 0 ? (
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                bayFindings.some((f) => f.severity === "error") ? "bg-error" : "bg-warn",
              )}
              title={bayFindings.map((f) => f.title).join("\n")}
            />
          ) : null}
        </button>
        {resolved ? (
          <span className="tabular shrink-0 text-[10.5px] text-faint">
            {formatDim(resolved.region.x1 - resolved.region.x0)} ×{" "}
            {formatDim(resolved.region.y1 - resolved.region.y0)}
          </span>
        ) : null}
        {parentAxis ? <SizeControl nodeId={bay.id} axis={parentAxis} size={size} /> : null}
        {depth > 0 ? (
          <Tooltip content="Remove this bay">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => removeLayoutNode(bay.id)}
              aria-label="Remove bay"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </Tooltip>
        ) : null}
      </div>

      {open ? (
        <div className="border-t border-line/60">
          <Field label="Name" htmlFor={`bay-${bay.id}-label`}>
            <input
              id={`bay-${bay.id}-label`}
              value={bay.label}
              onChange={(event) =>
                replaceLayoutNode(bay.id, { ...bay, label: event.target.value })
              }
              className="h-7 w-[150px] rounded-md border border-line bg-bg/60 px-2 text-[12.5px] text-ink outline-none focus:border-accent/60 pointer-coarse:h-11 pointer-coarse:text-[16px]"
            />
          </Field>
          <Field
            label="Contents"
            why="What this compartment is for. The fittings, their hardware and the drilling all follow from this."
          >
            <Select
              value={bay.fitting.kind}
              options={(Object.keys(FITTING_LABELS) as FittingKind[]).map((kind) => ({
                value: kind,
                label: FITTING_LABELS[kind],
              }))}
              onChange={(kind) => setFitting(bay.id, DEFAULT_FITTINGS[kind as FittingKind])}
            />
          </Field>

          <FittingFields bay={bay} />

          <div className="flex items-center gap-1 px-3 py-2">
            <span className="mr-1 text-[11px] text-faint">Divide:</span>
            <Button variant="outline" size="sm" onClick={() => wrap("vertical")}>
              <Columns3 className="size-3.5" />
              Side by side
            </Button>
            <Button variant="outline" size="sm" onClick={() => wrap("horizontal")}>
              <Rows3 className="size-3.5" />
              Stacked
            </Button>
          </div>

          {bayFindings.length > 0 ? (
            <ul className="space-y-1 border-t border-line/60 px-3 py-2">
              {bayFindings.map((finding) => (
                <li key={finding.id} className="text-[11px] leading-snug">
                  <span
                    className={cn(
                      "font-medium",
                      finding.severity === "error" ? "text-error" : finding.severity === "warning" ? "text-warn" : "text-info",
                    )}
                  >
                    {finding.title}
                  </span>
                  <span className="text-faint"> — {finding.detail}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Fixed clear size, or share what is left equally with its siblings. */
function SizeControl({
  nodeId,
  axis,
  size,
}: {
  readonly nodeId: string;
  readonly axis: "vertical" | "horizontal";
  readonly size: number | null;
}) {
  const setChildSize = useStudio((state) => state.setChildSize);
  const label = axis === "vertical" ? "width" : "height";

  return size === null ? (
    <Tooltip content={`Shares the remaining ${label} equally. Click to set a fixed ${label}.`}>
      <button
        type="button"
        onClick={() => setChildSize(nodeId, axis === "vertical" ? 600 : 700)}
        className="h-6 shrink-0 rounded border border-line/80 px-1.5 text-[10.5px] text-faint hover:border-accent/50 hover:text-accent"
      >
        auto
      </button>
    </Tooltip>
  ) : (
    <div className="flex shrink-0 items-center gap-1">
      <NumberInput
        value={size}
        min={80}
        max={3000}
        step={10}
        coarseStep={50}
        width="w-[54px]"
        unit=""
        onChange={(value) => setChildSize(nodeId, value)}
      />
      <Tooltip content={`Back to sharing the ${label}`}>
        <button
          type="button"
          onClick={() => setChildSize(nodeId, null)}
          className="text-[10.5px] text-faint hover:text-accent"
        >
          auto
        </button>
      </Tooltip>
    </div>
  );
}

/* --------------------------------------------------------- fitting details - */

function FittingFields({ bay }: { readonly bay: BayNode }) {
  const setFitting = useStudio((state) => state.setFitting);
  const fitting = bay.fitting;
  const patch = (next: Partial<Fitting>) =>
    setFitting(bay.id, { ...fitting, ...next } as Fitting);

  const shelfMaterials = useMemo(
    () => [
      { value: "", label: "Same as carcase" },
      ...materialsFor("carcase").map((material) => ({
        value: material.id,
        label: material.name,
        hint: `safe span ${material.safeShelfSpan}mm`,
      })),
    ],
    [],
  );

  switch (fitting.kind) {
    case "shelves":
      return (
        <>
          <Field label="Shelves">
            <NumberInput
              value={fitting.count}
              min={0}
              max={20}
              unit=""
              width="w-[54px]"
              onChange={(count) => patch({ count })}
            />
          </Field>
          <Field
            label="Adjustable"
            why="Adjustable shelves sit on pins in the system holes, so they can move later. Fixed shelves are jointed into the sides and also brace the carcase."
          >
            <Switch
              checked={fitting.adjustable}
              label="Adjustable"
              onChange={(adjustable) => patch({ adjustable })}
            />
          </Field>
          <Field label="Spacing">
            <Select
              value={fitting.spacingMode}
              options={[
                { value: "even", label: "Even" },
                { value: "pitch", label: "Fixed pitch" },
              ]}
              onChange={(spacingMode) => patch({ spacingMode: spacingMode as "even" | "pitch" })}
            />
          </Field>
          {fitting.spacingMode === "pitch" ? (
            <Field
              label="Clear height"
              why="Folded shirts want about 300mm, sweaters 350mm. Under 250mm you cannot get a hand in to lift a stack out."
            >
              <NumberInput
                value={fitting.pitch}
                min={80}
                max={800}
                step={10}
                onChange={(pitch) => patch({ pitch })}
              />
            </Field>
          ) : null}
          <Field
            label="Setback"
            why="How far the shelf front sits behind the carcase front edge. A few millimetres stops the shelf fouling a closing door."
          >
            <NumberInput
              value={fitting.setback}
              min={0}
              max={100}
              onChange={(setback) => patch({ setback })}
            />
          </Field>
          <Field
            label="Material"
            why="A thicker board buys span. 18mm sags permanently over about 800mm; 22mm gets you to roughly 1000mm."
            stacked
          >
            <Select
              value={fitting.materialId ?? ""}
              options={shelfMaterials}
              className="w-full max-w-none"
              onChange={(id) => patch({ materialId: id === "" ? null : id })}
            />
          </Field>
        </>
      );

    case "hanging":
      return (
        <>
          <Field label="Rail" stacked>
            <Select
              value={fitting.railId}
              options={RAILS.map((rail) => ({
                value: rail.id,
                label: rail.name,
                hint: `centre support over ${rail.maxSpan}mm`,
              }))}
              className="w-full max-w-none"
              onChange={(railId) => patch({ railId })}
            />
          </Field>
          <Field
            label="Clear height"
            why="Long hang wants 1600 to 1800mm so coats and dresses clear the floor. Short hang — shirts and jackets — needs 900 to 1000mm."
          >
            <NumberInput
              value={fitting.clearHeight}
              min={400}
              max={2400}
              step={10}
              onChange={(clearHeight) => patch({ clearHeight })}
            />
          </Field>
          <Field
            label="Double hang"
            why="Two rails stacked doubles the hanging capacity for shirts and trousers. Each needs 900 to 1000mm clear, so the bay has to be about 2000mm tall inside."
          >
            <Switch
              checked={fitting.doubleHang}
              label="Double hang"
              onChange={(doubleHang) => patch({ doubleHang })}
            />
          </Field>
          {fitting.doubleHang ? (
            <Field label="Lower clear height">
              <NumberInput
                value={fitting.lowerClearHeight}
                min={400}
                max={1600}
                step={10}
                onChange={(lowerClearHeight) => patch({ lowerClearHeight })}
              />
            </Field>
          ) : null}
          <Field
            label="Rail from back"
            why="Centre distance from the back of the carcase. Around half the internal depth keeps a hanger clear of both the back and the door."
          >
            <NumberInput
              value={fitting.railFromBack}
              min={80}
              max={600}
              step={5}
              onChange={(railFromBack) => patch({ railFromBack })}
            />
          </Field>
          <Field
            label="Shelf above"
            why="A fixed shelf above the rail carries the rail supports and braces the carcase at the same time."
          >
            <Switch
              checked={fitting.shelfAbove}
              label="Shelf above"
              onChange={(shelfAbove) => patch({ shelfAbove })}
            />
          </Field>
          {fitting.shelfAbove ? (
            <Field label="Extra shelves above">
              <NumberInput
                value={fitting.shelvesAbove}
                min={0}
                max={6}
                unit=""
                width="w-[54px]"
                onChange={(shelvesAbove) => patch({ shelvesAbove })}
              />
            </Field>
          ) : null}
        </>
      );

    case "drawers":
      return (
        <>
          <Field label="Drawers">
            <NumberInput
              value={fitting.count}
              min={1}
              max={12}
              unit=""
              width="w-[54px]"
              onChange={(count) => patch({ count })}
            />
          </Field>
          <Field
            label="Fronts"
            why="Drawers behind a door do not need fronts, which saves material and lets the boxes be taller."
          >
            <Switch
              checked={fitting.hasFronts}
              label="Fronts"
              onChange={(hasFronts) => patch({ hasFronts })}
            />
          </Field>
          <Field
            label="Internal dividers"
            why="Dividers front to back, for socks and small things that otherwise migrate."
          >
            <NumberInput
              value={fitting.dividers}
              min={0}
              max={6}
              unit=""
              width="w-[54px]"
              onChange={(dividers) => patch({ dividers })}
            />
          </Field>
        </>
      );

    case "shoe-rack":
      return (
        <>
          <Field label="Tiers">
            <NumberInput
              value={fitting.tiers}
              min={1}
              max={10}
              unit=""
              width="w-[54px]"
              onChange={(tiers) => patch({ tiers })}
            />
          </Field>
          <Field
            label="Tilt"
            why="Tilting the shelf shows the shoes and stops them sliding off. 10 to 15 degrees is enough; steeper and a heel catches."
          >
            <NumberInput
              value={fitting.tilt}
              min={0}
              max={30}
              unit="°"
              width="w-[54px]"
              onChange={(tilt) => patch({ tilt })}
            />
          </Field>
          <Field label="Tier pitch">
            <NumberInput
              value={fitting.tierPitch}
              min={100}
              max={400}
              step={10}
              onChange={(tierPitch) => patch({ tierPitch })}
            />
          </Field>
        </>
      );

    case "pullout-trays":
      return (
        <>
          <Field label="Trays">
            <NumberInput
              value={fitting.count}
              min={1}
              max={12}
              unit=""
              width="w-[54px]"
              onChange={(count) => patch({ count })}
            />
          </Field>
          <Field
            label="Tray height"
            why="A shallow tray shows everything at once, which is the whole point of a pull-out over a shelf."
          >
            <NumberInput
              value={fitting.trayHeight}
              min={50}
              max={250}
              step={5}
              onChange={(trayHeight) => patch({ trayHeight })}
            />
          </Field>
        </>
      );

    case "empty":
      return (
        <p className="px-3 py-2 text-[11.5px] leading-snug text-faint">
          Left open. Useful for a laundry basket, a safe, or anything that comes with its own
          furniture.
        </p>
      );
  }
}
