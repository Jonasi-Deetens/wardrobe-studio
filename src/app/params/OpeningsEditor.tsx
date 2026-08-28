import { Plus, Trash2 } from "lucide-react";
import type { Opening, WallSide } from "@/engine/spec/types";
import { useStudio } from "../store/useStudio";
import { Button, NumberInput, Select, Tooltip } from "../ui";

/**
 * Windows and doorways in the walls.
 *
 * They are holes and nothing more: no frame, no sill, no glazing. That is enough to answer
 * the only questions the room has to answer — where the daylight comes in, and whether a
 * unit is standing in front of it — and it keeps them out of the cut list, where a window
 * has no business being.
 */

const WALLS: readonly { value: WallSide; label: string }[] = [
  { value: "back", label: "Back wall" },
  { value: "right", label: "Right wall" },
  { value: "front", label: "Front wall" },
  { value: "left", label: "Left wall" },
];

export function OpeningsEditor() {
  const openings = useStudio((state) => state.project.room.openings);
  const room = useStudio((state) => state.project.room);
  const setValue = useStudio((state) => state.setValue);

  const write = (next: readonly Opening[]): void => setValue(["room", "openings"], next);

  const add = (): void => {
    const wall: WallSide = "back";
    write([
      ...openings,
      {
        id: `win-${Date.now().toString(36)}`,
        wall,
        x: 400,
        /* Sill at 900 and 1300 high is an ordinary window; a doorway is the same thing
           with the sill on the floor. */
        sill: 900,
        width: 1200,
        height: 1300,
      },
    ]);
  };

  const update = (id: string, patch: Partial<Opening>): void =>
    write(openings.map((opening) => (opening.id === id ? { ...opening, ...patch } : opening)));

  return (
    <div className="px-3 pt-1 pb-2">
      <div className="flex items-center justify-between gap-2 pb-1.5">
        <span className="text-[11px] text-faint">
          {openings.length === 0
            ? "No windows or doorways"
            : `${openings.length} ${openings.length === 1 ? "opening" : "openings"}`}
        </span>
        <Tooltip content="Add a window">
          <Button variant="ghost" size="sm" className="px-2 text-[11.5px]" onClick={add}>
            <Plus className="size-3.5" />
            Window
          </Button>
        </Tooltip>
      </div>

      <div className="flex flex-col gap-1.5">
        {openings.map((opening) => {
          const wallLength =
            opening.wall === "back" || opening.wall === "front" ? room.width : room.depth;
          return (
            <div
              key={opening.id}
              className="rounded-md border border-line bg-bg/50 p-1.5 pointer-coarse:p-2"
            >
              <div className="flex items-center gap-1.5">
                <Select
                  value={opening.wall}
                  options={WALLS}
                  onChange={(wall) => update(opening.id, { wall: wall as WallSide })}
                  className="min-w-0 flex-1"
                />
                <Tooltip content="Remove this opening">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove this opening"
                    onClick={() =>
                      write(openings.filter((other) => other.id !== opening.id))
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </Tooltip>
              </div>

              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <Cell label="Along wall">
                  <NumberInput
                    value={opening.x}
                    min={0}
                    max={Math.max(wallLength - opening.width, 0)}
                    step={10}
                    onChange={(x) => update(opening.id, { x })}
                  />
                </Cell>
                <Cell label="Sill">
                  <NumberInput
                    value={opening.sill}
                    min={0}
                    max={Math.max(room.height - 100, 0)}
                    step={10}
                    onChange={(sill) => update(opening.id, { sill })}
                  />
                </Cell>
                <Cell label="Width">
                  <NumberInput
                    value={opening.width}
                    min={100}
                    max={wallLength}
                    step={10}
                    onChange={(width) => update(opening.id, { width })}
                  />
                </Cell>
                <Cell label="Height">
                  <NumberInput
                    value={opening.height}
                    min={100}
                    max={Math.max(room.height - opening.sill, 100)}
                    step={10}
                    onChange={(height) => update(opening.id, { height })}
                  />
                </Cell>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Cell({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-1.5">
      <span className="shrink-0 text-[11px] text-faint">{label}</span>
      {children}
    </label>
  );
}
