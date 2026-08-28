import { Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useProjectModel } from "../store/derived";
import { placementOf, useStudio } from "../store/useStudio";
import { Button, Select, Tooltip } from "../ui";
import { UNIT_TEMPLATES } from "@/engine/spec/presets";
import { UNIT_KIND_LABELS, type UnitKind } from "@/engine/spec/types";

const KINDS: readonly UnitKind[] = ["wardrobe", "work-table", "counter"];

/**
 * Which unit the parameters below belong to.
 *
 * It sits above the groups rather than inside them because it changes what every group
 * underneath is about, and a project with one unit still shows it — otherwise adding a
 * second unit means finding a control that was not there a moment ago.
 */
export function UnitSwitcher() {
  const project = useProjectModel();
  const selectedUnitId = useStudio((state) => state.selectedUnitId);
  const selectUnit = useStudio((state) => state.selectUnit);
  const duplicateUnit = useStudio((state) => state.duplicateUnit);
  const removeUnit = useStudio((state) => state.removeUnit);
  const renameUnit = useStudio((state) => state.renameUnit);
  const addUnit = useStudio((state) => state.addUnit);
  const spec = useStudio((state) => state.project);

  const [adding, setAdding] = useState(false);
  const placed = placementOf(spec, selectedUnitId);

  return (
    <div className="border-b border-line bg-bg/40 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <Select
          value={selectedUnitId}
          onChange={selectUnit}
          className="min-w-0 flex-1"
          options={project.units.map((unit) => ({
            value: unit.id,
            label: unit.name,
            hint: `${UNIT_KIND_LABELS[unit.kind]} · ${unit.parts.length} panels${
              unit.members.length > 0 ? `, ${unit.members.length} tubes` : ""
            }`,
          }))}
        />
        <Tooltip content="Add a unit to the room">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Add a unit"
            active={adding}
            onClick={() => setAdding((open) => !open)}
          >
            <Plus className="size-3.5" />
          </Button>
        </Tooltip>
        <Tooltip content="Duplicate this unit">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Duplicate this unit"
            onClick={() => duplicateUnit(selectedUnitId)}
          >
            <Copy className="size-3.5" />
          </Button>
        </Tooltip>
        <Tooltip
          content={
            project.units.length > 1 ? "Remove this unit" : "A project needs at least one unit"
          }
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove this unit"
            disabled={project.units.length < 2}
            onClick={() => removeUnit(selectedUnitId)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </Tooltip>
      </div>

      <input
        value={placed.name}
        onChange={(event) => renameUnit(selectedUnitId, event.target.value)}
        aria-label="Unit name"
        placeholder="Unit name"
        className="mt-1.5 h-7 w-full rounded-md border border-line bg-bg/60 px-2 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-accent/60 pointer-coarse:h-11 pointer-coarse:text-[16px]"
      />

      {adding ? (
        <div className="mt-1.5 rounded-md border border-line bg-surface/70 p-1.5">
          {KINDS.map((kind) => {
            const templates = UNIT_TEMPLATES.filter((template) => template.kind === kind);
            if (templates.length === 0) return null;
            return (
              <div key={kind} className="pb-1 last:pb-0">
                <p className="px-1 pb-1 text-[10px] font-medium tracking-wide text-faint uppercase">
                  {UNIT_KIND_LABELS[kind]}
                </p>
                <div className="flex flex-wrap gap-1">
                  {templates.map((template) => (
                    <Tooltip key={template.id} content={template.description}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2 text-[11.5px]"
                        onClick={() => {
                          addUnit(template.build(), template.name);
                          setAdding(false);
                        }}
                      >
                        {template.name}
                      </Button>
                    </Tooltip>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
