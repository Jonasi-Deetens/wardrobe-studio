import { RotateCcw } from "lucide-react";
import { useProjectModel, useSelectedUnit } from "../store/derived";
import { useStudio } from "../store/useStudio";
import { Button, Field, NumberInput, Tooltip } from "../ui";

/**
 * Where the selected unit stands, as numbers rather than as a drag.
 *
 * Dragging in the viewport is how a unit is roughed into place; this is how it is put
 * exactly against a wall or exactly in line with its neighbour. Both write the same
 * placement, and the readout underneath is what the room checks measure against, so a
 * clearance warning can be read off the same panel that caused it.
 */
export function PlacementEditor() {
  const project = useProjectModel();
  const unit = useSelectedUnit();
  const moveUnit = useStudio((state) => state.moveUnit);
  const room = project.spec.room;

  const bounds = unit.bounds;
  const gapLeft = bounds.min[0];
  const gapRight = room.width - bounds.max[0];
  const gapBack = bounds.min[2];
  const gapFront = room.depth - bounds.max[2];

  return (
    <div className="divide-y divide-line/40 pb-1">
      <Field
        label="From the left wall"
        htmlFor="place-x"
        why="Distance from the inside face of the left wall to the unit's own origin. Dragging the plate under the unit in the 3D view does the same thing, and snaps to the walls."
      >
        <NumberInput
          id="place-x"
          value={unit.at.x}
          min={-5000}
          max={room.width + 5000}
          step={10}
          coarseStep={100}
          onChange={(x) => moveUnit(unit.id, { x })}
        />
      </Field>

      <Field
        label="From the back wall"
        htmlFor="place-z"
        why="Zero puts the unit's back against the back wall, which is where a wardrobe normally wants to be — the wall fixings pull against it."
      >
        <NumberInput
          id="place-z"
          value={unit.at.z}
          min={-5000}
          max={room.depth + 5000}
          step={10}
          coarseStep={100}
          onChange={(z) => moveUnit(unit.id, { z })}
        />
      </Field>

      <Field
        label="Rotation"
        htmlFor="place-yaw"
        why="Turns the unit about its own origin, anticlockwise seen from above. A unit against the left wall wants 90 degrees so its front faces into the room and its doors have somewhere to open."
      >
        <NumberInput
          id="place-yaw"
          value={unit.at.yaw}
          min={-360}
          max={360}
          step={15}
          unit="°"
          onChange={(yaw) => moveUnit(unit.id, { yaw })}
        />
      </Field>

      <div className="flex items-center gap-1 px-3 py-2">
        {[0, 90, 180, 270].map((yaw) => (
          <Button
            key={yaw}
            variant="ghost"
            size="sm"
            className="px-2 text-[11.5px]"
            active={normalise(unit.at.yaw) === yaw}
            onClick={() => moveUnit(unit.id, { yaw })}
          >
            {yaw}°
          </Button>
        ))}
        <Tooltip content="Back to the back-left corner, square to the room">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Reset placement"
            className="ml-auto"
            onClick={() => moveUnit(unit.id, { x: 0, z: 0, yaw: 0 })}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </Tooltip>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 text-[11px]">
        <Clearance label="Left wall" value={gapLeft} />
        <Clearance label="Right wall" value={gapRight} />
        <Clearance label="Back wall" value={gapBack} />
        <Clearance label="Front wall" value={gapFront} />
      </dl>
    </div>
  );
}

/** Gaps to the four walls. Negative means the unit is through the wall. */
function Clearance({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-faint">{label}</dt>
      <dd className={value < -1 ? "tabular text-error" : "tabular text-muted"}>
        {Math.round(value)}mm
      </dd>
    </div>
  );
}

function normalise(yaw: number): number {
  return ((Math.round(yaw) % 360) + 360) % 360;
}
