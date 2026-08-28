import { useProjectModel } from "../store/derived";
import { useStudio } from "../store/useStudio";
import { Select } from "../ui";

/**
 * Which unit the output views are showing.
 *
 * One control, shared by the cut list, the nesting sheets, the panel picker and the export
 * panel, so those four views can never disagree about what they are describing. With a
 * single unit in the room there is nothing to choose, so it disappears.
 */
export const WHOLE_ROOM = "__room";

export function UnitFilter({ className }: { readonly className?: string }) {
  const project = useProjectModel();
  const unitFilter = useStudio((state) => state.unitFilter);
  const setUnitFilter = useStudio((state) => state.setUnitFilter);

  if (project.units.length < 2) return null;

  return (
    <Select
      value={unitFilter ?? WHOLE_ROOM}
      onChange={(value) => setUnitFilter(value === WHOLE_ROOM ? null : value)}
      options={[
        { value: WHOLE_ROOM, label: "Whole room", hint: `${project.units.length} units` },
        ...project.units.map((unit) => ({
          value: unit.id,
          label: unit.name,
          hint: `${unit.parts.length} panels`,
        })),
      ]}
      className={className}
    />
  );
}
