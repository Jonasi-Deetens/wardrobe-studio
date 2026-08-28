import {
  Box,
  Boxes,
  DoorClosed,
  DoorOpen,
  Eye,
  Focus,
  Grid3x3,
  Home,
  Layers,
  Ruler,
  ScanEye,
  Square,
  Triangle,
  Wrench,
} from "lucide-react";
import { PART_ROLE_LABELS, type PartRole } from "@/engine/core/part";
import { cn } from "@/lib/cn";
import { useStudio, type StandardView } from "../store/useStudio";
import { Button, SegmentedControl, Slider, Tooltip } from "../ui";

const VIEWS: readonly { id: StandardView; label: string; key: string }[] = [
  { id: "front", label: "Front", key: "1" },
  { id: "left", label: "Left", key: "2" },
  { id: "right", label: "Right", key: "3" },
  { id: "back", label: "Back", key: "4" },
  { id: "top", label: "Plan", key: "5" },
  { id: "iso", label: "Iso", key: "6" },
];

const ISOLATE_ROLES: readonly PartRole[] = [
  "side",
  "top",
  "bottom",
  "divider",
  "fixed-shelf",
  "adjustable-shelf",
  "door",
  "drawer-front",
];

/**
 * Viewport chrome. It floats over the canvas rather than sitting in a toolbar above it,
 * so the 3D view keeps the full height of the pane — the wardrobe is a tall object and
 * vertical space is the scarce resource.
 */
export function ViewportControls() {
  const view = useStudio((state) => state.view);
  const setView = useStudio((state) => state.setView);
  const requestView = useStudio((state) => state.requestView);
  const units = useStudio((state) => state.project.units.length);

  return (
    <>
      {/* Standard views and projection, top left. */}
      <div className="pointer-events-none absolute top-3 left-3 flex flex-col items-start gap-2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-line bg-surface/85 p-1 shadow-lg shadow-black/30 backdrop-blur">
          {VIEWS.map((entry) => (
            <Tooltip key={entry.id} content={`${entry.label} view (${entry.key})`}>
              <Button
                variant="ghost"
                size="sm"
                className="px-2"
                onClick={() => requestView(entry.id)}
              >
                {entry.label}
              </Button>
            </Tooltip>
          ))}
          <div className="mx-0.5 h-5 w-px bg-line" />
          <SegmentedControl
            ariaLabel="Projection"
            value={view.projection}
            onChange={(projection) => setView({ projection })}
            segments={[
              { value: "perspective", icon: <Box className="size-3.5" />, tooltip: "Perspective" },
              {
                value: "orthographic",
                icon: <Square className="size-3.5" />,
                tooltip: "Orthographic — for checking reveals and depths",
              },
            ]}
          />
        </div>
      </div>

      {/* Display toggles, top right. */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface/85 p-1 shadow-lg shadow-black/30 backdrop-blur">
          <Toggle
            active={view.grid}
            label="Grid"
            onClick={() => setView({ grid: !view.grid })}
            icon={<Grid3x3 className="size-3.5" />}
          />
          <Toggle
            active={view.dimensions}
            label="Dimensions"
            onClick={() => setView({ dimensions: !view.dimensions })}
            icon={<Ruler className="size-3.5" />}
          />
          <Toggle
            active={view.xray}
            label="X-ray — see the interior through the carcase"
            onClick={() => setView({ xray: !view.xray })}
            icon={<ScanEye className="size-3.5" />}
          />
          <div className="mx-0.5 h-5 w-px bg-line" />
          <Toggle
            active={view.showDoors}
            label={view.showDoors ? "Hide fronts" : "Show fronts"}
            onClick={() => setView({ showDoors: !view.showDoors })}
            icon={<DoorClosed className="size-3.5" />}
          />
          <Toggle
            active={view.showBack}
            label={view.showBack ? "Hide back panel" : "Show back panel"}
            onClick={() => setView({ showBack: !view.showBack })}
            icon={<Layers className="size-3.5" />}
          />
          <Toggle
            active={view.showHardware}
            label={
              view.showHardware
                ? "Hide hardware — rails, handles and fixings"
                : "Show hardware — rails, handles and fixings"
            }
            onClick={() => setView({ showHardware: !view.showHardware })}
            icon={<Wrench className="size-3.5" />}
          />
          <div className="mx-0.5 h-5 w-px bg-line" />
          <Toggle
            active={view.showRoom}
            label={view.showRoom ? "Hide the room" : "Show the room — floor, walls, openings"}
            onClick={() => setView({ showRoom: !view.showRoom })}
            icon={<Home className="size-3.5" />}
          />
          <Toggle
            active={view.showRoof}
            label={view.showRoof ? "Hide the roof" : "Show the roof"}
            onClick={() => setView({ showRoof: !view.showRoof })}
            icon={<Triangle className="size-3.5" />}
          />
          {units > 1 ? (
            <Toggle
              active={view.isolateUnit}
              label={
                view.isolateUnit
                  ? "Show every unit in the room"
                  : "Work on the selected unit alone"
              }
              onClick={() => setView({ isolateUnit: !view.isolateUnit })}
              icon={<Focus className="size-3.5" />}
            />
          ) : null}
        </div>

        <IsolateMenu />
      </div>

      {/* Explode and door swing, bottom centre. Both are continuous, so they get
          sliders rather than toggles: half-open is often the clearest view. */}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-lg border border-line bg-surface/85 px-3 py-2 shadow-lg shadow-black/30 backdrop-blur">
        <SliderControl
          icon={<Boxes className="size-3.5" />}
          label="Explode"
          value={view.explode}
          onChange={(explode) => setView({ explode })}
        />
        <div className="h-6 w-px bg-line" />
        <SliderControl
          icon={view.doorsOpen > 0.02 ? <DoorOpen className="size-3.5" /> : <DoorClosed className="size-3.5" />}
          label="Open"
          value={view.doorsOpen}
          onChange={(doorsOpen) => setView({ doorsOpen })}
        />
      </div>
    </>
  );
}

type ToggleProps = {
  readonly active: boolean;
  readonly label: string;
  readonly onClick: () => void;
  readonly icon: React.ReactNode;
};

function Toggle({ active, label, onClick, icon }: ToggleProps) {
  return (
    <Tooltip content={label}>
      <Button
        variant="ghost"
        size="icon-sm"
        active={active}
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
      >
        {icon}
      </Button>
    </Tooltip>
  );
}

type SliderControlProps = {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
};

function SliderControl({ icon, label, value, onChange }: SliderControlProps) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("text-faint", value > 0.02 && "text-accent")}>{icon}</span>
      <span className="w-[46px] text-[11.5px] text-muted select-none">{label}</span>
      <Slider value={value} onChange={onChange} label={label} className="w-[110px]" />
      <button
        type="button"
        onClick={() => onChange(0)}
        className={cn(
          "tabular w-8 text-right text-[11px] transition-colors",
          value > 0.02 ? "text-accent hover:underline" : "text-faint",
        )}
      >
        {Math.round(value * 100)}%
      </button>
    </div>
  );
}

function IsolateMenu() {
  const isolateRole = useStudio((state) => state.view.isolateRole);
  const setView = useStudio((state) => state.setView);

  return (
    <div className="flex max-w-[280px] flex-wrap justify-end gap-1 rounded-lg border border-line bg-surface/85 p-1 shadow-lg shadow-black/30 backdrop-blur">
      <Tooltip content="Show everything">
        <Button
          variant="ghost"
          size="sm"
          active={isolateRole === null}
          className="px-2"
          onClick={() => setView({ isolateRole: null })}
        >
          <Eye className="size-3.5" />
          All
        </Button>
      </Tooltip>
      {ISOLATE_ROLES.map((role) => (
        <Button
          key={role}
          variant="ghost"
          size="sm"
          active={isolateRole === role}
          className="px-2 text-[11.5px]"
          onClick={() => setView({ isolateRole: isolateRole === role ? null : role })}
        >
          {PART_ROLE_LABELS[role]}
        </Button>
      ))}
    </div>
  );
}
